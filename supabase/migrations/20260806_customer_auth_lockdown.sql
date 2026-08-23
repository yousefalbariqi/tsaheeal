-- ════════════════════════════════════════════════════════════════════
-- 20260806 — الإغلاق النهائي للدوال العامة
--
-- ⚠️ لا تُشغّل هذا الترحيل مع سابقه. شغّله بعد أن تصبح الواجهة الجديدة
--    (customerAuth + جلسة الجوال) منشورة ومستقرة — 24 ساعة على الأقل —
--    وبعد التأكد من خلوّ سجلّ Postgres من أخطاء auth_required.
--    السبب: أي مستخدم فتح الصفحة قبل النشر يحمل حزمة JS قديمة تنادي
--    الحمل القديم كمجهول؛ إغلاقه قبل انتهاء جلساتهم يقطع حجزاً جارياً.
--
-- ما يحدث للحزمة القديمة بعده: HTTP 403. صفحة التتبّع تُظهر «لا توجد
-- طلبات» بدل الانكسار (data.ts يتعامل مع الخطأ سلفاً) ولا تسرّب شيئاً.
-- ════════════════════════════════════════════════════════════════════

-- 1) إلزام الجلسة في إنشاء الحجز — لا حجز بهاتف غير موثّق
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
  if n > avail then raise exception 'insufficient_seats:%', avail; end if;

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

-- 2) إغلاق تعداد الحجوزات برقم جوال
revoke execute on function public.my_public_bookings(text) from public, anon;
grant  execute on function public.my_public_bookings(text) to authenticated;

-- 3) الدفع بلا رمز يستلزم جلسة المالك (والرابط المُرسَل يستخدم حمل الرمز)
revoke execute on function public.confirm_payment(text) from public, anon;
grant  execute on function public.confirm_payment(text) to authenticated;

-- 4) دالة ميتة — لا شيء في الواجهة يناديها
revoke execute on function public.lookup_public_booking(text, text) from public, anon;
