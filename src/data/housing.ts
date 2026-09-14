/* كتالوج السكن — أربعة خيارات ثابتة بدل جدولٍ حرّ.

   قبل هذا كان محرّر الباقة جدولاً يُضاف إليه صفٌّ بنوعٍ من قائمة وعددِ
   أشخاصٍ يُكتب يدوياً. فأمكن أن تُسجَّل «غرفة خاصة · ٧ أشخاص» و«جناح
   عائلي» بلا معنى في الحجز، وصفّان متطابقان بسعرين. والأسوأ أن العميل
   كان يرى كل ما سُجّل: لا شيء يمنع عرض السرير المشترك على امرأة.

   الآن الخيارات معدودة: سريرٌ في غرفة مشتركة، أو غرفةٌ خاصة بسريرين أو
   ثلاثة أو أربعة. والعدد صار داخل الخيار لا حقلاً مستقلاً — وهو الربط
   بين السعر وعدد الأشخاص الذي كان يُعقّد الإعداد.

   ولا ترحيل لقاعدة البيانات: الأربعة تُمثَّل بحقلَي `type` و`persons`
   القائمين في RoomPrice. ما تغيّر هو أن المحرّر لم يعد يكتب فيهما ما
   يشاء، لا أن شكل الصفّ تبدّل. الباقات المسجّلة تُقرأ كما هي. */
import type { RoomPrice, TravellerType } from "@/types";

export const SHARED_TYPE = "سكن مشترك";
export const PRIVATE_TYPE = "غرفة خاصة";

/** الغرف الخاصة بسعاتها الثابتة. الثلاثة تظهر لكل أنواع المسافرين. */
export const PRIVATE_CAPACITIES = [2, 3, 4] as const;
export type PrivateCapacity = (typeof PRIVATE_CAPACITIES)[number];

export type HousingKind = "shared" | "private_2" | "private_3" | "private_4";

/** عدد أسرّة الغرفة المشتركة الافتراضي — يُعدَّل في كل باقة، فالفنادق
    تختلف والعدد يتغيّر كثيراً. */
export const DEFAULT_SHARED_BEDS = 4;
export const SHARED_BEDS_MIN = 2;
export const SHARED_BEDS_MAX = 12;

export const HOUSING_ORDER: HousingKind[] = ["shared", "private_2", "private_3", "private_4"];

export const privateKind = (cap: PrivateCapacity): HousingKind => `private_${cap}` as HousingKind;

/** سعة الخيار: للخاصة ثابتة، وللمشترك عددُ أسرّة الغرفة المسجَّل. */
export function capacityOf(kind: HousingKind, sharedBeds: number): number {
  if (kind === "shared") return clampSharedBeds(sharedBeds);
  return Number(kind.slice("private_".length));
}

export const clampSharedBeds = (n: number): number =>
  Math.min(SHARED_BEDS_MAX, Math.max(SHARED_BEDS_MIN, Math.round(Number(n) || DEFAULT_SHARED_BEDS)));

/** الاسم كما يُعرض في المحرّر وفي بطاقة العميل.

    «سرير في غرفة مشتركة» لا «سكن مشترك»: المشترى سريرٌ واحد لا غرفة،
    والاسم القديم كان يُقرأ وكأن الغرفة كلّها للمشتري. */
export function housingLabel(kind: HousingKind, sharedBeds: number, lang: "ar" | "en" = "ar"): string {
  const cap = capacityOf(kind, sharedBeds);
  if (kind === "shared") {
    return lang === "ar"
      ? `سرير في غرفة مشتركة · ${cap} أسرّة`
      : `Bed in a shared room · ${cap} beds`;
  }
  if (lang === "en") return `Private room · ${cap} beds`;
  return cap === 2 ? "غرفة خاصة · سريران" : `غرفة خاصة · ${cap} أسرّة`;
}

/** السرير المشترك لا يُعرض إلا للرجال.

    امرأةٌ مفردة أو عائلة لا يُعرض عليهما مشاركةُ غرفةٍ مع غرباء — وهذا
    شرطٌ لا تفضيل، فلا يُترك للإدارة أن تُخطئ فيه بتسجيل صفّ. وقبل اختيار
    نوع المسافر (travellerType فارغ) تُخفى كذلك: العرض قبل السؤال يُري
    المرأةَ خياراً سيُسحب منها. */
export function kindAllowedFor(kind: HousingKind, traveller: TravellerType | ""): boolean {
  if (kind !== "shared") return true;
  return traveller === "male_solo";
}

/** صفّ أسعارٍ واحد كما يُحرَّر: الخيار وسعره وهل يُعرض. */
export interface HousingSlot {
  kind: HousingKind;
  /** معرّف صفّ RoomPrice — يُحفظ ليبقى مستقراً بين الحفظات. */
  id: string;
  offered: boolean;
  perNight: number;
  seatCost?: number;
}

const kindOfTier = (r: RoomPrice, sharedBeds: number): HousingKind | null => {
  const type = (r.type ?? "").trim();
  const persons = Number(r.persons);
  if (type === SHARED_TYPE) return "shared";
  if (type !== PRIVATE_TYPE) {
    /* نوعٌ قديم خارج الكتالوج («جناح عائلي»): يُنسب إلى أقرب غرفةٍ خاصة
       بسعته فلا يضيع سعره، بدل أن يُطرح صامتاً. */
    return (PRIVATE_CAPACITIES as readonly number[]).includes(persons) ? privateKind(persons as PrivateCapacity) : null;
  }
  return (PRIVATE_CAPACITIES as readonly number[]).includes(persons) ? privateKind(persons as PrivateCapacity) : null;
};

/** يستخرج عدد أسرّة الغرفة المشتركة من الصفوف المسجَّلة. */
export function readSharedBeds(tiers: RoomPrice[] | undefined): number {
  const row = (tiers ?? []).find(r => (r.type ?? "").trim() === SHARED_TYPE);
  return clampSharedBeds(row?.persons ?? DEFAULT_SHARED_BEDS);
}

/** صفوف القاعدة ⇒ الخيارات الأربعة. غيرُ المسجَّل يظهر مطفأً بسعر صفر،
    فالمحرّر يعرض الأربعة دائماً ولا يخفي ما لم يُسجَّل بعد.

    المطفأ يأخذ `id` فارغاً لا معرّفاً جديداً: توليدُ معرّفٍ في كل قراءة
    يعني معرّفاً مختلفاً في كل رسمة، فيفقد React هويّة الصفّ ويُعاد بناء
    حقل السعر تحت إصبع من يكتب فيه. المعرّف يُولَّد مرّةً عند التشغيل. */
export function readSlots(tiers: RoomPrice[] | undefined): HousingSlot[] {
  const beds = readSharedBeds(tiers);
  const found = new Map<HousingKind, RoomPrice>();
  for (const r of tiers ?? []) {
    const kind = kindOfTier(r, beds);
    if (!kind) continue;
    const prev = found.get(kind);
    // صفّان لنفس الخيار: الأرخص يبقى، كما يفعل العرض للعميل.
    if (!prev || Number(r.perNight) < Number(prev.perNight)) found.set(kind, r);
  }
  return HOUSING_ORDER.map(kind => {
    const row = found.get(kind);
    return {
      kind,
      id: row?.id ?? "",
      offered: !!row,
      perNight: Number(row?.perNight ?? 0),
      seatCost: row?.seatCost,
    };
  });
}

/** الخيارات ⇒ صفوف القاعدة. المطفأ لا يُكتب إطلاقاً: بقاؤه بسعر صفر
    كان يعني ظهوره للعميل مجاناً. */
export function writeSlots(slots: HousingSlot[], sharedBeds: number): RoomPrice[] {
  const beds = clampSharedBeds(sharedBeds);
  return slots.filter(s => s.offered).map(s => ({
    id: s.id,
    type: s.kind === "shared" ? SHARED_TYPE : PRIVATE_TYPE,
    persons: capacityOf(s.kind, beds),
    perNight: Number(s.perNight) || 0,
    ...(s.seatCost === undefined ? {} : { seatCost: s.seatCost }),
  }));
}

/** ما يُعرض للعميل بعد أن اختار نوع المسافر. */
export function tiersForTraveller(tiers: RoomPrice[] | undefined, traveller: TravellerType | ""): RoomPrice[] {
  const beds = readSharedBeds(tiers);
  return (tiers ?? []).filter(r => {
    const kind = kindOfTier(r, beds);
    return kind ? kindAllowedFor(kind, traveller) : false;
  });
}

/** اسم صفٍّ مسجَّل كما يُعرض للعميل — «غرفة خاصة · سريران» لا
    «غرفة خاصة · 2 أشخاص». العدد يوصف بأسرّته لأن المشترى سريرٌ في
    غرفة، و«أشخاص» تصف مَن معك لا ما تنام عليه. */
export function tierLabel(type: string, persons: number, lang: "ar" | "en" = "ar"): string {
  const clean = (type ?? "").trim();
  if (clean === SHARED_TYPE) return housingLabel("shared", persons, lang);
  const cap = Number(persons);
  if ((PRIVATE_CAPACITIES as readonly number[]).includes(cap)) return housingLabel(privateKind(cap as PrivateCapacity), 0, lang);
  /* نوعٌ خارج الكتالوج ما زال مسجَّلاً في باقةٍ قديمة: يُعرض باسمه
     وعدده بدل أن يظهر بلا وصف. */
  return lang === "ar" ? `${clean} · ${cap} أسرّة` : `${clean} · ${cap} beds`;
}
