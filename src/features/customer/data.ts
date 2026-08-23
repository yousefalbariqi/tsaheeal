/* طبقة بيانات صفحة العميل (anon).
   القراءة عبر repo (يقرأ Supabase كـ anon بعد الـMigration، أو seed محلياً).
   الإرسال عبر RPC عام create_public_booking (أو محلياً في وضع seed). */
import type { Pkg, Trip, Hotel, Transport, Pilgrim, CustomRequest, BookingRoom } from "@/types";
import { repo } from "@/data/repository";
import { SEED_PACKAGES } from "@/data/packages";
import { SEED_TRIPS } from "@/data/trips";
import { SEED_HOTELS } from "@/data/hotels";
import { SEED_TRANSPORTS } from "@/data/transports";
import { supabase, isSupabaseEnabled } from "@/supabase/client";
import { customerSupabase } from "@/supabase/customerClient";
import { useStore, writeLocalOnly } from "@/store/useStore";
import { waNormalize, newId} from "@/lib/utils";

/* الكتالوج والمقاعد تُقرأ بالعميل المجهول؛ أما إنشاء الحجز وقراءة
   «حجوزاتي» فبعميل المستفيد لأنهما يعتمدان على جلسته الموثّقة. */
const cust = () => customerSupabase ?? supabase!;

/* إنشاء الحجز و«حجوزاتي» يستلزمان جلسة JWT حقيقية: ترحيل 20260806
   يمنح صلاحيتهما لـauthenticated وحدها. القراءة المجهولة (الكتالوج)
   تبقى على Supabase. المسار المحلي أدناه لا يبقى إلا حين تغيب مفاتيح
   Supabase كلياً — أي عرض بلا قاعدة، لا وضع تجريبي على قاعدة حقيقية. */
const hasRealSession = () => isSupabaseEnabled && !!supabase;

/* وضع التجربة: يوقف التحقق من المقاعد في الواجهة والوضع المحلي، فيمكن
   إكمال الحجز على رحلة ممتلئة. التحقق النهائي في قاعدة البيانات منفصل —
   لإيقافه شغّل supabase/migrations/20260807_test_disable_seat_check.sql.
   يُفعَّل بوضع VITE_SKIP_SEAT_CHECK=1 في .env — لا تتركه في الإنتاج. */
export const SKIP_SEAT_CHECK = import.meta.env.VITE_SKIP_SEAT_CHECK === "1";

/** المقاعد المتاحة — تعيد سعة كبيرة في وضع التجربة ليمرّ الحجز دائماً. */
export const availSeats = (t: Pick<Trip, "seats" | "bookedSeats">) =>
  SKIP_SEAT_CHECK ? 99 : Math.max(0, t.seats - t.bookedSeats);

export interface Catalog { packages: Pkg[]; trips: Trip[]; hotels: Hotel[]; transports: Transport[]; }

/* مرجع معلّق: الباقة تشير إلى فندق أو وسيلة نقل لا يعود بها الاستعلام.
   سببه غالباً سياسة قراءة ناقصة في RLS لا بيانات ناقصة — والقراءة المحجوبة
   تعود [] بحالة 200 بلا خطأ، فيسقط القسم من الصفحة صامتاً: `.find()` يعطي
   undefined و`if (transport)` يمنع الرسم. حدث هذا فعلاً مع transports:
   الجدول كان يعود صفراً للعميل بينما hotels يعود بصفّه، فاختفى قسم النقل
   بلا أثر في الطرفية. هذا التحذير يجعل الحالة مرئية. */
function warnDanglingRefs(c: Catalog): void {
  if (!import.meta.env.DEV) return;
  const miss = (kind: string, id: string, from: string) =>
    console.warn(`[customer] ${from} يشير إلى ${kind} «${id}» ولا صفَّ له في الكتالوج — راجع سياسة قراءة anon على الجدول.`);

  for (const p of c.packages) {
    if (p.transportId && !c.transports.some(x => x.id === p.transportId)) miss("نقل", p.transportId, `الباقة ${p.id}`);
    if (p.hotelId && !c.hotels.some(x => x.id === p.hotelId)) miss("فندق", p.hotelId, `الباقة ${p.id}`);
  }
  for (const t of c.trips) {
    if (t.transportId && !c.transports.some(x => x.id === t.transportId)) miss("نقل", t.transportId, `الرحلة ${t.id}`);
  }
}

export async function fetchCatalog(): Promise<Catalog> {
  try {
    const [packages, trips, hotels, transports] = await Promise.all([
      repo.packages.list(), repo.trips.list(), repo.hotels.list(), repo.transports.list(),
    ]);
    if (packages.length) {
      warnDanglingRefs({ packages, trips, hotels, transports });
      return { packages, trips, hotels, transports };
    }
  } catch (e) {
    console.error("[customer] فشل جلب الكتالوج، استخدام seed:", e);
  }
  return { packages: SEED_PACKAGES, trips: SEED_TRIPS, hotels: SEED_HOTELS, transports: SEED_TRANSPORTS };
}

/** المقاعد المحجوزة لرحلة (لتلوينها في الكروكي). */
export async function fetchTakenSeats(tripId: string): Promise<number[]> {
  /* بلا مفاتيح Supabase تُكتب الحجوزات محلياً، فالمقاعد المأخوذة تُقرأ من
     المخزن لا من القاعدة (وإلا ظهرت الرحلة فارغة دائماً). */
  if (hasRealSession()) {
    const { data, error } = await supabase.rpc("trip_taken_seats", { p_trip_id: tripId });
    if (error) { console.error(error); return []; }
    return (data as number[]) ?? [];
  }
  const st = useStore.getState();
  const taken = new Set<number>();
  st.bookings.forEach(b => { if (b.tripId === tripId && b.status !== "cancelled" && b.status !== "rejected") b.seats.forEach(s => taken.add(s)); });
  return [...taken];
}

export interface BookingPayload {
  tripId: string; packageId: string;
  clientName: string; clientPhone: string;
  roomType: string; persons: number; total: number;
  /** توزيع الغرف — يُحفظ في booking_rooms، و roomType يبقى ملخّصه المقروء. */
  rooms?: BookingRoom[];
  seats: number[];
  pilgrims: { name: string; docType?: string; idNumber: string; nationality: string; gender: string; ageGroup?: string; birthDate: string; phone: string; seat?: number }[];
}

/** يعيد رقم الطلب عند النجاح، أو يرمي خطأً (بما فيه نقص المقاعد). */
export async function submitBooking(p: BookingPayload): Promise<string> {
  if (hasRealSession()) {
    const { data, error } = await cust().rpc("create_public_booking", { doc: p });
    if (error) {
      const m = /insufficient_seats:(\d+)/.exec(error.message);
      if (m) throw new SeatsError(Number(m[1]));
      /* هوية ناقصة ≠ مقاعد ناقصة — بلا هذا التفريق تظهر للمستخدم
         رسالة «لم تعد المقاعد كافية» وهو في الحقيقة غير مسجّل. */
      if (/auth_required|phone_unverified/.test(error.message)) throw new AuthRequiredError();
      throw error;
    }
    return data as string;
  }
  /* وضع محلي — يضيف للطلبات ويخصم المقاعد داخل الجلسة. الرحلة قد تغيب
     عن المخزن حين يأتي الكتالوج من Supabase والكتابة محلية؛ في وضع
     التجربة لا يمنع ذلك الحجز. */
  const st = useStore.getState();
  const trip = st.trips.find(t => t.id === p.tripId);
  if (!SKIP_SEAT_CHECK) {
    const avail = trip ? availSeats(trip) : 0;
    if (!trip || p.persons > avail) throw new SeatsError(avail);
  }
  const id = newId("TRB");
  /* writeLocalOnly: هذا الفرع محلي بحكم التصميم. بلا الحاجز كان syncDiff
     ينادي upsert_booking بجلسة عميل فتُرفض، ثم يمحو revert الحجز من
     الشاشة بعد أن رأى المستخدم رقم طلبه — بلا أي تنبيه. */
  writeLocalOnly(() => {
  st.setBookings(prev => [{
    id, tripId: p.tripId, packageId: p.packageId, clientName: p.clientName, clientPhone: p.clientPhone,
    roomType: p.roomType, rooms: p.rooms, persons: p.persons, total: p.total, status: "reviewing", paymentStatus: "none",
    seats: p.seats ?? [], createdAt: new Date().toISOString().slice(0, 10), submittedAt: new Date().toISOString(), staff: "", source: "public", sentDate: "",
    pilgrims: p.pilgrims.map(x => ({ ...x, gender: x.gender as "male" | "female", docType: x.docType as Pilgrim["docType"], ageGroup: x.ageGroup as Pilgrim["ageGroup"] })),
  }, ...prev]);
  st.setTrips(prev => prev.map(t => t.id === p.tripId ? { ...t, bookedSeats: t.bookedSeats + p.persons } : t));
  });
  return id;
}

/* ── الباقة المخصّصة: طلب فقط، لا حجز. يصل للوحة الإدارة ويتواصل الفريق مع العميل. ── */
export interface CustomReqPayload {
  departDate: string; returnDate: string; persons: number;
  destination: string; roomType: string; hotelLevel: string; tripNotes: string;
  name: string; phone: string; city: string; notes: string;
}

/** يعيد رقم الطلب. لا يحجز مقاعد ولا يخصم شيئاً — مجرد تسجيل رغبة. */
export async function submitCustomRequest(p: CustomReqPayload): Promise<string> {
  if (isSupabaseEnabled && supabase) {
    const { data, error } = await supabase.rpc("create_custom_request", { doc: p });
    if (error) throw error;
    return data as string;
  }
  const id = newId("CST");
  const row: CustomRequest = {
    ...p, id, status: "new",
    createdAt: new Date().toISOString().slice(0, 16).replace("T", " "),
  };
  writeLocalOnly(() => useStore.getState().setCustomRequests(prev => [row, ...prev]));
  return id;
}

export class SeatsError extends Error {
  available: number;
  constructor(available: number) { super("insufficient_seats"); this.available = available; }
}

/** الحجز يستلزم جلسة بجوال موثّق — الواجهة توجّه لشاشة الدخول. */
export class AuthRequiredError extends Error {
  constructor() { super("auth_required"); }
}

/** `submittedAt` طابع زمني كامل (ISO)، بخلاف `createdAt` الذي هو تاريخ بلا
    ساعة — وعدّاد الساعتين يحتاج اللحظة لا اليوم. غائب في الحجوزات القديمة
    والداخلية، وحينها يُعرض الوعد نصّاً بلا حلقة. */
export interface TrackResult { id: string; status: string; paymentStatus: string; packageName: string; tripDate: string; tripTime: string; persons: number; total: number; createdAt?: string; submittedAt?: string; }

/** طلبات صاحب الجلسة. الهوية تأتي من الـJWT لا من وسيط — النسخة
    القديمة my_public_bookings(p_phone) كانت تسمح بتعداد حجوزات أي رقم.
    `phoneForSeed` يُستخدم في الوضع المحلي فقط (لا قاعدة بيانات). */
export async function myBookings(phoneForSeed?: string): Promise<TrackResult[]> {
  if (hasRealSession()) {
    const { data, error } = await cust().rpc("my_public_bookings");
    if (error) { console.error(error); return []; }
    return (data as any[] ?? []).map(r => ({ id: r.id, status: r.status, paymentStatus: r.payment_status, packageName: r.package_name, tripDate: r.trip_date, tripTime: r.trip_time, persons: r.persons, total: r.total, createdAt: r.created_at, submittedAt: r.submitted_at ?? undefined }));
  }
  const ph = waNormalize(phoneForSeed ?? "");
  const st = useStore.getState();
  return st.bookings.filter(b => waNormalize(b.clientPhone) === ph).map(b => {
    const trip = st.trips.find(t => t.id === b.tripId);
    const pkg = st.packages.find(pk => pk.id === (b.packageId || trip?.packageId));
    return { id: b.id, status: b.status, paymentStatus: b.paymentStatus, packageName: pkg?.name ?? "", tripDate: trip?.departureDate ?? "", tripTime: trip?.departureTime ?? "", persons: b.persons, total: b.total, createdAt: b.createdAt, submittedAt: b.submittedAt };
  });
}

/* ── صفحة الدفع /pay/:id?t=<token> ──
   الرابط يُفتح من واتساب على جهاز بلا جلسة (وقد يفتحه أحد أفراد الأسرة)،
   فالرمز في الرابط هو حدّ الأمان لا وجود جلسة. */
export interface PayView {
  id: string; clientName: string; packageName: string; roomType: string;
  persons: number; total: number; paymentStatus: string; status: string;
}

export async function fetchBookingForPay(bookingId: string, token: string): Promise<PayView | null> {
  if (isSupabaseEnabled && supabase) {
    const { data, error } = await supabase.rpc("booking_for_pay", { p_booking_id: bookingId, p_token: token });
    if (error) { console.error(error); return null; }
    const r = Array.isArray(data) ? data[0] : data;
    if (!r) return null;
    return { id: r.id, clientName: r.client_name, packageName: r.package_name, roomType: r.room_type,
             persons: r.persons, total: r.total, paymentStatus: r.payment_status, status: r.status };
  }
  const st = useStore.getState();
  const b = st.bookings.find(x => x.id === bookingId);
  if (!b) return null;
  const trip = st.trips.find(t => t.id === b.tripId);
  const pkg = st.packages.find(pk => pk.id === (b.packageId || trip?.packageId));
  return { id: b.id, clientName: b.clientName, packageName: pkg?.name ?? "", roomType: b.roomType,
           persons: b.persons, total: b.total, paymentStatus: b.paymentStatus, status: b.status };
}

/** يرمي عند الفشل — الاستدعاء السابق كان يبتلع الخطأ ويعرض «تم الدفع بنجاح». */
export async function confirmPayment(bookingId: string, token: string): Promise<void> {
  if (isSupabaseEnabled && supabase) {
    const { error } = await supabase.rpc("confirm_payment", { p_booking_id: bookingId, p_token: token });
    if (error) throw error;
    return;
  }
  const st = useStore.getState();
  writeLocalOnly(() => st.setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, paymentStatus: "verified", status: "paid" } : b)));
}
