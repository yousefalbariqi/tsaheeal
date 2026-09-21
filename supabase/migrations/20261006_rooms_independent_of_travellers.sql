-- ════════════════════════════════════════════════════════════════════
-- 20261006 — عدد الغرف قرار مستقل عن عدد المعتمرين
--
-- لا نوزّع المعتمرين على الغرف ولا نفرض أن سعة الغرف تساوي عددهم.
-- العميل يختار غرفة أو أكثر ويحاسب على ما اختاره، بينما المقاعد وحدها
-- هي التي تُقاس بعدد الأشخاص.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.create_public_booking_base(doc jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v        text := coalesce(nullif(doc->>'id', ''), 'TRB-' || upper(substr(md5(random()::text), 1, 5)));
  tid      text := nullif(doc->>'tripId', '');
  n        int := greatest(coalesce((doc->>'persons')::int, 1), 1);
  avail    int;
  v_uid    uuid := auth.uid();
  v_ph     text := public.auth_phone();
  v_total  numeric;
  v_client numeric := nullif(doc->>'total', '')::numeric;
begin
  if tid is null then raise exception 'trip_required'; end if;
  if v_uid is null then raise exception 'auth_required'; end if;
  if v_ph is null then raise exception 'phone_unverified'; end if;
  perform public.customer_bootstrap();

  -- لا فحص لسعة الغرف هنا: الغرف لا تمثل مقاعد ولا تحدد عدد المعتمرين.
  -- فحص السعة التالي يخص مقاعد الرحلة فقط.
  select (seats - booked_seats) into avail from public.trips where id = tid for update;
  if avail is null then raise exception 'trip_not_found'; end if;
  if n > avail then raise exception 'insufficient_seats:%', avail; end if;

  v_total := public.compute_booking_total(tid, n, doc->'rooms');
  if v_total <= 0 then v_total := coalesce(v_client, 0); end if;

  insert into public.bookings(id,trip_id,package_id,client_name,client_phone,customer_id,room_type,persons,total,
    status,payment_status,created_at,submitted_at,staff,source,sent_date)
  values(v,tid,nullif(doc->>'packageId',''),doc->>'clientName',public.local_phone(v_ph),v_uid,
    doc->>'roomType',n,v_total,'reviewing','none',to_char(now(),'YYYY-MM-DD'),now(),'','public',null);

  insert into public.booking_pilgrims(booking_id,name,doc_type,id_number,nationality,gender,age_group,birth_date,phone,seat_no,sort)
    select v,e->>'name',nullif(e->>'docType',''),e->>'idNumber',e->>'nationality',e->>'gender',nullif(e->>'ageGroup',''),e->>'birthDate',e->>'phone',nullif(e->>'seat','')::int,(o-1)::int
      from jsonb_array_elements(coalesce(doc->'pilgrims','[]')) with ordinality t(e,o);
  insert into public.booking_seats(booking_id,seat_no,sort)
    select v,(e)::int,(o-1)::int from jsonb_array_elements_text(coalesce(doc->'seats','[]')) with ordinality t(e,o);
  insert into public.booking_rooms(booking_id,tier_id,type,persons,per_night,sort)
    select v,nullif(e->>'tierId',''),e->>'type',(e->>'persons')::int,(e->>'perNight')::numeric,(o-1)::int
      from jsonb_array_elements(coalesce(doc->'rooms','[]')) with ordinality t(e,o);

  if v_client is not null and abs(v_client - v_total) >= 0.5 then
    insert into public.document_events(doc_type,doc_id,event,actor,actor_name,note)
    values ('booking', v, 'price_adjusted', null, 'النظام',
            format('المتصفح أرسل %s والقاعدة حسبت %s — اعتُمد حساب القاعدة', v_client, v_total));
  end if;
  return v;
end $$;

revoke all on function public.create_public_booking_base(jsonb) from public, anon, authenticated;

comment on function public.create_public_booking_base(jsonb) is
  'إنشاء الحجز الأساسي: عدد الأشخاص يقيّد مقاعد الرحلة فقط، وعدد الغرف مستقل.';
