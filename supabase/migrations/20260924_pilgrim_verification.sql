-- ════════════════════════════════════════════════════════════════════
-- 20260924 — تحقّق الموظف من بيانات المعتمر يُحفظ على المعتمر
--
--   كانت حالة التحقق تعيش في ذاكرة الشاشة وحدها: كل فتحٍ لصفحة الطلب
--   يعيد المعتمرين «بانتظار التحقق»، فيُسأل الموظف عمّا أجابه، ولا
--   تعرف القاعدة من تحقّق ولا متى. صارت صفةً للمعتمر نفسه:
--     verify      : null = بانتظار التحقق · verified · error = يوجد خطأ
--                   · stale = عُدِّلت البيانات بعد التحقق فيلزم تحقّقٌ جديد
--     verified_at : وقت التحقق (نصّ ISO)
--     verified_by : اسم الموظف المتحقِّق
--
-- ⚠️ صُحِّح هذا الملفّ في ٢٠٢٦-٠٩-١٩ ولم يكن قد شُغِّل على الإنتاج بعد.
--
--   النسخة الأولى منه كانت تحمل جسد `upsert_booking` منسوخاً من ترحيلٍ
--   سابقٍ لـ20260910، فكان تشغيلها يضيف الأعمدة الثلاثة ويمحو معها ثلاثة
--   حرّاسٍ نزلت في الموجة الخامسة: فحص سعة الرحلة (seats_unavailable)،
--   وحساب الإجمالي في القاعدة (compute_booking_total) بدل الوثوق بما
--   يرسله المتصفّح، وكتابة توزيع الغرف في booking_rooms. أي أن إصلاح
--   التحقق كان سيكسر السعر والسكن والسعة معاً.
--
--   هذه هي العلّة العامّة في نسخ الدوالّ الطويلة بين الترحيلات: النسخة
--   تتفارق مع أصلها عند أول تعديلٍ يُنسى في إحداها. الجسد أدناه منقولٌ
--   من 20260910 كما هو، ولم يُزد عليه إلا الأعمدة الثلاثة في إدراج
--   المعتمرين — لا سطر غيرها.
--
-- ── أثر عدم تشغيله (ما كان يراه الموظف) ──
--   الشاشة تكتب `verify` في المستند، والدالّة القديمة لا تعرف المفتاح
--   فتتجاهله بلا خطأ، ثم يعيد الاشتراك اللحظي جلب المعتمرين فيقرؤهم
--   بلا تحقّق. فيضغط الموظف «تم التحقق» فيرتدّ الطلب إلى خطوة التحقق —
--   ويُسجَّل الحدث في سجلّ الطلب في كل مرّة، فيمتلئ السجلّ بمحاولاتٍ
--   لا أثر لها. وقبل شاشة المسار كان التحقق حالةَ جلسةٍ فلا يُعطِّل شيئاً؛
--   بعدها صار بوّابةَ خطوة المقاعد، فصار تعطيلاً كاملاً.
--
-- آمن للتشغيل مرّةً أو أكثر. يُشغَّل قبل 20261004 (تقرأ دالّته verify).
-- الصقه في: Supabase → SQL Editor → Run.
-- ════════════════════════════════════════════════════════════════════

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
--   جسد 20260910 بحذافيره — السعة والسعر والغرف — ومعه الأعمدة الثلاثة.
create or replace function public.upsert_booking(doc jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare
  v      text := doc->>'id';
  tid    text := nullif(doc->>'tripId','');
  n      int  := greatest(coalesce((doc->>'persons')::int,1),1);
  st     text := coalesce(doc->>'status','');
  cap    int;
  used   int;
  old_r  record;
  v_rooms jsonb := case when doc ? 'rooms' then coalesce(doc->'rooms','[]') else null end;
  v_total numeric;
  v_recalc boolean := false;
  v_disc  numeric;
begin
  if not public.can_write_staff() then raise exception 'forbidden'; end if;

  if tid is not null and st not in ('cancelled','rejected') then
    select seats into cap from trips where id = tid for update;
    if cap is null then raise exception 'trip_not_found:%', tid; end if;
    select coalesce(sum(b.persons),0) into used
      from bookings b
     where b.trip_id = tid
       and b.status not in ('cancelled','rejected')
       and b.id is distinct from v;
    if used + n > cap then
      raise exception 'seats_unavailable:المتاح % مقعداً والمطلوب %',
        greatest(cap - used, 0), n;
    end if;
  end if;

  select * into old_r from bookings where id = v;

  if old_r.id is null then
    v_recalc := true;
  elsif old_r.trip_id is distinct from tid or old_r.persons is distinct from n then
    v_recalc := true;
  elsif v_rooms is not null and public.rooms_json_sig(v_rooms) <> public.booking_rooms_sig(v) then
    v_recalc := true;
  end if;

  if v_recalc then
    v_total := public.compute_booking_total(
      tid, n,
      coalesce(v_rooms, (select coalesce(jsonb_agg(jsonb_build_object(
                           'tierId', br.tier_id, 'type', br.type,
                           'persons', br.persons, 'perNight', br.per_night) order by br.sort), '[]'::jsonb)
                          from booking_rooms br where br.booking_id = v)));
    v_disc := coalesce(old_r.discount_percent, 0);
    if v_disc > 0 then v_total := round(v_total * (1 - v_disc/100.0), 2); end if;
    /* حسابٌ صفري (رحلة بلا سعر ولا غرف) لا يمحو مبلغاً قائماً. */
    if v_total <= 0 and old_r.id is not null then v_total := coalesce(old_r.total, 0); end if;
  else
    v_total := coalesce(old_r.total, 0);
  end if;

  insert into bookings(id,trip_id,package_id,client_name,client_phone,room_type,persons,total,status,payment_status,
    pay_method,txn_no,pay_date,created_at,staff,created_by,branch_id,source,sent_date)
  values(v,tid,nullif(doc->>'packageId',''),doc->>'clientName',doc->>'clientPhone',doc->>'roomType',n,
    v_total,doc->>'status',doc->>'paymentStatus',doc->>'payMethod',doc->>'txnNo',doc->>'payDate',
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

  /* الغرف تُكتب فقط إن حمل المستند المفتاح: صفّ حجزٍ بلا rooms (شاشة
     قديمة أو حجز داخلي) كان سيمحو توزيع حجزٍ عام بمجرّد تغيير حالته. */
  if v_rooms is not null then
    delete from booking_rooms where booking_id=v;
    insert into booking_rooms(booking_id,tier_id,type,persons,per_night,sort)
      select v,nullif(e->>'tierId',''),e->>'type',greatest(coalesce((e->>'persons')::int,1),1),(e->>'perNight')::numeric,(o-1)::int
      from jsonb_array_elements(v_rooms) with ordinality t(e,o);
  end if;
end $$;

revoke execute on function public.upsert_booking(jsonb) from public, anon;
grant  execute on function public.upsert_booking(jsonb) to authenticated;

insert into public.schema_migrations(version, note) values
  ('20260924_pilgrim_verification', 'تحقّق الموظف من المعتمر يُحفظ على المعتمر — مع الإبقاء على حرّاس السعة والسعر والغرف')
on conflict (version) do nothing;

-- تم.
