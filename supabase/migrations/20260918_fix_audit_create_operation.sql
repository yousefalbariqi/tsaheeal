-- ════════════════════════════════════════════════════════════════════
-- 20260918 — إصلاح كتابة «إنشاء» في سجل التدقيق
--
-- audit_logs.operation يقبل create/update/delete، لكن نسخة الدالة في
-- 20260906 كانت تحفظ TG_OP بعد lower(): INSERT/update/delete. لذلك أي
-- إدراج جديد (مثل باقة مسودة) كان يفشل بقيد audit_logs_operation_check
-- وتُلغى معه معاملة upsert_package كلها. لا نزيل القيد؛ نترجم اسم حدث
-- PostgreSQL إلى مفردات السجل المعتمدة.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare row_id text;
begin
  row_id := coalesce(to_jsonb(new)->>'id', to_jsonb(old)->>'id', to_jsonb(new)->>'ticket_no', to_jsonb(old)->>'ticket_no');
  insert into public.audit_logs(actor_id, entity_type, entity_id, operation, before_value, after_value)
  values (
    auth.uid(), tg_table_name, coalesce(row_id, '?'),
    case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'update' when 'DELETE' then 'delete' end,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

insert into public.schema_migrations(version, note) values
  ('20260918_fix_audit_create_operation', 'إصلاح سجل التدقيق عند إدراج صف جديد')
on conflict (version) do nothing;
