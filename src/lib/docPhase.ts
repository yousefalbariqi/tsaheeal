/* طور المستند — الحالة المخزَّنة والمشتقّة في تعبيرٍ واحد.

   لماذا يوجد هذا الملفّ مع أن القاعدة تحسب الطور نفسه (ticket_phase و
   invoice_phase في ترحيل 20260909)؟ لأن الشاشة تعرض صفوفاً جُلبت قبل
   دقيقة، ولا تُعيد نداء القاعدة لكل خليّة حالة. فالمنطق مكتوبٌ مرّتين
   عمداً — وهذا دَينٌ معلومٌ لا سهو.

   وشرطُ صحّته أن يبقى الاثنان متطابقين: أي تعديل هنا يقابله تعديل هناك
   وبالعكس. الترتيب في الدالّتين أدناه هو ترتيب `case` في SQL حرفاً
   بحرف — والترتيب جزءٌ من المعنى لا تجميل: «ملغاة» تسبق «منتهية» لأن
   تذكرةً أُلغيت ثم انقضت رحلتها تُقرأ ملغاة، والعكس يخفي سبب الإلغاء.

   ── الضريبة ──
   أسعار تساهيل شاملة الضريبة (قرار ٢٠٢٦-٠٩-٠٦). فـ`vatOf` تستخرج ما
   بداخل المبلغ ولا تضيف فوقه: الإجمالي ١١٥٪ من الصافي، والضريبة
   منه = الإجمالي × ١٥ ÷ ١١٥. من يضربه في ٠٫١٥ يُخرج رقماً أكبر من
   الحقيقة ويجعل مجموع البنود يتجاوز المطبوع أسفل الفاتورة. */
import type { Payment, TicketEntry, InvoicePhase, TicketPhase } from "@/types";

/** اليوم بتوقيت الرياض بصيغة YYYY-MM-DD — نفس ما تقارنه القاعدة. */
function todayRiyadh(): string {
  const now = new Date(Date.now() + 3 * 3_600_000);
  return now.toISOString().slice(0, 10);
}

const isPastDate = (d: string | undefined): boolean =>
  !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d < todayRiyadh();

/** طور التذكرة — يطابق public.ticket_phase. */
export function ticketPhase(t: Pick<TicketEntry, "state" | "tripDate">): TicketPhase {
  if (t.state === "cancelled") return "cancelled";
  if (t.state === "used") return "used";
  if (isPastDate(t.tripDate)) return "expired";
  return "valid";
}

/** طور الفاتورة — يطابق public.invoice_phase. */
export function invoicePhase(p: Pick<Payment, "state" | "payStatus" | "tripDate" | "dueAt">): InvoicePhase {
  if (p.state === "cancelled") return "cancelled";
  if (p.state === "refunded") return "refunded";
  if (p.payStatus === "verified") return "paid";
  if (isPastDate(p.tripDate)) return "expired";
  if (p.dueAt && Date.parse(p.dueAt) < Date.now()) return "overdue";
  return p.payStatus;
}

/** هل رابط الدفع ما زال يُفتح؟ فاتورةٌ منتهية أو ملغاة تُغلق رابطها. */
export const payLinkOpen = (p: Payment): boolean => {
  const ph = invoicePhase(p);
  return ph === "none" || ph === "sent" || ph === "failed";
};

/* ── الصياغة والألوان ──
   نفس معجم الحالات المستعمل في اللوحة (lib/status)، لكن هذه أطوارٌ لا
   حالات خام فلها نصوصها. */
export const INVOICE_PHASE_LABEL: Record<InvoicePhase, string> = {
  paid: "مدفوعة", none: "لم تُدفع", sent: "رابط أُرسل", failed: "فشل الدفع",
  overdue: "انتهى الاستحقاق", expired: "منتهية", cancelled: "ملغاة", refunded: "مُستردّة",
};

export const TICKET_PHASE_LABEL: Record<TicketPhase, string> = {
  valid: "صالحة", used: "مستخدمة", cancelled: "ملغاة", expired: "منتهية",
};

type Tone = { bg: string; fg: string };
const G = {
  green: { bg: "#E3F3E8", fg: "#1E7A44" },
  grey:  { bg: "#EEECEA", fg: "#5C554E" },
  amber: { bg: "#FBF3D6", fg: "#8A6A08" },
  red:   { bg: "#FBE6E6", fg: "#BE2626" },
  violet:{ bg: "#F1E9FA", fg: "#7226BE" },
  cyan:  { bg: "#E0F2FB", fg: "#0E7CA8" },
} as const;

export const INVOICE_PHASE_TONE: Record<InvoicePhase, Tone> = {
  paid: G.green, none: G.grey, sent: G.violet, failed: G.red,
  overdue: G.amber, expired: G.grey, cancelled: G.grey, refunded: G.cyan,
};

export const TICKET_PHASE_TONE: Record<TicketPhase, Tone> = {
  valid: G.green, used: G.cyan, cancelled: G.red, expired: G.grey,
};

/* ── الضريبة المتضمَّنة ── */
export const VAT_RATE = 0.15;

/** الضريبة **داخل** المبلغ لا فوقه. */
export const vatOf = (grossTotal: number): number =>
  Math.round((grossTotal * VAT_RATE / (1 + VAT_RATE)) * 100) / 100;

/** الصافي قبل الضريبة. */
export const netOf = (grossTotal: number): number =>
  Math.round((grossTotal - vatOf(grossTotal)) * 100) / 100;

/** اسم ملفٍّ واضح للتنزيل — «فاتورة رقم» لا «document(3).pdf».
    المحارف الممنوعة في أسماء الملفات تُستبدل، والعربية تبقى: أنظمة
    الملفات الحديثة تقبلها، والاسم يُقرأ في مجلّد التنزيلات. */
export function docFileName(kind: "invoice" | "ticket", id: string, client: string): string {
  const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-").trim().slice(0, 40);
  const prefix = kind === "invoice" ? "فاتورة" : "تذكرة";
  return `${prefix}-${safe(id)}-${safe(client)}`;
}
