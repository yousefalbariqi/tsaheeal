-- 20261008 — رحلة واحدة، محطات صعود متعددة
--
-- لا نصنع رحلة مستقلة لكل فرع. المركبة والمقاعد والحجوزات واحدة، لكن
-- الباص يمر بمحطات مرتبة، ولكل منها وقتها. الحقول القديمة تبقى لقطةً
-- لأول محطة كي تظل التذاكر والتقارير القديمة متوافقة.

alter table public.trips
  add column if not exists departure_stops jsonb not null default '[]'::jsonb,
  -- قواعد قديمة لم يصلها ترحيل 20260912/20260926؛ نضمنها هنا كي يكون
  -- ترحيل المحطات قابلاً للتشغيل وحده ولا يتعثر في تعبئة البيانات القائمة.
  add column if not exists departure_address text,
  add column if not exists departure_city text;

update public.trips
   set departure_stops = jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
     'id', 'legacy-' || id,
     'branchId', nullif(branch_id, ''),
     'city', nullif(departure_city, ''),
     'point', nullif(departure_point, ''),
     'time', nullif(departure_time, ''),
     'mapUrl', nullif(departure_map_url, ''),
     'address', nullif(departure_address, '')
   )))
 where jsonb_typeof(departure_stops) <> 'array'
    or jsonb_array_length(departure_stops) = 0;

alter function public.upsert_trip(jsonb) rename to upsert_trip_multiple_stops_base;
revoke all on function public.upsert_trip_multiple_stops_base(jsonb) from public, anon, authenticated;

create function public.upsert_trip(doc jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_stops jsonb := coalesce(doc->'departureStops', '[]'::jsonb);
  v_first jsonb;
begin
  if not public.can_write_staff() then raise exception 'forbidden'; end if;
  if jsonb_typeof(v_stops) <> 'array' or jsonb_array_length(v_stops) = 0 then
    v_stops := jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'id', 'legacy-' || coalesce(doc->>'id','new'),
      'branchId', nullif(doc->>'branchId',''),
      'city', nullif(doc->>'departureCity',''),
      'point', nullif(doc->>'departurePoint',''),
      'time', nullif(doc->>'departureTime',''),
      'mapUrl', nullif(doc->>'departureMapUrl',''),
      'address', nullif(doc->>'departureAddress','')
    )));
  end if;
  select value into v_first from jsonb_array_elements(v_stops) with ordinality x(value, ord) order by ord limit 1;
  if coalesce(nullif(v_first->>'city',''), '') = ''
     or coalesce(nullif(v_first->>'point',''), '') = ''
     or coalesce(nullif(v_first->>'time',''), '') = '' then
    raise exception 'departure_stop_required: أضف محطة انطلاق ووقتها';
  end if;

  -- الحقول المتوافقة مع النظام القديم تؤخذ من أول محطة دائماً.
  doc := doc || jsonb_build_object(
    'branchId', coalesce(v_first->>'branchId',''),
    'departureCity', v_first->>'city',
    'departurePoint', v_first->>'point',
    'departureTime', v_first->>'time',
    'departureMapUrl', coalesce(v_first->>'mapUrl',''),
    'departureAddress', coalesce(v_first->>'address','')
  );
  perform public.upsert_trip_multiple_stops_base(doc);
  update public.trips set departure_stops = v_stops where id = doc->>'id';
end $$;

revoke all on function public.upsert_trip(jsonb) from public, anon;
grant execute on function public.upsert_trip(jsonb) to authenticated;
