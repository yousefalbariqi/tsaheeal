-- 20261013 — مقعد خصوصية للأنثى المنفردة
--
-- الأنثى المنفردة (شخص واحد وتوزيعُه أنثى واحدة) تختار مقعدين متجاورين:
-- الأول لها والثاني «خصوصية». لا تُعامل الخصوصية كراكب، لكنها تحجز من
-- سعة الرحلة ولا يمكن بيعها. وجود رجل أو مرافق في الحجز يلغي القاعدة.

alter table public.booking_seats
  add column if not exists seat_type text not null default 'passenger',
  add column if not exists privacy_for_seat int;

alter table public.booking_seats drop constraint if exists booking_seats_type_chk;
alter table public.booking_seats add constraint booking_seats_type_chk
  check (seat_type in ('passenger', 'privacy'));

alter table public.booking_seats drop constraint if exists booking_seats_privacy_for_chk;
alter table public.booking_seats add constraint booking_seats_privacy_for_chk
  check (
    (seat_type = 'passenger' and privacy_for_seat is null)
    or (seat_type = 'privacy' and privacy_for_seat is not null)
  );

comment on column public.booking_seats.seat_type is
  'passenger = مقعد راكب، privacy = مقعد مفرغ ملاصق للأنثى المنفردة.';

/* هل الحجز لأنثى تسافر وحدها؟ لقطة توزيع المسافرين هي المرجع، ونلجأ
   لسجل المعتمر للحجوزات القديمة التي لم تحفظ اللقطة. */
create or replace function public.is_solo_female_booking(p_booking_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select b.persons = 1 and (
      (
        jsonb_typeof(b.traveller_counts) = 'object'
        and coalesce((b.traveller_counts->>'men')::int, -1) = 0
        and coalesce((b.traveller_counts->>'women')::int, -1) = 1
        and coalesce((b.traveller_counts->>'children')::int, 0) = 0
      )
      or (
        b.traveller_counts is null
        and exists (
          select 1 from public.booking_pilgrims p
           where p.booking_id = b.id and p.gender = 'female'
        )
      )
    )
    from public.bookings b where b.id = p_booking_id
  ), false);
$$;
revoke all on function public.is_solo_female_booking(text) from public, anon, authenticated;

/* شريك المقعد في كروكي ٢ + ممر + ٢. الصف الخلفي غير المنتظم لا يخمّن
   له شريكاً؛ لذلك لا يُقبل مقعده للأنثى المنفردة حتى لا نخالف الخصوصية. */
create or replace function public.seat_privacy_partner(p_capacity int, p_seat int)
returns int language plpgsql immutable as $$
declare n int := 1; rem int;
begin
  if p_capacity is null or p_seat is null or p_seat < 1 or p_seat > p_capacity then return null; end if;
  while n <= p_capacity loop
    rem := p_capacity - n + 1;
    if rem <= 5 then return null; end if;
    if p_seat between n and n + 3 then
      return case p_seat - n
        when 0 then n + 1 when 1 then n
        when 2 then n + 3 when 3 then n + 2 end;
    end if;
    n := n + 4;
  end loop;
  return null;
end;
$$;
revoke all on function public.seat_privacy_partner(int,int) from public, anon, authenticated;

/* عدد المقاعد التشغيلي قبل اختيار الكروكي أيضاً: الطلب المنفرد يحجز
   مكانين من السعة منذ إنشائه، لا من لحظة قبول الموظف فقط. */
create or replace function public.booking_operational_seats(p_booking_id text)
returns int language sql stable security definer set search_path = public as $$
  select greatest(coalesce((select persons from public.bookings where id = p_booking_id), 1), 1)
       + case when public.is_solo_female_booking(p_booking_id) then 1 else 0 end;
$$;
revoke all on function public.booking_operational_seats(text) from public, anon, authenticated;

create or replace function public.resync_trip_seats(p_trip_id text) returns void
language sql security definer set search_path = public as $$
  update public.trips t
     set booked_seats = coalesce((
           select sum(public.booking_operational_seats(b.id))
             from public.bookings b
            where b.trip_id = t.id
              and b.status not in ('cancelled','rejected')
         ), 0)
   where t.id = p_trip_id;
$$;

/* حارس مؤجّل: لا يكفي لون الواجهة. أي كتابة مباشرة لا تستطيع حفظ حجز
   أنثى منفردة بمقعد واحد، أو بمقعدين غير متجاورين، أو مقعد خصوصية في
   حجز عادي. نسمح بصفر مقاعد للطلب قبل مرحلة التخصيص. */
create or replace function public.assert_booking_privacy_seats()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_booking text;
  v_persons int;
  v_trip text;
  v_cap int;
  v_status text;
  v_used int;
  v_total int;
  v_passengers int;
  v_privacy int;
  v_passenger_seat int;
  v_privacy_seat int;
begin
  if tg_table_name = 'bookings' then
    v_booking := coalesce(new.id, old.id);
  else
    v_booking := coalesce(new.booking_id, old.booking_id);
  end if;
  select b.persons, b.trip_id, t.seats, b.status
    into v_persons, v_trip, v_cap, v_status
    from public.bookings b left join public.trips t on t.id = b.trip_id
   where b.id = v_booking;
  if not found then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  /* تغيير جنس المعتمر في حجز داخلي قد يجعله أنثى منفردة؛ نعيد احتساب
     السعة هنا أيضاً، لا عند تغيير حالة الحجز فقط. */
  if v_trip is not null then
    select coalesce(sum(public.booking_operational_seats(b.id)), 0) into v_used
      from public.bookings b
     where b.trip_id = v_trip and b.status not in ('cancelled', 'rejected');
    if v_used > coalesce(v_cap, 0) then
      raise exception 'seats_unavailable:المتاح % مقعداً والمطلوب %',
        greatest(coalesce(v_cap, 0) - (v_used - public.booking_operational_seats(v_booking)), 0),
        public.booking_operational_seats(v_booking);
    end if;
    perform public.resync_trip_seats(v_trip);
  end if;

  if v_status in ('cancelled', 'rejected') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  select count(*),
         count(*) filter (where seat_type = 'passenger'),
         count(*) filter (where seat_type = 'privacy'),
         min(seat_no) filter (where seat_type = 'passenger'),
         min(seat_no) filter (where seat_type = 'privacy')
    into v_total, v_passengers, v_privacy, v_passenger_seat, v_privacy_seat
    from public.booking_seats where booking_id = v_booking;

  if v_total = 0 then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if public.is_solo_female_booking(v_booking) then
    if v_passengers <> 1 or v_privacy <> 1
       or public.seat_privacy_partner(v_cap, v_passenger_seat) is distinct from v_privacy_seat then
      raise exception 'privacy_seats: الأنثى المنفردة تحتاج مقعدين متجاورين: مقعدها ومقعد الخصوصية';
    end if;
  elsif v_privacy <> 0 or v_passengers <> greatest(coalesce(v_persons, 1), 1) then
    raise exception 'seat_layout: الحجز يحتاج % مقعد راكب بلا مقعد خصوصية', greatest(coalesce(v_persons, 1), 1);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_booking_privacy_seats_on_seats on public.booking_seats;
create constraint trigger trg_booking_privacy_seats_on_seats
  after insert or update or delete on public.booking_seats
  deferrable initially deferred for each row execute function public.assert_booking_privacy_seats();

drop trigger if exists trg_booking_privacy_seats_on_booking on public.bookings;
create constraint trigger trg_booking_privacy_seats_on_booking
  after update of persons, traveller_counts on public.bookings
  deferrable initially deferred for each row execute function public.assert_booking_privacy_seats();

drop trigger if exists trg_booking_privacy_seats_on_pilgrims on public.booking_pilgrims;
create constraint trigger trg_booking_privacy_seats_on_pilgrims
  after insert or update of gender or delete on public.booking_pilgrims
  deferrable initially deferred for each row execute function public.assert_booking_privacy_seats();

/* قبول الطلب وتخصيص المقاعد في معاملة واحدة. في الحالة الخاصة يختار
   الموظف المقعد أولاً ثم المقعد المجاور؛ ترتيب الاختيار هو المهم. */
create or replace function public.accept_booking(p_id text, p_seats int[])
returns void language plpgsql security definer set search_path = public as $$
declare
  b record;
  cap int;
  used int;
  n_seats int := coalesce(array_length(p_seats, 1), 0);
  taken int;
  v_name text;
  v_solo_female boolean;
  v_expected int;
begin
  if not public.can_write_staff() then raise exception 'forbidden: staff only'; end if;

  select * into b from public.bookings where id = p_id for update;
  if not found then raise exception 'not_found: الطلب غير موجود'; end if;
  if b.status not in ('new','reviewing','needs_edit','accepted') then
    raise exception 'bad_state: الطلب في حالة «%» ولا يُقبل منها', b.status;
  end if;
  if b.trip_id is null then raise exception 'trip_required: الطلب بلا رحلة'; end if;

  v_solo_female := public.is_solo_female_booking(b.id);
  v_expected := greatest(coalesce(b.persons, 1), 1) + case when v_solo_female then 1 else 0 end;
  if n_seats <> v_expected then
    if v_solo_female then
      raise exception 'privacy_seats: الأنثى المنفردة تحتاج مقعدين متجاورين: مقعدها ومقعد الخصوصية';
    end if;
    raise exception 'seats_count: المطلوب % مقعداً والمختار %', b.persons, n_seats;
  end if;
  if (select count(distinct s) from unnest(p_seats) s) <> n_seats then
    raise exception 'seats_dup: مقعدٌ مكرّر في الاختيار';
  end if;

  select seats into cap from public.trips where id = b.trip_id for update;
  if cap is null then raise exception 'trip_not_found: الرحلة غير موجودة'; end if;
  if exists (select 1 from unnest(p_seats) s where s < 1 or s > cap) then
    raise exception 'seat_range: مقعدٌ خارج سعة الرحلة (%)', cap;
  end if;
  if v_solo_female and public.seat_privacy_partner(cap, p_seats[1]) is distinct from p_seats[2] then
    raise exception 'privacy_pair: اختر مقعدين متجاورين؛ الأول للمعتمرة والثاني مفرّغ للخصوصية';
  end if;

  select min(bs.seat_no) into taken
    from public.booking_seats bs
   where bs.trip_id = b.trip_id and bs.is_active
     and bs.seat_no = any(p_seats) and bs.booking_id <> b.id;
  if taken is not null then raise exception 'seat_taken: المقعد % محجوز لطلبٍ آخر', taken; end if;

  select coalesce(sum(public.booking_operational_seats(x.id)), 0) into used
    from public.bookings x
   where x.trip_id = b.trip_id and x.status not in ('cancelled','rejected') and x.id <> b.id;
  if used + v_expected > cap then
    raise exception 'seats_unavailable:المتاح % مقعداً والمطلوب %', greatest(cap - used, 0), v_expected;
  end if;

  delete from public.booking_seats where booking_id = b.id;
  if v_solo_female then
    insert into public.booking_seats(booking_id, seat_no, sort, seat_type)
    values (b.id, p_seats[1], 0, 'passenger');
    insert into public.booking_seats(booking_id, seat_no, sort, seat_type, privacy_for_seat)
    values (b.id, p_seats[2], null, 'privacy', p_seats[1]);
  else
    insert into public.booking_seats(booking_id, seat_no, sort, seat_type)
      select b.id, s, o - 1, 'passenger'
        from unnest(p_seats) with ordinality t(s, o);
  end if;
  update public.booking_pilgrims bp set seat_no = p_seats[bp.sort + 1]
   where bp.booking_id = b.id and bp.sort is not null and bp.sort + 1 <= greatest(coalesce(b.persons, 1), 1);

  update public.bookings set status = 'accepted' where id = b.id;
  select name into v_name from public.profiles where id = auth.uid();
  insert into public.document_events(doc_type, doc_id, event, actor, actor_name, note)
  values ('booking', b.id, 'accept', auth.uid(), v_name,
          case when v_solo_female
            then 'قُبل الطلب وقُفلت المقاعد: ' || p_seats[1] || '؛ فُرّغ المقعد المجاور ' || p_seats[2] || ' للخصوصية'
            else 'قُبل الطلب وقُفلت المقاعد: ' || array_to_string(p_seats, '، ')
          end);
end;
$$;
revoke all on function public.accept_booking(text,int[]) from public, anon;
grant execute on function public.accept_booking(text,int[]) to authenticated;

/* upsert_booking هو مسار التعديل التفاؤلي في اللوحة. نجعله يحتفظ
   بمقعد الخصوصية الذي تقرؤه الواجهة، فلا يمحوه تعديل الاسم أو الجوال. */
alter function public.upsert_booking(jsonb) rename to upsert_booking_privacy_base;
create function public.upsert_booking(doc jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_booking text := doc->>'id';
  v_privacy int;
begin
  perform public.upsert_booking_privacy_base(doc);
  if doc ? 'privacySeats' then
    delete from public.booking_seats where booking_id = v_booking and seat_type = 'privacy';
    select (x)::int into v_privacy
      from jsonb_array_elements_text(coalesce(doc->'privacySeats', '[]'::jsonb)) x
     limit 1;
    if v_privacy is not null then
      insert into public.booking_seats(booking_id, seat_no, sort, seat_type, privacy_for_seat)
      select v_booking, v_privacy, null, 'privacy', seat_no
        from public.booking_seats
       where booking_id = v_booking and seat_type = 'passenger'
       order by sort nulls last limit 1;
    end if;
  end if;
end;
$$;
revoke all on function public.upsert_booking(jsonb) from public, anon;
grant execute on function public.upsert_booking(jsonb) to authenticated;
revoke all on function public.upsert_booking_privacy_base(jsonb) from public, anon, authenticated;

/* طلب العميل يمرّ أولاً بفحص سعة المقعدين عند كونها أنثى منفردة؛ الدالة
   الأساسية القديمة تحجز شخصاً واحداً فقط، لذا لا ننتظر حتى نكتشف العجز
   بعد إنشاء الطلب. */
create or replace function public.create_public_booking(doc jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_trip text := nullif(coalesce(doc, '{}'::jsonb)->>'tripId', '');
  v_people int := greatest(coalesce((doc->>'persons')::int, 1), 1);
  v_counts jsonb := doc->'travellerCounts';
  v_solo boolean := false;
  v_cap int;
  v_used int;
  v_booking_id text;
  v_nights int;
  v_seat_price numeric;
  v_nightly numeric;
  v_room_count int;
  v_total numeric;
  v_stay_total numeric;
begin
  if jsonb_typeof(v_counts) = 'object' then
    v_solo := v_people = 1
      and coalesce((v_counts->>'men')::int, -1) = 0
      and coalesce((v_counts->>'women')::int, -1) = 1
      and coalesce((v_counts->>'children')::int, 0) = 0;
  end if;
  if v_solo and v_trip is not null then
    select seats into v_cap from public.trips where id = v_trip for update;
    select coalesce(sum(public.booking_operational_seats(b.id)), 0) into v_used
      from public.bookings b
     where b.trip_id = v_trip and b.status not in ('cancelled','rejected');
    if v_cap is null then raise exception 'trip_not_found:%', v_trip; end if;
    if v_used + 2 > v_cap then
      raise exception 'insufficient_seats:%', greatest(v_cap - v_used, 0);
    end if;
  end if;

  v_booking_id := public.create_public_booking_detail_snapshot_base(doc);
  /* نفس تثبيت لقطة 20261007، مع الاحتفاظ بغائب children = صفر. */
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
    from public.booking_rooms where booking_id = v_booking_id;
  v_stay_total := v_nightly * v_nights;
  if jsonb_typeof(v_counts) = 'object'
     and coalesce(v_counts->>'men', '') ~ '^\\d+$'
     and coalesce(v_counts->>'women', '') ~ '^\\d+$'
     and coalesce(v_counts->>'children', '0') ~ '^\\d+$'
     and coalesce((v_counts->>'men')::int, 0) + coalesce((v_counts->>'women')::int, 0)
         + coalesce((v_counts->>'children')::int, 0) = v_people then
    update public.bookings set
      traveller_counts = jsonb_build_object(
        'men', (v_counts->>'men')::int, 'women', (v_counts->>'women')::int,
        'children', coalesce((v_counts->>'children')::int, 0)
      ),
      transport_seat_price = case when v_room_count > 0 then v_seat_price end,
      transport_total = case when v_room_count > 0 then v_total - v_stay_total end,
      accommodation_nightly = case when v_room_count > 0 then v_nightly end,
      accommodation_rooms = case when v_room_count > 0 then v_room_count end,
      accommodation_nights = case when v_room_count > 0 then v_nights end,
      accommodation_total = case when v_room_count > 0 then v_stay_total end
    where id = v_booking_id;
  else
    update public.bookings set
      transport_seat_price = case when v_room_count > 0 then v_seat_price end,
      transport_total = case when v_room_count > 0 then v_total - v_stay_total end,
      accommodation_nightly = case when v_room_count > 0 then v_nightly end,
      accommodation_rooms = case when v_room_count > 0 then v_room_count end,
      accommodation_nights = case when v_room_count > 0 then v_nights end,
      accommodation_total = case when v_room_count > 0 then v_stay_total end
    where id = v_booking_id;
  end if;
  return v_booking_id;
end;
$$;
revoke all on function public.create_public_booking(jsonb) from public, anon;
grant execute on function public.create_public_booking(jsonb) to authenticated;
