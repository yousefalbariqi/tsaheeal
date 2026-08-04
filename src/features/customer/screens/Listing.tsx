/* صفحة الباقة — صفحة واحدة تنزل فيها، تدمج شاشات trip + seat + room القديمة.

   الترتيب: الحجز أولاً ثم المعلومات. الأقسام كانت من نوعين مختلطين
   (قرار ومعلومة) فبدت كلها متساوية الأهمية؛ الآن أقسام الحجز الأربعة
   كتلة واحدة مرقّمة، والمعلوماتية أشرطة متناوبة اللون تحتها. */
import { useMemo, useState, type ReactNode } from "react";
import {
  Wifi, Tv, BatteryCharging, Utensils, UserCheck, BusFront, MapPin, Building2,
  CalendarX, KeyRound, ShieldCheck, Star,
} from "lucide-react";
import type { Pkg, Trip, Hotel, Transport, RoomPrice, PkgFeature } from "@/types";
import { C, T, R, SPACE, STICKY_H, LTR, money, formatDate } from "../ui/tokens";
import {
  Section, HeroGallery, StickyBar, Chip, Stars, AmenityRow, AccordionRow, StepRow,
  GrayButton, OutlineButton, Sheet, Counter, SelectRow, TripCalendar, HScroll, TitleAccent,
  MediaGallery, CTAButton, type Tone,
} from "../ui/kit";
import {
  pkgGallery, roomCover, hotelMedia, roomMedia, transportMedia, type Media,
} from "../gallery";

export interface ListingProps {
  pkg: Pkg;
  trips: Trip[];
  hotel?: Hotel;
  transport?: Transport;
  trip: Trip | null;      setTrip: (t: Trip | null) => void;
  persons: number;        setPersons: (n: number) => void;
  room: RoomPrice | null; setRoom: (r: RoomPrice) => void;
  total: number;
  onBack: () => void;
  onNext: () => void;
  terms: string;
  t: (k: string) => string;
  lang: string;
}

const availSeats = (tr: Trip) => Math.max(0, tr.seats - tr.bookedSeats);
const roomLabel = (r: RoomPrice) => r.type + (r.persons ? ` · ${r.persons} أفراد` : "");

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

export function Listing(p: ListingProps) {
  const { pkg, trips, hotel, transport, trip, room, persons, total, t } = p;

  const [amenitiesOpen, setAmenitiesOpen] = useState(false);
  const [reviewsOpen, setReviewsOpen] = useState(false);
  /** عرض كامل لأي معرض عند الضغط على صورته الرئيسية. */
  const [full, setFull] = useState<{ items: Media[]; i: number } | null>(null);
  /** ورقة تفاصيل نوع السكن — تحمل الصور والمعلومات بدل تمديد الصف. */
  const [roomSheet, setRoomSheet] = useState<RoomPrice | null>(null);

  const images = useMemo(() => pkgGallery(pkg, hotel, transport), [pkg, hotel, transport]);
  const hotelPics = useMemo(() => hotelMedia(hotel, pkg.order - 1), [hotel, pkg.order]);
  const transportPics = useMemo(() => transportMedia(transport), [transport]);
  const nights = pkg.nights || 1;
  /* المقاعد انتقلت لشاشة مستقلة بعد بيانات المعتمرين — لكل معتمر مقعده بالاسم. */
  const ready = !!trip && !!room;

  /** الخطوة المفتوحة حالياً — واحدة فقط، وتنتقل تلقائياً بعد كل اختيار. */
  const [openStep, setOpenStep] = useState<string>("date");

  const AMENITY_PREVIEW = 6;
  const features: PkgFeature[] = pkg.features ?? [];
  const reviews = pkg.reviews?.filter(r => r.consent) ?? [];

  /** ما ينقص الحجز — يُعرض في الشريط الثابت بدل تعطيل صامت. */
  const missing = !trip ? t("chooseTrip")
    : !room ? t("chooseRoom")
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
          <TripCalendar
            trips={trips} valueId={trip?.id}
            onPick={tr => { p.setTrip(tr); setOpenStep("people"); }}
            onClear={() => { p.setTrip(null); setOpenStep("date"); }}
            clearLabel={t("clearDate")}
          />
        ),
    },
    {
      key: "people", title: t("people"), done: !!trip, locked: !trip,
      value: trip ? `${persons} ${t("person")}` : undefined,
      body: trip
        ? (
          <>
            <Counter
              label={t("person")} note={`${t("seatsLeft")}: ${availSeats(trip)}`}
              value={persons} min={1} max={availSeats(trip)} onChange={p.setPersons}
            />
            <div style={{ marginTop: 14 }}>
              <CTAButton full onClick={() => setOpenStep(pkg.roomPrices?.length ? "room" : "people")}>
                {t("next")}
              </CTAButton>
            </div>
          </>
        )
        : locked,
    },
    ...(pkg.roomPrices?.length ? [{
      key: "room", title: t("chooseRoom"), done: !!room, locked: !trip,
      value: room ? roomLabel(room) : undefined,
      body: (
        /* الضغط على الصف يفتح التفاصيل فقط — الاختيار يتم من داخلها،
           فلا يعتمد المستفيد سكناً قبل أن يرى صوره وسعره ومسافته. */
        <div className="flex flex-col gap-3">
          {pkg.roomPrices.map(r => (
            <SelectRow
              key={r.id}
              image={roomCover(r)}
              detailsLabel={t("photosLabel")}
              detailsCount={roomMedia(r).length}
              title={r.type}
              note={`${r.persons} ${t("guests")}`}
              price={`${money(r.perNight * nights)} ${t("currency")}`}
              priceNote={t("perPerson")}
              selected={room?.id === r.id}
              onClick={() => setRoomSheet(r)}
              onDetails={() => setRoomSheet(r)}
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
    bleed: reviews.length > 0,
    body: reviews.length ? (
      <>
        <HScroll>
          {reviews.map(rv => (
            <div key={rv.id}
              style={{ width: 268, flexShrink: 0, scrollSnapAlign: "start", border: `1px solid ${C.border}`, borderRadius: R.card, padding: 16, background: C.white }}>
              <div className="flex items-center gap-2.5">
                <span style={{ width: 36, height: 36, borderRadius: R.pill, background: C.greenTint, color: C.green, display: "flex", alignItems: "center", justifyContent: "center", ...T.body, fontWeight: 600, flexShrink: 0 }}>
                  {rv.name.trim().charAt(0)}
                </span>
                <span style={{ ...T.body, fontWeight: 500, color: C.ink }}>{rv.name}</span>
              </div>
              <div style={{ ...T.meta, color: C.ink, marginTop: 12, display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                {rv.text}
              </div>
            </div>
          ))}
        </HScroll>
        <div style={{ marginTop: 16, paddingInline: SPACE.page }}>
          <GrayButton full onClick={() => setReviewsOpen(true)}>{t("showAllReviews")}</GrayButton>
        </div>
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
            {trip && <> · <span style={LTR}>{availSeats(trip)}</span> {t("seatsCount")}</>}
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
        price={room ? `${money(total)} ${t("currency")}` : undefined}
        note={
          room
            ? `${t("forNights").replace("{n}", String(nights))}${trip ? ` · ${formatDate(trip.departureDate, p.lang)}` : ""}`
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
        title={roomSheet ? roomLabel(roomSheet) : ""}
        footer={roomSheet && (
          // يُغلق الحلقة: من ضغط الصورة قاصداً الاختيار لا يعلق
          <CTAButton full onClick={() => { p.setRoom(roomSheet); setRoomSheet(null); }}>
            {t("selectThisRoom")}
          </CTAButton>
        )}>
        {roomSheet && (
          <div className="flex flex-col gap-4">
            {/* بلا onOpen — وإلا فُتحت ورقة فوق ورقة */}
            <MediaGallery items={roomMedia(roomSheet)} height={220} />

            <div>
              <div style={{ ...T.h3, color: C.ink }}>{roomLabel(roomSheet)}</div>
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

            <div style={{ border: `1px solid ${C.border}`, borderRadius: R.card, overflow: "hidden" }}>
              {([
                [t("perNight"), `${money(roomSheet.perNight)} ${t("currency")}`],
                [t("nights"), String(nights)],
                [t("perPerson"), `${money(roomSheet.perNight * nights)} ${t("currency")}`],
              ] as const).map(([label, value], n) => (
                <div key={label} className="flex items-center justify-between"
                  style={{ padding: "12px 14px", borderTop: n ? `1px solid ${C.line}` : "none" }}>
                  <span style={{ ...T.meta, color: C.ink2 }}>{label}</span>
                  <span style={{ ...T.body, fontWeight: 600, color: C.ink, ...LTR }}>{value}</span>
                </div>
              ))}
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
                <span style={{ ...T.body, fontWeight: 500, color: C.ink }}>{rv.name}</span>
              </div>
              <div style={{ ...T.body, color: C.ink, marginTop: 10 }}>{rv.text}</div>
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
