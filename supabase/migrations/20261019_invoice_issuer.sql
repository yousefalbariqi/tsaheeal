-- 20261019 — مصدر الفاتورة والتقفيلة اليومية
--
-- الفاتورة مستند مالي؛ اسم صاحب الطلب لا يجيب عن سؤال «من أصدرها؟».
-- نحفظ لقطة الحساب وقت إدراج الفاتورة، لا مرجعاً يُعاد قراءته لاحقاً:
-- تغيير اسم الموظف أو دوره بعد أسبوع لا يعيد كتابة مستند صادر.

alter table public.payments
  add column if not exists issued_at timestamptz,
  add column if not exists issued_by uuid references public.profiles(id) on delete set null,
  add column if not exists issued_by_name text,
  add column if not exists issued_by_role text;

create index if not exists payments_issued_by_at_idx
  on public.payments (issued_by, issued_at desc);

/* لا تُقبل هوية يرسلها المتصفح. عند الإدراج نأخذ حساب الموظف العامل
   فقط؛ الفاتورة التي ينشئها مسار العميل بلا موظف تُوسم «النظام» كي لا
   تُحسب في تقفيلة موظف على نحو مضلل. وعند التحديث تُعاد قيم اللقطة
   القديمة، فلا يستطيع upsert_payment أو تعديل يدوي تبديل مصدرها. */
create or replace function public.stamp_payment_issuer()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid;
  v_name text;
  v_role text;
begin
  if tg_op = 'UPDATE' then
    new.issued_at := old.issued_at;
    new.issued_by := old.issued_by;
    new.issued_by_name := old.issued_by_name;
    new.issued_by_role := old.issued_by_role;
    return new;
  end if;

  select p.id, p.name, p.role into v_actor, v_name, v_role
    from public.profiles p where p.id = auth.uid();

  new.issued_at := coalesce(new.issued_at, now());
  new.issued_by := v_actor;
  new.issued_by_name := coalesce(nullif(v_name, ''), 'النظام');
  new.issued_by_role := coalesce(nullif(v_role, ''), case when v_actor is null then 'النظام' else 'موظف الاستقبال' end);
  return new;
end $$;

drop trigger if exists trg_stamp_payment_issuer on public.payments;
create trigger trg_stamp_payment_issuer
before insert or update on public.payments
for each row execute function public.stamp_payment_issuer();

/* الفواتير السابقة لا نختلق لها موظف إصدار. إن كان الحجز الداخلي يحمل
   منشئاً موثقاً، تُعبّأ منه اللقطة؛ والباقي يبقى «سجل سابق» في العرض. */
update public.payments pm
   set issued_by = p.id,
       issued_by_name = p.name,
       issued_by_role = p.role,
       issued_at = coalesce(pm.issued_at, now())
  from public.bookings b
  join public.profiles p on p.id::text = b.created_by
 where pm.booking_id = b.id
   and pm.issued_by is null;

/* مصدرٌ واحدٌ للتقفيلة اليومية. المبالغ المحصلة وحدها تدخل تفصيل طرق
   الدفع، والفواتير الملغاة والمستردة تبقى أعداداً مستقلة للمراجعة. */
create or replace function public.daily_invoice_closure(p_day date default current_date)
returns table(
  issuer_id uuid, issuer_name text, issuer_role text,
  invoice_count bigint, invoices_total numeric,
  cash_total numeric, network_total numeric, transfer_total numeric, other_paid_total numeric,
  paid_invoices bigint, unpaid_invoices bigint, cancelled_invoices bigint, refunded_invoices bigint
)
language sql security definer stable set search_path = public as $$
  select
    p.issued_by,
    coalesce(nullif(p.issued_by_name, ''), 'سجل سابق') as issuer_name,
    coalesce(nullif(p.issued_by_role, ''), 'غير محدد') as issuer_role,
    count(*) as invoice_count,
    coalesce(sum(case when p.state = 'issued' then p.total else 0 end), 0) as invoices_total,
    coalesce(sum(case when p.state = 'issued' and p.pay_status = 'verified'
                         and coalesce(p.pay_method, '') ~* '(كاش|نقد|cash)'
                      then p.total else 0 end), 0) as cash_total,
    coalesce(sum(case when p.state = 'issued' and p.pay_status = 'verified'
                         and coalesce(p.pay_method, '') ~* '(شبكة|مدى|بطاق|network|card)'
                      then p.total else 0 end), 0) as network_total,
    coalesce(sum(case when p.state = 'issued' and p.pay_status = 'verified'
                         and coalesce(p.pay_method, '') ~* '(تحويل|transfer)'
                      then p.total else 0 end), 0) as transfer_total,
    coalesce(sum(case when p.state = 'issued' and p.pay_status = 'verified'
                         and coalesce(p.pay_method, '') !~* '(كاش|نقد|cash|شبكة|مدى|بطاق|network|card|تحويل|transfer)'
                      then p.total else 0 end), 0) as other_paid_total,
    count(*) filter (where p.state = 'issued' and p.pay_status = 'verified') as paid_invoices,
    count(*) filter (where p.state = 'issued' and coalesce(p.pay_status, 'none') <> 'verified') as unpaid_invoices,
    count(*) filter (where p.state = 'cancelled') as cancelled_invoices,
    count(*) filter (where p.state = 'refunded') as refunded_invoices
  from public.payments p
  where public.is_staff()
    and p.issued_at >= p_day
    and p.issued_at < p_day + interval '1 day'
  group by p.issued_by, p.issued_by_name, p.issued_by_role
  order by issuer_name;
$$;
revoke all on function public.daily_invoice_closure(date) from public, anon;
grant execute on function public.daily_invoice_closure(date) to authenticated;

insert into public.schema_migrations(version, note)
values ('20261019_invoice_issuer', 'مصدر الفاتورة التلقائي وأساس التقفيلة اليومية حسب الموظف المصدر')
on conflict (version) do nothing;
