/* الرئيسية — كانت «قيد البناء» وهي أول ما يفتحه الموظف.

   قصدها سؤال واحد: ما الذي يحتاج عملاً الآن؟ لا لوحة أرقامٍ للزينة.
   لذلك ترتيبها: صفّ الأرقام، ثم «يحتاج إجراءً» (وكلّ بندٍ فيه ينقل إلى
   شاشته)، ثم رحلات الأسبوع، ثم آخر الطلبات.

   البند الأول في «يحتاج إجراءً» هو تجاوز وعد الردّ: الطلب الذي مضى على
   إرساله أكثر من الوعد. هذا ما يخسر عميلاً، وكان لا يظهر في أي شاشة —
   الموظف يعرفه إن فتح شاشة الطلبات وقرأ التواريخ صفّاً صفّاً.

   كل الأرقام مشتقّة من المخزن لحظةَ الرسم — لا حالة ثانية تتفارق معه. */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  AlertTriangle, BookOpen, CalendarClock, CalendarX2, ChevronLeft, ChevronRight, CreditCard,
  Sparkles, CheckCircle2, Users, Armchair, BedDouble, Check, Minus, Plus, Package, Plane,
  UserRound, Link2Off, MousePointerClick,
} from "lucide-react";
import { B, TONE } from "@/lib/theme";
import { fmtDateShort, fmtDateTime, fmtDayDate, fmtTime } from "@/lib/dates";
import { Button, IconButton, Note, Segmented } from "@/components/ui";
import { EmptyState } from "@/components/States";
import { Field } from "@/components/Field";
import { AppSelect } from "@/components/AppSelect";
import { NumericInput } from "@/components/NumericInput";
import { BirthDateInput } from "@/components/BirthDateInput";
import { tripState, isSellable } from "@/lib/trip";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { useStore } from "@/store/useStore";
import { todayYMD } from "@/lib/utils";
import { sar } from "@/lib/money";
import { businessElapsed, configureSla, SLA_MS } from "@/features/customer/sla";
import { fetchSettings } from "@/data/settings";
import { isSupabaseEnabled, supabase } from "@/supabase/client";
import type { Booking, Trip } from "@/types";
import type { BookingTravellerCounts, Pilgrim, Pkg, TicketEntry } from "@/types";
import { BusSeatGrid } from "@/components/BusSeatGrid";
import { NationalitySelect } from "@/components/NationalitySelect";
import { busCountOf, tripPrivacyPartner } from "@/lib/buses";
import { bookingRoomChoices, isPrivateAccommodation, packagePrice, roomCountOf, roomSplits, splitSummary, type RoomSplit } from "@/features/customer/roomSplit";
import { ALL_AUDIENCE, audienceOf, tierLabel, tiersForTraveller } from "@/data/housing";
import { newId } from "@/lib/utils";
import { flushSync, clearSyncError } from "@/store/useStore";
import { repo } from "@/data/repository";
import { TicketCard } from "@/features/tickets";
import { toast } from "sonner";

type ServerMetrics = { monthRevenue: number; todayBookings: number; pendingBookings: number; unlinkedBookings: number };

/* كانت هنا دالّة money محليّة تلصق «ر.س» بعدها في الرسم — الصياغة الآن
   من lib/money وحدها كي لا تتفرّق بين الشاشات. */

/** يوم بإزاحة — لنافذة «الأسبوع القادم» بلا مكتبة تواريخ. */
function ymdPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** لحظة إرسال الطلب. submittedAt طابع كامل، وcreatedAt تاريخ بلا ساعة —
    فالثاني يُقرأ بداية يومه: تقديرٌ متحفّظ لا يزعم دقّةً لا نملكها. */
function sentAt(b: Booking): number | null {
  if (b.submittedAt) { const t = Date.parse(b.submittedAt); if (!Number.isNaN(t)) return t; }
  if (b.createdAt) { const t = Date.parse(b.createdAt.replace(" ", "T")); if (!Number.isNaN(t)) return t; }
  return null;
}

/** كم انتظر أقدم بند، ومن يتولّاه. */
type Oldest = { at: number | null; staff?: string } | null;

/** مدّة الانتظار بأكبر وحدة تُقرأ: يومان أوضح من «٥١ ساعة». */
function waited(at: number): string {
  const h = Math.floor((Date.now() - at) / 3_600_000);
  if (h < 1) return "أقل من ساعة";
  if (h < 24) return `${h} ساعة`;
  const d = Math.floor(h / 24);
  return d === 1 ? "يوماً" : d === 2 ? "يومين" : `${d} أيام`;
}

/* سطر «الأقدم والمسؤول» لكل بند لا للمتأخّر وحده: العدد يقول كم بقي،
   ولا يقول ما إن كان أقدمها ينتظر ساعةً أو ثلاثة أيام، ولا من يتولّاه.
   والرقمان معاً هما ما يحدّد أيّها يُفتح أولاً. */
function oldestNote(o: Oldest): string | null {
  if (!o || o.at === null) return null;
  return `الأقدم منذ ${waited(o.at)} · المسؤول: ${o.staff?.trim() || "غير معيّن"}`;
}

/** صفّ في «يحتاج إجراءً» — العدد، وأقدم انتظار، والنقل إلى شاشته. */
function ActionRow({ icon: Icon, label, count, note, tone, onGo, oldest }: {
  icon: typeof BookOpen; label: string; count: number; note: string;
  tone: keyof typeof TONE; onGo: () => void; oldest?: Oldest;
}) {
  if (!count) return null;
  const wait = oldestNote(oldest ?? null);
  const t = TONE[tone];
  return (
    <button type="button" onClick={onGo} className="ts-action-row">
      {/* اللون يفرّق «متأخّر» عن «قيد المراجعة»، وموضعه مربّع الأيقونة وحده —
          إشارةٌ لا سطح: خمسة صفوفٍ ملوّنة الخلفية في بطاقةٍ واحدة تُقرأ ضجيجاً. */}
      <span aria-hidden className="flex items-center justify-center flex-shrink-0"
        style={{ width: 36, height: 36, borderRadius: 10, background: t.bg, color: t.fg }}><Icon size={17} /></span>
      <span className="flex-1 min-w-0">
        <span className="block truncate" style={{ fontSize: 14, fontWeight: 600, color: B.black }}>{label}</span>
        <span className="block truncate" style={{ fontSize: 12, color: B.muted, marginTop: 1 }}>{wait ?? note}</span>
      </span>
      <span className="flex-shrink-0" style={{ fontSize: 20, fontWeight: 700, color: B.black }}>{count}</span>
      <ChevronLeft size={16} style={{ color: B.placeholder, flexShrink: 0 }} />
    </button>
  );
}

const shortDay = (iso: string) => new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { weekday:"short", day:"numeric", month:"short" }).format(new Date(`${iso}T12:00:00`));
const totalPeople = (c: BookingTravellerCounts) => c.men + c.women + (c.children ?? 0);
const validPhone = (value: string) => /^(05\d{8}|(\+?966)5\d{8})$/.test(value.replace(/\s/g,""));
const arSplit = (s: RoomSplit) => splitSummary(s, k => ({guests:"أفراد",spotsUnit:"أماكن",roomsUnit:"غرف"})[k] ?? k);

/** محطة الاستقبال تتبع نفس كتالوج العميل: لا أسعار غرف أو خيارات سكن
    محلية هنا. الاختلاف الوحيد هو أن الموظف يختار المقاعد بنفسه. */
function ReceptionOperationsCenter({ trips, packages }: { trips: Trip[]; packages: Pkg[] }) {
  const bookings = useStore(s => s.bookings);
  const transports = useStore(s => s.transports);
  const hotels = useStore(s => s.hotels);
  const currentUser = useStore(s => s.currentUser);
  const setBookings = useStore(s => s.setBookings);
  const refreshTrips = useStore(s => s.refreshTrips);
  const [rangeStart, setRangeStart] = useState(todayYMD());
  const [selectedDate, setSelectedDate] = useState(todayYMD());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [counts, setCounts] = useState<BookingTravellerCounts>({ men: 0, women: 0, children: 0 });
  const [seats, setSeats] = useState<number[]>([]);
  const [split, setSplit] = useState<RoomSplit | null>(null);
  const [paidAtBranch, setPaidAtBranch] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("شبكة");
  const [issuedTicket, setIssuedTicket] = useState<TicketEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [email, setEmail] = useState("");
  const [docType, setDocType] = useState("national_id"); const [idNumber, setIdNumber] = useState(""); const [nationality, setNationality] = useState("سعودي"); const [birthDate, setBirthDate] = useState(""); const [discount, setDiscount] = useState(0);

  const dates = useMemo(() => Array.from({ length: 10 }, (_, index) => {
    const value = new Date(`${rangeStart}T12:00:00`);
    value.setDate(value.getDate() + index);
    return value.toISOString().slice(0, 10);
  }), [rangeStart]);
  const availableTrips = useMemo(() => trips.filter(trip => isSellable(trip)).sort((a, b) => `${a.departureDate}${a.departureTime}`.localeCompare(`${b.departureDate}${b.departureTime}`)), [trips]);
  const dayTrips = useMemo(() => availableTrips.filter(t => t.departureDate === selectedDate), [availableTrips, selectedDate]);
  const selected = dayTrips.find(t => t.id === selectedId) ?? null;
  const pkg = packages.find(p => p.id === selected?.packageId);
  const transport = transports.find(t => t.id === (selected?.transportId || pkg?.transportId));
  const hotel = hotels.find(h => h.id === (selected?.hotelId || pkg?.hotelId));
  const people = totalPeople(counts);
  /* المعتمرة المنفردة تشغل مقعدين: واحدٌ راكبٌ والثاني مفرّغ ملاصق له.
     نحتفظ بهما في حالة الاختيار معاً، ثم نفصل الثاني عند الحفظ حتى لا
     يظهر راكباً ثانياً في التذكرة أو كشف الإطلاق. */
  const needsPrivacySeat = people === 1 && counts.men === 0 && counts.women === 1 && (counts.children ?? 0) === 0;
  const operationalSeats = people + (needsPrivacySeat ? 1 : 0);
  const privacyOccupied = useMemo(() => new Set(bookings.filter(b => b.tripId === selected?.id && !["cancelled", "rejected"].includes(b.status)).flatMap(b => b.privacySeats ?? [])), [bookings, selected?.id]);
  const occupied = useMemo(() => new Set(bookings.filter(b => b.tripId === selected?.id && !["cancelled", "rejected"].includes(b.status)).flatMap(b => [...b.seats, ...(b.privacySeats ?? [])])), [bookings, selected?.id]);
  const seatsLeft = Math.max(0, (selected?.seats ?? 0) - occupied.size);
  const housing = !!pkg && pkg.nights > 0 && pkg.roomPrices.length > 0;
  const audienceType: "male_solo" | "female_solo" | "family" = counts.men && counts.women ? "family" : counts.women ? "female_solo" : "male_solo";
  const audienceRestricted = !!pkg && pkg.roomPrices.some(room => {
    const audience = audienceOf(room);
    return audience.length !== ALL_AUDIENCE.length || !ALL_AUDIENCE.every(type => audience.includes(type));
  });
  const roomTiers = !pkg ? [] : audienceRestricted ? (people ? tiersForTraveller(pkg.roomPrices, audienceType) : []) : pkg.roomPrices;
  const roomOptions = useMemo(() => bookingRoomChoices(roomTiers, people), [roomTiers, people]);
  const seatCost = pkg?.seatCostOverride ?? transport?.seatCost ?? 0;
  const price = split && pkg ? packagePrice(split, people, seatCost, pkg.nights, operationalSeats) : null;
  const total = Math.max(0, (price?.total ?? (selected?.price ?? pkg?.marketPrice ?? 0) * people + (needsPrivacySeat ? seatCost : 0)) - discount);
  const seatsPicked = people > 0 && seats.length === operationalSeats;

  useEffect(() => { setSeats([]); setCounts({ men: 0, women: 0, children: 0 }); }, [selected?.id]);
  useEffect(() => { setSeats(current => current.slice(0, operationalSeats)); }, [operationalSeats]);
  useEffect(() => { setSplit(current => current && roomOptions.some(option => option.key === current.key) ? current : (roomOptions[0] ?? null)); }, [roomOptions]);

  const selectDate = (date: string) => { setSelectedDate(date); setSelectedId(null); };
  const shiftDates = (days: number) => { const next = new Date(`${rangeStart}T12:00:00`); next.setDate(next.getDate() + days); const iso = next.toISOString().slice(0, 10); setRangeStart(iso); selectDate(iso); };
  const changeCount = (key: "men" | "women", delta: number) => {
    if (!selected) return;
    setCounts(current => {
      const candidate = { ...current, [key]: Math.max(0, current[key] + delta) };
      const candidatePeople = totalPeople(candidate);
      const candidateOperational = candidatePeople + (candidatePeople === 1 && candidate.men === 0 && candidate.women === 1 && (candidate.children ?? 0) === 0 ? 1 : 0);
      return candidateOperational <= seatsLeft ? candidate : current;
    });
  };
  const canIncrease = (key: "men" | "women") => {
    const candidate = { ...counts, [key]: counts[key] + 1 };
    const candidatePeople = totalPeople(candidate);
    const candidateOperational = candidatePeople + (candidatePeople === 1 && candidate.men === 0 && candidate.women === 1 && (candidate.children ?? 0) === 0 ? 1 : 0);
    return !!selected && candidateOperational <= seatsLeft;
  };
  const toggleSeat = (seat: number) => setSeats(current => {
    if (current.includes(seat)) return current.filter(value => value !== seat);
    if (!needsPrivacySeat) return current.length < operationalSeats ? [...current, seat] : current;
    if (!selected) return current;
    if (!current.length) {
      if (!tripPrivacyPartner(selected, seat)) {
        toast.error("اختر مقعداً ضمن زوج متجاور؛ الصف الخلفي لا يصلح لمقعد الخصوصية.");
        return current;
      }
      return [seat];
    }
    if (current.length >= 2) return current;
    if (tripPrivacyPartner(selected, current[0]) !== seat) {
      toast.error("المقعد الثاني يجب أن يكون الملاصق لمقعد المعتمرة ويُفرّغ للخصوصية.");
      return current;
    }
    return [...current, seat];
  });
  const genderAt = (seat: number) => { const booking = bookings.find(item => item.tripId === selected?.id && item.seats.includes(seat)); return booking?.travellerCounts?.women && booking.seats.indexOf(seat) >= booking.travellerCounts.men ? "female" as const : "male" as const; };

  async function save() {
    if (!seatsPicked) { toast.error("اختر مقاعد جميع المعتمرين قبل الانتقال إلى الدفع أو إنشاء الطلب."); return; }
    if (!selected || !pkg || !name.trim() || !validPhone(phone) || !idNumber.trim() || !nationality.trim() || !birthDate || (housing && !split)) { toast.error("أكمل بيانات صاحب الحجز والسكن قبل الحفظ."); return; }
    const id = newId("TSH"); const paid = paidAtBranch;
    if (paid && !paymentMethod) { toast.error("اختر طريقة الدفع قبل تأكيد الحجز."); return; }
    const pilgrim: Pilgrim = { name: name.trim(), docType: docType as Pilgrim["docType"], idNumber: idNumber.trim(), nationality, gender: counts.women && !counts.men ? "female" : "male", birthDate, phone: phone.replace(/\s/g, "") };
    setSaving(true); clearSyncError();
    setBookings(rows => [{ id, tripId: selected.id, packageId: pkg.id, clientName: name.trim(), clientPhone: phone.replace(/\s/g, ""), roomType: split ? arSplit(split) : "", rooms: split?.rooms.map(room => ({ tierId: room.id, type: room.type, persons: room.persons, perNight: room.perNight })), persons: people, travellerCounts: counts, pricing: price ? { seatPrice: price.seatPrice, transportTotal: price.transport, accommodationNightly: split?.perNight ?? 0, roomCount: price.roomCount, nights: price.nights, accommodationTotal: price.accommodation } : undefined, total, status: paid ? "confirmed" : "awaiting_payment", paymentStatus: paid ? "verified" : "none", payMethod: paid ? paymentMethod : "—", payDate: paid ? todayYMD() : undefined,
      /* ترتيب الاختيار مقصود: الأول مقعد المعتمرة، والثاني مفرّغ بجواره. */
      seats: needsPrivacySeat ? [seats[0]] : [...seats].sort((a, b) => a - b), privacySeats: needsPrivacySeat ? [seats[1]] : undefined,
      createdAt: todayYMD(), staff: currentUser?.name ?? "—", createdBy: currentUser?.id, branchId: currentUser?.branch, source: "internal", sentDate: "", pilgrims: [pilgrim] }, ...rows]);
    const error = await flushSync(); setSaving(false); if (error) { toast.error(error); return; }
    let ticket: TicketEntry | undefined;
    if (paid) {
      try { ticket = (await repo.tickets.list()).find(item => item.bookingId === id); }
      catch { /* الحجز محفوظ؛ تبقى التذكرة متاحة من صفحة التذاكر إن تعذّرت قراءتها الآن. */ }
    }
    toast.success(paid ? "تم الدفع وتأكيد الحجز." : "أُنشئ الطلب بانتظار الدفع.", { description: `${id} · ${sar(total)}` });
    setName(""); setPhone(""); setEmail(""); setIdNumber(""); setBirthDate(""); setSeats([]); setDiscount(0); setPaidAtBranch(false); setPaymentMethod("شبكة"); void refreshTrips();
    if (ticket) setIssuedTicket(ticket);
    else if (paid) toast.info("صدرت التذكرة؛ يمكنك فتحها من صفحة التذاكر إذا لم تظهر نافذتها الآن.");
  }
  const stepper = (field: "men" | "women", label: string) => (
    <div className="flex items-center justify-between gap-2 px-3" style={{ height: 48, borderRadius: 12, background: B.surface, border: `1px solid ${B.border}` }}>
      <span style={{ fontSize: 13, fontWeight: 500, color: B.text3 }}>{label}</span>
      <span className="flex items-center gap-1.5">
        <IconButton size="sm" variant="outline" label={`إنقاص ${label}`} disabled={!selected || counts[field] === 0} onClick={() => changeCount(field, -1)}><Minus size={14} /></IconButton>
        <b aria-live="polite" style={{ minWidth: 22, textAlign: "center", fontSize: 15, color: B.black }}>{counts[field]}</b>
        <IconButton size="sm" variant="outline" label={`زيادة ${label}`} disabled={!canIncrease(field)} onClick={() => changeCount(field, 1)}><Plus size={14} /></IconButton>
      </span>
    </div>
  );
  const weekdayShort = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { weekday: "short" });
  const paneHead = { fontSize: 12, fontWeight: 600, color: B.muted } as const;

  return <section className="ui-card overflow-hidden" aria-label="حجز استقبال سريع">
    <header className="px-4 md:px-5 py-4 flex flex-wrap items-center gap-3" style={{ borderBottom: `1px solid ${B.border}` }}>
      <div className="flex-1 min-w-0">
        <h2 className="ui-card-title" style={{ fontSize: 17 }}>حجز استقبال سريع</h2>
        <p className="ui-card-sub" style={{ marginTop: 2 }}>اليوم ← الرحلة ← المعتمرون ← المقاعد ← السكن ← الدفع</p>
      </div>
      <div className="flex items-center gap-1.5">
        <IconButton variant="outline" label="الأسبوع السابق" onClick={() => shiftDates(-7)}><ChevronRight size={17} /></IconButton>
        <Button size="sm" variant="secondary" style={{ height: 36 }} onClick={() => { setRangeStart(todayYMD()); selectDate(todayYMD()); }}>اليوم</Button>
        <IconButton variant="outline" label="الأسبوع التالي" onClick={() => shiftDates(7)}><ChevronLeft size={17} /></IconButton>
      </div>
    </header>

    {/* شريط الأيام — يُمرَّر داخل نفسه على الجوال؛ الصفحة لا تتحرّك أفقياً. */}
    <div className="px-4 md:px-5 py-3 overflow-x-auto" style={{ background: "#FCFBF8", borderBottom: `1px solid ${B.border}`, scrollbarWidth: "none" }}>
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(10, minmax(68px, 1fr))", minWidth: 740 }}>
        {dates.map(date => {
          const count = availableTrips.filter(trip => trip.departureDate === date).length;
          const active = selectedDate === date;
          const value = new Date(`${date}T12:00:00`);
          return (
            <button key={date} type="button" onClick={() => selectDate(date)} aria-pressed={active}
              aria-label={`${fmtDayDate(date)}، ${count ? `${count} رحلة` : "لا رحلات"}`}
              className={`ts-day${active ? " is-on" : ""}${count ? " has-trips" : ""}`}>
              <span style={{ fontSize: 12 }}>{date === todayYMD() ? "اليوم" : weekdayShort.format(value)}</span>
              <strong style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.2 }}>{value.getDate()}</strong>
              <span className="ts-day-sub">{count ? `${count} رحلة` : "—"}</span>
            </button>
          );
        })}
      </div>
    </div>

    <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)_380px]">
      {/* ١ — رحلات اليوم */}
      <aside className="ts-pane">
        <div className="px-4 pt-4 pb-2" style={paneHead}>رحلات {fmtDayDate(selectedDate)}</div>
        {dayTrips.length ? <div className="px-2 pb-3 flex flex-col gap-1">{dayTrips.map(trip => {
          const active = trip.id === selected?.id;
          const packageName = packages.find(item => item.id === trip.packageId)?.name ?? "رحلة";
          const left = Math.max(0, trip.seats - trip.bookedSeats);
          return (
            <button key={trip.id} type="button" onClick={() => setSelectedId(trip.id)} aria-pressed={active}
              className={`ts-pick${active ? " is-on" : ""}`}>
              <span className="flex-1 min-w-0">
                <b className="block truncate" style={{ fontSize: 14, fontWeight: 600, color: B.black }}>{packageName}</b>
                <span className="block truncate" style={{ fontSize: 12, color: B.muted, marginTop: 2 }}>{fmtTime(trip.departureTime)} · {trip.departurePoint}</span>
              </span>
              <span className="flex-shrink-0 text-center" style={{ fontSize: 12, color: left <= 5 ? TONE.warn.fg : B.text2 }}>
                <b className="block" style={{ fontSize: 15, fontWeight: 700 }}>{left}</b>مقعد
              </span>
            </button>
          );
        })}</div> : <EmptyState compact icon={<CalendarX2 size={20} />} title="لا رحلات في هذا اليوم" note="اختر يوماً آخر من الشريط أعلاه." />}
      </aside>

      {/* ٢ — المقاعد */}
      <div className="ts-pane p-4 md:p-5 min-w-0">
        {selected && pkg ? <>
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <div style={paneHead}>الرحلة المحددة</div>
              <h3 className="truncate" style={{ fontSize: 18, fontWeight: 700, color: B.black, margin: "2px 0 0", lineHeight: 1.4 }}>{pkg.name}</h3>
              <p style={{ fontSize: 13, color: B.muted, margin: "2px 0 0" }}>{fmtTime(selected.departureTime)} · {selected.departurePoint}</p>
            </div>
            <div className="flex items-center gap-2 px-3" style={{ height: 40, borderRadius: 12, background: B.fill }}>
              <Armchair size={16} style={{ color: B.text2 }} />
              <b style={{ fontSize: 16, fontWeight: 700, color: B.black }}>{seatsLeft}</b>
              <span style={{ fontSize: 12, color: B.muted }}>مقعد متبقٍّ</span>
            </div>
          </div>
          {needsPrivacySeat && <Note tone="info" className="mb-4">هذه معتمرة منفردة: اختَر مقعدين متجاورين. الأول لها، والثاني يُفرّغ للخصوصية ولا يظهر في التذكرة كراكب.</Note>}
          {people
            ? <BusSeatGrid key={selected.id} capacity={selected.seats} buses={busCountOf(selected)} occupied={occupied} privacySeats={privacyOccupied} selected={seats} need={operationalSeats} onToggle={toggleSeat} occGender={genderAt} selectedPrivacySeats={needsPrivacySeat ? new Set([seats[1]].filter((seat): seat is number => seat != null)) : undefined} selGender={seat => seats.indexOf(seat) < counts.men ? "male" : "female"} />
            : <div style={{ borderRadius: 14, background: B.fill }}><EmptyState compact icon={<Users size={20} />} title="حدّد عدد المعتمرين أولاً" note="يُفتح كروكي المقاعد بعد تحديد عدد الرجال والنساء." /></div>}
        </> : <div className="h-full flex items-center justify-center"><EmptyState compact icon={<MousePointerClick size={20} />} title="اختر رحلة لبدء الحجز" note="الرحلات المتاحة في اليوم المحدّد تظهر في القائمة." /></div>}
      </div>

      {/* ٣ — بيانات الحجز */}
      <aside className="p-4 md:p-5" style={{ background: "#FCFBF8" }}>
        <h3 className="ui-card-title">بيانات الحجز</h3>
        <div className="flex flex-col gap-4 mt-4">
          <div>
            <span className="ui-label">عدد المعتمرين</span>
            <div className="grid grid-cols-2 gap-2">{stepper("men", "رجال")}{stepper("women", "نساء")}</div>
            <div className="flex items-center justify-between mt-2" style={{ fontSize: 12, color: B.muted }}>
              <span>المقاعد المطلوبة{needsPrivacySeat ? " · تشمل مقعد الخصوصية" : ""}</span>
              <b style={{ color: B.text3, fontWeight: 600 }}>{operationalSeats} {operationalSeats === 1 ? "مقعد" : operationalSeats === 2 ? "مقعدين" : "مقاعد"}</b>
            </div>
          </div>

          <div><Field label={<>اسم صاحب الحجز<span className="ui-req">*</span></>}>
            <input value={name} onChange={event => setName(event.target.value)} className="ui-input" autoComplete="off" />
          </Field></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Field label={<>الجوال<span className="ui-req">*</span></>}>
              <input value={phone} onChange={event => setPhone(event.target.value)} className="ui-input" inputMode="tel" dir="ltr" placeholder="05XXXXXXXX" style={{ textAlign: "left" }} autoComplete="off" />
            </Field></div>
            <div><Field label={<>البريد <span style={{ color: B.muted, fontWeight: 400 }}>(اختياري)</span></>}>
              <input value={email} onChange={event => setEmail(event.target.value)} className="ui-input" inputMode="email" dir="ltr" style={{ textAlign: "left" }} autoComplete="off" />
            </Field></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Field label="نوع الوثيقة">
              <AppSelect value={docType} onChange={setDocType} options={[
                { value: "national_id", label: "هوية وطنية" }, { value: "iqama", label: "إقامة" }, { value: "passport", label: "جواز سفر" },
              ]} />
            </Field></div>
            <div><Field label={<>رقم الوثيقة<span className="ui-req">*</span></>}>
              <input value={idNumber} onChange={event => setIdNumber(event.target.value)} className="ui-input" dir="ltr" style={{ textAlign: "left" }} autoComplete="off" />
            </Field></div>
          </div>
          <div>
            <span className="ui-label">الجنسية<span className="ui-req">*</span></span>
            <NationalitySelect value={nationality} onChange={setNationality} subInTrigger={false} />
          </div>
          <div>
            <span className="ui-label">تاريخ الميلاد<span className="ui-req">*</span></span>
            <BirthDateInput value={birthDate} onChange={setBirthDate} />
          </div>

          {housing && <AccommodationChoices people={people} options={roomOptions} split={split} setSplit={setSplit} hotelName={hotel?.name} />}

          <div><Field label="خصم متفق عليه (ر.س)">
            <NumericInput value={discount || ""} onValueChange={value => setDiscount(Number(value) || 0)} className="ui-input" placeholder="0" />
          </Field></div>

          <div className="flex items-end justify-between gap-3 px-4 py-3" style={{ borderRadius: 14, background: B.surface, border: `1px solid ${B.border}` }}>
            <div className="min-w-0">
              <div style={{ fontSize: 12, color: B.muted }}>الإجمالي المستحق</div>
              {price && <div className="truncate" style={{ fontSize: 12, color: B.muted, marginTop: 2 }}>المقاعد {sar(price.transport)} · السكن {sar(price.accommodation)}</div>}
            </div>
            <b style={{ fontSize: 22, fontWeight: 700, color: B.black, whiteSpace: "nowrap" }}>{sar(total)}</b>
          </div>

          {/* لا يُنتقل إلى الدفع قبل أن يطابق اختيار المقاعد عدد المعتمرين. الحارس
              في الحفظ يعيد التحقق أيضاً؛ هذا التعتيم يمنع الالتباس في محطة الاستقبال. */}
          <div className="flex flex-col gap-3" aria-disabled={!seatsPicked}
            style={seatsPicked ? undefined : { opacity: 0.5, pointerEvents: "none", userSelect: "none" }}>
            <div>
              <span className="ui-label">الدفع</span>
              <Segmented label="قرار الدفع" className="w-full [&>*]:flex-1 [&>*]:justify-center" value={paidAtBranch ? "paid" : "later"}
                onChange={v => setPaidAtBranch(v === "paid")}
                options={[{ value: "later", label: "بانتظار الدفع" }, { value: "paid", label: "تم الدفع" }]} />
              {paidAtBranch && <div className="mt-2"><AppSelect ariaLabel="طريقة الدفع" value={paymentMethod} onChange={setPaymentMethod}
                options={["شبكة", "نقدي", "تحويل بنكي", "مدى", "Apple Pay"].map(v => ({ value: v, label: v }))} /></div>}
              <p className="ui-hint">{paidAtBranch ? "سيُؤكَّد الحجز وتُفتح التذكرة للطباعة بعد الإنشاء." : "لن تصدر التذكرة حتى يتم تسجيل الدفع."}</p>
            </div>
            <Button variant="primary" size="lg" block loading={saving} disabled={!selected} onClick={save}>
              {saving ? "جارٍ إنشاء الحجز…" : paidAtBranch ? "تأكيد الحجز وإصدار التذكرة" : "إنشاء الطلب · بانتظار الدفع"}
            </Button>
          </div>
          {!seatsPicked && <p className="ui-hint" style={{ marginTop: -6, textAlign: "center" }}>اختر الرحلة والمقاعد لتفعيل الدفع والإنشاء.</p>}
        </div>
      </aside>
    </div>
    {issuedTicket && <TicketCard ticket={issuedTicket} onClose={() => setIssuedTicket(null)} />}
  </section>;
}

function AccommodationChoices({ people, options, split, setSplit, hotelName }: { people: number; options: RoomSplit[]; split: RoomSplit | null; setSplit: (value: RoomSplit | null) => void; hotelName?: string }) {
  if (!people) return <div><span className="ui-label">السكن المتاح</span><p className="ui-hint" style={{ marginTop: 0 }}>حدّد عدد المعتمرين أولاً لإظهار خيارات السكن المتاحة للعميل.</p></div>;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="ui-label">السكن المتاح<span className="ui-req">*</span></span>
        {hotelName && <span className="truncate" style={{ fontSize: 12, color: B.muted }}>{hotelName}</span>}
      </div>
      <div className="flex flex-col gap-2" role="radiogroup" aria-label="السكن المتاح">
        {options.map(option => {
          const active = split?.key === option.key; const privateRoom = isPrivateAccommodation(option); const roomCount = active ? roomCountOf(split!) : 1;
          return (
            <div key={option.key} style={{ borderRadius: 12, background: B.surface, border: `1px solid ${active ? B.ink : B.border}`, boxShadow: active ? `inset 0 0 0 1px ${B.ink}` : "none" }}>
              <button type="button" role="radio" aria-checked={active} onClick={() => setSplit({ ...option, roomCount: 1 })}
                className="w-full flex items-center gap-3 text-start cursor-pointer" style={{ background: "none", border: "none", padding: "10px 12px" }}>
                <span aria-hidden className="flex items-center justify-center flex-shrink-0" style={{ width: 18, height: 18, borderRadius: 999, background: active ? B.ink : B.surface, border: `1.5px solid ${active ? B.ink : B.borderStrong}`, color: B.onInk }}>{active && <Check size={12} strokeWidth={3} />}</span>
                <span className="flex-1 min-w-0">
                  <b className="block truncate" style={{ fontSize: 13, fontWeight: 600, color: B.black }}>{tierLabel(option.type, option.rooms[0].persons)}</b>
                  <span style={{ fontSize: 12, color: B.muted }}>تكلفة الليلة: {sar(option.perNight)}</span>
                </span>
                <BedDouble size={16} style={{ color: B.muted, flexShrink: 0 }} />
              </button>
              {active && privateRoom && (
                <div className="flex items-center justify-between px-3 py-2" style={{ borderTop: `1px solid ${B.border}`, fontSize: 12, color: B.text2 }}>
                  <span>عدد الغرف المطلوبة</span>
                  <span className="flex items-center gap-1.5">
                    <IconButton size="sm" variant="outline" label="إنقاص عدد الغرف" disabled={roomCount <= 1} onClick={() => setSplit({ ...split!, roomCount: Math.max(1, roomCount - 1) })}><Minus size={13} /></IconButton>
                    <b style={{ minWidth: 18, textAlign: "center", fontSize: 14, color: B.black }}>{roomCount}</b>
                    <IconButton size="sm" variant="outline" label="زيادة عدد الغرف" onClick={() => setSplit({ ...split!, roomCount: roomCount + 1 })}><Plus size={13} /></IconButton>
                  </span>
                </div>
              )}
            </div>
          );
        })}
        {!options.length && <p className="ui-hint" style={{ marginTop: 0 }}>لا توجد خيارات سكن مناسبة لهذا التكوين.</p>}
      </div>
    </div>
  );
}

export function DashboardPage({ onMenuOpen, onNav }: { onMenuOpen?: () => void; onNav: (v: string) => void }) {
  const navigate = useNavigate();
  const bookings = useStore(s => s.bookings);
  const trips = useStore(s => s.trips);
  const packages = useStore(s => s.packages);
  const payments = useStore(s => s.payments);
  const customRequests = useStore(s => s.customRequests);
  const beneficiaries = useStore(s => s.beneficiaries);
  const [serverMetrics, setServerMetrics] = useState<ServerMetrics | null>(null);
  const [slaReady, setSlaReady] = useState(false);

  const today = todayYMD();
  const weekEnd = useMemo(() => ymdPlus(7), []);
  const monthPrefix = today.slice(0, 7);

  useEffect(() => {
    let active = true;
    void fetchSettings().then(settings => {
      configureSla(settings.pub);
      if (active) setSlaReady(true);
    });
    if (isSupabaseEnabled && supabase) {
      void supabase.rpc("admin_dashboard_metrics").then(({ data, error }) => {
        if (!active || error || !data) return;
        setServerMetrics(data as ServerMetrics);
      });
    }
    return () => { active = false; };
  }, []);

  const pkgName = useMemo(() => {
    const m = new Map(packages.map(p => [p.id, p.name]));
    return (id?: string) => (id ? m.get(id) ?? "—" : "—");
  }, [packages]);
  const tripOf = useMemo(() => {
    const m = new Map(trips.map(t => [t.id, t]));
    return (id: string) => m.get(id);
  }, [trips]);

  const m = useMemo(() => {
    const pending = bookings.filter(b => b.status === "new" || b.status === "reviewing");
    /* نفس ساعات العمل ووعد الرد اللذين يراهما المستفيد، مع استثناء
       الحالات الملغاة والمنتهية لأن pending محصور في القابلة للمعالجة. */
    const late = pending.filter(b => { const t = sentAt(b); return t !== null && businessElapsed(t, Date.now(), SLA_MS()) >= SLA_MS(); });
    const awaitingPay = bookings.filter(b => b.status === "awaiting_payment");
    const failedPay = payments.filter(p => p.payStatus === "failed");
    const newRequests = customRequests.filter(r => r.status === "new");

    const monthRevenue = payments
      .filter(p => p.payStatus === "verified" && p.payDate?.startsWith(monthPrefix))
      .reduce((a, p) => a + p.total, 0);

    /* «القادمة هذا الأسبوع» من الحالة المشتقّة: الملغاة كانت تدخلها
       لأن عمودها ما زال open أو full حتى لحظة الإلغاء وبعدها. */
    const upcoming = trips
      .filter(t => { const s = tripState(t); return s === "open" || s === "full"; })
      .filter(t => t.departureDate >= today && t.departureDate <= weekEnd)
      .sort((a, b) => a.departureDate.localeCompare(b.departureDate));

    const todayBookings = bookings.filter(b => b.createdAt?.startsWith(today));

    const recent = [...bookings]
      .sort((a, b) => (sentAt(b) ?? 0) - (sentAt(a) ?? 0))
      .slice(0, 8);

    /* الأقدم في كل مجموعة — لا في المتأخّرة وحدها. */
    const oldestOf = <T,>(rows: T[], at: (r: T) => number | null, staff: (r: T) => string | undefined) => {
      const sorted = [...rows].sort((a, b) => (at(a) ?? Infinity) - (at(b) ?? Infinity));
      const first = sorted[0];
      return first ? { at: at(first), staff: staff(first) } : null;
    };
    const inWindow = pending.filter(b => !late.includes(b));
    /* تاريخ الفاتورة تاريخُ يومٍ بلا ساعة، فيُقرأ بداية يومه — تقديرٌ
       متحفّظ لا يزعم دقّةً لا نملكها، كما في sentAt. */
    const dayStart = (d?: string) => { if (!d) return null; const t = Date.parse(d.replace(" ", "T")); return Number.isNaN(t) ? null : t; };

    return {
      pending, late, awaitingPay, failedPay, newRequests, monthRevenue, upcoming, todayBookings, recent,
      oldestLate:    oldestOf(late,        sentAt,                    b => b.staff),
      oldestPending: oldestOf(inWindow,    sentAt,                    b => b.staff),
      oldestAwait:   oldestOf(awaitingPay, sentAt,                    b => b.staff),
      oldestFailed:  oldestOf(failedPay,   p => dayStart(p.createdAt), () => undefined),
      oldestRequest: oldestOf(newRequests, r => dayStart(r.createdAt), r => r.staff),
      pendingInWindow: inWindow.length,
    };
  }, [bookings, trips, payments, customRequests, today, weekEnd, monthPrefix, slaReady]);

  const metrics = {
    monthRevenue: serverMetrics?.monthRevenue ?? m.monthRevenue,
    todayBookings: serverMetrics?.todayBookings ?? m.todayBookings.length,
    pendingBookings: serverMetrics?.pendingBookings ?? m.pending.length,
    unlinkedBookings: serverMetrics?.unlinkedBookings ?? bookings.filter(b => !beneficiaries.some(x => x.bookingIds.includes(b.id))).length,
  };
  const goBookings = (params: Record<string,string>) => navigate(`/admin/bookings?${new URLSearchParams(params).toString()}`);

  const seatBar = (t: Trip) => {
    const pct = t.seats > 0 ? Math.min(100, Math.round((t.bookedSeats / t.seats) * 100)) : 0;
    /* اللون على الامتلاء: الرحلة القريبة نصف فارغة تحتاج بيعاً، والممتلئة
       تحتاج انتباهاً لقائمة الانتظار. */
    const fg = pct >= 95 ? TONE.danger.fg : pct >= 60 ? TONE.success.fg : TONE.warn.fg;
    return { pct, fg };
  };
  const allClear = !m.late.length && m.pending.length === 0 && !m.awaitingPay.length
    && !m.failedPay.length && !m.newRequests.length && !metrics.unlinkedBookings;
  const cardLink = (label: string, view: string) => (
    <button type="button" onClick={() => onNav(view)} className="ui-btn ui-btn--ghost ui-btn--sm">{label}<ChevronLeft size={14} /></button>
  );

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{ background: B.bg }}>
      <PageHeader title="الرئيسية" crumb="نظرة عامة" search="" onSearch={() => {}} onMenuOpen={onMenuOpen} hideSearch />

      <main className="flex-1 px-4 md:px-8 pb-12 pt-1 flex flex-col gap-5">
        {/* ── الأرقام ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="إيراد هذا الشهر" value={sar(metrics.monthRevenue)} sub="دفعات ناجحة بتاريخ التحصيل" accent
            onClick={() => navigate(`/admin/payments?collected_month=${monthPrefix}`)} />
          <StatCard label="طلبات اليوم" value={metrics.todayBookings} sub="أُنشئت اليوم"
            onClick={() => goBookings({ created_on: today })} />
          <StatCard label="قيد المراجعة" value={metrics.pendingBookings} sub="بانتظار قرار موظف"
            onClick={() => goBookings({ status: "reviewing" })} />
          <StatCard label="رحلات الأسبوع" value={m.upcoming.length} sub="تنطلق خلال ٧ أيام" onClick={() => onNav("trips")} />
        </div>

        <ReceptionOperationsCenter trips={trips} packages={packages} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          {/* ── يحتاج إجراءً ── */}
          <section className="ui-card overflow-hidden">
            <div className="ui-card-head">
              <h2 className="ui-card-title">يحتاج إجراءً</h2>
              <span className="ui-card-sub">اضغط البند لتفتح شاشته</span>
            </div>
            <div className="p-2 flex flex-col">
              <ActionRow icon={AlertTriangle} tone="danger"
                label="طلبات تجاوزت وعد الردّ" count={m.late.length} oldest={m.oldestLate}
                note="مضى على إرسالها خارج ساعات الإغلاق ولم يُتّخذ قرار"
                onGo={() => goBookings({status:"reviewing", sla:"late"})} />
              <ActionRow icon={BookOpen} tone="warn"
                label="طلبات قيد المراجعة" count={m.pendingInWindow} oldest={m.oldestPending}
                note="داخل الوعد — تُراجَع وتُقبل أو تُرفض"
                onGo={() => goBookings({status:"reviewing"})} />
              <ActionRow icon={CreditCard} tone="gold"
                label="بانتظار الدفع" count={m.awaitingPay.length} oldest={m.oldestAwait}
                note="أُرسل رابط الدفع ولم يُسدَّد بعد"
                onGo={() => onNav("payments")} />
              <ActionRow icon={AlertTriangle} tone="danger"
                label="عمليات دفع فاشلة" count={m.failedPay.length} oldest={m.oldestFailed}
                note="تحتاج تواصلاً مع العميل أو إعادة إرسال الرابط"
                onGo={() => onNav("payments")} />
              <ActionRow icon={Sparkles} tone="info"
                label="طلبات مخصّصة جديدة" count={m.newRequests.length} oldest={m.oldestRequest}
                note="رحلات حسب الطلب بانتظار عرض سعر"
                onGo={() => onNav("customRequests")} />
              <ActionRow icon={Link2Off} tone="danger"
                label="طلبات غير مربوطة بمستفيد" count={metrics.unlinkedBookings}
                note="تحتاج ربطاً قبل المتابعة"
                onGo={() => goBookings({beneficiary:"unlinked"})} />
              {/* لا شيء معلّق: يُقال صريحاً بدل قسمٍ فارغ يُقرأ عطلاً. */}
              {allClear && <EmptyState compact icon={<CheckCircle2 size={20} />} title="لا شيء معلّق" note="كل الطلبات متابَعة." />}
            </div>
          </section>

          {/* ── رحلات الأسبوع ── */}
          <section className="ui-card overflow-hidden">
            <div className="ui-card-head">
              <h2 className="ui-card-title flex items-center gap-2"><CalendarClock size={16} style={{ color: B.muted }} />رحلات الأسبوع</h2>
              {cardLink("كل الرحلات", "trips")}
            </div>
            {m.upcoming.length === 0
              ? <EmptyState compact icon={<Plane size={20} />} title="لا رحلات هذا الأسبوع" note="لا رحلة تنطلق خلال سبعة أيام." />
              : m.upcoming.map((t, i) => {
                  const { pct, fg } = seatBar(t);
                  return (
                    <div key={t.id} className="px-5 py-3.5" style={{ borderTop: i ? "1px solid #F1ECE2" : "none" }}>
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <span className="truncate" style={{ fontSize: 14, fontWeight: 600, color: B.black }}>{pkgName(t.packageId)}</span>
                        <span className="flex-shrink-0" style={{ fontSize: 12, color: B.muted }}>
                          {fmtDayDate(t.departureDate)} · {fmtTime(t.departureTime)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="ui-meter flex-1"><span style={{ width: `${pct}%`, background: fg }} /></div>
                        <span className="flex-shrink-0" style={{ fontSize: 12, fontWeight: 600, color: B.text2 }}>
                          {t.bookedSeats}/{t.seats}
                        </span>
                      </div>
                    </div>
                  );
                })}
          </section>
        </div>

        {/* ── آخر الطلبات ── */}
        <section className="ui-card overflow-hidden">
          <div className="ui-card-head">
            <h2 className="ui-card-title flex items-center gap-2"><BookOpen size={16} style={{ color: B.muted }} />آخر الطلبات</h2>
            {cardLink("كل الطلبات", "bookings")}
          </div>
          {m.recent.length === 0
            ? <EmptyState compact icon={<BookOpen size={20} />} title="لا طلبات بعد" />
            : m.recent.map((b, i) => (
                <button key={b.id} type="button" onClick={() => goBookings({ open: b.id })} aria-label={`فتح الطلب ${b.id}`}
                  className="ts-action-row" style={{ borderRadius: 0, borderTop: i ? "1px solid #F1ECE2" : "none", padding: "12px 20px" }}>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate" style={{ fontSize: 14, fontWeight: 600, color: B.black }}>{b.clientName}</span>
                    <span className="block truncate" style={{ fontSize: 12, color: B.muted, marginTop: 1 }}>
                      {pkgName(b.packageId ?? tripOf(b.tripId)?.packageId)} · {b.persons} معتمر
                    </span>
                  </span>
                  {/* الرقم والتاريخ في عمودهما: نصٌّ لاتيني وسط سطرٍ عربي يُعاد ترتيبه
                      فيُقرأ «3 · TSH-1007 يوليو». */}
                  <span className="hidden md:block flex-shrink-0 text-end" style={{ fontSize: 12, color: B.muted, minWidth: 150 }}>
                    <bdi className="block" style={{ color: B.text2 }}>{b.id}</bdi>
                    <span className="block">{fmtDateTime(b.createdAt)}</span>
                  </span>
                  <span className="hidden sm:block flex-shrink-0 text-end" style={{ fontSize: 14, fontWeight: 600, color: B.black, minWidth: 90 }}>{sar(b.total)}</span>
                  <span className="flex-shrink-0 flex justify-end" style={{ minWidth: 118 }}><StatusBadge status={b.status} entity="booking" /></span>
                </button>
              ))}
        </section>

        {/* ── سطر ختامي: أرقام السجل — هادئة، لا صفَّ أرقامٍ ثانياً. ── */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-1">
          {([
            ["إجمالي الطلبات", bookings.length, "bookings", BookOpen],
            ["الباقات النشطة", packages.filter(p => p.status === "active").length, "packages", Package],
            ["المستفيدون", beneficiaries.length, "beneficiaries", UserRound],
            ["الرحلات المفتوحة", trips.filter(t => isSellable(t)).length, "trips", Plane],
          ] as const).map(([label, value, view, Icon]) => (
            <button key={label} type="button" onClick={() => onNav(view)} className="ui-btn ui-btn--link" style={{ color: B.muted, fontWeight: 500, fontSize: 13, gap: 6 }}>
              <Icon size={14} />{label}<b style={{ color: B.text3, fontWeight: 600 }}>{value.toLocaleString("en-US")}</b>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
