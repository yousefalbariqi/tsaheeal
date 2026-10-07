/* الكشوفات — الباب الذي يُفتح منه كشفُ أي إطلاقةٍ قادمة.

   ── لماذا شاشةٌ مستقلّة عن الرحلات ──
   لوحة الرحلات تجيب «ما الذي يتحرّك؟» وتُدار منها الإطلاقة نفسها:
   إطلاقٌ وتعديلٌ وإلغاء. وهذه تجيب سؤالاً آخر يُسأل في يومٍ آخر: «أعطني
   كشف حافلة الأربعاء». خلطُهما كان يعني أن يمرّ مَن يريد ورقةً بجدولٍ
   فيه عمود «إلغاء الرحلة».

   ── التجميع: الأسبوع ظرف، وإطلاقات الباقة الواحدة متجاورةٌ تحته ──
   «مكة ٤ أيام» تُطلق ثلاث مرّات في أسبوع — الدمام والخبر وخميسٌ آخر —
   وقائمةٌ مرتّبة بالتاريخ وحده تفرّق اسم الباقة ثلاث مرّات متباعدة. ومَن
   جاء يطبع كشوفات تلك الباقة يريد الثلاثة معاً في مكانٍ واحد: فالجدول
   يرتّب الأسبوع بالباقة ثم بالموعد، ومجموع الباقة سطرٌ تحت اسمها.

   ── القادم وحده ──
   الكشف ورقةٌ تُحمل إلى حافلةٍ لم تنطلق. وما انطلق يُراجَع ولا يُجهَّز،
   فله بابٌ ثانٍ لا مكانٌ في الصدارة. */
import { useCallback, useState, type KeyboardEvent } from "react";
import { useSearchParams } from "react-router";
import { ClipboardList, AlertTriangle, ChevronLeft, SearchX, X } from "lucide-react";
import { B } from "@/lib/theme";
import type { Booking, Trip } from "@/types";
import { useStore } from "@/store/useStore";
import { useDebounced } from "@/lib/useDebounced";
import { EntityGate, EmptyState } from "@/components/States";
import { StatCard } from "@/components/StatCard";
import { PageHeader } from "@/components/PageHeader";
import { AppSelect } from "@/components/AppSelect";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge, Button, Note, Segmented } from "@/components/ui";
import { fmtDateShort, fmtDayDate, fmtTime } from "@/lib/dates";
import {
  splitByHorizon, seatsOf, occupancy, dayName, shortDate, untilLabel,
  tripBoardState, tripDeparture, weekStart, type Horizon,
} from "@/lib/trip";
import { AR, groupLaunches, nearestLaunch, unseatedByTrip, type HotelRef, type LaunchWeek } from "@/lib/manifest";
import { arCount } from "@/features/customer/plural";
import { busCountOf, busesLabel } from "@/lib/buses";
import { SeatManifest } from "./SeatManifest";

/* ════════ مدى الأسبوع ════════
   «الأسبوع القادم» يُقرأ مع تاريخيه: السبت إلى الجمعة كما يبدأ أسبوع
   العمل. و«لاحقاً» ليس أسبوعاً واحداً، فمداه من أول إطلاقةٍ فيه لآخرها. */
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function weekRange(w: LaunchWeek): string {
  const days = w.packages.flatMap(p => p.trips).map(t => tripDeparture(t)).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime());
  if (!days.length) return "";
  if (w.key === "later") {
    const from = ymd(days[0]), to = ymd(days[days.length - 1]);
    return from === to ? fmtDateShort(from) : `${fmtDateShort(from)} – ${fmtDateShort(to)}`;
  }
  const start = weekStart(days[0]);
  const end = new Date(start); end.setDate(end.getDate() + 6);
  return `${fmtDateShort(ymd(start))} – ${fmtDateShort(ymd(end))}`;
}

/* ════════ الإشغال ════════
   الرقم أسودُ والشريط أسود: حالة الإطلاقة تقولها شارتها، ولونٌ ثانٍ على
   الشريط كان يكرّرها. */
function Occupancy({ trip }: { trip: Trip }) {
  const { capacity, booked } = seatsOf(trip);
  return (
    <div className="flex items-center gap-3" style={{ minWidth: 150 }}>
      <span className="nowrap" style={{ fontSize: 14, color: B.black, minWidth: 68 }}>
        <b style={{ fontWeight: 600 }}>{booked}</b><span style={{ color: B.muted, fontSize: 13 }}> من {capacity}</span>
      </span>
      <div className="ui-meter flex-1" aria-hidden style={{ minWidth: 56 }}>
        <span style={{ width: `${occupancy(trip)}%` }} />
      </div>
    </div>
  );
}

/* ════════ جاهزية الكشف ════════
   ما يمنع طباعته اليوم: حجزٌ قائم لم يُخصَّص مقعده. والسائق ليس شرطاً —
   هو بالتعاقد ويُكتب حين يُعرف. */
function Readiness({ booked, unseated }: { booked: number; unseated: number }) {
  if (unseated > 0) return <Badge tone="warn"><AlertTriangle size={12} />{unseated} بلا مقعد</Badge>;
  if (booked === 0) return <Badge tone="neutral">لا ركّاب بعد</Badge>;
  return <Badge tone="success" dot>جاهز</Badge>;
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
    const n = busCountOf(t);
    const name = v ? `${v.name}${v.plate && n === 1 ? ` — ${v.plate}` : ""}` : (t.busPlate || "");
    return n > 1 ? `${name} · ${busesLabel(n)}` : name;
  };

  function open(t: Trip) { const n = new URLSearchParams(params); n.set("trip", t.id); n.delete("sheet"); n.delete("bus"); setParams(n); }
  /* الخروج من الكشف يمسح ورقته كذلك: بقاء `sheet` في المسار كان يفتح
     الكشف التالي على ورقةٍ اختيرت لكشفٍ آخر. */
  function close() { const n = new URLSearchParams(params); n.delete("trip"); n.delete("sheet"); n.delete("bus"); setParams(n, { replace: true }); }

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
        {/* البحث يرشّح القائمة لا الكشف المفتوح — فلا حقل له هنا. */}
        <PageHeader title="الكشوفات" crumb={`كشف ${pkgName(openTrip.packageId)}`} search={search} onSearch={setSearch}
          hideSearch onMenuOpen={onMenuOpen} />
        {/* المفتاح الإطلاقة: مسوّدة السائقين تُبنى منها، فالانتقال إلى
            كشفٍ آخر يبدأ بسائقيه لا بما كُتب للسابق. */}
        <SeatManifest key={openTrip.id} trip={openTrip} pkg={pkgOf(openTrip.packageId)} vehicle={vehicleOf(openTrip.transportId)}
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
  const onRowKey = (t: Trip) => (e: KeyboardEvent) => { if (e.key === "Enter" && e.target === e.currentTarget) open(t); };
  const countLabel = filtered.length === period.length ? arCount(period.length, AR.launch) : `${filtered.length} من ${period.length}`;
  const pastCount = past.filter(t => t.status !== "cancelled" && t.status !== "archived").length;

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{ background: B.bg }}>
      <PageHeader title="الكشوفات" crumb={horizon === "past" ? "إطلاقات ماضية" : "الإطلاقات القادمة"}
        search={search} onSearch={setSearch} searchPlaceholder="ابحث بالباقة أو المدينة أو التاريخ أو الباص"
        onMenuOpen={onMenuOpen} />

      <div className="px-4 md:px-8 pt-1">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* الوصف يتبع الفترة: «أقربها» سؤالُ القادم، والماضي يُراجَع من
              أحدثه — و«لا إطلاقات» على خمسِ إطلاقاتٍ ماضية كذبٌ صريح. */}
          <StatCard label={horizon === "past" ? "إطلاقات ماضية" : "إطلاقات قادمة"} value={totals.launches}
            sub={horizon === "past"
              ? (totals.launches ? "الأحدث أولاً" : "لا إطلاقات ماضية في السجل")
              : soon ? `أقربها ${shortDate(soon.departureDate)} · ${untilLabel(soon)}` : "لا إطلاقات قادمة"} accent />
          <StatCard label="ركّاب" value={totals.riders} sub="على كل إطلاقات الفترة" />
          <StatCard label="مقاعد شاغرة" value={totals.free} sub="لم تُبَع بعد" />
          <StatCard label="بلا مقعد" value={totals.unseated} alert sub={totals.unseated ? "تنتظر تخصيصاً من الطلبات" : "كل الحجوزات مخصَّصة"} />
        </div>

        {/* الفترة مقطّعٌ لا زرّان: «إطلاقات ماضية» كان زرّاً هنا و«العودة إلى
            القادمة» زرّاً في شريطٍ آخر — موضعان لمفتاحٍ واحد. */}
        <div className="ts-toolbar">
          <div className="flex items-center justify-between gap-3 w-full sm:w-auto">
            <Segmented label="الفترة" value={horizon} onChange={v => setHorizon(v)}
              options={[
                { value: "upcoming", label: "القادمة" },
                { value: "past", label: <>الماضية{pastCount > 0 && <span style={{ color: B.muted, fontWeight: 500 }}>{pastCount}</span>}</> },
              ]} />
            <span className="sm:hidden ts-count">{countLabel}</span>
          </div>
          <div style={{ flex: "1 1 150px", maxWidth: 240, minWidth: 0 }}>
            <AppSelect value={pkgFilter} onChange={setPkgFilter} ariaLabel="تصفية بالباقة"
              options={[{ value: "all", label: "كل الباقات" }, ...packages.map(p => ({ value: p.id, label: p.name }))]} />
          </div>
          <div style={{ flex: "1 1 130px", maxWidth: 200, minWidth: 0 }}>
            <AppSelect value={cityFilter} onChange={setCityFilter} ariaLabel="تصفية بمدينة الانطلاق"
              options={[{ value: "all", label: "كل المدن" }, ...cities.map(c => ({ value: c, label: c }))]} />
          </div>
          {filtersOn && <Button variant="ghost" icon={<X size={15} />} onClick={clear}>إزالة المرشّحات</Button>}
          <span className="hidden sm:flex ts-toolbar-end ts-count" aria-live="polite">{countLabel}</span>
        </div>

        {horizon === "past" && (
          <Note tone="neutral" className="mb-4">كشوفات <b style={{ color: B.black }}>رحلاتٍ انطلقت</b> — للمراجعة لا للتجهيز.</Note>
        )}
      </div>

      <main className="flex-1 px-4 md:px-8 pb-8">
        <EntityGate entity="trips" label="الرحلات" cols={6}>
          {/* المكتب: جدولٌ واحد لكل الأسابيع — رأسٌ واحد وأعمدةٌ مصطفّة من
              أسبوعٍ لآخر، والأسبوع صفُّ عنوانٍ بتاريخيه وعدّه. الصفّ كلّه
              يفتح الكشف. */}
          {weeks.length > 0 && (
            <div className="hidden md:block ui-table-wrap">
              <div className="ui-table-scroll">
                <table className="ui-table" style={{ minWidth: 900 }}>
                  <thead>
                    <tr>
                      <th>الموعد</th>
                      <th>الباقة</th>
                      <th>الانطلاق</th>
                      <th>المقاعد</th>
                      <th>الحالة</th>
                      <th>الكشف</th>
                      <th className="col-action"><span className="sr-only">فتح</span></th>
                    </tr>
                  </thead>
                  {weeks.map(w => {
                    const range = weekRange(w);
                    return (
                      <tbody key={w.key}>
                        <tr>
                          <th colSpan={7} scope="rowgroup" style={{ padding: "22px 16px 10px", textAlign: "start", background: B.surface, borderBottom: `1px solid ${B.border}` }}>
                            <div className="flex items-baseline gap-3">
                              <h2 className="ts-section-title">{w.label}</h2>
                              {range && <span style={{ fontSize: 13, fontWeight: 400, color: B.muted }}>{range}</span>}
                              <span className="ms-auto ts-count" style={{ fontWeight: 400 }}>{arCount(w.count, AR.launch)}</span>
                            </div>
                          </th>
                        </tr>
                        {w.packages.flatMap(p => {
                          const many = p.trips.length > 1;
                          return p.trips.map((t, i) => (
                            <tr key={t.id} className="is-clickable" tabIndex={0} aria-label={`فتح كشف ${p.packageName} — ${fmtDayDate(t.departureDate)}`}
                              onClick={() => open(t)} onKeyDown={onRowKey(t)}>
                              <td className="nowrap">
                                <div className="cell-main flex items-center gap-2">
                                  {fmtDayDate(t.departureDate)}
                                  {/* «الأقرب» وسمٌ على الصفّ لا بطاقةٌ ثانية فوق القائمة:
                                      الترتيب يضعه أوّلاً أصلاً، ونسخُه مرّتين يجعل الشاشة
                                      تبدو كأن فيها إطلاقتين في اليوم نفسه. */}
                                  {t.id === soon?.id && <Badge tone="gold">الأقرب</Badge>}
                                </div>
                                <div className="cell-sub">{fmtTime(t.departureTime)}{untilLabel(t) && ` · ${untilLabel(t)}`}</div>
                              </td>
                              <td>
                                <div className="nowrap" style={{ color: B.text3 }}>{p.packageName}</div>
                                {/* مجموع الباقة مرّةً عند أول إطلاقاتها — لا في كل صفّ. */}
                                {many && i === 0 && (
                                  <div className="cell-sub nowrap">
                                    {arCount(p.trips.length, AR.launch)} · {p.trips.reduce((a, x) => a + seatsOf(x).booked, 0)} من {p.trips.reduce((a, x) => a + seatsOf(x).capacity, 0)} مقعداً
                                  </div>
                                )}
                              </td>
                              <td>
                                <div className="nowrap" style={{ color: B.text3 }}>{t.departureCity || "—"}</div>
                                <div className="cell-sub nowrap" title={busOf(t) || undefined}>{busOf(t) || "—"}</div>
                              </td>
                              <td><Occupancy trip={t} /></td>
                              <td><StatusBadge status={tripBoardState(t)} entity="trip" /></td>
                              <td><Readiness booked={seatsOf(t).booked} unseated={unseated.get(t.id) ?? 0} /></td>
                              <td className="col-action"><ChevronLeft size={16} aria-hidden style={{ color: B.muted, display: "inline-block" }} /></td>
                            </tr>
                          ));
                        })}
                      </tbody>
                    );
                  })}
                </table>
              </div>
            </div>
          )}

          {/* الجوال: الأسبوع عنوانٌ وتحته بطاقةٌ واحدة، وكل إطلاقةٍ زرّ. */}
          <div className="md:hidden flex flex-col gap-6">
            {weeks.map(w => {
              const range = weekRange(w);
              return (
                <section key={w.key} className="flex flex-col gap-2.5" aria-label={w.label}>
                  <div className="flex items-baseline gap-x-3 gap-y-1 flex-wrap">
                    <h2 className="ts-section-title">{w.label}</h2>
                    {range && <span style={{ fontSize: 13, color: B.muted }}>{range}</span>}
                    <span className="ms-auto ts-count">{arCount(w.count, AR.launch)}</span>
                  </div>
                  <div className="ui-card overflow-hidden">
                    {w.packages.flatMap(p => p.trips.map(t => (
                      <button key={t.id} type="button" onClick={() => open(t)}
                        className="ts-action-row" style={{ borderRadius: 0, padding: "14px 16px", alignItems: "stretch", borderTop: `1px solid ${B.border}`, marginTop: -1 }}>
                        <span className="flex-1 min-w-0 flex flex-col gap-2">
                          <span className="flex items-start justify-between gap-2">
                            <span className="min-w-0">
                              <span className="flex items-center gap-2 flex-wrap" style={{ fontSize: 15, fontWeight: 600, color: B.black }}>
                                {fmtDayDate(t.departureDate)}
                                {t.id === soon?.id && <Badge tone="gold">الأقرب</Badge>}
                              </span>
                              <span className="block" style={{ fontSize: 12, color: B.muted, marginTop: 2 }}>
                                {fmtTime(t.departureTime)}{untilLabel(t) && ` · ${untilLabel(t)}`}
                              </span>
                            </span>
                            <StatusBadge status={tripBoardState(t)} entity="trip" />
                          </span>
                          <span className="block" style={{ fontSize: 14, color: B.text3 }}>
                            {p.packageName}
                            <span className="block truncate" style={{ fontSize: 12, color: B.muted, marginTop: 2 }}>
                              {t.departureCity || "—"}{busOf(t) && ` · ${busOf(t)}`}
                            </span>
                          </span>
                          <span className="flex items-center gap-3 flex-wrap">
                            <span className="flex-1" style={{ minWidth: 150 }}><Occupancy trip={t} /></span>
                            <Readiness booked={seatsOf(t).booked} unseated={unseated.get(t.id) ?? 0} />
                          </span>
                        </span>
                        <ChevronLeft size={18} aria-hidden style={{ color: B.muted, flexShrink: 0, alignSelf: "center" }} />
                      </button>
                    )))}
                  </div>
                </section>
              );
            })}
          </div>

          {weeks.length === 0 && (
            <EmptyState
              icon={filtersOn ? <SearchX size={22} /> : <ClipboardList size={22} />}
              title={filtersOn ? "لا إطلاقات تطابق المرشّحات" : horizon === "past" ? "لا إطلاقات ماضية في السجل" : "لا إطلاقات قادمة"}
              note={filtersOn ? "جرّب كلمةً أخرى أو أزل المرشّحات."
                : horizon === "upcoming" ? "الكشف يُنشأ مع الإطلاقة — أطلق رحلةً من شاشة الرحلات." : undefined}
              action={filtersOn ? <Button variant="secondary" onClick={clear}>إزالة المرشّحات</Button> : undefined} />
          )}
        </EntityGate>
      </main>
    </div>
  );
}
