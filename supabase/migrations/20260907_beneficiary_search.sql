-- ════════════════════════════════════════════════════════════════════
-- 20260907 — بحث المستفيدين في الخادم
--
-- الطلبات صار بحثها في القاعدة (ترحيل 20260906)، وبقي المستفيدون على
-- التصفية في الواجهة: تُجلب الصفوف كلها ثم يُقصّ منها ما يطابق. مع
-- خمسة آلاف ملفّ يعني ذلك جلبها كلها في كل فتحة شاشة، والبحث لا يرى
-- إلا ما وصل. هنا يفلتر ويُرقّم PostgreSQL كما في الطلبات تماماً.
--
-- آمن للإعادة: لا حذف بيانات ولا إدراج بيانات تجريبية.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.admin_search_beneficiaries(
  q text default '', gender_filter text default null,
  page_no integer default 1, page_size integer default 25
)
returns table (beneficiary_id text, total_count bigint)
language sql security definer stable set search_path = public as $$
  with matched as (
    select b.id, b.name
    from public.beneficiaries b
    where public.is_staff()
      and b.archived_at is null
      and (coalesce(gender_filter, '') = '' or b.gender = gender_filter)
      and (
        coalesce(trim(q), '') = ''
        or b.id ilike '%' || trim(q) || '%'
        or b.name ilike '%' || trim(q) || '%'
        or b.id_number ilike '%' || trim(q) || '%'
        /* الجوال يُقارن أرقاماً مجرّدة: «0512 345 678» و«+966512345678»
           رقمٌ واحد، والبحث بأحدهما يجب أن يجد الآخر. */
        or regexp_replace(coalesce(b.phone,''), '\D', '', 'g')
             like '%' || regexp_replace(trim(q), '\D', '', 'g') || '%'
      )
  ), numbered as (
    select id, count(*) over() as all_count from matched order by name asc, id asc
  )
  select id, all_count from numbered
  offset greatest(page_no - 1, 0) * greatest(page_size, 1)
  limit least(greatest(page_size, 1), 100);
$$;
revoke all on function public.admin_search_beneficiaries(text,text,integer,integer) from public;
grant execute on function public.admin_search_beneficiaries(text,text,integer,integer) to authenticated, service_role;

-- فهارس البحث — بلا هذه يتحوّل كل حرف يُكتب إلى مسحٍ كامل للجدول.
create extension if not exists pg_trgm;
create index if not exists beneficiaries_active_name_idx
  on public.beneficiaries(name asc) where archived_at is null;
create index if not exists beneficiaries_name_trgm_idx
  on public.beneficiaries using gin (name gin_trgm_ops);
create index if not exists beneficiaries_phone_trgm_idx
  on public.beneficiaries using gin (phone gin_trgm_ops);
create index if not exists beneficiaries_id_number_trgm_idx
  on public.beneficiaries using gin (id_number gin_trgm_ops);
