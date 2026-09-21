/* حال الطلب — ما ينقصه، وما يتأخّر منه، وأثر إغلاقه.

   سبع ملاحظاتٍ من الفريق جذرها أن هذا المنطق لم يكن له موضع: كان
   `switch(booking.status)` داخل شاشة التفاصيل يبني أزراراً، والشروط
   مبثوثةٌ في `disabled` و`gated`، والآثار غير مكتوبةٍ في أي مكان — فلا
   أحد يستطيع الإجابة عن «ماذا يحدث للمقعد والفاتورة والتذكرة لو ألغيت؟»
   قبل أن يُلغي فعلاً.

   وكان هنا أيضاً جدولُ الانتقالات بين اثنتي عشرة حالة، وجدولٌ يشرح لكل
   حالةٍ ما تنتظره. سقط الاثنان حين صار المسار أربع خطواتٍ يقودها النظام
   (stages.ts): الخطوة تقول ما يُفعل الآن، فلا حاجة لشرح معنى «مقبول».
   وبقي هنا ما هو وصفٌ لحال الطلب لا لواجهته:

     • النواقص (bookingGaps) — وهي موانع الزرّ في كل خطوة.
     • التأخّر (isStale · staleDays) — طلبٌ مضت رحلته وما زال مفتوحاً.
     • أثر الرفض والإلغاء — يُعرض في نافذة السبب قبل الضغطة لا بعدها.

   وحدة نقيّة بلا React ولا نداءات قاعدة: تقرؤها شاشة الطلب وجدول
   الطلبات ووحدة الخطوات. */
import type { Booking, BookingStatus, Pkg, Trip } from "@/types";
import { needsRecheck } from "./verification";
import { sar } from "@/lib/money";
import { isSaudiMobile } from "@/lib/phone";

export type Tone = "primary" | "ok" | "warn" | "risk" | "neutral";

/* ═══ البيانات الناقصة ════════════════════════════════════════════ */

export interface Gap {
  key: string;
  label: string;
  /** يمنع القبول والتأكيد — لا مجرّد تنبيه. */
  blocking: boolean;
}

export interface FlowCtx {
  booking: Booking;
  trip?: Trip;
  pkg?: Pkg;
  /* تحقّق الموظف لم يعد يُمرَّر من الشاشة: صار محفوظاً على المعتمر
     نفسه فيُقرأ من `booking.pilgrims` — لا حالةَ جلسةٍ تُنسى بالتحديث. */
  /** فاتورةٌ موجودة فعلاً في القاعدة لهذا الطلب. */
  hasInvoice?: boolean;
  /** تذكرةٌ صادرة فعلاً. */
  hasTicket?: boolean;
  /** مربوطٌ بملف مستفيد. */
  beneficiaryLinked?: boolean;
  /** تاريخ اليوم YYYY-MM-DD بالتوقيت المحلي. */
  today?: string;
}

/** كل ما ينقص هذا الطلب — موانعُ زرّ الخطوة الحالية، تُكتب تحته بنصّها.

    الملاحظة تطلب تحذيراً «إن لم توجد بيانات المستفيد، الهوية، الغرفة،
    الدفع أو المقاعد» — وهذه هي الخمسة بأسمائها، ومعها ما ظهر أثناء
    القراءة: جوّالٌ لا يصلح لواتساب، ومعتمرون أقلّ من العدد المدفوع عنه. */
export function bookingGaps(ctx: FlowCtx): Gap[] {
  const b = ctx.booking;
  const gaps: Gap[] = [];
  const persons = Math.max(1, b.persons || 1);
  const pilgrims = b.pilgrims ?? [];

  /* بيانات الحجز تُطلب لصاحب الطلب فقط. عدد الأشخاص يحدد المقاعد
     والتسعير، لا عدد نماذج الهويات التي يجب تعبئتها. */
  if (pilgrims.length === 0) {
    gaps.push({ key: "pilgrims", label: "بيانات صاحب الطلب ناقصة", blocking: true });
  }
  const noId = pilgrims.filter(p => !(p.idNumber ?? "").trim()).length;
  if (noId > 0) {
    gaps.push({ key: "ids", label: `رقم الهوية أو الجواز ناقص (${noId} معتمر)`, blocking: true });
  }
  const noName = pilgrims.filter(p => !(p.name ?? "").trim()).length;
  if (noName > 0) gaps.push({ key: "names", label: `اسم المعتمر ناقص (${noName})`, blocking: true });

  if (!(b.roomType ?? "").trim() && !(b.rooms ?? []).length) {
    gaps.push({ key: "room", label: "نوع السكن غير محدَّد", blocking: true });
  }

  /* المقاعد تُخصَّص عند القبول، فغيابها قبله ليس نقصاً بل ترتيب. */
  const afterAccept = !["new", "reviewing", "needs_edit", "rejected", "cancelled"].includes(b.status);
  if (afterAccept && (b.seats ?? []).length !== persons) {
    gaps.push({ key: "seats", label: `المقاعد غير مخصَّصة (${(b.seats ?? []).length} من ${persons})`, blocking: true });
  }

  if (["paid", "confirmed", "verified"].includes(b.status) && b.paymentStatus !== "verified") {
    gaps.push({ key: "pay", label: "الدفع غير موثَّق — لا طريقة ولا تاريخ متحقَّق", blocking: true });
  }

  /* «بانتظار التحقق» ليس نقصاً في كل طلب: طلبٌ جديد كلُّ معتمريه كذلك،
     وهو ترتيبٌ لا خلل — وخطوةُ التحقق نفسها هي التي تُزيله. والنقص أن
     يُعدَّل معتمرٌ بعد تحقّقٍ تمّ: يُوسَم هنا ليُقرأ، ولا يُعيد الطلب
     خطوةً إلى الوراء (stages.ts تستثنيه من موانع الأزرار). */
  const recheck = needsRecheck(pilgrims).length;
  if (recheck > 0) {
    gaps.push({ key: "verify", label: `${recheck} معتمر يحتاج تحقّقاً جديداً بعد تعديل بياناته`, blocking: true });
  }

  if (!isSaudiMobile(b.clientPhone)) {
    gaps.push({ key: "phone", label: "جوّال العميل غير صحيح — لا تصل رسائل واتساب", blocking: false });
  }
  if (ctx.beneficiaryLinked === false) {
    gaps.push({ key: "beneficiary", label: "لم يُربط الطلب بملف مستفيد", blocking: false });
  }
  if (!b.tripId) gaps.push({ key: "trip", label: "الطلب بلا رحلة", blocking: true });

  return gaps;
}

export const blockingGaps = (ctx: FlowCtx): Gap[] => bookingGaps(ctx).filter(g => g.blocking);

/* لا حارسَ هنا لإصدار التذكرة: الفاتورة والتذكرة تصدران من القاعدة
   لحظةَ صيرورة الطلب مؤكداً (حارس trg_booking_confirm_docs)، والتأكيد
   لا يقع إلا بعد قفل المقاعد وتسجيل المبلغ — فالبوابة في صفّ العمل
   نفسه لا في دالّةٍ تُسأل بعده. */

/* ═══ الطلب المتأخّر ══════════════════════════════════════════════
   ما رآه الفريق: طلبٌ بتاريخ رحلة ٣٠ يوليو ما زال «قيد المراجعة» في
   سبتمبر. لا يُغلق من تلقاء نفسه — يُوسَم فيراه الموظف ويقرّر. */
const OPEN_STATUSES: BookingStatus[] = ["new", "reviewing", "needs_edit", "accepted", "awaiting_payment"];

export function isStale(b: Booking, trip: Trip | undefined, today: string): boolean {
  if (!OPEN_STATUSES.includes(b.status)) return false;
  const dep = trip?.departureDate;
  return !!dep && dep < today;
}

/** «انتهت رحلته قبل ٦٨ يوماً» — رقمٌ يقول حجم الإهمال لا مجرّد وسم. */
export function staleDays(trip: Trip | undefined, today: string): number {
  const dep = trip?.departureDate;
  if (!dep) return 0;
  const a = Date.parse(`${dep}T00:00:00`);
  const b = Date.parse(`${today}T00:00:00`);
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return 0;
  return Math.round((b - a) / 86400000);
}

/* ═══ الانتقالات ══════════════════════════════════════════════════ */

export interface Transition {
  to: BookingStatus;
  label: string;
  tone: Tone;
  /** شروطٌ غير مستوفاة تمنع الزرّ. فارغةٌ تعني جاهز. */
  blockers: string[];
  /** ما سيحدث فعلاً — يُعرض في نافذة التأكيد قبل الضغط لا بعده. */
  effects: string[];
  /** يحتاج نافذة سبب: الرفض سببٌ داخلي ورسالة، والإلغاء سببٌ واحد. */
  reason?: "reject" | "cancel";
  /** إجراءٌ لا يُبرَز: موضعه قائمة «⋯» لا بجانب زرّ الخطوة. */
  secondary?: boolean;
}

/** مهلة رابط الدفع بالساعات — من إعدادات الرحلة ثم الباقة ثم الافتراضي. */
export const payDeadlineHours = (ctx: FlowCtx): number =>
  ctx.trip?.settings?.paymentDeadlineHours ?? ctx.pkg?.settings?.paymentDeadlineHours ?? 24;

/** أثر الإلغاء — مشتقٌّ من حال الطلب لا نصّاً ثابتاً.

    نصّ الملاحظة: «يجب أن يعرض أثر الإلغاء على المقعد والفاتورة والدفع
    والتذكرة قبل التأكيد». وأربعتها ليست دائماً موجودة: طلبٌ في المراجعة
    بلا فاتورة ولا تذكرة، فذكرُهما يُربك ولا يُفيد. */
export function cancelEffects(ctx: FlowCtx): string[] {
  const b = ctx.booking;
  const out: string[] = [];
  const seats = (b.seats ?? []).length;
  out.push(seats > 0
    ? `تُحرَّر ${seats === 1 ? "المقعد المخصَّص" : `الـ${seats} مقاعد المخصَّصة`} وتعود للبيع فوراً`
    : "لا مقاعد مخصَّصة — لا شيء يُحرَّر");
  if (ctx.hasInvoice) out.push("تبقى الفاتورة في السجل موسومةً بالإلغاء — الفواتير لا تُحذف");
  if (ctx.hasTicket) out.push("تُبطَل التذكرة الصادرة ولا تصلح للسفر");
  if (b.paymentStatus === "verified") {
    out.push(`المبلغ المستلَم ${sar(b.total)} يحتاج استرداداً يدوياً — النظام لا يردّ مالاً`);
  } else if (b.paymentStatus === "sent") {
    out.push("يتوقّف رابط الدفع المُرسَل عن العمل");
  }
  out.push("يُسجَّل الإلغاء في سجل الطلب باسمك ووقته وسببه");
  return out;
}

export function rejectEffects(ctx: FlowCtx): string[] {
  const seats = (ctx.booking.seats ?? []).length;
  return [
    seats > 0 ? `تُحرَّر ${seats} من المقاعد المحجوزة مؤقتاً` : "لا مقاعد محجوزة — لا شيء يُحرَّر",
    "يُحفظ السبب الداخلي في سجل الطلب ولا يراه العميل",
    "تُرسل رسالة العميل التي تكتبها أنت — لا نصّ آليّ",
    "لا يمكن التراجع: الطلب المرفوض لا يُعاد فتحه",
  ];
}
