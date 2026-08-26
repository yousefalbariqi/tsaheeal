-- ════════════════════════════════════════════════════════════════════
-- 20260823 — الموجة ٣: دلو الوسائط (Supabase Storage)
--
-- المشكلة: كل صورة في المشروع مخزَّنة base64 داخل عمود نصّي —
--   packages.cover_image · package_gallery.value · package_reviews.image
--   hotel_media.url · hotel_room_photos.url · hotel_reviews.image
--   transport_media.url · transport_reviews.image
--
-- كلفتها ليست المساحة وحدها: الصورة تعيش داخل الصفّ، فقراءة الباقة
-- تجرّ صورها معها. صفحة الاستكشاف تجلب الباقات كلّها — عشرون باقة
-- بغلافٍ لكلٍّ = ميغابايتات في استعلامٍ واحد قبل أن يُرسم شيء. ولا
-- ذاكرة وسيطة (CDN) ولا ترويسة تخزين: نفس الصورة تُنزَّل من جديد في
-- كل زيارة، ومع كل تعديل في أي حقل آخر من الباقة.
--
-- بعد هذا الترحيل: الأعمدة تحمل رابطاً عاماً قصيراً، والملف في الدلو.
-- الأعمدة لا تتغيّر (كلّها text أصلاً)، فالصفوف القديمة تبقى تعمل
-- وتُنقل بالسكربت: scripts/migrate-media-to-storage.mjs
--
-- آمن وidempotent: لا drop ولا truncate.
-- ════════════════════════════════════════════════════════════════════


-- ▓▓▓▓▓▓▓▓▓▓▓▓▓▓ القسم ١ — الدلو ▓▓▓▓▓▓▓▓▓▓▓▓▓▓
/* عام (public=true): صور الكتالوج يجب أن يراها زائر مجهول قبل أي دخول.
   وحدّ الحجم وقائمة الأنواع في الدلو نفسه لا في الواجهة وحدها: حرس
   الواجهة يُتجاوَز بطلب مباشر، وحرس الدلو لا يُتجاوَز. */
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media', 'media', true,
  67108864,   -- 64MB — سقف المقاطع؛ الصور محدودة بـ8MB في الواجهة
  array[
    'image/jpeg','image/png','image/webp','image/gif','image/avif',
    'image/heic','image/heif',
    'video/mp4','video/webm','video/quicktime'
  ]
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- ▓▓▓▓▓▓▓▓▓▓▓▓▓▓ القسم ٢ — سياسات الدلو ▓▓▓▓▓▓▓▓▓▓▓▓▓▓
/* القراءة بالمسار الكامل تمرّ من نقطة النهاية العامة وتتجاوز RLS —
   هذا مقصود لصور الكتالوج. أمّا *سرد* محتويات الدلو فيمرّ من
   storage.objects، فنقصره على الموظفين: بلا ذلك يستطيع المجهول أن
   يستعرض كل ملف رُفع يوماً، ومنها مرفقات الدعم الفني.

   والمسارات من crypto.randomUUID في الواجهة — غير قابلة للتخمين، فلا
   يُوصل إليها إلا بالرابط نفسه.

   ملاحظة للمراجعة: مرفقات الدعم (support/) تُخدَم من دلوٍ عام بمسار
   غير قابل للتخمين. إن لزم إخفاؤها إخفاءً تامّاً فمحلّها دلو خاص
   بروابط موقّعة — تغييرٌ في شاشة الدعم لا في هذا الترحيل. */
drop policy if exists "media_list_staff"    on storage.objects;
drop policy if exists "media_insert_staff"  on storage.objects;
drop policy if exists "media_update_staff"  on storage.objects;
drop policy if exists "media_delete_staff"  on storage.objects;

create policy "media_list_staff" on storage.objects
  for select using (bucket_id = 'media' and public.is_staff());

create policy "media_insert_staff" on storage.objects
  for insert with check (bucket_id = 'media' and public.can_write_staff());

create policy "media_update_staff" on storage.objects
  for update using (bucket_id = 'media' and public.can_write_staff())
             with check (bucket_id = 'media' and public.can_write_staff());

create policy "media_delete_staff" on storage.objects
  for delete using (bucket_id = 'media' and public.can_write_staff());


-- ▓▓▓▓▓▓▓▓▓▓▓▓▓▓ القسم ٣ — عدّاد ما بقي base64 ▓▓▓▓▓▓▓▓▓▓▓▓▓▓
/* دالة تقرير لا ترحيل: تُنادى قبل السكربت وبعده لتقول ما بقي داخل
   الأعمدة. نقل الملفّات نفسها يحتاج قراءة base64 وفكّه ورفعه — وهذا
   عمل عميلٍ لا SQL، فهو في scripts/migrate-media-to-storage.mjs.

   بلا هذا العدّاد يبقى «هل انتهى الترحيل؟» سؤالاً بلا جواب. */
create or replace function public.media_base64_report()
returns table (source text, rows_left bigint, bytes_left bigint)
language sql security definer stable set search_path = public as $$
  select 'packages.cover_image', count(*), coalesce(sum(length(cover_image)),0)
    from packages where cover_image like 'data:%'
  union all
  select 'package_gallery.value', count(*), coalesce(sum(length(value)),0)
    from package_gallery where value like 'data:%'
  union all
  select 'package_reviews.image', count(*), coalesce(sum(length(image)),0)
    from package_reviews where image like 'data:%'
  union all
  select 'hotel_media.url', count(*), coalesce(sum(length(url)),0)
    from hotel_media where url like 'data:%'
  union all
  select 'hotel_room_photos.url', count(*), coalesce(sum(length(url)),0)
    from hotel_room_photos where url like 'data:%'
  union all
  select 'hotel_reviews.image', count(*), coalesce(sum(length(image)),0)
    from hotel_reviews where image like 'data:%'
  union all
  select 'transport_media.url', count(*), coalesce(sum(length(url)),0)
    from transport_media where url like 'data:%'
  union all
  select 'transport_reviews.image', count(*), coalesce(sum(length(image)),0)
    from transport_reviews where image like 'data:%';
$$;

revoke all on function public.media_base64_report() from anon;
grant execute on function public.media_base64_report() to authenticated, service_role;


-- ▓▓▓▓▓▓▓▓▓▓▓▓▓▓ القسم ٤ — إعدادات النظام ▓▓▓▓▓▓▓▓▓▓▓▓▓▓
/* شاشة «الإعدادات» كانت «قيد البناء» ولا مكان تكتب فيه: رقم واتساب
   الدعم وبريده والسجل التجاري وساعات العمل ووعد الردّ كلّها ثوابت
   مبثوثة في الشفرة (WhatsAppFab.SUPPORT_PHONE، sla.ts، وأربع نسخ من
   «السجل التجاري: 1010537391» في الفاتورة والتذكرة وصفحة الدفع).
   تغيير رقم الدعم اليوم = تعديل شفرة وإعادة نشر.

   صفٌّ واحد لا جدول مفاتيح/قيم: الإعدادات تُقرأ معاً دائماً، والقراءة
   الواحدة أخفّ من عشرين صفّاً، والكتابة الذرّية تمنع حالةً نصفية.

   عمودان لا واحد: `pub` يقرأه الزائر المجهول (تطبيق المستفيد يحتاج رقم
   واتساب ووعد الردّ قبل أي دخول)، و`internal` للموظفين وحدهم (بريد
   الدعم وتفضيلات الإشعار ليست معلومةً عامة). RLS يحرس الصفوف لا
   الأعمدة، فالفصل هنا عمودان + دالةٌ تُعيد العام وحده. */
create table if not exists app_settings (
  id         text primary key default 'app' check (id = 'app'),
  pub        jsonb not null default '{}'::jsonb,
  internal   jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into app_settings (id) values ('app') on conflict (id) do nothing;

alter table app_settings enable row level security;

drop policy if exists "settings_read_staff"  on app_settings;
drop policy if exists "settings_write_admin" on app_settings;

/* القراءة الكاملة للموظفين؛ المجهول يمرّ من app_settings_public() وحدها. */
create policy "settings_read_staff" on app_settings
  for select using (public.is_staff());

create policy "settings_write_admin" on app_settings
  for update using (public.can_write_admin()) with check (public.can_write_admin());

/* الإعدادات العامة — تُنادى بلا جلسة من تطبيق المستفيد. */
create or replace function public.app_settings_public()
returns jsonb language sql security definer stable set search_path = public as $$
  select coalesce(pub, '{}'::jsonb) from app_settings where id = 'app';
$$;

grant execute on function public.app_settings_public() to anon, authenticated, service_role;

/* الكتابة الذرّية — دمجٌ لا استبدال: شاشتان مفتوحتان لموظفين مختلفين
   كانت الثانية منهما تمحو حفظ الأولى بإرسال الكائن كاملاً. */
create or replace function public.upsert_app_settings(doc jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_write_admin() then
    raise exception 'forbidden: admin only';
  end if;
  update app_settings set
    pub        = coalesce(pub, '{}'::jsonb)      || coalesce(doc->'pub', '{}'::jsonb),
    internal   = coalesce(internal, '{}'::jsonb) || coalesce(doc->'internal', '{}'::jsonb),
    updated_at = now(),
    updated_by = auth.uid()
  where id = 'app';
end $$;

revoke all on function public.upsert_app_settings(jsonb) from anon;
grant execute on function public.upsert_app_settings(jsonb) to authenticated, service_role;
