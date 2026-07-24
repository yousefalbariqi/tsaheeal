import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Building2, Plus, Trash2, X, Package, Plane, Bus, Settings, ChevronUp, ChevronDown, ArrowRight, CalendarDays } from "lucide-react";
import { B } from "@/lib/theme";
import type { Hotel, Transport, Pkg, TripStatus, TripSettings, Trip } from "@/types";
import { uid, parseYMD, ymd, tripDayColor } from "@/lib/utils";
import { DEFAULT_TRIP_SETTINGS } from "@/data/trips";
import { StatusBadge } from "@/components/StatusBadge";
import { StatCard } from "@/components/StatCard";
import { PageHeader } from "@/components/PageHeader";
import { DeleteDialog } from "@/components/DeleteDialog";
import { useStore } from "@/store/useStore";
import { destBadge } from "@/features/packages";

/* ─── Launch Trip Modal ─── */
function LaunchTripModal({
  packages,transports,hotels,prefillPkgId,onSave,onClose
}:{
  packages:Pkg[];transports:Transport[];hotels:Hotel[];
  prefillPkgId?:string;onSave:(t:Trip)=>void;onClose:()=>void;
}) {
  const [form,setForm]=useState<Omit<Trip,"id"|"bookedSeats"|"waitingSeats">>({
    packageId:prefillPkgId??"",transportId:"",hotelId:"",
    departureDate:"",returnDate:"",departureTime:"22:00",
    departurePoint:"",departureMapUrl:"",
    seats:0,status:"open",price:0,
    drivers:[{id:uid(),name:"",phone:""}],
    settings:{...DEFAULT_TRIP_SETTINGS},
  });
  const set=<K extends keyof typeof form>(k:K,v:(typeof form)[K])=>setForm(f=>({...f,[k]:v}));
  const selTransport=transports.find(t=>t.id===form.transportId);
  const addDriver=()=>form.drivers.length<2&&set("drivers",[...form.drivers,{id:uid(),name:"",phone:""}]);
  const delDriver=(id:string)=>set("drivers",form.drivers.filter(d=>d.id!==id));
  const updDriver=(id:string,field:"name"|"phone",val:string)=>set("drivers",form.drivers.map(d=>d.id===id?{...d,[field]:val}:d));
  const inp="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none";
  const ist={borderColor:B.border,background:"#fff",color:B.black,fontFamily:"inherit"};
  const canSave=!!form.packageId&&!!form.transportId&&!!form.departureDate;
  function handleSave(){
    const seats=selTransport?.seats??form.seats;
    onSave({...form,id:`TRP-${String(Date.now()).slice(-4)}`,seats,bookedSeats:0,waitingSeats:0});
  }
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-50 flex items-start justify-center p-6 overflow-auto"
      style={{background:"rgba(14,12,11,0.78)",backdropFilter:"blur(4px)"}} onClick={onClose}>
      <motion.div initial={{opacity:0,y:30}} animate={{opacity:1,y:0}} exit={{opacity:0,y:30}}
        transition={{type:"spring",damping:30,stiffness:400}}
        className="w-full rounded-2xl overflow-hidden flex flex-col my-4"
        style={{maxWidth:540,background:"#fff"}} onClick={e=>e.stopPropagation()}>
        <div className="relative px-6 pt-5 pb-4 flex-shrink-0" style={{background:B.primary}}>
          <div className="absolute top-0 inset-x-0 h-1" style={{background:`linear-gradient(90deg,${B.gold},${B.gold2},${B.gold})`}}/>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{background:"rgba(192,134,44,0.15)",border:"1px solid rgba(192,134,44,0.3)"}}>🚌</div>
              <h2 className="font-extrabold text-white" style={{fontSize:16,fontFamily:"'Noto Kufi Arabic',serif"}}>إطلاق رحلة جديدة</h2>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer"
              style={{background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.1)",color:"#7a7068"}}><X size={14}/></button>
          </div>
        </div>
        <div className="flex flex-col gap-4 p-6 overflow-y-auto" style={{scrollbarWidth:"none"}}>
          <div><label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>الباقة <span style={{color:B.gold}}>*</span></label>
            <select className={inp} style={ist} value={form.packageId} onChange={e=>{const p=packages.find(x=>x.id===e.target.value);set("packageId",e.target.value);if(p?.settings)set("settings",{...p.settings});}}>
              <option value="">— اختر الباقة —</option>
              {packages.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
            </select></div>
          <div><label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>المواصلة <span style={{color:B.gold}}>*</span></label>
            <select className={inp} style={ist} value={form.transportId} onChange={e=>{const t=transports.find(x=>x.id===e.target.value);set("transportId",e.target.value);if(t)set("price",t.seatCost);}}>
              <option value="">— اختر المواصلة —</option>
              {transports.map(t=><option key={t.id} value={t.id}>{t.name} · {t.vehicleType} · {t.seats} مقعد</option>)}
            </select></div>
          {selTransport&&(
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{background:`linear-gradient(135deg,${B.primary},${B.primaryDeep})`,border:"1px solid rgba(192,134,44,0.2)"}}>
              <span className="text-xl">{selTransport.mode==="bus"?"🚌":"✈️"}</span>
              <div className="flex-1">
                <div className="text-sm font-bold" style={{color:"#fff"}}>{selTransport.name}</div>
                <div className="text-xs" style={{color:B.muted}}>{selTransport.model} · {selTransport.seats} مقعد</div>
              </div>
              <div className="text-right">
                <div className="text-xs" style={{color:B.muted}}>تكلفة المقعد</div>
                <div className="text-base font-bold" style={{color:B.gold}}>{selTransport.seatCost} ر.س</div>
              </div>
            </div>
          )}
          <div><label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>الفندق</label>
            <select className={inp} style={ist} value={form.hotelId} onChange={e=>set("hotelId",e.target.value)}>
              <option value="">— اختر الفندق —</option>
              {hotels.map(h=><option key={h.id} value={h.id}>{h.name} · {h.city}</option>)}
            </select></div>
          {/* Drivers */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold" style={{color:B.text3}}>السائقون (حتى سائقين)</label>
              {form.drivers.length<2&&<button onClick={addDriver} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
                style={{background:B.bg,border:`1px solid ${B.border}`,color:"#8a6a08"}}><Plus size={10}/>سائق آخر</button>}
            </div>
            <div className="flex flex-col gap-2">
              {form.drivers.map((d,i)=>(
                <div key={d.id} className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0" style={{background:B.primary,color:B.gold}}>{i+1}</div>
                  <input className="flex-1 border rounded-xl px-3 py-2 text-sm focus:outline-none" style={ist} value={d.name} placeholder="اسم السائق" onChange={e=>updDriver(d.id,"name",e.target.value)}/>
                  <input className="border rounded-xl px-3 py-2 text-sm focus:outline-none" style={{...ist,direction:"ltr",width:140}} value={d.phone} placeholder="+966 5x xxx xxxx" onChange={e=>updDriver(d.id,"phone",e.target.value)}/>
                  {form.drivers.length>1&&<button onClick={()=>delDriver(d.id)} className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer flex-shrink-0"
                    style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}><X size={12}/></button>}
                </div>
              ))}
            </div>
          </div>
          <div><label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>نقطة الانطلاق</label>
            <input className={inp} style={ist} value={form.departurePoint} placeholder="أمام مكتب تساهيل — حي العزيزية" onChange={e=>set("departurePoint",e.target.value)}/></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>تاريخ الذهاب <span style={{color:B.gold}}>*</span></label>
              <input type="date" className={inp} style={{...ist,direction:"ltr"}} value={form.departureDate} onChange={e=>set("departureDate",e.target.value)}/></div>
            <div><label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>تاريخ العودة</label>
              <input type="date" className={inp} style={{...ist,direction:"ltr"}} value={form.returnDate} onChange={e=>set("returnDate",e.target.value)}/></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>وقت الانطلاق</label>
              <input type="time" className={inp} style={{...ist,direction:"ltr"}} value={form.departureTime} onChange={e=>set("departureTime",e.target.value)}/></div>
            <div><label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>سعر المقعد (ر.س)</label>
              <input type="number" min={0} className={inp} style={{...ist,color:B.gold,fontWeight:800}} value={form.price} onChange={e=>set("price",Number(e.target.value))}/></div>
          </div>
          {!canSave&&<div className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-bold" style={{background:"#FBF3D6",border:"1px solid #F0E3AE",color:"#8A6A08"}}>
            ⚠ أكمل: الباقة والمواصلة وتاريخ الذهاب مطلوبة
          </div>}
        </div>
        <div className="flex gap-3 px-6 py-4 flex-shrink-0" style={{borderTop:`1px solid ${B.border}`}}>
          <button onClick={handleSave} disabled={!canSave} className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold cursor-pointer"
            style={{background:canSave?B.gold:"#d6cfc6",color:canSave?B.black:"#a09688",border:"none",cursor:canSave?"pointer":"not-allowed"}}>
            <Plane size={14}/>إطلاق الرحلة
          </button>
          <button onClick={onClose} className="px-5 py-3 rounded-xl text-sm font-bold cursor-pointer"
            style={{background:B.bg,color:B.text2,border:"none"}}>إلغاء</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─── Trip Row Card ─── */
function TripCard({trip,pkgName,transport,hotel,onToggleStatus,onDelete,onCancel}:{
  trip:Trip;pkgName:string;transport:Transport|undefined;hotel:Hotel|undefined;
  onToggleStatus:()=>void;onDelete:()=>void;onCancel:()=>void;
}) {
  const [expanded,setExpanded]=useState(false);
  const available=trip.seats-trip.bookedSeats;
  const pct=Math.round((trip.bookedSeats/trip.seats)*100);
  const isFull=trip.status==="full"||available<=0;
  const isCancelled=trip.status==="cancelled";

  const capBg=isFull?"#FBE6E6":isCancelled?"#EEECEA":"#E3F3E8";
  const capBorder=isFull?"#F3C9C9":isCancelled?"#D6CFC6":"#C4E4CE";
  const capFg=isFull?"#BE2626":isCancelled?"#5C554E":"#1E7A44";
  const capLabel=isFull?`مكتملة · ${trip.bookedSeats}/${trip.seats}`:isCancelled?"ملغاة":`${available} متاح · ${pct}%`;

  return (
    <motion.div layout initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0,height:0}}
      className="rounded-2xl overflow-hidden" style={{border:`1.5px solid ${capBorder}`,background:capBg}}>
      {/* Main row */}
      <div className="flex items-center gap-4 p-4 flex-wrap">
        {/* Mode icon */}
        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
          style={{background:B.primary,border:"1px solid rgba(192,134,44,0.25)"}}>
          {transport?.mode==="flight"?"✈️":"🚌"}
        </div>
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-extrabold text-sm" style={{color:B.black}}>{transport?.name??"—"}</span>
            <span className="font-mono text-xs px-2 py-0.5 rounded-lg" style={{background:"#fff",border:`1px solid ${B.border}`,color:B.muted}}>{trip.id}</span>
            <StatusBadge status={trip.status}/>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs flex-wrap" style={{color:B.text2}}>
            {transport&&<span>🚐 {transport.plate||transport.id} · {trip.drivers[0]?.name||"—"}</span>}
            {hotel&&<span>🏨 {hotel.name}</span>}
            {trip.departurePoint&&<span>📍 {trip.departurePoint}</span>}
          </div>
        </div>
        {/* Dates */}
        <div className="flex flex-col gap-1 text-xs min-w-0" style={{minWidth:140}}>
          <span style={{color:B.text2}}>🛫 <b style={{color:B.black}}>{trip.departureDate}</b> · {trip.departureTime}</span>
          {trip.returnDate&&<span style={{color:B.text2}}>🛬 <b style={{color:B.black}}>{trip.returnDate}</b></span>}
        </div>
        {/* Seat cap chip */}
        <span className="text-xs font-bold px-3 py-1.5 rounded-full" style={{background:"#fff",color:capFg,border:`1px solid ${capBorder}`}}>{capLabel}</span>
        {/* Price */}
        <div className="text-right">
          <div className="text-xs" style={{color:B.muted}}>المقعد</div>
          <div className="text-base font-extrabold" style={{color:B.gold,fontFamily:"'IBM Plex Mono',monospace"}}>{trip.price} <span className="text-xs font-bold" style={{color:B.gold2}}>ر.س</span></div>
        </div>
        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          <button onClick={()=>setExpanded(v=>!v)} className="px-3 py-2 rounded-xl text-xs font-bold cursor-pointer"
            style={{background:"#fff",border:`1px solid ${B.border}`,color:B.text2}}>{expanded?"إخفاء":"تفاصيل"}</button>
          {!isCancelled&&<button onClick={onToggleStatus} className="px-3 py-2 rounded-xl text-xs font-bold cursor-pointer"
            style={{background:isFull?"#E3F3E8":"#FBF3D6",color:isFull?"#1E7A44":"#8A6A08",border:`1px solid ${isFull?"#C4E4CE":"#F0E3AE"}`}}>
            {isFull?"إعادة الفتح":"إغلاق الحجز"}</button>}
          {trip.bookedSeats>0&&!isCancelled
            ?<button onClick={onCancel} className="px-3 py-2 rounded-xl text-xs font-bold cursor-pointer"
              style={{background:"#FBE6E6",color:"#BE2626",border:"1px solid #F3C9C9"}}>إلغاء الرحلة</button>
            :<button onClick={onDelete} className="w-9 h-9 flex items-center justify-center rounded-xl cursor-pointer"
              style={{background:"#FBE6E6",color:"#BE2626",border:"1px solid #F3C9C9"}}><Trash2 size={13}/></button>
          }
        </div>
      </div>

      {/* Seat progress bar */}
      <div className="px-4 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-full overflow-hidden" style={{height:6,background:"rgba(255,255,255,0.6)"}}>
            <div className="h-full rounded-full transition-all duration-500"
              style={{width:`${pct}%`,background:isFull?"#BE2626":isCancelled?"#9a9186":B.gold}}/>
          </div>
          <span className="text-xs font-bold" style={{color:capFg}}>{trip.bookedSeats}/{trip.seats}</span>
          {trip.waitingSeats>0&&<span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{background:"#FBF3D6",color:"#8A6A08"}}>+{trip.waitingSeats} انتظار</span>}
        </div>
      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {expanded&&<motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}}
          className="overflow-hidden" style={{borderTop:`1px solid ${capBorder}`}}>
          <div className="p-4 grid gap-3" style={{background:"rgba(255,255,255,0.55)"}}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                {label:"إجمالي المقاعد",val:trip.seats,fg:B.black,bg:"#fff"},
                {label:"محجوزة",val:trip.bookedSeats,fg:"#1E7A44",bg:"#E3F3E8"},
                {label:"قائمة انتظار",val:trip.waitingSeats,fg:"#8A6A08",bg:"#FBF3D6"},
                {label:"متاحة",val:available,fg:"#1E52C7",bg:"#EAF1FE"},
              ].map(x=>(
                <div key={x.label} className="rounded-xl p-3 text-center" style={{background:x.bg,border:`1px solid ${capBorder}`}}>
                  <div className="text-xs font-semibold mb-1" style={{color:x.fg,opacity:.8}}>{x.label}</div>
                  <div className="text-2xl font-extrabold" style={{color:x.fg}}>{x.val}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-xl" style={{background:"#fff",border:`1px solid ${B.border}`}}>
                <div className="font-semibold mb-1" style={{color:B.muted}}>نقطة الانطلاق</div>
                <div className="font-bold" style={{color:B.black}}>{trip.departurePoint||"—"}</div>
              </div>
              <div className="p-3 rounded-xl" style={{background:"#fff",border:`1px solid ${B.border}`}}>
                <div className="font-semibold mb-1" style={{color:B.muted}}>وقت الانطلاق</div>
                <div className="font-bold" style={{color:B.black}}>{trip.departureTime}</div>
              </div>
              <div className="p-3 rounded-xl" style={{background:"#fff",border:`1px solid ${B.border}`}}>
                <div className="font-semibold mb-1" style={{color:B.muted}}>سعر المقعد</div>
                <div className="font-bold" style={{color:B.gold}}>{trip.price} ر.س</div>
              </div>
            </div>
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
            {/* Settings */}
            <div>
              <div className="text-xs font-bold mb-3" style={{color:B.muted}}>إعدادات الرحلة</div>
              <div className="rounded-2xl p-4 flex flex-col gap-3" style={{background:"#fff",border:`1px solid ${B.border}`}}>
                {([
                  {key:"allowOnlineBooking",label:"إتاحة الحجز الإلكتروني"},
                  {key:"manualConfirm",label:"تأكيد يدوي للطلبات"},
                  {key:"waitlistEnabled",label:"تفعيل قائمة الانتظار"},
                  {key:"requirePaymentFirst",label:"يتطلب الدفع قبل التأكيد"},
                  {key:"showTicketAfterConfirm",label:"إظهار التذكرة بعد التأكيد فقط"},
                ] as {key:keyof TripSettings;label:string}[]).map(s=>(
                  <div key={s.key} className="flex items-center justify-between">
                    <span className="text-sm font-semibold" style={{color:B.black}}>{s.label}</span>
                    <div className="relative w-11 h-6 rounded-full cursor-not-allowed transition-colors flex-shrink-0"
                      style={{background:(trip.settings[s.key] as boolean)?"#1E7A44":"#C9C2BA"}}>
                      <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
                        style={{right:(trip.settings[s.key] as boolean)?"0.25rem":"calc(100% - 1.5rem)"}}/>
                    </div>
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-3 pt-1" style={{borderTop:`1px solid ${B.border}`}}>
                  <div>
                    <div className="text-xs font-semibold mb-1" style={{color:B.muted}}>مهلة الدفع (بالساعات)</div>
                    <div className="font-bold text-sm" style={{color:B.black,fontFamily:"'IBM Plex Mono',monospace"}}>{trip.settings.paymentDeadlineHours}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold mb-1" style={{color:B.muted}}>الحد الأقصى للمعتمرين في الطلب الواحد</div>
                    <div className="font-bold text-sm" style={{color:B.black,fontFamily:"'IBM Plex Mono',monospace"}}>{trip.settings.maxPilgrims}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>}
      </AnimatePresence>
    </motion.div>
  );
}

/* ─── Mini 3-month trip calendar ─── */
const AR_MONTHS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const AR_WEEK   = ["س","ح","ن","ث","ر","خ","ج"]; // السبت → الجمعة
const TRIP_STATUS_AR:Record<TripStatus,string>={open:"مفتوحة",full:"مكتملة",cancelled:"ملغاة",archived:"مؤرشفة"};

function MonthGrid({y,m,depMap,spanSet,onPick}:{y:number;m:number;depMap:Map<string,Trip[]>;spanSet:Set<string>;onPick:(ds:string,deps:Trip[])=>void}) {
  const firstCol=(new Date(y,m,1).getDay()+1)%7; // Saturday = column 0
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

function TripCalendar({trips,transports,hotels,onCancel}:{trips:Trip[];transports:Transport[];hotels:Hotel[];onCancel:(id:string)=>void}) {
  const [open,setOpen]=useState(true);
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
          <div className="flex items-center gap-4 mt-2.5 flex-wrap" style={{fontSize:10,color:B.muted}}>
            <span className="flex items-center gap-1"><span className="rounded-sm" style={{width:10,height:10,background:"#1E7A44"}}/> متاحة (مقاعد متبقية)</span>
            <span className="flex items-center gap-1"><span className="rounded-sm" style={{width:10,height:10,background:"#BE2626"}}/> مكتملة / مغلقة</span>
            <span className="flex items-center gap-1"><span className="rounded-sm" style={{width:10,height:10,background:"#9a9186"}}/> ملغاة</span>
            <span className="flex items-center gap-1"><span className="rounded-sm" style={{width:10,height:10,background:"rgba(192,134,44,0.2)"}}/> ضمن مدة الرحلة</span>
          </div>
          {!picked&&<p className="text-xs mt-2.5" style={{color:B.muted}}>اضغط على أي يوم في التقويم لعرض تفاصيل رحلته وإدارتها.</p>}
          {picked&&(
            <div className="mt-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold flex items-center gap-1.5" style={{color:B.black}}><CalendarDays size={13} style={{color:B.gold}}/>تفاصيل يوم {picked.ds}</span>
                <button onClick={()=>setPicked(null)} className="w-6 h-6 rounded-lg flex items-center justify-center cursor-pointer" style={{background:B.bg,border:`1px solid ${B.border}`,color:B.muted}}><X size={11}/></button>
              </div>
              {picked.deps.map(t=>{
                const tr=transports.find(x=>x.id===t.transportId);
                const ho=hotels.find(x=>x.id===t.hotelId);
                const avail=Math.max(0,t.seats-t.bookedSeats);
                const pct=t.seats?Math.min(100,Math.round(t.bookedSeats/t.seats*100)):0;
                return (
                  <div key={t.id} className="rounded-xl p-3.5 flex flex-col gap-3" style={{background:"#fff",border:`1px solid ${B.border}`}}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="font-mono px-2 py-0.5 rounded-lg text-xs" style={{background:B.bg,border:`1px solid ${B.border}`,color:B.muted}}>{t.id}</span>
                        <StatusBadge status={t.status}/>
                      </div>
                      <div className="flex items-baseline gap-1"><span className="text-lg font-extrabold" style={{color:B.gold,fontFamily:"'IBM Plex Mono',monospace"}}>{t.price}</span><span className="text-xs" style={{color:B.muted}}>ر.س</span></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-1.5" style={{color:B.text2}}>{tr?.mode==="flight"?<Plane size={12} style={{color:B.gold}}/>:<Bus size={12} style={{color:B.gold}}/>}<span className="truncate">{tr?tr.name:"— لا مواصلة"}</span></div>
                      <div className="flex items-center gap-1.5" style={{color:B.text2}}><Building2 size={12} style={{color:B.gold}}/><span className="truncate">{ho?ho.name:"— لا فندق"}</span></div>
                      <div className="flex items-center gap-1.5" style={{color:B.text2}}><CalendarDays size={12} style={{color:B.gold}}/><span>المغادرة {t.departureDate} · {t.departureTime}</span></div>
                      <div className="flex items-center gap-1.5" style={{color:B.text2}}><ArrowRight size={12} style={{color:B.gold}}/><span>العودة {t.returnDate}</span></div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1"><span style={{color:B.muted}}>الإشغال</span>
                        <span className="font-bold" style={{color:B.text2}}>{t.bookedSeats}/{t.seats} · متبقٍّ {avail}</span></div>
                      <div className="rounded-full overflow-hidden" style={{height:7,background:B.bg}}>
                        <div style={{height:"100%",width:`${pct}%`,background:t.status==="full"?"#BE2626":"#1E7A44"}}/>
                      </div>
                    </div>
                    {t.status!=="cancelled"&&(
                      <div className="flex gap-2">
                        <button onClick={()=>onCancel(t.id)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold cursor-pointer"
                          style={{background:"#FBE6E6",color:"#BE2626",border:"1px solid #F3C9C9"}}><X size={12}/>إلغاء الرحلة</button>
                      </div>
                    )}
                  </div>
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
  const [search,setSearch]=useState("");
  const [statusFilter,setStatusFilter]=useState<"all"|TripStatus>("all");
  const [pkgFilter,setPkgFilter]=useState<string>("all");
  const [showLaunch,setShowLaunch]=useState(false);
  const [launchPkgId,setLaunchPkgId]=useState<string|undefined>(undefined);
  const [cancelId,setCancelId]=useState<string|null>(null);

  function toggleStatus(id:string){
    setTrips(p=>p.map(t=>t.id===id?{...t,status:t.status==="full"?"open":"full"}:t));
  }
  function deleteTrip(id:string){setTrips(p=>p.filter(t=>t.id!==id));}
  function cancelTrip(id:string){setTrips(p=>p.map(t=>t.id===id?{...t,status:"cancelled"}:t));setCancelId(null);}
  function handleSaveNew(t:Trip){setTrips(p=>[t,...p]);setShowLaunch(false);}

  const filtered=trips.filter(t=>
    (statusFilter==="all"||t.status===statusFilter)&&
    (pkgFilter==="all"||t.packageId===pkgFilter)&&
    (!search||t.id.toLowerCase().includes(search.toLowerCase())||transports.find(tr=>tr.id===t.transportId)?.name.includes(search)||packages.find(p=>p.id===t.packageId)?.name.includes(search))
  );

  // Group by package
  const grouped = packages.map(pkg=>{
    const pkgTrips=filtered.filter(t=>t.packageId===pkg.id);
    if(pkgTrips.length===0&&pkgFilter!=="all")return null;
    const totalSeats=pkgTrips.reduce((a,t)=>a+t.seats,0);
    const totalBooked=pkgTrips.reduce((a,t)=>a+t.bookedSeats,0);
    const totalWaiting=pkgTrips.reduce((a,t)=>a+t.waitingSeats,0);
    const totalAvail=totalSeats-totalBooked;
    return {pkg,trips:pkgTrips,totalSeats,totalBooked,totalWaiting,totalAvail};
  }).filter(Boolean) as {pkg:Pkg;trips:Trip[];totalSeats:number;totalBooked:number;totalWaiting:number;totalAvail:number}[];

  // Also show ungrouped trips whose package isn't in the list
  const ungrouped=filtered.filter(t=>!packages.find(p=>p.id===t.packageId));

  const stats={
    total:trips.length,open:trips.filter(t=>t.status==="open").length,
    full:trips.filter(t=>t.status==="full").length,
    totalSeats:trips.reduce((a,t)=>a+t.seats,0),
    totalBooked:trips.reduce((a,t)=>a+t.bookedSeats,0),
  };
  const fb=(on:boolean)=>({padding:"6px 14px",borderRadius:999,fontSize:13,fontWeight:700,cursor:"pointer" as const,border:`1px solid ${on?B.gold:B.border}`,background:on?B.primary:"#fff",color:on?B.gold:B.text2,transition:"all 0.15s"});

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
            {/* Package group header */}
            <div className="px-5 py-4" style={{background:B.bg,borderBottom:`1px solid ${B.border}`}}>
              <div className="flex items-center gap-4 flex-wrap mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
                  style={{background:B.primary,border:"1px solid rgba(192,134,44,0.25)"}}>📦</div>
                <div className="flex-1">
                  <div className="font-extrabold" style={{color:B.black,fontSize:15,fontFamily:"'Noto Kufi Arabic',serif"}}>{pkg.name}</div>
                  <div className="text-xs mt-0.5" style={{color:B.text2}}>
                    {pkgTrips.length} رحلة مُطلقة · {pkg.days} أيام · {destBadge(pkg.destination)}
                  </div>
                </div>
                <button onClick={()=>{setLaunchPkgId(pkg.id);setShowLaunch(true);}} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
                  style={{background:B.gold,color:B.black,border:"none"}}><Plus size={11}/>إطلاق رحلة</button>
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
              {/* 3-month calendar — لوحة القرار الأساسية */}
              <TripCalendar trips={pkgTrips} transports={transports} hotels={hotels} onCancel={setCancelId}/>
            </div>
          </div>
        ))}
        {ungrouped.length>0&&(
          <div className="flex flex-col gap-3">
            <div className="text-xs font-bold" style={{color:B.muted}}>رحلات أخرى</div>
            <AnimatePresence>
              {ungrouped.map(t=>(
                <TripCard key={t.id} trip={t} pkgName="—"
                  transport={transports.find(tr=>tr.id===t.transportId)}
                  hotel={hotels.find(h=>h.id===t.hotelId)}
                  onToggleStatus={()=>toggleStatus(t.id)}
                  onDelete={()=>deleteTrip(t.id)}
                  onCancel={()=>setCancelId(t.id)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
        {filtered.length===0&&grouped.every(g=>g.trips.length===0)&&(
          <motion.div initial={{opacity:0}} animate={{opacity:1}} className="flex flex-col items-center justify-center py-24 rounded-2xl" style={{background:"#fff",border:`1px solid ${B.border}`}}>
            <Plane size={44} style={{opacity:0.2,color:B.gold,marginBottom:12}}/>
            <p className="font-bold" style={{color:B.black}}>لا توجد رحلات مطابقة</p>
          </motion.div>
        )}
      </main>
      <AnimatePresence>
        {cancelId&&<DeleteDialog onConfirm={()=>cancelTrip(cancelId)} onCancel={()=>setCancelId(null)}/>}
        {showLaunch&&(
          <LaunchTripModal packages={packages} transports={transports} hotels={hotels}
            prefillPkgId={launchPkgId} onSave={handleSaveNew} onClose={()=>setShowLaunch(false)}/>
        )}
      </AnimatePresence>
    </div>
  );
}
