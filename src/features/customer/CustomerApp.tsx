import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Globe, ChevronLeft, Check, Users, CalendarDays, Clock, MapPin, Plus, Minus, X, Search, Home, Ticket as TicketIcon, ArrowLeft } from "lucide-react";
import { B } from "@/lib/theme";
import type { Pkg, Trip } from "@/types";
import { TasaheelMark } from "@/components/TasaheelMark";
import { ArabicDatePicker } from "@/components/ArabicDatePicker";
import { QRBlock } from "@/components/QRBlock";
import { LANGS, dirOf, makeT, type Lang } from "./i18n";
import { fetchCatalog, submitBooking, lookupBooking, SeatsError, type Catalog, type TrackResult } from "./data";

const G = { deep:"#0B5A41", dark:"#073A2B", green:B.primary, gold:B.gold, bg:"#F5F3EE" };
type Screen = "packages"|"trip"|"room"|"passengers"|"review"|"success"|"track"|"ticket"|"profile";
interface Pax { name:string; phone:string; idNumber:string; birthDate:string; }
const money=(n:number)=>n.toLocaleString("en-US");
const availSeats=(t:Trip)=>Math.max(0,t.seats-t.bookedSeats);

function roomOptions(pkg:Pkg){
  const shared=pkg.roomPrices.filter(r=>r.type.includes("مشترك"));
  const priv=pkg.roomPrices.filter(r=>!r.type.includes("مشترك"));
  const pick=(a:typeof shared)=>a.length?a.reduce((x,y)=>x.perNight<y.perNight?x:y):undefined;
  return { shared:pick(shared), private:pick(priv) };
}

const TRACK_STEPS=["stepReview","stepAccepted","stepAwaitPay","stepPaid","stepConfirmed","stepTicket"];
const statusToStep=(s:string)=>({reviewing:0,new:0,accepted:1,awaiting_payment:2,paid:3,confirmed:4,verified:4}[s] ?? 0);

export function CustomerApp(){
  const [lang,setLang]=useState<Lang>("ar");
  const t=useMemo(()=>makeT(lang),[lang]);
  const dir=dirOf(lang);
  const [screen,setScreen]=useState<Screen>("packages");
  const [cat,setCat]=useState<Catalog>({packages:[],trips:[],hotels:[]});
  const [loading,setLoading]=useState(true);
  const [langOpen,setLangOpen]=useState(false);

  // booking state
  const [pkg,setPkg]=useState<Pkg|null>(null);
  const [trip,setTrip]=useState<Trip|null>(null);
  const [persons,setPersons]=useState(1);
  const [roomKind,setRoomKind]=useState<"shared"|"private">("shared");
  const [pax,setPax]=useState<Pax[]>([{name:"",phone:"",idNumber:"",birthDate:""}]);
  const [agree,setAgree]=useState(false);
  const [submitting,setSubmitting]=useState(false);
  const [bookingNo,setBookingNo]=useState("");
  const [errMsg,setErrMsg]=useState("");

  useEffect(()=>{ fetchCatalog().then(c=>{setCat(c);setLoading(false);}); },[]);
  useEffect(()=>{ setPax(prev=>{ const a=[...prev]; while(a.length<persons) a.push({name:"",phone:"",idNumber:"",birthDate:""}); return a.slice(0,persons); }); },[persons]);

  const activePkgs=cat.packages.filter(p=>p.status==="active" && (p.settings?.allowOnlineBooking!==false));
  const pkgTrips=(p:Pkg)=>cat.trips.filter(x=>x.packageId===p.id && x.status==="open" && availSeats(x)>0).sort((a,b)=>a.departureDate.localeCompare(b.departureDate));
  const rooms=pkg?roomOptions(pkg):{shared:undefined,private:undefined};
  const room=roomKind==="shared"?rooms.shared:rooms.private;
  const nights=pkg?.nights||1;
  const perPerson=room?room.perNight*nights:(trip?.price??0);
  const total=perPerson*persons;

  function reset(){ setPkg(null);setTrip(null);setPersons(1);setRoomKind("shared");setPax([{name:"",phone:"",idNumber:"",birthDate:""}]);setAgree(false);setBookingNo("");setErrMsg(""); }

  async function doSubmit(){
    if(submitting) return;
    setErrMsg("");
    if(!trip||!pkg) return;
    if(!agree){ setErrMsg(t("agree")); return; }
    for(const p of pax){ if(!p.name.trim()||!/^(05\d{8}|(\+?966)5\d{8})$/.test(p.phone.replace(/\s/g,""))||!p.idNumber.trim()||!p.birthDate){ setErrMsg(t("required")); return; } }
    setSubmitting(true);
    try{
      const id=await submitBooking({
        tripId:trip.id, packageId:pkg.id, clientName:pax[0].name, clientPhone:pax[0].phone.replace(/\s/g,""),
        roomType:room?.type??(roomKind==="shared"?t("roomShared"):t("roomPrivate")), persons, total,
        pilgrims:pax.map(p=>({name:p.name,idNumber:p.idNumber,nationality:"",gender:"male",birthDate:p.birthDate,phone:p.phone.replace(/\s/g,"")})),
      });
      setBookingNo(id); setScreen("success");
    }catch(e){
      if(e instanceof SeatsError) setErrMsg(`${t("errSeats")} (${t("seatsLeft")}: ${e.available})`);
      else setErrMsg(t("errSeats"));
    }finally{ setSubmitting(false); }
  }

  const AppBar=({title,onBack}:{title?:string;onBack?:()=>void})=>(
    <div className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3" style={{background:G.deep,color:"#fff"}}>
      {onBack
        ? <button onClick={onBack} className="p-1.5 rounded-lg cursor-pointer" style={{background:"rgba(255,255,255,.1)",border:"none",color:"#fff"}}>{dir==="rtl"?<ChevronLeft size={18} style={{transform:"scaleX(-1)"}}/>:<ChevronLeft size={18}/>}</button>
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
        <button key={sc} onClick={()=>{setScreen(sc as Screen);}} className="flex flex-col items-center gap-1 py-1.5 rounded-lg cursor-pointer" style={{background:"none",border:"none",color:screen===sc?G.green:B.muted}}>
          <Icon size={18}/><span style={{fontSize:10,fontWeight:700}}>{lbl}</span>
        </button>
      ))}
    </div>
  );

  const cardBtn={borderColor:B.border,background:"#fff"} as const;
  const primaryBtn=(on=true)=>({background:on?G.gold:"#d6cfc6",color:on?B.black:"#a09688",border:"none",cursor:on?"pointer":"not-allowed"} as const);

  return (
    <div dir={dir} lang={lang} className="min-h-screen flex flex-col" style={{background:G.bg,fontFamily:"'IBM Plex Sans Arabic',system-ui,sans-serif"}}>
      {/* ═══ PACKAGES ═══ */}
      {screen==="packages"&&<>
        <AppBar/>
        <div className="px-4 py-4 flex-1">
          <div className="rounded-2xl p-5 mb-4 text-center" style={{background:`linear-gradient(150deg,${G.deep},${G.dark})`,color:"#fff"}}>
            <div className="text-xl font-extrabold" style={{fontFamily:"'Noto Kufi Arabic',serif"}}>{t("brand")}</div>
            <div className="text-sm mt-1" style={{color:"#CFE4DC"}}>{t("tagline")}</div>
          </div>
          <div className="font-extrabold mb-3" style={{color:B.black,fontSize:16}}>{t("choosePackage")}</div>
          {loading&&<div className="text-center py-16" style={{color:B.muted}}>…</div>}
          <div className="flex flex-col gap-3">
            {activePkgs.map(p=>{
              const r=roomOptions(p); const perNights=[r.shared?.perNight,r.private?.perNight].filter(Boolean) as number[];
              const min=perNights.length?Math.min(...perNights)*(p.nights||1):p.marketPrice;
              const trips=pkgTrips(p);
              return (
                <button key={p.id} onClick={()=>{setPkg(p);setTrip(null);setPersons(1);setScreen("trip");}} disabled={!trips.length}
                  className="text-right rounded-2xl overflow-hidden cursor-pointer" style={{border:`1px solid ${B.border}`,background:"#fff",opacity:trips.length?1:.6}}>
                  {p.coverImage&&<img src={p.coverImage} alt="" style={{width:"100%",height:120,objectFit:"cover"}}/>}
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

      {/* ═══ TRIP + PEOPLE ═══ */}
      {screen==="trip"&&pkg&&<>
        <AppBar title={pkg.name} onBack={()=>setScreen("packages")}/>
        <div className="px-4 py-4 flex-1 flex flex-col gap-5">
          <div>
            <div className="font-extrabold mb-2 flex items-center gap-2" style={{color:B.black}}><CalendarDays size={16} style={{color:G.green}}/>{t("chooseTrip")}</div>
            {pkgTrips(pkg).length===0&&<div className="text-sm" style={{color:B.muted}}>{t("noTrips")}</div>}
            <div className="flex flex-col gap-2">
              {pkgTrips(pkg).map(tr=>{
                const on=trip?.id===tr.id; const av=availSeats(tr);
                return (
                  <button key={tr.id} onClick={()=>{setTrip(tr);setPersons(Math.min(persons,av)||1);}} className="text-right rounded-xl p-3 flex items-center justify-between gap-2 cursor-pointer"
                    style={{border:`1.5px solid ${on?G.green:B.border}`,background:on?"#EAF5F0":"#fff"}}>
                    <div className="flex items-center gap-2"><CalendarDays size={14} style={{color:G.green}}/><span className="font-bold text-sm" style={{color:B.black}}>{tr.departureDate}</span><span className="text-xs" style={{color:B.muted}}><Clock size={11} className="inline"/> {tr.departureTime}</span></div>
                    <span className="text-xs font-bold" style={{color:av<=5?"#BE2626":G.green}}>{av} {t("remaining")}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {trip&&<div>
            <div className="font-extrabold mb-2 flex items-center gap-2" style={{color:B.black}}><Users size={16} style={{color:G.green}}/>{t("people")}</div>
            <div className="flex items-center gap-4 rounded-xl p-3" style={{background:"#fff",border:`1px solid ${B.border}`}}>
              <button onClick={()=>setPersons(p=>Math.max(1,p-1))} className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer" style={{background:B.bg,border:`1px solid ${B.border}`}}><Minus size={16}/></button>
              <div className="flex-1 text-center font-extrabold text-2xl" style={{color:B.black}}>{persons}</div>
              <button onClick={()=>setPersons(p=>Math.min(availSeats(trip),p+1))} className="w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer" style={{background:B.bg,border:`1px solid ${B.border}`}}><Plus size={16}/></button>
            </div>
            <div className="text-xs mt-1.5" style={{color:B.muted}}>{t("seatsLeft")}: {availSeats(trip)}</div>
          </div>}
        </div>
        <div className="px-4 py-3" style={{background:"#fff",borderTop:`1px solid ${B.border}`}}>
          <button disabled={!trip} onClick={()=>setScreen("room")} className="w-full py-3.5 rounded-xl font-extrabold text-sm" style={primaryBtn(!!trip)}>{t("next")}</button>
        </div>
      </>}

      {/* ═══ ROOM ═══ */}
      {screen==="room"&&pkg&&<>
        <AppBar title={t("chooseRoom")} onBack={()=>setScreen("trip")}/>
        <div className="px-4 py-4 flex-1 flex flex-col gap-3">
          {(["shared","private"] as const).map(k=>{
            const r=k==="shared"?rooms.shared:rooms.private; if(!r) return null;
            const pp=r.perNight*nights; const on=roomKind===k;
            return (
              <button key={k} onClick={()=>setRoomKind(k)} className="text-right rounded-2xl p-4 cursor-pointer flex items-center justify-between gap-3"
                style={{border:`2px solid ${on?G.green:B.border}`,background:on?"#EAF5F0":"#fff"}}>
                <div>
                  <div className="font-extrabold flex items-center gap-2" style={{color:B.black}}>{k==="shared"?t("roomShared"):t("roomPrivate")}{k==="shared"&&<span className="text-xs px-2 py-0.5 rounded-full" style={{background:"#FBF3D6",color:"#8A6A08"}}>{t("mostWanted")}</span>}</div>
                  <div className="text-xs mt-1" style={{color:B.muted}}>{r.type}</div>
                </div>
                <div className="text-left flex-shrink-0"><div className="font-extrabold text-lg" style={{color:G.green,fontFamily:"'IBM Plex Mono',monospace"}}>{money(pp)} {t("currency")}</div><div className="text-xs" style={{color:B.muted}}>{t("perPerson")}</div></div>
              </button>
            );
          })}
          {room&&<div className="rounded-2xl p-4 mt-2" style={{background:G.deep,color:"#fff"}}>
            <div className="flex items-center justify-between"><span>{persons} × {money(perPerson)} {t("currency")}</span><span className="font-extrabold text-xl" style={{fontFamily:"'IBM Plex Mono',monospace"}}>{money(total)} {t("currency")}</span></div>
            <div className="text-xs mt-1" style={{color:"#CFE4DC"}}>{t("total")}</div>
          </div>}
        </div>
        <div className="px-4 py-3" style={{background:"#fff",borderTop:`1px solid ${B.border}`}}>
          <button disabled={!room} onClick={()=>setScreen("passengers")} className="w-full py-3.5 rounded-xl font-extrabold text-sm" style={primaryBtn(!!room)}>{t("next")}</button>
        </div>
      </>}

      {/* ═══ PASSENGERS ═══ */}
      {screen==="passengers"&&<>
        <AppBar title={t("passengers")} onBack={()=>setScreen("room")}/>
        <div className="px-4 py-4 flex-1 flex flex-col gap-4">
          {pax.map((p,i)=>(
            <div key={i} className="rounded-2xl p-4 flex flex-col gap-3" style={{background:"#fff",border:`1px solid ${B.border}`}}>
              <div className="font-extrabold text-sm" style={{color:G.green}}>{t("person")} {i+1}</div>
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
            {[[t("package"),pkg.name],[t("trip"),`${trip.departureDate} · ${trip.departureTime}`],[t("room"),roomKind==="shared"?t("roomShared"):t("roomPrivate")],[t("people"),`${persons}`]].map(([l,v])=>(
              <div key={l} className="flex items-center justify-between gap-2 text-sm"><span style={{color:B.muted}}>{l}</span><span className="font-bold" style={{color:B.black}}>{v}</span></div>
            ))}
          </div>
          <div className="rounded-2xl overflow-hidden" style={{border:`1px solid ${B.border}`}}>
            {pax.map((p,i)=>(<div key={i} className="px-4 py-2.5 text-sm flex items-center justify-between" style={{background:i%2?"#FDFCFA":"#fff",borderTop:i?`1px solid ${B.border}`:"none"}}><span className="font-bold" style={{color:B.black}}>{p.name||"—"}</span><span className="font-mono text-xs" style={{color:B.muted,direction:"ltr"}}>{p.phone}</span></div>))}
          </div>
          <div className="rounded-2xl p-4" style={{background:G.deep,color:"#fff"}}>
            <div className="flex items-center justify-between"><span>{t("total")}</span><span className="font-extrabold text-2xl" style={{fontFamily:"'IBM Plex Mono',monospace"}}>{money(total)} {t("currency")}</span></div>
          </div>
          <button onClick={()=>setAgree(a=>!a)} className="flex items-center gap-2.5 cursor-pointer" style={{background:"none",border:"none",padding:0}}>
            <span className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0" style={{background:agree?G.green:"#fff",border:`1.5px solid ${agree?G.green:B.border}`}}>{agree&&<Check size={14} style={{color:"#fff"}}/>}</span>
            <span className="text-sm font-bold" style={{color:B.black}}>{t("agree")}</span>
          </button>
          {errMsg&&<div className="rounded-xl px-4 py-3 text-sm font-bold" style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}>{errMsg}</div>}
        </div>
        <div className="px-4 py-3" style={{background:"#fff",borderTop:`1px solid ${B.border}`}}>
          <button disabled={!agree||submitting} onClick={doSubmit} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-extrabold text-sm" style={primaryBtn(agree&&!submitting)}>
            {submitting&&<motion.span animate={{rotate:360}} transition={{repeat:Infinity,duration:0.9,ease:"linear"}} style={{width:15,height:15,border:"2px solid rgba(0,0,0,0.3)",borderTopColor:B.black,borderRadius:"50%",display:"inline-block"}}/>}
            {submitting?t("submitting"):t("submit")}
          </button>
        </div>
      </>}

      {/* ═══ SUCCESS ═══ */}
      {screen==="success"&&<>
        <AppBar title={t("brand")}/>
        <div className="px-6 py-10 flex-1 flex flex-col items-center text-center gap-4">
          <motion.div initial={{scale:0}} animate={{scale:1}} transition={{type:"spring",damping:14}} className="w-20 h-20 rounded-full flex items-center justify-center" style={{background:"#E3F3E8"}}><Check size={40} style={{color:G.green}}/></motion.div>
          <div className="font-extrabold text-xl" style={{color:B.black}}>{t("successTitle")}</div>
          <div className="text-sm" style={{color:B.text2}}>{t("successMsg")}</div>
          <div className="rounded-xl px-6 py-4" style={{background:"#fff",border:`1px solid ${B.border}`}}>
            <div className="text-xs" style={{color:B.muted}}>{t("bookingNo")}</div>
            <div className="font-extrabold text-lg" style={{color:G.green,fontFamily:"'IBM Plex Mono',monospace"}}>{bookingNo}</div>
          </div>
          <div className="flex gap-3 w-full mt-2">
            <button onClick={()=>setScreen("track")} className="flex-1 py-3 rounded-xl font-bold text-sm cursor-pointer" style={{background:G.deep,color:"#fff",border:"none"}}>{t("track")}</button>
            <button onClick={()=>{reset();setScreen("packages");}} className="flex-1 py-3 rounded-xl font-bold text-sm cursor-pointer" style={{background:B.bg,color:B.text2,border:"none"}}>{t("home")}</button>
          </div>
        </div>
      </>}

      {/* ═══ TRACK ═══ */}
      {screen==="track"&&<TrackScreen t={t} dir={dir} defaultNo={bookingNo} AppBar={AppBar} BottomBar={BottomBar}/>}

      {/* ═══ PROFILE ═══ */}
      {screen==="profile"&&<>
        <AppBar title={t("profile")}/>
        <div className="px-4 py-4 flex-1 flex flex-col gap-3">
          <div className="rounded-2xl p-5 flex items-center gap-3" style={{background:`linear-gradient(150deg,${G.deep},${G.dark})`,color:"#fff"}}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{background:"rgba(255,255,255,.15)"}}><Users size={22}/></div>
            <div className="font-extrabold">{t("brand")}</div>
          </div>
          <button onClick={()=>setScreen("track")} className="rounded-2xl p-4 flex items-center justify-between cursor-pointer" style={{background:"#fff",border:`1px solid ${B.border}`}}>
            <span className="font-bold text-sm flex items-center gap-2" style={{color:B.black}}><Search size={16} style={{color:G.green}}/>{t("myBookings")}</span><ArrowLeft size={16} style={{color:B.muted,transform:dir==="rtl"?"none":"scaleX(-1)"}}/>
          </button>
          <div className="rounded-2xl p-4" style={{background:"#fff",border:`1px solid ${B.border}`}}>
            <div className="font-bold text-sm mb-3 flex items-center gap-2" style={{color:B.black}}><Globe size={16} style={{color:G.green}}/>{t("language")}</div>
            <div className="grid grid-cols-2 gap-2">
              {LANGS.map(l=>(<button key={l.code} onClick={()=>setLang(l.code)} className="py-2.5 rounded-xl text-sm font-bold cursor-pointer" style={{border:`1.5px solid ${lang===l.code?G.green:B.border}`,background:lang===l.code?"#EAF5F0":"#fff",color:B.black}}>{l.label}</button>))}
            </div>
          </div>
        </div>
        <BottomBar/>
      </>}
    </div>
  );
}

/* ═══ TRACK screen (own state) ═══ */
function TrackScreen({t,dir,defaultNo,AppBar,BottomBar}:{t:(k:string)=>string;dir:"rtl"|"ltr";defaultNo:string;AppBar:any;BottomBar:any}){
  const [no,setNo]=useState(defaultNo);
  const [phone,setPhone]=useState("");
  const [res,setRes]=useState<TrackResult|null>(null);
  const [searched,setSearched]=useState(false);
  const [busy,setBusy]=useState(false);
  async function go(){ if(busy||!no.trim()||!phone.trim())return; setBusy(true); const r=await lookupBooking(phone.replace(/\s/g,""),no.trim()); setRes(r);setSearched(true);setBusy(false); }
  const step=res?statusToStep(res.status):-1;
  return (<>
    <AppBar title={t("trackTitle")}/>
    <div className="px-4 py-4 flex-1 flex flex-col gap-3">
      <div className="text-sm" style={{color:B.muted}}>{t("trackHint")}</div>
      <input value={no} onChange={e=>setNo(e.target.value)} placeholder={t("bookingNo")} className="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none" style={{borderColor:B.border,direction:"ltr",textAlign:dir==="rtl"?"right":"left"}}/>
      <input value={phone} onChange={e=>setPhone(e.target.value)} placeholder={t("phone")} className="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none" style={{borderColor:B.border,direction:"ltr",textAlign:dir==="rtl"?"right":"left"}}/>
      <button onClick={go} disabled={busy} className="w-full py-3 rounded-xl font-bold text-sm cursor-pointer" style={{background:G.deep,color:"#fff",border:"none"}}>{busy?"…":t("lookup")}</button>
      {searched&&!res&&<div className="rounded-xl px-4 py-3 text-sm font-bold" style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}>{t("notFound")}</div>}
      {res&&<div className="rounded-2xl p-4 flex flex-col gap-4" style={{background:"#fff",border:`1px solid ${B.border}`}}>
        <div className="flex items-center justify-between"><span className="font-extrabold" style={{color:B.black,fontFamily:"'IBM Plex Mono',monospace"}}>{res.id}</span><span className="text-sm" style={{color:B.muted}}>{res.packageName}</span></div>
        <div className="flex flex-col gap-2">
          {TRACK_STEPS.map((s,i)=>{ const done=i<=step; return (
            <div key={s} className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold" style={{background:done?G.green:"#fff",border:done?"none":`1px solid ${B.border}`,color:done?"#fff":B.muted}}>{done?<Check size={13}/>:i+1}</div>
              <span className="text-sm" style={{color:done?B.black:B.muted,fontWeight:i===step?800:500}}>{t(s)}</span>
            </div>
          ); })}
        </div>
        {(res.status==="confirmed"||res.status==="verified")&&<div className="flex flex-col items-center gap-2 pt-3" style={{borderTop:`1px solid ${B.border}`}}>
          <QRBlock seed={res.id} size={120}/>
          <div className="text-xs font-bold" style={{color:B.muted}}>{t("ticket")}</div>
        </div>}
      </div>}
    </div>
    <BottomBar/>
  </>);
}
