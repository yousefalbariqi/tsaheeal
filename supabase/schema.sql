-- ════════════════════════════════════════════════════════════
-- تساهيل العمرة — مخطط قاعدة بيانات Supabase (مرحلة أولى)
-- الصقه في: Supabase Dashboard → SQL Editor → New query → Run
-- ────────────────────────────────────────────────────────────
-- كل كيان يُخزَّن كصف: id (المعرّف) + doc (كائن JSON كامل).
-- هذا أسرع انطلاقاً؛ يمكن تطبيع الحقول المتداخلة لجداول لاحقاً.
-- ════════════════════════════════════════════════════════════

create table if not exists hotels        (id text primary key, doc jsonb not null);
create table if not exists transports    (id text primary key, doc jsonb not null);
create table if not exists packages       (id text primary key, doc jsonb not null);
create table if not exists trips          (id text primary key, doc jsonb not null);
create table if not exists bookings       (id text primary key, doc jsonb not null);
create table if not exists payments       (id text primary key, doc jsonb not null);
create table if not exists tickets        (id text primary key, doc jsonb not null); -- id = ticketNo
create table if not exists beneficiaries  (id text primary key, doc jsonb not null);
create table if not exists users          (id text primary key, doc jsonb not null);
create table if not exists support        (id text primary key, doc jsonb not null);

-- ════════════════════════════════════════════════════════════
-- جدول الملفات الشخصية (الأدوار) — مرتبط بمستخدمي Supabase Auth
-- ════════════════════════════════════════════════════════════
create table if not exists profiles (
  id   uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'مستخدم',
  role text not null default 'موظف'   -- القيم: 'مدير عام' | 'مدير النظام' | 'موظف'
);

-- ════════════════════════════════════════════════════════════
-- دوال الأدوار (SECURITY DEFINER تتجاوز RLS فتتفادى التكرار اللانهائي)
-- ════════════════════════════════════════════════════════════
create or replace function public.is_admin() returns boolean
  language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('مدير عام','مدير النظام')
  );
$$;

-- ════════════════════════════════════════════════════════════
-- الأمان (RLS) حسب الدور:
--   • الجميع (مُصادَق) يقرأ كل البيانات.
--   • «موظف» يكتب فقط في الطلبات (bookings) والرحلات (trips).
--   • «مدير عام / مدير النظام» يكتب في كل شيء.
-- ════════════════════════════════════════════════════════════
-- جداول يكتبها الموظف والمدير معاً:
do $$
declare t text;
begin
  foreach t in array array['bookings','trips'] loop
    execute format('alter table %I enable row level security;', t);
    execute format('create policy "read all" on %I for select to authenticated using (true);', t);
    execute format('create policy "write staff+admin" on %I for all to authenticated using (true) with check (true);', t);
  end loop;
end $$;

-- جداول يكتبها المدير فقط (والموظف يقرأ):
do $$
declare t text;
begin
  foreach t in array array[
    'hotels','transports','packages','payments','tickets','beneficiaries','users','support'
  ] loop
    execute format('alter table %I enable row level security;', t);
    execute format('create policy "read all" on %I for select to authenticated using (true);', t);
    execute format('create policy "write admin only" on %I for all to authenticated using (public.is_admin()) with check (public.is_admin());', t);
  end loop;
end $$;

-- profiles: الكل يقرأ؛ المدير يدير أي ملف، والمستخدم يعدّل ملفه فقط
alter table profiles enable row level security;
create policy "profiles read"        on profiles for select to authenticated using (true);
create policy "profiles admin all"   on profiles for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "profiles self update" on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles self insert" on profiles for insert to authenticated with check (id = auth.uid());

-- ════════════════════════════════════════════════════════════
-- دفع العميل (صفحة /pay/:id عامة بلا تسجيل دخول):
-- دالة آمنة تُحدّث حالة الطلب والفاتورة فقط — تُستدعى من anon.
-- ════════════════════════════════════════════════════════════
create or replace function public.confirm_payment(p_booking_id text) returns void
  language sql security definer set search_path = public as $$
  update bookings
    set doc = doc || '{"paymentStatus":"verified","status":"paid"}'::jsonb
    where id = p_booking_id;
  update payments
    set doc = doc || '{"payStatus":"verified"}'::jsonb
    where doc->>'bookingId' = p_booking_id;
$$;
grant execute on function public.confirm_payment(text) to anon, authenticated;

-- ════════════════════════════════════════════════════════════
-- بعد التشغيل:
-- 1) Authentication → Users → Add user (بريد + كلمة مرور) لأول مدير.
--    (فعّل: Authentication → Providers → Email، وأطفئ "Confirm email"
--     ليعمل إنشاء المستخدمين من داخل التطبيق فوراً.)
-- 2) انسخ الـ UUID وأدرج ملفه:
--      insert into profiles (id, name, role)
--      values ('<UUID>', 'سالم أحمد', 'مدير النظام');
-- 3) ضع VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY في .env ثم شغّل.
--    البيانات الأولية تُعبّأ تلقائياً عند أول دخول (جداول فارغة).
--    وبعدها يمكن للمدير إنشاء بقية المستخدمين من صفحة «المستخدمون».
-- ════════════════════════════════════════════════════════════
