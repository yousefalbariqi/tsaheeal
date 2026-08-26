import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { Package, AlertTriangle, RotateCw, Lock } from "lucide-react";
import { Toaster } from "sonner";
import { B } from "@/lib/theme";
import { TasaheelMark } from "@/components/TasaheelMark";
import { hideBootSplash } from "@/lib/bootSplash";
import { Sidebar, NAV_ITEMS } from "@/components/Sidebar";
import { useRole } from "@/lib/useRole";
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
import { DashboardPage } from "@/features/dashboard";
import { SettingsPage } from "@/features/settings";
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

/* شاشة محجوزة للموظف الذي بلغ شاشةً إدارية بحتة. تُصفَّى هذه الشاشات من
   القائمة الجانبية، فالوصول إليها لا يقع إلا من حالة تنقّل قديمة أو من
   رابط مباشر بعد توجيه الموجة ٣ — والحجب لا يُترك للقائمة وحدها. */
function NoAccessPage({onMenuOpen}:{onMenuOpen?:()=>void}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-screen gap-5 px-6 text-center" style={{color:B.muted}}>
      <div className="w-20 h-20 rounded-3xl flex items-center justify-center" style={{background:B.primary,border:`1px solid ${B.border2}`}}>
        <Lock size={30} style={{color:B.gold,opacity:0.55}}/>
      </div>
      <div>
        <p className="font-bold mb-1" style={{color:B.text3}}>هذه الصفحة للمدير وحده</p>
        <p className="text-sm" style={{color:B.muted}}>راجع مدير النظام إن كنت تحتاج الوصول إليها.</p>
      </div>
      {onMenuOpen&&<button onClick={onMenuOpen} className="md:hidden text-sm font-bold px-5 py-2 rounded-xl cursor-pointer"
        style={{background:B.primary,color:B.gold,border:`1px solid ${B.border2}`}}>القائمة</button>}
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

/** الشاشة الافتراضية — الطلبات: أكثر ما يُفتح في اليوم. */
const DEFAULT_VIEW = "bookings";

export default function AdminApp() {
  /* الشاشة في المسار لا في الحالة: بلا ذلك كل شاشات اللوحة على /admin
     وحده — لا رابط شاشةٍ يُرسَل لموظف، ولا صفحة تُحفظ في المفضّلة، وزر
     الرجوع يخرج من اللوحة كلّها بدل أن يعود شاشة. */
  const location=useLocation();
  const navigate=useNavigate();
  const viewInPath=location.pathname.replace(/^\/admin\/?/,"").split("/")[0];
  const activeView=viewInPath||DEFAULT_VIEW;
  const [navNonce,setNavNonce]=useState(0);
  /* العدّاد يبقى: نقر الشاشة النشطة نفسها لا يغيّر المسار، وكان يعيد
     تركيب الصفحة فيصفّر نماذجها ومرشّحاتها — سلوك يعتمده الموظف. */
  const nav=(v:string)=>{ if(v!==activeView) navigate(`/admin/${v}`); setNavNonce(n=>n+1); };
  /* /admin وحده يُحوَّل إلى مساره الكامل — استبدالاً حتى لا يعيده زر الرجوع. */
  useEffect(()=>{ if(!viewInPath) navigate(`/admin/${DEFAULT_VIEW}`,{replace:true}); },[viewInPath,navigate]);
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

  const knownViews = ["dashboard","hotels","transport","packages","trips","branches","bookings","customRequests","beneficiaries","payments","tickets","users","support","settings"];

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
  /* الصلاحيات في الواجهة — مرآةٌ لحرس القاعدة لا بديل عنه. الشاشات
     المخفيّة تُحرَس مرّتين: تُصفَّى من القائمة، ويُردّ الوصول المباشر
     إليها (تنقّل قديم في الحالة، أو رابط لاحقاً بعد توجيه الموجة ٣). */
  const role = useRole();
  const navItems = NAV_ITEMS.filter(n => role.canView(n.view));
  const viewAllowed = role.canView(activeView);

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
        currentUser={currentUser} onSignOut={signOut} items={navItems}/>
      <div className="flex-1 min-w-0" key={navNonce}>
        {!viewAllowed && <NoAccessPage onMenuOpen={()=>setMobileSidebar(true)}/>}
        {viewAllowed && <>
        {activeView==="dashboard"&& <DashboardPage onMenuOpen={()=>setMobileSidebar(true)} onNav={nav}/>}
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
        {activeView==="settings"       && <SettingsPage onMenuOpen={()=>setMobileSidebar(true)}/>}
        {!knownViews.includes(activeView)&&<ComingSoonPage view={NAV_ITEMS.find(n=>n.view===activeView)?.label??""}/>}
        </>}
      </div>
      <SavingPill/>
      <Toaster position="bottom-center" dir="rtl" richColors closeButton
        toastOptions={{style:{fontFamily:"var(--font-app)"}}}/>
    </div>
  );
}
