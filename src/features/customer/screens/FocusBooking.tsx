import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BedDouble, BusFront, CalendarDays, Check, ChevronDown, ChevronLeft, MapPin, Minus, Plus, Users } from "lucide-react";
import type { Hotel, Pkg, Transport, TravellerType, Trip } from "@/types";
import { hotelDisplayName } from "@/lib/hotelName";
import { WhatsAppInlineButton } from "@/components/WhatsAppFab";
import { availSeats } from "../data";
import { bookingRoomChoices, isPrivateAccommodation, packagePrice, roomCountOf, splitTotal, type RoomSplit } from "../roomSplit";
import { hotelCover, pkgCover } from "../gallery";
import { flipRTL, money } from "../ui/tokens";
import { TravellerCountPicker } from "../ui/TravellerType";
import { ALL_AUDIENCE, audienceOf, tierLabel, tiersForTraveller } from "@/data/housing";
import type { TravellerCounts } from "../draft";

const addDays = (iso: string, days: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
};
const returnDate = (trip: Trip, pkg: Pkg) => /^\d{4}-\d{2}-\d{2}$/.test(trip.returnDate ?? "") ? trip.returnDate : addDays(trip.departureDate, Math.max(0, pkg.days - 1));
const shortDate = (iso: string, lang: "ar" | "en") => new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-US-u-ca-gregory-nu-latn", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${iso}T00:00:00`)).replace("،", "");
const roomLabel = (choice: RoomSplit, lang: "ar" | "en") => choice.rooms.length === 1 ? tierLabel(choice.type, choice.rooms[0].persons, lang) : `${choice.type} · ${choice.rooms.length} ${lang === "ar" ? "غرف" : "rooms"}`;
const departureTimeParts = (hhmm: string | undefined) => {
  const match = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? "");
  if (!match) return { value: "—", period: "" };
  const hour = Number(match[1]);
  return { value: `${hour % 12 === 0 ? 12 : hour % 12}:${match[2]}`, period: hour < 12 ? "AM" : "PM" };
};

/** لا يظهر سؤال نوع المسافر إلا عندما تقيد بيانات السكن خياراته فعلاً. */
export const needsTravellerTypeForAccommodation = (pkg: Pkg) => pkg.roomPrices.some(room => {
  const audience = audienceOf(room);
  return audience.length !== ALL_AUDIENCE.length || !ALL_AUDIENCE.every(type => audience.includes(type));
});
const transportLabel = (transport: Transport | undefined, lang: "ar" | "en") => !transport ? (lang === "ar" ? "مواصلات الرحلة" : "Trip transport") : [transport.model || transport.name, transport.year].filter(Boolean).join(" ") || transport.name;

export function FocusDetails({ pkg, trip, hotel, transport, departureCity = "", onBack, persons, travellerCounts, setTravellerCounts, split, setSplit, travellerType, onContinue, lang }: {
  pkg: Pkg; trip: Trip; hotel?: Hotel; transport?: Transport; onBack: () => void;
  departureCity?: string;
  persons: number; travellerCounts: TravellerCounts; setTravellerCounts: (counts: TravellerCounts) => void; split: RoomSplit | null; setSplit: (s: RoomSplit | null) => void;
  travellerType: TravellerType | ""; onContinue: () => void; lang: "ar" | "en";
}) {
  const end = returnDate(trip, pkg);
  /* الرحلة قد تمر بمحطات متعددة؛ نعيد الوقت الذي اختاره العميل من مدينته،
     لا وقت أول محطة فقط الذي بقي للبيانات القديمة. */
  const selectedStop = departureCity ? trip.departureStops?.find(stop => stop.city.trim() === departureCity.trim()) : trip.departureStops?.[0];
  const departureTime = departureTimeParts(selectedStop?.time ?? trip.departureTime);
  const [programOpen, setProgramOpen] = useState(false);
  const departure = selectedStop?.city || trip.departureCity || selectedStop?.point || trip.departurePoint;
  return <section className="ts-focus-detail" aria-labelledby="focus-detail-title">
    <div className="ts-focus-detail-hero"><img src={pkgCover(pkg)} alt="" onError={e => { e.currentTarget.src = "/gallery/haram-drone.jpg"; }}/><button type="button" className="ts-focus-detail-back" onClick={onBack} aria-label={lang === "ar" ? "رجوع" : "Back"}><ChevronLeft size={24} style={flipRTL(lang === "ar" ? "rtl" : "ltr")}/></button></div>
    <div className="ts-focus-detail-main">
      <header className="ts-focus-trip-summary">
        <div className="ts-focus-trip-summary-copy"><h1 id="focus-detail-title">{lang === "ar" ? `رحلة ${pkg.destination} · ${pkg.days} أيام` : `${pkg.destination} · ${pkg.days} days`}</h1><p><CalendarDays size={15}/>{lang === "ar" ? `${shortDate(trip.departureDate, lang)} ← ${shortDate(end, lang)}` : `${shortDate(trip.departureDate, lang)} – ${shortDate(end, lang)}`}</p>{departure && <p><MapPin size={15}/>{departure} · {lang === "ar" ? `${availSeats(trip)} مقعد متاح` : `${availSeats(trip)} seats available`}</p>}</div>
        <div className="ts-focus-departure-time"><small>{lang === "ar" ? "وقت الانطلاق" : "Departure"}</small><strong>{departureTime.value}</strong>{departureTime.period && <em>{departureTime.period}</em>}</div>
      </header>
      <section className="ts-focus-includes" aria-label={lang === "ar" ? "يشمل" : "Includes"}><strong>{lang === "ar" ? "يشمل" : "Includes"}</strong><span><BusFront size={18}/>{transportLabel(transport, lang)}</span><span><BedDouble size={18}/>{hotel ? hotelDisplayName(hotel.name) : (lang === "ar" ? "سكن الرحلة" : "Accommodation")}</span></section>
      <section className="ts-focus-program-compact"><button type="button" aria-expanded={programOpen} onClick={() => setProgramOpen(open => !open)}><span>{lang === "ar" ? "برنامج الرحلة" : "Trip itinerary"}</span><small>{lang === "ar" ? "عرض التفاصيل" : "View details"}</small><ChevronDown size={19}/></button>{programOpen && <div className="ts-focus-program-timeline">{pkg.program.filter(stage => !stage.archived).map((stage, index) => <article key={stage.id}><span>{index + 1}</span><div><strong>{stage.day} · {stage.title}</strong><small>{stage.time}{stage.desc ? ` · ${stage.desc}` : ""}</small></div></article>)}</div>}</section>
      <FocusConfigure embedded pkg={pkg} trip={trip} hotel={hotel} transport={transport} persons={persons} travellerCounts={travellerCounts} setTravellerCounts={setTravellerCounts} split={split} setSplit={setSplit} travellerType={travellerType} onBack={onBack} onContinue={onContinue} lang={lang}/>
    </div>
  </section>;
}

export function FocusConfigure({ pkg, trip, hotel, transport, persons, travellerCounts, setTravellerCounts, split, setSplit, travellerType, onBack, onContinue, lang, embedded = false }: {
  pkg: Pkg; trip: Trip; hotel?: Hotel; transport?: Transport; persons: number;
  travellerCounts: TravellerCounts; setTravellerCounts: (counts: TravellerCounts) => void;
  split: RoomSplit | null; setSplit: (s: RoomSplit | null) => void; travellerType: TravellerType | "";
  onBack: () => void; onContinue: () => void; lang: "ar" | "en"; embedded?: boolean;
}) {
  const max = Math.max(1, availSeats(trip));
  const requireTravellerType = needsTravellerTypeForAccommodation(pkg);
  const tiers = requireTravellerType ? (travellerType ? tiersForTraveller(pkg.roomPrices, travellerType) : []) : pkg.roomPrices;
  const rooms = useMemo(() => bookingRoomChoices(tiers, persons), [tiers, persons]);
  const chosen = split && rooms.some(room => room.key === split.key) ? split : rooms[0] ?? null;
  useEffect(() => { if (chosen !== split) setSplit(chosen); }, [chosen, split, setSplit]);
  const needsPrivacySeat = persons === 1 && travellerCounts.men === 0 && travellerCounts.women === 1;
  const transportUnits = persons + (needsPrivacySeat ? 1 : 0);
  const price = chosen ? packagePrice(chosen, persons, pkg.seatCostOverride ?? transport?.seatCost ?? 0, pkg.nights, transportUnits) : null;
  const total = price?.total ?? pkg.marketPrice * persons + (needsPrivacySeat ? (pkg.seatCostOverride ?? transport?.seatCost ?? 0) : 0);
  const hotelName = hotel ? hotelDisplayName(hotel.name) : (lang === "ar" ? "سكن الرحلة" : "Accommodation");
  return <section className={`ts-focus-configure${embedded ? " embedded" : ""}`} aria-labelledby="focus-configure-title" id={embedded ? "booking-start" : undefined}>
    {!embedded && <header className="ts-focus-configure-head"><button type="button" onClick={onBack} aria-label={lang === "ar" ? "رجوع" : "Back"}><ChevronLeft size={22} style={flipRTL(lang === "ar" ? "rtl" : "ltr")}/></button><h1 id="focus-configure-title">{lang === "ar" ? "ابدأ الحجز" : "Start booking"}</h1><span/></header>}
    <main>
      <section className="ts-focus-configure-section ts-focus-travellers"><div className="ts-focus-section-heading"><div><h2 id={embedded ? "focus-configure-title" : undefined}>{lang === "ar" ? "المعتمرون" : "Travellers"}</h2><small>{lang === "ar" ? `${availSeats(trip)} مقعد متاح · حدد عدد المعتمرين والمعتمرات` : `${availSeats(trip)} seats available · Set how many pilgrims`}</small></div><Users size={20}/></div><TravellerCountPicker value={travellerCounts} onChange={setTravellerCounts} max={max} lang={lang}/></section>
      <section className="ts-focus-configure-section ts-focus-accommodation"><div className="ts-focus-section-heading"><div><h2>{lang === "ar" ? "اختر السكن" : "Choose accommodation"}</h2><small>{lang === "ar" ? "حدد عدد الغرف الخاصة المناسب لك" : "Choose the private rooms you need"}</small></div><BedDouble size={20}/></div><article className="ts-focus-hotel-once"><img src={hotelCover(hotel, pkg.order)} alt=""/><div><strong>{hotelName}</strong>{hotel && <small>{hotel.stars} {lang === "ar" ? "نجوم" : "stars"} · {hotel.district}</small>}</div></article><div className="ts-focus-room-list">{rooms.map(room => { const active = chosen?.key === room.key; const privateRoom = isPrivateAccommodation(room); const count = active ? roomCountOf(chosen!) : 1; return <div className="ts-focus-room-choice" key={room.key}><button type="button" className={active ? "active" : ""} onClick={() => setSplit({...room,roomCount:1})} aria-pressed={active}><span className="ts-focus-room-radio">{active && <Check size={14}/>}</span><span className="ts-focus-room-copy"><strong>{roomLabel(room, lang)}</strong><small>{lang === "ar" ? `تكلفة الليلة: ${money(room.perNight)} ر.س` : `Nightly cost: ${money(room.perNight)} SAR`}</small></span></button>{active&&privateRoom&&<div className="ts-focus-room-quantity"><span>{lang === "ar" ? "عدد الغرف المطلوبة" : "Rooms needed"}</span><div><button type="button" onClick={() => setSplit({...chosen!,roomCount:Math.max(1,count-1)})} disabled={count<=1} aria-label={lang === "ar" ? "تقليل عدد الغرف" : "Decrease rooms"}><Minus size={16}/></button><strong>{count}</strong><button type="button" onClick={() => setSplit({...chosen!,roomCount:count+1})} aria-label={lang === "ar" ? "زيادة عدد الغرف" : "Increase rooms"}><Plus size={16}/></button></div></div>}</div>; })}{persons === 0 && <p className="ts-focus-room-empty">{lang === "ar" ? "حدّد عدد المعتمرين أولاً لإظهار خيارات السكن." : "Choose traveller counts first to see eligible stays."}</p>}{persons > 0 && requireTravellerType && !travellerType && <p className="ts-focus-room-empty">{lang === "ar" ? "لا تتوفر خيارات سكن مناسبة لهذا التكوين." : "No stay options match this group."}</p>}{persons > 0 && (!requireTravellerType || travellerType) && rooms.length === 0 && <p className="ts-focus-room-empty">{lang === "ar" ? "لا توجد خيارات سكن مناسبة لهذا العدد." : "No room options for this group size."}</p>}</div></section>
      <section className="ts-focus-price-summary"><h2>{lang === "ar" ? "ملخص التكلفة" : "Cost summary"}</h2><div><span>{lang === "ar" ? "إجمالي المواصلات" : "Transport total"}</span><b>{money(price?.transport ?? 0)} {lang === "ar" ? "ر.س" : "SAR"}</b></div><div><span>{lang === "ar" ? "إجمالي السكن" : "Accommodation total"}</span><b>{money(price?.accommodation ?? 0)} {lang === "ar" ? "ر.س" : "SAR"}</b></div></section>
    </main>
    <footer className="ts-focus-configure-cta"><WhatsAppInlineButton/><div><small>{lang === "ar" ? "الإجمالي" : "Total"}</small><strong>{money(total)} {lang === "ar" ? "ر.س" : "SAR"}</strong></div><button type="button" disabled={persons === 0 || !chosen || (requireTravellerType && !travellerType)} onClick={onContinue}>{lang === "ar" ? "متابعة الحجز" : "Continue booking"}<ArrowLeft size={18} style={flipRTL(lang === "ar" ? "rtl" : "ltr")}/></button></footer>
  </section>;
}
