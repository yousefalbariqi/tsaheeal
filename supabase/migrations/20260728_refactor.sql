-- ════════════════════════════════════════════════════════════
-- تساهيل العمرة — Migration: الفروع + بيانات الباص/الفرع على الرحلات +
-- إسناد الموظف/الفرع على الطلبات + وصول العميل العام (anon) + RPCs.
-- آمن للتشغيل على قاعدة موجودة (إضافي وقابل لإعادة التشغيل).
-- الصقه في: Supabase → SQL Editor → Run.
-- ════════════════════════════════════════════════════════════

-- ═══════════════ 1) جدول الفروع ═══════════════
create table if not exists branches (
  id text primary key,
  name text, city text, address text, gmap_url text, phone text,
  manager_id text,
  is_active boolean default true,
  created_at text, updated_at text
);
create index if not exists idx_branches_active on branches(is_active);

-- ═══════════════ 2) أعمدة جديدة على الرحلات ═══════════════
alter table trips add column if not exists bus_plate text;
alter table trips add column if not exists bus_code  text;
alter table trips add column if not exists branch_id text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='trips_branch_fk') then
    alter table trips add constraint trips_branch_fk
      foreign key (branch_id) references branches(id) on delete set null;
  end if;
end $$;
create index if not exists idx_trips_branch on trips(branch_id);

-- ═══════════════ 3) أعمدة إسناد جديدة على الطلبات ═══════════════
alter table bookings add column if not exists created_by text;   -- id المستخدم المنشئ
alter table bookings add column if not exists branch_id  text;   -- فرع الطلب
alter table bookings add column if not exists package_id text;   -- الباقة مباشرةً
alter table bookings add column if not exists source     text;   -- public | internal

-- ═══════════════ 4) ربط الموظف بفرع ═══════════════
alter table profiles add column if not exists branch_id text;

-- ═══════════════ 5) دالة upsert للفروع (إدارة فقط) ═══════════════
create or replace function public.upsert_branch(doc jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare v text := doc->>'id';
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'forbidden'; end if;
  insert into branches(id,name,city,address,gmap_url,phone,manager_id,is_active,created_at,updated_at)
  values(v,doc->>'name',doc->>'city',doc->>'address',doc->>'gmapUrl',doc->>'phone',
    nullif(doc->>'managerId',''),coalesce((doc->>'isActive')::boolean,true),
    coalesce(nullif(doc->>'createdAt',''),to_char(now(),'YYYY-MM-DD')),to_char(now(),'YYYY-MM-DD'))
  on conflict(id) do update set name=excluded.name,city=excluded.city,address=excluded.address,
    gmap_url=excluded.gmap_url,phone=excluded.phone,manager_id=excluded.manager_id,
    is_active=excluded.is_active,updated_at=excluded.updated_at;
end $$;
grant execute on function public.upsert_branch(jsonb) to authenticated;

-- ═══════════════ 6) تحديث upsert_trip (bus_plate/bus_code/branch_id) ═══════════════
create or replace function public.upsert_trip(doc jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare v text := doc->>'id'; s jsonb := doc->'settings';
begin
  insert into trips(id,package_id,transport_id,hotel_id,departure_date,return_date,departure_time,
    departure_point,departure_map_url,branch_id,bus_plate,bus_code,seats,booked_seats,waiting_seats,status,price,
    set_allow_online_booking,set_manual_confirm,set_waitlist_enabled,set_require_payment_first,
    set_show_ticket_after_confirm,set_payment_deadline_hours,set_max_pilgrims)
  values(v,nullif(doc->>'packageId',''),nullif(doc->>'transportId',''),nullif(doc->>'hotelId',''),
    doc->>'departureDate',doc->>'returnDate',doc->>'departureTime',doc->>'departurePoint',doc->>'departureMapUrl',
    nullif(doc->>'branchId',''),doc->>'busPlate',doc->>'busCode',
    (doc->>'seats')::int,(doc->>'bookedSeats')::int,(doc->>'waitingSeats')::int,doc->>'status',(doc->>'price')::numeric,
    (s->>'allowOnlineBooking')::boolean,(s->>'manualConfirm')::boolean,(s->>'waitlistEnabled')::boolean,
    (s->>'requirePaymentFirst')::boolean,(s->>'showTicketAfterConfirm')::boolean,
    (s->>'paymentDeadlineHours')::int,(s->>'maxPilgrims')::int)
  on conflict(id) do update set package_id=excluded.package_id,transport_id=excluded.transport_id,hotel_id=excluded.hotel_id,
    departure_date=excluded.departure_date,return_date=excluded.return_date,departure_time=excluded.departure_time,
    departure_point=excluded.departure_point,departure_map_url=excluded.departure_map_url,
    branch_id=excluded.branch_id,bus_plate=excluded.bus_plate,bus_code=excluded.bus_code,seats=excluded.seats,
    booked_seats=excluded.booked_seats,waiting_seats=excluded.waiting_seats,status=excluded.status,price=excluded.price,
    set_allow_online_booking=excluded.set_allow_online_booking,set_manual_confirm=excluded.set_manual_confirm,
    set_waitlist_enabled=excluded.set_waitlist_enabled,set_require_payment_first=excluded.set_require_payment_first,
    set_show_ticket_after_confirm=excluded.set_show_ticket_after_confirm,
    set_payment_deadline_hours=excluded.set_payment_deadline_hours,set_max_pilgrims=excluded.set_max_pilgrims;
  delete from trip_drivers where trip_id=v;
  insert into trip_drivers(trip_id,item_id,name,phone,sort)
    select v,e->>'id',e->>'name',e->>'phone',(o-1)::int from jsonb_array_elements(coalesce(doc->'drivers','[]')) with ordinality t(e,o);
end $$;

-- ═══════════════ 7) تحديث upsert_booking (created_by/branch_id/package_id/source) ═══════════════
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
  insert into booking_pilgrims(booking_id,name,id_number,nationality,gender,birth_date,phone,sort)
    select v,e->>'name',e->>'idNumber',e->>'nationality',e->>'gender',e->>'birthDate',e->>'phone',(o-1)::int
    from jsonb_array_elements(coalesce(doc->'pilgrims','[]')) with ordinality t(e,o);
  delete from booking_seats where booking_id=v;
  insert into booking_seats(booking_id,seat_no,sort)
    select v,(e)::int,(o-1)::int from jsonb_array_elements_text(coalesce(doc->'seats','[]')) with ordinality t(e,o);
end $$;

-- ═══════════════ 8) إنشاء حجز عام (العميل مجهول) — تحقق ذرّي من المقاعد ═══════════════
create or replace function public.create_public_booking(doc jsonb) returns text
language plpgsql security definer set search_path=public as $$
declare
  v   text := coalesce(nullif(doc->>'id',''), 'TRB-'||upper(substr(md5(random()::text),1,5)));
  tid text := nullif(doc->>'tripId','');
  n   int  := greatest(coalesce((doc->>'persons')::int,1),1);
  avail int;
begin
  if tid is null then raise exception 'trip_required'; end if;
  -- قفل صف الرحلة لمنع تجاوز السعة عند التزامن
  select (seats - booked_seats) into avail from trips where id = tid for update;
  if avail is null then raise exception 'trip_not_found'; end if;
  if n > avail then raise exception 'insufficient_seats:%', avail; end if;

  insert into bookings(id,trip_id,package_id,client_name,client_phone,room_type,persons,total,status,payment_status,
    created_at,staff,source,sent_date)
  values(v,tid,nullif(doc->>'packageId',''),doc->>'clientName',doc->>'clientPhone',doc->>'roomType',n,
    (doc->>'total')::numeric,'reviewing','none',to_char(now(),'YYYY-MM-DD'),'','public',null);

  update trips set booked_seats = booked_seats + n where id = tid;

  insert into booking_pilgrims(booking_id,name,id_number,nationality,gender,birth_date,phone,sort)
    select v,e->>'name',e->>'idNumber',e->>'nationality',e->>'gender',e->>'birthDate',e->>'phone',(o-1)::int
    from jsonb_array_elements(coalesce(doc->'pilgrims','[]')) with ordinality t(e,o);
  return v;
end $$;
grant execute on function public.create_public_booking(jsonb) to anon, authenticated;

-- ═══════════════ 9) تتبّع حجز عام (حقول محدودة) ═══════════════
create or replace function public.lookup_public_booking(p_phone text, p_booking_no text)
returns table(id text, status text, payment_status text, package_name text, trip_date text, trip_time text, persons int, total numeric)
language sql security definer set search_path=public as $$
  select b.id, b.status, b.payment_status,
         coalesce(p.name,''), t.departure_date, t.departure_time, b.persons, b.total
  from bookings b
  left join trips t    on t.id = b.trip_id
  left join packages p on p.id = coalesce(nullif(b.package_id,''), t.package_id)
  where b.id = p_booking_no and b.client_phone = p_phone;
$$;
grant execute on function public.lookup_public_booking(text,text) to anon, authenticated;

-- ═══════════════ 10) RLS للفروع ═══════════════
alter table branches enable row level security;
drop policy if exists "read all"     on branches;
create policy "read all"     on branches for select to authenticated using (true);
drop policy if exists "delete admin" on branches;
create policy "delete admin" on branches for delete to authenticated using (public.is_admin());

-- ═══════════════ 11) قراءة anon للكتالوج فقط (صفحة العميل العامة) ═══════════════
do $$
declare t text;
  anon_tables text[] := array[
    'packages','package_features','package_program_stages','package_room_prices','package_reviews','package_policies','package_gallery',
    'trips','trip_drivers',
    'hotels','hotel_features','hotel_reviews','hotel_media','hotel_room_types','hotel_room_photos',
    'branches'
  ];
begin
  foreach t in array anon_tables loop
    execute format('drop policy if exists "public read" on %I;', t);
    execute format('create policy "public read" on %I for select to anon using (true);', t);
  end loop;
end $$;

-- تم. (تشغيل seed للفروع اختياري — انظر seed.sql)
