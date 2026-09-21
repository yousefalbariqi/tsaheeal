/* شاشة الرحلات — مرحلتان لا صفحة واحدة.

   الأولى: الوجهة. صفحةٌ لا تعرض باقةً واحدة قبل أن يقول العميل إلى أين.
   الثانية: خطٌّ زمني للمغادرات من تلك الوجهة، تُصفّيه مدينة الانطلاق.

   ٢٠٢٦-٠٩-١٦: كان هنا أيضاً جسدُ الاستكشاف القديم — شبكةُ الباقات
   وقائمتها وشرائح المدن وبنر الحديث وبطاقة «رحلة حسب الطلب» — يتقاسم
   هذا الملف براية `destinationFirst`. حُذف مع مساره /classic، فلم يبق
   إلا ما تفتحه «/». */
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MapPin, CalendarDays, UserRound, Check, Headphones, ShieldCheck, UsersRound, ChevronLeft, ArrowLeft, ArrowRight, Tag, Star, SlidersHorizontal } from "lucide-react";
import type { Pkg, Trip } from "@/types";
import { TasaheelMark } from "@/components/TasaheelMark";
import { flipRTL, money } from "../ui/tokens";
import { LangSwitch } from "../ui/kit";
import { pkgCover } from "../gallery";
import { LANGS, cityLabel, type Lang } from "../i18n";
import { startingPrice } from "@/features/packages/readiness";
import { todayYMD } from "@/lib/utils";


export interface ExploreProps {
  packages: Pkg[];
  tripsOf: (p: Pkg) => Trip[];
  /** الوجهة المختارة — تعيش في CustomerApp لأن رأس الديسكتوب يعرضها. */
  city: string;
  setCity: (c: string) => void;
  onOpen: (p: Pkg, trip?: Trip) => void;
  onCustom: () => void;
  signedIn: boolean;
  onAccount: () => void;
  t: (k: string) => string;
  lang: Lang;
  setLang: (l: Lang) => void;
  /* ── مدينة الانطلاق ──
     خطوةٌ واحدة بعد الوجهة مباشرة، ثم لا تُعرض إلا رحلات تلك المدينة.
     الحالة في CustomerApp لا هنا: هي ترافق العميل إلى نموذج الحجز
     وملخّص الطلب، ونسخةٌ ثانية هنا تتفارق عنها عند أول رجوع. */
  departureCity?: string;
  /** الوجهة المختارة تحتاج مدينة انطلاق (مكة والمدينة وحدها اليوم). */
  departureRequired?: boolean;
  /** فتح ورقة المدن — لاختيارها أوّلاً ولتغييرها بعد ذلك. */
  onPickDepartureCity?: () => void;
}

/* سعر «يبدأ من» اليدوي من الباقة؛ لا يُشتق من الغرف أو المواصلات. */
const minTotal = startingPrice;

/** وجهة الباقة معنى تجاري، لا نصّ حرّ. توجد بيانات قديمة مثل «مكة
    المكرمة» و«مكة والمدينة المنورة»؛ تحويلها هنا يمنع سقوط رحلة سليمة من
    الصفحة لمجرد اختلافٍ في التسمية. */
export const citiesOf = (p: Pkg): string[] => {
  const destination = (p.destination ?? "").replace(/\s+/g, " ").trim();
  /* حماية للسجلات التي أُنشئت قبل فصل الوجهات: اسم «مكة والمدينة»
     تصريحٌ صريح ولا يجوز أن يظهر في شاشة مكة وحدها حتى يُعاد حفظه من
     الإدارة أو يصل ترحيل التصحيح. */
  const nameExplicitlyBoth = /مكة\s+والمدينة/.test((p.name ?? "").replace(/\s+/g, " "));
  const classified = nameExplicitlyBoth ? "مكة والمدينة" : destination;
  const hasMakkah = /مكة(?:\s+المكرمة)?/.test(classified);
  const hasMadinah = /المدينة(?:\s+المنورة)?/.test(classified);
  return [hasMakkah && "مكة", hasMadinah && "المدينة"].filter((city): city is string => !!city);
};

/**
 * تسميات الوجهة في أول خطوة مقصودة للعرض، أما بيانات الباقات فتبقى
 * مختصرةً («مكة» و«المدينة»). لا نطابق نصَّ البطاقة بالنص المعروض،
 * حتى لا يؤدي اختيار «مكة والمدينة المنورة» إلى نتيجة فارغة.
 */
export const matchesDestination = (p: Pkg, destination: string): boolean => {
  if (!destination) return true;
  const cities = citiesOf(p);
  /* خيارات البداية ليست مدناً يمرّ بها البرنامج بل نوعا رحلة مستقلان:
     «مكة» لا تعرض باقةً فيها المدينة، و«مكة والمدينة» لا تعرض مكة وحدها.
     مدينة الانطلاق تُصفّى لاحقاً من محطات الباص ولا علاقة لها بهذا القرار. */
  if (destination === "مكة والمدينة") {
    return cities.length === 2 && cities.includes("مكة") && cities.includes("المدينة");
  }
  return cities.length === 1 && cities[0] === destination;
};

/* ═══════════ المرحلة الأولى: اختيار الوجهة ═══════════
   هذه ليست فلترًا صغيرًا قبل قائمة الباقات؛ إنها أول قرار في الحجز.
   لذلك لا نعرض باقةً أو رحلة قبل أن يختار العميل وجهته. الصور من public
   وبـ fallback محليّ ثابت حتى لا تتحوّل البطاقة إلى مساحة فارغة إن فشلت
   صورةٌ مرفوعة من قاعدة البيانات في شاشة أخرى. */
function DestinationChoice({ onChoose, signedIn, onAccount, t, lang, setLang }: {
  onChoose: (destination: "مكة" | "مكة والمدينة") => void;
  signedIn: boolean;
  onAccount: () => void;
  t: (k: string) => string;
  lang: Lang;
  setLang: (l: Lang) => void;
}) {
  const destinations = [
    {
      key: "مكة" as const,
      title: lang === "ar" ? "مكة المكرمة" : "Makkah",
      note: lang === "ar" ? "إلى بيت الله الحرام" : "To the Holy Kaaba",
      image: "/gallery/haram-clocktower.jpg",
      fallback: "/gallery/haram-drone.jpg",
    },
    {
      key: "مكة والمدينة" as const,
      title: lang === "ar" ? "مكة والمدينة المنورة" : "Makkah & Madinah",
      note: lang === "ar" ? "إلى المسجد الحرام والمسجد النبوي" : "The Two Holy Mosques",
      image: "/gallery/destination-madinah.jpg",
      fallback: "/gallery/quba.jpg",
    },
  ];
  /* ثلاث بطاقات تبقى مرئية دائماً. عند الحركة يدخل رأيٌ واحد من اليمين
     ويخرج الأقدم من اليسار، فتبدو الآراء كسلسلة لا كصفحتين متبادلتين. */
  const reviews = lang === "ar"
    ? [
        ["أحمد", "تنظيم ممتاز وخدمة مريحة."],
        ["سارة", "تجربة مريحة من البداية."],
        ["محمد", "كل شيء كان واضحًا وسلسًا."],
        ["نورة", "الدعم كان حاضرًا في كل خطوة."],
        ["خالد", "رحلة مرتبة واهتمام بالتفاصيل."],
        ["ريم", "الحجز كان سهلًا والرحلة مطمئنة."],
        ["حنان", "التواصل كان سريعًا ومريحًا."],
        ["عبدالله", "ترتيب ممتاز من أول الحجز."],
        ["منى", "خدمة راقية واهتمام واضح."],
        ["ياسر", "وصلنا مرتاحين وكل شيء منظم."],
        ["فاطمة", "فريق متعاون وتجربة جميلة."],
        ["عمر", "تفاصيل الرحلة كانت واضحة جدًا."],
      ]
    : [
        ["Ahmed", "A smooth and comfortable service."],
        ["Sara", "Comfortable from the start."],
        ["Mohammed", "Everything was clear and seamless."],
        ["Noura", "Support was available at every step."],
        ["Khalid", "Well-organised and thoughtful."],
        ["Reem", "Booking was easy and reassuring."],
        ["Hanan", "Communication was quick and reassuring."],
        ["Abdullah", "Excellent organisation from the first booking step."],
        ["Mona", "Thoughtful service and clear care."],
        ["Yasser", "We arrived comfortably and everything was organised."],
        ["Fatimah", "A helpful team and a lovely experience."],
        ["Omar", "The trip details were very clear."],
      ];
  return (
    <section className="ts-destination-choice" aria-labelledby="destination-title">
      <header className="ts-destination-header">
        <button type="button" className="ts-destination-brand" aria-label={t("brand")}>
          <TasaheelMark size={60} plain />
        </button>
        <div className="ts-destination-actions">
          <button type="button" className="ts-mobile-auth" onClick={onAccount}>
            <UserRound size={16}/>{signedIn ? t("profile") : t("login")}
          </button>
          <LangSwitch compact lang={lang} setLang={setLang} langs={LANGS} label={t("language")} />
        </div>
      </header>

      <div className="ts-destination-content">
        <p className="ts-destination-overline">{lang === "ar" ? "تساهيل العمرة" : "Tasaheel Umrah"}</p>
        <h1 id="destination-title">{lang === "ar" ? "رحلة إلى أطهر البقاع" : "A journey to the holiest places"}</h1>
        <p className="ts-destination-lead">{lang === "ar" ? "نسهّل رحلتك.. لتقترب أكثر من بيت الله" : "We make your journey easier, so you can draw closer to the House of Allah."}</p>

        <div className="ts-destination-cards" role="group" aria-label={lang === "ar" ? "اختر وجهة رحلتك" : "Choose your destination"}>
          {destinations.map((item, index) => (
            <button key={item.key} type="button" className="ts-destination-card" onClick={() => onChoose(item.key)}>
              <img src={item.image} alt="" loading={index === 0 ? "eager" : "lazy"}
                onError={e=>{ e.currentTarget.src=item.fallback; }}/>
              {index === 0 && <span className="ts-destination-selected" aria-label={lang === "ar" ? "الخيار الموصى به" : "Recommended option"}><Check size={14}/></span>}
              <span className="ts-destination-card-copy">
                <strong>{item.title}</strong>
                <small>{item.note}</small>
              </span>
            </button>
          ))}
        </div>

        <p className="ts-destination-prompt">{lang === "ar" ? "اختر وجهتك · لنبدأ رحلتك" : "Choose your destination to begin"}</p>
        <div className="ts-destination-trust" aria-label={lang === "ar" ? "مزايا الخدمة" : "Service benefits"}>
          <span><UsersRound size={20}/>{lang === "ar" ? "آلاف المعتمرين يسافرون معنا" : "Thousands travel with us"}</span>
          <span><ShieldCheck size={20}/>{lang === "ar" ? "موثوق ومعتمد" : "Trusted and verified"}</span>
          <span><Headphones size={20}/>{lang === "ar" ? "دعم في كل خطوة" : "Support at every step"}</span>
        </div>

        <section className="ts-destination-reviews" aria-labelledby="pilgrim-reviews-title">
          <h2 id="pilgrim-reviews-title">{lang === "ar" ? "ماذا يقول المعتمرون؟" : "What do pilgrims say?"}</h2>
          <div className="ts-destination-review-carousel" aria-live="off">
            <div className="ts-destination-review-track">
              {[...reviews, ...reviews].map(([name, quote], index) => {
                const duplicate = index >= reviews.length;
                return <figure className="ts-destination-review" dir={lang === "ar" ? "rtl" : "ltr"}
                  aria-hidden={duplicate || undefined} key={`${duplicate ? "copy" : "source"}-${name}`}>
                  <div className="ts-destination-review-stars" aria-label={lang === "ar" ? "خمسة من خمسة" : "Five out of five"}>
                    {Array.from({ length: 5 }, (_, starIndex) => <Star key={starIndex} size={11} fill="currentColor" />)}
                  </div>
                  <blockquote>{quote}</blockquote>
                  <figcaption>{name}</figcaption>
                </figure>;
              })}
            </div>
          </div>
        </section>

        <footer className="ts-destination-footer">
          <img src="/mosque-footer-silhouette.png" alt="" aria-hidden="true" />
          <p>{lang === "ar" ? "رحلتك.. بركة وأثر" : "Your journey: blessing and impact."}</p>
          <small>{lang === "ar" ? "تساهيل العمرة" : "Tasaheel Umrah"}</small>
        </footer>
      </div>
    </section>
  );
}

/* التاريخ هنا ميلاديٌّ محلي، لا نتيجة Date.parse التي قد تعبر المنطقة
   الزمنية وتضع الرحلة في اليوم السابق. لا نعرض من الماضي أبداً. */
const addDateDays = (iso: string, days: number): string => {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
};
type CalendarSystem = "gregory" | "islamic";
const dateParts = (iso: string, lang: Lang, calendar: CalendarSystem = "gregory") => {
  const date = new Date(`${iso}T00:00:00`);
  const calendarTag = calendar === "islamic" ? "islamic" : "gregory";
  const locale = lang === "ar" ? `ar-SA-u-ca-${calendarTag}-nu-latn` : `en-US-u-ca-${calendarTag}-nu-latn`;
  return {
    weekday: new Intl.DateTimeFormat(locale, { weekday: "long" }).format(date),
    day: new Intl.DateTimeFormat(locale, { day: "numeric" }).format(date),
    monthName: new Intl.DateTimeFormat(locale, { month: "long" }).format(date),
    month: new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(date),
  };
};
const departureTimeParts = (hhmm: string | undefined, lang: Lang): { value: string; period: string } => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? "");
  if (!m) return { value: "—", period: "" };
  const hour = Number(m[1]);
  const value = `${hour % 12 === 0 ? 12 : hour % 12}:${m[2]}`;
  return { value, period: hour < 12 ? "AM" : "PM" };
};
const departurePointLabel = (trip: Trip, city = ""): string => {
  const stop = city ? trip.departureStops?.find(s => s.city.trim() === city.trim()) : trip.departureStops?.[0];
  return (stop?.point ?? trip.departurePoint ?? "").trim();
};

/* المرحلة الثانية للتجربة: خطٌ زمني للمغادرات. الأيام الفارغة تمرّ
   بهدوء، والرحلة فقط هي التي تقطع الخط ببطاقة قابلة للحجز. */
function FocusTrips({ packages, tripsOf, destination, departureCity = "", departureRequired = false, onPickDepartureCity, onBack, onOpen, onCustom, lang }: {
  packages: Pkg[];
  tripsOf: (p: Pkg) => Trip[];
  destination: string;
  departureCity?: string;
  departureRequired?: boolean;
  onPickDepartureCity?: () => void;
  onBack: () => void;
  onOpen: (p: Pkg, trip?: Trip) => void;
  onCustom: () => void;
  lang: Lang;
}) {
  const today = todayYMD();
  const [calendar, setCalendar] = useState<CalendarSystem>("gregory");
  const [weekOffset, setWeekOffset] = useState(0);
  const [weekDirection, setWeekDirection] = useState<"next"|"previous">("next");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const dates = useMemo(() => Array.from({ length: 7 }, (_, index) => addDateDays(today, weekOffset * 7 + index)), [today, weekOffset]);
  const visible = useMemo(() => packages.filter(p => matchesDestination(p, destination)), [packages, destination]);
  /* مدينة الانطلاق تُصفّي لا تُرتّب: من اختار الدمام لا يُعرض له ما
     ينطلق من الخبر أصلاً. المدينة على الرحلة لا على الباقة — فالباقة
     الواحدة قد تنطلق من مدينتين في تاريخين. */
  const upcoming = useMemo(() => {
    const city = departureCity.trim();
    return visible.flatMap(pkg => tripsOf(pkg)
      .filter(next => next.departureDate >= today && (!city || (next.departureStops?.length
        ? next.departureStops.some(stop => stop.city.trim() === city)
        : next.departureCity?.trim() === city)))
      .map(next => ({ pkg, next })));
  }, [visible, tripsOf, today, departureCity]);
  const tripsByDay = useMemo(() => {
    const out = new Map<string, { pkg: Pkg; next: Trip }[]>();
    upcoming.forEach(entry => {
      const list = out.get(entry.next.departureDate) ?? [];
      list.push(entry); out.set(entry.next.departureDate, list);
    });
    out.forEach(list => list.sort((a, b) => a.next.departureTime.localeCompare(b.next.departureTime)));
    return out;
  }, [upcoming]);
  /* خط مواعيد لا تقويم: الأيام الفارغة تُرى باهتة لتشرح تسلسل الأسبوع،
     لكن البطاقات لا تدخل الخط؛ تختار الموعد مرة ثم تتبدل الباقات تحته. */
  const timelineDates = useMemo(() => dates.map(iso => ({ iso, part: dateParts(iso, lang, calendar), trips: tripsByDay.get(iso) ?? [] })), [dates, tripsByDay, lang, calendar]);
  const availableTimelineDates = timelineDates.filter(({ trips }) => trips.length > 0);
  const firstAvailableDate = availableTimelineDates[0]?.iso ?? null;
  const activeDate = selectedDate && tripsByDay.has(selectedDate) ? selectedDate : firstAvailableDate;
  const selectedTimeline = availableTimelineDates.find(({ iso }) => iso === activeDate) ?? null;
  const selectedTrips = selectedTimeline?.trips ?? [];
  const destinationLabel = cityLabel(destination, lang);
  /* المدينة مرحلةٌ في المسار لا معلومةٌ على الرحلة: قبل اختيارها لا
     تُعرض قائمةٌ تخلط منطلَق الدمام بمنطلَق الخبر. الورقة تُفتح وحدها،
     وإن أُغلقت بقي الطلب ظاهراً في مكان القائمة — لا تخطٍّ صامت. */
  const awaitingCity = departureRequired && !departureCity;
  const moveWeek = (direction: "next"|"previous") => {
    if (direction === "previous" && weekOffset === 0) return;
    setWeekDirection(direction);
    setWeekOffset(offset => direction === "next" ? offset + 1 : Math.max(0, offset - 1));
    setSelectedDate(null);
  };
  const goToCurrentWeek = () => { setWeekDirection("previous"); setWeekOffset(0); setSelectedDate(null); };
  return (
    <section className="ts-focus-trips" aria-labelledby="focus-title">
      <div className="ts-focus-hero">
        <img src="/thisone.jpg" alt="" onError={e => { e.currentTarget.src = "/bg-haram.jpg"; }}/>
        <div className="ts-focus-hero-shade"/>
        <button type="button" className="ts-focus-back" onClick={onBack} aria-label={lang === "ar" ? "تغيير الوجهة" : "Change destination"}>
          <ChevronLeft size={24} style={flipRTL(lang === "ar" ? "rtl" : "ltr")}/>
        </button>
        <div className="ts-focus-brand"><TasaheelMark size={48} plain /></div>
        <div className="ts-focus-title">
          <h1 id="focus-title">{destinationLabel}</h1>
          <p>{lang === "ar" ? "رحلات مختارة بعناية" : "Carefully selected journeys"}</p>
        </div>
      </div>

      <div className="ts-focus-body">
        <button type="button" className="ts-focus-customize" onClick={onCustom}>
          <span className="ts-focus-customize-icon"><SlidersHorizontal size={21}/></span>
          <span><strong>{lang === "ar" ? "خصص رحلتك" : "Tailor your trip"}</strong><small>{lang === "ar" ? "اختر المدينة والمدة والفندق، وسنتولى الباقي" : "Choose your city, duration and hotel — we'll handle the rest."}</small></span>
          <ChevronLeft size={20} style={flipRTL(lang === "ar" ? "rtl" : "ltr")}/>
        </button>
        {!awaitingCity && <div className="ts-focus-timeline-head">
          <div><span>{lang === "ar" ? (departureCity ? `أقرب رحلات من ${departureCity} إلى ${destinationLabel}` : "مواعيد الانطلاق") : "Departure dates"}</span><small>{lang === "ar" ? "اختر تاريخ الانطلاق المناسب لك" : "Choose the departure date that suits you"}</small></div>
          <div className="ts-focus-calendar-switch" role="group" aria-label={lang === "ar" ? "نظام التاريخ" : "Calendar system"}>
            <button type="button" className={calendar === "gregory" ? "active" : ""} onClick={() => setCalendar("gregory")}>{lang === "ar" ? "ميلادي" : "Gregorian"}</button>
            <button type="button" className={calendar === "islamic" ? "active" : ""} onClick={() => setCalendar("islamic")}>{lang === "ar" ? "هجري" : "Hijri"}</button>
          </div>
        </div>}
        {awaitingCity && (
          <div className="ts-focus-empty">
            <MapPin size={26}/>
            <strong>{lang === "ar" ? "اختر مدينة الانطلاق" : "Choose your departure city"}</strong>
            <small>{lang === "ar" ? "لنعرض لك الرحلات التي تنطلق من مدينتك وحدها." : "So we show only the trips departing from your city."}</small>
            <button type="button" className="ts-focus-empty-action" onClick={onPickDepartureCity}>{lang === "ar" ? "اختيار المدينة" : "Choose city"}</button>
          </div>
        )}
        {!awaitingCity && upcoming.length === 0 && (
          /* المدينة قد لا تُسيّر رحلةً في هذه الفترة. كان الخط يُرسم
             فارغاً وتحته زرُّ «تحميل مزيد» يُضغط بلا نتيجة إلى الأبد. */
          <div className="ts-focus-empty">
            <CalendarDays size={26}/>
            <strong>{lang === "ar"
              ? (departureCity ? `لا رحلات من ${departureCity} حالياً` : "لا رحلات متاحة حالياً")
              : (departureCity ? `No trips from ${departureCity} yet` : "No trips available yet")}</strong>
            <small>{lang === "ar" ? "جرّب مدينة أخرى أو عد لاحقاً — نضيف المواعيد أولاً بأول." : "Try another city or check back soon — new dates are added regularly."}</small>
            {departureRequired && <button type="button" className="ts-focus-empty-action" onClick={onPickDepartureCity}>{lang === "ar" ? "تغيير مدينة الانطلاق" : "Change departure city"}</button>}
          </div>
        )}
        {!awaitingCity && upcoming.length > 0 && <>
        <section className="ts-week-picker" aria-label={lang === "ar" ? "اختيار أسبوع وموعد الانطلاق" : "Choose week and departure date"}>
          <header><span><CalendarDays size={16}/>{timelineDates[0]?.part.month}</span></header>
          <AnimatePresence mode="wait" initial={false}>
          <motion.div key={weekOffset} className="ts-week-days" role="list"
            initial={{ opacity: 0, x: weekDirection === "next" ? -18 : 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: weekDirection === "next" ? 18 : -18 }} transition={{ duration: .18, ease: "easeOut" }}>
          {timelineDates.map(({ iso, part, trips }) => {
            const isToday = iso === today;
            const selected = iso === activeDate;
            const label = trips.length === 0 ? "—" : lang === "ar" ? `${trips.length} ${trips.length === 1 ? "رحلة" : "رحلات"}` : `${trips.length}`;
            const className = `ts-week-day${trips.length ? " available" : ""}${selected ? " selected" : ""}${isToday ? " today" : ""}`;
            const content = <><b>{part.weekday}</b><time>{part.day}</time><small>{isToday ? (lang === "ar" ? "اليوم" : "Today") : label}</small></>;
            return trips.length ? <button key={iso} type="button" role="listitem" className={className} onClick={() => setSelectedDate(iso)} aria-pressed={selected}>{content}</button>
              : <span key={iso} role="listitem" className={className} aria-label={`${part.weekday} ${part.day}: ${lang === "ar" ? "لا رحلات" : "No trips"}`}>{content}</span>;
          })}
          </motion.div>
          </AnimatePresence>
          <nav className="ts-week-nav" aria-label={lang === "ar" ? "تنقل الأسابيع" : "Week navigation"}>
            <button type="button" disabled={weekOffset === 0} onClick={() => moveWeek("previous")}>
              <span>{lang === "ar" ? "الأسبوع السابق" : "Previous week"}</span><ArrowRight size={16}/>
            </button>
            <button type="button" className="current" disabled={weekOffset === 0} onClick={goToCurrentWeek}>{lang === "ar" ? "هذا الأسبوع" : "This week"}</button>
            <button type="button" onClick={() => moveWeek("next")}>
              <ArrowLeft size={16}/><span>{lang === "ar" ? "الأسبوع القادم" : "Next week"}</span>
            </button>
          </nav>
        </section>
        <AnimatePresence mode="wait" initial={false}>
          {selectedTimeline && <motion.section key={selectedTimeline.iso} className="ts-focus-timeline-packages" aria-labelledby={`packages-${selectedTimeline.iso}`}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
            <header><h2 id={`packages-${selectedTimeline.iso}`}>{lang === "ar" ? `رحلات ${selectedTimeline.part.weekday} ${selectedTimeline.part.day} ${selectedTimeline.part.monthName}` : `${selectedTimeline.part.weekday} ${selectedTimeline.part.day} trips`}</h2><span>{selectedTrips.length} {lang === "ar" ? (selectedTrips.length === 1 ? "رحلة متاحة" : "رحلات متاحة") : "available"}</span></header>
            <div className="ts-focus-package-list">
              {selectedTrips.map(({ pkg, next }) => {
                const pkgDestination = lang === "ar" ? pkg.destination : cityLabel(pkg.destination, lang);
                const stop = departureCity ? next.departureStops?.find(s => s.city.trim() === departureCity.trim()) : next.departureStops?.[0];
                const time = departureTimeParts(stop?.time ?? next.departureTime, lang);
                return <button key={next.id} type="button" className="ts-focus-trip-card" onClick={() => onOpen(pkg, next)}>
                  <img src={pkgCover(pkg)} alt="" loading="lazy" onError={e => { e.currentTarget.src = "/gallery/haram-drone.jpg"; }}/>
                  <span className="ts-focus-trip-info"><span className="ts-focus-trip-copy"><strong>{lang === "ar" ? `باقة ${pkgDestination} · ${pkg.days} أيام` : `${pkgDestination} · ${pkg.days} days`}</strong><small><MapPin size={14}/><span className="ts-focus-trip-depart">{departurePointLabel(next, departureCity)}</span></small><em><Tag size={14}/>{lang === "ar" ? `تبدأ من ${money(minTotal(pkg))} ر.س` : `From ${money(minTotal(pkg))} SAR`}</em></span><span className="ts-focus-trip-time"><small>{lang === "ar" ? "وقت الانطلاق" : "Departure"}</small><b>{time.value}</b>{time.period&&<em>{time.period}</em>}</span></span>
                </button>;
              })}
            </div>
          </motion.section>}
        </AnimatePresence>
        <button type="button" className="ts-focus-all-trips" onClick={onBack}>{lang === "ar" ? "عرض جميع الرحلات" : "View all journeys"}<ChevronLeft size={18} style={flipRTL(lang === "ar" ? "rtl" : "ltr")}/></button>
        </>}
      </div>
    </section>
  );
}

/* لم يبق من هذه الشاشة إلا مرحلتاها: الوجهة ثم رحلاتها. جسدُ
   الاستكشاف القديم — شبكة الباقات وقائمتها وشرائح المدن وبطاقة الرحلة
   حسب الطلب — حُذف في ٢٠٢٦-٠٩-١٦ مع مساره /classic. */
export function Explore({ packages, tripsOf, city, setCity, onOpen, onCustom, signedIn, onAccount, t, lang, setLang, departureCity = "", departureRequired = false, onPickDepartureCity }: ExploreProps) {
  /* الصفحة الأولى للمسار: لا قائمة رحلات قبل اختيار وجهة. */
  if (!city) {
    return <DestinationChoice onChoose={setCity} signedIn={signedIn} onAccount={onAccount} t={t} lang={lang} setLang={setLang} />;
  }
  return <FocusTrips packages={packages} tripsOf={tripsOf} destination={city}
    departureCity={departureCity} departureRequired={departureRequired} onPickDepartureCity={onPickDepartureCity}
    onBack={() => setCity("")} onOpen={onOpen} onCustom={onCustom} lang={lang} />;
}


/** يُصدَّر لإعادة استخدامه في شاشة المراجعة. */
export { minTotal };
