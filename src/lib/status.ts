/* معجم الحالات — مصدرٌ واحد لصياغة كل حالة في اللوحة.

   قبله كانت الصياغة تُكتب حيث تُعرض: شريحة المرشّح في «الطلبات» تقول
   «مؤكدة» والشارة في الصفّ نفسه تقول «مؤكد»، و«قيد المراجعة» تظهر
   «مراجعة» في شاشة، و«ملغى/ملغاة» تتناوبان بلا قاعدة. الموظف يقرأها
   حالتين مختلفتين لا صياغتين لحالة واحدة.

   القاعدة: الحالة معنى واحد، وتذكيرها وتأنيثها يتبعان الكيان الموصوف —
   الطلب مذكّر والرحلة مؤنّثة، فـ«طلب مؤكد» و«رحلة مؤكدة». لذلك يحمل
   المعجم الصيغتين ويختار الجنس من نوع الكيان، ولا يُترك للموقع.

   ما لا يوصف بصفة (بانتظار الدفع · تم التحقق · مسودة) لا جنس له، فيُكتب
   نصّاً واحداً — إقحام تأنيثٍ عليه يُفسده لا يوحّده. */

/** الكيانات وجنسها النحوي. */
export type StatusEntity =
  | "booking" | "trip" | "payment" | "ticket" | "package" | "hotel"
  | "transport" | "user" | "branch" | "beneficiary" | "request" | "support";

const FEMININE: ReadonlySet<StatusEntity> = new Set<StatusEntity>([
  "trip",       // رحلة
  "payment",    // فاتورة
  "ticket",     // تذكرة
  "package",    // باقة
  "transport",  // وسيلة نقل
]);

export const isFeminine = (e: StatusEntity) => FEMININE.has(e);

type Tone = { bg: string; fg: string };
/** نصّ واحد، أو [مذكّر، مؤنّث]. */
type Wording = string | readonly [string, string];
type Entry = { text: Wording } & Tone;

const G = {
  blue:   { bg: "#EAF1FE", fg: "#1E52C7" },
  amber:  { bg: "#FBF3D6", fg: "#8A6A08" },
  orange: { bg: "#FCEBDD", fg: "#B4530C" },
  red:    { bg: "#FBE6E6", fg: "#BE2626" },
  cyan:   { bg: "#E0F2FB", fg: "#0E7CA8" },
  violet: { bg: "#F1E9FA", fg: "#7226BE" },
  teal:   { bg: "#DDF3F0", fg: "#0C766B" },
  green:  { bg: "#E3F3E8", fg: "#1E7A44" },
  grey:   { bg: "#EEECEA", fg: "#5C554E" },
} as const;

/* الترتيب: حالات الطلب، ثم الدفع، ثم دورة حياة السجل. */
const LEX: Record<string, Entry> = {
  new:              { text: ["جديد", "جديدة"],        ...G.blue },
  reviewing:        { text: "قيد المراجعة",            ...G.amber },
  needs_edit:       { text: "يحتاج تعديلاً",           ...G.orange },
  rejected:         { text: ["مرفوض", "مرفوضة"],      ...G.red },
  accepted:         { text: ["مقبول", "مقبولة"],      ...G.cyan },
  awaiting_payment: { text: "بانتظار الدفع",           ...G.violet },
  awaiting_trip:    { text: "بانتظار رحلة",            ...G.orange },
  paid:             { text: "تم الدفع",                ...G.teal },
  verifying:        { text: "قيد التحقق",              ...G.orange },
  verified:         { text: "تم التحقق",               ...G.green },
  sent:             { text: "تم الإرسال",              ...G.violet },
  failed:           { text: ["متعثّر", "متعثّرة"],     ...G.red },
  confirmed:        { text: ["مؤكد", "مؤكدة"],        ...G.green },
  cancelled:        { text: ["ملغى", "ملغاة"],        ...G.grey },

  active:           { text: ["نشط", "نشطة"],          ...G.green },
  inactive:         { text: ["متوقف", "متوقفة"],      ...G.grey },
  draft:            { text: "مسودة",                   ...G.amber },
  hidden:           { text: ["مخفي", "مخفية"],        ...G.grey },
  suspended:        { text: ["موقوف", "موقوفة"],      ...G.red },
  open:             { text: ["مفتوح", "مفتوحة"],      ...G.green },
  full:             { text: ["مكتمل العدد", "مكتملة العدد"], ...G.red },
  archived:         { text: ["مؤرشف", "مؤرشفة"],      ...G.grey },

  /* طوْرا الوقت — يُشتقّان في lib/trip ولا يُخزَّنان، ويدخلان المعجم
     كي تُصاغ الحالة المعروضة من مصدرٍ واحد مهما كان أصلها. */
  running:          { text: ["جارٍ الآن", "جارية الآن"], ...G.cyan },
  ended:            { text: ["منتهٍ", "منتهية"],       ...G.grey },
  closed:           { text: ["مغلق", "مغلقة"],        ...G.grey },
  resolved:         { text: ["مُعالَج", "مُعالَجة"],   ...G.green },
  contacted:        { text: "تم التواصل",              ...G.cyan },
  quoted:           { text: "أُرسل عرض السعر",         ...G.violet },
  converted:        { text: ["محوّل إلى طلب", "محوّلة إلى طلب"], ...G.green },
  none:             { text: "لا يوجد",                 ...G.grey },
};

const FALLBACK: Entry = { text: "غير معروف", ...G.grey };

/** صياغة الحالة بحسب جنس الكيان. */
export function statusLabel(status: string, entity: StatusEntity = "booking"): string {
  const e = LEX[status] ?? FALLBACK;
  return typeof e.text === "string" ? e.text : e.text[isFeminine(entity) ? 1 : 0];
}

export function statusTone(status: string): Tone {
  const e = LEX[status] ?? FALLBACK;
  return { bg: e.bg, fg: e.fg };
}

/** شرائح المرشّحات تُبنى من المعجم نفسه — لا تُكتب صياغةٌ ثانية بجانبه. */
export function statusChips<T extends string>(
  statuses: readonly T[], entity: StatusEntity, allLabel = "الكل",
): [T | "all", string][] {
  return [["all", allLabel], ...statuses.map(s => [s, statusLabel(s, entity)] as [T, string])];
}

/* ── محور الدفع ──
   حالة الدفع ليست حالة السجل: «تم التحقق» على حجزٍ تعني اكتمال وثائقه،
   وعلى فاتورةٍ تعني وصول المال. لذلك محورٌ ثانٍ بصياغته، لا إقحامَ
   لصياغة أحدهما على الآخر — لكنه هنا كذلك، لا في شاشة الفواتير وحدها،
   كي تقرأه بقيّة الشاشات بالنصّ نفسه. */
const PAY_LEX: Record<string, Entry> = {
  verified: { text: "مدفوعة",     ...G.green },
  sent:     { text: "رابط أُرسل", ...G.violet },
  failed:   { text: "فشل الدفع",  ...G.red },
  none:     { text: "لم تُدفع",   ...G.grey },
};

export function payStatusLabel(status: string): string {
  const e = PAY_LEX[status] ?? FALLBACK;
  return typeof e.text === "string" ? e.text : e.text[0];
}

export function payStatusTone(status: string): Tone {
  const e = PAY_LEX[status] ?? FALLBACK;
  return { bg: e.bg, fg: e.fg };
}

export function payStatusChips(statuses: readonly string[], allLabel = "الكل"): [string, string][] {
  return [["all", allLabel], ...statuses.map(s => [s, payStatusLabel(s)] as [string, string])];
}
