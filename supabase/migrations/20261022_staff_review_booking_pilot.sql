-- ════════════════════════════════════════════════════════════════════
-- 20261022 — إطلاق تجريبي: الطلب مباشر ومراجعته يدوية من الفريق
--
-- لا OTP ولا كلمة مرور في مسار الحجز. العميل يرسل بياناته ورقم جواله،
-- ثم يبقى الطلب reviewing ولا توجد موافقة أو دفع قبل مكالمة الموظف له.
-- يبقى حساب السعر وفئة السكن والمقاعد ملكاً للخادم.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.create_public_booking_base(doc jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v text := coalesce(nullif(doc->>'id', ''), 'TRB-' || upper(substr(md5(random()::text), 1, 5)));
  tid text := nullif(doc->>'tripId', '');
  n int := greatest(coalesce((doc->>'persons')::int, 1), 1);
  avail int;
  v_pkg text;
  v_phone text := public.norm_phone(doc->>'clientPhone');
  v_total numeric;
  v_room_type text;
begin
  doc := coalesce(doc, '{}'::jsonb);
  if tid is null then raise exception 'trip_required'; end if;
  if v_phone is null or v_phone !~ '^9665[0-9]{8}$' then raise exception 'phone_required'; end if;

  select t.seats - t.booked_seats, t.package_id into avail, v_pkg
    from public.trips t where t.id=tid for update;
  if not found then raise exception 'trip_not_found'; end if;
  if v_pkg is null or v_pkg='' then raise exception 'trip_package_missing'; end if;
  if n > avail then raise exception 'insufficient_seats:%', avail; end if;

  v_total := public.compute_booking_total(tid, n, doc->'rooms');
  if v_total is null or v_total <= 0 then raise exception 'price_unavailable'; end if;
  select string_agg(format('%s · %s', rp.type, rp.persons), ' + ' order by x.ord) into v_room_type
    from jsonb_array_elements(coalesce(doc->'rooms', '[]'::jsonb)) with ordinality x(room, ord)
    join public.package_room_prices rp on rp.package_id=v_pkg and rp.item_id=nullif(x.room->>'tierId', '');

  insert into public.bookings(id, trip_id, package_id, client_name, client_phone, customer_id, room_type, persons, total,
    status, payment_status, created_at, submitted_at, staff, source, sent_date)
  values (v, tid, v_pkg, doc->>'clientName', public.local_phone(v_phone), null, coalesce(v_room_type, ''), n, v_total,
    'reviewing', 'none', to_char(now(), 'YYYY-MM-DD'), now(), '', 'public', null);

  insert into public.booking_pilgrims(booking_id,name,doc_type,id_number,nationality,gender,age_group,birth_date,phone,seat_no,sort)
    select v,e->>'name',nullif(e->>'docType',''),e->>'idNumber',e->>'nationality',e->>'gender',nullif(e->>'ageGroup',''),e->>'birthDate',e->>'phone',nullif(e->>'seat','')::int,(o-1)::int
      from jsonb_array_elements(coalesce(doc->'pilgrims','[]')) with ordinality t(e,o);
  insert into public.booking_seats(booking_id,seat_no,sort)
    select v,(e)::int,(o-1)::int from jsonb_array_elements_text(coalesce(doc->'seats','[]')) with ordinality t(e,o);
  insert into public.booking_rooms(booking_id,tier_id,type,persons,per_night,sort)
    select v,rp.item_id,rp.type,rp.persons,rp.per_night,(x.ord-1)::int
      from jsonb_array_elements(coalesce(doc->'rooms','[]'::jsonb)) with ordinality x(room,ord)
      join public.package_room_prices rp on rp.package_id=v_pkg and rp.item_id=nullif(x.room->>'tierId','');
  return v;
end $$;

revoke all on function public.create_public_booking_base(jsonb) from public, anon, authenticated;
revoke all on function public.create_public_booking(jsonb) from public;
grant execute on function public.create_public_booking(jsonb) to anon, authenticated;

comment on function public.create_public_booking_base(jsonb) is
  'Pilot: public request by phone; staff reviews and verifies by contact before approval or payment.';

insert into public.schema_migrations(version, note)
values ('20261022_staff_review_booking_pilot', 'Public booking requests by phone, with staff manual review and no customer OTP')
on conflict (version) do nothing;
