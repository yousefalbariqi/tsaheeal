import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Armchair, BusFront, CalendarDays, ChevronLeft, ChevronRight, CircleDot, RefreshCw, Users } from "lucide-react";
import { fetchCatalog, fetchPublicDashboardSeats, type Catalog, type PublicDashboardSeat } from "@/features/customer/data";
import { hideBootSplash } from "@/lib/bootSplash";
import type { Trip } from "@/types";

type SeatState = "male" | "female" | "reserved" | "available";
const WEEK_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const SEAT_LABEL: Record<SeatState, string> = { male: "رجال", female: "نساء", reserved: "غير متاح", available: "متاح" };

const atNoon = (value: string | Date) => {
  const d = typeof value === "string" ? new Date(`${value}T12:00:00`) : new Date(value);
  return d;
};
const ymd = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const addDays = (date: Date, days: number) => { const d = new Date(date); d.setDate(d.getDate() + days); return d; };
const weekStartOf = (date: Date) => addDays(atNoon(date), -atNoon(date).getDay());
const formatDate = (value: string) => new Intl.DateTimeFormat("ar-SA", { day: "numeric", month: "long" }).format(atNoon(value));
const weekLabel = (start: Date) => `${formatDate(ymd(start))} — ${formatDate(ymd(addDays(start, 6)))}`;
const tripName = (trip: Trip, packages: Catalog["packages"]) => packages.find(p => p.id === trip.packageId)?.name ?? "رحلة العمرة";
const remaining = (trip: Trip) => Math.max(0, trip.seats - trip.bookedSeats);
const occupancy = (trip: Trip) => trip.seats ? Math.min(100, Math.round(trip.bookedSeats / trip.seats * 100)) : 0;

function SeatLegend() {
  return <div className="public-dashboard-legend" aria-label="دليل ألوان المقاعد">
    {(["male", "female", "available", "reserved"] as SeatState[]).map(state => <span key={state}><i className={`is-${state}`}/>{SEAT_LABEL[state]}</span>)}
  </div>;
}

function BusMap({ trip, seats }: { trip: Trip; seats: PublicDashboardSeat[] }) {
  const seatMap = new Map(seats.map(row => [row.seat, row.state]));
  const rows = Array.from({ length: Math.ceil(Math.max(trip.seats, 1) / 4) }, (_, index) => [index * 4 + 1, index * 4 + 2, index * 4 + 3, index * 4 + 4].filter(no => no <= trip.seats));
  const assigned = seats.length;
  const awaitingAllocation = Math.max(0, trip.bookedSeats - assigned);
  return <section className="public-dashboard-bus" aria-label={`كروكي مقاعد ${tripName(trip, [])}`}>
    <div className="public-dashboard-bus-head"><span><BusFront size={19}/> {trip.busCode ? `حافلة رقم ${trip.busCode}` : "الحافلة"}</span><small>مقدمة الحافلة</small></div>
    <div className="public-dashboard-seat-rows">
      {rows.map((row, index) => <div className="public-dashboard-seat-row" key={index}>
        <div>{row.slice(0, 2).map(no => <Seat key={no} no={no} state={seatMap.get(no) ?? "available"}/>)}</div>
        <span className="public-dashboard-aisle" aria-hidden="true">{index + 1}</span>
        <div>{row.slice(2).map(no => <Seat key={no} no={no} state={seatMap.get(no) ?? "available"}/>)}</div>
      </div>)}
    </div>
    {awaitingAllocation > 0 && <p className="public-dashboard-allocation"><CircleDot size={15}/> {awaitingAllocation} مقعدًا محجوزًا بانتظار التوزيع</p>}
  </section>;
}

function Seat({ no, state }: { no: number; state: SeatState }) {
  return <span className={`public-dashboard-seat is-${state}`} title={`${SEAT_LABEL[state]} · مقعد ${no}`} aria-label={`${SEAT_LABEL[state]} · مقعد ${no}`}><Armchair size={17}/><b>{no}</b></span>;
}

export default function PublicDashboard() {
  const [catalog, setCatalog] = useState<Catalog>({ packages: [], trips: [], hotels: [], transports: [] });
  const [weekStart, setWeekStart] = useState(() => weekStartOf(new Date()));
  const [seatPlans, setSeatPlans] = useState<Record<string, PublicDashboardSeat[]>>({});
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const weekFrom = ymd(weekStart);
  const weekTo = ymd(addDays(weekStart, 6));

  const load = async (busy = false) => {
    busy ? setRefreshing(true) : setLoading(true);
    try {
      const next = await fetchCatalog();
      setCatalog(next);
      const plans = await fetchPublicDashboardSeats(weekFrom, weekTo);
      setSeatPlans(plans);
    } finally {
      setLoading(false); setRefreshing(false); hideBootSplash();
    }
  };
  useEffect(() => { void load(); }, [weekFrom, weekTo]);

  const weekTrips = useMemo(() => catalog.trips.filter(t => t.departureDate >= weekFrom && t.departureDate <= weekTo)
    .sort((a, b) => `${a.departureDate}${a.departureTime}`.localeCompare(`${b.departureDate}${b.departureTime}`)), [catalog.trips, weekFrom, weekTo]);
  useEffect(() => { if (!weekTrips.some(t => t.id === selectedId)) setSelectedId(weekTrips[0]?.id ?? ""); }, [weekTrips, selectedId]);
  const selected = weekTrips.find(t => t.id === selectedId) ?? weekTrips[0];
  const available = weekTrips.reduce((sum, trip) => sum + remaining(trip), 0);
  const nearlyFull = weekTrips.filter(trip => occupancy(trip) >= 85 && remaining(trip) > 0).length;
  const today = ymd(new Date());

  return <main className="public-dashboard" dir="rtl" lang="ar">
    <header className="public-dashboard-header">
      <div><span className="public-dashboard-kicker">تساهيل العمرة · عرض تشغيلي عام</span><h1>مركز عمليات الرحلات</h1><p><CalendarDays size={16}/> {weekLabel(weekStart)} <em>·</em> {WEEK_DAYS[new Date().getDay()]} {formatDate(today)}</p></div>
      <div className="public-dashboard-week-nav" aria-label="التنقل بين الأسابيع"><button onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="الأسبوع السابق"><ChevronRight size={20}/></button><button className="is-current" onClick={() => setWeekStart(weekStartOf(new Date()))}>هذا الأسبوع</button><button onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="الأسبوع التالي"><ChevronLeft size={20}/></button><button className="is-refresh" onClick={() => void load(true)} disabled={refreshing} aria-label="تحديث البيانات"><RefreshCw size={17} className={refreshing ? "is-spinning" : ""}/></button></div>
    </header>

    <section className="public-dashboard-metrics" aria-label="ملخص الأسبوع">
      <Metric label="رحلات الأسبوع" value={weekTrips.length} icon={<BusFront/>}/><Metric label="مقاعد متاحة" value={available} icon={<Armchair/>}/><Metric label="قريبة من الامتلاء" value={nearlyFull} icon={<AlertTriangle/>}/><Metric label="تنطلق اليوم" value={weekTrips.filter(t => t.departureDate === today).length} icon={<Users/>}/>
    </section>

    {loading ? <div className="public-dashboard-loading">يجري تجهيز لوحة الرحلات…</div> : !weekTrips.length ? <section className="public-dashboard-empty"><CalendarDays size={28}/><strong>لا توجد رحلات في هذا الأسبوع</strong><span>انتقل إلى الأسبوع السابق أو التالي لعرض بقية الرحلات.</span></section> : <div className="public-dashboard-layout">
      <section className="public-dashboard-trips"><div className="public-dashboard-section-title"><div><span>كل الرحلات</span><h2>{weekTrips.length} رحلات في هذا الأسبوع</h2></div><small>اختر رحلة لعرض الكروكي</small></div>{weekTrips.map(trip => <button key={trip.id} type="button" className={`public-dashboard-trip ${trip.id === selected?.id ? "is-selected" : ""}`} onClick={() => setSelectedId(trip.id)}><span className="public-dashboard-trip-number">{weekTrips.indexOf(trip) + 1}</span><span className="public-dashboard-trip-copy"><strong>{tripName(trip, catalog.packages)}</strong><small>{WEEK_DAYS[atNoon(trip.departureDate).getDay()]} {formatDate(trip.departureDate)} · {trip.departureTime}</small><span className="public-dashboard-progress"><i style={{ width: `${occupancy(trip)}%` }}/></span></span><span className="public-dashboard-trip-stats"><b>{remaining(trip)}</b><small>مقعد متبقٍ</small></span></button>)}</section>
      {selected && <section className="public-dashboard-focus"><div className="public-dashboard-focus-head"><div><span>الرحلة المحددة</span><h2>{tripName(selected, catalog.packages)}</h2><p>{selected.departureCity || selected.departurePoint} <i/> {WEEK_DAYS[atNoon(selected.departureDate).getDay()]} {formatDate(selected.departureDate)} · {selected.departureTime}</p></div><div className="public-dashboard-remaining"><small>المقاعد المتبقية</small><strong>{remaining(selected)}</strong><span>{occupancy(selected)}% إشغال</span></div></div><SeatLegend/><BusMap trip={selected} seats={seatPlans[selected.id] ?? []}/></section>}
    </div>}
    <footer className="public-dashboard-footer">مخطط المقاعد للمتابعة التشغيلية فقط · لا يعرض أي بيانات شخصية</footer>
  </main>;
}

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) { return <article><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></article>; }
