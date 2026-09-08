-- يحدد واجهة الدخول بعد رقم الجوال المسار المناسب فقط، بلا إعادة بريد أو هوية.
create or replace function public.customer_phone_account_exists(p_phone text)
returns boolean language sql security definer stable set search_path = public, auth as $$
  select exists (
    select 1 from auth.users u
    where public.norm_phone(u.phone) = public.norm_phone(p_phone)
  );
$$;

revoke all on function public.customer_phone_account_exists(text) from public;
grant execute on function public.customer_phone_account_exists(text) to anon, authenticated;

insert into public.schema_migrations(version, note) values
  ('20260923_customer_password_login', 'فحص مسار الدخول بكلمة المرور حسب رقم الجوال')
on conflict (version) do nothing;
