/* توزيع السكن — تحويل «اختر فئة غرفة» إلى «كيف تريد توزيع الغرف؟».

   المستفيد لا يشتري فئة بل ترتيب نوم: أربعة معتمرين إمّا غرفة سعة أربعة
   أو غرفتان سعة اثنين، وخمسة إمّا غرفة ثلاثة وغرفة اثنين أو خمسة أماكن
   في سكن مشترك. الفئة وحدها لا تقول هذا، وكان النظام يضرب سعر الفئة في
   عدد المعتمرين فيقبل «أربعة أشخاص في فئة الثلاثة» — وهي حالة لا معنى لها.

   وحدة نقيّة بلا React وبلا i18n: تأخذ `t` وسيطاً كما تفعل شاشات المستفيد،
   فتصلح للاستدعاء من الواجهة ومن بناء النص المحفوظ في القاعدة على السواء. */
import type { Pkg, RoomPrice } from "@/types";

/** توزيع مرشَّح: غرف من نوع واحد تستوعب كل المعتمرين. */
export interface RoomSplit {
  /** هوية مستقرّة «النوع|الأحجام» — للاختيار ولمفتاح React.
      لا نستعمل id الفئة: التوزيع قد يكرّر الفئة نفسها (غرفتان سعة 2)
      فتطابق الهوية بالـid كان يُظهر خيارين محدَّدين معاً. */
  key: string;
  /** نوع السكن — لا يُخلط نوعان في توزيع واحد. */
  type: string;
  /** غرفة لكل عنصر، تنازلياً بالسعة. تكرار الفئة = غرفة أخرى منها. */
  rooms: RoomPrice[];
  /** مجموع السعات — قد يفوق عدد المعتمرين (غرفة أكبر بثمنها كاملاً). */
  capacity: number;
  /** أسرّة فائضة = capacity − persons. صفر يعني مطابقة تامّة. */
  spare: number;
  /** سعر الليلة للغرفة/الغرف المختارة قبل ضربه في العدد والليالي. */
  perNight: number;
  /** عدد الغرف من النوع نفسه الذي طلبه العميل. لا علاقة له بعدد المسافرين. */
  roomCount?: number;
}

export interface RoomSplitLimits {
  /** أقصى عدد بطاقات لكل نوع سكن. */
  perType?: number;
  /** سقف نتائج البحث الخام — حارس ضد بيانات إدارية شاذّة. */
  raw?: number;
}

/** خيارات الحجز العام البسيطة.

    صفّ الأسعار هو فئة السكن نفسها: «سكن مشترك · 3 أشخاص» يصف عدد النزلاء
    في الغرفة، لا عدد معتمري الطلب. تظهر كل الفئات المسجلة كما هي، ويُحصّل
    سعر الغرفة المختارة مرة واحدة، بلا توزيع غرف افتراضي.

    الترتيب ثابت لا يتبع ترتيب الإدخال في لوحة الإدارة: المشترك أولاً، ثم
    الخاصة مجموعةً تصاعدياً بعدد الأسرّة (سرير واحد، سريران، ٣، ٤…). كان
    العرض بترتيب الصفوف فيظهر «سريران ثم سرير واحد ثم أربعة» ويتشتّت
    العميل. والمشترك يُباع بالسرير، فلا يُعرض إلا إن اتّسعت أسرّته للمجموعة
    كلها — خمسة لا يسكنون غرفةً من أربعة أسرّة. وترتيب الصفوف في محرّر
    الباقة لم يعد يحكم هذا العرض. */
export function bookingRoomChoices(
  tiers: RoomPrice[] | undefined,
  persons: number,
): RoomSplit[] {
  if (!tiers?.length || !Number.isInteger(persons) || persons < 1) return [];

  // صفّان متماثلان (النوع + سعة الغرفة) لا يصنعان خيارين؛ الأرخص يكفي.
  const choices = new Map<string, RoomPrice>();
  for (const tier of tiers) {
    if (!tier || !(tier.persons > 0) || !(tier.perNight >= 0)) continue;
    const type = tier.type?.trim();
    if (!type) continue;
    const key = `${type}|${tier.persons}`;
    const previous = choices.get(key);
    if (!previous || tier.perNight < previous.perNight) choices.set(key, tier);
  }

  const shared = (tier: RoomPrice) => !isPrivateAccommodation({ type: tier.type.trim() });
  return [...choices.values()]
    // مشتركٌ بسرير واحد صفٌّ قديم من نموذج «سعر السرير» لا غرفةٌ من سرير:
    // سعة غرفته مجهولة، فلا يُحجب عن المجموعة بحجّة الضيق.
    .filter(tier => !shared(tier) || tier.persons <= 1 || tier.persons >= persons)
    .sort((a, b) =>
      Number(shared(b)) - Number(shared(a))
      || a.persons - b.persons
      || a.perNight - b.perNight)
    .map(tier => ({
      key: `${tier.type.trim()}|${tier.persons}`,
      type: tier.type.trim(),
      rooms: [tier],
      capacity: tier.persons,
      spare: 0,
      // الاختيار يبدأ بغرفة واحدة، ويُعدّل العميل العدد للغرف الخاصة.
      perNight: tier.perNight,
      roomCount: 1,
    }));
}

export const roomCountOf = (s: RoomSplit) => Math.max(1, Math.trunc(s.roomCount ?? 1));
export const isPrivateAccommodation = (s: Pick<RoomSplit, "type">) => /خاص|private/i.test(s.type);

/** إجمالي السكن الخاص = سعر الليلة × عدد الغرف × عدد الليالي.
    أما السكن المشترك فسعره سعر السرير للفرد، ولذلك يضرب في عدد المعتمرين.
    عدد الغرف قرار مستقل عن عدد المعتمرين في الغرف الخاصة فقط. */
export const splitTotal = (s: RoomSplit, nights = 1, persons = 1) => {
  const units = isPrivateAccommodation(s)
    ? roomCountOf(s)
    : Math.max(0, Math.trunc(persons) || 0);
  return s.perNight * units * Math.max(1, Math.trunc(nights) || 1);
};

export interface PackagePriceBreakdown {
  seatPrice: number;
  transport: number;
  accommodation: number;
  roomCount: number;
  nights: number;
  total: number;
}

/** سعر الباقة: مقعد لكل شخص + سكن ليلي بعدد الغرف الذي حدده العميل.

    `transportPrice` سعر النقل للفرد ذهاباً وعودةً، ويأتي من الباقة لا من
    صفّ الغرفة: المقعد في الحافلة واحد مهما كان مبيت صاحبه. */
export function packagePrice(
  split: RoomSplit,
  persons: number,
  transportPrice = 0,
  nights = 1,
  /** الأنثى المنفردة تشتري مقعدها ومقعد الخصوصية المجاور. */
  transportUnits = persons,
): PackagePriceBreakdown {
  const seatPrice = Math.max(0, transportPrice || 0);
  const transport = Math.max(0, transportUnits) * seatPrice;
  const roomCount = roomCountOf(split);
  const safeNights = Math.max(1, Math.trunc(nights) || 1);
  const accommodation = splitTotal(split, safeNights, persons);
  return { seatPrice, transport, accommodation, roomCount, nights: safeNights, total: transport + accommodation };
}

/** أقل سعر حقيقي يمكن أن تبدأ منه الباقة لمستفيد واحد.

    رقم بطاقة الاستكشاف يُبنى من معادلة الحجز نفسها، لا من رقم إعلاني
    قديم. بذلك لا يرى العميل سعراً في البطاقة ثم يجد سعراً آخر بعد اختيار
    السكن. الباقة بلا سكن (أو بيانات سكن قديمة ناقصة) تبقى على سعرها
    المعلن كاحتياط. */
export function packageStartingPrice(
  pkg: Pick<Pkg, "marketPrice" | "seatCostOverride" | "nights" | "roomPrices">,
  transportCost = 0,
): number {
  const advertised = Math.max(0, Number(pkg.marketPrice) || 0);
  const nights = Math.max(0, Math.trunc(Number(pkg.nights) || 0));
  const seatPrice = Math.max(0, Number(pkg.seatCostOverride ?? transportCost) || 0);
  if (nights === 0) return advertised;

  const nightly = (pkg.roomPrices ?? [])
    .filter(room => !!room?.type?.trim() && Number(room.persons) > 0 && Number(room.perNight) >= 0)
    .reduce<number | null>((lowest, room) => {
      const price = Number(room.perNight);
      return lowest === null || price < lowest ? price : lowest;
    }, null);

  return nightly === null ? advertised : seatPrice + nightly * Math.max(1, nights);
}

/** وصف فئة واحدة: «غرفة خاصة · 2 أفراد». */
export const roomLabel = (r: RoomPrice, t: (k: string) => string) =>
  r.type + (r.persons ? ` · ${r.persons} ${t("guests")}` : "");

/** سطر واحد يصف التوزيع — للواجهة ولعمود room_type النصّي في القاعدة.

    غرفة واحدة تعيد نفس مخرجات roomLabel حرفاً بحرف، فتبقى الحجوزات
    القديمة والجديدة متشابهة في لوحة الموظف والتذاكر وصفحة الدفع. */
export function splitSummary(s: RoomSplit, t: (k: string) => string): string {
  if (s.rooms.length === 1) return roomLabel(s.rooms[0], t);
  // فئة سعتها فرد ليست غرفة بل سريراً في سكن مشترك: «4 غرف» في سجلّ
  // الحجز كانت تقرأها إدارة التسكين أربع غرف تُحجز، وهي أربعة أسرّة.
  if (s.rooms.every(r => r.persons === 1)) return `${s.type} · ${s.rooms.length} ${t("spotsUnit")}`;
  return `${s.type} · ${s.rooms.length} ${t("roomsUnit")} (${s.rooms.map(r => r.persons).join(" + ")})`;
}

/* ── تسميات العرض ──────────────────────────────────────────────────
   العربية تفرّق المفرد والمثنى والجمع، و«1 غرف» و«2 أسرّة» ركيك يلفت
   النظر إلى الآلة. مفاتيح ثلاثة لكل معدود بدل صيغة واحدة بـ{n}. */

const countOf = (n: number, t: (k: string) => string, one: string, two: string, many: string) =>
  n === 1 ? t(one) : n === 2 ? t(two) : t(many).replace("{n}", String(n));

export const roomsCount = (n: number, t: (k: string) => string) => countOf(n, t, "room1", "room2", "roomsN");
export const bedsCount  = (n: number, t: (k: string) => string) => countOf(n, t, "bed1", "bed2", "bedsN");

/** عنوان البطاقة. فئة سعتها فرد واحد ليست «غرفة» بل مكان في سكن مشترك،
    فـ«أربع غرف» لوصفها مضلّل — وأربعة أماكن هو الوصف الصادق. */
export function splitHeadline(s: RoomSplit, t: (k: string) => string): string {
  if (s.rooms.every(r => r.persons === 1)) return countOf(s.rooms.length, t, "spot1", "spot2", "spotsN");
  return roomsCount(s.rooms.length, t);
}

/** السطر الثاني: شكل الأسرّة. متساوية ⇒ «سريران لكل غرفة»،
    ومختلفة ⇒ تُسرد كما هي «غرفة 3 + غرفة 2» فيُقرأ التفاوت لا يُخمَّن. */
export function splitDetail(s: RoomSplit, t: (k: string) => string): string {
  const sizes = s.rooms.map(r => r.persons);
  if (sizes.every(x => x === 1)) return t("oneBedEach");
  if (new Set(sizes).size === 1) {
    return s.rooms.length === 1
      ? bedsCount(sizes[0], t)
      : `${bedsCount(sizes[0], t)} ${t("perRoom")}`;
  }
  return sizes.map(x => `${t("roomWord")} ${x}`).join(" + ");
}

/** كل تقسيمات المجموع إلى أجزاء من `sizes`، بلا تكرار للترتيب (3+2 = 2+3).

    الأجزاء غير متزايدة داخل كل نتيجة فيَخرج كل تركيب مرة واحدة، والبحث
    بأكبر حجم أولاً فتأتي التوزيعات الأقلّ غرفاً أولاً ويقطع السقف الذيل.

    `atLeast` هو عدد المعتمرين و`maxRooms` سقف الغرف: تجاوز السعة مسموح
    (غرفة أكبر بثمنها كاملاً) لكن غرفةً بلا نزيل ليست خياراً، فعدد الغرف
    لا يفوق عدد المعتمرين. */
function packingsOf(atLeast: number, sizes: number[], maxRooms: number, cap: number): number[][] {
  const desc = [...new Set(sizes)]
    // الصفر لازم استبعاده لا تجميلاً: حقل «عدد الأشخاص» في لوحة الإدارة
    // input رقمي، و Number("") = 0، فصفٌّ بسعة صفر يجعل البحث لا ينتهي.
    .filter(s => Number.isInteger(s) && s > 0)
    .sort((a, b) => b - a);
  if (!desc.length || atLeast <= 0) return [];

  const biggest = desc[0];
  const out: number[][] = [];
  const cur: number[] = [];

  const walk = (rest: number, from: number): void => {
    if (out.length >= cap) return;
    if (rest <= 0) { out.push([...cur]); return; }
    if (cur.length >= maxRooms) return;
    const slots = maxRooms - cur.length;
    // أكبر حجم × الخانات الباقية لا يبلغ المتبقّي — لا فرع هنا يثمر.
    if (biggest * slots < rest) return;
    for (let i = from; i < desc.length; i++) {
      cur.push(desc[i]);
      walk(rest - desc[i], i);   // i لا i+1: تكرار الحجم غرفة أخرى من الفئة
      cur.pop();
      if (out.length >= cap) return;
    }
  };
  walk(atLeast, 0);
  return out;
}

const distinctSizes = (s: RoomSplit) => new Set(s.rooms.map(r => r.persons)).size;

/** يولّد توزيعات السكن الممكنة لعدد معتمرين، مرتّبة ومقصوصة للعرض.

    القاعدة: المطابق التام أولاً، فإن لم يوجد لهذا النوع فأقلّ الخيارات
    فائضاً. لا نخلط الاثنين: لأربعة معتمرين المطابق («غرفة 4» و«غرفتان 2»)
    كافٍ، وإقحام «غرفة 3 + غرفة 2» بسريرٍ فارغ يزيد الحيرة بلا فائدة.
    وحين لا مطابق — مسافر واحد وغرف سعتها 2 و3 و4 — يصير الفائض هو
    الخيار الوحيد الممكن، فيُعرض بثمن الغرفة كاملاً. */
export function roomSplits(
  tiers: RoomPrice[] | undefined,
  persons: number,
  limits: RoomSplitLimits = {},
): RoomSplit[] {
  const perType = limits.perType ?? 4;
  const raw = limits.raw ?? 600;
  if (!tiers?.length || !Number.isInteger(persons) || persons < 1) return [];

  // التجميع بالنوع مع حفظ ترتيب صفوف لوحة الموظف.
  // trim لأن العمود نصّ حرّ، و«غرفة خاصة » ليست نوعاً ثانياً.
  const byType = new Map<string, RoomPrice[]>();
  for (const r of tiers) {
    if (!r || !(r.persons > 0)) continue;
    const k = (r.type ?? "").trim();
    if (!k) continue;
    const list = byType.get(k);
    if (list) list.push(r); else byType.set(k, [r]);
  }

  const out: RoomSplit[] = [];
  for (const [type, group] of byType) {
    // حجم واحد ⇒ فئة واحدة: صفّان بنفس النوع والسعة نأخذ أرخصهما،
    // فيصير الاختيار حتمياً ولا يتغيّر السعر بترتيب صفوف الإدارة.
    const bySize = new Map<number, RoomPrice>();
    for (const r of group) {
      const prev = bySize.get(r.persons);
      if (!prev || r.perNight < prev.perNight) bySize.set(r.persons, r);
    }

    const all = packingsOf(persons, [...bySize.keys()], persons, raw).map(parts => {
      const rooms = parts.map(s => bySize.get(s)!);
      const capacity = parts.reduce((a, s) => a + s, 0);
      return {
        key: `${type}|${parts.join("-")}`,
        type, rooms, capacity,
        spare: capacity - persons,
        perNight: rooms.reduce((a, r) => a + r.perNight, 0),
      };
    });

    const exact = all.filter(s => s.spare === 0);
    if (exact.length) { out.push(...exact); continue; }
    // لا مطابق لهذا النوع — أقلّ فائض ممكن وحده
    const least = Math.min(...all.map(s => s.spare));
    out.push(...all.filter(s => s.spare === least));
  }

  /* الترتيب: أقلّ غرفاً ← أقلّ تنوّعاً في الأحجام ← الأرخص ← معجمياً.
     الثلاثة الأخيرة تكسر التعادل حتماً: المفتاح يغذّي مطابقة React،
     واختيار المستفيد لا ينجو من إعادة الرسم إلا بترتيب ثابت. */
  const order = [...new Set(out.map(s => s.type))];
  const sorted = [...out].sort((a, b) =>
    a.rooms.length - b.rooms.length ||
    distinctSizes(a) - distinctSizes(b) ||
    a.perNight - b.perNight ||
    a.key.localeCompare(b.key));
  return order.flatMap(ty => sorted.filter(s => s.type === ty).slice(0, perType));
}
