import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Globe, ChevronLeft, Check, Users, X, Search, Heart, UserRound, ArrowLeft } from "lucide-react";
import { B } from "@/lib/theme";
import type { Pkg, Trip, RoomPrice } from "@/types";
import { TasaheelMark } from "@/components/TasaheelMark";
import { QRBlock } from "@/components/QRBlock";
import { NationalitySelect } from "@/components/NationalitySelect";
import { BirthDateSelect } from "@/components/BirthDateSelect";
import { SearchSelect } from "@/components/SearchSelect";
import { DOC_TYPES, docTypeDef, docText, type DocType } from "@/data/docTypes";
import { BusSeatGrid } from "@/components/BusSeatGrid";
import { WhatsAppFab } from "@/components/WhatsAppFab";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/app/components/ui/input-otp";
import { LANGS, dirOf, makeT, type Lang } from "./i18n";
import { fetchCatalog, submitBooking, fetchTakenSeats, myBookings, SeatsError, type Catalog, type TrackResult } from "./data";
import { sendOtp, verifyOtp, loadSession, saveSession, clearSession, DEV_OTP_HINT } from "./otp";
import { DirProvider } from "./ui/kit";
import { C } from "./ui/tokens";
import { Explore } from "./screens/Explore";
import { Listing } from "./screens/Listing";
import { CustomRequestScreen } from "./screens/CustomRequest";

const G = { deep:"#0B5A41", dark:"#073A2B", green:B.primary, gold:B.gold, bg:"#F5F3EE" };
/* "listing" هي الصفحة trip + seat + room. */
type Screen = "packages"|"listing"|"custom"|"passengers"|"seats"|"review"|"success"|"track"|"profile"|"login"|"otp";
interface Pax { name:string; phone:string; docType:DocType|""; idNumber:string; nationality:string;
  birthDate:string; gender:"male"|"female"; ageGroup:"adult"|"child"; seat:number|null; }
const emptyPax=():Pax=>({name:"",phone:"",docType:"",idNumber:"",nationality:"",birthDate:"",gender:"male",ageGroup:"adult",seat:null});
const money=(n:number)=>Math.round(n).toLocaleString("en-US");
const availSeats=(t:Trip)=>Math.max(0,t.seats-t.bookedSeats);
const validPhone=(p:string)=>/^(05\d{8}|(\+?966)5\d{8})$/.test(p.replace(/\s/g,""));
const validName=(s:string)=>s.trim().split(/\s+/).filter(Boolean).length>=2&&s.trim().length>=5;

/* تحقق حقول المعتمر — رسالة لكل حقل تظهر تحته مباشرة.
   جوال المعتمر الأول إلزامي (هو جوال التواصل والتتبّع)، وبقية المرافقين اختياري. */
type PaxField="name"|"phone"|"docType"|"idNumber"|"nationality"|"birthDate"|"gender"|"ageGroup";
/** الطفل لا يُطلب جواله إطلاقاً؛ والبالغ الأول جواله إلزامي لأنه جوال التواصل. */
const phoneRequired=(p:Pax,first:boolean)=>p.ageGroup!=="child"&&first;
function paxErrors(p:Pax,first:boolean,t:(k:string)=>string,lang:string):Partial<Record<PaxField,string>>{
  const e:Partial<Record<PaxField,string>>={};
  if(!p.name.trim()) e.name=t("required"); else if(!validName(p.name)) e.name=t("nameErr");
  if(phoneRequired(p,first)){ if(!p.phone.trim()) e.phone=t("required"); else if(!validPhone(p.phone)) e.phone=t("invalidPhone"); }
  else if(p.phone.trim()&&!validPhone(p.phone)) e.phone=t("invalidPhone");
  if(!p.docType) e.docType=t("required");
  else { const d=docTypeDef(p.docType);
    if(!p.idNumber.trim()) e.idNumber=t("required");
    else if(!d.test(p.idNumber.trim())) e.idNumber=docText(d.error,lang); }
  if(!p.nationality) e.nationality=t("required");
  if(!p.birthDate) e.birthDate=t("required");
  return e;
}

/* اختيار من خيارين بشكل شريط مقسوم — أسرع من قائمة منسدلة لخيارين. */
function SegPick({value,onChange,options,dir}:{value:string;onChange:(v:string)=>void;options:{value:string;label:string}[];dir:"rtl"|"ltr"}){
  return (
    <div className="flex gap-1 p-1 rounded-xl" style={{background:B.bg,border:`1px solid ${B.border}`,direction:dir}}>
      {options.map(o=>{
        const on=value===o.value;
        return (
          <button key={o.value} type="button" onClick={()=>onChange(o.value)} aria-pressed={on}
            style={{flex:1,padding:"7px 6px",borderRadius:10,fontSize:13,fontWeight:700,border:"none",fontFamily:"inherit",
              cursor:"pointer",background:on?"#fff":"transparent",color:on?B.primary:B.muted,
              boxShadow:on?"0 1px 3px rgba(0,0,0,.08)":"none"}}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* حقل معنون: عنوان فوق المربع + نص إرشادي تحته يتحوّل إلى رسالة خطأ عند الحاجة.
   مُعرَّف خارج المكوّن الرئيسي حتى لا يفقد الإدخال التركيز عند إعادة الرسم. */
function LField({label,hint,error,optional,children}:{label:string;hint?:string;error?:string;optional?:string;children:ReactNode}){
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-bold flex items-center gap-1" style={{color:B.text3}}>
        {label}
        {optional
          ? <span className="font-medium" style={{color:B.muted}}>({optional})</span>
          : <span style={{color:"#C13515"}}>*</span>}
      </label>
      {children}
      {error
        ? <span className="text-[11px] font-bold" style={{color:"#C13515"}}>{error}</span>
        : hint ? <span className="text-[11px]" style={{color:B.muted}}>{hint}</span> : null}
    </div>
  );
}

const AR_MONTHS=["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const AR_WEEK=["س","ح","ن","ث","ر","خ","ج"];
const TRACK_STEPS=["stepReview","stepAccepted","stepAwaitPay","stepPaid","stepConfirmed","stepTicket"];
const statusToStep=(s:string):number=>({reviewing:0,new:0,accepted:1,awaiting_payment:2,paid:3,confirmed:4,verified:4}[s] ?? 0);

const TERMS_AR = `شروط وأحكام حجز العمرة — تساهيل العمرة (نموذج مبدئي يُعدّل لاحقاً)

1) الحجز والتأكيد:
- يُعدّ الطلب مبدئياً «قيد المراجعة» حتى يعتمده الموظف المختص.
- يلتزم المستفيد بتقديم بيانات صحيحة (الاسم، الهوية/الجواز، الجوال) وتحمّل مسؤولية صحتها.

2) الدفع:
- يُرسَل رابط الدفع بعد قبول الطلب، ويجب سداده خلال المهلة المحددة وإلا يُلغى الحجز تلقائياً.
- الأسعار تشمل ما هو موضّح في الباقة فقط.

3) الإلغاء والاسترداد:
- الإلغاء المجاني متاح قبل موعد الرحلة وفق سياسة الباقة المعروضة.
- لا يُسترد المبلغ بعد إصدار التذكرة أو انطلاق الرحلة.

4) المقاعد والسكن:
- يُخصّص المقعد المختار للمستفيد، وقد تُجرى تعديلات تشغيلية طارئة عند الضرورة.
- نوع السكن حسب الباقة والفندق المرتبط بها.

5) المسؤولية:
- تلتزم المؤسسة ببذل العناية المعتادة، ولا تتحمل مسؤولية الظروف الخارجة عن إرادتها (الطقس، الزحام، القرارات الرسمية).

6) الخصوصية:
- تُستخدم بيانات المستفيد لأغراض الحجز والتواصل فقط ولا تُشارك مع طرف ثالث دون موجب نظامي.

باستمرارك تُقرّ بأنك اطلعت على هذه الشروط ووافقت عليها.`;

function roomLabel(r:RoomPrice){ return r.type + (r.persons?` · ${r.persons} أفراد`:""); }

export function CustomerApp(){
  const [lang,setLang]=useState<Lang>("ar");
  const t=useMemo(()=>makeT(lang),[lang]);
  const dir=dirOf(lang);
  const [screen,setScreen]=useState<Screen>("packages");
  const [cat,setCat]=useState<Catalog>({packages:[],trips:[],hotels:[],transports:[]});
  const [loading,setLoading]=useState(true);
  const [langOpen,setLangOpen]=useState(false);

  // booking state
  const [pkg,setPkg]=useState<Pkg|null>(null);
  const [trip,setTrip]=useState<Trip|null>(null);
  const [persons,setPersons]=useState(1);
  const [room,setRoom]=useState<RoomPrice|null>(null);
  const [takenSeats,setTakenSeats]=useState<number[]>([]);
  const [pax,setPax]=useState<Pax[]>([emptyPax()]);
  const [paxTouched,setPaxTouched]=useState<Record<string,boolean>>({});
  const [paxTried,setPaxTried]=useState(false);
  const [activePax,setActivePax]=useState(0);
  const [termsOpen,setTermsOpen]=useState(false);
  const [agreed,setAgreed]=useState(false);
  const [submitting,setSubmitting]=useState(false);
  const [bookingNo,setBookingNo]=useState("");
  const [errMsg,setErrMsg]=useState("");

  // session / OTP
  const [sessionPhone,setSessionPhone]=useState<string|null>(()=>loadSession());
  const [loginPhone,setLoginPhone]=useState("");
  const [otpCode,setOtpCode]=useState("");
  const [otpErr,setOtpErr]=useState("");
  const [resendIn,setResendIn]=useState(0);
  const resendTimer=useRef<ReturnType<typeof setInterval>|null>(null);
  const [myOrders,setMyOrders]=useState<TrackResult[]|null>(null);
  const [ordersLoading,setOrdersLoading]=useState(false);

  useEffect(()=>{ fetchCatalog().then(c=>{setCat(c);setLoading(false);}); },[]);
  /* خلفية الـbody بيج عامة (لوحة الموظف)؛ صفحة المستفيد بيضاء — نوحّدها هنا
     حتى لا يظهر شريط بيج فوق الرأس في iOS Safari (منطقة شريط الحالة والسحب الزائد). */
  useEffect(()=>{ const prev=document.body.style.background; document.body.style.background="#fff";
    return ()=>{ document.body.style.background=prev; }; },[]);
  useEffect(()=>{ setPax(prev=>{ const a=[...prev]; while(a.length<persons) a.push(emptyPax()); return a.slice(0,persons); }); },[persons]);
  useEffect(()=>{ if(trip){ setPax(a=>a.map(x=>({...x,seat:null}))); fetchTakenSeats(trip.id).then(setTakenSeats); } },[trip?.id]);
  useEffect(()=>()=>{ if(resendTimer.current) clearInterval(resendTimer.current); },[]);

  const activePkgs=cat.packages.filter(p=>p.status==="active" && (p.settings?.allowOnlineBooking!==false));
  const pkgTrips=(p:Pkg)=>cat.trips.filter(x=>x.packageId===p.id && x.status==="open" && availSeats(x)>0).sort((a,b)=>a.departureDate.localeCompare(b.departureDate));
  /* وسيلة النقل: الرحلة المختارة أولاً، وإلا افتراضي الباقة —
     وإلا اختفى قسم النقل كلياً حتى يختار المستفيد تاريخاً، وهو يحتاجه ليقرر. */
  const transport=cat.transports.find(x=>x.id===(trip?.transportId||pkg?.transportId));
  const hotel=pkg?cat.hotels.find(h=>h.id===pkg.hotelId):undefined;
  const rooms=pkg?.roomPrices??[];
  const nights=pkg?.nights||1;
  const perPerson=room?room.perNight*nights:(trip?.price??0);
  const total=perPerson*persons;
  const takenSet=useMemo(()=>new Set(takenSeats),[takenSeats]);

  function reset(){ setPkg(null);setTrip(null);setPersons(1);setRoom(null);setPax([emptyPax()]);setPaxTouched({});setPaxTried(false);setActivePax(0);setAgreed(false);setBookingNo("");setErrMsg(""); }

  // ── تحقق خطوة بيانات المعتمرين ──
  const paxErrs=useMemo(()=>pax.map((p,i)=>paxErrors(p,i===0,t,lang)),[pax,t,lang]);
  const paxValid=paxErrs.every(e=>Object.keys(e).length===0);
  const setPaxField=(i:number,k:keyof Pax,v:string)=>setPax(a=>a.map((x,j)=>j===i?{...x,[k]:v}:x));
  const touch=(i:number,f:PaxField)=>setPaxTouched(s=>({...s,[`${i}.${f}`]:true}));
  const errOf=(i:number,f:PaxField)=>(paxTried||paxTouched[`${i}.${f}`])?paxErrs[i]?.[f]:undefined;
  function goSeats(){
    setPaxTried(true);
    if(!paxValid){ window.scrollTo({top:0,behavior:"smooth"}); return; }
    setActivePax(pax.findIndex(x=>x.seat==null)>=0?pax.findIndex(x=>x.seat==null):0);
    window.scrollTo({top:0});
    setScreen("seats");
  }

  /* ── توزيع المقاعد بالاسم: يختار المستفيد المعتمر ثم مقعده، فينتقل تلقائياً للتالي.
        المقعد مرتبط بالشخص لا بالحجز، فلا يلتبس على الموظف من يجلس أين. ── */
  const seats=useMemo(()=>pax.map(x=>x.seat).filter((n):n is number=>n!=null),[pax]);
  const seatsDone=pax.length>0&&pax.every(x=>x.seat!=null);
  function assignSeat(n:number){
    if(takenSet.has(n)) return;
    setPax(a=>{
      const owner=a.findIndex(x=>x.seat===n);
      const next=a.map((x,j)=>{
        if(j===activePax) return {...x,seat:x.seat===n?null:n};      // النقر على نفس المقعد يلغيه
        if(owner===j) return {...x,seat:null};                        // مقعد مأخوذ من مرافق يُنقل
        return x;
      });
      const after=next.findIndex((x,j)=>j>activePax&&x.seat==null);
      const any=next.findIndex(x=>x.seat==null);
      setActivePax(after>=0?after:any>=0?any:activePax);
      return next;
    });
  }

  async function doSubmit(){
    if(submitting||!trip||!pkg) return;
    setErrMsg("");
    if(!agreed){ setErrMsg(t("iAgreeRead")); return; }
    if(!paxValid){ setErrMsg(t("required")); setPaxTried(true); setScreen("passengers"); return; }
    if(!seatsDone){ setErrMsg(t("pickSeatsHint").replace("{n}",String(persons))); setScreen("seats"); return; }
    setSubmitting(true);
    try{
      const id=await submitBooking({
        tripId:trip.id, packageId:pkg.id, clientName:pax[0].name, clientPhone:pax[0].phone.replace(/\s/g,""),
        roomType:room?.type??"", persons, total, seats,
        pilgrims:pax.map(p=>({name:p.name.trim(),docType:p.docType||undefined,idNumber:p.idNumber.trim(),
          nationality:p.nationality,gender:p.gender,ageGroup:p.ageGroup,birthDate:p.birthDate,
          phone:p.phone.replace(/\s/g,""),seat:p.seat??undefined})),
      });
      setBookingNo(id); setScreen("success");
    }catch(e){
      if(e instanceof SeatsError) setErrMsg(`${t("errSeats")} (${t("seatsLeft")}: ${e.available})`);
      else setErrMsg(t("errSeats"));
    }finally{ setSubmitting(false); }
  }

  // OTP helpers
  function startResendCountdown(){ setResendIn(30); if(resendTimer.current) clearInterval(resendTimer.current);
    resendTimer.current=setInterval(()=>setResendIn(s=>{ if(s<=1){ if(resendTimer.current) clearInterval(resendTimer.current); return 0; } return s-1; }),1000); }
  async function beginLogin(){ if(!validPhone(loginPhone)){ setOtpErr(t("invalidPhone")); return; } setOtpErr(""); await sendOtp(loginPhone.replace(/\s/g,""),"whatsapp"); setOtpCode(""); startResendCountdown(); setScreen("otp"); }
  async function resendCode(){ if(resendIn>0) return; await sendOtp(loginPhone.replace(/\s/g,""),"sms"); startResendCountdown(); }
  async function confirmOtp(){ const r=await verifyOtp(loginPhone,otpCode); if(!r.ok){ setOtpErr(t("required")); return; }
    const ph=loginPhone.replace(/\s/g,""); saveSession(ph); setSessionPhone(ph); setScreen("track"); }
  function logout(){ clearSession(); setSessionPhone(null); setMyOrders(null); setScreen("packages"); }

  // load my orders when entering track/profile while logged in
  useEffect(()=>{ if((screen==="track"||screen==="profile") && sessionPhone){ setOrdersLoading(true); myBookings(sessionPhone).then(o=>{setMyOrders(o);setOrdersLoading(false);}); } },[screen,sessionPhone]);

  const primaryBtn=(on=true)=>({background:on?G.gold:"#d6cfc6",color:on?B.black:"#a09688",border:"none",cursor:on?"pointer":"not-allowed"} as const);

  const AppBar=({title,onBack}:{title?:string;onBack?:()=>void})=>(
    <div className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3" style={{background:G.deep,color:"#fff"}}>
      {onBack
        ? <button onClick={onBack} className="p-1.5 rounded-lg cursor-pointer" style={{background:"rgba(255,255,255,.1)",border:"none",color:"#fff"}}><ChevronLeft size={18} style={{transform:dir==="rtl"?"scaleX(-1)":"none"}}/></button>
        : <TasaheelMark size={34}/>}
      <div className="flex-1 font-extrabold" style={{fontFamily:"'Noto Kufi Arabic',serif",fontSize:15}}>{title||t("brand")}</div>
      <div className="relative">
        <button onClick={()=>setLangOpen(v=>!v)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg cursor-pointer text-xs font-bold" style={{background:"rgba(255,255,255,.12)",border:"none",color:"#fff"}}><Globe size={14}/>{LANGS.find(l=>l.code===lang)?.label}</button>
        <AnimatePresence>
          {langOpen&&(
            <motion.div initial={{opacity:0,y:-6}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-6}}
              className="absolute left-0 mt-1 rounded-xl overflow-hidden z-40" style={{background:"#fff",border:`1px solid ${B.border}`,minWidth:130,boxShadow:"0 12px 30px -8px rgba(0,0,0,.3)"}}>
              {LANGS.map(l=>(
                <button key={l.code} onClick={()=>{setLang(l.code);setLangOpen(false);}} className="flex items-center justify-between gap-2 w-full px-3 py-2.5 text-sm cursor-pointer text-right"
                  style={{background:lang===l.code?B.bg:"#fff",border:"none",color:B.black,fontWeight:lang===l.code?700:500}}>{l.label}{lang===l.code&&<Check size={14} style={{color:G.green}}/>}</button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  /* الشريط السفلي — بنمطهم: أيقونة خطية فوق نص صغير، والنشط ملوّن ومعبّأ. */
  const BottomBar=()=>(
    <div className="sticky bottom-0 z-30 grid grid-cols-3"
      style={{background:C.white,borderTop:`1px solid ${C.line}`,paddingBlock:8,
              paddingBottom:"calc(8px + env(safe-area-inset-bottom, 0px))"}}>
      {([["packages",Search,t("explore")],["track",Heart,t("myBookings")],["profile",UserRound,t("profile")]] as const).map(([sc,Icon,lbl])=>{
        const on=screen===sc;
        return (
          <button key={sc} onClick={()=>setScreen(sc as Screen)}
            className="flex flex-col items-center gap-1 cursor-pointer"
            style={{background:"none",border:"none",paddingBlock:4,color:on?C.green:C.ink2}}>
            <Icon size={21} strokeWidth={on?2.2:1.7} fill={on&&sc==="track"?C.green:"none"}/>
            <span style={{fontSize:11,fontWeight:on?600:400}}>{lbl}</span>
          </button>
        );
      })}
    </div>
  );

  const Timeline=({status}:{status:string})=>{ const step=statusToStep(status); return (
    <div className="flex flex-col gap-2">
      {TRACK_STEPS.map((s,i)=>{ const done=i<=step; return (
        <div key={s} className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold" style={{background:done?G.green:"#fff",border:done?"none":`1px solid ${B.border}`,color:done?"#fff":B.muted}}>{done?<Check size={13}/>:i+1}</div>
          <span className="text-sm" style={{color:done?B.black:B.muted,fontWeight:i===step?800:500}}>{t(s)}</span>
        </div>
      ); })}
    </div>
  ); };

  if(loading) return (
    <div dir={dir} className="min-h-screen flex flex-col items-center justify-center gap-4" style={{background:`linear-gradient(160deg,${G.deep},${G.dark})`}}>
      <TasaheelMark size={56}/>
      <motion.span animate={{rotate:360}} transition={{repeat:Infinity,duration:0.9,ease:"linear"}} style={{width:22,height:22,border:"2.5px solid rgba(231,194,113,0.35)",borderTopColor:G.gold,borderRadius:"50%",display:"inline-block"}}/>
      <div className="text-xs" style={{color:G.gold,letterSpacing:2}}>{t("loading")}</div>
    </div>
  );

  return (
    <DirProvider value={dir}>
    <div dir={dir} lang={lang} className="min-h-screen flex flex-col relative" style={{background:screen==="packages"||screen==="listing"?"#fff":G.bg,fontFamily:"'IBM Plex Sans Arabic',system-ui,sans-serif"}}>
      {/* R1: خلفية خفيفة — تُخفى في الشاشات المعاد بناؤها لأن قاعدتها بيضاء */}
      {screen!=="packages"&&screen!=="listing"&&
        <div aria-hidden style={{position:"fixed",inset:0,backgroundImage:"url(/bg-haram.jpg)",backgroundSize:"cover",backgroundPosition:"center",opacity:0.06,pointerEvents:"none",zIndex:0}}/>}
      <div className="relative flex flex-col flex-1" style={{zIndex:1}}>

      {/* ═══ EXPLORE (الاستكشاف) ═══ */}
      {screen==="packages"&&<>
        <Explore
          packages={activePkgs}
          hotels={cat.hotels}
          tripsOf={pkgTrips}
          onOpen={p=>{setPkg(p);setTrip(null);setPersons(1);setRoom(null);setPax([emptyPax()]);setScreen("listing");}}
          onCustom={()=>setScreen("custom")}
          t={t} lang={lang} setLang={setLang}
        />
        <BottomBar/>
      </>}

      {/* ═══ LISTING — الصفحة الواحدة (تحل محل trip + seat + room) ═══ */}
      {screen==="listing"&&pkg&&
        <Listing
          pkg={pkg}
          trips={pkgTrips(pkg)}
          hotel={hotel}
          transport={transport}
          trip={trip}
          setTrip={tr=>{ setTrip(tr); if(tr) setPersons(n=>Math.min(Math.max(1,n),availSeats(tr))); }}
          persons={persons} setPersons={setPersons}
          room={room} setRoom={setRoom}
          total={total}
          onBack={()=>setScreen("packages")}
          onNext={()=>setScreen("passengers")}
          terms={TERMS_AR}
          t={t} lang={lang}
        />}

      {/* ═══ CUSTOM — الباقة المخصّصة: طلب لا حجز ═══ */}
      {screen==="custom"&&<>
        <AppBar title={t("customPkg")} onBack={()=>setScreen("packages")}/>
        <CustomRequestScreen lang={lang} dir={dir} onDone={()=>setScreen("packages")}/>
      </>}

      {/* ═══ PASSENGERS — كل حقل بعنوان ونص إرشادي، والزر مباشرة تحت البطاقة ═══ */}
      {screen==="passengers"&&<>
        <AppBar title={t("passengers")} onBack={()=>setScreen("listing")}/>
        <div className="px-4 py-4 flex flex-col gap-4">
          <p className="text-xs" style={{color:B.muted}}>{t("pilgrimCardHint")}</p>

          {pax.map((p,i)=>{
            const doc=p.docType?docTypeDef(p.docType):null;
            const inp="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none";
            const ist=(bad?:string)=>({borderColor:bad?"#E1A3A3":B.border,fontFamily:"inherit",background:"#fff"} as const);
            const ltr={direction:"ltr",textAlign:(dir==="rtl"?"right":"left")} as const;
            return (
              <div key={i} className="rounded-2xl p-4 flex flex-col gap-4" style={{background:"#fff",border:`1px solid ${B.border}`}}>
                <div className="font-extrabold text-sm flex items-center justify-between" style={{color:G.green}}>
                  {t("person")} {i+1}
                  {p.ageGroup==="child"&&<span className="px-2 py-0.5 rounded-full text-xs" style={{background:"#EAF1FE",color:"#1E52C7",border:"1px solid #C9D9F6"}}>{t("child")}</span>}
                </div>

                {/* الاسم */}
                <LField label={t("name")} hint={t("nameHint")} error={errOf(i,"name")}>
                  <input value={p.name} onChange={e=>setPaxField(i,"name",e.target.value)} onBlur={()=>touch(i,"name")}
                    placeholder={t("namePh")} className={inp} style={ist(errOf(i,"name"))}/>
                </LField>

                {/* الفئة العمرية والجنس — صفّان متجاوران */}
                <div className="grid grid-cols-2 gap-3">
                  <LField label={t("ageGroup")}>
                    <SegPick dir={dir} value={p.ageGroup}
                      onChange={v=>setPax(a=>a.map((x,j)=>j===i?{...x,ageGroup:v as Pax["ageGroup"],phone:v==="child"?"":x.phone}:x))}
                      options={[{value:"adult",label:t("adult")},{value:"child",label:t("child")}]}/>
                  </LField>
                  <LField label={t("gender")}>
                    <SegPick dir={dir} value={p.gender}
                      onChange={v=>setPaxField(i,"gender",v)}
                      options={[{value:"male",label:t("male")},{value:"female",label:t("female")}]}/>
                  </LField>
                </div>

                {/* الجوال — يختفي للطفل، ويكفي جوال ولي الأمر */}
                {p.ageGroup==="child"
                  ? <div className="text-[11px] rounded-xl px-3 py-2" style={{background:B.bg,color:B.muted}}>{t("childNoPhone")}</div>
                  : (
                    <LField label={t("phone")} hint={t("phoneHint")} error={errOf(i,"phone")} optional={i>0?t("optional"):undefined}>
                      <input value={p.phone} onChange={e=>setPaxField(i,"phone",e.target.value.replace(/[^\d+ ]/g,""))} onBlur={()=>touch(i,"phone")}
                        inputMode="tel" maxLength={14} placeholder={t("phonePh")} className={inp} style={{...ist(errOf(i,"phone")),...ltr}}/>
                    </LField>
                  )}

                {/* نوع الوثيقة — يحدّد شكل الرقم المطلوب */}
                <LField label={t("docType")} hint={t("docTypeHint")} error={errOf(i,"docType")}>
                  <SearchSelect
                    dir={dir} searchable={false} subInTrigger={false} value={p.docType} invalid={!!errOf(i,"docType")}
                    onChange={v=>{ setPax(a=>a.map((x,j)=>j===i?{...x,docType:v as DocType,idNumber:""}:x)); touch(i,"docType"); }}
                    options={DOC_TYPES.map(d=>({value:d.value,label:docText(d.label,lang),prefix:d.icon,sub:docText(d.hint,lang)}))}
                    placeholder={t("docTypePh")}/>
                </LField>

                {/* رقم الوثيقة — عنوانه ونصّه الإرشادي يتغيّران حسب النوع */}
                <LField label={doc?docText(doc.numberLabel,lang):t("idNumber")}
                  hint={doc?docText(doc.hint,lang):t("docTypeHint")} error={errOf(i,"idNumber")}>
                  <input value={p.idNumber} disabled={!p.docType} onBlur={()=>touch(i,"idNumber")}
                    onChange={e=>{ const raw=e.target.value; const v=doc?.numeric?raw.replace(/\D/g,""):raw.replace(/\s/g,""); setPaxField(i,"idNumber",v.slice(0,doc?.maxLength??20)); }}
                    inputMode={doc?.numeric?"numeric":"text"} maxLength={doc?.maxLength??20}
                    placeholder={doc?doc.placeholder:"—"} className={inp}
                    style={{...ist(errOf(i,"idNumber")),...ltr,background:p.docType?"#fff":B.bg,cursor:p.docType?"text":"not-allowed"}}/>
                </LField>

                {/* الجنسية — قائمة ببحث */}
                <LField label={t("nationality")} hint={t("nationalityHint")} error={errOf(i,"nationality")}>
                  <NationalitySelect lang={lang} dir={dir} value={p.nationality} invalid={!!errOf(i,"nationality")}
                    placeholder={t("nationalityPh")}
                    onChange={v=>{ setPaxField(i,"nationality",v); touch(i,"nationality"); }}/>
                </LField>

                {/* تاريخ الميلاد — قوائم لا تقويم */}
                <LField label={t("birthDate")} hint={p.birthDate?undefined:t("birthDateHint")} error={errOf(i,"birthDate")}>
                  <BirthDateSelect lang={lang} dir={dir} value={p.birthDate} invalid={!!errOf(i,"birthDate")}
                    onChange={v=>{ setPaxField(i,"birthDate",v); touch(i,"birthDate"); }}/>
                </LField>
              </div>
            );
          })}

          {/* الزر مباشرة تحت بطاقة البيانات — لا شريط سفلي */}
          {paxTried&&!paxValid&&(
            <div className="rounded-xl px-4 py-3 text-sm font-bold" style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}>{t("fillFirst")}</div>
          )}
          <button onClick={goSeats} className="w-full py-3.5 rounded-xl font-extrabold text-sm" style={primaryBtn(true)}>{t("next")}</button>
        </div>
      </>}

      {/* ═══ SEATS — مقعد لكل معتمر بالاسم، بعد إدخال بياناتهم ═══ */}
      {screen==="seats"&&trip&&<>
        <AppBar title={t("assignSeats")} onBack={()=>setScreen("passengers")}/>
        <div className="px-4 py-4 flex flex-col gap-4">
          <p className="text-xs" style={{color:B.muted}}>{t("pickPilgrim")}</p>

          {/* قائمة المعتمرين — النشط مميّز، ومقعده يظهر بجانب اسمه */}
          <div className="rounded-2xl overflow-hidden" style={{background:"#fff",border:`1px solid ${B.border}`}}>
            {pax.map((x,i)=>{
              const on=i===activePax;
              return (
                <button key={i} onClick={()=>setActivePax(i)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-start cursor-pointer"
                  style={{background:on?"#EAF5F0":"#fff",border:"none",borderTop:i?`1px solid ${B.border}`:"none"}}>
                  <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{background:x.gender==="female"?"#F1E9FA":"#EAF1FE",color:x.gender==="female"?"#7226BE":"#1E52C7"}}>{i+1}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate text-sm font-bold" style={{color:B.black}}>{x.name||`${t("person")} ${i+1}`}</span>
                    {x.ageGroup==="child"&&<span className="text-[11px]" style={{color:B.muted}}>{t("child")}</span>}
                  </span>
                  {x.seat!=null
                    ? <span className="px-2.5 py-1 rounded-lg text-xs font-extrabold flex-shrink-0" style={{background:"#FFF7EA",color:"#8a6a08",border:`1px solid ${B.gold}`,fontFamily:"'IBM Plex Mono',monospace"}}>{t("seatFor")} {x.seat}</span>
                    : <span className="text-xs flex-shrink-0" style={{color:on?G.green:B.muted,fontWeight:on?700:500}}>{on?t("chooseSeat"):"—"}</span>}
                </button>
              );
            })}
          </div>

          {/* كروكي الباص — النقر يخصّص المقعد للمعتمر النشط ثم ينتقل للتالي */}
          <div className="rounded-2xl p-4" style={{background:"#fff",border:`1px solid ${B.border}`}}>
            <BusSeatGrid
              capacity={trip.seats} occupied={takenSet}
              selected={seats} need={pax.length} onToggle={assignSeat}
            />
          </div>

          {seatsDone
            ? <div className="rounded-xl px-4 py-3 text-sm font-bold" style={{background:"#E3F3E8",border:"1px solid #C4E4CE",color:"#1E7A44"}}>✓ {t("allSeatsSet")}</div>
            : <div className="rounded-xl px-4 py-3 text-sm" style={{background:B.bg,color:B.muted}}>{t("pickSeatsHint").replace("{n}",String(pax.filter(x=>x.seat==null).length))}</div>}

          <button onClick={()=>{ if(seatsDone) setScreen("review"); }} disabled={!seatsDone}
            className="w-full py-3.5 rounded-xl font-extrabold text-sm" style={primaryBtn(seatsDone)}>{t("next")}</button>
        </div>
      </>}

      {/* ═══ REVIEW ═══ */}
      {screen==="review"&&pkg&&trip&&<>
        <AppBar title={t("review")} onBack={()=>setScreen("seats")}/>
        <div className="px-4 py-4 flex flex-col gap-3">
          <div className="rounded-2xl p-4 flex flex-col gap-2" style={{background:"#fff",border:`1px solid ${B.border}`}}>
            {[[t("package"),pkg.name],[t("trip"),`${trip.departureDate} · ${trip.departureTime}`],[t("room"),room?roomLabel(room):"—"],[t("people"),`${persons}`],["المقاعد",seats.join("، ")||"—"]].map(([l,v])=>(
              <div key={l} className="flex items-center justify-between gap-2 text-sm"><span style={{color:B.muted}}>{l}</span><span className="font-bold" style={{color:B.black}}>{v}</span></div>
            ))}
          </div>
          <div className="rounded-2xl overflow-hidden" style={{border:`1px solid ${B.border}`}}>
            {pax.map((p,i)=>(
              <div key={i} className="px-4 py-2.5 text-sm flex items-center justify-between gap-2" style={{background:i%2?"#FDFCFA":"#fff",borderTop:i?`1px solid ${B.border}`:"none"}}>
                <span className="font-bold truncate" style={{color:B.black}}>{p.name||"—"}</span>
                <span className="text-xs flex items-center gap-2 flex-shrink-0" style={{color:B.muted}}>
                  {p.nationality&&<span>{p.nationality}</span>}
                  {p.seat!=null&&<span className="px-1.5 py-0.5 rounded font-bold" style={{background:"#FFF7EA",color:"#8a6a08"}}>{t("seatFor")} {p.seat}</span>}
                  <span className="font-mono" style={{direction:"ltr"}}>{p.idNumber}</span>
                </span>
              </div>
            ))}
          </div>
          <div className="rounded-2xl p-4" style={{background:G.deep,color:"#fff"}}>
            <div className="flex items-center justify-between"><span>{t("total")}</span><span className="font-extrabold text-2xl" style={{fontFamily:"'IBM Plex Mono',monospace"}}>{money(total)} {t("currency")}</span></div>
          </div>

          {/* الشروط: مربع اختيار مباشر — والقراءة اختيارية عبر الرابط */}
          <div className="rounded-2xl p-3.5 flex flex-col gap-1.5" style={{background:"#fff",border:`1.5px solid ${agreed?G.green:B.border}`}}>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" checked={agreed} onChange={e=>{setAgreed(e.target.checked); if(e.target.checked) setErrMsg("");}}
                style={{width:20,height:20,accentColor:G.green,flexShrink:0,cursor:"pointer"}}/>
              <span className="text-sm font-bold leading-relaxed" style={{color:B.black}}>{t("iAgreeRead")}</span>
            </label>
            <button onClick={()=>setTermsOpen(true)} className="text-xs font-bold underline cursor-pointer text-start"
              style={{background:"none",border:"none",color:"#1E52C7",padding:0,marginInlineStart:30}}>{t("readTerms")}</button>
          </div>

          {errMsg&&<div className="rounded-xl px-4 py-3 text-sm font-bold" style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}>{errMsg}</div>}

          {/* زر التأكيد مباشرة تحت المربع — بلا شريط سفلي */}
          <button disabled={submitting} onClick={doSubmit} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-extrabold text-sm" style={primaryBtn(agreed&&!submitting)}>
            {submitting&&<motion.span animate={{rotate:360}} transition={{repeat:Infinity,duration:0.9,ease:"linear"}} style={{width:15,height:15,border:"2px solid rgba(0,0,0,0.3)",borderTopColor:B.black,borderRadius:"50%",display:"inline-block"}}/>}
            {submitting?t("submitting"):t("submit")}
          </button>
        </div>
      </>}

      {/* ═══ SUCCESS (R8: timeline directly) ═══ */}
      {screen==="success"&&<>
        <AppBar title={t("brand")}/>
        <div className="px-5 py-8 flex-1 flex flex-col items-center text-center gap-4">
          <motion.div initial={{scale:0}} animate={{scale:1}} transition={{type:"spring",damping:14}} className="w-16 h-16 rounded-full flex items-center justify-center" style={{background:"#E3F3E8"}}><Check size={34} style={{color:G.green}}/></motion.div>
          <div className="font-extrabold text-xl" style={{color:B.black}}>{t("successTitle")}</div>
          <div className="rounded-xl px-6 py-3" style={{background:"#fff",border:`1px solid ${B.border}`}}>
            <div className="text-xs" style={{color:B.muted}}>{t("bookingNo")}</div>
            <div className="font-extrabold text-lg" style={{color:G.green,fontFamily:"'IBM Plex Mono',monospace"}}>{bookingNo}</div>
          </div>
          <div className="w-full rounded-2xl p-4 text-right" style={{background:"#fff",border:`1px solid ${B.border}`}}>
            <Timeline status="reviewing"/>
          </div>
          <button onClick={()=>{reset();setScreen("packages");}} className="w-full py-3 rounded-xl font-bold text-sm cursor-pointer mt-1" style={{background:G.deep,color:"#fff",border:"none"}}>{t("home")}</button>
        </div>
      </>}

      {/* ═══ TRACK (auto for logged-in) ═══ */}
      {screen==="track"&&<>
        <AppBar title={t("trackTitle")}/>
        <div className="px-4 py-4 flex-1 flex flex-col gap-3">
          {!sessionPhone
            ? <div className="rounded-2xl p-6 flex flex-col items-center gap-3 text-center" style={{background:"#fff",border:`1px solid ${B.border}`}}>
                <Search size={28} style={{color:G.green,opacity:.6}}/>
                <div className="text-sm" style={{color:B.text2}}>{t("loginToTrack")}</div>
                <button onClick={()=>setScreen("login")} className="px-6 py-2.5 rounded-xl font-bold text-sm cursor-pointer" style={{background:G.gold,color:B.black,border:"none"}}>{t("login")}</button>
              </div>
            : ordersLoading ? <div className="text-center py-10" style={{color:B.muted}}>{t("loading")}</div>
            : (myOrders&&myOrders.length>0)
              ? myOrders.map(o=>(
                  <div key={o.id} className="rounded-2xl p-4 flex flex-col gap-3" style={{background:"#fff",border:`1px solid ${B.border}`}}>
                    <div className="flex items-center justify-between"><span className="font-extrabold" style={{color:B.black,fontFamily:"'IBM Plex Mono',monospace"}}>{o.id}</span><span className="text-sm" style={{color:B.muted}}>{o.packageName}</span></div>
                    <Timeline status={o.status}/>
                    {(o.status==="confirmed"||o.status==="verified")&&<div className="flex flex-col items-center gap-2 pt-3" style={{borderTop:`1px solid ${B.border}`}}><QRBlock seed={o.id} size={110}/><div className="text-xs font-bold" style={{color:B.muted}}>{t("ticket")}</div></div>}
                  </div>
                ))
              : <div className="text-center py-10" style={{color:B.muted}}>{t("noBookings")}</div>}
        </div>
        <BottomBar/>
      </>}

      {/* ═══ LOGIN (phone) ═══ */}
      {screen==="login"&&<>
        <AppBar title={t("login")} onBack={()=>setScreen("track")}/>
        <div className="px-4 py-6 flex-1 flex flex-col gap-4">
          <div className="text-sm" style={{color:B.text2}}>{t("loginHint")}</div>
          <input value={loginPhone} onChange={e=>setLoginPhone(e.target.value)} placeholder={t("phone")} className="w-full border rounded-xl px-3.5 py-3 text-sm focus:outline-none" style={{borderColor:B.border,direction:"ltr",textAlign:dir==="rtl"?"right":"left"}}/>
          {otpErr&&<div className="text-xs font-bold" style={{color:"#BE2626"}}>{otpErr}</div>}
          <button onClick={beginLogin} className="w-full py-3.5 rounded-xl font-extrabold text-sm" style={primaryBtn(true)}>{t("sendCode")}</button>
        </div>
      </>}

      {/* ═══ OTP ═══ */}
      {screen==="otp"&&<>
        <AppBar title={t("enterCode")} onBack={()=>setScreen("login")}/>
        <div className="px-4 py-6 flex-1 flex flex-col items-center gap-4">
          <div className="text-sm text-center" style={{color:B.text2}}>{t("enterCode")}<br/><b style={{direction:"ltr",display:"inline-block"}}>{loginPhone}</b></div>
          <div dir="ltr"><InputOTP maxLength={6} value={otpCode} onChange={setOtpCode}>
            <InputOTPGroup>
              {[0,1,2,3,4,5].map(i=><InputOTPSlot key={i} index={i}/>)}
            </InputOTPGroup>
          </InputOTP></div>
          <div className="text-xs" style={{color:B.muted}}>{t("devCodeHint")}: <b style={{fontFamily:"monospace"}}>{DEV_OTP_HINT}</b></div>
          {otpErr&&<div className="text-xs font-bold" style={{color:"#BE2626"}}>{otpErr}</div>}
          <button disabled={otpCode.length<6} onClick={confirmOtp} className="w-full py-3.5 rounded-xl font-extrabold text-sm" style={primaryBtn(otpCode.length>=6)}>{t("verify")}</button>
          <button disabled={resendIn>0} onClick={resendCode} className="text-sm font-bold cursor-pointer" style={{background:"none",border:"none",color:resendIn>0?B.muted:"#1E52C7"}}>
            {resendIn>0?`${t("resendIn")} ${resendIn} ${t("second")}`:t("resend")}
          </button>
        </div>
      </>}

      {/* ═══ PROFILE ═══ */}
      {screen==="profile"&&<>
        <AppBar title={t("profile")}/>
        <div className="px-4 py-4 flex-1 flex flex-col gap-3">
          <div className="rounded-2xl p-5 flex items-center gap-3" style={{background:`linear-gradient(150deg,${G.deep},${G.dark})`,color:"#fff"}}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{background:"rgba(255,255,255,.15)"}}><Users size={22}/></div>
            <div><div className="font-extrabold">{t("brand")}</div>{sessionPhone&&<div className="text-xs" style={{color:"#CFE4DC",direction:"ltr"}}>{sessionPhone}</div>}</div>
          </div>
          {sessionPhone
            ? <button onClick={()=>setScreen("track")} className="rounded-2xl p-4 flex items-center justify-between cursor-pointer" style={{background:"#fff",border:`1px solid ${B.border}`}}>
                <span className="font-bold text-sm flex items-center gap-2" style={{color:B.black}}><Search size={16} style={{color:G.green}}/>{t("myBookings")}</span><ArrowLeft size={16} style={{color:B.muted,transform:dir==="rtl"?"none":"scaleX(-1)"}}/>
              </button>
            : <button onClick={()=>setScreen("login")} className="rounded-2xl p-4 flex items-center justify-center cursor-pointer font-bold text-sm" style={{background:G.gold,color:B.black,border:"none"}}>{t("login")}</button>}
          <div className="rounded-2xl p-4" style={{background:"#fff",border:`1px solid ${B.border}`}}>
            <div className="font-bold text-sm mb-3 flex items-center gap-2" style={{color:B.black}}><Globe size={16} style={{color:G.green}}/>{t("language")}</div>
            <div className="grid grid-cols-2 gap-2">
              {LANGS.map(l=>(<button key={l.code} onClick={()=>setLang(l.code)} className="py-2.5 rounded-xl text-sm font-bold cursor-pointer" style={{border:`1.5px solid ${lang===l.code?G.green:B.border}`,background:lang===l.code?"#EAF5F0":"#fff",color:B.black}}>{l.label}</button>))}
            </div>
          </div>
          {sessionPhone&&<button onClick={logout} className="rounded-2xl p-4 flex items-center justify-center cursor-pointer font-bold text-sm" style={{background:"#FBE6E6",color:"#BE2626",border:"1px solid #F3C9C9"}}>{t("logout")}</button>}
        </div>
        <BottomBar/>
      </>}

      </div>

      {/* R7: Terms modal */}
      <AnimatePresence>
        {termsOpen&&(
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{background:"rgba(11,90,65,.6)",zIndex:50}} onClick={()=>setTermsOpen(false)}>
            <motion.div initial={{y:40,opacity:0}} animate={{y:0,opacity:1}} exit={{y:40,opacity:0}} className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col" style={{background:"#fff",maxHeight:"85vh"}} onClick={e=>e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4" style={{background:G.deep,color:"#fff"}}>
                <span className="font-extrabold" style={{fontFamily:"'Noto Kufi Arabic',serif"}}>{t("readTerms")}</span>
                <button onClick={()=>setTermsOpen(false)} className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer" style={{background:"rgba(255,255,255,.12)",border:"none",color:"#fff"}}><X size={15}/></button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4 text-sm leading-relaxed whitespace-pre-line" style={{color:B.text3}}>{TERMS_AR}</div>
              <div className="px-5 py-4 flex flex-col gap-3" style={{borderTop:`1px solid ${B.border}`}}>
                <button onClick={()=>setAgreed(a=>!a)} className="flex items-center gap-2.5 cursor-pointer text-right" style={{background:"none",border:"none",padding:0}}>
                  <span className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0" style={{background:agreed?G.green:"#fff",border:`1.5px solid ${agreed?G.green:B.border}`}}>{agreed&&<Check size={14} style={{color:"#fff"}}/>}</span>
                  <span className="text-sm font-bold" style={{color:B.black}}>{t("iAgreeRead")}</span>
                </button>
                <button disabled={!agreed} onClick={()=>setTermsOpen(false)} className="w-full py-3 rounded-xl font-extrabold text-sm" style={primaryBtn(agreed)}>{t("approve")}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* فراغ أسفل الشاشات بلا شريط سفلي حتى لا يغطّي زر الواتساب آخر عنصر */}
      {!["packages","listing","track","profile"].includes(screen)&&<div style={{height:76,flexShrink:0}}/>}

      {/* زر واتساب — ثابت في كل الشاشات، ويرتفع فوق الشريط السفلي حيث يظهر */}
      <WhatsAppFab bottom={["packages","listing","track","profile"].includes(screen)?100:24}/>
    </div>
    </DirProvider>
  );
}
