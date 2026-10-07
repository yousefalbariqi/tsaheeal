-- 20261023 — مقاعد الاتجاهات للطلبات المخصّصة
--
-- الحجز العام يبقى باقة ذهاب وعودة كما هو. أمّا الطلب المخصّص فيستطيع
-- الموظف أن يقفل مقاعد الذهاب أو العودة بصورة مستقلة. لا نخزّن هذه
-- المقاعد في booking_seats: ذلك الجدول يعني دائماً مقعد الباقة في
-- الاتجاهين، بينما هذا الجدول يعني مقعداً تشغيلياً خاصاً بطلبٍ مخصّص.

alter table public.custom_requests
  add column if not exists one_way_direction text;

alter table public.custom_requests
  drop constraint if exists custom_requests_one_way_direction_check;
alter table public.custom_requests
  add constraint custom_requests_one_way_direction_check
  check (one_way_direction is null or one_way_direction in ('outbound', 'return'));

create table if not exists public.custom_request_seats (
  id bigserial primary key,
  custom_request_id text not null references public.custom_requests(id) on delete cascade,
  trip_id text not null references public.trips(id) on delete restrict,
  direction text not null check (direction in ('outbound', 'return')),
  seat_no integer not null check (seat_no > 0),
  sort integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (custom_request_id, direction, seat_no)
);

-- مقعدٌ واحد لا يباع لطلبين مخصّصين في الاتجاه نفسه. الحجوزات العادية
-- تُفحص معها داخل الدوال أدناه لأنها محفوظة في جدول مختلف.
create unique index if not exists custom_request_seats_direction_uniq
  on public.custom_request_seats(trip_id, direction, seat_no)
  where is_active;
create index if not exists custom_request_seats_request_idx
  on public.custom_request_seats(custom_request_id, direction);

alter table public.custom_request_seats enable row level security;
drop policy if exists "staff read custom request seats" on public.custom_request_seats;
create policy "staff read custom request seats" on public.custom_request_seats
  for select to authenticated using (public.can_write_staff());

/* استهلاك اتجاه واحد = الحجوزات العادية (تسافر في الاتجاهين) + حجوزات
   الطلبات المخصصة لذلك الاتجاه. لا تمنح هذه الدالة صلاحية عامة؛ هي أساس
   التحقق وإعادة عداد الرحلة فقط. */
create or replace function public.trip_directional_seats_used(p_trip_id text, p_direction text)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce((
    select sum(public.booking_operational_seats(b.id))
      from public.bookings b
     where b.trip_id = p_trip_id
       and b.status not in ('cancelled', 'rejected')
  ), 0)::integer
  + coalesce((
    select count(*)
      from public.custom_request_seats crs
     where crs.trip_id = p_trip_id
       and crs.direction = p_direction
       and crs.is_active
  ), 0)::integer;
$$;
revoke all on function public.trip_directional_seats_used(text, text) from public, anon, authenticated;

/* يبقى booked_seats رقماً واحداً لتوافق الواجهة الحالية: هو أعلى إشغال
   بين الاتجاهين، أي المتاح الحقيقي للباقة الكاملة هو الأقل بينهما. */
create or replace function public.resync_trip_seats(p_trip_id text) returns void
language sql security definer set search_path = public as $$
  update public.trips t
     set booked_seats = greatest(
       public.trip_directional_seats_used(t.id, 'outbound'),
       public.trip_directional_seats_used(t.id, 'return')
     )
   where t.id = p_trip_id;
$$;

/* يمنع الإدراج المباشر لمقعد باقة عادية من الاصطدام بمقعد طلب مخصّص.
   قفل صف الرحلة هو القفل المشترك مع assign_custom_request_seats و
   accept_booking، لذلك لا توجد نافذة سباق بين الموظفين. */
create or replace function public.guard_booking_seat_against_custom_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_trip text; v_taken integer;
begin
  if new.seat_no is null or new.booking_id is null then return new; end if;
  select trip_id into v_trip from public.bookings where id = new.booking_id;
  if v_trip is null then return new; end if;
  perform 1 from public.trips where id = v_trip for update;
  select crs.seat_no into v_taken
    from public.custom_request_seats crs
   where crs.trip_id = v_trip and crs.seat_no = new.seat_no and crs.is_active
   limit 1;
  if v_taken is not null then
    raise exception 'seat_taken: المقعد % محجوز في أحد اتجاهي الطلبات المخصصة', v_taken;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_booking_seat_against_custom_request on public.booking_seats;
create trigger trg_booking_seat_against_custom_request
  before insert or update of booking_id, seat_no on public.booking_seats
  for each row execute function public.guard_booking_seat_against_custom_request();

/* حارس نهائي للسعة. يتحقق بعد اكتمال المعاملة من أعلى إشغال للاتجاهين؛
   لذلك يحمي حتى أي كتابة إدارية قد لا تمر بدالة الاختيار في الواجهة. */
create or replace function public.assert_trip_directional_capacity()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_trip text; v_cap integer; v_out integer; v_return integer;
begin
  v_trip := case when tg_op = 'DELETE' then old.trip_id else new.trip_id end;
  if v_trip is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  select seats into v_cap from public.trips where id = v_trip for update;
  if v_cap is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  v_out := public.trip_directional_seats_used(v_trip, 'outbound');
  v_return := public.trip_directional_seats_used(v_trip, 'return');
  if greatest(v_out, v_return) > v_cap then
    raise exception 'seats_unavailable: المتاح % مقعداً في أكثر الاتجاهات امتلاءً',
      greatest(v_cap - greatest(v_out, v_return), 0);
  end if;
  perform public.resync_trip_seats(v_trip);
  if tg_op = 'UPDATE' and old.trip_id is distinct from new.trip_id then
    perform public.resync_trip_seats(old.trip_id);
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists trg_custom_request_directional_capacity on public.custom_request_seats;
create constraint trigger trg_custom_request_directional_capacity
  after insert or update or delete on public.custom_request_seats
  deferrable initially deferred for each row execute function public.assert_trip_directional_capacity();

drop trigger if exists trg_booking_directional_capacity on public.bookings;
create constraint trigger trg_booking_directional_capacity
  after insert or update or delete on public.bookings
  deferrable initially deferred for each row execute function public.assert_trip_directional_capacity();

/* إغلاق الطلب يلغي التحفّظ التشغيلي فوراً كي تعود المقاعد للبيع. */
create or replace function public.release_closed_custom_request_seats()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'closed' and old.status is distinct from 'closed' then
    delete from public.custom_request_seats where custom_request_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_release_closed_custom_request_seats on public.custom_requests;
create trigger trg_release_closed_custom_request_seats
  after update of status on public.custom_requests
  for each row execute function public.release_closed_custom_request_seats();

/* كروكي اتجاهٍ واحد، بلا أي معلومات عميل. صفوف الباقة العادية تظهر في
   الاتجاهين، وصفوف الطلبات المخصصة تظهر في اتجاهها المحفوظ فقط. */
create or replace function public.custom_request_direction_seats(p_trip_id text, p_direction text)
returns table(seat_no integer, source text, request_id text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_write_staff() then raise exception 'forbidden: staff only'; end if;
  if p_direction not in ('outbound', 'return') then raise exception 'bad_direction: الاتجاه غير صالح'; end if;
  return query
    select bs.seat_no, 'booking'::text, null::text
      from public.booking_seats bs
      join public.bookings b on b.id = bs.booking_id
     where bs.trip_id = p_trip_id and bs.is_active and bs.seat_no is not null
       and b.status not in ('cancelled', 'rejected')
    union all
    select crs.seat_no, 'custom_request'::text, crs.custom_request_id
      from public.custom_request_seats crs
     where crs.trip_id = p_trip_id and crs.direction = p_direction and crs.is_active;
end;
$$;
revoke all on function public.custom_request_direction_seats(text, text) from public, anon;
grant execute on function public.custom_request_direction_seats(text, text) to authenticated;

/* اختيار الموظف ذري: يقفل الرحلة، يفحص الباقة والحجوزات المخصصة الأخرى،
   ثم يستبدل مقاعد الاتجاه المطلوب في المعاملة نفسها. */
create or replace function public.assign_custom_request_seats(
  p_request_id text, p_trip_id text, p_direction text, p_seats integer[]
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_request record;
  v_capacity integer;
  v_taken integer;
  v_used integer;
  v_old_trips text[];
  v_old_trip text;
  v_count integer := coalesce(array_length(p_seats, 1), 0);
begin
  if not public.can_write_staff() then raise exception 'forbidden: staff only'; end if;
  if p_direction not in ('outbound', 'return') then raise exception 'bad_direction: اختر الذهاب أو العودة'; end if;
  if p_seats is null or v_count = 0 then raise exception 'seats_count: اختر مقعداً واحداً على الأقل'; end if;
  if (select count(distinct s) from unnest(p_seats) s) <> v_count then
    raise exception 'seats_dup: لا يمكن اختيار المقعد نفسه مرتين';
  end if;

  select * into v_request from public.custom_requests where id = p_request_id for update;
  if not found then raise exception 'not_found: الطلب المخصّص غير موجود'; end if;
  if v_request.status = 'closed' then raise exception 'bad_state: الطلب مغلق ولا يمكن حجز مقاعد له'; end if;
  if coalesce(v_request.travel_mode, '') <> 'bus' then
    raise exception 'bus_required: اختيار المقاعد متاح لطلبات الباص فقط';
  end if;
  if v_count <> greatest(coalesce(v_request.persons, 1), 1) then
    raise exception 'seats_count: الطلب يحتاج % مقعداً والمختار %', v_request.persons, v_count;
  end if;

  select seats into v_capacity from public.trips where id = p_trip_id for update;
  if v_capacity is null then raise exception 'trip_not_found: الرحلة غير موجودة'; end if;
  if exists (select 1 from unnest(p_seats) s where s < 1 or s > v_capacity) then
    raise exception 'seat_range: يوجد مقعد خارج سعة الحافلة (%)', v_capacity;
  end if;

  select min(bs.seat_no) into v_taken
    from public.booking_seats bs
    join public.bookings b on b.id = bs.booking_id
   where bs.trip_id = p_trip_id and bs.is_active and bs.seat_no = any(p_seats)
     and b.status not in ('cancelled', 'rejected');
  if v_taken is not null then
    raise exception 'seat_taken: المقعد % محجوز للباقة في الذهاب والعودة', v_taken;
  end if;

  select min(crs.seat_no) into v_taken
    from public.custom_request_seats crs
   where crs.trip_id = p_trip_id and crs.direction = p_direction and crs.is_active
     and crs.custom_request_id <> p_request_id and crs.seat_no = any(p_seats);
  if v_taken is not null then
    raise exception 'seat_taken: المقعد % محجوز في هذا الاتجاه', v_taken;
  end if;

  select coalesce(sum(public.booking_operational_seats(b.id)), 0)
       + coalesce((select count(*) from public.custom_request_seats crs
                    where crs.trip_id = p_trip_id and crs.direction = p_direction
                      and crs.is_active and crs.custom_request_id <> p_request_id), 0)
    into v_used
    from public.bookings b
   where b.trip_id = p_trip_id and b.status not in ('cancelled', 'rejected');
  if v_used + v_count > v_capacity then
    raise exception 'seats_unavailable: المتاح % مقعداً في هذا الاتجاه', greatest(v_capacity - v_used, 0);
  end if;

  if coalesce(v_request.journey_kind, 'one_way') = 'one_way' then
    select coalesce(array_agg(distinct trip_id), '{}'::text[]) into v_old_trips
      from public.custom_request_seats where custom_request_id = p_request_id;
    delete from public.custom_request_seats where custom_request_id = p_request_id;
    update public.custom_requests set one_way_direction = p_direction where id = p_request_id;
  else
    select coalesce(array_agg(distinct trip_id), '{}'::text[]) into v_old_trips
      from public.custom_request_seats
     where custom_request_id = p_request_id and direction = p_direction;
    delete from public.custom_request_seats
     where custom_request_id = p_request_id and direction = p_direction;
  end if;

  insert into public.custom_request_seats(custom_request_id, trip_id, direction, seat_no, sort)
    select p_request_id, p_trip_id, p_direction, s, o - 1
      from unnest(p_seats) with ordinality t(s, o);

  perform public.resync_trip_seats(p_trip_id);
  foreach v_old_trip in array v_old_trips loop
    if v_old_trip is distinct from p_trip_id then
      perform public.resync_trip_seats(v_old_trip);
    end if;
  end loop;
end;
$$;
revoke all on function public.assign_custom_request_seats(text, text, text, integer[]) from public, anon;
grant execute on function public.assign_custom_request_seats(text, text, text, integer[]) to authenticated;

/* upsert الطلب من اللوحة يجب أن يحافظ على تفاصيل السفر التي أضيفت بعد
   النسخة الأصلية من الدالة، ولا يزيل اتجاهاً اختاره الموظف. */
create or replace function public.upsert_custom_request(doc jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v text := doc->>'id';
  v_status text := coalesce(doc->>'status','new');
  v_reason text := nullif(trim(coalesce(doc->>'closeReason','')),'');
begin
  if not public.can_write_staff() then raise exception 'forbidden'; end if;
  if v_status = 'closed' and v_reason is null then raise exception 'close_reason_required: الإغلاق يحتاج سبباً'; end if;
  if v_reason is not null and v_reason not in ('لم يردّ','السعر غير مناسب','غير قابل للتنفيذ','أُلغي من العميل') then
    raise exception 'bad_close_reason: سبب الإغلاق خارج القائمة';
  end if;
  insert into public.custom_requests(
    id,depart_date,return_date,persons,destination,room_type,hotel_level,trip_notes,name,phone,city,notes,
    status,created_at,staff,close_reason,journey_kind,travel_mode,outbound_trip_id,return_trip_id,
    hotel_requested,hotel_nights,hotel_near_haram,one_way_direction
  ) values (
    v,doc->>'departDate',doc->>'returnDate',coalesce((doc->>'persons')::int,1),doc->>'destination',
    doc->>'roomType',doc->>'hotelLevel',doc->>'tripNotes',doc->>'name',doc->>'phone',doc->>'city',doc->>'notes',
    v_status,doc->>'createdAt',doc->>'staff',case when v_status = 'closed' then v_reason else null end,
    nullif(doc->>'journeyKind',''),nullif(doc->>'travelMode',''),nullif(doc->>'outboundTripId',''),nullif(doc->>'returnTripId',''),
    coalesce((doc->>'hotelRequested')::boolean,false),nullif(doc->>'hotelNights','')::int,
    (doc->>'hotelNearHaram')::boolean,nullif(doc->>'oneWayDirection','')
  ) on conflict(id) do update set
    depart_date=excluded.depart_date, return_date=excluded.return_date, persons=excluded.persons,
    destination=excluded.destination, room_type=excluded.room_type, hotel_level=excluded.hotel_level,
    trip_notes=excluded.trip_notes, name=excluded.name, phone=excluded.phone, city=excluded.city, notes=excluded.notes,
    status=excluded.status, staff=excluded.staff, close_reason=excluded.close_reason,
    journey_kind=excluded.journey_kind, travel_mode=excluded.travel_mode,
    outbound_trip_id=excluded.outbound_trip_id, return_trip_id=excluded.return_trip_id,
    hotel_requested=excluded.hotel_requested, hotel_nights=excluded.hotel_nights,
    hotel_near_haram=excluded.hotel_near_haram,
    one_way_direction=coalesce(excluded.one_way_direction, public.custom_requests.one_way_direction);
end;
$$;
revoke all on function public.upsert_custom_request(jsonb) from public, anon;
grant execute on function public.upsert_custom_request(jsonb) to authenticated;

insert into public.schema_migrations(version, note)
values ('20261023_directional_custom_request_seats', 'مقاعد مستقلة للذهاب والعودة داخل الطلبات المخصصة')
on conflict (version) do nothing;
