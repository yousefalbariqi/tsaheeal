/* التاريخ والوقت نصّاً — صياغةٌ واحدة للوحة.

   كانت الجداول تعرض التاريخ كما يُخزَّن: «2025-08-07» و«2025-07-01 10:30».
   صيغةُ قاعدة البيانات تُقرأ ببطء وتُخطأ (الشهر أم اليوم أوّلاً؟)، وأربعة
   مواضع أخرى تبني منسّقها الخاص. هنا المنسّق مرّة: ميلاديٌّ بأرقامٍ لاتينية
   وأسماء شهورٍ عربية — «7 أغسطس 2025» — وهو ما تطبعه الفواتير والتذاكر.

   المُدخَل نصُّ التخزين (YYYY-MM-DD، مع وقتٍ اختياري). ما لا يُفهم يُعاد
   كما هو: خانةٌ فيها نصٌّ غريب خيرٌ من خانةٍ فارغة تُخفي أن فيها شيئاً. */

const LOCALE = "ar-SA-u-ca-gregory-nu-latn";

/* الظهيرة لا منتصف الليل: «2025-08-07» بلا وقت يُحلَّل UTC، فيرتدّ يوماً
   في المناطق الغربية. الظهر يبقى في يومه أينما قُرئ. */
function parse(value: string | null | undefined): Date | null {
  if (!value) return null;
  const s = String(value).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(s);
  if (!m) { const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d; }
  const [, y, mo, d, h, mi] = m;
  return new Date(+y, +mo - 1, +d, h ? +h : 12, mi ? +mi : 0);
}

const F = {
  full:    new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "long", year: "numeric" }),
  medium:  new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", year: "numeric" }),
  short:   new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short" }),
  weekday: new Intl.DateTimeFormat(LOCALE, { weekday: "long" }),
  time:    new Intl.DateTimeFormat(LOCALE, { hour: "numeric", minute: "2-digit", hour12: true }),
};

/** «7 أغسطس 2025» */
export function fmtDate(value: string | null | undefined, fallback = "—"): string {
  const d = parse(value);
  return d ? F.full.format(d) : (value || fallback);
}

/** «7 أغسطس» — وتُلحق السنة إن لم تكن السنة الجارية. */
export function fmtDateShort(value: string | null | undefined, fallback = "—"): string {
  const d = parse(value);
  if (!d) return value || fallback;
  return d.getFullYear() === new Date().getFullYear() ? F.short.format(d) : F.medium.format(d);
}

/** «الخميس» */
export function fmtWeekday(value: string | null | undefined): string {
  const d = parse(value);
  return d ? F.weekday.format(d) : "";
}

/** «الخميس 7 أغسطس» */
export function fmtDayDate(value: string | null | undefined, fallback = "—"): string {
  const d = parse(value);
  return d ? `${F.weekday.format(d)} ${fmtDateShort(value)}` : (value || fallback);
}

/** «10:30 ص» — من «10:30» أو من طابعٍ زمنيٍّ كامل. */
export function fmtTime(value: string | null | undefined, fallback = "—"): string {
  if (!value) return fallback;
  const hm = /^(\d{1,2}):(\d{2})/.exec(String(value).trim());
  const d = hm ? new Date(2000, 0, 1, +hm[1], +hm[2]) : parse(value);
  return d ? F.time.format(d) : String(value);
}

/** «7 أغسطس · 10:30 ص» لطابعٍ زمني. */
export function fmtDateTime(value: string | null | undefined, fallback = "—"): string {
  const d = parse(value);
  if (!d) return value || fallback;
  const hasTime = /[T ]\d{2}:\d{2}/.test(String(value));
  return hasTime ? `${fmtDateShort(value)} · ${F.time.format(d)}` : fmtDateShort(value);
}

/** «منذ 3 أيام» / «بعد يومين» / «اليوم» — المسافة عن اليوم بالأيام. */
export function fmtRelativeDay(value: string | null | undefined): string {
  const d = parse(value);
  if (!d) return "";
  const a = new Date(); a.setHours(12, 0, 0, 0);
  const b = new Date(d); b.setHours(12, 0, 0, 0);
  const n = Math.round((b.getTime() - a.getTime()) / 86_400_000);
  if (n === 0) return "اليوم";
  if (n === 1) return "غداً";
  if (n === -1) return "أمس";
  const abs = Math.abs(n);
  const unit = abs === 2 ? "يومين" : abs <= 10 ? `${abs} أيام` : `${abs} يوماً`;
  return n > 0 ? `بعد ${unit}` : `منذ ${unit}`;
}
