-- ════════════════════════════════════════════════════════════════════
-- 20260907 — لوحة الأرشيف: قراءة المؤرشف، واستعادته، وحذفه نهائياً
--
-- ترحيل 20260906 حوّل «الحذف» اليومي إلى أرشفة، ومنع الـDELETE المباشر،
-- وترك الحذف النهائي في دالةٍ للمدير. لكن الأرشيف بعده لم يكن يُقرأ:
-- list() في الواجهة تُصفّي archived_at is null، فما أُرشف اختفى تماماً.
-- أرشفةٌ لا رجعة منها ولا رؤية لها هي حذفٌ باسمٍ ألطف.
--
-- هنا ثلاث دوال: قراءة المؤرشف، واستعادته، وعدّه. والحذف النهائي موجود
-- من الترحيل السابق ويبقى للمدير وحده بسببٍ مكتوب.
--
-- آمن للإعادة: لا حذف بيانات ولا إدراج بيانات تجريبية.
-- ════════════════════════════════════════════════════════════════════

/* الجداول القابلة للأرشفة — نفس قائمة 20260906 حرفياً. */
create or replace function public.archivable_table(entity_type text)
returns text language sql immutable set search_path = public as $$
  select case entity_type
    when 'hotels' then 'hotels' when 'transports' then 'transports'
    when 'packages' then 'packages' when 'branches' then 'branches'
    when 'trips' then 'trips' when 'bookings' then 'bookings'
    when 'payments' then 'payments' when 'beneficiaries' then 'beneficiaries'
    when 'custom_requests' then 'custom_requests' when 'support' then 'support'
    when 'users' then 'users' else null end;
$$;

/* قراءة الأرشيف: المدير وحده، لأن ما فيه يشمل سجلات أُخرجت من العمل
   عمداً — وعرضها للموظف يعيد إليه ما قُرّر إخراجه. */
create or replace function public.list_archived(entity_type text, page_no integer default 1, page_size integer default 25)
returns table (entity_id text, label text, archived_at timestamptz, archived_by_name text, archive_reason text, total_count bigint)
language plpgsql security definer stable set search_path = public as $$
declare t text;
begin
  if not public.is_admin() then raise exception 'forbidden: system admin only'; end if;
  t := public.archivable_table(entity_type);
  if t is null then raise exception 'unsupported archive entity'; end if;
  return query execute format($f$
    with rows as (
      select x.id::text as entity_id,
             coalesce(to_jsonb(x)->>'name', to_jsonb(x)->>'client_name', to_jsonb(x)->>'title', x.id::text) as label,
             x.archived_at, p.name as archived_by_name, x.archive_reason,
             count(*) over() as total_count
      from public.%I x
      left join public.profiles p on p.id = x.archived_by
      where x.archived_at is not null
    )
    select entity_id, label, archived_at, archived_by_name, archive_reason, total_count
    from rows order by archived_at desc
    offset greatest($1 - 1, 0) * greatest($2, 1)
    limit least(greatest($2, 1), 100)
  $f$, t) using page_no, page_size;
end $$;

/* الاستعادة: تعيد السجلّ إلى العمل اليومي وتمحو سبب الأرشفة — السبب
   يخصّ أرشفةً انتهت، وإبقاؤه يجعل السجلّ التالي يُقرأ بسبب سابق. */
create or replace function public.restore_entity(entity_type text, entity_id text)
returns void language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if not public.is_admin() then raise exception 'forbidden: system admin only'; end if;
  t := public.archivable_table(entity_type);
  if t is null then raise exception 'unsupported archive entity'; end if;
  execute format('update public.%I set archived_at=null, archived_by=null, archive_reason=null where id=$1 and archived_at is not null', t)
    using entity_id;
  if not found then raise exception 'entity not found or not archived'; end if;
  /* users: الأرشفة أوقفت الدخول في profiles، فالاستعادة تعيده. */
  if entity_type = 'users' then
    update public.profiles set status = 'active' where id = entity_id::uuid;
  end if;
end $$;

/* عدّ المؤرشف لكل كيان — لبناء تبويبات اللوحة بلا استعلامٍ لكلٍّ منها. */
create or replace function public.archived_counts()
returns table (entity_type text, archived_count bigint)
language plpgsql security definer stable set search_path = public as $$
declare t text; e text;
  entities text[] := array['hotels','transports','packages','branches','trips','bookings',
                           'payments','beneficiaries','custom_requests','support','users'];
  n bigint;
begin
  if not public.is_admin() then raise exception 'forbidden: system admin only'; end if;
  foreach e in array entities loop
    t := public.archivable_table(e);
    execute format('select count(*) from public.%I where archived_at is not null', t) into n;
    if n > 0 then entity_type := e; archived_count := n; return next; end if;
  end loop;
end $$;

revoke all on function public.list_archived(text,integer,integer) from public;
revoke all on function public.restore_entity(text,text) from public;
revoke all on function public.archived_counts() from public;
grant execute on function public.list_archived(text,integer,integer) to authenticated, service_role;
grant execute on function public.restore_entity(text,text) to authenticated, service_role;
grant execute on function public.archived_counts() to authenticated, service_role;
