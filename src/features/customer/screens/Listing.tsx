/* صفحة الباقة — صفحة واحدة تنزل فيها، تدمج شاشات trip + seat + room القديمة.

   الترتيب: الحجز أولاً ثم المعلومات. الأقسام كانت من نوعين مختلطين
   (قرار ومعلومة) فبدت كلها متساوية الأهمية؛ الآن أقسام الحجز الأربعة
   كتلة واحدة مرقّمة، والمعلوماتية أشرطة متناوبة اللون تحتها. */
import { useMemo, useState, type ReactNode } from "react";
import {
  Wifi, Tv, BatteryCharging, Utensils, UserCheck, BusFront, MapPin, Building2,
  CalendarX, KeyRound, ShieldCheck, Star, BedDouble, ChevronLeft, CalendarDays, Users,
} from "lucide-react";
import { TasaheelMark } from "@/components/TasaheelMark";
import type { Pkg, Trip, Hotel, Transport, PkgFeature, PkgReview } from "@/types";
import { hotelDisplayName } from "@/lib/hotelName";
import {
  bookingRoomChoices, splitTotal, splitSummary, splitHeadline, splitDetail, bedsCount,
  type RoomSplit,
} from "../roomSplit";
import { C, T, R, SPACE, STICKY_H, LTR, flipRTL, money, formatDate } from "../ui/tokens";
import {
  Section, HeroGallery, StickyBar, Chip, Stars, AmenityRow, AccordionRow, DoneRow,
  GrayButton, OutlineButton, Sheet, Counter, TripCalendar, HScroll, TitleAccent,
  MediaGallery, CTAButton, useDir, useIsDesktop, type Tone,
} from "../ui/kit";
import {
  pkgGallery, hotelMedia, roomMedia, transportMedia, type Media,
} from "../gallery";
import { availSeats } from "../data";
import { durationLabel } from "../plural";
import { ReviewsSection } from "../ui/ReviewsSection";

/* المستفيد يحتاج إشارة وفرة لا جرداً: «متبقٍ 99 مقعداً» رقم لا يقرّر به
   شيئاً (وفي وضع التجربة هو 99 ثابتاً). فوق العتبة نعرض «+6 متاح»، وتحتها
   العدد الحقيقي لأنه حينها يعني شحّاً فعلياً. */
const SEATS_CAP = 6;
const seatsLabel = (n: number, t: (k: string) => string) =>
  n > SEATS_CAP
    ? t("seatsPlenty").replace("{n}", String(SEATS_CAP))
    : t("seatsLeftShort").replace("{n}", String(n));
const reviewRating = (rating?:number) => typeof rating === "number"
  ? Math.min(5, Math.max(1, rating > 5 ? rating / 2 : rating))
  : null;

export interface ListingProps {
  pkg: Pkg;
  /** الرحلات القابلة للحجز — تحكم «لا رحلات» وبقيّة الخطوات. */
  trips: Trip[];
  /** ما يُرسم في التقويم: القابل للحجز والمكتمل معاً. */
  calendarTrips: Trip[];
  hotel?: Hotel;
  transport?: Transport;
  trip: Trip | null;      setTrip: (t: Trip | null) => void;
  persons: number;        setPersons: (n: number) => void;
  bookingMode: "full" | "transport"; setBookingMode: (mode: "full" | "transport") => void;
  /** توزيع السكن المختار. الضابط يقبل null: مسح الاختيار حالة مطلوبة. */
  split: RoomSplit | null; setSplit: (s: RoomSplit | null) => void;
  total: number;
  onBack: () => void;
  onNext: () => void;
  terms: string;
  t: (k: string) => string;
  lang: string;
}


/** يختار أيقونة تناسب نص الميزة — البيانات تحمل نصاً حراً لا أيقونة موحّدة. */
function featureIcon(text: string, hint?: string) {
  const s = `${hint ?? ""} ${text}`.toLowerCase();
  const has = (...k: string[]) => k.some(w => s.includes(w));
  if (has("واي", "wifi", "شاحن", "انترنت")) return <Wifi size={22} />;
  if (has("شاش", "tv", "screen", "تلفز")) return <Tv size={22} />;
  if (has("وجب", "إفطار", "افطار", "meal", "مطعم", "ضياف")) return <Utensils size={22} />;
  if (has("مرشد", "guide", "مشرف", "supervisor")) return <UserCheck size={22} />;
  if (has("مواصلات", "transport", "حافل", "باص", "نقل")) return <BusFront size={22} />;
  if (has("زيار", "موقع", "location", "مشاعر")) return <MapPin size={22} />;
  if (has("سكن", "فندق", "غرف", "hotel")) return <Building2 size={22} />;
  return <BatteryCharging size={22} />;
}

/** بطاقة نوع سكن — صورة مصغّرة ثم النصّ.

    بطاقة لكل نوع لا لكل توزيع: التوزيع قرارٌ ثانٍ (كم غرفة وكيف) لا
    يُتّخذ من قائمة، فمكانه ورقة التفاصيل. والبطاقة هنا تعرّف بالسكن
    وتفتحه، فهي كلّها زر واحد بلا زر «صور» داخلها.

    الصورة المصغّرة بدل أيقونة: الغرفة تُختار بالنظر، وكلمة «صور» كانت
    تطلب ضغطة لمعرفة ما كان يمكن إظهاره ابتداءً. */
function RoomTypeCard({ type, opts, nights, t, selected, onOpen }: {
  type: string; opts: RoomSplit[]; nights: number; t: (k: string) => string;
  selected: boolean; onOpen: () => void;
}) {
  /* الخيار يساوي صفّاً واحداً من الباقة: نوع السكن وسعته المسجلة. */
  const thumb = roomMedia(opts[0].rooms[0])[0];
  const cheapest = Math.min(...opts.map(o => splitTotal(o, nights)));
  const capacity = opts[0].capacity;
  const dir = useDir();

  return (
    <button onClick={onOpen} className="flex items-stretch w-full"
      style={{
        border: `${selected ? 2 : 1}px solid ${selected ? C.green : C.border}`,
        background: selected ? C.greenTint : C.white,
        borderRadius: R.card, padding: selected ? 9 : 10, gap: 12,
        cursor: "pointer", textAlign: "start",
      }}>
      {thumb && (
        <img src={thumb.url} alt=""
          style={{ width: 86, height: 86, objectFit: "cover", borderRadius: R.chip, flexShrink: 0, display: "block" }} />
      )}
      <span className="flex-1 min-w-0 flex flex-col justify-center" style={{ gap: 5 }}>
        <span className="truncate" style={{ ...T.body, fontWeight: 600, color: C.ink }}>{type}</span>

        {/* الأسرّة رسماً: يُفهم شكل النوم قبل القراءة */}
        <span className="flex items-center" style={{ gap: 2 }}>
          {Array.from({ length: Math.min(capacity, 3) }, (_, b) => (
            <BedDouble key={b} size={15} style={{ color: selected ? C.greenDeep : C.ink2 }} />
          ))}
          <span style={{ ...T.small, fontWeight: 500, color: C.ink2, marginInlineStart: 6 }}>
            {capacity} {t("guests")}
          </span>
        </span>

        <span className="flex items-baseline" style={{ gap: 5, flexWrap: "wrap" }}>
          <span style={{ ...T.small, fontWeight: 400, color: C.ink2 }}>{t("fromPrice")}</span>
          <span style={{ ...T.body, fontWeight: 600, color: C.ink, ...LTR }}>
            {money(cheapest)} {t("currency")}
          </span>
          <span style={{ ...T.small, fontWeight: 400, color: C.ink2 }}>{t("perStay")}</span>
        </span>
      </span>

      <ChevronLeft size={18} style={{ color: C.ink3, alignSelf: "center", flexShrink: 0, ...flipRTL(dir) }} />
    </button>
  );
}

/** صفّ توزيع داخل ورقة التفاصيل — هنا يُحدَّد عدد الغرف وشكلها. */
function SplitRow({ split, nights, t, picked, onPick }: {
  split: RoomSplit; nights: number; t: (k: string) => string;
  picked: boolean; onPick: () => void;
}) {
  return (
    <button onClick={onPick} className="flex items-start w-full"
      style={{
        border: `1px solid ${picked ? C.green : C.border}`,
        background: picked ? C.greenTint : C.white,
        borderRadius: R.card, padding: 14, gap: 12,
        cursor: "pointer", textAlign: "start",
      }}>
      {/* دائرة اختيار: الصفوف بدائل يُنتقى منها واحد، لا أزرار متجاورة */}
      <span aria-hidden className="flex items-center justify-center flex-shrink-0"
        style={{
          width: 20, height: 20, borderRadius: R.pill, marginTop: 2,
          border: `${picked ? 6 : 1.5}px solid ${picked ? C.green : C.border}`,
          background: C.white,
        }} />

      <span className="flex-1 min-w-0 flex flex-col" style={{ gap: 8 }}>
        {/* صفّ الأسرّة — غرفة لكل مجموعة، والخط الرأسي هو الجدار بينها */}
        <span className="flex items-center flex-wrap" style={{ gap: 8 }}>
          {split.rooms.map((r, i) => (
            <span key={i} className="flex items-center" style={{ gap: 8 }}>
              {i > 0 && <span aria-hidden style={{ width: 1, height: 18, background: C.border }} />}
              <span className="flex items-center" style={{ gap: 2 }}>
                {Array.from({ length: r.persons }, (_, b) => (
                  <BedDouble key={b} size={18} style={{ color: picked ? C.greenDeep : C.ink2 }} />
                ))}
              </span>
            </span>
          ))}
        </span>

        <span className="flex items-baseline" style={{ gap: 8, flexWrap: "wrap" }}>
          <span style={{ ...T.body, fontWeight: 600, color: C.ink }}>{splitHeadline(split, t)}</span>
          <span style={{ ...T.meta, color: C.ink2 }}>{splitDetail(split, t)}</span>
        </span>

        <span className="flex items-baseline" style={{ gap: 6, flexWrap: "wrap" }}>
          <span style={{ ...T.body, fontWeight: 600, color: C.ink, ...LTR }}>
            {money(splitTotal(split, nights))} {t("currency")}
          </span>
          {/* «لكامل الإقامة» لا «للفرد»: الرقم صار ثمن المجموعة كلها،
              وإبقاء التسمية القديمة كان يعرض السعر مقسوماً على أربعة. */}
          <span style={{ ...T.small, fontWeight: 400, color: C.ink2 }}>{t("perStay")}</span>
        </span>

        {/* سرير فائض يُعلَن لا يُخفى: هو سبب كون هذا الخيار أغلى */}
        {split.spare > 0 && (
          <span style={{ ...T.small, fontWeight: 400, color: C.gold }}>
            {split.spare === 1 ? t("spareBeds") : t("spareBedsN").replace("{n}", String(split.spare))}
          </span>
        )}
      </span>
    </button>
  );
}

/** بطاقة رأي — أربعٌ في صفٍّ على الديسكتوب بدل مُدوِّرٍ يعرض واحداً.

    الرأي الواحد المتبدّل يناسب عمود الجوال؛ وعلى الشاشة العريضة يترك
    ثلاثة أرباع الصفّ فارغاً ويطلب من القارئ انتظار الدور. */
function ReviewCard({ rv, onOpen }: { rv: PkgReview; onOpen: () => void }) {
  const r = reviewRating(rv.rating);
  return (
    <button type="button" onClick={onOpen} className="ts-review-card">
      <span className="ts-review-head">
        <span className="ts-review-avatar" aria-hidden>{rv.name.trim().charAt(0)}</span>
        <span className="ts-review-name">{rv.name}</span>
        {r !== null && (
          <span className="ts-review-score" style={{ direction: "ltr" }}>
            {r.toFixed(1).replace(/\.0$/, "")}/5
          </span>
        )}
      </span>
      <span className="ts-review-text">{rv.text}</span>
    </button>
  );
}

export function Listing(p: ListingProps) {
  const { pkg, trips, calendarTrips, hotel, transport, trip, split, persons, total, bookingMode, t } = p;
  const dir = useDir();
  const transportOnly = !!pkg.transportOnlyEnabled && (pkg.transportOnlyPrice ?? 0) > 0;

  const [amenitiesOpen, setAmenitiesOpen] = useState(false);
  const [reviewsOpen, setReviewsOpen] = useState(false);
  /* على الديسكتوب التفاصيل جزء مرئي من الصفحة في شبكة 2×2؛ الجوال يبقيها
     مطوية حتى لا يحوّل رحلة الحجز إلى صفحة طويلة. */
  const [detailsOpen, setDetailsOpen] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width:1024px)").matches,
  );
  /** عرض كامل لأي معرض عند الضغط على صورته الرئيسية. */
  const [full, setFull] = useState<{ items: Media[]; i: number } | null>(null);
  /** ورقة تفاصيل التوزيع — تحمل الصور وتفصيل السعر بدل تمديد البطاقة. */
  /* الورقة تحمل النوع وخياراته لا توزيعاً واحداً: التوزيع يُنتقى داخلها. */
  const [roomSheet, setRoomSheet] = useState<{ type: string; opts: RoomSplit[] } | null>(null);
  const [sheetPick, setSheetPick] = useState<RoomSplit | null>(null);

  /* فتح نوع: يبدأ من المختار سابقاً إن كان من هذا النوع، وإلا الأول
     (وهو الأقلّ غرفاً بحكم ترتيب roomSplits). */
  const openRoomType = (type: string, opts: RoomSplit[]) => {
    setRoomSheet({ type, opts });
    setSheetPick(split && split.type === type ? split : opts[0]);
  };

  const images = useMemo(() => pkgGallery(pkg, hotel, transport), [pkg, hotel, transport]);
  const hotelPics = useMemo(() => hotelMedia(hotel, pkg.order - 1), [hotel, pkg.order]);
  const transportPics = useMemo(() => transportMedia(transport), [transport]);
  const nights = pkg.nights || 1;

  /* كل صف يظهر كما سُجّل: «سكن مشترك · 3 أشخاص» مثلاً. الرقم سعة الغرفة،
     أما الإجمالي فيضرب سعرها للفرد في عدد معتمري الطلب. */
  const options = useMemo(() => bookingRoomChoices(pkg.roomPrices, persons), [pkg.roomPrices, persons]);
  /* لا ندمج فئات السكن المشترك: 2 و3 و4 أشخاص خيارات مستقلة. */
  const groups = useMemo(() => options.map(o => [o.key, [o]] as [string, RoomSplit[]]), [options]);

  /* المقاعد انتقلت لشاشة مستقلة بعد بيانات المعتمرين — لكل معتمر مقعده بالاسم. */
  /* السعة تُفحص هنا أيضاً لا في الحارس وحده: الحارس أثر جانبي يعمل بعد
     الرسم، وبين تغيّر العدد وتنفيذه إطارٌ كان الشريط الثابت فيه مفعَّلاً. */
  const ready = !!trip && (bookingMode === "transport" || !!split);

  /* ── حالة التحرير ──
     لا أكورديون مرقّم ولا خطوةٌ تُطوى فتغيب. العلّة التي أسقطته: التاريخ
     كان يختفي بعد اختياره ويبقى مكانه زرٌّ ذهبي ضخم، فلا المستفيد يرى ما
     اختار ولا يعرف لِمَ الزرّ. الآن كل قرارٍ يبقى مرئياً: محرّرٌ مفتوح
     قبل الاختيار، وصفٌّ فاتح فيه ✓ وقيمته و«تعديل» بعده.

     ثلاث رايات مستقلة لا راية واحدة: التاريخ والعدد يُحرَّران معاً في
     البداية (صفّان جنباً إلى جنب على الديسكتوب)، وتأكيد التاريخ يطويهما
     كليهما — وهو ما يجعل الصفحة تقصر بضغطةٍ واحدة. */
  const [editDate, setEditDate] = useState(true);
  const [editPeople, setEditPeople] = useState(true);
  const [editRoom, setEditRoom] = useState(true);
  /* التفريع الحقيقي على العرض في موضعين لا يكفي فيهما CSS: شبكة التقييمات
     (مُدوِّرها مؤقّتٌ يجب ألّا يوجد أصلاً على الجوال) وارتفاع المعرض. */
  const isDesktop = useIsDesktop();

  /* الشهر المعروض في التقويم — هنا لا داخل TripCalendar: إعادة تركيب
     المحرّر بعد طيّه كانت تعيد التقويم إلى شهر أول رحلة ولو كان المستفيد
     قد تصفّح إلى ما بعده. */
  const [calMonth, setCalMonth] = useState<{ y: number; m: number } | undefined>();

  /** اليوم مطروح لكنه لا يُحجز — التقويم يرسمه مشطوباً بدل إخفائه. */
  const tripFull = (tr: Trip) => tr.status !== "open" || availSeats(tr) <= 0;

  const AMENITY_PREVIEW = 6;
  const features: PkgFeature[] = pkg.features ?? [];
  /** أول سياسة مسجّلة — تُستعمل شريحةً بارزة. لا شيء ⇒ لا شريحة. */
  const firstPolicy = pkg.policies?.find(x => x.trim())?.trim();
  const reviews = pkg.reviews?.filter(r => r.name.trim() && r.text.trim()) ?? [];

  /** ما ينقص الحجز — يُعرض في الملخّص بدل تعطيل صامت. */
  const missing = !trip ? t("chooseTrip")
    : bookingMode === "transport" ? null
    : options.length === 0 ? t("noRoomFit")
    : !split ? t("chooseRoom")
    : null;

  const roomNeeded = bookingMode === "full" && !!pkg.roomPrices?.length;
  /* أقصى عدد قبل اختيار التاريخ: أكبر ما تتيحه رحلةٌ من رحلات الباقة.
     يُقصّ إلى سعة الرحلة لحظة اختيارها (CustomerApp يفعلها)، فلا يُمنع
     المستفيد من تحديد عدده قبل الموعد — والخليتان مفتوحتان معاً. */
  const maxAnyTrip = trips.length ? Math.max(...trips.map(availSeats)) : 9;
  const peopleMax = trip ? availSeats(trip) : maxAnyTrip;

  const dateDone   = !!trip  && !editDate;
  const peopleDone = !!trip  && !editPeople;
  const roomDone   = !!split && !editRoom;

  /* ── خليّة التاريخ ── */
  const dateBody = trips.length === 0
    ? <div style={{ ...T.body, color: C.ink2 }}>{t("noTrips")}</div>
    : dateDone && trip
    ? <DoneRow icon={<CalendarDays size={15} />} label={t("chooseTrip")}
        value={`${formatDate(trip.departureDate, p.lang, true)} · ${seatsLabel(availSeats(trip), t)}`}
        editLabel={t("editWord")} onEdit={() => setEditDate(true)} />
    : (
      <>
        <TripCalendar
          trips={calendarTrips} valueId={trip?.id}
          isFull={tripFull}
          month={calMonth} onMonthChange={setCalMonth}
          legend={{ available: t("dayAvailable"), full: t("dayFull") }}
          onPick={p.setTrip}
          onClear={() => p.setTrip(null)}
          clearLabel={t("clearDate")}
        />
        <div style={{ marginTop: 12 }}>
          <CTAButton full disabled={!trip}
            onClick={() => setEditDate(false)}>
            {t("confirmDate")}
          </CTAButton>
          {/* الزرّ المعطَّل يقول سببه، والنصّ يختفي فور الاختيار فلا يزاحم. */}
          {!trip && (
            <div style={{ ...T.small, fontWeight: 400, color: C.ink3, marginTop: 8, textAlign: "center" }}>
              {t("pickDateFirst")}
            </div>
          )}
        </div>
      </>
    );

  /* ── خليّة العدد ── */
  const peopleBody = peopleDone
    ? <DoneRow icon={<Users size={15} />} label={t("people")}
        value={`${persons} ${t("person")}`}
        editLabel={t("editWord")} onEdit={() => setEditPeople(true)} />
    : (
      <>
        <Counter
          label={t("person")} note={trip ? seatsLabel(availSeats(trip), t) : undefined}
          value={persons} min={1} max={peopleMax} onChange={p.setPersons}
        />
        {trip && (
          <div style={{ marginTop: 10 }}>
            <CTAButton full onClick={() => setEditPeople(false)}>{t("confirmPeople")}</CTAButton>
          </div>
        )}
      </>
    );

  /* ── خليّة السكن ── */
  const roomBody = !roomNeeded ? null
    : options.length === 0
    ? (
      /* لا توزيع يناسب العدد — رسالة صريحة لا خليّة فارغة، لأن الفارغة
         تُقرأ عطلاً في التطبيق لا حدّاً في بيانات الباقة. */
      <div className="flex flex-col" style={{ gap: 6 }}>
        <div style={{ ...T.body, color: C.ink }}>{t("noRoomFit")}</div>
        <div style={{ ...T.meta, color: C.ink2 }}>{t("noRoomFitHint")}</div>
      </div>
    )
    : roomDone && split
    ? <DoneRow icon={<BedDouble size={15} />} label={t("roomSplitTitle")}
        value={`${splitSummary(split, t)} · ${money(splitTotal(split, nights))} ${t("currency")}`}
        editLabel={t("editWord")} onEdit={() => setEditRoom(true)} />
    : (
      <div className="ts-room-options flex flex-col" style={{ gap: 10 }}>
        {/* الاختيار مباشر: كل صف هو فئة سكن مستقلة كما في الأسعار. */}
        {groups.map(([key, opts]) => (
          <RoomTypeCard
            key={key} type={opts[0].type} opts={opts} nights={nights} t={t}
            selected={split?.key === opts[0].key}
            onOpen={() => { p.setSplit(opts[0]); setEditRoom(false); }}
          />
        ))}
      </div>
    );

  /* ── الأقسام المعلوماتية — تُرشَّح بالوجود ثم يُحسب لونها من موضعها.
        لو ثُبّت اللون يدوياً لكل قسم، فباقة بلا برنامج أو بلا فندق
        تُنتج شريطين متجاورين بنفس اللون فيختفي الفصل. ── */
  const info: { key: string; title: string; body: ReactNode; bleed?: boolean }[] = [];

  if (features.length > 0) info.push({
    key: "offers", title: t("whatOffers"),
    body: (
      <>
        <div>
          {features.slice(0, AMENITY_PREVIEW).map(f => (
            <AmenityRow key={f.id} icon={featureIcon(f.text, f.icon)} text={f.text} />
          ))}
        </div>
        {features.length > AMENITY_PREVIEW && (
          <div style={{ marginTop: 14 }}>
            <OutlineButton full onClick={() => setAmenitiesOpen(true)}>
              {t("showAllAmenities").replace("{n}", String(features.length))}
            </OutlineButton>
          </div>
        )}
      </>
    ),
  });

  if (pkg.program?.length > 0) info.push({
    key: "program", title: t("program"),
    body: (
      <div className="flex flex-col">
        {pkg.program.filter(s => !s.archived).sort((a, b) => a.order - b.order).map((s, i, arr) => (
          <div key={s.id} className="flex gap-3">
            <div className="flex flex-col items-center" style={{ flexShrink: 0, width: 30 }}>
              <span style={{ fontSize: 19, lineHeight: "24px" }}>{s.icon}</span>
              {i < arr.length - 1 && <span style={{ flex: 1, width: 1, background: C.border, marginBlock: 4 }} />}
            </div>
            <div style={{ paddingBottom: i < arr.length - 1 ? 22 : 0, flex: 1 }}>
              <div className="flex items-baseline gap-2">
                <span style={{ ...T.body, fontWeight: 500, color: C.ink }}>{s.title}</span>
                <span style={{ ...T.small, fontWeight: 400, color: C.ink2, ...LTR }}>{s.time}</span>
              </div>
              <div style={{ ...T.meta, color: C.ink2 }}>{s.day}</div>
              {s.desc && <div style={{ ...T.meta, color: C.ink2, marginTop: 4 }}>{s.desc}</div>}
            </div>
          </div>
        ))}
      </div>
    ),
  });

  if (hotel && bookingMode === "full") info.push({
    key: "stay", title: t("stay"),
    body: (
      <div>
        <MediaGallery items={hotelPics} height={230} layout={isDesktop ? "triplet" : undefined}
          onOpen={i => setFull({ items: hotelPics, i })} />
        <div style={{ paddingTop: 16 }}>
          <div className="flex items-center gap-2">
            <span style={{ ...T.h3, color: C.ink }}>{hotelDisplayName(hotel.name)}</span>
            <Stars n={hotel.stars} size={13} />
          </div>
          <div style={{ ...T.meta, color: C.ink2, marginTop: 4 }}>
            {hotel.district}، {hotel.city} · <span style={LTR}>{hotel.distanceM}</span> {t("meters")} {t("fromHaram")}
          </div>
          {hotel.features?.length > 0 && (
            <div className="flex flex-wrap gap-2" style={{ marginTop: 12 }}>
              {hotel.features.slice(0, 5).map(f => <Chip key={f.id}>{f.text}</Chip>)}
            </div>
          )}
          {hotel.tasaheelNote && (
            <div style={{ ...T.meta, color: C.ink2, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
              {hotel.tasaheelNote}
            </div>
          )}
          {hotel.mapUrl && (
            <div style={{ marginTop: 14 }}>
              <a href={hotel.mapUrl} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5"
                style={{ ...T.meta, fontWeight: 600, color: C.ink, textDecoration: "underline" }}>
                <MapPin size={15} />{t("openMap")}
              </a>
            </div>
          )}
        </div>
      </div>
    ),
  });

  if (transport) info.push({
    key: "transport", title: t("transport"),
    body: (
      <div>
        {/* الطيران بلا معرض: لا نملك صور طائرات، وصور الباص عليه معلومة خاطئة */}
        {transportPics.length > 0 && (
          <MediaGallery items={transportPics} height={230} onOpen={i => setFull({ items: transportPics, i })} />
        )}
        <div style={{ paddingTop: transportPics.length ? 16 : 0 }}>
          <div style={{ ...T.h3, color: C.ink }}>{transport.name}</div>
          <div style={{ ...T.meta, color: C.ink2, marginTop: 4 }}>
            {transport.vehicleType}
            {transport.model && <> · {transport.model}</>}
            {transport.year && <> · <span style={LTR}>{transport.year}</span></>}
          </div>
          {transport.features?.length > 0 && (
            <div className="flex flex-wrap gap-2" style={{ marginTop: 12 }}>
              {transport.features.map(f => <Chip key={f.id}>{f.text}</Chip>)}
            </div>
          )}
          {transport.reviews?.filter(r => r.consent).map(rv => (
            <div key={rv.id} style={{ ...T.meta, color: C.ink2, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
              «{rv.text}» — {rv.name}
            </div>
          ))}
        </div>
      </div>
    ),
  });

  info.push({
    key: "reviews",
    title: reviews.length ? `${reviews.length} ${t("guestReviews")}` : t("guestReviews"),
    /* bleed حتى يتحكّم القسم بهوامشه: النقاط تُتوسَّط بعرض الصفحة كاملاً.
       ولا bleed على الديسكتوب — الشبكة تحترم حشوة اللوحة. */
    bleed: reviews.length > 0 && !isDesktop,
    body: reviews.length ? (
      isDesktop ? (
        <>
          <div className="ts-reviews-grid">
            {reviews.slice(0, 4).map(rv => (
              <ReviewCard key={rv.id} rv={rv} onOpen={() => setReviewsOpen(true)} />
            ))}
          </div>
          {reviews.length > 4 && (
            <div className="ts-reviews-all">
              <button type="button" onClick={() => setReviewsOpen(true)}>{t("showAllReviewsShort")}</button>
            </div>
          )}
        </>
      ) : (
      <>
        <ReviewsSection reviews={reviews} t={t} onReadMore={() => setReviewsOpen(true)} />
        {reviews.length > 1 && (
          <div style={{ marginTop: 16, paddingInline: SPACE.page }}>
            <GrayButton full onClick={() => setReviewsOpen(true)}>{t("showAllReviews")}</GrayButton>
          </div>
        )}
      </>
      )
    ) : (
      <div className="flex items-center gap-2" style={{ ...T.body, color: C.ink2 }}>
        <Star size={16} color={C.ink3} />{t("noReviews")}
      </div>
    ),
  });

  info.push({
    key: "know", title: t("thingsToKnow"),
    body: (
      /* ثلاثة أعمدة على الديسكتوب (CSS): الإلغاء والشروط والملاحظات
         معلوماتٌ يُرجَع إليها لا تُقرأ بالتتابع، فصفّ واحد يكفيها. */
      <div className="ts-know-grid">
        {/* لا سياسة مسجّلة ⇒ يُقال ذلك صراحةً. الاحتياطية القديمة كانت
            «إلغاء مجاني» — وعدٌ لم يكتبه أحد يظهر على باقةٍ بلا سياسات،
            ويُقرأ التزاماً عند أول طلب إلغاء. */}
        <AccordionRow icon={<CalendarX size={20} />} title={t("cancelPolicy")}>
          {pkg.policies?.filter(x => x.trim()).length
            ? pkg.policies.filter(x => x.trim()).join("\n")
            : t("noPolicy")}
        </AccordionRow>
        {pkg.notes && (
          <AccordionRow icon={<KeyRound size={20} />} title={t("package")}>
            {pkg.notes}
          </AccordionRow>
        )}
        <AccordionRow icon={<ShieldCheck size={20} />} title={t("termsTitle")}>
          {p.terms}
        </AccordionRow>
      </div>
    ),
  });

  return (
    <div className="ts-listing-shell flex flex-col flex-1" style={{ background: C.white }}>
      {/* ── الشبكة ──
          على الجوال عمودٌ واحد بالترتيب نفسه. وعلى الديسكتوب شبكة اثني
          عشر عموداً (CSS): الصور والمعلومات صفّاً أول، والحجز مع ملخّصه
          صفّاً ثانياً، ثم أزواج، ثم ثلاثيات، والتقييمات أربعٌ في صفّ.
          كل لوحة `ts-panel` تأخذ حصّتها من العرض بصنفها لا بمكانها. */}
      <div className="flex-1 ts-listing-grid" style={{ paddingBottom: STICKY_H }}>

        {/* رأسٌ فعلي للجوال: لا يُترك الرجوع كلمةً صغيرةً داخل المعلومات.
            يظهر فوق المحتوى، ثم تبدأ الصور مباشرةً. */}
        <header className="ts-mobile-listing-header">
          <button type="button" onClick={p.onBack} className="ts-mobile-listing-back">
            <ChevronLeft size={22} style={{ ...flipRTL(dir) }} />
            {t("back")}
          </button>
          <TasaheelMark size={42} plain />
        </header>

        {/* ═══ صور الباقة ═══
            الصور تسبق معلومات الباقة على الجوال، وتبقى في صدر الشبكة
            على الديسكتوب أيضاً. */}
        <div className="ts-panel ts-p-gallery"
          style={{ background: C.white, padding: `0 ${SPACE.page}px ${SPACE.section}px` }}>
          <div className="ts-gallery-title" style={{ ...T.h3, color: C.ink, marginBottom: 10 }}>{t("viewPhotos")}</div>
          <HeroGallery images={images} onBack={isDesktop ? p.onBack : undefined} height={isDesktop ? 336 : 220} t={t} shareTitle={pkg.name} />
        </div>

        {/* ═══ رأس الباقة — معلومات الرحلة بجانب الصور ═══ */}
        <div className="ts-panel ts-p-head" style={{ background: C.white, padding: `16px ${SPACE.page}px ${SPACE.section}px` }}>
          <h1 style={{ ...T.h1, color: C.ink, margin: 0 }}>{pkg.name}</h1>
          <div style={{ ...T.body, color: C.ink2, marginTop: 6 }}>
            {pkg.destination} · {pkg.audience}
          </div>
          <div style={{ ...T.body, color: C.ink, marginTop: 4 }}>
            {/* التصريف من دالّة لا من قالب: «{n} {t("nights")}» كانت تُخرج
                «1 ليالٍ». العدد داخلٌ في الصيغة للواحد والاثنين. */}
            {durationLabel(pkg.days, pkg.nights, p.lang)}
            {trip && <> · {seatsLabel(availSeats(trip), t)}</>}
          </div>

          {hotel && bookingMode === "full" && (
            <div className="flex items-center gap-2" style={{ marginTop: 10 }}>
              <Stars n={hotel.stars} size={14} />
              <span style={{ ...T.meta, color: C.ink }}>{hotelDisplayName(hotel.name)}</span>
              <span style={{ color: C.ink3 }}>·</span>
              <span style={{ ...T.meta, color: C.ink2 }}>
                <span style={LTR}>{hotel.distanceM}</span> {t("meters")} {t("fromHaram")}
              </span>
            </div>
          )}

          {/* الشريحة تعرض أول سياسة فعلية للباقة لا شعاراً ثابتاً: باقة
              بلا سياسات لا تعرض شيئاً بدل أن تَعِد بما لم يُسجَّل. */}
          {firstPolicy && (
            <div style={{ marginTop: 14 }}>
              <Chip tone="fill">✓ {firstPolicy}</Chip>
            </div>
          )}

          {/* ── حقائق سريعة ──
              تشغل المساحة التي كانت فراغاً بجانب الصور على الديسكتوب.
              مخفيّة على الجوال: هناك الصفحة سرديّة وهذه المعلومات تتكرّر
              في أقسامها، فتزيد طولاً بلا فائدة. */}
          <div className="ts-facts ts-only-desktop">
            {[
              { Icon: CalendarDays, k: t("nextTrip"), v: trips[0] ? formatDate(trips[0].departureDate, p.lang) : "—" },
              { Icon: Users,        k: t("people"),   v: `${persons} ${t("person")}` },
              { Icon: BusFront,     k: t("transport"), v: transport?.vehicleType ?? "—" },
              { Icon: Building2,    k: t("stay"),      v: hotel && bookingMode === "full" ? hotelDisplayName(hotel.name) : "—" },
            ].map(({ Icon, k, v }) => (
              <div key={k} className="ts-fact">
                <Icon size={15} aria-hidden />
                <span className="min-w-0"><small>{k}</small><b title={v}>{v}</b></span>
              </div>
            ))}
          </div>
        </div>

        {/* ═══ الحجز — التاريخ والعدد خليّتان جنباً إلى جنب ═══ */}
        <section className="ts-panel ts-p-book" style={{ background: C.bandAction, paddingInline: SPACE.page, paddingBlock: SPACE.section }}>
          <div className="flex items-center gap-2.5" style={{ marginBottom: 16 }}>
            <TitleAccent />
            <h2 style={{ ...T.h2, color: C.ink, margin: 0 }}>{t("bookYourTrip")}</h2>
          </div>
          {transportOnly && (
            <div className="grid grid-cols-2" style={{ gap: 10, marginBottom: 14 }}>
              {(["full", "transport"] as const).map(mode => {
                const on = bookingMode === mode;
                const transportMode = mode === "transport";
                return <button key={mode} onClick={() => p.setBookingMode(mode)}
                  style={{ padding: 12, borderRadius: R.card, cursor: "pointer", textAlign: "start",
                    border: `${on ? 2 : 1}px solid ${on ? C.green : C.border}`,
                    background: on ? C.greenTint : C.white, color: C.ink, fontFamily: "inherit" }}>
                  <span style={{ ...T.body, fontWeight: 600, display: "block" }}>{transportMode ? "🚌 مواصلات فقط" : "الباقة الكاملة"}</span>
                  <span style={{ ...T.small, color: C.ink2, display: "block", marginTop: 3 }}>
                    {transportMode ? `${money(pkg.transportOnlyPrice ?? 0)} ${t("currency")} للفرد` : "يشمل السكن"}
                  </span>
                </button>;
              })}
            </div>
          )}

          <div className="ts-book-grid">
            <div className={`ts-book-cell${!dateDone ? " ts-book-active" : ""}`}>
              {!dateDone && <div className="ts-book-cell-title">{t("chooseTrip")}</div>}
              {dateBody}
            </div>
            <div className={`ts-book-cell${dateDone && !peopleDone ? " ts-book-active" : ""}`}>
              {!peopleDone && <div className="ts-book-cell-title">{t("people")}</div>}
              {peopleBody}
            </div>
            {roomBody && (
              <div className={`ts-book-cell ts-book-room${peopleDone && !roomDone ? " ts-book-active" : ""}`}>
                {!roomDone && <div className="ts-book-cell-title">{t("roomSplitTitle")}</div>}
                {roomBody}
              </div>
            )}
          </div>
        </section>

        {/* ═══ ملخّص الحجز ═══
            عمودٌ لاصق بجانب الحجز على الديسكتوب: السعر والخطوة التالية
            مرئيان بلا شريطٍ يأكل مئتي بكسل من أسفل الشاشة. وعلى الجوال
            يبقى الشريط الثابت (StickyBar) وحده. */}
        <aside className="ts-panel ts-p-aside ts-only-desktop" aria-label={t("bookingSummary")}>
          <div className="ts-aside-card">
            <div className="ts-aside-head">{t("bookingSummary")}</div>
            <div className="ts-aside-rows">
              {/* صفّ السكن يسقط في وضع «مواصلات فقط»: لا سكن فيه، وسطرٌ
                  قيمته «—» يُقرأ نقصاً في البيانات لا خياراً مختلفاً. */}
              {([
                [t("chooseTrip"), trip ? formatDate(trip.departureDate, p.lang, true) : "—"],
                [t("people"), `${persons} ${t("person")}`],
                ...(bookingMode === "transport" ? [] : [[t("roomSplitTitle"), split ? splitSummary(split, t) : "—"]]),
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} className="ts-aside-row"><span>{k}</span><b>{v}</b></div>
              ))}
            </div>
            <div className="ts-aside-total">
              <span>{t("total")}</span>
              <b style={LTR}>{(bookingMode === "transport" || split) ? `${money(total)} ${t("currency")}` : "—"}</b>
            </div>
            <CTAButton full disabled={!ready} onClick={p.onNext}>{t("next")}</CTAButton>
            {/* ما ينقص يُقال بنصّه: زرٌّ رماديّ بلا سبب يُقرأ عطلاً. */}
            {missing && <div className="ts-aside-missing">{missing}</div>}
            {ready && firstPolicy && (
              <div style={{ marginTop: 10, textAlign: "center" }}><Chip tone="fill">✓ {firstPolicy}</Chip></div>
            )}
          </div>
        </aside>

        {/* فاصل التفاصيل: على الديسكتوب عنوان ثابت لشبكة 2×2، وعلى الجوال
            يبقى الزرّ الذي يفتح التفاصيل عند الحاجة. */}
        <div className="ts-panel ts-p-toggle" style={{background:C.white,padding:`16px ${SPACE.page}px`}}>
          <OutlineButton full onClick={() => { if (!isDesktop) setDetailsOpen(open => !open); }}>
            {isDesktop ? "تفاصيل الرحلة" : detailsOpen ? "إخفاء تفاصيل الرحلة" : "عرض تفاصيل البرنامج والفندق والنقل"}
          </OutlineButton>
        </div>

        {/* ═══ الأقسام المعلوماتية ═══ */}
        {info.map((s, i) => (
          <div key={s.key} className={`ts-panel ts-p-${s.key}${detailsOpen ? "" : " ts-info-collapsed"}`}>
            <Section title={s.title} bleed={s.bleed} tone={(i % 2 === 0 ? "white" : "sand") as Tone}>
              {s.body}
            </Section>
          </div>
        ))}
      </div>

      {/* ═══ الشريط الثابت ═══ */}
      <StickyBar
        price={(bookingMode === "transport" || split) ? `${money(total)} ${t("currency")}` : undefined}
        note={
          bookingMode === "transport"
            ? `مواصلات فقط · ${persons} ${t("person")} · ${money(pkg.transportOnlyPrice ?? 0)} ${t("currency")} للفرد`
            : split
            ? `${splitHeadline(split, t)} · ${t("forNights").replace("{n}", String(nights))}${trip ? ` · ${formatDate(trip.departureDate, p.lang)}` : ""}`
            : missing ?? undefined
        }
        chip={ready && firstPolicy ? <Chip tone="fill">✓ {firstPolicy}</Chip> : undefined}
        cta={t("next")}
        ctaDisabled={!ready}
        onCta={p.onNext}
      />

      {/* ورقة كل المميزات */}
      {/* «ما تشمله الباقة» من مميزات الباقة وحدها.

          قبله كانت الورقة تضمّ مميزات الفندق والمواصلة أيضاً، فباقةٌ بلا
          مميزات مسجّلة تعرض قائمةً كاملة يظنّها المستفيد وعداً منها —
          وهي في الحقيقة مرافق فندقٍ قد تتغيّر، أو تجهيزات حافلةٍ قد
          تُستبدل قبل الرحلة. مميزات الفندق والمواصلة تبقى معروضة في
          قسميهما موصولةً بمصدرها، لا مذابةً في وعد الباقة. */}
      <Sheet open={amenitiesOpen} onClose={() => setAmenitiesOpen(false)} title={t("whatOffers")}>
        {features.map(f => (
          <AmenityRow key={f.id} icon={featureIcon(f.text, f.icon)} text={f.text} />
        ))}
      </Sheet>

      {/* ورقة تفاصيل نوع السكن — الصور والمعلومات بلا كلفة ارتفاع على القائمة */}
      <Sheet
        open={!!roomSheet}
        onClose={() => setRoomSheet(null)}
        title={roomSheet?.type ?? ""}
        footer={roomSheet && sheetPick && (
          // الاختيار يقع هنا لا في القائمة: البطاقة تعرّف، والورقة تقرّر
          <CTAButton full onClick={() => { p.setSplit(sheetPick); setRoomSheet(null); setEditRoom(false); }}>
            {t("selectThisRoom")}
          </CTAButton>
        )}>
        {roomSheet && sheetPick && (
          <div className="flex flex-col gap-4">
            {/* بلا onOpen — وإلا فُتحت ورقة فوق ورقة.
                الغرف مرتّبة تنازلياً بالسعة، فالأولى أكبرها وصورتها أدلّ. */}
            <MediaGallery items={roomMedia(sheetPick.rooms[0])} height={220}
              layout={isDesktop ? "triplet" : undefined} />

            <div>
              <div style={{ ...T.h3, color: C.ink }}>
                {splitHeadline(sheetPick, t)} · {splitDetail(sheetPick, t)}
              </div>
              {hotel && (
                <div className="flex items-center gap-2" style={{ marginTop: 6 }}>
                  <Stars n={hotel.stars} size={13} />
                  <span style={{ ...T.meta, color: C.ink }}>{hotelDisplayName(hotel.name)}</span>
                  <span style={{ color: C.ink3 }}>·</span>
                  <span style={{ ...T.meta, color: C.ink2 }}>
                    <span style={LTR}>{hotel.distanceM}</span> {t("meters")} {t("fromHaram")}
                  </span>
                </div>
              )}
            </div>

            {/* منتقي التوزيع — القرار الثاني بعد النوع: كم غرفة وكيف.
                يظهر عند وجود بديل فعلاً؛ خيار واحد لا يُنتقى منه. */}
            {roomSheet.opts.length > 1 && (
              <div className="flex flex-col" style={{ gap: 10 }}>
                <div style={{ ...T.small, fontWeight: 600, color: C.ink2 }}>{t("roomSplitTitle")}</div>
                {roomSheet.opts.map(o => (
                  <SplitRow key={o.key} split={o} nights={nights} t={t}
                    picked={sheetPick.key === o.key} onPick={() => setSheetPick(o)} />
                ))}
              </div>
            )}

            {/* تفصيل السعر غرفةً غرفة: الجدول القديم كان ثلاثة صفوف عن فئة
                واحدة، ولا معنى له لتوزيع كـ«غرفة 3 + غرفة 2» بسعرين. */}
            <div style={{ border: `1px solid ${C.border}`, borderRadius: R.card, overflow: "hidden" }}>
              {sheetPick.rooms.map((r, n) => (
                <div key={n} className="flex items-center justify-between"
                  style={{ padding: "12px 14px", borderTop: n ? `1px solid ${C.line}` : "none" }}>
                  <span style={{ ...T.meta, color: C.ink2 }}>
                    {t("roomWord")} {n + 1} · {bedsCount(r.persons, t)}
                  </span>
                  <span style={{ ...T.body, fontWeight: 600, color: C.ink, ...LTR }}>
                    {money(r.perNight * r.persons * nights)} {t("currency")}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between"
                style={{ padding: "12px 14px", borderTop: `1px solid ${C.line}`, background: C.bandAction }}>
                <span style={{ ...T.meta, color: C.ink2 }}>
                  {t("total")} · {t("forNights").replace("{n}", String(nights))}
                </span>
                <span style={{ ...T.body, fontWeight: 600, color: C.ink, ...LTR }}>
                  {money(splitTotal(sheetPick, nights))} {t("currency")}
                </span>
              </div>
            </div>

            {hotel?.features?.length ? (
              <div className="flex flex-wrap gap-2">
                {hotel.features.map(f => <Chip key={f.id}>{f.text}</Chip>)}
              </div>
            ) : null}
          </div>
        )}
      </Sheet>

      {/* نافذة صور الفندق/النقل: صورة واحدة مضبوطة النسبة ثم مصغّرات.
          عرض كل الصور عمودياً كان يكبّر صورة المبنى حتى تخرج من مجال النظر. */}
      <Sheet open={!!full} onClose={() => setFull(null)} title={t("viewPhotos")}>
        {full && (
          <div className="flex flex-col" style={{ gap: 12 }}>
            {full.items[full.i]?.kind === "video" ? (
              <video src={full.items[full.i].url} poster={full.items[full.i].poster} controls preload="none" playsInline
                style={{ width: "100%", height: "min(60vh, 560px)", objectFit: "contain", borderRadius: R.card, background: C.fill }} />
            ) : (
              <div style={{ height: "min(60vh, 560px)", borderRadius: R.card, overflow: "hidden", background: C.fill }}>
                <img src={full.items[full.i]?.url} alt="" loading="eager"
                  style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
              </div>
            )}

            {full.items.length > 1 && (
              <div className="flex overflow-x-auto" style={{ gap: 8, scrollbarWidth: "none", paddingBlock: 2 }}>
                {full.items.map((m, n) => (
                  <button key={n} type="button" onClick={() => setFull(current => current ? { ...current, i: n } : null)}
                    aria-label={`${t("viewPhotos")} ${n + 1}`}
                    style={{ width: 68, height: 52, flexShrink: 0, overflow: "hidden", padding: 0, borderRadius: R.button,
                      border: `${n === full.i ? 2 : 1}px solid ${n === full.i ? C.green : C.border}`,
                      background: C.fill, cursor: "pointer" }}>
                    <img src={m.kind === "video" ? (m.poster ?? "") : m.url} alt="" loading="lazy"
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </Sheet>

      {/* ورقة كل التقييمات */}
      <Sheet open={reviewsOpen} onClose={() => setReviewsOpen(false)} title={t("guestReviews")}>
        <div className="flex flex-col gap-6">
          {reviews.map(rv => (
            <div key={rv.id}>
              <div className="flex items-center gap-2.5">
                <span style={{ width: 40, height: 40, borderRadius: R.pill, background: C.greenTint, color: C.green, display: "flex", alignItems: "center", justifyContent: "center", ...T.body, fontWeight: 600, flexShrink: 0 }}>
                  {rv.name.trim().charAt(0)}
                </span>
                <span className="truncate" style={{ ...T.body, fontWeight: 500, color: C.ink }}>{rv.name}</span>
                {reviewRating(rv.rating)!==null && (
                  <span style={{ marginInlineStart: "auto", ...T.small, fontWeight: 600, color: C.green,
                    background: C.greenTint, borderRadius: R.button, padding: "3px 7px", direction: "ltr", flexShrink: 0 }}>
                    ⭐ {reviewRating(rv.rating)!.toFixed(1).replace(/\.0$/,"")}/5
                  </span>
                )}
              </div>
              <div style={{ ...T.body, color: C.ink, marginTop: 10 }}>{rv.text}</div>
              {rv.image && <img src={rv.image} alt={`صورة مرفقة مع رأي ${rv.name}`} style={{width:"100%",maxHeight:220,objectFit:"cover",borderRadius:R.button,marginTop:10}}/>}
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
