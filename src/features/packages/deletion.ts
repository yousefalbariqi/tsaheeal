/* أثر حذف الباقة — ما الذي يُمحى معها، وما الذي يبقى معلَّقاً بلا مرجع.

   الباقة ليست صفّاً قائماً بذاته: الرحلات تُطلق منها، والحجوزات تُنسب
   إليها، ومحتواها موزّع على ستّة جداول فرعية. و«احذف» كلمةٌ واحدة تعني
   ثلاثة مصائر مختلفة في القاعدة، والفرق بينها هو الفرق بين تنظيفٍ آمن
   وفسادٍ صامت:

   • **يُمحى معها** — المراحل والغرف والمميزات والسياسات والآراء والصور.
     كلّها `on delete cascade`: ملكٌ للباقة لا معنى له بعدها.

   • **يبقى معلَّقاً** — الرحلة. `trips.package_id` مُعرَّف
     `on delete set null`، فحذف الباقة لا يحذف رحلاتها بل يقطع نسبها:
     تبقى في القاعدة بلا باقة، وتظهر في شاشة الرحلات تحت «بلا باقة»
     واسمها «—». لا خطأ يُرفع ولا رسالة تظهر — الضرر صامتٌ تماماً.

   • **يبقى معلَّقاً بلا حارس أصلاً** — الحجز. `bookings.package_id`
     عمود نصّ بلا مفتاح أجنبي، فلا القاعدة تُفرغه ولا تمنعه: يحتفظ
     بمعرّف باقةٍ لم تعد موجودة. وشاشة المستفيد تبحث عنها فلا تجدها،
     فيرى حجزه بلا اسم باقة ولا برنامج.

   ولأن الضرر في الحالتين الأخيرتين لا يُعلن عن نفسه، يُفحص قبل الحذف
   لا بعده: أيّ رحلةٍ أو حجزٍ مرتبط يمنع الحذف النهائي، والأرشفة تبقى
   متاحةً دائماً — وهي المقصودة في العمل اليومي على كل حال.

   ما لا يتأثّر: التذاكر والفواتير تحفظ `package_name` نصّاً لحظة
   إصدارها لا مرجعاً إلى الصفّ، فوثيقةٌ صدرت تبقى مقروءةً كما صدرت.

   وحدة نقيّة بلا React: يستدعيها حوار الحذف ولوحة الفحص معاً، فلا
   يتفرّق الشرط نسختين — إحداهما تَعِد بما تمنعه الأخرى. */
import type { Pkg, Trip, Booking } from "@/types";
import { tripState, isActiveBooking } from "@/lib/trip";

/** عدٌّ بصيغةٍ عربية سليمة: «رحلة واحدة» · «رحلتان» · «٣ رحلات» · «١١ رحلة».
    الجمع في العربية أربع صيغ لا اثنتان، و«1 رحلات» تُقرأ ركيكةً في
    شاشةٍ يقرؤها موظفٌ كل يوم. */
export function countAr(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  return n <= 10 ? `${n} ${few}` : `${n} ${many}`;
}

export interface TripImpact {
  total: number;
  /** قائمة الآن — مفتوحة أو مكتملة العدد أو جارية. */
  live: number;
  ended: number;
  /** الملغاة والمؤرشفة معاً: كلتاهما خرجت من التشغيل بقرار. */
  cancelled: number;
}

export interface BookingImpact {
  total: number;
  /** ما لم يُلغَ ولم يُرفض — أصحابها ينتظرون رحلةً أو وثيقة. */
  active: number;
  /** ما دُفع وتُحقّق منه فعلاً — مالٌ مقبوض على هذه الباقة. */
  paidTotal: number;
  paidCount: number;
}

/** محتوى الباقة نفسها — يُمحى معها بحكم `on delete cascade`. */
export interface OwnedImpact {
  stages: number;
  rooms: number;
  features: number;
  policies: number;
  reviews: number;
  images: number;
}

export interface PackageDeleteImpact {
  trips: TripImpact;
  bookings: BookingImpact;
  owned: OwnedImpact;
  /** هل يرتبط بالباقة شيءٌ يمنع محوها؟ */
  linked: boolean;
}

/** ما الذي سيُصيبه حذف هذه الباقة؟ يُحسب من المخزن قبل التأكيد.

    ملحوظة على النطاق: المخزن يحمل الصفوف غير المؤرشفة وحدها
    (`archived_at is null` في طبقة القراءة)، فرحلةٌ مؤرشفة مرتبطة بالباقة
    لا تُعدّ هنا وإن كان عمودها سيُفرَّغ في القاعدة. ولهذا تصف الشاشة ما
    تعدّه بأنه «في السجل الحالي» ولا تدّعي إحصاءً شاملاً. */
export function packageDeleteImpact(pkg: Pkg, trips: Trip[], bookings: Booking[], now: Date = new Date()): PackageDeleteImpact {
  const pkgTrips = trips.filter(t => t.packageId === pkg.id);
  const tripIds = new Set(pkgTrips.map(t => t.id));

  const tripImpact: TripImpact = { total: pkgTrips.length, live: 0, ended: 0, cancelled: 0 };
  for (const t of pkgTrips) {
    const state = tripState(t, now);
    if (state === "ended") tripImpact.ended++;
    else if (state === "cancelled" || state === "archived") tripImpact.cancelled++;
    else tripImpact.live++;
  }

  /* الحجز يُنسب إلى الباقة مباشرةً أو عبر رحلته — والعمودان يتفارقان:
     الحجوزات القديمة بلا package_id تُعرف برحلتها وحدها. */
  const rows = bookings.filter(b => b.packageId === pkg.id || (b.tripId && tripIds.has(b.tripId)));
  const paid = rows.filter(b => b.paymentStatus === "verified");
  const bookingImpact: BookingImpact = {
    total: rows.length,
    active: rows.filter(isActiveBooking).length,
    paidTotal: paid.reduce((sum, b) => sum + (b.total || 0), 0),
    paidCount: paid.length,
  };

  const owned: OwnedImpact = {
    stages: (pkg.program ?? []).length,
    rooms: (pkg.roomPrices ?? []).length,
    features: (pkg.features ?? []).length,
    policies: (pkg.policies ?? []).filter(p => p.trim()).length,
    reviews: (pkg.reviews ?? []).length,
    images: (pkg.gallery ?? []).length + (pkg.coverImage ? 1 : 0),
  };

  return {
    trips: tripImpact,
    bookings: bookingImpact,
    owned,
    linked: tripImpact.total > 0 || bookingImpact.total > 0,
  };
}

/* ═══ الصياغة ═════════════════════════════════════════════════════
   نصٌّ واحد للوحة الفحص ولحوار الحذف معاً: لو صيغ كلٌّ في موضعه لقالت
   اللوحة «رحلتان» ويقول الحوار «٢ رحلات» عن الشيء نفسه في شاشةٍ واحدة. */

/** «رحلتان» · «3 رحلات» — مرفوعاً، حين يبتدئ العددُ الجملة. */
export const tripsCount = (n: number): string => countAr(n, "رحلة واحدة", "رحلتان", "رحلات", "رحلة");
export const bookingsCount = (n: number): string => countAr(n, "حجز واحد", "حجزان", "حجوزات", "حجزاً");

/** «رحلتين» · «حجزين» — مجروراً، بعد حرف الجرّ. المثنّى وحده يتغيّر،
    و«على حجزان» خطأٌ يقرؤه كلُّ من يفتح الحوار. */
export const bookingsCountGen = (n: number): string => countAr(n, "حجز واحد", "حجزين", "حجوزات", "حجزاً");

/** تفصيل حالات الرحلات: «واحدة قائمة · واحدة منتهية» · «قائمتان · 3 ملغاة».
    كلّ حالةٍ تُوصف بصيغتها هي — «1 قائمة» داخل قوسَي «رحلتان» ركيكة. */
export function tripsDetail(t: TripImpact): string {
  if (!t.total) return "";
  if (t.total === 1) return t.live ? "قائمة" : t.ended ? "منتهية" : "ملغاة";
  return [
    t.live && countAr(t.live, "واحدة قائمة", "قائمتان", "قائمة", "قائمة"),
    t.ended && countAr(t.ended, "واحدة منتهية", "منتهيتان", "منتهية", "منتهية"),
    t.cancelled && countAr(t.cancelled, "واحدة ملغاة", "ملغاتان", "ملغاة", "ملغاة"),
  ].filter(Boolean).join(" · ");
}

/** تفصيل الحجوزات: «واحد قائم · واحد مدفوع» · «4 قائمة · 2 مدفوعة». */
export function bookingsDetail(b: BookingImpact): string {
  if (!b.total) return "";
  if (b.total === 1) return `${b.active ? "قائم" : "مغلق"}${b.paidCount ? " · مدفوع" : ""}`;
  return [
    countAr(b.active, "واحد قائم", "قائمان", "قائمة", "قائمة"),
    b.paidCount && countAr(b.paidCount, "واحد مدفوع", "مدفوعان", "مدفوعة", "مدفوعة"),
  ].filter(Boolean).join(" · ");
}

/** الموانع بنصّها كما تُعرض في حوار الحذف النهائي.

    كلّ مانعٍ يقول العدد والتفصيل والأثر: «لها 3 رحلات» وحدها لا تُعين
    على قرار، و«قائمتان · واحدة منتهية — تفقد نسبها إلى الباقة» تُعين.

    وأيّ رحلةٍ تمنع — لا القائمة وحدها — لأن المنتهية يُفرَّغ عمودها كما
    يُفرَّغ عمود القائمة تماماً، وسجلّ رحلةٍ مضت بلا باقة لا يُقرأ ولا
    يُدقَّق. الأرشفة تُبقي النسب كلَّها، وهي البديل المعروض. */
export function packageDeleteBlockers(impact: PackageDeleteImpact): string[] {
  const out: string[] = [];
  const { trips, bookings } = impact;

  if (trips.total > 0) {
    const detail = tripsDetail(trips);
    out.push(`لها ${tripsCount(trips.total)}${detail ? ` (${detail})` : ""} — تفقد نسبها إلى الباقة ولا تُحذف معها`);
  }

  if (bookings.total > 0) {
    const detail = bookingsDetail(bookings);
    out.push(`عليها ${bookingsCount(bookings.total)}${detail ? ` (${detail})` : ""} — تبقى بمعرّف باقةٍ لا وجود لها`);
  }

  if (bookings.paidCount > 0) {
    out.push(`فيها مبالغ محصَّلة ومُتحقَّق منها على ${bookingsCountGen(bookings.paidCount)}`);
  }

  return out;
}
