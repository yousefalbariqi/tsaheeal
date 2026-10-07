# نظام تصميم تساهيل — «الكسوة»

مرجع كل من يكتب واجهةً في هذا المشروع. الاتجاه اعتمده يوسف في 2026-10-05:
ألوان الشعار نفسه — أسود دافئ، ذهبي، عاجي — في لوحة الإدارة وتطبيق العميل.

الشاشة المرجعية: `src/features/bookings/index.tsx` (قائمة الطلبات). إذا تعارض
ما تكتبه معها فالمرجع هو الصحيح.

## ١. الألوان

المصدر الواحد: `src/lib/theme.ts` (ومرآته متغيّرات `--k-*` في `src/styles/theme.css`).

| الدور | في TypeScript | في CSS |
|---|---|---|
| سطح البنية الداكن (القائمة الجانبية) | `B.ink` · `B.ink2` · `B.inkLine` | `--k-ink` … |
| نصّ فوق الداكن | `B.onInk` · `B.onInk2` · `B.onInk3` | `--k-on-ink` … |
| النصّ | `B.black` · `B.text3` · `B.text2` · `B.muted` | `--k-text` … |
| الصفحة / البطاقة / الغائر | `B.bg` · `B.surface` · `B.fill` | `--k-bg` · `--k-surface` · `--k-fill` |
| الحدود | `B.border` · `B.borderStrong` | `--k-border` · `--k-border-strong` |
| الذهبي (حشوة الفعل) | `B.gold` | `--k-gold` |
| نصّ ذهبي على سطح فاتح | `B.goldDeep` | `--k-gold-deep` |
| ألوان المعنى | `TONE.success/warn/danger/info/neutral/gold` → `{bg, line, fg}` | `--k-success` … |
| الظلال | `ELEV[1..4]` | `--k-elev-1..4` |

**قاعدة الذهبي: مرّةٌ في المشهد.** الذهبي للزرّ الأساسي الواحد في الشاشة أو
النافذة، ولعلامة «أنت هنا». ليس للأرقام، ولا لأزرار الصفوف، ولا للشريحة
المحدّدة (سوداء)، ولا للعناوين. الرقم يُقرأ بحجمه لا بلونه.

**لا ألوان مكتوبة بأرقامها في الشاشات.** البدائل:

| كان يُكتب | اكتب |
|---|---|
| `#FBE6E6` / `#F3C9C9` / `#BE2626` | `TONE.danger.bg / .line / .fg` |
| `#FBF3D6` / `#F0E3AE` / `#8A6A08` | `TONE.warn…` |
| `#E3F3E8` / `#C4E4CE` / `#1E7A44` | `TONE.success…` |
| `#EAF1FE` / `#CBDBFB` / `#1E52C7` | `TONE.info…` |
| `#fff` / `#FFF` | `B.surface` |
| `#7a7168` | `B.muted` |
| تنبيهٌ مضمَّن بحشوة وحدّ | `<Note tone="warn">` |
| شارةٌ ملوّنة | `<Badge tone="…" dot>` أو `<StatusBadge>` للحالات |

حالات السجلات (طلب، رحلة، فاتورة…) تأخذ نصّها ولونها من `src/lib/status.ts`
عبر `<StatusBadge status entity>` — لا تُعرَّف خريطة حالاتٍ محلية.

## ٢. الخطّ

- الإدارة: Cairo. العميل: DG Shamael (قرار يوسف — لا يُستبدل).
- الأحجام: `12` تعليق وأصغر حدّ · `13` ثانوي · `14` النصّ والجدول · `15` عنوان
  بطاقة · `17` عنوان نافذة · `22` عنوان صفحة · `28` رقم بطاقة.
  **لا نصّ أصغر من 12** — كل `text-[9px]`/`10`/`11`/`11.5` يُرفع إلى 12.
- الأوزان: `400` نصّ · `500` تسميات · `600` إبراز (`font-bold`) · `700` عناوين
  (`font-extrabold`). الصنفان مُنزَّلان درجةً في `theme.css`؛ لا تكتب
  `fontWeight: 800/900`. العريض للعنوان والقيمة، لا لكل سطر.
- الأرقام لاتينية بعرضٍ ثابت (مُفعَّل عامّاً داخل `.ts-admin`).
- لا `letterSpacing` على نصٍّ عربي.

## ٣. المكوّنات — `@/components/ui`

```tsx
import { Button, IconButton, Input, Textarea, Badge, Note, FilterChips, Segmented,
         Switch, Modal, ModalIcon, confirmDialog, TableWrap, SortTh, useSort } from "@/components/ui";
```

| المكوّن | متى |
|---|---|
| `<Button variant="primary">` | الفعل الأساسي — واحدٌ في المشهد. `icon` · `loading` · `size="sm\|md\|lg"` · `block` |
| `<Button variant="secondary">` | كل فعلٍ آخر، وأزرار الصفوف، و«إلغاء» |
| `<Button variant="ghost">` | فعلٌ هادئ بجوار غيره |
| `<Button variant="dark">` | فعلٌ بنيويّ حين يكون الذهبي مستعملاً قربه |
| `<Button variant="danger">` / `"danger-soft"` | ما لا يُرجَع عنه / ما يفتح حوار تأكيده |
| `<IconButton label="…">` | زرّ أيقونةٍ بلا نصّ — `label` إلزامي. `variant="outline"` · `size="sm"` |
| `<Input>` · `<Textarea>` أو الصنف `ui-input` | كل حقل نصّي. `invalid` للخطأ |
| `Field` (`@/components/Field`) | تسمية + حقل + إرشاد/خطأ، مربوطة بـ`htmlFor` |
| `<FilterChips>` | ترشيح قائمةٍ بحالةٍ من عدّة، مع العدّ |
| `<Segmented>` | تبديل عرضٍ بين ٢–٤ خيارات |
| `<Modal open onClose title sub icon footer width toolbar>` | **كل نافذة**. لا `fixed inset-0` يدوياً |
| `confirmDialog({title, message, tone})` | سؤال «هل أنت متأكد؟» — يعيد `Promise<boolean>`. لا `window.confirm` |
| `<TableWrap>` + `table.ui-table` | كل جدول. `SortTh` + `useSort` للفرز في القوائم المحلّية |
| `StatCard` · `PageHeader` · `EmptyState` · `EntityGate` · `Pager` · `TabStrip` | في `@/components/*` |

أصناف CSS مساعدة (في `src/styles/ui.css`): `ui-card` · `ui-card-head` ·
`ui-card-title` · `ui-label` · `ui-req` · `ui-hint` · `ui-error` · `ui-chip` ·
`ui-meter` · `ts-toolbar` · `ts-toolbar-end` · `ts-count` · `ts-section-title` ·
`ts-kv` / `ts-kv-k` / `ts-kv-v`.

## ٤. الأنماط

**هيكل شاشة القائمة**

```tsx
<div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{background:B.bg}}>
  <PageHeader title crumb search onSearch onMenuOpen
    actions={<Button variant="primary" icon={<Plus size={16}/>}>إضافة …</Button>}/>
  <div className="px-4 md:px-8 pt-1">
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">…StatCard ×4 كحدٍّ أقصى…</div>
    <div className="ts-toolbar">…FilterChips…<span className="ts-toolbar-end ts-count">12 طلب</span></div>
  </div>
  <main className="flex-1 px-4 md:px-8 pb-8">
    <EntityGate entity="…">{فارغ ? <EmptyState/> : <>جدول للمكتب + بطاقات للجوال</>}</EntityGate>
    <Pager/>
  </main>
</div>
```

- الزرّ الأساسي في `actions` رأس الصفحة، لا تحت بطاقات الأرقام.
- بطاقات الأرقام أربعٌ كحدٍّ أقصى في صفٍّ واحد، ولا تكرّر ما تعدّه الشرائح.
  `accent` للأولى، `alert` لِما يسوء، `onClick` لِما يُرشِّح.
- الشاشة التي لا قائمة فيها تُبحث تمرّر `hideSearch`.

**الجدول**

- `<div className="hidden md:block ui-table-wrap"><div className="ui-table-scroll"><table className="ui-table">`.
- بلا تنسيقٍ مضمَّن على `th`/`td` إلا المحاذاة. الصنف يحمل الحشوة والحدود والمرور.
- لا نصّ ينكسر: `className="nowrap"`. المعلومة الثانوية سطرٌ ثانٍ `cell-sub`
  تحت `cell-main` بدل عمودٍ إضافي.
- الصفّ الذي يفتح شيئاً: `className="is-clickable" tabIndex={0}` + `onKeyDown` لـEnter.
- أفعال الصفّ: `IconButton size="sm"` داخل `div.row-actions` في `td.col-action`.
  **لا زرّ ذهبي في كل صفّ.**
- التواريخ من `src/lib/dates.ts` (`fmtDateShort` · `fmtDate` · `fmtDayDate` ·
  `fmtTime` · `fmtDateTime`) — لا `2025-08-07` خاماً. المبالغ من `src/lib/money.ts` (`sar`).
- على الجوال (`md:hidden`): بطاقات `ui-card p-4`، وفيها كل أفعال الصفّ.

**النموذج**

- التسمية `ui-label`، والإلزامي `<span className="ui-req">*</span>` (أحمر دائماً).
- الخطأ تحت حقله (`Field error` أو `ui-error`)، لا في toast.
- زرّ الحفظ `loading` أثناء الإرسال؛ النصّ «جارٍ الحفظ…» (بهذا الإملاء).
- **`Field` يعيد شِقّاً** (تسمية + حقل + إرشاد) لا صندوقاً: لا يوضع ابناً مباشراً
  لشبكةٍ أو صفّ flex — يُلفّ بـ`<div>`. بلا ذلك تتبعثر التسمية والحقل والإرشاد
  في خلايا متفرّقة (كانت هذه حال شاشة الإعدادات كلّها).
- حقول الأرقام والروابط والبريد: `dir="ltr"` مع `textAlign:"right"` لتبقى
  محاذيةً لبقية النموذج العربي.
- القوائم المنسدلة `AppSelect` / `SearchSelect`، لا `<select>` خام. التاريخ
  `ArabicDatePicker`، لا `type="date"`. الأرقام `NumericInput`.

**النافذة**

- `<Modal>` دائماً. العرض: `440` حوار · `560` نموذج · `760` نموذج عريض · `980` تفاصيل.
- الذيل: الأساسي أوّلاً ثم «إلغاء». زرٌّ أساسي واحد.
- Escape والنقر خارجها لا يُغلقان (قرار سابق — نافذةٌ فيها مسوّدة لا تُفقد
  بضغطة). `dismissible` للنوافذ التي للقراءة فقط.
- نافذةٌ بتبويبات: `toolbar={<TabStrip tone="onLight" …/>}`.

**الفراغ والتحميل والخطأ**

- `EmptyState` بأيقونة الكيان، ويفرّق بين «لا شيء بعد» (زرّ إضافة) و«لا شيء
  يطابق» (زرّ إزالة المرشّحات). لا نصّ عارٍ «لا توجد…».
- التحميل هيكلٌ (`EntityGate`) لا دوّارة وحيدة.
- الإشعارات `toast` من sonner. لا `alert`.

**الأيقونات**

- lucide فقط، أحجامها `14` · `16` · `18` · `20`. **لا رموز تعبيرية مكان
  الأيقونات** في الواجهة (🕋 🕌 🚌 ✈️ ⚠ ⭐ ★) — استعمل أيقونة lucide.
  الاستثناء: أعلام الجنسيات، وأيقونة مرحلة البرنامج المخزَّنة في بيانات الباقة.

**الاتجاه**

- خصائص منطقية: `ms-` `me-` `ps-` `pe-` `text-start` `text-end`
  `insetInlineStart/End` — لا `ml-` `mr-` `left-` `right-` `text-right`.

**الحركة**

- `DUR` و`EASE` من `lib/theme`. دخولٌ هادئ قصير؛ لا نوابض مرتدّة، ولا
  `whileHover={{y:-4}}`، ولا `AnimatePresence mode="wait"` على تبويبات.

## ٥. ما لا يُمسّ

- منطق العمل: المعالِجات، نداءات المخزن والقاعدة، فحوص الصلاحيات
  (`useRole`)، معاملات الروابط. التغيير بصريٌّ وبنيويّ في الواجهة فقط.
- محتوى المستندات المطبوعة (الفاتورة، التذكرة، الكشف) — إطارها يُصقل، ورقتها لا.
- «الرحلات» جدولٌ واحد مجموعٌ بالأسابيع، لا بطاقات (قرار 2026-09-14).
- الفندق بطاقة تعريف؛ الغرف والأسعار في الباقة (قرار 2026-09-19).
- التعليقات العربية التي تشرح قراراً تبقى؛ تُحدَّث إن صار نصّها خاطئاً.
- لا `git commit` ولا `push` ولا ترحيلات — يوسف يتولّاها.

## ٦. المعاينة

`npm run typecheck` و`npm run build` بعد كل تغيير. وللمعاينة البصرية بلا قاعدة
بيانات: `VITE_SUPABASE_URL="" VITE_SUPABASE_ANON_KEY="" npx vite` يشغّل اللوحة
ببيانات البذرة المحلية.
