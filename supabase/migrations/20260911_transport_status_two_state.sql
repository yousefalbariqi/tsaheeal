-- المواصلات لا تحمل حالة «مسودة» أو «مخفية»: إما متاحة أو متوقفة.
update public.transports
set status = 'inactive'
where status is null or status not in ('active', 'inactive');

alter table public.transports alter column status set default 'inactive';

do $$ begin
  if exists (select 1 from pg_constraint where conname = 'transports_status_chk') then
    alter table public.transports drop constraint transports_status_chk;
  end if;
  alter table public.transports add constraint transports_status_chk
    check (status in ('active', 'inactive')) not valid;
end $$;
