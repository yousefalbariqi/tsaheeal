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
import { notifySyncError, notifyLoadError, notifyPartialLoad, syncErrorMessage } from "@/lib/notify";

type Updater<T> = T[] | ((prev: T[]) => T[]);
const apply = <T,>(prev: T[], u: Updater<T>): T[] =>
  typeof u === "function" ? (u as (p: T[]) => T[])(prev) : u;

/* عدّاد الكتابات الجارية — يُعرّف قبل المخزن لأن syncDiff يناديه، ويُوصَل
   بـ set بعد الإنشاء. عدّاد لا رايةٌ لأن حفظين متزامنين واردان. */
let bumpSyncing: (d: number) => void = () => {};

/* الوضع المحلي: بعض كتابات واجهة المستفيد محلية بحكم التصميم (فرع
   «بلا جلسة حقيقية» في features/customer/data.ts). كانت تمرّ على syncDiff
   فتنادي upsert_booking — دالة إدارية ترفض جلسة العميل — فيرجع revert
   ويمحو الحجز من الشاشة بعد أن رأى المستخدم رقم طلبه. عدّاد لا رايةٌ
   لأن التعشيش وارد. */
let suppressSync = 0;

/** ينفّذ كتابات المخزن بلا مزامنة ولا تراجُع. متزامنة لا async: syncDiff
    يُنادى داخل setX نفسه، فالراية تُقرأ قبل أن ترتخي. */
export function writeLocalOnly<T>(fn: () => T): T {
  suppressSync++;
  try { return fn(); } finally { suppressSync--; }
}

/* مزامنة الفرق مع قاعدة البيانات (تفاؤلية، في الخلفية).

   `label` اسم الكيان بالعربية لرسالة الخطأ، و`revert` يُرجع الشريحة لحالتها
   السابقة عند الفشل. مهم: revert يكتب بـ set المباشر لا بـ setX، وإلا أعاد
   استدعاء syncDiff ليزامن التراجع نفسه إلى القاعدة. */
function syncDiff<T>(
  r: Repo<T>, idKey: string, prev: T[], next: T[],
  label: string, revert: (rows: T[]) => void,
) {
  if (!isSupabaseEnabled || suppressSync > 0) return;
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
  if (!ops.length) return;

  bumpSyncing(1);
  Promise.all(ops)
    .catch((e) => { revert(prev); notifySyncError(label, e); })
    .finally(() => bumpSyncing(-1));
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
  /* رسالة فشل الجلب. كان hydrate بلا try، وفشل استعلام واحد يترك loaded
     على false فتبقى اللوحة شاشة بيضاء صامتة إلى الأبد. */
  loadError: string | null;
  /** عدد عمليات الحفظ الجارية — لمؤشّر «جارٍ الحفظ». */
  syncing: number;
  hydrate: () => Promise<void>;
  /* إعادة جلب الرحلات وحدها. booked_seats صار مشتقّاً في القاعدة
     (حارس trg_booking_seats_sync)، فبعد أي تغيّر على حجز تصير النسخة
     المحلية قديمة. يكتب بـset المباشر: القيمة قادمة من القاعدة فلا
     تُزامَن إليها من جديد. */
  refreshTrips: () => Promise<void>;
  /* اشتراك لحظي على الحجوزات والطلبات المخصّصة. كان hydrate() يعمل مرّة
     واحدة عند الدخول ولا شيء بعده، فالموظف الجالس على شاشة الحجوزات لا
     يرى حجزاً جديداً حتى يعيد تحميل الصفحة كاملة. يعيد دالة إلغاء. */
  startLiveSync: () => () => void;

  // الجلسة والمصادقة
  session: Session | null;
  currentUser: { id: string; name: string; role: string; branch?: string } | null;
  /* جلسة موجودة ≠ موظف: المستفيد يدخل بجواله على نفس مشروع Supabase
     فيحمل دور authenticated بلا صف في profiles. لوحة الإدارة تُبنى على
     هذه الراية لا على وجود session. */
  isStaff: boolean;
  /* false أثناء جلب صف profiles — بدونها تلمع شاشة «لست موظفاً»
     بين لحظة ظهور الجلسة ولحظة وصول الدور. */
  profileReady: boolean;
  authReady: boolean;
  initAuth: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  _loadProfile: () => Promise<void>;
}

export const useStore = create<StoreState>((set, get) => ({
  hotels: SEED_HOTELS,               setHotels: (u) => set((s) => { const n = apply(s.hotels, u); syncDiff(repo.hotels, "id", s.hotels, n, "الفندق", (r) => set({ hotels: r })); return { hotels: n }; }),
  transports: SEED_TRANSPORTS,       setTransports: (u) => set((s) => { const n = apply(s.transports, u); syncDiff(repo.transports, "id", s.transports, n, "وسيلة النقل", (r) => set({ transports: r })); return { transports: n }; }),
  packages: SEED_PACKAGES,           setPackages: (u) => set((s) => { const n = apply(s.packages, u); syncDiff(repo.packages, "id", s.packages, n, "الباقة", (r) => set({ packages: r })); return { packages: n }; }),
  trips: SEED_TRIPS,                 setTrips: (u) => set((s) => { const n = apply(s.trips, u); syncDiff(repo.trips, "id", s.trips, n, "الرحلة", (r) => set({ trips: r })); return { trips: n }; }),
  bookings: SEED_BOOKINGS,           setBookings: (u) => set((s) => { const n = apply(s.bookings, u); syncDiff(repo.bookings, "id", s.bookings, n, "الحجز", (r) => set({ bookings: r })); return { bookings: n }; }),
  payments: SEED_PAYMENTS,           setPayments: (u) => set((s) => { const n = apply(s.payments, u); syncDiff(repo.payments, "id", s.payments, n, "الفاتورة", (r) => set({ payments: r })); return { payments: n }; }),
  tickets: SEED_TICKETS,             setTickets: (u) => set((s) => { const n = apply(s.tickets, u); syncDiff(repo.tickets, "ticketNo", s.tickets, n, "التذكرة", (r) => set({ tickets: r })); return { tickets: n }; }),
  beneficiaries: SEED_BENEFICIARIES, setBeneficiaries: (u) => set((s) => { const n = apply(s.beneficiaries, u); syncDiff(repo.beneficiaries, "id", s.beneficiaries, n, "المستفيد", (r) => set({ beneficiaries: r })); return { beneficiaries: n }; }),
  users: SEED_USERS,                 setUsers: (u) => set((s) => { const n = apply(s.users, u); syncDiff(repo.users, "id", s.users, n, "المستخدم", (r) => set({ users: r })); return { users: n }; }),
  support: SEED_SUPPORT,             setSupport: (u) => set((s) => { const n = apply(s.support, u); syncDiff(repo.support, "id", s.support, n, "طلب الدعم", (r) => set({ support: r })); return { support: n }; }),
  branches: SEED_BRANCHES,           setBranches: (u) => set((s) => { const n = apply(s.branches, u); syncDiff(repo.branches, "id", s.branches, n, "الفرع", (r) => set({ branches: r })); return { branches: n }; }),
  customRequests: [],                setCustomRequests: (u) => set((s) => { const n = apply(s.customRequests, u); syncDiff(repo.customRequests, "id", s.customRequests, n, "الطلب المخصّص", (r) => set({ customRequests: r })); return { customRequests: n }; }),

  loaded: false,
  loadError: null,
  syncing: 0,
  refreshTrips: async () => {
    if (!isSupabaseEnabled) return;
    try { set({ trips: await repo.trips.list() }); }
    catch (e) { console.error("[trips] فشل تحديث الرحلات:", e); }
  },
  startLiveSync: () => {
    if (!isSupabaseEnabled || !supabase) return () => {};
    /* إعادة جلب مؤجّلة: حجز واحد يولّد أحداثاً على bookings و
       booking_pilgrims و booking_seats معاً — بلا التأجيل ثلاث جولات جلب. */
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refetch = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          const [bookings, customRequests, trips] = await Promise.all([
            repo.bookings.list(), repo.customRequests.list(), repo.trips.list(),
          ]);
          set({ bookings, customRequests, trips });
        } catch (e) { console.error("[live] فشل التحديث اللحظي:", e); }
      }, 400);
    };

    const ch = supabase.channel("admin-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "booking_pilgrims" }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "booking_seats" }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "custom_requests" }, refetch)
      .subscribe();

    return () => { if (timer) clearTimeout(timer); supabase!.removeChannel(ch); };
  },
  hydrate: async () => {
    if (!isSupabaseEnabled) { set({ loaded: true, loadError: null }); return; }
    // يعرض ما في قاعدة البيانات فقط (بلا تعبئة تلقائية) — البيانات الحقيقية تُدار من الواجهة.
    set({ loadError: null });
    /* allSettled لا all: فشل استعلام واحد من اثني عشر كان يُسقطها كلها،
       فتظهر شاشة خطأ كاملة لأن «الدعم الفني» وحده تعذّر جلبه. الآن يُعرض
       ما وصل، وتُسمّى الكيانات التي تعذّرت، ولا تظهر شاشة الخطأ إلا إن سقط
       الكل — وهي الحالة التي تعني فعلاً أن لا شيء لتعرضه. */
    const ENTITIES = [
      ["hotels", "الفنادق"], ["transports", "النقل"], ["packages", "الباقات"],
      ["trips", "الرحلات"], ["bookings", "الحجوزات"], ["payments", "المدفوعات"],
      ["tickets", "التذاكر"], ["beneficiaries", "المستفيدون"], ["users", "المستخدمون"],
      ["support", "الدعم الفني"], ["branches", "الفروع"], ["customRequests", "الطلبات المخصّصة"],
    ] as const;

    const results = await Promise.allSettled(
      ENTITIES.map(([k]) => (repo as any)[k].list() as Promise<unknown[]>),
    );

    const arrived: Record<string, unknown[]> = {};
    const missing: string[] = [];
    let lastError: unknown = null;
    results.forEach((r, i) => {
      const [key, label] = ENTITIES[i];
      if (r.status === "fulfilled") arrived[key] = r.value;
      else { missing.push(label); lastError = r.reason; console.error(`[hydrate] ${key}:`, r.reason); }
    });

    /* سقط الكل — لا بيانات تُعرض، فشاشة الخطأ مع زر الإعادة هي الصحيح.
       بلا هذا الفرع يبقى loaded=false وتعيد AdminApp عنصراً فارغاً أبداً. */
    if (missing.length === ENTITIES.length) {
      notifyLoadError(lastError);
      set({ loadError: syncErrorMessage(lastError) });
      return;
    }

    set({ ...arrived, loaded: true, loadError: null } as any);
    if (missing.length) notifyPartialLoad(missing, lastError);
  },

  session: null,
  currentUser: null,
  isStaff: false,
  profileReady: false,
  authReady: false,
  initAuth: async () => {
    if (!supabase) { set({ authReady: true, profileReady: true }); return; }
    const { data } = await supabase.auth.getSession();
    set({ session: data.session ?? null });
    if (data.session) await get()._loadProfile();
    set({ authReady: true, profileReady: true });
    supabase.auth.onAuthStateChange((_e, sess) => {
      set({ session: sess });
      if (sess) { set({ profileReady: false }); get()._loadProfile(); }
      else set({ currentUser: null, isStaff: false, profileReady: true });
    });
  },
  signIn: async (email, password) => {
    if (!supabase) return { error: "Supabase غير مفعّل" };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message };
  },
  signOut: async () => { await supabase?.auth.signOut(); set({ session: null, currentUser: null, isStaff: false }); },
  _loadProfile: async () => {
    const sess = get().session;
    if (!sess || !supabase) return;
    const uid = sess.user.id;
    const { data } = await supabase.from("profiles").select("id,name,role,branch_id").eq("id", uid).single();
    /* غياب صف profiles = ليس موظفاً. كان يُصنَّع له دور "موظف" هنا،
       فيمرّ بوابة لوحة الإدارة بلا أي صلاحية مقصودة. */
    set(data
      ? { currentUser: { id: data.id, name: data.name, role: data.role, branch: data.branch_id ?? undefined }, isStaff: true, profileReady: true }
      : { currentUser: null, isStaff: false, profileReady: true });
  },
}));

/* وصل العدّاد بالمخزن — syncDiff دالة وحدة (module-scope) تُنادى من داخل
   set، فلا تملك مرجعاً للمخزن قبل إنشائه. */
bumpSyncing = (d) => useStore.setState((s) => ({ syncing: Math.max(0, s.syncing + d) }));
