-- ════════════════════════════════════════════════════════════
-- تساهيل العمرة — Migration: تحقّق الموظف من بيانات المعتمر يُحفظ مرّةً واحدة
--
--   كانت حالة التحقق تعيش في ذاكرة الشاشة وحدها: كل فتحٍ لصفحة الطلب
--   يعيد المعتمرين «بانتظار التحقق»، فيُسأل الموظف عمّا أجابه، ولا
--   تعرف القاعدة من تحقّق ولا متى. صارت صفةً للمعتمر نفسه:
--     verify      : null = بانتظار التحقق · verified · error = يوجد خطأ
--                   · stale = عُدِّلت البيانات بعد التحقق فيلزم تحقّقٌ جديد
--     verified_at : وقت التحقق (نصّ ISO)
--     verified_by : اسم الموظف المتحقِّق
--
--   والانتقال بين مراحل الطلب لا يمسّها، لأنها ليست في الطلب.
--
-- آمن للتشغيل على قاعدة موجودة. يُشغَّل بعد 20260908_wave1_guards.
-- الصقه في: Supabase → SQL Editor → Run.
-- ════════════════════════════════════════════════════════════

alter table public.booking_pilgrims add column if not exists verify      text;
alter table public.booking_pilgrims add column if not exists verified_at text;
alter table public.booking_pilgrims add column if not exists verified_by text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'booking_pilgrims_verify_chk') then
    alter table public.booking_pilgrims add constraint booking_pilgrims_verify_chk
      check (verify is null or verify in ('verified', 'error', 'stale'));
  end if;
end $$;

-- ═══════════════ البيانات القديمة ═══════════════
--   الطلب لا يُقبل إلا بعد تحقّق الموظف من جميع معتمريه — هذا كان
--   مفروضاً في الشاشة قبل هذا الترحيل. فكل طلبٍ تجاوز المراجعة فعلاً
--   قد تُحقِّق من معتمريه، وإبقاؤهم «بانتظار التحقق» بعد الترحيل يكذب
--   على الموظف ويطلب منه مراجعةً تمّت. تاريخ التحقق غير معروف فيُنسب
--   إلى تاريخ إنشاء الطلب، والمتحقِّق غير معروف فيبقى فارغاً.
update public.booking_pilgrims p
set verify = 'verified', verified_at = b.created_at
from public.bookings b
where b.id = p.booking_id
  and p.verify is null
  and b.status in ('accepted', 'awaiting_payment', 'paid', 'verifying', 'verified', 'confirmed');

-- ═══════════════ حفظ الحجز من لوحة الموظف ═══════════════
--   نفس الدالّة مع الأعمدة الثلاثة. الحارس can_write_staff باقٍ كما هو.
create or replace function public.upsert_booking(doc jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare v text := doc->>'id';
begin
  -- الطلبات/الرحلات: مسموحة لأي موظف وسياق الخادم — لا للمستفيد ولا للمجهول
  if not public.can_write_staff() then raise exception 'forbidden'; end if;
  insert into bookings(id,trip_id,package_id,client_name,client_phone,room_type,persons,total,status,payment_status,
    pay_method,txn_no,pay_date,created_at,staff,created_by,branch_id,source,sent_date)
  values(v,nullif(doc->>'tripId',''),nullif(doc->>'packageId',''),doc->>'clientName',doc->>'clientPhone',doc->>'roomType',(doc->>'persons')::int,
    (doc->>'total')::numeric,doc->>'status',doc->>'paymentStatus',doc->>'payMethod',doc->>'txnNo',doc->>'payDate',
    doc->>'createdAt',doc->>'staff',nullif(doc->>'createdBy',''),nullif(doc->>'branchId',''),doc->>'source',doc->>'sentDate')
  on conflict(id) do update set trip_id=excluded.trip_id,package_id=excluded.package_id,client_name=excluded.client_name,client_phone=excluded.client_phone,
    room_type=excluded.room_type,persons=excluded.persons,total=excluded.total,status=excluded.status,
    payment_status=excluded.payment_status,pay_method=excluded.pay_method,txn_no=excluded.txn_no,pay_date=excluded.pay_date,
    created_at=excluded.created_at,staff=excluded.staff,created_by=excluded.created_by,branch_id=excluded.branch_id,
    source=excluded.source,sent_date=excluded.sent_date;
  delete from booking_pilgrims where booking_id=v;
  insert into booking_pilgrims(booking_id,name,doc_type,id_number,nationality,gender,age_group,birth_date,phone,seat_no,sort,verify,verified_at,verified_by)
    select v,e->>'name',nullif(e->>'docType',''),e->>'idNumber',e->>'nationality',e->>'gender',nullif(e->>'ageGroup',''),e->>'birthDate',e->>'phone',nullif(e->>'seat','')::int,(o-1)::int,
      nullif(e->>'verify',''),nullif(e->>'verifiedAt',''),nullif(e->>'verifiedBy','')
    from jsonb_array_elements(coalesce(doc->'pilgrims','[]')) with ordinality t(e,o);
  delete from booking_seats where booking_id=v;
  insert into booking_seats(booking_id,seat_no,sort)
    select v,(e)::int,(o-1)::int from jsonb_array_elements_text(coalesce(doc->'seats','[]')) with ordinality t(e,o);
end $$;

insert into public.schema_migrations(version, note) values
  ('20260924_pilgrim_verification', 'تحقّق الموظف من المعتمر يُحفظ على المعتمر — مرّة واحدة لا مرّة في كل مرحلة')
on conflict (version) do nothing;

-- تم.
