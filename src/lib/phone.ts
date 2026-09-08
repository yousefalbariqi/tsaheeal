/* أرقام الهواتف — تطبيعٌ وتحقّقٌ في موضعٍ واحد.

   ما كان: نمطٌ سعودي واحد مكتوبٌ داخل شاشة الطلبات
   (`/^(05\d{8}|(\+?966)5\d{8})$/`) لا يراه غيرها، وحقلُ «رقم تواصل
   الفندق» بلا أي تحقّق — يُقبل فيه أي نصّ، فيُحفظ رقمٌ لا يُتصل به.

   والفندق ليس كالعميل: رقمه أرضيٌّ غالباً (+966 12 543 7777) وقد يكون
   دولياً لفندقٍ يُدار من خارج المملكة. فالتحقّق ثلاث حالات لا حالة واحدة:
   جوّال سعودي، وهاتف سعودي ثابت، ودوليٌّ بمفتاح دولته — ومن أراد الجوّال
   وحده (نموذج العميل) طلبه صراحةً.

   الصيغة المخزَّنة E.164 (+966501234567): بلا مسافات ولا شرطات ولا صفرٍ
   وطني. سببها أن الجوال يُستعمل مفتاحَ بحثٍ عن العميل وأساسَ رابط واتساب،
   ونفس الرقم مكتوباً بأربع صيغٍ يعني أربعة عملاء مكرّرين في السجل. */

/** الأرقام وحدها — يُزال كل ما ليس رقماً (مسافات، شرطات، أقواس، +). */
export const digitsOf = (raw: string): string => (raw || "").replace(/\D/g, "");

export type PhoneKind = "sa_mobile" | "sa_landline" | "intl";

/* مفاتيح المناطق للهاتف الثابت السعودي: 11 الرياض · 12 مكة وجدة ·
   13 الشرقية · 14 المدينة · 16 القصيم · 17 عسير. */
const SA_AREA = /^1[1-7]\d{7}$/;   // بلا الصفر الوطني ولا مفتاح الدولة
const SA_MOBILE_LOCAL = /^5\d{8}$/;

/** يحوّل ما كتبه الموظف إلى E.164، أو null إن لم يكن رقماً صالحاً.

    يقبل: 0501234567 · 966501234567 · +966501234567 · 501234567 ·
    0125437777 · +966125437777 · وأي دوليٍّ يبدأ بـ+ ومعه ٨–١٥ رقماً. */
export function toE164(raw: string): string | null {
  const input = (raw || "").trim();
  if (!input) return null;
  const d = digitsOf(input);
  if (!d) return null;

  /* بدأ بمفتاح الدولة السعودي — يُقبل جوّالاً أو ثابتاً. */
  if (d.startsWith("966")) {
    const rest = d.slice(3).replace(/^0+/, "");
    if (SA_MOBILE_LOCAL.test(rest) || SA_AREA.test(rest)) return `+966${rest}`;
    return null;
  }

  /* رقمٌ وطنيّ يبدأ بصفر. */
  if (d.startsWith("0")) {
    const rest = d.slice(1);
    if (SA_MOBILE_LOCAL.test(rest) || SA_AREA.test(rest)) return `+966${rest}`;
    return null;
  }

  /* جوّالٌ سعودي بلا صفر ولا مفتاح — الصيغة التي يكتبها الناس عادةً. */
  if (SA_MOBILE_LOCAL.test(d)) return `+966${d}`;

  /* دوليّ: لا يُقبل إلا بعلامة + صريحة. بدونها لا نعرف أين ينتهي مفتاح
     الدولة ويبدأ الرقم، والتخمين يُنتج أرقاماً لا وجود لها. */
  if (input.startsWith("+") && d.length >= 8 && d.length <= 15) return `+${d}`;

  return null;
}

/** نوع الرقم بعد التطبيع، أو null إن كان غير صالح. */
export function phoneKind(raw: string): PhoneKind | null {
  const e = toE164(raw);
  if (!e) return null;
  if (e.startsWith("+966")) {
    const rest = e.slice(4);
    if (SA_MOBILE_LOCAL.test(rest)) return "sa_mobile";
    if (SA_AREA.test(rest)) return "sa_landline";
    return null;
  }
  return "intl";
}

/** جوّال سعودي فقط — ما يشترطه نموذج العميل ورابط واتساب. */
export const isSaudiMobile = (raw: string): boolean => phoneKind(raw) === "sa_mobile";

/** أي رقمٍ صالح: جوّال سعودي أو ثابت سعودي أو دوليٌّ بمفتاح دولته. */
export const isValidPhone = (raw: string): boolean => phoneKind(raw) !== null;

/** رسالة الخطأ العربية، أو null إن كان الحقل سليماً.

    تُصاغ بما يفعله الموظف لا بما فشل فيه النظام: «اكتب مفتاح الدولة»
    أنفع من «رقم غير صالح». */
export function phoneError(
  raw: string,
  opts: { required?: boolean; mobileOnly?: boolean } = {},
): string | null {
  const input = (raw || "").trim();
  if (!input) return opts.required ? "الرقم مطلوب" : null;

  const kind = phoneKind(input);
  if (opts.mobileOnly) {
    if (kind === "sa_mobile") return null;
    if (kind === "sa_landline") return "هذا رقم ثابت — المطلوب جوّال يبدأ بـ05";
    if (kind === "intl") return "المطلوب جوّال سعودي يبدأ بـ05";
    return "رقم جوّال غير صحيح — مثال: 0501234567";
  }
  if (kind) return null;

  const d = digitsOf(input);
  if (!input.startsWith("+") && d.length > 10) {
    return "رقمٌ دوليّ يحتاج مفتاح الدولة — مثال: +20 2 1234 5678";
  }
  return "رقم غير صحيح — مثال: 0501234567 أو +966 12 543 7777";
}

/** للعرض داخل حقلٍ أو بطاقة: يُكتب من اليسار لليمين مجزّأً ليُقرأ.
    غير الصالح يُعاد كما كتبه الموظف — لا نُخفي خطأه بتنسيقٍ يُجمّله. */
export function formatPhone(raw: string): string {
  const e = toE164(raw);
  if (!e) return (raw || "").trim();
  if (e.startsWith("+966")) {
    const rest = e.slice(4);
    return SA_MOBILE_LOCAL.test(rest)
      ? `+966 ${rest.slice(0, 2)} ${rest.slice(2, 5)} ${rest.slice(5)}`
      : `+966 ${rest.slice(0, 2)} ${rest.slice(2, 5)} ${rest.slice(5)}`;
  }
  return e;
}

/** الصيغة الوطنية المختصرة للجوّال السعودي: 0501234567.
    تُستعمل في البحث وفي الجداول حيث المساحة ضيّقة. */
export function localPhone(raw: string): string {
  const e = toE164(raw);
  if (!e) return (raw || "").trim();
  return e.startsWith("+966") ? `0${e.slice(4)}` : e;
}
