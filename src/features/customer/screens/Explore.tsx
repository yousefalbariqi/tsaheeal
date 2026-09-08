/* شاشة الاستكشاف — رأس متمركز بالشعار، ثم فلتر مدن، ثم شبكة عمودين.

   لماذا شبكة عمودين لا شريط أفقي: عدد الباقات صار يكبر، والشريط الأفقي
   يخفي أكثر مما يعرض ويستلزم سحباً لكل وجهة. الشبكة تُظهر ست باقات في
   الشاشة الأولى، والفلتر يقصّها بضغطة بدل التمرير.

   والبطاقة هنا مبسّطة عن ListingCard: بلا نجوم ولا شارات ولا نصّ متناوب.
   النصّ المتناوب كان يشغّل مؤقّتاً لكل بطاقة — مع عشرين باقة يصير عشرين
   مؤقّتاً تعمل معاً. */
import { useMemo, useState } from "react";
import { MapPin, Sparkles, Hotel as HotelIcon, Plane, ClipboardList, ArrowLeft, CalendarDays, ShieldCheck, WalletCards, HeartHandshake } from "lucide-react";
import type { Pkg, Trip, Hotel, Transport } from "@/types";
import { TasaheelMark } from "@/components/TasaheelMark";
import { C, T, R, SPACE, SHADOW, STICKY_H, FONT, flipRTL, money } from "../ui/tokens";
import { LangSwitch, TrustRow, useDir } from "../ui/kit";
import { pkgCover, CUSTOM_TRIP_COVER } from "../gallery";
import { LANGS, trustOf, cityLabel, type Lang } from "../i18n";
import { startingPrice } from "@/features/packages/readiness";

import { durationLabel } from "../plural";

export interface ExploreProps {
  packages: Pkg[];
  hotels: Hotel[];
  tripsOf: (p: Pkg) => Trip[];
  /** لقراءة وسيلة النقل على البطاقة — «نوع النقل» من الملاحظة. */
  transports?: Transport[];
  onOpen: (p: Pkg) => void;
  onCustom: () => void;
  t: (k: string) => string;
  lang: Lang;
  setLang: (l: Lang) => void;
}

/* سعر «يبدأ من» اليدوي من الباقة؛ لا يُشتق من الغرف أو المواصلات. */
const minTotal = startingPrice;

/** «مكة والمدينة» → ["مكة","المدينة"] — الباقة المشتركة تظهر في فلتر كل مدينة.
    الفصل على « و» بمسافة قبلها لا على «و» وحدها: الثانية تشطر أسماءً
    فيها واو أصلية مثل «الوجه» → «ال» + «جه». */
const citiesOf = (p: Pkg): string[] =>
  p.destination.split(" و").map(s => s.trim()).filter(Boolean);

/** ترتيب المدن: مكة أولاً ثم المدينة ثم ما بقي على ترتيب البيانات.
    لا يُترك لترتيب ورود الباقات من قاعدة البيانات: ذاك يتبع تاريخ الإضافة،
    فباقة مدينةٍ أُدخلت أولاً كانت تتقدّم مكة في الشبكة وفي شرائح الفلتر. */
const CITY_ORDER = ["مكة", "المدينة"];
const cityRank = (c: string): number => {
  const i = CITY_ORDER.findIndex(x => c.includes(x));
  return i === -1 ? CITY_ORDER.length : i;
};
/** رتبة الباقة = أصغر رتبة مدينة فيها — فباقة «مكة والمدينة» تُعدّ مكّية. */
const pkgRank = (p: Pkg): number => Math.min(...citiesOf(p).map(cityRank), CITY_ORDER.length);

export function Explore({ packages, hotels, transports = [], tripsOf, onOpen, onCustom, t, lang, setLang }: ExploreProps) {
  const [city, setCity] = useState<string>("");   // "" = الكل
  const dir = useDir();

  /** المدن المغطّاة فعلياً — مشتقّة من الباقات، لا ادعاء. مكة أولاً ثم المدينة. */
  const cities = useMemo(
    () => [...new Set(packages.flatMap(citiesOf))].sort((a, b) => cityRank(a) - cityRank(b)),
    [packages],
  );

  /* عبارات الثقة — نصوصها في i18n لتُعدَّل بلا لمس الكود، والمدن من الباقات.
     المدن تُدرَج ثانيةً لا في الذيل: الشريط لا يُرى كاملاً في لحظة، فما وُضع
     آخراً قد لا يبلغه من نظر ثوانٍ ثم مرّر. */
  const trust = useMemo(() => {
    const base = trustOf(lang);
    /* أسماء المدن كاملةً: «المدينة» وحدها بجانب «مكة» تُقرأ اسماً عامّاً.
       والفاصل يتبع اللغة — «و» عربيةً و«&» إنجليزيةً. */
    const names = cities.map(c => cityLabel(c, lang));
    const joined = lang === "ar" ? names.join(" و") : names.join(" & ");
    return names.length ? [base[0], joined, ...base.slice(1)] : base;
  }, [cities, lang]);

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

  /* ثلاث شرائح تتقاسم العرض بالتساوي؛ وأقلّ من ذلك تأخذ عرض نصّها
     (شريحتان بنصف الشاشة لكلٍّ تبدوان منتفختين)، وأكثر تُمرَّر أفقياً. */
  const tabs = [{ key: "", label: t("all") }, ...cities.map(c => ({ key: c, label: cityLabel(c, lang) }))];
  const spread = tabs.length === 3;
  const scroll = tabs.length > 3;
  const copy = lang === "ar" ? {
    eyebrow: "رفيقك إلى العمرة",
    title: "رحلةٌ مرتّبة، وقلبٌ مطمئن",
    lead: "ابدأ باختيار وجهتك، ثم سنعرض لك الباقات والموعد والسكن بوضوح خطوةً خطوة.",
    helper: "إلى أين تريد الذهاب؟",
    helperNote: "اختر وجهتك الآن، وحدّد الموعد وعدد المعتمرين داخل الباقة التي تناسبك.",
    available: "الباقات المتاحة",
    promises: [
      { title: "سعر واضح", note: "يظهر قبل أن تبدأ الحجز", Icon: WalletCards },
      { title: "تفاصيل موثّقة", note: "السكن والنقل والموعد أمامك", Icon: ShieldCheck },
      { title: "معك خطوة بخطوة", note: "دعم عند الحاجة عبر واتساب", Icon: HeartHandshake },
    ],
  } : {
    eyebrow: "Your Umrah companion",
    title: "A thoughtful journey, with peace of mind",
    lead: "Start with your destination. We will show the package, date, and stay clearly, step by step.",
    helper: "Where would you like to go?",
    helperNote: "Choose your destination now; select the date and pilgrims inside the package.",
    available: "Available packages",
    promises: [
      { title: "Clear prices", note: "Shown before you book", Icon: WalletCards },
      { title: "Verified details", note: "Stay, transport, and date in view", Icon: ShieldCheck },
      { title: "With you throughout", note: "Help through WhatsApp when needed", Icon: HeartHandshake },
    ],
  };

  return (
    <div className="flex flex-col flex-1" style={{ background: C.white, paddingBottom: STICKY_H }}>

      {/* ═══ الرأس ═══ */}
      <div className="ts-umrah-hero" style={{ paddingInline: SPACE.page, paddingTop: 10 }}>
        {/* اللغة في الطرف، والشعار متمركز فوقها لا بجانبها */}
        <div className="flex">
          <LangSwitch compact lang={lang} setLang={setLang} langs={LANGS} label={t("language")} />
        </div>

        <div className="flex flex-col items-center text-center" style={{ marginTop: -8 }}>
          <TasaheelMark size={92} plain />
          <span style={{ color: C.greenDeep, fontSize: 12, fontWeight: 700, letterSpacing: ".08em", marginTop: 10 }}>
            {copy.eyebrow}
          </span>
          <h1 style={{ fontFamily: FONT.display, fontSize: 32, fontWeight: 600, color: C.ink, margin: "8px 0 0", lineHeight: 1.45 }}>
            {copy.title}
          </h1>
          <p style={{ ...T.body, color: C.ink2, margin: "8px 0 0", maxWidth: 560 }}>{copy.lead}</p>

          {/* صفّ ثقة ساكن — لا زحف ولا تلاشي عند الحافّة، فلا هامش سالب:
              ذاك كان يمدّ الشريط الزاحف إلى حافّتي الشاشة ليتلاشى عندهما.
              الصفّ الساكن يلتزم هامش الصفحة كبقيّة المحتوى. */}
          <div style={{ alignSelf: "stretch", marginTop: 14 }}>
            <TrustRow items={trust} />
          </div>
        </div>
      </div>

      {/* ═══ العنوان + فلتر المدن ═══ */}
      <div style={{ paddingInline: SPACE.page, marginTop: 24 }}>
        <div className="ts-trust-promises">
          {copy.promises.map(({ title, note, Icon }) => (
            <div key={title} className="ts-trust-promise">
              <span className="ts-trust-icon"><Icon size={19} aria-hidden /></span>
              <span><b>{title}</b><small>{note}</small></span>
            </div>
          ))}
        </div>
        <div className="ts-journey-helper" style={{ marginTop: 20 }}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <span style={{ color: C.greenDeep, fontSize: 12, fontWeight: 700, letterSpacing: ".06em" }}>{copy.available}</span>
              <h2 style={{ ...T.h2, color: C.ink, fontFamily: FONT.display, fontSize: 25, margin: "3px 0 0" }}>{copy.helper}</h2>
              <p style={{ ...T.small, color: C.ink2, margin: "4px 0 0" }}>{copy.helperNote}</p>
            </div>
            <MapPin size={25} style={{ color: C.greenDeep, flexShrink: 0 }} aria-hidden />
          </div>
        </div>
        <div className="flex" style={{ gap: 10, marginTop: 14, overflowX: scroll ? "auto" : "visible", scrollbarWidth: "none" }}>
          {tabs.map(tab => {
            const on = city === tab.key;
            return (
              <button key={tab.key || "all"} onClick={() => setCity(tab.key)} aria-pressed={on}
                style={{
                  flex: spread ? "1 1 0" : "0 0 auto", minWidth: 0, height: 46,
                  paddingInline: spread ? 8 : 24, borderRadius: R.chip, cursor: "pointer",
                  background: on ? C.greenDeep : C.white,
                  border: `1px solid ${on ? C.greenDeep : C.green}`,
                  color: on ? C.white : C.green,
                  fontFamily: FONT.sans, fontSize: 15, fontWeight: 600, whiteSpace: "nowrap",
                }}>
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══ شبكة الباقات ═══ */}
      <div className="flex-1" style={{ paddingInline: SPACE.page, marginTop: 30 }}>
        {open.length === 0 && closed.length === 0 ? (
          <div style={{ padding: "64px 0", textAlign: "center", ...T.body, color: C.ink2 }}>{t("noPackages")}</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 14 }}>
            {open.map(p => {
              const hotel = hotels.find(h => h.id === p.hotelId);
              return (
                <button key={p.id} onClick={() => onOpen(p)}
                  className="ts-seq flex flex-col text-start"
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
                  {/* البطاقة تقول ما يقرّر به المستفيد لا صورةً إعلانية:
                      أقرب تاريخ، المدة، وسيلة النقل، المقاعد المتبقية، وما
                      يشمله السعر — نصّ الملاحظة. كلها من البيانات لا من نصٍّ ثابت. */}
                  {(() => {
                    const trs = tripsOf(p); const nt = trs[0];
                    const tr = transports.find(x => x.id === (nt?.transportId || p.transportId));
                    const left = nt ? Math.max(0, nt.seats - nt.bookedSeats) : 0;
                    const incl = [
                      (p.nights > 0 && p.hotelId) ? t("inclHousing") : null,
                      tr ? t("inclTransport") : null,
                      ...(p.features ?? []).slice(0, 2).map(f => f.text),
                    ].filter(Boolean);
                    return (
                      <span className="flex flex-col w-full" style={{ gap: 3, paddingInline: 2 }}>
                        <span className="flex items-center justify-between" style={{ gap: 6, ...T.small, fontSize: 12, fontWeight: 400, color: C.ink2 }}>
                          <span className="inline-flex items-center min-w-0" style={{ gap: 4 }}>
                            <CalendarDays size={12} style={{ flexShrink: 0 }} />
                            {nt ? <span style={{ fontFamily: "var(--font-app)", direction: "ltr" }}>{nt.departureDate}</span> : "—"}
                            {trs.length > 1 && <span style={{ color: C.ink3 }}>{t("moreTrips").replace("{n}", String(trs.length - 1))}</span>}
                          </span>
                          <span style={{ whiteSpace: "nowrap" }}>{durationLabel(p.days, p.nights, lang)}</span>
                        </span>
                        <span className="flex items-center justify-between" style={{ gap: 6, ...T.small, fontSize: 12, fontWeight: 400, color: C.ink2 }}>
                          <span>{tr ? (tr.mode === "flight" ? t("byFlight") : t("byBus")) : ""}</span>
                          {nt && (
                            <span style={{ fontWeight: left <= 5 ? 600 : 400, color: left <= 5 ? C.green : C.ink2, whiteSpace: "nowrap" }}>
                              {left === 1 ? t("seatsLeftCardOne") : t("seatsLeftCard").replace("{n}", String(left))}
                            </span>
                          )}
                        </span>
                        {incl.length > 0 && (
                          <span className="truncate" style={{ ...T.small, fontSize: 11, fontWeight: 400, color: C.ink3 }}>
                            {t("incl")} {incl.join(" · ")}
                          </span>
                        )}
                      </span>
                    );
                  })()}
                  <span className="flex items-center justify-between w-full" style={{ gap: 6, paddingInline: 2, paddingBottom: 2 }}>
                    {/* اسم المدينة أولاً ثم الدبوس — كترتيب اللقطة في RTL */}
                    <span className="inline-flex items-center min-w-0" style={{ gap: 3, ...T.small, fontWeight: 400, color: C.ink2 }}>
                      <span className="truncate">{cityLabel(hotel?.city ?? p.destination, lang)}</span>
                      <MapPin size={13} style={{ flexShrink: 0 }} />
                    </span>
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
                </button>
              );
            })}
          </div>
        )}

        {/* ═══ باقات بلا رحلة قادمة ═══
            صفوف مضغوطة لا بطاقات: هي معروضة للعلم بوجودها لا للحجز،
            فلا تأخذ وزن ما يُحجَز. ومصغّرة ٤٤ بكسل تكفي للتعرّف، وسطرٌ
            واحد يقول السبب. غير قابلة للضغط أصلاً — لا زرّ معطَّل يُضغط
            فلا يقع شيء. */}
        {closed.length > 0 && (
          <div style={{ marginTop: open.length ? 22 : 4 }}>
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

        {/* ═══ رحلة حسب الطلب — مسار مختلف: طلب يجهّزه الفريق، لا حجز فوري ═══

           بطاقة كبيرة بصورة لا شريطاً صغيراً: الشريط السابق كان أخفت عنصر في الشاشة
           فيُقرأ ملاحظةً هامشية، مع أنه الخيار الوحيد لمن لا تناسبه الباقات الجاهزة.

           والبطاقة كلها هي الزر — كبطاقة الباقة أعلاه — لا div يحتوي زراً صغيراً،
           وإلا كانت المنطقة القابلة للضغط أصغر بكثير من العنصر الذي تراه العين.
           ولذلك «زر» الإجراء في الأسفل span بمظهر زر: زر داخل زر HTML باطل. */}
        <button onClick={onCustom} className="ts-card flex flex-col"
          style={{
            position: "relative", overflow: "hidden", width: "100%",
            marginTop: 28, marginBottom: 24, padding: 20, minHeight: 268,
            border: "none", borderRadius: R.sheet, boxShadow: SHADOW.card,
            justifyContent: "flex-end", textAlign: "start",
            fontFamily: FONT.sans, cursor: "pointer",
          }}>
          <img src={CUSTOM_TRIP_COVER} alt="" aria-hidden loading="lazy"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />

          {/* تعتيم متدرّج بلون C.greenDeep (#154C48): يثقل عند الأسفل حيث النصّ
              ويخفّ عند الأعلى فتبقى الصورة مرئية بدل أن تصير خلفية لونية. */}
          <span aria-hidden style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(to top, rgba(21,76,72,.95) 0%, rgba(21,76,72,.80) 45%, rgba(21,76,72,.38) 100%)",
          }} />

          <span className="flex flex-col" style={{ position: "relative", gap: 12 }}>
            <span className="inline-flex items-center self-start" style={{
              gap: 6, height: 28, paddingInline: 10, borderRadius: R.pill,
              background: "rgba(255,255,255,.20)", color: C.white, ...T.small,
            }}>
              <Sparkles size={14} style={{ flexShrink: 0 }} />
              {t("customEyebrow")}
            </span>

            <span className="block" style={{ ...T.h1, color: C.white }}>{t("customPkg")}</span>
            <span className="block" style={{ ...T.body, fontSize: 15, color: "rgba(255,255,255,.90)" }}>{t("customLead")}</span>

            {/* الخدمات الثلاث صريحة: «تنسيق» وحدها لا تقول إن الفنادق والطيران داخلة فيها. */}
            <span className="flex flex-wrap" style={{ gap: 8 }}>
              {[
                { Icon: HotelIcon, label: t("customPerkHotels") },
                { Icon: Plane, label: t("customPerkFlights") },
                { Icon: ClipboardList, label: t("customPerkPlan") },
              ].map(({ Icon, label }) => (
                <span key={label} className="inline-flex items-center" style={{
                  gap: 6, height: 30, paddingInline: 10, borderRadius: R.pill,
                  background: "rgba(255,255,255,.16)", color: C.white, ...T.small,
                }}>
                  <Icon size={14} style={{ flexShrink: 0 }} />
                  {label}
                </span>
              ))}
            </span>

            <span className="flex items-center justify-center" style={{
              gap: 8, marginTop: 4, height: 50, width: "100%", borderRadius: R.pill,
              background: C.white, color: C.greenDeep, fontSize: 16, fontWeight: 600,
            }}>
              {t("customCta")}
              <ArrowLeft size={18} style={{ flexShrink: 0, ...flipRTL(dir) }} />
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}

/** يُصدَّر لإعادة استخدامه في شاشة المراجعة. */
export { minTotal };
