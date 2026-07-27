import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Package } from "lucide-react";
import { B } from "@/lib/theme";
import { TasaheelMark } from "@/components/TasaheelMark";
import { Sidebar, NAV_ITEMS } from "@/components/Sidebar";
import { useStore } from "@/store/useStore";
import { HotelsPage } from "@/features/hotels";
import { TransportPage } from "@/features/transport";
import { UsersPage } from "@/features/users";
import { SupportPage } from "@/features/support";
import { TicketsPage } from "@/features/tickets";
import { PaymentsPage } from "@/features/payments";
import { BeneficiariesPage } from "@/features/beneficiaries";
import { PackagesPage } from "@/features/packages";
import { TripsPage } from "@/features/trips";
import { BranchesPage } from "@/features/branches";
import { BookingsPage } from "@/features/bookings";
import { LoginPage } from "@/features/auth/LoginPage";
import { isSupabaseEnabled } from "@/supabase/client";

function ComingSoonPage({view}:{view:string}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-screen gap-5" style={{color:B.muted}}>
      <div className="w-20 h-20 rounded-3xl flex items-center justify-center" style={{background:B.primary,border:`1px solid ${B.border2}`}}>
        <Package size={32} style={{color:B.gold,opacity:0.5}}/>
      </div>
      <div className="text-center">
        <p className="font-bold mb-1" style={{color:B.text3}}>صفحة "{view}" قيد البناء</p>
        <p className="text-sm" style={{color:B.muted}}>سيتم إضافتها قريباً</p>
      </div>
    </div>
  );
}

export function Splash() {
  return (
    <div dir="rtl" className="min-h-screen flex flex-col items-center justify-center gap-4"
      style={{fontFamily:"'IBM Plex Sans Arabic',system-ui,sans-serif",background:`linear-gradient(160deg,${B.primaryDeep} 0%,${B.primary} 60%,${B.black} 100%)`}}>
      <TasaheelMark size={56}/>
      <motion.span animate={{rotate:360}} transition={{repeat:Infinity,duration:0.9,ease:"linear"}}
        style={{width:22,height:22,border:"2.5px solid rgba(231,194,113,0.35)",borderTopColor:B.gold,borderRadius:"50%",display:"inline-block"}}/>
      <div className="text-xs" style={{color:B.gold,letterSpacing:2}}>جارٍ التحميل…</div>
    </div>
  );
}

export default function AdminApp() {
  const [activeView,setActiveView]=useState("bookings");
  const [navNonce,setNavNonce]=useState(0);
  const nav=(v:string)=>{setActiveView(v);setNavNonce(n=>n+1);};
  const transports = useStore(s=>s.transports);
  const hotels     = useStore(s=>s.hotels);
  const packages   = useStore(s=>s.packages);
  const trips      = useStore(s=>s.trips);
  const bookings   = useStore(s=>s.bookings);
  const authReady  = useStore(s=>s.authReady);
  const session    = useStore(s=>s.session);
  const loaded     = useStore(s=>s.loaded);
  const currentUser= useStore(s=>s.currentUser);
  const signOut    = useStore(s=>s.signOut);
  const [mobileSidebar,setMobileSidebar]=useState(false);

  const knownViews = ["hotels","transport","packages","trips","branches","bookings","beneficiaries","payments","tickets","users","support"];

  useEffect(()=>{ useStore.getState().initAuth(); },[]);
  useEffect(()=>{ if(isSupabaseEnabled && session) useStore.getState().hydrate(); },[session]);

  // بوابة الدخول (فقط عند تفعيل Supabase)
  if(isSupabaseEnabled){
    if(!authReady) return <Splash/>;
    if(!session)   return <LoginPage/>;
    if(!loaded)    return <Splash/>;
  }

  return (
    <div dir="rtl" lang="ar" className="flex min-h-screen"
      style={{fontFamily:"'IBM Plex Sans Arabic',system-ui,sans-serif",background:B.bg}}>
      <Sidebar active={activeView} onNav={nav} mobileOpen={mobileSidebar} onMobileClose={()=>setMobileSidebar(false)}
        currentUser={currentUser} onSignOut={signOut}/>
      <div className="flex-1 min-w-0" key={navNonce}>
        {activeView==="hotels"   && <HotelsPage onMenuOpen={()=>setMobileSidebar(true)}/>}
        {activeView==="transport"&& <TransportPage onMenuOpen={()=>setMobileSidebar(true)}/>}
        {activeView==="packages" && <PackagesPage transports={transports} hotels={hotels} onMenuOpen={()=>setMobileSidebar(true)}/>}
        {activeView==="trips"    && <TripsPage packages={packages} transports={transports} hotels={hotels} onMenuOpen={()=>setMobileSidebar(true)}/>}
        {activeView==="branches"       && <BranchesPage onMenuOpen={()=>setMobileSidebar(true)}/>}
        {activeView==="bookings"       && <BookingsPage packages={packages} trips={trips} onMenuOpen={()=>setMobileSidebar(true)}/>}
        {activeView==="beneficiaries"  && <BeneficiariesPage bookings={bookings} onMenuOpen={()=>setMobileSidebar(true)}/>}
        {activeView==="payments"       && <PaymentsPage onMenuOpen={()=>setMobileSidebar(true)}/>}
        {activeView==="tickets"        && <TicketsPage  onMenuOpen={()=>setMobileSidebar(true)}/>}
        {activeView==="users"          && <UsersPage    onMenuOpen={()=>setMobileSidebar(true)}/>}
        {activeView==="support"        && <SupportPage  onMenuOpen={()=>setMobileSidebar(true)}/>}
        {!knownViews.includes(activeView)&&<ComingSoonPage view={NAV_ITEMS.find(n=>n.view===activeView)?.label??""}/>}
      </div>
    </div>
  );
}
