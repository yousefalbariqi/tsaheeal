-- ════════════════════════════════════════════════════════════════════
-- 20260813 — سلامة المقاعد: الدالة المفقودة، منع الازدواج، تحرير الإلغاء
--
-- (١) trip_taken_seats غير منشورة على القاعدة الحيّة — نداؤها يعيد
--     404 PGRST202 رغم وجود تعريفها في schema.sql و20260729. أثرها عند
--     إطفاء الوضع التجريبي: data.ts:78 يفشل ويعيد []، فيظهر كروكي
--     المقاعد فارغاً لكل عميل.
--
-- (٢) booking_seats بلا قيد تفرّد. والازدواج واقع فعلاً في البيانات:
--     المقعد ١٠ على TRP-9751 محجوز لـTRB-12448 (مؤكَّد) وTRB-3797F
--     (مراجعة) معاً. القسم (٢أ) ينظّف القائم قبل فرض القيد.
--
-- (٣) إلغاء الحجز لا يُنقص trips.booked_seats إطلاقاً — الإنشاء يزيدها
--     ولا شيء يعيدها. العدّاد على TRP-9751 = ٦ بينما النشِط ٥ والإجمالي ٧.
--
-- يُشغَّل بعد 20260810. لا يمسّ الواجهة ولا الصلاحيات.
-- ════════════════════════════════════════════════════════════════════

-- ═══════════ ١) الدالة المفقودة ═══════════
create or replace function public.trip_taken_seats(p_trip_id text) returns int[]
language sql security definer stable set search_path = public as $$
  select coalesce(array_agg(distinct bs.seat_no order by bs.seat_no), '{}')
    from booking_seats bs
    join bookings b on b.id = bs.booking_id
   where b.trip_id = p_trip_id
     and b.status not in ('cancelled','rejected')
     and bs.seat_no is not null;
$$;
revoke execute on function public.trip_taken_seats(text) from public;
grant  execute on function public.trip_taken_seats(text) to anon, authenticated;

-- ═══════════ ٢) منع ازدواج المقعد على الرحلة ═══════════
/* trip_id منسوخ على الصف: القيد الفريد لا يقبل تعبيراً عبر جدول آخر،
   وربطه بـ bookings في كل فحص يعني فهرساً على دالة غير ثابتة. */
alter table booking_seats add column if not exists trip_id text;

update booking_seats bs
   set trip_id = b.trip_id
  from bookings b
 where b.id = bs.booking_id and bs.trip_id is distinct from b.trip_id;

-- ٢أ) تنظيف التعارض القائم قبل فرض القيد: يُبقى الأقدم ويُسحب من الأحدث.
with active as (
  select bs.id, bs.trip_id, bs.seat_no, bs.booking_id, b.created_at,
         row_number() over (
           partition by bs.trip_id, bs.seat_no
           order by b.created_at, bs.booking_id
         ) as rn
    from booking_seats bs
    join bookings b on b.id = bs.booking_id
   where b.status not in ('cancelled','rejected')
     and bs.seat_no is not null
)
delete from booking_seats
 where id in (select id from active where rn > 1);

/* شرطي على الحجوزات النشطة: المقعد يعود للاستعمال بعد الإلغاء.
   is_active عمود محفوظ لأن الفهرس الجزئي لا يقبل استعلاماً فرعياً. */
alter table booking_seats add column if not exists is_active boolean not null default true;

update booking_seats bs
   set is_active = (b.status not in ('cancelled','rejected'))
  from bookings b
 where b.id = bs.booking_id;

create unique index if not exists booking_seats_trip_seat_uniq
  on booking_seats(trip_id, seat_no)
  where is_active and trip_id is not null and seat_no is not null;

/* تعبئة trip_id/is_active تلقائياً — الواجهة تُدرج المقاعد بلا هذين
   الحقلين، وأي إدراج بلا trip_id يفلت من القيد الفريد بصمت. */
create or replace function public.booking_seat_fill() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  /* SELECT INTO بلا صفّ مطابق يكتب NULL في الوجهتين — و is_active
     معرَّف not null، فصفّ بـbooking_id معلّق كان يُجهض الإدراج. */
  if new.booking_id is not null then
    select b.trip_id, (b.status not in ('cancelled','rejected'))
      into new.trip_id, new.is_active
      from bookings b where b.id = new.booking_id;
  end if;
  if new.is_active is null then new.is_active := true; end if;
  return new;
end $$;

drop trigger if exists trg_booking_seat_fill on booking_seats;
create trigger trg_booking_seat_fill before insert or update of booking_id on booking_seats
  for each row execute function public.booking_seat_fill();

-- ═══════════ ٣) تحرير المقاعد عند الإلغاء ═══════════
/* الحساب من الحجوزات النشطة لا بزيادة/نقصان تفاضلي: التفاضل يفترض أن كل
   تغيّر حالة يمرّ من هنا، وعمر البيانات أثبت العكس (العدّاد منحرف الآن).
   إعادة الاشتقاق تُصلح نفسها مهما كان مصدر الانحراف. */
create or replace function public.resync_trip_seats(p_trip_id text) returns void
language sql security definer set search_path = public as $$
  update trips t
     set booked_seats = coalesce((
           select sum(b.persons) from bookings b
            where b.trip_id = t.id and b.status not in ('cancelled','rejected')
         ), 0)
   where t.id = p_trip_id;
$$;

/* حارس على bookings: أي تغيّر في الحالة أو العدد أو الرحلة يعيد اشتقاق
   العدّاد — يغطّي مسار الموظف (upsert_booking) ومسار العميل معاً. */
create or replace function public.booking_seats_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.resync_trip_seats(old.trip_id);
    return old;
  end if;
  perform public.resync_trip_seats(new.trip_id);
  if tg_op = 'UPDATE' and old.trip_id is distinct from new.trip_id then
    perform public.resync_trip_seats(old.trip_id);
  end if;
  -- مقاعد الحجز تتبع حالته: ملغى ⇒ تخرج من القيد الفريد فيعود المقعد متاحاً.
  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    update booking_seats set is_active = (new.status not in ('cancelled','rejected'))
     where booking_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists trg_booking_seats_sync on bookings;
create trigger trg_booking_seats_sync after insert or update or delete on bookings
  for each row execute function public.booking_seats_sync();

-- ═══════════ ٤) نزع الحساب اليدوي الذي صار يزدوج مع الحارس ═══════════
/* الحارس يشتقّ booked_seats من الحجوزات النشطة، وموضعان يكتبانها يدوياً:

   (أ) create_public_booking ينهي بـ«booked_seats + n» بعد الإدراج. الحارس
       يكون قد احتسب الحجز الجديد سلفاً، فالسطر يضيفه مرّة ثانية.
   (ب) upsert_trip يكتب bookedSeats من مستند الواجهة. الموظف يحمل نسخة
       قديمة من الرحلة، فيدهس القيمة المشتقّة بقيمة عمرها دقائق.

   لا نعيد كتابة الأجسام — تسعة ملفات تعرّف create_public_booking بالفعل،
   ونسخة عاشرة هنا تنحرف عنها بصمت. نقرأ التعريف القائم بـpg_get_functiondef
   ونحذف السطر منه، فيبقى الجسم كما هو حرفياً. نفس أسلوب 20260804. */
do $$
declare src text; out text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='create_public_booking' and p.pronargs=1;
  if src is null then
    raise notice 'تجاوز create_public_booking: غير موجودة';
  else
    out := replace(src, 'update trips set booked_seats = booked_seats + n where id = tid;',
                        '-- عدّاد المقاعد يشتقّه trg_booking_seats_sync (20260813)');
    if out = src then
      raise notice 'create_public_booking: سطر الزيادة اليدوية غير موجود — راجعها يدوياً';
    else
      execute out;
      raise notice 'create_public_booking: نُزعت الزيادة اليدوية';
    end if;
  end if;
end $$;
/* المنح يسقط مع create or replace في بعض الحالات — نعيده صراحةً كما في 20260810. */
revoke execute on function public.create_public_booking(jsonb) from public, anon;
grant  execute on function public.create_public_booking(jsonb) to authenticated;

do $$
declare src text; out text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='upsert_trip' and p.pronargs=1;
  if src is null then
    raise notice 'تجاوز upsert_trip: غير موجودة';
  else
    -- الإدراج: القيمة الابتدائية صفر، والحارس يصحّحها فور أول حجز.
    out := replace(src, '(doc->>''bookedSeats'')::int', '0');
    -- التحديث: لا تُمسّ القيمة القائمة إطلاقاً.
    out := replace(out, 'booked_seats=excluded.booked_seats,', '');
    if out = src then
      raise notice 'upsert_trip: نصّ bookedSeats غير موجود — راجعها يدوياً';
    else
      execute out;
      raise notice 'upsert_trip: صار يتجاهل bookedSeats من الواجهة';
    end if;
  end if;
end $$;
revoke execute on function public.upsert_trip(jsonb) from public, anon;
grant  execute on function public.upsert_trip(jsonb) to authenticated;

-- ═══════════ ٥) إصلاح الانحراف القائم مرة واحدة ═══════════
update trips t
   set booked_seats = coalesce((
         select sum(b.persons) from bookings b
          where b.trip_id = t.id and b.status not in ('cancelled','rejected')
       ), 0);
