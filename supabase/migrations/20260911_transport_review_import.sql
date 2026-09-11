-- آراء المواصلات المستوردة: التقييم وحالة النشر جزءان من السجل نفسه.
alter table public.transport_reviews add column if not exists rating numeric;
alter table public.transport_reviews drop constraint if exists transport_reviews_rating_range;
alter table public.transport_reviews add constraint transport_reviews_rating_range
  check (rating is null or (rating >= 1 and rating <= 5));

create or replace function public.upsert_transport(doc jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v text := doc->>'id';
begin
  if not public.can_write_admin() then raise exception 'forbidden: admin only'; end if;
  insert into transports(id,name,mode,vehicle_type,seats,seat_cost,model,year,plate,driver,supervisor,status,notes,
    serial_no,operator,operator_phone,insurance_expiry,inspection_expiry,registration_expiry,transport_license_expiry,
    flight_no,from_airport,to_airport,depart_time,arrive_time,cabin_class,baggage)
  values(v,doc->>'name',doc->>'mode',doc->>'vehicleType',coalesce((doc->>'seats')::int,0),coalesce((doc->>'seatCost')::numeric,0),
    doc->>'model',doc->>'year',doc->>'plate',doc->>'driver',doc->>'supervisor',
    case when doc->>'status' = 'active' then 'active' else 'inactive' end,doc->>'notes',
    nullif(doc->>'serialNo',''),nullif(doc->>'operator',''),nullif(doc->>'operatorPhone',''),
    nullif(doc->>'insuranceExpiry','')::date,nullif(doc->>'inspectionExpiry','')::date,
    nullif(doc->>'registrationExpiry','')::date,nullif(doc->>'transportLicenseExpiry','')::date,
    nullif(doc->>'flightNo',''),nullif(doc->>'fromAirport',''),nullif(doc->>'toAirport',''),
    nullif(doc->>'departTime',''),nullif(doc->>'arriveTime',''),nullif(doc->>'cabinClass',''),nullif(doc->>'baggage',''))
  on conflict(id) do update set name=excluded.name,mode=excluded.mode,vehicle_type=excluded.vehicle_type,
    seats=excluded.seats,seat_cost=excluded.seat_cost,model=excluded.model,year=excluded.year,plate=excluded.plate,
    driver=excluded.driver,supervisor=excluded.supervisor,status=excluded.status,notes=excluded.notes,
    serial_no=excluded.serial_no,operator=excluded.operator,operator_phone=excluded.operator_phone,
    insurance_expiry=excluded.insurance_expiry,inspection_expiry=excluded.inspection_expiry,
    registration_expiry=excluded.registration_expiry,transport_license_expiry=excluded.transport_license_expiry,
    flight_no=excluded.flight_no,from_airport=excluded.from_airport,to_airport=excluded.to_airport,
    depart_time=excluded.depart_time,arrive_time=excluded.arrive_time,cabin_class=excluded.cabin_class,baggage=excluded.baggage;

  delete from transport_features where transport_id=v;
  insert into transport_features(transport_id,item_id,text,icon,sort)
    select v,e->>'id',e->>'text',e->>'icon',(o-1)::int
    from jsonb_array_elements(coalesce(doc->'features','[]')) with ordinality t(e,o);

  delete from transport_reviews where transport_id=v;
  insert into transport_reviews(transport_id,item_id,name,text,consent,image,rating,sort)
    select v,e->>'id',e->>'name',e->>'text',coalesce((e->>'consent')::boolean,false),nullif(e->>'image',''),
      nullif(e->>'rating','')::numeric,(o-1)::int
    from jsonb_array_elements(coalesce(doc->'reviews','[]')) with ordinality t(e,o);

  if doc ? 'media' then
    delete from transport_media where transport_id=v;
    insert into transport_media(transport_id,item_id,kind,url,is_primary,category,sort)
      select v,e->>'id',e->>'kind',e->>'url',(e->>'primary')::boolean,e->>'category',(o-1)::int
      from jsonb_array_elements(coalesce(doc->'media','[]')) with ordinality t(e,o)
      where coalesce(e->>'url','') <> '';
  end if;
end $$;
