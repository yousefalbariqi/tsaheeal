-- ════════════════════════════════════════════════════════════════════
-- 20260910 — موجة الطلبات: المسار مفروضٌ في القاعدة لا موصوفاً في الواجهة
--
-- سبع عشرة ملاحظةً من الفريق جذرها واحد: انتقالات الطلب كانت تُكتب من
-- المتصفّح مباشرةً (upsert_booking بحالةٍ جديدة)، فالقبول كتابتان
-- متعاقبتان (المقاعد ثم الحالة) قد تنجح أولاهما وتفشل الثانية، والرفض
-- بلا سبب، والإلغاء بلا أثرٍ مكتوب، والمبلغ يصل من الواجهة كما هو.
--
-- ── ما فيه ──
--   (١) أعمدة: تعيين الطلب لموظف · سبب الإغلاق · الخصم الموثَّق ·
--       بيانات عقد الفندق · مسؤول الطلب المخصّص وموعده وسبب إغلاقه
--   (٢) سجل الأحداث يتّسع للطلب والطلب المخصّص وأنواع أحداثهما
--   (٣) السعر يُحسب في القاعدة — compute_booking_total — من المسارَين
--       (العميل والموظف)، والواجهة لا تُملي مبلغاً (قرار ٢٠٢٦-٠٩-٠٦ رقم ١)
--   (٤) accept_booking: الحالة والمقاعد في معاملةٍ واحدة بقفل الرحلة
--   (٥) reject_booking · cancel_booking: سببٌ إلزامي وقيدٌ في السجل
--   (٦) assign_booking: تعيينٌ وتنبيهٌ للمعيَّن
--   (٧) close_stale_bookings: إغلاقٌ جماعي بيد الموظف بسببٍ واحد (قرار ٣)
--   (٨) search_customers: البحث عن عميلٍ قائم بالجوال قبل إنشاء جديد
--   (٩) apply_booking_discount: خصمٌ للمدير وحده بسببٍ ونسبةٍ وتوقيع
--   (١٠) upsert_booking يعود يكتب توزيع الغرف (سقط في ترحيل ٠٨٢٣)
--   (١١) upsert_hotel و upsert_custom_request بالأعمدة الجديدة
--
-- ── خصائصه ──
-- • آمن للإعادة: كل أمرٍ `if not exists` أو `create or replace`.
-- • لا يُغيّر إجمالي أي حجزٍ قائم: إعادة الحساب تقع عند تغيّر الرحلة
--   أو العدد أو الغرف وحدها، وما عدا ذلك يبقى المبلغ المخزَّن كما هو.
-- • يُبلّغ في جدول نتائج لا في raise notice.
--
-- ⚠️ الأسعار في تساهيل **شاملة الضريبة** (قرار ٢٠٢٦-٠٩-٠٦). لا سطر
--    «+15%» هنا ولا في أي حساب.
-- ════════════════════════════════════════════════════════════════════


-- ═══ (١) الأعمدة ═══════════════════════════════════════════════════
alter table public.bookings add column if not exists assigned_to     uuid references public.profiles(id) on delete set null;
alter table public.bookings add column if not exists assigned_at     timestamptz;
alter table public.bookings add column if not exists closed_reason   text;
alter table public.bookings add column if not exists discount_percent numeric;
alter table public.bookings add column if not exists discount_reason text;
alter table public.bookings add column if not exists discount_by     uuid references public.profiles(id) on delete set null;
alter table public.bookings add column if not exists discount_at     timestamptz;
create index if not exists bookings_assigned_idx on public.bookings(assigned_to) where archived_at is null;

-- بيانات العقد — معلوماتٌ إدارية لا يراها العميل.
alter table public.hotels add column if not exists contact_person         text;
alter table public.hotels add column if not exists contact_phone          text;
alter table public.hotels add column if not exists contract_no            text;
alter table public.hotels add column if not exists contract_from          date;
alter table public.hotels add column if not exists contract_to            date;
alter table public.hotels add column if not exists cancel_policy_internal text;

alter table public.custom_requests add column if not exists assigned_to  uuid references public.profiles(id) on delete set null;
alter table public.custom_requests add column if not exists assigned_at  timestamptz;
alter table public.custom_requests add column if not exists due_at       timestamptz;
alter table public.custom_requests add column if not exists close_reason text;
create index if not exists custom_requests_due_idx on public.custom_requests(due_at) where status not in ('converted','closed');


-- ═══ (٢) سجل الأحداث يتّسع ══════════════════════════════════════════
/* الجدول من ترحيل 20260909 محصورٌ في الفاتورة والتذكرة والحجز وسبعة
   أحداث. الطلب المخصّص والانتقالات والتعيين والتواصل تحتاج مكاناً —
   وجدولٌ ثانٍ (entity_events) نسخةٌ من هذا بالضبط. فيُوسَّع القائم. */
alter table public.document_events drop constraint if exists document_events_doc_type_check;
alter table public.document_events add  constraint document_events_doc_type_check
  check (doc_type in ('invoice','ticket','booking','custom_request'));

alter table public.document_events drop constraint if exists document_events_event_check;
alter table public.document_events add  constraint document_events_event_check
  check (event in ('whatsapp','print','pdf','scan','cancel','refund','issue',
                   'accept','reject','assign','contact','close','bulk_close',
                   'discount','price_adjusted','status','note'));

/* الموظف يحدّث نتيجة إرساله ونتيجة تواصله — كان الجدول بلا سياسة تحديث
   فسطر «هل وصلت؟» لا يُحفظ إلا لمن يملك الجدول. */
drop policy if exists "doc events update staff" on public.document_events;
create policy "doc events update staff" on public.document_events
  for update to authenticated using (public.is_staff()) with check (public.is_staff());


-- ═══ (٣) السعر يُحسب في القاعدة ════════════════════════════════════
/* نفس معادلة شاشة المستفيد حرفاً بحرف (roomSplit.ts):
     ثمن الليلة للمجموعة = Σ(سعر الفرد في الغرفة × سعة الغرفة)
     الإجمالي            = ثمن الليلة × عدد الليالي
   وسعر الفرد يُقرأ من جدول أسعار الباقة بمعرّف الفئة لا من المتصفّح؛
   فئةٌ غير معروفة (حجزٌ قديم) تُقرأ بسعرها المخزَّن فلا يُكسر شيء.

   بلا توزيع غرف (طلبٌ داخلي): سعر الرحلة × العدد، فإن كان صفراً فسعر
   الباقة التسويقي. وتكلفة المقعد لا تدخل — قرارٌ معلّق (انظر
   package-seatcost-not-charged) والمسار الحالي لا يحصّلها. */
create or replace function public.compute_booking_total(p_trip_id text, p_persons int, p_rooms jsonb)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  v_pkg    text;
  v_nights int;
  v_price  numeric;
  v_market numeric;
  v_sum    numeric := 0;
  r        record;
  n        int := greatest(coalesce(p_persons,1),1);
begin
  select t.package_id, t.price into v_pkg, v_price from trips t where t.id = p_trip_id;
  select p.nights, p.market_price into v_nights, v_market from packages p where p.id = v_pkg;
  v_nights := greatest(coalesce(v_nights,1),1);

  if p_rooms is not null and jsonb_typeof(p_rooms) = 'array' and jsonb_array_length(p_rooms) > 0 then
    for r in
      select nullif(e->>'tierId','') as tier_id,
             greatest(coalesce((e->>'persons')::int,1),1) as persons,
             (e->>'perNight')::numeric as per_night
        from jsonb_array_elements(p_rooms) e
    loop
      v_sum := v_sum + coalesce(
        (select rp.per_night from package_room_prices rp
          where rp.package_id = v_pkg and rp.item_id = r.tier_id limit 1),
        r.per_night, 0) * r.persons;
    end loop;
    return round(v_sum * v_nights, 2);
  end if;

  return round(coalesce(nullif(v_price,0), v_market, 0) * n, 2);
end $$;
revoke all on function public.compute_booking_total(text,int,jsonb) from public;
grant execute on function public.compute_booking_total(text,int,jsonb) to authenticated, anon;

/* توقيع الغرف — للمقارنة: هل تغيّر التوزيع فيُعاد الحساب؟ */
create or replace function public.booking_rooms_sig(p_booking_id text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(string_agg(coalesce(tier_id,'') || ':' || coalesce(type,'') || ':' || persons::text, '|' order by sort, id), '')
    from booking_rooms where booking_id = p_booking_id;
$$;
create or replace function public.rooms_json_sig(p_rooms jsonb)
returns text language sql immutable as $$
  select coalesce(string_agg(coalesce(e->>'tierId','') || ':' || coalesce(e->>'type','') || ':' || coalesce(e->>'persons',''), '|' order by o), '')
    from jsonb_array_elements(coalesce(p_rooms,'[]')) with ordinality t(e,o);
$$;

/* كتابة الموظف — نسخة 20260823 (فحص السعة الذرّي) + كتلة الغرف من
   20260809 التي سقطت + السعر من القاعدة.

   المبلغ: للحجز الجديد يُحسب. للقائم يُعاد حسابه فقط إن تغيّرت الرحلة
   أو العدد أو التوزيع — وإلا بقي المخزَّن، فتعديلُ اسمٍ أو حالةٍ لا
   يمسّ مالاً ثُبّت وقت الحجز. والخصم المعتمد يُطبَّق على الناتج. */
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
  insert into booking_pilgrims(booking_id,name,doc_type,id_number,nationality,gender,age_group,birth_date,phone,seat_no,sort)
    select v,e->>'name',nullif(e->>'docType',''),e->>'idNumber',e->>'nationality',e->>'gender',nullif(e->>'ageGroup',''),e->>'birthDate',e->>'phone',nullif(e->>'seat','')::int,(o-1)::int
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

/* مسار العميل — نسخة 20260810 بلا سطر الزيادة اليدوية للمقاعد (نُزع في
   20260813 لأن الحارس يشتقّها) + السعر من القاعدة. فرقٌ بين ما حسبه
   المتصفّح وما حسبته القاعدة يُسجَّل حدثاً ليُراجَع، ولا يُرفض الحجز. */
create or replace function public.create_public_booking(doc jsonb) returns text
language plpgsql security definer set search_path=public as $$
declare
  v   text := coalesce(nullif(doc->>'id',''), 'TRB-'||upper(substr(md5(random()::text),1,5)));
  tid text := nullif(doc->>'tripId','');
  n   int  := greatest(coalesce((doc->>'persons')::int,1),1);
  avail int;
  v_uid uuid := auth.uid();
  v_ph  text := public.auth_phone();
  v_cap int;
  v_total  numeric;
  v_client numeric := nullif(doc->>'total','')::numeric;
begin
  if tid is null   then raise exception 'trip_required';    end if;
  if v_uid is null then raise exception 'auth_required';    end if;
  if v_ph  is null then raise exception 'phone_unverified'; end if;
  perform public.customer_bootstrap();

  if jsonb_array_length(coalesce(doc->'rooms','[]')) > 0 then
    select coalesce(sum((e->>'persons')::int),0) into v_cap
      from jsonb_array_elements(doc->'rooms') e;
    if v_cap < n then raise exception 'rooms_mismatch:% < %', v_cap, n; end if;
  end if;

  select (seats - booked_seats) into avail from trips where id = tid for update;
  if avail is null then raise exception 'trip_not_found'; end if;
  if n > avail then raise exception 'insufficient_seats:%', avail; end if;

  v_total := public.compute_booking_total(tid, n, doc->'rooms');
  /* حسابٌ صفري (باقةٌ بلا أسعار) يقع على ما أرسله العميل — أفضل من
     حجزٍ بصفر ريال، ويبقى الحدث مسجَّلاً ليراجعه الموظف. */
  if v_total <= 0 then v_total := coalesce(v_client, 0); end if;

  insert into bookings(id,trip_id,package_id,client_name,client_phone,customer_id,room_type,persons,total,
    status,payment_status,created_at,submitted_at,staff,source,sent_date)
  values(v,tid,nullif(doc->>'packageId',''),doc->>'clientName',public.local_phone(v_ph),v_uid,
    doc->>'roomType',n,v_total,'reviewing','none',to_char(now(),'YYYY-MM-DD'),now(),'','public',null);
  -- عدّاد المقاعد يشتقّه trg_booking_seats_sync (20260813)
  insert into booking_pilgrims(booking_id,name,doc_type,id_number,nationality,gender,age_group,birth_date,phone,seat_no,sort)
    select v,e->>'name',nullif(e->>'docType',''),e->>'idNumber',e->>'nationality',e->>'gender',nullif(e->>'ageGroup',''),e->>'birthDate',e->>'phone',nullif(e->>'seat','')::int,(o-1)::int
    from jsonb_array_elements(coalesce(doc->'pilgrims','[]')) with ordinality t(e,o);
  insert into booking_seats(booking_id,seat_no,sort)
    select v,(e)::int,(o-1)::int from jsonb_array_elements_text(coalesce(doc->'seats','[]')) with ordinality t(e,o);
  insert into booking_rooms(booking_id,tier_id,type,persons,per_night,sort)
    select v,nullif(e->>'tierId',''),e->>'type',(e->>'persons')::int,(e->>'perNight')::numeric,(o-1)::int
    from jsonb_array_elements(coalesce(doc->'rooms','[]')) with ordinality t(e,o);

  if v_client is not null and abs(v_client - v_total) >= 0.5 then
    insert into document_events(doc_type,doc_id,event,actor,actor_name,note)
    values ('booking', v, 'price_adjusted', null, 'النظام',
            format('المتصفّح أرسل %s والقاعدة حسبت %s — اعتُمد حساب القاعدة', v_client, v_total));
  end if;
  return v;
end $$;
revoke execute on function public.create_public_booking(jsonb) from public, anon;
grant  execute on function public.create_public_booking(jsonb) to authenticated;


-- ═══ (٤) القبول: الحالة والمقاعد معاً ═══════════════════════════════
/* «لا تسمح بقبول الطلب قبل تخصيص مقاعد صحيحة وقفلها داخل Transaction».
   كانت الواجهة تكتب المقاعد ثم الحالة في نداءين: فشل الثاني يترك طلباً
   مقبولاً بلا مقاعد، أو مقاعدَ محجوزةً لطلبٍ لم يُقبل. */
create or replace function public.accept_booking(p_id text, p_seats int[])
returns void language plpgsql security definer set search_path = public as $$
declare
  b     record;
  cap   int;
  used  int;
  n_seats int := coalesce(array_length(p_seats,1),0);
  taken int;
  v_name text;
begin
  if not public.can_write_staff() then raise exception 'forbidden: staff only'; end if;

  select * into b from bookings where id = p_id for update;
  if not found then raise exception 'not_found: الطلب غير موجود'; end if;
  if b.status not in ('new','reviewing','needs_edit') then
    raise exception 'bad_state: الطلب في حالة «%» ولا يُقبل منها', b.status;
  end if;
  if b.trip_id is null then raise exception 'trip_required: الطلب بلا رحلة'; end if;
  if n_seats <> greatest(coalesce(b.persons,1),1) then
    raise exception 'seats_count: المطلوب % مقعداً والمختار %', b.persons, n_seats;
  end if;
  if (select count(distinct s) from unnest(p_seats) s) <> n_seats then
    raise exception 'seats_dup: مقعدٌ مكرّر في الاختيار';
  end if;

  select seats into cap from trips where id = b.trip_id for update;
  if cap is null then raise exception 'trip_not_found: الرحلة غير موجودة'; end if;
  if exists (select 1 from unnest(p_seats) s where s < 1 or s > cap) then
    raise exception 'seat_range: مقعدٌ خارج سعة الرحلة (%)', cap;
  end if;

  select min(bs.seat_no) into taken
    from booking_seats bs
   where bs.trip_id = b.trip_id and bs.is_active
     and bs.seat_no = any(p_seats) and bs.booking_id <> b.id;
  if taken is not null then
    raise exception 'seat_taken: المقعد % محجوز لطلبٍ آخر', taken;
  end if;

  select coalesce(sum(x.persons),0) into used
    from bookings x
   where x.trip_id = b.trip_id and x.status not in ('cancelled','rejected') and x.id <> b.id;
  if used + n_seats > cap then
    raise exception 'seats_unavailable:المتاح % مقعداً والمطلوب %', greatest(cap-used,0), n_seats;
  end if;

  delete from booking_seats where booking_id = b.id;
  insert into booking_seats(booking_id, seat_no, sort)
    select b.id, s, (o-1)::int from unnest(p_seats) with ordinality t(s,o);
  /* مقعد كل معتمر بترتيبه — كما ترسمه شاشة المقاعد. */
  update booking_pilgrims bp set seat_no = p_seats[bp.sort + 1]
   where bp.booking_id = b.id and bp.sort is not null and bp.sort + 1 <= n_seats;

  update bookings set status = 'accepted' where id = b.id;

  select name into v_name from profiles where id = auth.uid();
  insert into document_events(doc_type,doc_id,event,actor,actor_name,note)
  values ('booking', b.id, 'accept', auth.uid(), v_name,
          'قُبل الطلب وقُفلت المقاعد: ' || array_to_string(p_seats, '، '));
end $$;
revoke all on function public.accept_booking(text,int[]) from public, anon;
grant execute on function public.accept_booking(text,int[]) to authenticated;


-- ═══ (٥) الرفض والإلغاء بسبب ════════════════════════════════════════
create or replace function public.reject_booking(p_id text, p_reason text, p_message text)
returns void language plpgsql security definer set search_path = public as $$
declare b record; v_name text;
begin
  if not public.can_write_staff() then raise exception 'forbidden: staff only'; end if;
  if coalesce(trim(p_reason),'')  = '' then raise exception 'reason_required: السبب الداخلي إلزامي'; end if;
  if coalesce(trim(p_message),'') = '' then raise exception 'message_required: رسالة العميل إلزامية'; end if;

  select * into b from bookings where id = p_id for update;
  if not found then raise exception 'not_found: الطلب غير موجود'; end if;
  if b.status in ('confirmed','cancelled','rejected') then
    raise exception 'bad_state: الطلب «%» لا يُرفض — يُلغى', b.status;
  end if;

  update bookings set status = 'rejected', closed_reason = trim(p_reason) where id = b.id;
  /* المقاعد يحرّرها trg_booking_seats_sync (20260813). */

  select name into v_name from profiles where id = auth.uid();
  insert into document_events(doc_type,doc_id,event,actor,actor_name,note)
  values ('booking', b.id, 'reject', auth.uid(), v_name,
          'السبب: ' || trim(p_reason) || E'\nرسالة العميل: ' || trim(p_message));
end $$;
revoke all on function public.reject_booking(text,text,text) from public, anon;
grant execute on function public.reject_booking(text,text,text) to authenticated;

create or replace function public.cancel_booking(p_id text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare b record; v_name text;
begin
  if not public.can_write_staff() then raise exception 'forbidden: staff only'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'reason_required: سبب الإلغاء إلزامي'; end if;

  select * into b from bookings where id = p_id for update;
  if not found then raise exception 'not_found: الطلب غير موجود'; end if;
  if b.status in ('cancelled','rejected') then
    raise exception 'bad_state: الطلب مُغلقٌ أصلاً';
  end if;

  update bookings set status = 'cancelled', closed_reason = trim(p_reason) where id = b.id;
  /* الفاتورة والتذكرة يُلغيهما trg_cancel_docs_for_booking (20260909)،
     والمقاعد يحرّرها trg_booking_seats_sync (20260813). */

  select name into v_name from profiles where id = auth.uid();
  insert into document_events(doc_type,doc_id,event,actor,actor_name,note)
  values ('booking', b.id, 'cancel', auth.uid(), v_name, 'السبب: ' || trim(p_reason));
end $$;
revoke all on function public.cancel_booking(text,text) from public, anon;
grant execute on function public.cancel_booking(text,text) to authenticated;


-- ═══ (٦) التعيين ════════════════════════════════════════════════════
/* «أضف تعيين الطلب لموظف ومنع معالجة نفس الطلب بالتوازي دون تنبيه».
   المنع تنبيهٌ في الواجهة لمن يفتح طلباً ليس له؛ وهنا يُثبَّت التعيين
   ويُنبَّه المعيَّن في مركز التنبيهات. */
create or replace function public.assign_booking(p_id text, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare b record; v_actor text; v_target text;
begin
  if not public.can_write_staff() then raise exception 'forbidden: staff only'; end if;
  select * into b from bookings where id = p_id for update;
  if not found then raise exception 'not_found: الطلب غير موجود'; end if;

  if p_user is not null and not exists (select 1 from profiles where id = p_user and status = 'active') then
    raise exception 'bad_user: الموظف غير موجود أو موقوف';
  end if;

  update bookings set assigned_to = p_user, assigned_at = case when p_user is null then null else now() end
   where id = b.id;

  select name into v_actor  from profiles where id = auth.uid();
  select name into v_target from profiles where id = p_user;
  insert into document_events(doc_type,doc_id,event,actor,actor_name,note)
  values ('booking', b.id, 'assign', auth.uid(), v_actor,
          case when p_user is null then 'أُلغي التعيين' else 'أُسند إلى ' || coalesce(v_target,'موظف') end);

  if p_user is not null and p_user <> auth.uid() then
    insert into notifications(user_id, title, body, href)
    values (p_user, 'أُسند إليك طلب ' || b.id,
            coalesce(b.client_name,'') || ' — ' || coalesce(v_actor,'موظف') || ' أسند إليك هذا الطلب',
            '/admin/bookings?open=' || b.id);
  end if;
end $$;
revoke all on function public.assign_booking(text,uuid) from public, anon;
grant execute on function public.assign_booking(text,uuid) to authenticated;

/* نفسه للطلب المخصّص. */
create or replace function public.assign_custom_request(p_id text, p_user uuid, p_due_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_actor text; v_target text;
begin
  if not public.can_write_staff() then raise exception 'forbidden: staff only'; end if;
  select * into r from custom_requests where id = p_id for update;
  if not found then raise exception 'not_found: الطلب غير موجود'; end if;
  if p_user is not null and not exists (select 1 from profiles where id = p_user and status = 'active') then
    raise exception 'bad_user: الموظف غير موجود أو موقوف';
  end if;

  update custom_requests
     set assigned_to = p_user,
         assigned_at = case when p_user is null then null else now() end,
         due_at      = p_due_at
   where id = r.id;

  select name into v_actor  from profiles where id = auth.uid();
  select name into v_target from profiles where id = p_user;
  insert into document_events(doc_type,doc_id,event,actor,actor_name,note)
  values ('custom_request', r.id, 'assign', auth.uid(), v_actor,
          case when p_user is null then 'أُلغي التعيين' else 'أُسند إلى ' || coalesce(v_target,'موظف') end
          || case when p_due_at is null then '' else ' — الردّ قبل ' || to_char(p_due_at at time zone 'Asia/Riyadh','YYYY-MM-DD HH24:MI') end);

  if p_user is not null and p_user <> auth.uid() then
    insert into notifications(user_id, title, body, href)
    values (p_user, 'أُسند إليك طلب مخصّص ' || r.id,
            coalesce(r.name,'') || ' — ' || coalesce(v_actor,'موظف') || ' أسند إليك هذا الطلب',
            '/admin/custom-requests?open=' || r.id);
  end if;
end $$;
revoke all on function public.assign_custom_request(text,uuid,timestamptz) from public, anon;
grant execute on function public.assign_custom_request(text,uuid,timestamptz) to authenticated;


-- ═══ (٧) الطلبات المتأخّرة: إغلاقٌ جماعي بيد الموظف ══════════════════
/* قرار ٣: لا pg_cron ولا إغلاقٌ بلا فاعل. الدالّة تُغلق ما اختاره
   الموظف فقط، وتتجاهل صامتةً ما لم تنته رحلته أو ما أُغلق أصلاً —
   فالقائمة التي يراها قد تكون تغيّرت تحت يده. تعيد عدد ما أُغلق. */
create or replace function public.close_stale_bookings(p_ids text[], p_reason text)
returns int language plpgsql security definer set search_path = public as $$
declare v_count int := 0; v_id text; v_name text; v_today text := to_char(now() at time zone 'Asia/Riyadh','YYYY-MM-DD');
begin
  if not public.can_write_staff() then raise exception 'forbidden: staff only'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'reason_required: سبب الإغلاق إلزامي'; end if;
  select name into v_name from profiles where id = auth.uid();

  for v_id in
    select b.id from bookings b
      join trips t on t.id = b.trip_id
     where b.id = any(p_ids)
       and b.status in ('new','reviewing','needs_edit','accepted','awaiting_payment')
       and t.departure_date ~ '^\d{4}-\d{2}-\d{2}$'
       and t.departure_date < v_today
  loop
    update bookings set status = 'cancelled', closed_reason = trim(p_reason) where id = v_id;
    insert into document_events(doc_type,doc_id,event,actor,actor_name,note)
    values ('booking', v_id, 'bulk_close', auth.uid(), v_name, 'إغلاق جماعي للمتأخّرة — ' || trim(p_reason));
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke all on function public.close_stale_bookings(text[],text) from public, anon;
grant execute on function public.close_stale_bookings(text[],text) to authenticated;


-- ═══ (٨) البحث عن عميلٍ قائم ════════════════════════════════════════
/* «أضف البحث عن عميل موجود بالجوال قبل إنشاء عميل جديد لمنع التكرار».
   المصدران معاً: ملفّات المستفيدين، وعملاء الحجوزات الذين لا ملفَّ لهم
   بعد — فالعميل الذي حجز مرّتين من التطبيق عميلٌ قائم وإن لم يُربط. */
create or replace function public.search_customers(q text)
returns table(source text, ref_id text, name text, phone text, id_number text,
              bookings_count bigint, last_booking text)
language sql security definer stable set search_path = public as $$
  with k as (
    select trim(coalesce(q,'')) as raw,
           right(regexp_replace(coalesce(q,''), '\D', '', 'g'), 9) as digits
  ),
  bens as (
    select 'beneficiary'::text as source, b.id as ref_id, b.name, b.phone, b.id_number,
           (select count(*) from beneficiary_bookings bb where bb.beneficiary_id = b.id) as bookings_count,
           null::text as last_booking
      from beneficiaries b, k
     where public.is_staff()
       and b.archived_at is null
       and length(k.raw) >= 2
       and ( b.name ilike '%' || k.raw || '%'
          or (length(k.digits) >= 4 and right(regexp_replace(coalesce(b.phone,''), '\D', '', 'g'), 9) like '%' || k.digits || '%')
          or coalesce(b.id_number,'') ilike '%' || k.raw || '%' )
  ),
  clients as (
    select 'booking'::text as source,
           min(b.id) as ref_id,
           (array_agg(b.client_name order by b.created_at desc))[1] as name,
           b.client_phone as phone,
           (select bp.id_number from booking_pilgrims bp where bp.booking_id = min(b.id) order by bp.sort limit 1) as id_number,
           count(*) as bookings_count,
           max(b.created_at) as last_booking
      from bookings b, k
     where public.is_staff()
       and b.archived_at is null
       and length(k.raw) >= 2
       and ( b.client_name ilike '%' || k.raw || '%'
          or (length(k.digits) >= 4 and right(regexp_replace(coalesce(b.client_phone,''), '\D', '', 'g'), 9) like '%' || k.digits || '%') )
       and not exists (
         select 1 from beneficiaries x
          where x.archived_at is null
            and right(regexp_replace(coalesce(x.phone,''), '\D', '', 'g'), 9)
              = right(regexp_replace(coalesce(b.client_phone,''), '\D', '', 'g'), 9))
     group by b.client_phone
  )
  select * from bens
  union all
  select * from clients
  order by bookings_count desc, name
  limit 10;
$$;
revoke all on function public.search_customers(text) from public, anon;
grant execute on function public.search_customers(text) to authenticated;


-- ═══ (٩) الخصم الموثَّق — للمدير وحده ═══════════════════════════════
/* قرار ١: الموظف يرى الخصم ولا يُنشئه. النسبة والسبب والمعتمِد والوقت
   تُحفظ على الطلب، ويُعاد حساب الإجمالي من السعر الأصلي (لا من الإجمالي
   الحالي كي لا يتراكب خصمٌ على خصم)، ويظهر سطراً مستقلاً في الفاتورة
   عبر rebuild_payment_items. */
create or replace function public.apply_booking_discount(p_id text, p_percent numeric, p_reason text)
returns numeric language plpgsql security definer set search_path = public as $$
declare b record; v_base numeric; v_total numeric; v_name text; v_inv text;
begin
  if not public.can_write_admin() then raise exception 'forbidden: admin only'; end if;
  if p_percent is null or p_percent < 0 or p_percent > 100 then
    raise exception 'bad_percent: النسبة بين 0 و100';
  end if;
  if p_percent > 0 and coalesce(trim(p_reason),'') = '' then
    raise exception 'reason_required: سبب الخصم إلزامي';
  end if;

  select * into b from bookings where id = p_id for update;
  if not found then raise exception 'not_found: الطلب غير موجود'; end if;
  if b.payment_status = 'verified' then
    raise exception 'already_paid: الطلب مدفوع — الخصم بعد التحصيل استرجاعٌ لا خصم';
  end if;

  v_base := public.compute_booking_total(b.trip_id, b.persons,
              (select coalesce(jsonb_agg(jsonb_build_object('tierId', br.tier_id, 'type', br.type,
                       'persons', br.persons, 'perNight', br.per_night) order by br.sort), '[]'::jsonb)
                 from booking_rooms br where br.booking_id = b.id));
  if v_base <= 0 then
    /* لا سعر محسوب (بيانات قديمة): الأساس هو المخزَّن قبل أي خصم سابق. */
    v_base := case when coalesce(b.discount_percent,0) > 0 and coalesce(b.discount_percent,0) < 100
                   then round(coalesce(b.total,0) / (1 - b.discount_percent/100.0), 2)
                   else coalesce(b.total,0) end;
  end if;
  v_total := round(v_base * (1 - p_percent/100.0), 2);

  update bookings
     set total = v_total,
         discount_percent = case when p_percent > 0 then p_percent else null end,
         discount_reason  = case when p_percent > 0 then trim(p_reason) else null end,
         discount_by      = case when p_percent > 0 then auth.uid() else null end,
         discount_at      = case when p_percent > 0 then now() else null end
   where id = b.id;

  /* فاتورةٌ صادرة غير مدفوعة تتبع الطلب. */
  select id into v_inv from payments where booking_id = b.id and state = 'issued' and pay_status <> 'verified' limit 1;
  if v_inv is not null then
    update payments set total = v_total where id = v_inv;
    perform public.rebuild_payment_items(v_inv);
  end if;

  select name into v_name from profiles where id = auth.uid();
  insert into document_events(doc_type,doc_id,event,actor,actor_name,note)
  values ('booking', b.id, 'discount', auth.uid(), v_name,
          case when p_percent > 0
               then format('خصم %s%% — %s. الإجمالي %s ← %s', p_percent, trim(p_reason), v_base, v_total)
               else format('أُلغي الخصم. الإجمالي %s', v_total) end);
  return v_total;
end $$;
revoke all on function public.apply_booking_discount(text,numeric,text) from public, anon;
grant execute on function public.apply_booking_discount(text,numeric,text) to authenticated;


-- ═══ (١٠) upsert_hotel بالأعمدة الجديدة ═════════════════════════════
/* منقولٌ حرفياً من schema.sql بفارقٍ واحد: أعمدة العقد الستّة. الدالّة
   تُستبدل كاملةً، فأي حقلٍ يسقط من هنا يسقط من الحفظ. */
create or replace function public.upsert_hotel(doc jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare v text := doc->>'id'; rt jsonb; ord int; v_rt bigint;
begin
  if not public.can_write_admin() then raise exception 'forbidden'; end if;
  insert into hotels(id,name,city,stars,distance_m,district,phone,map_url,status,notes,tasaheel_note,
                     contact_person,contact_phone,contract_no,contract_from,contract_to,cancel_policy_internal)
  values(v,doc->>'name',doc->>'city',(doc->>'stars')::smallint,(doc->>'distanceM')::int,doc->>'district',
         doc->>'phone',doc->>'mapUrl',doc->>'status',doc->>'notes',doc->>'tasaheelNote',
         nullif(doc->>'contactPerson',''),nullif(doc->>'contactPhone',''),nullif(doc->>'contractNo',''),
         nullif(doc->>'contractFrom','')::date,nullif(doc->>'contractTo','')::date,nullif(doc->>'cancelPolicyInternal',''))
  on conflict(id) do update set name=excluded.name,city=excluded.city,stars=excluded.stars,
    distance_m=excluded.distance_m,district=excluded.district,phone=excluded.phone,map_url=excluded.map_url,
    status=excluded.status,notes=excluded.notes,tasaheel_note=excluded.tasaheel_note,
    contact_person=excluded.contact_person,contact_phone=excluded.contact_phone,contract_no=excluded.contract_no,
    contract_from=excluded.contract_from,contract_to=excluded.contract_to,cancel_policy_internal=excluded.cancel_policy_internal;
  delete from hotel_features where hotel_id=v;
  insert into hotel_features(hotel_id,item_id,icon,text,sort)
    select v,e->>'id',e->>'icon',e->>'text',(o-1)::int from jsonb_array_elements(coalesce(doc->'features','[]'))
    with ordinality t(e,o);
  delete from hotel_reviews where hotel_id=v;
  insert into hotel_reviews(hotel_id,item_id,name,text,consent,image,sort)
    select v,e->>'id',e->>'name',e->>'text',(e->>'consent')::boolean,e->>'image',(o-1)::int
    from jsonb_array_elements(coalesce(doc->'reviews','[]')) with ordinality t(e,o);
  delete from hotel_media where hotel_id=v;
  insert into hotel_media(hotel_id,item_id,kind,url,is_primary,category,sort)
    select v,e->>'id',e->>'kind',e->>'url',(e->>'primary')::boolean,e->>'category',(o-1)::int
    from jsonb_array_elements(coalesce(doc->'media','[]')) with ordinality t(e,o);
  delete from hotel_room_types where hotel_id=v;  -- cascade يحذف الصور
  ord:=0;
  for rt in select * from jsonb_array_elements(coalesce(doc->'roomTypes','[]')) loop
    insert into hotel_room_types(hotel_id,item_id,kind,beds,price_per_night,sort)
    values(v,rt->>'id',rt->>'kind',(rt->>'beds')::int,(rt->>'pricePerNight')::numeric,ord) returning id into v_rt;
    insert into hotel_room_photos(room_type_id,item_id,kind,url,is_primary,category,sort)
      select v_rt,e->>'id',e->>'kind',e->>'url',(e->>'primary')::boolean,e->>'category',(o-1)::int
      from jsonb_array_elements(coalesce(rt->'photos','[]')) with ordinality t(e,o);
    ord:=ord+1;
  end loop;
end $$;
revoke execute on function public.upsert_hotel(jsonb) from public, anon;
grant  execute on function public.upsert_hotel(jsonb) to authenticated;


-- ═══ (١١) upsert_custom_request: المسؤول والموعد وسبب الإغلاق ═══════
/* «حالة مغلق تحتاج سبباً»: يُرفض الإغلاق بلا سبب من القائمة الأربعة.
   التعيين والموعد لهما دالّتهما (assign_custom_request) فلا تُكتب من هنا
   — صفٌّ قديم في تبويبٍ آخر كان سيمحوهما. */
create or replace function public.upsert_custom_request(doc jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare v text := doc->>'id'; v_status text := coalesce(doc->>'status','new'); v_reason text := nullif(trim(coalesce(doc->>'closeReason','')),'');
begin
  if not public.can_write_staff() then raise exception 'forbidden'; end if;
  if v_status = 'closed' and v_reason is null then
    raise exception 'close_reason_required: الإغلاق يحتاج سبباً';
  end if;
  if v_reason is not null and v_reason not in ('لم يردّ','السعر غير مناسب','غير قابل للتنفيذ','أُلغي من العميل') then
    raise exception 'bad_close_reason: سبب الإغلاق خارج القائمة';
  end if;
  insert into custom_requests(id,depart_date,return_date,persons,destination,room_type,hotel_level,
                              trip_notes,name,phone,city,notes,status,created_at,staff,close_reason)
  values(v,doc->>'departDate',doc->>'returnDate',coalesce((doc->>'persons')::int,1),
         doc->>'destination',doc->>'roomType',doc->>'hotelLevel',doc->>'tripNotes',
         doc->>'name',doc->>'phone',doc->>'city',doc->>'notes',
         v_status,doc->>'createdAt',doc->>'staff',
         case when v_status = 'closed' then v_reason else null end)
  on conflict(id) do update set
    depart_date=excluded.depart_date, return_date=excluded.return_date, persons=excluded.persons,
    destination=excluded.destination, room_type=excluded.room_type, hotel_level=excluded.hotel_level,
    trip_notes=excluded.trip_notes, name=excluded.name, phone=excluded.phone, city=excluded.city,
    notes=excluded.notes, status=excluded.status, staff=excluded.staff, close_reason=excluded.close_reason;
end $$;
revoke execute on function public.upsert_custom_request(jsonb) from public, anon;
grant  execute on function public.upsert_custom_request(jsonb) to authenticated;


-- ═══ تقرير ═════════════════════════════════════════════════════════
select 'طلبات مفتوحة انتهت رحلتها (مرشّحة للإغلاق الجماعي)' as "البند",
       count(*)::text as "العدد"
  from bookings b join trips t on t.id = b.trip_id
 where b.status in ('new','reviewing','needs_edit','accepted','awaiting_payment')
   and t.departure_date ~ '^\d{4}-\d{2}-\d{2}$'
   and t.departure_date < to_char(now() at time zone 'Asia/Riyadh','YYYY-MM-DD')
union all
select 'حجوزات عامة بتوزيع غرف — يُعاد حساب إجماليها عند أول تعديل على الغرف فقط', count(distinct booking_id)::text from booking_rooms
union all
select 'فنادق بلا بيانات عقد', count(*)::text from hotels where archived_at is null and contract_no is null
union all
select 'طلبات مخصّصة مفتوحة بلا مسؤول', count(*)::text from custom_requests
 where archived_at is null and status not in ('converted','closed') and assigned_to is null;


-- ═══════════ سجلّ الترحيلات ═══════════
insert into public.schema_migrations(version, note) values
  ('20260910_wave5_operations', 'موجة الطلبات: قبول ذرّي، رفض وإلغاء بسبب، تعيين، سعر من القاعدة، خصم موثّق، إغلاق المتأخّرة، بحث العملاء، عقود الفنادق، مسؤول الطلب المخصّص')
on conflict (version) do nothing;
