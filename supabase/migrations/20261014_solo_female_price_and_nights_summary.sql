-- 20261014 — مقعد الخصوصية مدفوع، وملخص السكن يعرض كل الليالي
--
-- مقعد الخصوصية ليس هبةً مجانية: الأنثى المنفردة تدفع مقعد النقل الثاني.
-- السكن لا يتأثر بالقرار؛ يبقى سعر الغرفة × عدد الليالي.

alter table public.bookings
  add column if not exists privacy_seat_fee numeric not null default 0;

comment on column public.bookings.privacy_seat_fee is
  'لقطة سعر مقعد الخصوصية للأنثى المنفردة؛ يضاف إلى النقل لا إلى السكن.';

create or replace function public.privacy_seat_fee(p_booking_id text)
returns numeric language sql stable security definer set search_path = public as $$
  select case when public.is_solo_female_booking(p_booking_id) then coalesce((
    select coalesce(p.seat_cost_override, tr.seat_cost, 0)
      from public.bookings b
      join public.trips t on t.id = b.trip_id
      join public.packages p on p.id = t.package_id
      left join public.transports tr on tr.id = coalesce(nullif(t.transport_id, ''), nullif(p.transport_id, ''))
     where b.id = p_booking_id
  ), 0) else 0 end;
$$;
revoke all on function public.privacy_seat_fee(text) from public, anon, authenticated;

/* 20261013 يحرس السعة ويثبت لقطة السعر الأساسية. نغلفه لإضافة المقعد
   المدفوع بعد أن تُحفظ traveller_counts، فهي التي تحدد الأنثى المنفردة. */
alter function public.create_public_booking(jsonb)
  rename to create_public_booking_privacy_capacity_base;

create function public.create_public_booking(doc jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare v_booking text; v_fee numeric;
begin
  v_booking := public.create_public_booking_privacy_capacity_base(doc);
  v_fee := public.privacy_seat_fee(v_booking);
  if v_fee > 0 then
    update public.bookings
       set total = round(coalesce(total, 0) + v_fee, 2),
           privacy_seat_fee = v_fee,
           transport_total = case when transport_total is not null
                                  then round(transport_total + v_fee, 2) end
     where id = v_booking;
  end if;
  return v_booking;
end;
$$;
revoke all on function public.create_public_booking(jsonb) from public, anon;
grant execute on function public.create_public_booking(jsonb) to authenticated;
revoke all on function public.create_public_booking_privacy_capacity_base(jsonb)
  from public, anon, authenticated;

/* تعديل الموظف لا يفقد الرسوم ولا يضيفها مرتين. إذا تغير جنس المسافر
   وحده نضيف/نزيل الفرق؛ وإذا أعاد المسار الأساسي حساب السعر نضيف الرسم
   الجديد مرة واحدة فقط. */
alter function public.upsert_booking(jsonb)
  rename to upsert_booking_privacy_fee_base;

create function public.upsert_booking(doc jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_id text := doc->>'id';
  v_before public.bookings%rowtype;
  v_after public.bookings%rowtype;
  v_fee numeric := 0;
  v_delta numeric := 0;
  v_recalculated boolean := false;
  v_rooms_changed boolean := false;
  v_rooms jsonb := case when doc ? 'rooms' then coalesce(doc->'rooms', '[]'::jsonb) else null end;
begin
  select * into v_before from public.bookings where id = v_id;
  if v_rooms is not null then
    v_rooms_changed := public.rooms_json_sig(v_rooms) <> public.booking_rooms_sig(v_id);
  end if;
  perform public.upsert_booking_privacy_fee_base(doc);
  select * into v_after from public.bookings where id = v_id;
  if not found then return; end if;

  v_fee := public.privacy_seat_fee(v_id);
  v_recalculated := v_before.id is null
    or v_before.trip_id is distinct from v_after.trip_id
    or v_before.persons is distinct from v_after.persons
    or v_rooms_changed;
  if v_recalculated then
    v_delta := v_fee;
  else
    v_delta := v_fee - coalesce(v_before.privacy_seat_fee, 0);
  end if;

  if v_delta <> 0 or coalesce(v_after.privacy_seat_fee, 0) <> v_fee then
    update public.bookings
       set total = round(coalesce(v_after.total, 0) + v_delta * (1 - coalesce(v_after.discount_percent, 0) / 100.0), 2),
           privacy_seat_fee = v_fee
     where id = v_id;
  end if;
end;
$$;
revoke all on function public.upsert_booking(jsonb) from public, anon;
grant execute on function public.upsert_booking(jsonb) to authenticated;
revoke all on function public.upsert_booking_privacy_fee_base(jsonb)
  from public, anon, authenticated;

/* الخصم يحسب من إجمالي النقل والسكن الحقيقيين، بما فيه مقعد الخصوصية. */
create or replace function public.apply_booking_discount(p_id text, p_percent numeric, p_reason text)
returns numeric language plpgsql security definer set search_path = public as $$
declare b record; v_base numeric; v_total numeric; v_name text; v_inv text;
begin
  if not public.can_write_admin() then raise exception 'forbidden: admin only'; end if;
  if p_percent is null or p_percent < 0 or p_percent > 100 then raise exception 'bad_percent: النسبة بين 0 و100'; end if;
  if p_percent > 0 and coalesce(trim(p_reason),'') = '' then raise exception 'reason_required: سبب الخصم إلزامي'; end if;

  select * into b from public.bookings where id = p_id for update;
  if not found then raise exception 'not_found: الطلب غير موجود'; end if;
  if b.payment_status = 'verified' then raise exception 'already_paid: الطلب مدفوع — الخصم بعد التحصيل استرجاعٌ لا خصم'; end if;

  v_base := public.compute_booking_total(b.trip_id, b.persons,
              (select coalesce(jsonb_agg(jsonb_build_object('tierId', br.tier_id, 'type', br.type,
                       'persons', br.persons, 'perNight', br.per_night) order by br.sort), '[]'::jsonb)
                 from public.booking_rooms br where br.booking_id = b.id))
            + coalesce(b.privacy_seat_fee, 0);
  if v_base <= 0 then
    v_base := case when coalesce(b.discount_percent,0) > 0 and coalesce(b.discount_percent,0) < 100
                   then round(coalesce(b.total,0) / (1 - b.discount_percent/100.0), 2)
                   else coalesce(b.total,0) end;
  end if;
  v_total := round(v_base * (1 - p_percent/100.0), 2);

  update public.bookings set total = v_total,
    discount_percent = case when p_percent > 0 then p_percent else null end,
    discount_reason = case when p_percent > 0 then trim(p_reason) else null end,
    discount_by = case when p_percent > 0 then auth.uid() else null end,
    discount_at = case when p_percent > 0 then now() else null end
   where id = b.id;

  select id into v_inv from public.payments where booking_id = b.id and state = 'issued' and pay_status <> 'verified' limit 1;
  if v_inv is not null then
    update public.payments set total = v_total where id = v_inv;
    perform public.rebuild_payment_items(v_inv);
  end if;

  select name into v_name from public.profiles where id = auth.uid();
  insert into public.document_events(doc_type,doc_id,event,actor,actor_name,note)
  values ('booking', b.id, 'discount', auth.uid(), v_name,
          case when p_percent > 0 then format('خصم %s%% — %s. الإجمالي %s ← %s', p_percent, trim(p_reason), v_base, v_total)
               else format('أُلغي الخصم. الإجمالي %s', v_total) end);
  return v_total;
end;
$$;
revoke all on function public.apply_booking_discount(text,numeric,text) from public, anon;
grant execute on function public.apply_booking_discount(text,numeric,text) to authenticated;
