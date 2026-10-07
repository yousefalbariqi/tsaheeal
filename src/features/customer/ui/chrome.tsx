/* شريط الرأس والشريط السفلي لواجهة المستفيد.

   كانا مُعرَّفين داخل جسم CustomerApp. تعريف مكوّن داخل جسم مكوّن آخر
   يعني دالةً جديدة في كل رسم، وReact يقيس هوية نوع المكوّن لا شكله:
   نوعٌ جديد = شجرة جديدة، فيفكّ القديمة ويركّب الجديدة. النتيجة أن كل
   حرف يُكتب في أي حقل كان يعيد تركيب الشريطين — يفقد حالتهما الداخلية
   (قائمة اللغات المفتوحة) ويُعيد تشغيل حركاتهما.

   بإخراجهما إلى هنا صار النوع ثابتاً، فيُحدَّث الشريطان بدل أن يُركَّبا. */
import { memo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Globe, ChevronLeft, Check, Search, Ticket, UserRound } from "lucide-react";
import { B, ELEV } from "@/lib/theme";
import { TasaheelMark } from "@/components/TasaheelMark";
import { LANGS, cityLabel, type Lang } from "../i18n";
import type { Screen } from "../routing";
import { C, G } from "./tokens";

/* قائمة اللغات حالة محليّة هنا لا في CustomerApp: لا يقرأها أحد غير هذا
   الشريط، ورفعها إلى الأعلى كان يعني رسم الشاشة كلها عند فتح القائمة. */
export function AppBar({ title, onBack, dir, lang, onLang, t }: {
  title?: string;
  onBack?: () => void;
  dir: "rtl" | "ltr";
  lang: Lang;
  onLang: (l: Lang) => void;
  t: (k: string) => string;
}) {
  const [langOpen, setLangOpen] = useState(false);
  /* السطح أسود الكسوة، فكل ما عليه عاجيّ (B.onInk) لا أبيض صريح، وأزراره
     44px. والحشوة العلوية تحترم نتوء الشاشة: الشريط لاصقٌ بأعلاها. */
  const ghost={background:"rgba(244,239,228,.12)",border:"none",color:B.onInk} as const;
  return (
    <div className="ts-mobile-appbar sticky top-0 z-30 flex items-center gap-3"
      style={{background:G.deep,color:B.onInk,paddingInline:16,paddingBottom:8,
        paddingTop:"calc(8px + env(safe-area-inset-top, 0px))"}}>
      {onBack
        ? <button type="button" onClick={onBack} aria-label={t("back")}
            className="flex items-center justify-center rounded-xl cursor-pointer flex-shrink-0"
            style={{...ghost,width:44,height:44}}><ChevronLeft size={20} style={{transform:dir==="rtl"?"scaleX(-1)":"none"}}/></button>
        : <TasaheelMark size={40}/>}
      <div className="flex-1 truncate" style={{fontFamily:"var(--font-app)",fontSize:17,fontWeight:600,color:B.onInk}}>{title||t("brand")}</div>
      <div className="relative flex-shrink-0">
        <button type="button" onClick={()=>setLangOpen(v=>!v)} aria-label={t("language")} aria-expanded={langOpen}
          className="flex items-center gap-1.5 rounded-xl cursor-pointer"
          style={{...ghost,height:44,paddingInline:12,fontFamily:"var(--font-app)",fontSize:14}}><Globe size={16}/>{LANGS.find(l=>l.code===lang)?.label}</button>
        <AnimatePresence>
          {langOpen&&(
            <motion.div initial={{opacity:0,y:-6}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-6}} transition={{duration:.16,ease:"easeOut"}}
              className="absolute mt-1 rounded-xl overflow-hidden z-40" style={{insetInlineEnd:0,background:"#fff",border:`1px solid ${B.border}`,minWidth:150,boxShadow:ELEV[3]}}>
              {LANGS.map(l=>(
                <button type="button" key={l.code} onClick={()=>{onLang(l.code);setLangOpen(false);}} className="flex items-center justify-between gap-2 w-full cursor-pointer"
                  style={{minHeight:44,paddingInline:14,textAlign:"start",fontFamily:"var(--font-app)",fontSize:15,
                    background:lang===l.code?B.fill:"#fff",border:"none",color:B.black,fontWeight:lang===l.code?600:400}}>{l.label}{lang===l.code&&<Check size={16} style={{color:C.greenDeep}}/>}</button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* الشريط السفلي — بنمطهم: أيقونة خطية فوق نص صغير، والنشط ملوّن ومعبّأ.

   memo يفيد فعلاً هنا: كل خصائصه ثابتة الهوية (`onNav` من useCallback،
   و`t` من useMemo)، فلا يُرسم إلا حين تتغيّر الشاشة أو اللغة — لا مع كل
   حرف يُكتب في نموذج المعتمرين. */
export const BottomBar = memo(function BottomBar({ screen, home, onNav, t }: {
  screen: Screen;
  /** الشاشة التي يعنيها تبويب «استكشاف». خاصيّةٌ لا ثابتٌ مكتوب: نقل
      الرئيسية يبقى تعديلَ سطرٍ واحد في routing.ts. */
  home: Screen;
  onNav: (s: Screen, pkgId?: string) => void;
  t: (k: string) => string;
}) {
  const tabs: readonly (readonly [Screen, typeof Search, string])[] = [
    [home, Search, t("explore")],
    ["track", Ticket, t("myBookings")],
    ["profile", UserRound, t("profile")],
  ];
  /* النشط بالذهبي العميق لا ذهبي الشعار: نصّ 12px بذهبي الشعار على
     الأبيض ٣٫١:١ ولا يُقرأ. ويُعلَّم بشرطةٍ فوقه فلا يحمل اللونُ وحده المعنى. */
  return (
    <nav className="ts-mobile-bottom-bar sticky bottom-0 z-30 grid grid-cols-3" 
      style={{background:C.white,borderTop:`1px solid ${C.line}`,
              paddingBottom:"env(safe-area-inset-bottom, 0px)"}}>
      {tabs.map(([sc,Icon,lbl])=>{
        const on=screen===sc;
        return (
          <button type="button" key={sc} onClick={()=>onNav(sc)} aria-current={on?"page":undefined}
            className="relative flex flex-col items-center justify-center cursor-pointer"
            style={{background:"none",border:"none",minHeight:58,gap:3,fontFamily:"var(--font-app)",color:on?C.greenDeep:C.ink2}}>
            {on&&<span aria-hidden style={{position:"absolute",top:0,width:28,height:2.5,borderRadius:2,background:C.gold}}/>}
            <Icon size={22} strokeWidth={on?2.1:1.7}/>
            <span style={{fontSize:12,lineHeight:1.3,fontWeight:on?600:400}}>{lbl}</span>
          </button>
        );
      })}
    </nav>
  );
});

/** تنقّل الديسكتوب مستقل عن شريط الجوال: لا نضغط أزرار الهاتف في عرض واسع.

    بنيته من صفحة نتائج Booking: الشعار، ثم الوجهات (مكة · المدينة) تنقّلاً
    أوّل، ثم في الطرف اللغة والعملة ثم الدخول وإنشاء الحساب. ولا مُنتقي
    تواريخ — رحلتنا تبدأ من الباقة لا من فندقٍ بتاريخٍ يُبحث عنه.

    والوجهة تنقّلٌ لا فلترٌ محلّي: الضغط على «مكة» من شاشة الحجوزات يعيدك
    إلى الرحلات مصفّاةً، فحالتها في CustomerApp لا في شاشة الاستكشاف. */
export function DesktopNav({ screen, home, onNav, lang, setLang, t, cities, city, setCity, signedIn, onLogin, onSignup }: {
  screen: Screen;
  /** الشاشة التي يعود إليها الشعار والوجهات — انظر BottomBar. */
  home: Screen;
  onNav: (s: Screen, pkgId?: string) => void;
  lang: Lang; setLang: (lang: Lang) => void; t: (k: string) => string;
  cities: string[]; city: string; setCity: (c: string) => void;
  signedIn: boolean; onLogin: () => void; onSignup: () => void;
}) {
  const go = (c: string) => { setCity(c); onNav(home); };
  const onPackages = screen === home;
  return <header className="ts-desktop-nav">
    <div className="ts-desktop-nav-inner">
      <button className="ts-brand" onClick={() => go("")} aria-label={t("brand")}>
        <TasaheelMark size={54} plain />
        <span><b>{t("brand")}</b><small>{lang === "ar" ? "رحلتك المباركة، بخطوات واثقة" : "Your Umrah, clearly arranged"}</small></span>
      </button>
      <nav aria-label={lang === "ar" ? "التنقل الرئيسي" : "Primary navigation"}>
        <button className={onPackages && !city ? "active" : ""} aria-current={onPackages && !city ? "page" : undefined}
          onClick={() => go("")}>{lang === "ar" ? "الرحلات" : "Trips"}</button>
        {cities.map(c => (
          <button key={c} className={onPackages && city === c ? "active" : ""} aria-current={onPackages && city === c ? "page" : undefined}
            onClick={() => go(c)}>{cityLabel(c, lang)}</button>
        ))}
      </nav>
      <div className="ts-desktop-nav-actions">
        {/* العملة تُقال ولا تُبدَّل: الأسعار بالريال وحده، ومُنتقي عملاتٍ
            بلا أسعار تحويل يعِد بما لا يقع. */}
        <span className="ts-currency" title={t("pricesInSar")}>{t("currency")}</span>
        <button onClick={() => setLang(lang === "ar" ? "en" : "ar")}><Globe size={15}/>{lang === "ar" ? "العربية" : "English"}</button>
        {signedIn ? <>
          <button className={screen === "track" ? "on" : ""} onClick={() => onNav("track")}><Ticket size={15}/>{t("myBookings")}</button>
          <button className="account" onClick={() => onNav("profile")}><UserRound size={15}/>{t("profile")}</button>
        </> : <>
          <button onClick={onSignup}>{t("signup")}</button>
          <button className="primary" onClick={onLogin}>{t("login")}</button>
        </>}
      </div>
    </div>
  </header>;
}
