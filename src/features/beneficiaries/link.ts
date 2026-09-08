/* ربط المستفيدين بالحجوزات.

   الملفّان كانا لا يلتقيان: Beneficiary.bookingIds يُملأ يدوياً وحده
   (وفي البيانات التجريبية فقط)، وكل حجز يأتي من التطبيق لا يصل إلى
   أي ملف مستفيد. النتيجة أن شاشة المستفيدين تعرض سبعة أسماء تجريبية
   مهما بلغ عدد الحجوزات الحقيقية، و«حجوزات متكررة» يبقى رقماً ثابتاً،
   وملفّ العميل الذي حجز ثلاث مرات يقول «لا توجد طلبات مسجّلة».

   الربط هنا شقّان مقصودان:

   (١) الاشتقاق للعرض — bookingsOf: تُطابَق الحجوزات بالجوال لحظةَ
       العرض. لا كتابة، فيعمل لكل موظف ويصحّ فوراً على البيانات القائمة.

   (٢) الإنشاء بطلب صريح — planLink/applyLink: يُنشئ الملفات الناقصة
       ويثبّت bookingIds. كتابةٌ في القاعدة، فلا تُنفَّذ في الخلفية بلا
       علم أحد: إنشاء مئة ملفٍّ صامتاً ثم اكتشافها ليس ما يريده أحد،
       وحرس الكتابة (can_write_admin) يردّها لغير المدير على أي حال. */
import type { Beneficiary, Booking, Pilgrim } from "@/types";
import { newId } from "@/lib/utils";

/** يوحّد الجوال للمطابقة. 0501234567 و+966501234567 و966501234567
    شخصٌ واحد؛ المطابقة النصّية الخام تجعلهم ثلاثة. */
export function normPhone(raw: string | undefined): string {
  const d = (raw ?? "").replace(/\D/g, "");
  if (!d) return "";
  /* آخر تسع خانات هي الرقم الوطني بلا رمز الدولة ولا صفر البداية. */
  return d.length >= 9 ? d.slice(-9) : d;
}

const keyOf = (b: { phone?: string; clientPhone?: string }): string =>
  normPhone((b as { phone?: string }).phone ?? (b as { clientPhone?: string }).clientPhone);

/** حجوزات هذا المستفيد — المُثبَّتة في bookingIds والمُطابَقة بالجوال معاً.
    الاتحاد لا الاستبدال: حجزٌ ثُبّت يدوياً لعميلٍ سجّل بجوال آخر
    (حجز نيابةً عن قريب) يجب ألّا يسقط. */
export function bookingsOf(ben: Beneficiary, bookings: Booking[]): Booking[] {
  const k = normPhone(ben.phone);
  const ids = new Set(ben.bookingIds);
  return bookings.filter(bk => ids.has(bk.id) || (!!k && normPhone(bk.clientPhone) === k));
}

/** أول معتمر في الحجز — منه تُؤخذ الهوية والجنسية والميلاد للملف الجديد.
    هو صاحب الطلب: بيانات الحساب تُعبّئ بطاقته أولاً في تطبيق المستفيد. */
const leadPilgrim = (bk: Booking): Pilgrim | undefined => bk.pilgrims?.[0];

export interface LinkPlan {
  /** ملفات ستُنشأ من حجوزات لا ملفَّ لها. */
  create: Beneficiary[];
  /** ملفات قائمة ينقصها ربط حجوزات — (المعرّف، أرقام الحجوزات المضافة). */
  attach: { id: string; add: string[] }[];
  /** عدد الحجوزات التي سيصل لها ملف. */
  bookings: number;
}

export const EMPTY_PLAN: LinkPlan = { create: [], attach: [], bookings: 0 };
export const planIsEmpty = (p: LinkPlan) => !p.create.length && !p.attach.length;

/** يحسب ما يلزم بلا أن يكتب شيئاً — ليُعرض للموظف قبل التنفيذ. */
/** مفتاح الوثيقة — رقمها بلا مسافات؛ أقوى من الجوال: جوالٌ واحد قد يحجز
    لأسرةٍ كاملة، ورقمُ وثيقةٍ لشخصٍ واحد. */
const docKey = (n: string | undefined): string => (n ?? "").replace(/\s/g, "").trim();

export function planLink(bens: Beneficiary[], bookings: Booking[]): LinkPlan {
  const byPhone = new Map<string, Beneficiary>();
  const byDoc = new Map<string, Beneficiary>();
  for (const b of bens) {
    const k = keyOf(b); if (k && !byPhone.has(k)) byPhone.set(k, b);
    const d = docKey(b.idNumber); if (d && !byDoc.has(d)) byDoc.set(d, b);
  }

  /* ملفّات ستُنشأ في هذه الجولة — حجزان لنفس الجوال يُنشئان ملفاً واحداً
     لا ملفّين. بلا هذا يصير العميل الذي حجز ثلاث مرّات ثلاثة أشخاص. */
  const fresh = new Map<string, Beneficiary>();
  const add = new Map<string, Set<string>>();
  let touched = 0;

  for (const bk of bookings) {
    const k = normPhone(bk.clientPhone);
    if (!k) continue;                       // حجز بلا جوال — لا مفتاح للمطابقة
    /* الوثيقة أولاً ثم الجوال — «ألا يدمج الأشخاص اعتماداً على الاسم فقط»:
       الاسم لا يدخل في المطابقة أصلاً. */
    const known = byDoc.get(docKey(leadPilgrim(bk)?.idNumber)) ?? byPhone.get(k);
    if (known) {
      if (known.bookingIds.includes(bk.id)) continue;
      if (!add.has(known.id)) add.set(known.id, new Set());
      add.get(known.id)!.add(bk.id);
      touched++;
      continue;
    }
    const made = fresh.get(k);
    if (made) { made.bookingIds.push(bk.id); touched++; continue; }
    const p = leadPilgrim(bk);
    fresh.set(k, {
      id: newId("BEN"),
      name: bk.clientName || p?.name || "—",
      phone: bk.clientPhone,
      idNumber: p?.idNumber ?? "",
      docType: p?.docType,
      nationality: p?.nationality ?? "",
      gender: p?.gender ?? "male",
      birthDate: p?.birthDate ?? "",
      source: "manual",
      createdFrom: bk.id,
      /* التقييم صفر لا افتراضٌ حسن: التقييم حكم موظفٍ لا قيمة تُخترع. */
      rating: 0,
      notes: "",
      suspended: false,
      bookingIds: [bk.id],
    });
    touched++;
  }

  return {
    create: [...fresh.values()],
    attach: [...add.entries()].map(([id, s]) => ({ id, add: [...s] })),
    bookings: touched,
  };
}

/** يطبّق الخطة على الشريحة. دالة خالصة — الكتابة عند مُنادِيها. */
export function applyLink(bens: Beneficiary[], plan: LinkPlan): Beneficiary[] {
  const patch = new Map(plan.attach.map(a => [a.id, a.add]));
  const merged = bens.map(b => {
    const extra = patch.get(b.id);
    if (!extra?.length) return b;
    return { ...b, bookingIds: [...new Set([...b.bookingIds, ...extra])] };
  });
  return [...merged, ...plan.create];
}

/* ═══ كشف التكرار ═══
   «اكشف التكرار بالجوال + الهوية/الجواز». الاسم لا يدخل: «محمد أحمد»
   اثنان في كل رحلة. زوجٌ واحد لكل ملفَّين وإن تطابقا بالمفتاحَين. */
export interface DupPair { a: Beneficiary; b: Beneficiary; reason: "phone" | "doc" }

export function findDuplicates(bens: Beneficiary[]): DupPair[] {
  const seen = new Set<string>();
  const out: DupPair[] = [];
  const push = (a: Beneficiary, b: Beneficiary, reason: "phone" | "doc") => {
    const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
    if (seen.has(key)) return;
    seen.add(key); out.push({ a, b, reason });
  };
  const byDoc = new Map<string, Beneficiary>();
  const byPhone = new Map<string, Beneficiary>();
  for (const x of bens) {
    const d = docKey(x.idNumber);
    if (d) { const prev = byDoc.get(d); if (prev) push(prev, x, "doc"); else byDoc.set(d, x); }
    const k = normPhone(x.phone);
    if (k && k.length >= 9) { const prev = byPhone.get(k); if (prev) push(prev, x, "phone"); else byPhone.set(k, x); }
  }
  return out;
}

/** يدمج محلياً: يُكمل الفارغ في المُبقى ويجمع الحجوزات — للقاعدة بلا ترحيل. */
export function mergeLocally(keep: Beneficiary, drop: Beneficiary): Beneficiary {
  return {
    ...keep,
    phone: keep.phone || drop.phone,
    contactPhone: keep.contactPhone || drop.contactPhone,
    idNumber: keep.idNumber || drop.idNumber,
    docType: keep.docType || drop.docType,
    docExpiry: keep.docExpiry || drop.docExpiry,
    nationality: keep.nationality || drop.nationality,
    birthDate: keep.birthDate || drop.birthDate,
    notes: [keep.notes, drop.notes].filter(Boolean).join("\n"),
    rating: Math.max(keep.rating || 0, drop.rating || 0),
    bookingIds: [...new Set([...keep.bookingIds, ...drop.bookingIds])],
  };
}
