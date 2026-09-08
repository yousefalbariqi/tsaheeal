-- ════════════════════════════════════════════════════════════════════
-- 20260911 — بحث الفواتير والتذاكر في الخادم
--
-- الطلبات والمستفيدون صار بحثهما في القاعدة (ترحيلا 20260906 و20260907)،
-- وبقيت الفواتير والتذاكر على التصفية في المتصفّح: تُجلب الصفوف كلها ثم
-- يُقصّ منها ما يطابق، فالبحث لا يرى إلا ما وصل، وما وصل جُلب كاملاً في
-- كل فتحة شاشة. هنا يفلتر ويُرقّم PostgreSQL كما في الطلبات تماماً،
-- والواجهة (lib/useServerSearch) تعود إلى تصفيتها المحلية إن غاب الإجراء.
--
-- الفواتير قابلة للأرشفة (archived_at من ترحيل 20260906) فتُستثنى
-- المؤرشفة؛ التذاكر ليست في قائمة القابلة للأرشفة فلا عمود لها ولا شرط.
--
-- الجوال يُقارن أرقاماً مجرّدة: «0512 345 678» و«+966512345678» رقمٌ
-- واحد. وشرطُ ذلك أن يحمل المطلوب رقماً أصلاً — بحثٌ بالاسم وحده يُخرج
-- سلسلةً فارغة، و«like '%%'» على الفارغ يطابق كل الصفوف، فيُحرَس.
--
-- آمن للإعادة: لا حذف بيانات ولا إدراج بيانات تجريبية.
-- ════════════════════════════════════════════════════════════════════

-- ═══════════ الفواتير ═══════════
create or replace function public.admin_search_payments(
  q text default '', status_filter text default null,
  page_no integer default 1, page_size integer default 25
)
returns table (payment_id text, total_count bigint)
language sql security definer stable set search_path = public as $$
  with needle as (
    select trim(coalesce(q, '')) as txt,
           regexp_replace(trim(coalesce(q, '')), '\D', '', 'g') as digits
  ), matched as (
    select p.id as pid, p.created_at
    from public.payments p, needle n
    where public.is_staff()
      and p.archived_at is null
      and (coalesce(status_filter, '') = '' or p.pay_status = status_filter)
      and (
        n.txt = ''
        or p.id           ilike '%' || n.txt || '%'
        or p.client_name  ilike '%' || n.txt || '%'
        or p.booking_id   ilike '%' || n.txt || '%'
        or p.package_name ilike '%' || n.txt || '%'
        or (n.digits <> '' and
            regexp_replace(coalesce(p.client_phone, ''), '\D', '', 'g') like '%' || n.digits || '%')
      )
  ), numbered as (
    select pid, count(*) over() as all_count
    from matched
    order by created_at desc nulls last, pid desc
  )
  select pid, all_count from numbered
  offset greatest(page_no - 1, 0) * greatest(page_size, 1)
  limit least(greatest(page_size, 1), 100);
$$;
revoke all on function public.admin_search_payments(text,text,integer,integer) from public, anon;
grant execute on function public.admin_search_payments(text,text,integer,integer) to authenticated, service_role;

-- ═══════════ التذاكر ═══════════
-- عمود الإخراج ticket_no يحمل اسم عمود الجدول نفسه، فالمراجع داخل الجسم
-- مؤهَّلة ومُسمّاة (tno) كي لا يلتبس الاسمان.
create or replace function public.admin_search_tickets(
  q text default '', page_no integer default 1, page_size integer default 25
)
returns table (ticket_no text, total_count bigint)
language sql security definer stable set search_path = public as $$
  with needle as (
    select trim(coalesce(q, '')) as txt,
           regexp_replace(trim(coalesce(q, '')), '\D', '', 'g') as digits
  ), matched as (
    select t.ticket_no as tno, t.trip_date
    from public.tickets t, needle n
    where public.is_staff()
      and (
        n.txt = ''
        or t.ticket_no    ilike '%' || n.txt || '%'
        or t.client_name  ilike '%' || n.txt || '%'
        or t.booking_id   ilike '%' || n.txt || '%'
        or t.package_name ilike '%' || n.txt || '%'
        or (n.digits <> '' and
            regexp_replace(coalesce(t.client_phone, ''), '\D', '', 'g') like '%' || n.digits || '%')
      )
  ), numbered as (
    select tno, count(*) over() as all_count
    from matched
    order by trip_date desc nulls last, tno
  )
  select tno, all_count from numbered
  offset greatest(page_no - 1, 0) * greatest(page_size, 1)
  limit least(greatest(page_size, 1), 100);
$$;
revoke all on function public.admin_search_tickets(text,integer,integer) from public, anon;
grant execute on function public.admin_search_tickets(text,integer,integer) to authenticated, service_role;

-- فهارس البحث — بلا هذه يتحوّل كل حرف يُكتب إلى مسحٍ كامل للجدول.
create extension if not exists pg_trgm;
create index if not exists payments_active_created_idx
  on public.payments(created_at desc) where archived_at is null;
create index if not exists payments_client_name_trgm_idx
  on public.payments using gin (client_name gin_trgm_ops);
create index if not exists payments_client_phone_trgm_idx
  on public.payments using gin (client_phone gin_trgm_ops);
create index if not exists tickets_trip_date_idx
  on public.tickets(trip_date desc, ticket_no);
create index if not exists tickets_client_name_trgm_idx
  on public.tickets using gin (client_name gin_trgm_ops);
create index if not exists tickets_client_phone_trgm_idx
  on public.tickets using gin (client_phone gin_trgm_ops);

-- ═══════════ سجلّ الترحيلات ═══════════
insert into public.schema_migrations(version, note) values
  ('20260911_search_payments_tickets', 'بحث الفواتير والتذاكر وترقيمهما في الخادم')
on conflict (version) do nothing;
