/* طلب تنسيق سفر — لا يحجز مقعداً عند الإرسال.
   يختار العميل رحلته المطلوبة فقط، ثم يراجع الموظف التوفر ويحوّله إلى
   الحجز القائم عند تخصيص المقعد فعلياً.

   العرض مبنيٌّ على عُدّة المستفيد (FlowScreen والعدّاد والحقول) لا على
   ألوان لوحة الموظف: الشاشة تُفتح من الرئيسية مباشرةً، فيجب أن تُقرأ
   امتداداً لمسار الحجز لا تطبيقاً آخر. أنماطها في styles/customer-misc.css
   تحت البادئة `cr-`. */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import {
  BedDouble, BusFront, CalendarDays, CalendarX, Check, ChevronLeft, ChevronRight,
  Info, Plane, Repeat, ArrowLeft, X,
} from "lucide-react";
import { isSellable } from "@/lib/trip";
import { todayYMD } from "@/lib/utils";
import { fmtDate, fmtDateShort, fmtTime, fmtWeekday } from "@/lib/dates";
import type { Trip } from "@/types";
import { fetchCatalog, availSeats, submitCustomRequest } from "../data";
import { LTR } from "../ui/tokens";
import { Counter, CTAButton, Field, useReducedMotion } from "../ui/kit";
import { FlowScreen, Labeled } from "../ui/FlowScreen";

type JourneyKind = "one_way" | "round_trip";
type TravelMode = "bus" | "flight";
type HotelLevel = "اقتصادي" | "متوسط" | "مميز";

const validPhone = (p: string) => /^(0?5\d{8}|(\+?966)5\d{8})$/.test(p.replace(/\s/g, ""));
const today = () => todayYMD();
/* هذا السطر يُرسَل للموظف داخل ملخّص الطلب — يبقى بصيغة التخزين وبالعربية
   مهما كانت لغة الواجهة، فلا يتغيّر ما يصل اللوحة. */
const tripLabel = (trip: Trip) => `${trip.departureDate} · ${trip.departureTime} · ${trip.departureCity || trip.departurePoint} · متبقي ${availSeats(trip)} مقعد`;
const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const isoFromDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const noon = (iso: string) => new Date(`${iso}T12:00:00`);

/* ── النصوص: عربي وإنجليزي ────────────────────────────────────────
   الشاشة كانت عربيةً وحدها وتتجاهل `lang`. الخريطة هنا لا في i18n.ts لأن
   مفاتيحها لا يقرؤها غير هذا الملف. */
const AR = {
  steps: ["الرحلة", "الموعد", "المعتمرون", "السكن"],
  stepOf: "الخطوة {n} من {t}",
  next: "التالي", send: "إرسال الطلب", sending: "جارٍ الإرسال…",
  s1Title: "كيف تريد السفر؟", s1Sub: "اختر شكل الرحلة أولاً، ثم نعرض لك الخيارات المناسبة.",
  journey: "نوع الرحلة", transport: "وسيلة السفر",
  oneWay: "اتجاه واحد", oneWayNote: "ذهاب أو عودة بحسب موعدك",
  roundTrip: "ذهاب وعودة", roundTripNote: "اختر موعدين مناسبين لك",
  bus: "باص", busNote: "اختر من الرحلات القائمة",
  flight: "طيران", flightNote: "طلب تسعير من الفريق",
  s2BusTitle: "اختر موعد الذهاب", s2FlightTitle: "اطلب رحلة طيران",
  s2BusRound: "اختر رحلة الذهاب فقط؛ العودة وتوقيتها تُؤخذ تلقائياً من نفس الباقة.",
  s2BusOne: "هذه مواعيد فعلية؛ التوفر النهائي يؤكده الفريق قبل الدفع.",
  s2Flight: "حدّد رغبتك فقط، ثم يتواصل معك الفريق بعد مراجعة خيارات الطيران.",
  outbound: "موعد الذهاب", pickDayThenTime: "اختر اليوم ثم الوقت",
  prevWeek: "الأسبوع السابق", nextWeek: "الأسبوع القادم",
  tripsCount: "{n} رحلة", noTripsDay: "لا رحلات", seatsLeft: "متبقي {n}",
  times: "الأوقات المتاحة",
  returnTitle: "موعد العودة", returnFromPkg: "مضاف من نفس الباقة",
  returnDate: "تاريخ العودة", returnTime: "وقت العودة",
  returnMissing: "هذه الرحلة لم يُسجّل لها موعد عودة كامل بعد. اختر رحلة أخرى أو تواصل مع الفريق.",
  noBusTitle: "لا توجد رحلات باص متاحة حالياً",
  noBusLine: "يمكنك طلب رحلة طيران وسيراجع الفريق الخيارات معك.",
  noBusAction: "تغيير وسيلة السفر",
  fromCity: "مدينة الانطلاق", cityPh: "مثال: الخبر", destination: "الوجهة",
  flightOut: "تاريخ الذهاب", flightBack: "تاريخ العودة", pickDate: "اختر التاريخ المطلوب",
  prevMonth: "الشهر السابق", nextMonth: "الشهر التالي", chosenDate: "التاريخ المختار",
  needDate: "أكمل بيانات الموعد للمتابعة.",
  s3Title: "المعتمرون", s3Sub: "حدّد عدد المعتمرين والمعتمرات؛ يتحدث إجمالي المقاعد تلقائياً.",
  men: "المعتمرون", menNote: "رجال", women: "المعتمرات", womenNote: "نساء",
  totalSeats: "إجمالي المقاعد المطلوبة", seat1: "مقعد", seatN: "مقاعد",
  contact: "بيانات التواصل", contactSub: "تُستخدم لمراجعة التوفر وإرسال العرض فقط.",
  name: "الاسم", namePh: "الاسم الكامل", phone: "رقم الجوال", yourCity: "مدينتك",
  phoneBad: "اكتب رقم جوال سعودي — مثال: 0501234567",
  needContact: "أضف معتمراً واحداً على الأقل واكتب الاسم والجوال والمدينة للمتابعة.",
  s4Title: "هل تحتاج إلى سكن؟",
  s4Sub: "لا نعرض فنادق أو أسعاراً غير مؤكدة؛ يراجع الفريق طلبك ثم يضيف العرض الفعلي.",
  noHotelBus: "لا، باص فقط", noHotelFlight: "لا، طيران فقط", noHotelNote: "أكمل طلب المقعد",
  yesHotel: "نعم، أحتاج إلى سكن", yesHotelNote: "اكتب مواصفات السكن",
  nights: "عدد الليالي", nightsNote: "من ليلة إلى 30 ليلة", hotelLevel: "مستوى الفندق",
  nearHaram: "القرب من الحرم مهم", nearHaramNote: "نبحث لك عن الأقرب مشياً",
  notes: "ملاحظات خاصة", optional: "اختياري", notesPh: "أي احتياج إضافي أو ملاحظة…",
  failed: "تعذر إرسال الطلب الآن. حاول مرة أخرى.",
  doneTitle: "وصلنا طلبك",
  doneLine: "سنراجع التوفر الفعلي ونرسل لك العرض ورابط الدفع قبل تأكيد أي مقعد.",
  reqNo: "رقم الطلب", home: "العودة إلى الرئيسية",
  dest: { "مكة": "مكة", "المدينة المنورة": "المدينة المنورة", "مكة والمدينة": "مكة والمدينة" } as Record<string, string>,
  level: { "اقتصادي": "اقتصادي", "متوسط": "متوسط", "مميز": "مميز" } as Record<string, string>,
  week: ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"],
};
const EN: typeof AR = {
  steps: ["Trip", "Date", "Pilgrims", "Stay"],
  stepOf: "Step {n} of {t}",
  next: "Next", send: "Send request", sending: "Sending…",
  s1Title: "How would you like to travel?", s1Sub: "Choose the trip shape first, then we show the matching options.",
  journey: "Trip type", transport: "Transport",
  oneWay: "One way", oneWayNote: "Going or returning, on your date",
  roundTrip: "Round trip", roundTripNote: "Pick two dates that suit you",
  bus: "Bus", busNote: "Choose from scheduled trips",
  flight: "Flight", flightNote: "Ask the team for a quote",
  s2BusTitle: "Choose your departure", s2FlightTitle: "Request a flight",
  s2BusRound: "Pick the outbound trip only; the return and its time come from the same package.",
  s2BusOne: "These are real departures; the team confirms final availability before payment.",
  s2Flight: "Tell us what you want, and the team will contact you after reviewing flight options.",
  outbound: "Departure", pickDayThenTime: "Pick a day, then a time",
  prevWeek: "Previous week", nextWeek: "Next week",
  tripsCount: "{n} trips", noTripsDay: "No trips", seatsLeft: "{n} left",
  times: "Available times",
  returnTitle: "Return", returnFromPkg: "Included in the same package",
  returnDate: "Return date", returnTime: "Return time",
  returnMissing: "This trip has no complete return time yet. Choose another trip or contact the team.",
  noBusTitle: "No bus trips available right now",
  noBusLine: "You can request a flight and the team will review the options with you.",
  noBusAction: "Change transport",
  fromCity: "Departure city", cityPh: "e.g. Khobar", destination: "Destination",
  flightOut: "Departure date", flightBack: "Return date", pickDate: "Choose the date you want",
  prevMonth: "Previous month", nextMonth: "Next month", chosenDate: "Selected date",
  needDate: "Complete the date details to continue.",
  s3Title: "Pilgrims", s3Sub: "Set how many men and women are travelling; the seat total updates automatically.",
  men: "Men", menNote: "Male pilgrims", women: "Women", womenNote: "Female pilgrims",
  totalSeats: "Total seats requested", seat1: "seat", seatN: "seats",
  contact: "Contact details", contactSub: "Used only to check availability and send you the offer.",
  name: "Name", namePh: "Full name", phone: "Mobile number", yourCity: "Your city",
  phoneBad: "Enter a Saudi mobile number, e.g. 0501234567",
  needContact: "Add at least one pilgrim and fill in name, mobile and city to continue.",
  s4Title: "Do you need accommodation?",
  s4Sub: "We don't show unconfirmed hotels or prices; the team reviews your request and adds the real offer.",
  noHotelBus: "No, bus only", noHotelFlight: "No, flight only", noHotelNote: "Continue with the seat request",
  yesHotel: "Yes, I need a stay", yesHotelNote: "Describe the stay you want",
  nights: "Nights", nightsNote: "From 1 to 30 nights", hotelLevel: "Hotel level",
  nearHaram: "Being close to the Haram matters", nearHaramNote: "We look for the shortest walk",
  notes: "Special notes", optional: "Optional", notesPh: "Any extra need or note…",
  failed: "We couldn't send the request right now. Please try again.",
  doneTitle: "We received your request",
  doneLine: "We will check real availability and send you the offer and payment link before confirming any seat.",
  reqNo: "Request number", home: "Back to home",
  dest: { "مكة": "Makkah", "المدينة المنورة": "Madinah", "مكة والمدينة": "Makkah & Madinah" },
  level: { "اقتصادي": "Economy", "متوسط": "Standard", "مميز": "Premium" },
  week: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};
type Txt = typeof AR;

/* ── تنسيق التاريخ والوقت ─────────────────────────────────────────
   العربية من lib/dates (ميلادي، أرقام لاتينية، «ص/م»). كانت الشاشة تنادي
   Intl بـ"ar-SA" عارياً فيخرج يومٌ هجري بأرقام هندية داخل شبكةٍ ميلادية.
   الإنجليزية تُصاغ هنا بالتقويم نفسه. */
const EN_LOCALE = "en-GB-u-ca-gregory-nu-latn";
const enFull = new Intl.DateTimeFormat(EN_LOCALE, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const enShort = new Intl.DateTimeFormat(EN_LOCALE, { day: "numeric", month: "short" });
const enMonth = new Intl.DateTimeFormat(EN_LOCALE, { month: "long", year: "numeric" });
const enTime = new Intl.DateTimeFormat("en-US-u-nu-latn", { hour: "numeric", minute: "2-digit", hour12: true });
const arMonth = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { month: "long", year: "numeric" });

function useFmt(en: boolean) {
  return useMemo(() => ({
    full: (iso: string) => (en ? enFull.format(noon(iso)) : `${fmtWeekday(iso)} ${fmtDate(iso)}`),
    short: (iso: string) => (en ? enShort.format(noon(iso)) : fmtDateShort(iso)),
    month: (d: Date) => (en ? enMonth : arMonth).format(d),
    time: (hm: string) => {
      if (!en) return fmtTime(hm);
      const m = /^(\d{1,2}):(\d{2})/.exec(hm.trim());
      return m ? enTime.format(new Date(2000, 0, 1, +m[1], +m[2])) : hm;
    },
  }), [en]);
}
type Fmt = ReturnType<typeof useFmt>;

/* ── لبنات العرض ─────────────────────────────────────────────────── */

/** مؤشّر الخطوات: «الخطوة ٢ من ٤ · الموعد» فوق أربع شرائح. الشرائح
    وحدها لا تقول أين أنت ولا ما اسم الخطوة. */
function StepIndicator({ step, x }: { step: number; x: Txt }) {
  const total = x.steps.length;
  return (
    <div className="cr-steps" role="group"
      aria-label={`${x.stepOf.replace("{n}", String(step)).replace("{t}", String(total))} — ${x.steps[step - 1]}`}>
      <div className="cr-steps-text">
        <span>{x.stepOf.replace("{n}", String(step)).replace("{t}", String(total))}</span>
        <b>{x.steps[step - 1]}</b>
      </div>
      <div className="cr-steps-bars" aria-hidden>
        {x.steps.map((s, i) => <i key={s} data-on={i < step ? "" : undefined} />)}
      </div>
    </div>
  );
}

function Choice<V extends string>({ value, active, onClick, icon, title, note }: {
  value: V; active: boolean; onClick: (v: V) => void; icon: ReactNode; title: string; note: string;
}) {
  return (
    <button type="button" role="radio" aria-checked={active} onClick={() => onClick(value)}
      className="cr-choice" data-on={active ? "" : undefined}>
      <span className="cr-choice-top">
        <span className="cr-choice-icon" aria-hidden>{icon}</span>
        <span className="cr-choice-mark" aria-hidden>{active && <Check size={13} strokeWidth={3} />}</span>
      </span>
      <b>{title}</b>
      <small>{note}</small>
    </button>
  );
}

function ChoiceGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="cr-group">
      <div className="cr-label">{label}</div>
      <div className="cr-choices" role="radiogroup" aria-label={label}>{children}</div>
    </div>
  );
}

/** شرائح اختيارٍ واحد من قليل — بدل قائمةٍ منسدلة لثلاثة خيارات. */
function ChipGroup<V extends string>({ label, value, options, onChange }: {
  label: string; value: V; options: { value: V; label: string }[]; onChange: (v: V) => void;
}) {
  return (
    <div className="cr-group">
      <div className="cr-label">{label}</div>
      <div className="cr-chips" role="radiogroup" aria-label={label}>
        {options.map(o => (
          <button key={o.value} type="button" role="radio" aria-checked={o.value === value}
            className="cr-chip" data-on={o.value === value ? "" : undefined}
            onClick={() => onChange(o.value)}>
            {o.value === value && <Check size={15} strokeWidth={2.6} aria-hidden />}
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return (
    <p className="cr-hint"><Info size={16} aria-hidden /><span>{children}</span></p>
  );
}

/* التقويم هنا لا يدّعي حجزاً مؤكداً: هو نافذة مرئية على الرحلات الفعلية
   التي يمكن للفريق مراجعة مقاعدها لاحقاً، بدلاً من قائمة طويلة بلا سياق. */
function TripSchedule({ label, trips, value, onChange, excludeId, x, f, dir }: {
  label: string; trips: Trip[]; value: string; onChange: (id: string) => void; excludeId?: string;
  x: Txt; f: Fmt; dir: "rtl" | "ltr";
}) {
  const [offset, setOffset] = useState(0);
  const dates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(today(), offset * 7 + i)), [offset]);
  const eligible = trips.filter(t => t.id !== excludeId);
  const selected = eligible.find(t => t.id === value);
  const chosenDate = selected?.departureDate ?? "";
  const shown = chosenDate ? eligible.filter(t => t.departureDate === chosenDate) : [];
  const Prev = dir === "rtl" ? ChevronRight : ChevronLeft;
  const Next = dir === "rtl" ? ChevronLeft : ChevronRight;

  return (
    <section className="cr-card" aria-label={label}>
      <div className="cr-card-head">
        <b>{label}</b>
        <span>{x.pickDayThenTime}</span>
      </div>

      <div className="cr-weeknav">
        <button type="button" className="cr-iconbtn" disabled={offset === 0}
          onClick={() => setOffset(n => Math.max(0, n - 1))} aria-label={x.prevWeek}>
          <Prev size={20} />
        </button>
        <b>{f.short(dates[0])} – {f.short(dates[6])}</b>
        <button type="button" className="cr-iconbtn"
          onClick={() => setOffset(n => n + 1)} aria-label={x.nextWeek}>
          <Next size={20} />
        </button>
      </div>

      <div className="cr-days">
        {dates.map(date => {
          const list = eligible.filter(t => t.departureDate === date);
          const active = date === chosenDate;
          return (
            <button key={date} type="button" disabled={!list.length}
              onClick={() => onChange(list[0].id)}
              className="cr-day" data-on={active ? "" : undefined}
              aria-pressed={active}
              aria-label={`${f.full(date)} — ${list.length ? x.tripsCount.replace("{n}", String(list.length)) : x.noTripsDay}`}>
              <span className="cr-day-name">{x.week[noon(date).getDay()]}</span>
              <strong>{noon(date).getDate()}</strong>
              <span className="cr-day-count">
                {list.length ? <><BusFront size={12} aria-hidden />{list.length}</> : "—"}
              </span>
            </button>
          );
        })}
      </div>

      {chosenDate && (
        <div className="cr-times">
          <div className="cr-sub">{x.times} · {f.full(chosenDate)}</div>
          {shown.map(t => (
            <button key={t.id} type="button" onClick={() => onChange(t.id)}
              className="cr-time" data-on={t.id === value ? "" : undefined} aria-pressed={t.id === value}>
              <span className="cr-radio" aria-hidden>{t.id === value && <i />}</span>
              <b>{f.time(t.departureTime)}</b>
              <span className="cr-time-place">{t.departureCity || t.departurePoint}</span>
              <small>{x.seatsLeft.replace("{n}", String(availSeats(t)))}</small>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/* الذهاب والعودة في الباقة ليسا رحلتين منفصلتين يختارهما العميل: الرحلة
   الواحدة تحمل الموعدين، والمقعد نفسه يُراجع لاحقاً في كروكيها. */
function IncludedReturn({ trip, x, f }: { trip?: Trip; x: Txt; f: Fmt }) {
  if (!trip?.returnDate || !trip.returnTime) {
    return <div className="cr-alert" role="alert"><CalendarX size={18} aria-hidden /><span>{x.returnMissing}</span></div>;
  }
  return (
    <section className="cr-card">
      <div className="cr-card-head">
        <b>{x.returnTitle}</b>
        <span className="cr-tag">{x.returnFromPkg}</span>
      </div>
      <dl className="cr-facts">
        <div><dt>{x.returnDate}</dt><dd>{f.full(trip.returnDate)}</dd></div>
        <div><dt>{x.returnTime}</dt><dd>{f.time(trip.returnTime)}</dd></div>
      </dl>
    </section>
  );
}

/* للطيران لا توجد مواعيد مخزون نعرضها كالرحلات؛ لذلك هذا تقويم اختيار
   بسيط يوضح الشهر وأيام الأسبوع، من دون الإيحاء بأن السعر أو المقعد مؤكد. */
function FlightDateCalendar({ label, value, minDate, onChange, x, f, dir }: {
  label: string; value: string; minDate: string; onChange: (date: string) => void;
  x: Txt; f: Fmt; dir: "rtl" | "ltr";
}) {
  const min = noon(minDate);
  const initial = value ? noon(value) : min;
  const [cursor, setCursor] = useState(() => new Date(initial.getFullYear(), initial.getMonth(), 1));
  const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const leading = (start.getDay() + 1) % 7; // يبدأ الأسبوع بالسبت
  const isMinimumMonth = cursor.getFullYear() === min.getFullYear() && cursor.getMonth() === min.getMonth();
  const weekdays = [6, 0, 1, 2, 3, 4, 5].map(i => x.week[i]);
  const Prev = dir === "rtl" ? ChevronRight : ChevronLeft;
  const Next = dir === "rtl" ? ChevronLeft : ChevronRight;

  return (
    <section className="cr-card" aria-label={label}>
      <div className="cr-card-head">
        <b>{label}<span className="cr-req" aria-hidden> *</span></b>
        <span>{x.pickDate}</span>
      </div>

      <div className="cr-weeknav">
        <button type="button" className="cr-iconbtn" disabled={isMinimumMonth} aria-label={x.prevMonth}
          onClick={() => setCursor(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>
          <Prev size={20} />
        </button>
        <b>{f.month(start)}</b>
        <button type="button" className="cr-iconbtn" aria-label={x.nextMonth}
          onClick={() => setCursor(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>
          <Next size={20} />
        </button>
      </div>

      <div className="cr-month">
        {weekdays.map(day => <span key={day} className="cr-month-wd">{day}</span>)}
        {Array.from({ length: leading }).map((_, i) => <span key={`blank-${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const date = isoFromDate(new Date(cursor.getFullYear(), cursor.getMonth(), i + 1));
          const disabled = date < minDate;
          const active = date === value;
          return (
            <button key={date} type="button" disabled={disabled} onClick={() => onChange(date)}
              className="cr-month-day" data-on={active ? "" : undefined}
              aria-pressed={active} aria-label={f.full(date)}>
              {i + 1}
            </button>
          );
        })}
      </div>

      {value && (
        <div className="cr-picked">
          <CalendarDays size={16} aria-hidden />
          <span>{x.chosenDate}: <b>{f.full(value)}</b></span>
        </div>
      )}
    </section>
  );
}

/** هيكل انتظار الرحلات — بشكل شريط الأيام نفسه حتى لا تقفز الصفحة. */
function ScheduleSkeleton() {
  return (
    <div className="cr-card" aria-busy="true">
      <div className="cr-skel" style={{ width: "42%", height: 18 }} />
      <div className="cr-days" style={{ marginTop: 16 }}>
        {Array.from({ length: 7 }, (_, i) => <div key={i} className="cr-skel" style={{ height: 76 }} />)}
      </div>
    </div>
  );
}

/* ── الشاشة ──────────────────────────────────────────────────────── */

export function CustomRequestScreen({ lang, dir, onDone, onBack }: {
  lang: string; dir: "rtl" | "ltr"; onDone: () => void; onBack: () => void;
}) {
  const en = lang === "en";
  const x = en ? EN : AR;
  const f = useFmt(en);
  const reduced = useReducedMotion();

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

  useEffect(() => {
    let live = true;
    fetchCatalog()
      .then(c => { if (live) setTrips(c.trips); })
      .catch(() => {})
      .finally(() => { if (live) setLoadingTrips(false); });
    return () => { live = false; };
  }, []);

  const availableTrips = useMemo(
    () => trips
      .filter(t => isSellable(t) && availSeats(t) > 0)
      .sort((a, b) => `${a.departureDate}${a.departureTime}`.localeCompare(`${b.departureDate}${b.departureTime}`)),
    [trips],
  );
  const outTrip = availableTrips.find(t => t.id === outboundTripId);

  const move = (next: number) => {
    setFailed("");
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const changeGender = (gender: "men" | "women", delta: number) => {
    const current = gender === "men" ? men : women;
    const other = gender === "men" ? women : men;
    const next = Math.max(0, Math.min(12 - other, current + delta));
    if (gender === "men") setMen(next); else setWomen(next);
    setPersons(next + other);
  };
  const stepValid = () => {
    if (step === 1) return true;
    if (step === 2) {
      return mode === "bus"
        ? !!outTrip && (kind === "one_way" || (!!outTrip.returnDate && !!outTrip.returnTime))
        : !!flightOutbound && (kind === "one_way" || (!!flightReturn && flightReturn >= flightOutbound))
          && !!city.trim() && !!destination.trim();
    }
    if (step === 3) return persons > 0 && men + women === persons && !!name.trim() && validPhone(phone) && !!city.trim();
    return true;
  };

  async function submit() {
    if (busy) return;
    setBusy(true); setFailed("");
    const departDate = mode === "bus" ? outTrip?.departureDate ?? "" : flightOutbound;
    const returnDate = kind === "round_trip" ? (mode === "bus" ? outTrip?.returnDate ?? "" : flightReturn) : "";
    /* الملخّص يقرؤه الموظف في اللوحة — عربيٌّ دائماً وبصيغته القديمة. */
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
      const id = await submitCustomRequest({
        departDate, returnDate, persons, destination,
        roomType: needsHotel ? "غرفة خاصة" : "لا يوجد سكن",
        hotelLevel: needsHotel ? hotelLevel : "",
        tripNotes: requestSummary,
        name: name.trim(), phone: phone.replace(/\s/g, ""), city: city.trim(), notes: "",
        journeyKind: kind, travelMode: mode, outboundTripId: outTrip?.id,
        hotelRequested: needsHotel,
        hotelNights: needsHotel ? nights : undefined,
        hotelNearHaram: needsHotel ? nearHaram : undefined,
      });
      setReqNo(id);
    } catch {
      setFailed(x.failed);
    } finally {
      setBusy(false);
    }
  }

  /* ── تمّ الإرسال ── دائرةٌ ذهبية هادئة لا خضراء: الطلب وصل ولم يُؤكَّد
     شيء بعد، فلا يُحتفى به كحجزٍ مكتمل. */
  if (reqNo) {
    return (
      <div className="cr-wrap cr-done" dir={dir}>
        <motion.span className="cr-done-mark"
          initial={reduced ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.24, ease: "easeOut" }}>
          <Check size={34} strokeWidth={2.4} />
        </motion.span>
        <h1>{x.doneTitle}</h1>
        <p>{x.doneLine}</p>
        <div className="cr-done-no">
          <small>{x.reqNo}</small>
          <b style={LTR}>{reqNo}</b>
        </div>
        <div className="cr-done-cta">
          <CTAButton full onClick={onDone}>{x.home}</CTAButton>
        </div>
      </div>
    );
  }

  const valid = stepValid();
  const title = step === 1 ? x.s1Title
    : step === 2 ? (mode === "bus" ? x.s2BusTitle : x.s2FlightTitle)
    : step === 3 ? x.s3Title : x.s4Title;
  const subtitle = step === 1 ? x.s1Sub
    : step === 2 ? (mode === "bus" ? (kind === "round_trip" ? x.s2BusRound : x.s2BusOne) : x.s2Flight)
    : step === 3 ? x.s3Sub : x.s4Sub;
  const phoneBad = !!phone.trim() && !validPhone(phone);

  return (
    <div className="cr-wrap" dir={dir}>
      <FlowScreen
        onBack={step === 1 ? onBack : () => move(step - 1)}
        title={title}
        subtitle={subtitle}
        cta={step < 4 ? () => move(step + 1) : submit}
        ctaLabel={step < 4 ? x.next : busy ? x.sending : x.send}
        ctaDisabled={!valid}
        ctaBusy={busy}
        error={failed || undefined}>

        <StepIndicator step={step} x={x} />

        {/* ═══ ١ — شكل الرحلة ═══ */}
        {step === 1 && (
          <>
            <ChoiceGroup label={x.journey}>
              <Choice value="one_way" active={kind === "one_way"} onClick={v => setKind(v as JourneyKind)}
                icon={<ArrowLeft size={20} style={dir === "ltr" ? { transform: "scaleX(-1)" } : undefined} />}
                title={x.oneWay} note={x.oneWayNote} />
              <Choice value="round_trip" active={kind === "round_trip"} onClick={v => setKind(v as JourneyKind)}
                icon={<Repeat size={20} />} title={x.roundTrip} note={x.roundTripNote} />
            </ChoiceGroup>
            <ChoiceGroup label={x.transport}>
              <Choice value="bus" active={mode === "bus"} onClick={v => setMode(v as TravelMode)}
                icon={<BusFront size={20} />} title={x.bus} note={x.busNote} />
              <Choice value="flight" active={mode === "flight"} onClick={v => setMode(v as TravelMode)}
                icon={<Plane size={20} />} title={x.flight} note={x.flightNote} />
            </ChoiceGroup>
          </>
        )}

        {/* ═══ ٢ — الموعد ═══ */}
        {step === 2 && mode === "bus" && (
          loadingTrips ? <ScheduleSkeleton />
          : availableTrips.length ? (
            <>
              <TripSchedule label={x.outbound} trips={availableTrips} value={outboundTripId}
                onChange={setOutboundTripId} x={x} f={f} dir={dir} />
              {kind === "round_trip" && outTrip && <IncludedReturn trip={outTrip} x={x} f={f} />}
            </>
          ) : (
            <div className="cr-empty">
              <span aria-hidden><CalendarX size={26} /></span>
              <b>{x.noBusTitle}</b>
              <p>{x.noBusLine}</p>
              <button type="button" className="cr-ghost" onClick={() => move(1)}>{x.noBusAction}</button>
            </div>
          )
        )}
        {step === 2 && mode === "flight" && (
          <>
            <Labeled label={x.fromCity}>
              <Field value={city} onChange={setCity} placeholder={x.cityPh} />
            </Labeled>
            <ChipGroup label={x.destination} value={destination} onChange={setDestination}
              options={["مكة", "المدينة المنورة", "مكة والمدينة"].map(v => ({ value: v, label: x.dest[v] }))} />
            <FlightDateCalendar label={x.flightOut} value={flightOutbound} minDate={today()}
              x={x} f={f} dir={dir}
              onChange={date => { setFlightOutbound(date); if (flightReturn && flightReturn < date) setFlightReturn(""); }} />
            {kind === "round_trip" && (
              <FlightDateCalendar label={x.flightBack} value={flightReturn} minDate={flightOutbound || today()}
                x={x} f={f} dir={dir} onChange={setFlightReturn} />
            )}
          </>
        )}
        {/* التلميح يسكت حيث تقول الشاشة السبب بنفسها: انتظار، أو لا رحلات،
            أو تنبيه «لا موعد عودة» الأحمر. */}
        {step === 2 && !valid && !(mode === "bus" && (loadingTrips || !availableTrips.length || !!outTrip)) && (
          <Hint>{x.needDate}</Hint>
        )}

        {/* ═══ ٣ — المعتمرون وبيانات التواصل ═══ */}
        {step === 3 && (
          <>
            <div className="cr-card cr-counters">
              <Counter label={x.men} note={x.menNote} value={men} min={0} max={12 - women}
                onChange={v => changeGender("men", v - men)} />
              <div className="cr-sep" />
              <Counter label={x.women} note={x.womenNote} value={women} min={0} max={12 - men}
                onChange={v => changeGender("women", v - women)} />
              <div className="cr-total">
                <span>{x.totalSeats}</span>
                <b><span style={LTR}>{persons}</span> {persons === 1 ? x.seat1 : x.seatN}</b>
              </div>
            </div>

            <div className="cr-section-head">
              <h2>{x.contact}</h2>
              <p>{x.contactSub}</p>
            </div>
            <Labeled label={x.name}>
              <Field value={name} onChange={setName} placeholder={x.namePh} />
            </Labeled>
            <Labeled label={x.phone} hint={phoneBad ? x.phoneBad : undefined} bad={phoneBad}>
              <input value={phone} onChange={e => setPhone(e.target.value.replace(/[^\d+ ]/g, ""))}
                inputMode="tel" autoComplete="tel" placeholder="05XXXXXXXX"
                aria-invalid={phoneBad || undefined}
                className="cr-input" data-bad={phoneBad ? "" : undefined}
                style={{ direction: "ltr", textAlign: dir === "rtl" ? "right" : "left" }} />
            </Labeled>
            <Labeled label={x.yourCity}>
              <Field value={city} onChange={setCity} placeholder={x.cityPh} />
            </Labeled>
            {!valid && <Hint>{x.needContact}</Hint>}
          </>
        )}

        {/* ═══ ٤ — السكن ═══ */}
        {step === 4 && (
          <>
            <div className="cr-choices" role="radiogroup" aria-label={x.s4Title}>
              <Choice value="no" active={!needsHotel} onClick={() => setNeedsHotel(false)}
                icon={<X size={20} />} title={mode === "bus" ? x.noHotelBus : x.noHotelFlight} note={x.noHotelNote} />
              <Choice value="yes" active={needsHotel} onClick={() => setNeedsHotel(true)}
                icon={<BedDouble size={20} />} title={x.yesHotel} note={x.yesHotelNote} />
            </div>

            {needsHotel && (
              <>
                <div className="cr-card cr-counters">
                  <Counter label={x.nights} note={x.nightsNote} value={nights} min={1} max={30}
                    onChange={v => setNights(Math.max(1, Number(v) || 1))} />
                </div>
                <ChipGroup label={x.hotelLevel} value={hotelLevel} onChange={v => setHotelLevel(v)}
                  options={(["اقتصادي", "متوسط", "مميز"] as HotelLevel[]).map(v => ({ value: v, label: x.level[v] }))} />
                <label className="cr-switch">
                  <span>
                    <b>{x.nearHaram}</b>
                    <small>{x.nearHaramNote}</small>
                  </span>
                  <input type="checkbox" checked={nearHaram} onChange={e => setNearHaram(e.target.checked)} />
                  <i aria-hidden />
                </label>
              </>
            )}

            <div className="cr-group">
              <label className="cr-label" htmlFor="cr-notes">
                {x.notes} <span className="cr-opt">({x.optional})</span>
              </label>
              <textarea id="cr-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                className="cr-input cr-textarea" placeholder={x.notesPh} />
            </div>
          </>
        )}
      </FlowScreen>
    </div>
  );
}
