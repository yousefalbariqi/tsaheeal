/* طبقة الوصول للبيانات — نقطة الوصل مع قاعدة البيانات.
   حالياً مدعومة بـ seed في الذاكرة؛ في مرحلة 5 يُستبدل داخلها بـ Supabase
   (supabaseRepo) دون تغيير المخزن أو الواجهات. */
import type {
  Hotel, Transport, Pkg, Trip, Booking, Payment,
  TicketEntry, Beneficiary, SystemUser, SupportReq,
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
import { supabase, isSupabaseEnabled } from "@/supabase/client";

export interface Repo<T> {
  list(): Promise<T[]>;
  create(row: T): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T>;
  remove(id: string): Promise<void>;
}

/* دعم seed في الذاكرة — الوضع الافتراضي بدون مفاتيح Supabase */
function seedRepo<T>(seed: T[], idKey: string = "id"): Repo<T> {
  let rows: T[] = [...seed];
  const keyOf = (r: any) => r[idKey];
  return {
    async list() { return rows; },
    async create(row) { rows = [...rows, row]; return row; },
    async update(id, patch) {
      rows = rows.map(r => (keyOf(r) === id ? { ...r, ...patch } : r));
      return rows.find(r => keyOf(r) === id) as T;
    },
    async remove(id) { rows = rows.filter(r => keyOf(r) !== id); },
  };
}

/* دعم Supabase — جدول (id, doc jsonb). يُستخدم عند توفّر المفاتيح */
function supabaseRepo<T>(table: string, idKey: string = "id"): Repo<T> {
  const sb = supabase!;
  return {
    async list() {
      const { data, error } = await sb.from(table).select("doc");
      if (error) throw error;
      return (data ?? []).map((r: any) => r.doc as T);
    },
    async create(row) {
      const id = (row as any)[idKey];
      const { error } = await sb.from(table).insert({ id, doc: row });
      if (error) throw error;
      return row;
    },
    async update(id, patch) {
      const { data, error } = await sb.from(table).select("doc").eq("id", id).single();
      if (error) throw error;
      const merged = { ...(data as any).doc, ...patch } as T;
      const { error: e2 } = await sb.from(table).update({ doc: merged }).eq("id", id);
      if (e2) throw e2;
      return merged;
    },
    async remove(id) {
      const { error } = await sb.from(table).delete().eq("id", id);
      if (error) throw error;
    },
  };
}

/* اختيار المصدر تلقائياً: Supabase عند وجود المفاتيح، وإلا seed */
const make = <T,>(table: string, seed: T[], idKey: string = "id"): Repo<T> =>
  isSupabaseEnabled ? supabaseRepo<T>(table, idKey) : seedRepo<T>(seed, idKey);

export const repo = {
  hotels: make<Hotel>("hotels", SEED_HOTELS),
  transports: make<Transport>("transports", SEED_TRANSPORTS),
  packages: make<Pkg>("packages", SEED_PACKAGES),
  trips: make<Trip>("trips", SEED_TRIPS),
  bookings: make<Booking>("bookings", SEED_BOOKINGS),
  payments: make<Payment>("payments", SEED_PAYMENTS),
  tickets: make<TicketEntry>("tickets", SEED_TICKETS, "ticketNo"),
  beneficiaries: make<Beneficiary>("beneficiaries", SEED_BENEFICIARIES),
  users: make<SystemUser>("users", SEED_USERS),
  support: make<SupportReq>("support", SEED_SUPPORT),
};
