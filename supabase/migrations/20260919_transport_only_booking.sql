-- ════════════════════════════════════════════════════════════════════
-- 20260919 — بيع «مواصلات فقط» من الباقة نفسها
--
-- السعر هنا سعر بيع للفرد، مستقل تماماً عن transport.seat_cost الذي هو
-- تكلفة تشغيلية داخلية. لا يُفرض على الباقة: الخيار اختياري، لكن إن فُعّل
-- فلا يُقبل سعر صفري عند إنشاء الحجز العام.
-- ════════════════════════════════════════════════════════════════════

alter table public.packages
  add column if not exists transport_only_enabled boolean not null default false,
  add column if not exists transport_only_price numeric;

alter table public.packages drop constraint if exists packages_transport_only_price_check;
alter table public.packages add constraint packages_transport_only_price_check
  check (transport_only_price is null or transport_only_price >= 0);

-- تبقى الدالة السابقة مصدر حفظ الحقول والعلاقات التابعة. نغلفها فقط كي
-- لا تُنسى الحقول الجديدة عند إعادة تعريفها الطويلة في ترحيلات سابقة.
alter function public.upsert_package(jsonb) rename to upsert_package_base;

create function public.upsert_package(doc jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.upsert_package_base(doc);
  update public.packages
     set transport_only_enabled = coalesce((doc->>'transportOnlyEnabled')::boolean, false),
         transport_only_price = case
           when coalesce((doc->>'transportOnlyEnabled')::boolean, false)
             then nullif(doc->>'transportOnlyPrice','')::numeric
           else null
         end
   where id = doc->>'id';
end $$;

revoke all on function public.upsert_package(jsonb) from public;
grant execute on function public.upsert_package(jsonb) to authenticated;

-- لا نثق بإجمالي المتصفح: نتحقق من تفعيل الخيار وسعره عند إنشاء الحجز،
-- ثم نمرّر الإجمالي المعتمد إلى الدالة السابقة التي تحجز المقاعد ذرّياً.
alter function public.create_public_booking(jsonb) rename to create_public_booking_base;

create function public.create_public_booking(doc jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_trip text := nullif(doc->>'tripId','');
  v_n int := greatest(coalesce((doc->>'persons')::int, 1), 1);
  v_enabled boolean;
  v_price numeric;
  v_total numeric;
  v_nights int;
  v_booking_id text;
begin
  if coalesce(doc->>'bookingMode','full_package') = 'transport_only' then
    select p.transport_only_enabled, p.transport_only_price, greatest(coalesce(p.nights, 1), 1)
      into v_enabled, v_price, v_nights
      from public.trips t join public.packages p on p.id = t.package_id
     where t.id = v_trip;
    if not coalesce(v_enabled, false) or coalesce(v_price, 0) <= 0 then
      raise exception 'transport_only_unavailable';
    end if;
    v_total := round(v_n * v_price, 2);
    doc := jsonb_set(doc, '{total}', to_jsonb(v_total));
    doc := jsonb_set(doc, '{roomType}', '"مواصلات فقط"'::jsonb);
    /* دالة الحجز السابقة تحسب السعر من rooms. نمرر صفاً داخلياً مؤقتاً
       بحيث يخرج السعر = عدد الأشخاص × سعر النقل، ثم نحذفه بعد الإدراج؛
       لذلك لا يظهر أي سكن أو غرفة في الحجز النهائي. */
    doc := jsonb_set(doc, '{rooms}', jsonb_build_array(jsonb_build_object(
      'type', 'مواصلات فقط', 'persons', v_n, 'perNight', v_price / v_nights
    )));
    v_booking_id := public.create_public_booking_base(doc);
    delete from public.booking_rooms where booking_id = v_booking_id;
    update public.bookings set room_type = 'مواصلات فقط', total = v_total where id = v_booking_id;
    return v_booking_id;
  end if;
  return public.create_public_booking_base(doc);
end $$;

revoke all on function public.create_public_booking(jsonb) from public;
grant execute on function public.create_public_booking(jsonb) to anon, authenticated;
