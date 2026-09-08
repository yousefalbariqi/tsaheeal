/* إعدادات النظام — القيم التي كانت ثوابت في الشفرة.

   قبلها: رقم واتساب الدعم في WhatsAppFab.SUPPORT_PHONE، وبريد الدعم
   نصّاً في شاشة الدعم، و«السجل التجاري: 1010537391» مكتوباً أربع مرّات
   (الفاتورة، التذكرة، صفحة الدفع، إشعار الإلغاء)، ووعد الردّ وساعات
   العمل في sla.ts. تغيير رقم الدعم = تعديل أربعة ملفّات وإعادة نشر.

   الافتراضات هنا هي القيم القائمة نفسها: من لم ينفّذ الترحيل بعد يرى
   السلوك السابق حرفياً، ولا شاشة تنكسر لغياب صفٍّ في القاعدة. */
import { supabase, isSupabaseEnabled } from "@/supabase/client";

/** عنوان المؤسسة أو الفرع المُصدِر — يُطبع على الفاتورة والتذكرة.

    كان «الرياض» مكتوبةً في ترويسة الفاتورة و«فرع الرياض — العليا» في
    مصفوفةٍ ثابتة داخل شاشة الفواتير، بينما الفرع في الدمّام. مستندٌ
    رسميّ يحمل مدينةً ليست مدينة مُصدِره. */
export interface OrgAddress {
  city: string;
  /** سطر العنوان: الشارع والحيّ. */
  line: string;
  /** رابط الموقع على الخرائط — يُطبع على التذكرة ليصل إليه المعتمر. */
  mapUrl: string;
}

/** ما يقرأه الزائر المجهول — تطبيق المستفيد يحتاجه قبل أي دخول. */
export interface PublicSettings {
  orgName: string;
  /** السجل التجاري — يظهر في الفاتورة والتذكرة وصفحة الدفع. */
  crNumber: string;
  /** الرقم الضريبي (١٥ رقماً). فارغٌ = المنشأة غير مسجّلة في ضريبة
      القيمة المضافة، وحينها لا تُصدَر فاتورة ضريبية بل أوّلية. */
  vatNumber: string;
  domain: string;
  /** عنوان المؤسسة — مصدر المدينة على كل مستند. */
  address: OrgAddress;
  /** رقم واتساب خدمة العملاء — الزرّ العائم في كل شاشات المستفيد.
      مخزَّن بصيغة E.164 (+966…): الرقم مفتاحٌ لرابط واتساب ولقوالب
      الرسائل، ونفسه بأربع صيغ يعني أربعة أرقام لا رقماً واحداً. */
  supportPhone: string;
  /** نافذة العمل بالساعات (توقيت الرياض) — عليها يُحسب وعد الردّ. */
  openHour: number;
  closeHour: number;
  /** أيام العمل: 0 الأحد … 6 السبت. نافذةُ ساعاتٍ بلا أيام كانت تجعل
      وعد الردّ يمشي يوم الجمعة والمكتب مغلق. */
  workDays: number[];
  /** إجازات واستثناءات بصيغة YYYY-MM-DD — يوم إجازةٍ لا يُحتسب أصلاً. */
  holidays: string[];
  /** وعد الردّ بساعات العمل. */
  slaHours: number;
}

/** ما لا يراه إلا الموظفون. */
export interface InternalSettings {
  supportEmail: string;
  /** مهلة سداد رابط الدفع بالساعات — الافتراضي لرحلة جديدة. */
  paymentDeadlineHours: number;
  /** أقصى عدد معتمرين في طلب واحد من التطبيق. */
  maxPilgrimsPerBooking: number;
  /** تنبيه الموظف قبل انطلاق الرحلة بكم ساعة. */
  departureAlertHours: number;
}

export interface AppSettings { pub: PublicSettings; internal: InternalSettings }

/* الافتراضات = السلوك القائم اليوم حرفياً. */
export const DEFAULT_SETTINGS: AppSettings = {
  pub: {
    orgName: "تساهيل العمرة",
    crNumber: "1010537391",
    /* فارغ عمداً: رقمٌ مخترع على فاتورةٍ ضريبية مخالفة. يُملأ من شاشة
       الإعدادات بعد تأكيد تسجيل المنشأة في ضريبة القيمة المضافة. */
    vatNumber: "",
    domain: "tasaaheel.sa",
    address: { city: "", line: "", mapUrl: "" },
    supportPhone: "+966501234567",
    openHour: 6,
    closeHour: 22,
    /* السبت–الخميس: الجمعة وحدها إجازة. يُعدَّل من الشاشة. */
    workDays: [0, 1, 2, 3, 4, 6],
    holidays: [],
    slaHours: 2,
  },
  internal: {
    supportEmail: "support@tasahheel.com",
    paymentDeadlineHours: 24,
    maxPilgrimsPerBooking: 10,
    departureAlertHours: 24,
  },
};

/** يدمج الإعدادات العامة فوق الافتراضات.

    `address` كائنٌ متداخل، والنشر السطحي يستبدله كاملاً: صفٌّ حُفظ قبل
    إضافة `mapUrl` كان سيُقرأ بلا mapUrl لا بقيمتها الافتراضية. والمصفوفتان
    تُصانان من قيمةٍ غير مصفوفة في الصفّ المحفوظ — jsonb يقبل أي شكل،
    و`workDays` نصّاً يجعل `.includes` ترمي عند أول حساب لوعد الردّ. */
const mergePub = (raw: unknown): PublicSettings => {
  const o = (raw ?? {}) as Partial<PublicSettings>;
  const pub = { ...DEFAULT_SETTINGS.pub, ...o };
  return {
    ...pub,
    address: { ...DEFAULT_SETTINGS.pub.address, ...(o.address ?? {}) },
    workDays: Array.isArray(pub.workDays) ? pub.workDays : DEFAULT_SETTINGS.pub.workDays,
    holidays: Array.isArray(pub.holidays) ? pub.holidays : DEFAULT_SETTINGS.pub.holidays,
  };
};

/** يدمج المقروء فوق الافتراضات — حقلٌ أُضيف بعد آخر حفظ يأتي بقيمته. */
const merge = (raw: unknown): AppSettings => {
  const o = (raw ?? {}) as Partial<AppSettings>;
  return {
    pub: mergePub(o.pub),
    internal: { ...DEFAULT_SETTINGS.internal, ...(o.internal ?? {}) },
  };
};

/* «الجدول/الدالة غير موجودة» ليس خطأً بل حالةٌ متوقّعة قبل تنفيذ
   ترحيل 20260823_wave3: التطبيق يعمل على الافتراضات، وهي القيم القائمة
   نفسها. تسجيلها خطأً أحمر في كل تحميل صفحة يعلّم المطوّر أن يتجاهل
   الطرفية — وهي حيث يظهر الخطأ الحقيقي. */
const isMissingSchema = (e: unknown): boolean => {
  const m = String((e as { message?: string })?.message ?? "");
  const code = String((e as { code?: string })?.code ?? "");
  /* 42P01 جدول غير موجود · PGRST202 دالة غير معروفة لـPostgREST */
  return code === "42P01" || code === "PGRST202" ||
    /does not exist|Could not find the function|schema cache/i.test(m);
};

let warnedMissing = false;
function noteMissing(): void {
  if (warnedMissing) return;
  warnedMissing = true;
  console.info("[settings] جدول الإعدادات غير موجود — تُستعمل القيم الافتراضية. " +
    "نفّذ supabase/migrations/20260823_wave3_media_storage.sql لتفعيل شاشة الإعدادات.");
}

/** الإعدادات كاملةً — للموظفين. */
export async function fetchSettings(): Promise<AppSettings> {
  if (!isSupabaseEnabled || !supabase) return DEFAULT_SETTINGS;
  const { data, error } = await supabase
    .from("app_settings").select("pub,internal").eq("id", "app").maybeSingle();
  if (error) {
    /* غياب الجدول لا يُعطّل الشاشة — تُعرض الافتراضات. */
    if (isMissingSchema(error)) noteMissing();
    else console.error("[settings] تعذّر الجلب:", error);
    return DEFAULT_SETTINGS;
  }
  return merge(data);
}

/** الإعدادات العامة وحدها — يُنادى بلا جلسة من تطبيق المستفيد. */
export async function fetchPublicSettings(): Promise<PublicSettings> {
  if (!isSupabaseEnabled || !supabase) return DEFAULT_SETTINGS.pub;
  const { data, error } = await supabase.rpc("app_settings_public");
  if (error) {
    if (isMissingSchema(error)) noteMissing();
    else console.error("[settings] تعذّر جلب العام:", error);
    return DEFAULT_SETTINGS.pub;
  }
  /* نفس الدمج العميق: هذا المسار هو ما يقرأه تطبيق المستفيد بلا جلسة،
     وكان نشراً سطحياً يُسقط `address` كاملاً لو نقصه حقل. */
  return mergePub(data);
}

/** الحفظ — دمجٌ في القاعدة، فحفظ شاشةٍ لا يمحو حفظ أخرى. */
export async function saveSettings(patch: Partial<AppSettings>): Promise<void> {
  if (!isSupabaseEnabled || !supabase) return;   // وضع التجربة: بلا قاعدة
  const { error } = await supabase.rpc("upsert_app_settings", { doc: patch });
  if (error) throw error;
}

/* ── قراءة واحدة مُخزَّنة ──
   الإعدادات العامة يحتاجها الزرّ العائم وترويسة الفاتورة والتذكرة
   وصفحة الدفع — كلٌّ في مكان. الطلب لكلٍّ منها يعني أربعة طلبات لصفٍّ
   واحد لا يتغيّر أثناء الجلسة. الوعد يُخزَّن فيُشترك فيه الجميع. */
let cached: Promise<PublicSettings> | null = null;

/* ── لقطة متزامنة ──
   الوعد لا يكفي كل المستهلكين: بناء رابط التحقّق يحدث داخل JSX وداخل
   نصّ رسالة واتساب — مواضع لا تنتظر. واللقطة هي آخر قيمة وصلت فعلاً،
   وتبدأ بالافتراضات (وهي القيم العاملة اليوم) فلا تكون فارغة قطّ. */
let snapshot: PublicSettings = DEFAULT_SETTINGS.pub;

/** آخر إعدادات عامّة وصلت — للمواضع المتزامنة. تبدأ بالافتراضات. */
export const currentPublicSettings = (): PublicSettings => snapshot;

export function publicSettings(): Promise<PublicSettings> {
  return (cached ??= fetchPublicSettings()
    .then(v => { snapshot = v; return v; })
    .catch(e => {
      /* الفشل لا يُخزَّن: انقطاع لحظي يجب أن يُعاد بعده لا أن يُثبَّت
         على الافتراضات لبقيّة الجلسة. */
      cached = null;
      console.error("[settings] تعذّر جلب الإعدادات العامة:", e);
      return DEFAULT_SETTINGS.pub;
    }));
}

/** يُبطل المخزون بعد حفظ الإعدادات — وإلا بقيت الشاشات على القيمة القديمة.
    واللقطة تُحدَّث فوراً بالمحفوظ: إبطال المخزون وحده كان يترك الروابط
    المبنيّة متزامناً على النطاق القديم حتى أول قراءة تالية. */
export function invalidatePublicSettings(next?: PublicSettings): void {
  cached = null;
  if (next) snapshot = next;
}
