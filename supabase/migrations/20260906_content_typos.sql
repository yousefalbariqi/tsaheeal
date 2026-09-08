-- ════════════════════════════════════════════════════════════════════
-- 20260906 — الموجة ٠: تصحيح أخطاء المحتوى التي رصدها الفريق
--
-- هذه أخطاءٌ في **بيانات** الباقات لا في الشفرة، فلا يصلحها نشرٌ جديد.
-- رصدها الفريق في صفحة تفاصيل الباقة:
--
--   «مرشد دينيي»        → «مرشد ديني»
--   «سرعة في الوصل»     → «سرعة في الوصول»
--   «يتم تجنيع الحظور»  → «يتم تجميع الحضور»
--   «الوصل للميقات»     → «الوصول للميقات»
--   «مكة ٣ آيام»        → «مكة ٣ أيام»
--
-- ── خصائص هذا السكربت ──
--
-- (١) **آمن**: لا drop ولا truncate ولا delete. تحديثاتُ نصٍّ فقط.
--
-- (٢) **مُقيَّد**: يستبدل السلاسل المذكورة أعلاه وحدها. لا يعمل على
--     نمطٍ عامّ مثل «كل واو ناقصة» — قاعدةٌ كهذه تُفسد نصوصاً صحيحة
--     ولا يُعرف ما أفسدته إلا بعد أن يراه عميل.
--
-- (٣) **قابل لإعادة التشغيل**: `replace` على نصٍّ صُحِّح لا يجد ما
--     يستبدله فلا يفعل شيئاً، وشرط `where` يمنع لمس الصفوف السليمة.
--     تشغيله مرّتين كتشغيله مرّة.
--
-- (٤) **يُبلّغ في نتيجة ظاهرة**: العدّ يعود جدولَ نتائج لا `raise
--     notice` — الإشعارات لا تظهر في محرّر SQL على Supabase، فتقريرٌ
--     بها تقريرٌ لا يقرؤه أحد.
--
-- ── ملاحظتان على البنية ──
--
-- • الجداول الفرعية ليست متماثلة الأعمدة: package_features و
--   package_program_stages تحملان `item_id`، و package_policies لا
--   تحمله (أعمدتها: id · package_id · value · sort). افتراض تماثلها
--   أسقط النسخة الأولى من استعلام التقرير بـ«column item_id does not
--   exist».
--
-- • تحديثا `packages` (الاسم والملاحظات) في أمرٍ واحد لا اثنين: صفّان
--   من CTE يعدّلان الجدول نفسه في الأمر الواحد يعملان على اللقطة
--   نفسها، فلو أصاب كلاهما صفّاً واحداً ضاع أثر أحدهما بلا خطأ يُنبّه.
--
-- ⚠️ الأخطاء الإملائية تتكرّر لأن النصّ يُكتب مرّة في اللوحة ولا يمرّ
--    بمراجعة. هذا السكربت يصلح الماضي؛ منعُ الحاضر يحتاج مراجعةً قبل
--    النشر — وهي في الموجة ٧ ضمن «منع نشر باقة ناقصة».
-- ════════════════════════════════════════════════════════════════════

-- ─── التصحيح + تقرير العدّ ───
-- أوامر التعديل داخل WITH تُنفَّذ مرّةً واحدة وإلى تمامها دائماً، سواء
-- قرأ الاستعلام الخارجي مخرجاتها أم لا — فالعدّ أدناه تقريرٌ عمّا وقع
-- فعلاً لا شرطٌ لوقوعه.
with feat as (
  update package_features
     set text = replace(text, 'مرشد دينيي', 'مرشد ديني')
   where text like '%مرشد دينيي%'
  returning 1
),
stage as (
  -- العنوان والوصف معاً في أمرٍ واحد على نفس الجدول.
  update package_program_stages
     set title = replace(replace(replace(replace(title,
                   'الوصل للميقات',    'الوصول للميقات'),
                   'سرعة في الوصل',    'سرعة في الوصول'),
                   'يتم تجنيع الحظور', 'يتم تجميع الحضور'),
                   'مرشد دينيي',       'مرشد ديني'),
         descr = replace(replace(replace(replace(coalesce(descr, ''),
                   'الوصل للميقات',    'الوصول للميقات'),
                   'سرعة في الوصل',    'سرعة في الوصول'),
                   'يتم تجنيع الحظور', 'يتم تجميع الحضور'),
                   'مرشد دينيي',       'مرشد ديني')
   where title             like any (array['%الوصل للميقات%','%سرعة في الوصل%','%يتم تجنيع الحظور%','%مرشد دينيي%'])
      or coalesce(descr,'') like any (array['%الوصل للميقات%','%سرعة في الوصل%','%يتم تجنيع الحظور%','%مرشد دينيي%'])
  returning 1
),
pol as (
  update package_policies
     set value = replace(replace(replace(value,
                   'الوصل للميقات', 'الوصول للميقات'),
                   'سرعة في الوصل', 'سرعة في الوصول'),
                   'آيام',          'أيام')
   where value like any (array['%الوصل للميقات%','%سرعة في الوصل%','%آيام%'])
  returning 1
),
pkg as (
  -- الاسم والملاحظات معاً — انظر الملاحظة الثانية أعلاه.
  update packages
     set name  = replace(name, 'آيام', 'أيام'),
         notes = replace(replace(replace(coalesce(notes, ''),
                   'الوصل للميقات', 'الوصول للميقات'),
                   'سرعة في الوصل', 'سرعة في الوصول'),
                   'مرشد دينيي',    'مرشد ديني')
   where name              like '%آيام%'
      or coalesce(notes,'') like any (array['%الوصل للميقات%','%سرعة في الوصل%','%مرشد دينيي%'])
  returning 1
)
-- الأسماء بين علامتَي اقتباس: المعرّفات غير اللاتينية تمرّ في Postgres
-- بلا اقتباس، لكن الاقتباس يرفع كل شكّ في محرفٍ مركّب كالشدّة.
select 'مميزات الباقة'  as "البند", count(*) as "صفوف مصحَّحة" from feat
union all select 'مراحل البرنامج', count(*) from stage
union all select 'سياسات الباقة',  count(*) from pol
union all select 'الباقات (الاسم والملاحظات)', count(*) from pkg;


-- ════════════════════════════════════════════════════════════════════
-- تقرير: ما بقي من هذه الأخطاء في المحتوى بعد التصحيح.
-- المتوقّع: صفر صفوف. أي صفٍّ هنا نصٌّ أُدخل بصيغةٍ لم يغطّها الاستبدال
-- أعلاه (مسافة زائدة، أو تشكيل، أو صيغة أخرى) — يُصحَّح من اللوحة.
-- `package_id` أوّل الأعمدة لأنه المقصود بالفتح هناك.
-- ════════════════════════════════════════════════════════════════════
with bad as (
  select 'package_features'                as tbl,
         pf.package_id                     as package_id,
         coalesce(pf.item_id, pf.id::text) as ref,
         pf.text                           as content
    from package_features pf
  union all
  select 'package_program_stages.title',
         ps.package_id, coalesce(ps.item_id, ps.id::text), ps.title
    from package_program_stages ps
  union all
  select 'package_program_stages.descr',
         ps.package_id, coalesce(ps.item_id, ps.id::text), coalesce(ps.descr, '')
    from package_program_stages ps
  union all
  select 'package_policies',
         pp.package_id, pp.id::text, pp.value
    from package_policies pp
  union all
  select 'packages.name',
         p.id, p.id, p.name
    from packages p
  union all
  select 'packages.notes',
         p.id, p.id, coalesce(p.notes, '')
    from packages p
)
select package_id, tbl, ref, content
  from bad
 where content like any (array[
   '%دينيي%', '%تجنيع%', '%الحظور%', '%آيام%',
   '%في الوصل%', '%الوصل للميقات%'
 ])
 order by package_id, tbl, ref;


-- ═══════════ سجلّ الترحيلات ═══════════
insert into public.schema_migrations(version, note) values
  ('20260906_content_typos', 'الموجة ٠: تصحيح أخطاء المحتوى التي رصدها الفريق')
on conflict (version) do nothing;
