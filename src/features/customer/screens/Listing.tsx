/* صفحة الباقة — صفحة واحدة تنزل فيها، تدمج شاشات trip + seat + room القديمة.

   الترتيب: الحجز أولاً ثم المعلومات. الأقسام كانت من نوعين مختلطين
   (قرار ومعلومة) فبدت كلها متساوية الأهمية؛ الآن أقسام الحجز الأربعة
   كتلة واحدة مرقّمة، والمعلوماتية أشرطة متناوبة اللون تحتها. */
import { useMemo, useState, type ReactNode } from "react";
import {
  Wifi, Tv, BatteryCharging, Utensils, UserCheck, BusFront, MapPin, Building2,
  CalendarX, KeyRound, ShieldCheck, Star, BedDouble, ChevronLeft,
} from "lucide-react";
import type { Pkg, Trip, Hotel, Transport, PkgFeature } from "@/types";
import {
  roomSplits, splitTotal, splitSummary, splitHeadline, splitDetail, bedsCount,
  type RoomSplit,
} from "../roomSplit";
import { C, T, R, SPACE, STICKY_H, LTR, flipRTL, money, formatDate } from "../ui/tokens";
import {
  Section, HeroGallery, StickyBar, Chip, Stars, AmenityRow, AccordionRow, StepRow,
  GrayButton, OutlineButton, Sheet, Counter, TripCalendar, HScroll, TitleAccent,
  MediaGallery, CTAButton, useDir, type Tone,
} from "../ui/kit";
import {
  pkgGallery, hotelMedia, roomMedia, transportMedia, type Media,
} from "../gallery";
import { availSeats } from "../data";
import { ReviewsSection } from "../ui/ReviewsSection";

/* المستفيد يحتاج إشارة وفرة لا جرداً: «متبقٍ 99 مقعداً» رقم لا يقرّر به
   شيئاً (وفي وضع التجربة هو 99 ثابتاً). فوق العتبة نعرض «+6 متاح»، وتحتها
   العدد الحقيقي لأنه حينها يعني شحّاً فعلياً. */
const SEATS_CAP = 6;
const seatsLabel = (n: number, t: (k: string) => string) =>
  n > SEATS_CAP
    ? t("seatsPlenty").replace("{n}", String(SEATS_CAP))
    : t("seatsLeftShort").replace("{n}", String(n));

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
  /* الغرف مرتّبة تنازلياً بالسعة، فأولى أوّل توزيع أكبرها وصورتها أدلّ. */
  const thumb = roomMedia(opts[0].rooms[0])[0];
  const cheapest = Math.min(...opts.map(o => splitTotal(o, nights)));
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
          {Array.from({ length: Math.min(opts[0].rooms[0].persons, 4) }, (_, b) => (
            <BedDouble key={b} size={15} style={{ color: selected ? C.greenDeep : C.ink2 }} />
          ))}
          {opts.length > 1 && (
            <span style={{ ...T.small, fontWeight: 400, color: C.ink2, marginInlineStart: 6 }}>
              {t("splitOptionsN").replace("{n}", String(opts.length))}
            </span>
          )}
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

export function Listing(p: ListingProps) {
  const { pkg, trips, calendarTrips, hotel, transport, trip, split, persons, total, t } = p;

  const [amenitiesOpen, setAmenitiesOpen] = useState(false);
  const [reviewsOpen, setReviewsOpen] = useState(false);
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

  /* توزيعات السكن الممكنة لهذا العدد — تُشتق من شرائح الباقة لا تُكتب يدوياً،
     فباقة بلا شريحة سعة 3 لا تعرض «غرفة لثلاثة» أصلاً. */
  const options = useMemo(() => roomSplits(pkg.roomPrices, persons), [pkg.roomPrices, persons]);
  /* البطاقات مجمّعة بالنوع: «سكن مشترك» و«غرفة خاصة» قراران مختلفان،
     وخلطهما في قائمة واحدة يجعل فرق السعر يبدو تعسّفياً. */
  const groups = useMemo(() => {
    const m = new Map<string, RoomSplit[]>();
    for (const o of options) { const g = m.get(o.type); if (g) g.push(o); else m.set(o.type, [o]); }
    return [...m];
  }, [options]);

  /* المقاعد انتقلت لشاشة مستقلة بعد بيانات المعتمرين — لكل معتمر مقعده بالاسم. */
  /* السعة تُفحص هنا أيضاً لا في الحارس وحده: الحارس أثر جانبي يعمل بعد
     الرسم، وبين تغيّر العدد وتنفيذه إطارٌ كان الشريط الثابت فيه مفعَّلاً. */
  const ready = !!trip && !!split && split.capacity >= persons;

  /** الخطوة المفتوحة حالياً — واحدة فقط، ولا تنتقل إلا بزرّ صريح. */
  const [openStep, setOpenStep] = useState<string>("date");

  /* الشهر المعروض في التقويم — هنا لا داخل TripCalendar: خطوة الأكورديون
     تفكّ تركيب أبنائها عند الطيّ، فكانت العودة إليها تعيد التقويم إلى شهر
     أول رحلة ولو كان المستفيد قد تصفّح إلى ما بعده. */
  const [calMonth, setCalMonth] = useState<{ y: number; m: number } | undefined>();

  /** اليوم مطروح لكنه لا يُحجز — التقويم يرسمه مشطوباً بدل إخفائه. */
  const tripFull = (tr: Trip) => tr.status !== "open" || availSeats(tr) <= 0;

  const AMENITY_PREVIEW = 6;
  const features: PkgFeature[] = pkg.features ?? [];
  const reviews = pkg.reviews?.filter(r => r.consent) ?? [];

  /** ما ينقص الحجز — يُعرض في الشريط الثابت بدل تعطيل صامت. */
  const missing = !trip ? t("chooseTrip")
    : options.length === 0 ? t("noRoomFit")
    : !split ? t("chooseRoom")
    : null;

  /** نص بديل للخطوة المقفلة — أوضح من إخفائها، لأن إخفاءها يغيّر عدد الخطوات. */
  const locked = (
    <div style={{ ...T.meta, color: C.ink3 }}>{t("pickDateFirst")}</div>
  );

  /* ── خطوات الحجز: تاريخ ← عدد ← سكن. المقاعد بعد بيانات المعتمرين.
        الترقيم يُشتق من الموضع، والخطوة المنتهية تُطوى إلى سطر واحد. ── */
  const steps: { key: string; title: string; done: boolean; value?: string; locked?: boolean; body: ReactNode }[] = [
    {
      key: "date", title: t("chooseTrip"), done: !!trip,
      value: trip ? formatDate(trip.departureDate, p.lang, true) : undefined,
      body: trips.length === 0
        ? <div style={{ ...T.body, color: C.ink2 }}>{t("noTrips")}</div>
        : (
          /* التقويم يبقى مفتوحاً بعد الضغط، والانتقال بزرّ تأكيد صريح:
             الطيّ الفوري كان يقفز بالتخطيط قبل أن يرى المستفيد أثر ضغطته،
             فيبقى غير واثق أنه اختار تاريخاً أصلاً. */
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

            {/* سطر تأكيد نصّي — أثر الضغطة مقروءاً لا لوناً وحده */}
            {trip && (
              <div style={{ ...T.meta, color: C.ink, marginTop: 12, fontWeight: 600 }}>
                {formatDate(trip.departureDate, p.lang, true)}
                {" · "}
                <span style={{ fontWeight: 400, color: C.ink2 }}>
                  {seatsLabel(availSeats(trip), t)}
                </span>
              </div>
            )}

            <div style={{ marginTop: 14 }}>
              <CTAButton full disabled={!trip} onClick={() => setOpenStep("people")}>
                {t("confirmDate")}
              </CTAButton>
            </div>
          </>
        ),
    },
    {
      key: "people", title: t("people"), done: !!trip, locked: !trip,
      value: trip ? `${persons} ${t("person")}` : undefined,
      body: trip
        ? (
          <>
            <Counter
              label={t("person")} note={seatsLabel(availSeats(trip), t)}
              value={persons} min={1} max={availSeats(trip)} onChange={p.setPersons}
            />
            <div style={{ marginTop: 14 }}>
              <CTAButton full onClick={() => setOpenStep(options.length ? "room" : "people")}>
                {t("next")}
              </CTAButton>
            </div>
          </>
        )
        : locked,
    },
    ...(pkg.roomPrices?.length ? [{
      key: "room", title: t("roomSplitTitle"), done: !!split, locked: !trip,
      value: split ? splitSummary(split, t) : undefined,
      body: options.length === 0
        ? (
          /* لا توزيع يناسب العدد — رسالة صريحة لا خطوة فارغة، لأن الخطوة
             الفارغة تُقرأ عطلاً في التطبيق لا حدّاً في بيانات الباقة. */
          <div className="flex flex-col" style={{ gap: 6 }}>
            <div style={{ ...T.body, color: C.ink }}>{t("noRoomFit")}</div>
            <div style={{ ...T.meta, color: C.ink2 }}>{t("noRoomFitHint")}</div>
          </div>
        )
        : (
          <div className="flex flex-col" style={{ gap: 10 }}>
            {/* بطاقة لكل نوع لا لكل توزيع — الاسم صار داخل البطاقة فلا
                حاجة لعنوان مجموعة فوقها. */}
            {groups.map(([type, opts]) => (
              <RoomTypeCard
                key={type} type={type} opts={opts} nights={nights} t={t}
                selected={split?.type === type}
                onOpen={() => openRoomType(type, opts)}
              />
            ))}
          </div>
        ),
    }] : []),
  ];

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

  if (hotel) info.push({
    key: "stay", title: t("stay"),
    body: (
      <div>
        <MediaGallery items={hotelPics} height={230} onOpen={i => setFull({ items: hotelPics, i })} />
        <div style={{ paddingTop: 16 }}>
          <div className="flex items-center gap-2">
            <span style={{ ...T.h3, color: C.ink }}>{hotel.name}</span>
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
    /* bleed حتى يتحكّم القسم بهوامشه: النقاط تُتوسَّط بعرض الصفحة كاملاً. */
    bleed: reviews.length > 0,
    body: reviews.length ? (
      <>
        <ReviewsSection reviews={reviews} t={t} onReadMore={() => setReviewsOpen(true)} />
        {reviews.length > 1 && (
          <div style={{ marginTop: 16, paddingInline: SPACE.page }}>
            <GrayButton full onClick={() => setReviewsOpen(true)}>{t("showAllReviews")}</GrayButton>
          </div>
        )}
      </>
    ) : (
      <div className="flex items-center gap-2" style={{ ...T.body, color: C.ink2 }}>
        <Star size={16} color={C.ink3} />{t("noReviews")}
      </div>
    ),
  });

  info.push({
    key: "know", title: t("thingsToKnow"),
    body: (
      <>
        <AccordionRow icon={<CalendarX size={20} />} title={t("cancelPolicy")}>
          {pkg.policies?.length ? pkg.policies.join("\n") : t("freeCancel")}
        </AccordionRow>
        {pkg.notes && (
          <AccordionRow icon={<KeyRound size={20} />} title={t("package")}>
            {pkg.notes}
          </AccordionRow>
        )}
        <AccordionRow icon={<ShieldCheck size={20} />} title={t("termsTitle")}>
          {p.terms}
        </AccordionRow>
      </>
    ),
  });

  return (
    <div className="flex flex-col flex-1" style={{ background: C.white }}>
      <div className="flex-1" style={{ paddingBottom: STICKY_H }}>

        {/* ═══ المعرض ═══ */}
        <HeroGallery images={images} onBack={p.onBack} />

        {/* ═══ بطاقة الرأس — تتداخل مع الصورة كما عندهم ═══ */}
        <div style={{
          background: C.white, borderTopLeftRadius: R.sheet, borderTopRightRadius: R.sheet,
          marginTop: -24, position: "relative", zIndex: 1,
          padding: `24px ${SPACE.page}px ${SPACE.section}px`,
        }}>
          <h1 style={{ ...T.h1, color: C.ink, margin: 0 }}>{pkg.name}</h1>
          <div style={{ ...T.body, color: C.ink2, marginTop: 6 }}>
            {pkg.destination} · {pkg.audience}
          </div>
          <div style={{ ...T.body, color: C.ink, marginTop: 4 }}>
            <span style={LTR}>{pkg.days}</span> {t("days")} · <span style={LTR}>{pkg.nights}</span> {t("nights")}
            {trip && <> · {seatsLabel(availSeats(trip), t)}</>}
          </div>

          {hotel && (
            <div className="flex items-center gap-2" style={{ marginTop: 10 }}>
              <Stars n={hotel.stars} size={14} />
              <span style={{ ...T.meta, color: C.ink }}>{hotel.name}</span>
              <span style={{ color: C.ink3 }}>·</span>
              <span style={{ ...T.meta, color: C.ink2 }}>
                <span style={LTR}>{hotel.distanceM}</span> {t("meters")} {t("fromHaram")}
              </span>
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <Chip tone="fill">✓ {t("freeCancel")}</Chip>
          </div>
        </div>

        {/* ═══ كتلة الحجز — الخطوات الأربع تحت عنوان واحد ═══ */}
        <section style={{ background: C.bandAction, paddingInline: SPACE.page, paddingBlock: SPACE.section }}>
          <div className="flex items-center gap-2.5" style={{ marginBottom: 20 }}>
            <TitleAccent />
            <h2 style={{ ...T.h2, color: C.ink, margin: 0 }}>{t("bookYourTrip")}</h2>
          </div>
          {steps.map((s, i) => (
            <StepRow
              key={s.key} n={i + 1} title={s.title} done={s.done}
              last={i === steps.length - 1}
              open={openStep === s.key} value={s.value} locked={s.locked}
              onOpen={() => setOpenStep(s.key)}
            >
              {s.body}
            </StepRow>
          ))}
        </section>

        {/* ═══ الأقسام المعلوماتية — اللون يتناوب على الظاهر فعلاً ═══ */}
        {info.map((s, i) => (
          <Section key={s.key} title={s.title} bleed={s.bleed} tone={(i % 2 === 0 ? "white" : "sand") as Tone}>
            {s.body}
          </Section>
        ))}
      </div>

      {/* ═══ الشريط الثابت ═══ */}
      <StickyBar
        price={split ? `${money(total)} ${t("currency")}` : undefined}
        note={
          split
            ? `${splitHeadline(split, t)} · ${t("forNights").replace("{n}", String(nights))}${trip ? ` · ${formatDate(trip.departureDate, p.lang)}` : ""}`
            : missing ?? undefined
        }
        chip={ready ? <Chip tone="fill">✓ {t("freeCancel")}</Chip> : undefined}
        cta={t("next")}
        ctaDisabled={!ready}
        onCta={p.onNext}
      />

      {/* ورقة كل المميزات */}
      <Sheet open={amenitiesOpen} onClose={() => setAmenitiesOpen(false)} title={t("whatOffers")}>
        {features.map(f => (
          <AmenityRow key={f.id} icon={featureIcon(f.text, f.icon)} text={f.text} />
        ))}
        {hotel?.features?.map(f => (
          <AmenityRow key={`h-${f.id}`} icon={featureIcon(f.text, f.icon)} text={f.text} />
        ))}
        {transport?.features?.map(f => (
          <AmenityRow key={`tr-${f.id}`} icon={featureIcon(f.text, f.icon)} text={f.text} />
        ))}
      </Sheet>

      {/* ورقة تفاصيل نوع السكن — الصور والمعلومات بلا كلفة ارتفاع على القائمة */}
      <Sheet
        open={!!roomSheet}
        onClose={() => setRoomSheet(null)}
        title={roomSheet?.type ?? ""}
        footer={roomSheet && sheetPick && (
          // الاختيار يقع هنا لا في القائمة: البطاقة تعرّف، والورقة تقرّر
          <CTAButton full onClick={() => { p.setSplit(sheetPick); setRoomSheet(null); }}>
            {t("selectThisRoom")}
          </CTAButton>
        )}>
        {roomSheet && sheetPick && (
          <div className="flex flex-col gap-4">
            {/* بلا onOpen — وإلا فُتحت ورقة فوق ورقة.
                الغرف مرتّبة تنازلياً بالسعة، فالأولى أكبرها وصورتها أدلّ. */}
            <MediaGallery items={roomMedia(sheetPick.rooms[0])} height={220} />

            <div>
              <div style={{ ...T.h3, color: C.ink }}>
                {splitHeadline(sheetPick, t)} · {splitDetail(sheetPick, t)}
              </div>
              {hotel && (
                <div className="flex items-center gap-2" style={{ marginTop: 6 }}>
                  <Stars n={hotel.stars} size={13} />
                  <span style={{ ...T.meta, color: C.ink }}>{hotel.name}</span>
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

      {/* عرض كامل لأي معرض */}
      <Sheet open={!!full} onClose={() => setFull(null)} title={t("viewPhotos")}>
        {full && (
          <div className="flex flex-col gap-3">
            {full.items.map((m, n) => m.kind === "video" ? (
              <video key={n} src={m.url} poster={m.poster} controls preload="none" playsInline
                style={{ width: "100%", borderRadius: R.card, background: "#000" }} />
            ) : (
              <img key={n} src={m.url} alt="" loading="lazy"
                style={{ width: "100%", borderRadius: R.card, display: "block", background: C.fill }} />
            ))}
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
                {/* الدرجة هنا أيضاً — «اقرأ المزيد» يأتي من بطاقة تعرضها، فغيابها يبدو نقصاً */}
                {typeof rv.rating === "number" && (
                  <span style={{ marginInlineStart: "auto", ...T.small, fontWeight: 600, color: C.green,
                    background: C.greenTint, borderRadius: R.button, padding: "3px 7px", direction: "ltr", flexShrink: 0 }}>
                    {rv.rating.toFixed(1)}
                  </span>
                )}
              </div>
              <div style={{ ...T.body, color: C.ink, marginTop: 10 }}>{rv.text}</div>
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
