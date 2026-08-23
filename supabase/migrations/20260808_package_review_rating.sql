-- ════════════════════════════════════════════════════════════════════
-- 20260808 — درجة لكل رأي في الباقة
--
-- التقييم العام في صفحة الباقة (8.8 / 10) يُحسب متوسطاً من درجات الآراء
-- لا يُكتب يدوياً، فيبقى الرقم مطابقاً للآراء المعروضة تحته.
--
-- الدرجة اختيارية: الآراء المكتوبة قبل هذا الترحيل تبقى بلا درجة،
-- والواجهة تستثنيها من المتوسط ولا تعدّها في العدد.
-- ════════════════════════════════════════════════════════════════════

alter table package_reviews add column if not exists rating numeric;

-- 1 إلى 10 بمنزلة عشرية واحدة — القيد يحمي من إدخال 88 أو -3
alter table package_reviews drop constraint if exists package_reviews_rating_range;
alter table package_reviews add constraint package_reviews_rating_range
  check (rating is null or (rating >= 1 and rating <= 10));

-- إعادة تعريف upsert_package بفارق واحد: rating في إدراج الآراء
create or replace function public.upsert_package(doc jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare v text := doc->>'id'; s jsonb := doc->'settings';
begin
  if not public.can_write_admin() then raise exception 'forbidden'; end if;
  insert into packages(id,name,order_no,product_type,destination,audience,days,nights,status,market_price,
    seat_cost_override,cover_image,recurring,recur_day,start_date,transport_id,hotel_id,notes,
    set_allow_online_booking,set_manual_confirm,set_waitlist_enabled,set_require_payment_first,
    set_show_ticket_after_confirm,set_payment_deadline_hours,set_max_pilgrims)
  values(v,doc->>'name',(doc->>'order')::int,doc->>'productType',doc->>'destination',doc->>'audience',
    (doc->>'days')::int,(doc->>'nights')::int,doc->>'status',(doc->>'marketPrice')::numeric,
    (doc->>'seatCostOverride')::numeric,doc->>'coverImage',(doc->>'recurring')::boolean,doc->>'recurDay',doc->>'startDate',
    nullif(doc->>'transportId',''),nullif(doc->>'hotelId',''),doc->>'notes',
    (s->>'allowOnlineBooking')::boolean,(s->>'manualConfirm')::boolean,(s->>'waitlistEnabled')::boolean,
    (s->>'requirePaymentFirst')::boolean,(s->>'showTicketAfterConfirm')::boolean,
    (s->>'paymentDeadlineHours')::int,(s->>'maxPilgrims')::int)
  on conflict(id) do update set name=excluded.name,order_no=excluded.order_no,product_type=excluded.product_type,
    destination=excluded.destination,audience=excluded.audience,days=excluded.days,nights=excluded.nights,
    status=excluded.status,market_price=excluded.market_price,seat_cost_override=excluded.seat_cost_override,
    cover_image=excluded.cover_image,recurring=excluded.recurring,recur_day=excluded.recur_day,start_date=excluded.start_date,
    transport_id=excluded.transport_id,hotel_id=excluded.hotel_id,notes=excluded.notes,
    set_allow_online_booking=excluded.set_allow_online_booking,set_manual_confirm=excluded.set_manual_confirm,
    set_waitlist_enabled=excluded.set_waitlist_enabled,set_require_payment_first=excluded.set_require_payment_first,
    set_show_ticket_after_confirm=excluded.set_show_ticket_after_confirm,
    set_payment_deadline_hours=excluded.set_payment_deadline_hours,set_max_pilgrims=excluded.set_max_pilgrims;
  delete from package_features where package_id=v;
  insert into package_features(package_id,item_id,icon,text,sort)
    select v,e->>'id',e->>'icon',e->>'text',(o-1)::int from jsonb_array_elements(coalesce(doc->'features','[]')) with ordinality t(e,o);
  delete from package_program_stages where package_id=v;
  insert into package_program_stages(package_id,item_id,stage_order,icon,day,time,title,descr,archived,sort)
    select v,e->>'id',(e->>'order')::int,e->>'icon',e->>'day',e->>'time',e->>'title',e->>'desc',(e->>'archived')::boolean,(o-1)::int
    from jsonb_array_elements(coalesce(doc->'program','[]')) with ordinality t(e,o);
  delete from package_room_prices where package_id=v;
  insert into package_room_prices(package_id,item_id,type,persons,per_night,seat_cost,sort)
    select v,e->>'id',e->>'type',(e->>'persons')::int,(e->>'perNight')::numeric,(e->>'seatCost')::numeric,(o-1)::int
    from jsonb_array_elements(coalesce(doc->'roomPrices','[]')) with ordinality t(e,o);
  delete from package_reviews where package_id=v;
  insert into package_reviews(package_id,item_id,name,text,consent,image,rating,sort)
    select v,e->>'id',e->>'name',e->>'text',(e->>'consent')::boolean,e->>'image',
           nullif(e->>'rating','')::numeric,(o-1)::int
    from jsonb_array_elements(coalesce(doc->'reviews','[]')) with ordinality t(e,o);
  delete from package_policies where package_id=v;
  insert into package_policies(package_id,value,sort)
    select v,e,(o-1)::int from jsonb_array_elements_text(coalesce(doc->'policies','[]')) with ordinality t(e,o);
  delete from package_gallery where package_id=v;
  insert into package_gallery(package_id,value,sort)
    select v,e,(o-1)::int from jsonb_array_elements_text(coalesce(doc->'gallery','[]')) with ordinality t(e,o);
end $$;
