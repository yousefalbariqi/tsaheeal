-- ════════════════════════════════════════════════════════════════════
-- 20260930 — نوع المسافر اختياري ما لم يقيّد السكن
--
-- الواجهة لا تسأل عن النوع في الباقات التي تعرض السكن للجميع. العمود
-- يبقى اختيارياً حتى تحفظ الباقات المقيدة اختيار العميل، أما الطلب
-- العام فلا يفشل لمعلومة لا تؤثر في السكن أو الخدمة.
-- ════════════════════════════════════════════════════════════════════

alter function public.create_public_booking(jsonb)
  rename to create_public_booking_owner_only_traveller_type_base;
revoke all on function public.create_public_booking_owner_only_traveller_type_base(jsonb)
  from public, anon, authenticated;

create function public.create_public_booking(doc jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_type text := nullif(coalesce(doc, '{}'::jsonb)->>'travellerType', '');
  v_booking_id text;
begin
  -- الدالة الموروثة من ترحيل 20260927 تتحقق من القيمة. نمرر قيمة صالحة
  -- مؤقتاً للطلبات العامة ثم نعيد العمود إلى NULL بعد الإنشاء؛ لا تُحفظ
  -- قيمة مصطنعة ولا يصبح السؤال إلزامياً في عقد الـ API.
  if v_type is null then
    doc := jsonb_set(coalesce(doc, '{}'::jsonb), '{travellerType}', '"family"'::jsonb, true);
  end if;

  v_booking_id := public.create_public_booking_owner_only_traveller_type_base(doc);
  update public.bookings set traveller_type = v_type where id = v_booking_id;
  return v_booking_id;
end $$;

revoke all on function public.create_public_booking(jsonb) from public, anon;
grant execute on function public.create_public_booking(jsonb) to authenticated;

comment on function public.create_public_booking(jsonb) is
  'ينشئ الحجز العام ببيانات صاحب الحجز؛ نوع المسافر اختياري ويُحفظ عند الحاجة لتقييد السكن.';
