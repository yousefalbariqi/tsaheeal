/* وعد الردّ على الطلب: ساعتان عملٍ من إرساله.

   «ساعتان» بالساعة الجدارية تكذب: طلبٌ يصل 21:50 لا يُردّ عليه 23:50 —
   المكتب مغلق. فالعدّ هنا بساعات العمل: يمشي داخل النافذة ويقف خارجها
   ويستأنف من فتحها. من أرسل بعد الإغلاق يرى عدّاداً كاملاً يبدأ السادسة
   صباحاً، لا عدّاداً انتهى قبل أن يفتح أحد.

   التوقيت توقيت الرياض لا توقيت الجهاز: النافذة نافذة المكتب، ومن يفتح
   التطبيق من خارج المملكة كان يرى «خارج ساعات العمل» في وقت العمل. */

/** الرياض UTC+3 ثابتاً — لا توقيت صيفي في السعودية، فالإزاحة رقم لا جدول. */
const RIYADH_OFFSET_MS = 3 * 3_600_000;
const DAY_MS = 86_400_000;

/* ── نافذة العمل والوعد ──
   كانت ثوابت: تغيير ساعات المكتب أو الوعد يستلزم تعديل شفرة وإعادة
   نشر. صارت تُضبط من شاشة الإعدادات (app_settings.pub) وتُحمَّل مرّة
   عند بدء الشاشة عبر configureSla.

   القيم الابتدائية هي القيم القائمة نفسها — 6 إلى 22 وساعتان — فمن لم
   ينفّذ الترحيل يرى السلوك السابق حرفياً. والقراءة عبر دوال لا ثوابت
   مُصدَّرة: قيمةٌ تُقرأ مرّة عند تحميل الوحدة تتجمّد على الافتراضي حتى
   لو وصلت الإعدادات بعدها. */
let openHour = 6;
let closeHour = 22;
let slaHours = 2;

export const OPEN_HOUR = () => openHour;
export const CLOSE_HOUR = () => closeHour;
export const SLA_MS = () => slaHours * 3_600_000;
const OPEN_MS = () => openHour * 3_600_000;
const CLOSE_MS = () => closeHour * 3_600_000;

/** يضبط النافذة والوعد من الإعدادات. القيم غير المعقولة تُرفض بلا رمي:
    نافذةٌ مقلوبة تجعل العدّاد لا يمشي أبداً، والسقوط على الافتراضي
    أسلم من شاشةٍ تتعطّل لإعدادٍ أُدخل خطأً. */
export function configureSla(cfg: { openHour?: number; closeHour?: number; slaHours?: number }): void {
  const o = cfg.openHour, c = cfg.closeHour, h = cfg.slaHours;
  if (typeof o === "number" && typeof c === "number" && o >= 0 && c <= 24 && c > o) {
    openHour = o; closeHour = c;
  }
  if (typeof h === "number" && h > 0 && h <= 72) slaHours = h;
}

const toRiyadh = (utc: number) => utc + RIYADH_OFFSET_MS;
const fromRiyadh = (r: number) => r - RIYADH_OFFSET_MS;

/** ساعة الرياض ودقيقتها للحظة UTC — للعرض («يستأنف 6:00 ص»). */
export function riyadhClock(utc: number): { h: number; m: number } {
  const inDay = ((toRiyadh(utc) % DAY_MS) + DAY_MS) % DAY_MS;
  return { h: Math.floor(inDay / 3_600_000), m: Math.floor((inDay % 3_600_000) / 60_000) };
}

/** هل اللحظة داخل نافذة العمل؟ */
export function isOpenAt(utc: number): boolean {
  const inDay = ((toRiyadh(utc) % DAY_MS) + DAY_MS) % DAY_MS;
  return inDay >= OPEN_MS() && inDay < CLOSE_MS();
}

/** مللي ثانية عملٍ منقضية بين لحظتين.

    `cap` ليس تحسيناً بل ضرورة: طلب عمره سنة يعني حلقةً بعدد أيامه،
    ونحن لا نحتاج إلا معرفة أنّ الوعد انقضى — فنخرج فور بلوغه. */
export function businessElapsed(fromUtc: number, toUtc: number, cap = SLA_MS()): number {
  const a = toRiyadh(fromUtc), b = toRiyadh(toUtc);
  if (!(b > a)) return 0;
  const lastDay = Math.floor(b / DAY_MS);
  let total = 0;
  for (let day = Math.floor(a / DAY_MS); day <= lastDay; day++) {
    const s = Math.max(a, day * DAY_MS + OPEN_MS());
    const e = Math.min(b, day * DAY_MS + CLOSE_MS());
    if (e > s) { total += e - s; if (total >= cap) return cap; }
  }
  return total;
}

export interface SlaState {
  /** مللي ثانية عمل باقية من الوعد. صفر = انقضى. */
  remainingMs: number;
  totalMs: number;
  /** نسبة الإنجاز 0..1 — لحلقة العدّاد. */
  progress: number;
  /** الآن خارج ساعات العمل: العدّاد واقف لا نافد. */
  paused: boolean;
  /** لحظة استئناف العدّ (فتح المكتب القادم) حين يكون واقفاً. */
  resumesAt: number | null;
  expired: boolean;
}

export function slaState(submittedUtc: number, nowUtc: number): SlaState {
  const used = businessElapsed(submittedUtc, nowUtc);
  const total = SLA_MS();
  const remainingMs = Math.max(0, total - used);
  const open = isOpenAt(nowUtc);

  let resumesAt: number | null = null;
  if (!open) {
    const r = toRiyadh(nowUtc);
    const day = Math.floor(r / DAY_MS);
    const inDay = r - day * DAY_MS;
    // قبل الفتح ⇒ فتح اليوم نفسه، وبعد الإغلاق ⇒ فتح الغد
    resumesAt = fromRiyadh(day * DAY_MS + OPEN_MS() + (inDay < OPEN_MS() ? 0 : DAY_MS));
  }

  return {
    remainingMs, totalMs: total,
    progress: 1 - remainingMs / total,
    paused: !open && remainingMs > 0,
    resumesAt,
    expired: remainingMs <= 0,
  };
}

/** «01:59:32» — بأرقام لاتينية دائماً، تُعرض داخل عنصر LTR. */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`;
}
