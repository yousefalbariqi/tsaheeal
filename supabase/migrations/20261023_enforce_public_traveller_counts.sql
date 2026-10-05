-- ════════════════════════════════════════════════════════════════════
-- 20261023 — تثبيت توزيع الرجال/النساء للحجز العام
--
-- لا نترك الكروكي يخمّن جنس المرافق من صاحب الطلب. العدادات التي اختارها
-- العميل جزء من عقد إنشاء الحجز: مجموعها يجب أن يساوي الأشخاص، ثم تمرّ
-- إلى كل الأغلفة القديمة (السعر/الخصوصية/اللقطة) بقيمة مكتملة للأطفال.
-- ════════════════════════════════════════════════════════════════════

alter function public.create_public_booking(jsonb)
  rename to create_public_booking_public_counts_base;

create function public.create_public_booking(doc jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_doc jsonb := coalesce(doc, '{}'::jsonb);
  v_people int := greatest(coalesce((v_doc->>'persons')::int, 1), 1);
  v_counts jsonb := v_doc->'travellerCounts';
  v_men int;
  v_women int;
  v_booking text;
begin
  if jsonb_typeof(v_counts) <> 'object'
     or coalesce(v_counts->>'men', '') !~ '^\d+$'
     or coalesce(v_counts->>'women', '') !~ '^\d+$' then
    raise exception 'traveller_counts_required: حدد عدد المعتمرين والمعتمرات قبل إرسال الطلب';
  end if;

  v_men := (v_counts->>'men')::int;
  v_women := (v_counts->>'women')::int;
  if v_men < 0 or v_women < 0 or v_men + v_women <> v_people then
    raise exception 'traveller_counts_mismatch: يجب أن يساوي توزيع المعتمرين عدد الأشخاص';
  end if;

  v_doc := jsonb_set(v_doc, '{travellerCounts}',
    jsonb_build_object('men', v_men, 'women', v_women, 'children', 0), true);
  v_booking := public.create_public_booking_public_counts_base(v_doc);

  -- طبقة أخيرة صريحة: حتى لو تغير غلاف لقطة قديم لاحقاً لا يعود الحقل NULL.
  update public.bookings
     set traveller_counts = jsonb_build_object('men', v_men, 'women', v_women, 'children', 0)
   where id = v_booking;
  return v_booking;
end $$;

revoke all on function public.create_public_booking(jsonb) from public;
grant execute on function public.create_public_booking(jsonb) to anon, authenticated;
revoke all on function public.create_public_booking_public_counts_base(jsonb)
  from public, anon, authenticated;

comment on function public.create_public_booking(jsonb) is
  'Pilot: requires and persists the traveller gender breakdown selected in the public booking form.';

insert into public.schema_migrations(version, note)
values ('20261023_enforce_public_traveller_counts', 'Public bookings must retain selected men/women counts for the seat map')
on conflict (version) do nothing;
