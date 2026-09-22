-- 20261015 — تحديث رقم خدمة العملاء وواتساب
--
-- الرقم يُخزن دولياً حتى يعمل رابط wa.me من دون الاعتماد على شكل كتابته.
-- نحدّث الصف الموجود فقط؛ وإن لم يُنفّذ ترحيل إعدادات النظام بعد، يبقى
-- التطبيق على الافتراضي المطابق في src/data/settings.ts.

update public.app_settings
   set pub = jsonb_set(
         coalesce(pub, '{}'::jsonb),
         '{supportPhone}',
         to_jsonb('+966506210485'::text),
         true
       ),
       updated_at = now()
 where id = 'app';

insert into public.schema_migrations(version, note)
values ('20261015_update_support_whatsapp', 'تحديث رقم واتساب خدمة العملاء إلى 0506210485')
on conflict (version) do nothing;
