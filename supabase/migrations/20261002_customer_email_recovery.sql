-- ════════════════════════════════════════════════════════════════════
-- 20261002 — استعادة كلمة مرور المستفيد عبر البريد
--
-- المستفيد يسجّل برقم جواله وحده (signUp({phone}) في customerAuth)، فحقل
-- auth.users.email فارغ عند كل عملائنا، وبريدهم يعيش في
-- customer_profiles.email لا غير. وGoTrue لا يرسل رابط استعادة إلا
-- لحسابٍ يحمل بريداً في auth.users — ولهذا تعمل دعوات الموظفين ولا
-- يملك المستفيد طريق عودة إذا نسي كلمته.
--
-- فهذا الترحيل يجعل بريد الملف مرآةً في auth.users: مرّةً للحسابات
-- القائمة، ثم تلقائياً بعد كل تعديل — فلا يُنشأ حسابٌ جديد بلا طريق
-- استعادة ولا يفترق البريدان.
--
-- ما لا يفعله عمداً:
--   • لا يلمس auth.identities — بحث الاستعادة يجري على auth.users
--     وحدها، وإضافة صفّ هوية تُوسّع الأثر في مخطّط لا نملكه بلا حاجة.
--   • لا يضع email_confirmed_at. البريد كتبه المستخدم ولم يؤكّده أحد،
--     فلا ندّعي توثيقه. وGoTrue يؤكّده بنفسه لحظة استعمال الرابط
--     (recoverVerify يستدعي Confirm)، وهي اللحظة التي ثبت فيها فعلاً
--     أن الصندوق صندوقه. وإبقاؤه فارغاً قبلها يمنع الدخول ببريدٍ
--     وكلمة مرور — فيبقى الجوال هوية الدخول الوحيدة كما هو مصمَّم.
-- ════════════════════════════════════════════════════════════════════

/* البريد مفتاح فريد في auth.users، فلا يحمله حسابان. وفي تطبيق عمرة
   هذه ليست حالةً نادرة: الأب يسجّل لزوجته وأولاده بأرقام جوال مختلفة
   وبريدٍ واحد. فالمرآة تتخطّى المتعارض ولا تُسقط الحفظ — منعُ التسجيل
   على أسرةٍ كاملة ثمنٌ أكبر بكثير من فقد حسابٍ ثانٍ طريقَ استعادته.
   الأول يفوز بالمرآة، ومن بعده يُخبره التطبيق أنه بلا استعادة بالبريد
   (emailRecoveryReady في customerAuth).

   والمرآة لا تحكم على صحة البيانات: البريد بيانات المستخدم، ومنعُ
   حفظه لأن شكله لا يعجب regex ليس من شأن دالّة تزامن. */
create or replace function public.mirror_customer_email_to_auth()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare
  v_email text := lower(nullif(btrim(new.email), ''));
begin
  if v_email is null then return new; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then return new; end if;
  if exists (select 1 from auth.users u where lower(u.email) = v_email and u.id <> new.id) then
    return new;
  end if;

  update auth.users
     set email = v_email, updated_at = now()
   where id = new.id
     and lower(coalesce(email, '')) is distinct from v_email;

  return new;
end $$;

revoke all on function public.mirror_customer_email_to_auth() from public, anon, authenticated;

drop trigger if exists trg_cp_mirror_email on public.customer_profiles;
create trigger trg_cp_mirror_email
  after insert or update of email on public.customer_profiles
  for each row execute function public.mirror_customer_email_to_auth();

comment on function public.mirror_customer_email_to_auth() is
  'يعكس customer_profiles.email إلى auth.users.email ليصل رابط استعادة كلمة المرور.';

-- ── تعبئة الحسابات القائمة ──
-- صفّاً صفّاً لا دفعةً واحدة: بريدٌ واحد مكرَّر يُسقط UPDATE جماعياً
-- كاملاً، فتبقى كل الحسابات بلا طريق استعادة بسبب صفّ واحد. هنا يُتخطّى
-- المتعارض وحده، ويُعلَن عددهم في نهاية التشغيل.
do $$
declare
  r        record;
  v_done   int := 0;
  v_taken  int := 0;
  v_bad    int := 0;
begin
  for r in
    select p.id, lower(btrim(p.email)) as email
      from public.customer_profiles p
      join auth.users u on u.id = p.id
     where nullif(btrim(p.email), '') is not null
       and nullif(btrim(u.email), '') is null
  loop
    if r.email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      v_bad := v_bad + 1;
      continue;
    end if;
    if exists (select 1 from auth.users u where lower(u.email) = r.email and u.id <> r.id) then
      v_taken := v_taken + 1;
      continue;
    end if;
    update auth.users set email = r.email, updated_at = now() where id = r.id;
    v_done := v_done + 1;
  end loop;

  raise notice 'استعادة المستفيد: عُبّئ % حساباً، تُخطّي % لتعارض البريد و% لصيغة غير صالحة.',
    v_done, v_taken, v_bad;
end $$;
