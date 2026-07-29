-- ════════════════════════════════════════════════════════════
-- تساهيل العمرة — Migration (الجولة 2): مقاعد الحجز العام +
-- استعلام المقاعد المحجوزة للرحلة + طلبات العميل حسب الجوال +
-- قراءة anon لبيانات المواصلات (للكروكي).
-- آمن للتشغيل على قاعدة موجودة (بعد 20260728_refactor.sql).
-- الصقه في: Supabase → SQL Editor → Run.
-- ════════════════════════════════════════════════════════════

-- ═══════════════ 1) حفظ المقاعد في الحجز العام ═══════════════
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
  insert into booking_seats(booking_id,seat_no,sort)
    select v,(e)::int,(o-1)::int from jsonb_array_elements_text(coalesce(doc->'seats','[]')) with ordinality t(e,o);
  return v;
end $$;
grant execute on function public.create_public_booking(jsonb) to anon, authenticated;

-- ═══════════════ 2) المقاعد المحجوزة لرحلة (anon) ═══════════════
create or replace function public.trip_taken_seats(p_trip_id text) returns int[]
language sql security definer set search_path=public stable as $$
  select coalesce(array_agg(bs.seat_no order by bs.seat_no), '{}')
  from booking_seats bs
  join bookings b on b.id = bs.booking_id
  where b.trip_id = p_trip_id and b.status not in ('cancelled','rejected');
$$;
grant execute on function public.trip_taken_seats(text) to anon, authenticated;

-- ═══════════════ 3) طلبات العميل حسب رقم الجوال (anon، للتتبّع التلقائي) ═══════════════
create or replace function public.my_public_bookings(p_phone text)
returns table(id text, status text, payment_status text, package_name text, trip_date text, trip_time text, persons int, total numeric, created_at text)
language sql security definer set search_path=public stable as $$
  select b.id, b.status, b.payment_status,
         coalesce(p.name,''), t.departure_date, t.departure_time, b.persons, b.total, b.created_at
  from bookings b
  left join trips t    on t.id = b.trip_id
  left join packages p on p.id = coalesce(nullif(b.package_id,''), t.package_id)
  where b.client_phone = p_phone
  order by b.created_at desc;
$$;
grant execute on function public.my_public_bookings(text) to anon, authenticated;

-- ═══════════════ 4) قراءة anon لبيانات المواصلات (اسم الباص ومميزاته للكروكي) ═══════════════
do $$
declare t text;
begin
  foreach t in array array['transports','transport_features'] loop
    execute format('drop policy if exists "public read" on %I;', t);
    execute format('create policy "public read" on %I for select to anon using (true);', t);
  end loop;
end $$;

-- تم.
