-- 20261007 — لا تسقط لقطة الرجال والنساء حين لا ترسل الواجهة مفتاح الأطفال.
--
-- ترحيل 20261005 كان يعامل مفتاح children الغائب كأنه توزيع غير صالح.
-- الواجهة الحالية تختار رجالاً ونساء فقط، لذا الغياب يعني 0 أطفال.

create or replace function public.create_public_booking(doc jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_booking_id text;
  v_trip        text := nullif(coalesce(doc, '{}'::jsonb)->>'tripId', '');
  v_people      int := greatest(coalesce((doc->>'persons')::int, 1), 1);
  v_counts      jsonb := coalesce(doc->'travellerCounts', null);
  v_men         int;
  v_women       int;
  v_children    int;
  v_nights      int;
  v_seat_price  numeric;
  v_nightly     numeric;
  v_room_count  int;
  v_total       numeric;
  v_stay_total  numeric;
begin
  v_booking_id := public.create_public_booking_detail_snapshot_base(doc);

  select greatest(coalesce(p.nights, 1), 1),
         coalesce(p.seat_cost_override, tr.seat_cost, 0), b.total
    into v_nights, v_seat_price, v_total
    from public.bookings b
    join public.trips t on t.id = b.trip_id
    join public.packages p on p.id = t.package_id
    left join public.transports tr on tr.id = coalesce(nullif(t.transport_id, ''), nullif(p.transport_id, ''))
   where b.id = v_booking_id;

  select count(*), coalesce(sum(per_night), 0)
    into v_room_count, v_nightly
    from public.booking_rooms
   where booking_id = v_booking_id;
  v_stay_total := v_nightly * v_nights;

  if jsonb_typeof(v_counts) = 'object'
     and coalesce(v_counts->>'men', '') ~ '^\d+$'
     and coalesce(v_counts->>'women', '') ~ '^\d+$'
     and coalesce(v_counts->>'children', '0') ~ '^\d+$' then
    v_men := (v_counts->>'men')::int;
    v_women := (v_counts->>'women')::int;
    v_children := coalesce(v_counts->>'children', '0')::int;
    if v_men + v_women + v_children = v_people then
      v_counts := jsonb_build_object('men', v_men, 'women', v_women, 'children', v_children);
    else
      v_counts := null;
    end if;
  else
    v_counts := null;
  end if;

  update public.bookings
     set traveller_counts = v_counts,
         transport_seat_price = case when v_room_count > 0 then v_seat_price end,
         transport_total = case when v_room_count > 0 then v_total - v_stay_total end,
         accommodation_nightly = case when v_room_count > 0 then v_nightly end,
         accommodation_rooms = case when v_room_count > 0 then v_room_count end,
         accommodation_nights = case when v_room_count > 0 then v_nights end,
         accommodation_total = case when v_room_count > 0 then v_stay_total end
   where id = v_booking_id;

  return v_booking_id;
end $$;

revoke all on function public.create_public_booking(jsonb) from public, anon;
grant execute on function public.create_public_booking(jsonb) to authenticated;
