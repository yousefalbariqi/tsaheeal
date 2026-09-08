-- ════════════════════════════════════════════════════════════════════
-- 20260917 — حجز المقعد مؤقتاً أثناء إدخال البيانات
--
-- «عند بدء إدخال البيانات، احجز المقعد مؤقتاً بمهلة واضحة ثم حرره عند
-- الانتهاء». بدونه: معتمران يُدخلان بياناتهما لنفس المقعد عشر دقائق،
-- ويكتشف الثاني الرفض في آخر خطوة.
--
-- ── ما فيه ──
--   (١) seat_holds: مقعدٌ لرحلةٍ بيد حاملٍ حتى وقتٍ — مفتاحٌ واحد للمقعد
--   (٢) hold_seats: يستبدل حجوزات الحامل على الرحلة بالمختار الآن، يرفض
--       المبيع والمحجوز لغيره، ويعيد وقت الانتهاء (١٠ دقائق افتراضاً)
--   (٣) release_seat_holds: يحرّر ما للحامل عند خروجه
--   (٤) trip_taken_seats تُعيد المبيع + المحجوز مؤقتاً لغير السائل،
--       فيظهر في الكروكي مشغولاً
--   (٥) حارسٌ على booking_seats: لا يُدرَج مقعدٌ يحمله غيرُ صاحب الحجز
--       ما دام حجزه سارياً؛ والإدراج يستهلك الحجز المؤقت
--
-- المهلة تنتهي بالوقت لا بمهمّةٍ مجدولة: كل دالّة تُهمل المنتهي، ولا شيء
-- يعتمد على تنظيفٍ ليلي. لا حاجة لـpg_cron.
-- آمن للإعادة.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.seat_holds (
  trip_id    text not null references public.trips(id) on delete cascade,
  seat_no    int  not null,
  holder     uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (trip_id, seat_no)
);
create index if not exists seat_holds_holder_idx  on public.seat_holds(holder);
create index if not exists seat_holds_expires_idx on public.seat_holds(expires_at);
alter table public.seat_holds enable row level security;
/* لا سياسات قراءةٍ أو كتابةٍ مباشرة: الوصول عبر الدوالّ وحدها. */
revoke all on public.seat_holds from anon, authenticated;

create or replace function public.hold_seats(p_trip_id text, p_seats int[], p_minutes int default 10)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_exp timestamptz; v_bad int; v_cap int;
begin
  if v_uid is null then raise exception 'auth_required'; end if;
  if p_trip_id is null then raise exception 'trip_required'; end if;
  delete from seat_holds where expires_at < now();
  delete from seat_holds where trip_id = p_trip_id and holder = v_uid;
  if p_seats is null or coalesce(array_length(p_seats,1),0) = 0 then return null; end if;

  select seats into v_cap from trips where id = p_trip_id;
  if v_cap is null then raise exception 'trip_not_found'; end if;
  if exists (select 1 from unnest(p_seats) s where s < 1 or s > v_cap) then raise exception 'seat_range'; end if;

  select min(bs.seat_no) into v_bad from booking_seats bs
   where bs.trip_id = p_trip_id and bs.is_active and bs.seat_no = any(p_seats);
  if v_bad is not null then raise exception 'seat_taken:%', v_bad; end if;

  select min(h.seat_no) into v_bad from seat_holds h
   where h.trip_id = p_trip_id and h.seat_no = any(p_seats) and h.holder <> v_uid and h.expires_at > now();
  if v_bad is not null then raise exception 'seat_held:%', v_bad; end if;

  v_exp := now() + make_interval(mins => greatest(least(coalesce(p_minutes,10),30),1));
  insert into seat_holds(trip_id, seat_no, holder, expires_at)
    select p_trip_id, s, v_uid, v_exp from unnest(p_seats) s
  on conflict (trip_id, seat_no) do update set holder = excluded.holder, expires_at = excluded.expires_at;
  return v_exp;
end $$;
revoke all on function public.hold_seats(text,int[],int) from public, anon;
grant execute on function public.hold_seats(text,int[],int) to authenticated;

create or replace function public.release_seat_holds(p_trip_id text) returns void
language sql security definer set search_path = public as $$
  delete from seat_holds where holder = auth.uid() and (p_trip_id is null or trip_id = p_trip_id);
$$;
revoke all on function public.release_seat_holds(text) from public, anon;
grant execute on function public.release_seat_holds(text) to authenticated;

/* المبيع + المحجوز مؤقتاً لغير السائل — يُلوَّن مشغولاً في الكروكي.
   نسخة 20260813 مع الاتحاد. */
create or replace function public.trip_taken_seats(p_trip_id text) returns int[]
language sql security definer stable set search_path = public as $$
  select coalesce(array_agg(distinct s order by s), '{}') from (
    select bs.seat_no as s
      from booking_seats bs join bookings b on b.id = bs.booking_id
     where b.trip_id = p_trip_id and b.status not in ('cancelled','rejected') and bs.seat_no is not null
    union
    select h.seat_no from seat_holds h
     where h.trip_id = p_trip_id and h.expires_at > now() and h.holder is distinct from auth.uid()
  ) x;
$$;
revoke execute on function public.trip_taken_seats(text) from public;
grant  execute on function public.trip_taken_seats(text) to anon, authenticated;

/* الحارس: يعمل بعد trg_booking_seat_fill (الترتيب أبجدي) فيجد trip_id
   معبّأً. الموظف يتجاوز الحجز المؤقت — بيعه في الفرع يغلب انتظاراً
   على الجوال — أمّا العميل فلا يأخذ مقعداً يحمله غيره. */
create or replace function public.booking_seat_hold_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_trip text; v_cust uuid; v_holder uuid;
begin
  v_trip := coalesce(new.trip_id, (select trip_id from bookings where id = new.booking_id));
  if v_trip is null or new.seat_no is null then return new; end if;
  select customer_id into v_cust from bookings where id = new.booking_id;
  select holder into v_holder from seat_holds
   where trip_id = v_trip and seat_no = new.seat_no and expires_at > now();
  if v_holder is not null and v_holder is distinct from v_cust and not public.is_staff() then
    raise exception 'seat_held: المقعد % محجوز مؤقتاً لمعتمرٍ آخر', new.seat_no;
  end if;
  delete from seat_holds where trip_id = v_trip and seat_no = new.seat_no;
  return new;
end $$;
drop trigger if exists trg_booking_seat_hold_guard on public.booking_seats;
create trigger trg_booking_seat_hold_guard before insert on public.booking_seats
  for each row execute function public.booking_seat_hold_guard();

-- ═══ تقرير ═════════════════════════════════════════════════════════
select 'حجوزات مؤقتة سارية الآن' as "البند", count(*)::text as "العدد" from seat_holds where expires_at > now();

insert into public.schema_migrations(version, note) values
  ('20260917_seat_holds', 'حجز المقعد مؤقتاً بمهلة أثناء إدخال البيانات، والمحجوز يظهر مشغولاً في الكروكي')
on conflict (version) do nothing;
