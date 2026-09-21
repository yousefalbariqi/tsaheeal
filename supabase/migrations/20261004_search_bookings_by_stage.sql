-- ════════════════════════════════════════════════════════════════════
-- 20261004 — تصفية الطلبات بخطوة العمل لا باسم الحالة
--
-- صارت شاشة الطلب مساراً من أربع خطوات: التحقق من البيانات ← اختيار
-- المقاعد ← بانتظار الدفع ← مؤكد. والخطوة ليست عموداً في القاعدة، بل
-- تُشتقّ ممّا هو مكتوبٌ فعلاً: حالة الطلب، وتحقّق الموظف من معتمريه.
--
-- وبقي شريط التصفية فوق الجدول يقول «جديد · قيد المراجعة · مقبول» —
-- ثلاثُ شرائح لمعنًى لم يعد معروضاً في أي مكانٍ آخر، وشريحتان لخطوةٍ
-- واحدة. فلمّا صارت الشرائح أربعاً احتاج الخادم أن يفهمها: «التحقق» و
-- «اختيار المقاعد» حالتُهما في القاعدة واحدة (new · reviewing) ولا
-- يفرّقهما إلا تحقّق المعتمرين، و«بانتظار الدفع» تضمّ خمس حالات.
--
-- فلا يكفي `b.status = status_filter`. هذا الترحيل يضيف `stage_filter`
-- ويترك `status_filter` كما هو للروابط القديمة المحفوظة.
--
-- ⚠️ قبل تشغيله: شريط التصفية يعمل على ما حُمِّل في المتصفّح وحده
-- (تتدهور useServerPagedSearch إلى التصفية المحلية عند PGRST202)،
-- فالعدد فوق الجدول يقول عدد المحمَّل لا عدد القاعدة. وبعده يصير
-- العدّ والترقيم في PostgreSQL كبقية المرشّحات.
-- ════════════════════════════════════════════════════════════════════

-- ═══ (١) هل تُحقِّق من كل معتمري الطلب؟ ═══════════════════════════════
/* نفس قاعدة allVerified في الواجهة (features/bookings/verification.ts):
   طلبٌ بلا معتمرين ليس متحقَّقاً منه — لا شيء رُوجع. */
create or replace function public.booking_all_verified(p_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.booking_pilgrims where booking_id = p_id)
     and not exists (
       select 1 from public.booking_pilgrims
        where booking_id = p_id and coalesce(verify, '') <> 'verified');
$$;
revoke all on function public.booking_all_verified(text) from public, anon;
grant execute on function public.booking_all_verified(text) to authenticated, service_role;

-- ═══ (٢) خطوة الطلب ═════════════════════════════════════════════════
/* اشتقاقٌ واحدٌ في موضعين: هذا نصّ stageOf في features/bookings/stages.ts
   حرفياً. الحالات المتروكة من المسار القديم (paid · verifying · verified)
   تقف عند خطوة الدفع فلا يسقط طلبٌ قديم خارج المرشّحات. */
create or replace function public.booking_stage(p_status text, p_id text)
returns text language sql stable security definer set search_path = public as $$
  select case
    when p_status in ('rejected', 'cancelled') then 'closed'
    when p_status = 'confirmed' then 'done'
    when p_status in ('accepted', 'awaiting_payment', 'paid', 'verifying', 'verified') then 'payment'
    when public.booking_all_verified(p_id) then 'seats'
    else 'verify'
  end;
$$;
revoke all on function public.booking_stage(text, text) from public, anon;
grant execute on function public.booking_stage(text, text) to authenticated, service_role;

/* الخطوة تُسأل لكل صفٍّ في الصفحة، وسؤالها سؤالُ معتمري الطلب. */
create index if not exists booking_pilgrims_booking_idx on public.booking_pilgrims(booking_id);

-- ═══ (٣) البحث: مرشّحٌ بالخطوة بجانب مرشّح الحالة ════════════════════
/* توقيع الدالّة يتغيّر بزيادة وسيط، و`create or replace` يُنشئ دالّةً
   ثانيةً بتوقيعٍ آخر بدل أن يستبدل — فيصير للاسم حملان وتلتبس المناداة
   بالأسماء. تُحذف القديمة أولاً. */
drop function if exists public.admin_search_bookings(text, text, date, boolean, integer, integer);

create or replace function public.admin_search_bookings(
  q text default '', status_filter text default null, stage_filter text default null,
  created_on date default null, only_unlinked boolean default false,
  page_no integer default 1, page_size integer default 25
)
returns table (booking_id text, total_count bigint)
language sql security definer stable set search_path = public as $$
  with k as (
    select trim(coalesce(q,'')) as raw, regexp_replace(coalesce(q,''), '\D', '', 'g') as digits
  ),
  matched as (
    select b.id, b.created_at
    from public.bookings b
    left join public.trips t on t.id = b.trip_id, k
    where public.is_staff()
      and b.archived_at is null
      and public.branch_visible(coalesce(nullif(b.branch_id,''), nullif(t.branch_id,'')))
      and (coalesce(status_filter, '') = '' or b.status = status_filter)
      and (coalesce(stage_filter, '') = '' or public.booking_stage(b.status, b.id) = stage_filter)
      and (created_on is null or left(b.created_at, 10) = created_on::text)
      and (not only_unlinked or not exists (select 1 from public.beneficiary_bookings bb where bb.value = b.id))
      and (
        k.raw = ''
        or b.id ilike '%' || k.raw || '%'
        or b.client_name ilike '%' || k.raw || '%'
        or (length(k.digits) >= 3 and regexp_replace(coalesce(b.client_phone,''), '\D', '', 'g') like '%' || k.digits || '%')
        or exists (select 1 from public.booking_pilgrims bp where bp.booking_id=b.id and (bp.id_number ilike '%' || k.raw || '%' or bp.name ilike '%' || k.raw || '%'))
      )
  ), numbered as (
    select id, count(*) over() as all_count from matched order by created_at desc, id desc
  )
  select id, all_count from numbered
  offset greatest(page_no - 1, 0) * greatest(page_size, 1)
  limit least(greatest(page_size, 1), 100);
$$;
revoke all on function public.admin_search_bookings(text,text,text,date,boolean,integer,integer) from public, anon;
grant execute on function public.admin_search_bookings(text,text,text,date,boolean,integer,integer) to authenticated, service_role;

comment on function public.admin_search_bookings(text,text,text,date,boolean,integer,integer) is
  'بحث الطلبات وترقيمها. stage_filter: verify · seats · payment · done · closed (خطوة العمل)؛ status_filter: اسم الحالة للروابط القديمة.';

insert into public.schema_migrations(version, note) values
  ('20261004_search_bookings_by_stage', 'تصفية الطلبات بخطوة العمل الأربع لا باسم الحالة')
on conflict (version) do nothing;

-- تم.
