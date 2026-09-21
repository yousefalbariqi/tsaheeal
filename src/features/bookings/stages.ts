/* خطوة الطلب — للجدول لا للشاشة.

   بُنيت هذه الوحدة حين كانت شاشة الطلب مساراً من أربع خطوات: شريطٌ
   أعلاها ولوحةٌ لكل خطوة وزرٌّ رئيسيٌّ واحد. ثم ثقلت الورقة فرجعت
   الشاشة إلى ثلاثة أزرارٍ في صفٍّ واحد (BookingDetail.tsx): الموظف
   داخل الطلب يسأل «وش أسوي؟» وجوابه زرٌّ مضيءٌ لا اسمُ مرحلة.

   وبقي للخطوة موضعٌ واحد تنفع فيه: **جدول الطلبات**. السؤال هناك آخر
   — «وين تكدّس الشغل؟» — وجوابه شريحةٌ بعددها. ولولاها لعاد الشريط
   يقول «جديد · قيد المراجعة · مقبول»: ثلاثُ شرائح لمعنًى لا يُعرض في
   أي شاشة، وشريحتان لعملٍ واحد.

   والخطوة ليست عموداً في القاعدة: تُشتقّ ممّا هو مكتوبٌ فعلاً — حالة
   الطلب وتحقّق الموظف من معتمريه. ونفسُ الاشتقاق مكتوبٌ في SQL
   (ترحيل 20261004 › booking_stage) ليصفّي الخادم بما تصفّي به الواجهة.

   وحدة نقيّة بلا React ولا نداءات قاعدة. */
import type { Booking, BookingStatus } from "@/types";
import { cancelEffects, rejectEffects, type FlowCtx, type Transition } from "./flow";
import { allVerified } from "./verification";

export type StageKey = "verify" | "seats" | "payment" | "done";

export const STAGES: { key: StageKey; label: string }[] = [
  { key: "verify",  label: "التحقق من البيانات" },
  { key: "seats",   label: "اختيار المقاعد" },
  { key: "payment", label: "بانتظار الدفع" },
  { key: "done",    label: "مؤكد" },
];

export const stageLabel = (k: StageKey): string => STAGES.find(s => s.key === k)?.label ?? "";

/** الطلب المغلق خارج المسار: لا خطوة تالية فيه ولا زرّ رئيسي. */
export const closedAs = (s: BookingStatus): "rejected" | "cancelled" | null =>
  s === "rejected" || s === "cancelled" ? s : null;

/* حالاتٌ تقف كلُّها عند خطوة الدفع: «مقبول» و«بانتظار الدفع» خطوةٌ
   واحدة عند الموظف — إرسال الرابط إجراءٌ داخل الخطوة لا خطوةٌ بذاتها.
   والثلاث الباقية محطّاتٌ متروكة من المسار القديم، تقف هنا ولا تسقط. */
const AT_PAYMENT: BookingStatus[] = ["accepted", "awaiting_payment", "paid", "verifying", "verified"];

/** أين يقف الطلب الآن. */
export function stageOf(b: Booking): StageKey {
  if (b.status === "confirmed") return "done";
  if (AT_PAYMENT.includes(b.status)) return "payment";
  /* ما قبل القبول (جديد · قيد المراجعة · بانتظار تعديل العميل · بلا رحلة):
     التحقق هو الفاصل — تمّ فالمقاعد، لم يتمّ فالتحقق. */
  return allVerified(b.pilgrims ?? []) ? "seats" : "verify";
}

/* ═══ الإجراءات الثانوية ══════════════════════════════════════════
   الرفض والإلغاء يبقيان — لكن داخل قائمة «⋯» لا في صفّ العمل: ليسا
   جواب «وش أسوي الآن؟»، وإبرازُهما بجانب الأزرار الثلاثة يجعل الموظف
   يختار بين خمسة أفعالٍ حيث الفعل واحد. وأثرُهما يُعرض في نافذة السبب
   قبل التنفيذ (ConfirmTransition) — مُحتسَباً من حال الطلب. */
export function closeActions(ctx: FlowCtx): Transition[] {
  const s = ctx.booking.status;
  if (closedAs(s)) return [];
  const out: Transition[] = [];
  /* الرفض جوابٌ على طلبٍ لم يُقبل بعد؛ والمؤكد لا يُرفض بل يُلغى. */
  if (s !== "confirmed") {
    out.push({
      to: "rejected", label: "رفض الطلب", tone: "risk", secondary: true,
      blockers: [], reason: "reject", effects: rejectEffects(ctx),
    });
  }
  out.push({
    to: "cancelled", label: s === "confirmed" ? "إلغاء الطلب المؤكد" : "إلغاء الطلب",
    tone: "risk", secondary: true,
    blockers: [], reason: "cancel", effects: cancelEffects(ctx),
  });
  return out;
}
