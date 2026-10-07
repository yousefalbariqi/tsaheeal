import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Armchair, BusFront, CalendarDays, ChevronLeft, ChevronRight, CircleDot, RefreshCw, Users } from "lucide-react";
import { fetchCatalog, fetchPublicDashboardSeats, type Catalog, type PublicDashboardSeat } from "@/features/customer/data";
import { hideBootSplash } from "@/lib/bootSplash";
import type { Trip } from "@/types";
import { busCountOf, seatsPerBus } from "@/lib/buses";
import { fmtDateShort, fmtTime } from "@/lib/dates";
import { TasaheelMark } from "@/components/TasaheelMark";

/* الشكل كلّه في styles/customer-misc.css تحت البادئة `pdk-` (لوحة الكسوة:
   صفحة عاجية، رأس أسود بخيطٍ ذهبي، بطاقات بيضاء). الأصناف القديمة
   `.public-dashboard*` في index.css لم تعد مستعملة هنا. */

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
/* «7 أغسطس» بأرقامٍ لاتينية وتقويمٍ ميلادي — من lib/dates. كان المنسّق
   "ar-SA" عارياً فيخرج التاريخ هجرياً بأرقامٍ هندية بجوار أيامٍ ميلادية. */
const formatDate = (value: string) => fmtDateShort(value);
const weekLabel = (start: Date) => `${formatDate(ymd(start))} — ${formatDate(ymd(addDays(start, 6)))}`;
const tripName = (trip: Trip, packages: Catalog["packages"]) => packages.find(p => p.id === trip.packageId)?.name ?? "رحلة العمرة";
const remaining = (trip: Trip) => Math.max(0, trip.seats - trip.bookedSeats);
const occupancy = (trip: Trip) => trip.seats ? Math.min(100, Math.round(trip.bookedSeats / trip.seats * 100)) : 0;

function SeatLegend() {
  return (
    <ul className="pdk-legend" aria-label="دليل ألوان المقاعد">
      {(["available", "male", "female", "reserved"] as SeatState[]).map(state => (
        <li key={state}><i className="pdk-seat" data-state={state} aria-hidden />{SEAT_LABEL[state]}</li>
      ))}
    </ul>
  );
}

/* الرحلة بأكثر من باص تُرسم باصاً باصاً، وأرقام كل باصٍ من ١ — المقعد
   ٥٢ في رحلة باصاتٍ سعتها ٤٩ هو المقعد ٣ في الباص الثاني. */
function BusMap({ trip, seats }: { trip: Trip; seats: PublicDashboardSeat[] }) {
  const seatMap = new Map(seats.map(row => [row.seat, row.state]));
  const buses = busCountOf(trip);
  const perBus = buses > 1 ? seatsPerBus(trip) : trip.seats;
  const assigned = seats.length;
  const awaitingAllocation = Math.max(0, trip.bookedSeats - assigned);
  return (
    <div className="pdk-buses">
      {Array.from({ length: buses }, (_, b) => {
        const offset = b * perBus;
        const rows = Array.from(
          { length: Math.ceil(Math.max(perBus, 1) / 4) },
          (_, index) => [index * 4 + 1, index * 4 + 2, index * 4 + 3, index * 4 + 4].filter(no => no <= perBus),
        );
        const title = buses > 1 ? `الباص ${b + 1}` : trip.busCode ? `حافلة رقم ${trip.busCode}` : "الحافلة";
        return (
          <section key={b} className="pdk-bus" aria-label={`كروكي مقاعد ${title}`}>
            <div className="pdk-bus-head">
              <b><BusFront size={18} /> {title}</b>
              <span>مقدمة الحافلة</span>
            </div>
            <div className="pdk-rows">
              {rows.map((row, index) => (
                <div className="pdk-row" key={index}>
                  <div>{row.slice(0, 2).map(no => <Seat key={no} no={no} state={seatMap.get(no + offset) ?? "available"} />)}</div>
                  <span className="pdk-aisle" aria-hidden="true" />
                  <div>{row.slice(2).map(no => <Seat key={no} no={no} state={seatMap.get(no + offset) ?? "available"} />)}</div>
                </div>
              ))}
            </div>
            {b === buses - 1 && awaitingAllocation > 0 && (
              <p className="pdk-pending"><CircleDot size={15} /> {awaitingAllocation} مقعدًا محجوزًا بانتظار التوزيع</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** خانةٌ برقمها وحده — أيقونة الكرسي داخل خانةٍ عرضها ٤٠ بكسل كانت تزاحم
    الرقم، والرقم هو ما يُقرأ من بُعد. */
function Seat({ no, state }: { no: number; state: SeatState }) {
  return (
    <span className="pdk-seat" data-state={state}
      title={`${SEAT_LABEL[state]} · مقعد ${no}`} aria-label={`${SEAT_LABEL[state]} · مقعد ${no}`}>
      {no}
    </span>
  );
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

  const dayLine = (trip: Trip) =>
    `${WEEK_DAYS[atNoon(trip.departureDate).getDay()]} ${formatDate(trip.departureDate)} · ${fmtTime(trip.departureTime)}`;

  return (
    <main className="pdk" dir="rtl" lang="ar">
      <header className="pdk-head">
        <div className="pdk-head-inner">
          <div className="pdk-brand">
            <TasaheelMark size={48} />
            <div>
              <span>تساهيل العمرة · عرض تشغيلي عام</span>
              <h1>مركز عمليات الرحلات</h1>
            </div>
          </div>
          <div className="pdk-nav" aria-label="التنقل بين الأسابيع">
            <button type="button" className="pdk-iconbtn" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="الأسبوع السابق">
              <ChevronRight size={20} />
            </button>
            <button type="button" className="pdk-week" onClick={() => setWeekStart(weekStartOf(new Date()))}>
              <CalendarDays size={16} />
              <span><small>{weekFrom === ymd(weekStartOf(new Date())) ? "هذا الأسبوع" : "العودة لهذا الأسبوع"}</small>{weekLabel(weekStart)}</span>
            </button>
            <button type="button" className="pdk-iconbtn" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="الأسبوع التالي">
              <ChevronLeft size={20} />
            </button>
            <button type="button" className="pdk-iconbtn" onClick={() => void load(true)} disabled={refreshing} aria-label="تحديث البيانات">
              <RefreshCw size={18} className={refreshing ? "animate-spin" : undefined} />
            </button>
          </div>
        </div>
      </header>

      <div className="pdk-body">
        <p className="pdk-today">اليوم: {WEEK_DAYS[new Date().getDay()]} {formatDate(today)}</p>

        <section className="pdk-metrics" aria-label="ملخص الأسبوع">
          <Metric label="رحلات الأسبوع" value={weekTrips.length} icon={<BusFront size={20} />} />
          <Metric label="مقاعد متاحة" value={available} icon={<Armchair size={20} />} />
          <Metric label="قريبة من الامتلاء" value={nearlyFull} icon={<AlertTriangle size={20} />} />
          <Metric label="تنطلق اليوم" value={weekTrips.filter(t => t.departureDate === today).length} icon={<Users size={20} />} />
        </section>

        {loading ? (
          <div className="pdk-layout" aria-busy="true" aria-label="يجري تجهيز لوحة الرحلات…">
            <div className="pdk-card pdk-skel-card">
              {[0, 1, 2, 3].map(i => <div key={i} className="pdk-skel" style={{ height: 64 }} />)}
            </div>
            <div className="pdk-card pdk-skel-card">
              <div className="pdk-skel" style={{ width: "46%", height: 30 }} />
              <div className="pdk-skel" style={{ height: 320 }} />
            </div>
          </div>
        ) : !weekTrips.length ? (
          <section className="pdk-card pdk-empty">
            <span aria-hidden><CalendarDays size={28} /></span>
            <strong>لا توجد رحلات في هذا الأسبوع</strong>
            <p>انتقل إلى الأسبوع السابق أو التالي لعرض بقية الرحلات.</p>
            <button type="button" onClick={() => setWeekStart(addDays(weekStart, 7))}>الأسبوع التالي</button>
          </section>
        ) : (
          <div className="pdk-layout">
            <section className="pdk-card pdk-trips">
              <div className="pdk-card-head">
                <h2>رحلات الأسبوع <b>{weekTrips.length}</b></h2>
                <span>اختر رحلة لعرض الكروكي</span>
              </div>
              {weekTrips.map((trip, i) => (
                <button key={trip.id} type="button" className="pdk-trip"
                  data-on={trip.id === selected?.id ? "" : undefined}
                  aria-pressed={trip.id === selected?.id}
                  onClick={() => setSelectedId(trip.id)}>
                  <span className="pdk-trip-no">{i + 1}</span>
                  <span className="pdk-trip-copy">
                    <strong>{tripName(trip, catalog.packages)}</strong>
                    <small>{dayLine(trip)}</small>
                    <span className="pdk-bar" data-full={occupancy(trip) >= 85 ? "" : undefined}>
                      <i style={{ width: `${occupancy(trip)}%` }} />
                    </span>
                  </span>
                  <span className="pdk-trip-left">
                    <b>{remaining(trip)}</b>
                    <small>مقعد متبقٍ</small>
                  </span>
                </button>
              ))}
            </section>

            {selected && (
              <section className="pdk-card pdk-focus">
                <div className="pdk-focus-head">
                  <div>
                    <span>الرحلة المحددة</span>
                    <h2>{tripName(selected, catalog.packages)}</h2>
                    <p>{selected.departureCity || selected.departurePoint} <i /> {dayLine(selected)}</p>
                  </div>
                  <div className="pdk-left">
                    <small>المقاعد المتبقية</small>
                    <strong>{remaining(selected)}</strong>
                    <span>{occupancy(selected)}% إشغال</span>
                  </div>
                </div>
                <SeatLegend />
                <BusMap trip={selected} seats={seatPlans[selected.id] ?? []} />
              </section>
            )}
          </div>
        )}

        <footer className="pdk-foot">مخطط المقاعد للمتابعة التشغيلية فقط · لا يعرض أي بيانات شخصية</footer>
      </div>
    </main>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <article className="pdk-metric">
      <span aria-hidden>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </article>
  );
}
