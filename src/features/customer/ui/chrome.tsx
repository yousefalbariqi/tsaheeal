/* شريط الرأس والشريط السفلي لواجهة المستفيد.

   كانا مُعرَّفين داخل جسم CustomerApp. تعريف مكوّن داخل جسم مكوّن آخر
   يعني دالةً جديدة في كل رسم، وReact يقيس هوية نوع المكوّن لا شكله:
   نوعٌ جديد = شجرة جديدة، فيفكّ القديمة ويركّب الجديدة. النتيجة أن كل
   حرف يُكتب في أي حقل كان يعيد تركيب الشريطين — يفقد حالتهما الداخلية
   (قائمة اللغات المفتوحة) ويُعيد تشغيل حركاتهما.

   بإخراجهما إلى هنا صار النوع ثابتاً، فيُحدَّث الشريطان بدل أن يُركَّبا. */
import { memo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Globe, ChevronLeft, Check, Search, Heart, UserRound } from "lucide-react";
import { B } from "@/lib/theme";
import { TasaheelMark } from "@/components/TasaheelMark";
import { LANGS, type Lang } from "../i18n";
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
  return (
    <div className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3" style={{background:G.deep,color:"#fff"}}>
      {onBack
        ? <button onClick={onBack} className="p-1.5 rounded-lg cursor-pointer" style={{background:"rgba(255,255,255,.1)",border:"none",color:"#fff"}}><ChevronLeft size={18} style={{transform:dir==="rtl"?"scaleX(-1)":"none"}}/></button>
        : <TasaheelMark size={40}/>}
      <div className="flex-1 font-extrabold" style={{fontFamily:"var(--font-app)",fontSize:15}}>{title||t("brand")}</div>
      <div className="relative">
        <button onClick={()=>setLangOpen(v=>!v)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg cursor-pointer text-xs font-bold" style={{background:"rgba(255,255,255,.12)",border:"none",color:"#fff"}}><Globe size={14}/>{LANGS.find(l=>l.code===lang)?.label}</button>
        <AnimatePresence>
          {langOpen&&(
            <motion.div initial={{opacity:0,y:-6}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-6}}
              className="absolute left-0 mt-1 rounded-xl overflow-hidden z-40" style={{background:"#fff",border:`1px solid ${B.border}`,minWidth:130,boxShadow:"0 12px 30px -8px rgba(0,0,0,.3)"}}>
              {LANGS.map(l=>(
                <button key={l.code} onClick={()=>{onLang(l.code);setLangOpen(false);}} className="flex items-center justify-between gap-2 w-full px-3 py-2.5 text-sm cursor-pointer text-right"
                  style={{background:lang===l.code?B.bg:"#fff",border:"none",color:B.black,fontWeight:lang===l.code?700:500}}>{l.label}{lang===l.code&&<Check size={14} style={{color:G.green}}/>}</button>
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
export const BottomBar = memo(function BottomBar({ screen, onNav, t }: {
  screen: Screen;
  onNav: (s: Screen, pkgId?: string) => void;
  t: (k: string) => string;
}) {
  return (
    <div className="sticky bottom-0 z-30 grid grid-cols-3"
      style={{background:C.white,borderTop:`1px solid ${C.line}`,paddingBlock:8,
              paddingBottom:"calc(8px + env(safe-area-inset-bottom, 0px))"}}>
      {([["packages",Search,t("explore")],["track",Heart,t("myBookings")],["profile",UserRound,t("profile")]] as const).map(([sc,Icon,lbl])=>{
        const on=screen===sc;
        return (
          <button key={sc} onClick={()=>onNav(sc as Screen)}
            className="flex flex-col items-center gap-1 cursor-pointer"
            style={{background:"none",border:"none",paddingBlock:4,color:on?C.green:C.ink2}}>
            <Icon size={21} strokeWidth={on?2.2:1.7} fill={on&&sc==="track"?C.green:"none"}/>
            <span style={{fontSize:11,fontWeight:on?600:400}}>{lbl}</span>
          </button>
        );
      })}
    </div>
  );
});
