/* جاهزية الفندق — مصدر حقيقةٍ واحد لسؤال «هل يصلح هذا الفندق للنشر؟».

   ثلاث ملاحظاتٍ من الفريق جذرها واحد: الفندق الجديد يبدأ «نشطاً ومتاحاً»
   قبل إدخال الغرف والصور، ولا شيء يمنع نشره بلا نوع غرفةٍ واحد، ولا شيء
   يمنع نشره بلا صورة. ثلاثتها سؤالٌ واحد لم يكن أحدٌ يسأله.

   بُنيت على نمط features/packages/readiness.ts حرفاً بحرف — نفس أنواع
   Check و Readiness ونفس معنى blocking — كي تُقرأ الشاشتان بعقلٍ واحد،
   ويصبح إضافة الكيان الثالث (النقل) نسخاً لا تفكيراً من جديد.

   وحدة نقيّة بلا React: تُستدعى من نموذج الفندق، ومن بطاقة القائمة، ومن
   نموذج الباقة قبل ربط فندقٍ غير منشور. */
import type { Hotel, HotelStatus, RoomType } from "@/types";
import { cleanHotelName } from "@/lib/hotelName";

/** التبويب الذي يُصلَح فيه النقص — قائمة النواقص تقفز إليه. */
export type HotelTab = "info" | "features" | "rooms" | "media" | "reviews";

/* ═══ الغرفة ═══════════════════════════════════════════════════════ */

/** صور الغرفة، مهما كان شكل الصفّ القديم. */
const roomPhotos = (r: RoomType) => (r.photos ?? []).filter(p => !!p.url);

/** غرفةٌ قابلة للبيع: سعةٌ موجبة، وسعرُ ليلةٍ موجب، وصورةٌ واحدة على الأقل.

    الشروط الثلاثة من نصّ الملاحظة: «نوع غرفة واحد على الأقل بسعة وسعر
    وصور». وسعرُ صفرٍ ليس مجّاناً بل صفٌّ لم يُملأ — ولو دخل الحساب لأظهر
    «يبدأ من 0» في صفحة العميل، وهي العلّة نفسها التي أُصلحت في الباقات. */
export const isSellableRoom = (r: RoomType): boolean =>
  (r?.beds ?? 0) > 0 && (r?.pricePerNight ?? 0) > 0 && roomPhotos(r).length > 0;

/** الغرف الصالحة للبيع. */
export const sellableRooms = (h: Pick<Hotel, "roomTypes">) =>
  (h.roomTypes ?? []).filter(isSellableRoom);

/** أقلّ سعر ليلةٍ معروضٍ فعلاً، أو صفر إن لا غرفة صالحة. */
export function fromPricePerNight(h: Pick<Hotel, "roomTypes">): number {
  const prices = sellableRooms(h).map(r => r.pricePerNight);
  return prices.length ? Math.min(...prices) : 0;
}

/* ═══ الصور ════════════════════════════════════════════════════════ */

/** غلاف الفندق: أوّل صورةٍ موسومة أساسيةً، وإلّا أوّل صورة.
    نفس ترتيب البطاقة اليوم — مرفوعٌ إلى وحدةٍ كي لا يتفرّق. */
export function hotelCover(h: Pick<Hotel, "media">): string | undefined {
  const media = (h.media ?? []).filter(m => m.kind === "image" && !!m.url);
  return (media.find(m => m.primary) ?? media[0])?.url;
}

/** رابط موقعٍ يبدو موقعاً فعلاً. لا نتحقّق من صحّة الإحداثيات — لكن
    «قريب من الحرم» في حقل الرابط ليست رابطاً. */
export const isMapUrl = (raw?: string): boolean =>
  /^https?:\/\/[^\s]+$/i.test((raw ?? "").trim());

/* ═══ الشروط ═══════════════════════════════════════════════════════ */

export interface Check {
  key: string;
  /** ما ينقص، بصيغة ما يفعله الموظف لا بصيغة الخطأ. */
  label: string;
  ok: boolean;
  tab: HotelTab;
  /** يمنع النشر — لا مجرّد نقصٍ في النسبة. */
  blocking: boolean;
}

export function hotelChecks(h: Hotel): Check[] {
  const rooms = sellableRooms(h);
  const withPriceAndBeds = (h.roomTypes ?? []).filter(r => (r.beds ?? 0) > 0 && (r.pricePerNight ?? 0) > 0);
  const roomsMissingPhotos = withPriceAndBeds.filter(r => roomPhotos(r).length === 0).length;

  return [
    { key: "name",     label: "اسم الفندق",                      ok: !!cleanHotelName(h.name),        tab: "info",  blocking: true },
    { key: "cover",    label: "صورة أساسية للفندق",               ok: !!hotelCover(h),                 tab: "media", blocking: true },
    { key: "rooms",    label: "نوع غرفة واحد بسعة وسعر وصورة",     ok: rooms.length > 0,                tab: "rooms", blocking: true },
    /* شرطٌ منفصل عن السابق ليقول للموظف أين المشكلة بالضبط: «أدخلتَ
       غرفتين بسعرٍ وسعة، وكلتاهما بلا صورة» أنفع من «لا غرفة صالحة». */
    { key: "roomPhotos", label: roomsMissingPhotos > 0 ? `صور الغرف (${roomsMissingPhotos} بلا صورة)` : "صور الغرف",
                                                                  ok: roomsMissingPhotos === 0,        tab: "rooms", blocking: true },
    { key: "map",      label: "رابط الموقع في خرائط Google",       ok: isMapUrl(h.mapUrl),              tab: "info",  blocking: true },
    { key: "city",     label: "الحي",                             ok: !!(h.district ?? "").trim(),     tab: "info",  blocking: false },
    { key: "features", label: "مرفق واحد على الأقل",               ok: (h.features ?? []).length > 0,   tab: "features", blocking: false },
    { key: "note",     label: "رأي تساهيل (يظهر للعميل)",          ok: !!(h.tasaheelNote ?? "").trim(), tab: "info",  blocking: false },
  ];
}

export interface Readiness {
  checks: Check[];
  /** ما نقص ويمنع النشر. */
  blockers: Check[];
  /** ما نقص ولا يمنع — يُعرض ليُكمَل. */
  warnings: Check[];
  /** 0..100 — نسبة الشروط المستوفاة. */
  percent: number;
  canPublish: boolean;
  fromPrice: number;
  cover?: string;
}

export function hotelReadiness(h: Hotel): Readiness {
  const checks = hotelChecks(h);
  const done = checks.filter(c => c.ok).length;
  const blockers = checks.filter(c => !c.ok && c.blocking);
  return {
    checks,
    blockers,
    warnings: checks.filter(c => !c.ok && !c.blocking),
    percent: checks.length ? Math.round((done / checks.length) * 100) : 0,
    canPublish: blockers.length === 0,
    fromPrice: fromPricePerNight(h),
    cover: hotelCover(h),
  };
}

/** الحالة التي يراها العميل — المتوقف محجوب حتى يُفعّل. */
export const isPublished = (s: HotelStatus): boolean => s === "active";

/** فنادق تصلح للربط بباقةٍ منشورة — يقرؤها نموذج الباقة.

    نموذج الباقة يسرد اليوم كل الفنادق بلا تصفية، فباقةٌ نشطة يمكن أن
    تُربط بفندقٍ متوقّف ويراه العميل. هذه الدالّة تمنع ذلك. */
export const linkableHotels = (hotels: Hotel[]): Hotel[] => hotels.filter(h => isPublished(h.status));
