-- ════════════════════════════════════════════════════════════════════
-- 20260912 — الرحلات، الموجة ٢: مركبةٌ من السجل، عودةٌ بوقتها، عنوانٌ
--            مُلتقَط، ولا حافلةَ في رحلتَين
--
-- ستّ ملاحظاتٍ من الفريق جذرها واحد: الرحلة كانت تُربط بحافلةٍ بالاسم
-- لا بالسجل — لوحةٌ تُكتب يدوياً في كل إطلاق — فلا يعرف أحدٌ إن كانت
-- الحافلة نفسها في رحلةٍ أخرى ذاك اليوم، ولا تنتهي الرحلة بوقتٍ معلوم،
-- ونقطة الانطلاق تتبع الفرع الحيّ فيتغيّر ما وُعد به ركّاب رحلةٍ مضت.
--
-- ── ما فيه ──
--   (١) عمودان: return_time (وقت العودة HH:mm) · departure_address
--       (عنوان الانطلاق لقطةً من الفرع لحظة الإطلاق)
--   (٢) تعبئةٌ أثرية لعنوان الانطلاق من الفرع للرحلات القائمة
--   (٣) حارس تعارض المركبة: guard_trip_vehicle_conflict — لا رحلتان
--       قائمتان على مركبةٍ واحدة بنافذتَين متداخلتَين
--   (٤) upsert_trip بتعريفٍ كامل يحمل العمودَين الجديدَين ويحفظ ما
--       رقّعته الترحيلات السابقة (0813: لا يمسّ booked_seats ·
--       0908: يكتب cancel_reason)
--
-- ── خصائصه ──
-- • آمن للإعادة: كل أمرٍ `if not exists` أو `create or replace` أو
--   `drop trigger if exists` قبل الإنشاء. لا drop لجدول ولا delete لصفّ.
-- • الواجهة تعمل قبله: upsert_trip القديمة تتجاهل المفاتيح المجهولة،
--   وفحص التعارض قائمٌ في الواجهة (lib/trip.ts › findVehicleConflict).
-- • يُبلّغ في جدول نتائج لا في raise notice.
--
-- ⚠️ السائقون بالتعاقد ولا سجلَّ لهم (قرار يوسف): التعارض للمركبة وحدها،
--    والسائق حقلٌ نصّي اختياري في trip_drivers كما كان.
-- ════════════════════════════════════════════════════════════════════


-- ═══ (١) الأعمدة ═══════════════════════════════════════════════════
/* نصٌّ لا time/timestamp: الرحلات تخزّن التواريخ والأوقات نصّاً منذ
   أول مخطّط (departure_date text, departure_time text)، والانحياز عن
   ذلك في عمودَين يُدخل تحويلاتٍ في كل استعلامٍ يقارنهما بجيرانهما. */
alter table public.trips add column if not exists return_time       text;
alter table public.trips add column if not exists departure_address text;


-- ═══ (٢) تعبئةٌ أثرية: عنوان الفرع للرحلات القائمة ═════════════════
/* الرحلات التي أُطلقت من فرعٍ قبل هذا الترحيل بلا عنوانٍ مُلتقَط. أقرب
   حقيقةٍ متاحة هي عنوان الفرع الآن — أدقّ من فراغٍ، وأقلّ دقّة من لقطةٍ
   لحظة الإطلاق. تُملأ مرّةً واحدة (where is null) ولا تُدهَس بعدها. */
update public.trips t
   set departure_address = b.address
  from public.branches b
 where b.id = t.branch_id
   and t.departure_address is null
   and nullif(btrim(coalesce(b.address,'')),'') is not null;


-- ═══ (٣) حارس تعارض المركبة ═════════════════════════════════════════
/* النافذة بالأيام لا بالساعات — حافلةٌ تعود ظهر السبت لا تنطلق مساءه:
   بينهما تنظيفٌ وفحصٌ وسائقٌ آخر. وهو منطق الواجهة نفسه حرفاً
   (lib/trip.ts › tripWindow/windowsOverlap) كي لا يقول أحدهما «تعارض»
   ويقول الآخر «لا».

   يُفحص عند الإدراج، وعند التحديث إن تغيّر ما يُحدث التعارض فقط:
   المركبة أو التاريخان أو الحالة. تحديثُ سائقٍ على رحلةٍ قديمة تتعارض
   أثرياً مع أخرى لا يجب أن يُرفَض بسبب تعارضٍ لم يصنعه.

   الملغاة والمؤرشفة لا تشغل مركبة — والرحلة تُلغى ولو كانت متعارضة:
   الإلغاء يحلّ التعارض لا يُمنَع به. */
create or replace function public.guard_trip_vehicle_conflict() returns trigger
language plpgsql set search_path = public as $$
declare
  v_dep date; v_ret date;
  c record;
begin
  if new.transport_id is null then return new; end if;
  if coalesce(new.status,'') in ('cancelled','archived') then return new; end if;
  if new.archived_at is not null then return new; end if;
  if coalesce(new.departure_date,'') !~ '^\d{4}-\d{2}-\d{2}$' then return new; end if;

  if tg_op = 'UPDATE'
     and new.transport_id   is not distinct from old.transport_id
     and new.departure_date is not distinct from old.departure_date
     and new.return_date    is not distinct from old.return_date
     and new.status         is not distinct from old.status
     and new.archived_at    is not distinct from old.archived_at then
    return new;
  end if;

  v_dep := new.departure_date::date;
  v_ret := case when coalesce(new.return_date,'') ~ '^\d{4}-\d{2}-\d{2}$'
                then greatest(new.return_date::date, v_dep) else v_dep end;

  select t.id, t.departure_date,
         case when coalesce(t.return_date,'') ~ '^\d{4}-\d{2}-\d{2}$'
              and t.return_date::date >= t.departure_date::date
              then t.return_date else t.departure_date end as return_date
    into c
    from public.trips t
   where t.transport_id = new.transport_id
     and t.id <> new.id
     and coalesce(t.status,'') not in ('cancelled','archived')
     and t.archived_at is null
     and coalesce(t.departure_date,'') ~ '^\d{4}-\d{2}-\d{2}$'
     and daterange(
           t.departure_date::date,
           case when coalesce(t.return_date,'') ~ '^\d{4}-\d{2}-\d{2}$'
                then greatest(t.return_date::date, t.departure_date::date)
                else t.departure_date::date end,
           '[]')
         && daterange(v_dep, v_ret, '[]')
   order by t.departure_date
   limit 1;

  if found then
    raise exception 'vehicle_conflict: المركبة مرتبطة برحلة % (% → %)',
      c.id, c.departure_date, c.return_date;
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_trip_vehicle_conflict on public.trips;
create trigger trg_guard_trip_vehicle_conflict
  before insert or update on public.trips
  for each row execute function public.guard_trip_vehicle_conflict();

/* فهرسٌ جزئي على المركبة للرحلات القائمة: الحارس يُسأل في كل كتابة،
   وجدول الرحلات يكبر كل أسبوع. */
create index if not exists trips_vehicle_live_idx
  on public.trips(transport_id, departure_date)
  where status not in ('cancelled','archived') and archived_at is null;


-- ═══ (٤) upsert_trip — تعريفٌ كامل ═════════════════════════════════
/* تعريفٌ كامل لا ترقيعٌ نصّي هذه المرّة: ترقيعان متراكبان (0813 و0908)
   جعلا النصّ الحيّ مختلفاً عن schema.sql بما يكفي ليفشل ترقيعٌ ثالث
   بصمت. ما تراكم يُجمع هنا صريحاً:

   • can_write_staff(): الرحلات لأي موظف (0804/0812).
   • booked_seats: صفرٌ عند الإدراج ولا تُمسّ عند التحديث — يشتقّها
     trg_booking_seats_sync من الحجوزات النشطة (0813). كتابتها من
     الواجهة كانت تدهس القيمة المشتقّة بنسخةٍ عمرها دقائق.
   • cancel_reason: يُكتب من المستند؛ cancelled_at/cancelled_by يختمهما
     trg_trip_cancel_stamp لا الواجهة (0908).
   • return_time و departure_address: الجديدان. فراغٌ يُقرأ null.
   • trip_drivers: تُمسح وتُعاد كتابتها من المستند كما كانت. */
create or replace function public.upsert_trip(doc jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare v text := doc->>'id'; s jsonb := doc->'settings';
begin
  -- الطلبات/الرحلات: مسموحة لأي موظف وسياق الخادم — لا للمستفيد ولا للمجهول
  if not public.can_write_staff() then raise exception 'forbidden'; end if;
  insert into trips(id,package_id,transport_id,hotel_id,departure_date,return_date,departure_time,return_time,
    departure_point,departure_map_url,departure_address,cancel_reason,branch_id,bus_plate,bus_code,
    seats,booked_seats,waiting_seats,status,price,
    set_allow_online_booking,set_manual_confirm,set_waitlist_enabled,set_require_payment_first,
    set_show_ticket_after_confirm,set_payment_deadline_hours,set_max_pilgrims)
  values(v,nullif(doc->>'packageId',''),nullif(doc->>'transportId',''),nullif(doc->>'hotelId',''),
    doc->>'departureDate',doc->>'returnDate',doc->>'departureTime',nullif(doc->>'returnTime',''),
    doc->>'departurePoint',doc->>'departureMapUrl',nullif(doc->>'departureAddress',''),
    nullif(doc->>'cancelReason',''),nullif(doc->>'branchId',''),doc->>'busPlate',doc->>'busCode',
    (doc->>'seats')::int,0,(doc->>'waitingSeats')::int,doc->>'status',(doc->>'price')::numeric,
    (s->>'allowOnlineBooking')::boolean,(s->>'manualConfirm')::boolean,(s->>'waitlistEnabled')::boolean,
    (s->>'requirePaymentFirst')::boolean,(s->>'showTicketAfterConfirm')::boolean,
    (s->>'paymentDeadlineHours')::int,(s->>'maxPilgrims')::int)
  on conflict(id) do update set package_id=excluded.package_id,transport_id=excluded.transport_id,hotel_id=excluded.hotel_id,
    departure_date=excluded.departure_date,return_date=excluded.return_date,departure_time=excluded.departure_time,
    return_time=excluded.return_time,
    departure_point=excluded.departure_point,departure_map_url=excluded.departure_map_url,
    departure_address=excluded.departure_address,cancel_reason=excluded.cancel_reason,
    branch_id=excluded.branch_id,bus_plate=excluded.bus_plate,bus_code=excluded.bus_code,seats=excluded.seats,
    waiting_seats=excluded.waiting_seats,status=excluded.status,price=excluded.price,
    set_allow_online_booking=excluded.set_allow_online_booking,set_manual_confirm=excluded.set_manual_confirm,
    set_waitlist_enabled=excluded.set_waitlist_enabled,set_require_payment_first=excluded.set_require_payment_first,
    set_show_ticket_after_confirm=excluded.set_show_ticket_after_confirm,
    set_payment_deadline_hours=excluded.set_payment_deadline_hours,set_max_pilgrims=excluded.set_max_pilgrims;
  delete from trip_drivers where trip_id=v;
  insert into trip_drivers(trip_id,item_id,name,phone,sort)
    select v,e->>'id',e->>'name',e->>'phone',(o-1)::int from jsonb_array_elements(coalesce(doc->'drivers','[]')) with ordinality t(e,o);
end $$;
revoke execute on function public.upsert_trip(jsonb) from public, anon;
grant  execute on function public.upsert_trip(jsonb) to authenticated;


-- ═══ تقرير ═════════════════════════════════════════════════════════
-- التعارضات الأثرية لا يُصلحها الحارس بأثرٍ رجعي: يمنع الجديد ويعرض
-- القديم هنا. رحلةٌ منها لا يُغيَّر تاريخها أو مركبتها حتى يُحلّ
-- تعارضها (أو تُلغى — الإلغاء يمرّ دائماً).
select 'رحلات قائمة تتشارك مركبةً بنافذتَين متداخلتَين (تعارض أثري)' as "البند",
       count(*)::text as "العدد"
  from public.trips a
  join public.trips b
    on b.transport_id = a.transport_id and b.id > a.id
 where a.transport_id is not null
   and coalesce(a.status,'') not in ('cancelled','archived') and a.archived_at is null
   and coalesce(b.status,'') not in ('cancelled','archived') and b.archived_at is null
   and coalesce(a.departure_date,'') ~ '^\d{4}-\d{2}-\d{2}$'
   and coalesce(b.departure_date,'') ~ '^\d{4}-\d{2}-\d{2}$'
   and daterange(a.departure_date::date,
         case when coalesce(a.return_date,'') ~ '^\d{4}-\d{2}-\d{2}$' then greatest(a.return_date::date,a.departure_date::date) else a.departure_date::date end,'[]')
    && daterange(b.departure_date::date,
         case when coalesce(b.return_date,'') ~ '^\d{4}-\d{2}-\d{2}$' then greatest(b.return_date::date,b.departure_date::date) else b.departure_date::date end,'[]')
union all
select 'رحلات قائمة بلا مركبة مرتبطة (transport_id فارغ)', count(*)::text
  from public.trips
 where transport_id is null and coalesce(status,'') not in ('cancelled','archived') and archived_at is null
union all
select 'رحلات قائمة مرتبطة بمركبة غير نشطة', count(*)::text
  from public.trips t join public.transports tr on tr.id = t.transport_id
 where coalesce(t.status,'') not in ('cancelled','archived') and t.archived_at is null
   and coalesce(tr.status,'') <> 'active'
union all
select 'رحلات قائمة بلا وقت عودة (تنتهي بآخر يوم العودة)', count(*)::text
  from public.trips
 where return_time is null and coalesce(status,'') not in ('cancelled','archived') and archived_at is null
union all
select 'رحلات من فرع بلا عنوان انطلاق مُلتقَط (فرعها بلا عنوان)', count(*)::text
  from public.trips
 where branch_id is not null and departure_address is null and archived_at is null
union all
select 'upsert_trip تحمل return_time و departure_address',
       case when position('departure_address' in pg_get_functiondef(p.oid)) > 0
             and position('return_time' in pg_get_functiondef(p.oid)) > 0 then 'نعم' else 'لا' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'upsert_trip' and p.pronargs = 1
union all
select 'upsert_trip لا تكتب booked_seats عند التحديث',
       case when position('booked_seats=excluded.booked_seats' in pg_get_functiondef(p.oid)) = 0 then 'نعم' else 'لا' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'upsert_trip' and p.pronargs = 1
union all
select 'حارس تعارض المركبة مثبَّت على trips',
       case when exists (select 1 from pg_trigger where tgname = 'trg_guard_trip_vehicle_conflict' and not tgisinternal) then 'نعم' else 'لا' end;


-- ═══════════ سجلّ الترحيلات ═══════════
insert into public.schema_migrations(version, note) values
  ('20260912_trips_wave2', 'الرحلات الموجة ٢: وقت العودة، عنوان الانطلاق المُلتقَط، حارس تعارض المركبة، upsert_trip كاملة بالأعمدة الجديدة')
on conflict (version) do nothing;
