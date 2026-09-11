/* طبقة الوصول للبيانات — نقطة الوصل مع قاعدة البيانات.
   - بلا مفاتيح Supabase → seedRepo في الذاكرة (وضع التطوير).
   - مع مفاتيح → مخطط مطبّع بالكامل: القراءة عبر PostgREST embedding،
     والكتابة عبر دوال upsert_<entity>(jsonb) الذرّية. */
import type {
  Hotel, Transport, Pkg, Trip, Booking, Payment,
  TicketEntry, Beneficiary, SystemUser, SupportReq, Branch, CustomRequest,
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
import { supabase, isSupabaseEnabled, isSeedDataEnabled } from "@/supabase/client";

export interface Repo<T> {
  list(): Promise<T[]>;
  create(row: T): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T>;
  remove(id: string): Promise<void>;
}

/* سبب الأرشفة يمر من نافذة التأكيد إلى مزامنة Zustand المتفائلة التالية.
   هو قيمة استخدام واحد كي لا ينتقل سبب سجلٍ إلى إجراء لاحق. */
let pendingArchiveReason = "أرشفة من لوحة الإدارة";
export function setArchiveReason(reason: string): void {
  pendingArchiveReason = reason.trim() || pendingArchiveReason;
}

/* الحذف النهائي — استثناءٌ لا إجراءٌ يومي.

   الأرشفة هي الحذف التشغيلي (تُخفي السجل وتُبقيه في التدقيق)، وتمرّ من
   Repo.remove كأي كتابة. أمّا الحذف النهائي فلا يمرّ من المخزن إطلاقاً:
   دالّة القاعدة permanently_delete_entity محروسةٌ بالمدير وتطلب سبباً،
   والسياسات تمنع DELETE المباشر حتى عنه. فتُنادى صريحةً هنا، ثم يُنزع
   الصفّ من المخزن بـwriteLocalOnly — وإلّا قرأت المزامنة الغياب أرشفةً
   فنادت archive_entity على صفٍّ لم يبق له وجود.

   يُرمى الخطأ كما هو: الشاشة تعرض رسالته العربية عبر syncErrorMessage. */
export async function permanentlyDelete(entityType: string, id: string, reason: string): Promise<void> {
  if (!isSupabaseEnabled || !supabase) return;
  const { error } = await supabase.rpc("permanently_delete_entity", {
    entity_type: entityType, entity_id: id, reason: reason.trim(),
  });
  if (error) throw error;
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
/* ── التدهور الرشيق قبل الترحيل ──
   بعض الاستعلامات تضمّن جدولاً فرعياً أُنشئ في ترحيلٍ لاحق (مثل
   payment_items في 20260909). لو نُشرت الواجهة قبل تشغيل الترحيل ردّ
   PostgREST خطأ «العلاقة غير موجودة» فتعطّلت شاشة الفواتير كاملةً — بينما
   الصفوف نفسها موجودة وصالحة. فالعلاقات المُعلَّمة اختياريةً تُسقَط من
   الاستعلام عند فشلها ويُعاد بدونها، وتعود الحقول المشتقّة منها undefined
   وهو ما تتوقّعه المُصرِّفات أصلاً. */
const OPTIONAL_EMBEDS: Record<string, string[]> = {
  payments: ["payment_items(*)"],
};
const isMissingRelation = (e: any): boolean => {
  const code = String(e?.code ?? "");
  const msg = String(e?.message ?? "");
  return code === "PGRST200" || code === "42P01" || /relation|does not exist|Could not find/i.test(msg);
};
function withoutEmbeds(select: string, embeds: string[]): string {
  /* استبدال نصّي لا تعبير نمطي: أسماء العلاقات تحوي أقواساً ونجمة. */
  return embeds.reduce((s, e) => s.replace(`, ${e}`, "").replace(`,${e}`, ""), select);
}

function supaEntity<T>(table: string, idKey: string, select: string, upsertFn: string, fromRow: (r: any) => T, archivable = false): Repo<T> {
  const sb = () => supabase!;
  const write = async (row: any) => { const { error } = await sb().rpc(upsertFn, { doc: row }); if (error) throw error; return row as T; };
  const run = async (sel: string) => {
    let query: any = sb().from(table).select(sel);
    /* الأرشيف لا يظهر كأنه حُذف: صفحات العمل اليومي تقرأ السجل النشط فقط. */
    if (archivable) query = query.is("archived_at", null);
    return query as Promise<{ data: any[] | null; error: any }>;
  };
  return {
    async list() {
      let { data, error } = await run(select);
      const optional = OPTIONAL_EMBEDS[table];
      if (error && optional?.length && isMissingRelation(error)) {
        console.warn(`[repo] ${table}: علاقة اختيارية غائبة (ترحيلٌ لم يُشغَّل بعد) — تُعاد القراءة بدونها.`, error?.message);
        ({ data, error } = await run(withoutEmbeds(select, optional)));
      }
      if (error) throw error;
      return (data ?? []).map(fromRow);
    },
    async create(row) { return write(row); },
    async update(_id, patch) { return write(patch); },
    async remove(id) {
      if (!archivable) throw new Error("الحذف المباشر غير مسموح لهذا الكيان");
      const reason = pendingArchiveReason;
      pendingArchiveReason = "أرشفة من لوحة الإدارة";
      const { error } = await sb().rpc("archive_entity", { entity_type: table, entity_id: id, reason });
      if (error) throw error;
    },
  };
}

/* ─── مساعدات التحويل (snake → camel) ─── */
const sortBy = (arr: any[] = []) => [...(arr || [])].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
const mMedia = (r: any) => ({ id: r.item_id, kind: r.kind, url: r.url, primary: !!r.is_primary, category: r.category });
/* rating وadded_by وbooking_id في package_reviews وحدها؛ في جداول الفنادق
   والنقل تعود undefined بلا ضرر. */
const mReview = (r: any) => ({
  id: r.item_id, name: r.name, text: r.text, consent: !!r.consent, image: r.image ?? undefined,
  rating: r.rating ?? undefined, addedBy: r.added_by ?? undefined, bookingId: r.booking_id ?? undefined,
});
const mIconFeat = (r: any) => ({ id: r.item_id, icon: r.icon, text: r.text });
/* التحقق يُقرأ إن وُجد عموده: قاعدةٌ لم يُنفَّذ عليها ترحيل 20260924 تعيد
   صفوفاً بلا الأعمدة الثلاثة، فيصير كل معتمر «بانتظار التحقق» — وهو
   سلوك الشاشة قبل الترحيل بالضبط. ومعتمرو الفواتير والتذاكر لا أعمدة
   تحقّقٍ لهم أصلاً: نسخةٌ من البيانات وقت الإصدار لا موضع مراجعة. */
const mPilgrim = (r: any) => ({ name: r.name, docType: r.doc_type ?? undefined, idNumber: r.id_number, nationality: r.nationality, gender: r.gender, ageGroup: r.age_group ?? undefined, birthDate: r.birth_date, phone: r.phone, seat: r.seat_no ?? undefined, verify: r.verify ?? undefined, verifiedAt: r.verified_at ?? undefined, verifiedBy: r.verified_by ?? undefined });
const tripSettings = (r: any) => ({
  allowOnlineBooking: !!r.set_allow_online_booking, manualConfirm: !!r.set_manual_confirm,
  waitlistEnabled: !!r.set_waitlist_enabled, requirePaymentFirst: !!r.set_require_payment_first,
  showTicketAfterConfirm: !!r.set_show_ticket_after_confirm,
  paymentDeadlineHours: r.set_payment_deadline_hours, maxPilgrims: r.set_max_pilgrims,
});

/* ─── fromRow لكل كيان ─── */
const hotelFrom = (r: any): Hotel => ({
  id: r.id, name: r.name, city: r.city, stars: r.stars, distanceM: r.distance_m, district: r.district,
  phone: r.phone, mapUrl: r.map_url, status: r.status === "active" ? "active" : "inactive", notes: r.notes, tasaheelNote: r.tasaheel_note,
  contactPerson: r.contact_person ?? undefined, contactPhone: r.contact_phone ?? undefined,
  contractNo: r.contract_no ?? undefined, contractFrom: r.contract_from ?? undefined, contractTo: r.contract_to ?? undefined,
  cancelPolicyInternal: r.cancel_policy_internal ?? undefined,
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
  model: r.model, year: r.year, plate: r.plate, driver: r.driver, supervisor: r.supervisor,
  status: r.status === "active" ? "active" : "inactive", notes: r.notes,
  /* undefined لا "" عند الغياب: الحقل الغائب يختلف عن الحقل المُفرَّغ
     عمداً، وreadiness تقرأ الاثنين ناقصَين فلا فرق عندها — لكن upsert
     يكتب ما يصله، ومصفوفةٌ من "" تدهس قيماً موجودة في القاعدة. */
  serialNo: r.serial_no ?? undefined, operator: r.operator ?? undefined, operatorPhone: r.operator_phone ?? undefined,
  insuranceExpiry: r.insurance_expiry ?? undefined, inspectionExpiry: r.inspection_expiry ?? undefined,
  registrationExpiry: r.registration_expiry ?? undefined, transportLicenseExpiry: r.transport_license_expiry ?? undefined,
  flightNo: r.flight_no ?? undefined, fromAirport: r.from_airport ?? undefined, toAirport: r.to_airport ?? undefined,
  departTime: r.depart_time ?? undefined, arriveTime: r.arrive_time ?? undefined,
  cabinClass: r.cabin_class ?? undefined, baggage: r.baggage ?? undefined,
  features: sortBy(r.transport_features).map((f: any) => ({ id: f.item_id, text: f.text, icon: f.icon ?? undefined })),
  reviews: sortBy(r.transport_reviews).map(mReview),
  media: sortBy(r.transport_media).map(mMedia),
});
const packageFrom = (r: any): Pkg => ({
  id: r.id, name: r.name, order: r.order_no, productType: r.product_type, destination: r.destination, audience: r.audience,
  days: r.days, nights: r.nights, status: r.status, marketPrice: r.market_price,
  seatCostOverride: r.seat_cost_override ?? undefined, coverImage: r.cover_image ?? undefined,
  transportOnlyEnabled: r.transport_only_enabled ?? false, transportOnlyPrice: r.transport_only_price ?? undefined,
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
  /* أعمدة الموجتَين ١ و٢ اختيارية في الصفّ: قبل ترحيلها لا يعيدها select
     فتُقرأ undefined لا null — والنوع يقول اختياري لا فارغ. */
  returnTime: r.return_time ?? undefined, departureAddress: r.departure_address ?? undefined,
  cancelReason: r.cancel_reason ?? undefined, cancelledAt: r.cancelled_at ?? undefined,
  seats: r.seats, bookedSeats: r.booked_seats, waitingSeats: r.waiting_seats, status: r.status, price: r.price,
  drivers: sortBy(r.trip_drivers).map((d: any) => ({ id: d.item_id, name: d.name, phone: d.phone })),
  settings: tripSettings(r),
});
const bookingFrom = (r: any): Booking => ({
  id: r.id, tripId: r.trip_id ?? "", packageId: r.package_id ?? undefined, clientName: r.client_name, clientPhone: r.client_phone, roomType: r.room_type, persons: r.persons,
  total: r.total, status: r.status, paymentStatus: r.payment_status, payMethod: r.pay_method ?? undefined, txnNo: r.txn_no ?? undefined, payDate: r.pay_date ?? undefined,
  seats: sortBy(r.booking_seats).map((s: any) => s.seat_no),
  /* undefined لا [] عند الغياب: upsert_booking لا يمسّ الغرف إلا إذا حمل
     المستند مفتاح rooms، ومصفوفة فارغة كانت ستُقرأ «امسح التوزيع». */
  rooms: r.booking_rooms?.length
    ? sortBy(r.booking_rooms).map((x: any) => ({ tierId: x.tier_id ?? undefined, type: x.type, persons: x.persons, perNight: x.per_night }))
    : undefined,
  createdAt: r.created_at, submittedAt: r.submitted_at ?? undefined, staff: r.staff, sentDate: r.sent_date,
  createdBy: r.created_by ?? undefined, branchId: r.branch_id ?? undefined, source: r.source ?? undefined,
  customerId: r.customer_id ?? undefined, payToken: r.pay_token ?? undefined,
  assignedTo: r.assigned_to ?? undefined, assignedAt: r.assigned_at ?? undefined,
  closedReason: r.closed_reason ?? undefined,
  discountPercent: r.discount_percent == null ? undefined : Number(r.discount_percent),
  discountReason: r.discount_reason ?? undefined, discountBy: r.discount_by ?? undefined, discountAt: r.discount_at ?? undefined,
  /* ملف الحساب مضمَّن عبر المفتاح الأجنبي customer_id — للقراءة فقط.
     upsert_booking لا يكتب customer_id، فتعديل الموظف لا يفصل الربط. */
  customer: r.customer ? {
    firstName: r.customer.first_name ?? "", lastName: r.customer.last_name ?? "",
    birthDate: r.customer.birth_date ?? undefined, email: r.customer.email ?? undefined,
    phone: r.customer.phone ?? undefined,
  } : undefined,
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
  /* الافتراض «صادرة» لا undefined: قاعدةٌ لم يُنفَّذ عليها ترحيل الموجة ٢
     تعيد صفوفاً بلا هذه الأعمدة، والشاشة يجب أن تعمل قبله. */
  state: r.state ?? "issued",
  dueAt: r.due_at ?? undefined,
  cancelReason: r.cancel_reason ?? undefined, cancelledAt: r.cancelled_at ?? undefined,
  refundAmount: r.refund_amount ?? undefined, refundStatus: r.refund_status ?? undefined,
  refundRef: r.refund_ref ?? undefined, refundAt: r.refund_at ?? undefined,
  serialNo: r.serial_no == null ? undefined : Number(r.serial_no),
  items: r.payment_items?.length
    ? sortBy(r.payment_items).map((x: any) => ({
        kind: x.kind, label: x.label, amount: Number(x.amount),
        qty: x.qty ?? undefined, unitPrice: x.unit_price ?? undefined,
      }))
    : undefined,
});
const ticketFrom = (r: any): TicketEntry => ({
  ticketNo: r.ticket_no, bookingId: r.booking_id ?? "", clientName: r.client_name, clientPhone: r.client_phone,
  packageName: r.package_name, roomType: r.room_type, tripDate: r.trip_date, tripTime: r.trip_time,
  departurePoint: r.departure_point, persons: r.persons, total: r.total,
  pilgrims: sortBy(r.ticket_pilgrims).map(mPilgrim),
  state: r.state ?? "valid",
  usedAt: r.used_at ?? undefined, scanCount: r.scan_count ?? undefined,
  cancelReason: r.cancel_reason ?? undefined, cancelledAt: r.cancelled_at ?? undefined,
  issuedAt: r.issued_at ?? undefined, issuedBy: r.issued_by ?? undefined,
});
const beneficiaryFrom = (r: any): Beneficiary => ({
  id: r.id, name: r.name, phone: r.phone ?? "", idNumber: r.id_number ?? "", nationality: r.nationality ?? "", gender: r.gender, birthDate: r.birth_date ?? "",
  rating: r.rating ?? 0, notes: r.notes ?? "", suspended: !!r.suspended,
  bookingIds: sortBy(r.beneficiary_bookings).map((x: any) => x.value),
  docType: r.doc_type ?? undefined, docExpiry: r.doc_expiry ?? undefined, docImage: r.doc_image_url ?? undefined,
  contactPhone: r.contact_phone ?? undefined, source: r.source ?? undefined, createdFrom: r.created_from ?? undefined,
});
const userFrom = (r: any): SystemUser => ({ id: r.id, name: r.name, email: r.email, role: r.role, status: r.status, lastLogin: r.last_login || "—", branchId: r.branch_id ?? undefined });
const customReqFrom = (r: any): CustomRequest => ({
  id: r.id, departDate: r.depart_date ?? "", returnDate: r.return_date ?? "", persons: r.persons ?? 1,
  destination: r.destination ?? "", roomType: r.room_type ?? "", hotelLevel: r.hotel_level ?? "",
  tripNotes: r.trip_notes ?? "", name: r.name ?? "", phone: r.phone ?? "", city: r.city ?? "",
  notes: r.notes ?? "", status: r.status ?? "new", createdAt: r.created_at ?? "", staff: r.staff ?? undefined,
  assignedTo: r.assigned_to ?? undefined, assignedAt: r.assigned_at ?? undefined, dueAt: r.due_at ?? undefined,
  closeReason: r.close_reason ?? undefined,
});
const supportFrom = (r: any): SupportReq => ({
  id: r.id, category: r.category, title: r.title, desc: r.descr, priority: r.priority, status: r.status, date: r.date,
  /* أعمدة ترحيل 20260913 — قاعدةٌ لم تنفّذه تعيد الصفّ بلا هذه المفاتيح، فتُقرأ undefined لا خطأً. */
  createdAt: r.created_at ?? undefined, createdBy: r.created_by ?? undefined,
  attachments: Array.isArray(r.attachments) && r.attachments.length ? r.attachments : undefined,
  assignedTo: r.assigned_to ?? undefined, assignedAt: r.assigned_at ?? undefined,
  resolvedAt: r.resolved_at ?? undefined, closedAt: r.closed_at ?? undefined,
  resolution: r.resolution ?? undefined,
});

/* ─── التركيب: Supabase عند التفعيل، وإلا seed ─── */
const make = <T,>(seed: T[], idKey: string, supa: () => Repo<T>): Repo<T> =>
  isSupabaseEnabled ? supa() : seedRepo<T>(isSeedDataEnabled ? seed : [], idKey);

export const repo = {
  hotels: make<Hotel>(SEED_HOTELS, "id", () => supaEntity("hotels", "id",
    "*, hotel_features(*), hotel_reviews(*), hotel_media(*), hotel_room_types(*, hotel_room_photos(*))", "upsert_hotel", hotelFrom, true)),
  transports: make<Transport>(SEED_TRANSPORTS, "id", () => supaEntity("transports", "id",
    "*, transport_features(*), transport_reviews(*), transport_media(*)", "upsert_transport", transportFrom, true)),
  packages: make<Pkg>(SEED_PACKAGES, "id", () => supaEntity("packages", "id",
    "*, package_features(*), package_program_stages(*), package_room_prices(*), package_reviews(*), package_policies(*), package_gallery(*)", "upsert_package", packageFrom, true)),
  trips: make<Trip>(SEED_TRIPS, "id", () => supaEntity("trips", "id",
    "*, trip_drivers(*)", "upsert_trip", tripFrom, true)),
  bookings: make<Booking>(SEED_BOOKINGS, "id", () => supaEntity("bookings", "id",
    "*, booking_pilgrims(*), booking_seats(*), booking_rooms(*), customer:customer_profiles(first_name,last_name,birth_date,email,phone)",
    "upsert_booking", bookingFrom, true)),
  payments: make<Payment>(SEED_PAYMENTS, "id", () => supaEntity("payments", "id",
    "*, payment_pilgrims(*), payment_items(*)", "upsert_payment", paymentFrom)),
  tickets: make<TicketEntry>(SEED_TICKETS, "ticketNo", () => supaEntity("tickets", "ticket_no",
    "*, ticket_pilgrims(*)", "upsert_ticket", ticketFrom)),
  beneficiaries: make<Beneficiary>(SEED_BENEFICIARIES, "id", () => supaEntity("beneficiaries", "id",
    "*, beneficiary_bookings(*)", "upsert_beneficiary", beneficiaryFrom, true)),
  users: make<SystemUser>(SEED_USERS, "id", () => supaEntity("users", "id", "*", "upsert_user", userFrom, true)),
  support: make<SupportReq>(SEED_SUPPORT, "id", () => supaEntity("support", "id", "*", "upsert_support", supportFrom, true)),
  customRequests: make<CustomRequest>([], "id", () => supaEntity("custom_requests", "id", "*", "upsert_custom_request", customReqFrom, true)),
  branches: make<Branch>(SEED_BRANCHES, "id", () => supaEntity("branches", "id", "*", "upsert_branch", branchFrom, true)),
};
