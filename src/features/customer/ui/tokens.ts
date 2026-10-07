/* نظام تصميم صفحة المستفيد — تساهيل العمرة.
   مصدر الألوان هو ملف الهوية المعتمد: الأبيض والعاجي والذهبي الهادئ،
   لا الأخضر الموروث من النسخة التجريبية. */

import { B } from "@/lib/theme";

/* لوحة «الكسوة» في تجربة العميل (قرار 2026-10-05): ألوان الشعار نفسه —
   أسود دافئ للنصّ والبنية، ذهبي للفعل، عاجي للأسطح. القيم من lib/theme
   حتى لا يختلف ذهبي العميل عن ذهبي الإدارة كما كان (#B7893F و#C0862C).

   المفاتيح القديمة باقية بأسمائها لأن مئات المواضع تقرؤها: `green*`
   اسمٌ موروث قيمته ذهبية، و`G.deep` كان بنّياً ذهبياً وصار سطح البنية. */
export const G = {
  deep:  B.ink,
  dark:  B.ink2,
  green: B.gold,
  gold:  B.gold,
  bg:    "#FBF9F5",
} as const;

export const C = {
  ink:    B.black,    // النصّ الأساسي — أسود دافئ
  ink2:   B.text2,    // النص الثانوي والوصف
  ink3:   "#A39A8B",  // المعطّل
  line:   B.border,   // الفواصل
  border: B.borderStrong, // حدود الحقول والشرائح
  fill:   "#FBF9F5",  // العاجي الهادئ
  white:  "#FFFFFF",
  // أشرطة الأقسام تتناوب بهدوء؛ الذهبي لا يستعمل كخلفية كاملة للنص.
  band:       "#FBF9F5",
  bandAction: B.goldTint,
  green:      B.gold,      // اسمٌ متوافق مع المكوّنات القديمة، اللون ذهبي الهوية
  greenLite:  B.gold,
  greenDeep:  B.goldDeep,  // نصّ ذهبي على سطح فاتح (٥٫٨:١)
  greenTint:  B.goldTint,
  gold:       B.gold,
  goldTint:   B.goldTint,
  danger:     "#BE2626",
  dangerTint: "#FBE9E7",
} as const;

/** تدرّج لطيف للزر الرئيسي؛ الخلفية العميقة تحافظ على تباين النص الأبيض. */
/* الزرّ الرئيسي ذهبيٌّ مصمت ونصُّه أسود (٥٫٧:١)؛ الأبيض على الذهبي ٣٫١:١.
   الاسم باقٍ لمن يستورده، والقيمة لم تعد تدرّجاً. */
export const CTA_GRADIENT = C.gold;
/** لون نصّ الزرّ الرئيسي. */
export const CTA_TEXT = C.ink;

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
  float: "0 2px 8px rgba(20,17,14,.14)",         // الأزرار العائمة فوق المعرض
  card:  "0 1px 2px rgba(27,23,18,.04), 0 8px 24px -8px rgba(27,23,18,.12)",
  sheet: "0 -2px 16px -4px rgba(20,17,14,.10)",  // الشريط الثابت السفلي
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
