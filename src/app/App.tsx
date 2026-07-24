import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Building2, MapPin, Star, Plus, Pencil, Trash2, X, Check,
  Wifi, UtensilsCrossed, ParkingCircle, Waves, Wind, Dumbbell, Coffee,
  ShieldCheck, BellRing, LayoutDashboard, Package, Plane, Bus, BookOpen,
  Users, CreditCard, Ticket, Settings, Wrench, Search, LogOut, ChevronRight,
  ImagePlus, UserCircle, Car, Armchair, Calendar, Hash,
  ChevronUp, ChevronDown, Copy, ArrowRight, Repeat, CalendarDays, ListChecks,
  Phone, Menu, User, Film, Archive, ArchiveRestore, Printer, Link2, Copy as CopyIcon,
} from "lucide-react";
import { B } from "@/lib/theme";
import type {
  VehicleMode, VehicleStatus, RoomKind, MediaKind,
  HotelFeature, HotelReview, HotelMedia, RoomType, Hotel,
  TransportFeature, TransportReview, Transport,
  PkgStatus, PkgDest, ProgramStage, RoomPrice, PkgReview, PkgFeature, Pkg,
  TripDriver, TripStatus, TripSettings, Trip,
  Beneficiary, Payment,
  Pilgrim, BookingStatus, PaymentStatus, Booking,
  TicketEntry, UserRole, SystemUser,
  SupportPriority, SupportStatus, SupportReq,
} from "@/types";
import { uid, money, formatKmValue, parseKmToMeters, distanceLabel, minPrice, waNormalize, openWhatsApp, copyText, payLinkFor, invVerifyUrl, parseYMD, ymd, tripDayColor, firstTwo, genderGlyph } from "@/lib/utils";
import { DEFAULT_TRIP_SETTINGS } from "@/data/trips";
import { StatusBadge, STATUS_MAP } from "@/components/StatusBadge";
import { TasaheelMark } from "@/components/TasaheelMark";
import { Sidebar, NAV_ITEMS } from "@/components/Sidebar";
import { StatCard } from "@/components/StatCard";
import { PageHeader } from "@/components/PageHeader";
import { DeleteDialog } from "@/components/DeleteDialog";
import { QRBlock } from "@/components/QRBlock";
import { useStore } from "@/store/useStore";
import { HotelsPage } from "@/features/hotels";
import { TransportPage } from "@/features/transport";
import { UsersPage } from "@/features/users";
import { SupportPage } from "@/features/support";
import { TicketCard, TicketsPage } from "@/features/tickets";
import { PaymentsPage, PAY_ACCOUNT, TASAHEEL_BRANCHES } from "@/features/payments";
import { BeneficiariesPage } from "@/features/beneficiaries";
import { PackagesPage } from "@/features/packages";
import { TripsPage } from "@/features/trips";
import { BookingsPage } from "@/features/bookings";
import { LoginPage } from "@/features/auth/LoginPage";
import { isSupabaseEnabled, supabase } from "@/supabase/client";

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

/* ════════════════════════════════════════════════════════════
   ROOT APP
════════════════════════════════════════════════════════════ */
/* ════════════════════════════════════════════════════════════
   PUBLIC PAYMENT CHECKOUT  — صفحة الدفع للعميل (/pay/:id)
════════════════════════════════════════════════════════════ */
const PAY_METHODS = [
  {id:"mada",label:"مدى",emoji:"💳",card:true},
  {id:"applepay",label:"Apple Pay",emoji:"",card:false},
  {id:"visa",label:"Visa / Mastercard",emoji:"💳",card:true},
  {id:"stcpay",label:"STC Pay",emoji:"📱",card:false},
];
function PayCheckoutPage({bookingId}:{bookingId:string}) {
  const pay = useStore(s=>s.payments).find(p=>p.bookingId===bookingId);
  const [method,setMethod]=useState<string>("");
  const [stage,setStage]=useState<"form"|"processing"|"success">("form");
  const [card,setCard]=useState({num:"",exp:"",cvv:""});
  const sel = PAY_METHODS.find(m=>m.id===method);
  const amount = pay ? pay.total.toLocaleString("en-US")+" ر.س" : "";
  const canPay = !!method && (!sel?.card || (card.num.replace(/\s/g,"").length>=12 && card.exp.length>=4 && card.cvv.length>=3));
  const doPay=async()=>{ if(!canPay) return; setStage("processing");
    if(isSupabaseEnabled && supabase){ try{ await supabase.rpc("confirm_payment",{p_booking_id:bookingId}); }catch(e){ console.error("confirm_payment",e); } }
    setTimeout(()=>setStage("success"),1600); };

  return (
    <div dir="rtl" lang="ar" className="min-h-screen flex items-start justify-center p-4"
      style={{fontFamily:"'IBM Plex Sans Arabic',system-ui,sans-serif",background:`linear-gradient(160deg,${B.primaryDeep} 0%,${B.primary} 55%,${B.black} 100%)`}}>
      <div className="w-full my-6" style={{maxWidth:440}}>
        {/* Brand */}
        <div className="text-center mb-5">
          <div style={{fontFamily:"'Noto Kufi Arabic',serif",fontSize:22,fontWeight:800,color:"#fff"}}>تساهيل العمرة</div>
          <div style={{fontSize:10,color:B.gold,letterSpacing:3,marginTop:2}}>TASAHEEL AL-UMRAH · SECURE PAYMENT</div>
        </div>

        {!pay ? (
          <div className="rounded-2xl p-8 text-center" style={{background:"#fff"}}>
            <X size={40} style={{color:"#BE2626",margin:"0 auto 12px"}}/>
            <div className="font-extrabold text-lg" style={{color:"#000"}}>رابط غير صالح</div>
            <div className="text-sm mt-1" style={{color:B.muted}}>لم يُعثر على طلب بهذا الرقم ({bookingId}).</div>
          </div>
        ) : stage==="success" ? (
          <motion.div initial={{opacity:0,scale:0.96}} animate={{opacity:1,scale:1}} className="rounded-2xl overflow-hidden" style={{background:"#fff"}}>
            <div className="flex flex-col items-center text-center px-6 py-9">
              <motion.div initial={{scale:0}} animate={{scale:1}} transition={{type:"spring",damping:14}} className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{background:"#E3F3E8"}}>
                <Check size={34} style={{color:"#1E7A44"}}/>
              </motion.div>
              <div className="font-extrabold text-xl" style={{color:"#000"}}>تم الدفع بنجاح</div>
              <div className="text-sm mt-1.5" style={{color:B.text2}}>شكراً لك، {pay.clientName}. تم استلام دفعتك.</div>
              <div className="w-full rounded-xl mt-5 p-4 flex flex-col gap-2 text-sm" style={{background:B.bg,border:`1px solid ${B.border}`}}>
                {[["رقم الطلب",pay.bookingId],["الباقة",pay.packageName],["طريقة الدفع",sel?.label??"—"],["المبلغ المدفوع",amount]].map(([l,v])=>(
                  <div key={l} className="flex items-center justify-between gap-2">
                    <span style={{color:B.muted}}>{l}</span>
                    <span className="font-bold" style={{color:"#000",fontFamily:"'IBM Plex Mono',monospace"}}>{v}</span>
                  </div>
                ))}
              </div>
              <div className="text-xs mt-4 leading-relaxed" style={{color:B.muted}}>سيصلك إشعار تأكيد عبر الرسائل، وستتحوّل حالة طلبك تلقائياً إلى «مكتمل».</div>
            </div>
            <div className="px-6 py-4 text-center text-xs font-bold" style={{borderTop:`1px solid ${B.border}`,color:B.text2}}>تساهيل العمرة · السجل التجاري: 1010537391 · tasaaheel.sa</div>
          </motion.div>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{background:"#fff"}}>
            {/* Order summary */}
            <div className="px-6 py-5" style={{borderBottom:`1px solid ${B.border}`}}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold" style={{color:B.muted}}>طلب رقم <span style={{fontFamily:"'IBM Plex Mono',monospace",color:B.text2}}>{pay.bookingId}</span></div>
                  <div className="font-extrabold text-base mt-0.5" style={{color:"#000"}}>{pay.packageName}</div>
                </div>
                <div className="text-left">
                  <div className="text-xs" style={{color:B.muted}}>المبلغ المطلوب</div>
                  <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:22,fontWeight:800,color:B.primary}}>{amount}</div>
                </div>
              </div>
            </div>
            {/* Methods */}
            <div className="px-6 py-5">
              <div className="text-sm font-extrabold mb-3" style={{color:"#000"}}>اختر طريقة الدفع</div>
              <div className="grid grid-cols-2 gap-2.5">
                {PAY_METHODS.map(m=>{
                  const on=method===m.id;
                  return (
                    <button key={m.id} onClick={()=>setMethod(m.id)}
                      className="flex items-center justify-center gap-1.5 py-3 rounded-xl text-sm font-bold cursor-pointer"
                      style={{background:on?"rgba(192,134,44,0.1)":"#fff",border:`1.5px solid ${on?B.gold:B.border}`,color:on?"#8a6a08":B.text2}}>
                      {m.emoji&&<span>{m.emoji}</span>}{m.label}
                    </button>
                  );
                })}
              </div>
              {/* Card form */}
              {sel?.card&&(
                <div className="mt-4 flex flex-col gap-2.5">
                  <div>
                    <label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>رقم البطاقة</label>
                    <input inputMode="numeric" value={card.num} onChange={e=>setCard(c=>({...c,num:e.target.value.replace(/[^0-9 ]/g,"").slice(0,19)}))}
                      placeholder="0000 0000 0000 0000" className="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none"
                      style={{borderColor:B.border,color:"#000",direction:"ltr",textAlign:"left",fontFamily:"'IBM Plex Mono',monospace"}}/>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div><label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>تاريخ الانتهاء</label>
                      <input inputMode="numeric" value={card.exp} onChange={e=>setCard(c=>({...c,exp:e.target.value.replace(/[^0-9/]/g,"").slice(0,5)}))}
                        placeholder="MM/YY" className="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none" style={{borderColor:B.border,color:"#000",direction:"ltr",textAlign:"left",fontFamily:"'IBM Plex Mono',monospace"}}/></div>
                    <div><label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>CVV</label>
                      <input inputMode="numeric" value={card.cvv} onChange={e=>setCard(c=>({...c,cvv:e.target.value.replace(/[^0-9]/g,"").slice(0,4)}))}
                        placeholder="123" className="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none" style={{borderColor:B.border,color:"#000",direction:"ltr",textAlign:"left",fontFamily:"'IBM Plex Mono',monospace"}}/></div>
                  </div>
                </div>
              )}
            </div>
            {/* Pay button */}
            <div className="px-6 pb-6">
              <button onClick={doPay} disabled={!canPay||stage==="processing"}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-extrabold text-sm"
                style={{background:canPay?B.gold:"#EEECEA",color:canPay?B.black:B.muted,border:"none",cursor:canPay?"pointer":"not-allowed"}}>
                {stage==="processing"
                  ? <><motion.span animate={{rotate:360}} transition={{repeat:Infinity,duration:0.9,ease:"linear"}} style={{width:15,height:15,border:"2px solid rgba(0,0,0,0.3)",borderTopColor:B.black,borderRadius:"50%",display:"inline-block"}}/>جارٍ المعالجة…</>
                  : <><ShieldCheck size={15}/>ادفع {amount}</>}
              </button>
              <div className="flex items-center justify-center gap-1.5 mt-3 text-xs" style={{color:B.muted}}>
                <ShieldCheck size={12}/>دفع آمن ومشفّر · الرابط صالح لمدة 24 ساعة
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Splash() {
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

export default function App() {
  const payMatch = typeof window!=="undefined" ? window.location.pathname.match(/^\/pay\/([^/]+)/) : null;
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

  const knownViews = ["hotels","transport","packages","trips","bookings","beneficiaries","payments","tickets","users","support"];

  // تهيئة الجلسة مرة واحدة
  useEffect(()=>{ useStore.getState().initAuth(); },[]);
  // جلب البيانات بعد توفّر جلسة صالحة (أو فوراً في وضع seed)
  useEffect(()=>{ if(isSupabaseEnabled && session) useStore.getState().hydrate(); },[session]);

  if(payMatch) return <PayCheckoutPage bookingId={decodeURIComponent(payMatch[1])}/>;

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
