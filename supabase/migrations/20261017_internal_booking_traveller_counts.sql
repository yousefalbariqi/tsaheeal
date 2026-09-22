-- 20261017 — توزيع المسافرين للحجز الداخلي
--
-- كان نموذج الموظف يحفظ عدد المقاعد فقط، فيبقى المقعد المرافق بلا لون
-- في كروكي الحافلة. نحفظ لقطة الرجال/النساء عند الإنشاء أو التعديل،
-- ولا نمس الحجز القديم ما لم يرسل النموذج هذا المفتاح صراحة.

do $$
begin
  if to_regprocedure('public.upsert_booking_traveller_counts_base(jsonb)') is null then
    if to_regprocedure('public.upsert_booking(jsonb)') is null then
      raise exception 'upsert_booking(jsonb) is required before 20261017';
    end if;
    execute 'alter function public.upsert_booking(jsonb) rename to upsert_booking_traveller_counts_base';
  end if;
end $$;

create or replace function public.upsert_booking(doc jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_id text := doc->>'id';
  v_people int := greatest(coalesce((doc->>'persons')::int, 1), 1);
  v_counts jsonb := doc->'travellerCounts';
begin
  perform public.upsert_booking_traveller_counts_base(doc);

  -- غياب المفتاح يعني تعديل حجز قائم (اسم، جوال، حالة...)، فلا نمحو
  -- لقطة توزيعه. أمّا وجوده فيلزم أن يساوي عدد الأشخاص تماماً.
  if doc ? 'travellerCounts' then
    if jsonb_typeof(v_counts) <> 'object'
       or coalesce(v_counts->>'men', '') !~ '^[0-9]+$'
       or coalesce(v_counts->>'women', '') !~ '^[0-9]+$'
       or coalesce(v_counts->>'children', '0') !~ '^[0-9]+$'
       or coalesce((v_counts->>'men')::int, 0)
        + coalesce((v_counts->>'women')::int, 0)
        + coalesce((v_counts->>'children')::int, 0) <> v_people then
      raise exception 'traveller_counts_mismatch: يجب أن يساوي توزيع المعتمرين عدد المقاعد';
    end if;

    update public.bookings
       set traveller_counts = jsonb_build_object(
         'men', (v_counts->>'men')::int,
         'women', (v_counts->>'women')::int,
         'children', coalesce((v_counts->>'children')::int, 0)
       )
     where id = v_id;
  end if;
end;
$$;

revoke all on function public.upsert_booking(jsonb) from public, anon;
grant execute on function public.upsert_booking(jsonb) to authenticated;
revoke all on function public.upsert_booking_traveller_counts_base(jsonb) from public, anon, authenticated;

insert into public.schema_migrations(version, note)
values ('20261017_internal_booking_traveller_counts', 'توزيع رجال ونساء للحجز الداخلي يظهر في كروكي المقاعد')
on conflict (version) do nothing;
