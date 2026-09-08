-- ════════════════════════════════════════════════════════════════════
-- 20260906 — تشغيل لوحة الإدارة: تنبيهات، تدقيق، أرشفة ومؤشرات صحيحة
-- آمن للإعادة: لا حذف بيانات ولا إدراج بيانات تجريبية.
-- ════════════════════════════════════════════════════════════════════

-- ── التنبيهات: ملكية صارمة للمستخدم، ولا عدّاد ثابت في الواجهة. ──
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text,
  href text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_user_unread_idx
  on public.notifications(user_id, created_at desc) where read_at is null;
alter table public.notifications enable row level security;
drop policy if exists "notifications own read" on public.notifications;
drop policy if exists "notifications own update" on public.notifications;
create policy "notifications own read" on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy "notifications own update" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.notifications from anon;

-- ── سجل تدقيق append-only. تحفظه triggers حتى لا تعتمد سلامته على الواجهة. ──
create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  entity_type text not null,
  entity_id text not null,
  operation text not null check (operation in ('create','update','delete')),
  before_value jsonb,
  after_value jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists audit_logs_entity_idx on public.audit_logs(entity_type, entity_id, occurred_at desc);
create index if not exists audit_logs_actor_idx on public.audit_logs(actor_id, occurred_at desc);
alter table public.audit_logs enable row level security;
drop policy if exists "audit read admins" on public.audit_logs;
create policy "audit read admins" on public.audit_logs for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.audit_logs from authenticated, anon;

create or replace function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare row_id text;
begin
  row_id := coalesce(to_jsonb(new)->>'id', to_jsonb(old)->>'id', to_jsonb(new)->>'ticket_no', to_jsonb(old)->>'ticket_no');
  insert into public.audit_logs(actor_id, entity_type, entity_id, operation, before_value, after_value)
  values (auth.uid(), tg_table_name, coalesce(row_id, '?'),
    case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'update' when 'DELETE' then 'delete' end,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

do $$
declare t text;
  audited text[] := array['bookings','payments','trips','packages','hotels','transports','branches','beneficiaries','custom_requests','support','users'];
begin
  foreach t in array audited loop
    execute format('drop trigger if exists trg_audit_%I on public.%I', t, t);
    execute format('create trigger trg_audit_%I after insert or update or delete on public.%I for each row execute function public.audit_row_change()', t, t);
  end loop;
end $$;

-- ── الأرشفة بدلاً من الحذف اليومي. ──
do $$
declare t text;
  archivable text[] := array['hotels','transports','packages','branches','trips','bookings','payments','beneficiaries','custom_requests','support','users'];
begin
  foreach t in array archivable loop
    execute format('alter table public.%I add column if not exists archived_at timestamptz', t);
    execute format('alter table public.%I add column if not exists archived_by uuid references public.profiles(id) on delete set null', t);
    execute format('alter table public.%I add column if not exists archive_reason text', t);
    execute format('create index if not exists %I on public.%I(archived_at) where archived_at is null', t || '_active_idx', t);
  end loop;
end $$;

create or replace function public.archive_entity(entity_type text, entity_id text, reason text)
returns void language plpgsql security definer set search_path = public as $$
declare table_name text;
begin
  if not public.is_staff() then raise exception 'forbidden: staff only'; end if;
  if coalesce(trim(reason), '') = '' then raise exception 'archive reason is required'; end if;
  if entity_type in ('hotels','transports','packages','branches','beneficiaries','users') and not public.is_admin() then
    raise exception 'forbidden: admin only';
  end if;
  table_name := case entity_type
    when 'hotels' then 'hotels' when 'transports' then 'transports' when 'packages' then 'packages'
    when 'branches' then 'branches' when 'trips' then 'trips' when 'bookings' then 'bookings'
    when 'beneficiaries' then 'beneficiaries' when 'custom_requests' then 'custom_requests'
    when 'support' then 'support' when 'users' then 'users' else null end;
  if table_name is null then raise exception 'unsupported archive entity'; end if;
  execute format('update public.%I set archived_at=now(), archived_by=auth.uid(), archive_reason=$2 where id=$1 and archived_at is null', table_name)
    using entity_id, trim(reason);
  if not found then raise exception 'entity not found or already archived'; end if;
  /* users سجلّ عرض، لكن profiles هو بوابة الدخول الفعلية. */
  if entity_type = 'users' then
    update public.profiles set status = 'inactive' where id = entity_id::uuid;
  end if;
end $$;

-- الحذف النهائي استثناء مدير النظام مع سبب صريح؛ لا سياسة PostgREST للحذف.
create or replace function public.permanently_delete_entity(entity_type text, entity_id text, reason text)
returns void language plpgsql security definer set search_path = public as $$
declare table_name text;
begin
  if not public.is_admin() then raise exception 'forbidden: system admin only'; end if;
  if coalesce(trim(reason), '') = '' then raise exception 'permanent deletion reason is required'; end if;
  table_name := case entity_type when 'hotels' then 'hotels' when 'transports' then 'transports'
    when 'packages' then 'packages' when 'branches' then 'branches' when 'trips' then 'trips'
    when 'bookings' then 'bookings' when 'beneficiaries' then 'beneficiaries'
    when 'custom_requests' then 'custom_requests' when 'support' then 'support' else null end;
  if table_name is null then raise exception 'unsupported permanent delete entity'; end if;
  execute format('delete from public.%I where id=$1', table_name) using entity_id;
  if not found then raise exception 'entity not found'; end if;
end $$;
revoke all on function public.archive_entity(text,text,text) from public;
revoke all on function public.permanently_delete_entity(text,text,text) from public;
grant execute on function public.archive_entity(text,text,text) to authenticated, service_role;
grant execute on function public.permanently_delete_entity(text,text,text) to authenticated, service_role;

-- منع الـDELETE المباشر حتى للمدير؛ الدالة أعلاه فقط هي الطريق النهائي.
do $$
declare t text;
  guarded text[] := array['hotels','transports','packages','branches','trips','bookings','beneficiaries','custom_requests','support','users'];
begin
  foreach t in array guarded loop
    execute format('drop policy if exists "delete staff" on public.%I', t);
    execute format('drop policy if exists "delete admin" on public.%I', t);
  end loop;
end $$;

-- ── مؤشرات الرئيسية: دفعات ناجحة بتاريخ التحصيل، لا حالة الحجز. ──
create or replace function public.admin_dashboard_metrics()
returns jsonb language sql security definer stable set search_path = public as $$
  with dates as (
    select timezone('Asia/Riyadh', now())::date as today
  ), successful_payments as (
    select total, case when pay_date ~ '^\\d{4}-\\d{2}-\\d{2}' then left(pay_date,10)::date end as collected_on
      from public.payments where pay_status in ('verified','paid','success') and archived_at is null
  )
  select jsonb_build_object(
    'monthRevenue', coalesce((select sum(total) from successful_payments, dates where collected_on >= date_trunc('month', today)::date and collected_on < (date_trunc('month', today) + interval '1 month')::date), 0),
    'todayBookings', (select count(*) from public.bookings, dates where left(created_at,10) = today::text and archived_at is null),
    'pendingBookings', (select count(*) from public.bookings where status in ('new','reviewing') and archived_at is null),
    'unlinkedBookings', (select count(*) from public.bookings b where b.archived_at is null and not exists (select 1 from public.beneficiary_bookings bb where bb.value = b.id))
  );
$$;
revoke all on function public.admin_dashboard_metrics() from public;
grant execute on function public.admin_dashboard_metrics() to authenticated, service_role;

-- بحث الطلبات في الخادم: الاسم والجوال ورقم الطلب/الهوية مع ترقيم حقيقي.
create or replace function public.admin_search_bookings(
  q text default '', status_filter text default null, created_on date default null,
  only_unlinked boolean default false, page_no integer default 1, page_size integer default 25
)
returns table (booking_id text, total_count bigint)
language sql security definer stable set search_path = public as $$
  with matched as (
    select b.id, b.created_at
    from public.bookings b
    where public.is_staff()
      and b.archived_at is null
      and (coalesce(status_filter, '') = '' or b.status = status_filter)
      and (created_on is null or left(b.created_at, 10) = created_on::text)
      and (not only_unlinked or not exists (select 1 from public.beneficiary_bookings bb where bb.value = b.id))
      and (
        coalesce(trim(q), '') = ''
        or b.id ilike '%' || trim(q) || '%'
        or b.client_name ilike '%' || trim(q) || '%'
        or regexp_replace(coalesce(b.client_phone,''), '\\D', '', 'g') like '%' || regexp_replace(trim(q), '\\D', '', 'g') || '%'
        or exists (select 1 from public.booking_pilgrims bp where bp.booking_id=b.id and (bp.id_number ilike '%' || trim(q) || '%' or bp.name ilike '%' || trim(q) || '%'))
      )
  ), numbered as (
    select id, count(*) over() as all_count from matched order by created_at desc, id desc
  )
  select id, all_count from numbered
  offset greatest(page_no - 1, 0) * greatest(page_size, 1)
  limit least(greatest(page_size, 1), 100);
$$;
revoke all on function public.admin_search_bookings(text,text,date,boolean,integer,integer) from public;
grant execute on function public.admin_search_bookings(text,text,date,boolean,integer,integer) to authenticated, service_role;

-- فهارس البحث؛ تمنع تحوّل خانة البحث إلى مسح كامل مع نمو الطلبات.
create extension if not exists pg_trgm;
create index if not exists bookings_active_created_idx on public.bookings(created_at desc) where archived_at is null;
create index if not exists bookings_client_name_trgm_idx on public.bookings using gin (client_name gin_trgm_ops);
create index if not exists bookings_client_phone_trgm_idx on public.bookings using gin (client_phone gin_trgm_ops);
create index if not exists booking_pilgrims_id_number_trgm_idx on public.booking_pilgrims using gin (id_number gin_trgm_ops);

insert into public.schema_migrations(version, note) values
  ('20260906_admin_operations', 'تنبيهات وتدقيق وأرشفة ومؤشرات الإدارة')
on conflict (version) do nothing;
