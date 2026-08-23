/* توزيع السكن — تحويل «اختر فئة غرفة» إلى «كيف تريد توزيع الغرف؟».

   المستفيد لا يشتري فئة بل ترتيب نوم: أربعة معتمرين إمّا غرفة سعة أربعة
   أو غرفتان سعة اثنين، وخمسة إمّا غرفة ثلاثة وغرفة اثنين أو خمسة أماكن
   في سكن مشترك. الفئة وحدها لا تقول هذا، وكان النظام يضرب سعر الفئة في
   عدد المعتمرين فيقبل «أربعة أشخاص في فئة الثلاثة» — وهي حالة لا معنى لها.

   وحدة نقيّة بلا React وبلا i18n: تأخذ `t` وسيطاً كما تفعل شاشات المستفيد،
   فتصلح للاستدعاء من الواجهة ومن بناء النص المحفوظ في القاعدة على السواء. */
import type { RoomPrice } from "@/types";

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
  /** ثمن ليلة واحدة للمجموعة كلها = Σ(سعر الفرد × سعة الغرفة).
      محسوب هنا لا في الواجهة: كان الحساب مكرّراً في ثلاثة مواضع. */
  perNight: number;
}

export interface RoomSplitLimits {
  /** أقصى عدد بطاقات لكل نوع سكن. */
  perType?: number;
  /** سقف نتائج البحث الخام — حارس ضد بيانات إدارية شاذّة. */
  raw?: number;
}

/** إجمالي التوزيع لكامل الإقامة. */
export const splitTotal = (s: RoomSplit, nights: number) => s.perNight * Math.max(1, nights);

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
        perNight: rooms.reduce((a, r) => a + r.perNight * r.persons, 0),
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
