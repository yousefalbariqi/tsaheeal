-- ════════════════════════════════════════════════════════════════════
-- 20260922 — لا يعطّل سجل التدقيق حجوزات العملاء
--
-- العميل الموثّق في auth.users له customer_profiles، وليس بالضرورة صف
-- في profiles (هذه ملفات موظفي الإدارة). audit_logs.actor_id يشير إلى
-- profiles، لذلك لا يجوز إدراج auth.uid() إلا إن كان صف الموظف موجوداً.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  row_id text;
  v_actor_id uuid := auth.uid();
begin
  row_id := coalesce(to_jsonb(new)->>'id', to_jsonb(old)->>'id', to_jsonb(new)->>'ticket_no', to_jsonb(old)->>'ticket_no');

  -- العملاء العامّون ليسوا موظفين؛ يسجّل الحدث بلا actor_id بدلاً من
  -- كسر الحجز كله بمفتاح audit_logs.actor_id الخارجي.
  if v_actor_id is not null and not exists (select 1 from public.profiles where id = v_actor_id) then
    v_actor_id := null;
  end if;

  insert into public.audit_logs(actor_id, entity_type, entity_id, operation, before_value, after_value)
  values (
    v_actor_id, tg_table_name, coalesce(row_id, '?'),
    case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'update' when 'DELETE' then 'delete' end,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

insert into public.schema_migrations(version, note) values
  ('20260922_audit_public_booking_actor', 'السجل التدقيقي لا يربط العميل العام بملف موظف')
on conflict (version) do nothing;
