/* تحقّق الموظف من بيانات المعتمر — مرّةً واحدة لا مرّةً في كل مرحلة.

   كانت حالة التحقق `useState` في شاشة التفاصيل: مصفوفةٌ تُبنى كلها
   «بانتظار التحقق» عند كل فتحٍ للصفحة. فالموظف الذي راجع خمسة معتمرين
   صباحاً وقبل الطلب، يعود بعد الظهر ليرسل رابط الدفع فيجد الخمسة
   بانتظار التحقق من جديد — والشاشة تسأله سؤالاً أجابه فعلاً. ولم تكن
   الإجابة تُكتب في أي مكان: لا قاعدة تعرف من تحقّق ولا متى.

   التحقق صفةُ المعتمر لا صفةُ الجلسة، فمكانه صفُّ المعتمر في القاعدة:
   من تحقّق ومتى. والانتقال بين مراحل الطلب (مقبول ← بانتظار الدفع ←
   مدفوع ← مؤكد) لا يمسّه، لأنه ليس فيه.

   ويسقط التحقق في حالةٍ واحدة: أن تتغيّر البيانات التي تحقّق منها
   الموظف. وحينها لا يعود المعتمر «بانتظار التحقق» كأن شيئاً لم يكن —
   بل «عُدِّلت بعد التحقق»: حالةٌ تقول للموظف إن النظام يطلب منه مراجعةً
   ثانية لسببٍ يعرفه، لا إنه نسي المراجعة الأولى.

   وحدة نقيّة بلا React ولا نداءات قاعدة: تقرؤها شاشة التفاصيل وجدول
   المسار (flow.ts). */
import type { Pilgrim } from "@/types";

export type VerifyState = "pending" | "verified" | "error" | "stale";

/** الحقول التي يُبطل تعديلها التحقق — هويّة المعتمر لا مقعده.

    المقعد يتغيّر في الكروكي بعد التحقق بكثير، وليس مما يراجعه الموظف
    في بطاقة المعتمر، فلا معنى لأن يُسقط تحقّقاً من رقم هوية. */
const IDENTITY: (keyof Pilgrim)[] = ["name", "docType", "idNumber", "nationality", "gender", "ageGroup", "birthDate", "phone"];

const norm = (v: unknown): string => String(v ?? "").trim();

/** هل البيانات المعروضة الآن هي نفسها التي تحقّق منها الموظف؟ */
export const sameIdentity = (a: Pilgrim, b: Pilgrim): boolean =>
  IDENTITY.every(k => norm(a?.[k]) === norm(b?.[k]));

export const verifyState = (p: Pilgrim): VerifyState => p?.verify ?? "pending";
export const isVerified = (p: Pilgrim): boolean => p?.verify === "verified";

export const VERIFY_LABEL: Record<VerifyState, string> = {
  pending:  "بانتظار التحقق",
  verified: "تم التحقق",
  error:    "يوجد خطأ",
  stale:    "عُدِّلت بعد التحقق",
};

/** ✓ تم التحقق — باسم الموظف ووقته، فالسجل يعرف من أجاب. */
export const markVerified = (p: Pilgrim, by: string, at: string = new Date().toISOString()): Pilgrim =>
  ({ ...p, verify: "verified", verifiedAt: at, verifiedBy: (by ?? "").trim() || undefined });

/** خطأٌ في البيانات — يمنع القبول كما يمنعه غياب التحقق. */
export const markError = (p: Pilgrim): Pilgrim =>
  ({ ...p, verify: "error", verifiedAt: undefined, verifiedBy: undefined });

/** حفظ تعديلٍ على معتمر — هنا وحده يسقط التحقق.

    ولا يسقط بحفظٍ لم يغيّر شيئاً: موظفٌ يفتح البطاقة ويغلقها لا يُبطل
    مراجعةً تمّت. واسم المتحقّق وتاريخه يبقيان مع «عُدِّلت بعد التحقق»
    ليقرأ الموظف التالي أن فلاناً تحقّق يوم كذا ثم تغيّرت البيانات. */
export function afterEdit(prev: Pilgrim, next: Pilgrim): Pilgrim {
  const keep = { verify: prev.verify, verifiedAt: prev.verifiedAt, verifiedBy: prev.verifiedBy };
  if (sameIdentity(prev, next)) return { ...next, ...keep };
  const was = verifyState(prev);
  if (was === "verified" || was === "stale") {
    return { ...next, verify: "stale", verifiedAt: prev.verifiedAt, verifiedBy: prev.verifiedBy };
  }
  /* «يوجد خطأ» وصفٌ للبيانات القديمة: تعديلها يمحو الوصف ولا يُثبته. */
  return { ...next, verify: undefined, verifiedAt: undefined, verifiedBy: undefined };
}

/** تطبيق قائمةٍ معدَّلة على القديمة — الترتيب هو الهويّة (عمود sort). */
export const afterEdits = (prev: Pilgrim[], next: Pilgrim[]): Pilgrim[] =>
  next.map((p, i) => (prev[i] ? afterEdit(prev[i], p) : p));

export const verifiedCount = (ps: Pilgrim[]): number => (ps ?? []).filter(isVerified).length;

/** طلبٌ بلا معتمرين ليس متحقَّقاً منه — لا شيء رُوجع. */
export const allVerified = (ps: Pilgrim[]): boolean => (ps ?? []).length > 0 && (ps ?? []).every(isVerified);

/** من يطلب النظام إعادة التحقق منه: عُدِّلت بياناته بعد التحقق، أو وُسم بخطأ.

    هؤلاء وحدهم يمنعون المراحل التالية. ومن لم يُتحقّق منه أصلاً في طلبٍ
    مقبولٍ سابقاً (بياناتٌ قديمة قبل حفظ التحقق) لا يُعطَّل به طلبٌ ماضٍ. */
export const needsRecheck = (ps: Pilgrim[]): Pilgrim[] =>
  (ps ?? []).filter(p => { const s = verifyState(p); return s === "stale" || s === "error"; });
