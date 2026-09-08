/* تصريف المعدود بالعربية.

   العلّة التي يصلحها: صفحة الباقة كانت تكتب `{n} {t("days")}` حرفياً،
   فتُخرج «3 أيام · 1 ليالٍ». العربية لا تعامل المعدود كما تعامله
   الإنجليزية بلاحقة s: للواحد صيغة، وللاثنين صيغة، ولثلاثة إلى عشرة
   جمع قلّة، ولما فوقها مفرد منصوب. وأربع صيغ لا تُنتَج بشرطٍ في موضع
   العرض — تُنتَج بدالّة تُستدعى من كل موضع.

   والقاعدة تُطبَّق على آخر خانتين لا على العدد كلّه: «١٠٣ أيام» صحيحة
   و«١١٥ يوماً» صحيحة، فالمعوَّل على 103%100=3 و115%100=15.

   العدد لا يُكتب مع الواحد والاثنين: «يوم» و«يومان» تحملان عددهما في
   صيغتهما، و«1 يوم» عجمةٌ ظاهرة. */

export interface ArForms {
  /** مفرد بلا عدد — «يوم». */
  one: string;
  /** مثنّى بلا عدد — «يومان». */
  two: string;
  /** جمع قلّة مع العدد ٣–١٠ — «أيام». */
  few: string;
  /** مفرد منصوب مع العدد ١١ فأكثر — «يوماً». */
  many: string;
  /** صفر — «لا أيام»؛ يسقط إلى many حين لا يُذكر. */
  zero?: string;
}

export interface EnForms { one: string; other: string }

/** يبني نصّ «عدد + معدود» بالعربية. */
export function arCount(n: number, f: ArForms): string {
  const abs = Math.abs(Math.trunc(n));
  if (abs === 0) return f.zero ?? `${abs} ${f.many}`;
  if (abs === 1) return f.one;
  if (abs === 2) return f.two;
  const tail = abs % 100;
  return tail >= 3 && tail <= 10 ? `${abs} ${f.few}` : `${abs} ${f.many}`;
}

/** المقابل الإنجليزي — قاعدة واحدة، لكن الاستدعاء يبقى موحّداً. */
export const enCount = (n: number, f: EnForms): string =>
  `${Math.abs(Math.trunc(n))} ${Math.abs(Math.trunc(n)) === 1 ? f.one : f.other}`;

/* ── المعدودات المستعملة في واجهة المستفيد ──
   مجموعةً واحدة هنا لا مبعثرةً في القواميس: صيغها الأربع تتغيّر معاً
   أو لا تتغيّر، وتفريقها على أربعة مفاتيح في i18n يجعل تعديل واحدة
   يترك أخواتها. */
const AR: Record<string, ArForms> = {
  day:    { one: "يوم واحد",  two: "يومان",   few: "أيام",   many: "يوماً" },
  night:  { one: "ليلة واحدة", two: "ليلتان",  few: "ليالٍ",  many: "ليلة" },
  person: { one: "معتمر واحد", two: "معتمران", few: "معتمرين", many: "معتمراً" },
  seat:   { one: "مقعد واحد",  two: "مقعدان",  few: "مقاعد",  many: "مقعداً" },
  room:   { one: "غرفة واحدة", two: "غرفتان",  few: "غرف",    many: "غرفة" },
  photo:  { one: "صورة",      two: "صورتان",  few: "صور",    many: "صورة" },
};

const EN: Record<string, EnForms> = {
  day:    { one: "day",    other: "days" },
  night:  { one: "night",  other: "nights" },
  person: { one: "pilgrim", other: "pilgrims" },
  seat:   { one: "seat",   other: "seats" },
  room:   { one: "room",   other: "rooms" },
  photo:  { one: "photo",  other: "photos" },
};

export type CountKind = keyof typeof EN;

/** «٣ أيام» · «ليلتان» · «2 nights» — حسب اللغة والعدد. */
export function countLabel(n: number, kind: CountKind, lang: string): string {
  return lang === "ar" ? arCount(n, AR[kind]) : enCount(n, EN[kind]);
}

/** «٣ أيام · ليلتان» — سطر المدّة في صفحة الباقة وبطاقتها. */
export const durationLabel = (days: number, nights: number, lang: string): string =>
  `${countLabel(days, "day", lang)} · ${countLabel(nights, "night", lang)}`;
