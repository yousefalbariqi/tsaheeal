-- ════════════════════════════════════════════════════════════════════
-- 20261003 — المواصلات سعرٌ واحد للباقة، وإلغاء «مواصلات فقط»
--
-- ── لماذا سقط عمود تكلفة المقعد من جدول الغرف ──
--
-- كان لكل صفّ سكنٍ تكلفةُ مقعدٍ خاصّة به: مشتركة وخاصة وعائلية، ثلاثة
-- حقولٍ وأربعة. والجواب في كلّ مرّة الرقم نفسه، لأن المقعد في الحافلة
-- واحدٌ مهما كان مبيت صاحبه. حقولٌ تُملأ بقيمةٍ واحدة لا تُنتج دقّة، بل
-- تفتح باب التفاوت بالسهو: يُعدَّل صفٌّ وتُنسى البقية، فيدفع راكبان في
-- الحافلة نفسها سعرين لأن أحدهما نام في غرفةٍ أخرى.
--
-- فصار سعر النقل حقلاً واحداً للباقة — `packages.seat_cost_override` —
-- يشمل الذهاب والعودة، قيمته المبدئية من المركبة المرتبطة وقابلٌ
-- للتعديل. وهو نهائيٌّ شاملُ الضريبة كبقية أسعار الباقة.
--
-- ── ولماذا سقط «مواصلات فقط» ──
--
-- خيارٌ أُضيف في 20260919 ولم يُبنَ له مسارُ شراءٍ في تطبيق المستفيد:
-- العَلَم يُحفظ والدالّة تتفرّع، ولا شاشةَ تُرسل `bookingMode`. حالةٌ
-- ثانيةٌ تُحمَل في كل دالّةٍ وكل تفرّع، ولا تُباع. تُزال بالكامل.
--
-- ── شكل الإزالة: إفراغُ غلافٍ لا حذفُه ──
--
-- الدوال هنا مبنيّة بالأغلفة: كل ترحيلٍ يعيد تسمية السابقة ويلفّها.
-- حذفُ غلافٍ من وسط السلسلة يقطعها، فالغلافان المعنيّان يُستبدَلان
-- بتمريرٍ مباشر إلى ما تحتهما — تبقى السلسلة سليمة ويذهب السلوك.
-- ════════════════════════════════════════════════════════════════════

-- ── ١) «مواصلات فقط»: الغلافان يصيران تمريراً ───────────────────────

-- كان يكتب transport_only_enabled/price بعد الحفظ الأساسي.
create or replace function public.upsert_package_transport_base(doc jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.upsert_package_base(doc);
end $$;

-- كان يتفرّع على bookingMode='transport_only' فيبني صفّ غرفةٍ وهمياً
-- ثم يحذفه. لم يعد أحدٌ يرسل المفتاح، ولو أرسله أحدٌ فالحجز عاديّ.
create or replace function public.create_public_booking_mode_base(doc jsonb) returns text
language plpgsql security definer set search_path = public as $$
begin
  return public.create_public_booking_base(doc - 'bookingMode');
end $$;

-- العمودان يُسقَطان بعد أن خلت الدوال منهما، فلا يقرؤهما أحد.
alter table public.packages drop constraint if exists packages_transport_only_price_check;
alter table public.packages
  drop column if exists transport_only_enabled,
  drop column if exists transport_only_price;

-- ── ٢) تكلفة المقعد لكل غرفة: يُفرَّغ العمود ويُهمَل في الحساب ──────

/* العمود لا يُسقط: لوحة الإدارة تكتب عبر upsert_package_base التي
   تدرجه صراحةً، وحذفه يُسقط كل حفظ باقةٍ حتى تُعاد كتابة تلك الدالّة
   الطويلة. الإفراغ يكفي — الحساب أدناه لم يعد يقرؤه أصلاً. */
update public.package_room_prices set seat_cost = null where seat_cost is not null;

comment on column public.package_room_prices.seat_cost is
  'مهجور منذ 20261003 — سعر النقل حقلٌ واحد في packages.seat_cost_override.';

comment on column public.packages.seat_cost_override is
  'سعر المواصلات للفرد ذهاباً وعودةً، شاملَ الضريبة. مبدئيّاً من transports.seat_cost.';

-- ── ٣) الحساب المُلزِم: مقعدٌ واحدٌ للباقة، وغرفٌ ليلية ─────────────
--
--   المواصلات = سعر النقل للباقة × عدد الأشخاص
--   السكن      = سعر الليلة × عدد الغرف × عدد الليالي
--
-- سعر النقل يُقرأ مرّةً قبل الحلقة لا داخلها: لم يعد يعتمد على فئة
-- الغرفة، فقراءته لكل صفٍّ كانت تُوهم أنه قد يختلف بينها.

create or replace function public.compute_booking_total(p_trip_id text, p_persons int, p_rooms jsonb)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  v_pkg        text;
  v_price      numeric;
  v_market     numeric;
  v_transport  text;
  v_override   numeric;
  v_nights     int;
  v_seat_price numeric;
  v_room_price numeric;
  v_sum        numeric := 0;
  v_rows       int := 0;
  r            record;
  n            int := greatest(coalesce(p_persons, 1), 1);
begin
  select t.package_id, t.price, p.market_price,
         coalesce(nullif(t.transport_id, ''), nullif(p.transport_id, '')),
         p.seat_cost_override, greatest(coalesce(p.nights, 1), 1)
    into v_pkg, v_price, v_market, v_transport, v_override, v_nights
    from public.trips t
    join public.packages p on p.id = t.package_id
   where t.id = p_trip_id;

  -- سعرٌ واحد للباقة: ما اعتمدته الإدارة، وإلّا تكلفة مقعد المركبة.
  v_seat_price := coalesce(
    v_override,
    (select seat_cost from public.transports where id = v_transport),
    0
  );

  if p_rooms is not null and jsonb_typeof(p_rooms) = 'array' and jsonb_array_length(p_rooms) > 0 then
    for r in
      select nullif(e->>'tierId', '') as tier_id,
             (e->>'perNight')::numeric as room_price
        from jsonb_array_elements(p_rooms) e
    loop
      -- السعر المحفوظ في صف الباقة هو المعتمد؛ قيمة الطلب مجرد توافقٍ
      -- للحجوزات القديمة التي لم يكن لها tier_id.
      select rp.per_night
        into v_room_price
        from public.package_room_prices rp
       where rp.package_id = v_pkg and rp.item_id = r.tier_id
       limit 1;
      -- كل صف يمثل غرفة واحدة. يكرّر العميل الصف للغرف الإضافية، فلا
      -- نربط العدد بسعة الغرفة أو عدد المسافرين.
      v_sum := v_sum + coalesce(v_room_price, r.room_price, 0);
      v_rows := v_rows + 1;
    end loop;
  end if;

  if v_rows > 0 then
    return round(v_sum * v_nights + n * v_seat_price, 2);
  end if;

  -- رحلات وحجوزات قديمة بلا غرفة مختارة تبقى على تسعيرها الاحتياطي.
  return round(coalesce(nullif(v_price, 0), v_market, 0) * n, 2);
end $$;

revoke all on function public.compute_booking_total(text, int, jsonb) from public;
grant execute on function public.compute_booking_total(text, int, jsonb) to authenticated, anon;
