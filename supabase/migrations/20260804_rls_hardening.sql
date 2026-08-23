-- ════════════════════════════════════════════════════════════════════
-- 20260804 — إحكام الصلاحيات قبل تفعيل حساب المستفيد
--
-- لماذا الآن؟ السياسات القائمة مكتوبة `to authenticated using (true)`
-- لأن «المصادَق» اليوم = موظف. لحظة ما يصير للمستفيد جلسة حقيقية
-- (تسجيل الدخول بالجوال) يصبح دوره authenticated، فيقرأ كل الحجوزات
-- وأرقام هويات كل المعتمرين وبيانات الموظفين — ويحذف من bookings/trips.
-- هذا الترحيل يفصل «الكتالوج العام» عن «البيانات الحسّاسة»، ويُصلح
-- ثلاث دوال كتابة بلا حرس، وحرساً يمرّ للمجهول في البقية.
--
-- آمن للتشغيل على النشر الحالي: لا يغيّر أي سلوك للموظف، ولا يمسّ الواجهة.
-- ════════════════════════════════════════════════════════════════════

-- ═══════════════ 1) من هو الموظف؟ ═══════════════
/* is_admin() القائمة تفحص الدور؛ وهذه تفحص مجرد الوجود في profiles —
   أي «هل هذا الحساب من فريق العمل أصلاً؟». المستفيد لا صفّ له فيها. */
create or replace function public.is_staff() returns boolean
  language sql security definer stable set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid());
$$;

/* دور الطلب من الـJWT. يعيد null في سياق service_role/psql/SQL Editor. */
create or replace function public.jwt_role() returns text
  language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
$$;

/* قاعدة الكتابة الموحّدة — تحل مشكلة الحرس القديم:
     if auth.uid() is not null and not is_admin() then raise ...
   للمجهول auth.uid() = null فكان الشرط يمرّ! أي أن anon يستطيع
   استدعاء upsert_hotel ويعيد كتابة الكتالوج (PostgreSQL يمنح
   EXECUTE للجميع افتراضياً على دوال public).
     anon          → ممنوع دائماً
     authenticated → لا بد من صف في profiles
     service_role / psql / seed.sql → مسموح */
create or replace function public.can_write_staff() returns boolean
  language sql stable set search_path = public as $$
  select case coalesce(public.jwt_role(), 'service')
           when 'anon'          then false
           when 'authenticated' then public.is_staff()
           else true
         end;
$$;

create or replace function public.can_write_admin() returns boolean
  language sql stable set search_path = public as $$
  select case coalesce(public.jwt_role(), 'service')
           when 'anon'          then false
           when 'authenticated' then public.is_admin()
           else true
         end;
$$;

-- ═══════════════ 2) سياسات القراءة: عام مقابل حسّاس ═══════════════
do $$
declare t text;
  /* كتالوج عام: يبقى مقروءاً لأي مصادَق (والمجهول يقرأه عبر سياسة
     "public read" القائمة) — لا شيء سرّي في أسعار الباقات والفنادق. */
  public_tables text[] := array[
    'hotels','hotel_features','hotel_reviews','hotel_media','hotel_room_types','hotel_room_photos',
    'transports','transport_features','transport_reviews','transport_media',
    'packages','package_features','package_program_stages','package_room_prices','package_reviews',
    'package_policies','package_gallery',
    'branches','trips','trip_drivers'];
  /* حسّاس: للموظفين فقط. المستفيد يصل لبياناته عبر دوال
     security definer لا عبر قراءة الجدول. */
  staff_tables text[] := array[
    'bookings','booking_pilgrims','booking_seats',
    'payments','payment_pilgrims','tickets','ticket_pilgrims',
    'beneficiaries','beneficiary_bookings','users','support','custom_requests'];
begin
  foreach t in array public_tables loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists "read all"     on %I;', t);
    execute format('drop policy if exists "delete staff" on %I;', t);
    execute format('drop policy if exists "delete admin" on %I;', t);
    execute format('create policy "read auth"     on %I for select to authenticated using (true);', t);
    execute format('create policy "delete staff"  on %I for delete to authenticated using (public.is_staff());', t);
  end loop;

  foreach t in array staff_tables loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists "read all"     on %I;', t);
    execute format('drop policy if exists "staff read"   on %I;', t);
    execute format('drop policy if exists "staff write"  on %I;', t);
    execute format('drop policy if exists "delete staff" on %I;', t);
    execute format('drop policy if exists "delete admin" on %I;', t);
    execute format('create policy "read staff"    on %I for select to authenticated using (public.is_staff());', t);
    execute format('create policy "write staff"   on %I for all    to authenticated using (public.is_staff()) with check (public.is_staff());', t);
    execute format('revoke all on %I from anon;', t);
  end loop;
end $$;

/* profiles: الموظف يرى الفريق كاملاً؛ من لا صفّ له لا يرى شيئاً.
   (كان "using (true)" — أي أن مستفيداً مصادَقاً يقرأ بريد كل موظف.) */
drop policy if exists "profiles read" on profiles;
create policy "profiles read" on profiles for select to authenticated
  using (public.is_staff() or id = auth.uid());

-- ═══════════════ 3) حرس دوال الكتابة ═══════════════
/* لا نُعيد كتابة الأجسام هنا — أجسام upsert_* طويلة وتتغيّر مع الجدول،
   ونسخها في ترحيل يعني انحرافها عن schema.sql بصمت. بدلاً من ذلك نقرأ
   التعريف القائم بـ pg_get_functiondef ونحقن سطر الحرس فيه، فيبقى الجسم
   هو نفسه حرفياً بأي حال كان عليه وقت الترحيل. */
do $$
declare
  fn text; src text; ins int;
  old_guard constant text := 'if auth.uid() is not null and not public.is_admin() then raise exception ''forbidden''; end if;';
  new_guard constant text := 'if not public.can_write_admin() then raise exception ''forbidden''; end if;';
  -- بحرس قديم يمرّ للمجهول → يُبدَّل بفحص المدير
  admin_fns text[] := array['upsert_hotel','upsert_transport','upsert_package','upsert_payment',
                            'upsert_ticket','upsert_beneficiary','upsert_user','upsert_branch'];
  -- بلا أي حرس إطلاقاً → يُحقن فحص الموظف
  staff_fns text[] := array['upsert_trip','upsert_booking','upsert_support','upsert_custom_request'];
begin
  foreach fn in array admin_fns loop
    select pg_get_functiondef(p.oid) into src from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = fn and p.pronargs = 1;
    if src is null then raise notice 'تجاوز %: غير موجودة', fn; continue; end if;
    if position('can_write_admin' in src) > 0 then
      raise notice 'تجاوز %: محكَمة سلفاً', fn; continue; end if;
    if position(old_guard in src) = 0 then
      raise exception '% : الحرس القديم غير موجود ولا can_write_admin — راجعها يدوياً', fn; end if;
    execute replace(src, old_guard, new_guard);
  end loop;

  foreach fn in array staff_fns loop
    select pg_get_functiondef(p.oid) into src from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = fn and p.pronargs = 1;
    if src is null then raise notice 'تجاوز %: غير موجودة', fn; continue; end if;
    if position('can_write_staff' in src) > 0 then
      raise notice 'تجاوز %: محكَمة سلفاً', fn; continue; end if;
    /* أول E'\nbegin\n' هو بداية جسم الدالة: كل هذه الدوال إما بلا قسم
       declare أو بقسم سطر واحد لا يحتوي الكلمة. */
    ins := position(E'\nbegin\n' in src);
    if ins = 0 then raise exception '% : لم يُعثر على بداية الجسم', fn; end if;
    execute overlay(src placing E'\nbegin\n  if not public.can_write_staff() then raise exception ''forbidden''; end if;\n'
                    from ins for length(E'\nbegin\n'));
  end loop;
end $$;

/* سحب التنفيذ من المجهول صراحةً — الحرس داخل الجسم هو الحماية الحقيقية،
   وهذا خط دفاع ثانٍ يمنع حتى الوصول للدالة. */
do $$ declare fn text; begin
  foreach fn in array array['upsert_hotel','upsert_transport','upsert_package','upsert_trip',
    'upsert_booking','upsert_payment','upsert_ticket','upsert_beneficiary','upsert_user',
    'upsert_support','upsert_branch','upsert_custom_request']
  loop
    execute format('revoke execute on function public.%I(jsonb) from public, anon;', fn);
    execute format('grant  execute on function public.%I(jsonb) to authenticated;', fn);
  end loop;
end $$;
