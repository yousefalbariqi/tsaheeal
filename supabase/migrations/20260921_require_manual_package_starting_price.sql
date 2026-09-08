-- ════════════════════════════════════════════════════════════════════
-- 20260921 — لا نشر لباقة بلا سعر «يبدأ من» يدوي
-- ════════════════════════════════════════════════════════════════════

-- المسودات تبقى قابلة للحفظ التلقائي كي لا يضيع عمل المستخدم قبل أن
-- يصل إلى تبويب الغرف والأسعار. أما النشر فلا يقبل صفراً أو سعراً غائباً.
alter function public.upsert_package(jsonb) rename to upsert_package_reviews_base;

create function public.upsert_package(doc jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(doc->>'status', 'draft') = 'active'
     and coalesce(nullif(doc->>'marketPrice', '')::numeric, 0) <= 0 then
    raise exception 'package_starting_price_required';
  end if;

  perform public.upsert_package_reviews_base(doc);
end $$;

revoke all on function public.upsert_package(jsonb) from public;
grant execute on function public.upsert_package(jsonb) to authenticated;
