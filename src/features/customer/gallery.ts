/* مُسنِد الصور لصفحة المستفيد.
   بيانات Supabase هي المصدر الأول (pkg.coverImage / pkg.gallery / hotel.media).
   عند غيابها — وهو حال بيانات الـseed حالياً — نبني قائمة حتمية من public/gallery
   حتى لا تظهر الواجهة بصورة واحدة مكرّرة. تختفي هذه الاحتياطية تلقائياً
   بمجرد تعبئة package_gallery في القاعدة، بدون تغيير أي كود. */
import type { Pkg, Hotel, Transport, RoomPrice } from "@/types";

const G = "/gallery";

/** صور الحرم والمعالم — تُوزّع على الباقات حسب ترتيبها لتختلف أغلفتها. */
const LANDMARKS = [
  `${G}/haram-clocktower.jpg`,
  `${G}/haram-drone.jpg`,
  `${G}/haram-pilgrims.jpg`,
  `${G}/haram-crowd.jpg`,
  `${G}/quba.jpg`,
];

/** خلفية بطاقة «رحلة حسب الطلب» في الاستكشاف — لقطة جوية عريضة تصلح شريطاً بعرض
    الشاشة، وهي نفس صورة خلفية شاشة الطلب فيتّصل المسار بصرياً من البطاقة إلى الشاشة. */
export const CUSTOM_TRIP_COVER = `${G}/haram-drone.jpg`;

const HOTEL_SHOTS = [
  `${G}/hotel-elaf-1.jpg`,
  `${G}/hotel-qunwan.jpg`,
  `${G}/hotel-elaf-2.jpg`,
  `${G}/hotel-restaurant.jpg`,
];

/** صور الغرف مفهرسة بعدد الأفراد — تطابق roomPrices[].persons.
    الأولى دائماً غرفة النوم: هي وحدها الصالحة كصورة رئيسية للسكن. */
const ROOM_SHOTS: Record<number, string[]> = {
  2: [`${G}/room-2.jpg`, `${G}/room-2-bath.jpg`, `${G}/room-2-bath-2.jpg`],
  3: [`${G}/room-3.jpg`, `${G}/room-3-b.jpg`, `${G}/room-3-bath.jpg`, `${G}/room-3-bath-2.jpg`],
  4: [`${G}/room-4.jpg`, `${G}/room-4-lounge.jpg`, `${G}/room-4-bath.jpg`],
};

const BUS_SHOTS = [`${G}/bus-exterior.jpg`, `${G}/bus-seat.jpg`];
const BUS_VIDEO = `${G}/bus-video.mp4`;
const COURTYARD = `${G}/courtyard.jpg`;

/** توزيع ثابت لا يعتمد على العشوائية — نفس الباقة تعطي نفس الصور في كل تحميل. */
const pick = <T,>(arr: T[], i: number): T => arr[((i % arr.length) + arr.length) % arr.length];

const dedupe = (urls: (string | undefined)[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) if (u && !seen.has(u)) { seen.add(u); out.push(u); }
  return out;
};

/** غلاف الباقة — يُستخدم في بطاقات الاستكشاف وملخّص المراجعة. */
export function pkgCover(pkg: Pkg): string {
  return pkg.coverImage || pkg.gallery?.[0] || pick(LANDMARKS, pkg.order - 1);
}

/** معرض صفحة التفاصيل: غلاف ← فندق ← غرف الباقة ← نقل. */
export function pkgGallery(pkg: Pkg, hotel?: Hotel, transport?: Transport): string[] {
  const real = dedupe([pkg.coverImage, ...(pkg.gallery ?? [])]);
  if (real.length >= 3) return real;

  const hotelMedia = dedupe((hotel?.media ?? []).filter(m => m.kind === "image").map(m => m.url));
  const offset = pkg.order - 1;

  // صورة واحدة لكل نوع سكن في الباقة، لتعكس ما سيحجزه المستفيد فعلاً
  const roomShots = (pkg.roomPrices ?? []).map((r: RoomPrice, i) => {
    const pool = ROOM_SHOTS[r.persons] ?? ROOM_SHOTS[2];
    return pick(pool, i);
  });

  const transportMedia = dedupe((transport?.media ?? []).filter(m => m.kind === "image").map(m => m.url));

  return dedupe([
    ...real,
    pick(LANDMARKS, offset),
    ...(hotelMedia.length ? hotelMedia : [pick(HOTEL_SHOTS, offset), pick(HOTEL_SHOTS, offset + 1)]),
    ...roomShots,
    ...(transportMedia.length ? transportMedia : BUS_SHOTS),
    pick(LANDMARKS, offset + 2),
  ]).slice(0, 12);
}

/** صورة الفندق في قسم السكن. */
export function hotelCover(hotel?: Hotel, seed = 0): string {
  const primary = hotel?.media?.find(m => m.primary && m.kind === "image")?.url;
  return primary || hotel?.media?.find(m => m.kind === "image")?.url || pick(HOTEL_SHOTS, seed);
}

/** صورة نوع السكن في قائمة الغرف.
    RoomPrice لا يحمل صوراً (بخلاف Hotel.roomTypes) — نختار حسب عدد الأفراد،
    ودائماً الصورة الأولى (غرفة النوم) لا حسب ترتيب الصف، وإلا ظهرت صور حمّامات. */
export function roomCover(room: RoomPrice): string {
  return (ROOM_SHOTS[room.persons] ?? ROOM_SHOTS[2])[0];
}

/** صورة وسيلة النقل في قسم المقاعد. */
export function transportCover(transport?: Transport): string {
  const primary = transport?.media?.find(m => m.primary && m.kind === "image")?.url;
  return primary || transport?.media?.find(m => m.kind === "image")?.url || BUS_SHOTS[0];
}

/* ── وسائط المعارض ────────────────────────────────────────────── */

export interface Media { url: string; kind: "image" | "video"; poster?: string }

const img = (url: string): Media => ({ url, kind: "image" });

/** يحوّل HotelMedia القادمة من القاعدة إلى Media، والأساسية أولاً. */
function fromDb(media?: { kind: string; url: string; primary: boolean }[]): Media[] {
  if (!media?.length) return [];
  const sorted = [...media].sort((a, b) => Number(b.primary) - Number(a.primary));
  return sorted.map(m => ({ url: m.url, kind: m.kind === "video" ? "video" : "image" }));
}

/** معرض الفندق — صوره الخاصة أولاً، ثم غرفه ومطعمه.
    معارض الفنادق الحقيقية تعرض الغرف والمرافق، فضمّها ليس حشواً. */
export function hotelMedia(hotel?: Hotel, seed = 0): Media[] {
  const real = fromDb(hotel?.media);
  if (real.length >= 4) return real;

  const rooms = [ROOM_SHOTS[2][0], ROOM_SHOTS[3][0], ROOM_SHOTS[4][0], ROOM_SHOTS[3][1]];
  return dedupe([
    ...real.map(m => m.url),
    ...HOTEL_SHOTS.map((_, i) => pick(HOTEL_SHOTS, seed + i)),
    ...rooms,
    COURTYARD,
  ]).slice(0, 8).map(img);
}

/** معرض نوع السكن — غرفة النوم أولاً ثم حمّاماتها ومرافقها.
    RoomPrice لا يحمل صوراً، فالاشتقاق من عدد الأفراد هو المتاح. */
export function roomMedia(room: RoomPrice): Media[] {
  const pool = ROOM_SHOTS[room.persons] ?? ROOM_SHOTS[2];
  return dedupe([...pool, pick(HOTEL_SHOTS, room.persons)]).map(img);
}

/** معرض وسيلة النقل — الفيديو بعد الصور، وغلافه صورة الباص الخارجية.
    غير الباصات (`mode: "flight"`) تعيد فارغاً: لا نملك صور طائرات،
    وعرض صور باص على رحلة طيران معلومة خاطئة صريحة. */
export function transportMedia(transport?: Transport): Media[] {
  const real = fromDb(transport?.media);
  if (real.length) return real;
  if (!transport || transport.mode !== "bus") return [];
  return [
    ...BUS_SHOTS.map(img),
    { url: BUS_VIDEO, kind: "video", poster: BUS_SHOTS[0] },
  ];
}
