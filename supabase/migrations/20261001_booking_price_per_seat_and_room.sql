-- ════════════════════════════════════════════════════════════════════
-- 20261001 — تسعير الباقة: مقعد لكل معتمر + غرف ليلية مستقلة
--
-- لا نثق بمبلغ المتصفح. هذا هو المصدر الملزم للحجوزات العامة والداخلية:
--   المواصلات = سعر المقعد × عدد الأشخاص
--   السكن      = سعر الليلة × عدد الغرف × عدد الليالي
--   الإجمالي  = المواصلات + السكن
-- ════════════════════════════════════════════════════════════════════

create or replace function public.compute_booking_total(p_trip_id text, p_persons int, p_rooms jsonb)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  v_pkg        text;
  v_price      numeric;
  v_market     numeric;
  v_transport  text;
  v_override   numeric;
  v_nights     int;
  v_seat_price numeric := null;
  v_room_price numeric;
  v_sum        numeric := 0;
  r            record;
  n            int := greatest(coalesce(p_persons, 1), 1);
begin
  select t.package_id, t.price, p.market_price,
         coalesce(nullif(t.transport_id, ''), nullif(p.transport_id, '')),
         p.seat_cost_override, greatest(coalesce(p.nights, 1), 1)
    into v_pkg, v_price, v_market, v_transport, v_override, v_nights
    from public.trips t
    join public.packages p on p.id = t.package_id
   where t.id = p_trip_id;

  if p_rooms is not null and jsonb_typeof(p_rooms) = 'array' and jsonb_array_length(p_rooms) > 0 then
    for r in
      select nullif(e->>'tierId', '') as tier_id,
             (e->>'perNight')::numeric as room_price
        from jsonb_array_elements(p_rooms) e
    loop
      -- السعر المحفوظ في صف الباقة هو المعتمد؛ قيمة الطلب مجرد توافقٍ
      -- للحجوزات القديمة التي لم يكن لها tier_id.
      select rp.per_night
        into v_room_price
        from public.package_room_prices rp
       where rp.package_id = v_pkg and rp.item_id = r.tier_id
       limit 1;
      -- كل صف يمثل غرفة واحدة. يكرّر العميل الصف للغرف الإضافية، فلا
      -- نربط العدد بسعة الغرفة أو عدد المسافرين.
      v_sum := v_sum + coalesce(v_room_price, r.room_price, 0);

      -- سعر المقعد يختار مرة من فئة الغرفة ثم من إعداد الباقة/المواصلة.
      if v_seat_price is null then
        select rp.seat_cost
          into v_seat_price
          from public.package_room_prices rp
         where rp.package_id = v_pkg and rp.item_id = r.tier_id
         limit 1;
        v_seat_price := coalesce(
          v_seat_price,
          v_override,
          (select seat_cost from public.transports where id = v_transport),
          0
        );
      end if;
    end loop;
    return round(v_sum * v_nights + n * coalesce(v_seat_price, 0), 2);
  end if;

  -- رحلات وحجوزات قديمة بلا غرفة مختارة تبقى على تسعيرها الاحتياطي.
  return round(coalesce(nullif(v_price, 0), v_market, 0) * n, 2);
end $$;

revoke all on function public.compute_booking_total(text, int, jsonb) from public;
grant execute on function public.compute_booking_total(text, int, jsonb) to authenticated, anon;

-- الفاتورة تشرح السعر نفسه: ليالٍ للغرف ثم المواصلات. مقدار النقل هو
-- الفرق المتبقي من إجمالي الحجز، لذلك يبقى مطابقاً للإجمالي حتى مع خصمٍ
-- أو حجزٍ قديم لا يحمل لقطةً لسعر المقعد.
create or replace function public.rebuild_payment_items(p_payment_id text)
returns void language plpgsql security definer set search_path = public as $$
declare
  pm        record;
  v_nights  int;
  v_sum     numeric := 0;
  v_diff    numeric;
  r         record;
  i         int := 0;
begin
  select * into pm from payments where id = p_payment_id;
  if not found then return; end if;

  delete from payment_items where payment_id = p_payment_id;

  select greatest(coalesce(p.nights, 1), 1) into v_nights
    from bookings b
    left join trips t on t.id = b.trip_id
    left join packages p on p.id = coalesce(nullif(b.package_id, ''), t.package_id)
   where b.id = pm.booking_id;

  for r in
    select br.type, br.per_night
      from booking_rooms br
     where br.booking_id = pm.booking_id
     order by br.sort nulls last, br.id
  loop
    i := i + 1;
    insert into payment_items(payment_id, kind, label, qty, unit_price, amount, sort)
    values (p_payment_id, 'accommodation', format('%s — غرفة واحدة × %s ليلة', r.type, v_nights),
            v_nights, r.per_night, round(coalesce(r.per_night, 0) * v_nights, 2), i);
    v_sum := v_sum + round(coalesce(r.per_night, 0) * v_nights, 2);
  end loop;

  v_diff := round(coalesce(pm.total, 0) - v_sum, 2);

  if i = 0 then
    insert into payment_items(payment_id, kind, label, amount, sort)
    values (p_payment_id, 'accommodation', coalesce(nullif(pm.package_name, ''), 'باقة العمرة'), coalesce(pm.total, 0), 1);
  elsif v_diff > 0 then
    insert into payment_items(payment_id, kind, label, amount, sort)
    values (p_payment_id, 'transport', 'المواصلات', v_diff, i + 1);
  elsif v_diff < 0 then
    insert into payment_items(payment_id, kind, label, amount, sort)
    values (p_payment_id, 'discount', 'خصم', v_diff, i + 1);
  end if;
end $$;

-- لم يعد عدد الغرف دليلاً على عدد المسافرين: العميل يحدد الغرف المناسبة
-- له، ولا يوزع النظام الأشخاص عليها. نبقي بقية حراس الحجز (الهوية
-- والمقاعد والسعر المحسوب في القاعدة) كما هي.
create or replace function public.create_public_booking_base(doc jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v        text := coalesce(nullif(doc->>'id', ''), 'TRB-' || upper(substr(md5(random()::text), 1, 5)));
  tid      text := nullif(doc->>'tripId', '');
  n        int := greatest(coalesce((doc->>'persons')::int, 1), 1);
  avail    int;
  v_uid    uuid := auth.uid();
  v_ph     text := public.auth_phone();
  v_total  numeric;
  v_client numeric := nullif(doc->>'total', '')::numeric;
begin
  if tid is null then raise exception 'trip_required'; end if;
  if v_uid is null then raise exception 'auth_required'; end if;
  if v_ph is null then raise exception 'phone_unverified'; end if;
  perform public.customer_bootstrap();

  select (seats - booked_seats) into avail from public.trips where id = tid for update;
  if avail is null then raise exception 'trip_not_found'; end if;
  if n > avail then raise exception 'insufficient_seats:%', avail; end if;

  v_total := public.compute_booking_total(tid, n, doc->'rooms');
  if v_total <= 0 then v_total := coalesce(v_client, 0); end if;

  insert into public.bookings(id,trip_id,package_id,client_name,client_phone,customer_id,room_type,persons,total,
    status,payment_status,created_at,submitted_at,staff,source,sent_date)
  values(v,tid,nullif(doc->>'packageId',''),doc->>'clientName',public.local_phone(v_ph),v_uid,
    doc->>'roomType',n,v_total,'reviewing','none',to_char(now(),'YYYY-MM-DD'),now(),'','public',null);

  insert into public.booking_pilgrims(booking_id,name,doc_type,id_number,nationality,gender,age_group,birth_date,phone,seat_no,sort)
    select v,e->>'name',nullif(e->>'docType',''),e->>'idNumber',e->>'nationality',e->>'gender',nullif(e->>'ageGroup',''),e->>'birthDate',e->>'phone',nullif(e->>'seat','')::int,(o-1)::int
      from jsonb_array_elements(coalesce(doc->'pilgrims','[]')) with ordinality t(e,o);
  insert into public.booking_seats(booking_id,seat_no,sort)
    select v,(e)::int,(o-1)::int from jsonb_array_elements_text(coalesce(doc->'seats','[]')) with ordinality t(e,o);
  insert into public.booking_rooms(booking_id,tier_id,type,persons,per_night,sort)
    select v,nullif(e->>'tierId',''),e->>'type',(e->>'persons')::int,(e->>'perNight')::numeric,(o-1)::int
      from jsonb_array_elements(coalesce(doc->'rooms','[]')) with ordinality t(e,o);

  if v_client is not null and abs(v_client - v_total) >= 0.5 then
    insert into public.document_events(doc_type,doc_id,event,actor,actor_name,note)
    values ('booking', v, 'price_adjusted', null, 'النظام',
            format('المتصفح أرسل %s والقاعدة حسبت %s — اعتُمد حساب القاعدة', v_client, v_total));
  end if;
  return v;
end $$;

revoke all on function public.create_public_booking_base(jsonb) from public, anon, authenticated;
