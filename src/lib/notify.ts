/* طبقة رقيقة فوق sonner — يستدعيها المخزن، فلا يستورد مكوّنات واجهة.

   سببها: syncDiff في useStore يعمل خارج شجرة React ولا يملك hooks، وكان
   يبتلع كل فشل في console.error — فالموظف يرى «تم الحفظ» على عملية رفضتها
   قاعدة البيانات، ثم يختفي تعديله عند إعادة التحميل. */
import { toast } from "sonner";

/** يترجم خطأ Supabase إلى جملة يفهمها الموظف بلا مصطلحات. */
export function syncErrorMessage(e: unknown): string {
  const m = String((e as { message?: string })?.message ?? e ?? "");
  if (/forbidden/i.test(m))                       return "لا تملك صلاحية هذا التعديل — راجع مدير النظام.";
  if (/JWT|not authenticated|invalid claim/i.test(m)) return "انتهت جلستك — سجّل الدخول من جديد.";
  if (/Failed to fetch|NetworkError|network/i.test(m)) return "تعذّر الوصول للخادم — تحقّق من الاتصال.";
  if (/duplicate key|already exists/i.test(m))    return "يوجد سجل بنفس المعرّف.";
  if (/violates .* constraint/i.test(m))          return "البيانات لا تحقّق شرطاً في قاعدة البيانات.";
  return m || "خطأ غير معروف.";
}

/** فشل حفظ — يُبلَّغ ويُذكر صراحةً أن التعديل رُجِع. */
export function notifySyncError(label: string, e: unknown): void {
  console.error(`[sync] فشل حفظ ${label}:`, e);
  toast.error(`تعذّر حفظ ${label}`, {
    description: `${syncErrorMessage(e)} أُرجع التعديل كما كان.`,
    duration: 9000,
  });
}

/** جلب ناقص لا فاشل — وصل بعض الكيانات وتعذّر بعضها. تُسمّى الناقصة
    صراحةً: الموظف الذي لا يعرف أن «الحجوزات» لم تصل يقرأ شاشةً فارغة
    كأنها «لا حجوزات»، فيتّخذ قراراً على بياناتٍ غائبة. */
export function notifyPartialLoad(missing: string[], e: unknown): void {
  console.error("[hydrate] جلب جزئي — تعذّر:", missing, e);
  toast.warning("بعض البيانات لم تصل", {
    description: `تعذّر جلب: ${missing.join("، ")}. ${syncErrorMessage(e)}`,
    duration: 12000,
  });
}

/** فشل جلب البيانات عند فتح اللوحة. */
export function notifyLoadError(e: unknown): void {
  console.error("[hydrate] فشل جلب البيانات:", e);
  toast.error("تعذّر جلب البيانات", { description: syncErrorMessage(e), duration: 9000 });
}
