-- ════════════════════════════════════════════════════════════════════
-- 20260920 — آراء الباقات: الاسم + التقييم من 5 + النص + الصورة
-- ════════════════════════════════════════════════════════════════════

-- التقييمات السابقة كانت من عشر؛ نحتفظ بمعناها عند نقلها إلى خمس.
update public.package_reviews
   set rating = case
     when rating is null then 5
     when rating > 5 then least(5, greatest(1, round(rating / 2, 1)))
     else least(5, greatest(1, rating))
   end;

alter table public.package_reviews drop constraint if exists package_reviews_rating_range;
alter table public.package_reviews add constraint package_reviews_rating_range
  check (rating >= 1 and rating <= 5);

-- الغلاف الحالي يحفظ أيضاً خيار «مواصلات فقط». نطبع داخله وثيقة الآراء
-- الجديدة قبل تمريرها للدالة السابقة، فلا تعود addedBy أو bookingId إلى
-- البيانات مع أي حفظ تلقائي لاحق. consent يبقى true كتوافق داخلي مع
-- العمود القديم، ولا يمثل حقلاً أو قراراً في واجهة الإدارة.
alter function public.upsert_package(jsonb) rename to upsert_package_transport_base;

create function public.upsert_package(doc jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_reviews jsonb;
begin
  select coalesce(jsonb_agg(
    (e - 'addedBy' - 'bookingId') || jsonb_build_object(
      'consent', true,
      'rating', case
        when nullif(e->>'rating', '') is null then 5
        when (e->>'rating')::numeric > 5 then round((e->>'rating')::numeric / 2, 1)
        else least(5, greatest(1, (e->>'rating')::numeric))
      end
    ) order by o
  ), '[]'::jsonb)
    into v_reviews
    from jsonb_array_elements(coalesce(doc->'reviews', '[]'::jsonb)) with ordinality reviews(e, o);

  doc := jsonb_set(doc, '{reviews}', v_reviews);
  perform public.upsert_package_transport_base(doc);
end $$;

revoke all on function public.upsert_package(jsonb) from public;
grant execute on function public.upsert_package(jsonb) to authenticated;
