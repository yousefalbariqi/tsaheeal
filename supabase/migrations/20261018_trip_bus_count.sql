-- 20261018 — باصات الرحلة: نوعٌ وعدد، لا مركبةٌ بعينها
--
-- الموظف يختار عند إطلاق الرحلة نوع الباص («باص تساهيل 2027 · 49 مقعداً»)
-- وعدد باصاته لهذه الرحلة، فتُنشأ «باص ١، باص ٢، باص ٣» تلقائياً وسعة
-- الرحلة مجموعها (١٤٧). العدد رقمٌ داخل الرحلة لا حالةٌ على المركبة:
-- التعارض يُحسب من الرحلات المتداخلة لحظة الحفظ، فلا شيء «يرجع متاحاً»
-- أو «يُصفَّر» حين تنتهي الرحلة. وربط «باص ١» بلوحةٍ بعينها مرحلةٌ لاحقة.
--
-- الترقيم واحدٌ على الرحلة كلها (١…١٤٧) ويُشتقّ الباص منه: ١–٤٩ الأول،
-- ٥٠–٩٨ الثاني. فيبقى كل ما يحرس السعة والازدواج (trips.seats وقيد
-- المقعد الواحد) كما هو، ويتغيّر ما يعرف شكل الباص وحده:
--   ١. حارس الأسطول يجمع باصات الرحلات المتداخلة لا عددها.
--   ٢. شريك مقعد الخصوصية يُطلب داخل الباص نفسه لا عبر حدّه: المقعدان
--      ٤٩ و٥٠ متتاليان رقماً وبينهما باصان.
--   ٣. أرضية مقاعد النوع تُقاس بالباص الواحد لا بالرحلة كلها.
--
-- يعتمد على 20261009 (fleet_count وغلاف upsert_trip) و20261013 (مقعد
-- الخصوصية). دالّتا accept_booking وassert_booking_privacy_seats منسوختان
-- من 20261013 حرفياً، والفرق الوحيد نداء الشريك بعدد الباصات.

-- ═══ (١) العمود ════════════════════════════════════════════════════
alter table public.trips
  add column if not exists bus_count integer not null default 1;
alter table public.trips drop constraint if exists trips_bus_count_chk;
alter table public.trips add constraint trips_bus_count_chk check (bus_count >= 1);

comment on column public.trips.bus_count is
  'عدد باصات الرحلة من نوع المركبة نفسه. seats مجموعها، ومقاعد الباص = seats / bus_count.';

-- ═══ (٢) شريك مقعد الخصوصية داخل الباص ═════════════════════════════
/* الدالّة ذات الوسيطين تبقى كما هي (باصٌ واحد بسعة الرحلة). هذه تقسم
   الرحلة إلى باصاتها، وتسأل الأولى عن الباص الواحد، ثم تعيد الرقم إلى
   ترقيم الرحلة. */
create or replace function public.seat_privacy_partner(p_capacity int, p_seat int, p_buses int)
returns int language plpgsql immutable as $$
declare
  v_buses int := greatest(coalesce(p_buses, 1), 1);
  v_per int;
  v_off int;
  v_partner int;
begin
  if v_buses = 1 then return public.seat_privacy_partner(p_capacity, p_seat); end if;
  if p_capacity is null or p_seat is null or p_seat < 1 then return null; end if;
  v_per := p_capacity / v_buses;
  if v_per < 1 or p_seat > v_per * v_buses then return null; end if;
  v_off := ((p_seat - 1) / v_per) * v_per;
  v_partner := public.seat_privacy_partner(v_per, p_seat - v_off);
  return case when v_partner is null then null else v_partner + v_off end;
end;
$$;
revoke all on function public.seat_privacy_partner(int,int,int) from public, anon, authenticated;

-- ═══ (٣) حارس الأسطول والشكل في upsert_trip ════════════════════════
/* غلافٌ فوق غلاف 20261009. ذاك يعدّ الرحلات المتداخلة ويبقى صحيحاً (كل
   رحلةٍ باصٌ على الأقل، فعدُّها لا يتجاوز مجموع باصاتها)؛ وهذا يجمع
   الباصات. وغياب busCount من المستند (واجهةٌ أقدم) يُبقي عدد الرحلة كما
   هو — لا يُرجعها باصاً واحداً بسعة الجميع. */
/* إعادة التشغيل لا تلفّ الغلاف على نفسه: الإعادة تسمّي هذا الغلاف قاعدةً
   فيستدعي نفسه بلا نهاية. فلا تُعاد التسمية إن وُجدت القاعدة. */
do $$ begin
  if to_regprocedure('public.upsert_trip_bus_count_base(jsonb)') is null then
    alter function public.upsert_trip(jsonb) rename to upsert_trip_bus_count_base;
  end if;
end $$;
revoke all on function public.upsert_trip_bus_count_base(jsonb) from public, anon, authenticated;

create or replace function public.upsert_trip(doc jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_id text := doc->>'id';
  v_buses integer;
  v_seats integer := nullif(doc->>'seats','')::integer;
  v_transport text := nullif(doc->>'transportId','');
  v_status text := coalesce(doc->>'status','');
  v_from text := doc->>'departureDate';
  v_to text := coalesce(nullif(doc->>'returnDate',''), doc->>'departureDate');
  v_fleet integer;
  v_used integer;
  v_top integer;
begin
  if not public.can_write_staff() then raise exception 'forbidden'; end if;
  v_buses := greatest(coalesce(
    nullif(doc->>'busCount','')::integer,
    (select bus_count from public.trips where id = v_id),
    1), 1);

  if v_buses > 1 and v_seats is not null and v_seats % v_buses <> 0 then
    raise exception 'bus_seats: سعة الرحلة (%) لا تنقسم على % باصات بالتساوي', v_seats, v_buses;
  end if;

  -- الملغاة والمؤرشفة لا تشغل باصاً، فإلغاؤها لا يُحرس.
  if v_transport is not null and v_status not in ('cancelled','archived') then
    select greatest(coalesce(fleet_count,1),1) into v_fleet from public.transports where id = v_transport;
    select coalesce(sum(greatest(coalesce(t.bus_count,1),1)), 0) into v_used
      from public.trips t
     where t.transport_id = v_transport and t.id <> coalesce(v_id,'')
       and t.status not in ('cancelled','archived')
       and t.departure_date <= v_to and coalesce(nullif(t.return_date,''),t.departure_date) >= v_from;
    if v_used + v_buses > coalesce(v_fleet, 1) then
      raise exception 'fleet_unavailable: المتاح من هذا النوع في تواريخ الرحلة % باص والمطلوب %',
        greatest(coalesce(v_fleet,1) - v_used, 0), v_buses;
    end if;
  end if;

  -- لا تنزل سعة الرحلة تحت مقعدٍ مخصَّص: إنقاص الباصات لا يُسقط ركّاب آخرها.
  if v_seats is not null and v_id is not null then
    select max(bs.seat_no) into v_top
      from public.booking_seats bs join public.bookings b on b.id = bs.booking_id
     where b.trip_id = v_id and bs.is_active and bs.seat_no is not null
       and b.status not in ('cancelled','rejected');
    if v_top is not null and v_top > v_seats then
      raise exception 'bus_in_use: المقعد % مخصَّص خارج السعة الجديدة (%) — انقل ركّاب الباص الأخير أولاً', v_top, v_seats;
    end if;
  end if;

  perform public.upsert_trip_bus_count_base(doc);
  update public.trips set bus_count = v_buses where id = v_id and bus_count is distinct from v_buses;
end $$;

revoke all on function public.upsert_trip(jsonb) from public, anon;
grant execute on function public.upsert_trip(jsonb) to authenticated;

-- ═══ (٣ب) حارس التعارض على الجدول بعدد الباصات ═════════════════════
/* trg_guard_trip_vehicle_conflict (20260912) يرفض أي رحلتين متداخلتين على
   المركبة نفسها، ولم يُعدَّل حين صار السجل نوعاً بعدد (20261009): فحيث
   طُبّق الاثنان لا تُطلق رحلةٌ ثانية متداخلة ولو بقي من النوع خمسة باصات.
   هنا يُسأل السؤال الصحيح: مجموع باصات المتداخلة وباصات هذه ≤ عدد النوع.

   والتعديل يُحرس كذلك حين تتغيّر الباصات وحدها: الغلاف يُدرج الرحلة
   بباصٍ واحد (القيمة الافتراضية) ثم يكتب عددها، فبلا هذا الشرط يمرّ
   العدد الحقيقي بلا فحص. لا يُنشأ القادح هنا — ينشئه 20260912؛ وحيث لم
   يُطبَّق يحرس الغلاف أعلاه وحده. */
create or replace function public.guard_trip_vehicle_conflict() returns trigger
language plpgsql set search_path = public as $$
declare
  v_dep date; v_ret date;
  v_fleet int; v_used int;
  c record;
begin
  if new.transport_id is null then return new; end if;
  if coalesce(new.status,'') in ('cancelled','archived') then return new; end if;
  if new.archived_at is not null then return new; end if;
  if coalesce(new.departure_date,'') !~ '^\d{4}-\d{2}-\d{2}$' then return new; end if;

  if tg_op = 'UPDATE'
     and new.transport_id   is not distinct from old.transport_id
     and new.departure_date is not distinct from old.departure_date
     and new.return_date    is not distinct from old.return_date
     and new.status         is not distinct from old.status
     and new.archived_at    is not distinct from old.archived_at
     and new.bus_count      is not distinct from old.bus_count then
    return new;
  end if;

  v_dep := new.departure_date::date;
  v_ret := case when coalesce(new.return_date,'') ~ '^\d{4}-\d{2}-\d{2}$'
                then greatest(new.return_date::date, v_dep) else v_dep end;

  select greatest(coalesce(fleet_count,1),1) into v_fleet from public.transports where id = new.transport_id;

  select coalesce(sum(greatest(coalesce(t.bus_count,1),1)), 0) into v_used
    from public.trips t
   where t.transport_id = new.transport_id
     and t.id <> new.id
     and coalesce(t.status,'') not in ('cancelled','archived')
     and t.archived_at is null
     and coalesce(t.departure_date,'') ~ '^\d{4}-\d{2}-\d{2}$'
     and daterange(
           t.departure_date::date,
           case when coalesce(t.return_date,'') ~ '^\d{4}-\d{2}-\d{2}$'
                then greatest(t.return_date::date, t.departure_date::date)
                else t.departure_date::date end,
           '[]')
         && daterange(v_dep, v_ret, '[]');

  if v_used + greatest(coalesce(new.bus_count,1),1) <= coalesce(v_fleet,1) then return new; end if;

  select t.id, t.departure_date,
         case when coalesce(t.return_date,'') ~ '^\d{4}-\d{2}-\d{2}$'
              and t.return_date::date >= t.departure_date::date
              then t.return_date else t.departure_date end as return_date
    into c
    from public.trips t
   where t.transport_id = new.transport_id
     and t.id <> new.id
     and coalesce(t.status,'') not in ('cancelled','archived')
     and t.archived_at is null
     and coalesce(t.departure_date,'') ~ '^\d{4}-\d{2}-\d{2}$'
     and daterange(
           t.departure_date::date,
           case when coalesce(t.return_date,'') ~ '^\d{4}-\d{2}-\d{2}$'
                then greatest(t.return_date::date, t.departure_date::date)
                else t.departure_date::date end,
           '[]')
         && daterange(v_dep, v_ret, '[]')
   order by t.departure_date
   limit 1;

  raise exception 'vehicle_conflict: باصات هذا النوع (%) مشغولة في رحلاتٍ متداخلة، منها % (% → %)',
    coalesce(v_fleet,1), c.id, c.departure_date, c.return_date;
end $$;

-- ═══ (٤) مقعد الخصوصية — الحارس والقبول بعدد الباصات ═══════════════
create or replace function public.assert_booking_privacy_seats()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_booking text;
  v_persons int;
  v_trip text;
  v_cap int;
  v_buses int;
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
  select b.persons, b.trip_id, t.seats, coalesce(t.bus_count, 1), b.status
    into v_persons, v_trip, v_cap, v_buses, v_status
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
       or public.seat_privacy_partner(v_cap, v_passenger_seat, v_buses) is distinct from v_privacy_seat then
      raise exception 'privacy_seats: الأنثى المنفردة تحتاج مقعدين متجاورين: مقعدها ومقعد الخصوصية';
    end if;
  elsif v_privacy <> 0 or v_passengers <> greatest(coalesce(v_persons, 1), 1) then
    raise exception 'seat_layout: الحجز يحتاج % مقعد راكب بلا مقعد خصوصية', greatest(coalesce(v_persons, 1), 1);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.accept_booking(p_id text, p_seats int[])
returns void language plpgsql security definer set search_path = public as $$
declare
  b record;
  cap int;
  v_buses int;
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

  select seats, coalesce(bus_count, 1) into cap, v_buses from public.trips where id = b.trip_id for update;
  if cap is null then raise exception 'trip_not_found: الرحلة غير موجودة'; end if;
  if exists (select 1 from unnest(p_seats) s where s < 1 or s > cap) then
    raise exception 'seat_range: مقعدٌ خارج سعة الرحلة (%)', cap;
  end if;
  if v_solo_female and public.seat_privacy_partner(cap, p_seats[1], v_buses) is distinct from p_seats[2] then
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

-- ═══ (٥) أرضية مقاعد النوع بالباص الواحد ══════════════════════════
/* رحلةٌ بثلاثة باصات و٦٠ محجوزاً تحتاج من النوع باصاً من ٢٠ مقعداً، لا
   من ٦٠. نسخة 20260908 والفرق القسمة على bus_count. */
create or replace function public.guard_transport_seats() returns trigger
language plpgsql set search_path = public as $$
declare floor_seats int;
begin
  if new.seats is not distinct from old.seats then return new; end if;
  /* الرحلات المنتهية والملغاة مستثناة: مقاعدها لم تعد تُحجَز، وإبقاؤها
     في الحساب يقفل سعة المركبة على رقمٍ من الماضي إلى الأبد. */
  select max(ceil(coalesce(t.booked_seats,0)::numeric / greatest(coalesce(t.bus_count,1),1)))::int into floor_seats
  from public.trips t
  where t.transport_id = new.id
    and t.status not in ('cancelled','archived')
    and coalesce(nullif(t.return_date,''), nullif(t.departure_date,''), '9999-12-31') >= to_char(now(), 'YYYY-MM-DD');
  if floor_seats is not null and new.seats < floor_seats then
    raise exception 'لا يمكن تخفيض السعة إلى % — يوجد % مقعداً محجوزاً في باصٍ من رحلة قائمة.', new.seats, floor_seats
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

insert into public.schema_migrations(version, note)
values ('20261018_trip_bus_count', 'نوع الباص وعدد باصات الرحلة: باص ١ ثم ٢ ثم ٣ بسعةٍ واحدة')
on conflict (version) do nothing;
