import { useEffect, useMemo, useState } from "react";
import { Armchair, ArrowLeft, BedDouble, BusFront, CalendarCheck, CalendarDays, Check, ChevronDown, ChevronLeft, Clock3, ListChecks, MapPin, Minus, Plus, Star } from "lucide-react";
import type { Hotel, Pkg, Transport, TravellerType, Trip } from "@/types";
import { hotelDisplayName } from "@/lib/hotelName";
import { WhatsAppInlineButton } from "@/components/WhatsAppFab";
import { availSeats } from "../data";
import { bookingRoomChoices, isPrivateAccommodation, packagePrice, roomCountOf, splitTotal, type RoomSplit } from "../roomSplit";
import { hotelCover, pkgCover, transportCover } from "../gallery";
import { flipRTL, money } from "../ui/tokens";
import { CTAButton } from "../ui/kit";
import { fmtDayDate, fmtTime } from "@/lib/dates";
import { TravellerCountPicker } from "../ui/TravellerType";
import { ALL_AUDIENCE, audienceOf, tierLabel, tiersForTraveller } from "@/data/housing";
import type { TravellerCounts } from "../draft";

const addDays = (iso: string, days: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
};
const returnDate = (trip: Trip, pkg: Pkg) => /^\d{4}-\d{2}-\d{2}$/.test(trip.returnDate ?? "") ? trip.returnDate : addDays(trip.departureDate, Math.max(0, pkg.days - 1));
/* العربي من lib/dates كبقية التطبيق («الأربعاء 7 أكتوبر»، «12:30 م»)؛
   والإنجليزي يبقى على منسّقه هنا لأن lib/dates عربيٌّ وحده. */
const shortDate = (iso: string, lang: "ar" | "en") => lang === "ar" ? fmtDayDate(iso) : new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${iso}T00:00:00`));
const roomLabel = (choice: RoomSplit, lang: "ar" | "en") => choice.rooms.length === 1 ? tierLabel(choice.type, choice.rooms[0].persons, lang) : `${choice.type} · ${choice.rooms.length} ${lang === "ar" ? "غرف" : "rooms"}`;
const timeLabel = (hhmm: string | undefined, lang: "ar" | "en") => {
  const match = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? "");
  if (!match) return "—";
  if (lang === "ar") return fmtTime(hhmm);
  const hour = Number(match[1]);
  return `${hour % 12 === 0 ? 12 : hour % 12}:${match[2]} ${hour < 12 ? "AM" : "PM"}`;
};

/** لا يظهر سؤال نوع المسافر إلا عندما تقيد بيانات السكن خياراته فعلاً. */
export const needsTravellerTypeForAccommodation = (pkg: Pkg) => pkg.roomPrices.some(room => {
  const audience = audienceOf(room);
  return audience.length !== ALL_AUDIENCE.length || !ALL_AUDIENCE.every(type => audience.includes(type));
});
const transportLabel = (transport: Transport | undefined, lang: "ar" | "en") => !transport ? (lang === "ar" ? "مواصلات الرحلة" : "Trip transport") : [transport.model || transport.name, transport.year].filter(Boolean).join(" ") || transport.name;

/* لا نعرض سعة الحافلة كاملةً؛ العميل يحتاج أن يعرف إن كان الحجز متاحاً،
   ويحتاج العدد الدقيق فقط عندما يقترب الامتلاء فعلاً. */
export const availabilityLabel=(seats:number,lang:"ar"|"en")=>{
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
      {Array.from({length:shown},(_,i)=><BedDouble key={i} size={20} className={i<included?"is-included":""}/>) }
    </span>
    {safe>4&&<em>+{safe-4}</em>}
  </span>;
}

/* الصور والمزايا هنا ليست نصاً تسويقياً ثابتاً: كل بطاقة تُبنى من الباص
   والفندق المرتبطين فعلياً بالرحلة. لهذا لا يعد العميل بمكيّف أو قربٍ من
   الحرم ما لم تكن الميزة أو المسافة مسجلة في البيانات. والعنوان اسمُ
   الفندق أو الباص نفسه لا شعارٌ عام. */
const FEATURES_SHOWN = 4;
function JourneyExperienceCard({kind,transport,hotel,lang}:{kind:"transport"|"hotel";transport?:Transport;hotel?:Hotel;lang:"ar"|"en"}) {
  const [allFeatures,setAllFeatures]=useState(false);
  const ar=lang==="ar";
  const isTransport=kind==="transport";
  const name=isTransport ? transportLabel(transport,lang) : hotel ? hotelDisplayName(hotel.name) : "";
  const features=isTransport ? (transport?.features??[]) : (hotel?.features??[]);
  if(!name) return null;
  const shownFeatures=allFeatures ? features : features.slice(0,FEATURES_SHOWN);
  return <article className="ts-focus-experience-card">
    <img src={isTransport?transportCover(transport):hotelCover(hotel)} width={336} height={300} loading="lazy" decoding="async"
      alt={isTransport?(ar?"وسيلة نقل الرحلة":"Trip transport"):ar?"فندق الرحلة":"Trip hotel"}/>
    <div className="ts-focus-experience-copy">
      <span className="ts-focus-experience-kind">{isTransport?<BusFront size={16}/>:<BedDouble size={16}/>}{isTransport ? (ar?"المواصلات":"Transport") : (ar?"السكن":"Stay")}</span>
      <h3>{name}</h3>
      {isTransport
        ? transport?.vehicleType&&<p className="ts-focus-experience-meta"><span>{transport.vehicleType}</span></p>
        : hotel&&<p className="ts-focus-experience-meta">
            <span className="ts-focus-experience-stars" role="img" aria-label={ar?`${hotel.stars} نجوم`:`${hotel.stars} stars`}>
              {Array.from({length:hotel.stars},(_,i)=><Star key={i} size={14} fill="currentColor" strokeWidth={0}/>)}
            </span>
            {hotel.district&&<span>{hotel.district}</span>}
            {hotel.distanceM>0&&<span>{ar?`${hotel.distanceM} م عن الحرم`:`${hotel.distanceM} m to the Haram`}</span>}
          </p>}
      {features.length>0&&<ul className="ts-focus-experience-features" aria-label={ar ? `مميزات ${isTransport?"النقل":"الفندق"}` : `${isTransport?"Transport":"Hotel"} features`}>
        {shownFeatures.map(feature=><li key={feature.id}>{feature.text}</li>)}
      </ul>}
      {features.length>FEATURES_SHOWN&&<button type="button" className="ts-focus-more" aria-expanded={allFeatures} onClick={()=>setAllFeatures(open=>!open)}>
        {allFeatures ? (ar?"عرض أقل":"Show less") : (ar?`كل المزايا (${features.length})`:`All features (${features.length})`)}<ChevronDown size={18}/>
      </button>}
    </div>
  </article>;
}

/* ما يزيد على هذا من محطات البرنامج يُطوى خلف «عرض البرنامج كاملاً». */
const PROGRAM_SHOWN = 4;

export function FocusDetails({ pkg, trip, hotel, transport, departureCity = "", onBack, persons, travellerCounts, setTravellerCounts, split, setSplit, travellerType, onContinue, lang }: {
  pkg: Pkg; trip: Trip; hotel?: Hotel; transport?: Transport; onBack: () => void;
  departureCity?: string;
  persons: number; travellerCounts: TravellerCounts; setTravellerCounts: (counts: TravellerCounts) => void; split: RoomSplit | null; setSplit: (s: RoomSplit | null) => void;
  travellerType: TravellerType | ""; onContinue: () => void; lang: "ar" | "en";
}) {
  const ar = lang === "ar";
  const end = returnDate(trip, pkg);
  /* الرحلة قد تمر بمحطات متعددة؛ نعيد الوقت الذي اختاره العميل من مدينته،
     لا وقت أول محطة فقط الذي بقي للبيانات القديمة. */
  const selectedStop = departureCity ? trip.departureStops?.find(stop => stop.city.trim() === departureCity.trim()) : trip.departureStops?.[0];
  const [programOpen, setProgramOpen] = useState(false);
  const departure = selectedStop?.city || trip.departureCity || selectedStop?.point || trip.departurePoint;
  const visibleProgram=pkg.program.filter(stage=>!stage.archived);
  const shownProgram=programOpen ? visibleProgram : visibleProgram.slice(0,PROGRAM_SHOWN);
  const seats=availSeats(trip);
  return <section className="ts-focus-detail" aria-labelledby="focus-detail-title">
    <div className="ts-focus-detail-hero">
      <img src={pkgCover(pkg)} alt="" width={780} height={528} decoding="async" onError={e => { e.currentTarget.src = "/gallery/haram-drone.jpg"; }}/>
      <button type="button" className="ts-focus-detail-back" onClick={onBack} aria-label={ar ? "رجوع" : "Back"}><ChevronLeft size={24} style={flipRTL(ar ? "rtl" : "ltr")}/></button>
    </div>
    <div className="ts-focus-detail-main">
      <header className="ts-focus-trip-summary">
        <h1 id="focus-detail-title">{pkg.name || (ar ? `رحلة ${pkg.destination} · ${pkg.days} أيام` : `${pkg.destination} · ${pkg.days} days`)}</h1>
        <p className="ts-focus-trip-chips">
          <span className={seats<=6 ? "is-low" : undefined}>{availabilityLabel(seats,lang)}</span>
        </p>
        <dl className="ts-focus-trip-facts">
          <div><dt><CalendarDays size={15}/>{ar ? "الذهاب" : "Departs"}</dt><dd>{shortDate(trip.departureDate, lang)}</dd></div>
          <div><dt><CalendarCheck size={15}/>{ar ? "العودة" : "Returns"}</dt><dd>{shortDate(end, lang)}</dd></div>
          <div><dt><MapPin size={15}/>{ar ? "الانطلاق من" : "From"}</dt><dd>{departure || "—"}</dd></div>
          <div><dt><Clock3 size={15}/>{ar ? "وقت الانطلاق" : "Departure time"}</dt><dd>{timeLabel(selectedStop?.time ?? trip.departureTime, lang)}</dd></div>
        </dl>
      </header>
      {/* ما تشمله الرحلة مفتوحٌ من أول نظرة: الفندق والباص والبرنامج هي
          المنتج، وكانت مطويةً خلف صفٍّ واحد. يُطوى الطويل وحده. */}
      {(transport||hotel||visibleProgram.length>0)&&<section className="ts-focus-included" aria-labelledby="trip-included-title">
        <h2 id="trip-included-title">{ar ? "ما تشمله رحلتك" : "What's included"}</h2>
        {(transport||hotel)&&<div className="ts-focus-experience-grid">
          {hotel&&<JourneyExperienceCard kind="hotel" hotel={hotel} lang={lang}/>}
          {transport&&<JourneyExperienceCard kind="transport" transport={transport} lang={lang}/>}
        </div>}
        {visibleProgram.length>0&&<section className="ts-focus-program-timeline" aria-labelledby="trip-program-title">
          <h3 id="trip-program-title"><ListChecks size={18}/>{ar ? "برنامج الرحلة" : "Trip itinerary"}</h3>
          <ol id="trip-program">
            {shownProgram.map((stage,index)=>{
              const detail=[ar ? fmtTime(stage.time,"") : stage.time, stage.desc].filter(Boolean).join(" · ");
              return <li key={stage.id}><span>{index+1}</span><div><strong>{[stage.day,stage.title].filter(Boolean).join(" · ")}</strong>{detail&&<small>{detail}</small>}</div></li>;
            })}
          </ol>
          {visibleProgram.length>PROGRAM_SHOWN&&<button type="button" className="ts-focus-more" aria-expanded={programOpen} aria-controls="trip-program" onClick={() => setProgramOpen(open => !open)}>
            {programOpen ? (ar ? "عرض أقل" : "Show less") : (ar ? `عرض البرنامج كاملاً (${visibleProgram.length})` : `Show full itinerary (${visibleProgram.length})`)}<ChevronDown size={18}/>
          </button>}
        </section>}
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
  const ar = lang === "ar";
  const sar = ar ? "ر.س" : "SAR";
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
    {!embedded && <header className="ts-focus-configure-head"><button type="button" onClick={onBack} aria-label={ar ? "رجوع" : "Back"}><ChevronLeft size={24} style={flipRTL(ar ? "rtl" : "ltr")}/></button><h1 id="focus-configure-title">{ar ? "ابدأ الحجز" : "Start booking"}</h1><span/></header>}
    <main>
      <section className="ts-focus-configure-section ts-focus-travellers">
        <div className="ts-focus-section-heading">
          <h2 id={embedded ? "focus-configure-title" : undefined}>{ar ? "المعتمرون" : "Travellers"}</h2>
          <small>{ar ? "حدّد عدد المعتمرين والمعتمرات" : "Set how many pilgrims"}</small>
        </div>
        <TravellerCountPicker value={travellerCounts} onChange={setTravellerCounts} max={max} lang={lang}/>
      </section>
      <section className="ts-focus-configure-section ts-focus-accommodation">
        <div className="ts-focus-section-heading">
          <h2>{ar ? "اختر السكن" : "Choose accommodation"}</h2>
          <small>{ar ? "اختر نوع الغرفة المناسب لك" : "Choose the room type that suits you"}</small>
        </div>
        <div className="ts-focus-room-list" role="radiogroup" aria-label={ar ? "نوع السكن" : "Accommodation type"}>
          {rooms.map(room => {
            const active = chosen?.key === room.key;
            const privateRoom = isPrivateAccommodation(room);
            const count = active ? roomCountOf(chosen!) : 1;
            return <div className={`ts-focus-room-choice${active ? " is-active" : ""}`} key={room.key}>
              <button type="button" role="radio" aria-checked={active} onClick={() => setSplit({...room,roomCount:1})}>
                <span className="ts-focus-room-radio">{active && <Check size={15} strokeWidth={3}/>}</span>
                <span className="ts-focus-room-copy">
                  <strong>{roomLabel(room, lang)}</strong>
                  <small><b>{money(room.perNight)}</b> {sar} {ar ? "/ الليلة" : "/ night"}</small>
                </span>
                <RoomCapacityVisual capacity={room.capacity} shared={!privateRoom} lang={lang}/>
              </button>
              {active&&privateRoom&&<div className="ts-focus-room-quantity">
                <span>{ar ? "عدد الغرف المطلوبة" : "Rooms needed"}</span>
                <div dir="ltr">
                  <button type="button" onClick={() => setSplit({...chosen!,roomCount:count+1})} aria-label={ar ? "زيادة عدد الغرف" : "Increase rooms"}><Plus size={18}/></button>
                  <strong aria-live="polite">{count}</strong>
                  <button type="button" onClick={() => setSplit({...chosen!,roomCount:Math.max(1,count-1)})} disabled={count<=1} aria-label={ar ? "تقليل عدد الغرف" : "Decrease rooms"}><Minus size={18}/></button>
                </div>
              </div>}
            </div>;
          })}
          {persons === 0 && <p className="ts-focus-room-empty">{ar ? "حدّد عدد المعتمرين أولاً لإظهار خيارات السكن." : "Choose traveller counts first to see eligible stays."}</p>}
          {persons > 0 && requireTravellerType && !travellerType && <p className="ts-focus-room-empty">{ar ? "لا تتوفر خيارات سكن مناسبة لهذا التكوين." : "No stay options match this group."}</p>}
          {persons > 0 && (!requireTravellerType || travellerType) && rooms.length === 0 && <p className="ts-focus-room-empty">{ar ? "لا توجد خيارات سكن مناسبة لهذا العدد." : "No room options for this group size."}</p>}
        </div>
      </section>
      <section className="ts-focus-price-summary">
        <h2>{ar ? "ملخص التكلفة" : "Cost summary"}</h2>
        <div><span>{ar ? "إجمالي المواصلات" : "Transport total"}</span><b>{money(price?.transport ?? 0)} {sar}</b></div>
        <div><span>{ar ? "إجمالي السكن" : "Accommodation total"}</span><b>{money(price?.accommodation ?? 0)} {sar}</b></div>
        <div className="is-total"><span>{ar ? "الإجمالي" : "Total"}</span><b>{money(total)} {sar}</b></div>
        {needsPrivacySeat&&<p className="ts-focus-privacy-seat-note"><Armchair size={18} aria-hidden="true"/><span>{ar ? "لراحتك وخصوصيتك، حجزنا لكِ المقعد المجاور. وإن رافقتكِ امرأة جلست فيه دون تكلفة مقعدٍ إضافية عليكما." : "For your comfort and privacy, we reserved the adjacent seat for you. If a woman travels with you, she can take it at no extra seat cost to either of you."}</span></p>}
      </section>
    </main>
    <footer className="ts-focus-configure-cta">
      <div className="ts-focus-configure-cta-inner">
        <WhatsAppInlineButton/>
        <div className="ts-focus-configure-total"><small>{ar ? "الإجمالي" : "Total"}</small><strong>{money(total)} {sar}</strong></div>
        {/* سهم المتابعة يشير إلى الأمام: يساراً في العربية (كان معكوساً). */}
        <CTAButton disabled={persons === 0 || !chosen || (requireTravellerType && !travellerType)} onClick={onContinue} style={{ flexShrink: 0, paddingInline: 22 }}>
          {ar ? "متابعة الحجز" : "Continue booking"}<ArrowLeft size={18} style={flipRTL(ar ? "ltr" : "rtl")}/>
        </CTAButton>
      </div>
    </footer>
  </section>;
}
