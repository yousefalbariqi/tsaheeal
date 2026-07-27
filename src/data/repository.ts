/* طبقة الوصول للبيانات — نقطة الوصل مع قاعدة البيانات.
   - بلا مفاتيح Supabase → seedRepo في الذاكرة (وضع التطوير).
   - مع مفاتيح → مخطط مطبّع بالكامل: القراءة عبر PostgREST embedding،
     والكتابة عبر دوال upsert_<entity>(jsonb) الذرّية. */
import type {
  Hotel, Transport, Pkg, Trip, Booking, Payment,
  TicketEntry, Beneficiary, SystemUser, SupportReq, Branch,
} from "@/types";
import { SEED_HOTELS } from "@/data/hotels";
import { SEED_TRANSPORTS } from "@/data/transports";
import { SEED_PACKAGES } from "@/data/packages";
import { SEED_TRIPS } from "@/data/trips";
import { SEED_BOOKINGS } from "@/data/bookings";
import { SEED_PAYMENTS } from "@/data/payments";
import { SEED_TICKETS } from "@/data/tickets";
import { SEED_BENEFICIARIES } from "@/data/beneficiaries";
import { SEED_USERS } from "@/data/users";
import { SEED_SUPPORT } from "@/data/support";
import { SEED_BRANCHES } from "@/data/branches";
import { supabase, isSupabaseEnabled } from "@/supabase/client";

export interface Repo<T> {
  list(): Promise<T[]>;
  create(row: T): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T>;
  remove(id: string): Promise<void>;
}

/* ─── seed في الذاكرة (وضع بلا مفاتيح) ─── */
function seedRepo<T>(seed: T[], idKey: string = "id"): Repo<T> {
  let rows: T[] = [...seed];
  const keyOf = (r: any) => r[idKey];
  return {
    async list() { return rows; },
    async create(row) { rows = [...rows, row]; return row; },
    async update(id, patch) { rows = rows.map(r => (keyOf(r) === id ? { ...r, ...patch } : r)); return rows.find(r => keyOf(r) === id) as T; },
    async remove(id) { rows = rows.filter(r => keyOf(r) !== id); },
  };
}

/* ─── Supabase (مخطط مطبّع) ─── */
function supaEntity<T>(table: string, idKey: string, select: string, upsertFn: string, fromRow: (r: any) => T): Repo<T> {
  const sb = () => supabase!;
  const write = async (row: any) => { const { error } = await sb().rpc(upsertFn, { doc: row }); if (error) throw error; return row as T; };
  return {
    async list() { const { data, error } = await sb().from(table).select(select); if (error) throw error; return (data ?? []).map(fromRow); },
    async create(row) { return write(row); },
    async update(_id, patch) { return write(patch); },
    async remove(id) { const { error } = await sb().from(table).delete().eq(idKey, id); if (error) throw error; },
  };
}

/* ─── مساعدات التحويل (snake → camel) ─── */
const sortBy = (arr: any[] = []) => [...(arr || [])].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
const mMedia = (r: any) => ({ id: r.item_id, kind: r.kind, url: r.url, primary: !!r.is_primary, category: r.category });
const mReview = (r: any) => ({ id: r.item_id, name: r.name, text: r.text, consent: !!r.consent, image: r.image ?? undefined });
const mIconFeat = (r: any) => ({ id: r.item_id, icon: r.icon, text: r.text });
const mPilgrim = (r: any) => ({ name: r.name, idNumber: r.id_number, nationality: r.nationality, gender: r.gender, birthDate: r.birth_date, phone: r.phone });
const tripSettings = (r: any) => ({
  allowOnlineBooking: !!r.set_allow_online_booking, manualConfirm: !!r.set_manual_confirm,
  waitlistEnabled: !!r.set_waitlist_enabled, requirePaymentFirst: !!r.set_require_payment_first,
  showTicketAfterConfirm: !!r.set_show_ticket_after_confirm,
  paymentDeadlineHours: r.set_payment_deadline_hours, maxPilgrims: r.set_max_pilgrims,
});

/* ─── fromRow لكل كيان ─── */
const hotelFrom = (r: any): Hotel => ({
  id: r.id, name: r.name, city: r.city, stars: r.stars, distanceM: r.distance_m, district: r.district,
  phone: r.phone, mapUrl: r.map_url, status: r.status, notes: r.notes, tasaheelNote: r.tasaheel_note,
  features: sortBy(r.hotel_features).map(mIconFeat),
  reviews: sortBy(r.hotel_reviews).map(mReview),
  media: sortBy(r.hotel_media).map(mMedia),
  roomTypes: sortBy(r.hotel_room_types).map((rt: any) => ({
    id: rt.item_id, kind: rt.kind, beds: rt.beds, pricePerNight: rt.price_per_night,
    photos: sortBy(rt.hotel_room_photos).map(mMedia),
  })),
});
const transportFrom = (r: any): Transport => ({
  id: r.id, name: r.name, mode: r.mode, vehicleType: r.vehicle_type, seats: r.seats, seatCost: r.seat_cost,
  model: r.model, year: r.year, plate: r.plate, driver: r.driver, supervisor: r.supervisor, status: r.status, notes: r.notes,
  features: sortBy(r.transport_features).map((f: any) => ({ id: f.item_id, text: f.text, icon: f.icon ?? undefined })),
  reviews: sortBy(r.transport_reviews).map(mReview),
  media: sortBy(r.transport_media).map(mMedia),
});
const packageFrom = (r: any): Pkg => ({
  id: r.id, name: r.name, order: r.order_no, productType: r.product_type, destination: r.destination, audience: r.audience,
  days: r.days, nights: r.nights, status: r.status, marketPrice: r.market_price,
  seatCostOverride: r.seat_cost_override ?? undefined, coverImage: r.cover_image ?? undefined,
  recurring: !!r.recurring, recurDay: r.recur_day, startDate: r.start_date,
  transportId: r.transport_id ?? "", hotelId: r.hotel_id ?? "", notes: r.notes,
  features: sortBy(r.package_features).map(mIconFeat),
  program: sortBy(r.package_program_stages).map((p: any) => ({ id: p.item_id, order: p.stage_order, icon: p.icon, day: p.day, time: p.time, title: p.title, desc: p.descr, archived: p.archived ?? undefined })),
  roomPrices: sortBy(r.package_room_prices).map((rp: any) => ({ id: rp.item_id, type: rp.type, persons: rp.persons, perNight: rp.per_night, seatCost: rp.seat_cost ?? undefined })),
  reviews: sortBy(r.package_reviews).map(mReview),
  policies: sortBy(r.package_policies).map((x: any) => x.value),
  gallery: sortBy(r.package_gallery).map((x: any) => x.value),
  settings: r.set_allow_online_booking == null ? undefined : tripSettings(r),
});
const tripFrom = (r: any): Trip => ({
  id: r.id, packageId: r.package_id ?? "", transportId: r.transport_id ?? "", hotelId: r.hotel_id ?? "",
  branchId: r.branch_id ?? "", busPlate: r.bus_plate ?? "", busCode: r.bus_code ?? "",
  departureDate: r.departure_date, returnDate: r.return_date, departureTime: r.departure_time,
  departurePoint: r.departure_point, departureMapUrl: r.departure_map_url,
  seats: r.seats, bookedSeats: r.booked_seats, waitingSeats: r.waiting_seats, status: r.status, price: r.price,
  drivers: sortBy(r.trip_drivers).map((d: any) => ({ id: d.item_id, name: d.name, phone: d.phone })),
  settings: tripSettings(r),
});
const bookingFrom = (r: any): Booking => ({
  id: r.id, tripId: r.trip_id ?? "", packageId: r.package_id ?? undefined, clientName: r.client_name, clientPhone: r.client_phone, roomType: r.room_type, persons: r.persons,
  total: r.total, status: r.status, paymentStatus: r.payment_status, payMethod: r.pay_method ?? undefined, txnNo: r.txn_no ?? undefined, payDate: r.pay_date ?? undefined,
  seats: sortBy(r.booking_seats).map((s: any) => s.seat_no),
  createdAt: r.created_at, staff: r.staff, sentDate: r.sent_date,
  createdBy: r.created_by ?? undefined, branchId: r.branch_id ?? undefined, source: r.source ?? undefined,
  pilgrims: sortBy(r.booking_pilgrims).map(mPilgrim),
});
const branchFrom = (r: any): Branch => ({
  id: r.id, name: r.name, city: r.city, address: r.address, gmapUrl: r.gmap_url ?? "", phone: r.phone ?? "",
  managerId: r.manager_id ?? "", isActive: r.is_active !== false, createdAt: r.created_at ?? undefined, updatedAt: r.updated_at ?? undefined,
});
const paymentFrom = (r: any): Payment => ({
  id: r.id, bookingId: r.booking_id ?? "", clientName: r.client_name, clientPhone: r.client_phone, packageName: r.package_name, tripDate: r.trip_date,
  total: r.total, payMethod: r.pay_method, payStatus: r.pay_status, txnNo: r.txn_no, payDate: r.pay_date, createdAt: r.created_at,
  roomType: r.room_type ?? undefined, pilgrims: sortBy(r.payment_pilgrims).map(mPilgrim),
});
const ticketFrom = (r: any): TicketEntry => ({
  ticketNo: r.ticket_no, bookingId: r.booking_id ?? "", clientName: r.client_name, clientPhone: r.client_phone,
  packageName: r.package_name, roomType: r.room_type, tripDate: r.trip_date, tripTime: r.trip_time,
  departurePoint: r.departure_point, persons: r.persons, total: r.total,
  pilgrims: sortBy(r.ticket_pilgrims).map(mPilgrim),
});
const beneficiaryFrom = (r: any): Beneficiary => ({
  id: r.id, name: r.name, phone: r.phone, idNumber: r.id_number, nationality: r.nationality, gender: r.gender, birthDate: r.birth_date,
  rating: r.rating, notes: r.notes, suspended: !!r.suspended,
  bookingIds: sortBy(r.beneficiary_bookings).map((x: any) => x.value),
});
const userFrom = (r: any): SystemUser => ({ id: r.id, name: r.name, email: r.email, role: r.role, status: r.status, lastLogin: r.last_login });
const supportFrom = (r: any): SupportReq => ({ id: r.id, category: r.category, title: r.title, desc: r.descr, priority: r.priority, status: r.status, date: r.date });

/* ─── التركيب: Supabase عند التفعيل، وإلا seed ─── */
const make = <T,>(seed: T[], idKey: string, supa: () => Repo<T>): Repo<T> =>
  isSupabaseEnabled ? supa() : seedRepo<T>(seed, idKey);

export const repo = {
  hotels: make<Hotel>(SEED_HOTELS, "id", () => supaEntity("hotels", "id",
    "*, hotel_features(*), hotel_reviews(*), hotel_media(*), hotel_room_types(*, hotel_room_photos(*))", "upsert_hotel", hotelFrom)),
  transports: make<Transport>(SEED_TRANSPORTS, "id", () => supaEntity("transports", "id",
    "*, transport_features(*), transport_reviews(*), transport_media(*)", "upsert_transport", transportFrom)),
  packages: make<Pkg>(SEED_PACKAGES, "id", () => supaEntity("packages", "id",
    "*, package_features(*), package_program_stages(*), package_room_prices(*), package_reviews(*), package_policies(*), package_gallery(*)", "upsert_package", packageFrom)),
  trips: make<Trip>(SEED_TRIPS, "id", () => supaEntity("trips", "id",
    "*, trip_drivers(*)", "upsert_trip", tripFrom)),
  bookings: make<Booking>(SEED_BOOKINGS, "id", () => supaEntity("bookings", "id",
    "*, booking_pilgrims(*), booking_seats(*)", "upsert_booking", bookingFrom)),
  payments: make<Payment>(SEED_PAYMENTS, "id", () => supaEntity("payments", "id",
    "*, payment_pilgrims(*)", "upsert_payment", paymentFrom)),
  tickets: make<TicketEntry>(SEED_TICKETS, "ticketNo", () => supaEntity("tickets", "ticket_no",
    "*, ticket_pilgrims(*)", "upsert_ticket", ticketFrom)),
  beneficiaries: make<Beneficiary>(SEED_BENEFICIARIES, "id", () => supaEntity("beneficiaries", "id",
    "*, beneficiary_bookings(*)", "upsert_beneficiary", beneficiaryFrom)),
  users: make<SystemUser>(SEED_USERS, "id", () => supaEntity("users", "id", "*", "upsert_user", userFrom)),
  support: make<SupportReq>(SEED_SUPPORT, "id", () => supaEntity("support", "id", "*", "upsert_support", supportFrom)),
  branches: make<Branch>(SEED_BRANCHES, "id", () => supaEntity("branches", "id", "*", "upsert_branch", branchFrom)),
};
