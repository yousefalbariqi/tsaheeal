/* الكشوفات — الباب الذي يُفتح منه كشفُ أي إطلاقةٍ قادمة.

   ── لماذا شاشةٌ مستقلّة عن الرحلات ──
   لوحة الرحلات تجيب «ما الذي يتحرّك؟» وتُدار منها الإطلاقة نفسها:
   إطلاقٌ وتعديلٌ وإلغاء. وهذه تجيب سؤالاً آخر يُسأل في يومٍ آخر: «أعطني
   كشف حافلة الأربعاء». خلطُهما كان يعني أن يمرّ مَن يريد ورقةً بجدولٍ
   فيه عمود «إلغاء الرحلة».

   ── التجميع: الأسبوع ظرف، والباقة عنوان، والإطلاقات تحتهما ──
   «مكة ٤ أيام» تُطلق ثلاث مرّات في أسبوع — الدمام والخبر وخميسٌ آخر —
   وقائمةٌ مسطّحة تكرّر اسم الباقة ثلاث مرّات متباعدة. ومَن جاء يطبع
   كشوفات تلك الباقة يريد الثلاثة معاً في مكانٍ واحد.

   ── القادم وحده ──
   الكشف ورقةٌ تُحمل إلى حافلةٍ لم تنطلق. وما انطلق يُراجَع ولا يُجهَّز،
   فله بابٌ ثانٍ لا مكانٌ في الصدارة. */
import { useCallback, useState } from "react";
import { useSearchParams } from "react-router";
import { ClipboardList, MapPin, Clock, Bus, Users, AlertTriangle, History, ArrowRight, X, ChevronLeft } from "lucide-react";
import { B } from "@/lib/theme";
import type { Booking, Trip } from "@/types";
import { useStore } from "@/store/useStore";
import { useDebounced } from "@/lib/useDebounced";
import { EntityGate } from "@/components/States";
import { StatCard } from "@/components/StatCard";
import { PageHeader } from "@/components/PageHeader";
import { AppSelect } from "@/components/AppSelect";
import { StatusBadge } from "@/components/StatusBadge";
import {
  splitByHorizon, seatsOf, occupancy, dayName, shortDate, untilLabel,
  tripBoardState, type Horizon,
} from "@/lib/trip";
import { AR, groupLaunches, nearestLaunch, unseatedByTrip, type HotelRef } from "@/lib/manifest";
import { arCount } from "@/features/customer/plural";
import { SeatManifest } from "./SeatManifest";

/* ════════ بطاقة الإطلاقة ════════
   خمسة أشياء لا أكثر: التاريخ والوقت والمدينة والباص والمقاعد. البطاقة
   تُختار منها لا تُقرأ فيها التفاصيل — التفاصيل خلف ضغطةٍ واحدة. */
function LaunchCard({ trip, bus, unseated, nearest, onOpen }: {
  trip: Trip; bus: string; unseated: number; nearest?: boolean; onOpen: () => void;
}) {
  const { capacity, booked } = seatsOf(trip);
  const pct = occupancy(trip);
  const state = tripBoardState(trip);
  const fg = state === "full" ? "#BE2626" : state === "few" ? "#B4530C" : state === "running" ? "#0E7CA8" : "#1E7A44";
  return (
    <button onClick={onOpen}
      className="group flex flex-col gap-3 rounded-2xl px-4 py-3.5 text-right cursor-pointer w-full"
      style={{
        background: "#fff",
        /* الترتيب مقصود: المختصر أولاً ثم حافة الحالة فوقه — عكسه يدهسها. */
        border: `1px solid ${nearest ? "rgba(192,134,44,0.55)" : B.border}`,
        borderInlineStart: `3px solid ${fg}`,
        boxShadow: nearest ? "0 8px 24px -14px rgba(192,134,44,0.6)" : undefined,
      }}>
      <div className="flex items-start justify-between gap-2 w-full">
        <span className="min-w-0">
          {/* «الأقرب» وسمٌ على البطاقة لا بطاقةٌ ثانية فوق القائمة:
              الترتيب يضعها أوّلاً أصلاً، ونسخُها مرّتين يجعل الشاشة
              تبدو كأن فيها إطلاقتين في اليوم نفسه. */}
          {nearest && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg font-bold mb-1.5"
              style={{ background: B.gold, color: B.black, fontSize: 10 }}>
              <ClipboardList size={9} />الأقرب
            </span>
          )}
          <span className="block font-extrabold" style={{ color: B.black, fontSize: 14, fontFamily: "var(--font-app)" }}>
            {dayName(trip.departureDate)} {shortDate(trip.departureDate)}
          </span>
          <span className="inline-flex items-center gap-1.5 mt-1" style={{ fontSize: 11.5, color: B.muted, fontWeight: 600 }}>
            <Clock size={11} style={{ color: B.gold }} />
            <span style={{ direction: "ltr" }}>{trip.departureTime || "—"}</span>
            <span>·</span>{untilLabel(trip) || "—"}
          </span>
        </span>
        <StatusBadge status={state} entity="trip" />
      </div>

      <div className="flex flex-col gap-1.5 w-full" style={{ fontSize: 11.5, color: B.text2, fontWeight: 600 }}>
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <MapPin size={11} style={{ color: B.gold, flexShrink: 0 }} />
          <span className="truncate">{trip.departureCity || "—"}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <Bus size={11} style={{ color: B.gold, flexShrink: 0 }} />
          <span className="truncate">{bus || "—"}</span>
        </span>
      </div>

      <div className="flex items-center gap-2.5 w-full pt-2.5" style={{ borderTop: `1px solid ${B.border}` }}>
        <span className="inline-flex items-baseline gap-1 font-extrabold tabular-nums" style={{ color: B.black, fontSize: 14, fontFamily: "var(--font-app)" }}>
          {booked}<span style={{ color: B.muted, fontWeight: 600, fontSize: 11.5 }}>/ {capacity} مقعد</span>
        </span>
        <span className="rounded-full overflow-hidden flex-1" style={{ height: 5, background: "#EDE8DE", minWidth: 36 }}>
          <span className="block" style={{ width: `${pct}%`, height: "100%", background: fg, borderRadius: 999 }} />
        </span>
        <ChevronLeft size={14} style={{ color: B.muted, flexShrink: 0 }} />
      </div>

      {unseated > 0 && (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold self-start"
          style={{ background: "#FEF6EF", border: "1px solid #F5D9BE", color: "#B4530C", fontSize: 10.5 }}>
          <AlertTriangle size={10} />{unseated} بلا مقعد
        </span>
      )}
    </button>
  );
}

/* ════════ الشاشة ════════ */
export function ManifestsPage({ onMenuOpen }: { onMenuOpen?: () => void }) {
  const trips = useStore(s => s.trips);
  const bookings = useStore(s => s.bookings);
  const packages = useStore(s => s.packages);
  const transports = useStore(s => s.transports);
  const branches = useStore(s => s.branches);
  const hotels = useStore(s => s.hotels);

  /* الإطلاقة المفتوحة في المسار لا في الحالة: رابط كشفٍ بعينه يُرسَل
     لموظف، ويُحفظ في المفضّلة، وزرّ الرجوع يعود للوحة لا يخرج منها. */
  const [params, setParams] = useSearchParams();
  const openId = params.get("trip");

  const [search, setSearch] = useState("");
  const query = useDebounced(search);
  const [horizon, setHorizon] = useState<Horizon>("upcoming");
  const [pkgFilter, setPkgFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");

  const pkgOf = (id: string) => packages.find(p => p.id === id);
  const pkgName = (id: string) => pkgOf(id)?.name ?? "—";
  const branchOf = (id: string) => branches.find(b => b.id === id);
  const vehicleOf = (id: string) => transports.find(t => t.id === id);
  const cityOf = (t: Trip) => t.departureCity || branchOf(t.branchId)?.city || "";
  const busOf = (t: Trip) => {
    const v = vehicleOf(t.transportId);
    return v ? `${v.name}${v.plate ? ` — ${v.plate}` : ""}` : (t.busPlate || "");
  };

  function open(t: Trip) { const n = new URLSearchParams(params); n.set("trip", t.id); n.delete("sheet"); setParams(n); }
  /* الخروج من الكشف يمسح ورقته كذلك: بقاء `sheet` في المسار كان يفتح
     الكشف التالي على ورقةٍ اختيرت لكشفٍ آخر. */
  function close() { const n = new URLSearchParams(params); n.delete("trip"); n.delete("sheet"); setParams(n, { replace: true }); }

  const openTrip = openId ? trips.find(t => t.id === openId) : undefined;
  /* فندق الحجز: من باقته إن حملها، وإلا فندق الرحلة. الترتيب مقصود —
     الرحلة اليوم فندقٌ واحد، والقراءة من الباقة تجعل كشف السكن يقسم
     صحيحاً يوم تحمل الباقة فندقين (مكة والمدينة) بلا تعديل هنا. */
  const hotelRef = useCallback((b: Booking): HotelRef => {
    const id = packages.find(p => p.id === b.packageId)?.hotelId || openTrip?.hotelId || "";
    const h = hotels.find(x => x.id === id);
    return { id: id || "—", name: h?.name ?? "فندق غير محدَّد", city: h?.city ?? "" };
  }, [packages, hotels, openTrip?.hotelId]);

  if (openTrip) {
    return (
      <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{ background: B.bg }}>
        <PageHeader title="الكشوفات" crumb={`كشف ${pkgName(openTrip.packageId)}`} search={search} onSearch={setSearch}
          searchPlaceholder="ابحث بالباقة أو المدينة أو التاريخ أو الباص" onMenuOpen={onMenuOpen} />
        <SeatManifest trip={openTrip} pkg={pkgOf(openTrip.packageId)} vehicle={vehicleOf(openTrip.transportId)}
          branch={branchOf(openTrip.branchId)} hotelName={hotels.find(h => h.id === openTrip.hotelId)?.name ?? ""}
          hotelFor={hotelRef} bookings={bookings} onBack={close} />
      </div>
    );
  }

  /* الملغاة لا كشف لها: حافلةٌ لا تنطلق لا تُحمل إليها ورقة. وهي ظاهرةٌ
     في لوحة الرحلات حيث يُتابَع إلغاؤها ويُبلَّغ ركّابها. */
  const { upcoming, past } = splitByHorizon(trips);
  const period = (horizon === "past" ? past : upcoming).filter(t => t.status !== "cancelled" && t.status !== "archived");

  const cities = [...new Set(trips.map(cityOf).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ar"));
  const q = query.trim().toLowerCase();
  const matches = (t: Trip) =>
    (pkgFilter === "all" || t.packageId === pkgFilter) &&
    (cityFilter === "all" || cityOf(t) === cityFilter) &&
    (!q || t.id.toLowerCase().includes(q) || pkgName(t.packageId).includes(query) ||
      cityOf(t).includes(query) || busOf(t).toLowerCase().includes(q) ||
      t.departureDate.includes(q) || dayName(t.departureDate).includes(query));

  const filtered = period.filter(matches);
  const weeks = groupLaunches(filtered, pkgName, horizon);
  const unseated = unseatedByTrip(bookings);
  const soon = horizon === "upcoming" ? nearestLaunch(filtered) : undefined;

  const totals = {
    launches: period.length,
    riders: period.reduce((a, t) => a + seatsOf(t).booked, 0),
    free: period.reduce((a, t) => a + seatsOf(t).available, 0),
    unseated: period.reduce((a, t) => a + (unseated.get(t.id) ?? 0), 0),
  };

  const filtersOn = pkgFilter !== "all" || cityFilter !== "all" || !!query;
  const clear = () => { setPkgFilter("all"); setCityFilter("all"); setSearch(""); };

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{ background: B.bg }}>
      <PageHeader title="الكشوفات" crumb={horizon === "past" ? "إطلاقات ماضية" : "الإطلاقات القادمة"}
        search={search} onSearch={setSearch} searchPlaceholder="ابحث بالباقة أو المدينة أو التاريخ أو الباص"
        onMenuOpen={onMenuOpen} />

      <div className="px-4 md:px-8 pt-4 md:pt-5">
        {horizon === "past" && (
          <div className="flex items-center gap-3 flex-wrap rounded-2xl px-4 py-3 mb-4" style={{ background: B.fill, border: `1px dashed ${B.border}` }}>
            <button onClick={() => setHorizon("upcoming")} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold cursor-pointer"
              style={{ background: "#fff", border: `1px solid ${B.border}`, color: B.black, fontSize: 12.5 }}>
              <ArrowRight size={13} />العودة إلى الإطلاقات القادمة
            </button>
            <span className="font-semibold" style={{ color: B.text2, fontSize: 12 }}>
              كشوفات <b style={{ color: B.black }}>رحلاتٍ انطلقت</b> — للمراجعة لا للتجهيز.
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* الوصف يتبع الفترة: «أقربها» سؤالُ القادم، والماضي يُراجَع من
              أحدثه — و«لا إطلاقات» على خمسِ إطلاقاتٍ ماضية كذبٌ صريح. */}
          <StatCard label={horizon === "past" ? "إطلاقات ماضية" : "إطلاقات قادمة"} value={totals.launches}
            sub={horizon === "past"
              ? (totals.launches ? "الأحدث أولاً" : "لا إطلاقات ماضية في السجل")
              : soon ? `أقربها ${shortDate(soon.departureDate)} · ${untilLabel(soon)}` : "لا إطلاقات قادمة"} accent />
          <StatCard label="ركّاب" value={totals.riders} sub="على كل إطلاقات الفترة" />
          <StatCard label="مقاعد شاغرة" value={totals.free} sub="لم تُبَع بعد" />
          <StatCard label="بلا مقعد" value={totals.unseated} sub={totals.unseated ? "تنتظر تخصيصاً من الطلبات" : "كل الحجوزات مخصَّصة"} />
        </div>

        <div className="flex items-end gap-2.5 mt-5 flex-wrap">
          <div style={{ minWidth: 170, flex: "1 1 170px", maxWidth: 240 }}>
            <label className="block mb-1 font-bold" style={{ fontSize: 11, color: B.muted }}>الباقة</label>
            <AppSelect value={pkgFilter} onChange={setPkgFilter} ariaLabel="تصفية بالباقة"
              options={[{ value: "all", label: "كل الباقات" }, ...packages.map(p => ({ value: p.id, label: p.name }))]} />
          </div>
          <div style={{ minWidth: 150, flex: "1 1 150px", maxWidth: 200 }}>
            <label className="block mb-1 font-bold" style={{ fontSize: 11, color: B.muted }}>مدينة الانطلاق</label>
            <AppSelect value={cityFilter} onChange={setCityFilter} ariaLabel="تصفية بمدينة الانطلاق"
              options={[{ value: "all", label: "كل المدن" }, ...cities.map(c => ({ value: c, label: c }))]} />
          </div>
          {filtersOn && (
            <button onClick={clear} className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl font-bold cursor-pointer"
              style={{ background: "#fff", border: `1px solid ${B.border}`, color: B.text2, fontSize: 12, height: 42 }}><X size={12} />تفريغ</button>
          )}
          <div className="flex items-center gap-2.5 ms-auto" style={{ paddingBottom: 1 }}>
            <span style={{ fontSize: 12.5, color: B.muted }}>معروض <b style={{ color: B.black }}>{filtered.length}</b> من {period.length}</span>
            {horizon === "upcoming" && (
              <button onClick={() => setHorizon("past")} className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl font-bold cursor-pointer"
                style={{ background: "#fff", border: `1px solid ${B.border}`, color: B.text2, fontSize: 12.5 }}>
                <History size={13} />إطلاقات ماضية
                {past.length > 0 && <span className="px-1.5 rounded-md" style={{ background: B.fill, color: B.muted, fontSize: 11 }}>{past.length}</span>}
              </button>
            )}
          </div>
        </div>
        <div className="mt-5" style={{ height: 1, background: B.border }} />
      </div>

      <main className="flex-1 px-4 md:px-8 pb-12 pt-5 flex flex-col gap-5">
        <EntityGate entity="trips" label="الرحلات" skeleton="cards">
          {weeks.map(w => (
            <section key={w.key} className="flex flex-col gap-3">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="font-extrabold m-0" style={{ color: B.black, fontSize: 15, fontFamily: "var(--font-app)" }}>{w.label}</h2>
                <span className="px-2 py-0.5 rounded-lg font-bold" style={{ background: "#fff", border: `1px solid ${B.border}`, color: B.text2, fontSize: 11 }}>
                  {arCount(w.count, AR.launch)}
                </span>
                <span className="flex-1" style={{ height: 1, background: B.border, minWidth: 20 }} />
              </div>

              {w.packages.map(p => (
                <div key={p.packageId} className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: `1px solid ${B.border}` }}>
                  <div className="flex items-center gap-2.5 px-4 py-2.5 flex-wrap" style={{ background: B.fill, borderBottom: `1px solid ${B.border}` }}>
                    <span className="font-extrabold" style={{ color: B.black, fontSize: 13 }}>{p.packageName}</span>
                    <span className="px-2 py-0.5 rounded-lg font-bold" style={{ background: "#fff", border: `1px solid ${B.border}`, color: B.text2, fontSize: 11 }}>
                      {arCount(p.trips.length, AR.launch)}
                    </span>
                    <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: B.muted, fontSize: 11.5 }}>
                      <Users size={11} />
                      {p.trips.reduce((a, t) => a + seatsOf(t).booked, 0)} من {p.trips.reduce((a, t) => a + seatsOf(t).capacity, 0)} مقعداً
                    </span>
                  </div>
                  <div className="p-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {p.trips.map(t => (
                      <LaunchCard key={t.id} trip={t} bus={busOf(t)} unseated={unseated.get(t.id) ?? 0}
                        nearest={t.id === soon?.id} onOpen={() => open(t)} />
                    ))}
                  </div>
                </div>
              ))}
            </section>
          ))}

          {weeks.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 rounded-2xl gap-2.5" style={{ background: "#fff", border: `1px solid ${B.border}` }}>
              <ClipboardList size={40} style={{ opacity: 0.2, color: B.gold, marginBottom: 4 }} />
              <p className="font-bold m-0" style={{ color: B.black }}>
                {filtersOn ? "لا إطلاقات مطابقة للمرشّحات" : horizon === "past" ? "لا إطلاقات ماضية في السجل" : "لا إطلاقات قادمة"}
              </p>
              {!filtersOn && horizon === "upcoming" && (
                <p className="text-xs m-0" style={{ color: B.muted }}>الكشف يُنشأ مع الإطلاقة — أطلق رحلةً من شاشة الرحلات.</p>
              )}
              {filtersOn && (
                <button onClick={clear} className="px-4 py-2 rounded-xl font-bold cursor-pointer"
                  style={{ background: B.fill, border: `1px solid ${B.border}`, color: B.text2, fontSize: 12.5 }}>تفريغ المرشّحات</button>
              )}
            </div>
          )}
        </EntityGate>
      </main>
    </div>
  );
}
