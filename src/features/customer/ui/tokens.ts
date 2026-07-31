/* نظام تصميم صفحة المستفيد — مستخرج من لقطات Airbnb (موبايل، عرض 390px).
   القاعدة أبيض ومحايد كما عندهم؛ الأخضر يحل محل الوردي كلون الإجراء، والذهبي للنجوم والشارات.
   ملاحظة أساسية: Airbnb تستخدم وزن 600 للعناوين و400–500 للنص — لا 800. */

export const C = {
  ink:    "#222222",  // النص الأساسي
  ink2:   "#6A6A6A",  // النص الثانوي والوصف
  ink3:   "#B0B0B0",  // المعطّل
  line:   "#EBEBEB",  // الفواصل بين الأقسام
  border: "#DDDDDD",  // حدود الحقول والـ chips
  fill:   "#F7F7F7",  // خلفية الأزرار الثانوية
  white:  "#FFFFFF",
  // أشرطة الأقسام — تتناوب مع الأبيض لتفصل «فصول» الصفحة بلا إضافة أي عنصر
  band:       "#FAF8F4",  // رملي فاتح جداً
  bandAction: "#F4F9F7",  // أخضر فاتح جداً — كتلة الحجز وحدها
  green:      "#1F6F6B",
  greenLite:  "#2E8F88",
  greenDeep:  "#154C48",
  greenTint:  "#EAF5F0",  // خلفية العنصر المختار
  gold:       "#C0862C",
  goldTint:   "#FFF7EA",
  danger:     "#C13515",
  dangerTint: "#FBE6E6",
} as const;

/** تدرّج زر الإجراء — يقابل تدرّج "حجز" الوردي عندهم. */
export const CTA_GRADIENT = `linear-gradient(120deg, ${C.greenLite} 0%, ${C.greenDeep} 100%)`;

export const FONT = {
  sans: "'IBM Plex Sans Arabic', system-ui, sans-serif",
  mono: "'IBM Plex Mono', monospace",
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
  pulse: 2400,    // دورة نبض حدود البطاقة
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
export function formatDate(iso: string, lang = "ar"): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(`${lang}-u-nu-latn`, { day: "numeric", month: "long", year: "numeric" }).format(d);
  } catch {
    return iso;
  }
}
