-- ════════════════════════════════════════════════════════════════════
-- 20260929 — جمهور كل غرفة: لمن تُعرض؟
--
-- «المشترك للرجال» كان شرطاً مكتوباً في كود الواجهة، فلم يكن يُمكن بيع
-- مشتركٍ للنساء ولا تخصيص غرفةٍ خاصةٍ للعوائل وحدها، وكان تغييره يحتاج
-- إصداراً جديداً. صار عموداً في الصفّ: الإدارة تبني التوليفات كما تشاء.
--
-- NULL أو مصفوفة فارغة تعني «الجميع» عند القراءة: الصفوف المسجَّلة قبل
-- هذا العمود لا تنقلب مخفيّةً لأن حقلاً أُضيف بعدها.
-- ════════════════════════════════════════════════════════════════════

alter table public.package_room_prices
  add column if not exists audience text[];

-- لا قيمة خارج الأنواع الثلاثة تدخل العمود.
alter table public.package_room_prices drop constraint if exists package_room_prices_audience_chk;
alter table public.package_room_prices add constraint package_room_prices_audience_chk
  check (
    audience is null
    or audience <@ array['male_solo','female_solo','family']::text[]
  );

-- ── تعبئة أولية تحفظ السلوك القائم ──
-- المشترك كان يُعرض للرجال وحدهم بحكم الكود؛ يُثبَّت ذلك بياناً حتى لا
-- ينقلب معروضاً للنساء لحظة تشغيل الترحيل. والخاصة تبقى للجميع (NULL).
update public.package_room_prices
   set audience = array['male_solo']::text[]
 where audience is null
   and btrim(coalesce(type,'')) = 'سكن مشترك';

-- ── كتابة الجمهور مع حفظ الباقة ──
-- الغلاف هو نمط هذا المشروع: تُعاد تسمية الدالة القائمة ويُبنى فوقها،
-- فلا يُعاد نسخ جسدها الطويل في كل ترحيل — ونسخةٌ منسوخة تتفارق مع
-- أصلها عند أول تعديلٍ يُنسى في إحداهما.
alter function public.upsert_package(jsonb) rename to upsert_package_price_base;

create function public.upsert_package(doc jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_pkg text := doc->>'id';
begin
  perform public.upsert_package_price_base(doc);

  -- الدالة الأساس تكتب الصفوف بلا جمهور؛ يُكتب هنا من نفس المستند.
  -- المصفوفة الفارغة تُحفظ فارغةً لا NULL: «لا يُعرض لأحد» قرارٌ صريح،
  -- وتحويله إلى NULL كان يقلبه «يُعرض للجميع».
  update public.package_room_prices p
     set audience = case
           when e->'audience' is null or jsonb_typeof(e->'audience') <> 'array' then null
           else (select coalesce(array_agg(x), array[]::text[])
                   from jsonb_array_elements_text(e->'audience') x
                  where x in ('male_solo','female_solo','family'))
         end
    from jsonb_array_elements(coalesce(doc->'roomPrices','[]')) e
   where p.package_id = v_pkg
     and p.item_id = e->>'id';
end $$;

revoke all on function public.upsert_package(jsonb) from public;
grant execute on function public.upsert_package(jsonb) to authenticated;
