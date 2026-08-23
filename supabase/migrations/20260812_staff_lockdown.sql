-- ════════════════════════════════════════════════════════════════════
-- 20260812 — إغلاق ترقية الصلاحيات الذاتية وفصل كتابة المدير عن الموظف
--
-- ثغرة (١): أي شخص يصير موظفاً بنفسه.
--   التسجيل مفتوح (disable_signup=false)، وسياسة "profiles self insert"
--   تسمح لأي مصادَق بإدراج صفّه في profiles، و is_staff() تعني حرفياً
--   «هل له صفّ في profiles؟». فمن يسجّل ببريد ويؤكّده ثم يُدرج صفّه
--   يقرأ ويكتب كل الحجوزات وأرقام الهويات والمدفوعات وبيانات الموظفين.
--   تعليق 20260804 افترض أن «المستفيد لا صفّ له في profiles» — افتراضٌ
--   لا يفرضه شيء. الصفوف تُنشأ من المدير وحده عبر "profiles admin all"،
--   وهو ما تفعله src/supabase/adminUsers.ts أصلاً بجلسة المدير.
--
-- ثغرة (٢): الموظف يتجاوز حرس المدير.
--   upsert_user/payment/ticket/beneficiary محروسة بـ can_write_admin()،
--   لكن سياسة "write staff ... for all" تمنح أي موظف INSERT/UPDATE/DELETE
--   مباشرةً عبر PostgREST — و repository.ts:49 يحذف من الجدول بلا RPC.
--   النتيجة المقلوبة اليوم: موظف يحذف فندقاً ولا يستطيع تعديله.
--
-- آمن للتشغيل على النشر الحالي: لا يلمس حساب المدير القائم، ولا يغيّر
-- أي مسار قراءة، ولا يمسّ الكتالوج العام ولا دوال المستفيد.
-- ════════════════════════════════════════════════════════════════════

-- ═══════════ ١) لا ترقية ذاتية إلى فريق العمل ═══════════
/* الإدراج يبقى للمدير وحده عبر "profiles admin all". من لا صفّ له لا
   يستطيع صناعة صفّ لنفسه، فـ is_staff() تعود false كما يجب. */
drop policy if exists "profiles self insert" on profiles;

/* التحديث الذاتي يبقى (تغيير الاسم) لكن بلا لمس الدور أو الفرع — وإلا
   رقّى الموظف نفسه إلى «مدير النظام» بتحديث صفّه.

   بحارس (trigger) لا بشرط في السياسة: أي سياسة على profiles تقرأ profiles
   في شرطها تُنتج «infinite recursion detected in policy». الحارس
   security definer فيقرأ الصف القديم بلا المرور بالسياسات. */
create or replace function public.guard_profile_self_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then return new; end if;
  if new.role is distinct from old.role then
    raise exception 'forbidden: role change requires admin';
  end if;
  if new.branch_id is distinct from old.branch_id then
    raise exception 'forbidden: branch change requires admin';
  end if;
  return new;
end $$;

drop trigger if exists trg_profiles_guard on profiles;
create trigger trg_profiles_guard before update on profiles
  for each row execute function public.guard_profile_self_update();

-- ═══════════ ٢) فصل الكتابة: الموظف مقابل المدير ═══════════
do $$
declare t text;
  /* يكتبها الموظف — عمل يومي على الطلبات. */
  staff_write text[] := array['bookings','booking_pilgrims','booking_seats','booking_rooms',
                              'support','custom_requests'];
  /* يكتبها المدير وحده — تُطابق حرس can_write_admin() في دوال upsert_*.
     كانت مفتوحة لأي موظف عبر PostgREST رغم حرس الدوال. */
  admin_write text[] := array['payments','payment_pilgrims','tickets','ticket_pilgrims',
                              'beneficiaries','beneficiary_bookings','users'];
begin
  foreach t in array staff_write loop
    execute format('alter table %I enable row level security;', t);
    -- الأسماء القديمة من 20260803 قبل توحيدها في 20260804.
    execute format('drop policy if exists "staff read"  on %I;', t);
    execute format('drop policy if exists "staff write" on %I;', t);
    execute format('drop policy if exists "write staff" on %I;', t);
    execute format('drop policy if exists "read staff"  on %I;', t);
    execute format('create policy "read staff"  on %I for select to authenticated using (public.is_staff());', t);
    execute format('create policy "write staff" on %I for all    to authenticated using (public.is_staff()) with check (public.is_staff());', t);
    execute format('revoke all on %I from anon;', t);
  end loop;

  foreach t in array admin_write loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists "staff read"  on %I;', t);
    execute format('drop policy if exists "staff write" on %I;', t);
    execute format('drop policy if exists "write staff" on %I;', t);
    execute format('drop policy if exists "read staff"  on %I;', t);
    execute format('drop policy if exists "write admin" on %I;', t);
    -- القراءة تبقى لكل موظف: صفحات الفواتير والتذاكر والمستفيدين عرضٌ لا تحرير.
    execute format('create policy "read staff"  on %I for select to authenticated using (public.is_staff());', t);
    execute format('create policy "write admin" on %I for all    to authenticated using (public.is_admin()) with check (public.is_admin());', t);
    execute format('revoke all on %I from anon;', t);
  end loop;
end $$;

/* الكتالوج: الحذف كان مسموحاً لأي موظف بينما التعديل عبر upsert_* يستلزم
   مديراً — فيحذف الموظف فندقاً ولا يعدّله. نوحّدهما على المدير. */
do $$
declare t text;
  catalog text[] := array[
    'hotels','hotel_features','hotel_reviews','hotel_media','hotel_room_types','hotel_room_photos',
    'transports','transport_features','transport_reviews','transport_media',
    'packages','package_features','package_program_stages','package_room_prices','package_reviews',
    'package_policies','package_gallery','branches'];
begin
  foreach t in array catalog loop
    execute format('drop policy if exists "delete staff" on %I;', t);
    execute format('drop policy if exists "delete admin" on %I;', t);
    execute format('create policy "delete admin" on %I for delete to authenticated using (public.is_admin());', t);
  end loop;
end $$;

/* الرحلات تبقى بيد الموظف (إطلاق رحلة وإغلاقها عمل يومي)، لكن الحذف
   للمدير — رحلة محذوفة تُيتّم حجوزاتها. */
do $$
declare t text;
  trip_tables text[] := array['trips','trip_drivers'];
begin
  foreach t in array trip_tables loop
    execute format('drop policy if exists "delete staff" on %I;', t);
    execute format('drop policy if exists "delete admin" on %I;', t);
    execute format('create policy "delete admin" on %I for delete to authenticated using (public.is_admin());', t);
  end loop;
end $$;
