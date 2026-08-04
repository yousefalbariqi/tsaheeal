-- ════════════════════════════════════════════════════════════
-- تساهيل العمرة — Migration: الفئة العمرية للمعتمر + مقعده المخصّص له بالاسم
--   age_group: adult | child  (الطفل لا يُطلب جواله)
--   seat_no  : رقم المقعد المرتبط بهذا الشخص تحديداً، لا بالحجز ككل
-- آمن للتشغيل على قاعدة موجودة (بعد 20260801_pilgrim_doc_type.sql).
-- الصقه في: Supabase → SQL Editor → Run.
-- ════════════════════════════════════════════════════════════

alter table booking_pilgrims add column if not exists age_group text;
alter table booking_pilgrims add column if not exists seat_no int;
alter table payment_pilgrims add column if not exists age_group text;
alter table ticket_pilgrims  add column if not exists age_group text;
alter table ticket_pilgrims  add column if not exists seat_no int;

-- ═══════════════ حفظ الحجز من لوحة الموظف ═══════════════
create or replace function public.upsert_booking(doc jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare v text := doc->>'id';
begin
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
    select v,e->>'name',nullif(e->>'docType',''),e->>'idNumber',e->>'nationality',e->>'gender',nullif(e->>'ageGroup',''),
           e->>'birthDate',e->>'phone',nullif(e->>'seat','')::int,(o-1)::int
    from jsonb_array_elements(coalesce(doc->'pilgrims','[]')) with ordinality t(e,o);
  delete from booking_seats where booking_id=v;
  insert into booking_seats(booking_id,seat_no,sort)
    select v,(e)::int,(o-1)::int from jsonb_array_elements_text(coalesce(doc->'seats','[]')) with ordinality t(e,o);
end $$;

-- ═══════════════ الحجز العام من صفحة المستفيد ═══════════════
create or replace function public.create_public_booking(doc jsonb) returns text
language plpgsql security definer set search_path=public as $$
declare
  v   text := coalesce(nullif(doc->>'id',''), 'TRB-'||upper(substr(md5(random()::text),1,5)));
  tid text := nullif(doc->>'tripId','');
  n   int  := greatest(coalesce((doc->>'persons')::int,1),1);
  avail int;
begin
  if tid is null then raise exception 'trip_required'; end if;
  select (seats - booked_seats) into avail from trips where id = tid for update;
  if avail is null then raise exception 'trip_not_found'; end if;
  if n > avail then raise exception 'insufficient_seats:%', avail; end if;
  insert into bookings(id,trip_id,package_id,client_name,client_phone,room_type,persons,total,status,payment_status,
    created_at,staff,source,sent_date)
  values(v,tid,nullif(doc->>'packageId',''),doc->>'clientName',doc->>'clientPhone',doc->>'roomType',n,
    (doc->>'total')::numeric,'reviewing','none',to_char(now(),'YYYY-MM-DD'),'','public',null);
  update trips set booked_seats = booked_seats + n where id = tid;
  insert into booking_pilgrims(booking_id,name,doc_type,id_number,nationality,gender,age_group,birth_date,phone,seat_no,sort)
    select v,e->>'name',nullif(e->>'docType',''),e->>'idNumber',e->>'nationality',e->>'gender',nullif(e->>'ageGroup',''),
           e->>'birthDate',e->>'phone',nullif(e->>'seat','')::int,(o-1)::int
    from jsonb_array_elements(coalesce(doc->'pilgrims','[]')) with ordinality t(e,o);
  insert into booking_seats(booking_id,seat_no,sort)
    select v,(e)::int,(o-1)::int from jsonb_array_elements_text(coalesce(doc->'seats','[]')) with ordinality t(e,o);
  return v;
end $$;
grant execute on function public.create_public_booking(jsonb) to anon, authenticated;

-- ═══════════════ استنتاج الفئة العمرية للبيانات القديمة ═══════════════
update booking_pilgrims set age_group = case
  when birth_date ~ '^\d{4}-\d{2}-\d{2}$'
   and (extract(year from age(birth_date::date)) < 12) then 'child' else 'adult' end
where age_group is null;

-- تم.
