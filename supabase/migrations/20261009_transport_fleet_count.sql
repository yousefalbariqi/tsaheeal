-- 20261009 — سجل النقل هو نوع المركبة لا باصاً واحداً
--
-- «مرسيدس 2027 · 49 مقعد» يُكتب مرةً واحدة، ثم يقال كم باصاً متاحاً
-- من النوع نفسه. يسمح الحارس بتشغيل ذلك العدد من الرحلات المتداخلة.

alter table public.transports
  add column if not exists fleet_count integer not null default 1;
alter table public.transports drop constraint if exists transports_fleet_count_chk;
alter table public.transports add constraint transports_fleet_count_chk check (fleet_count >= 1);

alter function public.upsert_transport(jsonb) rename to upsert_transport_fleet_base;
revoke all on function public.upsert_transport_fleet_base(jsonb) from public, anon, authenticated;

create function public.upsert_transport(doc jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_count integer := greatest(coalesce(nullif(doc->>'fleetCount','')::integer, 1), 1);
begin
  if not public.can_write_admin() then raise exception 'forbidden: admin only'; end if;
  perform public.upsert_transport_fleet_base(doc);
  update public.transports set fleet_count = v_count where id = doc->>'id';
end $$;

revoke all on function public.upsert_transport(jsonb) from public, anon;
grant execute on function public.upsert_transport(jsonb) to authenticated;

-- حارس الخادم: الواجهة مفيدة للشرح، لكن لا نثق بها وحدها.
alter function public.upsert_trip(jsonb) rename to upsert_trip_fleet_base;
revoke all on function public.upsert_trip_fleet_base(jsonb) from public, anon, authenticated;

create function public.upsert_trip(doc jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_transport text := nullif(doc->>'transportId','');
  v_fleet integer := 1;
  v_used integer := 0;
  v_from text := doc->>'departureDate';
  v_to text := coalesce(nullif(doc->>'returnDate',''), doc->>'departureDate');
begin
  if not public.can_write_staff() then raise exception 'forbidden'; end if;
  if v_transport is not null then
    select greatest(coalesce(fleet_count,1),1) into v_fleet from public.transports where id = v_transport;
    select count(*) into v_used from public.trips t
      where t.transport_id = v_transport and t.id <> coalesce(doc->>'id','')
        and t.status not in ('cancelled','archived')
        and t.departure_date <= v_to and coalesce(nullif(t.return_date,''),t.departure_date) >= v_from;
    if v_used >= v_fleet then
      raise exception 'fleet_unavailable: جميع الباصات المتاحة من هذا النوع مرتبطة برحلات متداخلة';
    end if;
  end if;
  perform public.upsert_trip_fleet_base(doc);
end $$;

revoke all on function public.upsert_trip(jsonb) from public, anon;
grant execute on function public.upsert_trip(jsonb) to authenticated;
