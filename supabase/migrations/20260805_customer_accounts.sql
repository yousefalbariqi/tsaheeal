-- ════════════════════════════════════════════════════════════════════
-- 20260805 — حساب المستفيد (تسجيل دخول بالجوال) + ربط الحجز بصاحبه
--
-- كل ما هنا إضافي ومتوافق مع الحزمة القديمة: الدوال العامة تبقى
-- ممنوحة لـ anon، والحمل القديم my_public_bookings(p_phone) يبقى
-- موجوداً (لكنه صار يتجاهل الوسيط). الإغلاق النهائي في 20260806.
--
-- يشترط تشغيل 20260804_rls_hardening.sql قبله (is_staff/can_write_*).
-- ════════════════════════════════════════════════════════════════════

-- ═══════════════ 1) تطبيع أرقام الجوال ═══════════════
/* توأم waNormalize() في src/lib/utils.ts — لا بد أن يتطابقا حرفياً:
     "0501234567" → "966501234567"    "+966 50 123 4567" → "966501234567"
   وهذه بالضبط صيغة مُطالبة phone في JWT الذي يصدره Supabase
   (أرقام فقط، بلا +). بلا set search_path عن قصد: الجسم يستدعي
   pg_catalog صراحةً، ووجود SET يمنع الـinline ويعقّد استخدامها في فهرس. */
create or replace function public.norm_phone(p text) returns text
language sql immutable parallel safe as $$
  select case
           when d = ''            then null
           when left(d,3) = '966' then d
           when left(d,1) = '0'   then '966' || substr(d,2)
           when left(d,1) = '5'   then '966' || d
           else d
         end
  from (select pg_catalog.regexp_replace(coalesce(p,''), '\D', '', 'g') as d) x;
$$;

/* العكس — لوحة الموظف وروابط الواتساب تتوقّع 05XXXXXXXX. */
create or replace function public.local_phone(p text) returns text
language sql immutable parallel safe as $$
  select case when left(d,3) = '966' and length(d) = 12 then '0' || substr(d,4) else d end
  from (select pg_catalog.regexp_replace(coalesce(p,''), '\D', '', 'g') as d) x;
$$;

/* هاتف الجلسة الموثّق: الـJWT أولاً، ثم auth.users كخطة بديلة
   (تنفع إن كان الرمز قديماً بعد تغيير الرقم). */
create or replace function public.auth_phone() returns text
language sql security definer stable set search_path = public as $$
  select public.norm_phone(coalesce(
    nullif(auth.jwt() ->> 'phone', ''),
    (select u.phone from auth.users u where u.id = auth.uid())
  ));
$$;

/* الحجوزات القائمة مخزّنة بصيغة 05… فالمطابقة تمرّ بالتطبيع دائماً.
   فهرس تعبيري لا عمود مُولَّد: العمود المُولَّد يجمّد تعريف norm_phone
   (CREATE OR REPLACE لا يُعيد حساب الصفوف القديمة) بينما الفهرس يُسقط ويُبنى. */
create index if not exists bookings_phone_norm_idx on bookings (public.norm_phone(client_phone));

-- ═══════════════ 2) جدول ملف المستفيد ═══════════════
create table if not exists public.customer_profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  first_name  text not null default '',
  last_name   text not null default '',
  birth_date  date,
  email       text,
  phone       text,                    -- E.164 بلا + — مرآة auth.users.phone
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  /* بوابة واحدة تقرأها الواجهة لتقرّر عرض شاشة «أكمل حسابك» —
     أفضل من تكرار القاعدة في TS. */
  profile_complete boolean generated always as
    (first_name <> '' and last_name <> '' and birth_date is not null) stored
);
create index if not exists customer_profiles_phone_idx on public.customer_profiles (public.norm_phone(phone));

alter table public.customer_profiles enable row level security;

drop policy if exists "cp self read"   on public.customer_profiles;
drop policy if exists "cp self insert" on public.customer_profiles;
drop policy if exists "cp self update" on public.customer_profiles;
drop policy if exists "cp staff read"  on public.customer_profiles;
drop policy if exists "cp admin all"   on public.customer_profiles;

create policy "cp self read"   on public.customer_profiles for select to authenticated using (id = auth.uid());
create policy "cp self insert" on public.customer_profiles for insert to authenticated with check (id = auth.uid());
create policy "cp self update" on public.customer_profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy "cp staff read"  on public.customer_profiles for select to authenticated using (public.is_staff());
create policy "cp admin all"   on public.customer_profiles for all    to authenticated
  using (public.can_write_admin()) with check (public.can_write_admin());

/* صلاحيات على مستوى العمود إلى جانب RLS: RLS تسمح بالصف، والصلاحية
   تمنع الحقل — فلا يستطيع المستفيد تغيير phone (الموثّق) ولا id. */
revoke all on public.customer_profiles from anon, authenticated;
grant select on public.customer_profiles to authenticated;
grant insert (id, first_name, last_name, birth_date, email) on public.customer_profiles to authenticated;
grant update (first_name, last_name, birth_date, email)     on public.customer_profiles to authenticated;

create or replace function public.touch_customer_profile() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists trg_cp_touch on public.customer_profiles;
create trigger trg_cp_touch before update on public.customer_profiles
  for each row execute function public.touch_customer_profile();

-- ═══════════════ 3) ربط الحجز بالحساب + رمز الدفع ═══════════════
alter table bookings add column if not exists customer_id uuid
  references public.customer_profiles(id) on delete set null;
create index if not exists bookings_customer_idx on bookings(customer_id);

/* رابط الدفع يُفتح من واتساب على جهاز بلا جلسة (وقد يفتحه أحد أفراد
   الأسرة) — فحدود الأمان هنا رمز غير قابل للتخمين لا وجود جلسة. */
alter table bookings add column if not exists pay_token uuid default gen_random_uuid();
update bookings set pay_token = gen_random_uuid() where pay_token is null;
alter table bookings alter column pay_token set not null;
create unique index if not exists bookings_pay_token_idx on bookings(pay_token);

-- ═══════════════ 4) تهيئة الحساب وضمّ الحجوزات السابقة ═══════════════
/* مُفضَّلة على trigger على auth.users: لا تحتاج صلاحيات في مخطط auth،
   ولا تُسقِط التسجيل إن أخطأت، وتُصلح نفسها لمستخدمين موجودين سلفاً. */
create or replace function public.customer_bootstrap() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
        v_ph  text := public.auth_phone();
        v_row customer_profiles;
        v_claimed int := 0;
begin
  if v_uid is null then raise exception 'auth_required';    end if;
  if v_ph  is null then raise exception 'phone_unverified'; end if;

  insert into customer_profiles(id, phone) values (v_uid, v_ph)
    on conflict (id) do update set phone = excluded.phone
    returning * into v_row;

  /* ضمّ الحجوزات التي أُنشئت قبل وجود الحساب بنفس الرقم الموثّق.
     ملاحظة: رقم جوال مُعاد تدويره قد يضمّ حجوزات مالكه السابق —
     إن صار هذا خطراً واقعياً فأضف شرط نافذة زمنية على created_at. */
  update bookings set customer_id = v_uid
   where customer_id is null and public.norm_phone(client_phone) = v_ph;
  get diagnostics v_claimed = row_count;

  return jsonb_build_object(
    'id', v_row.id, 'firstName', v_row.first_name, 'lastName', v_row.last_name,
    'birthDate', v_row.birth_date, 'email', v_row.email, 'phone', v_row.phone,
    'complete', v_row.profile_complete, 'claimed', v_claimed);
end $$;
revoke execute on function public.customer_bootstrap() from public, anon;
grant  execute on function public.customer_bootstrap() to authenticated;

-- ═══════════════ 5) «حجوزاتي» — من الجلسة لا من وسيط ═══════════════
create or replace function public.my_public_bookings()
returns table(id text, status text, payment_status text, package_name text,
              trip_date text, trip_time text, persons int, total numeric, created_at text)
language sql security definer stable set search_path = public as $$
  select b.id, b.status, b.payment_status, coalesce(p.name,''),
         t.departure_date, t.departure_time, b.persons, b.total, b.created_at
  from (select auth.uid() as uid, public.auth_phone() as ph) me
  join bookings b
    on me.uid is not null
   and ( b.customer_id = me.uid
      or (b.customer_id is null and me.ph is not null
          and public.norm_phone(b.client_phone) = me.ph) )
  left join trips    t on t.id = b.trip_id
  left join packages p on p.id = coalesce(nullif(b.package_id,''), t.package_id)
  order by b.created_at desc;
$$;
revoke execute on function public.my_public_bookings() from public, anon;
grant  execute on function public.my_public_bookings() to authenticated;

/* الحمل القديم — يبقى بنفس التوقيع لئلا تُصاب حزمة قديمة بـ404 أثناء
   النشر، لكنه يتجاهل p_phone تماماً (كان تعداداً لحجوزات أي رقم).
   سحب المنح من anon مؤجَّل إلى 20260806. */
create or replace function public.my_public_bookings(p_phone text)
returns table(id text, status text, payment_status text, package_name text,
              trip_date text, trip_time text, persons int, total numeric, created_at text)
language sql security definer stable set search_path = public as $$
  select * from public.my_public_bookings();
$$;

-- ═══════════════ 6) إنشاء الحجز — الهاتف من الجلسة ═══════════════
create or replace function public.create_public_booking(doc jsonb) returns text
language plpgsql security definer set search_path=public as $$
declare
  v   text := coalesce(nullif(doc->>'id',''), 'TRB-'||upper(substr(md5(random()::text),1,5)));
  tid text := nullif(doc->>'tripId','');
  n   int  := greatest(coalesce((doc->>'persons')::int,1),1);
  avail int;
  v_uid uuid := auth.uid();
  v_ph  text := public.auth_phone();
  v_phone_col text;
begin
  if tid is null then raise exception 'trip_required'; end if;

  /* الإلزام يُفعَّل في 20260806 بعد استقرار الواجهة الجديدة.
     حتى ذلك الحين: من له جلسة يُربط حجزه بحسابه، ومن لا جلسة له
     يُحجز كما كان بالرقم المكتوب. */
  if v_uid is not null and v_ph is not null then
    perform public.customer_bootstrap();          -- يضمن صف الحساب (شرط المفتاح الأجنبي)
    /* الهاتف الموثّق يتجاوز doc->>'clientPhone' — فلا يفصل خطأ إدخال
       (أو حمولة مُلفّقة) الحجز عن صاحبه. يُخزَّن 05… كما اعتادت اللوحة. */
    v_phone_col := public.local_phone(v_ph);
  else
    v_uid := null;
    v_phone_col := doc->>'clientPhone';
  end if;

  select (seats - booked_seats) into avail from trips where id = tid for update;
  if avail is null then raise exception 'trip_not_found'; end if;
  if n > avail then raise exception 'insufficient_seats:%', avail; end if;

  insert into bookings(id,trip_id,package_id,client_name,client_phone,customer_id,room_type,persons,total,
    status,payment_status,created_at,staff,source,sent_date)
  values(v,tid,nullif(doc->>'packageId',''),doc->>'clientName',v_phone_col,v_uid,doc->>'roomType',n,
    (doc->>'total')::numeric,'reviewing','none',to_char(now(),'YYYY-MM-DD'),'','public',null);
  update trips set booked_seats = booked_seats + n where id = tid;
  /* هاتف كل معتمر يبقى كما كُتب — الزوجة تحجز من حساب زوجها وتُبقي رقمها. */
  insert into booking_pilgrims(booking_id,name,doc_type,id_number,nationality,gender,age_group,birth_date,phone,seat_no,sort)
    select v,e->>'name',nullif(e->>'docType',''),e->>'idNumber',e->>'nationality',e->>'gender',nullif(e->>'ageGroup',''),e->>'birthDate',e->>'phone',nullif(e->>'seat','')::int,(o-1)::int
    from jsonb_array_elements(coalesce(doc->'pilgrims','[]')) with ordinality t(e,o);
  insert into booking_seats(booking_id,seat_no,sort)
    select v,(e)::int,(o-1)::int from jsonb_array_elements_text(coalesce(doc->'seats','[]')) with ordinality t(e,o);
  return v;
end $$;
grant execute on function public.create_public_booking(jsonb) to anon, authenticated;

-- ═══════════════ 7) الدفع: بالجلسة أو بالرمز ═══════════════
create or replace function public.confirm_payment(p_booking_id text) returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_ph text := public.auth_phone();
begin
  if v_uid is null then raise exception 'auth_required'; end if;
  if not exists (
    select 1 from bookings b
     where b.id = p_booking_id
       and b.status not in ('cancelled','rejected')
       and ( b.customer_id = v_uid
          or (b.customer_id is null and v_ph is not null
              and public.norm_phone(b.client_phone) = v_ph))
  ) then raise exception 'forbidden'; end if;
  update bookings set payment_status='verified', status='paid' where id = p_booking_id;
  update payments  set pay_status='verified' where booking_id = p_booking_id;
end $$;
-- المنح لـ anon يُسحب في 20260806 (الحزمة القديمة تناديها بلا جلسة)
grant execute on function public.confirm_payment(text) to anon, authenticated;

create or replace function public.confirm_payment(p_booking_id text, p_token uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from bookings
                  where id = p_booking_id and pay_token = p_token
                    and status not in ('cancelled','rejected'))
  then raise exception 'invalid_pay_token'; end if;
  update bookings set payment_status='verified', status='paid' where id = p_booking_id;
  update payments  set pay_status='verified' where booking_id = p_booking_id;
end $$;
grant execute on function public.confirm_payment(text, uuid) to anon, authenticated;

/* عرض تفاصيل الدفع بلا جلسة موظف — كانت صفحة /pay/:id تقرأ من مخزن
   لا يُملأ إلا بعد دخول موظف، فتظهر «رابط غير صالح» لكل عميل حقيقي. */
create or replace function public.booking_for_pay(p_booking_id text, p_token uuid)
returns table(id text, client_name text, package_name text, room_type text,
              persons int, total numeric, payment_status text, status text)
language sql security definer stable set search_path = public as $$
  select b.id, b.client_name, coalesce(p.name,''), b.room_type, b.persons, b.total,
         b.payment_status, b.status
  from bookings b
  left join trips    t on t.id = b.trip_id
  left join packages p on p.id = coalesce(nullif(b.package_id,''), t.package_id)
  where b.id = p_booking_id and b.pay_token = p_token;
$$;
grant execute on function public.booking_for_pay(text, uuid) to anon, authenticated;
