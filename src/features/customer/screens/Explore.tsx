/* شاشة الاستكشاف.

   الجوال: رأسٌ متمركز بالشعار، ثم فلتر مدن، ثم شبكة عمودين.

   الديسكتوب: بنية صفحة نتائج Booking بلا نسخ تصميمها — رأسٌ فيه الوجهات
   (في DesktopNav)، ثم شريط أدوات يقول العدد ويبدّل العرض، ثم الباقات على
   عرض الشاشة كاملاً. لا خريطة ولا عمود فلاتر جانبي، فلا مساحة تُترك
   فارغة: أربع بطاقات في الصف بدل ثلاث، أو قائمة أفقية بالعرض الكامل.

   وبين الباقات فاصل روحاني تحريري قصير: يكسر تكرار البطاقات البيضاء
   من دون أن يتحول إلى إعلان أو يتقدم على قرار الحجز.

   ورحلةٌ حسب الطلب ليست قسماً مستقلاً على الديسكتوب: بطاقةٌ خاصة بين
   الباقات (VIP) — خيارٌ إضافي في الصف لا لافتةٌ تحت الصفحة. وعلى الجوال
   تبقى بطاقةً كبيرة أسفل القائمة كما كانت.

   والبطاقة هنا مبسّطة عن ListingCard: بلا نجوم ولا شارات ولا نصّ متناوب.
   النصّ المتناوب كان يشغّل مؤقّتاً لكل بطاقة — مع عشرين باقة يصير عشرين
   مؤقّتاً تعمل معاً. */
import { useMemo, useState } from "react";
import { MapPin, Sparkles, Hotel as HotelIcon, Plane, ArrowLeft, CalendarDays, LayoutGrid, List as ListIcon, Crown, Bus, UserRound } from "lucide-react";
import type { Pkg, Trip, Hotel, Transport } from "@/types";
import { TasaheelMark } from "@/components/TasaheelMark";
import { C, T, R, SPACE, STICKY_H, FONT, flipRTL, money } from "../ui/tokens";
import { LangSwitch, useDir } from "../ui/kit";
import { pkgCover, CUSTOM_TRIP_COVER } from "../gallery";
import { LANGS, cityLabel, type Lang } from "../i18n";
import { startingPrice } from "@/features/packages/readiness";

import { durationLabel } from "../plural";

export interface ExploreProps {
  packages: Pkg[];
  hotels: Hotel[];
  tripsOf: (p: Pkg) => Trip[];
  /** لقراءة وسيلة النقل على البطاقة — «نوع النقل» من الملاحظة. */
  transports?: Transport[];
  /** الوجهات المتاحة وحالة الفلتر — تعيش في CustomerApp لأن رأس الديسكتوب يعرضها. */
  cities: string[];
  city: string;
  setCity: (c: string) => void;
  onOpen: (p: Pkg) => void;
  onCustom: () => void;
  signedIn: boolean;
  onAccount: () => void;
  t: (k: string) => string;
  lang: Lang;
  setLang: (l: Lang) => void;
}

/* سعر «يبدأ من» اليدوي من الباقة؛ لا يُشتق من الغرف أو المواصلات. */
const minTotal = startingPrice;

/** «مكة والمدينة» → ["مكة","المدينة"] — الباقة المشتركة تظهر في فلتر كل مدينة.
    الفصل على « و» بمسافة قبلها لا على «و» وحدها: الثانية تشطر أسماءً
    فيها واو أصلية مثل «الوجه» → «ال» + «جه». */
export const citiesOf = (p: Pkg): string[] =>
  p.destination.split(" و").map(s => s.trim()).filter(Boolean);

/** ترتيب المدن: مكة أولاً ثم المدينة ثم ما بقي على ترتيب البيانات.
    لا يُترك لترتيب ورود الباقات من قاعدة البيانات: ذاك يتبع تاريخ الإضافة،
    فباقة مدينةٍ أُدخلت أولاً كانت تتقدّم مكة في الشبكة وفي شرائح الفلتر. */
const CITY_ORDER = ["مكة", "المدينة"];
export const cityRank = (c: string): number => {
  const i = CITY_ORDER.findIndex(x => c.includes(x));
  return i === -1 ? CITY_ORDER.length : i;
};
/** رتبة الباقة = أصغر رتبة مدينة فيها — فباقة «مكة والمدينة» تُعدّ مكّية. */
const pkgRank = (p: Pkg): number => Math.min(...citiesOf(p).map(cityRank), CITY_ORDER.length);

type View = "grid" | "list";
/* العرض المختار يُحفظ: من فضّل القائمة لا يُعاد إلى الشبكة في كل زيارة.
   المتصفّح وحده يعرفه — لا يُرسل لأحد. */
const readView = (): View => {
  try { return localStorage.getItem("ts.view") === "list" ? "list" : "grid"; } catch { return "grid"; }
};

/** مقعدٌ واحد أو أكثر — بنصّه لا برقمٍ عارٍ. الأعداد الكبيرة تُختصر إلى
    «6+ مقاعد متاحة» لأن الوفرة إشارة، لا رقماً يحتاج المستفيد حفظه. */
const seatsText = (n: number, t: (k: string) => string) =>
  n > 6 ? t("seatsAvailableCard").replace("{n}", "6")
  : n === 1 ? t("seatsLeftCardOne")
  : t("seatsLeftCard").replace("{n}", String(n));

/* ═══════════ بنر الحديث ═══════════

   الحرمان خلفيةً كاملة، والحديث فوقهما. لا إطار ولا زخرفة ولا أيقونة:
   الصورة هي التصميم، وكلُّ ما يُضاف إليها ينافسها ولا يخدمها.

   ── الصورتان مشهدٌ واحد لا صورتان ──
   مكة يميناً والمدينة يساراً، وتتلاشى حافّة الأولى في الثانية عند
   المنتصف بقناعٍ متدرّج فلا يظهر خطُّ التقاء. وكلتاهما ليليّة وفي كلٍّ
   هلال — اختيارٌ لا مصادفة: صورتان بضوءَين مختلفين (نهارٌ وليل) تبقيان
   صورتين ملصوقتين مهما نُعّم الوصل بينهما.

   ── لماذا لا تدرّج فوق نصّ بل حجابٌ كامل ──
   التدرّج من أسفل يترك أعلى الصورة مكشوفاً، والنصّ المتوسّط يقع على
   ما لا يُتحكَّم بضوئه — سطرٌ أبيض على قبّةٍ بيضاء. الحجاب هنا شعاعيٌّ
   يعمّ الإطار كلّه ويشتدّ في وسطه حيث النصّ. */

function SacredBanner({ lang }: { lang: Lang }) {
  const ar = lang === "ar";
  return (
    <section className="ts-sacred" aria-labelledby="ts-sacred-text">
      <div className="ts-sacred-bg" aria-hidden="true">
        {/* الأبعاد مصرَّحة: بلا قفزة تخطيط حين تصل الصورتان.
            eager لا lazy — البنر أول ما يُرى، وتأجيلُ تحميله يفتح
            الصفحة على مستطيلٍ داكن فارغ ثم يملؤه بعد لحظة. */}
        <img className="mad" src="/gallery/madinah-night.webp" alt="" width={810} height={1280} decoding="async" fetchPriority="high" />
        <img className="mak" src="/gallery/makkah-night.webp" alt="" width={792} height={1280} decoding="async" fetchPriority="high" />
      </div>

      <div className="ts-sacred-copy">
        <p className="ts-sacred-kind">{ar ? "تساهيل العمرة" : "Tasaheel Umrah"}</p>
        {/* Marketing copy for mobile, hadith for desktop via CSS */}
        <h2 className="ts-sacred-text ts-sacred-mobile-text">
          {ar ? "رحلتك مرتبة، وقلبك مطمئن" : "Your journey planned, your heart at peace"}
        </h2>
        <blockquote id="ts-sacred-text" className="ts-sacred-text ts-sacred-hadith" lang="ar" dir="rtl">
          الْعُمْرَةُ إِلَى الْعُمْرَةِ كَفَّارَةٌ لِمَا بَيْنَهُمَا
        </blockquote>
        {!ar && <p className="ts-sacred-meaning ts-sacred-hadith-eng">"An ʿUmrah to the next is an expiation for what lies between them."</p>}
        <p className="ts-sacred-meaning ts-sacred-mobile-meaning">
          {ar 
            ? "نختار لك الأفضل من الفنادق والنقل، بسعر عادل وخدمة موثوقة"
            : "We select the best hotels and transport for you, at fair prices with reliable service"}
        </p>
        <p className="ts-sacred-src">{ar ? "ابدأ الحجز الآن" : "Start booking now"}</p>
      </div>
    </section>
  );
}

export function Explore({ packages, hotels, transports = [], tripsOf, cities, city, setCity, onOpen, onCustom, signedIn, onAccount, t, lang, setLang }: ExploreProps) {
  const dir = useDir();
  const [view, setView] = useState<View>(readView);
  const pickView = (v: View) => {
    setView(v);
    try { localStorage.setItem("ts.view", v); } catch { /* وضع التصفّح الخاص يرفض الكتابة */ }
  };

  /* المتاحة أولاً: أول ما تراه العين يجب أن يكون قابلاً للحجز. ثم مكة قبل
     المدينة — فباقات المدينة تظهر مستقلةً أسفل باقات مكة حين تُضاف بياناتها.

     والقائمة تُشطر شطرين لا تُرتَّب وحسب (بطلب الفريق: «الباقة المعطلة
     تظهر بحجم بطاقة كاملة»). الترتيب كان ينزّلها أسفل الشبكة، لكنها
     تبقى بنفس الوزن البصري — صورة كبيرة وعنوان بحجم أخواتها — فتنافس
     على العين ما يمكن حجزه فعلاً، ومساحةُ شاشةٍ تُنفَق على ما لا
     يُضغط. الآن: المتاحة شبكةً، وغير المتاحة صفوفاً مضغوطة تحتها. */
  const { open, closed } = useMemo(() => {
    const list = city ? packages.filter(p => citiesOf(p).includes(city)) : packages;
    const byRank = (a: Pkg, b: Pkg) => pkgRank(a) - pkgRank(b);
    return {
      open:   list.filter(p => tripsOf(p).length > 0).sort(byRank),
      closed: list.filter(p => tripsOf(p).length === 0).sort(byRank),
    };
  }, [packages, city, tripsOf]);

  /* ما تقرأه البطاقة — يُحسب مرّة ويقرؤه العرضان (شبكة وقائمة) فلا
     ينحرف أحدهما عن الآخر حين يُعدَّل أحدهما. */
  const info = (p: Pkg) => {
    const trs = tripsOf(p);
    const next = trs[0];
    const transport = transports.find(x => x.id === (next?.transportId || p.transportId));
    return {
      trs, next, transport,
      hotel: hotels.find(h => h.id === p.hotelId),
      left: next ? Math.max(0, next.seats - next.bookedSeats) : 0,
    };
  };

  /* ثلاث شرائح تتقاسم العرض بالتساوي؛ وأقلّ من ذلك تأخذ عرض نصّها
     (شريحتان بنصف الشاشة لكلٍّ تبدوان منتفختين)، وأكثر تُمرَّر أفقياً. */
  const compactCity = (c: string) => {
    if (lang !== "ar") return cityLabel(c, lang);
    if (c.includes("المدينة")) return "مكة والمدينة";
    if (c.includes("مكة")) return "مكة";
    return cityLabel(c, lang);
  };
  const tabs = [{ key: "", label: t("all") }, ...cities.map(c => ({ key: c, label: compactCity(c) }))];
  const spread = tabs.length === 3;
  const scroll = tabs.length > 3;
  /* «0 رحلة متاحة» عربيةٌ ركيكة، والصفر حالةٌ لها نصّها. */
  const found = open.length === 0 ? t("noUpcoming")
    : open.length === 1 ? t("tripFound")
    : t("tripsFound").replace("{n}", String(open.length));

  /* ── بطاقة الباقة في الشبكة ── */
  const GridCard = ({ p }: { p: Pkg }) => {
    const { trs, next, hotel, left } = info(p);
    return (
      <button onClick={() => onOpen(p)} className="ts-seq ts-grid-card flex flex-col text-start"
        style={{
          // الحدّ في .ts-seq لا هنا: النمط السطري يتقدّم على الورقة
          // فيمنع نبضه (انظر تعليق .ts-seq في ui/kit.tsx)
          background: C.white, borderRadius: R.card,
          padding: 8, gap: 8, cursor: "pointer", fontFamily: FONT.sans,
        }}>
        <img src={pkgCover(p)} alt="" loading="lazy"
          style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: 10, display: "block" }} />
        <span className="block w-full text-center" style={{ ...T.h3, fontSize: 16, color: C.ink, paddingInline: 2 }}>
          {p.name}
        </span>
        {/* البطاقة تقول ما يقرّر به المستفيد لا صورةً إعلانية: أقرب تاريخ،
            المدة، المقاعد المتبقية — كلها من البيانات لا من نصٍّ ثابت. */}
        <span className="flex flex-col w-full" style={{ gap: 3, paddingInline: 2 }}>
          <span className="flex items-center justify-between" style={{ gap: 6, ...T.small, fontSize: 12, fontWeight: 400, color: C.ink2 }}>
            <span className="inline-flex items-center min-w-0" style={{ gap: 4 }}>
              <CalendarDays size={12} style={{ flexShrink: 0 }} />
              {next ? <span style={{ fontFamily: "var(--font-app)", direction: "ltr" }}>{next.departureDate}</span> : "—"}
              {trs.length > 1 && <span style={{ color: C.ink3 }}>{t("moreTrips").replace("{n}", String(trs.length - 1))}</span>}
            </span>
            <span style={{ whiteSpace: "nowrap" }}>{durationLabel(p.days, p.nights, lang)}</span>
          </span>
          {/* المدينة سطرٌ واحد لا سطران: كانت تُذكر في وسط البطاقة وفي
              أسفلها معاً، فيقرأ المستفيد الاسم نفسه مرّتين في بطاقةٍ
              مساحتها ضيّقة أصلاً بعد أربع بطاقات في الصف. */}
          <span className="flex items-center justify-between" style={{ gap: 6, ...T.small, fontSize: 12, fontWeight: 400, color: C.ink2 }}>
            <span className="inline-flex items-center min-w-0" style={{ gap: 4 }}>
              <MapPin size={12} style={{ flexShrink: 0 }} />
              <span className="truncate">{cityLabel(hotel?.city ?? p.destination, lang)}</span>
            </span>
            {next && (
              <span style={{ fontWeight: left <= 5 ? 600 : 400, color: left <= 5 ? C.green : C.ink2, whiteSpace: "nowrap" }}>
                {seatsText(left, t)}
              </span>
            )}
          </span>
        </span>
        <span className="flex items-center justify-end w-full" style={{ gap: 6, paddingInline: 2, paddingBottom: 2 }}>
          <span className="inline-flex items-baseline" style={{ gap: 3, flexShrink: 0, whiteSpace: "nowrap" }}>
            {/* «يبدأ من» أخفت وأصغر من الرقم: هو تحفّظ على السعر
                لا جزء منه، ولو ساواه وزناً لتنافس العنصران على العين
                والرقم هو المقصود. */}
            <span style={{ ...T.small, fontSize: 11, fontWeight: 400, color: C.ink2 }}>{t("from")}</span>
            <span style={{ ...T.small, fontWeight: 600, color: C.green }}>
              {money(minTotal(p))} {t("currency")}
            </span>
          </span>
        </span>
        <span className="ts-card-cta ts-trip-cta" style={{ width: "100%", minHeight: 46, paddingInline: 24, border: "1px solid rgba(255,255,255,.42)", borderRadius: R.pill, background: C.greenDeep, color: C.white, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 600, whiteSpace: "nowrap" }}>
          {t("viewTrip")}
        </span>
      </button>
    );
  };

  /* ── صفّ الباقة في القائمة (ديسكتوب) ──
     أفقيٌّ بعرض المساحة كلها: لا عمود جانبي يزاحمه، فالصورة تأخذ قدرها
     والتفاصيل تُقرأ في سطرين والسعر والإجراء في الطرف — كصفّ Booking. */
  const ListRow = ({ p }: { p: Pkg }) => {
    const { trs, next, transport, hotel, left } = info(p);
    return (
      <button onClick={() => onOpen(p)} className="ts-list-row text-start" style={{ fontFamily: FONT.sans, cursor: "pointer" }}>
        <img src={pkgCover(p)} alt="" loading="lazy" />
        <span className="ts-list-main">
          <span className="ts-list-title">{p.name}</span>
          <span className="ts-list-meta">
            <span className="inline-flex items-center" style={{ gap: 4 }}>
              <MapPin size={13} style={{ flexShrink: 0 }} />
              {cityLabel(hotel?.city ?? p.destination, lang)}
            </span>
            <span className="inline-flex items-center" style={{ gap: 4 }}>
              <CalendarDays size={13} style={{ flexShrink: 0 }} />
              {next ? <span style={{ fontFamily: "var(--font-app)", direction: "ltr" }}>{next.departureDate}</span> : "—"}
              {trs.length > 1 && <span style={{ color: C.ink3 }}>{t("moreTrips").replace("{n}", String(trs.length - 1))}</span>}
            </span>
            <span>{durationLabel(p.days, p.nights, lang)}</span>
            {transport && (
              <span className="inline-flex items-center" style={{ gap: 4 }}>
                {transport.mode === "flight" ? <Plane size={13} style={{ flexShrink: 0 }} /> : <Bus size={13} style={{ flexShrink: 0 }} />}
                {transport.mode === "flight" ? t("byFlight") : t("byBus")}
              </span>
            )}
          </span>
          {/* ما يشمله السعر — من بيانات الباقة لا من نصٍّ ثابت. */}
          <span className="ts-list-incl">
            {[
              p.nights > 0 && p.hotelId ? t("inclHousing") : null,
              transport ? t("inclTransport") : null,
              ...(p.features ?? []).slice(0, 2).map(f => f.text),
            ].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className="ts-list-side">
          {next && (
            <span style={{ ...T.small, fontWeight: left <= 5 ? 600 : 400, color: left <= 5 ? C.green : C.ink2 }}>
              {seatsText(left, t)}
            </span>
          )}
          <span className="inline-flex items-baseline" style={{ gap: 4, whiteSpace: "nowrap" }}>
            <span style={{ ...T.small, fontSize: 11, fontWeight: 400, color: C.ink2 }}>{t("from")}</span>
            <span style={{ fontSize: 20, fontWeight: 600, color: C.ink }}>{money(minTotal(p))}</span>
            <span style={{ ...T.small, color: C.ink2 }}>{t("currency")}</span>
          </span>
          <span className="ts-card-cta ts-trip-cta" style={{ minHeight: 46, minWidth: 154, paddingInline: 26, border: "1px solid rgba(255,255,255,.42)", borderRadius: R.pill, background: C.greenDeep, color: C.white, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 600, whiteSpace: "nowrap" }}>
            {t("viewTrip")}
          </span>
        </span>
      </button>
    );
  };

  /* ── رحلة حسب الطلب: بطاقة بين الباقات (ديسكتوب) ──
     خيارٌ إضافي في الصف لا قسمٌ مستقل. مكانها الرابع: آخر خلية في الصف
     الأول على الشبكة — تُرى بلا تمرير، ولا تتقدّم على ما يُحجَز فعلاً. */
  const VipCard = ({ layout }: { layout: View }) => (
    <button onClick={onCustom} className={`ts-vip-card ${layout === "list" ? "as-row" : ""}`} style={{ fontFamily: FONT.sans, cursor: "pointer", textAlign: "start" }}>
      <span className="ts-vip-badge">
        <Crown size={13} style={{ flexShrink: 0 }} />VIP
      </span>
      <span className="ts-vip-title">{t("customPkg")}</span>
      <span className="ts-vip-note">{t("vipNote")}</span>
      <span className="ts-vip-cta">
        {t("customCta")}
        <ArrowLeft size={16} style={{ flexShrink: 0, ...flipRTL(dir) }} />
      </span>
    </button>
  );

  /* البطاقة الخاصة تُدسّ في المكان الرابع، أو في آخر القائمة إن كانت
     الباقات أقلّ من ذلك — قاعدةٌ واحدة بلا حالاتٍ ميّتة. */
  const VIP_AT = 3;
  const withVip = (list: Pkg[], layout: View) => {
    const cards = list.map(p => layout === "list" ? <ListRow key={p.id} p={p} /> : <GridCard key={p.id} p={p} />);
    cards.splice(Math.min(VIP_AT, cards.length), 0, <VipCard key="__vip" layout={layout} />);
    return cards;
  };

  return (
    <div className="ts-explore-shell flex flex-col flex-1" style={{ background: C.white, paddingBottom: STICKY_H }}>

      {/* ═══ رأس الجوال: الهوية في جهة، والدخول واللغة في الجهة الأخرى. */}
      <header className="ts-mobile-explore-header" style={{ paddingInline: SPACE.page }}>
        <button type="button" className="ts-mobile-explore-brand" onClick={() => setCity("")} aria-label={t("brand")}>
          <TasaheelMark size={45} plain />
        </button>
        <div className="ts-mobile-explore-actions">
          <button type="button" className="ts-mobile-auth" onClick={onAccount}>
            <UserRound size={16}/>{signedIn ? t("profile") : t("login")}
          </button>
          <LangSwitch compact lang={lang} setLang={setLang} langs={LANGS} label={t("language")} />
        </div>
      </header>

      {/* ═══ بنر الحديث ═══
          لا يُشترط بوجود الباقات: صفحةٌ بلا رحلاتٍ قادمة هي أحوجُ ما تكون
          إلى ما يقول للزائر أين هو ولماذا جاء — وقد كانت تفتح على سطرٍ
          رماديّ وحيد يقول «لا توجد باقات».

          حديثٌ واحد لا شعار: الرسالة الوحيدة هنا نصٌّ نبويّ، ودورُ الصفحة
          أن تُحسن عرضه لا أن تزاحمه. ولهذا لا زرَّ فيه ولا وعدَ خدمة —
          ذاك شغلُ البطاقات تحته. */}
      <SacredBanner lang={lang} />

      {/* ═══ المدن وطريقة العرض في صف واحد، فلا تهدر الواجهة صفاً للعناوين. */}
      <div id="packages" className="ts-mobile-head" style={{ paddingInline: SPACE.page, marginTop: 18 }}>
        <div className="ts-mobile-filter-row">
          <div className="flex ts-mobile-city-tabs" style={{ gap: 6, overflowX: scroll ? "auto" : "visible", scrollbarWidth: "none" }}>
            {tabs.map(tab => {
              const on = city === tab.key;
              return (
                <button key={tab.key || "all"} onClick={() => setCity(tab.key)} aria-pressed={on}
                  style={{
                    flex: spread ? "1 1 0" : "0 0 auto", minWidth: 0, height: 40,
                    paddingInline: spread ? 8 : 14, borderRadius: R.chip, cursor: "pointer",
                    background: on ? C.greenDeep : C.white,
                    border: `1px solid ${on ? C.greenDeep : C.green}`,
                    color: on ? C.white : C.green,
                    fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap",
                  }}>
                  {tab.label}
                </button>
              );
            })}
          </div>
          <div className="ts-mobile-view-switch" role="group" aria-label={lang === "ar" ? "طريقة العرض" : "View mode"}>
            <button className={view === "grid" ? "on" : ""} aria-label={t("viewGrid")} aria-pressed={view === "grid"} onClick={() => pickView("grid")}><LayoutGrid size={17}/></button>
            <button className={view === "list" ? "on" : ""} aria-label={t("viewList")} aria-pressed={view === "list"} onClick={() => pickView("list")}><ListIcon size={17}/></button>
          </div>
        </div>
      </div>

      {/* ═══ شريط الأدوات (الديسكتوب) ═══
          صفٌّ واحد تحت الرأس مباشرةً: العدد في جهة، ومبدّل العرض في
          الأخرى — بلا مُنتقي تواريخ ولا فلاترَ جانبية. الوجهات في الرأس
          نفسه (DesktopNav) فلا تُكرَّر هنا. */}
      <div className="ts-explore-toolbar">
        <div className="ts-toolbar-inner">
          <h1 className="ts-toolbar-title">
            {city ? cityLabel(city, lang) : (lang === "ar" ? "رحلات العمرة" : "Umrah trips")}
            <span>{found}</span>
          </h1>
          <div className="ts-view-switch" role="group" aria-label={lang === "ar" ? "طريقة العرض" : "View mode"}>
            <button className={view === "list" ? "on" : ""} aria-pressed={view === "list"} onClick={() => pickView("list")}>
              <ListIcon size={15} />{t("viewList")}
            </button>
            <button className={view === "grid" ? "on" : ""} aria-pressed={view === "grid"} onClick={() => pickView("grid")}>
              <LayoutGrid size={15} />{t("viewGrid")}
            </button>
          </div>
        </div>
      </div>

      {/* ═══ الباقات ═══ */}
      <div className="flex-1 ts-explore-body" style={{ paddingInline: SPACE.page, marginTop: 18 }}>
        {open.length === 0 && closed.length === 0 ? (
          <div style={{ padding: "64px 0", textAlign: "center", ...T.body, color: C.ink2 }}>{t("noPackages")}</div>
        ) : view === "list" ? (
          <div className="ts-list">{withVip(open, "list")}</div>
        ) : (
          <div className="ts-grid">{withVip(open, "grid")}</div>
        )}

        {/* ═══ باقات بلا رحلة قادمة ═══
            صفوف مضغوطة لا بطاقات: هي معروضة للعلم بوجودها لا للحجز،
            فلا تأخذ وزن ما يُحجَز. ومصغّرة ٤٤ بكسل تكفي للتعرّف، وسطرٌ
            واحد يقول السبب. غير قابلة للضغط أصلاً — لا زرّ معطَّل يُضغط
            فلا يقع شيء. */}
        {open.length === 0 && closed.length > 0 && (
          <div style={{ marginTop: 4 }}>
            <div style={{ ...T.small, color: C.ink3, marginBottom: 8 }}>{t("noUpcoming")}</div>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
              {closed.map(p => {
                const hotel = hotels.find(h => h.id === p.hotelId);
                return (
                  <li key={p.id} className="flex items-center"
                    style={{
                      gap: 10, padding: 8, borderRadius: R.card,
                      background: C.fill, border: `1px solid ${C.line}`,
                    }}>
                    <img src={pkgCover(p)} alt="" loading="lazy"
                      style={{
                        width: 44, height: 44, objectFit: "cover", borderRadius: 8,
                        flexShrink: 0, display: "block", filter: "grayscale(1)", opacity: 0.7,
                      }} />
                    <span className="flex-1 min-w-0 flex flex-col" style={{ gap: 1 }}>
                      <span className="truncate" style={{ ...T.body, fontWeight: 600, color: C.ink2 }}>{p.name}</span>
                      <span className="truncate" style={{ ...T.small, fontWeight: 400, color: C.ink3 }}>
                        {cityLabel(hotel?.city ?? p.destination, lang)}
                      </span>
                    </span>
                    <span style={{ ...T.small, color: C.ink3, flexShrink: 0 }}>{t("noUpcomingShort")}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* رحلة حسب الطلب بطاقة باقة مثل أخواتها: الاختلاف في كون السعر
            يُجهَّز بعد الطلب، لا في لون البطاقة أو ترتيب محتواها. */}
        <button onClick={onCustom} className="ts-seq ts-grid-card ts-custom-hero flex flex-col text-start"
          style={{
            background: C.white, borderRadius: R.card, padding: 8, gap: 8,
            marginTop: 20, marginBottom: 24, cursor: "pointer", fontFamily: FONT.sans,
          }}>
          <img src={CUSTOM_TRIP_COVER} alt="" aria-hidden loading="lazy"
            style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: 10, display: "block" }} />
          <span className="block w-full text-center" style={{ ...T.h3, fontSize: 16, color: C.ink, paddingInline: 2 }}>
            {t("customPkg")}
          </span>
          <span className="flex items-center justify-center w-full" style={{ gap: 6, ...T.small, fontSize: 12, color: C.ink2, paddingInline: 2 }}>
            <Sparkles size={13} style={{ color: C.greenDeep, flexShrink: 0 }} />
            {t("customLead")}
          </span>
          <span className="flex items-center justify-center w-full" style={{ gap: 8, paddingInline: 2, ...T.small, color: C.ink2 }}>
            <HotelIcon size={13}/><span>{t("customPerkHotels")}</span>
            <span>·</span><Plane size={13}/><span>{t("customPerkFlights")}</span>
          </span>
          <span className="ts-card-cta" style={{ height: 42, borderRadius: R.pill, background: C.greenDeep, color: C.white, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 600 }}>
            {t("customCta")}
          </span>
        </button>
      </div>
    </div>
  );
}

/** يُصدَّر لإعادة استخدامه في شاشة المراجعة. */
export { minTotal };
