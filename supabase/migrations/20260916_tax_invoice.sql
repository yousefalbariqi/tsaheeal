-- ════════════════════════════════════════════════════════════════════
-- 20260916 — الفاتورة الضريبية (المرحلة الأولى): رقمٌ تسلسلي متّصل
--
-- قرار يوسف ٢٠٢٦-٠٩-٠٦: فاتورة ضريبية كاملة — المرحلة الأولى من الفوترة
-- الإلكترونية (فاتورة مبسّطة للأفراد): رقم ضريبي، ضريبة ١٥٪ **مستخرَجة
-- من الإجمالي** لأن الأسعار شاملة، رقم تسلسلي لا ينكسر، ورمز QR بصيغة
-- TLV. المرحلة الثانية (الربط مع «فاتورة»، XML، الختم) خارج النطاق حتى
-- يُعتمد في بوابة زاتكا.
--
-- ── ما فيه ──
--   (١) payments.serial_no: تسلسلٌ متّصل يُعطى عند الإدراج ولا يُعاد استعماله
--   (٢) تعبئة أثرية للفواتير القائمة بترتيب إصدارها
--
-- ما ليس هنا: الرقم الضريبي واسم البائع في app_settings (JSONB) وتُقرأ في
-- الواجهة — الترويسة و«فاتورة ضريبية» و TLV تظهر فقط حين يُضبط
-- vatNumber في الإعدادات. بلا رقمٍ فعلي تبقى «أوّلية غير ضريبية».
--
-- آمن للإعادة. لا يمسّ مبالغ.
-- ════════════════════════════════════════════════════════════════════

create sequence if not exists public.invoice_serial_seq start 1;
alter table public.payments add column if not exists serial_no bigint;
create unique index if not exists payments_serial_uniq on public.payments(serial_no) where serial_no is not null;

/* التسلسل عند الإدراج — لا عند العرض: رقمٌ يُحسب وقت الطباعة يتغيّر
   بتغيّر الفلاتر، والنظام يطلب رقماً ثابتاً متّصلاً. */
create or replace function public.assign_invoice_serial() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.serial_no is null then new.serial_no := nextval('public.invoice_serial_seq'); end if;
  return new;
end $$;
drop trigger if exists trg_payments_serial on public.payments;
create trigger trg_payments_serial before insert on public.payments
  for each row execute function public.assign_invoice_serial();

-- تعبئة أثرية بترتيب الإصدار، ثم تقدّم التسلسل إلى ما بعد آخر رقم.
do $$
declare r record; v_max bigint;
begin
  for r in select id from payments where serial_no is null order by created_at nulls last, id loop
    update payments set serial_no = nextval('public.invoice_serial_seq') where id = r.id;
  end loop;
  select coalesce(max(serial_no),0) into v_max from payments;
  perform setval('public.invoice_serial_seq', greatest(v_max,1), v_max > 0);
end $$;

-- ═══ تقرير ═════════════════════════════════════════════════════════
select 'فواتير أخذت رقماً تسلسلياً' as "البند", count(*)::text as "العدد" from payments where serial_no is not null
union all
select 'آخر رقم تسلسلي', coalesce(max(serial_no),0)::text from payments
union all
select 'الرقم الضريبي مضبوط في الإعدادات؟',
       case when exists (select 1 from app_settings where coalesce(pub->>'vatNumber','') <> '') then 'نعم — تُصدر فاتورة ضريبية'
            else 'لا — تبقى أوّلية غير ضريبية حتى يُضبط' end;

insert into public.schema_migrations(version, note) values
  ('20260916_tax_invoice', 'الفاتورة الضريبية (المرحلة الأولى): رقم تسلسلي متّصل للفواتير')
on conflict (version) do nothing;
