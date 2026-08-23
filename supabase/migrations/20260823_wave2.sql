-- ════════════════════════════════════════════════════════════════════
-- 20260823 — الموجة ٢: ثلاثة بنود تحتاج قاعدة البيانات
--
-- (١) بيع الموظف بلا فحص سعة. upsert_booking يُدرج الحجز بلا أن ينظر
--     إلى trips.seats إطلاقاً. القيد الفريد من 20260813 يمنع بيع نفس
--     المقعد مرتين، لكنه لا يمنع حجزاً لعشرة أشخاص على رحلة فيها مقعدان
--     (المقاعد اختيارية، والحجز بلا مقاعد يمرّ بلا أي حاجز).
--
-- (٢) الفواتير والتذاكر تُلفَّق في الواجهة عند العرض — beneficiaries
--     تصنع كائن فاتورة في الذاكرة إن لم تجد صفّاً. العميل يرى فاتورة
--     برقم لا وجود له في القاعدة، ولا تظهر في شاشة الفواتير.
--
-- (٣) «إيقاف المستخدم» تجميلي. الزر يكتب users.status، وجدول users
--     منفصل تماماً عن profiles الذي تُبنى عليه is_staff(). الموظف
--     الموقوف يواصل الدخول والكتابة كأن شيئاً لم يكن.
--
-- آمن وidempotent: لا drop table ولا drop column ولا truncate.
-- ════════════════════════════════════════════════════════════════════


-- ▓▓▓▓▓▓▓▓▓▓▓▓▓▓ القسم ١ — بيع الموظف الذرّي ▓▓▓▓▓▓▓▓▓▓▓▓▓▓
/* قفل صفّ الرحلة (for update) ثم اشتقاق المستهلك من الحجوزات النشطة.
   القفل هو الجوهر: بدونه موظفان يقرآن «مقعدان متاحان» في اللحظة نفسها
   فيبيع كلٌّ منهما اثنين. مع القفل ينتظر الثاني حتى يلتزم الأول، فيقرأ
   الرقم الصحيح ويُرفض.

   الاشتقاق من bookings لا من trips.booked_seats: العدّاد مشتقّ أصلاً
   بحارس 20260813، وقراءته هنا تُدخل اعتماداً على ترتيب تنفيذ الحوارس.

   يُستثنى الملغى والمرفوض — لا يستهلكان مقاعد. ويُستثنى الحجز نفسه من
   الجمع (b.id is distinct from v) وإلا احتُسب مرّتين عند التعديل.

   ⚠ تغيّر مقصود: persons يُخزَّن الآن greatest(coalesce(persons,1),1)
   مثل مسار العميل تماماً. كان NULL يمرّ ويُسقط الحجز من sum() فتُحتسب
   الرحلة أقل امتلاءً مما هي. */
create or replace function public.upsert_booking(doc jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare
  v    text := doc->>'id';
  tid  text := nullif(doc->>'tripId','');
  n    int  := greatest(coalesce((doc->>'persons')::int,1),1);
  st   text := coalesce(doc->>'status','');
  cap  int;
  used int;
begin
  if not public.can_write_staff() then raise exception 'forbidden'; end if;

  if tid is not null and st not in ('cancelled','rejected') then
    select seats into cap from trips where id = tid for update;
    if cap is null then raise exception 'trip_not_found:%', tid; end if;
    select coalesce(sum(b.persons),0) into used
      from bookings b
     where b.trip_id = tid
       and b.status not in ('cancelled','rejected')
       and b.id is distinct from v;
    if used + n > cap then
      raise exception 'seats_unavailable:المتاح % مقعداً والمطلوب %',
        greatest(cap - used, 0), n;
    end if;
  end if;

  insert into bookings(id,trip_id,package_id,client_name,client_phone,room_type,persons,total,status,payment_status,
    pay_method,txn_no,pay_date,created_at,staff,created_by,branch_id,source,sent_date)
  values(v,tid,nullif(doc->>'packageId',''),doc->>'clientName',doc->>'clientPhone',doc->>'roomType',n,
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
end $$;


-- ▓▓▓▓▓▓▓▓▓▓ القسم ٢ — الفاتورة والتذكرة تلقائياً عند التأكيد ▓▓▓▓▓▓▓▓▓▓
/* المنطق في دالة مستقلة لا داخل الحارس: التعبئة الأثرية للحجوزات
   المؤكَّدة القائمة تحتاج مناداته مباشرة، و«update status=status»
   لإيقاظ حارسٍ لا يرى تغيّراً حيلةٌ لا تعمل.

   المعرّفات مشتقّة من md5(booking_id) لا من عدّاد: الحارس قد يُنفَّذ على
   اتصالين متزامنين، وعدّاد count+1 يُنتج نفس الرقم لكليهما. */
create or replace function public.ensure_booking_docs(p_booking_id text) returns void
language plpgsql security definer set search_path = public as $$
declare
  b      record;
  v_pkg  text; v_date text; v_time text; v_pt text;
  v_inv  text; v_tkt text;
begin
  select * into b from bookings where id = p_booking_id;
  if not found or coalesce(b.status,'') <> 'confirmed' then return; end if;

  select p.name into v_pkg from packages p where p.id = b.package_id;
  select t.departure_date, t.departure_time, t.departure_point
    into v_date, v_time, v_pt
    from trips t where t.id = b.trip_id;

  -- ─── الفاتورة ───
  if not exists (select 1 from payments where booking_id = b.id) then
    v_inv := 'INV-' || upper(substr(md5(b.id || ':inv'), 1, 6));
    insert into payments(id,booking_id,client_name,client_phone,package_name,trip_date,total,
                         pay_method,pay_status,txn_no,pay_date,created_at,room_type)
    values(v_inv,b.id,b.client_name,b.client_phone,coalesce(v_pkg,'—'),coalesce(v_date,'—'),b.total,
           coalesce(b.pay_method,'—'),coalesce(b.payment_status,'none'),coalesce(b.txn_no,'—'),
           coalesce(b.pay_date,'—'),coalesce(b.created_at,to_char(now(),'YYYY-MM-DD')),b.room_type)
    on conflict(id) do nothing;

    insert into payment_pilgrims(payment_id,name,doc_type,id_number,nationality,gender,age_group,birth_date,phone,sort)
      select v_inv,bp.name,bp.doc_type,bp.id_number,bp.nationality,bp.gender,bp.age_group,bp.birth_date,bp.phone,bp.sort
        from booking_pilgrims bp where bp.booking_id = b.id;
  end if;

  -- ─── التذكرة ───
  if not exists (select 1 from tickets where booking_id = b.id) then
    v_tkt := 'TKT-' || upper(substr(md5(b.id || ':tkt'), 1, 6));
    insert into tickets(ticket_no,booking_id,client_name,client_phone,package_name,room_type,
                        trip_date,trip_time,departure_point,persons,total)
    values(v_tkt,b.id,b.client_name,b.client_phone,coalesce(v_pkg,'—'),b.room_type,
           coalesce(v_date,'—'),coalesce(v_time,'—'),coalesce(v_pt,'—'),b.persons,b.total)
    on conflict(ticket_no) do nothing;

    insert into ticket_pilgrims(ticket_no,name,doc_type,id_number,nationality,gender,age_group,birth_date,phone,seat_no,sort)
      select v_tkt,bp.name,bp.doc_type,bp.id_number,bp.nationality,bp.gender,bp.age_group,bp.birth_date,bp.phone,bp.seat_no,bp.sort
        from booking_pilgrims bp where bp.booking_id = b.id;
  end if;
end $$;

/* حارس مؤجَّل (constraint trigger ... initially deferred) لا حارس عادي:
   upsert_booking يكتب صفّ bookings أولاً ثم يحذف المعتمرين ويعيد
   إدراجهم. حارس عادي يرى القائمة القديمة لأنها لم تُستبدل بعد. المؤجَّل
   يعمل عند إغلاق المعاملة فيرى النهائي.

   OLD غير مُسنَد في INSERT، فمقارنته تُوضع داخل فرع tg_op = 'UPDATE'
   لا في شرط مركَّب — plpgsql لا يضمن التقييم الكسول. */
create or replace function public.booking_confirm_docs() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.status is not distinct from old.status then return null; end if;
  end if;
  if coalesce(new.status,'') <> 'confirmed' then return null; end if;
  perform public.ensure_booking_docs(new.id);
  return null;
end $$;

drop trigger if exists trg_booking_confirm_docs on bookings;
create constraint trigger trg_booking_confirm_docs
  after insert or update on bookings
  deferrable initially deferred
  for each row execute function public.booking_confirm_docs();

-- تعبئة أثرية: الحجوزات المؤكَّدة القائمة التي لا فاتورة لها ولا تذكرة.
do $$
declare r record;
begin
  for r in select id from bookings where coalesce(status,'') = 'confirmed' loop
    perform public.ensure_booking_docs(r.id);
  end loop;
end $$;


-- ▓▓▓▓▓▓▓▓▓▓ القسم ٣ — إيقاف المستخدم يمنع الوصول فعلاً ▓▓▓▓▓▓▓▓▓▓
/* الحالة تُضاف إلى profiles لا إلى users: is_staff() تُبنى على profiles،
   وجدول users سجلّ إداري بمعرّف نصّي منفصل. الحسابات المُنشأة من اللوحة
   تحمل نفس auth uid في الجدولين منذ createAuthUser، فالمزامنة ممكنة. */
alter table profiles add column if not exists status text not null default 'active';

create or replace function public.is_admin() returns boolean
  language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles
                  where id = auth.uid()
                    and status = 'active'
                    and role in ('مدير عام','مدير النظام'));
$$;

create or replace function public.is_staff() returns boolean
  language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'active');
$$;

/* توسيع حارس 20260812 بأمرين:
   (أ) الموظف يعدّل اسمه ولا يلمس الدور ولا الفرع ولا الحالة — بلا هذا
       يرفع الموقوف الإيقاف عن نفسه بتحديث صفّه.
   (ب) لا يجوز إيقاف آخر مدير نشط، ولو كان الفاعل مديراً. الفحص قبل
       فرع is_admin لأنه يقيّد المدير نفسه — وإلا أُغلق النظام على أهله
       بضغطة زر واحدة بلا طريق رجوع من الواجهة. */
create or replace function public.guard_profile_self_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and coalesce(new.status,'') <> 'active'
     and old.role in ('مدير عام','مدير النظام') and old.status = 'active' then
    if (select count(*) from profiles
         where status = 'active' and role in ('مدير عام','مدير النظام')) <= 1 then
      raise exception 'forbidden: last_admin — لا يمكن إيقاف آخر مدير نشط';
    end if;
  end if;

  if public.is_admin() then return new; end if;

  if new.role is distinct from old.role then
    raise exception 'forbidden: role change requires admin';
  end if;
  if new.branch_id is distinct from old.branch_id then
    raise exception 'forbidden: branch change requires admin';
  end if;
  if new.status is distinct from old.status then
    raise exception 'forbidden: status change requires admin';
  end if;
  return new;
end $$;

drop trigger if exists trg_profiles_guard on profiles;
create trigger trg_profiles_guard before update on profiles
  for each row execute function public.guard_profile_self_update();

/* مزامنة مرة واحدة من users إلى profiles: الإيقافات التي ضُغطت في
   اللوحة قبل اليوم لم تصل إلى profiles إطلاقاً. */
update profiles p
   set status = case when u.status = 'inactive' then 'inactive' else 'active' end
  from users u
 where u.id = p.id::text
   and p.status is distinct from case when u.status = 'inactive' then 'inactive' else 'active' end;


-- ▓▓▓▓▓▓▓▓▓▓▓▓▓▓ دفتر الترحيلات ▓▓▓▓▓▓▓▓▓▓▓▓▓▓
insert into public.schema_migrations(version, note) values
  ('20260823_wave2', 'الموجة ٢: سعة ذرّية لبيع الموظف، وثائق تلقائية عند التأكيد، إيقاف فعلي للمستخدم')
on conflict (version) do nothing;
