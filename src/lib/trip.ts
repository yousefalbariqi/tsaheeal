/* طوْر الرحلة — فصل ما كان محوراً واحداً مشوّشاً إلى محورين.

   العلّة التي يصلحها هذا الملف واحدة، وكل ملاحظات الفريق عن الرحلات
   تتفرّع عنها: `trip.status` كان يحمل معنيين لا معنى واحداً.

     • ما يقرّره الموظف  — مفتوحة · مكتملة العدد · ملغاة
     • ما يقرّره التقويم — قادمة · جارية · منتهية

   والحقل واحد، فلا مكان للثاني. النتيجة التي رآها الفريق حرفياً: رحلة
   ٣٠ يوليو ما زالت «مفتوحة» في ٥ سبتمبر، والعدّاد يقول «صفر مكتملة»
   ورحلات انتهت، و«المتاح ١٤٠ مقعداً» فيها مقاعد رحلاتٍ راحت.

   ── لماذا يُشتقّ الطوْر ولا يُخزَّن ──

   يبدو للوهلة الأولى أن الأنظف حالةٌ `ended` تُكتب في القاعدة. لكنها
   تحتاج مَن يكتبها: مهمّة ليلية أو حارس. وأيّهما تعطّل يوماً — أو تأخّر
   ساعةً — عادت الرحلة تكذب، وهي العلّة نفسها بثوبٍ جديد. وتحتاج كذلك
   تصليح ما مضى، ورحلةٌ تُدخَل بأثر رجعي تُولد خاطئة.

   والتاريخ معلومٌ في الصفّ أصلاً. ما يُحسب من معطًى موجود لا يُخزَّن
   بجانبه: تخزينه يخلق نسختين قابلتين للاختلاف، والاشتقاق يصحّ في كل
   لحظة يُقرأ فيها بلا جدولةٍ ولا ترحيل.

   الحالة المخزّنة تبقى كما هي إذن — نيّة الموظف — ويعلوها الوقت هنا. */
import type { Trip, Booking, TicketEntry } from "@/types";
import { parseYMD, ymd } from "@/lib/utils";

/* ═══ الزمن ═══════════════════════════════════════════════════════ */

/** لحظة الانطلاق. بلا وقت تُقرأ من أول اليوم لا من منتصفه. */
export function tripDeparture(t: Pick<Trip, "departureDate" | "departureTime">): Date | null {
  const d = parseYMD(t.departureDate);
  if (!d) return null;
  const [h, mi] = (t.departureTime || "00:00").split(":").map(Number);
  return new Date(d.y, d.m, d.d, Number.isFinite(h) ? h : 0, Number.isFinite(mi) ? mi : 0, 0, 0);
}

/** لحظة انتهاء الرحلة.

    بلا تاريخ عودة تنتهي بنهاية يوم الذهاب — لا بلحظة الانطلاق. رحلةٌ
    تنطلق ٢٢:٠٠ ليست «منتهية» في ٢٢:٠١، والافتراض الآمن أن يومها لها.

    ووقت العودة يُقرأ إن وُجد (صار حقلاً في الموجة ٢)، وإلا فآخر يوم
    العودة كاملاً: تقصيرُه يُنهي رحلةً وركّابها في الطريق. */
export function tripEnd(t: Pick<Trip, "departureDate" | "returnDate" | "departureTime" | "returnTime">): Date | null {
  const r = parseYMD(t.returnDate) ?? parseYMD(t.departureDate);
  if (!r) return null;
  const rt = t.returnTime;
  if (rt) {
    const [h, mi] = rt.split(":").map(Number);
    if (Number.isFinite(h)) return new Date(r.y, r.m, r.d, h, Number.isFinite(mi) ? mi : 0, 0, 0);
  }
  return new Date(r.y, r.m, r.d, 23, 59, 59, 999);
}

/** طوْر الرحلة في التقويم — لا علاقة له بحالة البيع. */
export type TripPhase = "upcoming" | "running" | "ended";

export function tripPhase(t: Trip, now: Date = new Date()): TripPhase {
  const dep = tripDeparture(t);
  /* رحلة بلا تاريخ لا يمكن الحكم بانتهائها: تُعامل قادمةً كي تبقى
     مرئيةً في العمل اليومي حتى يُصحّح تاريخها. */
  if (!dep) return "upcoming";
  if (now < dep) return "upcoming";
  const end = tripEnd(t);
  return end && now <= end ? "running" : "ended";
}

/* ═══ الحالة المعروضة ═════════════════════════════════════════════ */

/** الحالة الواحدة التي تُعرض للموظف — دمج المحورين بترتيب أسبقية.

    الترتيب ليس اعتباطاً: الإلغاء يعلو كل شيء لأنه قرارٌ صريح ألغى
    الرحلة أصلاً، ثم الانتهاء لأنه واقعٌ لا يُردّ، ثم حالة البيع. عرض
    «مكتملة العدد» على رحلةٍ راحت يصف بيعاً لم يعد قائماً. */
export type TripState = "cancelled" | "archived" | "ended" | "running" | "full" | "open";

export function tripState(t: Trip, now: Date = new Date()): TripState {
  if (t.status === "cancelled") return "cancelled";
  if (t.status === "archived") return "archived";
  const phase = tripPhase(t, now);
  if (phase === "ended") return "ended";
  if (phase === "running") return "running";
  if (t.status === "full" || seatsOf(t).available <= 0) return "full";
  return "open";
}

/* ═══ المقاعد ═════════════════════════════════════════════════════ */

export interface TripSeats { capacity: number; booked: number; available: number; }

/** مقاعد رحلةٍ واحدة. المتاح لا ينزل تحت الصفر ولو تجاوز الحجز السعة. */
export function seatsOf(t: Pick<Trip, "seats" | "bookedSeats">): TripSeats {
  const capacity = Math.max(0, t.seats || 0);
  const booked = Math.max(0, t.bookedSeats || 0);
  return { capacity, booked, available: Math.max(0, capacity - booked) };
}

/** هل تقبل هذه الرحلة حجزاً جديداً الآن؟

    مصدر الحقيقة الواحد لكل سؤال «أعرضها للبيع؟» — في اللوحة وفي نموذج
    الحجز الداخلي وفي شاشة المستفيد. كان كلٌّ منها يسأل بشرطه، وشرط
    اللوحة كان `status === "open"` وحده: فيظهر للموظف في قائمة «الرحلات
    المتاحة» رحلةٌ انطلقت أمس، ويحجز عليها. */
export function isSellable(t: Trip, now: Date = new Date()): boolean {
  return tripState(t, now) === "open";
}

/** هل تُحتسب هذه الرحلة في الطاقة التشغيلية؟

    الملغاة لا، والمنتهية لا — وهي ملاحظة الفريق حرفياً: «يجب أن يستبعد
    الرحلات المنتهية والملغاة من المتاح». الجارية نعم: مقاعدها مشغولة
    فعلاً وحافلتها في الطريق. */
export function isLive(t: Trip, now: Date = new Date()): boolean {
  const s = tripState(t, now);
  return s === "open" || s === "full" || s === "running";
}

/* ═══ التجميع ═════════════════════════════════════════════════════ */

export interface TripTotals {
  /** عدد الرحلات القائمة (بلا الملغاة والمنتهية والمؤرشفة). */
  live: number;
  /** الرحلات المنتهية — تُعرض في قسمها لا في العمل اليومي. */
  ended: number;
  cancelled: number;
  open: number;
  full: number;
  running: number;
  /** السعة والمحجوز والمتاح — من الرحلات القائمة وحدها. */
  capacity: number;
  booked: number;
  available: number;
  waiting: number;
}

export function tripTotals(trips: Trip[], now: Date = new Date()): TripTotals {
  const t: TripTotals = { live: 0, ended: 0, cancelled: 0, open: 0, full: 0, running: 0, capacity: 0, booked: 0, available: 0, waiting: 0 };
  for (const trip of trips) {
    const state = tripState(trip, now);
    if (state === "ended") { t.ended++; continue; }
    if (state === "cancelled" || state === "archived") { t.cancelled += state === "cancelled" ? 1 : 0; continue; }
    t.live++;
    if (state === "open") t.open++;
    else if (state === "full") t.full++;
    else if (state === "running") t.running++;
    const s = seatsOf(trip);
    t.capacity += s.capacity;
    t.booked += s.booked;
    t.available += s.available;
    t.waiting += Math.max(0, trip.waitingSeats || 0);
  }
  return t;
}

/** فصل الرحلات إلى ما يُشتغل عليه اليوم وما انتهى.

    قسم «المنتهية» مطلبٌ إداري صريح من الفريق: «حتى لا تزحم التشغيل
    اليومي». والفصل هنا لا في الشاشة كي يقرأه كل مَن يعرضها. */
export function splitByPhase(trips: Trip[], now: Date = new Date()): { live: Trip[]; ended: Trip[] } {
  const live: Trip[] = [], ended: Trip[] = [];
  for (const t of trips) (tripState(t, now) === "ended" ? ended : live).push(t);
  return { live, ended };
}

/** أقرب رحلة لم تنطلق بعد — مرتّبة بالأقرب فالأبعد.

    بطاقة الباقة كانت تعرض نطاق أشهرٍ مأخوذاً من أقدم رحلة، فتقول
    «يوليو · أغسطس» في سبتمبر. ما يفيد الموظف هو الموعد التالي لا
    الأول. */
export function nextTrip(trips: Trip[], now: Date = new Date()): Trip | undefined {
  return trips
    .filter(t => tripPhase(t, now) === "upcoming" && t.status !== "cancelled" && t.status !== "archived")
    .sort((a, b) => (tripDeparture(a)?.getTime() ?? Infinity) - (tripDeparture(b)?.getTime() ?? Infinity))[0];
}

/** الشهر الذي يبدأ منه التقويم: شهر أقرب رحلة قادمة، وإلا الشهر الحالي.
    ولا يرجع إلى الماضي أبداً — تقويمٌ يفتح على شهرٍ مضى لا يُقرأ. */
export function calendarAnchor(trips: Trip[], now: Date = new Date()): { y: number; m: number } {
  const next = nextTrip(trips, now);
  const d = next ? tripDeparture(next) : null;
  return d && d >= new Date(now.getFullYear(), now.getMonth(), 1)
    ? { y: d.getFullYear(), m: d.getMonth() }
    : { y: now.getFullYear(), m: now.getMonth() };
}

/* ═══ العرض ═══════════════════════════════════════════════════════ */

const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

/** لون خانة اليوم في التقويم — من الحالة المشتقّة لا من المخزّنة.

    كان في utils يقرأ `status` وحده، فيلوّن يوم ٣٠ يوليو أخضرَ «مفتوحة»
    في سبتمبر. الأسبقية هنا: قائمٌ للبيع، ثم مكتمل، ثم جارٍ، ثم رمادي
    لِما مضى أو أُلغي. */
export function dayColor(deps: Trip[], now: Date = new Date()): string {
  const states = deps.map(t => tripState(t, now));
  if (states.includes("open")) return "#1E7A44";
  if (states.includes("full")) return "#BE2626";
  if (states.includes("running")) return "#0E7CA8";
  return "#9a9186";
}

/** «١٤ سبتمبر» — تاريخٌ يُقرأ بلا فكّ ترميز، للبطاقات لا للجداول. */
export function shortDate(ymdStr: string): string {
  const p = parseYMD(ymdStr);
  return p ? `${p.d} ${AR_MONTHS[p.m]}` : "—";
}

/** «بعد ٣ أيام» · «غداً» · «اليوم» — المسافة الزمنية بلغة الموظف. */
export function untilLabel(t: Trip, now: Date = new Date()): string {
  const dep = tripDeparture(t);
  if (!dep) return "";
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(dep) - startOf(now)) / 86_400_000);
  if (days < 0) return "";
  if (days === 0) return "اليوم";
  if (days === 1) return "غداً";
  if (days === 2) return "بعد يومين";
  if (days <= 10) return `بعد ${days} أيام`;
  return `بعد ${days} يوماً`;
}

/* ═══ التواريخ في النموذج ═════════════════════════════════════════ */

/** تاريخ العودة الافتراضي: الذهاب + (أيام الباقة − ١).

    باقة ثلاثة أيام تنطلق الخميس تعود السبت لا الأحد: اليوم الأول هو يوم
    الانطلاق نفسه. قيمةٌ مقترحة يعدّلها الموظف لا قيدٌ عليه. */
export function defaultReturnDate(departureDate: string, days: number): string {
  const p = parseYMD(departureDate);
  if (!p) return "";
  const d = new Date(p.y, p.m, p.d);
  d.setDate(d.getDate() + Math.max(0, Math.round(days || 1) - 1));
  return ymd(d.getFullYear(), d.getMonth(), d.getDate());
}

/** هل العودة قبل الذهاب؟ التاريخ أولاً، وفي اليوم نفسه الوقت.

    «٢٠٢٦-٠٩-١٢ ٠٦:٠٠ ← ٢٠٢٦-٠٩-١٢ ٢٢:٠٠» رحلةٌ تعود قبل أن تنطلق،
    وكان الفحص على التاريخ وحده يمرّرها. */
export function returnBeforeDeparture(t: Pick<Trip, "departureDate" | "returnDate" | "departureTime" | "returnTime">): boolean {
  if (!t.returnDate || !t.departureDate) return false;
  if (t.returnDate < t.departureDate) return true;
  if (t.returnDate > t.departureDate) return false;
  return !!t.returnTime && !!t.departureTime && t.returnTime < t.departureTime;
}

/* ═══ المركبة: تعارض النوافذ ═════════════════════════════════════════

   السائقون بالتعاقد ولا سجلَّ لهم (قرار يوسف)، فالتعارض للمركبة وحدها:
   حافلةٌ واحدة لا تكون في رحلتَين يتداخل زمنهما. النافذة بالأيام لا
   بالساعات — حافلةٌ تعود ظهر السبت لا تنطلق مساءه: بين الرحلتَين
   تنظيفٌ وفحصٌ وسائقٌ آخر. والقاعدة تحرس بالمنطق نفسه
   (guard_trip_vehicle_conflict في ترحيل 20260912). */

export interface DateWindow { from: string; to: string; }

/** نافذة الرحلة [الذهاب، العودة] بصيغة YYYY-MM-DD — والعودة الغائبة أو
    السابقة للذهاب تُقرأ يومَ الذهاب نفسه. */
export function tripWindow(t: Pick<Trip, "departureDate" | "returnDate">): DateWindow | null {
  if (!parseYMD(t.departureDate)) return null;
  const to = parseYMD(t.returnDate) && t.returnDate >= t.departureDate ? t.returnDate : t.departureDate;
  return { from: t.departureDate, to };
}

/** تداخل نافذتَين مغلقتَين من الطرفَين. السلاسل YYYY-MM-DD تُقارَن
    معجمياً فتساوي المقارنة الزمنية. */
export const windowsOverlap = (a: DateWindow, b: DateWindow): boolean => a.from <= b.to && b.from <= a.to;

/** أول رحلةٍ قائمة تشغل المركبة نفسها في نافذةٍ متداخلة — أو لا شيء.

    الملغاة والمؤرشفة لا تشغل مركبة، والرحلة نفسها (عند التعديل) لا
    تتعارض مع نفسها. المنتهية تُحتسب: حافلةٌ في رحلةٍ انتهت أمس لا تكون
    قد كانت في أخرى أمسِ نفسِه. */
export function findVehicleConflict(
  trips: Trip[],
  probe: Pick<Trip, "transportId" | "departureDate" | "returnDate">,
  excludeId?: string,
): Trip | undefined {
  if (!probe.transportId) return undefined;
  const w = tripWindow(probe);
  if (!w) return undefined;
  return trips
    .filter(t => t.id !== excludeId && t.transportId === probe.transportId
      && t.status !== "cancelled" && t.status !== "archived")
    .filter(t => { const tw = tripWindow(t); return !!tw && windowsOverlap(w, tw); })
    .sort((a, b) => a.departureDate.localeCompare(b.departureDate))[0];
}

/* ═══ أثر الإلغاء ══════════════════════════════════════════════════ */

/** حجزٌ ما زال قائماً — ما تتأثّر به رحلةٌ تُلغى. المرفوض والملغى خرجا
    من الرحلة قبلها، وهو تعريف القاعدة نفسه (status not in cancelled,
    rejected) في resync_trip_seats. */
export const isActiveBooking = (b: Pick<Booking, "status">): boolean =>
  b.status !== "cancelled" && b.status !== "rejected";

export interface CancelImpact {
  /** الحجوزات القائمة على الرحلة — هي مَن يُبلَّغ. */
  bookings: Booking[];
  /** مجموع الأشخاص فيها — المقاعد التي ستُحرَّر. */
  persons: number;
  /** كم حجزٍ صدرت له تذكرةٌ سارية — تُلغيها القاعدة تلقائياً. */
  withTickets: number;
  /** ما دُفع فعلاً (paymentStatus = verified) — مبلغٌ يُردّ أو يُفاوَض عليه. */
  paidTotal: number;
  paidCount: number;
}

/** ما الذي سيُصيبه إلغاء هذه الرحلة؟ يُحسب من المخزن قبل التأكيد:
    «سيؤثر على الحجوزات المرتبطة» جملةٌ لا تُعين على قرار، والأرقام تُعين. */
export function cancelImpact(trip: Pick<Trip, "id">, bookings: Booking[], tickets: TicketEntry[]): CancelImpact {
  const rows = bookings.filter(b => b.tripId === trip.id && isActiveBooking(b));
  const ticketed = new Set(tickets.filter(tk => tk.state !== "cancelled").map(tk => tk.bookingId));
  const paid = rows.filter(b => b.paymentStatus === "verified");
  return {
    bookings: rows,
    persons: rows.reduce((a, b) => a + Math.max(0, b.persons || 0), 0),
    withTickets: rows.filter(b => ticketed.has(b.id)).length,
    paidTotal: paid.reduce((a, b) => a + (b.total || 0), 0),
    paidCount: paid.length,
  };
}

/** نصّ واتساب لعميلٍ واحد بعد إلغاء الرحلة — يُفتح في واتساب ولا يُرسَل
    تلقائياً: الاعتذار يقوله موظفٌ لا نظام. */
export function tripCancelWhatsApp(p: {
  clientName: string; tripLabel: string; departureDate: string; departureTime?: string;
  reason: string; paid?: boolean;
}): string {
  const when = `${shortDate(p.departureDate)}${p.departureTime ? ` · ${p.departureTime}` : ""}`;
  const lines = [
    `السلام عليكم ${firstName(p.clientName)}،`,
    `نعتذر إليكم: أُلغيت رحلة «${p.tripLabel}» المقرّرة يوم ${when}.`,
    `السبب: ${p.reason}.`,
    p.paid
      ? "المبلغ المدفوع محفوظٌ لكم، وسنتواصل معكم بشأن موعدٍ بديل أو استرجاعه."
      : "سنتواصل معكم بشأن موعدٍ بديل إن رغبتم.",
    "تساهيل — خدمة العملاء",
  ];
  return lines.join("\n");
}

const firstName = (name: string): string => (name || "").trim().split(/\s+/)[0] || "عميلنا الكريم";
