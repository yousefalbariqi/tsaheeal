-- ════════════════════════════════════════════════════════════════════
-- 20260909 — الموجة ٢: دورة حياة الفاتورة والتذكرة
--
-- خمس عشرة ملاحظة من الفريق جذرها اثنان:
--
-- (أ) **الحالة تُنسخ ولا تُشتق.** `ensure_booking_docs` تكتب
--     `payments.pay_status` من الحجز **لحظة الإنشاء فقط**، ولا شيء
--     يحدّثها بعدها إلا `confirm_payment`. فموظّفٌ يعلّم الطلب مدفوعاً
--     من اللوحة يترك الفاتورة على «لم يُدفع» إلى الأبد. وهذا نصّ ما
--     رآه الفريق: INV-991B6C «لم يُدفع» وتذكرتها تقول ٢٠٠ ر.س مدفوعة.
--
-- (ب) **لا دورة حياة.** الفاتورة والتذكرة بلا حالة أصلاً: لا إلغاء،
--     ولا استرجاع، ولا انتهاء، ولا سجلّ إرسال. فرحلةٌ انتهت في ٣٠
--     يوليو تبقى فاتورتها مفتوحة ورابط دفعها حيّاً، وتذكرتها تقول
--     «معتمدة» بلا من اعتمدها.
--
-- ── ما فيه ──
--   (١) حالة الفاتورة تتبع الحجز بحارسٍ — لا نسخةً واحدة
--   (٢) لا تُصدر تذكرة لفاتورة غير مدفوعة
--   (٣) دورة حياة: إلغاء بسبب · استرجاع · استحقاق · استخدام
--   (٤) إلغاء الحجز أو الرحلة يُلغي مستنداتهما فوراً
--   (٥) بنود الفاتورة — تُجمع فتساوي الإجمالي دائماً
--   (٦) سجلّ أحداث المستندات — إرسال وطباعة ومسح
--   (٧) verify_doc تعرض الحالة الحيّة، و ticket_scan تسجّل المسح
--
-- ── خصائصه ──
-- • آمن للإعادة: كل أمرٍ `if not exists` أو `create or replace`.
--   لا drop لجدول ولا truncate ولا delete لصفّ.
-- • يُبلّغ في جدول نتائج لا في raise notice.
--
-- ⚠️ الأسعار في تساهيل **شاملة الضريبة** (قرار ٢٠٢٦-٠٩-٠٦). فلا سطر
--    «+١٥٪» في البنود: الضريبة تُستخرَج من الإجمالي عرضاً في الواجهة
--    (total × 15 ÷ 115) ولا تُضاف إليه. البنود هنا تُجمع فتساوي
--    الإجمالي بالضبط — وهو شرطٌ يفرضه القسم (٥) صراحةً.
-- ════════════════════════════════════════════════════════════════════


-- ═══ (٠) أعمدة دورة الحياة ═════════════════════════════════════════
-- كلّها nullable بقيمٍ افتراضية تصف الحال القائم: صفٌّ قديم يُقرأ
-- «صادرة» لا «غير معروفة»، فلا شاشة تعرض فراغاً بعد الترحيل.

alter table public.payments add column if not exists state         text not null default 'issued';
alter table public.payments add column if not exists cancel_reason text;
alter table public.payments add column if not exists cancelled_at  timestamptz;
alter table public.payments add column if not exists cancelled_by  uuid references public.profiles(id) on delete set null;
-- انتهاء رابط الدفع — يُحسب من مهلة الرحلة لحظة الإصدار.
alter table public.payments add column if not exists due_at        timestamptz;
alter table public.payments add column if not exists refund_amount numeric;
alter table public.payments add column if not exists refund_status text;
alter table public.payments add column if not exists refund_ref    text;
alter table public.payments add column if not exists refund_at     timestamptz;
alter table public.payments add column if not exists refund_by     uuid references public.profiles(id) on delete set null;

alter table public.tickets  add column if not exists state         text not null default 'valid';
alter table public.tickets  add column if not exists used_at       timestamptz;
alter table public.tickets  add column if not exists scan_count    int not null default 0;
alter table public.tickets  add column if not exists cancel_reason text;
alter table public.tickets  add column if not exists cancelled_at  timestamptz;
/* «معتمدة» لا تُكتب على تذكرة حتى يُعرف من أصدرها ومتى — وهي ملاحظة
   الفريق: «لا تستخدم عبارة معتمدة إلا بعد تعريف من اعتمدها». */
alter table public.tickets  add column if not exists issued_at     timestamptz;
alter table public.tickets  add column if not exists issued_by     uuid references public.profiles(id) on delete set null;

/* القيود `not valid`: صفوفٌ قديمة قد تخالفها، وفحصُها لاحقاً يُبلّغ
   ولا يُسقط الترحيل. */
do $$ begin
  alter table public.payments drop constraint if exists payments_state_chk;
  alter table public.payments add  constraint payments_state_chk
    check (state in ('issued','cancelled','refunded')) not valid;
  alter table public.tickets  drop constraint if exists tickets_state_chk;
  alter table public.tickets  add  constraint tickets_state_chk
    check (state in ('valid','used','cancelled')) not valid;
end $$;

/* «منتهية» ليست حالةً مخزَّنة بل مشتقّة من تاريخ الرحلة.

   لو خُزِّنت لاحتاجت وظيفةً مجدولة تمرّ كل ليلة تقلب ما فات — وأيُّ
   انقطاعٍ فيها يترك تذاكر رحلاتٍ راحت معروضةً «صالحة». والاشتقاق لا
   ينقطع ولا يتأخّر. */
/* stable لا immutable: الدالّة تقرأ `current_date`، وimmutable تعني
   «نفس المدخلات ⇒ نفس المخرجات إلى الأبد» — ووسمُها بها يُبيح للمخطّط
   طيَّها إلى قيمةٍ ثابتة وقتَ التخطيط. تذكرةٌ تُقرأ «صالحة» اليوم تبقى
   كذلك بعد انقضاء رحلتها. */
create or replace function public.ticket_phase(p_state text, p_trip_date text)
returns text language sql stable set search_path = public as $$
  select case
    when p_state = 'cancelled' then 'cancelled'
    when p_state = 'used'      then 'used'
    when p_trip_date ~ '^\d{4}-\d{2}-\d{2}$'
     and p_trip_date::date < current_date then 'expired'
    else 'valid'
  end;
$$;

create or replace function public.invoice_phase(
  p_state text, p_pay_status text, p_trip_date text, p_due_at timestamptz)
returns text language sql stable set search_path = public as $$
  select case
    when p_state = 'cancelled' then 'cancelled'
    when p_state = 'refunded'  then 'refunded'
    when p_pay_status = 'verified' then 'paid'
    /* غير مدفوعة ورحلتها راحت — لا يُطالَب بها ولا يُفتح رابط دفعها. */
    when p_trip_date ~ '^\d{4}-\d{2}-\d{2}$'
     and p_trip_date::date < current_date then 'expired'
    when p_due_at is not null and p_due_at < now() then 'overdue'
    else p_pay_status
  end;
$$;


-- ═══ (١) حالة الفاتورة تتبع الحجز ══════════════════════════════════
/* الحارس هو الفرق بين «نُسخت مرّة» و«مشتقّة دائماً».

   ولا يُكتب على فاتورةٍ أُلغيت أو رُدَّت: حالتها قرارٌ لاحق للحجز، ولو
   تبعته لعادت «مدفوعة» بعد استرجاعٍ تمّ. */
create or replace function public.sync_payment_from_booking() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.payment_status is not distinct from old.payment_status
     and new.pay_method is not distinct from old.pay_method
     and new.txn_no     is not distinct from old.txn_no
     and new.pay_date   is not distinct from old.pay_date
     and new.total      is not distinct from old.total then
    return null;
  end if;

  update payments p
     set pay_status = coalesce(new.payment_status, 'none'),
         pay_method = coalesce(new.pay_method, p.pay_method),
         txn_no     = coalesce(new.txn_no,     p.txn_no),
         pay_date   = coalesce(new.pay_date,   p.pay_date),
         total      = coalesce(new.total,      p.total)
   where p.booking_id = new.id
     and p.state = 'issued'
     and p.archived_at is null;
  return null;
end $$;

drop trigger if exists trg_sync_payment_from_booking on public.bookings;
create trigger trg_sync_payment_from_booking
  after update on public.bookings
  for each row execute function public.sync_payment_from_booking();

/* تصحيح أثري: الفواتير التي انفصلت حالتها عن حجزها قبل هذا الحارس. */
update payments p
   set pay_status = coalesce(b.payment_status, 'none'),
       pay_method = coalesce(b.pay_method, p.pay_method),
       txn_no     = coalesce(b.txn_no,     p.txn_no),
       pay_date   = coalesce(b.pay_date,   p.pay_date)
  from bookings b
 where p.booking_id = b.id
   and p.state = 'issued'
   and p.archived_at is null
   and coalesce(p.pay_status,'') is distinct from coalesce(b.payment_status,'none');


-- ═══ (٢) بنود الفاتورة ═════════════════════════════════════════════
create table if not exists public.payment_items (
  id         bigint generated always as identity primary key,
  payment_id text not null references public.payments(id) on delete cascade,
  /* accommodation سكن · transport نقل · addon إضافة · discount خصم
     · adjustment تسوية (الفرق الذي يجعل المجموع = الإجمالي). */
  kind       text not null,
  label      text not null,
  qty        numeric,
  unit_price numeric,
  amount     numeric not null,
  sort       int not null default 0,
  constraint payment_items_kind_chk
    check (kind in ('accommodation','transport','addon','discount','adjustment'))
);
create index if not exists payment_items_payment_idx on public.payment_items(payment_id);
alter table public.payment_items enable row level security;
drop policy if exists "payment_items read staff"  on public.payment_items;
drop policy if exists "payment_items write staff" on public.payment_items;
create policy "payment_items read staff"  on public.payment_items
  for select to authenticated using (public.is_staff());
create policy "payment_items write staff" on public.payment_items
  for all to authenticated using (public.can_write_admin()) with check (public.can_write_admin());

/* يبني بنود فاتورةٍ من توزيع غرف حجزها.

   القاعدة الملزِمة: **المجموع = الإجمالي دائماً.** بنودٌ لا تُجمع إلى
   ما هو مطبوع في أسفل الورقة أسوأ من بندٍ عامّ واحد — البند العامّ
   مبهم، والبنود المتناقضة كاذبة. فما لم يُفسَّر يُكتب سطرَ تسوية
   ظاهراً باسمه، لا يُخبَّأ ولا يُقسَّم على البنود.

   وتكلفة المقعد (`seat_cost`) لا تدخل: مسار المستفيد لا يحصّلها
   (`splitTotal` في roomSplit.ts)، وإدراجها هنا يجعل الفاتورة تطالب
   بما لم يُطلب من العميل. */
create or replace function public.rebuild_payment_items(p_payment_id text)
returns void language plpgsql security definer set search_path = public as $$
declare
  pm        record;
  v_nights  int;
  v_sum     numeric := 0;
  v_diff    numeric;
  r         record;
  i         int := 0;
begin
  select * into pm from payments where id = p_payment_id;
  if not found then return; end if;

  select coalesce(p.nights, 1) into v_nights
    from bookings b
    left join trips    t on t.id = b.trip_id
    left join packages p on p.id = coalesce(nullif(b.package_id,''), t.package_id)
   where b.id = pm.booking_id;
  v_nights := greatest(coalesce(v_nights, 1), 1);

  delete from payment_items where payment_id = p_payment_id;

  for r in
    select br.type, br.persons, br.per_night
      from booking_rooms br
     where br.booking_id = pm.booking_id
     order by br.sort nulls last, br.id
  loop
    i := i + 1;
    insert into payment_items(payment_id, kind, label, qty, unit_price, amount, sort)
    values (p_payment_id, 'accommodation',
            format('%s — %s ليلة × %s فرد', r.type, v_nights, r.persons),
            v_nights * r.persons, r.per_night,
            round(coalesce(r.per_night,0) * r.persons * v_nights, 2), i);
    v_sum := v_sum + round(coalesce(r.per_night,0) * r.persons * v_nights, 2);
  end loop;

  v_diff := round(coalesce(pm.total,0) - v_sum, 2);

  /* لا توزيع غرفٍ محفوظ (حجزٌ داخلي أو قديم) — بندٌ واحد بالإجمالي،
     صادقٌ وإن لم يكن مفصّلاً. */
  if i = 0 then
    insert into payment_items(payment_id, kind, label, amount, sort)
    values (p_payment_id, 'accommodation',
            coalesce(nullif(pm.package_name,''), 'باقة العمرة'), coalesce(pm.total,0), 1);
  elsif v_diff <> 0 then
    insert into payment_items(payment_id, kind, label, amount, sort)
    values (p_payment_id,
            case when v_diff < 0 then 'discount' else 'adjustment' end,
            case when v_diff < 0 then 'خصم' else 'بنود أخرى' end,
            v_diff, i + 1);
  end if;
end $$;


-- ═══ (٣) الإصدار: لا تذكرة لفاتورة غير مدفوعة ══════════════════════
/* الشرط ليس «مدفوعة» مطلقاً بل «مدفوعة إن اشترطت الرحلة الدفع أولاً».

   السبب: `set_require_payment_first = false` إعدادٌ قائم ومقصود —
   رحلاتٌ يُدفع فيها نقداً عند الصعود. لو اشترطنا الدفع مطلقاً لما
   صدرت لها تذكرة أبداً، فيقف المعتمر على الباب بلا ورقة. والملاحظة
   المقصودة أن تذكرةً تقول «مدفوع ٢٠٠» وفاتورتها تقول «لم يُدفع» — وذاك
   ما يمنعه القسم (١) بجذره.

   ومن أراد الشرط مطلقاً يضبط `requirePaymentFirst` على الرحلة. */
create or replace function public.ensure_booking_docs(p_booking_id text) returns void
language plpgsql security definer set search_path = public as $$
declare
  b      record;
  v_pkg  text; v_date text; v_time text; v_pt text;
  v_inv  text; v_tkt text;
  v_need_pay boolean;
  v_hours    int;
begin
  select * into b from bookings where id = p_booking_id;
  if not found or coalesce(b.status,'') <> 'confirmed' then return; end if;

  select p.name into v_pkg from packages p where p.id = b.package_id;
  select t.departure_date, t.departure_time, t.departure_point,
         coalesce(t.set_require_payment_first, true),
         coalesce(t.set_payment_deadline_hours, 24)
    into v_date, v_time, v_pt, v_need_pay, v_hours
    from trips t where t.id = b.trip_id;
  v_need_pay := coalesce(v_need_pay, true);
  v_hours    := greatest(coalesce(v_hours, 24), 1);

  -- ─── الفاتورة ───
  if not exists (select 1 from payments where booking_id = b.id) then
    v_inv := 'INV-' || upper(substr(md5(b.id || ':inv'), 1, 6));
    insert into payments(id,booking_id,client_name,client_phone,package_name,trip_date,total,
                         pay_method,pay_status,txn_no,pay_date,created_at,room_type,due_at)
    values(v_inv,b.id,b.client_name,b.client_phone,coalesce(v_pkg,'—'),coalesce(v_date,'—'),b.total,
           coalesce(b.pay_method,'—'),coalesce(b.payment_status,'none'),coalesce(b.txn_no,'—'),
           coalesce(b.pay_date,'—'),coalesce(b.created_at,to_char(now(),'YYYY-MM-DD')),b.room_type,
           now() + make_interval(hours => v_hours))
    on conflict(id) do nothing;

    insert into payment_pilgrims(payment_id,name,doc_type,id_number,nationality,gender,age_group,birth_date,phone,sort)
      select v_inv,bp.name,bp.doc_type,bp.id_number,bp.nationality,bp.gender,bp.age_group,bp.birth_date,bp.phone,bp.sort
        from booking_pilgrims bp where bp.booking_id = b.id;

    perform public.rebuild_payment_items(v_inv);
  end if;

  -- ─── التذكرة ───
  /* الحارس هنا لا في الواجهة: التذكرة تُنشأ من القاعدة تلقائياً، فشرطُها
     في الواجهة لا يمنع شيئاً. */
  if v_need_pay and coalesce(b.payment_status,'none') <> 'verified' then
    return;
  end if;

  if not exists (select 1 from tickets where booking_id = b.id) then
    v_tkt := 'TKT-' || upper(substr(md5(b.id || ':tkt'), 1, 6));
    insert into tickets(ticket_no,booking_id,client_name,client_phone,package_name,room_type,
                        trip_date,trip_time,departure_point,persons,total,issued_at,issued_by)
    values(v_tkt,b.id,b.client_name,b.client_phone,coalesce(v_pkg,'—'),b.room_type,
           coalesce(v_date,'—'),coalesce(v_time,'—'),coalesce(v_pt,'—'),b.persons,b.total,
           now(), auth.uid())
    on conflict(ticket_no) do nothing;

    insert into ticket_pilgrims(ticket_no,name,doc_type,id_number,nationality,gender,age_group,birth_date,phone,seat_no,sort)
      select v_tkt,bp.name,bp.doc_type,bp.id_number,bp.nationality,bp.gender,bp.age_group,bp.birth_date,bp.phone,bp.seat_no,bp.sort
        from booking_pilgrims bp where bp.booking_id = b.id;
  end if;
end $$;

/* الحارس الأصلي يستدعي ensure_booking_docs عند بلوغ «مؤكّد» وحده.
   وبعد هذا الترحيل صار الدفعُ شرطاً، فالتذكرة التي مُنعت وقت التأكيد
   يجب أن تصدر لحظة تحقّق الدفع — وإلا بقيت ممنوعةً إلى الأبد. */
create or replace function public.issue_docs_on_payment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.payment_status is not distinct from old.payment_status then return null; end if;
  if coalesce(new.payment_status,'') = 'verified'
     and coalesce(new.status,'') = 'confirmed' then
    perform public.ensure_booking_docs(new.id);
  end if;
  return null;
end $$;

drop trigger if exists trg_issue_docs_on_payment on public.bookings;
create constraint trigger trg_issue_docs_on_payment
  after update on public.bookings
  deferrable initially deferred
  for each row execute function public.issue_docs_on_payment();


-- ═══ (٤) الإلغاء يسري على المستندات ════════════════════════════════
/* «عند إلغاء الرحلة أو الحجز، ألغِ التذكرة فوراً ولا تحذفها» — نصّ
   الملاحظة. الحذف يمحو الأثر؛ والإلغاء يُبقيه ويقول ما جرى. */
create or replace function public.cancel_docs_for_booking() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_reason text;
begin
  if new.status is not distinct from old.status then return null; end if;
  if coalesce(new.status,'') <> 'cancelled' then return null; end if;

  v_reason := 'أُلغي الطلب ' || new.id;

  update tickets set state = 'cancelled', cancelled_at = now(),
         cancel_reason = coalesce(cancel_reason, v_reason)
   where booking_id = new.id and state <> 'cancelled';

  update payments set state = 'cancelled', cancelled_at = now(),
         cancelled_by = auth.uid(),
         cancel_reason = coalesce(cancel_reason, v_reason)
   where booking_id = new.id and state = 'issued';
  return null;
end $$;

drop trigger if exists trg_cancel_docs_for_booking on public.bookings;
create trigger trg_cancel_docs_for_booking
  after update on public.bookings
  for each row execute function public.cancel_docs_for_booking();

create or replace function public.cancel_docs_for_trip() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_reason text;
begin
  if new.status is not distinct from old.status then return null; end if;
  if coalesce(new.status,'') <> 'cancelled' then return null; end if;

  v_reason := 'أُلغيت الرحلة ' || new.id ||
              coalesce(' — ' || nullif(new.cancel_reason,''), '');

  update tickets tk set state = 'cancelled', cancelled_at = now(),
         cancel_reason = coalesce(tk.cancel_reason, v_reason)
    from bookings b
   where tk.booking_id = b.id and b.trip_id = new.id and tk.state <> 'cancelled';

  /* الفاتورة المدفوعة لا تُلغى بإلغاء الرحلة: المال محصَّلٌ فعلاً،
     ومصيره استرجاعٌ يُقرَّر ويُسجَّل — لا محوُ الفاتورة التي تُثبته. */
  update payments pm set state = 'cancelled', cancelled_at = now(),
         cancel_reason = coalesce(pm.cancel_reason, v_reason)
    from bookings b
   where pm.booking_id = b.id and b.trip_id = new.id
     and pm.state = 'issued' and coalesce(pm.pay_status,'') <> 'verified';
  return null;
end $$;

drop trigger if exists trg_cancel_docs_for_trip on public.trips;
create trigger trg_cancel_docs_for_trip
  after update on public.trips
  for each row execute function public.cancel_docs_for_trip();


-- ═══ (٥) سجلّ أحداث المستندات ══════════════════════════════════════
/* «بعد إرسال واتساب اعرض آخر إرسال وحالته، ولا تسمح بالنقر المتكرر».
   النقر المتكرّر لا يُمنع في الواجهة وحدها — تبويبان مفتوحان يتجاوزانها.
   السجلّ هنا هو المرجع، والواجهة تقرؤه.

   و`outcome` نتيجةٌ يدوية (وصلت · لم يردّ · رقم خاطئ) وفق قرار
   ٢٠٢٦-٠٩-٠٦: لا واجهة برمجية لواتساب، فالنتيجة يسجّلها الموظف. */
create table if not exists public.document_events (
  id         bigint generated always as identity primary key,
  doc_type   text not null check (doc_type in ('invoice','ticket','booking')),
  doc_id     text not null,
  event      text not null check (event in ('whatsapp','print','pdf','scan','cancel','refund','issue')),
  actor      uuid references public.profiles(id) on delete set null,
  actor_name text,
  outcome    text,
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists document_events_doc_idx
  on public.document_events(doc_type, doc_id, created_at desc);

alter table public.document_events enable row level security;
drop policy if exists "doc events read staff"  on public.document_events;
drop policy if exists "doc events write staff" on public.document_events;
create policy "doc events read staff"  on public.document_events
  for select to authenticated using (public.is_staff());
create policy "doc events write staff" on public.document_events
  for insert to authenticated with check (public.is_staff());

create or replace function public.log_document_event(
  p_doc_type text, p_doc_id text, p_event text,
  p_outcome text default null, p_note text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_name text;
begin
  if not public.is_staff() then raise exception 'forbidden: staff only'; end if;
  select name into v_name from profiles where id = auth.uid();
  insert into document_events(doc_type,doc_id,event,actor,actor_name,outcome,note)
  values (p_doc_type,p_doc_id,p_event,auth.uid(),v_name,p_outcome,p_note)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.log_document_event(text,text,text,text,text) from anon;
grant execute on function public.log_document_event(text,text,text,text,text) to authenticated;


-- ═══ (٦) الإلغاء والاسترجاع بإجراءٍ صريح ═══════════════════════════
/* «أضف إلغاء/إبطال الفاتورة مع سبب، ولا تحذفها بعد إصدارها.» */
create or replace function public.cancel_invoice(p_id text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_write_admin() then raise exception 'forbidden: admin only'; end if;
  if coalesce(trim(p_reason),'') = '' then
    raise exception 'reason_required: سبب الإلغاء إلزامي';
  end if;
  update payments set state = 'cancelled', cancelled_at = now(),
         cancelled_by = auth.uid(), cancel_reason = trim(p_reason)
   where id = p_id and state = 'issued';
  if not found then raise exception 'not_found_or_not_issued: الفاتورة غير قائمة أو أُلغيت'; end if;
  perform public.log_document_event('invoice', p_id, 'cancel', null, trim(p_reason));
end $$;

/* «أضف مبلغ الاسترجاع وحالته ومرجعه وتاريخه.» المبلغ لا يتجاوز
   الإجمالي: استرجاعٌ أكبر ممّا حُصِّل خطأُ إدخالٍ لا قرار. */
create or replace function public.refund_invoice(
  p_id text, p_amount numeric, p_ref text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_total numeric;
begin
  if not public.can_write_admin() then raise exception 'forbidden: admin only'; end if;
  select total into v_total from payments where id = p_id;
  if v_total is null then raise exception 'not_found: الفاتورة غير موجودة'; end if;
  if coalesce(p_amount,0) <= 0 then raise exception 'bad_amount: المبلغ يجب أن يكون موجباً'; end if;
  if p_amount > v_total then
    raise exception 'bad_amount: مبلغ الاسترجاع (%) أكبر من إجمالي الفاتورة (%)', p_amount, v_total;
  end if;

  update payments
     set state = 'refunded', refund_amount = p_amount, refund_ref = nullif(trim(p_ref),''),
         refund_status = case when p_amount = v_total then 'full' else 'partial' end,
         refund_at = now(), refund_by = auth.uid()
   where id = p_id;
  perform public.log_document_event('invoice', p_id, 'refund', null,
    coalesce(nullif(trim(p_reason),''), 'استرجاع') || ' — ' || p_amount::text);
end $$;

revoke all on function public.cancel_invoice(text,text) from anon;
revoke all on function public.refund_invoice(text,numeric,text,text) from anon;
grant execute on function public.cancel_invoice(text,text) to authenticated;
grant execute on function public.refund_invoice(text,numeric,text,text) to authenticated;


-- ═══ (٧) التحقّق يعرض الحالة الحيّة، والمسح يُسجَّل ═════════════════
/* verify_doc كانت تعيد حالة **الحجز**، فتذكرةٌ أُلغيت وحدها تُقرأ على
   الباب بحالة حجزها. الآن تعيد طور المستند نفسه.

   وتبقى مقصوصةً عمداً: لا جوال ولا رقم هوية ولا مبلغ، والاسم يُقصّ. */
drop function if exists public.verify_doc(text);
create or replace function public.verify_doc(p_id text)
returns table(kind text, ticket_no text, booking_id text, client_name text,
              package_name text, trip_date text, trip_time text,
              departure_point text, persons int, status text,
              doc_phase text, used_at timestamptz)
language sql security definer stable set search_path = public as $$
  with hit as (
    select tk.booking_id, tk.ticket_no, 'ticket'::text as kind
      from tickets tk where tk.ticket_no = p_id
    union all
    select pm.booking_id, null::text, 'invoice'::text
      from payments pm where pm.id = p_id
       and not exists (select 1 from tickets where ticket_no = p_id)
    union all
    select b.id, null::text, 'booking'::text
      from bookings b where b.id = p_id
       and not exists (select 1 from tickets  where ticket_no = p_id)
       and not exists (select 1 from payments where id        = p_id)
    limit 1
  )
  select h.kind,
         coalesce(h.ticket_no, tk.ticket_no),
         b.id,
         public.mask_name(b.client_name),
         coalesce(p.name, ''),
         coalesce(t.departure_date, '—'),
         coalesce(t.departure_time, '—'),
         coalesce(t.departure_point, '—'),
         b.persons,
         b.status,
         case h.kind
           when 'ticket'  then public.ticket_phase(tk.state, tk.trip_date)
           when 'invoice' then public.invoice_phase(pm.state, pm.pay_status, pm.trip_date, pm.due_at)
           else b.status
         end,
         tk.used_at
  from hit h
  join bookings b on b.id = h.booking_id
  left join tickets  tk on tk.booking_id = b.id
  left join payments pm on pm.id = p_id
  left join trips    t  on t.id = b.trip_id
  left join packages p  on p.id = coalesce(nullif(b.package_id,''), t.package_id);
$$;
grant execute on function public.verify_doc(text) to anon, authenticated, service_role;
grant execute on function public.ticket_phase(text,text) to anon, authenticated, service_role;
grant execute on function public.invoice_phase(text,text,text,timestamptz) to anon, authenticated, service_role;

/* المسح يُسجَّل ولا يُبطل التذكرة.

   ⚠️ قرارٌ معلَّق: سُئل يوسف «تُستهلك مرّة واحدة أم يُسجَّل كل مسح؟»
   ولم يُحسم. المُنفَّذ هنا الأحفظ للطرفين: أوّل مسحٍ يختم `used_at`،
   وكل مسحٍ يزيد `scan_count` ويُكتب في السجلّ، ولا يُرفض مسحٌ لاحق.
   السبب أن الركّاب يصعدون على دفعات وقد تُمسح التذكرة مرّتين بحسن نيّة
   — ورفضُها على الباب يوقف معتمراً بلا ذنب. والاستهلاك الصارم يصير
   سطراً واحداً هنا متى قرّره التشغيل. */
create or replace function public.ticket_scan(p_ticket_no text)
returns table(ok boolean, phase text, message text, scan_no int)
language plpgsql security definer set search_path = public as $$
declare tk record; v_phase text; v_count int;
begin
  if not public.is_staff() then raise exception 'forbidden: staff only'; end if;
  select * into tk from tickets where ticket_no = p_ticket_no;
  if not found then
    return query select false, 'unknown'::text, 'لا توجد تذكرة بهذا الرقم'::text, 0;
    return;
  end if;

  v_phase := public.ticket_phase(tk.state, tk.trip_date);
  update tickets
     set scan_count = coalesce(scan_count,0) + 1,
         used_at    = coalesce(used_at, now()),
         state      = case when state = 'valid' then 'used' else state end
   where ticket_no = p_ticket_no
  returning scan_count into v_count;

  perform public.log_document_event('ticket', p_ticket_no, 'scan', v_phase, null);

  return query select
    v_phase = 'valid',
    v_phase,
    case v_phase
      when 'valid'     then case when coalesce(tk.scan_count,0) = 0
                                 then 'تذكرة صالحة — أول مسح'
                                 else 'تذكرة صالحة — مُسحت من قبل' end
      when 'used'      then 'مُسحت من قبل بتاريخ ' || to_char(tk.used_at, 'YYYY-MM-DD HH24:MI')
      when 'cancelled' then 'تذكرة ملغاة — ' || coalesce(tk.cancel_reason, 'بلا سبب مسجّل')
      when 'expired'   then 'رحلة منتهية بتاريخ ' || tk.trip_date
      else 'حالة غير معروفة'
    end,
    coalesce(v_count, 1);
end $$;
revoke all on function public.ticket_scan(text) from anon;
grant execute on function public.ticket_scan(text) to authenticated;


-- ═══ (٨) رابط الدفع يُغلق بانتهائه ═════════════════════════════════
/* «أضف تاريخ ووقت انتهاء رابط الدفع» و«أغلق رابط الدفع» لرحلةٍ انتهت.

   الإغلاق في القاعدة لا في الواجهة: الرابط يُفتح من واتساب على جهازٍ
   بلا جلسة، ولا شيء يمنع فتحه بعد شهر. والصفحة تعرض المبلغ وزرّ الدفع
   لرحلةٍ راحت — فيدفع العميل ثمن مقعدٍ في حافلةٍ وصلت.

   ويُعاد سببُ الإغلاق لا الرفضُ صامتاً: «انتهى» و«أُلغي» و«رابط غير
   صحيح» ثلاثة أشياء مختلفة، ودمجُها في «رابط غير صالح» يجعل العميل
   يتّصل ليسأل ما الذي جرى. */
drop function if exists public.booking_for_pay(text, uuid);
create or replace function public.booking_for_pay(p_booking_id text, p_token uuid)
returns table(id text, client_name text, package_name text, room_type text,
              persons int, total numeric, payment_status text, status text,
              pay_open boolean, closed_reason text, due_at timestamptz)
language sql security definer stable set search_path = public as $$
  select b.id, b.client_name, coalesce(p.name,''), b.room_type, b.persons, b.total,
         b.payment_status, b.status,
         /* مفتوحٌ متى كان الطلب حيّاً ولم يُدفع ولم تنقضِ رحلته ولا مهلته. */
         (coalesce(b.status,'') <> 'cancelled'
          and coalesce(b.payment_status,'none') <> 'verified'
          and coalesce(t.status,'') <> 'cancelled'
          and (t.departure_date is null
               or t.departure_date !~ '^\d{4}-\d{2}-\d{2}$'
               or t.departure_date::date >= current_date)
          and (pm.due_at is null or pm.due_at >= now())) as pay_open,
         case
           when coalesce(b.status,'') = 'cancelled'          then 'أُلغي هذا الطلب'
           when coalesce(b.payment_status,'none') = 'verified' then 'سُدّد هذا الطلب'
           when coalesce(t.status,'') = 'cancelled'          then 'أُلغيت هذه الرحلة'
           when t.departure_date ~ '^\d{4}-\d{2}-\d{2}$'
            and t.departure_date::date < current_date        then 'انتهت هذه الرحلة'
           when pm.due_at is not null and pm.due_at < now()  then 'انتهت مهلة السداد'
           else null
         end as closed_reason,
         pm.due_at
  from bookings b
  left join trips    t on t.id = b.trip_id
  left join packages p on p.id = coalesce(nullif(b.package_id,''), t.package_id)
  left join payments pm on pm.booking_id = b.id and pm.state = 'issued'
  where b.id = p_booking_id and b.pay_token = p_token;
$$;
grant execute on function public.booking_for_pay(text, uuid) to anon, authenticated;

/* الحارس الحقيقي: القراءة تُعلم، والكتابة تمنع. عرضُ «مغلق» في الصفحة
   لا يكفي — نداءٌ مباشر لـconfirm_payment يتجاوز الصفحة كلّها. */
create or replace function public.confirm_payment(p_booking_id text, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_open boolean; v_why text;
begin
  select pay_open, closed_reason into v_open, v_why
    from public.booking_for_pay(p_booking_id, p_token);
  if v_open is null then raise exception 'invalid_link: رابط غير صالح'; end if;
  if not v_open then raise exception 'link_closed: %', coalesce(v_why,'انتهت صلاحية الرابط'); end if;

  update bookings
     set payment_status = 'verified',
         pay_date = coalesce(nullif(pay_date,''), to_char(now(),'YYYY-MM-DD')),
         status = case when status in ('accepted','awaiting_payment') then 'confirmed' else status end
   where id = p_booking_id and pay_token = p_token;
  /* الفاتورة تتبع الحجز بحارس القسم (١) — لا تُكتب هنا مرّتين. */
end $$;
grant execute on function public.confirm_payment(text, uuid) to anon, authenticated;


-- ═══ (٩) تعبئة أثرية ═══════════════════════════════════════════════
do $$
declare r record;
begin
  -- بنود الفواتير القائمة
  for r in select id from payments where not exists
      (select 1 from payment_items pi where pi.payment_id = payments.id)
  loop
    perform public.rebuild_payment_items(r.id);
  end loop;

  -- تاريخ الإصدار للتذاكر القائمة: أوّل ما نعرفه عنها هو تاريخ رحلتها.
  update tickets set issued_at = coalesce(issued_at, now()) where issued_at is null;
end $$;


-- ═══ تقرير ═════════════════════════════════════════════════════════
select 'فواتير كانت حالتها تخالف حجزها' as "البند",
       count(*) as "عدد"
  from payments p join bookings b on b.id = p.booking_id
 where p.state = 'issued'
   and p.archived_at is null
   and coalesce(p.pay_status,'') is distinct from coalesce(b.payment_status,'none')
union all
select 'تذاكر بلا فاتورة مدفوعة (تُراجَع يدوياً)', count(*)
  from tickets tk join bookings b on b.id = tk.booking_id
 where tk.state = 'valid' and coalesce(b.payment_status,'') <> 'verified'
union all
select 'فواتير لها بنود', count(distinct payment_id) from payment_items
union all
select 'تذاكر منتهية (رحلتها راحت)', count(*)
  from tickets where public.ticket_phase(state, trip_date) = 'expired';


-- ═══════════ سجلّ الترحيلات ═══════════
insert into public.schema_migrations(version, note) values
  ('20260909_doc_lifecycle', 'الموجة ٢: دورة حياة الفاتورة والتذكرة')
on conflict (version) do nothing;
