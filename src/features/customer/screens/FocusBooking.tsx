import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BedDouble, BusFront, CalendarDays, Check, ChevronDown, ChevronLeft, MapPin, Minus, Plus, Users } from "lucide-react";
import type { Hotel, Pkg, Transport, TravellerType, Trip } from "@/types";
import { hotelDisplayName } from "@/lib/hotelName";
import { WhatsAppInlineButton } from "@/components/WhatsAppFab";
import { availSeats } from "../data";
import { bookingRoomChoices, isPrivateAccommodation, packagePrice, roomCountOf, splitTotal, type RoomSplit } from "../roomSplit";
import { hotelCover, pkgCover, transportCover } from "../gallery";
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

/* لا نعرض سعة الحافلة كاملةً؛ العميل يحتاج أن يعرف إن كان الحجز متاحاً،
   ويحتاج العدد الدقيق فقط عندما يقترب الامتلاء فعلاً. */
const availabilityLabel=(seats:number,lang:"ar"|"en")=>{
  if(seats<=0) return lang==="ar" ? "اكتمل الحجز" : "Fully booked";
  if(seats===1) return lang==="ar" ? "متبقي مقعد واحد" : "1 seat left";
  if(seats<=6) return lang==="ar" ? `متبقي ${seats} مقاعد` : `${seats} seats left`;
  return lang==="ar" ? "مقاعد متاحة للحجز" : "Seats available to book";
};

/* مخطط الأسرّة يشرح السعة في لحظة: في الغرفة الخاصة كل الأسرة ذهبية لأنها
   للعميل، وفي السكن المشترك سرير واحد ذهبي والبقية رمادية لأنها لزملائه.
   نعرض أربع أيقونات كحدّ ثابت حتى لا تكبر البطاقة مع أي سعة أعلى. */
function RoomCapacityVisual({capacity,shared,lang}:{capacity:number;shared:boolean;lang:"ar"|"en"}) {
  const safe=Math.max(1,Math.trunc(capacity)||1);
  const shown=Math.min(4,safe);
  const included=shared?1:shown;
  const label=lang==="ar"
    ? (shared ? `سريرك ضمن غرفة مشتركة من ${safe} أسرّة` : `غرفة خاصة تضم ${safe} أسرّة`)
    : (shared ? `Your bed in a shared room with ${safe} beds` : `Private room with ${safe} beds`);
  return <span className={`ts-room-capacity${shared?" is-shared":""}`} aria-label={label}>
    <span className="ts-room-capacity-beds" aria-hidden="true">
      {Array.from({length:shown},(_,i)=><BedDouble key={i} size={22} className={i<included?"is-included":""}/>) }
    </span>
    {safe>4&&<em>+{safe-4}</em>}
  </span>;
}

/* الصور والمزايا هنا ليست نصاً تسويقياً ثابتاً: كل بطاقة تُبنى من الباص
   والفندق المرتبطين فعلياً بالرحلة. لهذا لا يعد العميل بمكيّف أو قربٍ من
   الحرم ما لم تكن الميزة أو المسافة مسجلة في البيانات. */
function JourneyExperienceCard({kind,transport,hotel,lang}:{kind:"transport"|"hotel";transport?:Transport;hotel?:Hotel;lang:"ar"|"en"}) {
  const isTransport=kind==="transport";
  const name=isTransport ? transportLabel(transport,lang) : hotel ? hotelDisplayName(hotel.name) : "";
  const features=isTransport ? (transport?.features??[]) : (hotel?.features??[]);
  const nearby=!!hotel&&hotel.distanceM>0&&hotel.distanceM<=1000;
  const title=isTransport
    ? (lang==="ar" ? "رحلة أكثر راحة" : "A more comfortable ride")
    : (nearby ? (lang==="ar" ? "إقامة قريبة ومريحة" : "A comfortable stay nearby") : (lang==="ar" ? "إقامة مريحة" : "A comfortable stay"));
  const description=isTransport
    ? (lang==="ar" ? `${transport?.vehicleType??"وسيلة النقل"}${name?` · ${name}`:""}` : `${name}${transport?.vehicleType?` · ${transport.vehicleType}`:""}`)
    : (lang==="ar"
      ? `${name}${hotel ? ` · ${hotel.stars} نجوم` : ""}${hotel?.district ? ` · ${hotel.district}` : ""}${hotel?.distanceM ? ` · ${hotel.distanceM}م عن الحرم` : ""}`
      : `${name}${hotel ? ` · ${hotel.stars} stars` : ""}${hotel?.district ? ` · ${hotel.district}` : ""}`);
  if(!name) return null;
  return <article className="ts-focus-experience-card">
    <img src={isTransport?transportCover(transport):hotelCover(hotel)} alt={isTransport?(lang==="ar"?"وسيلة نقل الرحلة":"Trip transport"):lang==="ar"?"فندق الرحلة":"Trip hotel"}/>
    <div className="ts-focus-experience-copy">
      <span className="ts-focus-experience-icon">{isTransport?<BusFront size={18}/>:<BedDouble size={18}/>}</span>
      <div><h3>{title}</h3><p>{description}</p></div>
      {features.length>0&&<ul className="ts-focus-experience-features" aria-label={lang==="ar" ? `مميزات ${isTransport?"النقل":"الفندق"}` : `${isTransport?"Transport":"Hotel"} features`}>
        {features.map(feature=><li key={feature.id}>{feature.text}</li>)}
      </ul>}
    </div>
  </article>;
}

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
  const visibleProgram=pkg.program.filter(stage=>!stage.archived);
  const tripDetails=[transport&&transportLabel(transport,lang),hotel&&hotelDisplayName(hotel.name)].filter((item):item is string=>!!item);
  return <section className="ts-focus-detail" aria-labelledby="focus-detail-title">
    <div className="ts-focus-detail-hero"><img src={pkgCover(pkg)} alt="" onError={e => { e.currentTarget.src = "/gallery/haram-drone.jpg"; }}/><button type="button" className="ts-focus-detail-back" onClick={onBack} aria-label={lang === "ar" ? "رجوع" : "Back"}><ChevronLeft size={24} style={flipRTL(lang === "ar" ? "rtl" : "ltr")}/></button></div>
    <div className="ts-focus-detail-main">
      <header className="ts-focus-trip-summary">
        <div className="ts-focus-trip-summary-copy"><h1 id="focus-detail-title">{lang === "ar" ? `رحلة ${pkg.destination} · ${pkg.days} أيام` : `${pkg.destination} · ${pkg.days} days`}</h1><p><CalendarDays size={15}/>{lang === "ar" ? `${shortDate(trip.departureDate, lang)} ← ${shortDate(end, lang)}` : `${shortDate(trip.departureDate, lang)} – ${shortDate(end, lang)}`}</p>{departure && <p><MapPin size={15}/>{departure} · {availabilityLabel(availSeats(trip),lang)}</p>}</div>
        <div className="ts-focus-departure-time"><small>{lang === "ar" ? "وقت الانطلاق" : "Departure"}</small><strong>{departureTime.value}</strong>{departureTime.period && <em>{departureTime.period}</em>}</div>
      </header>
      {tripDetails.length>0&&<section className="ts-focus-program-compact ts-focus-trip-details">
        <button type="button" aria-expanded={programOpen} aria-controls="trip-experience" onClick={() => setProgramOpen(open => !open)}>
          <span className="ts-focus-trip-details-summary"><strong>{lang === "ar" ? "تفاصيل الرحلة" : "Trip details"}</strong><small>{tripDetails.join(" · ")}</small></span>
          <em>{lang === "ar" ? "اكتشف مزايا رحلتك" : "Discover your trip features"}</em><ChevronDown size={19}/>
        </button>
        {programOpen&&<div className="ts-focus-trip-details-body" id="trip-experience">
          <div className="ts-focus-experience-grid">
            {transport&&<JourneyExperienceCard kind="transport" transport={transport} lang={lang}/>}
            {hotel&&<JourneyExperienceCard kind="hotel" hotel={hotel} lang={lang}/>}
          </div>
          {visibleProgram.length>0&&<section className="ts-focus-program-timeline" aria-label={lang === "ar" ? "برنامج الرحلة" : "Trip itinerary"}>
            <h2>{lang === "ar" ? "برنامج الرحلة" : "Trip itinerary"}</h2>
            {visibleProgram.map((stage,index)=><article key={stage.id}><span>{index+1}</span><div><strong>{stage.day} · {stage.title}</strong><small>{stage.time}{stage.desc ? ` · ${stage.desc}` : ""}</small></div></article>)}
          </section>}
        </div>}
      </section>}
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
  return <section className={`ts-focus-configure${embedded ? " embedded" : ""}`} aria-labelledby="focus-configure-title" id={embedded ? "booking-start" : undefined}>
    {!embedded && <header className="ts-focus-configure-head"><button type="button" onClick={onBack} aria-label={lang === "ar" ? "رجوع" : "Back"}><ChevronLeft size={22} style={flipRTL(lang === "ar" ? "rtl" : "ltr")}/></button><h1 id="focus-configure-title">{lang === "ar" ? "ابدأ الحجز" : "Start booking"}</h1><span/></header>}
    <main>
      <section className="ts-focus-configure-section ts-focus-travellers"><div className="ts-focus-section-heading"><div><h2 id={embedded ? "focus-configure-title" : undefined}>{lang === "ar" ? "المعتمرون" : "Travellers"}</h2><small>{availabilityLabel(availSeats(trip),lang)} · {lang === "ar" ? "حدد عدد المعتمرين والمعتمرات" : "Set how many pilgrims"}</small></div><Users size={20}/></div><TravellerCountPicker value={travellerCounts} onChange={setTravellerCounts} max={max} lang={lang}/></section>
      <section className="ts-focus-configure-section ts-focus-accommodation"><div className="ts-focus-section-heading"><div><h2>{lang === "ar" ? "اختر السكن" : "Choose accommodation"}</h2><small>{lang === "ar" ? "حدد عدد الغرف الخاصة المناسب لك" : "Choose the private rooms you need"}</small></div><BedDouble size={20}/></div><div className="ts-focus-room-list">{rooms.map(room => { const active = chosen?.key === room.key; const privateRoom = isPrivateAccommodation(room); const count = active ? roomCountOf(chosen!) : 1; return <div className="ts-focus-room-choice" key={room.key}><button type="button" className={active ? "active" : ""} onClick={() => setSplit({...room,roomCount:1})} aria-pressed={active}><span className="ts-focus-room-radio">{active && <Check size={14}/>}</span><span className="ts-focus-room-copy"><strong>{roomLabel(room, lang)}</strong><small>{lang === "ar" ? `تكلفة الليلة: ${money(room.perNight)} ر.س` : `Nightly cost: ${money(room.perNight)} SAR`}</small></span><RoomCapacityVisual capacity={room.capacity} shared={!privateRoom} lang={lang}/></button>{active&&privateRoom&&<div className="ts-focus-room-quantity"><span>{lang === "ar" ? "عدد الغرف المطلوبة" : "Rooms needed"}</span><div><button type="button" onClick={() => setSplit({...chosen!,roomCount:Math.max(1,count-1)})} disabled={count<=1} aria-label={lang === "ar" ? "تقليل عدد الغرف" : "Decrease rooms"}><Minus size={16}/></button><strong>{count}</strong><button type="button" onClick={() => setSplit({...chosen!,roomCount:count+1})} aria-label={lang === "ar" ? "زيادة عدد الغرف" : "Increase rooms"}><Plus size={16}/></button></div></div>}</div>; })}{persons === 0 && <p className="ts-focus-room-empty">{lang === "ar" ? "حدّد عدد المعتمرين أولاً لإظهار خيارات السكن." : "Choose traveller counts first to see eligible stays."}</p>}{persons > 0 && requireTravellerType && !travellerType && <p className="ts-focus-room-empty">{lang === "ar" ? "لا تتوفر خيارات سكن مناسبة لهذا التكوين." : "No stay options match this group."}</p>}{persons > 0 && (!requireTravellerType || travellerType) && rooms.length === 0 && <p className="ts-focus-room-empty">{lang === "ar" ? "لا توجد خيارات سكن مناسبة لهذا العدد." : "No room options for this group size."}</p>}</div></section>
      <section className="ts-focus-price-summary"><h2>{lang === "ar" ? "ملخص التكلفة" : "Cost summary"}</h2><div><span>{lang === "ar" ? "إجمالي المواصلات" : "Transport total"}</span><b>{money(price?.transport ?? 0)} {lang === "ar" ? "ر.س" : "SAR"}</b></div><div><span>{lang === "ar" ? "إجمالي السكن" : "Accommodation total"}</span><b>{money(price?.accommodation ?? 0)} {lang === "ar" ? "ر.س" : "SAR"}</b></div>{needsPrivacySeat&&<p className="ts-focus-privacy-seat-note"><span aria-hidden="true">🌸</span>{lang === "ar" ? "لراحتك وخصوصيتك، حجزنا لكِ المقعد المجاور." : "For your comfort and privacy, we reserved the adjacent seat for you."}</p>}</section>
    </main>
    <footer className="ts-focus-configure-cta"><WhatsAppInlineButton/><div><small>{lang === "ar" ? "الإجمالي" : "Total"}</small><strong>{money(total)} {lang === "ar" ? "ر.س" : "SAR"}</strong></div><button type="button" disabled={persons === 0 || !chosen || (requireTravellerType && !travellerType)} onClick={onContinue}>{lang === "ar" ? "متابعة الحجز" : "Continue booking"}<ArrowLeft size={18} style={flipRTL(lang === "ar" ? "rtl" : "ltr")}/></button></footer>
  </section>;
}
