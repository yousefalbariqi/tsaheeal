-- ════════════════════════════════════════════════════════════════════
-- 20260809 — دفتر المسافرين + مزامنة الجوال بعد تغييره
--
-- بيانات المعتمرين السابقين محفوظة داخل booking_pilgrims، وهي سجلّ ما
-- حدث في حجز بعينه. تعديلها من صفحة الحساب يعني تغيير وثيقة ماضية —
-- وأيّ صفٍّ يُعدَّل لو سافر الشخص ثلاث مرات؟ فالدفتر جدول مستقلّ
-- يُبذَر مرة من تلك السجلّات ثم يعيش وحده.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.customer_travellers (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(id) on delete cascade,
  name        text not null default '',
  doc_type    text,
  id_number   text not null default '',
  nationality text not null default '',
  gender      text not null default 'male',
  age_group   text not null default 'adult',
  birth_date  text not null default '',
  phone       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists customer_travellers_owner_idx on public.customer_travellers(customer_id);

/* رقم الوثيقة هو هوية الشخص لا اسمه: الأسماء تتكرّر وتُكتب بصيغ شتّى.
   جزئي لأن الحجوزات القديمة قد تخلو منه. */
create unique index if not exists customer_travellers_doc_idx
  on public.customer_travellers(customer_id, id_number)
  where id_number <> '';

alter table public.customer_travellers enable row level security;

drop policy if exists "ct self all"   on public.customer_travellers;
drop policy if exists "ct staff read" on public.customer_travellers;
create policy "ct self all"   on public.customer_travellers for all to authenticated
  using (customer_id = auth.uid()) with check (customer_id = auth.uid());
create policy "ct staff read" on public.customer_travellers for select to authenticated
  using (public.is_staff());

revoke all on public.customer_travellers from anon, authenticated;
grant select, insert, update, delete on public.customer_travellers to authenticated;

drop trigger if exists trg_ct_touch on public.customer_travellers;
create trigger trg_ct_touch before update on public.customer_travellers
  for each row execute function public.touch_customer_profile();

-- ═══════════ قراءة الدفتر مع بذره من الحجوزات السابقة ═══════════
/* البذر داخل القراءة لا في ترحيل لمرّة واحدة: الحساب قد يُنشأ بعد هذا
   الترحيل، وقد تُضمّ إليه حجوزات قديمة عبر customer_bootstrap لاحقاً.
   الشرط `not exists` يجعله آمن التكرار ولا يعيد ما حذفه المستفيد عمداً
   ما دام رقم وثيقته باقياً. */
create or replace function public.my_travellers() returns setof public.customer_travellers
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'auth_required'; end if;

  insert into customer_travellers(customer_id,name,doc_type,id_number,nationality,gender,age_group,birth_date,phone)
  select v_uid,
         max(p.name), max(p.doc_type), p.id_number, max(p.nationality),
         max(p.gender), max(p.age_group), max(p.birth_date), max(p.phone)
    from booking_pilgrims p
    join bookings b on b.id = p.booking_id
   where b.customer_id = v_uid
     and coalesce(p.id_number,'') <> ''
     and not exists (
       select 1 from customer_travellers ct
        where ct.customer_id = v_uid and ct.id_number = p.id_number)
   group by p.id_number;

  return query select * from customer_travellers
                where customer_id = v_uid order by created_at;
end $$;
revoke execute on function public.my_travellers() from public, anon;
grant  execute on function public.my_travellers() to authenticated;

-- ═══════════ مزامنة الجوال بعد تأكيده بـOTP ═══════════
/* عمود phone في customer_profiles ممنوع على المستفيد بصلاحية العمود،
   فبعد أن يبدّل GoTrue رقم auth.users لا سبيل لتحديث المرآة إلا هنا.
   المصدر هو الـJWT لا وسيط من الواجهة — فلا يُدّعى رقم لم يُوثَّق. */
create or replace function public.sync_my_phone() returns text
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
        v_ph  text := public.auth_phone();
begin
  if v_uid is null then raise exception 'auth_required';    end if;
  if v_ph  is null then raise exception 'phone_unverified'; end if;
  update customer_profiles set phone = v_ph where id = v_uid;
  return v_ph;
end $$;
revoke execute on function public.sync_my_phone() from public, anon;
grant  execute on function public.sync_my_phone() to authenticated;
