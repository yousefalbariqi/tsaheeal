/* كتالوج السكن — النوع والسعة والجمهور، كلّها بيانات.

   مرّت هذه الوحدة بنسخةٍ ضيّقة: أربعة خيارات ثابتة (مشترك ٤، خاصة ٢/٣/٤)
   و«المشترك للرجال» شرطاً مكتوباً في الكود. وكان ذلك خطأ — منع «مشترك
   سريران» وهو بيعٌ قائم، ومنع تخصيص غرفةٍ خاصةٍ للعوائل وحدها، وحوّل
   قراراً تجارياً يتغيّر مع كل فندق إلى سطرٍ يحتاج مبرمجاً لتغييره.

   الآن الصفّ يحمل قراره: نوعه (مشترك/خاص)، وعدد أسرّته، ومن تُعرض عليه.
   فتُبنى أي توليفة — مشترك رجال ٤، مشترك نساء ٦، خاصة للعوائل وحدها —
   من لوحة الإدارة بلا تعديل كود. */
import type { RoomPrice, TravellerType } from "@/types";

export const SHARED_TYPE = "سكن مشترك";
export const PRIVATE_TYPE = "غرفة خاصة";

/** حجزٌ بلا سكن — مقعدٌ في الحافلة وحده.

    ليس نوع سكنٍ ثالثاً بل غيابُه: `create_public_booking` (ترحيل
    20260919) تكتب هذا النصّ في `room_type` وتحذف صفوف `booking_rooms`
    بعد حساب السعر. مكتوبٌ هنا لأن كشف السكن يقرؤه ليستثني صاحبه من
    الفندق، ونصٌّ مكرَّر في شاشةٍ أخرى يتفارق مع القاعدة عند أول تعديل. */
export const TRANSPORT_ONLY_TYPE = "مواصلات فقط";
export const isTransportOnly = (roomType: string): boolean =>
  (roomType ?? "").trim() === TRANSPORT_ONLY_TYPE;

export type HousingKind = "shared" | "private";

export const HOUSING_KINDS: { value: HousingKind; type: string; label: string }[] = [
  { value: "shared",  type: SHARED_TYPE,  label: "سكن مشترك" },
  { value: "private", type: PRIVATE_TYPE, label: "غرفة خاصة" },
];

export const kindOf = (type: string): HousingKind =>
  (type ?? "").trim() === SHARED_TYPE ? "shared" : "private";

export const typeOfKind = (kind: HousingKind): string =>
  kind === "shared" ? SHARED_TYPE : PRIVATE_TYPE;

export const BEDS_MIN = 1;
export const BEDS_MAX = 12;
export const clampBeds = (n: unknown): number =>
  Math.min(BEDS_MAX, Math.max(BEDS_MIN, Math.round(Number(n) || 1)));

/** الجمهور الكامل — ترتيبه ترتيبُ العرض في المحرّر. */
export const AUDIENCE: { value: TravellerType; label: string; short: string }[] = [
  { value: "male_solo",   label: "رجال",  short: "رجال" },
  { value: "female_solo", label: "نساء",  short: "نساء" },
  { value: "family",      label: "عوائل", short: "عوائل" },
];

export const ALL_AUDIENCE: TravellerType[] = AUDIENCE.map(a => a.value);

/** الجمهور المُعلَن للصفّ. الغياب أو الفراغ = الجميع.

    لا نكتب الغياب «لا أحد»: صفٌّ بلا جمهورٍ محدَّد في باقةٍ سُجّلت قبل
    وجود الحقل يعني «لم يُقرَّر بعد» لا «امنعه عن الكل» — وتفسيرُه منعاً
    كان يُخفي سكن الباقات القائمة كلها لحظة النشر. */
export const audienceOf = (r: Pick<RoomPrice, "audience">): TravellerType[] =>
  /* التمييز بين الغياب والفراغ مقصود ولا يجوز اختصاره بـ`?.length`:
     المصفوفة الفارغة قرارٌ صريح («لا أحد») وقعت به الإدارة، وقلبُها إلى
     «الجميع» يَنشُر غرفةً قُصد منعها — وهو عكسُ الخطأ الآمن. */
  r.audience == null ? ALL_AUDIENCE : r.audience;

/** هل يُعرض هذا الصفّ لمن اختار هذا النوع؟

    قبل الاختيار (traveller فارغ) لا يُعرض إلا ما هو للجميع: عرضُ غرفةٍ
    مخصَّصةٍ ثم سحبُها بعد أن يختار المستفيد أسوأ من ألّا تُعرض. */
export function visibleTo(r: Pick<RoomPrice, "audience">, traveller: TravellerType | ""): boolean {
  const aud = audienceOf(r);
  if (!traveller) return aud.length === ALL_AUDIENCE.length;
  return aud.includes(traveller);
}

/** ما يُعرض للعميل بعد أن اختار نوع المسافر. */
export const tiersForTraveller = (
  tiers: RoomPrice[] | undefined,
  traveller: TravellerType | "",
): RoomPrice[] => (tiers ?? []).filter(r => visibleTo(r, traveller));

/** وصفٌ مختصر للجمهور في المحرّر: «الجميع» أو «رجال · نساء». */
export function audienceSummary(r: Pick<RoomPrice, "audience">): string {
  const aud = audienceOf(r);
  if (aud.length === ALL_AUDIENCE.length) return "يُعرض للجميع";
  if (!aud.length) return "لا يُعرض لأحد";
  return AUDIENCE.filter(a => aud.includes(a.value)).map(a => a.short).join(" · ");
}

/** اسم الصفّ كما يُعرض للعميل — «غرفة خاصة · سريران»، «سرير في غرفة
    مشتركة · 4 أسرّة». العدد يوصف بأسرّته لا بـ«أشخاص»: المشترى في
    المشترك سريرٌ واحد، و«٤ أشخاص» كانت تُقرأ وكأن الغرفة كلها له. */
export function tierLabel(type: string, persons: number, lang: "ar" | "en" = "ar"): string {
  const beds = clampBeds(persons);
  if (kindOf(type) === "shared") {
    return lang === "ar" ? `سرير في غرفة مشتركة · ${beds} أسرّة` : `Bed in a shared room · ${beds} beds`;
  }
  if (lang === "en") return `Private room · ${beds} beds`;
  return beds === 1 ? "غرفة خاصة · سرير واحد"
       : beds === 2 ? "غرفة خاصة · سريران"
       : `غرفة خاصة · ${beds} أسرّة`;
}

/** صفٌّ جديد في المحرّر — يبدأ معروضاً للجميع.
    السكن وحده: المواصلات سعرٌ واحد للباقة لا عمودٌ في كل صفّ. */
export const newTier = (id: string): RoomPrice => ({
  id, type: PRIVATE_TYPE, persons: 2, perNight: 0,
  audience: [...ALL_AUDIENCE],
});
