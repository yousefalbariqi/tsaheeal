-- ════════════════════════════════════════════════════════════════════
-- 20260913 — مكتب الدعم الفني: تعيين، محادثة داخلية، حلّ وإغلاق، مرفقات
--
-- أربع ملاحظات من الفريق على شاشة الدعم جذرها واحد: جدول `support`
-- سجلٌّ مسطّح من سبعة أعمدة نصّية — لا وقتَ إرسالٍ (تاريخٌ بلا ساعة،
-- فوعد الردّ لا يُحسب)، ولا مُرسِل، ولا مسؤول، ولا سجلّ حلّ، ولا مكان
-- للمرفقات. الطلب يُرسَل ويُقرأ ولا يُدار.
--
-- ── ما فيه ──
--   (١) أعمدة المكتب: وقت الإرسال والمُرسِل والمرفقات والمسؤول والحلّ
--   (٢) سجلّ الأحداث يتّسع لطلب الدعم — المحادثة الداخلية فيه
--   (٣) upsert_support يكتب الأعمدة الجديدة ويحرس الحلّ والإغلاق
--   (٤) المرفقات: الدلو يقبل PDF، وملاحظة الخصوصية
--
-- ── خصائصه ──
-- • آمن للإعادة: `if not exists` و`create or replace` و`drop … if exists`.
--   لا drop لجدول ولا truncate ولا delete لصفّ.
-- • الواجهة تعمل قبله: upsert_support القديم يتجاهل المفاتيح التي لا
--   يعرفها، والحقول الجديدة تُقرأ فارغةً.
-- • يُبلّغ في جدول نتائج لا في raise notice.
-- ════════════════════════════════════════════════════════════════════


-- ═══ (١) أعمدة المكتب ═══════════════════════════════════════════════
/* كلّها nullable أو بافتراضٍ يصف الحال القائم: الصفّ القديم يُقرأ
   «بلا مسؤول وبلا مرفقات» لا «مكسور». */

/* وقت الإرسال بالثانية لا باليوم: وعد الردّ يُحسب بساعات العمل
   (sla.ts) ويحتاج لحظةً لا تاريخاً — «أُرسل يوم كذا» لا يقول هل أُرسل
   قبل الإغلاق بدقيقة أو بعده. */
alter table public.support add column if not exists created_at  timestamptz;
alter table public.support add column if not exists created_by  uuid references public.profiles(id) on delete set null;
/* روابط المرفقات — قصيرةٌ لا base64: الملف في الدلو والرابط في الصفّ. */
alter table public.support add column if not exists attachments text[] not null default '{}';
alter table public.support add column if not exists assigned_to uuid references public.profiles(id) on delete set null;
alter table public.support add column if not exists assigned_at timestamptz;
alter table public.support add column if not exists resolved_at timestamptz;
alter table public.support add column if not exists closed_at   timestamptz;
/* نصّ الحلّ — إلزامي عند «تم الحل» و«مغلق»: طلبٌ مُغلَق بلا كلمةٍ عمّا
   حُلّ يعود بعد شهر بنفس السؤال ولا أحد يذكر الجواب. */
alter table public.support add column if not exists resolution  text;

/* الصفوف القائمة: وقت الإرسال من تاريخها عند منتصف ليل الرياض — تقريبٌ
   معلَن خيرٌ من فراغٍ يجعل الوعد غير محسوب. الحلّ والإغلاق القائمان
   يُؤرَّخان بنفس التقريب كي لا يُعرض «تم الحل» بلا تاريخ. */
update public.support
   set created_at = (date::date)::timestamp at time zone 'Asia/Riyadh'
 where created_at is null and date ~ '^\d{4}-\d{2}-\d{2}$';
update public.support
   set resolved_at = coalesce(resolved_at, created_at)
 where status in ('resolved','closed') and resolved_at is null and created_at is not null;
update public.support
   set closed_at = coalesce(closed_at, created_at)
 where status = 'closed' and closed_at is null and created_at is not null;

/* «طلباتي المفتوحة» و«غير المعيَّن» — استعلامَا الشاشة اليوميان. */
create index if not exists support_status_assignee_idx on public.support(status, assigned_to);


-- ═══ (٢) سجلّ الأحداث يتّسع لطلب الدعم ══════════════════════════════
/* المحادثة الداخلية ليست جدولاً جديداً: document_events (ترحيل
   20260909، وسّعه 20260910) يحمل الملاحظة والفاعل والوقت — وهو ما تحتاجه
   المحادثة بالضبط. الأحداث المستعملة: note (ملاحظة) · assign (تعيين) ·
   status (انتقال) · close (إغلاق) — كلّها في قيد الأحداث القائم. */
alter table public.document_events drop constraint if exists document_events_doc_type_check;
alter table public.document_events add  constraint document_events_doc_type_check
  check (doc_type in ('invoice','ticket','booking','custom_request','support'));


-- ═══ (٣) upsert_support بالأعمدة الجديدة ═══════════════════════════
/* الحرس القائم يبقى (can_write_staff — أي موظف). ويُضاف:
   • المعيَّن يُحلّ بالبحث لا بالتحويل: users.id للحسابات القديمة نصٌّ
     (U-01) لا uuid، والتحويل المباشر يرمي خطأً لا معنى له للموظف. من
     ليس ملفاً نشطاً يُحفَظ null.
   • «تم الحل» و«مغلق» يرفضان بلا نصّ حلّ — عند الدخول إلى الحالة لا
     عند كل تعديلٍ لاحق، وإلا تعطّل تعيين طلبٍ قديم مُغلَقٍ بلا حلّ.
   • المرفقات تُكتب فقط إن أرسلتها الواجهة مصفوفةً: واجهةٌ أقدم بلا هذا
     المفتاح لا تمحو مرفقات الطلب.
   • تنبيهٌ للمعيَّن الجديد في مركز التنبيهات — كما في assign_booking. */
create or replace function public.upsert_support(doc jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare
  v_id         text := doc->>'id';
  v_status     text := doc->>'status';
  v_resolution text := nullif(trim(coalesce(doc->>'resolution','')), '');
  v_has_att    boolean := jsonb_typeof(doc->'attachments') = 'array';
  v_att        text[];
  v_assigned   uuid;
  v_exists     boolean;
  v_old_status text;
  v_old_assign uuid;
  v_actor      text;
begin
  -- الدعم: مسموح لأي موظف وسياق الخادم
  if not public.can_write_staff() then raise exception 'forbidden'; end if;
  if coalesce(v_id,'') = '' then raise exception 'id_required: معرّف الطلب مفقود'; end if;

  select id into v_assigned from profiles
   where id::text = doc->>'assignedTo' and status = 'active';

  select true, status, assigned_to into v_exists, v_old_status, v_old_assign
    from support where id = v_id;
  v_exists := coalesce(v_exists, false);

  if v_status in ('resolved','closed')
     and coalesce(v_old_status,'') not in ('resolved','closed')
     and v_resolution is null then
    raise exception 'resolution_required: الحل أو الإغلاق يحتاج نصّ الحلّ';
  end if;

  if v_has_att then
    select coalesce(array_agg(x), '{}') into v_att
      from jsonb_array_elements_text(doc->'attachments') x where x <> '';
  end if;

  insert into support(id,category,title,descr,priority,status,date,
                      created_at,created_by,attachments,
                      assigned_to,assigned_at,resolved_at,closed_at,resolution)
  values(v_id, doc->>'category', doc->>'title', doc->>'desc', doc->>'priority', v_status, doc->>'date',
    coalesce(nullif(doc->>'createdAt','')::timestamptz, now()),
    coalesce(auth.uid(), (select id from profiles where id::text = doc->>'createdBy')),
    coalesce(v_att, '{}'),
    v_assigned, case when v_assigned is null then null else now() end,
    case when v_status in ('resolved','closed') then now() end,
    case when v_status = 'closed' then now() end,
    v_resolution)
  on conflict(id) do update set
    category = excluded.category, title = excluded.title, descr = excluded.descr,
    priority = excluded.priority, status = excluded.status, date = excluded.date,
    /* الأصل لا يُعاد كتابته: وقت الإرسال ومُرسِله ثابتان مهما عُدِّل الطلب. */
    created_at  = coalesce(support.created_at, excluded.created_at),
    created_by  = coalesce(support.created_by, excluded.created_by),
    attachments = case when v_has_att then excluded.attachments else support.attachments end,
    assigned_to = excluded.assigned_to,
    assigned_at = case when excluded.assigned_to is null then null
                       when excluded.assigned_to is distinct from support.assigned_to then now()
                       else support.assigned_at end,
    resolved_at = case when excluded.status in ('resolved','closed') then coalesce(support.resolved_at, now()) else null end,
    closed_at   = case when excluded.status = 'closed' then coalesce(support.closed_at, now()) else null end,
    resolution  = coalesce(excluded.resolution, support.resolution);

  /* تنبيه المعيَّن الجديد — لا لمن أسند إلى نفسه، ولا عند إعادة حفظٍ
     بلا تغيير في المسؤول. الجدول من ترحيل 20260906؛ يُفحص وجوده كي لا
     يتعطّل حفظ الطلب على قاعدةٍ لم تنفّذه. */
  if v_assigned is not null and v_assigned <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
     and (not v_exists or v_old_assign is distinct from v_assigned)
     and to_regclass('public.notifications') is not null then
    select name into v_actor from profiles where id = auth.uid();
    insert into notifications(user_id, title, body, href)
    values (v_assigned, 'أُسند إليك طلب دعم ' || v_id,
            coalesce(doc->>'title','') || ' — ' || coalesce(v_actor,'موظف') || ' أسند إليك هذا الطلب',
            '/admin/support?open=' || v_id);
  end if;
end $$;
revoke execute on function public.upsert_support(jsonb) from public, anon;
grant  execute on function public.upsert_support(jsonb) to authenticated;


-- ═══ (٤) المرفقات ═══════════════════════════════════════════════════
/* الواجهة تقبل صورةً (jpeg/png/webp ≤ 8MB) أو PDF (≤ 8MB) وتفحص
   بصمة الملف قبل الرفع. دلو media (ترحيل 20260823) يقبل الصور والمقاطع
   وحدها، فـPDF يُرفض من الخادم حتى يُضاف نوعه هنا. تعديلٌ في خصائص
   الدلو لا في سياساته، ولا يُكرَّر إن كان مضافاً. */
update storage.buckets
   set allowed_mime_types = array_append(allowed_mime_types, 'application/pdf')
 where id = 'media'
   and allowed_mime_types is not null
   and not ('application/pdf' = any(allowed_mime_types));

/* ⚠️ ملاحظة خصوصية — للمراجعة، لا تغيير هنا:
   دلو media **عام** (public=true) لأن صور الكتالوج يراها الزائر
   المجهول. مرفقات الدعم تُحفظ تحته في المجلّد support/ بمسارٍ عشوائي
   (crypto.randomUUID) لا يُخمَّن، وسردُ الدلو مقصورٌ على الموظفين
   (media_list_staff) — فلا يُوصل إلى المرفق إلا بمن يملك رابطه.

   إخفاؤها إخفاءً تامّاً يحتاج دلواً خاصّاً (public=false) بسياسات
   قراءةٍ للموظفين وروابطٍ موقّعة (createSignedUrl) في الواجهة — وهو
   تغييرٌ في سياسات التخزين وشاشة الدعم معاً، يُختبر على حدة ولا يُدسّ
   في ترحيل أعمدة. حين يُقرَّر: أنشئ دلو support-private، وانقل مرفقات
   الطلبات، وبدّل getPublicUrl بـcreateSignedUrl في شاشة الدعم. */


-- ═══ تقرير ═════════════════════════════════════════════════════════
select 'طلبات دعم مفتوحة بلا مسؤول' as "البند", count(*)::text as "العدد"
  from public.support
 where status in ('sent','reviewing') and assigned_to is null
union all
select 'طلبات محلولة أو مغلقة بلا نصّ حلّ (قديمة — تُستكمل عند أول تعديل)', count(*)::text
  from public.support
 where status in ('resolved','closed') and coalesce(resolution,'') = ''
union all
select 'طلبات تحمل مرفقات', count(*)::text
  from public.support
 where cardinality(attachments) > 0
union all
select 'الدلو media يقبل PDF', case when exists (
         select 1 from storage.buckets where id = 'media' and 'application/pdf' = any(allowed_mime_types)
       ) then 'نعم' else 'لا' end;


-- ═══════════ سجلّ الترحيلات ═══════════
insert into public.schema_migrations(version, note) values
  ('20260913_support_desk', 'مكتب الدعم: وقت الإرسال والمُرسِل، مرفقات، تعيين، محادثة داخلية في سجلّ الأحداث، حلّ وإغلاق بنصّ إلزامي، الدلو يقبل PDF')
on conflict (version) do nothing;
