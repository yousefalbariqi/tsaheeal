-- ════════════════════════════════════════════════════════════════════
-- 20260914 — ملف المستفيد: هويةٌ كاملة، إنشاءٌ تلقائي عند التأكيد، كشف التكرار
--
-- تسع ملاحظاتٍ من الفريق جذرها واحد: «٨ طلبات وصفر مستفيدين». الملف
-- كان يُنشأ يدوياً وحده، وبطاقة المعتمر في الحجز أغنى منه (نوع الوثيقة
-- منذ ترحيل ٠٨٠١) بينما Beneficiary ما زال idNumber عارياً يفترض أن كل
-- هوية تبدأ بـ١٠.
--
-- ── ما فيه ──
--   (١) أعمدة الهوية: نوع الوثيقة · انتهاؤها · صورتها · جوال مسؤول الحجز
--       · المصدر (يدوي/تلقائي) · الحجز الذي أُنشئ منه
--   (٢) الاحتياجات الصحية وحركة المعتمر في جدولٍ خاص يقرؤه المدير وحده
--   (٣) الإنشاء التلقائي: تأكيد الحجز يُنشئ ملفاً لكل معتمرٍ لا ملفَّ له
--       ويربط الحجز بالقائم — بلا زرّ ولا تذكّر
--   (٤) كشف التكرار بالجوال أو رقم الوثيقة، ودمجٌ صريح للمدير
--   (٥) upsert_beneficiary بالأعمدة الجديدة
--
-- ── خصائصه ──
-- • آمن للإعادة: if not exists / create or replace / drop trigger if exists.
-- • التعبئة الأثرية تربط ولا تكرّر: ملفٌ قائم بنفس الوثيقة أو الجوال
--   يُربط به الحجز ولا يُنشأ ثانٍ.
-- • يُبلّغ في جدول نتائج لا في raise notice.
--
-- ⚠️ صورة الوثيقة: العمود موجود، والرفع في الواجهة معطَّل عمداً حتى
--    يُنشأ دلوٌ خاص بروابطَ موقّتة (قرار ٢٠٢٦-٠٩-٠٦ رقم ٤). صورة جوازٍ في
--    الدلو العام أسوأ من غيابها.
-- ════════════════════════════════════════════════════════════════════


-- ═══ (١) أعمدة الهوية ══════════════════════════════════════════════
alter table public.beneficiaries add column if not exists doc_type      text;   -- national_id | iqama | passport
alter table public.beneficiaries add column if not exists doc_expiry    date;
alter table public.beneficiaries add column if not exists doc_image_url text;
/* «ليس كل معتمر لديه جوال مستقل؛ فرّق بين جوال المستفيد وجوال مسؤول
   الحجز»: phone جوال المعتمر نفسه، وcontact_phone جوال من يُتواصل معه. */
alter table public.beneficiaries add column if not exists contact_phone text;
alter table public.beneficiaries add column if not exists source        text;   -- manual | auto
alter table public.beneficiaries add column if not exists created_from  text;   -- رقم الحجز

do $$ begin
  alter table public.beneficiaries drop constraint if exists beneficiaries_doc_type_chk;
  alter table public.beneficiaries add constraint beneficiaries_doc_type_chk
    check (doc_type is null or doc_type in ('national_id','iqama','passport')) not valid;
end $$;

/* مفتاح الجوال للمطابقة: آخر تسع خانات — 0501234567 و+966501234567
   و966501234567 شخصٌ واحد. */
create or replace function public.phone_key(p text) returns text
language sql immutable as $$
  select case when length(regexp_replace(coalesce(p,''), '\D', '', 'g')) >= 9
              then right(regexp_replace(coalesce(p,''), '\D', '', 'g'), 9)
              else null end;
$$;

create index if not exists beneficiaries_phone_key_idx on public.beneficiaries(public.phone_key(phone)) where archived_at is null;
create index if not exists beneficiaries_doc_idx on public.beneficiaries(id_number) where archived_at is null and coalesce(id_number,'') <> '';


-- ═══ (٢) الاحتياجات الخاصة — للمدير وحده ═══════════════════════════
/* «أضف احتياجات الحركة والحالة الصحية ضمن صلاحيات خصوصية محددة».
   جدولٌ منفصل لا عمودان: RLS يحكم الصفّ لا العمود، وبيانٌ صحيٌّ في صفّ
   المستفيد يقرؤه كل موظف يفتح الشاشة. */
create table if not exists public.beneficiary_private (
  beneficiary_id text primary key references public.beneficiaries(id) on delete cascade,
  mobility_needs text,
  health_notes   text,
  updated_by     uuid references public.profiles(id) on delete set null,
  updated_at     timestamptz not null default now()
);
alter table public.beneficiary_private enable row level security;
drop policy if exists "private read admin"  on public.beneficiary_private;
drop policy if exists "private write admin" on public.beneficiary_private;
create policy "private read admin"  on public.beneficiary_private for select to authenticated using (public.is_admin());
create policy "private write admin" on public.beneficiary_private for all    to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.beneficiary_private from anon;

create or replace function public.set_beneficiary_private(p_id text, p_mobility text, p_health text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_write_admin() then raise exception 'forbidden: admin only'; end if;
  if not exists (select 1 from beneficiaries where id = p_id) then raise exception 'not_found: المستفيد غير موجود'; end if;
  insert into beneficiary_private(beneficiary_id, mobility_needs, health_notes, updated_by, updated_at)
  values (p_id, nullif(trim(p_mobility),''), nullif(trim(p_health),''), auth.uid(), now())
  on conflict (beneficiary_id) do update
     set mobility_needs = excluded.mobility_needs, health_notes = excluded.health_notes,
         updated_by = excluded.updated_by, updated_at = now();
end $$;
revoke all on function public.set_beneficiary_private(text,text,text) from public, anon;
grant execute on function public.set_beneficiary_private(text,text,text) to authenticated;


-- ═══ (٣) الإنشاء التلقائي عند التأكيد ═══════════════════════════════
/* «اجعل إنشاء المستفيد جزءاً إلزامياً من تأكيد الحجز». لكل معتمرٍ في
   الحجز: يُطابَق بملفٍّ قائم برقم وثيقته أولاً ثم بجواله، فيُربط؛ وإلا
   يُنشأ ملفٌ من بطاقته. المعتمر الأول بلا جوالٍ يأخذ جوال صاحب الحجز؛
   وغيره يبقى جواله فارغاً وجوالُ صاحب الحجز في contact_phone — فلا
   يُخترع لطفلٍ جوالٌ ليس له. */
create or replace function public.ensure_booking_beneficiaries(p_booking_id text) returns int
language plpgsql security definer set search_path = public as $$
declare
  b        record;
  bp       record;
  v_ben    text;
  v_doc    text;
  v_phone  text;
  v_key    text;
  v_made   int := 0;
begin
  select * into b from bookings where id = p_booking_id;
  if not found then return 0; end if;

  for bp in select * from booking_pilgrims where booking_id = b.id order by sort nulls last, id loop
    v_doc   := nullif(trim(coalesce(bp.id_number,'')),'');
    v_phone := nullif(trim(coalesce(bp.phone,'')),'');
    if v_phone is null and coalesce(bp.sort,0) = 0 then v_phone := nullif(trim(coalesce(b.client_phone,'')),''); end if;
    v_key   := public.phone_key(v_phone);
    v_ben   := null;

    if v_doc is not null then
      select id into v_ben from beneficiaries
       where archived_at is null and trim(coalesce(id_number,'')) = v_doc
       order by created_from nulls last, id limit 1;
    end if;
    if v_ben is null and v_key is not null then
      select id into v_ben from beneficiaries
       where archived_at is null and public.phone_key(phone) = v_key
       order by id limit 1;
    end if;

    if v_ben is null then
      if coalesce(trim(bp.name),'') = '' and v_doc is null then continue; end if;
      v_ben := 'BEN-' || upper(substr(md5(b.id || ':' || coalesce(bp.sort,0)::text || ':' || coalesce(v_doc,'')), 1, 8));
      insert into beneficiaries(id, name, phone, contact_phone, id_number, doc_type, nationality, gender, birth_date,
                                rating, notes, suspended, source, created_from)
      values (v_ben, coalesce(nullif(trim(bp.name),''), b.client_name, '—'),
              coalesce(v_phone, ''),
              case when public.phone_key(b.client_phone) is distinct from v_key then b.client_phone else null end,
              coalesce(v_doc,''), nullif(bp.doc_type,''), coalesce(bp.nationality,''), coalesce(bp.gender,'male'),
              coalesce(bp.birth_date,''), 0, '', false, 'auto', b.id)
      on conflict (id) do nothing;
      v_made := v_made + 1;
    end if;

    if not exists (select 1 from beneficiary_bookings where beneficiary_id = v_ben and value = b.id) then
      insert into beneficiary_bookings(beneficiary_id, value, sort)
      values (v_ben, b.id, (select coalesce(max(sort),-1)+1 from beneficiary_bookings where beneficiary_id = v_ben));
    end if;
  end loop;
  return v_made;
end $$;
revoke all on function public.ensure_booking_beneficiaries(text) from public, anon;
grant execute on function public.ensure_booking_beneficiaries(text) to authenticated;

/* حارسٌ مؤجَّل كحارس المستندات: يرى قائمة المعتمرين النهائية لا القديمة. */
create or replace function public.booking_confirm_beneficiaries() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.status is not distinct from old.status then return null; end if;
  end if;
  if coalesce(new.status,'') <> 'confirmed' then return null; end if;
  perform public.ensure_booking_beneficiaries(new.id);
  return null;
end $$;
drop trigger if exists trg_booking_confirm_beneficiaries on public.bookings;
create constraint trigger trg_booking_confirm_beneficiaries
  after insert or update on public.bookings
  deferrable initially deferred
  for each row execute function public.booking_confirm_beneficiaries();

-- تعبئة أثرية: الحجوزات المؤكَّدة القائمة التي لا ملفَّ لمعتمريها.
do $$
declare r record;
begin
  for r in select id from bookings where coalesce(status,'') = 'confirmed' and archived_at is null loop
    perform public.ensure_booking_beneficiaries(r.id);
  end loop;
end $$;


-- ═══ (٤) كشف التكرار والدمج ═════════════════════════════════════════
/* «اكشف التكرار بالجوال + الهوية/الجواز، واعرض اقتراح دمج مع مقارنة
   الحقول». الكشف قراءة؛ والدمج قرارُ مدير: يُبقي ملفاً، ينقل حجوزات
   الآخر إليه، يُكمل حقوله الفارغة منه، ويؤرشف الآخر بسببٍ يسمّي الباقي. */
create or replace function public.beneficiary_duplicates()
returns table(a_id text, b_id text, reason text)
language sql security definer stable set search_path = public as $$
  select a.id, b.id, 'phone'::text
    from beneficiaries a join beneficiaries b
      on a.id < b.id and public.phone_key(a.phone) = public.phone_key(b.phone)
   where public.is_staff() and a.archived_at is null and b.archived_at is null
     and public.phone_key(a.phone) is not null
  union
  select a.id, b.id, 'doc'::text
    from beneficiaries a join beneficiaries b
      on a.id < b.id and trim(a.id_number) = trim(b.id_number)
   where public.is_staff() and a.archived_at is null and b.archived_at is null
     and coalesce(trim(a.id_number),'') <> ''
$$;
revoke all on function public.beneficiary_duplicates() from public, anon;
grant execute on function public.beneficiary_duplicates() to authenticated;

create or replace function public.merge_beneficiaries(p_keep text, p_drop text)
returns void language plpgsql security definer set search_path = public as $$
declare k record; d record;
begin
  if not public.can_write_admin() then raise exception 'forbidden: admin only'; end if;
  if p_keep = p_drop then raise exception 'same_record: لا يُدمج الملف بنفسه'; end if;
  select * into k from beneficiaries where id = p_keep and archived_at is null;
  if not found then raise exception 'not_found: الملف المُبقى غير موجود'; end if;
  select * into d from beneficiaries where id = p_drop and archived_at is null;
  if not found then raise exception 'not_found: الملف المدموج غير موجود'; end if;

  -- الحجوزات تنتقل بلا تكرار
  insert into beneficiary_bookings(beneficiary_id, value, sort)
  select p_keep, bb.value, (select coalesce(max(sort),-1) from beneficiary_bookings where beneficiary_id = p_keep) + row_number() over (order by bb.sort, bb.id)
    from beneficiary_bookings bb
   where bb.beneficiary_id = p_drop
     and not exists (select 1 from beneficiary_bookings x where x.beneficiary_id = p_keep and x.value = bb.value);
  delete from beneficiary_bookings where beneficiary_id = p_drop;

  -- الحقول الفارغة في المُبقى تُكمَل من المدموج — لا يُدهس شيءٌ مكتوب
  update beneficiaries set
    phone         = coalesce(nullif(phone,''), d.phone),
    contact_phone = coalesce(contact_phone, d.contact_phone),
    id_number     = coalesce(nullif(id_number,''), d.id_number),
    doc_type      = coalesce(doc_type, d.doc_type),
    doc_expiry    = coalesce(doc_expiry, d.doc_expiry),
    nationality   = coalesce(nullif(nationality,''), d.nationality),
    birth_date    = coalesce(nullif(birth_date,''), d.birth_date),
    notes         = case when coalesce(d.notes,'') = '' then notes
                         when coalesce(notes,'') = '' then d.notes
                         else notes || E'\n' || d.notes end,
    rating        = greatest(coalesce(rating,0), coalesce(d.rating,0))
  where id = p_keep;

  -- الاحتياجات الخاصة تنتقل إن لم يكن للمُبقى سجلّ
  insert into beneficiary_private(beneficiary_id, mobility_needs, health_notes, updated_by)
  select p_keep, mobility_needs, health_notes, auth.uid() from beneficiary_private where beneficiary_id = p_drop
  on conflict (beneficiary_id) do nothing;

  update beneficiaries
     set archived_at = now(), archived_by = auth.uid(),
         archive_reason = 'دُمج في الملف ' || p_keep
   where id = p_drop;
end $$;
revoke all on function public.merge_beneficiaries(text,text) from public, anon;
grant execute on function public.merge_beneficiaries(text,text) to authenticated;


-- ═══ (٥) upsert_beneficiary بالأعمدة الجديدة ════════════════════════
/* منقولٌ من schema.sql بالحقول الستّة الجديدة. source وcreated_from لا
   تُكتب من الواجهة: المصدر يقرّره من أنشأ الصفّ لا من عدّله. */
create or replace function public.upsert_beneficiary(doc jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare v text := doc->>'id';
begin
  if not public.can_write_admin() then raise exception 'forbidden'; end if;
  insert into beneficiaries(id,name,phone,id_number,nationality,gender,birth_date,rating,notes,suspended,
                            doc_type,doc_expiry,doc_image_url,contact_phone,source)
  values(v,doc->>'name',doc->>'phone',doc->>'idNumber',doc->>'nationality',doc->>'gender',doc->>'birthDate',
    (doc->>'rating')::numeric,doc->>'notes',(doc->>'suspended')::boolean,
    nullif(doc->>'docType',''),nullif(doc->>'docExpiry','')::date,nullif(doc->>'docImage',''),nullif(doc->>'contactPhone',''),
    'manual')
  on conflict(id) do update set name=excluded.name,phone=excluded.phone,id_number=excluded.id_number,
    nationality=excluded.nationality,gender=excluded.gender,birth_date=excluded.birth_date,rating=excluded.rating,
    notes=excluded.notes,suspended=excluded.suspended,
    doc_type=excluded.doc_type,doc_expiry=excluded.doc_expiry,doc_image_url=excluded.doc_image_url,contact_phone=excluded.contact_phone;
  delete from beneficiary_bookings where beneficiary_id=v;
  insert into beneficiary_bookings(beneficiary_id,value,sort)
    select v,e,(o-1)::int from jsonb_array_elements_text(coalesce(doc->'bookingIds','[]')) with ordinality t(e,o);
end $$;
revoke execute on function public.upsert_beneficiary(jsonb) from public, anon;
grant  execute on function public.upsert_beneficiary(jsonb) to authenticated;

/* بحث المستفيدين (20260907) يقرأ الأعمدة القديمة وحدها — لا تغيير يلزمه. */


-- ═══ تقرير ═════════════════════════════════════════════════════════
select 'ملفات أُنشئت تلقائياً من حجوزات مؤكَّدة' as "البند", count(*)::text as "العدد"
  from beneficiaries where source = 'auto'
union all
select 'حجوزات مؤكَّدة ما زالت بلا ملف مستفيد', count(*)::text
  from bookings b
 where b.status = 'confirmed' and b.archived_at is null
   and not exists (select 1 from beneficiary_bookings bb where bb.value = b.id)
union all
select 'أزواج تكرار محتمل (جوال أو وثيقة)', count(*)::text from public.beneficiary_duplicates()
union all
select 'ملفات بلا نوع وثيقة', count(*)::text from beneficiaries where archived_at is null and doc_type is null;


-- ═══════════ سجلّ الترحيلات ═══════════
insert into public.schema_migrations(version, note) values
  ('20260914_beneficiary_identity', 'ملف المستفيد: نوع الوثيقة وانتهاؤها، جوال مسؤول الحجز، احتياجات خاصة للمدير، إنشاء تلقائي عند التأكيد، كشف التكرار والدمج')
on conflict (version) do nothing;
