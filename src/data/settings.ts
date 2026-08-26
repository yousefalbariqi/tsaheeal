/* إعدادات النظام — القيم التي كانت ثوابت في الشفرة.

   قبلها: رقم واتساب الدعم في WhatsAppFab.SUPPORT_PHONE، وبريد الدعم
   نصّاً في شاشة الدعم، و«السجل التجاري: 1010537391» مكتوباً أربع مرّات
   (الفاتورة، التذكرة، صفحة الدفع، إشعار الإلغاء)، ووعد الردّ وساعات
   العمل في sla.ts. تغيير رقم الدعم = تعديل أربعة ملفّات وإعادة نشر.

   الافتراضات هنا هي القيم القائمة نفسها: من لم ينفّذ الترحيل بعد يرى
   السلوك السابق حرفياً، ولا شاشة تنكسر لغياب صفٍّ في القاعدة. */
import { supabase, isSupabaseEnabled } from "@/supabase/client";

/** ما يقرأه الزائر المجهول — تطبيق المستفيد يحتاجه قبل أي دخول. */
export interface PublicSettings {
  orgName: string;
  /** السجل التجاري — يظهر في الفاتورة والتذكرة وصفحة الدفع. */
  crNumber: string;
  domain: string;
  /** رقم واتساب خدمة العملاء — الزرّ العائم في كل شاشات المستفيد. */
  supportPhone: string;
  /** نافذة العمل بالساعات (توقيت الرياض) — عليها يُحسب وعد الردّ. */
  openHour: number;
  closeHour: number;
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
    domain: "tasaaheel.sa",
    supportPhone: "0501234567",
    openHour: 6,
    closeHour: 22,
    slaHours: 2,
  },
  internal: {
    supportEmail: "support@tasahheel.com",
    paymentDeadlineHours: 24,
    maxPilgrimsPerBooking: 10,
    departureAlertHours: 24,
  },
};

/** يدمج المقروء فوق الافتراضات — حقلٌ أُضيف بعد آخر حفظ يأتي بقيمته. */
const merge = (raw: unknown): AppSettings => {
  const o = (raw ?? {}) as Partial<AppSettings>;
  return {
    pub: { ...DEFAULT_SETTINGS.pub, ...(o.pub ?? {}) },
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
  return { ...DEFAULT_SETTINGS.pub, ...((data ?? {}) as Partial<PublicSettings>) };
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

export function publicSettings(): Promise<PublicSettings> {
  return (cached ??= fetchPublicSettings().catch(e => {
    /* الفشل لا يُخزَّن: انقطاع لحظي يجب أن يُعاد بعده لا أن يُثبَّت
       على الافتراضات لبقيّة الجلسة. */
    cached = null;
    console.error("[settings] تعذّر جلب الإعدادات العامة:", e);
    return DEFAULT_SETTINGS.pub;
  }));
}

/** يُبطل المخزون بعد حفظ الإعدادات — وإلا بقيت الشاشات على القيمة القديمة. */
export const invalidatePublicSettings = () => { cached = null; };
