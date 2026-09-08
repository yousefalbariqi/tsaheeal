/* مسار الطلب — الانتقالات وشروطها وآثارها في موضعٍ واحد.

   سبع ملاحظاتٍ من الفريق جذرها أن هذا المنطق لم يكن له موضع: كان
   `switch(booking.status)` داخل شاشة التفاصيل يبني أزراراً، والشروط
   مبثوثةٌ في `disabled` و`gated`، والآثار غير مكتوبةٍ في أي مكان — فلا
   أحد يستطيع الإجابة عن «ماذا يحدث للمقعد والفاتورة والتذكرة لو ألغيت؟»
   قبل أن يُلغي فعلاً.

   وملاحظة «الطلب الأول حالته مقبول لكنه ليس بانتظار الدفع» صحيحةٌ ولا
   خطأ في الحالة نفسها: «مقبول» مرحلةٌ حقيقية قبل إرسال رابط الدفع.
   الخطأ أن الشاشة لا تقول ما ينتظره الطلب — فصار لكل حالةٍ نصٌّ يقوله.

   وحدة نقيّة بلا React ولا نداءات قاعدة: تُقرأ من شاشة التفاصيل، ومن
   الجدول، ومن نافذة التأكيد، وستُقرأ من دوالّ القاعدة في الموجة الأولى
   حين تصير الانتقالات مفروضةً لا موصوفة. */
import type { Booking, BookingStatus, Pkg, Trip } from "@/types";
import { sar } from "@/lib/money";
import { isSaudiMobile } from "@/lib/phone";
import { statusLabel } from "@/lib/status";

export type Tone = "primary" | "ok" | "warn" | "risk" | "neutral";

/* ═══ ما ينتظره الطلب ══════════════════════════════════════════════
   الحالة تقول ما وصل إليه الطلب، وهذا يقول ما ينتظره — وهو ما كان
   ناقصاً. تُعرض تحت الشارة مباشرةً في رأس الطلب. */
const WAITING: Partial<Record<BookingStatus, string>> = {
  new:              "وصل من التطبيق ولم يُراجَع بعد",
  reviewing:        "بانتظار تحقّق الموظف من بيانات المعتمرين",
  needs_edit:       "بانتظار تعديل العميل لبياناته",
  accepted:         "بانتظار إرسال رابط الدفع أو تحصيل المبلغ كاشاً",
  awaiting_payment: "أُرسل رابط الدفع — بانتظار سداد العميل",
  awaiting_trip:    "بانتظار تحديد رحلة",
  paid:             "وصل المبلغ — بانتظار تحقّق الموظف ثم التأكيد",
  verifying:        "بانتظار تحقّق الموظف",
  verified:         "بانتظار التأكيد النهائي",
  confirmed:        "مكتمل — صدرت الفاتورة والتذكرة",
  rejected:         "مرفوض — المقاعد محرَّرة",
  cancelled:        "ملغى — المقاعد محرَّرة",
};

/** سطرٌ واحد يقول ما ينتظره الطلب الآن. */
export const waitingFor = (s: BookingStatus): string => WAITING[s] ?? statusLabel(s, "booking");

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
  /** تحقّق الموظف من كل المعتمرين في هذه الجلسة. */
  allVerified?: boolean;
  /** فعّل «تم استلام الدفع فعلياً» في لوحة الإجراءات. */
  payReceived?: boolean;
  /** فاتورةٌ موجودة فعلاً في القاعدة لهذا الطلب. */
  hasInvoice?: boolean;
  /** تذكرةٌ صادرة فعلاً. */
  hasTicket?: boolean;
  /** مربوطٌ بملف مستفيد. */
  beneficiaryLinked?: boolean;
  /** تاريخ اليوم YYYY-MM-DD بالتوقيت المحلي. */
  today?: string;
}

/** كل ما ينقص هذا الطلب — تُعرض شريطاً أعلى الصفحة.

    الملاحظة تطلب تحذيراً «إن لم توجد بيانات المستفيد، الهوية، الغرفة،
    الدفع أو المقاعد» — وهذه هي الخمسة بأسمائها، ومعها ما ظهر أثناء
    القراءة: جوّالٌ لا يصلح لواتساب، ومعتمرون أقلّ من العدد المدفوع عنه. */
export function bookingGaps(ctx: FlowCtx): Gap[] {
  const b = ctx.booking;
  const gaps: Gap[] = [];
  const persons = Math.max(1, b.persons || 1);
  const pilgrims = b.pilgrims ?? [];

  if (pilgrims.length < persons) {
    gaps.push({ key: "pilgrims", label: `بيانات المعتمرين ناقصة (${pilgrims.length} من ${persons})`, blocking: true });
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

/** التذكرة لا تُصدر قبل استيفاء الدفع والبيانات — نصّ الملاحظة حرفياً. */
export function ticketBlockers(ctx: FlowCtx): string[] {
  const out: string[] = [];
  if (ctx.booking.paymentStatus !== "verified") out.push("الدفع غير متحقَّق");
  const gaps = blockingGaps(ctx);
  if (gaps.length) out.push(`بيانات ناقصة: ${gaps.map(g => g.label).join(" · ")}`);
  return out;
}

export const canIssueTicket = (ctx: FlowCtx): boolean => ticketBlockers(ctx).length === 0;

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
  /** يفتح كروكي المقاعد بدل التنفيذ المباشر. */
  opensSeatMap?: boolean;
  /** يحتاج نافذة سبب: الرفض سببٌ داخلي ورسالة، والإلغاء سببٌ واحد. */
  reason?: "reject" | "cancel";
  patch?: Partial<Booking>;
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

/** الانتقالات المتاحة من الحالة الحالية، بشروطها وآثارها. */
export function transitionsFor(ctx: FlowCtx): Transition[] {
  const b = ctx.booking;
  const hours = payDeadlineHours(ctx);
  const gaps = blockingGaps(ctx);
  const gapText = gaps.length ? `بيانات ناقصة: ${gaps.map(g => g.label).join(" · ")}` : null;

  switch (b.status) {
    case "new":
    case "reviewing": {
      const acceptBlockers: string[] = [];
      if (ctx.allVerified === false) acceptBlockers.push("لم يُتحقّق من جميع المعتمرين");
      /* المقاعد تُختار في الكروكي نفسه، فغيابها ليس مانعاً هنا. */
      gaps.filter(g => g.key !== "seats").forEach(g => acceptBlockers.push(g.label));
      return [
        {
          to: "accepted", label: "قبول الطلب واختيار المقاعد", tone: "ok",
          blockers: acceptBlockers, opensSeatMap: true,
          effects: [
            "تُقفل المقاعد المختارة باسم العميل في نفس اللحظة",
            "الطلب لا يصير مؤكداً — الدفع ما زال مطلوباً",
          ],
        },
        {
          to: "rejected", label: "رفض الطلب", tone: "risk",
          blockers: [], reason: "reject", effects: rejectEffects(ctx),
        },
        {
          to: "cancelled", label: "إلغاء الطلب", tone: "neutral",
          blockers: [], reason: "cancel", effects: cancelEffects(ctx),
        },
      ];
    }

    case "accepted":
      return [
        {
          to: "awaiting_payment", label: "إرسال رابط الدفع", tone: "primary",
          blockers: gapText ? [gapText] : [],
          effects: [
            `يُفتح رابط دفعٍ صالح ${hours} ساعة بمبلغ ${sar(b.total)}`,
            "تبقى المقاعد مقفلة باسم العميل حتى انتهاء المهلة",
          ],
        },
        {
          to: "paid", label: "تم الدفع كاش في الفرع", tone: "ok",
          blockers: gapText ? [gapText] : [],
          patch: { paymentStatus: "verified", payMethod: "كاش في الفرع" },
          effects: [
            `يُسجَّل استلام ${sar(b.total)} كاشاً باسمك وبتاريخ اليوم`,
            "لا رابط دفع — المبلغ في اليد",
            "لا تُصدر التذكرة إلا بعد التأكيد النهائي",
          ],
        },
      ];

    case "awaiting_payment":
      return [
        {
          to: "paid", label: "تأكيد الدفع يدوياً", tone: "ok",
          blockers: ctx.payReceived === false ? ["فعّل «تم استلام الدفع فعلياً» أولاً"] : [],
          patch: { paymentStatus: "verified" },
          effects: [
            `يُسجَّل ${sar(b.total)} محصَّلاً بالطريقة والتاريخ`,
            "يُوقف رابط الدفع المُرسَل",
          ],
        },
        {
          to: "cancelled", label: "إلغاء الطلب", tone: "neutral",
          blockers: [], reason: "cancel", effects: cancelEffects(ctx),
        },
      ];

    case "paid":
      return [
        {
          to: "confirmed", label: "تحقّق وتأكيد", tone: "ok",
          /* هذا هو موضع منع التذكرة: حارس القاعدة يُصدر الفاتورة والتذكرة
             لحظةَ صيرورة الطلب «مؤكداً» — فالبوابة هنا لا عند زرّ التذكرة. */
          blockers: ticketBlockers(ctx),
          effects: [
            "تُصدر الفاتورة والتذكرة تلقائياً",
            "يصير الطلب نهائياً ويظهر للعميل في تطبيقه",
          ],
        },
        {
          to: "cancelled", label: "إلغاء الطلب", tone: "neutral",
          blockers: [], reason: "cancel", effects: cancelEffects(ctx),
        },
      ];

    case "confirmed":
      return [
        {
          to: "cancelled", label: "إلغاء الطلب المؤكد", tone: "risk",
          blockers: [], reason: "cancel", effects: cancelEffects(ctx),
        },
      ];

    default:
      return [];
  }
}
