-- 20261011 — تنبيه بريد الموظفين عند الطلبات الجديدة
--
-- الحدث يُخزَّن أولاً في صندوق إرسال داخلي، ثم يلتقطه Database Webhook
-- ويستدعي Edge Function. لا نرسل بريداً من trigger PostgreSQL مباشرةً:
-- الإرسال الشبكي قد يتأخر أو يفشل، أما الطلب نفسه فيجب أن يبقى محفوظاً.

create table if not exists public.staff_email_notifications (
  id uuid primary key default gen_random_uuid(),
  entity_table text not null check (entity_table in ('bookings', 'custom_requests')),
  entity_id text not null,
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  provider_message_id text,
  last_error text,
  sent_at timestamptz,
  retry_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_table, entity_id)
);

create index if not exists staff_email_notifications_queue_idx
  on public.staff_email_notifications(status, retry_after, created_at);

alter table public.staff_email_notifications enable row level security;
drop policy if exists "staff read notification delivery" on public.staff_email_notifications;
create policy "staff read notification delivery" on public.staff_email_notifications
  for select to authenticated using (public.can_write_staff());

-- يضع الطلب في الطابور مرّة واحدة فقط. يعمل trigger بصلاحية مالك الجدول،
-- فلا تمنع RLS عملية الحجز العامة من إضافة التنبيه.
create or replace function public.queue_staff_email_notification() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.staff_email_notifications(entity_table, entity_id)
  values (tg_table_name, new.id)
  on conflict (entity_table, entity_id) do nothing;
  return new;
end $$;

drop trigger if exists trg_queue_booking_email_notification on public.bookings;
create trigger trg_queue_booking_email_notification
  after insert on public.bookings
  for each row execute function public.queue_staff_email_notification();

drop trigger if exists trg_queue_custom_request_email_notification on public.custom_requests;
create trigger trg_queue_custom_request_email_notification
  after insert on public.custom_requests
  for each row execute function public.queue_staff_email_notification();

-- لا نسمح لطلبين متزامنين بإرسال البريد نفسه. تستدعيها Edge Function
-- بمفتاح service role قبل أن تتصل بـ Resend.
create or replace function public.claim_staff_email_notification(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update public.staff_email_notifications
     set status = 'sending',
         attempts = attempts + 1,
         updated_at = now()
   where id = p_id
     and status = 'queued';
  return found;
end $$;

revoke all on function public.claim_staff_email_notification(uuid) from public, anon, authenticated;
grant execute on function public.claim_staff_email_notification(uuid) to service_role;

-- لإعادة محاولة رسالة فشلت بعد تصحيح سبب المشكلة. تحديث status إلى queued
-- هو حدث Webhook جديد، لذلك يعاد الإرسال من دون تعديل السجل الأصلي.
create or replace function public.requeue_staff_email_notification(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_write_staff() then raise exception 'forbidden'; end if;
  update public.staff_email_notifications
     set status = 'queued',
         last_error = null,
         retry_after = null,
         updated_at = now()
   where id = p_id
     and status = 'failed';
  if not found then raise exception 'notification_not_failed_or_missing'; end if;
end $$;

revoke all on function public.requeue_staff_email_notification(uuid) from public, anon;
grant execute on function public.requeue_staff_email_notification(uuid) to authenticated;

comment on table public.staff_email_notifications is
  'صندوق إرسال بريد الموظفين: INSERT فيه يستدعي Edge Function عبر Database Webhook.';
