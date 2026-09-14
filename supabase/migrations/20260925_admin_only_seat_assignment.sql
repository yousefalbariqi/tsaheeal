-- ════════════════════════════════════════════════════════════════════
-- 20260925 — تخصيص المقاعد من الإدارة فقط
--
-- لا يرى العميل كروكي المقاعد ولا يستطيع إرسال أرقامها. هذه الطبقة
-- الدفاعية تُسقِط أي seats أو seat داخل pilgrims يصل إلى RPC حتى لو عُدّل
-- طلب المتصفح يدوياً. يبقى accept_booking وحده هو مسار تعيين المقاعد؛
-- وهو محميّ بـ can_write_staff ويشترط العدد الصحيح في معاملة واحدة.
-- ════════════════════════════════════════════════════════════════════

alter function public.create_public_booking(jsonb) rename to create_public_booking_mode_base;

-- لا يجوز استدعاء النسخ الداخلية مباشرةً من جلسة عميل.
revoke all on function public.create_public_booking_base(jsonb) from public, anon, authenticated;
revoke all on function public.create_public_booking_mode_base(jsonb) from public, anon, authenticated;
revoke all on function public.hold_seats(text,int[],int) from public, anon, authenticated;
revoke all on function public.release_seat_holds(text) from public, anon, authenticated;

create function public.create_public_booking(doc jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_pilgrims jsonb;
begin
  -- الأرقام المرسلة من العميل لا تمثل حجزاً أو أحقية لمقعد.
  doc := coalesce(doc, '{}'::jsonb) - 'seats';

  select coalesce(jsonb_agg(p - 'seat'), '[]'::jsonb)
    into v_pilgrims
    from jsonb_array_elements(coalesce(doc->'pilgrims', '[]'::jsonb)) p;
  doc := jsonb_set(doc, '{pilgrims}', v_pilgrims);

  return public.create_public_booking_mode_base(doc);
end $$;

revoke all on function public.create_public_booking(jsonb) from public, anon;
grant execute on function public.create_public_booking(jsonb) to authenticated;

comment on function public.create_public_booking(jsonb) is
  'ينشئ طلب العميل بلا مقاعد؛ التعيين إلزامي لاحقاً من الإدارة عبر accept_booking.';
