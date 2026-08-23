import { useState, useEffect } from "react";
import { Package, AlertTriangle, RotateCw } from "lucide-react";
import { Toaster } from "sonner";
import { B } from "@/lib/theme";
import { TasaheelMark } from "@/components/TasaheelMark";
import { hideBootSplash } from "@/lib/bootSplash";
import { Sidebar, NAV_ITEMS } from "@/components/Sidebar";
import { useStore } from "@/store/useStore";
import { HotelsPage } from "@/features/hotels";
import { TransportPage } from "@/features/transport";
import { UsersPage } from "@/features/users";
import { SupportPage } from "@/features/support";
import { CustomRequestsPage } from "@/features/customRequests";
import { TicketsPage } from "@/features/tickets";
import { PaymentsPage } from "@/features/payments";
import { BeneficiariesPage } from "@/features/beneficiaries";
import { PackagesPage } from "@/features/packages";
import { TripsPage } from "@/features/trips";
import { BranchesPage } from "@/features/branches";
import { BookingsPage } from "@/features/bookings";
import { LoginPage } from "@/features/auth/LoginPage";
import { isSupabaseEnabled } from "@/supabase/client";
import { Spinner } from "@/components/Spinner";

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

/* حساب مصادَق بلا صف في profiles — مستفيد دخل بجواله، أو موظف لم
   يُربط بعد. لا يُترك على شاشة الدخول (فهو داخل فعلاً) ولا يُدخل اللوحة. */
function NotStaffScreen({onSignOut}:{onSignOut:()=>void}) {
  return (
    <div dir="rtl" className="min-h-screen flex flex-col items-center justify-center gap-5 px-6 text-center"
      style={{fontFamily:"var(--font-app)",background:B.bg}}>
      <TasaheelMark size={64}/>
      <div>
        <p className="font-bold mb-1" style={{color:B.text3}}>هذا الحساب ليس من فريق العمل</p>
        <p className="text-sm" style={{color:B.muted}}>لوحة الإدارة متاحة لحسابات الموظفين فقط. إن كنت مستفيداً فتابع من الصفحة الرئيسية.</p>
      </div>
      <div className="flex items-center gap-2.5">
        <a href="/" className="px-5 py-2.5 rounded-xl font-bold text-sm no-underline"
          style={{background:B.gold,color:B.black}}>الصفحة الرئيسية</a>
        <button onClick={onSignOut} className="px-5 py-2.5 rounded-xl font-bold text-sm cursor-pointer"
          style={{background:"#fff",border:`1px solid ${B.border}`,color:B.text3}}>تسجيل الخروج</button>
      </div>
    </div>
  );
}

/* فشل جلب البيانات. كانت هذه الحالة تعيد null فتبقى الصفحة بيضاء بلا أي
   إشارة — لا رسالة ولا زر، والخطأ في الطرفية وحدها. */
function LoadErrorScreen({message,onRetry}:{message:string;onRetry:()=>void}) {
  const [busy,setBusy]=useState(false);
  const retry=async()=>{ setBusy(true); await onRetry(); setBusy(false); };
  return (
    <div dir="rtl" className="min-h-screen flex flex-col items-center justify-center gap-5 px-6 text-center"
      style={{fontFamily:"var(--font-app)",background:B.bg}}>
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{background:"#FBE6E6",border:"1px solid #F3C9C9"}}>
        <AlertTriangle size={28} style={{color:"#BE2626"}}/>
      </div>
      <div style={{maxWidth:460}}>
        <p className="font-bold mb-1" style={{color:B.text3}}>تعذّر جلب بيانات اللوحة</p>
        <p className="text-sm" style={{color:B.muted}}>{message}</p>
      </div>
      <button onClick={retry} disabled={busy}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm cursor-pointer"
        style={{background:B.gold,color:B.black,border:"none",opacity:busy?0.7:1}}>
        {busy?<Spinner size={14} color={B.black}/>:<RotateCw size={14}/>}إعادة المحاولة
      </button>
    </div>
  );
}

/* مؤشّر الكتابة الجارية — الحفظ تفاؤليّ، فبدونه لا يعرف الموظف أن هناك
   عملية لم تصل القاعدة بعد. */
function SavingPill() {
  const syncing = useStore(s=>s.syncing);
  if (!syncing) return null;
  return (
    <div className="fixed bottom-5 left-5 z-50 flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold"
      style={{background:B.black,color:"#fff",boxShadow:"0 4px 16px rgba(0,0,0,0.2)"}}>
      <Spinner size={12} color="#fff" track="rgba(255,255,255,0.25)"/>جارٍ الحفظ…
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
  const isStaff    = useStore(s=>s.isStaff);
  const profileReady = useStore(s=>s.profileReady);
  const loaded     = useStore(s=>s.loaded);
  const loadError  = useStore(s=>s.loadError);
  const currentUser= useStore(s=>s.currentUser);
  const signOut    = useStore(s=>s.signOut);
  const [mobileSidebar,setMobileSidebar]=useState(false);

  const knownViews = ["hotels","transport","packages","trips","branches","bookings","customRequests","beneficiaries","payments","tickets","users","support"];

  useEffect(()=>{ useStore.getState().initAuth(); },[]);
  /* الجلب بعد ثبوت أنه موظف — سياسات RLS لا تعيد شيئاً لغيره، فالجلب
     قبل ذلك يُظهر لوحة فارغة ويستهلك طلبات بلا فائدة. */
  useEffect(()=>{ if(isSupabaseEnabled && isStaff) useStore.getState().hydrate(); },[isStaff]);
  /* الاشتراك اللحظي بعد ثبوت أنه موظف — سياسات RLS لا تبثّ لغيره. */
  useEffect(()=>{
    if(!isSupabaseEnabled || !isStaff) return;
    return useStore.getState().startLiveSync();
  },[isStaff]);

  /* المراحل الثلاث التي كانت تعرض Splash — تُعيد null الآن وتبقى شاشة
     البدء في index.html فوقها، فلا شاشة تحميل ثانية. شاشتا الدخول و«ليس
     موظفاً» ليستا انتظاراً بل وجهة، فتُزال الشاشة عندهما. */
  const booting = isSupabaseEnabled &&
    (!authReady || (!!session && (!profileReady || (isStaff && !loaded && !loadError))));
  useEffect(()=>{ if(!booting) hideBootSplash(); },[booting]);

  // بوابة الدخول (فقط عند تفعيل Supabase)
  if(isSupabaseEnabled){
    if(!authReady)    return null;
    if(!session)      return <LoginPage/>;
    if(!profileReady) return null;
    if(!isStaff)      return <NotStaffScreen onSignOut={signOut}/>;
    if(loadError)     return <LoadErrorScreen message={loadError} onRetry={()=>useStore.getState().hydrate()}/>;
    if(!loaded)       return null;
  }

  return (
    <div dir="rtl" lang="ar" className="flex min-h-screen"
      style={{fontFamily:"var(--font-app)",background:B.bg}}>
      <Sidebar active={activeView} onNav={nav} mobileOpen={mobileSidebar} onMobileClose={()=>setMobileSidebar(false)}
        currentUser={currentUser} onSignOut={signOut}/>
      <div className="flex-1 min-w-0" key={navNonce}>
        {activeView==="hotels"   && <HotelsPage onMenuOpen={()=>setMobileSidebar(true)}/>}
        {activeView==="transport"&& <TransportPage onMenuOpen={()=>setMobileSidebar(true)}/>}
        {activeView==="packages" && <PackagesPage transports={transports} hotels={hotels} onMenuOpen={()=>setMobileSidebar(true)}/>}
        {activeView==="trips"    && <TripsPage packages={packages} transports={transports} hotels={hotels} onMenuOpen={()=>setMobileSidebar(true)}/>}
        {activeView==="branches"       && <BranchesPage onMenuOpen={()=>setMobileSidebar(true)}/>}
        {activeView==="bookings"       && <BookingsPage packages={packages} trips={trips} onMenuOpen={()=>setMobileSidebar(true)}/>}
        {activeView==="customRequests" && <CustomRequestsPage onMenuOpen={()=>setMobileSidebar(true)}/>}
        {activeView==="beneficiaries"  && <BeneficiariesPage bookings={bookings} onMenuOpen={()=>setMobileSidebar(true)}/>}
        {activeView==="payments"       && <PaymentsPage onMenuOpen={()=>setMobileSidebar(true)}/>}
        {activeView==="tickets"        && <TicketsPage  onMenuOpen={()=>setMobileSidebar(true)}/>}
        {activeView==="users"          && <UsersPage    onMenuOpen={()=>setMobileSidebar(true)}/>}
        {activeView==="support"        && <SupportPage  onMenuOpen={()=>setMobileSidebar(true)}/>}
        {!knownViews.includes(activeView)&&<ComingSoonPage view={NAV_ITEMS.find(n=>n.view===activeView)?.label??""}/>}
      </div>
      <SavingPill/>
      <Toaster position="bottom-center" dir="rtl" richColors closeButton
        toastOptions={{style:{fontFamily:"var(--font-app)"}}}/>
    </div>
  );
}
