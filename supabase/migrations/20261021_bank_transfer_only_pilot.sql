-- 20261021 — Pilot: التحويل البنكي فقط
--
-- لا توجد بوابة دفع موثوقة في هذه المرحلة. لذلك لا يحق لصاحب رابط
-- التحويل، ولا لأي مستخدم مسجّل، تغيير حالة الحجز إلى «مدفوع» عبر RPC.
-- الموظف وحده يثبت التحويل بعد مراجعته عبر مسار upsert_booking المحروس
-- بـ can_write_staff().

do $$
begin
  if to_regprocedure('public.confirm_payment(text,uuid)') is not null then
    revoke all on function public.confirm_payment(text,uuid)
      from public, anon, authenticated, service_role;
  end if;

  -- قد تبقى النسخة الأقدم في مشروع إنتاج لم يستقبل ترحيلات 20260909.
  if to_regprocedure('public.confirm_payment(text)') is not null then
    revoke all on function public.confirm_payment(text)
      from public, anon, authenticated, service_role;
  end if;
end $$;

insert into public.schema_migrations(version, note)
values ('20261021_bank_transfer_only_pilot', 'Pilot: تعطيل confirm_payment العام؛ العميل يرى تعليمات التحويل والموظف يؤكد بعد مراجعة الإيصال')
on conflict (version) do nothing;
