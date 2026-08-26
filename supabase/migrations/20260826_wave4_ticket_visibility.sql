-- ════════════════════════════════════════════════════════════════════
-- 20260826 — الموجة ٤: التذكرة تصل صاحبها، والرمز يُقرأ
--
-- مشكلتان بقيتا بعد الموجة ٢، وكلتاهما في آخر خطوة من المسار — وهي
-- الخطوة التي عليها يُحكَم على النظام كلّه:
--
-- (١) الحارس trg_booking_confirm_docs يُصدر التذكرة في القاعدة، لكن
--     «طلباتي» في تطبيق المستفيد لا تعرف بها: my_public_bookings تعيد
--     حالة الحجز ولا تعيد رقم تذكرة ولا نقطة انطلاق. فالعميل يرى بعد
--     التأكيد مربّع رمزٍ وحده — بلا رقم ولا موعد ولا مكان يقف فيه.
--
-- (٢) رمز QR يرمّز الرابط /inv/:id/verify (انظر components/QRBlock.tsx)
--     وهو مسارٌ لا وجود له، فقاعدة rewrite في vercel.json تفتح الصفحة
--     الرئيسية. الماسح يحصل على صفحة استكشاف لا على تحقّق.
--
-- آمن وidempotent: لا drop لجدول ولا truncate.
-- ════════════════════════════════════════════════════════════════════


-- ▓▓▓▓▓▓▓▓▓▓ القسم ١ — «طلباتي» تحمل التذكرة ▓▓▓▓▓▓▓▓▓▓
/* drop لازم قبل create: تغيير returns table يغيّر توقيع الإرجاع،
   و create or replace وحدها ترفضه بـ
   "cannot change return type of existing function". */
drop function if exists public.my_public_bookings();
create or replace function public.my_public_bookings()
returns table(id text, status text, payment_status text, package_name text,
              trip_date text, trip_time text, persons int, total numeric,
              created_at text, submitted_at timestamptz,
              ticket_no text, departure_point text)
language sql security definer stable set search_path = public as $$
  select b.id, b.status, b.payment_status, coalesce(p.name,''),
         t.departure_date, t.departure_time, b.persons, b.total,
         b.created_at, b.submitted_at,
         tk.ticket_no, t.departure_point
  from (select auth.uid() as uid, public.auth_phone() as ph) me
  join bookings b
    on me.uid is not null
   and ( b.customer_id = me.uid
      or (b.customer_id is null and me.ph is not null
          and public.norm_phone(b.client_phone) = me.ph) )
  left join trips    t on t.id = b.trip_id
  left join packages p on p.id = coalesce(nullif(b.package_id,''), t.package_id)
  /* الانضمام على التذاكر لا القراءة منها بجلسة العميل: سياسات RLS
     تُغلق جدول tickets عن غير الموظفين، والدالة security definer
     تتجاوزها — فتُعيد تذكرة هذا الحجز وحده لا غير. */
  left join tickets  tk on tk.booking_id = b.id
  order by b.created_at desc;
$$;
revoke execute on function public.my_public_bookings() from public, anon;
grant  execute on function public.my_public_bookings() to authenticated;


-- ▓▓▓▓▓▓▓▓▓▓ القسم ٢ — صفحة التحقّق من الرمز ▓▓▓▓▓▓▓▓▓▓
/* ثلاثة أنواع معرّفات تصل هذا المسار، لأن ثلاث شاشات ترمّز الرمز:
   تذكرة (TKT-…) من لوحة التذاكر، وفاتورة (INV-…) من الفواتير،
   وحجز (TSH-…) من «طلباتي». الدالة تقبلها كلّها وتردّ على واحدة.

   ما يُعاد مقصوصٌ عمداً. معرّف الحجز أربعة أرقام — أي أنّ تخمينه ممكن
   بالعدّ لا بالحظّ. فلا يُعاد جوال ولا رقم هوية ولا مبلغ، والاسم
   يُقصّ إلى أول كلمة وحرف من الأخيرة («يوسف ا.») — يكفي موظّف الباب
   ليطابقه بالوثيقة، ولا يكفي عابراً ليبني منه قائمة أسماء.

   وحالة الحجز تُعاد كما هي: تذكرة حجزٍ أُلغي يجب أن تُقرأ «ملغى» على
   الباب لا «صالحة». */
create or replace function public.mask_name(p text) returns text
language sql immutable set search_path = public as $$
  select case
    when coalesce(trim(p),'') = '' then '—'
    when array_length(regexp_split_to_array(trim(p), '\s+'), 1) = 1 then trim(p)
    else (regexp_split_to_array(trim(p), '\s+'))[1] || ' ' ||
         left((regexp_split_to_array(trim(p), '\s+'))[
           array_length(regexp_split_to_array(trim(p), '\s+'), 1)], 1) || '.'
  end;
$$;

create or replace function public.verify_doc(p_id text)
returns table(kind text, ticket_no text, booking_id text, client_name text,
              package_name text, trip_date text, trip_time text,
              departure_point text, persons int, status text)
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
         b.status
  from hit h
  join bookings b on b.id = h.booking_id
  left join tickets  tk on tk.booking_id = b.id
  left join trips    t  on t.id = b.trip_id
  left join packages p  on p.id = coalesce(nullif(b.package_id,''), t.package_id);
$$;
/* مفتوحة للمجهول عمداً: من يمسح الرمز يقف على الباب بلا جلسة. */
grant execute on function public.verify_doc(text) to anon, authenticated, service_role;
grant execute on function public.mask_name(text)  to anon, authenticated, service_role;


-- ═══════════ سجلّ الترحيلات ═══════════
insert into public.schema_migrations(version, note) values
  ('20260826_wave4_ticket_visibility', 'تذكرة في «طلباتي» + صفحة تحقّق من الرمز')
on conflict (version) do nothing;
