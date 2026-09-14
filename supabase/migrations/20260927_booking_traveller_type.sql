-- ════════════════════════════════════════════════════════════════════
-- 20260927 — نوع المسافر في الطلب العام
--
-- اختيارٌ مستقل عن السكن: male_solo | female_solo | family.
-- يُفرض على إنشاء طلب العميل فقط، ولا يغيّر توزيع الغرف أو تسعيرته.
-- ════════════════════════════════════════════════════════════════════

alter table public.bookings add column if not exists traveller_type text;

alter table public.bookings drop constraint if exists bookings_traveller_type_chk;
alter table public.bookings add constraint bookings_traveller_type_chk
  check (traveller_type is null or traveller_type in ('male_solo','female_solo','family'));

alter function public.create_public_booking(jsonb) rename to create_public_booking_seatless_base;
revoke all on function public.create_public_booking_seatless_base(jsonb) from public, anon, authenticated;

create function public.create_public_booking(doc jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_type text := nullif(doc->>'travellerType','');
  v_booking_id text;
begin
  if v_type is null or v_type not in ('male_solo','female_solo','family') then
    raise exception 'traveller_type_required: اختر نوع المسافر قبل إرسال الطلب';
  end if;

  v_booking_id := public.create_public_booking_seatless_base(doc);
  update public.bookings set traveller_type = v_type where id = v_booking_id;
  return v_booking_id;
end $$;

revoke all on function public.create_public_booking(jsonb) from public, anon;
grant execute on function public.create_public_booking(jsonb) to authenticated;
