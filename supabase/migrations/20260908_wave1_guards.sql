-- ════════════════════════════════════════════════════════════════════
-- 20260908 — الموجة ١: حرّاس القاعدة، حقول المركبة، وتوحيد المدن
--
-- هذا الترحيل مرآةٌ لحرّاس الواجهة التي نزلت معه، لا بديلٌ عنها ولا
-- زينةٌ فوقها. الواجهة تمنع الخطأ قبل وقوعه فيرى الموظف سببه في مكانه؛
-- والقاعدة تمنعه مهما كان الطريق — استيراد، أو سكربت، أو نسخة واجهة
-- قديمة في تبويبٍ لم يُحدَّث منذ أمس. حارسٌ واحدٌ منهما لا يكفي:
-- الواجهة وحدها تُخدَع، والقاعدة وحدها تعطي رسالةً إنجليزية غامضة.
--
-- ما فيه:
--   (١) أعمدة إلغاء الرحلة   — سبب وتاريخ ومَن ألغى
--   (٢) أعمدة المركبة        — الوثائق النظامية وحقول الطيران
--   (٣) حالة «مسودة» للمركبة
--   (٤) قيود السعة والتكلفة  — لا سعة صفر ولا سعة تحت المحجوز
--   (٥) توحيد المدن          — «مدينة الدمام» ← «الدمام»
--   (٦) منع أرشفة فرع مرتبط
--   (٧) تحديث upsert_trip و upsert_transport
--
-- ── خصائصه ──
-- • آمن للإعادة: كل أمرٍ إمّا `if not exists` أو `create or replace`.
--   لا drop لجدول، ولا truncate، ولا delete لصفّ.
-- • لا يُفشِل الصفوف القائمة: القيود تُضاف `not valid` حيث قد تخالفها
--   بياناتٌ قديمة، ثم تُفحَص في أمرٍ منفصل يُبلّغ ولا يُسقط الترحيل.
-- • يُبلّغ في جدول نتائج لا في raise notice — محرّر Supabase لا يعرضها.
-- ════════════════════════════════════════════════════════════════════

-- ═══ (١) إلغاء الرحلة: سببٌ وتاريخٌ ومَن ═══════════════════════════
-- الواجهة تطلب السبب إلزاماً منذ الموجة ٠، وكانت تكتبه في حقلٍ لا
-- عمود له فيُهمَل بصمت. هنا يجد مستقرّه.
alter table public.trips add column if not exists cancel_reason text;
alter table public.trips add column if not exists cancelled_at   timestamptz;
alter table public.trips add column if not exists cancelled_by   uuid references public.profiles(id) on delete set null;

-- الوقت يُختم في القاعدة لا يُرسَل من المتصفّح: ساعةُ جهازٍ مضبوطةٍ
-- خطأً كانت ستكتب إلغاءً في ٢٠٣٠ أو ٢٠١٩.
create or replace function public.stamp_trip_cancel() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = 'cancelled' and coalesce(old.status,'') is distinct from 'cancelled' then
    new.cancelled_at := now();
    new.cancelled_by := auth.uid();
  elsif new.status <> 'cancelled' then
    -- استئناف رحلةٍ ألغيت: يُمحى أثر الإلغاء فلا يُقرأ على رحلةٍ عادت.
    new.cancelled_at  := null;
    new.cancelled_by  := null;
    new.cancel_reason := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_trip_cancel_stamp on public.trips;
create trigger trg_trip_cancel_stamp before update on public.trips
  for each row execute function public.stamp_trip_cancel();

-- ═══ (٢) أعمدة المركبة ═════════════════════════════════════════════
-- الوثائق النظامية (حافلة) وحقول الطيران. كلها nullable: الصفّ القديم
-- يبقى صالحاً، والإلزام في readiness ويمنع التفعيل لا الوجود.
alter table public.transports add column if not exists serial_no                text;
alter table public.transports add column if not exists operator                 text;
alter table public.transports add column if not exists operator_phone           text;
alter table public.transports add column if not exists insurance_expiry         date;
alter table public.transports add column if not exists inspection_expiry        date;
alter table public.transports add column if not exists registration_expiry      date;
alter table public.transports add column if not exists transport_license_expiry date;
alter table public.transports add column if not exists flight_no                text;
alter table public.transports add column if not exists from_airport             text;
alter table public.transports add column if not exists to_airport               text;
alter table public.transports add column if not exists depart_time              text;
alter table public.transports add column if not exists arrive_time              text;
alter table public.transports add column if not exists cabin_class              text;
alter table public.transports add column if not exists baggage                  text;

-- ═══ (٣) حالة «مسودة» ══════════════════════════════════════════════
-- الافتراضي يتغيّر للصفوف الجديدة وحدها. الصفوف القائمة تبقى كما هي:
-- تحويل مركبةٍ تعمل اليوم إلى مسودة يُوقف باقاتها ورحلاتها فجأة، وهو
-- ضررٌ أكبر من العلّة التي جئنا نمنعها في الجديد.
alter table public.transports alter column status set default 'draft';
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'transports_status_chk') then
    alter table public.transports drop constraint transports_status_chk;
  end if;
  alter table public.transports add constraint transports_status_chk
    check (status in ('draft','active','inactive')) not valid;
end $$;

-- ═══ (٤) قيود السعة والتكلفة ═══════════════════════════════════════

-- (٤-أ) لا مركبة نشطة بسعةٍ أو تكلفةٍ صفر.
--   القيد مشروطٌ بالحالة لا مطلق: المسودة تُحفظ ناقصةً بحكم تعريفها،
--   ومنعُ حفظها كان سيمنع الموظف من ادّخار عملٍ نصف مكتمل.
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'transports_active_sane_chk') then
    alter table public.transports drop constraint transports_active_sane_chk;
  end if;
  alter table public.transports add constraint transports_active_sane_chk
    check (status <> 'active' or (coalesce(seats,0) > 0 and coalesce(seat_cost,0) > 0)) not valid;
end $$;

-- (٤-ب) لا رحلة بسعة صفر — ملاحظة «رحلات 0/0».
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'trips_seats_positive_chk') then
    alter table public.trips drop constraint trips_seats_positive_chk;
  end if;
  alter table public.trips add constraint trips_seats_positive_chk
    check (status in ('cancelled','archived') or coalesce(seats,0) > 0) not valid;
end $$;

-- (٤-ج) السعة لا تنزل تحت المحجوز — لا في الرحلة ولا في المركبة.
--   في الرحلة قيدٌ مباشر؛ في المركبة حارسٌ لأن الرقم في جدولٍ آخر.
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'trips_seats_ge_booked_chk') then
    alter table public.trips drop constraint trips_seats_ge_booked_chk;
  end if;
  alter table public.trips add constraint trips_seats_ge_booked_chk
    check (coalesce(seats,0) >= coalesce(booked_seats,0)) not valid;
end $$;

create or replace function public.guard_transport_seats() returns trigger
language plpgsql set search_path = public as $$
declare floor_seats int;
begin
  if new.seats is not distinct from old.seats then return new; end if;
  /* الرحلات المنتهية والملغاة مستثناة: مقاعدها لم تعد تُحجَز، وإبقاؤها
     في الحساب يقفل سعة المركبة على رقمٍ من الماضي إلى الأبد. */
  select max(t.booked_seats) into floor_seats
  from public.trips t
  where t.transport_id = new.id
    and t.status not in ('cancelled','archived')
    and coalesce(nullif(t.return_date,''), nullif(t.departure_date,''), '9999-12-31') >= to_char(now(), 'YYYY-MM-DD');
  if floor_seats is not null and new.seats < floor_seats then
    raise exception 'لا يمكن تخفيض السعة إلى % — يوجد % مقعداً محجوزاً في رحلة قائمة.', new.seats, floor_seats
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists trg_transport_seats_guard on public.transports;
create trigger trg_transport_seats_guard before update on public.transports
  for each row execute function public.guard_transport_seats();

-- ═══ (٥) توحيد المدن ═══════════════════════════════════════════════
-- «الدمام» و«مدينة الدمام» مدينتان في العدّاد وواحدة في الواقع.
-- المرادفات أدناه نسخةٌ من ALIASES في src/data/cities.ts — أيّ إضافة
-- هناك تلزمها إضافة هنا، وإلّا نجت الصيغة الجديدة من التوحيد.
--
-- VALUES داخل CTE لا جدولٌ مؤقّت: محرّر Supabase قد يُنهي المعاملة بين
-- أمرٍ وأمر، و`on commit drop` كان سيُسقط الجدول قبل أن يُقرأ.
with map(alias, canonical) as (values
  ('مدينة الدمام','الدمام'), ('مدينه الدمام','الدمام'), ('الدمام السعودية','الدمام'),
  ('جده','جدة'), ('مدينة جدة','جدة'), ('مدينه جده','جدة'),
  ('مكه','مكة المكرمة'), ('مكة','مكة المكرمة'), ('مكه المكرمه','مكة المكرمة'), ('مكة المكرمه','مكة المكرمة'),
  ('المدينه','المدينة المنورة'), ('المدينة','المدينة المنورة'),
  ('المدينه المنوره','المدينة المنورة'), ('المدينة المنوره','المدينة المنورة'),
  ('مدينة الرياض','الرياض'), ('مدينه الرياض','الرياض'), ('الرياض السعودية','الرياض'),
  ('الاحساء','الأحساء'), ('ابها','أبها'), ('خميس','خميس مشيط')
), fixed as (
  update public.branches b
     set city = m.canonical
    from map m
   where btrim(b.city) = m.alias
     and b.city is distinct from m.canonical
  returning 1
)
select count(*) as "فروع_وُحِّدت_مدنها" from fixed;

-- المسافات الزائدة وحدها، لكل صفٍّ لم يُطابق مرادفاً.
update public.branches set city = btrim(city) where city is distinct from btrim(city);

-- ═══ (٦) منع أرشفة فرع مرتبط ═══════════════════════════════════════
-- التعطيل يمنع الجديد ويُبقي القديم مفسَّراً؛ الأرشفة تُخفي الصفّ فتترك
-- رحلةً بنقطة انطلاقٍ مجهولة وفاتورةً بفرعٍ لا اسم له.
create or replace function public.guard_branch_archive() returns trigger
language plpgsql set search_path = public as $$
declare n_trips int; n_bookings int;
begin
  if new.archived_at is null or old.archived_at is not null then return new; end if;
  select count(*) into n_trips    from public.trips    where branch_id = new.id;
  select count(*) into n_bookings from public.bookings where branch_id = new.id;
  if n_trips > 0 or n_bookings > 0 then
    raise exception 'لا يمكن أرشفة الفرع: مرتبط بـ% رحلة و% طلباً. عطّله بدل أرشفته.', n_trips, n_bookings
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists trg_branch_archive_guard on public.branches;
create trigger trg_branch_archive_guard before update on public.branches
  for each row execute function public.guard_branch_archive();

-- ═══ (٧) دوال الكتابة تحمل الأعمدة الجديدة ═════════════════════════
-- بدون هذا تُكتب الحقول في المستند وتُهمَل بصمت — وهو أسوأ من الرفض:
-- الموظف يرى «حُفظ» ولا يجد ما حفظه.

create or replace function public.upsert_transport(doc jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v text := doc->>'id';
begin
  if not public.can_write_admin() then raise exception 'forbidden: admin only'; end if;
  insert into transports(id,name,mode,vehicle_type,seats,seat_cost,model,year,plate,driver,supervisor,status,notes,
    serial_no,operator,operator_phone,insurance_expiry,inspection_expiry,registration_expiry,transport_license_expiry,
    flight_no,from_airport,to_airport,depart_time,arrive_time,cabin_class,baggage)
  values(v,doc->>'name',doc->>'mode',doc->>'vehicleType',(doc->>'seats')::int,(doc->>'seatCost')::numeric,
    doc->>'model',doc->>'year',doc->>'plate',doc->>'driver',doc->>'supervisor',
    coalesce(nullif(doc->>'status',''),'draft'),doc->>'notes',
    nullif(doc->>'serialNo',''),nullif(doc->>'operator',''),nullif(doc->>'operatorPhone',''),
    nullif(doc->>'insuranceExpiry','')::date,nullif(doc->>'inspectionExpiry','')::date,
    nullif(doc->>'registrationExpiry','')::date,nullif(doc->>'transportLicenseExpiry','')::date,
    nullif(doc->>'flightNo',''),nullif(doc->>'fromAirport',''),nullif(doc->>'toAirport',''),
    nullif(doc->>'departTime',''),nullif(doc->>'arriveTime',''),nullif(doc->>'cabinClass',''),nullif(doc->>'baggage',''))
  on conflict(id) do update set name=excluded.name,mode=excluded.mode,vehicle_type=excluded.vehicle_type,
    seats=excluded.seats,seat_cost=excluded.seat_cost,model=excluded.model,year=excluded.year,plate=excluded.plate,
    driver=excluded.driver,supervisor=excluded.supervisor,status=excluded.status,notes=excluded.notes,
    serial_no=excluded.serial_no,operator=excluded.operator,operator_phone=excluded.operator_phone,
    insurance_expiry=excluded.insurance_expiry,inspection_expiry=excluded.inspection_expiry,
    registration_expiry=excluded.registration_expiry,transport_license_expiry=excluded.transport_license_expiry,
    flight_no=excluded.flight_no,from_airport=excluded.from_airport,to_airport=excluded.to_airport,
    depart_time=excluded.depart_time,arrive_time=excluded.arrive_time,cabin_class=excluded.cabin_class,baggage=excluded.baggage;

  delete from transport_features where transport_id = v;
  insert into transport_features(transport_id,item_id,text,icon,sort)
    select v,e->>'id',e->>'text',e->>'icon',(o-1)::int
    from jsonb_array_elements(coalesce(doc->'features','[]')) with ordinality t(e,o);

  delete from transport_reviews where transport_id = v;
  insert into transport_reviews(transport_id,item_id,name,text,consent,image,sort)
    select v,e->>'id',e->>'name',e->>'text',(e->>'consent')::boolean,nullif(e->>'image',''),(o-1)::int
    from jsonb_array_elements(coalesce(doc->'reviews','[]')) with ordinality t(e,o);

  /* الوسائط تُمسّ فقط إن حمل المستند مفتاحها: مصفوفةٌ غائبة تعني «لم
     أُرسلها»، ومسحُها عندئذٍ يمحو صور مركبةٍ بحفظِ حقلٍ نصّي. */
  if doc ? 'media' then
    delete from transport_media where transport_id = v;
    insert into transport_media(transport_id,item_id,kind,url,is_primary,category,sort)
      select v,e->>'id',e->>'kind',e->>'url',(e->>'primary')::boolean,e->>'category',(o-1)::int
      from jsonb_array_elements(coalesce(doc->'media','[]')) with ordinality t(e,o)
      where coalesce(e->>'url','') <> '';
  end if;
end $$;
revoke execute on function public.upsert_transport(jsonb) from public, anon;
grant  execute on function public.upsert_transport(jsonb) to authenticated;

-- upsert_trip: سبب الإلغاء وحده يُضاف. الوقت ومَن ألغى يختمهما الحارس.
--
-- تُقرأ الدالّة القائمة وتُرقَّع لا تُعاد كتابتها: ترحيل 20260813 نزع منها
-- كتابة bookedSeats (صار يشتقّها حارس)، ونسخةٌ كاملة هنا تعيده بصمت.
-- والرموز الثلاثة أدناه بلا مسافاتٍ داخلها وفريدةٌ في النصّ، فلا تتعلّق
-- المطابقة بتنسيقٍ قد يختلف بين نسخةٍ وأخرى.
do $$
declare src text; out text;
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'upsert_trip' and p.pronargs = 1;
  if src is null then raise notice 'تجاوز upsert_trip: غير موجودة'; return; end if;
  if position('cancel_reason' in src) > 0 then
    raise notice 'upsert_trip: تحمل cancel_reason أصلاً'; return;
  end if;

  out := replace(src, 'departure_point,departure_map_url,branch_id',
                      'departure_point,departure_map_url,cancel_reason,branch_id');
  out := replace(out, 'nullif(doc->>''branchId'','''')',
                      'nullif(doc->>''cancelReason'',''''),nullif(doc->>''branchId'','''')');
  out := replace(out, 'departure_map_url=excluded.departure_map_url,',
                      'departure_map_url=excluded.departure_map_url,cancel_reason=excluded.cancel_reason,');

  if out = src or position('cancel_reason' in out) = 0 then
    raise notice 'upsert_trip: لم يُطابَق النصّ — أضف cancel_reason يدوياً';
    return;
  end if;
  execute out;
  raise notice 'upsert_trip: صارت تكتب cancel_reason';
end $$;
revoke execute on function public.upsert_trip(jsonb) from public, anon;
grant  execute on function public.upsert_trip(jsonb) to authenticated;

-- ═══ تقرير: ما الذي يخالف القيود الجديدة الآن؟ ═════════════════════
-- القيود `not valid` فلا تمنع الترحيل، لكن ما يخالفها يجب أن يُرى.
-- بعد إصلاح الصفوف أدناه شغّل الأوامر في التذييل لتصير القيود مفروضة.
select 'مركبات نشطة بسعة أو تكلفة صفر' as "الخلل", count(*) as "العدد"
  from public.transports where status = 'active' and (coalesce(seats,0) = 0 or coalesce(seat_cost,0) = 0)
union all
select 'رحلات قائمة بسعة صفر', count(*)
  from public.trips where status not in ('cancelled','archived') and coalesce(seats,0) = 0
union all
select 'رحلات محجوزها أكبر من سعتها', count(*)
  from public.trips where coalesce(booked_seats,0) > coalesce(seats,0)
union all
select 'فروع بمدينة غير معتمدة', count(*)
  from public.branches b
 where btrim(coalesce(b.city,'')) <> ''
   and btrim(b.city) not in ('الرياض','جدة','مكة المكرمة','المدينة المنورة','الدمام','الخبر','الظهران',
     'الطائف','تبوك','بريدة','عنيزة','الأحساء','الهفوف','حائل','أبها','خميس مشيط','نجران','جازان','ينبع',
     'الجبيل','القطيف','عرعر','سكاكا','الباحة','بيشة','الخرج','الزلفي','المجمعة','شقراء','الدوادمي',
     'وادي الدواسر','رابغ','القنفذة')
union all
select 'فروع نشطة بلا مسؤول', count(*)
  from public.branches where coalesce(is_active,true) and coalesce(manager_id,'') = '';

-- ════════════════════════════════════════════════════════════════════
-- التذييل — شغّله بعد أن يصير التقرير أعلاه أصفاراً.
-- يحوّل القيود من «تمنع الجديد» إلى «مفروضة على الكل».
--
--   alter table public.transports validate constraint transports_status_chk;
--   alter table public.transports validate constraint transports_active_sane_chk;
--   alter table public.trips      validate constraint trips_seats_positive_chk;
--   alter table public.trips      validate constraint trips_seats_ge_booked_chk;
-- ════════════════════════════════════════════════════════════════════
