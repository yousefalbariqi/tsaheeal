/* شاشة الاستكشاف — رأس متمركز بالشعار، ثم فلتر مدن، ثم شبكة عمودين.

   لماذا شبكة عمودين لا شريط أفقي: عدد الباقات صار يكبر، والشريط الأفقي
   يخفي أكثر مما يعرض ويستلزم سحباً لكل وجهة. الشبكة تُظهر ست باقات في
   الشاشة الأولى، والفلتر يقصّها بضغطة بدل التمرير.

   والبطاقة هنا مبسّطة عن ListingCard: بلا نجوم ولا شارات ولا نصّ متناوب.
   النصّ المتناوب كان يشغّل مؤقّتاً لكل بطاقة — مع عشرين باقة يصير عشرين
   مؤقّتاً تعمل معاً. */
import { useMemo, useState } from "react";
import { MapPin, Sparkles, Hotel as HotelIcon, Plane, ClipboardList, ArrowLeft } from "lucide-react";
import type { Pkg, Trip, Hotel } from "@/types";
import { TasaheelMark } from "@/components/TasaheelMark";
import { C, T, R, SPACE, SHADOW, STICKY_H, FONT, flipRTL, money } from "../ui/tokens";
import { LangSwitch, TrustTicker, useDir, useSequencePulse } from "../ui/kit";
import { pkgCover, CUSTOM_TRIP_COVER } from "../gallery";
import { LANGS, trustOf, type Lang } from "../i18n";

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

export function Explore({ packages, hotels, tripsOf, onOpen, onCustom, t, lang, setLang }: ExploreProps) {
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
    return cities.length ? [base[0], cities.join(" و"), ...base.slice(1)] : base;
  }, [cities, lang]);

  /* المتاحة أولاً: أول ما تراه العين يجب أن يكون قابلاً للحجز. ثم مكة قبل
     المدينة — فباقات المدينة تظهر مستقلةً أسفل باقات مكة حين تُضاف بياناتها. */
  const shown = useMemo(() => {
    const list = city ? packages.filter(p => citiesOf(p).includes(city)) : packages;
    return [...list].sort((a, b) =>
      (tripsOf(a).length ? 0 : 1) - (tripsOf(b).length ? 0 : 1) ||
      pkgRank(a) - pkgRank(b));
  }, [packages, city, tripsOf]);

  /* النبضة تمشي على البطاقات القابلة للحجز وحدها، وهي مقدّمة الشبكة بعد
     الترتيب أعلاه. نبض بطاقة مكتملة يجذب العين إلى ما لا يمكن الضغط عليه. */
  const bookable = useMemo(() => shown.filter(p => tripsOf(p).length > 0).length, [shown, tripsOf]);
  const pulseAt = useSequencePulse(bookable);

  /* ثلاث شرائح تتقاسم العرض بالتساوي؛ وأقلّ من ذلك تأخذ عرض نصّها
     (شريحتان بنصف الشاشة لكلٍّ تبدوان منتفختين)، وأكثر تُمرَّر أفقياً. */
  const tabs = [{ key: "", label: t("all") }, ...cities.map(c => ({ key: c, label: c }))];
  const spread = tabs.length === 3;
  const scroll = tabs.length > 3;

  return (
    <div className="flex flex-col flex-1" style={{ background: C.white, paddingBottom: STICKY_H }}>

      {/* ═══ الرأس ═══ */}
      <div style={{ paddingInline: SPACE.page, paddingTop: 10 }}>
        {/* اللغة في الطرف، والشعار متمركز فوقها لا بجانبها */}
        <div className="flex">
          <LangSwitch compact lang={lang} setLang={setLang} langs={LANGS} label={t("language")} />
        </div>

        <div className="flex flex-col items-center text-center" style={{ marginTop: -8 }}>
          <TasaheelMark size={92} plain />
          <h1 style={{ fontFamily: "var(--font-app)", fontSize: 30, fontWeight: 800, color: C.ink, margin: "10px 0 0" }}>
            {t("brand")}
          </h1>
          <p style={{ ...T.body, color: C.ink2, margin: "8px 0 0" }}>{t("tagline")}</p>

          {/* شريط الثقة — ممتدّ لحافّتي الشاشة بهامش سالب يلغي هامش الصفحة:
              التلاشي عند الحافّة الحقيقية هو ما يجعله يُقرأ شريطاً زاحفاً لا
              سطراً مقصوصاً في منتصف الصفحة. */}
          <div style={{ alignSelf: "stretch", marginInline: -SPACE.page, marginTop: 14 }}>
            <TrustTicker items={trust} />
          </div>
        </div>
      </div>

      {/* ═══ العنوان + فلتر المدن ═══ */}
      <div style={{ paddingInline: SPACE.page, marginTop: 28 }}>
        <h2 style={{ ...T.h2, color: C.ink, margin: 0 }}>{t("choosePackage")}</h2>
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
      <div className="flex-1" style={{ paddingInline: SPACE.page, marginTop: 14 }}>
        {shown.length === 0 ? (
          <div style={{ padding: "64px 0", textAlign: "center", ...T.body, color: C.ink2 }}>{t("noPackages")}</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {shown.map((p, i) => {
              const hotel = hotels.find(h => h.id === p.hotelId);
              const sold = tripsOf(p).length === 0;
              return (
                <button key={p.id} onClick={() => { if (!sold) onOpen(p); }} disabled={sold}
                  className="ts-seq flex flex-col text-start"
                  data-pulse={!sold && i === pulseAt ? "on" : undefined}
                  style={{
                    // الحدّ في .ts-seq لا هنا: النمط السطري يتقدّم على الورقة
                    // فيمنع نبضه (انظر تعليق .ts-seq في ui/kit.tsx)
                    background: C.white, borderRadius: R.card,
                    padding: 8, gap: 8, cursor: sold ? "not-allowed" : "pointer",
                    opacity: sold ? 0.55 : 1, fontFamily: FONT.sans,
                  }}>
                  <img src={pkgCover(p)} alt="" loading="lazy"
                    style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: 10, display: "block" }} />
                  <span className="block w-full text-center" style={{ ...T.h3, fontSize: 16, color: C.ink, paddingInline: 2 }}>
                    {p.name}
                  </span>
                  <span className="flex items-center justify-between w-full" style={{ gap: 6, paddingInline: 2, paddingBottom: 2 }}>
                    {/* اسم المدينة أولاً ثم الدبوس — كترتيب اللقطة في RTL */}
                    <span className="inline-flex items-center min-w-0" style={{ gap: 3, ...T.small, fontWeight: 400, color: C.ink2 }}>
                      <span className="truncate">{hotel?.city ?? p.destination}</span>
                      <MapPin size={13} style={{ flexShrink: 0 }} />
                    </span>
                    {sold
                      ? <span style={{ ...T.small, color: C.ink2, flexShrink: 0 }}>{t("soldOut")}</span>
                      : <span className="inline-flex items-baseline" style={{ gap: 3, flexShrink: 0, whiteSpace: "nowrap" }}>
                          {/* «يبدأ من» أخفت وأصغر من الرقم: هو تحفّظ على السعر
                              لا جزء منه، ولو ساواه وزناً لتنافس العنصران على العين
                              والرقم هو المقصود. */}
                          <span style={{ ...T.small, fontSize: 11, fontWeight: 400, color: C.ink2 }}>{t("from")}</span>
                          <span style={{ ...T.small, fontWeight: 600, color: C.green }}>
                            {money(minTotal(p))} {t("currency")}
                          </span>
                        </span>}
                  </span>
                </button>
              );
            })}
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
