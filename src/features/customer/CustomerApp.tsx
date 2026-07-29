import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Globe, ChevronLeft, Check, Users, CalendarDays, Clock, Plus, Minus, X, Search, Home, Wifi, Tv, BatteryCharging, ArrowLeft, ChevronRight } from "lucide-react";
import { B } from "@/lib/theme";
import type { Pkg, Trip, RoomPrice } from "@/types";
import { TasaheelMark } from "@/components/TasaheelMark";
import { QRBlock } from "@/components/QRBlock";
import { ArabicDatePicker } from "@/components/ArabicDatePicker";
import { BusSeatGrid, seatNote } from "@/components/BusSeatGrid";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/app/components/ui/input-otp";
import { LANGS, dirOf, makeT, type Lang } from "./i18n";
import { fetchCatalog, submitBooking, fetchTakenSeats, myBookings, SeatsError, type Catalog, type TrackResult } from "./data";
import { sendOtp, verifyOtp, loadSession, saveSession, clearSession, DEV_OTP_HINT } from "./otp";

const G = { deep:"#0B5A41", dark:"#073A2B", green:B.primary, gold:B.gold, bg:"#F5F3EE" };
type Screen = "packages"|"trip"|"seat"|"room"|"passengers"|"review"|"success"|"track"|"profile"|"login"|"otp";
interface Pax { name:string; phone:string; idNumber:string; birthDate:string; }
const money=(n:number)=>Math.round(n).toLocaleString("en-US");
const availSeats=(t:Trip)=>Math.max(0,t.seats-t.bookedSeats);
const validPhone=(p:string)=>/^(05\d{8}|(\+?966)5\d{8})$/.test(p.replace(/\s/g,""));

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

/* تقويم شهري لاختيار موعد السفر — المتاح أبيض قابل للضغط، غير المتاح رمادي معطّل */
function TripCalendar({trips,value,onPick}:{trips:Trip[];value?:string;onPick:(t:Trip)=>void}){
  const byDate=useMemo(()=>{ const m=new Map<string,Trip>(); trips.forEach(t=>{ if(!m.has(t.departureDate)) m.set(t.departureDate,t); }); return m; },[trips]);
  const first=trips.map(t=>t.departureDate).sort()[0];
  const initial=first?new Date(first+"T00:00:00"):new Date();
  const [ym,setYm]=useState<{y:number;m:number}>({y:initial.getFullYear(),m:initial.getMonth()});
  const daysInMonth=new Date(ym.y,ym.m+1,0).getDate();
  const firstCol=(new Date(ym.y,ym.m,1).getDay()+1)%7;
  const cells:(number|null)[]=[]; for(let i=0;i<firstCol;i++)cells.push(null); for(let d=1;d<=daysInMonth;d++)cells.push(d);
  const pad=(n:number)=>String(n).padStart(2,"0");
  const move=(dir:number)=>setYm(s=>{ let m=s.m+dir,y=s.y; if(m<0){m=11;y--;} if(m>11){m=0;y++;} return {y,m}; });
  return (
    <div className="rounded-2xl p-4" style={{background:"#fff",border:`1px solid ${B.border}`}}>
      <div className="flex items-center justify-between mb-3">
        <button onClick={()=>move(-1)} className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer" style={{background:B.bg,border:`1px solid ${B.border}`}}><ChevronRight size={16}/></button>
        <div className="font-extrabold" style={{color:B.black}}>{AR_MONTHS[ym.m]} {ym.y}</div>
        <button onClick={()=>move(1)} className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer" style={{background:B.bg,border:`1px solid ${B.border}`}}><ChevronLeft size={16}/></button>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {AR_WEEK.map((w,i)=><div key={"w"+i} className="text-center" style={{fontSize:11,color:B.muted,fontWeight:700}}>{w}</div>)}
        {cells.map((d,i)=>{
          if(d===null) return <div key={"e"+i} style={{height:44}}/>;
          const ds=`${ym.y}-${pad(ym.m+1)}-${pad(d)}`;
          const trip=byDate.get(ds); const on=value===trip?.id;
          return (
            <button key={"d"+i} disabled={!trip} onClick={()=>trip&&onPick(trip)}
              className="rounded-xl flex items-center justify-center cursor-pointer"
              style={{height:44,fontSize:14,fontWeight:trip?800:500,
                background:on?G.green:trip?"#fff":"#F4F1EC",
                color:on?"#fff":trip?B.black:"#C4BCB0",
                border:`1.5px solid ${on?G.green:trip?G.green:"transparent"}`,
                cursor:trip?"pointer":"not-allowed"}}>{d}</button>
          );
        })}
      </div>
    </div>
  );
}

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
  const [seats,setSeats]=useState<number[]>([]);
  const [takenSeats,setTakenSeats]=useState<number[]>([]);
  const [pax,setPax]=useState<Pax[]>([{name:"",phone:"",idNumber:"",birthDate:""}]);
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
  useEffect(()=>{ setPax(prev=>{ const a=[...prev]; while(a.length<persons) a.push({name:"",phone:"",idNumber:"",birthDate:""}); return a.slice(0,persons); }); },[persons]);
  useEffect(()=>{ if(trip){ setSeats([]); fetchTakenSeats(trip.id).then(setTakenSeats); } },[trip?.id]);
  useEffect(()=>()=>{ if(resendTimer.current) clearInterval(resendTimer.current); },[]);

  const activePkgs=cat.packages.filter(p=>p.status==="active" && (p.settings?.allowOnlineBooking!==false));
  const pkgTrips=(p:Pkg)=>cat.trips.filter(x=>x.packageId===p.id && x.status==="open" && availSeats(x)>0).sort((a,b)=>a.departureDate.localeCompare(b.departureDate));
  const transport=trip?cat.transports.find(x=>x.id===trip.transportId):undefined;
  const hotel=pkg?cat.hotels.find(h=>h.id===pkg.hotelId):undefined;
  const rooms=pkg?.roomPrices??[];
  const nights=pkg?.nights||1;
  const perPerson=room?room.perNight*nights:(trip?.price??0);
  const total=perPerson*persons;
  const takenSet=useMemo(()=>new Set(takenSeats),[takenSeats]);

  function reset(){ setPkg(null);setTrip(null);setPersons(1);setRoom(null);setSeats([]);setPax([{name:"",phone:"",idNumber:"",birthDate:""}]);setAgreed(false);setBookingNo("");setErrMsg(""); }
  function toggleSeat(n:number){ setSeats(prev=> prev.includes(n)?prev.filter(x=>x!==n):(prev.length>=persons?prev:[...prev,n])); }

  async function doSubmit(){
    if(submitting||!trip||!pkg) return;
    setErrMsg("");
    if(!agreed){ setErrMsg(t("iAgreeRead")); return; }
    for(const p of pax){ if(!p.name.trim()||!validPhone(p.phone)||!p.idNumber.trim()||!p.birthDate){ setErrMsg(t("required")); return; } }
    setSubmitting(true);
    try{
      const id=await submitBooking({
        tripId:trip.id, packageId:pkg.id, clientName:pax[0].name, clientPhone:pax[0].phone.replace(/\s/g,""),
        roomType:room?.type??"", persons, total, seats,
        pilgrims:pax.map(p=>({name:p.name,idNumber:p.idNumber,nationality:"",gender:"male",birthDate:p.birthDate,phone:p.phone.replace(/\s/g,"")})),
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

  const BottomBar=()=>(
    <div className="sticky bottom-0 z-30 grid grid-cols-3 gap-1 px-3 py-2" style={{background:"#fff",borderTop:`1px solid ${B.border}`}}>
      {([["packages",Home,t("home")],["track",Search,t("track")],["profile",Users,t("profile")]] as const).map(([sc,Icon,lbl])=>(
        <button key={sc} onClick={()=>setScreen(sc as Screen)} className="flex flex-col items-center gap-1 py-1.5 rounded-lg cursor-pointer" style={{background:"none",border:"none",color:screen===sc?G.green:B.muted}}>
          <Icon size={18}/><span style={{fontSize:10,fontWeight:700}}>{lbl}</span>
        </button>
      ))}
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

  const FeatureIcon=({txt}:{txt:string})=>{ const w=txt.includes("واي")||txt.toLowerCase().includes("wifi"); const s=txt.includes("شاش")||txt.toLowerCase().includes("screen")||txt.toLowerCase().includes("tv"); return w?<Wifi size={13}/>:s?<Tv size={13}/>:<BatteryCharging size={13}/>; };

  if(loading) return (
    <div dir={dir} className="min-h-screen flex flex-col items-center justify-center gap-4" style={{background:`linear-gradient(160deg,${G.deep},${G.dark})`}}>
      <TasaheelMark size={56}/>
      <motion.span animate={{rotate:360}} transition={{repeat:Infinity,duration:0.9,ease:"linear"}} style={{width:22,height:22,border:"2.5px solid rgba(231,194,113,0.35)",borderTopColor:G.gold,borderRadius:"50%",display:"inline-block"}}/>
      <div className="text-xs" style={{color:G.gold,letterSpacing:2}}>{t("loading")}</div>
    </div>
  );

  return (
    <div dir={dir} lang={lang} className="min-h-screen flex flex-col relative" style={{background:G.bg,fontFamily:"'IBM Plex Sans Arabic',system-ui,sans-serif"}}>
      {/* R1: خلفية خفيفة */}
      <div aria-hidden style={{position:"fixed",inset:0,backgroundImage:"url(/bg-haram.jpg)",backgroundSize:"cover",backgroundPosition:"center",opacity:0.06,pointerEvents:"none",zIndex:0}}/>
      <div className="relative flex flex-col flex-1" style={{zIndex:1}}>

      {/* ═══ PACKAGES ═══ */}
      {screen==="packages"&&<>
        <AppBar/>
        <div className="px-4 py-4 flex-1">
          <div className="rounded-2xl p-5 mb-4 text-center" style={{background:`linear-gradient(150deg,${G.deep},${G.dark})`,color:"#fff"}}>
            <div className="text-xl font-extrabold" style={{fontFamily:"'Noto Kufi Arabic',serif"}}>{t("brand")}</div>
            <div className="text-sm mt-1" style={{color:"#CFE4DC"}}>{t("tagline")}</div>
          </div>
          <div className="font-extrabold mb-3" style={{color:B.black,fontSize:16}}>{t("choosePackage")}</div>
          <div className="flex flex-col gap-3">
            {activePkgs.map(p=>{
              const rp=p.roomPrices.map(r=>r.perNight).filter(Boolean) as number[];
              const min=rp.length?Math.min(...rp)*(p.nights||1):p.marketPrice;
              const trips=pkgTrips(p);
              return (
                <button key={p.id} onClick={()=>{setPkg(p);setTrip(null);setPersons(1);setRoom(null);setScreen("trip");}} disabled={!trips.length}
                  className="text-right rounded-2xl overflow-hidden cursor-pointer" style={{border:`1px solid ${B.border}`,background:"#fff",opacity:trips.length?1:.6}}>
                  <img src={p.coverImage||"/hotel.jpg"} alt="" style={{width:"100%",height:120,objectFit:"cover"}}/>
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-extrabold" style={{color:B.black,fontSize:15}}>{p.name}</div>
                      <div className="text-left flex-shrink-0"><div className="text-xs" style={{color:B.muted}}>{t("from")}</div><div className="font-extrabold" style={{color:G.green,fontFamily:"'IBM Plex Mono',monospace"}}>{money(min)} <span className="text-xs">{t("currency")}</span></div></div>
                    </div>
                    <div className="text-xs mt-1 flex items-center gap-3" style={{color:B.text2}}>
                      <span>{p.days} {t("days")} · {p.nights} {t("nights")}</span>
                      {!trips.length&&<span style={{color:"#BE2626",fontWeight:700}}>{t("soldOut")}</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        <BottomBar/>
      </>}

      {/* ═══ TRIP (calendar) + PEOPLE ═══ */}
      {screen==="trip"&&pkg&&<>
        <AppBar title={pkg.name} onBack={()=>setScreen("packages")}/>
        <div className="px-4 py-4 flex-1 flex flex-col gap-5">
          <div>
            <div className="font-extrabold mb-2 flex items-center gap-2" style={{color:B.black}}><CalendarDays size={16} style={{color:G.green}}/>{t("chooseTrip")}</div>
            {pkgTrips(pkg).length===0
              ? <div className="text-sm" style={{color:B.muted}}>{t("noTrips")}</div>
              : <TripCalendar trips={pkgTrips(pkg)} value={trip?.id} onPick={(tr)=>{setTrip(tr);setPersons(p=>Math.min(Math.max(1,p),availSeats(tr)));}}/>}
            {trip&&<div className="mt-2 rounded-xl p-3 flex items-center gap-2 text-sm" style={{background:"#EAF5F0",border:`1px solid ${G.green}`,color:B.black}}>
              <CalendarDays size={15} style={{color:G.green}}/><b>{trip.departureDate}</b><Clock size={13} style={{color:G.green}}/>{trip.departureTime}{transport&&<span style={{color:B.muted}}>· {transport.name}</span>}
            </div>}
          </div>
          {trip&&<div>
            <div className="font-extrabold mb-2 flex items-center gap-2" style={{color:B.black}}><Users size={16} style={{color:G.green}}/>{t("people")}</div>
            <div className="flex items-center gap-4 rounded-xl p-3" style={{background:"#fff",border:`1px solid ${B.border}`}}>
              <button onClick={()=>setPersons(p=>Math.max(1,p-1))} className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer" style={{background:B.bg,border:`1px solid ${B.border}`}}><Minus size={16}/></button>
              <div className="flex-1 text-center font-extrabold text-2xl" style={{color:B.black}}>{persons}</div>
              <button onClick={()=>setPersons(p=>Math.min(availSeats(trip),p+1))} className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer" style={{background:B.bg,border:`1px solid ${B.border}`}}><Plus size={16}/></button>
            </div>
          </div>}
        </div>
        <div className="px-4 py-3" style={{background:"#fff",borderTop:`1px solid ${B.border}`}}>
          <button disabled={!trip} onClick={()=>setScreen("seat")} className="w-full py-3.5 rounded-xl font-extrabold text-sm" style={primaryBtn(!!trip)}>{t("next")}</button>
        </div>
      </>}

      {/* ═══ SEAT (bus map) ═══ */}
      {screen==="seat"&&trip&&<>
        <AppBar title={t("chooseSeat")} onBack={()=>setScreen("trip")}/>
        <div className="px-4 py-4 flex-1 flex flex-col gap-4">
          {/* bus photo + info */}
          <div className="rounded-2xl overflow-hidden" style={{border:`1px solid ${B.border}`,background:"#fff"}}>
            <img src="/bus.jpg" alt="" style={{width:"100%",height:130,objectFit:"cover"}}/>
            <div className="p-3">
              <div className="font-extrabold" style={{color:B.black}}>{transport?.name??t("chooseSeat")}</div>
              {transport&&transport.features.length>0&&<div className="flex flex-wrap gap-2 mt-2">
                {transport.features.slice(0,6).map(f=>(
                  <span key={f.id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold" style={{background:"#EAF5F0",color:G.deep}}><FeatureIcon txt={f.text}/>{f.text}</span>
                ))}
              </div>}
            </div>
          </div>
          <div className="text-sm font-bold" style={{color:B.black}}>{t("pickSeatsHint").replace("{n}",String(persons))}</div>
          <div className="rounded-2xl p-4" style={{background:"#fff",border:`1px solid ${B.border}`}}>
            <BusSeatGrid capacity={trip.seats} occupied={takenSet} selected={seats} need={persons} onToggle={toggleSeat}/>
          </div>
          {seats.length>0&&<div className="rounded-xl p-3 text-sm" style={{background:"#FFF7EA",border:`1px solid ${B.gold}`,color:"#8a6a08"}}>
            {seats.map(s=>`مقعد ${s}${seatNote(s,trip.seats)?` (${seatNote(s,trip.seats)})`:""}`).join(" · ")}
          </div>}
        </div>
        <div className="px-4 py-3" style={{background:"#fff",borderTop:`1px solid ${B.border}`}}>
          <button disabled={seats.length!==persons} onClick={()=>setScreen("room")} className="w-full py-3.5 rounded-xl font-extrabold text-sm" style={primaryBtn(seats.length===persons)}>{t("next")}</button>
        </div>
      </>}

      {/* ═══ ROOM (cards) ═══ */}
      {screen==="room"&&pkg&&<>
        <AppBar title={t("chooseRoom")} onBack={()=>setScreen("seat")}/>
        <div className="px-4 py-4 flex-1 flex flex-col gap-3">
          {hotel&&<div className="rounded-2xl overflow-hidden" style={{border:`1px solid ${B.border}`,background:"#fff"}}>
            <img src={(hotel.media?.find(m=>m.primary)?.url)||"/hotel.jpg"} alt="" style={{width:"100%",height:120,objectFit:"cover"}}/>
            <div className="p-3">
              <div className="font-extrabold" style={{color:B.black}}>{hotel.name} · {hotel.city} · {hotel.stars}★</div>
              {hotel.features.length>0&&<div className="flex flex-wrap gap-2 mt-2">{hotel.features.slice(0,5).map(f=>(<span key={f.id} className="px-2.5 py-1 rounded-full text-xs font-bold" style={{background:"#EAF5F0",color:G.deep}}>{f.text}</span>))}</div>}
            </div>
          </div>}
          {rooms.map(r=>{ const pp=r.perNight*nights; const on=room?.id===r.id; return (
            <button key={r.id} onClick={()=>setRoom(r)} className="text-right rounded-2xl p-4 cursor-pointer flex items-center justify-between gap-3" style={{border:`2px solid ${on?G.green:B.border}`,background:on?"#EAF5F0":"#fff"}}>
              <div><div className="font-extrabold" style={{color:B.black}}>{roomLabel(r)}</div></div>
              <div className="text-left flex-shrink-0"><div className="font-extrabold text-lg" style={{color:G.green,fontFamily:"'IBM Plex Mono',monospace"}}>{money(pp)} {t("currency")}</div><div className="text-xs" style={{color:B.muted}}>{t("perPerson")}</div></div>
            </button>
          ); })}
          {rooms.length===0&&<div className="text-sm" style={{color:B.muted}}>—</div>}
        </div>
        <div className="px-4 py-3 flex items-center gap-3" style={{background:"#fff",borderTop:`1px solid ${B.border}`}}>
          <div className="flex-1"><div className="text-xs" style={{color:B.muted}}>{t("total")}</div><div className="font-extrabold text-lg" style={{color:G.green,fontFamily:"'IBM Plex Mono',monospace"}}>{money(total)} {t("currency")}</div></div>
          <button disabled={!room} onClick={()=>setScreen("passengers")} className="px-8 py-3.5 rounded-xl font-extrabold text-sm" style={primaryBtn(!!room)}>{t("next")}</button>
        </div>
      </>}

      {/* ═══ PASSENGERS ═══ */}
      {screen==="passengers"&&<>
        <AppBar title={t("passengers")} onBack={()=>setScreen("room")}/>
        <div className="px-4 py-4 flex-1 flex flex-col gap-4">
          {pax.map((p,i)=>(
            <div key={i} className="rounded-2xl p-4 flex flex-col gap-3" style={{background:"#fff",border:`1px solid ${B.border}`}}>
              <div className="font-extrabold text-sm flex items-center justify-between" style={{color:G.green}}>{t("person")} {i+1}{seats[i]!=null&&<span className="px-2 py-0.5 rounded-full text-xs" style={{background:"#FFF7EA",color:"#8a6a08",border:`1px solid ${B.gold}`}}>مقعد {seats[i]}</span>}</div>
              <input value={p.name} onChange={e=>setPax(a=>a.map((x,j)=>j===i?{...x,name:e.target.value}:x))} placeholder={t("name")} className="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none" style={{borderColor:B.border}}/>
              <input value={p.phone} onChange={e=>setPax(a=>a.map((x,j)=>j===i?{...x,phone:e.target.value}:x))} placeholder={t("phone")} className="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none" style={{borderColor:B.border,direction:"ltr",textAlign:dir==="rtl"?"right":"left"}}/>
              <input value={p.idNumber} onChange={e=>setPax(a=>a.map((x,j)=>j===i?{...x,idNumber:e.target.value}:x))} placeholder={t("idNumber")} className="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none" style={{borderColor:B.border,direction:"ltr",textAlign:dir==="rtl"?"right":"left"}}/>
              <ArabicDatePicker value={p.birthDate} onChange={v=>setPax(a=>a.map((x,j)=>j===i?{...x,birthDate:v}:x))} placeholder={t("birthDate")}/>
            </div>
          ))}
        </div>
        <div className="px-4 py-3" style={{background:"#fff",borderTop:`1px solid ${B.border}`}}>
          <button onClick={()=>setScreen("review")} className="w-full py-3.5 rounded-xl font-extrabold text-sm" style={primaryBtn(true)}>{t("next")}</button>
        </div>
      </>}

      {/* ═══ REVIEW ═══ */}
      {screen==="review"&&pkg&&trip&&<>
        <AppBar title={t("review")} onBack={()=>setScreen("passengers")}/>
        <div className="px-4 py-4 flex-1 flex flex-col gap-3">
          <div className="rounded-2xl p-4 flex flex-col gap-2" style={{background:"#fff",border:`1px solid ${B.border}`}}>
            {[[t("package"),pkg.name],[t("trip"),`${trip.departureDate} · ${trip.departureTime}`],[t("room"),room?roomLabel(room):"—"],[t("people"),`${persons}`],["المقاعد",seats.join("، ")||"—"]].map(([l,v])=>(
              <div key={l} className="flex items-center justify-between gap-2 text-sm"><span style={{color:B.muted}}>{l}</span><span className="font-bold" style={{color:B.black}}>{v}</span></div>
            ))}
          </div>
          <div className="rounded-2xl overflow-hidden" style={{border:`1px solid ${B.border}`}}>
            {pax.map((p,i)=>(<div key={i} className="px-4 py-2.5 text-sm flex items-center justify-between" style={{background:i%2?"#FDFCFA":"#fff",borderTop:i?`1px solid ${B.border}`:"none"}}><span className="font-bold" style={{color:B.black}}>{p.name||"—"}</span><span className="font-mono text-xs" style={{color:B.muted,direction:"ltr"}}>{p.phone}</span></div>))}
          </div>
          <div className="rounded-2xl p-4" style={{background:G.deep,color:"#fff"}}>
            <div className="flex items-center justify-between"><span>{t("total")}</span><span className="font-extrabold text-2xl" style={{fontFamily:"'IBM Plex Mono',monospace"}}>{money(total)} {t("currency")}</span></div>
          </div>
          {/* R7: terms link + agree */}
          <div className="flex items-center gap-2">
            <button onClick={()=>setTermsOpen(true)} className="text-sm font-bold underline cursor-pointer" style={{background:"none",border:"none",color:"#1E52C7",padding:0}}>{t("readTerms")}</button>
            {agreed&&<Check size={16} style={{color:G.green}}/>}
          </div>
          {errMsg&&<div className="rounded-xl px-4 py-3 text-sm font-bold" style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}>{errMsg}</div>}
        </div>
        <div className="px-4 py-3" style={{background:"#fff",borderTop:`1px solid ${B.border}`}}>
          <button disabled={!agreed||submitting} onClick={doSubmit} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-extrabold text-sm" style={primaryBtn(agreed&&!submitting)}>
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
    </div>
  );
}
