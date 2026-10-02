-- ════════════════════════════════════════════════════════════════════
-- 20261020 — MON-02: السعر ووصف السكن يملكانهما الخادم
--
-- المتصفح يختار فئة غرفة وعدد الغرف فقط. لا يملك سعر الغرفة ولا نوعها
-- ولا سعتها ولا الباقة التي تُنسب إليها العملية. النسخ السابقة أبقت
-- fallback لـ perNight وtotal من المستند «للتوافق»، فصار ممكناً اصطناع
-- فئة غير موجودة أو سعر سالب. هذا الترحيل يزيل تلك الفروع تماماً.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.compute_booking_total(p_trip_id text, p_persons int, p_rooms jsonb)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  v_pkg          text;
  v_price        numeric;
  v_market       numeric;
  v_transport    text;
  v_override     numeric;
  v_nights       int;
  v_seat_price   numeric;
  v_room_price   numeric;
  v_has_tiers    boolean;
  v_sum          numeric := 0;
  v_tier_id      text;
  r              record;
  n              int := greatest(coalesce(p_persons, 1), 1);
begin
  select t.package_id, t.price, p.market_price,
         coalesce(nullif(t.transport_id, ''), nullif(p.transport_id, '')),
         p.seat_cost_override, greatest(coalesce(p.nights, 1), 1)
    into v_pkg, v_price, v_market, v_transport, v_override, v_nights
    from public.trips t
    join public.packages p on p.id = t.package_id
   where t.id = p_trip_id;

  if not found then raise exception 'trip_not_found'; end if;

  select exists(
    select 1 from public.package_room_prices rp where rp.package_id = v_pkg
  ) into v_has_tiers;

  -- إن كانت الباقة تبيع سكناً، فلا يصلح الرجوع إلى سعر الباقة المعلن:
  -- يجب أن يختار العميل فئةً حقيقية كي يكون التسعير والفاتورة واضحين.
  if p_rooms is null or jsonb_typeof(p_rooms) <> 'array' then
    if v_has_tiers then raise exception 'room_required'; end if;
    return round(coalesce(nullif(v_price, 0), v_market, 0) * n, 2);
  end if;
  if jsonb_array_length(p_rooms) = 0 then
    if v_has_tiers then raise exception 'room_required'; end if;
    return round(coalesce(nullif(v_price, 0), v_market, 0) * n, 2);
  end if;

  v_seat_price := coalesce(
    v_override,
    (select tr.seat_cost from public.transports tr where tr.id = v_transport),
    0
  );
  if v_seat_price < 0 then raise exception 'price_unavailable'; end if;

  for r in
    select e.value as room
      from jsonb_array_elements(p_rooms) e
  loop
    v_tier_id := nullif(r.room->>'tierId', '');
    if v_tier_id is null then raise exception 'unknown_room_tier'; end if;

    -- لا fallback إلى perNight المرسل من المتصفح: الفئة لا بد أن تكون
    -- من باقة الرحلة نفسها، وسعرها لا يُقرأ إلا من الكتالوج.
    select rp.per_night into v_room_price
      from public.package_room_prices rp
     where rp.package_id = v_pkg and rp.item_id = v_tier_id;
    if not found then raise exception 'unknown_room_tier:%', v_tier_id; end if;
    if v_room_price is null or v_room_price <= 0 then
      raise exception 'price_unavailable';
    end if;
    v_sum := v_sum + v_room_price;
  end loop;

  return round(v_sum * v_nights + n * v_seat_price, 2);
end $$;

revoke all on function public.compute_booking_total(text, int, jsonb) from public;
grant execute on function public.compute_booking_total(text, int, jsonb) to authenticated, anon;

/* هذه هي طبقة الإدراج الداخلية التي تمر عبرها أغلفة مالك الحجز، توزيع
   المسافرين، ومقعد الخصوصية. نعيد تعريفها ولا نغيّر أسماء الأغلفة حتى
   لا نفقد أي حارس أضيف بعدها. */
create or replace function public.create_public_booking_base(doc jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v             text := coalesce(nullif(doc->>'id', ''), 'TRB-' || upper(substr(md5(random()::text), 1, 5)));
  tid           text := nullif(doc->>'tripId', '');
  n             int := greatest(coalesce((doc->>'persons')::int, 1), 1);
  avail         int;
  v_pkg         text;
  v_uid         uuid := auth.uid();
  v_ph          text := public.auth_phone();
  v_total       numeric;
  v_room_type   text;
begin
  doc := coalesce(doc, '{}'::jsonb);
  if tid is null then raise exception 'trip_required'; end if;
  if v_uid is null then raise exception 'auth_required'; end if;
  if v_ph is null then raise exception 'phone_unverified'; end if;
  perform public.customer_bootstrap();

  -- الباقة مرجع تابع للرحلة، وليست حقلاً يحق للعميل اختياره.
  select t.seats - t.booked_seats, t.package_id
    into avail, v_pkg
    from public.trips t
   where t.id = tid
   for update;
  if not found then raise exception 'trip_not_found'; end if;
  if v_pkg is null or v_pkg = '' then raise exception 'trip_package_missing'; end if;
  if n > avail then raise exception 'insufficient_seats:%', avail; end if;

  v_total := public.compute_booking_total(tid, n, doc->'rooms');
  if v_total is null or v_total <= 0 then raise exception 'price_unavailable'; end if;

  -- ننشئ الوصف من صفوف الكتالوج نفسها، لا من type/persons في المستند.
  select string_agg(format('%s · %s', rp.type, rp.persons), ' + ' order by x.ord)
    into v_room_type
    from jsonb_array_elements(coalesce(doc->'rooms', '[]'::jsonb)) with ordinality x(room, ord)
    join public.package_room_prices rp
      on rp.package_id = v_pkg and rp.item_id = nullif(x.room->>'tierId', '');

  insert into public.bookings(
    id, trip_id, package_id, client_name, client_phone, customer_id, room_type, persons, total,
    status, payment_status, created_at, submitted_at, staff, source, sent_date
  ) values (
    v, tid, v_pkg, doc->>'clientName', public.local_phone(v_ph), v_uid, coalesce(v_room_type, ''), n, v_total,
    'reviewing', 'none', to_char(now(), 'YYYY-MM-DD'), now(), '', 'public', null
  );

  insert into public.booking_pilgrims(booking_id,name,doc_type,id_number,nationality,gender,age_group,birth_date,phone,seat_no,sort)
    select v,e->>'name',nullif(e->>'docType',''),e->>'idNumber',e->>'nationality',e->>'gender',nullif(e->>'ageGroup',''),e->>'birthDate',e->>'phone',nullif(e->>'seat','')::int,(o-1)::int
      from jsonb_array_elements(coalesce(doc->'pilgrims','[]')) with ordinality t(e,o);

  insert into public.booking_seats(booking_id,seat_no,sort)
    select v,(e)::int,(o-1)::int
      from jsonb_array_elements_text(coalesce(doc->'seats','[]')) with ordinality t(e,o);

  -- لقطة الفاتورة والسكن مصدرها الفئة المعتمدة حصراً؛ يحق للعميل تكرار
  -- الفئة لطلب غرف إضافية، لكنه لا يختار السعر أو السعة أو التسمية.
  insert into public.booking_rooms(booking_id,tier_id,type,persons,per_night,sort)
    select v, rp.item_id, rp.type, rp.persons, rp.per_night, (x.ord - 1)::int
      from jsonb_array_elements(coalesce(doc->'rooms', '[]'::jsonb)) with ordinality x(room, ord)
      join public.package_room_prices rp
        on rp.package_id = v_pkg and rp.item_id = nullif(x.room->>'tierId', '');

  return v;
end $$;

revoke all on function public.create_public_booking_base(jsonb) from public, anon, authenticated;

comment on function public.compute_booking_total(text, int, jsonb) is
  'MON-02: يحسب السعر من الكتالوج فقط؛ قيم المتصفح لا تدخل في السعر.';
comment on function public.create_public_booking_base(jsonb) is
  'MON-02: يحفظ باقة وفئات وأسعار الغرف المعتمدة من الخادم فقط.';

insert into public.schema_migrations(version, note)
values ('20261020_server_owned_booking_price', 'MON-02: تثبيت سعر وفئة السكن والباقة من الخادم ومنع fallback المتصفح')
on conflict (version) do nothing;
