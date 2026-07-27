-- ════════════════════════════════════════════════════════════
-- تساهيل العمرة — مخطط قاعدة بيانات Supabase (تطبيع كامل)
-- الصقه في: Supabase → SQL Editor → Run. آمن لإعادة التشغيل.
-- القراءة عبر PostgREST embedding · الكتابة عبر دوال upsert_* الذرّية.
-- ════════════════════════════════════════════════════════════

-- تنظيف (لإعادة الإنشاء النظيف)
drop table if exists
  hotel_room_photos, hotel_room_types, hotel_features, hotel_reviews, hotel_media,
  transport_features, transport_reviews, transport_media,
  package_features, package_program_stages, package_room_prices, package_reviews, package_policies, package_gallery,
  trip_drivers, booking_pilgrims, booking_seats, payment_pilgrims, ticket_pilgrims, beneficiary_bookings,
  hotels, transports, packages, branches, trips, bookings, payments, tickets, beneficiaries, users, support
  cascade;

-- ═══════════════ الفنادق ═══════════════
create table hotels (
  id text primary key, name text, city text, stars smallint,
  distance_m integer, district text, phone text, map_url text,
  status text, notes text, tasaheel_note text
);
create table hotel_features (
  id bigint generated always as identity primary key,
  hotel_id text references hotels(id) on delete cascade,
  item_id text, icon text, text text, sort int
);
create table hotel_reviews (
  id bigint generated always as identity primary key,
  hotel_id text references hotels(id) on delete cascade,
  item_id text, name text, text text, consent boolean, image text, sort int
);
create table hotel_media (
  id bigint generated always as identity primary key,
  hotel_id text references hotels(id) on delete cascade,
  item_id text, kind text, url text, is_primary boolean, category text, sort int
);
create table hotel_room_types (
  id bigint generated always as identity primary key,
  hotel_id text references hotels(id) on delete cascade,
  item_id text, kind text, beds int, price_per_night numeric, sort int
);
create table hotel_room_photos (
  id bigint generated always as identity primary key,
  room_type_id bigint references hotel_room_types(id) on delete cascade,
  item_id text, kind text, url text, is_primary boolean, category text, sort int
);
create index on hotel_features(hotel_id);
create index on hotel_reviews(hotel_id);
create index on hotel_media(hotel_id);
create index on hotel_room_types(hotel_id);
create index on hotel_room_photos(room_type_id);

-- ═══════════════ المواصلات ═══════════════
create table transports (
  id text primary key, name text, mode text, vehicle_type text,
  seats int, seat_cost numeric, model text, year text, plate text,
  driver text, supervisor text, status text, notes text
);
create table transport_features (
  id bigint generated always as identity primary key,
  transport_id text references transports(id) on delete cascade,
  item_id text, text text, icon text, sort int
);
create table transport_reviews (
  id bigint generated always as identity primary key,
  transport_id text references transports(id) on delete cascade,
  item_id text, name text, text text, consent boolean, image text, sort int
);
create table transport_media (
  id bigint generated always as identity primary key,
  transport_id text references transports(id) on delete cascade,
  item_id text, kind text, url text, is_primary boolean, category text, sort int
);
create index on transport_features(transport_id);
create index on transport_reviews(transport_id);
create index on transport_media(transport_id);

-- ═══════════════ الباقات ═══════════════
create table packages (
  id text primary key, name text, order_no int, product_type text,
  destination text, audience text, days int, nights int, status text,
  market_price numeric, seat_cost_override numeric, cover_image text,
  recurring boolean, recur_day text, start_date text,
  transport_id text references transports(id) on delete set null,
  hotel_id text references hotels(id) on delete set null,
  notes text,
  set_allow_online_booking boolean, set_manual_confirm boolean, set_waitlist_enabled boolean,
  set_require_payment_first boolean, set_show_ticket_after_confirm boolean,
  set_payment_deadline_hours int, set_max_pilgrims int
);
create table package_features (
  id bigint generated always as identity primary key,
  package_id text references packages(id) on delete cascade,
  item_id text, icon text, text text, sort int
);
create table package_program_stages (
  id bigint generated always as identity primary key,
  package_id text references packages(id) on delete cascade,
  item_id text, stage_order int, icon text, day text, time text, title text, descr text, archived boolean, sort int
);
create table package_room_prices (
  id bigint generated always as identity primary key,
  package_id text references packages(id) on delete cascade,
  item_id text, type text, persons int, per_night numeric, seat_cost numeric, sort int
);
create table package_reviews (
  id bigint generated always as identity primary key,
  package_id text references packages(id) on delete cascade,
  item_id text, name text, text text, consent boolean, image text, sort int
);
create table package_policies (
  id bigint generated always as identity primary key,
  package_id text references packages(id) on delete cascade,
  value text, sort int
);
create table package_gallery (
  id bigint generated always as identity primary key,
  package_id text references packages(id) on delete cascade,
  value text, sort int
);
create index on package_features(package_id);
create index on package_program_stages(package_id);
create index on package_room_prices(package_id);
create index on package_reviews(package_id);
create index on package_policies(package_id);
create index on package_gallery(package_id);
create index on packages(transport_id);
create index on packages(hotel_id);

-- ═══════════════ الفروع ═══════════════
create table branches (
  id text primary key,
  name text, city text, address text, gmap_url text, phone text,
  manager_id text,          -- id مستخدم من users (يُحلّ اسمه في الواجهة)
  is_active boolean default true,
  created_at text, updated_at text
);
create index on branches(is_active);

-- ═══════════════ الرحلات ═══════════════
create table trips (
  id text primary key,
  package_id text references packages(id) on delete set null,
  transport_id text references transports(id) on delete set null,
  hotel_id text references hotels(id) on delete set null,
  branch_id text references branches(id) on delete set null,
  bus_plate text, bus_code text,
  departure_date text, return_date text, departure_time text,
  departure_point text, departure_map_url text,
  seats int, booked_seats int, waiting_seats int, status text, price numeric,
  set_allow_online_booking boolean, set_manual_confirm boolean, set_waitlist_enabled boolean,
  set_require_payment_first boolean, set_show_ticket_after_confirm boolean,
  set_payment_deadline_hours int, set_max_pilgrims int
);
create table trip_drivers (
  id bigint generated always as identity primary key,
  trip_id text references trips(id) on delete cascade,
  item_id text, name text, phone text, sort int
);
create index on trip_drivers(trip_id);
create index on trips(package_id);

-- ═══════════════ الطلبات ═══════════════
create table bookings (
  id text primary key,
  trip_id text references trips(id) on delete set null,
  package_id text,                 -- الباقة مباشرةً (بجانب الرحلة)
  client_name text, client_phone text, room_type text, persons int,
  total numeric, status text, payment_status text,
  pay_method text, txn_no text, pay_date text,
  created_at text, staff text,
  created_by text,                 -- id المستخدم المنشئ (حجز داخلي)
  branch_id text,                  -- فرع الطلب
  source text,                     -- public | internal
  sent_date text
);
create table booking_pilgrims (
  id bigint generated always as identity primary key,
  booking_id text references bookings(id) on delete cascade,
  name text, id_number text, nationality text, gender text, birth_date text, phone text, sort int
);
create table booking_seats (
  id bigint generated always as identity primary key,
  booking_id text references bookings(id) on delete cascade,
  seat_no int, sort int
);
create index on booking_pilgrims(booking_id);
create index on booking_seats(booking_id);
create index on bookings(trip_id);

-- ═══════════════ الفواتير ═══════════════
create table payments (
  id text primary key,
  booking_id text references bookings(id) on delete set null,
  client_name text, client_phone text, package_name text, trip_date text,
  total numeric, pay_method text, pay_status text, txn_no text, pay_date text,
  created_at text, room_type text
);
create table payment_pilgrims (
  id bigint generated always as identity primary key,
  payment_id text references payments(id) on delete cascade,
  name text, id_number text, nationality text, gender text, birth_date text, phone text, sort int
);
create index on payment_pilgrims(payment_id);
create index on payments(booking_id);

-- ═══════════════ التذاكر ═══════════════
create table tickets (
  ticket_no text primary key,
  booking_id text references bookings(id) on delete set null,
  client_name text, client_phone text, package_name text, room_type text,
  trip_date text, trip_time text, departure_point text, persons int, total numeric
);
create table ticket_pilgrims (
  id bigint generated always as identity primary key,
  ticket_no text references tickets(ticket_no) on delete cascade,
  name text, id_number text, nationality text, gender text, birth_date text, phone text, sort int
);
create index on ticket_pilgrims(ticket_no);

-- ═══════════════ المستفيدون ═══════════════
create table beneficiaries (
  id text primary key, name text, phone text, id_number text, nationality text,
  gender text, birth_date text, rating numeric, notes text, suspended boolean
);
create table beneficiary_bookings (
  id bigint generated always as identity primary key,
  beneficiary_id text references beneficiaries(id) on delete cascade,
  value text, sort int
);
create index on beneficiary_bookings(beneficiary_id);

-- ═══════════════ مستخدمو التطبيق · الدعم ═══════════════
create table users (
  id text primary key, name text, email text, role text, status text, last_login text
);
create table support (
  id text primary key, category text, title text, descr text, priority text, status text, date text
);

-- ═══════════════ الملفات الشخصية (أدوار المصادقة) ═══════════════
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'مستخدم',
  role text not null default 'موظف',
  branch_id text                      -- ربط الموظف بفرع (اختياري)
);

-- ════════════════════════════════════════════════════════════
-- دالة الدور (تتجاوز RLS)
-- ════════════════════════════════════════════════════════════
create or replace function public.is_admin() returns boolean
  language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('مدير عام','مدير النظام'));
$$;

-- ════════════════════════════════════════════════════════════
-- دوال الكتابة الذرّية upsert_<entity>(doc jsonb)
-- ════════════════════════════════════════════════════════════
create or replace function public.upsert_hotel(doc jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare v text := doc->>'id'; rt jsonb; ord int; v_rt bigint;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'forbidden'; end if;
  insert into hotels(id,name,city,stars,distance_m,district,phone,map_url,status,notes,tasaheel_note)
  values(v,doc->>'name',doc->>'city',(doc->>'stars')::smallint,(doc->>'distanceM')::int,doc->>'district',
         doc->>'phone',doc->>'mapUrl',doc->>'status',doc->>'notes',doc->>'tasaheelNote')
  on conflict(id) do update set name=excluded.name,city=excluded.city,stars=excluded.stars,
    distance_m=excluded.distance_m,district=excluded.district,phone=excluded.phone,map_url=excluded.map_url,
    status=excluded.status,notes=excluded.notes,tasaheel_note=excluded.tasaheel_note;
  delete from hotel_features where hotel_id=v;
  insert into hotel_features(hotel_id,item_id,icon,text,sort)
    select v,e->>'id',e->>'icon',e->>'text',(o-1)::int from jsonb_array_elements(coalesce(doc->'features','[]'))
    with ordinality t(e,o);
  delete from hotel_reviews where hotel_id=v;
  insert into hotel_reviews(hotel_id,item_id,name,text,consent,image,sort)
    select v,e->>'id',e->>'name',e->>'text',(e->>'consent')::boolean,e->>'image',(o-1)::int
    from jsonb_array_elements(coalesce(doc->'reviews','[]')) with ordinality t(e,o);
  delete from hotel_media where hotel_id=v;
  insert into hotel_media(hotel_id,item_id,kind,url,is_primary,category,sort)
    select v,e->>'id',e->>'kind',e->>'url',(e->>'primary')::boolean,e->>'category',(o-1)::int
    from jsonb_array_elements(coalesce(doc->'media','[]')) with ordinality t(e,o);
  delete from hotel_room_types where hotel_id=v;  -- cascade يحذف الصور
  ord:=0;
  for rt in select * from jsonb_array_elements(coalesce(doc->'roomTypes','[]')) loop
    insert into hotel_room_types(hotel_id,item_id,kind,beds,price_per_night,sort)
    values(v,rt->>'id',rt->>'kind',(rt->>'beds')::int,(rt->>'pricePerNight')::numeric,ord) returning id into v_rt;
    insert into hotel_room_photos(room_type_id,item_id,kind,url,is_primary,category,sort)
      select v_rt,e->>'id',e->>'kind',e->>'url',(e->>'primary')::boolean,e->>'category',(o-1)::int
      from jsonb_array_elements(coalesce(rt->'photos','[]')) with ordinality t(e,o);
    ord:=ord+1;
  end loop;
end $$;

create or replace function public.upsert_transport(doc jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare v text := doc->>'id';
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'forbidden'; end if;
  insert into transports(id,name,mode,vehicle_type,seats,seat_cost,model,year,plate,driver,supervisor,status,notes)
  values(v,doc->>'name',doc->>'mode',doc->>'vehicleType',(doc->>'seats')::int,(doc->>'seatCost')::numeric,
         doc->>'model',doc->>'year',doc->>'plate',doc->>'driver',doc->>'supervisor',doc->>'status',doc->>'notes')
  on conflict(id) do update set name=excluded.name,mode=excluded.mode,vehicle_type=excluded.vehicle_type,
    seats=excluded.seats,seat_cost=excluded.seat_cost,model=excluded.model,year=excluded.year,plate=excluded.plate,
    driver=excluded.driver,supervisor=excluded.supervisor,status=excluded.status,notes=excluded.notes;
  delete from transport_features where transport_id=v;
  insert into transport_features(transport_id,item_id,text,icon,sort)
    select v,e->>'id',e->>'text',e->>'icon',(o-1)::int from jsonb_array_elements(coalesce(doc->'features','[]')) with ordinality t(e,o);
  delete from transport_reviews where transport_id=v;
  insert into transport_reviews(transport_id,item_id,name,text,consent,image,sort)
    select v,e->>'id',e->>'name',e->>'text',(e->>'consent')::boolean,e->>'image',(o-1)::int
    from jsonb_array_elements(coalesce(doc->'reviews','[]')) with ordinality t(e,o);
  delete from transport_media where transport_id=v;
  insert into transport_media(transport_id,item_id,kind,url,is_primary,category,sort)
    select v,e->>'id',e->>'kind',e->>'url',(e->>'primary')::boolean,e->>'category',(o-1)::int
    from jsonb_array_elements(coalesce(doc->'media','[]')) with ordinality t(e,o);
end $$;

create or replace function public.upsert_package(doc jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare v text := doc->>'id'; s jsonb := doc->'settings';
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'forbidden'; end if;
  insert into packages(id,name,order_no,product_type,destination,audience,days,nights,status,market_price,
    seat_cost_override,cover_image,recurring,recur_day,start_date,transport_id,hotel_id,notes,
    set_allow_online_booking,set_manual_confirm,set_waitlist_enabled,set_require_payment_first,
    set_show_ticket_after_confirm,set_payment_deadline_hours,set_max_pilgrims)
  values(v,doc->>'name',(doc->>'order')::int,doc->>'productType',doc->>'destination',doc->>'audience',
    (doc->>'days')::int,(doc->>'nights')::int,doc->>'status',(doc->>'marketPrice')::numeric,
    (doc->>'seatCostOverride')::numeric,doc->>'coverImage',(doc->>'recurring')::boolean,doc->>'recurDay',doc->>'startDate',
    nullif(doc->>'transportId',''),nullif(doc->>'hotelId',''),doc->>'notes',
    (s->>'allowOnlineBooking')::boolean,(s->>'manualConfirm')::boolean,(s->>'waitlistEnabled')::boolean,
    (s->>'requirePaymentFirst')::boolean,(s->>'showTicketAfterConfirm')::boolean,
    (s->>'paymentDeadlineHours')::int,(s->>'maxPilgrims')::int)
  on conflict(id) do update set name=excluded.name,order_no=excluded.order_no,product_type=excluded.product_type,
    destination=excluded.destination,audience=excluded.audience,days=excluded.days,nights=excluded.nights,
    status=excluded.status,market_price=excluded.market_price,seat_cost_override=excluded.seat_cost_override,
    cover_image=excluded.cover_image,recurring=excluded.recurring,recur_day=excluded.recur_day,start_date=excluded.start_date,
    transport_id=excluded.transport_id,hotel_id=excluded.hotel_id,notes=excluded.notes,
    set_allow_online_booking=excluded.set_allow_online_booking,set_manual_confirm=excluded.set_manual_confirm,
    set_waitlist_enabled=excluded.set_waitlist_enabled,set_require_payment_first=excluded.set_require_payment_first,
    set_show_ticket_after_confirm=excluded.set_show_ticket_after_confirm,
    set_payment_deadline_hours=excluded.set_payment_deadline_hours,set_max_pilgrims=excluded.set_max_pilgrims;
  delete from package_features where package_id=v;
  insert into package_features(package_id,item_id,icon,text,sort)
    select v,e->>'id',e->>'icon',e->>'text',(o-1)::int from jsonb_array_elements(coalesce(doc->'features','[]')) with ordinality t(e,o);
  delete from package_program_stages where package_id=v;
  insert into package_program_stages(package_id,item_id,stage_order,icon,day,time,title,descr,archived,sort)
    select v,e->>'id',(e->>'order')::int,e->>'icon',e->>'day',e->>'time',e->>'title',e->>'desc',(e->>'archived')::boolean,(o-1)::int
    from jsonb_array_elements(coalesce(doc->'program','[]')) with ordinality t(e,o);
  delete from package_room_prices where package_id=v;
  insert into package_room_prices(package_id,item_id,type,persons,per_night,seat_cost,sort)
    select v,e->>'id',e->>'type',(e->>'persons')::int,(e->>'perNight')::numeric,(e->>'seatCost')::numeric,(o-1)::int
    from jsonb_array_elements(coalesce(doc->'roomPrices','[]')) with ordinality t(e,o);
  delete from package_reviews where package_id=v;
  insert into package_reviews(package_id,item_id,name,text,consent,image,sort)
    select v,e->>'id',e->>'name',e->>'text',(e->>'consent')::boolean,e->>'image',(o-1)::int
    from jsonb_array_elements(coalesce(doc->'reviews','[]')) with ordinality t(e,o);
  delete from package_policies where package_id=v;
  insert into package_policies(package_id,value,sort)
    select v,e,(o-1)::int from jsonb_array_elements_text(coalesce(doc->'policies','[]')) with ordinality t(e,o);
  delete from package_gallery where package_id=v;
  insert into package_gallery(package_id,value,sort)
    select v,e,(o-1)::int from jsonb_array_elements_text(coalesce(doc->'gallery','[]')) with ordinality t(e,o);
end $$;

create or replace function public.upsert_trip(doc jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare v text := doc->>'id'; s jsonb := doc->'settings';
begin
  -- الطلبات/الرحلات: مسموحة لأي مستخدم مصادَق (الصلاحية عبر grant) وسياق الخادم
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

create or replace function public.upsert_booking(doc jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare v text := doc->>'id';
begin
  -- الطلبات/الرحلات: مسموحة لأي مستخدم مصادَق (الصلاحية عبر grant) وسياق الخادم
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

create or replace function public.upsert_payment(doc jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare v text := doc->>'id';
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'forbidden'; end if;
  insert into payments(id,booking_id,client_name,client_phone,package_name,trip_date,total,pay_method,pay_status,
    txn_no,pay_date,created_at,room_type)
  values(v,nullif(doc->>'bookingId',''),doc->>'clientName',doc->>'clientPhone',doc->>'packageName',doc->>'tripDate',
    (doc->>'total')::numeric,doc->>'payMethod',doc->>'payStatus',doc->>'txnNo',doc->>'payDate',doc->>'createdAt',doc->>'roomType')
  on conflict(id) do update set booking_id=excluded.booking_id,client_name=excluded.client_name,client_phone=excluded.client_phone,
    package_name=excluded.package_name,trip_date=excluded.trip_date,total=excluded.total,pay_method=excluded.pay_method,
    pay_status=excluded.pay_status,txn_no=excluded.txn_no,pay_date=excluded.pay_date,created_at=excluded.created_at,room_type=excluded.room_type;
  delete from payment_pilgrims where payment_id=v;
  insert into payment_pilgrims(payment_id,name,id_number,nationality,gender,birth_date,phone,sort)
    select v,e->>'name',e->>'idNumber',e->>'nationality',e->>'gender',e->>'birthDate',e->>'phone',(o-1)::int
    from jsonb_array_elements(coalesce(doc->'pilgrims','[]')) with ordinality t(e,o);
end $$;

create or replace function public.upsert_ticket(doc jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare v text := doc->>'ticketNo';
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'forbidden'; end if;
  insert into tickets(ticket_no,booking_id,client_name,client_phone,package_name,room_type,trip_date,trip_time,
    departure_point,persons,total)
  values(v,nullif(doc->>'bookingId',''),doc->>'clientName',doc->>'clientPhone',doc->>'packageName',doc->>'roomType',
    doc->>'tripDate',doc->>'tripTime',doc->>'departurePoint',(doc->>'persons')::int,(doc->>'total')::numeric)
  on conflict(ticket_no) do update set booking_id=excluded.booking_id,client_name=excluded.client_name,
    client_phone=excluded.client_phone,package_name=excluded.package_name,room_type=excluded.room_type,
    trip_date=excluded.trip_date,trip_time=excluded.trip_time,departure_point=excluded.departure_point,
    persons=excluded.persons,total=excluded.total;
  delete from ticket_pilgrims where ticket_no=v;
  insert into ticket_pilgrims(ticket_no,name,id_number,nationality,gender,birth_date,phone,sort)
    select v,e->>'name',e->>'idNumber',e->>'nationality',e->>'gender',e->>'birthDate',e->>'phone',(o-1)::int
    from jsonb_array_elements(coalesce(doc->'pilgrims','[]')) with ordinality t(e,o);
end $$;

create or replace function public.upsert_beneficiary(doc jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare v text := doc->>'id';
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'forbidden'; end if;
  insert into beneficiaries(id,name,phone,id_number,nationality,gender,birth_date,rating,notes,suspended)
  values(v,doc->>'name',doc->>'phone',doc->>'idNumber',doc->>'nationality',doc->>'gender',doc->>'birthDate',
    (doc->>'rating')::numeric,doc->>'notes',(doc->>'suspended')::boolean)
  on conflict(id) do update set name=excluded.name,phone=excluded.phone,id_number=excluded.id_number,
    nationality=excluded.nationality,gender=excluded.gender,birth_date=excluded.birth_date,rating=excluded.rating,
    notes=excluded.notes,suspended=excluded.suspended;
  delete from beneficiary_bookings where beneficiary_id=v;
  insert into beneficiary_bookings(beneficiary_id,value,sort)
    select v,e,(o-1)::int from jsonb_array_elements_text(coalesce(doc->'bookingIds','[]')) with ordinality t(e,o);
end $$;

create or replace function public.upsert_user(doc jsonb) returns void
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'forbidden'; end if;
  insert into users(id,name,email,role,status,last_login)
  values(doc->>'id',doc->>'name',doc->>'email',doc->>'role',doc->>'status',doc->>'lastLogin')
  on conflict(id) do update set name=excluded.name,email=excluded.email,role=excluded.role,
    status=excluded.status,last_login=excluded.last_login;
end $$;

create or replace function public.upsert_support(doc jsonb) returns void
language plpgsql security definer set search_path=public as $$
begin
  -- الدعم: مسموح لأي مستخدم مصادَق وسياق الخادم
  insert into support(id,category,title,descr,priority,status,date)
  values(doc->>'id',doc->>'category',doc->>'title',doc->>'desc',doc->>'priority',doc->>'status',doc->>'date')
  on conflict(id) do update set category=excluded.category,title=excluded.title,descr=excluded.descr,
    priority=excluded.priority,status=excluded.status,date=excluded.date;
end $$;

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

-- منح تنفيذ الدوال للمصادَقين
do $$ declare fn text; begin
  foreach fn in array array['upsert_hotel','upsert_transport','upsert_package','upsert_trip','upsert_booking',
    'upsert_payment','upsert_ticket','upsert_beneficiary','upsert_user','upsert_support','upsert_branch']
  loop execute format('grant execute on function public.%I(jsonb) to authenticated;', fn); end loop;
end $$;

-- ════════════════════════════════════════════════════════════
-- حجز العميل العام (anon) — إنشاء + تتبّع
-- ════════════════════════════════════════════════════════════
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
  insert into booking_pilgrims(booking_id,name,id_number,nationality,gender,birth_date,phone,sort)
    select v,e->>'name',e->>'idNumber',e->>'nationality',e->>'gender',e->>'birthDate',e->>'phone',(o-1)::int
    from jsonb_array_elements(coalesce(doc->'pilgrims','[]')) with ordinality t(e,o);
  return v;
end $$;
grant execute on function public.create_public_booking(jsonb) to anon, authenticated;

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

-- ════════════════════════════════════════════════════════════
-- دفع العميل (عام) — يحدّث الأعمدة مباشرة
-- ════════════════════════════════════════════════════════════
create or replace function public.confirm_payment(p_booking_id text) returns void
  language sql security definer set search_path = public as $$
  update bookings set payment_status='verified', status='paid' where id = p_booking_id;
  update payments set pay_status='verified' where booking_id = p_booking_id;
$$;
grant execute on function public.confirm_payment(text) to anon, authenticated;

-- ════════════════════════════════════════════════════════════
-- RLS: قراءة للمصادَقين على الكل · الكتابة عبر الدوال · الحذف حسب الدور
-- ════════════════════════════════════════════════════════════
do $$
declare t text; child boolean; staff_writable text[] := array['trips','trip_drivers','bookings','booking_pilgrims','booking_seats'];
begin
  foreach t in array array[
    'hotels','hotel_features','hotel_reviews','hotel_media','hotel_room_types','hotel_room_photos',
    'transports','transport_features','transport_reviews','transport_media',
    'packages','package_features','package_program_stages','package_room_prices','package_reviews','package_policies','package_gallery',
    'branches','trips','trip_drivers','bookings','booking_pilgrims','booking_seats',
    'payments','payment_pilgrims','tickets','ticket_pilgrims','beneficiaries','beneficiary_bookings','users','support'
  ]
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('create policy "read all" on %I for select to authenticated using (true);', t);
    if t = any(staff_writable) then
      execute format('create policy "delete staff" on %I for delete to authenticated using (true);', t);
    else
      execute format('create policy "delete admin" on %I for delete to authenticated using (public.is_admin());', t);
    end if;
  end loop;
end $$;

-- قراءة anon للكتالوج فقط (صفحة العميل العامة)
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
    execute format('create policy "public read" on %I for select to anon using (true);', t);
  end loop;
end $$;

-- profiles
alter table profiles enable row level security;
create policy "profiles read"        on profiles for select to authenticated using (true);
create policy "profiles admin all"   on profiles for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "profiles self update" on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles self insert" on profiles for insert to authenticated with check (id = auth.uid());

-- ════════════════════════════════════════════════════════════
-- بعد التشغيل:
-- 1) Authentication → Providers → Email: أطفئ "Confirm email".
-- 2) Add user (أول مدير) → انسخ UUID:
--      insert into profiles(id,name,role) values('<UUID>','اسمك','مدير النظام');
-- 3) .env: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ثم شغّل.
--    البيانات تُعبّأ تلقائياً عند أول دخول (أو شغّل supabase/seed.sql).
-- ════════════════════════════════════════════════════════════
