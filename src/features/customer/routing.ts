/* مسارات واجهة المستفيد — تحويل بين الشاشة والمسار في شريط العنوان.

   قبل هذا كانت الشاشة حالةً في الذاكرة وحدها: كل عناوين الموقع «/»،
   فرابط باقة يُرسَل في واتساب يفتح صفحة الاستكشاف، وزر الرجوع في
   المتصفّح يخرج من الموقع كلّه بدل أن يعود خطوة.

   المسار هو مصدر الحقيقة للشاشة، لا نسخة تُزامَن معها: `setScreen`
   في CustomerApp صار يُنادي navigate، و`screen` يُقرأ من المسار.
   نسختان تُزامنان تتفارقان دائماً عند أول حالة لم تُحسب. */
export type Screen =
  | "packages" | "listing" | "custom" | "passengers" | "seats" | "review"
  | "success" | "track" | "profile" | "login" | "otp" | "account";

export interface CustomerRoute {
  screen: Screen;
  /** معرّف الباقة من المسار — في /p/:id و/book/:id/:step. */
  packageId?: string;
}

/* خطوات الحجز التي تظهر في المسار. الاسم في المسار = اسم الشاشة،
   فلا جدول ترجمة ثانٍ يُنسى تحديثه. */
const BOOK_STEPS = ["passengers", "seats", "review", "success"] as const;
export type BookStep = (typeof BOOK_STEPS)[number];
const isBookStep = (s: string): s is BookStep =>
  (BOOK_STEPS as readonly string[]).includes(s);

/** الخطوات التي تحتاج باقة مُحدّدة — بدونها المسار ناقص ويُعاد توجيهه. */
export const NEEDS_PACKAGE: Screen[] = ["listing", ...BOOK_STEPS];

/** ترتيب خطوات المسار — لحساب «الخطوة السابقة» ولمنع القفز للأمام. */
export const STEP_ORDER: Screen[] = ["listing", "passengers", "seats", "review", "success"];

export function parseRoute(pathname: string): CustomerRoute {
  const seg = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const [a, b, c] = seg;
  if (!a) return { screen: "packages" };
  if (a === "p" && b) return { screen: "listing", packageId: b };
  if (a === "book" && b) {
    /* خطوة مجهولة في مسار حجز صحيح ⇒ أول خطوة، لا صفحة الاستكشاف:
       الباقة معروفة فلا يُفقد سياق المستفيد على خطأ إملائي في الرابط. */
    return { screen: isBookStep(c ?? "") ? (c as Screen) : "passengers", packageId: b };
  }
  if (a === "custom") return { screen: "custom" };
  if (a === "orders") return { screen: "track" };
  if (a === "profile") return { screen: "profile" };
  if (a === "account") return { screen: "account" };
  if (a === "login") return { screen: b === "otp" ? "otp" : "login" };
  return { screen: "packages" };
}

export function pathOf(screen: Screen, packageId?: string): string {
  const pid = packageId ? encodeURIComponent(packageId) : "";
  switch (screen) {
    case "packages":   return "/";
    case "custom":     return "/custom";
    case "track":      return "/orders";
    case "profile":    return "/profile";
    case "account":    return "/account";
    case "login":      return "/login";
    case "otp":        return "/login/otp";
    /* بلا باقة لا معنى للمسار — يعود للاستكشاف بدل مسار مبتور
       مثل /p/ أو /book//seats يفتح صفحة فارغة. */
    case "listing":    return pid ? `/p/${pid}` : "/";
    default:           return pid ? `/book/${pid}/${screen}` : "/";
  }
}
