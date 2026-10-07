import { motion, AnimatePresence } from "motion/react";
import {
  Building2, Building, LayoutDashboard, Package, Plane, Bus, BookOpen,
  Users, Settings, LifeBuoy, LogOut, X, Sparkles, ClipboardList,
} from "lucide-react";
import { B, DUR, EASE } from "@/lib/theme";
import { TasaheelMark } from "@/components/TasaheelMark";

/* البنود مجموعةً بما يفعله الموظف لا بترتيب بنائها:
   «التشغيل» ما يُفتح كل يوم، «المنتجات» ما يُبنى مرّةً ويُراجَع، «النظام»
   ما يخصّ المدير. كانت اثني عشر بنداً في عمودٍ واحد بلا فاصل، والطلبات —
   أكثرها استعمالاً — ثامنةً بين الفنادق والدعم. */
export const NAV_ITEMS = [
  { view:"dashboard",     label:"الرئيسية",        Icon:LayoutDashboard, group:"التشغيل" },
  { view:"bookings",      label:"الطلبات",          Icon:BookOpen,        group:"التشغيل" },
  { view:"customRequests",label:"الطلبات المخصّصة",  Icon:Sparkles,        group:"التشغيل" },
  { view:"trips",         label:"الرحلات",          Icon:Plane,           group:"التشغيل" },
  { view:"manifests",     label:"الكشوفات",         Icon:ClipboardList,   group:"التشغيل" },
  { view:"packages",      label:"الباقات",          Icon:Package,         group:"المنتجات" },
  { view:"hotels",        label:"الفنادق",          Icon:Building2,       group:"المنتجات" },
  { view:"transport",     label:"المواصلات",        Icon:Bus,             group:"المنتجات" },
  { view:"branches",      label:"الفروع",           Icon:Building,        group:"المنتجات" },
  /* المستفيد والفاتورة والتذكرة ليست وحدات عمل مستقلة:
     الطلب هو المعاملة، وملف المستفيد/المستندات تُفتح من داخله. تبقى
     مساراتها المباشرة لروابط الطباعة والتدقيق القديمة، لا للقائمة. */
  { view:"users",         label:"المستخدمون",       Icon:Users,           group:"النظام" },
  { view:"support",       label:"الدعم الفني",      Icon:LifeBuoy,        group:"النظام" },
  { view:"settings",      label:"الإعدادات",        Icon:Settings,        group:"النظام" },
];

/* items يُمرَّر من الخارج ليُصفَّى بالدور — القائمة نفسها لا تعرف
   الصلاحيات، والافتراضي هو الكل كي تبقى قابلة للاستعمال بلا سياق.
   badges: عدٌّ بجانب البند (طلباتٌ تنتظر قراراً) — يُحسب في الجذر. */
export function Sidebar({active,onNav,mobileOpen,onMobileClose,currentUser,onSignOut,items=NAV_ITEMS,badges}:{active:string;onNav:(v:string)=>void;mobileOpen?:boolean;onMobileClose?:()=>void;currentUser?:{name:string;role:string}|null;onSignOut?:()=>void;items?:typeof NAV_ITEMS;badges?:Record<string,number>}) {
  /* الافتراضي أدنى صلاحية لا أعلاها: currentUser فارغ يعني «لم نعرف بعد»،
     وترجمته إلى «مدير النظام» تجعل الواجهة تفشل مفتوحةً — تعرض للمجهول ما
     لا يعرضه إلا للمدير. واسم تجريبي ثابت هنا يظهر لمستخدم حقيقي. */
  const uName = currentUser?.name || "مستخدم";
  const uRole = currentUser?.role || "موظف";
  const uInitial = uName.trim().charAt(0) || "م";

  const panel = (mobile:boolean) => (
    <aside className="ts-side flex flex-col h-full flex-shrink-0" aria-label="القائمة الرئيسية"
      style={{width:mobile?284:256,background:B.ink,color:B.onInk}}>
      {/* حزام الكسوة — خيطٌ ذهبيّ واحد في أعلى السطح الأسود. */}
      <div aria-hidden style={{height:2,background:`linear-gradient(90deg,transparent,${B.gold} 18%,${B.gold2} 50%,${B.gold} 82%,transparent)`}}/>
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <TasaheelMark size={40}/>
        <div className="min-w-0 flex-1">
          <div style={{fontSize:15,fontWeight:700,color:B.onInk,lineHeight:1.35}}>تساهيل العمرة</div>
          <div style={{fontSize:11.5,color:B.onInk3,lineHeight:1.4}}>لوحة الإدارة</div>
        </div>
        {mobile&&onMobileClose&&<button onClick={onMobileClose} aria-label="إغلاق القائمة" title="إغلاق القائمة" className="ui-iconbtn ui-iconbtn--on-ink"><X size={18}/></button>}
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-4" style={{scrollbarWidth:"none"}}>
        {items.map(({view,label,Icon,group},i)=>{
          const on=view===active;
          const head=group&&group!==items[i-1]?.group;
          const n=badges?.[view]??0;
          return (
            <div key={view}>
              {head&&<div className="px-3" style={{fontSize:11,fontWeight:600,color:B.onInk3,marginTop:i===0?6:18,marginBottom:6}}>{group}</div>}
              <button onClick={()=>{onNav(view);onMobileClose?.();}} aria-current={on?"page":undefined}
                className={`ts-side-item${on?" is-on":""}`}>
                <Icon size={17} strokeWidth={on?2:1.75} aria-hidden style={{flexShrink:0}}/>
                <span className="flex-1 text-start truncate">{label}</span>
                {n>0&&<span className="ts-side-badge" aria-label={`${n} بانتظار إجراء`}>{n>99?"99+":n}</span>}
              </button>
            </div>
          );
        })}
      </nav>
      <div className="px-3 pb-3">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{background:B.ink2,border:`1px solid ${B.inkLine}`}}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            style={{background:B.gold,color:B.ink,fontSize:13,fontWeight:700}}>{uInitial}</div>
          <div className="flex-1 min-w-0">
            <div className="truncate" style={{fontSize:13,fontWeight:600,color:B.onInk,lineHeight:1.4}}>{uName}</div>
            <div className="truncate" style={{fontSize:11.5,color:B.onInk3,lineHeight:1.4}}>{uRole}</div>
          </div>
          <button onClick={onSignOut} disabled={!onSignOut} aria-label="تسجيل الخروج" title="تسجيل الخروج" className="ui-iconbtn ui-iconbtn--sm ui-iconbtn--on-ink">
            <LogOut size={15}/>
          </button>
        </div>
      </div>
    </aside>
  );
  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:flex h-screen sticky top-0">{panel(false)}</div>
      {/* Mobile overlay — درجٌ للتنقّل لا نموذج: النقر خارجه يُغلقه. */}
      <AnimatePresence>
        {mobileOpen&&(
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:DUR.fast}}
            className="md:hidden fixed inset-0 z-50 flex"
            style={{background:"rgba(20,17,14,.56)",backdropFilter:"blur(2px)"}}
            onClick={onMobileClose}>
            <motion.div initial={{x:"100%"}} animate={{x:0}} exit={{x:"100%"}} transition={{duration:DUR.slow,ease:EASE}}
              className="h-full" onClick={e=>e.stopPropagation()}>
              {panel(true)}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
