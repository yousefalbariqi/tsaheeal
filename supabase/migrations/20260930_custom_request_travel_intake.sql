-- طلب السفر المخصص: تفضيلات العميل فقط، لا حجز مقعد ولا تسعير آلي.
-- تحفظ لتظهر للموظف عند مراجعة التوفر وإعداد العرض.
alter table public.custom_requests
  add column if not exists journey_kind text,
  add column if not exists travel_mode text,
  add column if not exists outbound_trip_id text references public.trips(id) on delete set null,
  add column if not exists return_trip_id text references public.trips(id) on delete set null,
  add column if not exists hotel_requested boolean not null default false,
  add column if not exists hotel_nights int,
  add column if not exists hotel_near_haram boolean;

alter table public.custom_requests drop constraint if exists custom_requests_journey_kind_check;
alter table public.custom_requests add constraint custom_requests_journey_kind_check
  check (journey_kind is null or journey_kind in ('one_way','round_trip'));
alter table public.custom_requests drop constraint if exists custom_requests_travel_mode_check;
alter table public.custom_requests add constraint custom_requests_travel_mode_check
  check (travel_mode is null or travel_mode in ('bus','flight'));

-- نحافظ على دالة الإدخال القائمة (وتحقق الاسم والجوال) ثم نضيف تفاصيل
-- الاستمارة الجديدة. لا تحجز هذه الدالة أي مقعد؛ الحجز قرار الموظف لاحقاً.
alter function public.create_custom_request(jsonb) rename to create_custom_request_travel_base;

create function public.create_custom_request(doc jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  v := public.create_custom_request_travel_base(doc);
  update public.custom_requests set
    journey_kind = nullif(doc->>'journeyKind',''),
    travel_mode = nullif(doc->>'travelMode',''),
    outbound_trip_id = nullif(doc->>'outboundTripId',''),
    return_trip_id = nullif(doc->>'returnTripId',''),
    hotel_requested = coalesce((doc->>'hotelRequested')::boolean, false),
    hotel_nights = case when coalesce((doc->>'hotelRequested')::boolean, false) then greatest(coalesce((doc->>'hotelNights')::int, 1), 1) else null end,
    hotel_near_haram = case when coalesce((doc->>'hotelRequested')::boolean, false) then coalesce((doc->>'hotelNearHaram')::boolean, false) else null end
  where id = v;
  return v;
end $$;

revoke all on function public.create_custom_request(jsonb) from public;
grant execute on function public.create_custom_request(jsonb) to anon, authenticated;
