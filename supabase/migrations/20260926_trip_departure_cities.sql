-- ════════════════════════════════════════════════════════════════════
-- 20260926 — مدينة الانطلاق ← نقاط/فروع الانطلاق
--
-- المدينة لقطة على الرحلة، والنقطة تبقى branch_id/ departure_point.
-- بذلك يمكن لمدينة واحدة أن تضم نقاطاً متعددة دون تغيير تجربة العميل:
-- يختار مدينة فقط، وتظهر له رحلات تلك المدينة.
-- ════════════════════════════════════════════════════════════════════

alter table public.trips add column if not exists departure_city text;
create index if not exists trips_departure_city_idx on public.trips(departure_city);

-- تعبئة الرحلات القائمة من نقطة/فرع الانطلاق إن كانت مرتبطة به.
update public.trips t
   set departure_city = b.city
  from public.branches b
 where b.id = t.branch_id
   and nullif(btrim(coalesce(t.departure_city,'')),'') is null
   and nullif(btrim(coalesce(b.city,'')),'') is not null;

alter function public.upsert_trip(jsonb) rename to upsert_trip_base;
revoke all on function public.upsert_trip_base(jsonb) from public, anon, authenticated;

create function public.upsert_trip(doc jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_city text := nullif(btrim(coalesce(doc->>'departureCity','')), '');
  v_branch_city text;
begin
  if not public.can_write_staff() then raise exception 'forbidden'; end if;

  -- إن اختيرت نقطة من الفروع فمدينتها هي المصدر المعتمد دائماً.
  if nullif(doc->>'branchId','') is not null then
    select city into v_branch_city from public.branches where id = doc->>'branchId';
    if v_branch_city is not null then v_city := v_branch_city; end if;
  end if;
  if v_city is null then raise exception 'departure_city_required: مدينة الانطلاق مطلوبة'; end if;

  perform public.upsert_trip_base(doc);
  update public.trips set departure_city = v_city where id = doc->>'id';
end $$;

revoke all on function public.upsert_trip(jsonb) from public, anon;
grant execute on function public.upsert_trip(jsonb) to authenticated;
