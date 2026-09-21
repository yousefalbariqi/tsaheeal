-- 20261012 — profiles هو مرجع فريق العمل، وusers دليل العرض المتزامن
--
-- الدور والحالة والفرع تُقرأ في الصلاحيات من profiles. لكن شاشة
-- «المستخدمون» تحتاج البريد أيضاً، والبريد محفوظ بأمان في auth.users؛
-- لذلك ظلّت تقرأ users. كانت الدعوة تنشئ profile فقط، فيختفي الموظف من
-- الشاشة بعد إعادة التحميل رغم أن صلاحياته صحيحة. هذا الترحيل يجعل users
-- مرآةً إدارية تلقائية لـ profiles، ولا يجعلها مصدراً للصلاحيات أبداً.

alter table public.users add column if not exists branch_id text;

create or replace function public.sync_staff_user_directory()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text;
  v_last_login text;
begin
  if tg_op = 'DELETE' then
    -- حذف ملف الموظف من الإدارة يخرجه كذلك من دليل العرض. حساب Auth
    -- يُدار منفصلاً من لوحة Supabase كما هو معمول به حالياً.
    delete from public.users where id = old.id::text;
    return old;
  end if;

  select lower(nullif(btrim(u.email), ''))
    into v_email
    from auth.users u
   where u.id = new.id;

  -- Auth يضمن فريدة البريد، لكن قد يكون في users سجل تراثي منفصل بالبريد
  -- نفسه. لا نوقف إنشاء الموظف أو صلاحياته بسبب سجل العرض القديم.
  if v_email is not null and exists (
    select 1 from public.users d
     where d.id <> new.id::text
       and d.archived_at is null
       and lower(coalesce(d.email, '')) = v_email
  ) then
    v_email := null;
  end if;

  select coalesce(nullif(d.last_login, ''),
           case when new.last_login_at is not null
                then to_char(new.last_login_at at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI')
                else '—' end)
    into v_last_login
    from public.users d
   where d.id = new.id::text;

  insert into public.users as d (id, name, email, role, status, last_login, branch_id)
  values (
    new.id::text,
    new.name,
    v_email,
    new.role,
    coalesce(new.status, 'active'),
    coalesce(v_last_login, '—'),
    new.branch_id
  )
  on conflict (id) do update set
    name = excluded.name,
    email = excluded.email,
    role = excluded.role,
    status = excluded.status,
    branch_id = excluded.branch_id;

  return new;
end;
$$;

revoke all on function public.sync_staff_user_directory() from public, anon, authenticated;

-- عبّئ الدليل للحسابات التي أُنشئت سابقاً؛ لا نحذف سجلات users التراثية.
-- نحفظ آخر دخول الموجود إن وُجد، وإلا نأخذه من profiles أو نعرض «—».
insert into public.users as directory (id, name, email, role, status, last_login, branch_id)
select
  p.id::text,
  p.name,
  case when exists (
    select 1 from public.users other
     where other.id <> p.id::text
       and other.archived_at is null
       and lower(coalesce(other.email, '')) = lower(coalesce(a.email, ''))
  ) then null else lower(nullif(btrim(a.email), '')) end,
  p.role,
  coalesce(p.status, 'active'),
  coalesce(nullif(existing.last_login, ''),
           case when p.last_login_at is not null
                then to_char(p.last_login_at at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI')
                else '—' end),
  p.branch_id
from public.profiles p
join auth.users a on a.id = p.id
left join public.users existing on existing.id = p.id::text
on conflict (id) do update set
  name = excluded.name,
  email = excluded.email,
  role = excluded.role,
  status = excluded.status,
  branch_id = excluded.branch_id,
  last_login = coalesce(nullif(directory.last_login, ''), excluded.last_login);

drop trigger if exists trg_sync_staff_user_directory on public.profiles;
drop trigger if exists trg_remove_staff_user_directory on public.profiles;
create trigger trg_sync_staff_user_directory
  after insert or update of name, role, status, branch_id on public.profiles
  for each row execute function public.sync_staff_user_directory();

create trigger trg_remove_staff_user_directory
  after delete on public.profiles
  for each row execute function public.sync_staff_user_directory();

comment on function public.sync_staff_user_directory() is
  'يبقي users دليلاً للعرض متزامناً مع profiles؛ profiles هو مصدر الدور والحالة والفرع.';
