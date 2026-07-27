/* طبقة بيانات صفحة العميل (anon).
   القراءة عبر repo (يقرأ Supabase كـ anon بعد الـMigration، أو seed محلياً).
   الإرسال عبر RPC عام create_public_booking (أو محلياً في وضع seed). */
import type { Pkg, Trip, Hotel } from "@/types";
import { repo } from "@/data/repository";
import { SEED_PACKAGES } from "@/data/packages";
import { SEED_TRIPS } from "@/data/trips";
import { SEED_HOTELS } from "@/data/hotels";
import { supabase, isSupabaseEnabled } from "@/supabase/client";
import { useStore } from "@/store/useStore";

export interface Catalog { packages: Pkg[]; trips: Trip[]; hotels: Hotel[]; }

export async function fetchCatalog(): Promise<Catalog> {
  try {
    const [packages, trips, hotels] = await Promise.all([
      repo.packages.list(), repo.trips.list(), repo.hotels.list(),
    ]);
    if (packages.length) return { packages, trips, hotels };
  } catch (e) {
    console.error("[customer] فشل جلب الكتالوج، استخدام seed:", e);
  }
  return { packages: SEED_PACKAGES, trips: SEED_TRIPS, hotels: SEED_HOTELS };
}

export interface BookingPayload {
  tripId: string; packageId: string;
  clientName: string; clientPhone: string;
  roomType: string; persons: number; total: number;
  pilgrims: { name: string; idNumber: string; nationality: string; gender: string; birthDate: string; phone: string }[];
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
    seats: [], createdAt: new Date().toISOString().slice(0, 10), staff: "", source: "public", sentDate: "",
    pilgrims: p.pilgrims.map(x => ({ ...x, gender: x.gender as "male" | "female" })),
  }, ...prev]);
  st.setTrips(prev => prev.map(t => t.id === p.tripId ? { ...t, bookedSeats: t.bookedSeats + p.persons } : t));
  return id;
}

export class SeatsError extends Error {
  available: number;
  constructor(available: number) { super("insufficient_seats"); this.available = available; }
}

export interface TrackResult { id: string; status: string; paymentStatus: string; packageName: string; tripDate: string; tripTime: string; persons: number; total: number; }

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
