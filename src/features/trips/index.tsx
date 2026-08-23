import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Building2, Plus, Trash2, X, Plane, Bus, MapPin, Link2, Clock, AlertTriangle, CalendarDays, ChevronUp, ChevronDown, ArrowRight } from "lucide-react";
import { B } from "@/lib/theme";
import type { Hotel, Transport, Pkg, TripStatus, Trip, Branch } from "@/types";
import { uid, parseYMD, ymd, tripDayColor, newId} from "@/lib/utils";
import { DEFAULT_TRIP_SETTINGS } from "@/data/trips";
import { StatusBadge } from "@/components/StatusBadge";
import { Spinner } from "@/components/Spinner";
import { StatCard } from "@/components/StatCard";
import { PageHeader } from "@/components/PageHeader";
import { AppSelect } from "@/components/AppSelect";
import { ArabicDatePicker } from "@/components/ArabicDatePicker";
import { useStore } from "@/store/useStore";
import { destBadge } from "@/features/packages";

const todayStart = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const tripLabel = (t:Trip, pkgName:string) => pkgName && pkgName!=="—" ? pkgName : (t.departurePoint || t.id);

/* ════════ إطلاق رحلة جديدة — نموذج تشغيلي (الباقة تحدّد السعر/الفندق/السعة) ════════ */
function LaunchTripModal({
  packages,transports,branches,prefillPkgId,onSave,onClose
}:{
  packages:Pkg[];transports:Transport[];branches:Branch[];
  prefillPkgId?:string;onSave:(t:Trip)=>void;onClose:()=>void;
}) {
  const [form,setForm]=useState<Omit<Trip,"id"|"bookedSeats"|"waitingSeats">>({
    packageId:prefillPkgId??"",transportId:"",hotelId:"",branchId:"",busPlate:"",busCode:"",
    departureDate:"",returnDate:"",departureTime:"22:00",
    departurePoint:"",departureMapUrl:"",
    seats:0,status:"open",price:0,
    drivers:[{id:uid(),name:"",phone:""}],
    settings:{...DEFAULT_TRIP_SETTINGS},
  });
  const [depMode,setDepMode]=useState<"branch"|"custom">("branch");
  const [busy,setBusy]=useState(false);
  const set=<K extends keyof typeof form>(k:K,v:(typeof form)[K])=>setForm(f=>({...f,[k]:v}));
  const inp="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none";
  const ist={borderColor:B.border,background:"#fff",color:B.black,fontFamily:"inherit"} as const;
  const req=<span style={{color:B.gold}}>*</span>;

  const activeBranches = branches.filter(b=>b.isActive);

  function pickPackage(pid:string){
    const p=packages.find(x=>x.id===pid);
    const tr=p?transports.find(t=>t.id===p.transportId):undefined;
    setForm(f=>({
      ...f, packageId:pid,
      transportId:p?.transportId??"", hotelId:p?.hotelId??"",
      seats:tr?.seats ?? f.seats, price:p?.marketPrice ?? f.price,
      settings:p?.settings?{...p.settings}:f.settings,
    }));
  }
  function pickBranch(bid:string){
    const b=activeBranches.find(x=>x.id===bid);
    setForm(f=>({...f,branchId:bid,departurePoint:b?b.name:"",departureMapUrl:b?.gmapUrl??""}));
  }

  const addDriver=()=>set("drivers",[...form.drivers,{id:uid(),name:"",phone:""}]);
  const delDriver=(id:string)=>set("drivers",form.drivers.filter(d=>d.id!==id));
  const updDriver=(id:string,field:"name"|"phone",val:string)=>set("drivers",form.drivers.map(d=>d.id===id?{...d,[field]:val}:d));

  const depOk = depMode==="branch" ? !!form.branchId : (!!form.departureMapUrl.trim()||!!form.departurePoint.trim());
  const canSave = !!form.packageId && form.drivers.some(d=>d.name.trim()) && !!form.busPlate.trim()
    && !!form.busCode.trim() && depOk && !!form.departureDate && !!form.departureTime;
  const returnInvalid = !!form.returnDate && !!form.departureDate && form.returnDate < form.departureDate;

  function handleSave(){
    if(!canSave||returnInvalid||busy) return;
    setBusy(true);
    onSave({...form,id:newId("TRP"),bookedSeats:0,waitingSeats:0});
  }

  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-50 flex items-start justify-center p-6 overflow-auto"
      style={{background:"rgba(14,12,11,0.78)",backdropFilter:"blur(4px)"}} onClick={onClose}>
      <motion.div initial={{opacity:0,y:30}} animate={{opacity:1,y:0}} exit={{opacity:0,y:30}}
        transition={{type:"spring",damping:30,stiffness:400}}
        className="w-full rounded-2xl overflow-hidden flex flex-col my-4" style={{maxWidth:540,background:"#fff"}} onClick={e=>e.stopPropagation()}>
        <div className="relative px-6 pt-5 pb-4 flex-shrink-0" style={{background:B.primary}}>
          <div className="absolute top-0 inset-x-0 h-1" style={{background:`linear-gradient(90deg,${B.gold},${B.gold2},${B.gold})`}}/>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{background:"rgba(192,134,44,0.15)",border:"1px solid rgba(192,134,44,0.3)"}}>🚌</div>
              <h2 className="font-extrabold text-white" style={{fontSize:16,fontFamily:"var(--font-app)"}}>إطلاق رحلة جديدة</h2>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer" style={{background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.1)",color:"#7a7068"}}><X size={14}/></button>
          </div>
        </div>
        <div className="flex flex-col gap-4 p-6 overflow-y-auto" style={{scrollbarWidth:"none"}}>
          {/* 1) الباقة */}
          <div>
            <label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>الباقة {req}</label>
            <AppSelect value={form.packageId} placeholder="اختر الباقة" onChange={pickPackage}
              options={packages.map(p=>({value:p.id,label:p.name}))}/>
            {form.packageId&&<div className="text-xs mt-1.5" style={{color:B.muted}}>السعر والفندق والسعة ({form.seats} مقعد) مأخوذة من الباقة.</div>}
          </div>
          {/* 2) السائقون */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold" style={{color:B.text3}}>السائقون {req}</label>
              <button onClick={addDriver} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer" style={{background:B.bg,border:`1px solid ${B.border}`,color:"#8a6a08"}}><Plus size={10}/>سائق آخر</button>
            </div>
            <div className="flex flex-col gap-2">
              {form.drivers.map((d,i)=>(
                <div key={d.id} className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0" style={{background:B.primary,color:B.gold}}>{i+1}</div>
                  <input className="flex-1 border rounded-xl px-3 py-2 text-sm focus:outline-none" style={ist} value={d.name} placeholder="اسم السائق" onChange={e=>updDriver(d.id,"name",e.target.value)}/>
                  <input className="border rounded-xl px-3 py-2 text-sm focus:outline-none" style={{...ist,direction:"ltr",width:140}} value={d.phone} placeholder="+966 5x xxx xxxx" onChange={e=>updDriver(d.id,"phone",e.target.value)}/>
                  {form.drivers.length>1&&<button onClick={()=>delDriver(d.id)} className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer flex-shrink-0" style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}><X size={12}/></button>}
                </div>
              ))}
            </div>
          </div>
          {/* 3) بيانات الباص */}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>رقم لوحة الباص {req}</label>
              <input className={inp} style={ist} value={form.busPlate} placeholder="أ ب ج 1234" onChange={e=>set("busPlate",e.target.value)}/></div>
            <div><label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>الرقم التعريفي للباص {req}</label>
              <input className={inp} style={{...ist,direction:"ltr",textAlign:"right"}} value={form.busCode} placeholder="1" onChange={e=>set("busCode",e.target.value)}/></div>
          </div>
          {/* 4) نقطة الانطلاق */}
          <div>
            <label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>نقطة الانطلاق {req}</label>
            <div className="flex gap-2 mb-2">
              {([["branch","من الفروع"],["custom","موقع آخر (خريطة)"]] as const).map(([m,lbl])=>(
                <button key={m} type="button" onClick={()=>setDepMode(m)} className="flex-1 py-2 rounded-xl text-xs font-bold cursor-pointer"
                  style={{border:`1px solid ${depMode===m?B.gold:B.border}`,background:depMode===m?B.primary:"#fff",color:depMode===m?B.gold:B.text2}}>{lbl}</button>
              ))}
            </div>
            {depMode==="branch"
              ? <AppSelect value={form.branchId} placeholder="اختر الفرع" onChange={pickBranch}
                  options={activeBranches.map(b=>({value:b.id,label:`${b.name} — ${b.city}`}))}/>
              : <div className="flex flex-col gap-2">
                  <input className={inp} style={ist} value={form.departurePoint} placeholder="اسم نقطة الانطلاق" onChange={e=>{set("branchId","");set("departurePoint",e.target.value);}}/>
                  <div className="flex items-center gap-2">
                    <Link2 size={15} style={{color:B.muted,flexShrink:0}}/>
                    <input className={inp} style={{...ist,direction:"ltr",textAlign:"right"}} value={form.departureMapUrl} placeholder="https://maps.google.com/…" onChange={e=>{set("branchId","");set("departureMapUrl",e.target.value);}}/>
                  </div>
                </div>}
          </div>
          {/* 5) التواريخ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>تاريخ الذهاب {req}</label>
              <ArabicDatePicker value={form.departureDate} onChange={v=>set("departureDate",v)} minDate={todayStart()}/></div>
            <div><label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>تاريخ العودة</label>
              <ArabicDatePicker value={form.returnDate} onChange={v=>set("returnDate",v)} minDate={form.departureDate?parseYMDDate(form.departureDate):todayStart()} invalid={returnInvalid}/>
              {returnInvalid&&<div className="text-xs font-bold mt-1" style={{color:"#BE2626"}}>تاريخ العودة لا يسبق الذهاب</div>}</div>
          </div>
          {/* 6) وقت الانطلاق */}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>وقت الانطلاق {req}</label>
              <input type="time" className={inp} style={{...ist,direction:"ltr",textAlign:"right"}} value={form.departureTime} onChange={e=>set("departureTime",e.target.value)}/></div>
          </div>
          {!canSave&&<div className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-bold" style={{background:"#FBF3D6",border:"1px solid #F0E3AE",color:"#8A6A08"}}>
            ⚠ أكمل: الباقة، سائق واحد على الأقل، لوحة الباص ورقمه التعريفي، نقطة الانطلاق، تاريخ ووقت الذهاب.
          </div>}
        </div>
        <div className="flex gap-3 px-6 py-4 flex-shrink-0" style={{borderTop:`1px solid ${B.border}`}}>
          <button onClick={handleSave} disabled={!canSave||returnInvalid||busy} className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold"
            style={{background:canSave&&!returnInvalid?B.gold:"#d6cfc6",color:canSave&&!returnInvalid?B.black:"#a09688",border:"none",cursor:canSave&&!returnInvalid&&!busy?"pointer":"not-allowed"}}>
            {busy&&<Spinner size={14} color={B.black}/>}
            <Plane size={14}/>{busy?"جارٍ الإطلاق…":"إطلاق الرحلة"}
          </button>
          <button onClick={onClose} className="px-5 py-3 rounded-xl text-sm font-bold cursor-pointer" style={{background:B.bg,color:B.text2,border:"none"}}>إلغاء</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

const parseYMDDate=(s:string):Date|undefined=>{ const p=parseYMD(s); return p?new Date(p.y,p.m,p.d):undefined; };

/* ════════ تأكيد إلغاء الرحلة (حماية) ════════ */
function CancelTripConfirm({trip,pkgName,onConfirm,onCancel}:{trip:Trip;pkgName:string;onConfirm:()=>void;onCancel:()=>void}) {
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{background:"rgba(14,12,11,0.8)"}} onClick={onCancel}>
      <motion.div initial={{scale:.95,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:.95,opacity:0}}
        className="w-full max-w-sm rounded-2xl overflow-hidden" style={{background:"#fff"}} onClick={e=>e.stopPropagation()}>
        <div className="px-6 pt-6 pb-4 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3" style={{background:"#FBE6E6"}}><AlertTriangle size={26} style={{color:"#BE2626"}}/></div>
          <div className="font-extrabold text-lg" style={{color:B.black}}>تأكيد إلغاء الرحلة</div>
          <div className="text-sm mt-2" style={{color:B.text2}}>
            أنت على وشك إلغاء رحلة <b style={{color:B.black}}>{tripLabel(trip,pkgName)}</b> بتاريخ <b style={{color:B.black}}>{trip.departureDate}</b>.
          </div>
          <div className="rounded-xl px-4 py-3 mt-4 text-xs font-bold w-full" style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}>
            سيؤثر هذا الإجراء على جميع الحجوزات المرتبطة بالرحلة.
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-xl font-extrabold text-sm cursor-pointer" style={{background:"#BE2626",color:"#fff",border:"none"}}>تأكيد إلغاء الرحلة</button>
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl font-bold text-sm cursor-pointer" style={{background:B.bg,color:B.text2,border:"none"}}>تراجع</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ════════ نافذة تفاصيل الرحلة ════════ */
function TripDetailsModal({trip,pkgName,hotelName,branch,onToggleStatus,onCancel,onClose}:{
  trip:Trip;pkgName:string;hotelName:string;branch?:Branch;
  onToggleStatus:()=>void;onCancel:()=>void;onClose:()=>void;
}) {
  const [confirmCancel,setConfirmCancel]=useState(false);
  const available=Math.max(0,trip.seats-trip.bookedSeats);
  const isCancelled=trip.status==="cancelled";
  const isFull=trip.status==="full"||available<=0;
  const mapUrl=trip.departureMapUrl||branch?.gmapUrl||"";
  const rows:[string,React.ReactNode][]=[
    ["الباقة",pkgName||"—"],["رقم الرحلة",<span style={{fontFamily:"var(--font-app)"}}>{trip.id}</span>],
    ["حالة الرحلة",<StatusBadge status={trip.status}/>],
    ["تاريخ الذهاب",trip.departureDate||"—"],["تاريخ العودة",trip.returnDate||"—"],
    ["وقت الانطلاق",trip.departureTime||"—"],
    ["رقم لوحة الباص",trip.busPlate||"—"],["الرقم التعريفي للباص",trip.busCode||"—"],
    ["نقطة الانطلاق",branch?`${branch.name} — ${branch.city}`:(trip.departurePoint||"—")],
    ["الفندق",hotelName||"—"],
  ];
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-auto"
      style={{background:"rgba(14,12,11,0.78)",backdropFilter:"blur(4px)"}} onClick={onClose}>
      <motion.div initial={{opacity:0,y:24}} animate={{opacity:1,y:0}} exit={{opacity:0,y:24}}
        className="w-full rounded-2xl overflow-hidden flex flex-col my-4" style={{maxWidth:560,background:"#fff"}} onClick={e=>e.stopPropagation()}>
        <div className="relative px-6 pt-5 pb-4 flex-shrink-0" style={{background:B.primary}}>
          <div className="absolute top-0 inset-x-0 h-1" style={{background:`linear-gradient(90deg,${B.gold},${B.gold2},${B.gold})`}}/>
          <div className="flex items-center justify-between">
            <h2 className="font-extrabold text-white" style={{fontSize:15,fontFamily:"var(--font-app)"}}>تفاصيل الرحلة – {tripLabel(trip,pkgName)}</h2>
            <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer" style={{background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.1)",color:"#CDE7E4"}}><X size={14}/></button>
          </div>
        </div>
        <div className="p-6 flex flex-col gap-5 overflow-y-auto" style={{scrollbarWidth:"none"}}>
          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              {l:"إجمالي المقاعد",v:trip.seats,bg:"#EAF1FE",fg:"#1E52C7",bd:"#CBDBFB"},
              {l:"المحجوزة",v:trip.bookedSeats,bg:"#E3F3E8",fg:"#1E7A44",bd:"#C4E4CE"},
              {l:"المتبقية",v:available,bg:"#FBF3D6",fg:"#8A6A08",bd:"#F0E3AE"},
            ].map(x=>(
              <div key={x.l} className="rounded-xl p-3 text-center" style={{background:x.bg,border:`1px solid ${x.bd}`}}>
                <div className="text-xs font-semibold mb-1" style={{color:x.fg,opacity:.85}}>{x.l}</div>
                <div className="text-2xl font-extrabold" style={{color:x.fg}}>{x.v}</div>
              </div>
            ))}
          </div>
          {/* Details grid */}
          <div className="rounded-2xl overflow-hidden" style={{border:`1px solid ${B.border}`}}>
            {rows.map(([l,v],i)=>(
              <div key={l} className="flex items-center justify-between gap-3 px-4 py-2.5" style={{background:i%2?"#FDFCFA":"#fff",borderTop:i?`1px solid ${B.border}`:"none"}}>
                <span className="text-xs font-semibold" style={{color:B.muted}}>{l}</span>
                <span className="text-sm font-bold text-left" style={{color:B.black}}>{v}</span>
              </div>
            ))}
          </div>
          {/* Drivers */}
          {trip.drivers.length>0&&(
            <div>
              <div className="text-xs font-bold mb-2" style={{color:B.muted}}>السائقون</div>
              <div className="flex flex-col gap-2">
                {trip.drivers.map(d=>(
                  <div key={d.id} className="flex items-center gap-3 px-4 py-2.5 rounded-xl" style={{background:"#fff",border:`1px solid ${B.border}`}}>
                    <span className="text-sm">🧑‍✈️</span>
                    <span className="flex-1 font-bold text-sm" style={{color:B.black}}>{d.name||"—"}</span>
                    <span className="font-mono text-xs" style={{color:B.muted,direction:"ltr"}}>{d.phone||"—"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {mapUrl&&<a href={mapUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-bold" style={{color:B.primary}}><MapPin size={14}/>فتح موقع الانطلاق على الخريطة</a>}
        </div>
        {/* Actions */}
        <div className="flex gap-2 px-6 py-4 flex-shrink-0 flex-wrap" style={{borderTop:`1px solid ${B.border}`}}>
          {!isCancelled&&<button onClick={onToggleStatus} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold cursor-pointer"
            style={{background:isFull?"#E3F3E8":"#FBF3D6",color:isFull?"#1E7A44":"#8A6A08",border:`1px solid ${isFull?"#C4E4CE":"#F0E3AE"}`}}>
            {isFull?"استئناف الحجز":"إيقاف الحجز مؤقتاً"}</button>}
          {!isCancelled&&<button onClick={()=>setConfirmCancel(true)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold cursor-pointer"
            style={{background:"#FBE6E6",color:"#BE2626",border:"1px solid #F3C9C9"}}><X size={13}/>إلغاء الرحلة</button>}
          <button onClick={onClose} className="mr-auto px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer" style={{background:B.bg,color:B.text2,border:"none"}}>إغلاق</button>
        </div>
      </motion.div>
      <AnimatePresence>
        {confirmCancel&&<CancelTripConfirm trip={trip} pkgName={pkgName} onConfirm={()=>{setConfirmCancel(false);onCancel();onClose();}} onCancel={()=>setConfirmCancel(false)}/>}
      </AnimatePresence>
    </motion.div>
  );
}

/* ════════ كرت الرحلة المختصر (قابل للنقر) ════════ */
function TripCard({trip,pkgName,onOpen}:{trip:Trip;pkgName:string;onOpen:()=>void}) {
  const available=Math.max(0,trip.seats-trip.bookedSeats);
  const isFull=trip.status==="full"||available<=0;
  const isCancelled=trip.status==="cancelled";
  const bd=isFull?"#F3C9C9":isCancelled?"#D6CFC6":"#C4E4CE";
  const bg=isFull?"#FBE6E6":isCancelled?"#F4F1EC":"#F0FAF3";
  return (
    <motion.button layout initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={onOpen}
      className="w-full text-right rounded-2xl overflow-hidden cursor-pointer p-4 flex flex-col gap-2"
      style={{border:`1.5px solid ${bd}`,background:bg}}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-extrabold text-sm" style={{color:B.black}}>{tripLabel(trip,pkgName)}</span>
        <span className="font-mono text-xs px-2 py-0.5 rounded-lg" style={{background:"#fff",border:`1px solid ${B.border}`,color:B.muted}}>{trip.id}</span>
        <StatusBadge status={trip.status}/>
        <ArrowRight size={14} style={{color:B.muted,marginRight:"auto",transform:"scaleX(-1)"}}/>
      </div>
      <div className="flex items-center gap-3 text-xs" style={{color:B.text2}}>
        <span className="inline-flex items-center gap-1"><CalendarDays size={12} style={{color:B.gold}}/><b style={{color:B.black}}>{trip.departureDate||"—"}</b></span>
        <span className="inline-flex items-center gap-1"><Clock size={12} style={{color:B.gold}}/>{trip.departureTime||"—"}</span>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="font-bold" style={{color:B.text2}}>تم الحجز: <b style={{color:B.black}}>{trip.bookedSeats}</b> من {trip.seats}</span>
        <span style={{color:B.muted}}>·</span>
        <span className="font-bold" style={{color:isFull?"#BE2626":"#1E7A44"}}>المتبقي: {available}</span>
      </div>
    </motion.button>
  );
}

/* ─── Mini 3-month trip calendar (visualization) ─── */
const AR_MONTHS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const AR_WEEK   = ["س","ح","ن","ث","ر","خ","ج"];
const TRIP_STATUS_AR:Record<TripStatus,string>={open:"مفتوحة",full:"مكتملة",cancelled:"ملغاة",archived:"مؤرشفة"};

function MonthGrid({y,m,depMap,spanSet,onPick}:{y:number;m:number;depMap:Map<string,Trip[]>;spanSet:Set<string>;onPick:(ds:string,deps:Trip[])=>void}) {
  const firstCol=(new Date(y,m,1).getDay()+1)%7;
  const daysInMonth=new Date(y,m+1,0).getDate();
  const cells:(number|null)[]=[];
  for(let i=0;i<firstCol;i++) cells.push(null);
  for(let d=1;d<=daysInMonth;d++) cells.push(d);
  return (
    <div className="rounded-xl p-3" style={{background:"#fff",border:`1px solid ${B.border}`}}>
      <div className="text-xs font-bold text-center mb-2" style={{color:B.black}}>{AR_MONTHS[m]} {y}</div>
      <div className="grid grid-cols-7 gap-1">
        {AR_WEEK.map((w,i)=><div key={"w"+i} className="text-center" style={{fontSize:9,color:B.muted,fontWeight:700}}>{w}</div>)}
        {cells.map((d,i)=>{
          if(d===null) return <div key={"e"+i} style={{height:38}}/>;
          const ds=ymd(y,m,d);
          const deps=depMap.get(ds);
          const inSpan=!deps&&spanSet.has(ds);
          if(deps){
            const col=tripDayColor(deps);
            const isOpen=deps.some(t=>t.status==="open");
            const remaining=deps.reduce((a,t)=>a+(t.status==="open"?Math.max(0,t.seats-t.bookedSeats):0),0);
            const title=deps.map(t=>`رحلة ${t.id} — ${t.departureDate} ${t.departureTime} · ${TRIP_STATUS_AR[t.status]} · ${t.bookedSeats}/${t.seats}`).join("\n");
            return (
              <button key={"d"+i} title={title} onClick={()=>onPick(ds,deps)}
                className="relative flex flex-col items-center justify-center rounded-lg cursor-pointer leading-none gap-0.5"
                style={{height:38,background:col,color:"#fff",border:"none"}}>
                <span style={{fontSize:11,fontWeight:800}}>{d}</span>
                {isOpen
                  ? <span style={{fontSize:7.5,fontWeight:700,opacity:0.95}}>{remaining} مقعد</span>
                  : <span style={{fontSize:7.5,fontWeight:700,opacity:0.9}}>{deps.some(t=>t.status==="full")?"مكتمل":"ملغاة"}</span>}
                {deps.length>1&&<span className="absolute flex items-center justify-center rounded-full"
                  style={{top:-4,left:-4,width:13,height:13,fontSize:8,fontWeight:800,background:B.primary,color:B.gold,border:"1px solid #fff"}}>{deps.length}</span>}
              </button>
            );
          }
          return (
            <div key={"d"+i} className="flex items-center justify-center rounded-lg"
              style={{height:38,fontSize:10,fontWeight:inSpan?700:500,background:inSpan?"rgba(192,134,44,0.12)":"transparent",color:inSpan?"#8a6a08":B.text2}}>{d}</div>
          );
        })}
      </div>
    </div>
  );
}

function TripCalendar({trips,onOpen}:{trips:Trip[];onOpen:(t:Trip)=>void}) {
  const [open,setOpen]=useState(false);
  const [picked,setPicked]=useState<{ds:string;deps:Trip[]}|null>(null);
  const deps=trips.map(t=>parseYMD(t.departureDate)).filter(Boolean) as {y:number;m:number;d:number}[];
  let anchorY:number,anchorM:number;
  if(deps.length){ const min=deps.reduce((a,b)=>(a.y*12+a.m)<=(b.y*12+b.m)?a:b); anchorY=min.y; anchorM=min.m; }
  else { const now=new Date(); anchorY=now.getFullYear(); anchorM=now.getMonth(); }
  const depMap=new Map<string,Trip[]>();
  const spanSet=new Set<string>();
  trips.forEach(t=>{
    const dp=parseYMD(t.departureDate); if(!dp) return;
    const arr=depMap.get(t.departureDate)||[]; arr.push(t); depMap.set(t.departureDate,arr);
    const rt=parseYMD(t.returnDate);
    const start=new Date(dp.y,dp.m,dp.d);
    const end=rt?new Date(rt.y,rt.m,rt.d):start;
    for(let cur=new Date(start);cur<=end;cur.setDate(cur.getDate()+1))
      spanSet.add(ymd(cur.getFullYear(),cur.getMonth(),cur.getDate()));
  });
  const months=[0,1,2].map(off=>{ let m=anchorM+off,y=anchorY; while(m>11){m-=12;y++;} return {y,m}; });
  return (
    <div className="mt-3 pt-3" style={{borderTop:`1px dashed ${B.border}`}}>
      <button onClick={()=>setOpen(v=>!v)} className="flex items-center gap-2 mb-2 cursor-pointer" style={{background:"none",border:"none",padding:0}}>
        <CalendarDays size={13} style={{color:B.gold}}/>
        <span className="text-xs font-bold" style={{color:B.black}}>التقويم — {months.map(x=>AR_MONTHS[x.m]).join(" · ")}</span>
        {open?<ChevronUp size={13} style={{color:B.muted}}/>:<ChevronDown size={13} style={{color:B.muted}}/>}
      </button>
      <AnimatePresence>{open&&(
        <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} className="overflow-hidden">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {months.map(({y,m})=><MonthGrid key={y*12+m} y={y} m={m} depMap={depMap} spanSet={spanSet} onPick={(ds,d)=>setPicked({ds,deps:d})}/>)}
          </div>
          {picked&&(
            <div className="mt-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold flex items-center gap-1.5" style={{color:B.black}}><CalendarDays size={13} style={{color:B.gold}}/>رحلات يوم {picked.ds}</span>
                <button onClick={()=>setPicked(null)} className="w-6 h-6 rounded-lg flex items-center justify-center cursor-pointer" style={{background:B.bg,border:`1px solid ${B.border}`,color:B.muted}}><X size={11}/></button>
              </div>
              {picked.deps.map(t=>{
                const avail=Math.max(0,t.seats-t.bookedSeats);
                return (
                  <button key={t.id} onClick={()=>onOpen(t)} className="w-full text-right rounded-xl p-3 flex items-center justify-between gap-2 cursor-pointer" style={{background:"#fff",border:`1px solid ${B.border}`}}>
                    <div className="flex items-center gap-2"><span className="font-mono px-2 py-0.5 rounded-lg text-xs" style={{background:B.bg,border:`1px solid ${B.border}`,color:B.muted}}>{t.id}</span><StatusBadge status={t.status}/></div>
                    <span className="text-xs font-bold" style={{color:B.text2}}>{t.bookedSeats}/{t.seats} · متبقٍّ {avail}</span>
                  </button>
                );
              })}
            </div>
          )}
        </motion.div>
      )}</AnimatePresence>
    </div>
  );
}

/* ─── Trips Page ─── */
export function TripsPage({packages,transports,hotels,onMenuOpen}:{packages:Pkg[];transports:Transport[];hotels:Hotel[];onMenuOpen?:()=>void}) {
  const trips=useStore(s=>s.trips); const setTrips=useStore(s=>s.setTrips);
  const branches=useStore(s=>s.branches);
  const [search,setSearch]=useState("");
  const [statusFilter,setStatusFilter]=useState<"all"|TripStatus>("all");
  const [pkgFilter,setPkgFilter]=useState<string>("all");
  const [showLaunch,setShowLaunch]=useState(false);
  const [launchPkgId,setLaunchPkgId]=useState<string|undefined>(undefined);
  const [detailId,setDetailId]=useState<string|null>(null);

  const pkgName=(id:string)=>packages.find(p=>p.id===id)?.name??"—";
  const hotelName=(id:string)=>hotels.find(h=>h.id===id)?.name??"";
  const branchOf=(id:string)=>branches.find(b=>b.id===id);

  function toggleStatus(id:string){ setTrips(p=>p.map(t=>t.id===id?{...t,status:t.status==="full"?"open":"full"}:t)); }
  function cancelTrip(id:string){ setTrips(p=>p.map(t=>t.id===id?{...t,status:"cancelled"}:t)); }
  function handleSaveNew(t:Trip){ setTrips(p=>[t,...p]); setShowLaunch(false); }

  const filtered=trips.filter(t=>
    (statusFilter==="all"||t.status===statusFilter)&&
    (pkgFilter==="all"||t.packageId===pkgFilter)&&
    (!search||t.id.toLowerCase().includes(search.toLowerCase())||packages.find(p=>p.id===t.packageId)?.name.includes(search)||t.departurePoint.includes(search))
  );

  const grouped = packages.map(pkg=>{
    const pkgTrips=filtered.filter(t=>t.packageId===pkg.id);
    if(pkgTrips.length===0&&pkgFilter!=="all")return null;
    const totalSeats=pkgTrips.reduce((a,t)=>a+t.seats,0);
    const totalBooked=pkgTrips.reduce((a,t)=>a+t.bookedSeats,0);
    const totalWaiting=pkgTrips.reduce((a,t)=>a+t.waitingSeats,0);
    const totalAvail=totalSeats-totalBooked;
    return {pkg,trips:pkgTrips,totalSeats,totalBooked,totalWaiting,totalAvail};
  }).filter(Boolean) as {pkg:Pkg;trips:Trip[];totalSeats:number;totalBooked:number;totalWaiting:number;totalAvail:number}[];

  const ungrouped=filtered.filter(t=>!packages.find(p=>p.id===t.packageId));

  const stats={
    total:trips.length,open:trips.filter(t=>t.status==="open").length,
    full:trips.filter(t=>t.status==="full").length,
    totalSeats:trips.reduce((a,t)=>a+t.seats,0),
    totalBooked:trips.reduce((a,t)=>a+t.bookedSeats,0),
  };
  const fb=(on:boolean)=>({padding:"6px 14px",borderRadius:999,fontSize:13,fontWeight:700,cursor:"pointer" as const,border:`1px solid ${on?B.gold:B.border}`,background:on?B.primary:"#fff",color:on?B.gold:B.text2,transition:"all 0.15s"});
  const detailTrip = detailId ? trips.find(t=>t.id===detailId) : undefined;

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{background:B.bg}}>
      <PageHeader title="الرحلات" crumb="إدارة الرحلات" search={search} onSearch={setSearch} onMenuOpen={onMenuOpen}/>
      <div className="px-4 md:px-8 pt-4 md:pt-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard label="إجمالي الرحلات" value={stats.total} sub="في النظام" accent/>
          <StatCard label="رحلات مفتوحة" value={stats.open} sub="تقبل حجوزات"/>
          <StatCard label="رحلات مكتملة" value={stats.full} sub="مغلقة الحجز"/>
          <StatCard label="إجمالي المقاعد" value={stats.totalSeats} sub="طاقة استيعابية"/>
          <StatCard label="محجوزة" value={stats.totalBooked} sub={`${stats.totalSeats-stats.totalBooked} متاح`}/>
        </div>
        <div className="flex items-center justify-between gap-3 mt-5 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 p-1 rounded-xl" style={{background:"#fff",border:`1px solid ${B.border}`}}>
              <button style={fb(statusFilter==="all")} onClick={()=>setStatusFilter("all")}>الكل</button>
              <button style={fb(statusFilter==="open")} onClick={()=>setStatusFilter("open")}>مفتوحة</button>
              <button style={fb(statusFilter==="full")} onClick={()=>setStatusFilter("full")}>مكتملة</button>
              <button style={fb(statusFilter==="cancelled")} onClick={()=>setStatusFilter("cancelled")}>ملغاة</button>
            </div>
            <div className="flex items-center gap-1 p-1 rounded-xl" style={{background:"#fff",border:`1px solid ${B.border}`}}>
              <button style={fb(pkgFilter==="all")} onClick={()=>setPkgFilter("all")}>كل الباقات</button>
              {packages.map(p=><button key={p.id} style={fb(pkgFilter===p.id)} onClick={()=>setPkgFilter(p.id)}>{p.name.slice(0,14)}…</button>)}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm" style={{color:B.muted}}><b style={{color:B.black}}>{filtered.length}</b> / {trips.length}</span>
            <button onClick={()=>{setLaunchPkgId(undefined);setShowLaunch(true);}} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer"
              style={{background:B.gold,color:B.black,border:"none",boxShadow:"0 4px 12px rgba(192,134,44,0.35)"}}>
              <Plus size={15}/>إطلاق رحلة
            </button>
          </div>
        </div>
        <div className="mt-5" style={{height:1,background:B.border}}/>
      </div>
      <main className="flex-1 px-4 md:px-8 pb-12 pt-6 flex flex-col gap-5">
        {grouped.map(({pkg,trips:pkgTrips,totalSeats,totalBooked,totalWaiting,totalAvail})=>(
          <div key={pkg.id} className="rounded-2xl overflow-hidden" style={{background:"#fff",border:`1px solid ${B.border}`}}>
            <div className="px-5 py-4" style={{background:B.bg,borderBottom:`1px solid ${B.border}`}}>
              <div className="flex items-center gap-4 flex-wrap mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0" style={{background:B.primary,border:"1px solid rgba(192,134,44,0.25)"}}>📦</div>
                <div className="flex-1">
                  <div className="font-extrabold" style={{color:B.black,fontSize:15,fontFamily:"var(--font-app)"}}>{pkg.name}</div>
                  <div className="text-xs mt-0.5" style={{color:B.text2}}>{pkgTrips.length} رحلة مُطلقة · {pkg.days} أيام · {destBadge(pkg.destination)}</div>
                </div>
                <button onClick={()=>{setLaunchPkgId(pkg.id);setShowLaunch(true);}} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer" style={{background:B.gold,color:B.black,border:"none"}}><Plus size={11}/>إطلاق رحلة</button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  {l:"سعة المقاعد",v:totalSeats,bg:"#fff",fg:B.black,border:B.border},
                  {l:"محجوزة",v:totalBooked,bg:"#E3F3E8",fg:"#1E7A44",border:"#C4E4CE"},
                  {l:"قائمة الانتظار",v:totalWaiting,bg:"#FBF3D6",fg:"#8A6A08",border:"#F0E3AE"},
                  {l:"متاحة",v:totalAvail,bg:"#EAF1FE",fg:"#1E52C7",border:"#CBDBFB"},
                ].map(x=>(
                  <div key={x.l} className="rounded-xl p-3 text-center" style={{background:x.bg,border:`1px solid ${x.border}`}}>
                    <div className="text-xs font-semibold" style={{color:x.fg,opacity:0.8}}>{x.l}</div>
                    <div className="text-xl font-extrabold" style={{color:x.fg}}>{x.v}</div>
                  </div>
                ))}
              </div>
              <TripCalendar trips={pkgTrips} onOpen={t=>setDetailId(t.id)}/>
            </div>
            {/* Compact trip cards */}
            {pkgTrips.length>0&&(
              <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
                <AnimatePresence>
                  {pkgTrips.map(t=><TripCard key={t.id} trip={t} pkgName={pkg.name} onOpen={()=>setDetailId(t.id)}/>)}
                </AnimatePresence>
              </div>
            )}
          </div>
        ))}
        {ungrouped.length>0&&(
          <div className="flex flex-col gap-3">
            <div className="text-xs font-bold" style={{color:B.muted}}>رحلات أخرى</div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <AnimatePresence>
                {ungrouped.map(t=><TripCard key={t.id} trip={t} pkgName={pkgName(t.packageId)} onOpen={()=>setDetailId(t.id)}/>)}
              </AnimatePresence>
            </div>
          </div>
        )}
        {filtered.length===0&&(
          <motion.div initial={{opacity:0}} animate={{opacity:1}} className="flex flex-col items-center justify-center py-24 rounded-2xl" style={{background:"#fff",border:`1px solid ${B.border}`}}>
            <Plane size={44} style={{opacity:0.2,color:B.gold,marginBottom:12}}/>
            <p className="font-bold" style={{color:B.black}}>لا توجد رحلات مطابقة</p>
          </motion.div>
        )}
      </main>
      <AnimatePresence>
        {detailTrip&&(
          <TripDetailsModal trip={detailTrip} pkgName={pkgName(detailTrip.packageId)} hotelName={hotelName(detailTrip.hotelId)} branch={branchOf(detailTrip.branchId)}
            onToggleStatus={()=>toggleStatus(detailTrip.id)} onCancel={()=>cancelTrip(detailTrip.id)} onClose={()=>setDetailId(null)}/>
        )}
        {showLaunch&&(
          <LaunchTripModal packages={packages} transports={transports} branches={branches}
            prefillPkgId={launchPkgId} onSave={handleSaveNew} onClose={()=>setShowLaunch(false)}/>
        )}
      </AnimatePresence>
    </div>
  );
}
