/* طلب تنسيق سفر — لا يحجز مقعداً عند الإرسال.
   يختار العميل رحلته المطلوبة فقط، ثم يراجع الموظف التوفر ويحوّله إلى
   الحجز القائم عند تخصيص المقعد فعلياً. */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { BusFront, Check, ChevronLeft, Plane, BedDouble, CalendarDays, UserRound } from "lucide-react";
import { B } from "@/lib/theme";
import { TasaheelMark } from "@/components/TasaheelMark";
import { SearchSelect } from "@/components/SearchSelect";
import { Spinner } from "@/components/Spinner";
import { isSellable } from "@/lib/trip";
import { todayYMD } from "@/lib/utils";
import type { Trip } from "@/types";
import { fetchCatalog, availSeats, submitCustomRequest } from "../data";
import { G } from "../ui/tokens";

type JourneyKind = "one_way" | "round_trip";
type TravelMode = "bus" | "flight";
type HotelLevel = "اقتصادي" | "متوسط" | "مميز";

const validPhone = (p: string) => /^(0?5\d{8}|(\+?966)5\d{8})$/.test(p.replace(/\s/g, ""));
const today = () => todayYMD();
const tripLabel = (trip: Trip) => `${trip.departureDate} · ${trip.departureTime} · ${trip.departureCity || trip.departurePoint} · متبقي ${availSeats(trip)} مقعد`;
const addDays = (iso: string, days: number) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
const dayTitle = (iso: string) => new Intl.DateTimeFormat("ar-SA", { weekday: "short" }).format(new Date(`${iso}T12:00:00`));
const dayNumber = (iso: string) => new Intl.DateTimeFormat("ar-SA", { day: "numeric" }).format(new Date(`${iso}T12:00:00`));
const isoFromDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function Field({ label, optional, error, children }: { label: string; optional?: boolean; error?: string; children: ReactNode }) {
  return <div className="flex flex-col gap-1.5"><label className="text-xs font-bold" style={{ color: B.text3 }}>{label}{!optional && <span style={{ color: "#C13515" }}> *</span>}</label>{children}{error && <span className="text-[11px] font-bold" style={{ color: "#C13515" }}>{error}</span>}</div>;
}

function Choice<T extends string>({ value, active, onClick, icon, title, note }: { value: T; active: boolean; onClick: (v: T) => void; icon: ReactNode; title: string; note: string }) {
  return <button type="button" onClick={() => onClick(value)} aria-pressed={active} className="text-start rounded-2xl p-4 cursor-pointer" style={{ background: active ? "#FFF7E8" : "#fff", border: `1px solid ${active ? G.gold : B.border}`, boxShadow: active ? "0 5px 14px rgba(170,120,44,.12)" : "none" }}><span className="flex items-center gap-2 mb-2" style={{ color: active ? G.gold : B.muted }}>{icon}<b className="text-sm" style={{ color: B.black }}>{title}</b></span><small className="block text-xs leading-5" style={{ color: B.text2 }}>{note}</small></button>;
}

/* التقويم هنا لا يدّعي حجزاً مؤكداً: هو نافذة مرئية على الرحلات الفعلية
   التي يمكن للفريق مراجعة مقاعدها لاحقاً، بدلاً من قائمة طويلة بلا سياق. */
function TripSchedule({ label, trips, value, onChange, excludeId }: { label: string; trips: Trip[]; value: string; onChange: (id: string) => void; excludeId?: string }) {
  const [offset, setOffset] = useState(0);
  const dates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(today(), offset * 7 + i)), [offset]);
  const eligible = trips.filter(t => t.id !== excludeId);
  const selected = eligible.find(t => t.id === value);
  const chosenDate = selected?.departureDate ?? "";
  const shown = chosenDate ? eligible.filter(t => t.departureDate === chosenDate) : [];
  return <div className="rounded-2xl p-3" style={{ border: `1px solid ${B.border}`, background: "#FFFCF7" }}>
    <div className="flex items-center justify-between gap-2 mb-3"><b className="text-sm" style={{ color: B.black }}>{label}</b><span className="text-[11px]" style={{ color: B.muted }}>اختر اليوم ثم الوقت</span></div>
    <div className="grid grid-cols-7 gap-1.5" dir="rtl">{dates.map(date => { const list = eligible.filter(t => t.departureDate === date); const active = date === chosenDate; return <button key={date} type="button" disabled={!list.length} onClick={() => onChange(list[0].id)} className="min-h-[72px] rounded-xl text-center" style={{ background: active ? "#FFF1D8" : list.length ? "#fff" : "#F1EEE9", border: `1px solid ${active ? G.gold : list.length ? B.border : "transparent"}`, color: list.length ? B.black : B.muted, opacity: list.length ? 1 : .62, cursor: list.length ? "pointer" : "default" }}><b className="block text-[10px]">{dayTitle(date)}</b><strong className="block text-xl leading-6">{dayNumber(date)}</strong><small className="block text-[9px]" style={{ color: active ? "#9B6A23" : undefined }}>{list.length ? `${list.length} رحلة` : "—"}</small></button>; })}</div>
    <div className="flex items-center justify-between mt-3"><button type="button" disabled={offset === 0} onClick={() => setOffset(n => Math.max(0, n - 1))} className="text-xs font-bold" style={{ color: offset ? B.text2 : B.muted, background: "none", border: "none" }}>الأسبوع السابق</button><button type="button" onClick={() => setOffset(n => n + 1)} className="text-xs font-bold" style={{ color: B.text2, background: "none", border: "none" }}>الأسبوع القادم</button></div>
    {chosenDate && <div className="grid gap-2 mt-3">{shown.map(t => <button key={t.id} type="button" onClick={() => onChange(t.id)} className="flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-start" style={{ background: t.id === value ? "#FFF1D8" : "#fff", border: `1px solid ${t.id === value ? G.gold : B.border}`, color: B.black }}><b className="text-sm">{t.departureTime}</b><span className="text-xs flex-1">{t.departureCity || t.departurePoint}</span><small style={{ color: "#9B6A23" }}>متبقي {availSeats(t)}</small></button>)}</div>}
  </div>;
}

/* الذهاب والعودة في الباقة ليسا رحلتين منفصلتين يختارهما العميل: الرحلة
   الواحدة تحمل الموعدين، والمقعد نفسه يُراجع لاحقاً في كروكيها. */
function IncludedReturn({ trip }: { trip?: Trip }) {
  if (!trip?.returnDate || !trip.returnTime) return <div className="rounded-2xl p-3 text-xs font-bold" style={{ background: "#FBE6E6", color: "#A12A1B", border: "1px solid #F0C7C0" }}>هذه الرحلة لم يُسجّل لها موعد عودة كامل بعد. اختر رحلة أخرى أو تواصل مع الفريق.</div>;
  const fullDate = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${trip.returnDate}T12:00:00`));
  return <div className="rounded-2xl p-3" style={{ background: "#FFFCF7", border: `1px solid ${B.border}` }}>
    <div className="flex items-center justify-between gap-2 mb-3"><b className="text-sm" style={{ color: B.black }}>موعد العودة</b><span className="text-[11px] font-bold" style={{ color: "#8E6124" }}>مضاف من نفس الباقة</span></div>
    <div className="grid grid-cols-2 gap-2"><div className="rounded-xl px-3 py-2.5" style={{ background: "#fff", border: `1px solid ${B.border}` }}><small className="block" style={{ color: B.muted }}>تاريخ العودة</small><b className="block mt-1 text-xs" style={{ color: B.black }}>{fullDate}</b></div><div className="rounded-xl px-3 py-2.5" style={{ background: "#fff", border: `1px solid ${B.border}` }}><small className="block" style={{ color: B.muted }}>وقت العودة</small><b className="block mt-1 text-base" style={{ color: B.black, direction: "ltr", textAlign: "right" }}>{trip.returnTime}</b></div></div>
  </div>;
}

function TravellerCounter({ label, count, onChange, tone, tint }: { label: string; count: number; onChange: (delta: number) => void; tone: string; tint: string }) {
  return <div className="flex items-center gap-3 rounded-2xl p-3" style={{ background: "#fff", border: `1px solid ${B.border}` }}><span className="grid place-items-center w-12 h-12 rounded-full" style={{ background: tint, color: tone }}><UserRound size={25}/></span><b className="flex-1 text-base" style={{ color: B.black }}>{label}</b><div className="flex overflow-hidden rounded-xl" style={{ border: `1px solid ${B.border}` }}><button type="button" onClick={() => onChange(1)} aria-label={`زيادة ${label}`} className="w-12 h-11 text-2xl" style={{ background: "#FFF8EB", color: "#AA7728", border: "none" }}>+</button><b className="grid place-items-center w-12 h-11 text-xl" style={{ background: "#fff", color: B.black }}>{count}</b><button type="button" onClick={() => onChange(-1)} disabled={count === 0} aria-label={`تقليل ${label}`} className="w-12 h-11 text-2xl" style={{ background: "#FCFAF7", color: count ? B.text2 : B.muted, border: "none" }}>−</button></div></div>;
}

/* للطيران لا توجد مواعيد مخزون نعرضها كالرحلات؛ لذلك هذا تقويم اختيار
   بسيط يوضح الشهر وأيام الأسبوع، من دون الإيحاء بأن السعر أو المقعد مؤكد. */
function FlightDateCalendar({ label, value, minDate, onChange }: { label: string; value: string; minDate: string; onChange: (date: string) => void }) {
  const min = new Date(`${minDate}T12:00:00`);
  const initial = value ? new Date(`${value}T12:00:00`) : min;
  const [cursor, setCursor] = useState(() => new Date(initial.getFullYear(), initial.getMonth(), 1));
  const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const leading = (start.getDay() + 1) % 7; // يبدأ الأسبوع بالسبت
  const isMinimumMonth = cursor.getFullYear() === min.getFullYear() && cursor.getMonth() === min.getMonth();
  const monthTitle = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { month: "long", year: "numeric" }).format(start);
  const weekdays = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];
  return <div className="rounded-2xl p-3" style={{ background: "#FFFCF7", border: `1px solid ${B.border}` }}>
    <div className="flex items-center justify-between gap-2 mb-3"><b className="text-sm" style={{ color: B.black }}>{label}<span style={{ color: "#C13515" }}> *</span></b><span className="text-[11px]" style={{ color: B.muted }}>اختر التاريخ المطلوب</span></div>
    <div className="flex items-center justify-between mb-3"><button type="button" disabled={isMinimumMonth} onClick={() => setCursor(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))} className="w-9 h-9 rounded-lg text-xl" style={{ border: `1px solid ${B.border}`, background: "#fff", color: isMinimumMonth ? B.muted : B.text2 }}>›</button><b className="text-base" style={{ color: B.black }}>{monthTitle}</b><button type="button" onClick={() => setCursor(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))} className="w-9 h-9 rounded-lg text-xl" style={{ border: `1px solid ${B.border}`, background: "#fff", color: B.text2 }}>‹</button></div>
    <div className="grid grid-cols-7 gap-1 text-center" dir="rtl">{weekdays.map(day => <span key={day} className="py-1 text-[10px] font-bold" style={{ color: B.muted }}>{day}</span>)}{Array.from({ length: leading }).map((_, i) => <span key={`blank-${i}`} />)}{Array.from({ length: days }, (_, i) => { const date = isoFromDate(new Date(cursor.getFullYear(), cursor.getMonth(), i + 1)); const disabled = date < minDate; const active = date === value; return <button key={date} type="button" disabled={disabled} onClick={() => onChange(date)} className="h-10 rounded-xl text-sm font-extrabold" style={{ background: active ? G.gold : "transparent", color: active ? B.black : disabled ? "#CCC5B9" : B.black, border: active ? `1px solid ${G.gold}` : "1px solid transparent", opacity: disabled ? .55 : 1 }}>{dayNumber(date)}</button>; })}</div>
    {value && <div className="mt-3 rounded-xl px-3 py-2 text-xs font-bold" style={{ background: "#fff", color: "#8E6124", border: `1px solid ${B.border}` }}>التاريخ المختار: {new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${value}T12:00:00`))}</div>}
  </div>;
}

export function CustomRequestScreen({ lang: _lang, dir, onDone, onBack }: { lang: string; dir: "rtl" | "ltr"; onDone: () => void; onBack: () => void }) {
  const [step, setStep] = useState(1);
  const [kind, setKind] = useState<JourneyKind>("one_way");
  const [mode, setMode] = useState<TravelMode>("bus");
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [outboundTripId, setOutboundTripId] = useState("");
  const [flightOutbound, setFlightOutbound] = useState("");
  const [flightReturn, setFlightReturn] = useState("");
  const [persons, setPersons] = useState(1);
  const [men, setMen] = useState(1);
  const [women, setWomen] = useState(0);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [destination, setDestination] = useState("مكة");
  const [needsHotel, setNeedsHotel] = useState(false);
  const [nights, setNights] = useState(1);
  const [hotelLevel, setHotelLevel] = useState<HotelLevel>("متوسط");
  const [nearHaram, setNearHaram] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [reqNo, setReqNo] = useState("");
  const [failed, setFailed] = useState("");

  useEffect(() => { let live = true; fetchCatalog().then(c => { if (live) setTrips(c.trips); }).catch(() => {}).finally(() => { if (live) setLoadingTrips(false); }); return () => { live = false; }; }, []);
  const availableTrips = useMemo(() => trips.filter(t => isSellable(t) && availSeats(t) > 0).sort((a, b) => `${a.departureDate}${a.departureTime}`.localeCompare(`${b.departureDate}${b.departureTime}`)), [trips]);
  const outTrip = availableTrips.find(t => t.id === outboundTripId);
  const inp = "w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none";
  const ist = { borderColor: B.border, fontFamily: "inherit", background: "#fff" } as const;
  const move = (next: number) => { setFailed(""); setStep(next); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const changeGender = (gender: "men"|"women", delta: number) => {
    const current = gender === "men" ? men : women;
    const other = gender === "men" ? women : men;
    const next = Math.max(0, Math.min(12 - other, current + delta));
    if (gender === "men") setMen(next); else setWomen(next);
    setPersons(next + other);
  };
  const stepValid = () => {
    if (step === 1) return true;
    if (step === 2) return mode === "bus" ? !!outTrip && (kind === "one_way" || (!!outTrip.returnDate && !!outTrip.returnTime)) : !!flightOutbound && (kind === "one_way" || (!!flightReturn && flightReturn >= flightOutbound)) && !!city.trim() && !!destination.trim();
    if (step === 3) return persons > 0 && men + women === persons && !!name.trim() && validPhone(phone) && !!city.trim();
    return true;
  };
  async function submit() {
    if (busy) return;
    setBusy(true); setFailed("");
    const departDate = mode === "bus" ? outTrip?.departureDate ?? "" : flightOutbound;
    const returnDate = kind === "round_trip" ? (mode === "bus" ? outTrip?.returnDate ?? "" : flightReturn) : "";
    const requestSummary = [
      `نوع الرحلة: ${kind === "round_trip" ? "ذهاب وعودة" : "اتجاه واحد"}`,
      `وسيلة السفر: ${mode === "bus" ? "باص" : "طيران"}`,
      mode === "bus" ? `رحلة الذهاب المطلوبة: ${outTrip ? tripLabel(outTrip) : "—"}` : "",
      kind === "round_trip" && mode === "bus" ? `موعد العودة ضمن الباقة: ${outTrip?.returnDate ?? "—"} · ${outTrip?.returnTime ?? "—"}` : "",
      `التوزيع: ${men} رجال · ${women} نساء`,
      needsHotel ? `السكن مطلوب: ${nights} ليالٍ · ${hotelLevel} · القرب من الحرم ${nearHaram ? "مهم" : "غير مهم"}` : "لا يحتاج إلى سكن",
      notes.trim(),
    ].filter(Boolean).join("\n");
    try {
      const id = await submitCustomRequest({ departDate, returnDate, persons, destination, roomType: needsHotel ? "غرفة خاصة" : "لا يوجد سكن", hotelLevel: needsHotel ? hotelLevel : "", tripNotes: requestSummary, name: name.trim(), phone: phone.replace(/\s/g, ""), city: city.trim(), notes: "", journeyKind: kind, travelMode: mode, outboundTripId: outTrip?.id, hotelRequested: needsHotel, hotelNights: needsHotel ? nights : undefined, hotelNearHaram: needsHotel ? nearHaram : undefined });
      setReqNo(id);
    } catch { setFailed("تعذر إرسال الطلب الآن. حاول مرة أخرى."); } finally { setBusy(false); }
  }

  if (reqNo) return <div className="ts-custom-success px-5 py-10 flex-1 flex flex-col items-center text-center gap-4"><motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "#E3F3E8" }}><Check size={34} style={{ color: G.green }} /></motion.div><div className="font-extrabold text-xl" style={{ color: B.black }}>وصلنا طلبك</div><p className="text-sm max-w-sm" style={{ color: B.text2 }}>سنراجع التوفر الفعلي ونرسل لك العرض ورابط الدفع قبل تأكيد أي مقعد.</p><div className="rounded-xl px-6 py-3" style={{ background: "#fff", border: `1px solid ${B.border}` }}><small style={{ color: B.muted }}>رقم الطلب</small><b className="block text-lg" style={{ color: G.green }}>{reqNo}</b></div><button onClick={onDone} className="mt-2 px-6 py-3 rounded-xl font-extrabold text-sm" style={{ background: G.gold, color: B.black, border: "none" }}>الرئيسية</button></div>;

  return <div className="ts-custom-shell px-4 py-4 flex flex-col gap-4" dir={dir}><header className="ts-mobile-custom-header"><button type="button" onClick={step === 1 ? onBack : () => move(step - 1)} className="ts-mobile-listing-back"><ChevronLeft size={22} style={{ transform: dir === "rtl" ? "scaleX(-1)" : undefined }} />{step === 1 ? "رجوع" : "السابق"}</button><TasaheelMark size={42} plain /></header><div className="flex gap-1" aria-label="خطوات الطلب">{[1,2,3,4].map(n => <i key={n} className="h-1 flex-1 rounded-full" style={{ background: n <= step ? G.gold : "#E9E1D6" }} />)}</div>
    {step === 1 && <section className="rounded-2xl p-4 flex flex-col gap-4" style={{ background: "#fff", border: `1px solid ${B.border}` }}><div><h1 className="font-extrabold text-lg" style={{ color: B.black }}>كيف تريد السفر؟</h1><p className="text-xs mt-1" style={{ color: B.text2 }}>اختر شكل الرحلة أولاً، ثم نعرض لك الخيارات المناسبة.</p></div><div className="grid grid-cols-2 gap-3"><Choice value="one_way" active={kind === "one_way"} onClick={v => setKind(v as JourneyKind)} icon={<CalendarDays size={19}/>} title="اتجاه واحد" note="ذهاب أو عودة بحسب موعدك"/><Choice value="round_trip" active={kind === "round_trip"} onClick={v => setKind(v as JourneyKind)} icon={<CalendarDays size={19}/>} title="ذهاب وعودة" note="اختر موعدين مناسبين لك"/></div><div className="grid grid-cols-2 gap-3"><Choice value="bus" active={mode === "bus"} onClick={v => setMode(v as TravelMode)} icon={<BusFront size={19}/>} title="باص" note="اختر من الرحلات القائمة"/><Choice value="flight" active={mode === "flight"} onClick={v => setMode(v as TravelMode)} icon={<Plane size={19}/>} title="طيران" note="طلب تسعير من الفريق"/></div><button onClick={() => move(2)} className="py-3 rounded-xl font-extrabold" style={{ background: G.gold, color: B.black, border: "none" }}>التالي</button></section>}
    {step === 2 && <section className="rounded-2xl p-4 flex flex-col gap-4" style={{ background: "#fff", border: `1px solid ${B.border}` }}><div><h1 className="font-extrabold text-lg" style={{ color: B.black }}>{mode === "bus" ? "اختر موعد الذهاب" : "اطلب رحلة طيران"}</h1><p className="text-xs mt-1" style={{ color: B.text2 }}>{mode === "bus" ? (kind === "round_trip" ? "اختر رحلة الذهاب فقط؛ العودة وتوقيتها تُؤخذ تلقائياً من نفس الباقة." : "هذه مواعيد فعلية؛ التوفر النهائي يؤكده الفريق قبل الدفع.") : "حدّد رغبتك فقط، ثم يتواصل معك الفريق بعد مراجعة خيارات الطيران."}</p></div>{mode === "bus" ? <>{loadingTrips ? <Spinner size={22} color={G.gold}/> : <>{availableTrips.length ? <><TripSchedule label="موعد الذهاب" trips={availableTrips} value={outboundTripId} onChange={setOutboundTripId}/>{kind === "round_trip" && <IncludedReturn trip={outTrip}/>}</> : <p className="text-sm" style={{ color: B.text2 }}>لا توجد رحلات باص متاحة حالياً.</p>}</>}</> : <><Field label="مدينة الانطلاق"><input value={city} onChange={e => setCity(e.target.value)} placeholder="مثال: الخبر" className={inp} style={ist}/></Field><Field label="الوجهة"><SearchSelect dir={dir} value={destination} onChange={setDestination} options={[{ value: "مكة", label: "مكة" }, { value: "المدينة المنورة", label: "المدينة المنورة" }, { value: "مكة والمدينة", label: "مكة والمدينة" }]}/></Field><FlightDateCalendar label="تاريخ الذهاب" value={flightOutbound} minDate={today()} onChange={date => { setFlightOutbound(date); if (flightReturn && flightReturn < date) setFlightReturn(""); }}/>{kind === "round_trip" && <FlightDateCalendar label="تاريخ العودة" value={flightReturn} minDate={flightOutbound || today()} onChange={setFlightReturn}/>}</>} {!stepValid() && <p className="text-xs font-bold" style={{ color: "#BE2626" }}>أكمل بيانات الموعد للمتابعة.</p>}<div className="grid grid-cols-2 gap-3"><button onClick={() => move(1)} className="py-3 rounded-xl font-extrabold" style={{ background: "#fff", color: B.text2, border: `1px solid ${B.border}` }}>السابق</button><button disabled={!stepValid()} onClick={() => move(3)} className="py-3 rounded-xl font-extrabold" style={{ background: stepValid() ? G.gold : "#d6cfc6", color: stepValid() ? B.black : "#a09688", border: "none" }}>التالي</button></div></section>}
    {step === 3 && <section className="rounded-2xl p-4 flex flex-col gap-4" style={{ background: "#fff", border: `1px solid ${B.border}` }}><div><h1 className="font-extrabold text-lg" style={{ color: B.black }}>المعتمرون</h1><p className="text-xs mt-1" style={{ color: B.text2 }}>حدّد عدد المعتمرين والمعتمرات؛ يتحدث إجمالي المقاعد تلقائياً.</p></div><TravellerCounter label="المعتمرون" count={men} onChange={delta => changeGender("men", delta)} tone="#2F74C0" tint="#EAF2FD"/><TravellerCounter label="المعتمرات" count={women} onChange={delta => changeGender("women", delta)} tone="#C6507D" tint="#FDEBF3"/><div className="rounded-xl px-4 py-3 flex items-center justify-between" style={{ background: "#FFF8EB", border: "1px solid #EBD9B9" }}><span className="text-xs font-bold" style={{ color: B.text2 }}>إجمالي المقاعد المطلوبة</span><b style={{ color: B.black }}>{persons} {persons === 1 ? "مقعد" : "مقاعد"}</b></div><div style={{ borderTop: `1px solid ${B.border}`, margin: "4px 0" }}/><div><h2 className="font-extrabold text-base" style={{ color: B.black }}>بيانات التواصل</h2><p className="text-xs mt-1" style={{ color: B.text2 }}>تُستخدم لمراجعة التوفر وإرسال العرض فقط.</p></div><Field label="الاسم"><input value={name} onChange={e => setName(e.target.value)} className={inp} placeholder="الاسم الكامل" style={ist}/></Field><Field label="رقم الجوال"><input value={phone} onChange={e => setPhone(e.target.value.replace(/[^\d+ ]/g, ""))} inputMode="tel" className={inp} placeholder="05XXXXXXXX" style={{ ...ist, direction: "ltr" }}/></Field><Field label="مدينتك"><input value={city} onChange={e => setCity(e.target.value)} className={inp} placeholder="مثال: الخبر" style={ist}/></Field><div className="grid grid-cols-2 gap-3"><button onClick={() => move(2)} className="py-3 rounded-xl font-extrabold" style={{ background: "#fff", color: B.text2, border: `1px solid ${B.border}` }}>السابق</button><button disabled={!stepValid()} onClick={() => move(4)} className="py-3 rounded-xl font-extrabold" style={{ background: stepValid() ? G.gold : "#d6cfc6", color: stepValid() ? B.black : "#a09688", border: "none" }}>التالي</button></div></section>}
    {step === 4 && <section className="rounded-2xl p-4 flex flex-col gap-4" style={{ background: "#fff", border: `1px solid ${B.border}` }}><div><h1 className="font-extrabold text-lg" style={{ color: B.black }}>هل تحتاج إلى سكن؟</h1><p className="text-xs mt-1" style={{ color: B.text2 }}>لا نعرض فنادق أو أسعاراً غير مؤكدة؛ يراجع الفريق طلبك ثم يضيف العرض الفعلي.</p></div><div className="grid grid-cols-2 gap-3"><Choice value="no" active={!needsHotel} onClick={() => setNeedsHotel(false)} icon={<Check size={19}/>} title="لا، باص/طيران فقط" note="أكمل طلب المقعد"/><Choice value="yes" active={needsHotel} onClick={() => setNeedsHotel(true)} icon={<BedDouble size={19}/>} title="نعم، أحتاج إلى سكن" note="اكتب مواصفات السكن"/></div>{needsHotel && <><div className="grid grid-cols-2 gap-3"><Field label="عدد الليالي"><input type="number" min="1" max="30" value={nights} onChange={e => setNights(Math.max(1, Number(e.target.value) || 1))} className={inp} style={ist}/></Field><Field label="مستوى الفندق"><SearchSelect dir={dir} value={hotelLevel} onChange={v => setHotelLevel(v as HotelLevel)} options={["اقتصادي","متوسط","مميز"].map(v => ({ value: v, label: v }))}/></Field></div><label className="flex gap-2 text-sm font-bold" style={{ color: B.text2 }}><input type="checkbox" checked={nearHaram} onChange={e => setNearHaram(e.target.checked)}/> القرب من الحرم مهم</label></>}<Field label="ملاحظات خاصة" optional><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className={inp} placeholder="أي احتياج إضافي أو ملاحظة…" style={{ ...ist, resize: "vertical" }}/></Field>{failed && <p className="text-xs font-bold" style={{ color: "#BE2626" }}>{failed}</p>}<button onClick={submit} disabled={busy} className="py-3 rounded-xl font-extrabold" style={{ background: busy ? "#d6cfc6" : G.gold, color: busy ? "#a09688" : B.black, border: "none" }}>{busy && <Spinner size={14} color={B.black}/>} {busy ? "جارٍ الإرسال…" : "إرسال الطلب"}</button></section>}
  </div>;
}
