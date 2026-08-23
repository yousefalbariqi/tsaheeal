-- ════════════════════════════════════════════════════════════════════
-- 20260807 — إيقاف التحقق من المقاعد (للتجربة فقط)
--
-- ⚠️ ترحيل اختباري. لا تُشغّله على قاعدة الإنتاج.
--    نسخة من create_public_booking في 20260806 بفارق واحد: حذف
--    `if n > avail then raise insufficient_seats`. كل ما عداه كما هو —
--    إلزام الجلسة والجوال الموثّق باقٍ، وخصم booked_seats باقٍ
--    (قد يتجاوز seats في التجربة، ولا قيد يمنع ذلك).
--
-- للرجوع: أعد تشغيل supabase/migrations/20260806_customer_auth_lockdown.sql
-- ════════════════════════════════════════════════════════════════════

create or replace function public.create_public_booking(doc jsonb) returns text
language plpgsql security definer set search_path=public as $$
declare
  v   text := coalesce(nullif(doc->>'id',''), 'TRB-'||upper(substr(md5(random()::text),1,5)));
  tid text := nullif(doc->>'tripId','');
  n   int  := greatest(coalesce((doc->>'persons')::int,1),1);
  avail int;
  v_uid uuid := auth.uid();
  v_ph  text := public.auth_phone();
begin
  if tid is null   then raise exception 'trip_required';    end if;
  if v_uid is null then raise exception 'auth_required';    end if;
  if v_ph  is null then raise exception 'phone_unverified'; end if;
  perform public.customer_bootstrap();

  select (seats - booked_seats) into avail from trips where id = tid for update;
  if avail is null then raise exception 'trip_not_found'; end if;
  -- التحقق من كفاية المقاعد معطّل هنا عمداً (وضع التجربة).

  insert into bookings(id,trip_id,package_id,client_name,client_phone,customer_id,room_type,persons,total,
    status,payment_status,created_at,staff,source,sent_date)
  values(v,tid,nullif(doc->>'packageId',''),doc->>'clientName',public.local_phone(v_ph),v_uid,
    doc->>'roomType',n,(doc->>'total')::numeric,'reviewing','none',to_char(now(),'YYYY-MM-DD'),'','public',null);
  update trips set booked_seats = booked_seats + n where id = tid;
  insert into booking_pilgrims(booking_id,name,doc_type,id_number,nationality,gender,age_group,birth_date,phone,seat_no,sort)
    select v,e->>'name',nullif(e->>'docType',''),e->>'idNumber',e->>'nationality',e->>'gender',nullif(e->>'ageGroup',''),e->>'birthDate',e->>'phone',nullif(e->>'seat','')::int,(o-1)::int
    from jsonb_array_elements(coalesce(doc->'pilgrims','[]')) with ordinality t(e,o);
  insert into booking_seats(booking_id,seat_no,sort)
    select v,(e)::int,(o-1)::int from jsonb_array_elements_text(coalesce(doc->'seats','[]')) with ordinality t(e,o);
  return v;
end $$;
revoke execute on function public.create_public_booking(jsonb) from public, anon;
grant  execute on function public.create_public_booking(jsonb) to authenticated;
