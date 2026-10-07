/* شاشة الرحلات — مرحلتان لا صفحة واحدة.

   الأولى: الوجهة. صفحةٌ لا تعرض باقةً واحدة قبل أن يقول العميل إلى أين.
   الثانية: خطٌّ زمني للمغادرات من تلك الوجهة، تُصفّيه مدينة الانطلاق.

   ٢٠٢٦-٠٩-١٦: كان هنا أيضاً جسدُ الاستكشاف القديم — شبكةُ الباقات
   وقائمتها وشرائح المدن وبنر الحديث وبطاقة «رحلة حسب الطلب» — يتقاسم
   هذا الملف براية `destinationFirst`. حُذف مع مساره /classic، فلم يبق
   إلا ما تفتحه «/». */
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MapPin, CalendarDays, CalendarX2, UserRound, Headphones, ShieldCheck, UsersRound, ChevronLeft, ArrowLeft, ArrowRight, Clock3, Star, SlidersHorizontal } from "lucide-react";
import type { Pkg, Trip } from "@/types";
import { TasaheelMark } from "@/components/TasaheelMark";
import { flipRTL, money } from "../ui/tokens";
import { LangSwitch } from "../ui/kit";
import { pkgCover } from "../gallery";
import { LANGS, cityLabel, type Lang } from "../i18n";
import { tripDeparture } from "@/lib/trip";
import { todayYMD } from "@/lib/utils";
import { fmtDayDate, fmtTime } from "@/lib/dates";
import { availSeats } from "../data";
import { availabilityLabel } from "./FocusBooking";


export interface ExploreProps {
  packages: Pkg[];
  tripsOf: (p: Pkg) => Trip[];
  /** معادلة بطاقة «يبدأ من» مطابقة لشاشة الحجز. */
  priceOf: (p: Pkg) => number;
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
  /** يصل الكتالوج بعد أن تُعرض شاشة اختيار الوجهة؛ لا نعرض «لا رحلات»
      خلال هذا الفراغ المؤقت، بل هيكلاً مطابقاً لموضع النتائج. */
  loadingTrips?: boolean;
}
function TripsLoadingSkeleton({lang}:{lang:Lang}) {
  return (
    <section className="ts-focus-loading" aria-busy="true" aria-label={lang==="ar" ? "جارٍ تحميل الرحلات" : "Loading journeys"}>
      <div className="ts-focus-loading-heading"><span className="sk-bar"/><span className="sk-bar"/></div>
      <div className="ts-focus-loading-days" aria-hidden="true">
        {Array.from({length:7},(_,i)=><span className="sk-bar" key={i}/>) }
      </div>
      <div className="ts-focus-loading-card" aria-hidden="true">
        <span className="sk-bar"/><div><span className="sk-bar"/><span className="sk-bar"/><span className="sk-bar"/><span className="sk-bar"/></div>
      </div>
    </section>
  );
}

/* سهم «إلى الأمام»: يسارٌ في العربية ويمينٌ في الإنجليزية. `flipRTL`
   مصمَّم لسهم الرجوع، فاستعماله هنا كان يوجّه سهم المتابعة إلى الخلف. */
const forwardChevron = (lang: Lang) => flipRTL(lang === "ar" ? "ltr" : "rtl");

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
      image: "/gallery/makkah-madinah-together.jpg",
      fallback: "/gallery/quba.jpg",
    },
  ];
  /* الآراء صفٌّ يُسحب باليد ويقف عند كل بطاقة؛ لا حركة تلقائية تسحب
     النص من تحت عين القارئ. */
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
  const ar = lang === "ar";
  return (
    <section className="ts-destination-choice" aria-labelledby="destination-title">
      <header className="ts-destination-header">
        <button type="button" className="ts-destination-brand" aria-label={t("brand")}>
          <TasaheelMark size={48} plain />
        </button>
        <div className="ts-destination-actions">
          <button type="button" className="ts-mobile-auth" onClick={onAccount}>
            <UserRound size={18}/>{signedIn ? t("profile") : t("login")}
          </button>
          <LangSwitch compact lang={lang} setLang={setLang} langs={LANGS} label={t("language")} />
        </div>
      </header>

      <div className="ts-destination-content">
        <p className="ts-destination-overline">{ar ? "تساهيل العمرة" : "Tasaheel Umrah"}</p>
        <h1 id="destination-title">{ar ? "رحلة إلى أطهر البقاع" : "A journey to the holiest places"}</h1>
        <p className="ts-destination-lead">{ar ? "نسهّل رحلتك.. لتقترب أكثر من بيت الله" : "We make your journey easier, so you can draw closer to the House of Allah."}</p>

        <p className="ts-destination-prompt" id="destination-prompt">{ar ? "اختر وجهتك لنبدأ" : "Choose your destination to begin"}</p>
        {/* البطاقتان متساويتان: لا علامة اختيار ولا حدّ ذهبي على الأولى —
            كانت تبدو مختارةً سلفاً فيتردّد العميل أيضغطها أم لا. */}
        <div className="ts-destination-cards" role="group" aria-labelledby="destination-prompt">
          {destinations.map((item, index) => (
            <button key={item.key} type="button" className="ts-destination-card" onClick={() => onChoose(item.key)}>
              <img src={item.image} alt="" width={640} height={400} decoding="async"
                loading={index === 0 ? "eager" : "lazy"}
                onError={e=>{ e.currentTarget.src=item.fallback; }}/>
              <span className="ts-destination-card-copy">
                <span className="ts-destination-card-text">
                  <strong>{item.title}</strong>
                  <small>{item.note}</small>
                </span>
                <span className="ts-destination-card-go" aria-hidden="true"><ChevronLeft size={22} style={forwardChevron(lang)}/></span>
              </span>
            </button>
          ))}
        </div>

        <ul className="ts-destination-trust" aria-label={ar ? "مزايا الخدمة" : "Service benefits"}>
          <li><UsersRound size={22}/>{ar ? "آلاف المعتمرين يسافرون معنا" : "Thousands travel with us"}</li>
          <li><ShieldCheck size={22}/>{ar ? "موثوق ومعتمد" : "Trusted and verified"}</li>
          <li><Headphones size={22}/>{ar ? "دعم في كل خطوة" : "Support at every step"}</li>
        </ul>

        <section className="ts-destination-reviews" aria-labelledby="pilgrim-reviews-title">
          <h2 id="pilgrim-reviews-title">{ar ? "ماذا يقول المعتمرون؟" : "What do pilgrims say?"}</h2>
          <ul className="ts-destination-review-row" tabIndex={0} aria-label={ar ? "آراء المعتمرين — اسحب للمزيد" : "Pilgrim reviews — swipe for more"}>
            {reviews.map(([name, quote]) => (
              <li key={name} style={{ display: "contents" }}>
                <figure className="ts-destination-review">
                  <div className="ts-destination-review-stars" role="img" aria-label={ar ? "خمسة من خمسة" : "Five out of five"}>
                    {Array.from({ length: 5 }, (_, starIndex) => <Star key={starIndex} size={16} fill="currentColor" strokeWidth={0} />)}
                  </div>
                  <blockquote>{quote}</blockquote>
                  <figcaption>{name}</figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </section>

        <footer className="ts-destination-footer">
          <img src="/mosque-footer-silhouette.png" alt="" aria-hidden="true" width={2172} height={724} loading="lazy" decoding="async" />
          <p>{ar ? "رحلتك.. بركة وأثر" : "Your journey: blessing and impact."}</p>
          <small>{ar ? "تساهيل العمرة" : "Tasaheel Umrah"}</small>
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
/* خانة اليوم عرضها 44 بكسل: «الخميس» و«الأربعاء» كانتا تُقصّان بثلاث
   نقاط. بلا أداة التعريف تسع الخانة الاسم كاملاً ويبقى مقروءاً. */
const shortWeekday = (iso: string, lang: Lang): string => {
  const date = new Date(`${iso}T00:00:00`);
  if (lang !== "ar") return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
  return new Intl.DateTimeFormat("ar-SA", { weekday: "long" }).format(date).replace(/^ال/, "");
};
const tripTimeLabel = (hhmm: string | undefined, lang: Lang): string => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? "");
  if (!m) return lang === "ar" ? "غير محدد" : "Not set";
  const hour = Number(m[1]);
  const value = `${hour % 12 === 0 ? 12 : hour % 12}:${m[2]}`;
  return `${value} ${lang === "ar" ? (hour < 12 ? "ص" : "م") : (hour < 12 ? "AM" : "PM")}`;
};
/* العربي الميلادي من lib/dates كبقية التطبيق. الهجري والإنجليزي يبقيان
   على منسّق هذه الشاشة: lib/dates ميلاديٌّ عربيٌّ وحده. والوقت الغائب
   يُحذف من السطر بدل «غير محدد» ملتصقةً بتاريخٍ معروف. */
const tripScheduleLabel = (iso: string | undefined, hhmm: string | undefined, lang: Lang, calendar: CalendarSystem): string => {
  if (!iso) return lang === "ar" ? "غير محدد" : "Not set";
  const hasTime = /^\d{1,2}:\d{2}/.test(hhmm ?? "");
  if (lang === "ar" && calendar === "gregory") return hasTime ? `${fmtDayDate(iso)} · ${fmtTime(hhmm)}` : fmtDayDate(iso);
  const date = dateParts(iso, lang, calendar);
  const day = `${date.weekday} ${date.day} ${date.monthName}`;
  return hasTime ? `${day} · ${tripTimeLabel(hhmm, lang)}` : day;
};
const departureBranchLabel = (trip: Trip, city = "", lang: Lang): string => {
  const stop = city ? trip.departureStops?.find(s => s.city.trim() === city.trim()) : trip.departureStops?.[0];
  const branchCity = (city || stop?.city || trip.departureCity || "").trim();
  if (branchCity) return lang === "ar" ? `فرع تساهيل - ${branchCity}` : `Tasaheel branch - ${branchCity}`;
  return (stop?.point ?? trip.departurePoint ?? "").trim();
};

/* البطاقة لا تحمل تاريخاً مكرراً: عنوان قسم الرحلات يذكر اليوم والتاريخ
   كاملاً، أما هنا فنضيف دافعاً قصيراً للحجز. نعيد الحساب كل دقيقة كي لا
   يبقى «بعد يوم» ظاهراً بعد وصول موعد الرحلة. */
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
type LaunchCountdown = { label: string };
const launchCountdown = (trip: Trip, now: Date, lang: Lang): LaunchCountdown | null => {
  const departure = tripDeparture(trip);
  if (!departure) return null;
  const days = Math.round((startOfDay(departure) - startOfDay(now)) / 86_400_000);
  if (days <= 0) return { label: lang === "ar" ? "ينطلق اليوم" : "Departs today" };
  if (days === 1) return { label: lang === "ar" ? "ينطلق غداً" : "Departs tomorrow" };
  if (lang !== "ar") return { label: `In ${days} days` };
  /* أرقام لاتينية كبقية التطبيق، والمعدود يتبع عدده: يومين، 3 أيام، 11 يوماً. */
  return { label: `ينطلق بعد ${days === 2 ? "يومين" : days <= 10 ? `${days} أيام` : `${days} يوماً`}` };
};

/* المرحلة الثانية للتجربة: خطٌ زمني للمغادرات. الأيام الفارغة تمرّ
   بهدوء، والرحلة فقط هي التي تقطع الخط ببطاقة قابلة للحجز. */
function FocusTrips({ packages, tripsOf, priceOf, destination, departureCity = "", departureRequired = false, onPickDepartureCity, onBack, onOpen, onCustom, lang, loading=false }: {
  packages: Pkg[];
  tripsOf: (p: Pkg) => Trip[];
  priceOf: (p: Pkg) => number;
  destination: string;
  departureCity?: string;
  departureRequired?: boolean;
  onPickDepartureCity?: () => void;
  onBack: () => void;
  onOpen: (p: Pkg, trip?: Trip) => void;
  onCustom: () => void;
  lang: Lang;
  loading?: boolean;
}) {
  const today = todayYMD();
  const [calendar, setCalendar] = useState<CalendarSystem>("gregory");
  const [weekOffset, setWeekOffset] = useState(0);
  const [weekDirection, setWeekDirection] = useState<"next"|"previous">("next");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
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
  /* ترويسة «مكة والمدينة» تحتاج لقطةً تجمع الحرمين؛ صورة مكة المنفردة
     تبقى في وجهتها حتى لا يوحي العرض بأن كل رحلة تمر بالمدينة. */
  const heroImage=destination==="مكة والمدينة" ? "/gallery/makkah-madinah-together.jpg" : "/thisone.jpg";
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
  /* أسبوعٌ بلا رحلات لا يُترك فراغاً تحت الأيام: نقول ذلك ونعرض القفز
     إلى أقرب أسبوعٍ فيه رحلة — عرضٌ فقط، لا يغيّر ما يُحمَّل. */
  const weekStart = dates[0];
  const nextTripDate = useMemo(() => upcoming.map(entry => entry.next.departureDate).filter(date => date > dates[6]).sort()[0] ?? null, [upcoming, dates]);
  const jumpToNextTrip = () => {
    if (!nextTripDate) { goToCurrentWeek(); return; }
    const days = Math.round((Date.parse(`${nextTripDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
    setWeekDirection("next");
    setWeekOffset(Math.floor(days / 7));
    setSelectedDate(nextTripDate);
  };
  const ar = lang === "ar";
  const dir = ar ? "rtl" : "ltr";
  const PrevIcon = ar ? ArrowRight : ArrowLeft;
  const NextIcon = ar ? ArrowLeft : ArrowRight;
  return (
    <section className="ts-focus-trips" aria-labelledby="focus-title">
      <div className="ts-focus-hero">
        <img src={heroImage} alt="" width={1040} height={1280} decoding="async" onError={e => { e.currentTarget.src = "/bg-haram.jpg"; }}/>
        <div className="ts-focus-hero-shade"/>
        <button type="button" className="ts-focus-back" onClick={onBack} aria-label={ar ? "تغيير الوجهة" : "Change destination"}>
          <ChevronLeft size={24} style={flipRTL(dir)}/>
        </button>
        {/* في مربّعه الأبيض: العلامة سوداء والصورة تحتها داكنة. */}
        <div className="ts-focus-brand"><TasaheelMark size={44} /></div>
        <div className="ts-focus-title">
          <h1 id="focus-title">{destinationLabel}</h1>
          <p>{ar ? "رحلات مختارة بعناية" : "Carefully selected journeys"}</p>
        </div>
      </div>

      <div className="ts-focus-body">
        <button type="button" className="ts-focus-customize" onClick={onCustom}>
          <span className="ts-focus-customize-icon"><SlidersHorizontal size={21}/></span>
          <span><strong>{ar ? "خصص رحلتك" : "Tailor your trip"}</strong><small>{ar ? "اختر المدينة والمدة والفندق، وسنتولى الباقي" : "Choose your city, duration and hotel — we'll handle the rest."}</small></span>
          <ChevronLeft size={20} style={forwardChevron(lang)}/>
        </button>
        {loading ? <TripsLoadingSkeleton lang={lang}/> : <>
        {!awaitingCity && <div className="ts-focus-timeline-head">
          <h2>{ar ? (departureCity ? `رحلات ${departureCity} إلى ${destinationLabel}` : "مواعيد الانطلاق") : "Departure dates"}</h2>
          <small>{ar ? "اختر تاريخ الانطلاق المناسب لك" : "Choose the departure date that suits you"}</small>
        </div>}
        {awaitingCity && (
          <div className="ts-focus-empty">
            <span className="ts-focus-empty-icon"><MapPin size={26}/></span>
            <strong>{ar ? "اختر مدينة الانطلاق" : "Choose your departure city"}</strong>
            <small>{ar ? "لنعرض لك الرحلات التي تنطلق من مدينتك وحدها." : "So we show only the trips departing from your city."}</small>
            <button type="button" className="ts-focus-empty-action" onClick={onPickDepartureCity}>{ar ? "اختيار المدينة" : "Choose city"}</button>
          </div>
        )}
        {!awaitingCity && upcoming.length === 0 && (
          /* المدينة قد لا تُسيّر رحلةً في هذه الفترة. كان الخط يُرسم
             فارغاً وتحته زرُّ «تحميل مزيد» يُضغط بلا نتيجة إلى الأبد. */
          <div className="ts-focus-empty">
            <span className="ts-focus-empty-icon"><CalendarX2 size={26}/></span>
            <strong>{ar
              ? (departureCity ? `لا رحلات من ${departureCity} حالياً` : "لا رحلات متاحة حالياً")
              : (departureCity ? `No trips from ${departureCity} yet` : "No trips available yet")}</strong>
            <small>{ar ? "جرّب مدينة أخرى أو عد لاحقاً — نضيف المواعيد أولاً بأول." : "Try another city or check back soon — new dates are added regularly."}</small>
            {departureRequired && <button type="button" className="ts-focus-empty-action is-quiet" onClick={onPickDepartureCity}>{ar ? "تغيير مدينة الانطلاق" : "Change departure city"}</button>}
          </div>
        )}
        {!awaitingCity && upcoming.length > 0 && <>
        <section className="ts-week-picker" aria-label={ar ? "اختيار أسبوع وموعد الانطلاق" : "Choose week and departure date"}>
          <header>
            <span className="ts-week-month"><CalendarDays size={18}/>{timelineDates[0]?.part.month}</span>
            <div className="ts-focus-calendar-switch" role="group" aria-label={ar ? "نظام التاريخ" : "Calendar system"}>
              <button type="button" className={calendar === "gregory" ? "active" : ""} aria-pressed={calendar === "gregory"} onClick={() => setCalendar("gregory")}>{ar ? "ميلادي" : "Gregorian"}</button>
              <button type="button" className={calendar === "islamic" ? "active" : ""} aria-pressed={calendar === "islamic"} onClick={() => setCalendar("islamic")}>{ar ? "هجري" : "Hijri"}</button>
            </div>
          </header>
          <AnimatePresence mode="wait" initial={false}>
          <motion.div key={weekOffset} className="ts-week-days" role="list"
            initial={{ opacity: 0, x: weekDirection === "next" ? -18 : 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: weekDirection === "next" ? 18 : -18 }} transition={{ duration: .18, ease: "easeOut" }}>
          {timelineDates.map(({ iso, part, trips }) => {
            const isToday = iso === today;
            const selected = iso === activeDate;
            const countLabel = ar ? (trips.length === 1 ? "رحلة واحدة" : trips.length === 2 ? "رحلتان" : `${trips.length} رحلات`) : `${trips.length} ${trips.length === 1 ? "trip" : "trips"}`;
            const className = `ts-week-day${trips.length ? " available" : ""}${selected ? " selected" : ""}${isToday ? " today" : ""}`;
            /* «اليوم» يحلّ محلّ اسم اليوم لا محلّ العدد: كان يُخفي عدد رحلات اليوم نفسه. */
            const content = <><b>{isToday ? (ar ? "اليوم" : "Today") : shortWeekday(iso, lang)}</b><time dateTime={iso}>{part.day}</time>{trips.length ? <i>{trips.length}</i> : <i aria-hidden="true"/>}</>;
            return trips.length ? <button key={iso} type="button" role="listitem" className={className} onClick={() => setSelectedDate(iso)} aria-pressed={selected} aria-label={`${part.weekday} ${part.day} ${part.monthName}: ${countLabel}`}>{content}</button>
              : <span key={iso} role="listitem" className={className} aria-label={`${part.weekday} ${part.day}: ${ar ? "لا رحلات" : "No trips"}`}>{content}</span>;
          })}
          </motion.div>
          </AnimatePresence>
          <nav className="ts-week-nav" aria-label={ar ? "تنقل الأسابيع" : "Week navigation"}>
            <button type="button" disabled={weekOffset === 0} onClick={() => moveWeek("previous")}>
              <PrevIcon size={18}/><span>{ar ? "السابق" : "Previous"}</span>
            </button>
            <button type="button" className="current" disabled={weekOffset === 0} onClick={goToCurrentWeek}>{ar ? "هذا الأسبوع" : "This week"}</button>
            <button type="button" onClick={() => moveWeek("next")}>
              <span>{ar ? "التالي" : "Next"}</span><NextIcon size={18}/>
            </button>
          </nav>
        </section>
        <AnimatePresence mode="wait" initial={false}>
          {selectedTimeline && <motion.section key={selectedTimeline.iso} className="ts-focus-timeline-packages" aria-labelledby={`packages-${selectedTimeline.iso}`}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
            <header><h2 id={`packages-${selectedTimeline.iso}`}>{ar ? `رحلات ${selectedTimeline.part.weekday} ${selectedTimeline.part.day} ${selectedTimeline.part.monthName}` : `${selectedTimeline.part.weekday} ${selectedTimeline.part.day} trips`}</h2><span>{ar ? (selectedTrips.length === 1 ? "رحلة واحدة" : selectedTrips.length === 2 ? "رحلتان" : `${selectedTrips.length} رحلات`) : `${selectedTrips.length} available`}</span></header>
            <div className="ts-focus-package-list">
              {selectedTrips.map(({ pkg, next }) => {
                const stop = departureCity ? next.departureStops?.find(s => s.city.trim() === departureCity.trim()) : next.departureStops?.[0];
                const countdown = launchCountdown(next, now, lang);
                const departure = tripScheduleLabel(next.departureDate, stop?.time ?? next.departureTime, lang, calendar);
                const returnTrip = tripScheduleLabel(next.returnDate, next.returnTime, lang, calendar);
                const packageName = pkg.name || (ar ? `باقة ${pkg.destination} · ${pkg.days} أيام` : `${cityLabel(pkg.destination, lang)} · ${pkg.days} days`);
                const branch = departureBranchLabel(next, departureCity, lang);
                /* العدد يظهر حين يقترب الامتلاء فقط — القاعدة نفسها في صفحة الرحلة. */
                const seats = availSeats(next);
                return <button key={next.id} type="button" className="ts-focus-trip-card" onClick={() => onOpen(pkg, next)}
                  aria-label={`${packageName}. ${ar ? `الذهاب: ${departure}. العودة: ${returnTrip}. تبدأ من ${money(priceOf(pkg))} ريال. عرض التفاصيل` : `Departure: ${departure}. Return: ${returnTrip}. From ${money(priceOf(pkg))} SAR. View details`}`}>
                  <span className="ts-focus-trip-photo">
                    <img src={pkgCover(pkg)} alt="" width={640} height={360} loading="lazy" decoding="async" onError={e => { e.currentTarget.src = "/gallery/haram-drone.jpg"; }}/>
                    {countdown && <span className="ts-focus-trip-countdown"><Clock3 size={14}/>{countdown.label}</span>}
                  </span>
                  <span className="ts-focus-trip-info">
                    <strong>{packageName}</strong>
                    <span className="ts-focus-trip-schedule">
                      <span><b>{ar ? "الذهاب" : "Departs"}</b><time>{departure}</time></span>
                      <span><b>{ar ? "العودة" : "Returns"}</b><time>{returnTrip}</time></span>
                    </span>
                    {(branch || seats <= 6) && <span className="ts-focus-trip-meta">
                      {branch && <span className="ts-focus-trip-branch"><MapPin size={16}/><span className="ts-focus-trip-depart">{branch}</span></span>}
                      {seats <= 6 && <span className="ts-focus-trip-seats">{availabilityLabel(seats, lang)}</span>}
                    </span>}
                    <span className="ts-focus-trip-foot">
                      <span className="ts-focus-trip-price">
                        <small>{ar ? "تبدأ من" : "From"}</small>
                        <span><b>{money(priceOf(pkg))}</b>{ar ? "ر.س" : "SAR"}</span>
                      </span>
                      <span className="ts-focus-trip-go">{ar ? "عرض التفاصيل" : "View details"}<i><ChevronLeft size={20} style={forwardChevron(lang)}/></i></span>
                    </span>
                  </span>
                </button>;
              })}
            </div>
          </motion.section>}
        </AnimatePresence>
        {!selectedTimeline && <div className="ts-focus-empty" key={weekStart}>
          <span className="ts-focus-empty-icon"><CalendarX2 size={26}/></span>
          <strong>{ar ? "لا رحلات في هذا الأسبوع" : "No trips this week"}</strong>
          <small>{nextTripDate
            ? (ar ? `أقرب رحلة ${fmtDayDate(nextTripDate)}.` : "The next departure is in a later week.")
            : (ar ? "لا مواعيد بعد هذا الأسبوع حالياً — نضيف المواعيد أولاً بأول." : "No later dates yet — new dates are added regularly.")}</small>
          <button type="button" className="ts-focus-empty-action is-quiet" onClick={jumpToNextTrip}>{nextTripDate ? (ar ? "الانتقال إلى أقرب رحلة" : "Go to next departure") : (ar ? "العودة إلى هذا الأسبوع" : "Back to this week")}</button>
        </div>}
        {/* كان اسمه «عرض جميع الرحلات» وهو يعيد إلى اختيار الوجهة؛ الاسم الآن يقول ما يفعله. */}
        <button type="button" className="ts-focus-all-trips" onClick={onBack}>{ar ? "تغيير الوجهة" : "Change destination"}</button>
        </>}
        </>}
      </div>
    </section>
  );
}

/* لم يبق من هذه الشاشة إلا مرحلتاها: الوجهة ثم رحلاتها. جسدُ
   الاستكشاف القديم — شبكة الباقات وقائمتها وشرائح المدن وبطاقة الرحلة
   حسب الطلب — حُذف في ٢٠٢٦-٠٩-١٦ مع مساره /classic. */
export function Explore({ packages, tripsOf, priceOf, city, setCity, onOpen, onCustom, signedIn, onAccount, t, lang, setLang, departureCity = "", departureRequired = false, onPickDepartureCity, loadingTrips=false }: ExploreProps) {
  /* الصفحة الأولى للمسار: لا قائمة رحلات قبل اختيار وجهة. */
  if (!city) {
    return <DestinationChoice onChoose={setCity} signedIn={signedIn} onAccount={onAccount} t={t} lang={lang} setLang={setLang} />;
  }
  return <FocusTrips packages={packages} tripsOf={tripsOf} priceOf={priceOf} destination={city}
    departureCity={departureCity} departureRequired={departureRequired} onPickDepartureCity={onPickDepartureCity}
    onBack={() => setCity("")} onOpen={onOpen} onCustom={onCustom} lang={lang} loading={loadingTrips} />;
}
