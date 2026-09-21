import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { sar } from "@/lib/money";
import { motion, AnimatePresence } from "motion/react";
import { Calendar, DateObject } from "react-multi-date-picker";
import gregorian from "react-date-object/calendars/gregorian";
import gregorian_ar from "react-date-object/locales/gregorian_ar";
import gregorian_en from "react-date-object/locales/gregorian_en";
import { Plus, X, Plane, MapPin, Link2, Clock, AlertTriangle, CalendarDays, ChevronUp, ChevronDown, ChevronRight, ChevronLeft, ArrowRight, History, Settings2, Pencil, Bus, MessageCircle, Copy, Users, Ticket, Wallet, Check, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { B } from "@/lib/theme";
import { useDebounced } from "@/lib/useDebounced";
import { useRole } from "@/lib/useRole";
import { EntityGate } from "@/components/States";
import type { Hotel, Transport, Pkg, Trip, Branch, Booking, TripDriver, TripDepartureStop } from "@/types";
import { uid, parseYMD, ymd, newId, openWhatsApp, copyText, money } from "@/lib/utils";
import {
  tripState, tripBoardState, occupancy, nextTrip, calendarAnchor, dayColor,
  seatsOf, shortDate, untilLabel, dayName, tableDate, tripDeparture,
  splitByHorizon, groupByWeek, AR_MONTHS,
  type TripBoardState, type TripGroup, type Horizon,
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
import { Field } from "@/components/Field";
import { isOperational } from "@/features/transport/readiness";

const todayStart = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
/* التقويم في لوحة التشغيل يتسع لأسماء الأيام كاملة؛ الاختصار حرف أو
   حرفان يحمّل الموظف تخمين «ثن/ثل» بلا مكسب في هذه النافذة الواسعة. */
const FULL_AR_WEEKDAYS = { ...gregorian_ar, weekDays: gregorian_ar.weekDays.map(([full]) => [full, full]) };
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
  & { departureCity:string }
  & { returnTime:string; departureAddress:string; departureStops:TripDepartureStop[] };

const emptyForm = ():TripForm => ({
  packageId:"",branchId:"",transportId:"",busPlate:"",busCode:"",
  departureDate:"",returnDate:"",departureTime:"22:00",returnTime:"",
  departureCity:"",departurePoint:"",departureMapUrl:"",departureAddress:"",departureStops:[{id:uid(),branchId:"",city:"",point:"",time:""}],
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
  sub:v.mode==="flight"
    ? `رحلة ${v.flightNo||"—"}`
    : `${Math.max(1,v.fleetCount??1)} ${Math.max(1,v.fleetCount??1)===1?"باص":"باصات"} · ${v.seats} مقعد لكل باص`,
  keywords:[v.plate,v.serialNo,v.flightNo,v.model].filter(Boolean).join(" "),
});

const legacyStop = (trip: Pick<Trip,"id"|"branchId"|"departureCity"|"departurePoint"|"departureMapUrl"|"departureAddress"|"departureTime">): TripDepartureStop => ({
  id: `stop-${trip.id}`, branchId: trip.branchId || "", city: trip.departureCity || "", point: trip.departurePoint || "",
  time: trip.departureTime || "", mapUrl: trip.departureMapUrl || undefined, address: trip.departureAddress || undefined,
});

/* فلتر التاريخ نافذة حقيقية لا Popover على حافة الشاشة: اختيار اليوم
   يبقى في موضعه البصري مهما كان عرض الجدول أو اتجاه الصفحة. */
function TripDateFilterModal({ value, onChoose, onClear, onClose }: { value: string; onChoose: (v: string) => void; onClear: () => void; onClose: () => void }) {
  const selected = value ? new DateObject({ date: value, format: "YYYY-MM-DD", calendar: gregorian, locale: gregorian_ar }) : undefined;
  return <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{background:"rgba(14,12,11,.62)",backdropFilter:"blur(3px)"}} onClick={onClose}>
    <motion.div initial={{opacity:0,y:16,scale:.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:16,scale:.98}} className="w-full rounded-2xl overflow-hidden" style={{maxWidth:360,background:"#fff",border:`1px solid ${B.border}`}} onClick={e=>e.stopPropagation()}>
      <div className="flex items-center justify-between px-5 py-4" style={{background:B.primaryDeep}}>
        <div><div className="font-extrabold text-sm text-white">تصفية حسب التاريخ</div><div className="text-xs mt-1" style={{color:"#CDE7E4"}}>اختر يوم انطلاق واحداً</div></div>
        <button onClick={onClose} aria-label="إغلاق" className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer" style={{background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.15)",color:"#fff"}}><X size={14}/></button>
      </div>
      <div className="p-4 flex justify-center" dir="rtl">
        <Calendar value={selected} calendar={gregorian} locale={FULL_AR_WEEKDAYS} weekStartDayIndex={6} className="teal rmdp-mobile"
          onChange={(d: DateObject) => { onChoose(d.convert(gregorian, gregorian_en).format("YYYY-MM-DD")); onClose(); }} />
      </div>
      <div className="flex gap-2 px-4 py-3" style={{borderTop:`1px solid ${B.border}`}}>
        <button onClick={()=>{onClear();onClose();}} className="flex-1 py-2.5 rounded-xl text-xs font-bold cursor-pointer" style={{background:B.fill,border:`1px solid ${B.border}`,color:B.text2}}>كل التواريخ</button>
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-xs font-bold cursor-pointer" style={{background:B.gold,border:"none",color:B.black}}>إغلاق</button>
      </div>
    </motion.div>
  </motion.div>;
}

function TripFormModal({
  mode,initial,packages,branches,prefillPkgId,prefillDate,baseTrip,onSave,onClose
}:{
  mode:"launch"|"edit";initial?:Trip;packages:Pkg[];branches:Branch[];
  prefillPkgId?:string;
  /** يومٌ اختير من التقويم — يُملأ تاريخ الذهاب وحده. */
  prefillDate?:string;
  /** رحلةٌ قائمة تُتّخذ قاعدةً لرحلةٍ إضافية في اليوم نفسه. */
  baseTrip?:Trip;
  onSave:(t:Trip)=>void;onClose:()=>void;
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
      returnTime:initial.returnTime??"",departureCity:initial.departureCity??branches.find(b=>b.id===initial.branchId)?.city??"",departurePoint:initial.departurePoint,departureMapUrl:initial.departureMapUrl,
      departureAddress:initial.departureAddress??"",
      departureStops:initial.departureStops?.length ? initial.departureStops.map(s=>({...s})) : [legacyStop(initial)],
      drivers:initial.drivers.length?initial.drivers.map(d=>({...d})):[{id:uid(),name:"",phone:""}],
    };
    const f=emptyForm();
    /* رحلةٌ إضافية: كل ما يجمعها بالأولى منسوخٌ — الباقة واليوم والمدينة
       ونقطة الانطلاق والوقت. والمركبة وحدها تُترك فارغة عمداً: الحافلة
       الواحدة لا تكون في رحلتَين في اليوم نفسه، فنسخُها يُنتج تعارضاً
       يمنع الحفظ ويُقرأ خطأً في النظام. اختيارُ غيرها هو القرار الوحيد
       الباقي. */
    if(baseTrip){
      Object.assign(f,{
        packageId:baseTrip.packageId, branchId:baseTrip.branchId,
        departureCity:baseTrip.departureCity??branches.find(b=>b.id===baseTrip.branchId)?.city??"",
        departurePoint:baseTrip.departurePoint, departureMapUrl:baseTrip.departureMapUrl,
        departureAddress:baseTrip.departureAddress??"",
        departureStops:baseTrip.departureStops?.length ? baseTrip.departureStops.map(s=>({...s,id:uid()})) : [legacyStop(baseTrip)],
        departureDate:baseTrip.departureDate, returnDate:baseTrip.returnDate??"",
        departureTime:baseTrip.departureTime, returnTime:baseTrip.returnTime??"",
        drivers:baseTrip.drivers.length?baseTrip.drivers.map(d=>({...d,id:uid()})):[{id:uid(),name:"",phone:""}],
      });
      return f;
    }
    f.packageId=prefillPkgId??"";
    if(prefillDate) f.departureDate=prefillDate;
    /* الباقة المُمرَّرة تجرّ مركبتها إن كانت نشطة: أقلّ ضغطة، وهو ما كان
       يحدث ضمنياً حين كانت السعة تُشتقّ من مواصلة الباقة. */
    const pkg=packages.find(p=>p.id===f.packageId);
    const v=pkg?vehiclesFor(pkg.id).find(x=>x.id===pkg.transportId):undefined;
    if(v) Object.assign(f,{transportId:v.id,...vehicleIds(v)});
    if(pkg&&f.departureDate) f.returnDate=defaultReturnDate(f.departureDate,pkg.days);
    return f;
  });
  /* تاريخ العودة يُقترح من أيام الباقة ما لم يمسّه الموظف؛ وما مسّه لا
     يُدهَس بتغيير الباقة أو الذهاب بعده. */
  const [returnTouched,setReturnTouched]=useState(isEdit||!!baseTrip);
  const [busy,setBusy]=useState(false);
  const [launchTab,setLaunchTab]=useState<"basics"|"stops"|"schedule">("basics");
  const [scheduleTarget,setScheduleTarget]=useState<"departure"|"return">("departure");
  const set=<K extends keyof TripForm>(k:K,v:TripForm[K])=>setForm(f=>({...f,[k]:v}));
  const inp="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none";
  const ist={borderColor:B.border,background:"#fff",color:B.black,fontFamily:"inherit"} as const;
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

  const fleetCount=Math.max(1,selVehicle?.fleetCount??1);
  const conflict=findVehicleConflict(trips,{transportId:effectiveTransportId,departureDate:form.departureDate,returnDate:form.returnDate},initial?.id,fleetCount);
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
  /* كل محطة لقطة من الفرع وقت إطلاق الرحلة؛ تعديل الفرع لاحقاً لا يبدل
     ما بيع للعميل. أول محطة هي الانطلاق الرسمي المتوافق مع السجلات القديمة. */
  function pickStop(stopId:string, branchId:string){
    const branch=activeBranches.find(b=>b.id===branchId);
    if(!branch) return;
    setForm(f=>({...f,departureStops:f.departureStops.map(s=>s.id===stopId?{
      ...s,branchId:branch.id,city:branch.city,point:branch.name,mapUrl:branch.gmapUrl||undefined,address:branch.address||undefined,
    }:s)}));
  }
  const addStop=()=>set("departureStops",[...form.departureStops,{id:uid(),branchId:"",city:"",point:"",time:""}]);
  const removeStop=(id:string)=>set("departureStops",form.departureStops.filter(s=>s.id!==id));
  const setStopTime=(id:string,time:string)=>set("departureStops",form.departureStops.map(s=>s.id===id?{...s,time}:s));

  const addDriver=()=>set("drivers",[...form.drivers,{id:uid(),name:"",phone:""}]);
  const delDriver=(id:string)=>set("drivers",form.drivers.filter(d=>d.id!==id));
  const updDriver=(id:string,field:"name"|"phone",val:string)=>set("drivers",form.drivers.map(d=>d.id===id?{...d,[field]:val}:d));

  const depOk = form.departureStops.length>0 && form.departureStops.every(s=>!!s.branchId&&!!s.city&&!!s.point&&!!s.time);
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
    const stops=form.departureStops;
    const first=stops[0];
    const common={
      transportId:effectiveTransportId,busPlate:form.busPlate.trim(),busCode:form.busCode.trim(),
      departureTime:first.time,returnDate:form.returnDate,returnTime:form.returnTime||undefined,
      departureCity:first.city, branchId:first.branchId,
      departurePoint:first.point,departureMapUrl:first.mapUrl||"",
      departureAddress:first.address||undefined, departureStops:stops,
      drivers,
    };
    if(isEdit&&initial){ onSave({...initial,...common}); return; }
    onSave({...common,id:newId("TRP"),packageId:form.packageId,hotelId:selPkg?.hotelId??"",
      departureDate:form.departureDate,seats,price:selPkg?.marketPrice??0,status:"open",
      settings:selPkg?.settings?{...selPkg.settings}:{...DEFAULT_TRIP_SETTINGS},
      bookedSeats:0,waitingSeats:0});
  }

  const title=isEdit?`تعديل الرحلة — ${initial!.id}`:baseTrip?"إطلاق رحلة إضافية":"إطلاق رحلة جديدة";
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
          {!isEdit&&baseTrip&&<div className="text-xs mt-2" style={{color:"#CDE7E4"}}>
            بُنيت على الرحلة <b style={{color:"#fff",fontFamily:"var(--font-app)"}}>{baseTrip.id}</b> — الباقة والتاريخ والوقت ونقطة الانطلاق منسوخة.
            <span className="block mt-0.5" style={{color:"#A9CFCB"}}>اختر مركبةً أخرى: الحافلة الواحدة لا تكون في رحلتَين في اليوم نفسه.</span>
          </div>}
        </div>
        <div className="flex gap-1 p-2" style={{background:B.fill,borderBottom:`1px solid ${B.border}`}}>
          {([
            ["basics","الأساسيات",Bus], ["stops","محطات الانطلاق",MapPin], ["schedule","موعد الرحلة",CalendarDays],
          ] as const).map(([id,label,Icon])=><button key={id} onClick={()=>setLaunchTab(id)} className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-xl text-xs font-bold cursor-pointer" style={{background:launchTab===id?"#fff":"transparent",border:launchTab===id?`1px solid ${B.border}`:"1px solid transparent",color:launchTab===id?B.black:B.muted,boxShadow:launchTab===id?"0 1px 3px rgba(0,0,0,.05)":"none"}}><Icon size={13} style={{color:launchTab===id?B.gold:undefined}}/>{label}</button>)}
        </div>
        <div className="flex flex-col gap-4 p-6 overflow-y-auto" style={{scrollbarWidth:"none"}}>
          {launchTab==="basics"&&<>
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
                <span>السعة <b style={{color:B.black}}>{isEdit?initial!.seats:selVehicle.seats}</b> مقعد لكل باص</span>·
                <span><b style={{color:B.black}}>{fleetCount}</b> {fleetCount===1?"باص متاح":"باصات متاحة"}</span>
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
                ⚠ كل الباصات المتاحة من هذا النوع ({fleetCount}) مرتبطة برحلات متداخلة، منها <b>{conflictName}</b> <span className="font-mono">({conflict.id})</span> — زد عدد الباصات في سجل النوع أو غيّر التاريخ.
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
          </>}
          {launchTab==="stops"&&<>
          {/* محطات الصعود: رحلة ومقاعد واحدة، والباص يمر بالفروع بالترتيب. */}
          <div className="rounded-2xl p-4" style={{background:B.fill,border:`1px solid ${B.border}`}}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div><div className="text-sm font-extrabold" style={{color:B.black}}>محطات الانطلاق {req}</div>
                <p className="text-xs mt-1" style={{color:B.muted}}>أضف الفروع التي يمر عليها الباص، وحدد وقت الصعود في كل فرع.</p></div>
              <button onClick={addStop} className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold cursor-pointer flex-shrink-0" style={{background:"#fff",border:`1px solid ${B.border}`,color:"#8A6A08"}}><Plus size={12}/>محطة</button>
            </div>
            <div className="flex flex-col gap-2">
              {form.departureStops.map((stop,index)=><div key={stop.id} className="grid grid-cols-[30px_1fr_116px_32px] gap-2 items-center">
                <span className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-extrabold" style={{background:index===0?B.gold:"#fff",border:`1px solid ${index===0?B.gold:B.border}`,color:index===0?B.black:B.text2}}>{index+1}</span>
                <AppSelect value={stop.branchId} placeholder="اختر الفرع" onChange={id=>pickStop(stop.id,id)} options={activeBranches.map(b=>({value:b.id,label:`${b.city} · ${b.name}`}))}/>
                <input type="time" aria-label={`وقت محطة ${index+1}`} className={inp} style={{...ist,direction:"ltr",textAlign:"right"}} value={stop.time} onChange={e=>setStopTime(stop.id,e.target.value)}/>
                <button aria-label="حذف المحطة" title="حذف المحطة" disabled={form.departureStops.length===1} onClick={()=>removeStop(stop.id)} className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer" style={{background:"#fff",border:`1px solid ${B.border}`,color:"#BE2626",opacity:form.departureStops.length===1 ? .4 : 1}}><X size={12}/></button>
              </div>)}
            </div>
          </div>
          </>}
          {launchTab==="schedule"&&<>
          {/* الموعد تبويب كامل وتقويم ثابت؛ لا نافذةٌ تقفز فوق النموذج. */}
          <div className="rounded-2xl p-4" style={{background:"#fff",border:`1px solid ${B.border}`}}>
            <div className="flex items-center gap-2 mb-3"><CalendarDays size={16} style={{color:B.gold}}/><div className="text-sm font-extrabold" style={{color:B.black}}>موعد الرحلة</div></div>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button disabled={isEdit} onClick={()=>setScheduleTarget("departure")} className="rounded-xl p-3 text-right cursor-pointer" style={{background:scheduleTarget==="departure"?"#FFF4DE":B.fill,border:`1px solid ${scheduleTarget==="departure"?"#E6C77F":B.border}`,opacity:isEdit ? .65 : 1}}>
                <span className="block text-xs font-bold" style={{color:B.muted}}>تاريخ الذهاب {req}</span><span className="block text-sm font-extrabold mt-1" style={{color:B.black}}>{form.departureDate?`${dayName(form.departureDate)} · ${shortDate(form.departureDate)}`:"اختر التاريخ"}</span>
              </button>
              <button onClick={()=>setScheduleTarget("return")} className="rounded-xl p-3 text-right cursor-pointer" style={{background:scheduleTarget==="return"?"#FFF4DE":B.fill,border:`1px solid ${scheduleTarget==="return"?"#E6C77F":B.border}`}}>
                <span className="block text-xs font-bold" style={{color:B.muted}}>تاريخ العودة</span><span className="block text-sm font-extrabold mt-1" style={{color:B.black}}>{form.returnDate?`${dayName(form.returnDate)} · ${shortDate(form.returnDate)}`:"اختياري"}</span>
              </button>
            </div>
            <div className="trip-schedule-calendar flex justify-center py-2" dir="rtl">
              <Calendar value={(scheduleTarget==="departure"?form.departureDate:form.returnDate) ? new DateObject({date:scheduleTarget==="departure"?form.departureDate:form.returnDate,format:"YYYY-MM-DD",calendar:gregorian,locale:gregorian_ar}) : undefined} calendar={gregorian} locale={FULL_AR_WEEKDAYS} weekStartDayIndex={6} className="teal rmdp-mobile" minDate={scheduleTarget==="return"&&form.departureDate?parseYMDDate(form.departureDate):todayStart()} onChange={(d:DateObject)=>{const value=d.convert(gregorian,gregorian_en).format("YYYY-MM-DD"); if(scheduleTarget==="departure") setDeparture(value); else setReturn(value);}} />
            </div>
          </div>
          </>}
          {returnInvalid&&<div className="text-xs font-bold -mt-2" style={{color:"#BE2626"}}>
            {form.returnDate===form.departureDate?"وقت العودة يسبق وقت الانطلاق في اليوم نفسه":"تاريخ العودة لا يسبق الذهاب"}
          </div>}
          {!canSave&&!conflict&&!returnInvalid&&!tooSmall&&<div className="flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-bold" style={warn}>
            ⚠ أكمل: {isEdit?"":"الباقة، "}المركبة{manual?" (اللوحة ورقمها التعريفي)":" (بسعة أكبر من صفر)"}، مدينة ونقطة الانطلاق، {isEdit?"وقت الانطلاق":"تاريخ ووقت الذهاب"}.
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
function TripDetailsModal({trip,pkgName,hotelName,transportName,branch,impact,canEdit,onEdit,onExtra,onToggleStatus,onCancel,onClose}:{
  trip:Trip;pkgName:string;hotelName:string;transportName:string;branch?:Branch;impact:CancelImpact;canEdit:boolean;
  onEdit:()=>void;onExtra:()=>void;onToggleStatus:()=>void;onCancel:(reason:string)=>void;onClose:()=>void;
}) {
  const navigate=useNavigate();
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
          {/* الرحلة الممتلئة تُفتح لسؤالٍ واحد: هل أُطلق غيرها اليوم نفسه؟
              فالإجابة إجراءٌ هنا لا رحلةٌ تُنشأ من الصفر في شاشةٍ أخرى. */}
          {!isCancelled&&!isEnded&&canEdit&&isFull&&<button onClick={onExtra} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold cursor-pointer"
            style={{background:"#FBF3D6",color:"#8A6A08",border:"1px solid #F0E3AE"}}><Plus size={13}/>إطلاق رحلة إضافية</button>}
          {!isCancelled&&!isEnded&&<button onClick={onToggleStatus} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold cursor-pointer"
            style={{background:isFull?"#E3F3E8":"#FBF3D6",color:isFull?"#1E7A44":"#8A6A08",border:`1px solid ${isFull?"#C4E4CE":"#F0E3AE"}`}}>
            {isFull?"استئناف الحجز":"إيقاف الحجز مؤقتاً"}</button>}
          {!isCancelled&&!isEnded&&<button onClick={()=>setConfirmCancel(true)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold cursor-pointer"
            style={{background:"#FBE6E6",color:"#BE2626",border:"1px solid #F3C9C9"}}><X size={13}/>إلغاء الرحلة</button>}
          {/* الكشف والكروكي ليسا إجراءً على الرحلة بل قراءةٌ لها، فيبقيان
              متاحَين بعد انتهائها وبعد إلغائها — تُراجَع ولا تُعدَّل. */}
          <button onClick={()=>navigate(`/admin/manifests?trip=${encodeURIComponent(trip.id)}`)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold cursor-pointer"
            style={{background:"#fff",color:B.text3,border:`1px solid ${B.border}`}}>
            <ClipboardList size={13}/>كشف المقاعد والكروكي</button>
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

/* ════════ لوحة التشغيل ════════

   الشاشة جدولٌ واحد لا بطاقةً لكل باقة. السبب تشغيليّ لا جماليّ: السؤال
   الأول كل صباح «ما الذي يتحرّك هذا الأسبوع؟» لا «ماذا في هذه الباقة؟»،
   والبطاقات تجيب عن الثاني وتُخفي الأول — عشرون رحلةً في ستّ باقات تصير
   ستّ لوحاتٍ متفرّقة، وأقربُ رحلةٍ تنطلق غداً قد تكون في آخر الصفحة.

   الجدول يرتّب بالزمن ويجمع بالأسبوع، فيُقرأ الترتيب نفسه مهما زاد
   العدد: ثلاثون رحلةً تبقى ثلاثين صفّاً في أربعة أقسام. */

/* لون الصفّ والحدّ — من الحالة المعروضة لا المخزّنة. */
const BOARD_TONE: Record<TripBoardState,{fg:string;bg:string}> = {
  open:      {fg:"#1E7A44",bg:"#F0FAF3"},
  few:       {fg:"#B4530C",bg:"#FEF6EF"},
  full:      {fg:"#BE2626",bg:"#FDF2F2"},
  closed:    {fg:"#5C554E",bg:"#F7F5F2"},
  running:   {fg:"#0E7CA8",bg:"#F1F9FD"},
  ended:     {fg:"#7A7168",bg:"#FAF8F4"},
  cancelled: {fg:"#7A7168",bg:"#FAF8F4"},
  archived:  {fg:"#7A7168",bg:"#FAF8F4"},
};

/* شريط الإشغال — الرقم والشكل معاً: النسبة وحدها تُقرأ ولا تُلمح، والشريط
   وحده يُلمح ولا يُقرأ، والمسح السريع يحتاج الاثنين. */
function OccupancyBar({pct,fg}:{pct:number;fg:string}) {
  return (
    <div className="flex items-center gap-2" style={{minWidth:86}}>
      <div className="rounded-full overflow-hidden flex-1" style={{height:6,background:"#EDE8DE",minWidth:44}}>
        <div style={{width:`${pct}%`,height:"100%",background:fg,borderRadius:999}}/>
      </div>
      <span className="font-extrabold tabular-nums" style={{fontSize:12,color:fg,fontFamily:"var(--font-app)"}}>{pct}%</span>
    </div>
  );
}

/* زرّ «رحلة إضافية» — يظهر حيث يُتّخذ القرار: على صفّ الرحلة الممتلئة
   نفسها، لا في نموذجٍ فارغ يُملأ من الصفر. */
function ExtraTripButton({onClick,compact=false}:{onClick:()=>void;compact?:boolean}) {
  return (
    <button onClick={e=>{e.stopPropagation();onClick();}} title="إطلاق رحلة إضافية بنفس بيانات هذه الرحلة"
      className={`inline-flex items-center gap-1.5 rounded-lg font-bold cursor-pointer whitespace-nowrap ${compact?"px-2 py-1":"px-2.5 py-1.5"}`}
      style={{background:"#FBF3D6",border:"1px solid #F0E3AE",color:"#8A6A08",fontSize:11.5}}>
      <Plus size={11}/>{compact?"إضافية":"رحلة إضافية"}
    </button>
  );
}

function ManageButton({onClick}:{onClick:()=>void}) {
  return (
    <button onClick={e=>{e.stopPropagation();onClick();}}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold cursor-pointer whitespace-nowrap"
      style={{background:B.fill,border:`1px solid ${B.border}`,color:B.text3,fontSize:11.5}}>
      <Settings2 size={11}/>إدارة
    </button>
  );
}

const TH:React.CSSProperties = {padding:"10px 14px",fontWeight:700,textAlign:"right",whiteSpace:"nowrap"};
const TD:React.CSSProperties = {padding:"11px 14px",whiteSpace:"nowrap"};

const COLS = ["التاريخ","اليوم","الباقة","مدينة الانطلاق","السعة","المحجوز","المتبقي","نسبة الإشغال","الحالة","إدارة الرحلة"];

function TripRow({trip,pkgName,city,onOpen,onExtra}:{
  trip:Trip;pkgName:string;city:string;onOpen:()=>void;onExtra?:()=>void;
}) {
  const state=tripBoardState(trip);
  const tone=BOARD_TONE[state];
  const {capacity,booked,available}=seatsOf(trip);
  const pct=occupancy(trip);
  const {date,year}=tableDate(trip.departureDate);
  const dead=state==="cancelled"||state==="archived";
  /* المتبقي هو الرقم الذي يُتّخذ عليه القرار، فيُلوَّن وحده: أخضرُ متّسع،
     وبرتقاليٌّ قارب، وأحمرُ صفر. وما لا قرار عليه — ملغاةٌ أو منتهية —
     يُكتب رمادياً كي لا يَعِد بمقاعدَ لا تُباع. */
  const remainFg = dead ? B.muted : available<=0 ? "#BE2626" : state==="few" ? "#B4530C" : state==="open" ? "#1E7A44" : B.text2;
  return (
    <tr onClick={onOpen} className="trip-row cursor-pointer" style={{borderTop:`1px solid ${B.border}`}}>
      <td style={{...TD,borderInlineStart:`3px solid ${tone.fg}`,fontWeight:800,color:dead?B.muted:B.black,fontFamily:"var(--font-app)"}}>
        {date}{year&&<span style={{color:B.muted,fontWeight:600,fontSize:11}}> {year}</span>}
        {trip.departureTime&&<span className="block" style={{color:B.muted,fontSize:11,fontWeight:600,fontFamily:"inherit"}}>{trip.departureTime}</span>}
      </td>
      <td style={{...TD,color:B.text2,fontWeight:600}}>{dayName(trip.departureDate)}</td>
      <td style={{...TD,whiteSpace:"normal",minWidth:170}}>
        <span className="font-bold" style={{color:dead?B.text2:B.black}}>{pkgName||"—"}</span>
        <span className="block" style={{color:B.muted,fontSize:11,fontFamily:"var(--font-app)"}}>{trip.id}</span>
      </td>
      <td style={{...TD,color:B.text2,fontWeight:600}}>
        <span className="inline-flex items-center gap-1.5"><MapPin size={11} style={{color:B.gold}}/>{city||"—"}</span>
      </td>
      <td style={{...TD,color:B.text2,fontWeight:700}} className="tabular-nums">{capacity}</td>
      <td style={{...TD,color:dead?B.muted:B.black,fontWeight:800}} className="tabular-nums">{booked}</td>
      <td style={{...TD,color:remainFg,fontWeight:800}} className="tabular-nums">{dead?"—":available}</td>
      <td style={TD}><OccupancyBar pct={pct} fg={dead?B.muted:tone.fg}/></td>
      <td style={TD}>
        <StatusBadge status={state} entity="trip"/>
        {/* قائمة الانتظار ليست عموداً — هي تفسيرٌ للحالة: ثلاثةٌ ينتظرون
            على رحلةٍ ممتلئة هي أقوى إشارةٍ إلى إطلاق رحلةٍ أخرى. */}
        {!dead&&trip.waitingSeats>0&&(
          <span className="block mt-1 font-bold" style={{color:"#8A6A08",fontSize:10.5}}>{trip.waitingSeats} في الانتظار</span>
        )}
      </td>
      <td style={{...TD,paddingBlock:8}} className="col-action">
        <div className="flex items-center gap-1.5">
          <ManageButton onClick={onOpen}/>
          {onExtra&&<ExtraTripButton onClick={onExtra}/>}
        </div>
      </td>
    </tr>
  );
}

/* ════════ الجدول ════════
   رأسٌ واحد وأقسامٌ داخله: الأعمدة تبقى على استقامةٍ واحدة عبر الأسابيع،
   وجدولٌ لكل أسبوع كان يكسرها ويكرّر الرأس أربع مرّات. */
function TripsTable({groups,pkgName,cityOf,onOpen,onExtra,mayWrite}:{
  groups:TripGroup[];pkgName:(id:string)=>string;cityOf:(t:Trip)=>string;
  onOpen:(t:Trip)=>void;onExtra:(t:Trip)=>void;mayWrite:boolean;
}) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{background:"#fff",border:`1px solid ${B.border}`}}>
      {/* على الجوال: عمودٌ مثبّت للإجراء وتلميحٌ بأن وراء الحافة بقية. */}
      <div className="tbl-hint items-center gap-1.5 px-4 py-2" style={{background:B.fill,borderBottom:`1px solid ${B.border}`,color:B.muted,fontSize:11}}>
        <ArrowRight size={11}/>مرّر الجدول أفقياً لرؤية بقية الأعمدة
      </div>
      <div className="tbl-scroll">
        <table style={{width:"100%",minWidth:940,borderCollapse:"collapse",fontSize:13}}>
          <thead>
            <tr style={{background:B.cream,color:"#7a7168",fontSize:12}}>
              {COLS.map(h=><th key={h} style={TH} className={h==="إدارة الرحلة"?"col-action":undefined}>{h}</th>)}
            </tr>
          </thead>
          {groups.map(g=>{
            const live=g.trips.filter(t=>t.status!=="cancelled"&&t.status!=="archived");
            const cap=live.reduce((a,t)=>a+seatsOf(t).capacity,0);
            const bk=live.reduce((a,t)=>a+seatsOf(t).booked,0);
            const av=live.reduce((a,t)=>a+seatsOf(t).available,0);
            const fullCount=g.trips.filter(t=>tripBoardState(t)==="full").length;
            return (
              <tbody key={g.key}>
                {/* عنوان الأسبوع صفٌّ في الجدول لا بطاقةً فوقه: القسم يفصل
                    ولا يقطع، فتبقى الأعمدة مقروءةً من أعلى الصفحة إلى أسفلها. */}
                <tr>
                  <td colSpan={COLS.length} style={{background:B.fill,padding:"9px 14px",borderTop:`1px solid ${B.border}`,borderBottom:`1px solid ${B.border}`}}>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-extrabold" style={{color:B.black,fontSize:13}}>{g.label}</span>
                      <span className="px-2 py-0.5 rounded-lg font-bold" style={{background:"#fff",border:`1px solid ${B.border}`,color:B.text2,fontSize:11}}>{g.trips.length} رحلة</span>
                      {cap>0&&<span className="font-semibold" style={{color:B.muted,fontSize:11.5}}>محجوز <b style={{color:B.text2}}>{bk}</b> من {cap} · متبقٍّ <b style={{color:av>0?"#1E7A44":"#BE2626"}}>{av}</b></span>}
                      {fullCount>0&&<span className="inline-flex items-center gap-1 font-bold" style={{color:"#BE2626",fontSize:11.5}}><AlertTriangle size={11}/>{fullCount} ممتلئة</span>}
                    </div>
                  </td>
                </tr>
                {g.trips.map(t=>{
                  const canExtra = mayWrite && tripBoardState(t)==="full";
                  return <TripRow key={t.id} trip={t} pkgName={pkgName(t.packageId)} city={cityOf(t)}
                    onOpen={()=>onOpen(t)} onExtra={canExtra?()=>onExtra(t):undefined}/>;
                })}
              </tbody>
            );
          })}
        </table>
      </div>
    </div>
  );
}

/* ════════ التقويم ════════
   أداةٌ بجانب الجدول لا أساس الصفحة: شهرٌ واحد يُتنقَّل فيه، وضغطُ يومٍ
   يكشف رحلاته كاملةً بجانبه — لا يفتح نافذةً ولا يُغيّر الجدول. */
const AR_WEEK = ["س","ح","ن","ث","ر","خ","ج"];

function MonthGrid({y,m,depMap,spanSet,selected,onPick}:{
  y:number;m:number;depMap:Map<string,Trip[]>;spanSet:Set<string>;selected:string|null;onPick:(ds:string)=>void;
}) {
  const firstCol=(new Date(y,m,1).getDay()+1)%7;
  const daysInMonth=new Date(y,m+1,0).getDate();
  const todayStr=(()=>{const n=new Date();return ymd(n.getFullYear(),n.getMonth(),n.getDate());})();
  const cells:(number|null)[]=[];
  for(let i=0;i<firstCol;i++) cells.push(null);
  for(let d=1;d<=daysInMonth;d++) cells.push(d);
  return (
    <div className="grid grid-cols-7 gap-1">
      {AR_WEEK.map((w,i)=><div key={"w"+i} className="text-center pb-1" style={{fontSize:10,color:B.muted,fontWeight:700}}>{w}</div>)}
      {cells.map((d,i)=>{
        if(d===null) return <div key={"e"+i} style={{height:40}}/>;
        const ds=ymd(y,m,d);
        const deps=depMap.get(ds);
        const isSel=selected===ds;
        const isToday=ds===todayStr;
        const ring=isSel?{outline:`2px solid ${B.gold}`,outlineOffset:2}:isToday?{outline:`1.5px dashed ${B.gold}`,outlineOffset:1}:{};
        if(deps&&deps.length){
          const states=deps.map(t=>tripBoardState(t));
          const col=dayColor(deps);
          const sellable=states.some(s=>s==="open"||s==="few");
          const remaining=deps.reduce((a,t)=>{const s=tripBoardState(t);return a+(s==="open"||s==="few"?seatsOf(t).available:0);},0);
          const tail=states.includes("full")?"ممتلئ":states.includes("running")?"جارية":states.includes("ended")?"انتهت":states.includes("closed")?"مغلقة":"ملغاة";
          return (
            <button key={"d"+i} onClick={()=>onPick(ds)} aria-pressed={isSel}
              title={`${deps.length} رحلة يوم ${d} ${AR_MONTHS[m]}`}
              className="relative flex flex-col items-center justify-center rounded-lg cursor-pointer leading-none gap-0.5"
              style={{height:40,background:col,color:"#fff",border:"none",...ring}}>
              <span style={{fontSize:12,fontWeight:800}}>{d}</span>
              <span style={{fontSize:7.5,fontWeight:700,opacity:0.95}}>{sellable?`${remaining} مقعد`:tail}</span>
              {deps.length>1&&<span className="absolute flex items-center justify-center rounded-full"
                style={{top:-4,insetInlineStart:-4,width:14,height:14,fontSize:8.5,fontWeight:800,background:B.gold,color:B.black,border:"1px solid #fff"}}>{deps.length}</span>}
            </button>
          );
        }
        const inSpan=spanSet.has(ds);
        return (
          <button key={"d"+i} onClick={()=>onPick(ds)} aria-pressed={isSel}
            className="flex items-center justify-center rounded-lg cursor-pointer"
            style={{height:40,fontSize:11,fontWeight:inSpan?700:500,background:inSpan?"rgba(192,134,44,0.12)":"transparent",
              color:inSpan?"#8a6a08":B.text2,border:"none",...ring}}>{d}</button>
        );
      })}
    </div>
  );
}

/* صفّ اليوم — ما يحتاجه القرار على سطرٍ واحد: متى، من أين، أيّ باقة،
   كم بيع وكم بقي، وما الحالة. */
function DayTripRow({trip,pkgName,city,onOpen,onExtra}:{
  trip:Trip;pkgName:string;city:string;onOpen:()=>void;onExtra?:()=>void;
}) {
  const state=tripBoardState(trip);
  const tone=BOARD_TONE[state];
  const {capacity,booked,available}=seatsOf(trip);
  const dead=state==="cancelled"||state==="archived";
  return (
    <div onClick={onOpen} className="day-row rounded-xl px-3 py-2.5 flex items-center gap-3 flex-wrap cursor-pointer"
      style={{border:`1px solid ${B.border}`,borderInlineStart:`3px solid ${tone.fg}`}}>
      <span className="inline-flex items-center gap-1 font-extrabold tabular-nums" style={{color:B.black,fontSize:12.5,fontFamily:"var(--font-app)",minWidth:54}}>
        <Clock size={11} style={{color:B.gold}}/>{trip.departureTime||"—"}
      </span>
      <span className="inline-flex items-center gap-1 font-bold" style={{color:B.text2,fontSize:12}}>
        <MapPin size={11} style={{color:B.gold}}/>{city||"—"}
      </span>
      <span className="font-bold flex-1" style={{color:dead?B.text2:B.black,fontSize:12.5,minWidth:120}}>{pkgName||trip.id}</span>
      <span className="font-bold tabular-nums" style={{color:B.text2,fontSize:12}}>
        {booked}/{capacity} · متبقٍّ <b style={{color:dead?B.muted:available<=0?"#BE2626":state==="few"?"#B4530C":"#1E7A44"}}>{dead?"—":available}</b>
      </span>
      <OccupancyBar pct={occupancy(trip)} fg={dead?B.muted:tone.fg}/>
      <StatusBadge status={state} entity="trip"/>
      <div className="flex items-center gap-1.5 ms-auto">
        <ManageButton onClick={onOpen}/>
        {onExtra&&<ExtraTripButton onClick={onExtra} compact/>}
      </div>
    </div>
  );
}

function TripCalendar({trips,horizon,pkgName,cityOf,selected,onSelect,onOpen,onExtra,onLaunchOn,mayWrite}:{
  trips:Trip[];horizon:Horizon;pkgName:(id:string)=>string;cityOf:(t:Trip)=>string;
  selected:string|null;onSelect:(ds:string|null)=>void;onOpen:(t:Trip)=>void;onExtra:(t:Trip)=>void;
  onLaunchOn:(ds:string)=>void;mayWrite:boolean;
}) {
  const [open,setOpen]=useState(true);
  /* المرساة تتبع الفترة: القادمة تفتح على شهر أقرب رحلة، والماضية على
     شهر آخر رحلةٍ انتهت. تقويمٌ يفتح على شهرٍ لا رحلات فيه لا يُقرأ. */
  const anchor=(()=>{
    if(horizon==="upcoming") return calendarAnchor(trips);
    const last=[...trips].map(t=>tripDeparture(t)).filter(Boolean).sort((a,b)=>b!.getTime()-a!.getTime())[0];
    const n=new Date();
    return last?{y:last.getFullYear(),m:last.getMonth()}:{y:n.getFullYear(),m:n.getMonth()};
  })();
  const [cur,setCur]=useState(anchor);
  const shift=(d:number)=>setCur(c=>{let m=c.m+d,y=c.y; while(m>11){m-=12;y++;} while(m<0){m+=12;y--;} return {y,m};});
  /* اختيارٌ من خارج الشهر المعروض — من مرشّح التاريخ غالباً — يجرّ الشهر
     إليه: يومٌ محدَّدٌ في لوحٍ وشبكةٌ تعرض شهراً آخر قراءتان متناقضتان. */
  useEffect(()=>{
    if(!selected) return;
    const p=parseYMD(selected);
    if(p&&(p.y!==cur.y||p.m!==cur.m)) setCur({y:p.y,m:p.m});
  },[selected]);

  const depMap=new Map<string,Trip[]>();
  const spanSet=new Set<string>();
  trips.forEach(t=>{
    const dp=parseYMD(t.departureDate); if(!dp) return;
    const arr=depMap.get(t.departureDate)||[]; arr.push(t); depMap.set(t.departureDate,arr);
    const rt=parseYMD(t.returnDate);
    const start=new Date(dp.y,dp.m,dp.d);
    const end=rt?new Date(rt.y,rt.m,rt.d):start;
    for(let c=new Date(start);c<=end;c.setDate(c.getDate()+1)) spanSet.add(ymd(c.getFullYear(),c.getMonth(),c.getDate()));
  });
  depMap.forEach(list=>list.sort((a,b)=>(a.departureTime||"").localeCompare(b.departureTime||"")));

  /* لوحٌ فارغٌ ينتظر ضغطةً هدرٌ لمساحةٍ ووقت. بلا اختيارٍ صريح يفتح على
     أقرب يومٍ فيه رحلات — أوّل ما يُسأل عنه عند الدخول أصلاً. والاختيار
     الصريح يعلوه، وتفريغُه يعيد الافتراض لا الفراغ. */
  const inCurMonth=(ds:string)=>{ const p=parseYMD(ds); return !!p&&p.y===cur.y&&p.m===cur.m; };
  const autoDay=(()=>{
    const days=[...depMap.keys()].filter(inCurMonth).sort();
    return horizon==="past" ? days[days.length-1] ?? null : days[0] ?? null;
  })();
  /* اليوم المعروض يبقى داخل الشهر المعروض دائماً: تصفّحُ شهرٍ آخر يُظهر
     أقرب يومٍ فيه، لا رحلاتِ شهرٍ غادرناه. */
  const sel = selected && inCurMonth(selected) ? selected : autoDay;
  const dayTrips=sel?(depMap.get(sel)??[]):[];
  /* الإطلاق على يومٍ مضى لا معنى له — والتقويم يعرض أوائل الشهر الحالي
     وهي أيامٌ مضت. الشرط على السلسلة مباشرةً: YYYY-MM-DD تُقارن معجمياً. */
  const todayStr=(()=>{const n=new Date();return ymd(n.getFullYear(),n.getMonth(),n.getDate());})();
  const canLaunchOn = mayWrite && horizon==="upcoming" && !!sel && sel>=todayStr;
  const monthCount=[...depMap.entries()].filter(([ds])=>{const p=parseYMD(ds);return p&&p.y===cur.y&&p.m===cur.m;}).reduce((a,[,l])=>a+l.length,0);

  return (
    <div className="rounded-2xl overflow-hidden" style={{background:"#fff",border:`1px solid ${B.border}`}}>
      <button onClick={()=>setOpen(v=>!v)} aria-expanded={open}
        className="w-full flex items-center gap-3 px-5 py-3.5 cursor-pointer text-right"
        style={{background:B.fill,border:"none",borderBottom:open?`1px solid ${B.border}`:"none"}}>
        <CalendarDays size={15} style={{color:B.gold,flexShrink:0}}/>
        <span className="font-extrabold" style={{color:B.black,fontSize:13.5}}>التقويم</span>
        <span className="font-semibold" style={{color:B.muted,fontSize:11.5}}>اضغط أيّ يوم لعرض رحلاته</span>
        <span className="ms-auto flex items-center gap-2">
          {open?<ChevronUp size={15} style={{color:B.muted}}/>:<ChevronDown size={15} style={{color:B.muted}}/>}
        </span>
      </button>
      <AnimatePresence initial={false}>{open&&(
        <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}} className="overflow-hidden">
          <div className="p-4 grid gap-4 md:grid-cols-[300px_minmax(0,1fr)]">
              {/* الشبكة */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <button onClick={()=>shift(-1)} aria-label="الشهر السابق" title="الشهر السابق"
                    className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer" style={{background:B.fill,border:`1px solid ${B.border}`,color:B.text2}}><ChevronRight size={14}/></button>
                  <div className="text-center">
                    <div className="font-extrabold" style={{color:B.black,fontSize:13}}>{AR_MONTHS[cur.m]} {cur.y}</div>
                    <div style={{fontSize:10.5,color:B.muted,fontWeight:600}}>{monthCount?`${monthCount} رحلة`:"لا رحلات"}</div>
                  </div>
                  <button onClick={()=>shift(1)} aria-label="الشهر التالي" title="الشهر التالي"
                    className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer" style={{background:B.fill,border:`1px solid ${B.border}`,color:B.text2}}><ChevronLeft size={14}/></button>
                </div>
                <MonthGrid y={cur.y} m={cur.m} depMap={depMap} spanSet={spanSet} selected={sel} onPick={onSelect}/>
              </div>
              {/* لوح اليوم — بجانب الشبكة مباشرةً */}
              <div className="rounded-xl p-3 flex flex-col gap-2 min-w-0" style={{background:B.bg,border:`1px solid ${B.border}`}}>
                {!sel
                  ? <div className="flex-1 flex flex-col items-center justify-center text-center py-8 gap-2">
                      <CalendarDays size={26} style={{color:B.gold,opacity:0.35}}/>
                      <span className="font-bold" style={{color:B.text2,fontSize:12.5}}>لا رحلات في {AR_MONTHS[cur.m]}</span>
                      <span style={{color:B.muted,fontSize:11.5}}>اضغط أيّ يوم في التقويم لعرض رحلاته.</span>
                    </div>
                  : <>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold" style={{color:B.black,fontSize:13}}>
                          رحلات {dayName(sel)} {tableDate(sel).date}
                        </span>
                        <span className="px-2 py-0.5 rounded-lg font-bold" style={{background:"#fff",border:`1px solid ${B.border}`,color:B.text2,fontSize:11}}>{dayTrips.length}</span>
                        {!selected&&<span className="font-semibold" style={{color:B.muted,fontSize:10.5}}>أقرب يومٍ فيه رحلات</span>}
                      </div>
                      {dayTrips.length===0
                        ? <div className="flex-1 flex flex-col items-center justify-center text-center py-7 gap-2.5">
                            <span style={{color:B.muted,fontSize:12}}>لا رحلات في هذا اليوم.</span>
                            {canLaunchOn&&(
                              <button onClick={()=>onLaunchOn(sel)} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold cursor-pointer"
                                style={{background:B.gold,color:B.black,border:"none",fontSize:12}}><Plus size={12}/>إطلاق رحلة في هذا اليوم</button>
                            )}
                          </div>
                        : <div className="flex flex-col gap-2">
                            {dayTrips.map(t=>(
                              <DayTripRow key={t.id} trip={t} pkgName={pkgName(t.packageId)} city={cityOf(t)}
                                onOpen={()=>onOpen(t)}
                                onExtra={mayWrite&&tripBoardState(t)==="full"?()=>onExtra(t):undefined}/>
                            ))}
                            {/* اليوم الذي امتلأت رحلاته كلها هو اليوم الذي يُطلق فيه غيرها. */}
                            {canLaunchOn&&dayTrips.every(t=>{const s=tripBoardState(t);return s==="full"||s==="closed";})&&(
                              <button onClick={()=>onLaunchOn(sel)} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl font-bold cursor-pointer"
                                style={{background:"#fff",color:"#8A6A08",border:`1px dashed ${B.gold}`,fontSize:11.5}}><Plus size={11}/>إطلاق رحلة أخرى في هذا اليوم</button>
                            )}
                          </div>}
                    </>}
              </div>
          </div>
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
  /* الفترة محورُ الصفحة كلها: الجدول والتقويم والإحصاءات تتبعها معاً.
     كان الماضي يُعرض مطويّاً أسفل القادم، فيختلط الزمنان في شاشةٍ واحدة. */
  const [horizon,setHorizon]=useState<Horizon>("upcoming");
  const [stateFilter,setStateFilter]=useState<"all"|TripBoardState>("all");
  const [pkgFilter,setPkgFilter]=useState("all");
  const [cityFilter,setCityFilter]=useState("all");
  const [dateFilter,setDateFilter]=useState("");
  const [dateFilterOpen,setDateFilterOpen]=useState(false);
  const [picked,setPicked]=useState<string|null>(null);
  const [showLaunch,setShowLaunch]=useState(false);
  const [launchPkgId,setLaunchPkgId]=useState<string|undefined>(undefined);
  const [launchDate,setLaunchDate]=useState<string|undefined>(undefined);
  const [baseTrip,setBaseTrip]=useState<Trip|undefined>(undefined);
  const [detailId,setDetailId]=useState<string|null>(null);
  const [editId,setEditId]=useState<string|null>(null);
  /* لوح المتابعة بعد الإلغاء: يحمل الأثر كما حُسب لحظة الإلغاء — الحجوزات
     لا تتغيّر بإلغاء الرحلة، والتذاكر تُلغى في القاعدة فلا يُعاد حسابها. */
  const [followUp,setFollowUp]=useState<{trip:Trip;reason:string;impact:CancelImpact}|null>(null);

  const pkgName=(id:string)=>packages.find(p=>p.id===id)?.name??"—";
  const hotelName=(id:string)=>hotels.find(h=>h.id===id)?.name??"";
  const transportName=(id:string)=>{ const t=transports.find(x=>x.id===id); return t?`${t.name}${t.plate?` — ${t.plate}`:""}`:""; };
  const branchOf=(id:string)=>branches.find(b=>b.id===id);
  /* المدينة من لقطة الرحلة، وتُستكمل من الفرع للرحلات التي سبقت العمود. */
  const cityOf=(t:Trip)=>t.departureCity||branchOf(t.branchId)?.city||"";
  /* رحلة المحطات المتعددة تظهر تحت كل مدينة يمر عليها الباص، لا تحت
     أول محطة فقط. عنوان الجدول يبقى مدينة البداية (cityOf). */
  const citiesOf=(t:Trip)=>t.departureStops?.length
    ? [...new Set(t.departureStops.map(s=>s.city.trim()).filter(Boolean))]
    : [cityOf(t)].filter(Boolean);

  function toggleStatus(id:string){ setTrips(p=>p.map(t=>t.id===id?{...t,status:t.status==="full"?"open":"full"}:t)); }
  function cancelTrip(trip:Trip,reason:string){
    const impact=cancelImpact(trip,bookings,tickets);
    const at=new Date().toISOString();
    setTrips(p=>p.map(t=>t.id===trip.id?{...t,status:"cancelled",cancelReason:reason,cancelledAt:at}:t));
    setFollowUp({trip:{...trip,status:"cancelled",cancelReason:reason,cancelledAt:at},reason,impact});
  }
  function handleSaveNew(t:Trip){ closeLaunch(); setTrips(p=>[t,...p]); toast.success("أُطلقت الرحلة",{description:`${pkgName(t.packageId)} · ${shortDate(t.departureDate)}`}); }
  function handleSaveEdit(t:Trip){ setTrips(p=>p.map(x=>x.id===t.id?t:x)); setEditId(null); toast.success("حُفظت تعديلات الرحلة"); }

  function closeLaunch(){ setShowLaunch(false); setLaunchPkgId(undefined); setLaunchDate(undefined); setBaseTrip(undefined); }
  /* مرشّح الباقة يسبق النموذج: مَن رشّح «عمرة ٣ أيام» ثم ضغط «إطلاق
     رحلة» يريدها لتلك الباقة — لا لقائمةٍ يعيد الاختيار منها. */
  function launchBlank(){ closeLaunch(); setLaunchPkgId(pkgFilter!=="all"?pkgFilter:undefined); setShowLaunch(true); }
  function launchOn(ds:string){ closeLaunch(); setLaunchDate(ds); setShowLaunch(true); }
  /* الرحلة الإضافية تُبنى على رحلةٍ قائمة: نفس الباقة واليوم والمدينة
     ونقطة الانطلاق والوقت. المركبة وحدها تُترك فارغة — حافلةٌ واحدة لا
     تكون في رحلتَين في اليوم نفسه، واختيارُ غيرها هو القرار الوحيد
     الباقي على الموظف. */
  function launchExtra(t:Trip){ closeLaunch(); setBaseTrip(t); setShowLaunch(true); }

  const {upcoming,past}=splitByHorizon(trips);
  const periodTrips = horizon==="past" ? past : upcoming;

  const cities=[...new Set(trips.flatMap(citiesOf))].sort((a,b)=>a.localeCompare(b,"ar"));

  /* المرشّحات على الحالة المعروضة لا المخزّنة: «ممتلئة» لا تُرجع رحلةً
     أُوقف حجزها وفيها مقاعد، و«مفتوحة» لا تُرجع رحلةً انطلقت أمس. */
  const matches=(t:Trip)=>
    (stateFilter==="all"||tripBoardState(t)===stateFilter)&&
    (pkgFilter==="all"||t.packageId===pkgFilter)&&
    (cityFilter==="all"||citiesOf(t).includes(cityFilter))&&
    (!query||t.id.toLowerCase().includes(query.toLowerCase())||pkgName(t.packageId).includes(query)||citiesOf(t).some(city=>city.includes(query))||t.departurePoint.includes(query)||(t.busPlate||"").includes(query));

  /* التقويم يقرأ كل ما بقي بعد المرشّحات عدا التاريخ: تحديدُ يومٍ يضيّق
     الجدول ولا يُفرغ الشهر الذي يُقرأ منه التوزيع. */
  const calendarTrips=periodTrips.filter(matches);
  const filtered=calendarTrips.filter(t=>!dateFilter||t.departureDate===dateFilter);
  const groups=groupByWeek(filtered,horizon);

  const totals=(()=>{
    const live=periodTrips.filter(t=>t.status!=="cancelled"&&t.status!=="archived");
    const capacity=live.reduce((a,t)=>a+seatsOf(t).capacity,0);
    const booked=live.reduce((a,t)=>a+seatsOf(t).booked,0);
    const available=live.reduce((a,t)=>a+seatsOf(t).available,0);
    const by=(s:TripBoardState)=>periodTrips.filter(t=>tripBoardState(t)===s).length;
    /* العدّ على القائم لا على السجل: رحلةٌ ألغيت ليست «قادمة» ولا
       «منتهية» — لها بطاقتها في الفترة الماضية ولا تُحشر في غيرها. */
    return {count:live.length,capacity,booked,available,
      pct:capacity>0?Math.round((booked/capacity)*100):0,
      open:by("open"),few:by("few"),full:by("full"),closed:by("closed"),cancelled:by("cancelled")+by("archived")};
  })();
  const soon=nextTrip(periodTrips);

  const filtersOn = stateFilter!=="all"||pkgFilter!=="all"||cityFilter!=="all"||!!dateFilter||!!query;
  function clearFilters(){ setStateFilter("all"); setPkgFilter("all"); setCityFilter("all"); setDateFilter(""); setSearch(""); }
  /* تبديل الفترة يُفرِّغ ما لا معنى له فيها: يومٌ اختير من شهرٍ آخر،
     وحالةٌ لا تُعرض هنا أصلاً — «ممتلئة» في الماضي مرشّحٌ لا يُرجع شيئاً
     ويبدو الجدول فارغاً بلا سبب. */
  function switchHorizon(h:Horizon){ setHorizon(h); setPicked(null); setDateFilter(""); setStateFilter("all"); }

  const detailTrip = detailId ? trips.find(t=>t.id===detailId) : undefined;
  const editTrip = editId ? trips.find(t=>t.id===editId) : undefined;

  const STATE_OPTS:{value:string;label:string}[] = horizon==="past"
    ? [{value:"all",label:"كل الحالات"},{value:"ended",label:"منتهية"},{value:"cancelled",label:"ملغاة"}]
    : [{value:"all",label:"كل الحالات"},{value:"open",label:"مفتوحة"},{value:"few",label:"متبقٍ قليل"},
       {value:"full",label:"ممتلئة"},{value:"closed",label:"مغلقة"},{value:"running",label:"جارية الآن"},{value:"cancelled",label:"ملغاة"}];

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{background: B.bg}}>
      <PageHeader title="الرحلات" crumb={horizon==="past"?"الرحلات الماضية":"جدول التشغيل"} search={search} onSearch={setSearch} onMenuOpen={onMenuOpen}/>
      <div className="px-4 md:px-8 pt-4 md:pt-5">
        {/* شريط الفترة — انتقالٌ مستقل لا قسمٌ مطويّ داخل الصفحة. */}
        {horizon==="past"&&(
          <div className="flex items-center gap-3 flex-wrap rounded-2xl px-4 py-3 mb-4" style={{background:B.fill,border:`1px dashed ${B.border}`}}>
            <button onClick={()=>switchHorizon("upcoming")} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold cursor-pointer"
              style={{background:"#fff",border:`1px solid ${B.border}`,color:B.black,fontSize:12.5}}>
              <ArrowRight size={13}/>العودة إلى الرحلات القادمة
            </button>
            <span className="font-semibold" style={{color:B.text2,fontSize:12}}>
              تستعرض الآن <b style={{color:B.black}}>الفترة الماضية</b> — الجدول والتقويم كلاهما على ما مضى.
            </span>
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {horizon==="past" ? <>
            <StatCard label="رحلات منتهية" value={totals.count} sub="خرجت من التشغيل" accent/>
            <StatCard label="مسافرون" value={totals.booked} sub={`من سعة ${totals.capacity}`}/>
            <StatCard label="نسبة الإشغال" value={`${totals.pct}%`} sub="على الفترة كلها"/>
            <StatCard label="مقاعد لم تُبَع" value={totals.available} sub="فرصٌ فائتة"/>
            <StatCard label="ملغاة" value={totals.cancelled} sub="لا تُحتسب في الإشغال"/>
          </> : <>
            <StatCard label="رحلات قادمة" value={totals.count} sub={soon?`أقرب رحلة ${shortDate(soon.departureDate)} · ${untilLabel(soon)}`:"لا رحلات قادمة"} accent/>
            <StatCard label="تقبل الحجز" value={totals.open+totals.few} sub={totals.few?`منها ${totals.few} قاربت الامتلاء`:"مقاعدها متاحة"}/>
            <StatCard label="ممتلئة" value={totals.full} sub={totals.full?"تحتاج رحلةً إضافية":"لا رحلة مكتملة"}/>
            <StatCard label="مقاعد متاحة" value={totals.available} sub={`من سعة ${totals.capacity}`}/>
            <StatCard label="نسبة الإشغال" value={`${totals.pct}%`} sub={`محجوز ${totals.booked} مقعداً`}/>
          </>}
        </div>
        {/* المرشّحات — خمسةٌ لا أكثر: البحث في الترويسة، وهذه الأربعة هنا. */}
        <div className="flex items-end gap-2.5 mt-5 flex-wrap">
          <div style={{minWidth:170,flex:"1 1 170px",maxWidth:230}}>
            <label className="block mb-1 font-bold" style={{fontSize:11,color:B.muted}}>الباقة</label>
            <AppSelect value={pkgFilter} onChange={setPkgFilter} ariaLabel="تصفية بالباقة"
              options={[{value:"all",label:"كل الباقات"},...packages.map(p=>({value:p.id,label:p.name}))]}/>
          </div>
          <div style={{minWidth:150,flex:"1 1 150px",maxWidth:200}}>
            <label className="block mb-1 font-bold" style={{fontSize:11,color:B.muted}}>مدينة الانطلاق</label>
            <AppSelect value={cityFilter} onChange={setCityFilter} ariaLabel="تصفية بمدينة الانطلاق"
              options={[{value:"all",label:"كل المدن"},...cities.map(c=>({value:c,label:c}))]}/>
          </div>
          <div style={{minWidth:150,flex:"1 1 150px",maxWidth:200}}>
            <label className="block mb-1 font-bold" style={{fontSize:11,color:B.muted}}>الحالة</label>
            <AppSelect value={stateFilter} onChange={v=>setStateFilter(v as "all"|TripBoardState)} ariaLabel="تصفية بالحالة" options={STATE_OPTS}/>
          </div>
          <div style={{minWidth:160,flex:"1 1 160px",maxWidth:200}}>
            <label className="block mb-1 font-bold" style={{fontSize:11,color:B.muted}}>التاريخ</label>
            <button onClick={()=>setDateFilterOpen(true)} className="w-full h-[42px] px-3.5 rounded-xl flex items-center justify-between text-sm cursor-pointer" style={{background:"#fff",border:`1px solid ${dateFilter?B.gold:B.border}`,color:dateFilter?B.black:B.muted,fontFamily:"inherit"}}>
              <span>{dateFilter ? `${dayName(dateFilter)} · ${shortDate(dateFilter)}` : "كل التواريخ"}</span><CalendarDays size={15} style={{color:dateFilter?B.gold:B.muted}}/>
            </button>
          </div>
          {filtersOn&&(
            <button onClick={clearFilters} className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl font-bold cursor-pointer"
              style={{background:"#fff",border:`1px solid ${B.border}`,color:B.text2,fontSize:12,height:42}}><X size={12}/>تفريغ</button>
          )}
          <div className="flex items-center gap-2.5 ms-auto" style={{paddingBottom:1}}>
            <span style={{fontSize:12.5,color:B.muted}}>معروض <b style={{color:B.black}}>{filtered.length}</b> من {periodTrips.length}</span>
            {horizon==="upcoming"&&(
              <button onClick={()=>switchHorizon("past")} className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl font-bold cursor-pointer"
                style={{background:"#fff",border:`1px solid ${B.border}`,color:B.text2,fontSize:12.5}}>
                <History size={13}/>الرحلات الماضية
                {past.length>0&&<span className="px-1.5 rounded-md" style={{background:B.fill,color:B.muted,fontSize:11}}>{past.length}</span>}
              </button>
            )}
            {mayWrite&&horizon==="upcoming"&&<button onClick={launchBlank} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer"
              style={{background:B.gold,color:B.black,border:"none",boxShadow:"0 4px 12px rgba(192,134,44,0.35)"}}>
              <Plus size={15}/>إطلاق رحلة
            </button>}
          </div>
        </div>
        <div className="mt-5" style={{height:1,background:B.border}}/>
      </div>
      <main className="flex-1 px-4 md:px-8 pb-12 pt-5 flex flex-col gap-4">
        <EntityGate entity="trips" label="الرحلات" skeleton="table" cols={10} rows={8}>
          <TripCalendar key={horizon} trips={calendarTrips} horizon={horizon} pkgName={pkgName} cityOf={cityOf}
            selected={picked} onSelect={setPicked} onOpen={t=>setDetailId(t.id)} onExtra={launchExtra}
            onLaunchOn={launchOn} mayWrite={mayWrite}/>
          {groups.length>0
            ? <TripsTable groups={groups} pkgName={pkgName} cityOf={cityOf}
                onOpen={t=>setDetailId(t.id)} onExtra={launchExtra} mayWrite={mayWrite}/>
            : <div className="flex flex-col items-center justify-center py-20 rounded-2xl gap-2" style={{background:"#fff",border:`1px solid ${B.border}`}}>
                <Plane size={40} style={{opacity:0.2,color:B.gold,marginBottom:4}}/>
                <p className="font-bold" style={{color:B.black}}>
                  {filtersOn?"لا رحلات مطابقة للمرشّحات":horizon==="past"?"لا رحلات ماضية في السجل":"لا رحلات قادمة"}
                </p>
                {filtersOn
                  ? <button onClick={clearFilters} className="px-4 py-2 rounded-xl font-bold cursor-pointer" style={{background:B.fill,border:`1px solid ${B.border}`,color:B.text2,fontSize:12.5}}>تفريغ المرشّحات</button>
                  : mayWrite&&horizon==="upcoming"&&<button onClick={launchBlank} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer" style={{background:B.gold,color:B.black,border:"none"}}><Plus size={14}/>إطلاق رحلة</button>}
              </div>}
        </EntityGate>
      </main>
      <AnimatePresence>
        {dateFilterOpen&&<TripDateFilterModal value={dateFilter} onChoose={v=>{setDateFilter(v);setPicked(v);}} onClear={()=>{setDateFilter("");setPicked(null);}} onClose={()=>setDateFilterOpen(false)}/>} 
        {detailTrip&&(
          <TripDetailsModal trip={detailTrip} pkgName={pkgName(detailTrip.packageId)} hotelName={hotelName(detailTrip.hotelId)}
            transportName={transportName(detailTrip.transportId)} branch={branchOf(detailTrip.branchId)}
            impact={cancelImpact(detailTrip,bookings,tickets)} canEdit={mayWrite}
            onEdit={()=>{setDetailId(null);setEditId(detailTrip.id);}}
            onExtra={()=>{setDetailId(null);launchExtra(detailTrip);}}
            onToggleStatus={()=>toggleStatus(detailTrip.id)} onCancel={r=>cancelTrip(detailTrip,r)} onClose={()=>setDetailId(null)}/>
        )}
        {showLaunch&&(
          <TripFormModal key={baseTrip?.id??launchDate??launchPkgId??"blank"}
            mode="launch" packages={packages} branches={branches}
            prefillPkgId={launchPkgId} prefillDate={launchDate} baseTrip={baseTrip}
            onSave={handleSaveNew} onClose={closeLaunch}/>
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
