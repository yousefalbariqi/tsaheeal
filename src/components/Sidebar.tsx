import { motion, AnimatePresence } from "motion/react";
import {
  Building2, LayoutDashboard, Package, Plane, Bus, BookOpen,
  Users, CreditCard, Ticket, Settings, Wrench, LogOut, X,
} from "lucide-react";
import { B } from "@/lib/theme";
import { TasaheelMark } from "@/components/TasaheelMark";

export const NAV_ITEMS = [
  { view:"dashboard",     label:"الرئيسية",       Icon:LayoutDashboard },
  { view:"packages",      label:"الباقات",         Icon:Package },
  { view:"trips",         label:"الرحلات",         Icon:Plane },
  { view:"transport",     label:"المواصلات",       Icon:Bus },
  { view:"hotels",        label:"الفنادق",         Icon:Building2 },
  { view:"bookings",      label:"الطلبات",         Icon:BookOpen },
  { view:"beneficiaries", label:"المستفيدون",      Icon:Users },
  { view:"payments",      label:"الفواتير",        Icon:CreditCard },
  { view:"tickets",       label:"التذاكر",         Icon:Ticket },
  { view:"users",         label:"المستخدمون",      Icon:Users },
  { view:"support",       label:"الدعم الفني",     Icon:Wrench },
  { view:"settings",      label:"الإعدادات",       Icon:Settings },
];

export function Sidebar({active,onNav,mobileOpen,onMobileClose,currentUser,onSignOut}:{active:string;onNav:(v:string)=>void;mobileOpen?:boolean;onMobileClose?:()=>void;currentUser?:{name:string;role:string}|null;onSignOut?:()=>void}) {
  const uName = currentUser?.name || "سالم أحمد";
  const uRole = currentUser?.role || "مدير النظام";
  const uInitial = uName.trim().charAt(0) || "س";
  const inner = (
    <aside className="flex flex-col h-full flex-shrink-0"
      style={{width:256,background:B.primaryDeep,borderLeft:`1px solid ${B.border2}`}}>
      <div style={{height:3,background:`linear-gradient(90deg,${B.gold},${B.gold2},${B.gold})`}}/>
      <div className="flex items-center gap-3 px-5 py-5">
        <TasaheelMark size={44}/>
        <div>
          <div style={{fontFamily:"'Noto Kufi Arabic',serif",fontSize:15,fontWeight:800,color:"#fff",lineHeight:1.3}}>تساهيل العمرة</div>
          <div style={{fontSize:9,color:B.gold,letterSpacing:3,marginTop:2}}>ADMIN PANEL</div>
        </div>
        {onMobileClose&&<button onClick={onMobileClose} className="mr-auto p-1.5 cursor-pointer rounded-lg" style={{background:"none",border:"none",color:"#9DBAB6"}}><X size={16}/></button>}
      </div>
      <div className="px-5 pb-2">
        <div style={{fontSize:10,color:"#6E938F",fontWeight:700,letterSpacing:2}}>القائمة الرئيسية</div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 flex flex-col gap-0.5 pb-4" style={{scrollbarWidth:"none"}}>
        {NAV_ITEMS.map(({view,label,Icon})=>{
          const on=view===active;
          return (
            <button key={view} onClick={()=>{onNav(view);onMobileClose?.();}}
              className="relative flex items-center gap-3 w-full text-right px-4 py-2.5 rounded-xl transition-all duration-150 cursor-pointer"
              style={{background:on?"rgba(192,134,44,0.14)":"transparent",border:on?"1px solid rgba(192,134,44,0.28)":"1px solid transparent",color:on?B.gold2:"#B4CFCB",fontWeight:on?700:500}}>
              {on && <div className="absolute right-0 top-2 bottom-2 w-0.5 rounded-full" style={{background:B.gold}}/>}
              <Icon size={15} style={{color:on?B.gold:"#9DBAB6",flexShrink:0}}/>
              <span className="text-sm">{label}</span>
            </button>
          );
        })}
      </nav>
      <div style={{height:1,background:B.border2,margin:"0 16px"}}/>
      <div className="flex items-center gap-3 px-4 py-4">
        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm"
          style={{background:`linear-gradient(135deg,${B.gold},${B.gold2})`,color:B.black}}>{uInitial}</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold truncate" style={{color:"#e8e0d4"}}>{uName}</div>
          <div className="text-xs" style={{color:"#86A8A4"}}>{uRole}</div>
        </div>
        <button onClick={onSignOut} title="تسجيل الخروج" className="p-1.5 rounded-lg cursor-pointer" style={{background:"transparent",border:"none",color:onSignOut?"#B4CFCB":"#6E938F"}}>
          <LogOut size={14}/>
        </button>
      </div>
    </aside>
  );
  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:flex h-screen sticky top-0">{inner}</div>
      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileOpen&&(
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            className="md:hidden fixed inset-0 z-50 flex"
            style={{background:"rgba(14,12,11,0.7)"}} onClick={onMobileClose}>
            <motion.div initial={{x:200}} animate={{x:0}} exit={{x:200}} transition={{type:"spring",stiffness:320,damping:32}}
              className="h-full" onClick={e=>e.stopPropagation()}>
              {inner}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
