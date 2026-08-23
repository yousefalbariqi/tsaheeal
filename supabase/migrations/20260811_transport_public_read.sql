-- ════════════════════════════════════════════════════════════════════
-- 20260811 — قراءة anon لجداول النقل
--
-- قسم «وسيلة النقل» في صفحة الباقة كان لا يظهر بينما يظهر الفندق، مع أن
-- الباقة والرحلة كلتيهما تشيران إلى TRN-9793. سبب ذلك أن استعلام
-- transports يعود بصفر صفوف للعميل المجهول:
--
--   transports          → 0      hotels        → 1
--   transport_features  → 0      hotel_features→ 3
--   transport_reviews   → 0      hotel_reviews → 3
--   transport_media     → 0      hotel_media   → 4
--
-- والكود متماثل: نفس supaEntity ونفس نمط .find() في الطرفين، فالخلل في
-- طبقة الصلاحيات لا في الواجهة.
--
-- ما يصلحه هذا الترحيل أمران:
--
-- 1) transports و transport_features مذكورتان في قائمة anon في schema.sql
--    لكن السياسة غير فاعلة في القاعدة الحيّة. تُنشأ هنا بصيغة آمنة
--    التكرار — schema.sql يستخدم `create policy` بلا `drop if exists`،
--    فأيّ إعادة تشغيل تُفشل الكتلة كلها عند أول جدول موجودة سياسته وتُجهض
--    ما بعده. وهذا الترحيل لا يقع في الفخّ نفسه.
--
-- 2) transport_reviews و transport_media لم تكونا في قائمة anon أصلاً،
--    بينما hotel_reviews و hotel_media كانتا. وهذا خلل مؤكّد لا احتمال:
--    Listing.tsx يعرض صور النقل وتقييماته كما يعرض صور الفندق، فبلا هاتين
--    السياستين يظهر قسم النقل أجرد من الصور والتقييمات بعد إصلاح (1).
--    قراءة authenticated لهما قائمة سلفاً من public_tables؛ الناقص anon.
--
-- ملاحظة: إن كان جدول transports فارغاً فعلاً فهذا الترحيل لا يضرّ ولا
-- يكفي — يبقى إدخال الصفّ من لوحة الإدارة. والقيدان الأجنبيان على
-- packages.transport_id و trips.transport_id يرجّحان أن الصفّ موجود.
-- ════════════════════════════════════════════════════════════════════

do $$
declare t text;
  anon_read text[] := array[
    'transports', 'transport_features', 'transport_media'
  ];
begin
  foreach t in array anon_read loop
    execute format('alter table public.%I enable row level security;', t);

    -- آمن التكرار: يُحذف ثم يُنشأ، فلا تُجهض الكتلة عند إعادة التشغيل
    execute format('drop policy if exists "public read" on public.%I;', t);
    execute format('create policy "public read" on public.%I for select to anon using (true);', t);

    -- قراءة المصادَق: قائمة لثلاثة منها من public_tables، وتُوحَّد هنا
    execute format('drop policy if exists "read auth" on public.%I;', t);
    execute format('create policy "read auth" on public.%I for select to authenticated using (true);', t);

    -- الصلاحية على مستوى الجدول لا السياسة وحدها: بلا grant تُرجَع 42501
    execute format('grant select on public.%I to anon, authenticated;', t);
  end loop;
end $$;

/* التقييمات مفصولة عن الحلقة بقيد `consent`: الواجهة تعرض المُوافَق عليه
   وحده (Listing.tsx: `transport.reviews?.filter(r => r.consent)`)، فحصر
   السياسة على consent لا يُخفي شيئاً معروضاً ويمنع تسليم أسماء ونصوص لم
   يوافق أصحابها على نشرها إلى أي عميل مجهول.

   ملاحظة للمراجعة: hotel_reviews مفتوحة اليوم بـusing (true) وتُسلّم صفوفاً
   بـconsent=false فعلاً — تصفيتها في الواجهة لا في القاعدة. لم أغيّرها لأنها
   خارج نطاق هذا الإصلاح، لكنها تستحق القيد نفسه (تقييمات الفنادق لا تُعرض
   في واجهة العميل أصلاً). */
alter table public.transport_reviews enable row level security;
drop policy if exists "public read" on public.transport_reviews;
create policy "public read" on public.transport_reviews
  for select to anon using (coalesce(consent, false));
drop policy if exists "read auth" on public.transport_reviews;
create policy "read auth" on public.transport_reviews
  for select to authenticated using (true);
grant select on public.transport_reviews to anon, authenticated;
