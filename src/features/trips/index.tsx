import { useState } from "react";
import { sar } from "@/lib/money";
import { motion, AnimatePresence } from "motion/react";
import { Plus, X, Plane, MapPin, Link2, Clock, AlertTriangle, CalendarDays, ChevronUp, ChevronDown, ArrowRight, Archive, Pencil, Bus, MessageCircle, Copy, Users, Ticket, Wallet, Check } from "lucide-react";
import { toast } from "sonner";
import { B } from "@/lib/theme";
import { useDebounced } from "@/lib/useDebounced";
import { statusLabel } from "@/lib/status";
import { useRole } from "@/lib/useRole";
import { EntityGate } from "@/components/States";
import type { Hotel, Transport, Pkg, Trip, Branch, Booking, TripDriver } from "@/types";
import { uid, parseYMD, ymd, newId, openWhatsApp, copyText, money } from "@/lib/utils";
import {
  tripState, tripTotals, splitByPhase, nextTrip, calendarAnchor, dayColor,
  seatsOf, shortDate, untilLabel, type TripState,
  defaultReturnDate, returnBeforeDeparture, findVehicleConflict,
  cancelImpact, tripCancelWhatsApp, type CancelImpact,
} from "@/lib/trip";
import { DEFAULT_TRIP_SETTINGS } from "@/data/trips";
import { StatusBadge } from "@/components/StatusBadge";
import { Spinner } from "@/components/Spinner";
import { StatCard } from "@/components/StatCard";
import { PageHeader } from "@/components/PageHeader";
import { AppSelect } from "@/components/AppSelect";
import { SearchSelect, type SearchOption } from "@/components/SearchSelect";
import { ArabicDatePicker } from "@/components/ArabicDatePicker";
import { useStore } from "@/store/useStore";
import { destBadge } from "@/features/packages";
import { Field } from "@/components/Field";
import { isOperational } from "@/features/transport/readiness";

const todayStart = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const tripLabel = (t:Trip, pkgName:string) => pkgName && pkgName!=="—" ? pkgName : (t.departurePoint || t.id);
const parseYMDDate=(s:string):Date|undefined=>{ const p=parseYMD(s); return p?new Date(p.y,p.m,p.d):undefined; };

/* ════════ نموذج الرحلة — إطلاقٌ أو تعديلٌ محدود ════════

   نموذجٌ واحد بوضعَين لا نموذجان: ما يُملأ عند الإطلاق هو ما يُعدَّل بعده،
   والفرق نطاقُ التعديل لا شكلُ الحقول.

   ── ما يُشتقّ ولا يُكتب ──
   السعر والفندق والإعدادات من الباقة؛ واللوحة والرقم التعريفي والسعة من
   المركبة المختارة. كانت اللوحة والرقم يُكتبان يدوياً في كل رحلة، فتُطلق
   رحلةٌ على حافلةٍ «أ ب ج ١٢٣٤» لا وجود لها في سجل النقل، ولا يعرف أحدٌ
   إن كانت في رحلةٍ أخرى ذاك اليوم. الاختيار من السجل يربط الرحلة بمركبةٍ
   حقيقية فيصير التعارض قابلاً للفحص — هنا وفي القاعدة.

   ── وضع التعديل ──
   يُتاح: المركبة (بفحص التعارض)، وقت الانطلاق، تاريخ ووقت العودة، نقطة
   الانطلاق، السائقون. ولا تُتاح: الباقة والسعر والسعة وتاريخ الذهاب
   والمحجوز — هذه وعودٌ بيعت على أساسها مقاعد، وتغييرها إلغاءٌ وإطلاقٌ من
   جديد لا تعديل. */
type TripForm = Pick<Trip,"packageId"|"branchId"|"transportId"|"busPlate"|"busCode"|"departureDate"|"returnDate"|"departureTime"|"departurePoint"|"departureMapUrl"|"drivers">
  & { returnTime:string; departureAddress:string };

const emptyForm = ():TripForm => ({
  packageId:"",branchId:"",transportId:"",busPlate:"",busCode:"",
  departureDate:"",returnDate:"",departureTime:"22:00",returnTime:"",
  departurePoint:"",departureMapUrl:"",departureAddress:"",
  drivers:[{id:uid(),name:"",phone:""}],
});

/** اللوحة والرقم التعريفي من سجل المركبة. الطيران بلا لوحة فرقمُ رحلته،
    وبلا رقمٍ تسلسلي فمعرّف السجل — حقلان إلزاميان لا يُتركان فارغَين. */
const vehicleIds = (v:Transport) => ({
  busPlate: (v.plate||"").trim() || (v.flightNo||"").trim() || "",
  busCode:  (v.serialNo||"").trim() || v.id,
});

const vehicleOption = (v:Transport):SearchOption => ({
  value:v.id, label:v.name||v.id,
  sub:`${v.mode==="flight"?`رحلة ${v.flightNo||"—"}`:`لوحة ${v.plate||"—"}`} · ${v.seats} مقعد${isOperational(v.status)?"":" · غير نشطة"}`,
  keywords:[v.plate,v.serialNo,v.flightNo,v.model].filter(Boolean).join(" "),
});

function TripFormModal({
  mode,initial,packages,branches,prefillPkgId,onSave,onClose
}:{
  mode:"launch"|"edit";initial?:Trip;packages:Pkg[];branches:Branch[];
  prefillPkgId?:string;onSave:(t:Trip)=>void;onClose:()=>void;
}) {
  /* المركبات والرحلات من المخزن مباشرةً: فحص التعارض يقرأ كل الرحلات
     القائمة لا ما مرّرته الصفحة لبطاقةٍ واحدة. */
  const transports=useStore(s=>s.transports);
  const trips=useStore(s=>s.trips);
  const isEdit=mode==="edit"&&!!initial;
  const activeBranches=branches.filter(b=>b.isActive);

  /** المركبات الصالحة لهذه الباقة: نشطةٌ ومن وسيلة مواصلة الباقة نفسها
      (حافلة/طيران). باقةٌ بلا مواصلة تقبل أي مركبةٍ نشطة. */
  function vehiclesFor(pkgId:string):Transport[]{
    const pkg=packages.find(p=>p.id===pkgId);
    const pkgMode=transports.find(t=>t.id===pkg?.transportId)?.mode;
    const list=transports.filter(t=>isOperational(t.status)&&(!pkgMode||t.mode===pkgMode));
    /* عند التعديل تبقى مركبة الرحلة في القائمة ولو أُوقفت بعد الإطلاق:
       حجبُها يُظهر الحقل فارغاً ويُوهم أن الرحلة بلا مركبة. */
    if(initial?.transportId&&!list.some(v=>v.id===initial.transportId)){
      const cur=transports.find(t=>t.id===initial.transportId); if(cur) list.push(cur);
    }
    return list.sort((a,b)=>(a.name||"").localeCompare(b.name||"","ar"));
  }

  const [form,setForm]=useState<TripForm>(()=>{
    if(isEdit&&initial) return {
      packageId:initial.packageId,branchId:initial.branchId,transportId:initial.transportId,
      busPlate:initial.busPlate,busCode:initial.busCode,
      departureDate:initial.departureDate,returnDate:initial.returnDate??"",departureTime:initial.departureTime,
      returnTime:initial.returnTime??"",departurePoint:initial.departurePoint,departureMapUrl:initial.departureMapUrl,
      departureAddress:initial.departureAddress??"",
      drivers:initial.drivers.length?initial.drivers.map(d=>({...d})):[{id:uid(),name:"",phone:""}],
    };
    const f=emptyForm(); f.packageId=prefillPkgId??"";
    /* الباقة المُمرَّرة تجرّ مركبتها إن كانت نشطة: أقلّ ضغطة، وهو ما كان
       يحدث ضمنياً حين كانت السعة تُشتقّ من مواصلة الباقة. */
    const pkg=packages.find(p=>p.id===f.packageId);
    const v=pkg?vehiclesFor(pkg.id).find(x=>x.id===pkg.transportId):undefined;
    if(v) Object.assign(f,{transportId:v.id,...vehicleIds(v)});
    return f;
  });
  const [depMode,setDepMode]=useState<"branch"|"custom">(()=>
    initial&&!initial.branchId&&(initial.departurePoint||initial.departureMapUrl)?"custom":"branch");
  /* تاريخ العودة يُقترح من أيام الباقة ما لم يمسّه الموظف؛ وما مسّه لا
     يُدهَس بتغيير الباقة أو الذهاب بعده. */
  const [returnTouched,setReturnTouched]=useState(isEdit);
  const [busy,setBusy]=useState(false);
  const set=<K extends keyof TripForm>(k:K,v:TripForm[K])=>setForm(f=>({...f,[k]:v}));
  const inp="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none";
  const ist={borderColor:B.border,background:"#fff",color:B.black,fontFamily:"inherit"} as const;
  const istOff={...ist,background:B.fill,color:B.text2} as const;
  const req=<span style={{color:B.gold}}>*</span>;

  const selPkg=packages.find(p=>p.id===form.packageId);
  const pkgTransport=transports.find(t=>t.id===selPkg?.transportId);
  const vehicles=vehiclesFor(form.packageId);
  /* لا مركبة نشطة مطابقة: إدخالٌ يدوي معلَنٌ لا حجبٌ للإطلاق. الرحلة
     عندئذٍ تُربط بمواصلة الباقة كما كان قبل هذه الموجة. */
  const manual=vehicles.length===0;
  const selVehicle=transports.find(t=>t.id===form.transportId);
  const effectiveTransportId=manual?(isEdit?initial!.transportId:(selPkg?.transportId??"")):form.transportId;
  /* السعة: عند الإطلاق من المركبة المختارة (أو من مواصلة الباقة يدوياً)؛
     وعند التعديل تبقى كما أُطلقت — تغييرها يمسّ مقاعداً بيعت. */
  const seats=isEdit?initial!.seats:(manual?(pkgTransport?.seats??0):(selVehicle?.seats??0));

  const conflict=findVehicleConflict(trips,{transportId:effectiveTransportId,departureDate:form.departureDate,returnDate:form.returnDate},initial?.id);
  const conflictName=conflict?(packages.find(p=>p.id===conflict.packageId)?.name??conflict.id):"";
  const returnInvalid=returnBeforeDeparture(form);
  const tooSmall=isEdit&&!!selVehicle&&selVehicle.seats<(initial!.bookedSeats||0);

  function pickPackage(id:string){
    const pkg=packages.find(p=>p.id===id);
    const list=vehiclesFor(id);
    setForm(f=>{
      const n={...f,packageId:id};
      /* المركبة المختارة قد لا تناسب وسيلة الباقة الجديدة (حافلة ← طيران). */
      if(n.transportId&&!list.some(v=>v.id===n.transportId)){ n.transportId="";n.busPlate="";n.busCode=""; }
      if(!n.transportId&&pkg){ const v=list.find(x=>x.id===pkg.transportId); if(v) Object.assign(n,{transportId:v.id,...vehicleIds(v)}); }
      if(!returnTouched&&pkg&&n.departureDate) n.returnDate=defaultReturnDate(n.departureDate,pkg.days);
      return n;
    });
  }
  function pickVehicle(id:string){ const v=transports.find(t=>t.id===id); if(!v) return; setForm(f=>({...f,transportId:v.id,...vehicleIds(v)})); }
  function setDeparture(v:string){
    setForm(f=>({...f,departureDate:v,returnDate:(!returnTouched&&selPkg&&v)?defaultReturnDate(v,selPkg.days):f.returnDate}));
  }
  function setReturn(v:string){ setReturnTouched(true); set("returnDate",v); }
  /* الفرع يُلتقط لا يُشار إليه: الاسم والخريطة والعنوان تُنسخ إلى الرحلة
     لحظة الاختيار، فتعديل الفرع لاحقاً لا يغيّر ما وُعد به ركّابها. */
  function pickBranch(bid:string){
    const b=activeBranches.find(x=>x.id===bid);
    setForm(f=>({...f,branchId:bid,departurePoint:b?b.name:"",departureMapUrl:b?.gmapUrl??"",departureAddress:b?.address??""}));
  }

  const addDriver=()=>set("drivers",[...form.drivers,{id:uid(),name:"",phone:""}]);
  const delDriver=(id:string)=>set("drivers",form.drivers.filter(d=>d.id!==id));
  const updDriver=(id:string,field:"name"|"phone",val:string)=>set("drivers",form.drivers.map(d=>d.id===id?{...d,[field]:val}:d));

  const depOk = depMode==="branch" ? !!form.branchId : (!!form.departureMapUrl.trim()||!!form.departurePoint.trim());
  /* السائق ليس شرطاً: تشغيل الحافلات بالتعاقد، والسائق يُسمَّى قبل
     الانطلاق لا قبل فتح الحجز. */
  const baseOk = (manual||!!form.transportId) && !!form.busPlate.trim() && !!form.busCode.trim()
    && depOk && !!form.departureDate && !!form.departureTime;
  /* سعة صفر تُطلق رحلة لا تقبل حجزاً — تُمنع عند المصدر لا عند أول معتمر. */
  const canSave = (isEdit ? baseOk : (baseOk && !!form.packageId && seats>0)) && !conflict && !returnInvalid && !tooSmall;

  function handleSave(){
    if(!canSave||busy) return;
    setBusy(true);
    const drivers:TripDriver[]=form.drivers.filter(d=>d.name.trim()||d.phone.trim());
    const common={
      transportId:effectiveTransportId,busPlate:form.busPlate.trim(),busCode:form.busCode.trim(),
      departureTime:form.departureTime,returnDate:form.returnDate,returnTime:form.returnTime||undefined,
      branchId:depMode==="branch"?form.branchId:"",
      departurePoint:form.departurePoint,departureMapUrl:form.departureMapUrl,
      departureAddress:depMode==="branch"?(form.departureAddress||undefined):undefined,
      drivers,
    };
    if(isEdit&&initial){ onSave({...initial,...common}); return; }
    onSave({...common,id:newId("TRP"),packageId:form.packageId,hotelId:selPkg?.hotelId??"",
      departureDate:form.departureDate,seats,price:selPkg?.marketPrice??0,status:"open",
      settings:selPkg?.settings?{...selPkg.settings}:{...DEFAULT_TRIP_SETTINGS},
      bookedSeats:0,waitingSeats:0});
  }

  const title=isEdit?`تعديل الرحلة — ${initial!.id}`:"إطلاق رحلة جديدة";
  const warn={background:"#FBF3D6",border:"1px solid #F0E3AE",color:"#8A6A08"} as const;
  const danger={background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"} as const;

  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-50 flex items-start justify-center p-6 overflow-auto"
      style={{background:"rgba(14,12,11,0.78)",backdropFilter:"blur(4px)"}} onClick={onClose}>
      <motion.div initial={{opacity:0,y:30}} animate={{opacity:1,y:0}} exit={{opacity:0,y:30}}
        transition={{type:"spring",damping:30,stiffness:400}}
        className="w-full rounded-2xl overflow-hidden flex flex-col my-4" style={{maxWidth:540,background:"#fff"}} onClick={e=>e.stopPropagation()}>
        <div className="relative px-6 pt-5 pb-4 flex-shrink-0" style={{background:B.primaryDeep}}>
          <div className="absolute top-0 inset-x-0 h-1" style={{background:`linear-gradient(90deg,${B.gold},${B.gold2},${B.gold})`}}/>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{background:"rgba(192,134,44,0.15)",border:"1px solid rgba(192,134,44,0.3)"}}>{isEdit?<Pencil size={15} style={{color:B.gold}}/>:"🚌"}</div>
              <h2 className="font-extrabold text-white" style={{fontSize:16,fontFamily:"var(--font-app)"}}>{title}</h2>
            </div>
            <button aria-label="إغلاق النافذة" title="إغلاق النافذة" onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer" style={{background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.1)",color:"#CDE7E4"}}><X size={14}/></button>
          </div>
          {isEdit&&<div className="text-xs mt-2" style={{color:"#CDE7E4"}}>يُعدَّل هنا: المركبة، وقت الانطلاق، العودة، نقطة الانطلاق، السائقون. الباقة والسعر والسعة وتاريخ الذهاب ثابتة.</div>}
        </div>
        <div className="flex flex-col gap-4 p-6 overflow-y-auto" style={{scrollbarWidth:"none"}}>
          {/* 1) الباقة */}
          <div>
            <Field label={<>الباقة {req}</>}>
              <AppSelect value={form.packageId} placeholder="اختر الباقة" onChange={pickPackage} disabled={isEdit}
                options={packages.map(p=>({value:p.id,label:p.name}))}/>
            </Field>
            {form.packageId&&!isEdit&&(
              <div className="text-xs mt-1.5" style={{color:B.muted}}>السعر ({sar(selPkg?.marketPrice??0)}) والفندق والإعدادات من الباقة · {selPkg?.days??"—"} أيام.</div>)}
          </div>
          {/* 2) المركبة */}
          <div>
            <Field label={<>المركبة {req}</>}>
              {manual
                ? <div className="rounded-xl px-4 py-3 text-xs font-bold" style={warn}>
                    ⚠ لا مركبات نشطة{pkgTransport?` من نوع «${pkgTransport.mode==="flight"?"طيران":"حافلة"}»`:""} في سجل النقل — إدخالٌ يدوي مؤقّت.
                    <span className="block font-semibold mt-1" style={{color:"#6b5a2a"}}>فعِّل مركبةً من صفحة النقل ليُربط بها ويُفحص تعارضها.</span>
                  </div>
                : <SearchSelect value={form.transportId} onChange={pickVehicle} placeholder="اختر مركبة نشطة"
                    searchPlaceholder="ابحث بالاسم أو اللوحة أو الرقم التسلسلي…" emptyText="لا مركبة مطابقة"
                    options={vehicles.map(vehicleOption)}/>}
            </Field>
            {manual&&(
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div><Field label={<>رقم لوحة الباص {req}</>}>
                       <input className={inp} style={ist} value={form.busPlate} placeholder="أ ب ج 1234" onChange={e=>set("busPlate",e.target.value)}/>
                     </Field></div>
                <div><Field label={<>الرقم التعريفي للباص {req}</>}>
                       <input className={inp} style={{...ist,direction:"ltr",textAlign:"right"}} value={form.busCode} placeholder="1" onChange={e=>set("busCode",e.target.value)}/>
                     </Field></div>
              </div>)}
            {!manual&&selVehicle&&(
              <div className="flex items-center gap-2 text-xs mt-1.5 flex-wrap" style={{color:B.muted}}>
                <Bus size={12} style={{color:B.gold}}/>
                <span>اللوحة <b style={{color:B.black}}>{form.busPlate||"—"}</b></span>·
                <span>الرقم التعريفي <b style={{color:B.black}}>{form.busCode||"—"}</b></span>·
                <span>السعة <b style={{color:B.black}}>{isEdit?initial!.seats:selVehicle.seats}</b> مقعد {isEdit?"(ثابتة)":"— من المركبة"}</span>
              </div>)}
            {isEdit&&selVehicle&&selVehicle.seats!==initial!.seats&&!tooSmall&&(
              <div className="text-xs font-bold mt-1.5 px-3 py-2 rounded-xl" style={warn}>
                سعة المركبة الجديدة {selVehicle.seats} وسعة الرحلة تبقى {initial!.seats} — السعة لا تُعدَّل من هنا.
              </div>)}
            {tooSmall&&(
              <div className="text-xs font-bold mt-1.5 px-3 py-2 rounded-xl" style={danger}>
                ⚠ المركبة أصغر من المحجوز: {selVehicle!.seats} مقعد لـ{initial!.bookedSeats} محجوز. اختر مركبةً تتّسع لهم.
              </div>)}
            {!isEdit&&(manual?!!form.packageId:!!form.transportId)&&seats===0&&(
              <div className="text-xs font-bold mt-1.5 px-3 py-2 rounded-xl" style={danger}>
                ⚠ السعة صفر — {manual?(selPkg?.transportId?"مواصلة الباقة غير موجودة أو سعتها صفر":"الباقة غير مرتبطة بمواصلة"):"هذه المركبة بلا مقاعد مسجَّلة"}. رحلةٌ بلا مقاعد لا تقبل حجزاً.
              </div>)}
            {conflict&&(
              <div className="text-xs font-bold mt-1.5 px-3 py-2 rounded-xl leading-relaxed" style={danger}>
                ⚠ المركبة مرتبطة برحلة <b>{conflictName}</b> <span className="font-mono">({conflict.id})</span> من {shortDate(conflict.departureDate)} إلى {shortDate(conflict.returnDate||conflict.departureDate)} — اختر مركبةً أخرى أو غيّر التاريخ.
              </div>)}
          </div>
          {/* 3) السائقون */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold" style={{color:B.text3}}>السائقون <span style={{color:B.muted,fontWeight:600}}>(اختياري — بالتعاقد)</span></label>
              <button onClick={addDriver} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer" style={{background:B.fill,border:`1px solid ${B.border}`,color:"#8a6a08"}}><Plus size={10}/>سائق آخر</button>
            </div>
            <div className="flex flex-col gap-2">
              {form.drivers.map((d,i)=>(
                <div key={d.id} className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0" style={{background:B.gold,color:B.black}}>{i+1}</div>
                  <input className="flex-1 border rounded-xl px-3 py-2 text-sm focus:outline-none" style={ist} value={d.name} placeholder="اسم السائق" onChange={e=>updDriver(d.id,"name",e.target.value)}/>
                  <input className="border rounded-xl px-3 py-2 text-sm focus:outline-none" style={{...ist,direction:"ltr",width:140}} value={d.phone} placeholder="+966 5x xxx xxxx" onChange={e=>updDriver(d.id,"phone",e.target.value)}/>
                  {form.drivers.length>1&&<button aria-label="حذف السائق" title="حذف السائق" onClick={()=>delDriver(d.id)} className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer flex-shrink-0" style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}><X size={12}/></button>}
                </div>
              ))}
            </div>
          </div>
          {/* 4) نقطة الانطلاق */}
          <div>
            <label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>نقطة الانطلاق {req}</label>
            <div className="flex gap-2 mb-2">
              {([["branch","من الفروع"],["custom","موقع آخر (خريطة)"]] as const).map(([m,lbl])=>(
                <button key={m} type="button" onClick={()=>setDepMode(m)} className="flex-1 py-2 rounded-xl text-xs font-bold cursor-pointer"
                  style={{border:`1px solid ${depMode===m?B.gold:B.border}`,background:depMode===m?B.gold:"#fff",color:depMode===m?B.black:B.text2}}>{lbl}</button>
              ))}
            </div>
            {depMode==="branch"
              ? <>
                  <AppSelect value={form.branchId} placeholder="اختر الفرع" onChange={pickBranch}
                    options={activeBranches.map(b=>({value:b.id,label:`${b.name} — ${b.city}`}))}/>
                  {form.branchId&&form.departureAddress&&<div className="text-xs mt-1.5 flex items-center gap-1.5" style={{color:B.muted}}><MapPin size={11} style={{color:B.gold}}/>{form.departureAddress} <span style={{opacity:.7}}>— يُحفظ مع الرحلة كما هو الآن</span></div>}
                </>
              : <div className="flex flex-col gap-2">
                  <input className={inp} style={ist} value={form.departurePoint} placeholder="اسم نقطة الانطلاق" onChange={e=>setForm(f=>({...f,branchId:"",departureAddress:"",departurePoint:e.target.value}))}/>
                  <div className="flex items-center gap-2">
                    <Link2 size={15} style={{color:B.muted,flexShrink:0}}/>
                    <input className={inp} style={{...ist,direction:"ltr",textAlign:"right"}} value={form.departureMapUrl} placeholder="https://maps.google.com/…" onChange={e=>setForm(f=>({...f,branchId:"",departureAddress:"",departureMapUrl:e.target.value}))}/>
                  </div>
                </div>}
          </div>
          {/* 5) الذهاب */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><Field label={<>تاريخ الذهاب {req}</>} hint={isEdit?"ثابتٌ بعد الإطلاق — بيعت مقاعد على هذا الموعد.":undefined}>
                   <ArabicDatePicker value={form.departureDate} onChange={setDeparture} minDate={todayStart()} disabled={isEdit}/>
                 </Field></div>
            <div><Field label={<>وقت الانطلاق {req}</>}>
                   <input type="time" className={inp} style={{...ist,direction:"ltr",textAlign:"right"}} value={form.departureTime} onChange={e=>set("departureTime",e.target.value)}/>
                 </Field></div>
          </div>
          {/* 6) العودة */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><Field label="تاريخ العودة" hint={!isEdit&&selPkg&&!returnTouched&&form.returnDate?`مقترح من أيام الباقة (${selPkg.days}) — يمكن تغييره`:undefined}>
                   <ArabicDatePicker value={form.returnDate} onChange={setReturn} minDate={form.departureDate?parseYMDDate(form.departureDate):todayStart()} invalid={returnInvalid}/>
                 </Field></div>
            <div><Field label="وقت العودة" hint="متى تُعدّ الرحلة منتهية">
                   <input type="time" className={inp} style={form.returnDate?{...ist,direction:"ltr",textAlign:"right"}:{...istOff,direction:"ltr",textAlign:"right"}} value={form.returnTime} disabled={!form.returnDate} onChange={e=>set("returnTime",e.target.value)}/>
                 </Field></div>
          </div>
          {returnInvalid&&<div className="text-xs font-bold -mt-2" style={{color:"#BE2626"}}>
            {form.returnDate===form.departureDate?"وقت العودة يسبق وقت الانطلاق في اليوم نفسه":"تاريخ العودة لا يسبق الذهاب"}
          </div>}
          {!canSave&&!conflict&&!returnInvalid&&!tooSmall&&<div className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-bold" style={warn}>
            ⚠ أكمل: {isEdit?"":"الباقة، "}المركبة{manual?" (اللوحة ورقمها التعريفي)":" (بسعة أكبر من صفر)"}، نقطة الانطلاق، {isEdit?"وقت الانطلاق":"تاريخ ووقت الذهاب"}.
          </div>}
        </div>
        <div className="flex gap-3 px-6 py-4 flex-shrink-0" style={{borderTop:`1px solid ${B.border}`}}>
          <button onClick={handleSave} disabled={!canSave||busy} className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold"
            style={{background:canSave?B.gold:"#d6cfc6",color:canSave?B.black:"#a09688",border:"none",cursor:canSave&&!busy?"pointer":"not-allowed"}}>
            {busy&&<Spinner size={14} color={B.black}/>}
            {isEdit?<Pencil size={14}/>:<Plane size={14}/>}
            {busy?(isEdit?"جارٍ الحفظ…":"جارٍ الإطلاق…"):(isEdit?"حفظ التعديلات":"إطلاق الرحلة")}
          </button>
          <button onClick={onClose} className="px-5 py-3 rounded-xl text-sm font-bold cursor-pointer" style={{background:B.fill,color:B.text2,border:"none"}}>إلغاء</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ════════ تأكيد إلغاء الرحلة (حماية) ════════

   السبب إلزامي لا تحسيناً: الرحلة الملغاة تُعرض للموظف وللمستفيد بعد
   الإلغاء، و«ملغاة» بلا سببٍ تُنتج سؤالاً لا يجد جواباً في السجل.

   والأثر يُعرض قبل التأكيد بأرقامه: «سيؤثر على الحجوزات المرتبطة» جملةٌ
   لا تُعين على قرار؛ «٧ حجوزات، ٣ منها بتذاكر، و٢١٠٠ ر.س مدفوعة» تُعين.
   ما تفعله القاعدة تلقائياً (trg_cancel_docs_for_trip) يُقال هنا كي لا
   يبحث الموظف عن زرّ «إلغاء التذاكر» بعدها. */
function CancelTripConfirm({trip,pkgName,impact,onConfirm,onCancel}:{trip:Trip;pkgName:string;impact:CancelImpact;onConfirm:(reason:string)=>void;onCancel:()=>void}) {
  const [reason,setReason]=useState("");
  const ready=reason.trim().length>=3;
  const n=impact.bookings.length;
  const cells=[
    {icon:<Users size={13}/>,l:"حجوزات قائمة",v:String(n),sub:`${impact.persons} مقعد يُحرَّر`},
    {icon:<Ticket size={13}/>,l:"بتذاكر صادرة",v:String(impact.withTickets),sub:"تُلغى تلقائياً"},
    {icon:<Wallet size={13}/>,l:"مدفوع فعلاً",v:money(impact.paidTotal),sub:`${impact.paidCount} حجز`},
  ];
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{background:"rgba(14,12,11,0.8)"}} onClick={onCancel}>
      <motion.div initial={{scale:.95,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:.95,opacity:0}}
        className="w-full max-w-md rounded-2xl overflow-hidden" style={{background:"#fff"}} onClick={e=>e.stopPropagation()}>
        <div className="px-6 pt-6 pb-4 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3" style={{background:"#FBE6E6"}}><AlertTriangle size={26} style={{color:"#BE2626"}}/></div>
          <div className="font-extrabold text-lg" style={{color:B.black}}>تأكيد إلغاء الرحلة</div>
          <div className="text-sm mt-2" style={{color:B.text2}}>
            أنت على وشك إلغاء رحلة <b style={{color:B.black}}>{tripLabel(trip,pkgName)}</b> بتاريخ <b style={{color:B.black}}>{trip.departureDate}</b>.
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4 w-full">
            {cells.map(c=>(
              <div key={c.l} className="rounded-xl px-2 py-2.5 text-center" style={{background:"#FBE6E6",border:"1px solid #F3C9C9"}}>
                <div className="flex items-center justify-center gap-1 text-xs font-semibold" style={{color:"#8a2626"}}>{c.icon}{c.l}</div>
                <div className="text-lg font-extrabold mt-0.5" style={{color:"#BE2626"}}>{c.v}</div>
                <div className="text-[10px] font-bold" style={{color:"#8a2626",opacity:.8}}>{c.sub}</div>
              </div>
            ))}
          </div>
          <div className="rounded-xl px-4 py-3 mt-3 text-xs w-full text-right leading-relaxed" style={{background:B.fill,border:`1px solid ${B.border}`,color:B.text2}}>
            {n===0
              ? "لا حجوزات قائمة على هذه الرحلة — لا أحد يتأثّر بإلغائها."
              : <>عند التأكيد تُلغي القاعدة <b style={{color:B.black}}>تذاكر</b> هذه الحجوزات تلقائياً وتُحرَّر <b style={{color:B.black}}>مقاعدها</b>. الفواتير المدفوعة تبقى محفوظة حتى يُقرَّر استرجاعها. لا تُرسَل أي رسالة تلقائياً — بعد التأكيد تظهر قائمة العملاء للتواصل معهم.</>}
          </div>
          <div className="w-full text-right mt-4">
            <label htmlFor="trip-cancel-reason" className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>سبب الإلغاء <span style={{color:"#BE2626"}}>*</span></label>
            <textarea id="trip-cancel-reason" value={reason} onChange={e=>setReason(e.target.value)} rows={2}
              placeholder="مثال: عطل في الحافلة · لم يكتمل العدد الأدنى"
              className="w-full rounded-xl border px-3 py-2 text-sm resize-none focus:outline-none"
              style={{borderColor:B.border,fontFamily:"inherit",color:B.black}}/>
            <div className="text-xs mt-1.5" style={{color:B.muted}}>يُعرض على بطاقة الرحلة مع تاريخ الإلغاء، ويُضمَّن في رسالة العملاء.</div>
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={()=>ready&&onConfirm(reason.trim())} disabled={!ready} className="flex-1 py-2.5 rounded-xl font-extrabold text-sm"
            style={{background:"#BE2626",color:"#fff",border:"none",opacity:ready?1:.45,cursor:ready?"pointer":"not-allowed"}}>تأكيد إلغاء الرحلة</button>
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl font-bold text-sm cursor-pointer" style={{background:B.fill,color:B.text2,border:"none"}}>تراجع</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ════════ بعد الإلغاء: مَن يُبلَّغ ════════

   لا إرسالٌ تلقائي. الاعتذار يقوله موظفٌ لا نظام، ورسالةٌ جماعية تخرج
   بلا يدٍ بشرية تصل لعميلٍ دفع وتصل لآخر لم يدفع بنفس النبرة. الزرّ يفتح
   واتساب بنصٍّ معدّ، والموظف يقرأ ويعدّل ويرسل. */
function CancelFollowUp({trip,pkgName,reason,impact,onClose}:{trip:Trip;pkgName:string;reason:string;impact:CancelImpact;onClose:()=>void}) {
  const [done,setDone]=useState<Set<string>>(new Set());
  const phones=Array.from(new Set(impact.bookings.map(b=>(b.clientPhone||"").trim()).filter(Boolean)));
  const label=tripLabel(trip,pkgName);
  const msgFor=(b:Booking)=>tripCancelWhatsApp({clientName:b.clientName,tripLabel:label,departureDate:trip.departureDate,departureTime:trip.departureTime,reason,paid:b.paymentStatus==="verified"});
  const copyAll=()=>{ copyText(phones.join("\n")); toast.success(`نُسخ ${phones.length} رقم`); };
  const send=(b:Booking)=>{ openWhatsApp(b.clientPhone,msgFor(b)); setDone(s=>new Set(s).add(b.id)); };
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-auto"
      style={{background:"rgba(14,12,11,0.78)",backdropFilter:"blur(4px)"}} onClick={onClose}>
      <motion.div initial={{opacity:0,y:24}} animate={{opacity:1,y:0}} exit={{opacity:0,y:24}}
        className="w-full rounded-2xl overflow-hidden flex flex-col my-4" style={{maxWidth:600,background:"#fff"}} onClick={e=>e.stopPropagation()}>
        <div className="relative px-6 pt-5 pb-4 flex-shrink-0" style={{background:B.primaryDeep}}>
          <div className="absolute top-0 inset-x-0 h-1" style={{background:`linear-gradient(90deg,${B.gold},${B.gold2},${B.gold})`}}/>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-extrabold text-white" style={{fontSize:15,fontFamily:"var(--font-app)"}}>أُلغيت الرحلة — إبلاغ العملاء</h2>
              <div className="text-xs mt-1" style={{color:"#CDE7E4"}}>{label} · {shortDate(trip.departureDate)} · السبب: {reason}</div>
            </div>
            <button aria-label="إغلاق النافذة" title="إغلاق النافذة" onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer flex-shrink-0" style={{background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.1)",color:"#CDE7E4"}}><X size={14}/></button>
          </div>
        </div>
        <div className="p-6 flex flex-col gap-4 overflow-y-auto" style={{scrollbarWidth:"none"}}>
          <div className="rounded-xl px-4 py-3 text-xs leading-relaxed" style={{background:"#E3F3E8",border:"1px solid #C4E4CE",color:"#1E7A44"}}>
            <Check size={12} className="inline ml-1"/>أُلغيت تذاكر الرحلة وحُرِّرت مقاعدها في القاعدة. بقي التواصل: كل زرٍّ يفتح واتساب برسالةٍ معدّة تُراجعها قبل الإرسال — لا يُرسَل شيء تلقائياً.
          </div>
          {impact.bookings.length===0
            ? <div className="text-sm text-center py-8" style={{color:B.muted}}>لا حجوزات قائمة على هذه الرحلة — لا أحد يُبلَّغ.</div>
            : <>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-bold" style={{color:B.text2}}>
                    <b style={{color:B.black}}>{impact.bookings.length}</b> حجز · تمّ التواصل مع <b style={{color:"#1E7A44"}}>{done.size}</b>
                  </span>
                  <button onClick={copyAll} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold cursor-pointer" style={{background:"#fff",border:`1px solid ${B.border}`,color:B.text3}}>
                    <Copy size={12}/>نسخ كل الأرقام ({phones.length})
                  </button>
                </div>
                <div className="rounded-2xl overflow-hidden" style={{border:`1px solid ${B.border}`}}>
                  {impact.bookings.map((b,i)=>{
                    const sent=done.has(b.id);
                    return (
                      <div key={b.id} className="flex items-center gap-3 px-4 py-3 flex-wrap" style={{background:i%2?"#FDFCFA":"#fff",borderTop:i?`1px solid ${B.border}`:"none"}}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm truncate" style={{color:B.black}}>{b.clientName||"—"}</span>
                            <span className="font-mono text-xs px-1.5 py-0.5 rounded-md" style={{background:B.fill,color:B.muted}}>{b.id}</span>
                            {b.paymentStatus==="verified"&&<span className="text-[10px] font-bold px-2 py-0.5 rounded-md" style={{background:"#E3F3E8",color:"#1E7A44"}}>مدفوع {money(b.total)}</span>}
                          </div>
                          <div className="text-xs mt-0.5 flex items-center gap-2" style={{color:B.muted}}>
                            <span className="font-mono" style={{direction:"ltr"}}>{b.clientPhone||"—"}</span>·<span>{b.persons} أشخاص</span>
                          </div>
                        </div>
                        <button onClick={()=>send(b)} disabled={!b.clientPhone} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold cursor-pointer flex-shrink-0"
                          style={{background:sent?"#fff":"#E3F3E8",border:`1px solid ${sent?B.border:"#C4E4CE"}`,color:sent?B.muted:"#1E7A44",opacity:b.clientPhone?1:.5}}>
                          {sent?<Check size={12}/>:<MessageCircle size={12}/>}{sent?"فُتح واتساب":"واتساب"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>}
        </div>
        <div className="flex gap-2 px-6 py-4 flex-shrink-0" style={{borderTop:`1px solid ${B.border}`}}>
          <button onClick={onClose} className="mr-auto px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer" style={{background:B.fill,color:B.text2,border:"none"}}>إغلاق</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ════════ نافذة تفاصيل الرحلة ════════ */
function TripDetailsModal({trip,pkgName,hotelName,transportName,branch,impact,canEdit,onEdit,onToggleStatus,onCancel,onClose}:{
  trip:Trip;pkgName:string;hotelName:string;transportName:string;branch?:Branch;impact:CancelImpact;canEdit:boolean;
  onEdit:()=>void;onToggleStatus:()=>void;onCancel:(reason:string)=>void;onClose:()=>void;
}) {
  const [confirmCancel,setConfirmCancel]=useState(false);
  const state=tripState(trip);
  const {capacity,booked,available}=seatsOf(trip);
  const isCancelled=state==="cancelled"||state==="archived";
  const isEnded=state==="ended";
  const isFull=state==="full";
  const mapUrl=trip.departureMapUrl||branch?.gmapUrl||"";
  /* نقطة الانطلاق تُقرأ من لقطة الرحلة لا من الفرع الحيّ: تعديل اسم
     الفرع أو نقله لاحقاً يجب ألّا يغيّر ما وُعد به ركّاب رحلةٍ مضت.
     اسم الفرع يُعرض بجانبها للسياق لا بدلاً عنها. */
  const departure = trip.departurePoint
    || (branch ? `${branch.name} — ${branch.city}` : "—");
  const rows:[string,React.ReactNode][]=[
    ["الباقة",pkgName||"—"],["رقم الرحلة",<span style={{fontFamily:"var(--font-app)"}}>{trip.id}</span>],
    ["حالة الرحلة",<StatusBadge status={state} entity="trip"/>],
    ["تاريخ الذهاب",trip.departureDate||"—"],["وقت الانطلاق",trip.departureTime||"—"],
    ["تاريخ العودة",trip.returnDate||"—"],["وقت العودة",trip.returnTime||"—"],
    ["المركبة",transportName||"—"],
    ["رقم لوحة الباص",trip.busPlate||"—"],["الرقم التعريفي للباص",trip.busCode||"—"],
    ["نقطة الانطلاق",departure],
    /* العنوان من لقطة الرحلة وحدها — لا يُستكمل من الفرع الحيّ. */
    ...(trip.departureAddress?[["عنوان الانطلاق",trip.departureAddress] as [string,React.ReactNode]]:[]),
    ["الفندق",hotelName||"—"],
  ];
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-auto"
      style={{background:"rgba(14,12,11,0.78)",backdropFilter:"blur(4px)"}} onClick={onClose}>
      <motion.div initial={{opacity:0,y:24}} animate={{opacity:1,y:0}} exit={{opacity:0,y:24}}
        className="w-full rounded-2xl overflow-hidden flex flex-col my-4" style={{maxWidth:560,background:"#fff"}} onClick={e=>e.stopPropagation()}>
        <div className="relative px-6 pt-5 pb-4 flex-shrink-0" style={{background:B.primaryDeep}}>
          <div className="absolute top-0 inset-x-0 h-1" style={{background:`linear-gradient(90deg,${B.gold},${B.gold2},${B.gold})`}}/>
          <div className="flex items-center justify-between">
            <h2 className="font-extrabold text-white" style={{fontSize:15,fontFamily:"var(--font-app)"}}>تفاصيل الرحلة – {tripLabel(trip,pkgName)}</h2>
            <button aria-label="إغلاق النافذة" title="إغلاق النافذة" onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer" style={{background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.1)",color:"#CDE7E4"}}><X size={14}/></button>
          </div>
        </div>
        <div className="p-6 flex flex-col gap-5 overflow-y-auto" style={{scrollbarWidth:"none"}}>
          {/* لوح الإلغاء يسبق كل رقم: رحلةٌ ألغيت لا يُقرأ فيها «متبقٍ». */}
          {isCancelled&&(
            <div className="rounded-xl px-4 py-3" style={{background:"#F4F1EC",border:`1px solid ${B.border}`}}>
              <div className="text-sm font-extrabold mb-1" style={{color:B.black}}>هذه الرحلة ملغاة</div>
              <div className="text-xs" style={{color:B.text2}}>
                {trip.cancelReason||"لم يُسجَّل سبب — أُلغيت قبل تفعيل تسجيل الأسباب."}
                {trip.cancelledAt&&<> · بتاريخ <b style={{color:B.black}}>{trip.cancelledAt.slice(0,10)}</b></>}
              </div>
            </div>
          )}
          {/* Quick stats — المنتهية تُقرأ بحصيلتها، والملغاة لا تُقرأ بها أصلاً. */}
          {!isCancelled&&(
          <div className="grid grid-cols-3 gap-3">
            {(isEnded
              ? [
                  {l:"سعة الرحلة",v:capacity,bg:"#F1EFEC",fg:"#5C554E",bd:"#DDD8D1"},
                  {l:"سافروا",v:booked,bg:"#E3F3E8",fg:"#1E7A44",bd:"#C4E4CE"},
                  {l:"لم تُبَع",v:available,bg:"#F1EFEC",fg:"#5C554E",bd:"#DDD8D1"},
                ]
              : [
                  {l:"إجمالي المقاعد",v:capacity,bg:"#EAF1FE",fg:"#1E52C7",bd:"#CBDBFB"},
                  {l:"المحجوزة",v:booked,bg:"#E3F3E8",fg:"#1E7A44",bd:"#C4E4CE"},
                  {l:"المتبقية",v:available,bg:"#FBF3D6",fg:"#8A6A08",bd:"#F0E3AE"},
                ]
            ).map(x=>(
              <div key={x.l} className="rounded-xl p-3 text-center" style={{background:x.bg,border:`1px solid ${x.bd}`}}>
                <div className="text-xs font-semibold mb-1" style={{color:x.fg,opacity:.85}}>{x.l}</div>
                <div className="text-2xl font-extrabold" style={{color:x.fg}}>{x.v}</div>
              </div>
            ))}
          </div>
          )}
          {/* Details grid */}
          <div className="rounded-2xl overflow-hidden" style={{border:`1px solid ${B.border}`}}>
            {rows.map(([l,v],i)=>(
              <div key={l} className="flex items-center justify-between gap-3 px-4 py-2.5" style={{background:i%2?"#FDFCFA":"#fff",borderTop:i?`1px solid ${B.border}`:"none"}}>
                <span className="text-xs font-semibold flex-shrink-0" style={{color:B.muted}}>{l}</span>
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
        {/* Actions — رحلةٌ راحت لا يُوقَف حجزها ولا يُلغى ولا تُعدَّل: كلها
            وعودٌ بأثرٍ على المستقبل، ولا مستقبل لها. */}
        <div className="flex gap-2 px-6 py-4 flex-shrink-0 flex-wrap" style={{borderTop:`1px solid ${B.border}`}}>
          {!isCancelled&&!isEnded&&canEdit&&<button onClick={onEdit} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold cursor-pointer"
            style={{background:B.gold,color:B.black,border:"none"}}><Pencil size={13}/>تعديل</button>}
          {!isCancelled&&!isEnded&&<button onClick={onToggleStatus} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold cursor-pointer"
            style={{background:isFull?"#E3F3E8":"#FBF3D6",color:isFull?"#1E7A44":"#8A6A08",border:`1px solid ${isFull?"#C4E4CE":"#F0E3AE"}`}}>
            {isFull?"استئناف الحجز":"إيقاف الحجز مؤقتاً"}</button>}
          {!isCancelled&&!isEnded&&<button onClick={()=>setConfirmCancel(true)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold cursor-pointer"
            style={{background:"#FBE6E6",color:"#BE2626",border:"1px solid #F3C9C9"}}><X size={13}/>إلغاء الرحلة</button>}
          {isEnded&&<span className="flex items-center px-4 py-2.5 text-xs font-bold" style={{color:B.muted}}>انتهت هذه الرحلة — لا إجراءات تشغيلية عليها.</span>}
          <button onClick={onClose} className="mr-auto px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer" style={{background:B.fill,color:B.text2,border:"none"}}>إغلاق</button>
        </div>
      </motion.div>
      <AnimatePresence>
        {confirmCancel&&<CancelTripConfirm trip={trip} pkgName={pkgName} impact={impact} onConfirm={r=>{setConfirmCancel(false);onCancel(r);onClose();}} onCancel={()=>setConfirmCancel(false)}/>}
      </AnimatePresence>
    </motion.div>
  );
}

/* ════════ كرت الرحلة المختصر (قابل للنقر) ════════

   السطر الأخير يتبع الحالة المشتقّة لا السعة وحدها. «المتبقي ٠» على
   رحلةٍ ملغاة كان يقرأ «امتلأت» — وهي ملاحظة الفريق: الملغاة تُعرض
   ملغاةً لا ممتلئة، والمنتهية تُعرض بحصيلتها لا بمقاعدَ لم يعد لها
   معنى. */
const TRIP_TONE: Record<TripState,{bd:string;bg:string}> = {
  open:      {bd:"#C4E4CE",bg:"#F0FAF3"},
  full:      {bd:"#F3C9C9",bg:"#FBE6E6"},
  running:   {bd:"#BFE1F1",bg:"#EDF7FC"},
  ended:     {bd:"#DDD8D1",bg:"#F7F5F2"},
  cancelled: {bd:"#D6CFC6",bg:"#F4F1EC"},
  archived:  {bd:"#D6CFC6",bg:"#F4F1EC"},
};

/* البطاقة حاويةٌ لا زرّاً واحداً: زرُّ «تعديل» داخل زرٍّ أكبر تداخلٌ غير
   صالح في HTML ويُطلق الفتح مع كل ضغطة تعديل. */
function TripCard({trip,pkgName,onOpen,onEdit}:{trip:Trip;pkgName:string;onOpen:()=>void;onEdit?:()=>void}) {
  const state=tripState(trip);
  const {booked,capacity,available}=seatsOf(trip);
  const {bd,bg}=TRIP_TONE[state];
  const until=untilLabel(trip);
  const editable=!!onEdit&&state!=="cancelled"&&state!=="archived"&&state!=="ended";
  return (
    <motion.div layout initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="rounded-2xl overflow-hidden flex flex-col" style={{border:`1.5px solid ${bd}`,background:bg}}>
      <button onClick={onOpen} className="w-full text-right cursor-pointer p-4 flex flex-col gap-2" style={{background:"transparent",border:"none"}}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-extrabold text-sm" style={{color:B.black}}>{tripLabel(trip,pkgName)}</span>
          <span className="font-mono text-xs px-2 py-0.5 rounded-lg" style={{background:"#fff",border:`1px solid ${B.border}`,color:B.muted}}>{trip.id}</span>
          <StatusBadge status={state} entity="trip"/>
          <ArrowRight size={14} style={{color:B.muted,marginRight:"auto",transform:"scaleX(-1)"}}/>
        </div>
        <div className="flex items-center gap-3 text-xs flex-wrap" style={{color:B.text2}}>
          <span className="inline-flex items-center gap-1"><CalendarDays size={12} style={{color:B.gold}}/><b style={{color:B.black}}>{trip.departureDate||"—"}</b></span>
          <span className="inline-flex items-center gap-1"><Clock size={12} style={{color:B.gold}}/>{trip.departureTime||"—"}</span>
          {trip.busPlate&&<span className="inline-flex items-center gap-1"><Bus size={12} style={{color:B.gold}}/>{trip.busPlate}</span>}
          {until&&state==="open"&&<span className="font-bold" style={{color:"#8A6A08"}}>{until}</span>}
        </div>
        {state==="cancelled"
          ? <div className="text-xs font-bold" style={{color:B.text2}}>
              أُلغيت{trip.cancelReason?<> — <span style={{color:B.black}}>{trip.cancelReason}</span></>:null}
              {trip.cancelledAt&&<span style={{color:B.muted}}> · {shortDate(trip.cancelledAt.slice(0,10))}</span>}
            </div>
          : state==="ended"
          ? <div className="text-xs font-bold" style={{color:B.text2}}>انتهت · سافر <b style={{color:B.black}}>{booked}</b> من {capacity}</div>
          : <div className="flex items-center gap-2 text-xs">
              <span className="font-bold" style={{color:B.text2}}>تم الحجز: <b style={{color:B.black}}>{booked}</b> من {capacity}</span>
              <span style={{color:B.muted}}>·</span>
              <span className="font-bold" style={{color:state==="full"?"#BE2626":"#1E7A44"}}>المتبقي: {available}</span>
            </div>}
      </button>
      {editable&&(
        <div className="flex px-4 pb-3 -mt-1">
          <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer" style={{background:"#fff",border:`1px solid ${B.border}`,color:B.text3}}>
            <Pencil size={11}/>تعديل
          </button>
        </div>
      )}
    </motion.div>
  );
}

/* ─── Mini 3-month trip calendar (visualization) ─── */
const AR_MONTHS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const AR_WEEK   = ["س","ح","ن","ث","ر","خ","ج"];

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
            /* اللون والملخّص من الحالة المشتقّة: خانةُ يومٍ مضى كانت
               تُصبغ أخضرَ «مفتوحة» وتَعِد بمقاعدَ لا تُباع. */
            const states=deps.map(t=>tripState(t));
            const col=dayColor(deps);
            const isOpen=states.includes("open");
            const remaining=deps.reduce((a,t)=>a+(tripState(t)==="open"?seatsOf(t).available:0),0);
            const title=deps.map(t=>`رحلة ${t.id} — ${t.departureDate} ${t.departureTime} · ${statusLabel(tripState(t),"trip")} · ${t.bookedSeats}/${t.seats}`).join("\n");
            const tail=states.includes("full")?"مكتمل":states.includes("running")?"جارية":states.includes("ended")?"انتهت":"ملغاة";
            return (
              <button key={"d"+i} title={title} onClick={()=>onPick(ds,deps)}
                className="relative flex flex-col items-center justify-center rounded-lg cursor-pointer leading-none gap-0.5"
                style={{height:38,background:col,color:"#fff",border:"none"}}>
                <span style={{fontSize:11,fontWeight:800}}>{d}</span>
                {isOpen
                  ? <span style={{fontSize:7.5,fontWeight:700,opacity:0.95}}>{remaining} مقعد</span>
                  : <span style={{fontSize:7.5,fontWeight:700,opacity:0.9}}>{tail}</span>}
                {deps.length>1&&<span className="absolute flex items-center justify-center rounded-full"
                  style={{top:-4,left:-4,width:13,height:13,fontSize:8,fontWeight:800,background:B.gold,color:B.black,border:"1px solid #fff"}}>{deps.length}</span>}
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
  /* المرساة شهر أقرب رحلةٍ قادمة لا شهر أقدم رحلةٍ على الإطلاق. كان
     الثاني يفتح التقويم على «يوليو · أغسطس» ونحن في سبتمبر — وهي
     ملاحظة الفريق: الموظف يريد ما هو آتٍ لا ما مضى. */
  const {y:anchorY,m:anchorM}=calendarAnchor(trips);
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
                <button aria-label="إلغاء اختيار اليوم" title="إلغاء اختيار اليوم" onClick={()=>setPicked(null)} className="w-6 h-6 rounded-lg flex items-center justify-center cursor-pointer" style={{background:B.fill,border:`1px solid ${B.border}`,color:B.muted}}><X size={11}/></button>
              </div>
              {picked.deps.map(t=>{
                const st=tripState(t);
                const {booked,capacity,available}=seatsOf(t);
                return (
                  <button key={t.id} onClick={()=>onOpen(t)} className="w-full text-right rounded-xl p-3 flex items-center justify-between gap-2 cursor-pointer" style={{background:"#fff",border:`1px solid ${B.border}`}}>
                    <div className="flex items-center gap-2"><span className="font-mono px-2 py-0.5 rounded-lg text-xs" style={{background:B.fill,border:`1px solid ${B.border}`,color:B.muted}}>{t.id}</span><StatusBadge status={st} entity="trip"/></div>
                    <span className="text-xs font-bold" style={{color:B.text2}}>
                      {st==="cancelled"||st==="archived" ? "—" : st==="ended" ? `سافر ${booked} من ${capacity}` : `${booked}/${capacity} · متبقٍّ ${available}`}
                    </span>
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
  const bookings=useStore(s=>s.bookings);
  const tickets=useStore(s=>s.tickets);
  const {canWrite}=useRole();
  const mayWrite=canWrite("trips");
  const [search,setSearch]=useState("");
  /* التصفية على القيمة الساكنة لا على كل ضغطة مفتاح. */
  const query = useDebounced(search);
  const [stateFilter,setStateFilter]=useState<"all"|TripState>("all");
  const [pkgFilter,setPkgFilter]=useState<string>("all");
  const [showLaunch,setShowLaunch]=useState(false);
  const [launchPkgId,setLaunchPkgId]=useState<string|undefined>(undefined);
  const [detailId,setDetailId]=useState<string|null>(null);
  const [editId,setEditId]=useState<string|null>(null);
  const [showEnded,setShowEnded]=useState(false);
  /* لوح المتابعة بعد الإلغاء: يحمل الأثر كما حُسب لحظة الإلغاء — الحجوزات
     لا تتغيّر بإلغاء الرحلة، والتذاكر تُلغى في القاعدة فلا يُعاد حسابها. */
  const [followUp,setFollowUp]=useState<{trip:Trip;reason:string;impact:CancelImpact}|null>(null);

  const pkgName=(id:string)=>packages.find(p=>p.id===id)?.name??"—";
  const hotelName=(id:string)=>hotels.find(h=>h.id===id)?.name??"";
  const transportName=(id:string)=>{ const t=transports.find(x=>x.id===id); return t?`${t.name}${t.plate?` — ${t.plate}`:""}`:""; };
  const branchOf=(id:string)=>branches.find(b=>b.id===id);

  function toggleStatus(id:string){ setTrips(p=>p.map(t=>t.id===id?{...t,status:t.status==="full"?"open":"full"}:t)); }
  function cancelTrip(trip:Trip,reason:string){
    const impact=cancelImpact(trip,bookings,tickets);
    const at=new Date().toISOString();
    setTrips(p=>p.map(t=>t.id===trip.id?{...t,status:"cancelled",cancelReason:reason,cancelledAt:at}:t));
    setFollowUp({trip:{...trip,status:"cancelled",cancelReason:reason,cancelledAt:at},reason,impact});
  }
  function handleSaveNew(t:Trip){ setTrips(p=>[t,...p]); setShowLaunch(false); toast.success("أُطلقت الرحلة",{description:`${pkgName(t.packageId)} · ${shortDate(t.departureDate)}`}); }
  function handleSaveEdit(t:Trip){ setTrips(p=>p.map(x=>x.id===t.id?t:x)); setEditId(null); toast.success("حُفظت تعديلات الرحلة"); }

  /* المرشّح يعمل على الحالة المشتقّة لا المخزّنة: ضغطُ «مفتوحة» كان
     يُرجع رحلاتٍ انطلقت لأن عمودها ما زال يقول open. */
  const filtered=trips.filter(t=>
    (stateFilter==="all"||tripState(t)===stateFilter)&&
    (pkgFilter==="all"||t.packageId===pkgFilter)&&
    (!query||t.id.toLowerCase().includes(query.toLowerCase())||packages.find(p=>p.id===t.packageId)?.name.includes(query)||t.departurePoint.includes(query)||(t.busPlate||"").includes(query))
  );

  /* الفصل قبل التجميع: قسم «المنتهية» يُعرض مطويّاً في آخر الصفحة كي
     لا يزحم التشغيل اليومي — مطلبٌ إداري صريح من الفريق. */
  const {live:liveTrips,ended:endedTrips}=splitByPhase(filtered);

  const grouped = packages.map(pkg=>{
    const pkgTrips=liveTrips.filter(t=>t.packageId===pkg.id);
    /* الباقة بلا رحلاتٍ قائمة تبقى مرئية في العرض غير المُرشَّح وحده:
       بطاقتها تحمل زرّ «إطلاق رحلة» وهي المدخل الطبيعي له. أمّا مع
       مرشّحٍ أو بحث فبطاقةٌ فارغة ضجيجٌ يخفي ما بُحث عنه — وصار هذا
       أظهر بعد فصل المنتهية: باقةٌ كل رحلاتها انتهت تعرض إطاراً فارغاً
       في كل مرّة. */
    const unfiltered = pkgFilter==="all" && stateFilter==="all" && !query;
    if(pkgTrips.length===0 && !unfiltered) return null;
    /* الإجماليات من tripTotals: تستبعد الملغاة (والمنتهية أصلاً مفصولة)
       من «المتاحة» — وهو نصّ ملاحظة الفريق حرفياً. */
    const totals=tripTotals(pkgTrips);
    return {pkg,trips:pkgTrips,totals,next:nextTrip(pkgTrips)};
  }).filter(Boolean) as {pkg:Pkg;trips:Trip[];totals:ReturnType<typeof tripTotals>;next?:Trip}[];

  const ungrouped=liveTrips.filter(t=>!packages.find(p=>p.id===t.packageId));

  const stats=tripTotals(trips);
  const fb=(on:boolean)=>({padding:"6px 14px",borderRadius:999,fontSize:13,fontWeight:700,cursor:"pointer" as const,border:`1px solid ${on?B.gold:B.border}`,background:on?B.gold:"#fff",color:on?B.black:B.text2,transition:"all 0.15s"});
  const detailTrip = detailId ? trips.find(t=>t.id===detailId) : undefined;
  const editTrip = editId ? trips.find(t=>t.id===editId) : undefined;
  const cardEdit=(t:Trip)=>mayWrite?()=>setEditId(t.id):undefined;

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{background: B.bg}}>
      <PageHeader title="الرحلات" crumb="إدارة الرحلات" search={search} onSearch={setSearch} onMenuOpen={onMenuOpen}/>
      <div className="px-4 md:px-8 pt-4 md:pt-5">
        {/* كل بطاقة تقول ما تعدّه بالضبط: «الرحلات القائمة» ليست «إجمالي
            الرحلات»، والفرق بينهما هو ما قرأه الفريق تناقضاً. والمنتهية
            تُعرض رقماً مستقلاً لا تختفي ولا تُخلط. */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard label="رحلات قائمة" value={stats.live} sub={`من ${trips.length} في السجل`} accent/>
          <StatCard label="تقبل الحجز" value={stats.open} sub={stats.running?`و${stats.running} جارية الآن`:"مقاعدها متاحة"}/>
          <StatCard label="مكتملة العدد" value={stats.full} sub="لا مقاعد متبقّية"/>
          <StatCard label="مقاعد الرحلات القائمة" value={stats.capacity} sub="بلا المنتهية والملغاة"/>
          <StatCard label="محجوزة" value={stats.booked} sub={`${stats.available} متاح للبيع`}/>
        </div>
        <div className="flex items-center justify-between gap-3 mt-5 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 p-1 rounded-xl" style={{background:"#fff",border:`1px solid ${B.border}`}}>
              {([["all","الكل"],["open","مفتوحة"],["full","مكتملة"],["running","جارية"],["ended","منتهية"],["cancelled","ملغاة"]] as const).map(([v,l])=>(
                <button key={v} style={fb(stateFilter===v)} onClick={()=>setStateFilter(v)}>{l}</button>
              ))}
            </div>
            <div className="flex items-center gap-1 p-1 rounded-xl" style={{background:"#fff",border:`1px solid ${B.border}`}}>
              <button style={fb(pkgFilter==="all")} onClick={()=>setPkgFilter("all")}>كل الباقات</button>
              {packages.map(p=><button key={p.id} style={fb(pkgFilter===p.id)} onClick={()=>setPkgFilter(p.id)}>{p.name.slice(0,14)}…</button>)}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* «٣ / ٧» بلا كلمة كان أحد الأرقام الثلاثة المجهولة على هذه
                الصفحة. الرقم يُسمّى ما يعدّه أو لا يُعرض. */}
            <span className="text-sm" style={{color:B.muted}}>معروض <b style={{color:B.black}}>{filtered.length}</b> من {trips.length}</span>
            {mayWrite&&<button onClick={()=>{setLaunchPkgId(undefined);setShowLaunch(true);}} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer"
              style={{background:B.gold,color:B.black,border:"none",boxShadow:"0 4px 12px rgba(192,134,44,0.35)"}}>
              <Plus size={15}/>إطلاق رحلة
            </button>}
          </div>
        </div>
        <div className="mt-5" style={{height:1,background:B.border}}/>
      </div>
      <main className="flex-1 px-4 md:px-8 pb-12 pt-6 flex flex-col gap-5">
        <EntityGate entity="trips" label="الرحلات" skeleton="cards">
        {grouped.map(({pkg,trips:pkgTrips,totals,next})=>(
          <div key={pkg.id} className="rounded-2xl overflow-hidden" style={{background:"#fff",border:`1px solid ${B.border}`}}>
            <div className="px-5 py-4" style={{background:B.fill,borderBottom:`1px solid ${B.border}`}}>
              <div className="flex items-center gap-4 flex-wrap mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0" style={{background:B.primaryDeep,border:"1px solid rgba(192,134,44,0.25)"}}>📦</div>
                <div className="flex-1">
                  <div className="font-extrabold" style={{color:B.black,fontSize:15,fontFamily:"var(--font-app)"}}>{pkg.name}</div>
                  <div className="text-xs mt-0.5" style={{color:B.text2}}>{pkgTrips.length} رحلة قائمة · {pkg.days} أيام · {destBadge(pkg.destination)}</div>
                </div>
                {/* أقرب رحلة قادمة — ما يفيد الموظف اليوم. كان مكانها نطاق
                    أشهرٍ يبدأ من أقدم رحلة في السجل. */}
                {next
                  ? <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold" style={{background:"#fff",border:`1px solid ${B.border}`,color:B.text2}}>
                      <CalendarDays size={12} style={{color:B.gold}}/>
                      أقرب رحلة <b style={{color:B.black}}>{shortDate(next.departureDate)}</b>
                      <span style={{color:B.muted}}>· {untilLabel(next)}</span>
                    </div>
                  : <div className="px-3 py-1.5 rounded-xl text-xs font-bold" style={{background:"#FBF3D6",border:"1px solid #F0E3AE",color:"#8A6A08"}}>لا رحلات قادمة</div>}
                {mayWrite&&<button onClick={()=>{setLaunchPkgId(pkg.id);setShowLaunch(true);}} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer" style={{background:B.gold,color:B.black,border:"none"}}><Plus size={11}/>إطلاق رحلة</button>}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  {l:"سعة المقاعد",v:totals.capacity,bg:"#fff",fg:B.black,border:B.border},
                  {l:"محجوزة",v:totals.booked,bg:"#E3F3E8",fg:"#1E7A44",border:"#C4E4CE"},
                  {l:"قائمة الانتظار",v:totals.waiting,bg:"#FBF3D6",fg:"#8A6A08",border:"#F0E3AE"},
                  {l:"متاحة",v:totals.available,bg:"#EAF1FE",fg:"#1E52C7",border:"#CBDBFB"},
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
                  {pkgTrips.map(t=><TripCard key={t.id} trip={t} pkgName={pkg.name} onOpen={()=>setDetailId(t.id)} onEdit={cardEdit(t)}/>)}
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
                {ungrouped.map(t=><TripCard key={t.id} trip={t} pkgName={pkgName(t.packageId)} onOpen={()=>setDetailId(t.id)} onEdit={cardEdit(t)}/>)}
              </AnimatePresence>
            </div>
          </div>
        )}
        {/* المنتهية في قسمها: محفوظةٌ ومقروءة، وخارج التشغيل اليومي. */}
        {endedTrips.length>0&&(
          <div className="rounded-2xl overflow-hidden" style={{background:"#fff",border:`1px solid ${B.border}`}}>
            <button onClick={()=>setShowEnded(v=>!v)} aria-expanded={showEnded}
              className="w-full flex items-center gap-3 px-5 py-4 cursor-pointer text-right"
              style={{background:B.fill,border:"none",borderBottom:showEnded?`1px solid ${B.border}`:"none"}}>
              <Archive size={15} style={{color:B.muted,flexShrink:0}}/>
              <span className="font-extrabold text-sm" style={{color:B.black}}>الرحلات المنتهية</span>
              <span className="px-2 py-0.5 rounded-lg text-xs font-bold" style={{background:"#fff",border:`1px solid ${B.border}`,color:B.muted}}>{endedTrips.length}</span>
              <span className="text-xs mr-auto" style={{color:B.muted}}>انتهى موعد عودتها — للاطّلاع لا للتشغيل</span>
              {showEnded?<ChevronUp size={14} style={{color:B.muted}}/>:<ChevronDown size={14} style={{color:B.muted}}/>}
            </button>
            <AnimatePresence>{showEnded&&(
              <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} className="overflow-hidden">
                <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {endedTrips.map(t=><TripCard key={t.id} trip={t} pkgName={pkgName(t.packageId)} onOpen={()=>setDetailId(t.id)}/>)}
                </div>
              </motion.div>
            )}</AnimatePresence>
          </div>
        )}
        {filtered.length===0&&(
          <motion.div initial={{opacity:0}} animate={{opacity:1}} className="flex flex-col items-center justify-center py-24 rounded-2xl" style={{background:"#fff",border:`1px solid ${B.border}`}}>
            <Plane size={44} style={{opacity:0.2,color:B.gold,marginBottom:12}}/>
            <p className="font-bold" style={{color:B.black}}>لا توجد رحلات مطابقة</p>
          </motion.div>
        )}
        </EntityGate>
      </main>
      <AnimatePresence>
        {detailTrip&&(
          <TripDetailsModal trip={detailTrip} pkgName={pkgName(detailTrip.packageId)} hotelName={hotelName(detailTrip.hotelId)}
            transportName={transportName(detailTrip.transportId)} branch={branchOf(detailTrip.branchId)}
            impact={cancelImpact(detailTrip,bookings,tickets)} canEdit={mayWrite}
            onEdit={()=>{setDetailId(null);setEditId(detailTrip.id);}}
            onToggleStatus={()=>toggleStatus(detailTrip.id)} onCancel={r=>cancelTrip(detailTrip,r)} onClose={()=>setDetailId(null)}/>
        )}
        {showLaunch&&(
          <TripFormModal mode="launch" packages={packages} branches={branches}
            prefillPkgId={launchPkgId} onSave={handleSaveNew} onClose={()=>setShowLaunch(false)}/>
        )}
        {editTrip&&(
          <TripFormModal mode="edit" initial={editTrip} packages={packages} branches={branches}
            onSave={handleSaveEdit} onClose={()=>setEditId(null)}/>
        )}
        {followUp&&(
          <CancelFollowUp trip={followUp.trip} pkgName={pkgName(followUp.trip.packageId)} reason={followUp.reason} impact={followUp.impact} onClose={()=>setFollowUp(null)}/>
        )}
      </AnimatePresence>
    </div>
  );
}
