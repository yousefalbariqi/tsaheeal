-- ════════════════════════════════════════════════════════════════════
-- 20260915 — المستخدمون والفروع: دعوةٌ بدل كلمة مرور، آخر دخول حقيقي،
--            نطاق الفرع في RLS، وإصلاح بحثَين
--
-- قرار يوسف ٢٠٢٦-٠٩-٠٦: الأدوار الثلاثة تبقى، والفرع يقصّ نطاق البيانات
-- — في سياسات القاعدة لا في الواجهة، فالموظف لا يرى حجوزات فرعٍ آخر
-- حتى لو نادى الـAPI مباشرة.
--
-- ── ما فيه ──
--   (١) آخر دخول: touch_last_login() يختم profiles وusers لحظة الدخول
--   (٢) منع المستخدم من إيقاف حسابه هو — في الحارس لا في الزرّ
--   (٣) users.branch_id للعرض + upsert_user به، وبريدٌ فريد إن خلا الجدول من تكرار
--   (٤) نطاق الفرع: my_branch() و branch_visible() وسياسات القراءة على
--       الحجوزات وتوابعها والفواتير والتذاكر
--   (٥) admin_search_bookings: يحترم نطاق الفرع (security definer يتجاوز
--       RLS) ويُصلح تجريد الجوال ('\\D' كانت شرطتين حرفيتين)
--   (٦) admin_search_beneficiaries: بحثٌ نصّي بلا أرقام كان يطابق كل
--       الصفوف (like '%%') — يُقيَّد بوجود أرقام في الاستعلام
--
-- ── قاعدة النطاق ──
--   مدير      ← يرى كل شيء.
--   موظف بلا فرع ← يرى كل شيء (كما اليوم؛ ربطه بفرعٍ يقصّه).
--   موظف بفرع  ← يرى حجوزات فرعه، وحجوزات رحلات فرعه، وما لا فرعَ له.
--   الرحلات والكتالوج تبقى مقروءةً للجميع: تطبيق المستفيد يقرؤها.
--
-- آمن للإعادة. لا يمسّ بيانات. يُبلّغ في جدول نتائج.
-- ════════════════════════════════════════════════════════════════════


-- ═══ (١) آخر دخول ══════════════════════════════════════════════════
alter table public.profiles add column if not exists last_login_at timestamptz;
alter table public.profiles add column if not exists last_seen_at  timestamptz;

create or replace function public.touch_last_login() returns void
language plpgsql security definer set search_path = public as $$
declare v_now timestamptz := now(); v_txt text := to_char(now() at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI');
begin
  if auth.uid() is null then return; end if;
  update profiles set last_login_at = v_now, last_seen_at = v_now where id = auth.uid();
  update users set last_login = v_txt where id = auth.uid()::text;
end $$;
revoke all on function public.touch_last_login() from public, anon;
grant execute on function public.touch_last_login() to authenticated;

/* نشاطٌ بلا دخول جديد — يُنادى من الواجهة كل بضع دقائق. */
create or replace function public.touch_last_seen() returns void
language sql security definer set search_path = public as $$
  update profiles set last_seen_at = now() where id = auth.uid();
$$;
revoke all on function public.touch_last_seen() from public, anon;
grant execute on function public.touch_last_seen() to authenticated;


-- ═══ (٢) لا يوقف المستخدم نفسه ═══════════════════════════════════════
/* توسيع حارس 20260823 بشرطٍ ثالث. الترتيب: آخر مدير ← نفسه ← المدير
   يمرّ ← قيود الموظف. */
create or replace function public.guard_profile_self_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and coalesce(new.status,'') <> 'active'
     and old.role in ('مدير عام','مدير النظام') and old.status = 'active' then
    if (select count(*) from profiles
         where status = 'active' and role in ('مدير عام','مدير النظام')) <= 1 then
      raise exception 'forbidden: last_admin — لا يمكن إيقاف آخر مدير نشط';
    end if;
  end if;

  if new.status is distinct from old.status and coalesce(new.status,'') <> 'active'
     and old.id = auth.uid() then
    raise exception 'forbidden: self_disable — لا يمكنك إيقاف حسابك الحالي';
  end if;

  if public.is_admin() then return new; end if;

  if new.role is distinct from old.role then
    raise exception 'forbidden: role change requires admin';
  end if;
  if new.branch_id is distinct from old.branch_id then
    raise exception 'forbidden: branch change requires admin';
  end if;
  if new.status is distinct from old.status then
    raise exception 'forbidden: status change requires admin';
  end if;
  return new;
end $$;


-- ═══ (٣) users.branch_id + بريد فريد ═══════════════════════════════
alter table public.users add column if not exists branch_id text;

create or replace function public.upsert_user(doc jsonb) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not public.can_write_admin() then raise exception 'forbidden'; end if;
  if coalesce(trim(doc->>'name'),'') = '' then raise exception 'name_required: الاسم إلزامي'; end if;
  if coalesce(trim(doc->>'email'),'') = '' then raise exception 'email_required: البريد إلزامي'; end if;
  if exists (select 1 from users u where lower(u.email) = lower(trim(doc->>'email'))
               and u.id <> doc->>'id' and u.archived_at is null) then
    raise exception 'email_taken: البريد مستعمل لمستخدمٍ آخر';
  end if;
  insert into users(id,name,email,role,status,last_login,branch_id)
  values(doc->>'id',trim(doc->>'name'),lower(trim(doc->>'email')),doc->>'role',doc->>'status',doc->>'lastLogin',nullif(doc->>'branchId',''))
  on conflict(id) do update set name=excluded.name,email=excluded.email,role=excluded.role,
    status=excluded.status,branch_id=excluded.branch_id,
    /* آخر دخول يكتبه touch_last_login وحده؛ الواجهة ترسل ما قرأته فلا يُدهس بقيمةٍ أقدم. */
    last_login=coalesce(users.last_login, excluded.last_login);
end $$;
revoke execute on function public.upsert_user(jsonb) from public, anon;
grant  execute on function public.upsert_user(jsonb) to authenticated;

/* الفهرس الفريد يُنشأ فقط إن خلا الجدول من تكرار — وإلا يُبلَّغ في التقرير
   ولا يُسقط الترحيل. */
do $$
begin
  if not exists (select lower(email) from users where archived_at is null and coalesce(email,'') <> ''
                 group by lower(email) having count(*) > 1) then
    create unique index if not exists users_email_uniq on public.users(lower(email)) where archived_at is null and coalesce(email,'') <> '';
  end if;
end $$;


-- ═══ (٤) نطاق الفرع في RLS ═════════════════════════════════════════
create or replace function public.my_branch() returns text
language sql stable security definer set search_path = public as $$
  select nullif(branch_id,'') from profiles where id = auth.uid() and status = 'active';
$$;

/* هل يرى الموظفُ الحالي سجلاً فرعُه p_branch؟ */
create or replace function public.branch_visible(p_branch text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or public.my_branch() is null
      or p_branch is null
      or p_branch = public.my_branch();
$$;

/* فرع الحجز: عموده، وإلا فرع رحلته. */
create or replace function public.booking_branch(p_booking_id text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(b.branch_id,''), nullif(t.branch_id,''))
    from bookings b left join trips t on t.id = b.trip_id
   where b.id = p_booking_id;
$$;

do $$
declare t text;
begin
  -- الحجوزات: الصفّ نفسه
  drop policy if exists "read staff" on public.bookings;
  create policy "read staff" on public.bookings for select to authenticated
    using (public.is_staff() and public.branch_visible(public.booking_branch(id)));

  -- توابع الحجز: عبر حجزها
  foreach t in array array['booking_pilgrims','booking_seats','booking_rooms'] loop
    execute format('drop policy if exists "read staff" on public.%I;', t);
    execute format('create policy "read staff" on public.%I for select to authenticated using (public.is_staff() and (booking_id is null or public.branch_visible(public.booking_branch(booking_id))));', t);
  end loop;

  -- الفواتير والتذاكر: عبر حجزها؛ ما لا حجزَ له يبقى مقروءاً
  drop policy if exists "read staff" on public.payments;
  create policy "read staff" on public.payments for select to authenticated
    using (public.is_staff() and (booking_id is null or public.branch_visible(public.booking_branch(booking_id))));
  drop policy if exists "read staff" on public.payment_pilgrims;
  create policy "read staff" on public.payment_pilgrims for select to authenticated
    using (public.is_staff() and exists (select 1 from public.payments p where p.id = payment_id));
  drop policy if exists "read staff" on public.tickets;
  create policy "read staff" on public.tickets for select to authenticated
    using (public.is_staff() and (booking_id is null or public.branch_visible(public.booking_branch(booking_id))));
  drop policy if exists "read staff" on public.ticket_pilgrims;
  create policy "read staff" on public.ticket_pilgrims for select to authenticated
    using (public.is_staff() and exists (select 1 from public.tickets k where k.ticket_no = ticket_no));
end $$;

/* البحث اللحظي (supabase_realtime) يمرّ بالسياسات نفسها، فلا يصل حدث
   حجزٍ من فرعٍ آخر إلى موظفٍ لا يراه. */


-- ═══ (٥) admin_search_bookings: نطاق الفرع + إصلاح تجريد الجوال ══════
create or replace function public.admin_search_bookings(
  q text default '', status_filter text default null, created_on date default null,
  only_unlinked boolean default false, page_no integer default 1, page_size integer default 25
)
returns table (booking_id text, total_count bigint)
language sql security definer stable set search_path = public as $$
  with k as (
    select trim(coalesce(q,'')) as raw, regexp_replace(coalesce(q,''), '\D', '', 'g') as digits
  ),
  matched as (
    select b.id, b.created_at
    from public.bookings b
    left join public.trips t on t.id = b.trip_id, k
    where public.is_staff()
      and b.archived_at is null
      and public.branch_visible(coalesce(nullif(b.branch_id,''), nullif(t.branch_id,'')))
      and (coalesce(status_filter, '') = '' or b.status = status_filter)
      and (created_on is null or left(b.created_at, 10) = created_on::text)
      and (not only_unlinked or not exists (select 1 from public.beneficiary_bookings bb where bb.value = b.id))
      and (
        k.raw = ''
        or b.id ilike '%' || k.raw || '%'
        or b.client_name ilike '%' || k.raw || '%'
        or (length(k.digits) >= 3 and regexp_replace(coalesce(b.client_phone,''), '\D', '', 'g') like '%' || k.digits || '%')
        or exists (select 1 from public.booking_pilgrims bp where bp.booking_id=b.id and (bp.id_number ilike '%' || k.raw || '%' or bp.name ilike '%' || k.raw || '%'))
      )
  ), numbered as (
    select id, count(*) over() as all_count from matched order by created_at desc, id desc
  )
  select id, all_count from numbered
  offset greatest(page_no - 1, 0) * greatest(page_size, 1)
  limit least(greatest(page_size, 1), 100);
$$;
revoke all on function public.admin_search_bookings(text,text,date,boolean,integer,integer) from public, anon;
grant execute on function public.admin_search_bookings(text,text,date,boolean,integer,integer) to authenticated, service_role;


-- ═══ (٦) admin_search_beneficiaries: لا مطابقة للكلّ ════════════════
create or replace function public.admin_search_beneficiaries(
  q text default '', gender_filter text default null,
  page_no integer default 1, page_size integer default 25
)
returns table (beneficiary_id text, total_count bigint)
language sql security definer stable set search_path = public as $$
  with k as (
    select trim(coalesce(q,'')) as raw, regexp_replace(coalesce(q,''), '\D', '', 'g') as digits
  ),
  matched as (
    select b.id, b.name
    from public.beneficiaries b, k
    where public.is_staff()
      and b.archived_at is null
      and (coalesce(gender_filter, '') = '' or b.gender = gender_filter)
      and (
        k.raw = ''
        or b.id ilike '%' || k.raw || '%'
        or b.name ilike '%' || k.raw || '%'
        or b.id_number ilike '%' || k.raw || '%'
        or (length(k.digits) >= 3 and regexp_replace(coalesce(b.phone,''), '\D', '', 'g') like '%' || k.digits || '%')
      )
  ), numbered as (
    select id, count(*) over() as all_count from matched order by name asc, id asc
  )
  select id, all_count from numbered
  offset greatest(page_no - 1, 0) * greatest(page_size, 1)
  limit least(greatest(page_size, 1), 100);
$$;
revoke all on function public.admin_search_beneficiaries(text,text,integer,integer) from public, anon;
grant execute on function public.admin_search_beneficiaries(text,text,integer,integer) to authenticated, service_role;


-- ═══ تقرير ═════════════════════════════════════════════════════════
select 'موظفون مربوطون بفرع (سيرون فرعهم وحده)' as "البند", count(*)::text as "العدد"
  from profiles where status = 'active' and nullif(branch_id,'') is not null and role = 'موظف'
union all
select 'موظفون بلا فرع (يرون كل شيء — اربطهم من شاشة المستخدمين)', count(*)::text
  from profiles where status = 'active' and nullif(branch_id,'') is null and role = 'موظف'
union all
select 'حجوزات بلا فرع ولا رحلة ذات فرع (مرئية للجميع)', count(*)::text
  from bookings b left join trips t on t.id = b.trip_id
 where b.archived_at is null and coalesce(nullif(b.branch_id,''), nullif(t.branch_id,'')) is null
union all
select 'بريد مكرّر يمنع الفهرس الفريد (صحّحه ثم أعد تشغيل الملف)', count(*)::text
  from (select lower(email) from users where archived_at is null and coalesce(email,'') <> '' group by lower(email) having count(*) > 1) d
union all
select 'الفهرس الفريد للبريد', case when exists (select 1 from pg_indexes where indexname = 'users_email_uniq') then 'قائم' else 'لم يُنشأ' end;


-- ═══════════ سجلّ الترحيلات ═══════════
insert into public.schema_migrations(version, note) values
  ('20260915_users_branches', 'المستخدمون والفروع: آخر دخول، منع إيقاف النفس، فرع المستخدم وبريد فريد، نطاق الفرع في RLS، إصلاح بحث الطلبات والمستفيدين')
on conflict (version) do nothing;
