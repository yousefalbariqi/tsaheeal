/* الكشوفات — صورةٌ تشغيلية تُشتقّ من الحجوزات، لا سجلٌّ يُعَدّ بجانبها.

   ── العلّة ──
   كشف المقاعد وكروكي الباص كانا يُكتبان بيد الموظف في ملفٍّ خارجي: جدولٌ
   يُنسخ فيه اسمُ كل راكب ورقمُ مقعده قبل كل رحلة. وما يُنسخ يتخلّف —
   مقعدٌ نُقل من ١٢ إلى ١٨ في اللوحة يبقى ١٢ في الورقة التي مع السائق،
   وحجزٌ أُلغي أمس يبقى راكباً في الكشف.

   ── المبدأ ──
   مصدرٌ واحد: صفوف `bookings` ومقاعدها. ومنه تُشتقّ ثلاث صور لشيءٍ واحد
   — الجدول والكروكي وورقة الطباعة. فلا مكان لاختلافٍ بينها، ولا خطوة
   «تحديث الكشف» أصلاً: ما في الشاشة هو ما في القاعدة لحظة قراءتها.

   هذا الملف يحمل الاشتقاق وحده — بلا React وبلا ألوان — ليُقرأ ويُختبر
   بمعزلٍ عن الشاشة التي تعرضه. */
import type { Booking, Pilgrim, Trip, TravellerType } from "@/types";
import { buildBusRows } from "@/components/BusSeatGrid";
import { isActiveBooking, tripDeparture, groupByWeek, type Horizon, type TripGroup } from "@/lib/trip";
import { kindOf, isTransportOnly, PRIVATE_TYPE, SHARED_TYPE, type HousingKind } from "@/data/housing";
import { arCount } from "@/features/customer/plural";

/* ═══ الراكب في الكشف ══════════════════════════════════════════════ */

/** راكبٌ واحد كما يُقرأ في الكشف — معتمرٌ ومعه ما يلزم عند الباب.

    الصفّ يجمع ما هو في `booking_pilgrims` وما هو في `bookings`: الاسم
    والهوية والجنس من المعتمر، ورقمُ الطلب وصاحبه وحالته من الحجز. عند
    باب الحافلة يُسأل عن الاثنين معاً. */
export interface ManifestRider {
  seat: number | null;
  name: string;
  gender: "male" | "female";
  ageGroup: "adult" | "child";
  docType?: Pilgrim["docType"];
  idNumber: string;
  nationality: string;
  phone: string;
  /** جوال صاحب الحجز — يُتَّصل به حين لا جوال للراكب (طفلٌ مثلاً). */
  contactPhone: string;
  bookingId: string;
  clientName: string;
  status: Booking["status"];
  travellerType?: TravellerType;
  roomType: string;
  /** ترتيبه داخل حجزه وعدد رفقته — «٢ من ٤». */
  partyIndex: number;
  partySize: number;
}

/** لون كل مقعد من توزيع الحجز، لا من سجل هوية صاحب الطلب. */
const genderAt = (b: Booking, idx: number): "male" | "female" => {
  const c = b.travellerCounts;
  const total = c ? Number(c.men ?? 0) + Number(c.women ?? 0) + Number(c.children ?? 0) : 0;
  if (c && total === Math.max(1, b.persons || 1)) {
    return idx < Number(c.men ?? 0) ? "male" : "female";
  }
  return b.pilgrims[0]?.gender === "female" ? "female" : "male";
};

/** لكل مقعد راكب في الكشف، حتى لو أدخل العميل بيانات صاحب الحجز فقط.
    الاسم يتكرر مؤقتاً لبقية أفراد العائلة؛ هذا أدق من إخفاء مقاعدهم أو
    اختراع هويات لهم، ويسمح للموظف بتوزيعهم كما يختار. */
const riderOf = (b: Booking, idx: number, partySize: number): ManifestRider => {
  const pg = b.pilgrims[idx] ?? b.pilgrims[0];
  return {
  seat: b.seats[idx] ?? pg?.seat ?? null,
  name: (pg?.name || b.clientName || "").trim(),
  gender: genderAt(b, idx),
  ageGroup: pg?.ageGroup === "child" ? "child" : "adult",
  docType: pg?.docType,
  idNumber: (pg?.idNumber || "").trim(),
  nationality: (pg?.nationality || "").trim(),
  phone: (pg?.phone || "").trim(),
  contactPhone: (b.clientPhone || "").trim(),
  bookingId: b.id,
  clientName: (b.clientName || "").trim(),
  status: b.status,
  travellerType: b.travellerType,
  roomType: b.roomType || "",
  partyIndex: idx + 1,
  partySize,
};
};

/* ═══ الحجز في الكشف ═══════════════════════════════════════════════ */

/** حجزٌ واحد ومقاعده — وحدةُ القرار حين يُنقل أحدٌ من مقعدٍ إلى مقعد.

    `contiguous` هو التنبيه الذي لا تعطيه الورقة المنسوخة: أربعةٌ في حجزٍ
    واحد مقاعدهم ٣ و٧ و١٨ و٣١ ليسوا «عائلة جالسة معاً». ترقيم المقاعد
    يمشي صفّاً صفّاً، فتتابعُ الأرقام تجاورٌ في الحافلة. */
export interface ManifestParty {
  bookingId: string;
  clientName: string;
  status: Booking["status"];
  travellerType?: TravellerType;
  roomType: string;
  seats: number[];
  riders: ManifestRider[];
  /** لا مقعد لأحدٍ من الحجز بعد. */
  unseated: boolean;
  /** مقاعده متتابعة — أو حجزٌ لشخصٍ واحد. */
  contiguous: boolean;
}

const contiguous = (seats: number[]): boolean => {
  if (seats.length <= 1) return true;
  const s = [...seats].sort((a, b) => a - b);
  return s[s.length - 1] - s[0] === s.length - 1;
};

/* ═══ الكشف ════════════════════════════════════════════════════════ */

export interface ManifestSummary {
  capacity: number;
  /** ركّابٌ لهم مقاعد. */
  seated: number;
  /** ركّابٌ في حجوزاتٍ قائمة بلا مقعدٍ بعد — عملٌ متبقٍّ لا فراغ. */
  unseated: number;
  free: number;
  /* الجنس والفئة تُعدّ على مَن لهم مقاعد وحدهم، فيصحّ الجمع:
     ذكور + إناث = على مقاعدهم، وهما + الشاغر = السعة. عدُّ مَن لا مقعد
     له معهم كان يجعل مفتاح الكروكي يقول ٥١ في حافلةٍ سعتها ٤٩.
     ومَن ينتظر تخصيصاً يُقرأ في `unseated` وفي قائمته أسفل الكشف. */
  male: number;
  female: number;
  children: number;
  parties: number;
  /** حجوزاتٌ مقاعدها متفرّقة. */
  scattered: number;
}

export interface Manifest {
  trip: Trip;
  /** الركّاب مرتّبين بالمقعد — ترتيب الحافلة لا ترتيب وقت الحجز. */
  riders: ManifestRider[];
  /** ما لم يُخصَّص له مقعد بعد، بترتيب الحجز. */
  waiting: ManifestRider[];
  parties: ManifestParty[];
  /** مقعد ← راكبه. المصدر الذي يقرؤه الكروكي. */
  bySeat: Map<number, ManifestRider>;
  summary: ManifestSummary;
}

/** بناء كشف رحلةٍ واحدة من حجوزاتها.

    ما يدخل الكشف: كل حجزٍ قائم على الرحلة — والقائم ما لم يُلغَ ولم
    يُرفض (`isActiveBooking`). ويدخل معه ما لم تُخصَّص مقاعده بعد: إخفاؤه
    يجعل الكشف يبدو مكتملاً وفي الطلبات ستةٌ تنتظر تعييناً. */
export function buildManifest(trip: Trip, bookings: Booking[]): Manifest {
  const mine = bookings.filter(b => b.tripId === trip.id && isActiveBooking(b));

  const parties: ManifestParty[] = mine.map(b => {
    const partySize = Math.max(1, b.persons || 1, b.seats.length, b.pilgrims.length);
    const riders = Array.from({ length: partySize }, (_, i) => riderOf(b, i, partySize));
    const seats = riders.map(r => r.seat).filter((n): n is number => n != null).sort((a, b2) => a - b2);
    return {
      bookingId: b.id, clientName: (b.clientName || "").trim(), status: b.status,
      travellerType: b.travellerType, roomType: b.roomType || "",
      seats, riders, unseated: seats.length === 0, contiguous: contiguous(seats),
    };
  });

  const all = parties.flatMap(p => p.riders);
  /* الترتيب بالمقعد لا بوقت الحجز: الكشف يُقرأ وقوفاً عند باب الحافلة،
     والسؤال «مَن في المقعد ١٨؟» لا «مَن حجز الثلاثاء؟». */
  const riders = all.filter(r => r.seat != null).sort((a, b) => (a.seat! - b.seat!));
  const waiting = all.filter(r => r.seat == null);

  const bySeat = new Map<number, ManifestRider>();
  /* أوّل مَن نزل على المقعد يبقى فيه: قيد القاعدة يمنع الازدواج
     (20260813)، وهذا حارسٌ للعرض إن قُرئ صفٌّ قديم قبل تنظيفه. */
  for (const r of riders) if (!bySeat.has(r.seat!)) bySeat.set(r.seat!, r);

  const capacity = Math.max(0, trip.seats || 0);
  const summary: ManifestSummary = {
    capacity,
    seated: riders.length,
    unseated: waiting.length,
    free: Math.max(0, capacity - bySeat.size),
    male: riders.filter(r => r.gender === "male").length,
    female: riders.filter(r => r.gender === "female").length,
    children: riders.filter(r => r.ageGroup === "child").length,
    parties: parties.length,
    scattered: parties.filter(p => !p.unseated && !p.contiguous).length,
  };

  return { trip, riders, waiting, parties, bySeat, summary };
}

/** صفوف الكروكي وما في كل مقعد — الهندسة من `buildBusRows` نفسها التي
    تُرسم بها شاشة اختيار المقاعد، فلا يكون للحافلة شكلان. */
export interface CroquisSeat { num: number; rider: ManifestRider | null; }
export function croquisRows(m: Manifest): CroquisSeat[][] {
  return buildBusRows(m.summary.capacity).map(row =>
    row.map(num => ({ num, rider: m.bySeat.get(num) ?? null })));
}

/* ═══ لوحة الإطلاقات ═══════════════════════════════════════════════ */

/** إطلاقاتُ باقةٍ واحدة داخل أسبوع. */
export interface LaunchPackage { packageId: string; packageName: string; trips: Trip[]; }
/** أسبوعٌ وما فيه من باقات. */
export interface LaunchWeek { key: string; label: string; count: number; packages: LaunchPackage[]; }

/** الإطلاقات مجموعةً: الأسبوع ظرفٌ، والباقة عنوانٌ، والإطلاقات تحتها.

    `groupByWeek` وحده كان يعطي قائمةً مسطّحة، فباقة «مكة ٤ أيام» تتكرّر
    ثلاث مرّات في أسبوعٍ واحد — الدمام والخبر والخميس — وكلٌّ منها سطرٌ
    منفصل يُبحث عنه. والعمل على الباقة لا على الإطلاقة: مَن يريد كشوفات
    «مكة ٤ أيام» يريد الثلاثة معاً. فالباقة طبقةٌ بين الأسبوع والإطلاقة،
    وترتيبها داخل الأسبوع بأقربِ إطلاقةٍ فيها. */
export function groupLaunches(
  trips: Trip[], packageName: (id: string) => string,
  horizon: Horizon = "upcoming", now: Date = new Date(),
): LaunchWeek[] {
  return groupByWeek(trips, horizon, now).map((g: TripGroup) => {
    const order: string[] = [];
    const byPkg = new Map<string, Trip[]>();
    /* `groupByWeek` سلّم الرحلات مرتّبةً زمنياً؛ أوّل ظهورٍ لباقةٍ هو
       أقربُ إطلاقةٍ لها، فترتيب الظهور هو الترتيب المطلوب بلا فرزٍ ثانٍ. */
    for (const t of g.trips) {
      const key = t.packageId || "—";
      if (!byPkg.has(key)) { byPkg.set(key, []); order.push(key); }
      byPkg.get(key)!.push(t);
    }
    return {
      key: g.key, label: g.label, count: g.trips.length,
      packages: order.map(id => ({ packageId: id, packageName: packageName(id), trips: byPkg.get(id)! })),
    };
  });
}

/** أقرب إطلاقةٍ لم تنطلق — ما يفتح عليه الموظف الشاشة.

    `nextTrip` في lib/trip يصلح للوحة الرحلات، وهذا يختلف عنه في شيء:
    الملغاة مستبعدة هناك وهنا، لكن هنا تُستبعد كذلك ما لا كشف له — لا
    فرق عملياً اليوم، ويبقى الاسم صادقاً إن اختلفا غداً. */
export function nearestLaunch(trips: Trip[], now: Date = new Date()): Trip | undefined {
  return trips
    .filter(t => t.status !== "cancelled" && t.status !== "archived")
    .sort((a, b) => (tripDeparture(a)?.getTime() ?? Infinity) - (tripDeparture(b)?.getTime() ?? Infinity))[0];
}

/* ═══ العرض ════════════════════════════════════════════════════════ */

export const DOC_LABEL: Record<NonNullable<Pilgrim["docType"]>, string> = {
  national_id: "هوية وطنية", iqama: "إقامة", passport: "جواز",
};

/** «١ / ٤» — موضع الراكب في حجزه. يُكتب للحجوزات الجماعية وحدها. */
export const partyLabel = (r: ManifestRider): string =>
  r.partySize > 1 ? `${r.partyIndex} / ${r.partySize}` : "";

/** عدد المعتمرين بلا مقعد في كل رحلة — مرّةً واحدة لكل الحجوزات.

    لوحة الإطلاقات تعرض عشرات البطاقات، وبناء كشفٍ كامل لكل واحدةٍ منها
    لمجرّد شارةٍ صغيرة إسرافٌ بلا سبب. هذه تمرّ على الحجوزات مرّةً وتعطي
    الرقم الذي تحتاجه البطاقة وحده. */
export function unseatedByTrip(bookings: Booking[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const b of bookings) {
    if (!b.tripId || !isActiveBooking(b)) continue;
    const assigned = new Set<number>([
      ...b.seats,
      ...b.pilgrims.map(pg => pg.seat).filter((seat): seat is number => seat != null),
    ]);
    const n = Math.max(0, Math.max(1, b.persons || 1) - assigned.size);
    if (n) out.set(b.tripId, (out.get(b.tripId) ?? 0) + n);
  }
  return out;
}

/* ═══ كشف السكن ════════════════════════════════════════════════════

   كشفٌ ثانٍ من المصدر نفسه، ووحدتُه غير وحدة كشف المقاعد: هناك السطر
   شخصٌ لأن المقعد يُجلس عليه فردٌ واحد، وهنا السطر حجزٌ لأن الغرفة
   تُسلَّم لمجموعة. وصاحب الحجز هو مَن يقف عند الاستقبال ومعه أهله؛ فرزُهم
   خمسةَ أسطر يجعل موظف الفندق يجمعهم بيده ليعرف كم غرفةً يسلّم.

   وما لا يحتاجه الفندق لا يُطبع له: الهويات والمقاعد والمبالغ في كشف
   المقاعد وفي الفاتورة، ولا مكان لها في ورقةٍ تخرج من عندنا إلى طرفٍ
   ثالث. الكشف هنا: مَن الحاجز، وكم معه، وأي غرفةٍ أخذ. */

/** سطرُ غرفةٍ في حجز — نوعها وأسرّتها وعددها. */
export interface StayRoom {
  key: string;
  type: string;
  /** في الخاصة: أسرّة الغرفة. في المشترك: الأسرّة المبيعة لهذا الحجز. */
  beds: number;
  count: number;
  kind: HousingKind;
  label: string;
  /** سعة الغرفة المشتركة — سياقٌ للفندق، لا يُقرأ عدداً مبيعاً. */
  note?: string;
}

export type StayKind = HousingKind | "none";

/** حجزٌ واحد كما يقرؤه الفندق. */
export interface HousingStay {
  bookingId: string;
  /** اسم الحاجز — صاحب الطلب، لا أوّل معتمرٍ فيه. */
  lead: string;
  /** جوال صاحب الحجز — وسيلة التواصل التي يحتاجها الاستقبال. */
  contactPhone: string;
  persons: number;
  status: Booking["status"];
  travellerType?: TravellerType;
  hotelId: string;
  rooms: StayRoom[];
  /** ملخّص السكن المحفوظ مع الحجز — يُعرض حين لا توزيع مفصَّل. */
  roomText: string;
  kind: StayKind;
  privateRooms: number;
  sharedBeds: number;
  /** له توزيع غرفٍ مسجَّل — وما دونه لا يدخل عدّ الغرف. */
  detailed: boolean;
}

export interface HousingGroup {
  hotelId: string; hotelName: string; city: string;
  persons: number; stays: number;
  privateRooms: number; sharedBeds: number;
  /** حجوزات بلا توزيع غرفٍ مسجَّل — تُذكر كي لا يُقرأ العدّ ناقصاً صامتاً. */
  undetailed: number;
  /** احتياج الفندق مجموعاً: «خاصة · ٤ أسرّة ×٣». */
  needs: StayRoom[];
  rows: HousingStay[];
}

export interface HousingManifest {
  groups: HousingGroup[];
  /** «مواصلات فقط» — ركّابٌ في الحافلة لا نزلاء في الفندق. */
  transportOnly: { stays: number; persons: number };
  totals: { persons: number; stays: number; privateRooms: number; sharedBeds: number };
}

/* معدودات الكشوفات — صيغةٌ واحدة تقرؤها الشاشة والورقة معاً.

   «٢ معتمرين» و«٨ حجز» و«١٢ أسرّة» عجمةٌ تلفت النظر إلى الآلة، وشرطُ
   `n === 1 ? … : …` في كل موضعٍ يُنتج ثلاثاً من الأربع خطأً. القاعدة
   في `features/customer/plural` وهذه صيغها. */
export const AR = {
  person:  { one: "شخص واحد",    two: "شخصان",     few: "أشخاص",   many: "شخصاً",   zero: "لا أحد" },
  stay:    { one: "حجز واحد",    two: "حجزان",     few: "حجوزات",  many: "حجزاً",   zero: "لا حجوزات" },
  launch:  { one: "إطلاقة واحدة", two: "إطلاقتان",  few: "إطلاقات", many: "إطلاقة",  zero: "لا إطلاقات" },
  pilgrim: { one: "معتمر واحد",   two: "معتمران",   few: "معتمرين", many: "معتمراً", zero: "لا معتمرين" },
  bed:     { one: "سرير واحد",    two: "سريران",    few: "أسرّة",   many: "سريراً",  zero: "بلا أسرّة" },
} as const;

/** «غرفة خاصة · ٤ أسرّة» — وصف الغرفة كما يُقرأ عند الاستقبال. */
export const roomLineLabel = (type: string, beds: number): string => `${type} · ${arCount(beds, AR.bed)}`;

/** غرف حجزٍ واحد.

    التوزيع الواحد لا يخلط نوعين — `roomSplits` تبنيه من نوعٍ واحد،
    ومسار المستفيد يختار فئةً واحدة ويكرّرها بعدد الغرف. فيُقرأ النوع من
    أوّل صفّ ولا يُخترع تفسيرٌ لخليطٍ لا ينتجه أيّ من المسارين.

    والفرق بين النوعين ليس تجميلياً: في الخاصة كل صفٍّ غرفةٌ تُسلَّم،
    وفي المشترك الصفّ فئةٌ والمبيع أسرّة بعدد المسافرين. عدُّ صفوف
    المشترك غرفاً كان سيقول «غرفة واحدة» لخمسةٍ ينامون في ثلاث غرف. */
function stayRoomsOf(b: Booking, persons: number): Pick<HousingStay, "rooms" | "kind" | "privateRooms" | "sharedBeds" | "detailed"> {
  const list = b.rooms ?? [];
  if (!list.length) return { rooms: [], kind: "none", privateRooms: 0, sharedBeds: 0, detailed: false };

  if (kindOf(list[0].type) === "shared") {
    const type = list[0].type.trim() || SHARED_TYPE;
    const cap = Math.max(0, list[0].persons || 0);
    return {
      rooms: [{
        key: `shared|${cap}`, type, beds: persons, count: 1, kind: "shared",
        label: roomLineLabel(type, persons),
        note: cap > 1 ? `في غرفٍ سعة ${cap}` : undefined,
      }],
      kind: "shared", privateRooms: 0, sharedBeds: persons, detailed: true,
    };
  }

  const by = new Map<string, StayRoom>();
  for (const r of list) {
    const type = (r.type || "").trim() || PRIVATE_TYPE;
    const beds = Math.max(1, r.persons || 1);
    const key = `${type}|${beds}`;
    const cur = by.get(key);
    if (cur) cur.count += 1;
    else by.set(key, { key, type, beds, count: 1, kind: "private", label: roomLineLabel(type, beds) });
  }
  return {
    rooms: [...by.values()].sort((a, b2) => b2.beds - a.beds),
    kind: "private", privateRooms: list.length, sharedBeds: 0, detailed: true,
  };
}

/** فندقٌ يُنسب إليه حجز. تُمرَّر من الشاشة لأن الاسم والمدينة في المخزن. */
export interface HotelRef { id: string; name: string; city: string }

/** بناء كشف السكن لإطلاقةٍ واحدة.

    الترتيب داخل الفندق: الخاصّة قبل المشتركة، والأكبر سعةً أولاً، ثم
    بالاسم. فالمتماثل يقع متجاوراً — وهو ما يُسلَّم دفعةً واحدة — ويبقى
    الاسم مرتّباً داخل كل نوعٍ فيُلتقط بالعين عند الاستقبال. */
export function buildHousing(
  trip: Trip, bookings: Booking[], hotelFor: (b: Booking) => HotelRef,
): HousingManifest {
  const mine = bookings.filter(b => b.tripId === trip.id && isActiveBooking(b));

  const transportOnly = { stays: 0, persons: 0 };
  const groups = new Map<string, HousingGroup>();

  for (const b of mine) {
    /* عدد الحجز هو المصدر الملزم للنزلاء. سجلات المعتمرين قد تحتوي صاحب
       الطلب وحده، فلا يجوز أن تجعل حجز خمسة أشخاص يظهر نزيلاً واحداً. */
    const persons = Math.max(1, b.persons || b.pilgrims.length || 1);
    /* «مواصلات فقط» ليس نزيلاً: إدراجه يضخّم عدد الفندق بمن لا يبيت فيه. */
    if (isTransportOnly(b.roomType)) {
      transportOnly.stays += 1; transportOnly.persons += persons; continue;
    }

    const hotel = hotelFor(b);
    const stay: HousingStay = {
      bookingId: b.id,
      lead: (b.clientName || "").trim() || b.pilgrims[0]?.name?.trim() || "—",
      contactPhone: (b.clientPhone || "").trim(),
      persons,
      status: b.status,
      travellerType: b.travellerType,
      hotelId: hotel.id,
      roomText: (b.roomType || "").trim(),
      ...stayRoomsOf(b, persons),
    };

    const g = groups.get(hotel.id) ?? {
      hotelId: hotel.id, hotelName: hotel.name, city: hotel.city,
      persons: 0, stays: 0, privateRooms: 0, sharedBeds: 0, undetailed: 0, needs: [], rows: [],
    };
    g.persons += stay.persons; g.stays += 1;
    g.privateRooms += stay.privateRooms; g.sharedBeds += stay.sharedBeds;
    if (!stay.detailed) g.undetailed += 1;
    g.rows.push(stay);
    groups.set(hotel.id, g);
  }

  const rank = (s: HousingStay) => (s.kind === "private" ? 0 : s.kind === "shared" ? 1 : 2);
  const bigger = (s: HousingStay) => s.rooms[0]?.beds ?? 0;

  const out = [...groups.values()];
  for (const g of out) {
    g.rows.sort((a, b) =>
      rank(a) - rank(b) || bigger(b) - bigger(a) || a.lead.localeCompare(b.lead, "ar"));
    /* احتياج الفندق: نفس أسطر الغرف مجموعةً — الخاصّة تُجمع عدداً
       والمشتركة أسرّةً، فلا يُخلط «ثلاث غرف» بـ«ثلاثة أسرّة». */
    const needs = new Map<string, StayRoom>();
    for (const r of g.rows.flatMap(s => s.rooms)) {
      const cur = needs.get(r.key);
      if (!cur) { needs.set(r.key, { ...r }); continue; }
      if (r.kind === "shared") { cur.beds += r.beds; cur.label = roomLineLabel(cur.type, cur.beds); }
      else cur.count += r.count;
    }
    g.needs = [...needs.values()].sort((a, b) => (a.kind === b.kind ? b.beds - a.beds : a.kind === "private" ? -1 : 1));
  }
  out.sort((a, b) => b.persons - a.persons || a.hotelName.localeCompare(b.hotelName, "ar"));

  return {
    groups: out,
    transportOnly,
    totals: {
      persons: out.reduce((a, g) => a + g.persons, 0),
      stays: out.reduce((a, g) => a + g.stays, 0),
      privateRooms: out.reduce((a, g) => a + g.privateRooms, 0),
      sharedBeds: out.reduce((a, g) => a + g.sharedBeds, 0),
    },
  };
}
