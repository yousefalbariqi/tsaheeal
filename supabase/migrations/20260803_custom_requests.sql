-- ════════════════════════════════════════════════════════════
-- تساهيل العمرة — Migration: الباقة المخصّصة (طلب تصميم رحلة)
-- ليست حجزاً: لا مقاعد ولا غرف — يجمع رغبة العميل ويجهّز الفريق العرض يدوياً.
-- الصقه في: Supa.  base → SQL Editor → Run.
-- ════════════════════════════════════════════════════════════

create table if not exists custom_requests (
  id           text primary key,
  depart_date  text,
  return_date  text,
  persons      int  default 1,
  destination  text,
  room_type    text,
  hotel_level  text,
  trip_notes   text,
  name         text,
  phone        text,
  city         text,
  notes        text,
  status       text default 'new',   -- new | contacted | quoted | converted | closed
  created_at   text,
  staff        text
);
create index if not exists custom_requests_phone_idx on custom_requests(phone);

alter table custom_requests enable row level security;

-- الموظفون (المسجَّلون) يقرؤون ويعدّلون؛ العميل المجهول لا يقرأ شيئاً.
drop policy if exists "staff read"  on custom_requests;
drop policy if exists "staff write" on custom_requests;
create policy "staff read"  on custom_requests for select to authenticated using (true);
create policy "staff write" on custom_requests for all    to authenticated using (true) with check (true);

-- ═══════════════ إنشاء الطلب من صفحة المستفيد (anon) ═══════════════
create or replace function public.create_custom_request(doc jsonb) returns text
language plpgsql security definer set search_path=public as $$
declare v text := 'CST-'||upper(substr(md5(random()::text),1,5));
begin
  if coalesce(doc->>'phone','') = '' or coalesce(doc->>'name','') = '' then
    raise exception 'name_and_phone_required';
  end if;
  insert into custom_requests(id,depart_date,return_date,persons,destination,room_type,hotel_level,
                              trip_notes,name,phone,city,notes,status,created_at)
  values(v,doc->>'departDate',doc->>'returnDate',greatest(coalesce((doc->>'persons')::int,1),1),
         doc->>'destination',doc->>'roomType',doc->>'hotelLevel',doc->>'tripNotes',
         doc->>'name',doc->>'phone',doc->>'city',doc->>'notes','new',
         to_char(now(),'YYYY-MM-DD HH24:MI'));
  return v;
end $$;
grant execute on function public.create_custom_request(jsonb) to anon, authenticated;

-- ═══════════════ تعديل الطلب من لوحة الموظف ═══════════════
create or replace function public.upsert_custom_request(doc jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare v text := doc->>'id';
begin
  insert into custom_requests(id,depart_date,return_date,persons,destination,room_type,hotel_level,
                              trip_notes,name,phone,city,notes,status,created_at,staff)
  values(v,doc->>'departDate',doc->>'returnDate',coalesce((doc->>'persons')::int,1),
         doc->>'destination',doc->>'roomType',doc->>'hotelLevel',doc->>'tripNotes',
         doc->>'name',doc->>'phone',doc->>'city',doc->>'notes',
         coalesce(doc->>'status','new'),doc->>'createdAt',doc->>'staff')
  on conflict(id) do update set
    depart_date=excluded.depart_date, return_date=excluded.return_date, persons=excluded.persons,
    destination=excluded.destination, room_type=excluded.room_type, hotel_level=excluded.hotel_level,
    trip_notes=excluded.trip_notes, name=excluded.name, phone=excluded.phone, city=excluded.city,
    notes=excluded.notes, status=excluded.status, staff=excluded.staff;
end $$;

-- تم.
