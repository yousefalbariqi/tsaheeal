/* باصات الرحلة — رقمٌ داخل الرحلة لا سجلُّ أسطول.

   الرحلة تُطلق على نوع باصٍ (مثلاً «باص تساهيل 2027 · 49 مقعداً»)
   وبعددٍ منه: ثلاثة باصات تعني سعة ١٤٧ مقعداً. ولا يُربط «باص ٢» بلوحةٍ
   ولا بمركبةٍ بعينها — ذلك مرحلةٌ لاحقة إن احتيجت. فلا حالة «مشغول» تُكتب
   على المركبة، ولا شيء «يرجع متاحاً» حين تنتهي الرحلة: التعارض يُحسب من
   تواريخ الرحلات المتداخلة لحظة السؤال.

   ── الترقيم ──
   المقاعد تُخزَّن بترقيمٍ واحد على الرحلة كلها (١…١٤٧)، فيبقى كل ما يحرس
   السعة والازدواج في القاعدة كما هو. والباص يُشتقّ من الرقم: ١–٤٩ الباص
   الأول، ٥٠–٩٨ الثاني، وهكذا. وما يُعرض للموظف هو رقم المقعد داخل باصه —
   المقعد ٥٢ هو «باص ٢ · مقعد ٣»، لأن هذا ما هو مكتوبٌ على الكرسي.

   والملء بالترتيب نفسه: الكروكي يفتح على أول باصٍ فيه مكان، فإذا امتلأ
   الأول انتقل إلى الثاني. */
import type { Trip } from "@/types";

/* ═══ هندسة الباص الواحد ═══════════════════════════════════════════ */

/** صفوف الباص: ٢ + ممر + ٢، وصفٌّ خلفي حتى ٥ مقاعد. */
export function buildBusRows(capacity: number): number[][] {
  const rows: number[][] = []; let n = 1;
  while (n <= capacity) {
    const rem = capacity - n + 1;
    if (rem <= 5) { rows.push(Array.from({ length: rem }, (_, i) => n + i)); n += rem; }
    else { rows.push([n, n + 1, n + 2, n + 3]); n += 4; }
  }
  return rows;
}

/** المقعد الملاصق ضمن الزوج نفسه في صف ٢ + ممر + ٢. */
export function privacySeatPartner(capacity: number, seat: number): number | null {
  const row = buildBusRows(capacity).find(r => r.includes(seat));
  if (!row || row.length !== 4) return null;
  const i = row.indexOf(seat);
  return row[i % 2 === 0 ? i + 1 : i - 1] ?? null;
}

/* ═══ باصات الرحلة ═════════════════════════════════════════════════ */

type Layout = Pick<Trip, "seats" | "busCount">;

/** عدد باصات الرحلة. الرحلات السابقة لهذا الحقل باصٌ واحد. */
export const busCountOf = (t: Pick<Trip, "busCount">): number =>
  Math.max(1, Math.floor(Number(t.busCount) || 1));

/** مقاعد الباص الواحد — سعة الرحلة مقسومةً على باصاتها. */
export const seatsPerBus = (t: Layout): number =>
  Math.floor(Math.max(0, t.seats || 0) / busCountOf(t));

/** الباص الذي يقع فيه المقعد (١…العدد). */
export function busOfSeat(t: Layout, seat: number): number {
  const per = seatsPerBus(t);
  if (per <= 0) return 1;
  return Math.min(busCountOf(t), Math.max(1, Math.ceil(seat / per)));
}

/** رقم المقعد داخل باصه — ما هو مكتوبٌ على الكرسي. */
export function localSeat(t: Layout, seat: number): number {
  const per = seatsPerBus(t);
  return per > 0 && busCountOf(t) > 1 ? seat - (busOfSeat(t, seat) - 1) * per : seat;
}

/** أول مقعدٍ في الباص — يُضاف إلى رقم المقعد المحلي ليصير رقم الرحلة. */
export const busOffset = (t: Layout, bus: number): number => (bus - 1) * seatsPerBus(t);

/** «باص ٢ · مقعد ٣» حين تتعدّد الباصات، والرقم وحده حين يكون باصاً واحداً. */
export function seatLabel(t: Layout, seat: number): string {
  return busCountOf(t) > 1 ? `باص ${busOfSeat(t, seat)} · مقعد ${localSeat(t, seat)}` : String(seat);
}

/** مقعد الأنثى المنفردة وجاره: «باص ٢ · مقعد ١ · خصوصية ٢» — الجار في
    الباص نفسه دائماً، فلا يُكرَّر الباص. */
export function privacyPairLabel(t: Layout, seat?: number, privacy?: number): string {
  const one = (n?: number) => n == null ? "—" : String(localSeat(t, n));
  if (busCountOf(t) <= 1) return `${seat ?? "—"} · خصوصية ${privacy ?? "—"}`;
  return `${seat == null ? "" : `باص ${busOfSeat(t, seat)} · `}مقعد ${one(seat)} · خصوصية ${one(privacy)}`;
}

/** مقاعد حجزٍ مجموعةً بباصاتها: «باص ١: ٤٨، ٤٩ · باص ٢: ١». */
export function seatsLabel(t: Layout, seats: number[]): string {
  if (busCountOf(t) <= 1) return seats.join("، ");
  const by = new Map<number, number[]>();
  for (const s of [...seats].sort((a, b) => a - b)) {
    const bus = busOfSeat(t, s);
    by.set(bus, [...(by.get(bus) ?? []), localSeat(t, s)]);
  }
  return [...by].map(([bus, list]) => `باص ${bus}: ${list.join("، ")}`).join(" · ");
}

/** شريك مقعد الخصوصية داخل الباص نفسه — لا يعبر من باصٍ إلى آخر. */
export function tripPrivacyPartner(t: Layout, seat: number): number | null {
  const per = seatsPerBus(t);
  if (per <= 0 || seat < 1 || seat > per * busCountOf(t)) return null;
  const off = busOffset(t, busOfSeat(t, seat));
  const partner = privacySeatPartner(per, seat - off);
  return partner == null ? null : partner + off;
}

/** أول باصٍ فيه مقعدٌ شاغر — منه يبدأ الحجز، فإذا امتلأ فالذي بعده. */
export function firstOpenBus(t: Layout, taken: Set<number>): number {
  const per = seatsPerBus(t);
  for (let bus = 1; bus <= busCountOf(t); bus++) {
    const off = busOffset(t, bus);
    for (let n = 1; n <= per; n++) if (!taken.has(off + n)) return bus;
  }
  return 1;
}

/** أعلى باصٍ عليه مقعدٌ مخصَّص — لا تنزل باصات الرحلة تحته. */
export function highestUsedBus(t: Layout, taken: Iterable<number>): number {
  let top = 0;
  for (const s of taken) top = Math.max(top, busOfSeat(t, s));
  return top;
}

/** «باص واحد» · «باصان» · «٣ باصات». */
export const busesLabel = (n: number): string =>
  n === 1 ? "باص واحد" : n === 2 ? "باصان" : n <= 10 ? `${n} باصات` : `${n} باصاً`;
