/* مسارات واجهة المستفيد — تحويل بين الشاشة والمسار في شريط العنوان.

   قبل هذا كانت الشاشة حالةً في الذاكرة وحدها: كل عناوين الموقع «/»،
   فرابط باقة يُرسَل في واتساب يفتح صفحة الاستكشاف، وزر الرجوع في
   المتصفّح يخرج من الموقع كلّه بدل أن يعود خطوة.

   المسار هو مصدر الحقيقة للشاشة، لا نسخة تُزامَن معها: `setScreen`
   في CustomerApp صار يُنادي navigate، و`screen` يُقرأ من المسار.
   نسختان تُزامنان تتفارقان دائماً عند أول حالة لم تُحسب.

   ٢٠٢٦-٠٩-١٣: «/» صارت تجربة Focus. النقل في نقطة الدخول وحدها —
   الشاشات وأسماؤها ومنطق الحجز كما هي، والمتغيّر أيُّ شاشةٍ يفتحها
   الجذر وأين يقع الاستكشاف القديم. */
export type Screen =
  | "packages" | "focus" | "focusListing" | "focusConfigure" | "listing" | "custom" | "passengers" | "review"
  | "success" | "track" | "profile" | "login" | "otp" | "account";

/** الرئيسية الرسمية. تجربة Focus لم تعد تجربةً جانبية: هي الصفحة التي
    تُفتح على «/» ومسار الحجز الأساسي.

    كل «عُد إلى البداية» في التطبيق يمرّ من هذا الثابت لا من اسم شاشةٍ
    مكتوبٍ في عشرة مواضع: نقل الرئيسية مرّةً أخرى — أو التراجع عن هذا
    النقل إن ظهر عطب — تعديلُ سطرٍ واحد لا مطاردةُ نداءات. */
export const HOME: Screen = "focus";

/** الاستكشاف القديم. لم يُحذف ولم يُمسّ تصميمه؛ نُقل إلى مسارٍ داخلي
    (/classic) ليبقى قابلاً للفتح والمقارنة حتى تستقرّ الرئيسية الجديدة،
    ولا تُربط إليه الواجهة ولا يُشارَك رابطه. */
export const LEGACY_HOME: Screen = "packages";

export interface CustomerRoute {
  screen: Screen;
  /** معرّف الباقة من المسار — في /p/:id و/book/:id/:step. */
  packageId?: string;
  /** مسار لا نعرفه. تُرسَم عليه الرئيسية ويُصحَّح العنوان إلى «/»:
      بلا هذه الراية كان /أي-شيء يعرض الصفحة الأولى ويُبقي المسار
      الخطأ في شريط العنوان — فيُحفظ في المفضّلة ويُشارَك كأنه صحيح،
      ولا يظهر للزائر أنّ الرابط الذي وصله تالف. */
  unknown?: boolean;
  /** عنوانٌ قديم لصفحةٍ انتقلت — /focus بعد أن صارت هي «/». يُرسَم كما
      كان ثم يُصحَّح العنوان استبدالاً: الروابط التي سبق نشرها لا تنكسر،
      ولا يبقى للصفحة الواحدة عنوانان يُفهرسان ويُشاركان كأنهما صفحتان. */
  legacyPath?: boolean;
}

/* خطوات الحجز التي تظهر في المسار. الاسم في المسار = اسم الشاشة،
   فلا جدول ترجمة ثانٍ يُنسى تحديثه. */
const BOOK_STEPS = ["passengers", "review", "success"] as const;
export type BookStep = (typeof BOOK_STEPS)[number];
const isBookStep = (s: string): s is BookStep =>
  (BOOK_STEPS as readonly string[]).includes(s);

/** الخطوات التي تحتاج باقة مُحدّدة — بدونها المسار ناقص ويُعاد توجيهه. */
export const NEEDS_PACKAGE: Screen[] = ["listing", "focusListing", "focusConfigure", ...BOOK_STEPS];

/** ترتيب خطوات المسار — لحساب «الخطوة السابقة» ولمنع القفز للأمام. */
export const STEP_ORDER: Screen[] = ["listing", "passengers", "review", "success"];

export function parseRoute(pathname: string): CustomerRoute {
  const seg = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const [a, b, c] = seg;
  if (!a) return { screen: "focus" };
  if (a === "focus" && b === "p" && c) return { screen: "focusListing", packageId: c };
  if (a === "focus" && b === "book" && c) return { screen: "focusConfigure", packageId: c };
  /* /focus ما زال يعمل — يفتح الرئيسية نفسها ثم يُصحَّح العنوان إلى «/».
     كلّ رابطٍ أُرسل أيام التجربة يصل إلى نفس الصفحة، لا إلى 404. */
  if (a === "focus") return { screen: "focus", legacyPath: true };
  if (a === "classic") return { screen: "packages" };
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
  return { screen: HOME, unknown: true };
}

export function pathOf(screen: Screen, packageId?: string): string {
  const pid = packageId ? encodeURIComponent(packageId) : "";
  switch (screen) {
    case "focus":      return "/";
    /* مسارات Focus الداخلية تبقى كما هي: كل رابطٍ منشور يعمل بلا تحويل،
       وتوحيدها تحت «/p» و«/book» يأتي في التنظيف بعد استقرار الرئيسية —
       لأنه يعني إعادةَ توجيه /p/:id إلى تصميمٍ آخر، وذلك قرارٌ وحده. */
    case "focusListing": return pid ? `/focus/p/${pid}` : "/";
    case "focusConfigure": return pid ? `/focus/book/${pid}` : "/";
    case "packages":   return "/classic";
    case "custom":     return "/custom";
    case "track":      return "/orders";
    case "profile":    return "/profile";
    case "account":    return "/account";
    case "login":      return "/login";
    case "otp":        return "/login/otp";
    /* بلا باقة لا معنى للمسار — يعود للاستكشاف بدل مسار مبتور
       مثل /p/ أو /book//review يفتح صفحة فارغة. */
    case "listing":    return pid ? `/p/${pid}` : "/classic";
    default:           return pid ? `/book/${pid}/${screen}` : "/";
  }
}
