/* شاشة الاستكشاف — بحث، تعريف بالمؤسسة، ثم شبكة الباقات ٢×n.
   انحرافان مقصودان عن Airbnb: شبكة بدل التمرير الأفقي (٣ باقات فقط، فالتمرير
   يوحي بمزيد غير موجود)، وحدود مرئية للبطاقة لتوضيح منطقة اللمس. */
import { useMemo, useState } from "react";
import { Search, MapPin } from "lucide-react";
import type { Pkg, Trip, Hotel } from "@/types";
import { TasaheelMark } from "@/components/TasaheelMark";
import { C, T, R, SPACE, STICKY_H, FONT, MOTION, money } from "../ui/tokens";
import { ListingCard, LangSwitch } from "../ui/kit";
import { pkgCover } from "../gallery";
import { LANGS, type Lang } from "../i18n";

export interface ExploreProps {
  packages: Pkg[];
  hotels: Hotel[];
  tripsOf: (p: Pkg) => Trip[];
  onOpen: (p: Pkg) => void;
  t: (k: string) => string;
  lang: Lang;
  setLang: (l: Lang) => void;
}

/** أقل سعر إجمالي للفرد في الباقة — نفس حساب الشاشة القديمة. */
function minTotal(p: Pkg): number {
  const nightly = p.roomPrices.map(r => r.perNight).filter(Boolean);
  return nightly.length ? Math.min(...nightly) * (p.nights || 1) : p.marketPrice;
}

export function Explore({ packages, hotels, tripsOf, onOpen, t, lang, setLang }: ExploreProps) {
  const [query, setQuery] = useState("");

  const destinations = useMemo(
    () => [...new Set(packages.map(p => p.destination))],
    [packages],
  );

  const visible = useMemo(() => {
    const q = query.trim();
    if (!q) return packages;
    return packages.filter(p =>
      p.name.includes(q) || p.audience.includes(q) || p.destination.includes(q),
    );
  }, [packages, query]);

  /** قسم لكل وجهة بها باقات ظاهرة. */
  const groups = useMemo(
    () => destinations
      .map(d => ({ dest: d, items: visible.filter(p => p.destination === d) }))
      .filter(g => g.items.length > 0),
    [destinations, visible],
  );

  /** المدن المغطّاة فعلياً — مشتقّة من الباقات، لا ادعاء. */
  const cities = useMemo(
    () => [...new Set(packages.flatMap(p => p.destination.split(" و")))],
    [packages],
  );

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
        width="100%"
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
      {/* ── الرأس: بحث + اللغة ── */}
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: C.white, borderBottom: `1px solid ${C.line}` }}>
        <div className="flex items-center gap-2" style={{ padding: `12px ${SPACE.page}px` }}>
          <label className="flex items-center gap-2 flex-1"
            style={{ height: 48, paddingInline: 18, borderRadius: R.pill, border: `1px solid ${C.border}`, boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
            <Search size={17} color={C.ink} style={{ flexShrink: 0 }} />
            <input
              value={query} onChange={e => setQuery(e.target.value)} placeholder={t("search")}
              style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "none", fontFamily: FONT.sans, fontSize: 15, fontWeight: 500, color: C.ink }} />
          </label>
          <LangSwitch lang={lang} setLang={setLang} langs={LANGS} label={t("language")} />
        </div>
      </div>

      {/* ── التعريف بالمؤسسة — نص فقط، بلا أرقام لا نملك مصدرها ── */}
      <section style={{ paddingInline: SPACE.page, paddingTop: 16 }}>
        <div style={{ position: "relative", borderRadius: R.sheet, overflow: "hidden", height: 200 }}>
          <img src="/gallery/haram-drone.jpg" alt="" loading="eager"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,.28) 0%, rgba(0,0,0,.72) 100%)" }} />
          <div className="flex flex-col justify-end" style={{ position: "relative", height: "100%", padding: 18, color: C.white }}>
            <TasaheelMark size={46} />
            <div style={{ ...T.h2, marginTop: 12 }}>{t("brand")}</div>
            <div style={{ ...T.meta, opacity: 0.88, marginTop: 4 }}>{t("tagline")}</div>
            {cities.length > 0 && (
              <div className="flex flex-wrap gap-1.5" style={{ marginTop: 12 }}>
                {cities.map(c => (
                  <span key={c} className="inline-flex items-center gap-1"
                    style={{ ...T.small, background: "rgba(255,255,255,.18)", border: "1px solid rgba(255,255,255,.3)", borderRadius: R.pill, paddingInline: 10, height: 26 }}>
                    <MapPin size={12} />{c}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── الشبكة ── */}
      <div className="flex-1">
        {groups.length === 0 ? (
          <div style={{ padding: `64px ${SPACE.page}px`, textAlign: "center", ...T.body, color: C.ink2 }}>
            {t("noPackages")}
          </div>
        ) : groups.map((g, gi) => (
          <section key={g.dest} style={{ paddingBlock: SPACE.section, paddingInline: SPACE.page }}>
            <h2 style={{ ...T.h2, color: C.ink, margin: "0 0 14px" }}>
              {t("packagesIn").replace("{city}", g.dest)}
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SPACE.gap, alignItems: "start" }}>
              {g.items.map((p, i) => card(p, gi * 2 + i))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/** يُصدَّر لإعادة استخدامه في شاشة المراجعة. */
export { minTotal };
