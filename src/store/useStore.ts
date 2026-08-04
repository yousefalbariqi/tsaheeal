/* مخزن Zustand — مصدر الحقيقة الواحد لكل بيانات التطبيق + الجلسة.
   - القراءة: hydrate() يجلب كل الكيانات بالتوازي من repo.
   - الكتابة: كل setX يقارن (diff) القديم بالجديد ويزامن repo تلقائياً (تفاؤلي).
   - بلا مفاتيح Supabase: كل شيء لا-عمليّ والتطبيق يعمل على seed كما هو. */
import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
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
import { repo, type Repo } from "@/data/repository";
import { supabase, isSupabaseEnabled } from "@/supabase/client";

type Updater<T> = T[] | ((prev: T[]) => T[]);
const apply = <T,>(prev: T[], u: Updater<T>): T[] =>
  typeof u === "function" ? (u as (p: T[]) => T[])(prev) : u;

/* مزامنة الفرق مع قاعدة البيانات (تفاؤلية، في الخلفية) */
function syncDiff<T>(r: Repo<T>, idKey: string, prev: T[], next: T[]) {
  if (!isSupabaseEnabled) return;
  const key = (row: any) => row[idKey] as string;
  const pm = new Map(prev.map((row) => [key(row), row]));
  const nm = new Map(next.map((row) => [key(row), row]));
  const ops: Promise<any>[] = [];
  for (const [k, row] of nm) {
    const old = pm.get(k);
    if (!old) ops.push(r.create(row));
    else if (JSON.stringify(old) !== JSON.stringify(row)) ops.push(r.update(k, row as Partial<T>));
  }
  for (const [k] of pm) if (!nm.has(k)) ops.push(r.remove(k));
  if (ops.length) Promise.all(ops).catch((e) => console.error("[sync] فشل مزامنة قاعدة البيانات:", e));
}

interface StoreState {
  hotels: Hotel[];               setHotels: (u: Updater<Hotel>) => void;
  transports: Transport[];       setTransports: (u: Updater<Transport>) => void;
  packages: Pkg[];               setPackages: (u: Updater<Pkg>) => void;
  trips: Trip[];                 setTrips: (u: Updater<Trip>) => void;
  bookings: Booking[];           setBookings: (u: Updater<Booking>) => void;
  payments: Payment[];           setPayments: (u: Updater<Payment>) => void;
  tickets: TicketEntry[];        setTickets: (u: Updater<TicketEntry>) => void;
  beneficiaries: Beneficiary[];  setBeneficiaries: (u: Updater<Beneficiary>) => void;
  users: SystemUser[];           setUsers: (u: Updater<SystemUser>) => void;
  support: SupportReq[];         setSupport: (u: Updater<SupportReq>) => void;
  branches: Branch[];            setBranches: (u: Updater<Branch>) => void;
  customRequests: CustomRequest[]; setCustomRequests: (u: Updater<CustomRequest>) => void;

  loaded: boolean;
  hydrate: () => Promise<void>;

  // الجلسة والمصادقة
  session: Session | null;
  currentUser: { id: string; name: string; role: string; branch?: string } | null;
  authReady: boolean;
  initAuth: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  _loadProfile: () => Promise<void>;
}

export const useStore = create<StoreState>((set, get) => ({
  hotels: SEED_HOTELS,               setHotels: (u) => set((s) => { const n = apply(s.hotels, u); syncDiff(repo.hotels, "id", s.hotels, n); return { hotels: n }; }),
  transports: SEED_TRANSPORTS,       setTransports: (u) => set((s) => { const n = apply(s.transports, u); syncDiff(repo.transports, "id", s.transports, n); return { transports: n }; }),
  packages: SEED_PACKAGES,           setPackages: (u) => set((s) => { const n = apply(s.packages, u); syncDiff(repo.packages, "id", s.packages, n); return { packages: n }; }),
  trips: SEED_TRIPS,                 setTrips: (u) => set((s) => { const n = apply(s.trips, u); syncDiff(repo.trips, "id", s.trips, n); return { trips: n }; }),
  bookings: SEED_BOOKINGS,           setBookings: (u) => set((s) => { const n = apply(s.bookings, u); syncDiff(repo.bookings, "id", s.bookings, n); return { bookings: n }; }),
  payments: SEED_PAYMENTS,           setPayments: (u) => set((s) => { const n = apply(s.payments, u); syncDiff(repo.payments, "id", s.payments, n); return { payments: n }; }),
  tickets: SEED_TICKETS,             setTickets: (u) => set((s) => { const n = apply(s.tickets, u); syncDiff(repo.tickets, "ticketNo", s.tickets, n); return { tickets: n }; }),
  beneficiaries: SEED_BENEFICIARIES, setBeneficiaries: (u) => set((s) => { const n = apply(s.beneficiaries, u); syncDiff(repo.beneficiaries, "id", s.beneficiaries, n); return { beneficiaries: n }; }),
  users: SEED_USERS,                 setUsers: (u) => set((s) => { const n = apply(s.users, u); syncDiff(repo.users, "id", s.users, n); return { users: n }; }),
  support: SEED_SUPPORT,             setSupport: (u) => set((s) => { const n = apply(s.support, u); syncDiff(repo.support, "id", s.support, n); return { support: n }; }),
  branches: SEED_BRANCHES,           setBranches: (u) => set((s) => { const n = apply(s.branches, u); syncDiff(repo.branches, "id", s.branches, n); return { branches: n }; }),
  customRequests: [],                setCustomRequests: (u) => set((s) => { const n = apply(s.customRequests, u); syncDiff(repo.customRequests, "id", s.customRequests, n); return { customRequests: n }; }),

  loaded: false,
  hydrate: async () => {
    if (!isSupabaseEnabled) { set({ loaded: true }); return; }
    // يعرض ما في قاعدة البيانات فقط (بلا تعبئة تلقائية) — البيانات الحقيقية تُدار من الواجهة.
    const [hotels, transports, packages, trips, bookings, payments, tickets, beneficiaries, users, support, branches, customRequests] =
      await Promise.all([
        repo.hotels.list(), repo.transports.list(), repo.packages.list(), repo.trips.list(),
        repo.bookings.list(), repo.payments.list(), repo.tickets.list(), repo.beneficiaries.list(),
        repo.users.list(), repo.support.list(), repo.branches.list(), repo.customRequests.list(),
      ]);
    set({ hotels, transports, packages, trips, bookings, payments, tickets, beneficiaries, users, support, branches, customRequests, loaded: true });
  },

  session: null,
  currentUser: null,
  authReady: false,
  initAuth: async () => {
    if (!supabase) { set({ authReady: true }); return; }
    const { data } = await supabase.auth.getSession();
    set({ session: data.session ?? null });
    if (data.session) await get()._loadProfile();
    set({ authReady: true });
    supabase.auth.onAuthStateChange((_e, sess) => {
      set({ session: sess });
      if (sess) get()._loadProfile();
      else set({ currentUser: null });
    });
  },
  signIn: async (email, password) => {
    if (!supabase) return { error: "Supabase غير مفعّل" };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message };
  },
  signOut: async () => { await supabase?.auth.signOut(); set({ session: null, currentUser: null }); },
  _loadProfile: async () => {
    const sess = get().session;
    if (!sess || !supabase) return;
    const uid = sess.user.id;
    const { data } = await supabase.from("profiles").select("id,name,role,branch_id").eq("id", uid).single();
    set({ currentUser: data
      ? { id: data.id, name: data.name, role: data.role, branch: data.branch_id ?? undefined }
      : { id: uid, name: sess.user.email ?? "مستخدم", role: "موظف" } });
  },
}));
