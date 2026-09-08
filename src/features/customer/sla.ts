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
/** إعداد النافذة والوعد — يُمرَّر صريحاً للدوال النقيّة، أو يُقرأ من
    الإعداد الجاري في الأغلفة أدناه.

    سببه: شاشة الإعدادات تعرض معاينةً لأثر ما يكتبه المدير **قبل**
    الحفظ. لو قرأت المعاينة الإعداد الجاري لعرضت أثر القيمة القديمة —
    معاينةٌ تكذب أسوأ من لا معاينة. ولا يجوز أن تضبط الشاشة الإعداد
    العام لترى الأثر: ذاك يغيّر عدّادات المستفيد الحقيقية أثناء التحرير. */
export interface SlaConfig {
  openHour: number;
  closeHour: number;
  slaHours: number;
  /** 0 الأحد … 6 السبت. */
  workDays: number[];
  /** YYYY-MM-DD. */
  holidays: string[];
}

let openHour = 6;
let closeHour = 22;
let slaHours = 2;
/* أيام العمل: 0 الأحد … 6 السبت. السبت–الخميس افتراضاً.

   سببها أن النافذة كانت ساعاتٍ بلا أيام: طلبٌ يصل الخميس 21:00 كان
   عدّاده يمشي فجر الجمعة والمكتب مغلق، فيُعرض «انقضى الوعد» على طلبٍ
   لم يمرّ عليه دوامٌ واحد. والإجازة الرسمية كانت غير معروفةٍ أصلاً. */
let workDays: number[] = [0, 1, 2, 3, 4, 6];
let holidays = new Set<string>();

export const OPEN_HOUR = () => openHour;
export const CLOSE_HOUR = () => closeHour;
export const SLA_MS = () => slaHours * 3_600_000;
const OPEN_MS = () => openHour * 3_600_000;
const CLOSE_MS = () => closeHour * 3_600_000;

/* رقم يوم الأسبوع لِيومٍ بتوقيت الرياض. يوم الحقبة (1970-01-01) خميس،
   ورقمه في اصطلاح JS 4 — فمن رقم اليوم المطلق يُشتقّ يوم الأسبوع بلا
   إنشاء كائن Date (وهو ما كان سيُدخل توقيت الجهاز في حسابٍ رياضي). */
const weekdayOfDay = (day: number): number => (((day + 4) % 7) + 7) % 7;

/** تاريخ الرياض YYYY-MM-DD ليومٍ مطلق — لمطابقة قائمة الإجازات. */
function ymdOfDay(day: number): string {
  const d = new Date(day * DAY_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** الإعداد الجاري — أساسُ الأغلفة غير النقيّة. */
export const currentSla = (): SlaConfig => ({
  openHour, closeHour, slaHours,
  workDays: [...workDays], holidays: [...holidays],
});

/** هل هذا اليوم يوم عمل بحسب إعدادٍ بعينه؟ */
const isWorkDayIn = (c: SlaConfig, day: number): boolean =>
  c.workDays.includes(weekdayOfDay(day)) && !c.holidays.includes(ymdOfDay(day));

/** هل هذا اليوم يوم عمل؟ — يومُ أسبوعٍ عاملٌ وليس في قائمة الإجازات. */
const isWorkDay = (day: number): boolean =>
  workDays.includes(weekdayOfDay(day)) && !holidays.has(ymdOfDay(day));

/** يضبط النافذة والوعد من الإعدادات. القيم غير المعقولة تُرفض بلا رمي:
    نافذةٌ مقلوبة تجعل العدّاد لا يمشي أبداً، والسقوط على الافتراضي
    أسلم من شاشةٍ تتعطّل لإعدادٍ أُدخل خطأً. */
export function configureSla(cfg: {
  openHour?: number; closeHour?: number; slaHours?: number;
  workDays?: number[]; holidays?: string[];
}): void {
  const o = cfg.openHour, c = cfg.closeHour, h = cfg.slaHours;
  if (typeof o === "number" && typeof c === "number" && o >= 0 && c <= 24 && c > o) {
    openHour = o; closeHour = c;
  }
  if (typeof h === "number" && h > 0 && h <= 72) slaHours = h;
  /* قائمةٌ فارغة تعني «لا يوم عمل» — فالوعد لا يمشي أبداً ولا ينقضي.
     تُرفض ويبقى الافتراضي: إعدادٌ أُفرغ بالغلط لا يُجمّد كل العدّادات. */
  if (Array.isArray(cfg.workDays)) {
    const days = cfg.workDays.filter(d => Number.isInteger(d) && d >= 0 && d <= 6);
    if (days.length) workDays = [...new Set(days)];
  }
  if (Array.isArray(cfg.holidays)) {
    holidays = new Set(cfg.holidays.filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)));
  }
}

const toRiyadh = (utc: number) => utc + RIYADH_OFFSET_MS;
const fromRiyadh = (r: number) => r - RIYADH_OFFSET_MS;

/** ساعة الرياض ودقيقتها للحظة UTC — للعرض («يستأنف 6:00 ص»). */
export function riyadhClock(utc: number): { h: number; m: number } {
  const inDay = ((toRiyadh(utc) % DAY_MS) + DAY_MS) % DAY_MS;
  return { h: Math.floor(inDay / 3_600_000), m: Math.floor((inDay % 3_600_000) / 60_000) };
}

/** هل اللحظة داخل نافذة العمل؟ — يومَ عملٍ وداخل ساعاته معاً. */
export function isOpenAt(utc: number): boolean {
  const r = toRiyadh(utc);
  const day = Math.floor(r / DAY_MS);
  if (!isWorkDay(day)) return false;
  const inDay = r - day * DAY_MS;
  return inDay >= OPEN_MS() && inDay < CLOSE_MS();
}

/** مللي ثانية عملٍ منقضية بين لحظتين.

    `cap` ليس تحسيناً بل ضرورة: طلب عمره سنة يعني حلقةً بعدد أيامه،
    ونحن لا نحتاج إلا معرفة أنّ الوعد انقضى — فنخرج فور بلوغه. */
export function businessElapsed(fromUtc: number, toUtc: number, cap = SLA_MS()): number {
  return businessElapsedWith(currentSla(), fromUtc, toUtc, cap);
}

/** نفسها بإعدادٍ صريح — لمعاينة شاشة الإعدادات قبل الحفظ. */
export function businessElapsedWith(
  c: SlaConfig, fromUtc: number, toUtc: number, cap = c.slaHours * 3_600_000,
): number {
  const a = toRiyadh(fromUtc), b = toRiyadh(toUtc);
  if (!(b > a)) return 0;
  if (!c.workDays.length) return 0;         // بلا أيام عمل لا ينقضي شيء
  const openMs = c.openHour * 3_600_000, closeMs = c.closeHour * 3_600_000;
  const lastDay = Math.floor(b / DAY_MS);
  let total = 0;
  for (let day = Math.floor(a / DAY_MS); day <= lastDay; day++) {
    if (!isWorkDayIn(c, day)) continue;     // جمعة أو إجازة رسمية — لا يُحتسب
    const s = Math.max(a, day * DAY_MS + openMs);
    const e = Math.min(b, day * DAY_MS + closeMs);
    if (e > s) { total += e - s; if (total >= cap) return cap; }
  }
  return total;
}

/** لحظة انقضاء الوعد لطلبٍ أُرسل في `fromUtc`، بإعدادٍ صريح.

    تُحسب بالقفز بين أيام العمل لا بخطواتٍ صغيرة: البحث الخطّي بخطوة
    خمس دقائق كان يستدعي businessElapsed أربعة آلاف مرّة لكل صفّ
    معاينة. هنا نستهلك نافذة كل يوم عملٍ حتى تنفد الساعات الموعودة. */
export function slaDueAt(c: SlaConfig, fromUtc: number, maxDays = 60): number | null {
  if (!c.workDays.length || !(c.closeHour > c.openHour)) return null;
  const openMs = c.openHour * 3_600_000, closeMs = c.closeHour * 3_600_000;
  let need = c.slaHours * 3_600_000;
  const a = toRiyadh(fromUtc);
  for (let day = Math.floor(a / DAY_MS), i = 0; i <= maxDays; day++, i++) {
    if (!isWorkDayIn(c, day)) continue;
    const s = Math.max(a, day * DAY_MS + openMs);
    const e = day * DAY_MS + closeMs;
    if (e <= s) continue;
    const avail = e - s;
    if (avail >= need) return fromRiyadh(s + need);
    need -= avail;
  }
  return null;
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
    /* قبل فتح يومِ عملٍ ⇒ فتحُ اليوم نفسه، وإلّا أوّل يوم عمل بعده.
       الحدّ ١٤ دورة يمنع حلقةً لا تنتهي لو صارت كل الأيام إجازات — وهو
       مستحيلٌ بحرس configureSla، لكن حلقة `while(true)` في شاشة عميل
       تُجمّد المتصفّح، والحارس أرخص من الثقة. */
    let next = inDay < OPEN_MS() && isWorkDay(day) ? day : day + 1;
    for (let i = 0; i < 14 && !isWorkDay(next); i++) next++;
    resumesAt = fromRiyadh(next * DAY_MS + OPEN_MS());
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
