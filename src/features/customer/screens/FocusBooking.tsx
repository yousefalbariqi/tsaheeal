import { useEffect, useMemo } from "react";
import {
  ArrowLeft, BedDouble, BusFront, CalendarDays, Check, ChevronLeft,
  MapPin, Minus, Plus, ShieldCheck, Sparkles, Users,
} from "lucide-react";
import type { Hotel, Pkg, Transport, Trip } from "@/types";
import { hotelDisplayName } from "@/lib/hotelName";
import { availSeats } from "../data";
import { bookingRoomChoices, splitTotal, type RoomSplit } from "../roomSplit";
import { hotelCover, pkgCover, transportCover } from "../gallery";
import { flipRTL, money } from "../ui/tokens";

const addDays = (iso: string, days: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
};
const returnDate = (trip: Trip, pkg: Pkg) => /^\d{4}-\d{2}-\d{2}$/.test(trip.returnDate ?? "")
  ? trip.returnDate : addDays(trip.departureDate, Math.max(0, pkg.days - 1));
const shortDate = (iso: string, lang: "ar" | "en") => {
  const d = new Date(`${iso}T00:00:00`);
  const locale = lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-US-u-ca-gregory-nu-latn";
  return new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(d).replace("،", "");
};
const roomLabel = (choice: RoomSplit) => choice.rooms.length === 1
  ? `${choice.type} · ${choice.rooms[0].persons} ${choice.rooms[0].persons === 1 ? "شخص" : "أشخاص"}`
  : `${choice.type} · ${choice.rooms.length} غرف`;

export function FocusDetails({ pkg, trip, hotel, transport, onBack, persons, setPersons, split, setSplit, onContinue, lang }: {
  pkg: Pkg; trip: Trip; hotel?: Hotel; transport?: Transport;
  onBack: () => void; persons: number; setPersons: (n: number) => void;
  split: RoomSplit | null; setSplit: (s: RoomSplit | null) => void;
  onContinue: () => void; lang: "ar" | "en";
}) {
  const end = returnDate(trip, pkg);
  const image = pkgCover(pkg);
  const features = [
    { icon: BusFront, label: lang === "ar" ? "مواصلات مريحة" : "Comfortable transport" },
    { icon: BedDouble, label: lang === "ar" ? "سكن مختار" : "Selected stay" },
    { icon: ShieldCheck, label: lang === "ar" ? "إرشاد ديني" : "Religious guidance" },
    { icon: Sparkles, label: lang === "ar" ? "خدمة مميزة" : "Special service" },
  ];
  return (
    <section className="ts-focus-detail" aria-labelledby="focus-detail-title">
      <div className="ts-focus-detail-hero">
        <img src={image} alt="" onError={e => { e.currentTarget.src = "/gallery/haram-drone.jpg"; }}/>
        <div className="ts-focus-detail-shade"/>
        <button type="button" className="ts-focus-detail-back" onClick={onBack} aria-label={lang === "ar" ? "رجوع" : "Back"}><ChevronLeft size={24} style={flipRTL(lang === "ar" ? "rtl" : "ltr")}/></button>
      </div>
      <div className="ts-focus-detail-main">
        <header className="ts-focus-detail-title">
          <div><p>{lang === "ar" ? `من ${shortDate(trip.departureDate, lang)} إلى ${shortDate(end, lang)}` : `${shortDate(trip.departureDate, lang)} – ${shortDate(end, lang)}`}</p><h1 id="focus-detail-title">{lang === "ar" ? `رحلة ${pkg.destination} · ${pkg.days} أيام` : `${pkg.destination} · ${pkg.days} days`}</h1></div>
          <span>{lang === "ar" ? `${availSeats(trip)} مقعد متاح` : `${availSeats(trip)} seats`}</span>
        </header>

        <div className="ts-focus-feature-grid">
          {features.map(({ icon: Icon, label }) => <div key={label}><span><Icon size={18}/></span><small>{label}</small></div>)}
        </div>

        <section className="ts-focus-detail-copy">
          <h2>{lang === "ar" ? "نبذة عن الرحلة" : "About this journey"}</h2>
          <p>{pkg.notes?.trim() || (lang === "ar" ? "رحلة مرتبة إلى مكة المكرمة، تجمع بين الراحة والتنظيم لتعيش تجربة عمرة مطمئنة." : "A thoughtfully arranged Umrah journey for a calm, comfortable experience.")}</p>
        </section>

        <div className="ts-focus-service-grid">
          <article className="ts-focus-service-card"><img src={hotelCover(hotel, pkg.order)} alt=""/><div><span>{lang === "ar" ? "الإقامة" : "Stay"}</span><strong>{hotel ? hotelDisplayName(hotel.name) : (lang === "ar" ? "سكن الرحلة" : "Accommodation")}</strong><small>{hotel ? `${hotel.stars} نجوم · ${hotel.district}` : (lang === "ar" ? "تُحدَّد مع الباقة" : "Included with package")}</small></div></article>
          <article className="ts-focus-service-card"><img src={transportCover(transport)} alt=""/><div><span>{lang === "ar" ? "التنقل" : "Transport"}</span><strong>{transport?.name || (lang === "ar" ? "مواصلات الرحلة" : "Trip transport")}</strong><small>{transport?.vehicleType || (lang === "ar" ? "ضمن الباقة" : "Included")}</small></div></article>
        </div>

        <section className="ts-focus-program">
          <h2>{lang === "ar" ? "البرنامج المختصر" : "Trip itinerary"}</h2>
          <div>{pkg.program.filter(s => !s.archived).slice(0, 4).map((stage, i) => <article key={stage.id}><span>{i + 1}</span><div><strong>{stage.day} · {stage.title}</strong><small><span>{stage.time}</span>{stage.desc && <span>{stage.desc}</span>}</small></div></article>)}</div>
        </section>

        {/* لا صفحة ثانية هنا: قرار الحجز يكمل ملخص الرحلة مباشرةً، كي
            يظل الفندق والنقل والتاريخ أمام العميل وهو يختار العدد والسكن. */}
        <FocusConfigure embedded pkg={pkg} trip={trip} hotel={hotel} transport={transport}
          persons={persons} setPersons={setPersons} split={split} setSplit={setSplit}
          onBack={onBack} onContinue={onContinue} lang={lang}/>
      </div>
    </section>
  );
}

export function FocusConfigure({ pkg, trip, hotel, transport, persons, setPersons, split, setSplit, onBack, onContinue, lang, embedded = false }: {
  pkg: Pkg; trip: Trip; hotel?: Hotel; transport?: Transport;
  persons: number; setPersons: (n: number) => void;
  split: RoomSplit | null; setSplit: (s: RoomSplit | null) => void;
  onBack: () => void; onContinue: () => void; lang: "ar" | "en"; embedded?: boolean;
}) {
  const max = Math.max(1, availSeats(trip));
  const rooms = useMemo(() => bookingRoomChoices(pkg.roomPrices, persons), [pkg.roomPrices, persons]);
  const chosen = split && rooms.some(room => room.key === split.key) ? split : rooms[0] ?? null;
  useEffect(() => { if (chosen !== split) setSplit(chosen); }, [chosen, split, setSplit]);
  const total = chosen ? splitTotal(chosen, Math.max(1, pkg.nights)) : pkg.marketPrice * persons;
  return (
    <section className={`ts-focus-configure${embedded ? " embedded" : ""}`} aria-labelledby="focus-configure-title">
      {!embedded && <header className="ts-focus-configure-head"><button type="button" onClick={onBack} aria-label={lang === "ar" ? "رجوع" : "Back"}><ChevronLeft size={22} style={flipRTL(lang === "ar" ? "rtl" : "ltr")}/></button><h1 id="focus-configure-title">{lang === "ar" ? "خصّص حجزك" : "Customize your booking"}</h1><span/></header>}
      {embedded && <header className="ts-focus-configure-inline-head"><span>2</span><div><h2 id="focus-configure-title">{lang === "ar" ? "أكمل تفاصيل حجزك" : "Complete your booking"}</h2><p>{lang === "ar" ? "حدّد العدد والسكن ثم أكمل بيانات المعتمرين" : "Set your group and stay, then continue"}</p></div></header>}
      <main>
        <article className="ts-focus-configure-trip"><img src={pkgCover(pkg)} alt=""/><div><strong>{lang === "ar" ? `رحلة ${pkg.destination} · ${pkg.days} أيام` : `${pkg.destination} · ${pkg.days} days`}</strong><small><CalendarDays size={14}/>{shortDate(trip.departureDate, lang)}</small></div></article>

        <section className="ts-focus-configure-section ts-focus-travellers">
          <div className="ts-focus-section-heading"><div><h2>{lang === "ar" ? "عدد المعتمرين" : "Travellers"}</h2><small>{lang === "ar" ? `${availSeats(trip)} مقعد متاح` : `${availSeats(trip)} seats available`}</small></div><Users size={20}/></div>
          <div className="ts-focus-counter"><button type="button" disabled={persons <= 1} onClick={() => setPersons(Math.max(1, persons - 1))}><Minus size={18}/></button><strong>{persons}</strong><button type="button" disabled={persons >= max} onClick={() => setPersons(Math.min(max, persons + 1))}><Plus size={18}/></button></div>
        </section>

        <section className="ts-focus-configure-section ts-focus-accommodation">
          <div className="ts-focus-section-heading"><div><h2>{lang === "ar" ? "اختر السكن" : "Choose accommodation"}</h2><small>{lang === "ar" ? "السعر يشمل كامل ليالي الإقامة" : "Price includes all stay nights"}</small></div><BedDouble size={20}/></div>
          <div className="ts-focus-room-list">
            {rooms.map(room => { const active = chosen?.key === room.key; const cap = room.rooms[0]?.persons ?? 1; return <button key={room.key} type="button" className={active ? "active" : ""} onClick={() => setSplit(room)}>
              <img src={hotelCover(hotel, cap)} alt=""/><span className="ts-focus-room-copy"><strong>{roomLabel(room)}</strong><small>{room.type.includes("مشترك") ? (lang === "ar" ? `تتشارك السكن مع ${Math.max(0, cap - 1)} ${cap - 1 === 1 ? "شخص" : "أشخاص"}` : `Shared with up to ${Math.max(0, cap - 1)}`) : (lang === "ar" ? "غرفة خاصة لمجموعتك" : "Private room for your group")}</small><em>+ {money(splitTotal(room, Math.max(1, pkg.nights)))} {lang === "ar" ? "ر.س" : "SAR"}</em></span>{active && <Check size={17}/>}</button>; })}
            {rooms.length === 0 && <p className="ts-focus-room-empty">{lang === "ar" ? "لا توجد خيارات سكن مناسبة لهذا العدد." : "No room options for this group size."}</p>}
          </div>
        </section>

        <section className="ts-focus-included"><img src={transportCover(transport)} alt=""/><div><strong>{lang === "ar" ? "مشمول في الباقة" : "Included in package"}</strong><span><BusFront size={14}/>{transport?.name || (lang === "ar" ? "مواصلات الرحلة" : "Trip transport")}</span><span><MapPin size={14}/>{hotel ? hotelDisplayName(hotel.name) : (lang === "ar" ? "سكن الرحلة" : "Accommodation")}</span></div></section>

        <section className="ts-focus-price-summary"><h2>{lang === "ar" ? "ملخص السعر" : "Price summary"}</h2><div><span>{lang === "ar" ? `الإقامة · ${pkg.nights} ليالٍ` : `Stay · ${pkg.nights} nights`}</span><b>{money(total)} {lang === "ar" ? "ر.س" : "SAR"}</b></div><div><span>{lang === "ar" ? "عدد المعتمرين" : "Travellers"}</span><b>{persons}</b></div><footer><span>{lang === "ar" ? "الإجمالي" : "Total"}</span><strong>{money(total)} {lang === "ar" ? "ر.س" : "SAR"}</strong></footer></section>
      </main>
      <footer className="ts-focus-configure-cta"><button type="button" disabled={!chosen} onClick={onContinue}>{lang === "ar" ? "إكمال الحجز" : "Continue booking"}<ArrowLeft size={18} style={flipRTL(lang === "ar" ? "rtl" : "ltr")}/></button><small>{lang === "ar" ? "ستسجل الدخول قبل تعبئة بيانات المعتمرين" : "Sign in before entering traveller details"}</small></footer>
    </section>
  );
}
