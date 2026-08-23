-- ════════════════════════════════════════════════════════════════════
-- 20260810 — لحظة إرسال الطلب
--
-- صفحة تأكيد الطلب صارت تعرض عدّاداً تنازلياً لساعتَي عمل («سيتم
-- التواصل معك خلال ساعتين»)، والعدّاد يحتاج اللحظة لا اليوم:
-- bookings.created_at نصّ 'YYYY-MM-DD' بلا ساعة، فلا يُشتق منه عدّاد.
--
-- عمود جديد لا تغيير لـ created_at: الأخير يُقرأ ويُفرز به في لوحة
-- الموظف والتذاكر والتقارير، وتغيير صيغته يكسرها كلها.
--
-- الحجوزات السابقة تبقى NULL بلا ترحيل: لحظة إرسالها لم تُحفظ قط،
-- واشتقاقها من التاريخ اختراع دقّة لا نملكها. الواجهة تعرض حينها
-- الوعد نصّاً بلا حلقة.
--
-- ⚠️ تنبيه ترتيب: create_public_booking أدناه منسوخة من 20260809
--    (وأصلها 20260806، التحقق من المقاعد مُفعَّل). إن كانت قاعدتك على
--    20260807 (التحقق معطَّل للتجربة) فإعادة التعريف هنا تُعيد تفعيله.
-- ════════════════════════════════════════════════════════════════════

alter table bookings add column if not exists submitted_at timestamptz;

-- ═══════ إنشاء الحجز العام — نسخة 20260809 + لحظة الإرسال ═══════
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

  if jsonb_array_length(coalesce(doc->'rooms','[]')) > 0 then
    select coalesce(sum((e->>'persons')::int),0) into v_cap
      from jsonb_array_elements(doc->'rooms') e;
    if v_cap < n then raise exception 'rooms_mismatch:% < %', v_cap, n; end if;
  end if;

  select (seats - booked_seats) into avail from trips where id = tid for update;
  if avail is null then raise exception 'trip_not_found'; end if;
  if n > avail then raise exception 'insufficient_seats:%', avail; end if;

  /* now() لا قيمة من العميل: العدّاد وعدٌ خدمي، ومن يضبط ساعة جهازه
     كان يمنح نفسه مهلة أطول أو يرى وعداً منتهياً قبل أن يبدأ. */
  insert into bookings(id,trip_id,package_id,client_name,client_phone,customer_id,room_type,persons,total,
    status,payment_status,created_at,submitted_at,staff,source,sent_date)
  values(v,tid,nullif(doc->>'packageId',''),doc->>'clientName',public.local_phone(v_ph),v_uid,
    doc->>'roomType',n,(doc->>'total')::numeric,'reviewing','none',to_char(now(),'YYYY-MM-DD'),now(),'','public',null);
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

-- ═══════ «حجوزاتي» تُعيد لحظة الإرسال ═══════
/* drop لازم: تغيير returns table يغيّر توقيع الإرجاع، و create or replace
   وحدها ترفضه بـ "cannot change return type of existing function". */
drop function if exists public.my_public_bookings();
create or replace function public.my_public_bookings()
returns table(id text, status text, payment_status text, package_name text,
              trip_date text, trip_time text, persons int, total numeric,
              created_at text, submitted_at timestamptz)
language sql security definer stable set search_path = public as $$
  select b.id, b.status, b.payment_status, coalesce(p.name,''),
         t.departure_date, t.departure_time, b.persons, b.total, b.created_at, b.submitted_at
  from (select auth.uid() as uid, public.auth_phone() as ph) me
  join bookings b
    on me.uid is not null
   and ( b.customer_id = me.uid
      or (b.customer_id is null and me.ph is not null
          and public.norm_phone(b.client_phone) = me.ph) )
  left join trips    t on t.id = b.trip_id
  left join packages p on p.id = coalesce(nullif(b.package_id,''), t.package_id)
  order by b.created_at desc;
$$;
revoke execute on function public.my_public_bookings() from public, anon;
grant  execute on function public.my_public_bookings() to authenticated;
