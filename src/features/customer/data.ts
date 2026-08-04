/* طبقة بيانات صفحة العميل (anon).
   القراءة عبر repo (يقرأ Supabase كـ anon بعد الـMigration، أو seed محلياً).
   الإرسال عبر RPC عام create_public_booking (أو محلياً في وضع seed). */
import type { Pkg, Trip, Hotel, Transport, Pilgrim, CustomRequest } from "@/types";
import { repo } from "@/data/repository";
import { SEED_PACKAGES } from "@/data/packages";
import { SEED_TRIPS } from "@/data/trips";
import { SEED_HOTELS } from "@/data/hotels";
import { SEED_TRANSPORTS } from "@/data/transports";
import { supabase, isSupabaseEnabled } from "@/supabase/client";
import { useStore } from "@/store/useStore";

export interface Catalog { packages: Pkg[]; trips: Trip[]; hotels: Hotel[]; transports: Transport[]; }

export async function fetchCatalog(): Promise<Catalog> {
  try {
    const [packages, trips, hotels, transports] = await Promise.all([
      repo.packages.list(), repo.trips.list(), repo.hotels.list(), repo.transports.list(),
    ]);
    if (packages.length) return { packages, trips, hotels, transports };
  } catch (e) {
    console.error("[customer] فشل جلب الكتالوج، استخدام seed:", e);
  }
  return { packages: SEED_PACKAGES, trips: SEED_TRIPS, hotels: SEED_HOTELS, transports: SEED_TRANSPORTS };
}

/** المقاعد المحجوزة لرحلة (لتلوينها في الكروكي). */
export async function fetchTakenSeats(tripId: string): Promise<number[]> {
  if (isSupabaseEnabled && supabase) {
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
  seats: number[];
  pilgrims: { name: string; docType?: string; idNumber: string; nationality: string; gender: string; ageGroup?: string; birthDate: string; phone: string; seat?: number }[];
}

/** يعيد رقم الطلب عند النجاح، أو يرمي خطأً (بما فيه نقص المقاعد). */
export async function submitBooking(p: BookingPayload): Promise<string> {
  if (isSupabaseEnabled && supabase) {
    const { data, error } = await supabase.rpc("create_public_booking", { doc: p });
    if (error) {
      const m = /insufficient_seats:(\d+)/.exec(error.message);
      if (m) throw new SeatsError(Number(m[1]));
      throw error;
    }
    return data as string;
  }
  // وضع seed محلي — يضيف للطلبات ويخصم المقاعد داخل الجلسة
  const st = useStore.getState();
  const trip = st.trips.find(t => t.id === p.tripId);
  const avail = trip ? Math.max(0, trip.seats - trip.bookedSeats) : 0;
  if (!trip || p.persons > avail) throw new SeatsError(avail);
  const id = `TRB-${String(Date.now()).slice(-5)}`;
  st.setBookings(prev => [{
    id, tripId: p.tripId, packageId: p.packageId, clientName: p.clientName, clientPhone: p.clientPhone,
    roomType: p.roomType, persons: p.persons, total: p.total, status: "reviewing", paymentStatus: "none",
    seats: p.seats ?? [], createdAt: new Date().toISOString().slice(0, 10), staff: "", source: "public", sentDate: "",
    pilgrims: p.pilgrims.map(x => ({ ...x, gender: x.gender as "male" | "female", docType: x.docType as Pilgrim["docType"], ageGroup: x.ageGroup as Pilgrim["ageGroup"] })),
  }, ...prev]);
  st.setTrips(prev => prev.map(t => t.id === p.tripId ? { ...t, bookedSeats: t.bookedSeats + p.persons } : t));
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
  const id = `CST-${String(Date.now()).slice(-5)}`;
  const row: CustomRequest = {
    ...p, id, status: "new",
    createdAt: new Date().toISOString().slice(0, 16).replace("T", " "),
  };
  useStore.getState().setCustomRequests(prev => [row, ...prev]);
  return id;
}

export class SeatsError extends Error {
  available: number;
  constructor(available: number) { super("insufficient_seats"); this.available = available; }
}

export interface TrackResult { id: string; status: string; paymentStatus: string; packageName: string; tripDate: string; tripTime: string; persons: number; total: number; createdAt?: string; }

/** كل طلبات رقم جوال معيّن — للتتبّع التلقائي بعد الدخول. */
export async function myBookings(phone: string): Promise<TrackResult[]> {
  const ph = phone.replace(/\s/g, "");
  if (isSupabaseEnabled && supabase) {
    const { data, error } = await supabase.rpc("my_public_bookings", { p_phone: ph });
    if (error) { console.error(error); return []; }
    return (data as any[] ?? []).map(r => ({ id: r.id, status: r.status, paymentStatus: r.payment_status, packageName: r.package_name, tripDate: r.trip_date, tripTime: r.trip_time, persons: r.persons, total: r.total, createdAt: r.created_at }));
  }
  const st = useStore.getState();
  return st.bookings.filter(b => b.clientPhone.replace(/\s/g, "") === ph).map(b => {
    const trip = st.trips.find(t => t.id === b.tripId);
    const pkg = st.packages.find(pk => pk.id === (b.packageId || trip?.packageId));
    return { id: b.id, status: b.status, paymentStatus: b.paymentStatus, packageName: pkg?.name ?? "", tripDate: trip?.departureDate ?? "", tripTime: trip?.departureTime ?? "", persons: b.persons, total: b.total, createdAt: b.createdAt };
  });
}

export async function lookupBooking(phone: string, bookingNo: string): Promise<TrackResult | null> {
  if (isSupabaseEnabled && supabase) {
    const { data, error } = await supabase.rpc("lookup_public_booking", { p_phone: phone, p_booking_no: bookingNo });
    if (error) { console.error(error); return null; }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return { id: row.id, status: row.status, paymentStatus: row.payment_status, packageName: row.package_name, tripDate: row.trip_date, tripTime: row.trip_time, persons: row.persons, total: row.total };
  }
  const st = useStore.getState();
  const b = st.bookings.find(x => x.id === bookingNo && x.clientPhone === phone);
  if (!b) return null;
  const trip = st.trips.find(t => t.id === b.tripId);
  const pkg = st.packages.find(pk => pk.id === (b.packageId || trip?.packageId));
  return { id: b.id, status: b.status, paymentStatus: b.paymentStatus, packageName: pkg?.name ?? "", tripDate: trip?.departureDate ?? "", tripTime: trip?.departureTime ?? "", persons: b.persons, total: b.total };
}
