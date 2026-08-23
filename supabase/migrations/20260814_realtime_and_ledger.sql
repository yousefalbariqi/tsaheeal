-- ════════════════════════════════════════════════════════════════════
-- 20260814 — البثّ اللحظي + سجلّ الترحيلات
--
-- (١) اللوحة صارت تشترك في تغييرات bookings/custom_requests، والاشتراك
--     لا يصل شيئاً ما لم يكن الجدول في منشور supabase_realtime.
--
-- (٢) لا سجل لما طُبِّق على القاعدة. لا config.toml ولا CLI ولا جدول —
--     كل ملف يقول «الصقه في SQL Editor». استُنتجت الحالة من رموز HTTP.
--     الجدول أدناه يجعل السؤال قابلاً للإجابة، ويُملأ يدوياً بسطر لكل
--     ترحيل شُغِّل (بما فيها القديمة — انظر التذييل).
-- ════════════════════════════════════════════════════════════════════

-- ═══════════ ١) منشور البثّ اللحظي ═══════════
do $$
declare t text;
  live text[] := array['bookings','booking_pilgrims','booking_seats','custom_requests','trips'];
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array live loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname='supabase_realtime' and schemaname='public' and tablename=t
    ) then
      execute format('alter publication supabase_realtime add table public.%I;', t);
    end if;
  end loop;
end $$;

/* الحمولة الكاملة للتحديث/الحذف ليست مطلوبة: الواجهة تعيد الجلب عند أي
   حدث ولا تقرأ محتوى الحدث. الإبقاء على default يقلّل ما يُبثّ. */

-- ═══════════ ٢) سجلّ الترحيلات ═══════════
create table if not exists public.schema_migrations (
  version     text primary key,
  applied_at  timestamptz not null default now(),
  note        text
);

alter table public.schema_migrations enable row level security;
drop policy if exists "migrations read staff" on public.schema_migrations;
create policy "migrations read staff" on public.schema_migrations
  for select to authenticated using (public.is_staff());
revoke all on public.schema_migrations from anon;

/* تسجيل ما هو مطبَّق فعلاً على هذه القاعدة — أُثبت بالفحص المباشر:
   الجداول والدوال التي تضيفها هذه الملفات موجودة وتستجيب. */
insert into public.schema_migrations(version, note) values
  ('20260728_refactor',            'مُستنتج — الجداول موجودة'),
  ('20260729_customer_ux',         'مُستنتج جزئياً — trip_taken_seats كانت مفقودة، أعادها 20260813'),
  ('20260801_pilgrim_doc_type',    'مُستنتج'),
  ('20260802_pilgrim_age_seat',    'مُستنتج'),
  ('20260803_custom_requests',     'مُثبت — custom_requests موجود'),
  ('20260804_rls_hardening',       'مُثبت — الجداول الحسّاسة ترفض anon'),
  ('20260805_customer_accounts',   'مُثبت — customer_profiles و booking_for_pay يستجيبان'),
  ('20260806_customer_auth_lockdown','مُثبت — create_public_booking يرفض anon'),
  ('20260808_package_review_rating','مُثبت — package_reviews.rating موجود'),
  ('20260809_booking_rooms',       'مُثبت — booking_rooms موجود'),
  ('20260809_customer_travellers', 'مُثبت — customer_travellers موجود'),
  ('20260810_booking_submitted_at','مُثبت — التحقق من المقاعد مُفعَّل'),
  ('20260811_transport_public_read','مُثبت — transports يعود لـanon'),
  ('20260812_staff_lockdown',      'هذه الدفعة'),
  ('20260813_seat_integrity',      'هذه الدفعة'),
  ('20260814_realtime_and_ledger', 'هذه الدفعة')
on conflict (version) do nothing;

-- ملاحظة: 20260807_test_disable_seat_check ترحيل تجريبي وقد نُقل خارج
-- مجلد migrations. أثره ألغاه 20260810 بإعادة تعريف الدالة بالتحقق.
