/* نظام تصميم صفحة المستفيد — تساهيل العمرة.
   مصدر الألوان هو ملف الهوية المعتمد: الأبيض والعاجي والذهبي الهادئ،
   لا الأخضر الموروث من النسخة التجريبية. */

import { B } from "@/lib/theme";

/* اللوحة الخضراء الداكنة — شريط الرأس وشاشات المسار (flow). سبقت `C`
   ولم تُدمج فيها: `C.green` أفتح ولا يقرأ عليه النص الأبيض في الشريط.
   كانت مكرّرة حرفياً في CustomerApp.tsx وscreens/CustomRequest.tsx،
   فتغييرُ الأخضر في أحدهما كان يُبقي الآخر على القديم. */
export const G = {
  // لا سطح أسود في تجربة العميل؛ العمق هنا ذهبي الهوية لا أسود محايد.
  deep:  "#8C6423",
  dark:  "#6E4D1B",
  green: "#B7893F",
  gold:  "#B7893F",
  bg:    "#FBF9F5",
} as const;

export const C = {
  ink:    "#5C421B",  // بني ذهبي مقروء — لا أسود في الواجهة
  ink2:   "#625B4D",  // النص الثانوي والوصف
  ink3:   "#A69D8E",  // المعطّل
  line:   "#E6DFCF",  // فواصل الهوية
  border: "#E6DFCF",  // حدود الحقول والـ chips
  fill:   "#FBF9F5",  // العاجي الهادئ
  white:  "#FFFFFF",
  // أشرطة الأقسام تتناوب بهدوء؛ الذهبي لا يستعمل كخلفية كاملة للنص.
  band:       "#FBF9F5",
  bandAction: "#F8F1E4",
  green:      "#B7893F",  // اسمٌ متوافق مع المكوّنات القديمة، اللون ذهبي الهوية
  greenLite:  "#C89B52",
  greenDeep:  "#8C6423",
  greenTint:  "#F7EEDC",
  gold:       "#B7893F",
  goldTint:   "#F8F1E4",
  danger:     "#C13515",
  dangerTint: "#FBE6E6",
} as const;

/** تدرّج لطيف للزر الرئيسي؛ الخلفية العميقة تحافظ على تباين النص الأبيض. */
export const CTA_GRADIENT = `linear-gradient(120deg, ${C.greenLite} 0%, ${C.greenDeep} 100%)`;

/* خطّ واحد للتطبيق كلّه — معرّف في src/styles/fonts.css.
   `mono` باقٍ مفتاحاً وإن ساوى `sans`: مواضعه (الأرقام، المعرّفات، الآيبان)
   هي التي ستحتاج تعديلاً لو أُعيد خطٌّ أحاديّ العرض يوماً، فحذفه يمحو
   المعلومة التي تدلّ عليها. */
export const FONT = {
  sans: "var(--font-app)",
  display: "var(--font-display)",
  mono: "var(--font-app)",
} as const;

/** أحجام النص وأوزانها كما تقيسها اللقطات. */
export const T = {
  h1:    { fontSize: 26, fontWeight: 600, lineHeight: 1.25 },  // عنوان الباقة في بطاقة الرأس
  h2:    { fontSize: 22, fontWeight: 600, lineHeight: 1.3  },  // عناوين الأقسام
  h3:    { fontSize: 17, fontWeight: 600, lineHeight: 1.4  },  // عناوين فرعية داخل قسم
  body:  { fontSize: 16, fontWeight: 400, lineHeight: 1.6  },
  meta:  { fontSize: 14, fontWeight: 400, lineHeight: 1.5  },  // السطر الرمادي تحت العنوان
  small: { fontSize: 12, fontWeight: 500, lineHeight: 1.4  },
  price: { fontSize: 18, fontWeight: 600, lineHeight: 1.2  },  // السعر في الشريط الثابت
} as const;

export const SPACE = {
  page:    24,  // الهامش الأفقي للصفحة
  section: 24,  // المسافة الرأسية داخل القسم
  gap:     12,  // بين عناصر الـ carousel
} as const;

export const R = {
  card:   14,   // صورة البطاقة في الاستكشاف
  sheet:  24,   // بطاقة الرأس والـ bottom sheet
  pill:  999,   // زر الإجراء والشرائح المستديرة
  button:  8,   // الأزرار الرمادية الثانوية
  chip:   12,   // شرائح الفئات المحدودة
} as const;

export const SHADOW = {
  float: "0 2px 8px rgba(0,0,0,.14)",         // الأزرار العائمة فوق المعرض
  card:  "0 6px 20px -6px rgba(0,0,0,.12)",
  sheet: "0 -2px 16px -4px rgba(0,0,0,.10)",  // الشريط الثابت السفلي
} as const;

/** ارتفاع الشريط الثابت — تُستخدم كـ padding سفلي للمحتوى حتى لا يختبئ خلفه. */
export const STICKY_H = 88;

export const MOTION = {
  rotate: 3200,   // مدة بقاء كل سطر في النص المتحرك
  /* إزاحة بين البطاقات حتى لا تنقلب كلها في اللحظة نفسها.
     لا بد أن تكون جزءاً معتبراً من `rotate` وإلا بقيت البطاقات متزامنة عملياً. */
  stagger: 1100,

  /* ── نبض حدود بطاقات الباقات ──
     `sweep` الزمن بين بطاقة والتالية، و`pulseFade` مدة ظهور الهالة
     واختفائها. الثانية أقصر من الأول قليلاً بعمد: لو ساوته أو زادت لبقيت
     هالة البطاقة السابقة قائمة حين تُضاء التالية، فتُرى الشبكة مضاءة
     خفيفاً كلها بلا موجة تمشي. */
  sweep: 700,
  pulseFade: 560,
} as const;

/** يقرأ تفضيل تقليل الحركة في النظام. الحركة المستمرة تسبب دواراً لبعض
    المستخدمين، فتُعطَّل كلياً عند التفعيل — لا تُبطَّأ فقط. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** يعكس الأيقونات الاتجاهية (الأسهم) في RTL. */
export const flipRTL = (dir: "rtl" | "ltr") =>
  dir === "rtl" ? { transform: "scaleX(-1)" } : undefined;

/** الأرقام والأسعار تُقرأ LTR دائماً حتى داخل نص عربي. */
export const LTR = { direction: "ltr" as const, unicodeBidi: "isolate" as const };

export const money = (n: number) => Math.round(n).toLocaleString("en-US");

/** "2025-08-07" → "7 أغسطس 2025" — كما يعرضونها، بأرقام لاتينية في كل اللغات. */
export function formatDate(iso: string, lang = "ar", withWeekday = false): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(`${lang}-u-nu-latn`, {
      ...(withWeekday ? { weekday: "long" as const } : {}),
      day: "numeric", month: "long", year: "numeric",
    }).format(d);
  } catch {
    return iso;
  }
}
