-- 20261016 — لوحة الرحلات العامة: كروكي مجرد من الهوية
--
-- لا تعود هذه الدالة أي اسم أو جوال أو رقم حجز. كل صف هو رقم مقعد وحالته
-- التشغيلية فقط؛ وهو الحد الأدنى اللازم لمخطط العرض العام.

create or replace function public.public_dashboard_trip_seats(p_from date, p_to date)
returns table (trip_id text, seats jsonb)
language sql stable security definer set search_path = public as $$
  select t.id as trip_id,
         coalesce((
           select jsonb_agg(jsonb_build_object(
             'seat', bs.seat_no,
             'state', case
               when bs.seat_type = 'privacy' then 'reserved'
               when bp.gender = 'female' then 'female'
               when bp.gender = 'male' then 'male'
               else 'reserved'
             end
           ) order by bs.seat_no)
             from public.booking_seats bs
             join public.bookings b on b.id = bs.booking_id
             left join public.booking_pilgrims bp
               on bp.booking_id = bs.booking_id and bp.seat_no = bs.seat_no
            where bs.trip_id = t.id
              and bs.seat_no is not null
              and bs.is_active
              and b.status not in ('cancelled', 'rejected')
         ), '[]'::jsonb) as seats
    from public.trips t
   where nullif(t.departure_date, '')::date between p_from and p_to
   order by t.departure_date, t.departure_time, t.id;
$$;

revoke all on function public.public_dashboard_trip_seats(date, date) from public;
grant execute on function public.public_dashboard_trip_seats(date, date) to anon, authenticated;

insert into public.schema_migrations(version, note)
values ('20261016_public_dashboard_seat_map', 'لوحة عامة للرحلات وكروكي مقاعد مجهول الهوية')
on conflict (version) do nothing;
