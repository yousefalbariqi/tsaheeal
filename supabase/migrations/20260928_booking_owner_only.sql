-- ════════════════════════════════════════════════════════════════════
-- 20260928 — بيانات صاحب الحجز فقط عند الإنشاء العام
--
-- عدد الأشخاص محفوظ في bookings.persons، لكن لا تُنشأ سجلات معتمرين
-- للمرافقين من متصفح العميل. تُستكمل بياناتهم لاحقاً قبل الرحلة.
-- ════════════════════════════════════════════════════════════════════

alter function public.create_public_booking(jsonb) rename to create_public_booking_traveller_type_base;
revoke all on function public.create_public_booking_traveller_type_base(jsonb) from public, anon, authenticated;

create function public.create_public_booking(doc jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_booking_id text;
begin
  if jsonb_typeof(coalesce(doc, '{}'::jsonb)->'pilgrims') <> 'array'
     or jsonb_array_length(coalesce(doc->'pilgrims', '[]'::jsonb)) < 1 then
    raise exception 'booking_owner_required: أدخل بيانات صاحب الحجز';
  end if;

  -- حتى لو عُدّل طلب المتصفح، يُحفظ صاحب الحجز الأول وحده الآن.
  doc := jsonb_set(doc, '{pilgrims}', jsonb_build_array((doc->'pilgrims')->0));
  v_booking_id := public.create_public_booking_traveller_type_base(doc);
  return v_booking_id;
end $$;

revoke all on function public.create_public_booking(jsonb) from public, anon;
grant execute on function public.create_public_booking(jsonb) to authenticated;

comment on function public.create_public_booking(jsonb) is
  'ينشئ الحجز العام ببيانات صاحب الحجز فقط؛ بيانات المرافقين تُستكمل لاحقاً.';
