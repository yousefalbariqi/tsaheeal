/* شاشة الاستكشاف — رأس أبيض بالشعار واللغة، بنر تعريفي مضغوط، ثم شريط باقات أفقي.
   لا مربع بحث: الباقات قليلة ومعدودة، والبحث يشغل مساحة الشاشة الأولى بلا مقابل.
   الباقات في صف أفقي واحد بعرض بطاقة يترك طرف البطاقة التالية ظاهراً — إشارة السحب. */
import { useMemo } from "react";
import type { Pkg, Trip, Hotel } from "@/types";
import { TasaheelMark } from "@/components/TasaheelMark";
import { C, T, R, SPACE, STICKY_H, MOTION, money } from "../ui/tokens";
import { ListingCard, LangSwitch, HScroll } from "../ui/kit";
import { pkgCover } from "../gallery";
import { LANGS, type Lang } from "../i18n";

export interface ExploreProps {
  packages: Pkg[];
  hotels: Hotel[];
  tripsOf: (p: Pkg) => Trip[];
  onOpen: (p: Pkg) => void;
  onCustom: () => void;
  t: (k: string) => string;
  lang: Lang;
  setLang: (l: Lang) => void;
}

/** أقل سعر إجمالي للفرد في الباقة — نفس حساب الشاشة القديمة. */
function minTotal(p: Pkg): number {
  const nightly = p.roomPrices.map(r => r.perNight).filter(Boolean);
  return nightly.length ? Math.min(...nightly) * (p.nights || 1) : p.marketPrice;
}

/** عرض البطاقة: يترك ~٥٠px من التالية ظاهرة على شاشة الجوال. */
const CARD_W = "min(300px, 78vw)";

export function Explore({ packages, hotels, tripsOf, onOpen, onCustom, t, lang, setLang }: ExploreProps) {
  /** المدن المغطّاة فعلياً — مشتقّة من الباقات، لا ادعاء. */
  const cities = useMemo(
    () => [...new Set(packages.flatMap(p => p.destination.split(" و")))],
    [packages],
  );

  /* نقاط ثقة سريعة أسفل الاسم — نصوصها في i18n لتُعدَّل بلا لمس الكود،
     وشريحة المدن مشتقّة من الباقات الفعلية. */
  const trust = useMemo(() => [
    { icon: "🇸🇦", text: t("trustSaudi") },
    ...(cities.length ? [{ icon: "🕋", text: cities.join(" و") }] : []),
    { icon: "⭐", text: t("trustExp") },
    { icon: "🤝", text: t("trustTrusted") },
  ], [cities, t]);

  /* المتاحة أولاً: البطاقة الأولى في الشريط يجب أن تكون قابلة للحجز. */
  const ordered = useMemo(
    () => [...packages].sort((a, b) => (tripsOf(a).length ? 0 : 1) - (tripsOf(b).length ? 0 : 1)),
    [packages, tripsOf],
  );

  /* شريط أفقي لكل وجهة — وإن كانت وجهة واحدة فهو صف أفقي واحد لكل الباقات. */
  const groups = useMemo(() => {
    const dests = [...new Set(ordered.map(p => p.destination))];
    return dests.map(d => ({ dest: d, items: ordered.filter(p => p.destination === d) }))
      .filter(g => g.items.length > 0);
  }, [ordered]);

  const card = (p: Pkg, i: number) => {
    const hotel = hotels.find(h => h.id === p.hotelId);
    const trips = tripsOf(p);

    /* الحقائق التي تتناوب تحت العنوان — كلها من بيانات موجودة، بلا اختلاق. */
    const facts: string[] = [];
    if (hotel) facts.push(`${hotel.city} · ${hotel.distanceM} ${t("meters")} ${t("fromHaram")}`);
    p.features?.slice(0, 2).forEach(f => facts.push(f.text));
    facts.push(`${p.days} ${t("days")} · ${p.nights} ${t("nights")}`);
    const review = p.reviews?.find(r => r.consent);
    if (review) facts.push(`“${review.text.slice(0, 40)}${review.text.length > 40 ? "…" : ""}”`);

    return (
      <ListingCard
        key={p.id}
        width={CARD_W}
        imageAspect="4 / 3"
        image={pkgCover(p)}
        title={p.name}
        stars={hotel?.stars}
        facts={facts}
        factsDelay={i * MOTION.stagger}
        price={`${money(minTotal(p))} ${t("currency")}`}
        priceNote={t("forNights").replace("{n}", String(p.nights))}
        badge={trips.length === 0 ? t("soldOut") : p.order === 1 ? t("mostWanted") : undefined}
        disabled={trips.length === 0}
        pulse
        onClick={() => onOpen(p)}
      />
    );
  };

  return (
    <div className="flex flex-col flex-1" style={{ background: C.white, paddingBottom: STICKY_H }}>
      {/* ── الرأس: الشعار هو العنصر الرئيسي + اللغة، بلا صورة ولا بنر ── */}
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: C.white }}>
        <div className="flex items-center justify-between gap-3" style={{ padding: `10px ${SPACE.page}px 8px` }}>
          <div className="flex items-center gap-2.5 min-w-0">
            <TasaheelMark size={52} />
            <span className="truncate" style={{ fontFamily: "'Noto Kufi Arabic',serif", fontSize: 20, fontWeight: 800, color: C.ink }}>
              {t("brand")}
            </span>
          </div>
          <LangSwitch lang={lang} setLang={setLang} langs={LANGS} label={t("language")} />
        </div>
      </div>

      {/* ── سطر تعريفي قصير + نقاط ثقة سريعة — بديل البنر ── */}
      <section style={{ paddingInline: SPACE.page, paddingBottom: 4 }}>
        <p style={{ ...T.meta, color: C.ink2, margin: 0 }}>{t("tagline")}</p>
        <div className="flex flex-wrap gap-1.5" style={{ marginTop: 10 }}>
          {trust.map(x => (
            <span key={x.text} className="inline-flex items-center gap-1.5"
              style={{ ...T.small, color: C.ink, background: C.band, border: `1px solid ${C.line}`, borderRadius: R.pill, paddingInline: 10, height: 28 }}>
              <span style={{ fontSize: 13, lineHeight: 1 }}>{x.icon}</span>{x.text}
            </span>
          ))}
        </div>
      </section>

      {/* ── الباقات: شريط أفقي (لكل وجهة شريط) ── */}
      <div className="flex-1">
        {groups.length === 0 ? (
          <div style={{ padding: `64px ${SPACE.page}px`, textAlign: "center", ...T.body, color: C.ink2 }}>
            {t("noPackages")}
          </div>
        ) : groups.map((g, gi) => (
          <section key={g.dest} style={{ paddingTop: 18, paddingBottom: 6 }}>
            <h2 style={{ ...T.h2, fontSize: 20, color: C.ink, margin: "0 0 12px", paddingInline: SPACE.page }}>
              {groups.length === 1 ? t("choosePackage") : t("packagesIn").replace("{city}", g.dest)}
            </h2>
            <HScroll>
              {g.items.map((p, i) => card(p, gi * 3 + i))}
            </HScroll>
          </section>
        ))}

        {/* ── الباقة المخصّصة — مسار مختلف: طلب يجهّزه الفريق، لا حجز فوري ── */}
        <section style={{ paddingInline: SPACE.page, paddingTop: 8, paddingBottom: 20 }}>
          <button onClick={onCustom}
            className="w-full flex items-center gap-3 text-start"
            style={{ background: C.band, border: `1px dashed ${C.green}`, borderRadius: R.sheet, padding: 16, cursor: "pointer" }}>
            <span style={{ fontSize: 26, lineHeight: 1 }}>✨</span>
            <span className="flex-1 min-w-0">
              <span className="block" style={{ ...T.h3, color: C.ink }}>{t("customPkg")}</span>
              <span className="block" style={{ ...T.meta, color: C.ink2 }}>{t("customLead")}</span>
            </span>
            <span style={{ ...T.small, color: C.green, fontWeight: 700, flexShrink: 0 }}>{t("customCta")}</span>
          </button>
        </section>
      </div>
    </div>
  );
}

/** يُصدَّر لإعادة استخدامه في شاشة المراجعة. */
export { minTotal };
