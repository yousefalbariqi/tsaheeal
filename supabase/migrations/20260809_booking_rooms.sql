-- ════════════════════════════════════════════════════════════════════
-- 20260809 — توزيع السكن: صفّ لكل غرفة
--
-- المستفيد لم يعد يختار «فئة غرفة» بل توزيعاً: خمسة معتمرين ينامون
-- في غرفة ثلاثة وغرفة اثنين، لا خمس مرات في فئة الثلاثة. والتوزيع
-- قائمة، فجدول ابن كـ booking_pilgrims و booking_seats — لا نصّ
-- مُشفَّر في room_type ولا jsonb: السؤال التشغيلي المتوقّع «كم غرفة
-- ثلاثية نحتاج في مكة هذا الأسبوع؟» هو group by هنا، ومتعذّر هناك.
--
-- room_type يبقى كما هو: ملخّص عربي مقروء («غرفة خاصة · 2 غرف (3 + 2)»)
-- تقرؤه لوحة الموظف والتذاكر والفواتير وصفحة الدفع. صار ذاكرة عرض،
-- والمصدر booking_rooms. الحجوزات القديمة تبقى بلا صفوف هنا ونصّها
-- وحده معلومتها — ولا ترحيل ممكن، فالتوزيع لم يكن محفوظاً قبل اليوم.
--
-- ⚠️ تنبيه ترتيب: create_public_booking أدناه منسوخة من 20260806 حيث
--    التحقق من المقاعد مُفعَّل. إن كانت قاعدتك على 20260807 (التحقق
--    معطَّل للتجربة) فإعادة التعريف هنا تُعيد تفعيله — أعد تشغيل
--    20260807 بعد هذا الملف، وأضف إليه إدراج booking_rooms.
-- ════════════════════════════════════════════════════════════════════

create table if not exists booking_rooms (
  id bigint generated always as identity primary key,
  booking_id text references bookings(id) on delete cascade,
  tier_id   text,      -- RoomPrice.id في الباقة وقت الحجز (مرجع لا مفتاح أجنبي)
  type      text,      -- نوع السكن — واحد لكل حجز، يتكرّر لتسهيل القراءة
  persons   int,       -- سعة هذه الغرفة
  per_night numeric,   -- سعر الفرد/الليلة مثبَّتاً وقت الحجز
  sort int
);
create index if not exists booking_rooms_booking_idx on booking_rooms(booking_id);

/* per_night مثبَّت لا مقروء من الباقة: تعديل الموظف لأسعارها بعد الحجز
   يجب ألّا يجعل الإجمالي المحفوظ غير قابل للتفسير.
   Σ(per_night × persons) × nights = bookings.total */

-- RLS: بيانات حجز — للموظف وحده، كبقيّة جداول الحجز
alter table booking_rooms enable row level security;
drop policy if exists "read staff"  on booking_rooms;
drop policy if exists "write staff" on booking_rooms;
create policy "read staff"  on booking_rooms for select to authenticated using (public.is_staff());
create policy "write staff" on booking_rooms for all    to authenticated
  using (public.is_staff()) with check (public.is_staff());
revoke all on booking_rooms from anon;

-- ═══════ 1) إنشاء الحجز العام — نسخة 20260806 + الغرف ═══════
create or replace function public.create_public_booking(doc jsonb) returns text
language plpgsql security definer set search_path=public as $$
declare
  v   text := coalesce(nullif(doc->>'id',''), 'TRB-'||upper(substr(md5(random()::text),1,5)));
  tid text := nullif(doc->>'tripId','');
  n   int  := greatest(coalesce((doc->>'persons')::int,1),1);
  avail int;
  v_uid uuid := auth.uid();
  v_ph  text := public.auth_phone();
  v_cap int;
begin
  if tid is null   then raise exception 'trip_required';    end if;
  if v_uid is null then raise exception 'auth_required';    end if;
  if v_ph  is null then raise exception 'phone_unverified'; end if;
  perform public.customer_bootstrap();

  /* التوزيع يجب أن يسع كل المعتمرين. الواجهة تحرسه، وهذا هو الحدّ:
     حمولة مُلفّقة لا تُنتج حجزاً بغرف لا تكفي من فيه. السعة قد تفوق
     العدد عمداً (غرفة أكبر بثمنها كاملاً) فالشرط «أقلّ من» لا «يساوي». */
  if jsonb_array_length(coalesce(doc->'rooms','[]')) > 0 then
    select coalesce(sum((e->>'persons')::int),0) into v_cap
      from jsonb_array_elements(doc->'rooms') e;
    if v_cap < n then raise exception 'rooms_mismatch:% < %', v_cap, n; end if;
  end if;

  select (seats - booked_seats) into avail from trips where id = tid for update;
  if avail is null then raise exception 'trip_not_found'; end if;
  if n > avail then raise exception 'insufficient_seats:%', avail; end if;

  insert into bookings(id,trip_id,package_id,client_name,client_phone,customer_id,room_type,persons,total,
    status,payment_status,created_at,staff,source,sent_date)
  values(v,tid,nullif(doc->>'packageId',''),doc->>'clientName',public.local_phone(v_ph),v_uid,
    doc->>'roomType',n,(doc->>'total')::numeric,'reviewing','none',to_char(now(),'YYYY-MM-DD'),'','public',null);
  update trips set booked_seats = booked_seats + n where id = tid;
  insert into booking_pilgrims(booking_id,name,doc_type,id_number,nationality,gender,age_group,birth_date,phone,seat_no,sort)
    select v,e->>'name',nullif(e->>'docType',''),e->>'idNumber',e->>'nationality',e->>'gender',nullif(e->>'ageGroup',''),e->>'birthDate',e->>'phone',nullif(e->>'seat','')::int,(o-1)::int
    from jsonb_array_elements(coalesce(doc->'pilgrims','[]')) with ordinality t(e,o);
  insert into booking_seats(booking_id,seat_no,sort)
    select v,(e)::int,(o-1)::int from jsonb_array_elements_text(coalesce(doc->'seats','[]')) with ordinality t(e,o);
  insert into booking_rooms(booking_id,tier_id,type,persons,per_night,sort)
    select v,nullif(e->>'tierId',''),e->>'type',(e->>'persons')::int,(e->>'perNight')::numeric,(o-1)::int
    from jsonb_array_elements(coalesce(doc->'rooms','[]')) with ordinality t(e,o);
  return v;
end $$;
revoke execute on function public.create_public_booking(jsonb) from public, anon;
grant  execute on function public.create_public_booking(jsonb) to authenticated;

-- ═══════ 2) تعديل الموظف — لا يمسّ الغرف إن لم تُرسَل ═══════
create or replace function public.upsert_booking(doc jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare v text := doc->>'id';
begin
  if not public.can_write_staff() then raise exception 'forbidden'; end if;
  insert into bookings(id,trip_id,package_id,client_name,client_phone,room_type,persons,total,status,payment_status,
    pay_method,txn_no,pay_date,created_at,staff,created_by,branch_id,source,sent_date)
  values(v,nullif(doc->>'tripId',''),nullif(doc->>'packageId',''),doc->>'clientName',doc->>'clientPhone',doc->>'roomType',(doc->>'persons')::int,
    (doc->>'total')::numeric,doc->>'status',doc->>'paymentStatus',doc->>'payMethod',doc->>'txnNo',doc->>'payDate',
    doc->>'createdAt',doc->>'staff',nullif(doc->>'createdBy',''),nullif(doc->>'branchId',''),doc->>'source',doc->>'sentDate')
  on conflict(id) do update set trip_id=excluded.trip_id,package_id=excluded.package_id,client_name=excluded.client_name,client_phone=excluded.client_phone,
    room_type=excluded.room_type,persons=excluded.persons,total=excluded.total,status=excluded.status,
    payment_status=excluded.payment_status,pay_method=excluded.pay_method,txn_no=excluded.txn_no,pay_date=excluded.pay_date,
    created_at=excluded.created_at,staff=excluded.staff,created_by=excluded.created_by,branch_id=excluded.branch_id,
    source=excluded.source,sent_date=excluded.sent_date;
  delete from booking_pilgrims where booking_id=v;
  insert into booking_pilgrims(booking_id,name,doc_type,id_number,nationality,gender,age_group,birth_date,phone,seat_no,sort)
    select v,e->>'name',nullif(e->>'docType',''),e->>'idNumber',e->>'nationality',e->>'gender',nullif(e->>'ageGroup',''),e->>'birthDate',e->>'phone',nullif(e->>'seat','')::int,(o-1)::int
    from jsonb_array_elements(coalesce(doc->'pilgrims','[]')) with ordinality t(e,o);
  delete from booking_seats where booking_id=v;
  insert into booking_seats(booking_id,seat_no,sort)
    select v,(e)::int,(o-1)::int from jsonb_array_elements_text(coalesce(doc->'seats','[]')) with ordinality t(e,o);
  /* الحرس ضروري لا احتياطي: المخزن يرسل صفّ الحجز كاملاً في كل تعديل
     (repository.ts update → useStore.syncDiff)، وأي كائن حجز بلا مفتاح
     rooms — حجز داخلي أو seed أو شاشة قديمة — كان سيمحو توزيع حجز عام
     بمجرد تغيير حالته من لوحة الموظف. */
  if doc ? 'rooms' then
    delete from booking_rooms where booking_id=v;
    insert into booking_rooms(booking_id,tier_id,type,persons,per_night,sort)
      select v,nullif(e->>'tierId',''),e->>'type',(e->>'persons')::int,(e->>'perNight')::numeric,(o-1)::int
      from jsonb_array_elements(coalesce(doc->'rooms','[]')) with ordinality t(e,o);
  end if;
end $$;
