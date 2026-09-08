-- ════════════════════════════════════════════════════════════════════
-- 20260907 — الموجة ٥ / صفر: اسم الفندق المجرَّد وحالة المسودة
--
-- ملاحظتان من الفريق، كلتاهما بيانات لا شفرة:
--
-- (١) «يظهر فندق فندق ايلاف قنوان» — الاسم المخزَّن يبدأ بـ«فندق»
--     والواجهة تضيفها عند العرض. الواجهة صارت تنزع البادئة عند العرض
--     وتمنعها عند الحفظ (src/lib/hotelName.ts)، فالشاشات صحيحةٌ قبل هذا
--     الملف. وهذا الملف ينظّف المخزون نفسه كي لا يبقى الاسم مزدوجاً في
--     التصدير والفواتير والبحث النصّي.
--
-- (٢) الفندق الجديد كان يبدأ «نشطاً ومتاحاً» قبل إدخال غرفةٍ أو صورة.
--     الواجهة تُنشئه الآن «مسودة»، وهذا الملف يوسّع القيد ليقبلها ويُنزل
--     الفنادق القائمة الناقصة من «نشط» إلى «مسودة» — فلا يرى العميل سكناً
--     بلا سعر ولا صورة.
--
-- آمن للإعادة: لا حذف ولا إدراج بيانات. التنظيف يعمل على ما يطابق النمط
-- وحده، وتشغيله مرّتين لا يغيّر شيئاً في الثانية.
-- ════════════════════════════════════════════════════════════════════

-- ── ١) نزع بادئة «فندق» من الاسم المخزَّن ───────────────────────────
/* التكرار حتى الثبات: «فندق فندق ايلاف» تحتاج دورتين، ونزعُ واحدةٍ
   يترك المشكلة بنصفها. الحدّ خمس دورات حرصاً لا حاجةً.

   النمط يطابق «فندق» و«الفندق» و«فُندق» متبوعةً بمسافة — و«فندقية»
   ليست بادئة فلا تُمسّ. ونتيجة regexp_replace تُقصّ مسافاتها. */
do $$
declare changed int;
begin
  for i in 1..5 loop
    update public.hotels
       set name = btrim(regexp_replace(btrim(name), '^(ال)?ف[ُ]?ندق[[:space:]]+', '', 'g'))
     where btrim(name) ~ '^(ال)?ف[ُ]?ندق[[:space:]]+';
    get diagnostics changed = row_count;
    exit when changed = 0;
    raise notice 'دورة %: نُظّف % صفّاً', i, changed;
  end loop;
end $$;

-- ── ٢) حالة «مسودة» ────────────────────────────────────────────────
/* عمود status نصّيٌّ بلا قيد اليوم، فلا شيء يمنع «مسودة» تقنياً. القيد
   يُضاف الآن ليمنع قيمةً ثالثة مكتوبةً بالخطأ من الواجهة أو من سكربت.
   يُحذف أولاً ليبقى الملف قابلاً للإعادة. */
alter table public.hotels drop constraint if exists hotels_status_check;

/* أي قيمةٍ غريبة قائمة (فراغ أو NULL) تُعتبر مسودةً لا نشطاً: الافتراضي
   الآمن هو الحجب، لا العرض على العميل. */
update public.hotels
   set status = 'draft'
 where status is null or status not in ('draft','active','inactive');

alter table public.hotels
  add constraint hotels_status_check check (status in ('draft','active','inactive'));

-- ── ٣) الفنادق المنشورة الناقصة تنزل إلى «مسودة» ──────────────────
/* نفس شروط hotelReadiness المانعة في الواجهة، مكتوبةً بـSQL:
   اسمٌ، وصورةٌ واحدة، وغرفةٌ بسعةٍ وسعرٍ وصورة، ومسافةٌ موجبة، ورابط موقع.

   لا تُلمس «متوقف»: صاحبها أوقفها بقرار، وإنزالُها إلى مسودةٍ يمحو
   ذلك القرار. المقصود هنا «نشطٌ يراه العميل وهو ناقص». */
with incomplete as (
  select h.id
    from public.hotels h
   where h.status = 'active'
     and (
          coalesce(btrim(h.name),'') = ''
       or coalesce(h.distance_m,0) <= 0
       or coalesce(btrim(h.map_url),'') !~ '^https?://'
       or not exists (
            select 1 from public.hotel_media m
             where m.hotel_id = h.id and m.kind = 'image' and coalesce(btrim(m.url),'') <> ''
          )
       or not exists (
            select 1 from public.hotel_room_types rt
             where rt.hotel_id = h.id
               and coalesce(rt.beds,0) > 0
               and coalesce(rt.price_per_night,0) > 0
               and exists (
                     select 1 from public.hotel_room_photos p
                      where p.room_type_id = rt.id and coalesce(btrim(p.url),'') <> ''
                   )
          )
     )
)
update public.hotels h
   set status = 'draft'
  from incomplete i
 where h.id = i.id;

-- ── ٤) ما صار مسودةً — يُطبع ليراه من يشغّل الملف ─────────────────
do $$
declare n int; total int;
begin
  select count(*) into n     from public.hotels where status = 'draft';
  select count(*) into total from public.hotels;
  raise notice 'الفنادق: % مسودة من % — راجعها في شاشة الفنادق (مرشّح «مسودة»)', n, total;
end $$;

insert into public.schema_migrations(version, note) values
  ('20260907_hotel_name_and_draft', 'اسم الفندق المجرَّد + حالة المسودة وإنزال الناقص عن النشر')
on conflict (version) do nothing;
