import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Armchair, Car, Pencil, Trash2, Archive, X, Plus, Wrench, AlertTriangle,
  ImagePlus, Film, Star, ChevronUp, ChevronDown, Check, Bus,
} from "lucide-react";
import { B } from "@/lib/theme";
import { SAR, sarNumber } from "@/lib/money";
import { useDebounced } from "@/lib/useDebounced";
import { EntityGate } from "@/components/States";
import { TabStrip } from "@/components/Tabs";
import type { VehicleMode, VehicleStatus, MediaKind, HotelMedia, TransportFeature, TransportReview, Transport } from "@/types";
import { uid, newId} from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";
import { StatCard } from "@/components/StatCard";
import { PageHeader } from "@/components/PageHeader";
import { AppSelect } from "@/components/AppSelect";
import { DeleteDialog } from "@/components/DeleteDialog";
import { EntityActions } from "@/components/EntityActions";
import { useStore, writeLocalOnly } from "@/store/useStore";
import { transportReadiness, gapsByTab, notExpired, isOperational, type TrTab } from "./readiness";
import { isLive } from "@/lib/trip";
import { setArchiveReason, permanentlyDelete } from "@/data/repository";
import { useRole } from "@/lib/useRole";
import { toast } from "sonner";
import { Field } from "@/components/Field";
import { NumericInput } from "@/components/NumericInput";
import { onPickMedia } from "@/lib/mediaUpload";

/* ─── Transport Card Hero ─── */
function TransportHero({mode,vehicleType,status,seats,cover}:{mode:VehicleMode;vehicleType:string;status:VehicleStatus;seats:number;cover?:string}) {
  const isBus = mode==="bus";
  return (
    <div className="relative overflow-hidden" style={{height:156,background:B.primaryDeep}}>
      {cover&&<><img src={cover} alt="" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}/>
        <div className="absolute inset-0" style={{background:"linear-gradient(180deg,rgba(14,12,11,0.15) 0%,rgba(14,12,11,0.55) 100%)"}}/></>}
      {/* Geometric pattern — road lines for bus, stars for flight */}
      {!cover&&(isBus
        ? <div className="absolute inset-0" style={{backgroundImage:`repeating-linear-gradient(to bottom,transparent 0px,transparent 18px,rgba(192,134,44,0.06) 18px,rgba(192,134,44,0.06) 20px)`,backgroundSize:"100% 40px"}}>
            <div style={{position:"absolute",inset:0,background:"linear-gradient(160deg,rgba(25,20,10,0.7) 0%,rgba(14,12,11,0.95) 60%)"}}/>
          </div>
        : <div className="absolute inset-0">
            {Array.from({length:24},(_,i)=>(
              <div key={i} className="absolute rounded-full" style={{width:i%3===0?3:2,height:i%3===0?3:2,background:"rgba(192,134,44,0.25)",top:`${Math.sin(i*1.7)*40+50}%`,left:`${(i/24)*100}%`}}/>
            ))}
            <div style={{position:"absolute",inset:0,background:"linear-gradient(135deg,rgba(0,20,40,0.8) 0%,rgba(14,12,11,0.95) 65%)"}}/>
          </div>
      )}
      {/* Top gold strip */}
      <div className="absolute top-0 inset-x-0" style={{height:3,background:`linear-gradient(90deg,${B.gold},${B.gold2},${B.gold})`}}/>
      {/* Central icon (hidden when cover present) */}
      {!cover&&<div className="absolute inset-0 flex items-center justify-center" style={{userSelect:"none"}}>
        <span style={{fontSize:72,opacity:0.12,filter:"grayscale(30%)"}}>{isBus?"🚌":"✈️"}</span>
      </div>}
      {/* Status + type badges */}
      <div className="absolute top-3 right-3 flex items-center gap-2">
        <StatusBadge status={status} entity="transport"/>
      </div>
      <div className="absolute top-3 left-3">
        <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{background:"rgba(14,12,11,0.7)",color:B.cream,border:"1px solid rgba(255,255,255,0.08)"}}>
          {isBus?"🚌":"✈️"} {vehicleType}
        </span>
      </div>
      {/* Seats count at bottom */}
      <div className="absolute bottom-0 inset-x-0 flex items-end justify-between px-4 pb-3">
        <div className="flex items-center gap-1.5">
          <Armchair size={13} style={{color:B.gold}}/>
          <span className="text-xs font-bold" style={{color:"rgba(192,134,44,0.9)"}}>{seats} مقعد</span>
        </div>
        <span className="text-xs font-semibold" style={{color:"rgba(240,230,204,0.45)"}}>
          {isBus?"حافلة":"طيران"}
        </span>
      </div>
    </div>
  );
}

/* ─── Transport Card ─── */
/* «بطاقة المواصلة فيها تعديل فقط» — ملاحظة الفريق. والإجراءات الأربعة
   موجودة في EntityActions منذ بُنيت للفنادق، وحرّاسها في القاعدة أقدم.
   الناقص كان استدعاءها هنا. */
function TransportCard({tr,onEdit,canWrite,isAdmin,onToggleActive,onArchive,onDelete,deleteBlockers}:{
  tr:Transport;onEdit:()=>void;canWrite:boolean;isAdmin:boolean;
  onToggleActive:(next:boolean)=>void;onArchive:(reason:string)=>void;
  onDelete:(reason:string)=>Promise<void>|void;deleteBlockers:string[];
}) {
  const isVIP = tr.vehicleType.includes("VIP");
  return (
    <motion.div layout initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} exit={{opacity:0,scale:0.95}}
      whileHover={{y:-4}} transition={{duration:0.2}}
      className="rounded-2xl overflow-hidden flex flex-col"
      style={{background:"#fff",border:`1px solid ${isVIP?"rgba(192,134,44,0.4)":B.border}`,boxShadow:isVIP?"0 4px 20px -8px rgba(192,134,44,0.2)":"0 2px 12px -4px rgba(21,76,72,0.08)"}}>
      <TransportHero mode={tr.mode} vehicleType={tr.vehicleType} status={tr.status} seats={tr.seats}
        cover={tr.media?.find(m=>m.primary&&m.kind==="image")?.url||tr.media?.find(m=>m.kind==="image")?.url}/>
      <div className="flex flex-col flex-1 px-5 pt-4 pb-4 gap-3">
        {/* Name + ID */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-extrabold leading-snug" style={{color:B.black,fontSize:15,fontFamily:"var(--font-app)"}}>{tr.name}</h3>
            <div className="flex items-center gap-1.5 mt-1 text-xs" style={{color:B.text2}}>
              <Car size={11} style={{color:B.gold}}/>
              <span>{tr.model}</span>
              <span style={{color:B.border}}>·</span>
              <span>{tr.year}</span>
            </div>
          </div>
          <span className="text-xs font-mono flex-shrink-0 px-2 py-0.5 rounded-lg mt-0.5"
            style={{background:B.bg,color:B.muted,border:`1px solid ${B.border}`,fontSize:10}}>{tr.id}</span>
        </div>

        {/* Features */}
        {tr.features.length>0 && (
          <div className="flex flex-wrap gap-1.5">
            {tr.features.slice(0,3).map(f=>(
              <span key={f.id} className="text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{background:B.bg,border:`1px solid ${B.border}`,color:B.text3}}>✓ {f.text}</span>
            ))}
            {tr.features.length>3&&<span className="text-xs px-2.5 py-1 rounded-full" style={{background:B.bg,border:`1px solid ${B.border}`,color:B.muted}}>+{tr.features.length-3}</span>}
          </div>
        )}

        {/* Actions */}
        <div className="mt-auto">
          <EntityActions
            name={tr.name} label="المواصلة" canWrite={canWrite} isAdmin={isAdmin}
            onEdit={onEdit}
            active={tr.status==="active"} onToggleActive={onToggleActive} disableLabel="إيقاف مؤقت"
            onArchive={onArchive} onPermanentDelete={onDelete} deleteBlockers={deleteBlockers}/>
        </div>
      </div>
    </motion.div>
  );
}

/* اقتراحات صياغة المميزات — الميزة يقرؤها العميل قبل أن يدفع.

   «اكل» كلمةٌ لا تَعِد بشيء: هل وجبة أم وجبتان؟ لكل رحلة أم لكل يوم؟
   يقرؤها كلٌّ على هواه، ثم يُطالب بما فهمه. والخلاف ليس على الوجبة بل
   على عبارةٍ لم تُحدَّد.

   ولذلك تحمل الاقتراحات تكرارها في نصّها. البديل كان حقلاً ثانياً
   للتكرار — وهو عمودٌ جديد في القاعدة ونافذةٌ أعرض، مقابل ما تقوله
   العبارة نفسها بلا كلفة. */
const FEATURE_PRESETS: Record<string,string[]> = {
  ac:      ["مكيّف هواء مركزي"],
  wifi:    ["واي فاي مجاني طوال الرحلة","واي فاي عالي السرعة"],
  screen:  ["شاشات ترفيه فردية","شاشة مركزية"],
  meal:    ["وجبة مشمولة لكل رحلة","وجبتان يومياً","إفطار يومي مشمول","وجبات غير مشمولة"],
  drink:   ["مشروبات ساخنة وباردة مجانية","ماء مجاني طوال الرحلة"],
  wc:      ["دورة مياه على متن الحافلة"],
  seat:    ["مقاعد مريحة قابلة للاستلقاء","مقاعد جلد فاخرة"],
  charge:  ["منفذ شحن USB لكل مقعد"],
  luggage: ["حقيبة واحدة ٢٣ كجم لكل مسافر","حقيبة يد ٧ كجم"],
  other:   [],
};

/* ميزةٌ من كلمةٍ واحدة قصيرة أو من قائمة المبهمات المعروفة. الفحص
   تنبيهٌ لا منع: قد تكون كلمةٌ واحدة كافيةً أحياناً، والحكم للموظف. */
const VAGUE_WORDS = new Set(["اكل","أكل","طعام","وجبات","مشروبات","شاي","قهوة","نت","انترنت","إنترنت","واي فاي","شنطة","حقيبة","امتعة","أمتعة"]);
function isVagueFeature(text: string): boolean {
  const t = (text||"").trim();
  if (!t) return false;
  return VAGUE_WORDS.has(t) || (t.length <= 4 && !t.includes(" "));
}

/* ─── Transport Modal ─── */
const TRANSPORT_MEDIA_MAX = 8;
const TRANSPORT_MEDIA_CATS = ["المظهر الخارجي","المقاعد الداخلية","لوحة القيادة","وسائل الراحة","الأمتعة","أخرى"];
function TransportModal({initial,onSave,onClose,onDelete,seatFloor}:{
  initial:Transport|null;onSave:(t:Transport)=>void;onClose:()=>void;onDelete?:()=>void;
  /* ٢٥) أكبر عدد مقاعد محجوز في رحلةٍ مرتبطة بهذه المركبة. تخفيض السعة
     تحته يترك معتمرين بمقاعدَ لا وجود لها — والحجز موجودٌ ومدفوع.
     التخفيض يُمنع؛ الزيادة حرّة. */
  seatFloor:number;
}) {
  const isEdit=initial!==null;
  const [tab,setTab]=useState<TrTab>("info");
  const [form,setForm]=useState<Transport>(initial?{...initial,media:initial.media??[]}:{id:newId("TRN"),name:"",mode:"bus",vehicleType:"حافلة عادية",seats:49,seatCost:0,model:"",year:"",plate:"",driver:"",supervisor:"",status:"draft",notes:"",features:[],reviews:[],media:[]});
  const set=<K extends keyof Transport>(k:K,v:Transport[K])=>setForm(f=>({...f,[k]:v}));
  const addFeat=()=>set("features",[...form.features,{id:uid(),text:"",icon:"ac"}]);
  const delFeat=(id:string)=>set("features",form.features.filter(f=>f.id!==id));
  const updFeat=(id:string,field:keyof TransportFeature,val:string)=>set("features",form.features.map(f=>f.id===id?{...f,[field]:val}:f));
  const addReview=()=>set("reviews",[...form.reviews,{id:uid(),name:"",text:"",consent:false}]);
  const delReview=(id:string)=>set("reviews",form.reviews.filter(r=>r.id!==id));
  const updReview=(id:string,field:keyof TransportReview,val:any)=>set("reviews",form.reviews.map(r=>r.id===id?{...r,[field]:val}:r));
  const media=form.media??[];
  const addMedia=(kind:MediaKind)=>{ if(media.length>=TRANSPORT_MEDIA_MAX) return; set("media",[...media,{id:uid(),kind,url:"",primary:kind==="image"&&!media.some(m=>m.primary&&m.kind==="image"),category:kind==="image"?TRANSPORT_MEDIA_CATS[0]:""}]); };
  const delMedia=(id:string)=>set("media",media.filter(m=>m.id!==id));
  const updMedia=(id:string,field:keyof HotelMedia,val:any)=>set("media",media.map(m=>m.id===id?{...m,[field]:val}:m));
  const setPrimaryMedia=(id:string)=>set("media",media.map(m=>({...m,primary:m.id===id&&m.kind==="image"})));
  const moveMedia=(id:string,dir:-1|1)=>{const arr=[...media];const i=arr.findIndex(m=>m.id===id);const j=i+dir;if(j<0||j>=arr.length)return;[arr[i],arr[j]]=[arr[j],arr[i]];set("media",arr);};
  const inp="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none transition-all";
  const ist={borderColor:B.border,background:"#fff",color:B.black,fontFamily:"inherit"};
  const req=<span style={{color:B.gold}}>*</span>;
  const ready=transportReadiness(form);
  /* الحفظ يُمنع لسببين فقط — اسمٌ فارغ، وسعةٌ تحت المحجوز. الباقي يُمنع
     التفعيلَ لا الحفظ: الموظف يدّخر عملاً نصف مكتمل ويعود إليه. */
  const seatsTooLow=form.seats<seatFloor;
  const saveBlock=!form.name.trim() ? "الاسم مطلوب" : seatsTooLow ? `السعة لا تنزل تحت ${seatFloor}` : "";
  const canSave=!saveBlock;

  /* ── الشرط يحرس الدخول إلى «نشطة» لا البقاء فيها ──

     المركبات العاملة اليوم أُدخلت قبل هذه الحقول، فكلها ناقصة الوثائق
     بحكم تاريخها. لو حرس الشرطُ البقاءَ أيضاً لكان أوّل تعديلٍ على حافلةٍ
     تعمل — تصحيح اسمٍ، إضافة صورة — يُنزلها مسودةً فتختفي من الباقات
     ومن إطلاق الرحلات، والموظف لم يطلب ذلك ولم يُخبَر به.

     فالنقص يُعرض على المركبة القائمة ولا يُوقفها؛ ويمنع تفعيل ما لم
     يُفعَّل بعد. والقاعدة تُبلّغ عن القائمات الناقصات في تقرير الترحيل
     ليُصلَحن بقرارٍ لا بمفاجأة. */
  const wasActive=initial?.status==="active";
  const activateBlocked=!ready.canActivate&&!wasActive;
  function handleSave(){
    if(!canSave) return;
    onSave(form.status==="active"&&activateBlocked?{...form,status:"draft"}:form);
  }
  const gaps=gapsByTab(form);
  /* ٢٧) العدد داخل اسم التبويب لا في مكانٍ آخر: «المواصفات ٣» يقول ما
     فيها، و«المعلومات ⚠٢» يقول أين النقص — فلا يفتح الموظف أربعة
     تبويبات ليعرف أيّها ينتظره. */
  const count=(n:number)=>n>0?` ${n}`:"";
  const gap=(n:number)=>n>0?` ⚠${n}`:"";
  const TABS:{id:TrTab;label:string}[]=[
    {id:"info",    label:`المعلومات${gap(gaps.info)}`},
    {id:"features",label:`المواصفات${count(form.features.length)}${gap(gaps.features)}`},
    {id:"media",   label:`الصور والفيديو${count(media.length)}${gap(gaps.media)}`},
    {id:"reviews", label:`الآراء${count(form.reviews.length)}`},
  ];
  const BUS_TYPES=["حافلة عادية","حافلة VIP","ميني باص"];
  const FLIGHT_TYPES=["طيران داخلي","طيران دولي","طيران خاص"];
  const typeOptions=form.mode==="bus"?BUS_TYPES:FLIGHT_TYPES;
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6"
      style={{background:"rgba(14,12,11,0.78)",backdropFilter:"blur(4px)"}} onClick={onClose}>
      <motion.div initial={{opacity:0,y:40}} animate={{opacity:1,y:0}} exit={{opacity:0,y:40}}
        transition={{type:"spring",damping:30,stiffness:400}}
        className="w-full sm:rounded-2xl overflow-hidden flex flex-col"
        style={{maxWidth:620,maxHeight:"92vh",background:"#fff"}} onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div className="relative px-6 pt-6 pb-0 flex-shrink-0" style={{background:B.primaryDeep}}>
          <div className="absolute top-0 inset-x-0 h-1" style={{background:`linear-gradient(90deg,${B.gold},${B.gold2},${B.gold})`}}/>
          <div className="flex items-start justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{background:"rgba(192,134,44,0.15)",border:"1px solid rgba(192,134,44,0.3)"}}>
                {form.mode==="bus"?"🚌":"✈️"}
              </div>
              <div>
                <h2 className="font-extrabold text-white" style={{fontSize:17,fontFamily:"var(--font-app)"}}>{isEdit?"تعديل المواصلة":"إضافة مواصلة جديدة"}</h2>
                <div className="text-xs mt-0.5" style={{color:B.muted}}>{isEdit?form.id:"معرّف تلقائي"}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {isEdit&&onDelete&&<button onClick={onDelete} title="أرشفة المواصلة" aria-label="أرشفة المواصلة" className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-bold cursor-pointer"
                style={{background:"rgba(138,106,8,0.2)",border:"1px solid rgba(232,217,168,.55)",color:"#F7E9AE"}}><Archive size={13}/>أرشفة</button>}
              <button onClick={onClose} aria-label="إغلاق النافذة" title="إغلاق" className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer"
                style={{background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.1)",color:"#7a7068"}}><X size={15}/></button>
            </div>
          </div>
          <TabStrip tabs={TABS} active={tab} onChange={t=>setTab(t)} tone="onDark" idPrefix="trn"/>
        </div>
        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6" style={{scrollbarWidth:"none"}}>
          <AnimatePresence mode="wait">
            {tab==="info"&&<motion.div role="tabpanel" id="trn-panel-info" aria-labelledby="trn-tab-info" key="info" initial={{opacity:0}} animate={{opacity:1}} transition={{duration:0.12}} className="flex flex-col gap-4">
              {/* Mode toggle */}
              <div>
                <label className="block text-xs font-bold mb-2" style={{color:B.text3}}>وسيلة النقل <span style={{color:B.gold}}>*</span></label>
                <div className="grid grid-cols-2 gap-2">
                  {(["bus","flight"] as const).map(m=>(
                    <button key={m} onClick={()=>{set("mode",m);set("vehicleType",m==="bus"?"حافلة عادية":"طيران داخلي");}}
                      className="flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm cursor-pointer transition-all"
                      style={{background:form.mode===m?B.primary:B.bg,color:form.mode===m?B.gold:B.muted,border:`2px solid ${form.mode===m?B.gold:B.border}`}}>
                      <span className="text-lg">{m==="bus"?"🚌":"✈️"}</span>
                      {m==="bus"?"حافلة":"طيران"}
                    </button>
                  ))}
                </div>
              </div>
              <div><Field label={<>الاسم <span style={{color:B.gold}}>*</span></>}>
                     <input className={inp} style={ist} value={form.name} placeholder="مثال: حافلة الحرمين 1" onChange={e=>set("name",e.target.value)}/>
                   </Field></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Field label="النوع">
                       <AppSelect value={form.vehicleType} onChange={v=>set("vehicleType",v)} options={typeOptions.map(o=>({value:o,label:o}))}/>
                     </Field>
                </div>
                <div><Field label={<>عدد المقاعد {req}</>}>
                       <NumericInput min={Math.max(1,seatFloor)} className={inp}
                         style={{...ist,borderColor:form.seats<seatFloor?"#E1A3A3":B.border}}
                         value={form.seats} onValueChange={v=>set("seats",Number(v))}/>
                     </Field>
                     {seatFloor>0&&(
                       form.seats<seatFloor
                         ? <div className="text-xs font-bold mt-1" style={{color:"#BE2626"}}>لا تنزل تحت {seatFloor} — محجوزة في رحلة مرتبطة.</div>
                         : <div className="text-xs mt-1" style={{color:B.muted}}>الحدّ الأدنى {seatFloor} مقعداً (محجوزة حالياً).</div>
                     )}</div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Field label={<>تكلفة المقعد ({SAR}) {req}</>}>
                       <NumericInput min={1} className={inp}
                         style={{...ist,color:B.gold,fontWeight:800,fontFamily:"var(--font-app)",borderColor:form.seatCost>0?B.border:"#E8D9A8"}}
                         value={form.seatCost} onValueChange={v=>set("seatCost",Number(v))}/>
                     </Field>
                     {form.seatCost<=0&&<div className="text-xs font-bold mt-1" style={{color:"#8A6A08"}}>صفرٌ ليس سعراً — تدخل هذه القيمة تسعير كل باقة مرتبطة.</div>}</div>
                <div><Field label={<>{form.mode==="bus"?"الشركة / الموديل":"شركة الطيران"}</>}>
                       <input className={inp} style={ist} value={form.model} placeholder={form.mode==="bus"?"مرسيدس توريزمو":"طيران ناس"} onChange={e=>set("model",e.target.value)}/>
                     </Field></div>
              </div>
              {form.mode==="bus" ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Field label="سنة التصنيع">
                           <NumericInput min={1990} max={2030} className={inp} style={ist} value={form.year} placeholder="2024" onValueChange={v=>set("year",v)}/>
                         </Field></div>
                    <div><Field label={<>رقم اللوحة {req}</>}>
                           <input className={inp} style={ist} value={form.plate} placeholder="أ ب ج 1234" onChange={e=>set("plate",e.target.value)}/>
                         </Field></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Field label={<>الرقم التسلسلي / التعريفي {req}</>}>
                           <input className={inp} style={{...ist,direction:"ltr",textAlign:"right"}} value={form.serialNo??""} placeholder="VIN أو رقم داخلي" onChange={e=>set("serialNo",e.target.value)}/>
                         </Field></div>
                    <div><Field label={<>شركة التشغيل {req}</>}>
                           <input className={inp} style={ist} value={form.operator??""} placeholder="مؤسسة النقل المتعاقدة" onChange={e=>set("operator",e.target.value)}/>
                         </Field></div>
                  </div>
                  <div><Field label="رقم تواصل المشغّل">
                         <input className={inp} style={{...ist,direction:"ltr",textAlign:"right"}} value={form.operatorPhone??""} placeholder="+966 5x xxx xxxx" onChange={e=>set("operatorPhone",e.target.value)}/>
                       </Field></div>
                  {/* الوثائق الأربع: تاريخُ انتهاءٍ يمرّ يجعل التشغيل مخالفةً
                      نظامية، فيُعرض الانتهاء لا الإصدار — هو ما يُراقَب. */}
                  <div>
                    <label className="block text-xs font-bold mb-2" style={{color:B.text3}}>الوثائق النظامية {req}</label>
                    <div className="grid grid-cols-2 gap-3">
                      {([["insuranceExpiry","انتهاء التأمين"],["inspectionExpiry","انتهاء الفحص الدوري"],
                         ["registrationExpiry","انتهاء الاستمارة"],["transportLicenseExpiry","انتهاء رخصة النقل"]] as const).map(([k,lbl])=>{
                        const v=(form[k]??"") as string;
                        const bad=!!v&&!notExpired(v);
                        return (
                          <div key={k}>
                            <Field label={lbl}>
                              <input type="date" className={inp} style={{...ist,direction:"ltr",textAlign:"right",borderColor:bad?"#E1A3A3":B.border}}
                                value={v} onChange={e=>set(k,e.target.value)}/>
                            </Field>
                            {bad&&<div className="text-xs font-bold mt-1" style={{color:"#BE2626"}}>منتهية</div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* ٢٦) الطيران: حقوله لا حقول الحافلة. كان رقم الرحلة يُكتب
                      في خانة «اللوحة» واسم الكابتن في خانة «السائق». */}
                  <div className="grid grid-cols-2 gap-3">
                    <div><Field label={<>رقم الرحلة {req}</>}>
                           <input className={inp} style={{...ist,direction:"ltr",textAlign:"right"}} value={form.flightNo??""} placeholder="XY-521" onChange={e=>set("flightNo",e.target.value)}/>
                         </Field></div>
                    <div><Field label="درجة المقصورة">
                           <AppSelect value={form.cabinClass||"اقتصادية"} onChange={v=>set("cabinClass",v)}
                             options={["اقتصادية","اقتصادية مميزة","درجة رجال الأعمال","الدرجة الأولى"].map(o=>({value:o,label:o}))}/>
                         </Field></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Field label={<>مطار المغادرة {req}</>}>
                           <input className={inp} style={ist} value={form.fromAirport??""} placeholder="الرياض — الملك خالد (RUH)" onChange={e=>set("fromAirport",e.target.value)}/>
                         </Field></div>
                    <div><Field label={<>مطار الوصول {req}</>}>
                           <input className={inp} style={ist} value={form.toAirport??""} placeholder="جدة — الملك عبدالعزيز (JED)" onChange={e=>set("toAirport",e.target.value)}/>
                         </Field></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Field label={<>موعد الإقلاع {req}</>}>
                           <input type="time" className={inp} style={{...ist,direction:"ltr",textAlign:"right"}} value={form.departTime??""} onChange={e=>set("departTime",e.target.value)}/>
                         </Field></div>
                    <div><Field label={<>موعد الوصول {req}</>}>
                           <input type="time" className={inp} style={{...ist,direction:"ltr",textAlign:"right"}} value={form.arriveTime??""} onChange={e=>set("arriveTime",e.target.value)}/>
                         </Field></div>
                  </div>
                  <div><Field label="حدّ الأمتعة">
                         <input className={inp} style={ist} value={form.baggage??""} placeholder="حقيبة 23 كجم + يد 7 كجم" onChange={e=>set("baggage",e.target.value)}/>
                       </Field></div>
                </>
              )}
              {/* ٢٢) ثلاث حالات لا اثنتان، و«نشطة» وحدها محروسة بالجاهزية:
                  المسودة والمتوقفة تُحفظان ناقصتين لأنهما لا تدخلان تسعيراً
                  ولا رحلة. منعُ الحفظ كلّه كان سيمنع الموظف من ادّخار عملٍ
                  نصف مكتمل. */}
              <div><label className="block text-xs font-bold mb-2" style={{color:B.text3}}>الحالة</label>
                <div className="grid grid-cols-3 gap-2">
                  {([["draft","مسودة","#FBF3D6","#8A6A08","#F0E3AE"],
                     ["active","نشطة ومتاحة","#E3F3E8","#1E7A44","#C4E4CE"],
                     ["inactive","متوقفة","#FBE6E6","#BE2626","#F3C9C9"]] as const).map(([v,lbl,bg,fg,bd])=>{
                    const on=form.status===v;
                    const blocked=v==="active"&&activateBlocked;
                    return (
                      <button key={v} disabled={blocked}
                        title={blocked?`ينقصها ${ready.blockers.length}: ${ready.blockers.map(b=>b.label).join(" · ")}`:undefined}
                        onClick={()=>{ if(blocked){ setTab("info"); return; } set("status",v); }}
                        className="flex items-center justify-center gap-2 py-3 px-3 rounded-xl font-bold text-sm"
                        style={{background:on?bg:B.bg,color:on?fg:B.muted,border:`1.5px solid ${on?bd:B.border}`,
                                opacity:blocked?.5:1,cursor:blocked?"not-allowed":"pointer"}}>
                        <span className="w-2 h-2 rounded-full" style={{background:on?fg:B.border}}/>{lbl}
                      </button>
                    );
                  })}
                </div>
                {!ready.canActivate&&(
                  <div className="mt-2 px-3 py-2 rounded-xl text-xs font-bold" style={{background:"#FBF3D6",border:"1px solid #F0E3AE",color:"#8A6A08"}}>
                    {wasActive
                      ? <>تعمل الآن وينقصها {ready.blockers.length}: {ready.blockers.map(b=>b.label).join(" · ")} — أكملها ولا تُوقَف تلقائياً.</>
                      : <>لا تُفعَّل قبل إكمال {ready.blockers.length}: {ready.blockers.map(b=>b.label).join(" · ")}</>}
                  </div>
                )}
              </div>
              {/* وثائق توشك أن تنتهي: تحذيرٌ قبل أن يصير مانعاً — الحافلة
                  تُسحب من الخدمة يوم الانتهاء لا يوم اكتشافه. */}
              {ready.expiring.length>0&&(
                <div className="px-4 py-2.5 rounded-xl text-xs font-bold flex items-start gap-2" style={{background:"#FCEBDD",border:"1px solid #F2D3B8",color:"#B4530C"}}>
                  <AlertTriangle size={13} style={{flexShrink:0,marginTop:1}}/>
                  <span>تنتهي خلال ٣٠ يوماً: {ready.expiring.map(x=>`${x.label} (${x.date})`).join(" · ")}</span>
                </div>
              )}
              {/* Live preview */}
              <div className="rounded-xl p-4" style={{background:`linear-gradient(135deg,${B.primary} 0%,${B.primaryDeep} 100%)`,border:"1px solid rgba(192,134,44,0.25)"}}>
                <div className="text-xs font-bold mb-3" style={{color:B.muted}}>معاينة سريعة</div>
                <div className="grid grid-cols-3 gap-3">
                  <div><div className="text-xs" style={{color:B.muted}}>المقاعد</div><div className="text-lg font-bold" style={{color:B.cream}}>{form.seats||"—"}</div></div>
                  {/* الرقم والوحدة منفصلان في الرسم، فالوحدة من الثابت والرقم من sarNumber — لا لصقٌ يدوي. */}
                  <div><div className="text-xs" style={{color:B.muted}}>تكلفة المقعد</div><div className="text-lg font-bold" style={{color:B.gold}}>{form.seatCost?sarNumber(form.seatCost):"—"} <span className="text-xs" style={{color:B.gold2}}>{SAR}</span></div></div>
                  <div><div className="text-xs" style={{color:B.muted}}>الطاقة الكاملة</div><div className="text-lg font-bold" style={{color:B.cream}}>{sarNumber((form.seats||0)*(form.seatCost||0))} <span className="text-xs" style={{color:B.muted}}>{SAR}</span></div></div>
                </div>
              </div>
            </motion.div>}
            {tab==="features"&&<motion.div role="tabpanel" id="trn-panel-features" aria-labelledby="trn-tab-features" key="features" initial={{opacity:0}} animate={{opacity:1}} transition={{duration:0.12}} className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div><p className="font-bold text-sm" style={{color:B.black}}>مواصفات المركبة</p>
                  <p className="text-xs mt-0.5" style={{color:B.muted}}>ما يميزها — تُعرض للعميل</p></div>
                <button onClick={addFeat} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer"
                  style={{background:B.bg,border:`1px solid ${B.border}`,color:"#8a6a08"}}><Plus size={12}/>إضافة</button>
              </div>
              <AnimatePresence>{form.features.map(f=>(
                <motion.div key={f.id} initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}} className="flex gap-2 items-start">
                  <select aria-label="نوع الميزة" className="border rounded-xl px-2.5 py-2.5 text-sm cursor-pointer flex-shrink-0"
                    style={{borderColor:B.border,background:"#fff",color:B.black,width:160,fontFamily:"inherit"}}
                    value={f.icon||"ac"} onChange={e=>updFeat(f.id,"icon",e.target.value)}>
                    <option value="ac">❄️ تكييف</option><option value="wifi">📶 واي فاي</option>
                    <option value="screen">📺 شاشات</option><option value="meal">🍽️ وجبات</option>
                    <option value="drink">☕ مشروبات</option><option value="wc">🚻 دورة مياه</option>
                    <option value="seat">💺 مقاعد مريحة</option><option value="charge">🔌 منافذ شحن</option>
                    <option value="luggage">🧳 أمتعة</option><option value="other">⭐ أخرى</option>
                  </select>
                  <div className="flex-1 min-w-0">
                    <input className={`${inp} w-full`} list={`feat-${f.id}`} style={{...ist,borderColor:isVagueFeature(f.text)?"#E8D9A8":B.border}}
                      value={f.text} placeholder={FEATURE_PRESETS[f.icon||"ac"]?.[0]??"مثال: مكيف هواء"}
                      onChange={e=>updFeat(f.id,"text",e.target.value)}/>
                    {/* الاقتراحات تحمل التكرار في نصّها: «وجبة مشمولة لكل
                        رحلة» تُجيب سؤال الفريق داخل العبارة، ولا تحتاج
                        حقلاً ثانياً ولا عموداً في القاعدة. */}
                    <datalist id={`feat-${f.id}`}>
                      {(FEATURE_PRESETS[f.icon||"ac"]??[]).map(x=><option key={x} value={x}/>)}
                    </datalist>
                    {isVagueFeature(f.text)&&(
                      <div className="text-xs font-bold mt-1 flex items-center gap-1" style={{color:"#8A6A08"}}>
                        <AlertTriangle size={10}/>وصفٌ مبهم — يقرؤه العميل. اختر من الاقتراحات أو اكتب ما يشمله بالضبط.
                      </div>
                    )}
                  </div>
                  <button aria-label="حذف الميزة" title="حذف الميزة" onClick={()=>delFeat(f.id)} className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer flex-shrink-0 self-start mt-0.5"
                    style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}><X size={13}/></button>
                </motion.div>
              ))}</AnimatePresence>
              {form.features.length===0&&<div className="flex flex-col items-center py-12 rounded-2xl" style={{border:`2px dashed ${B.border}`,color:B.muted}}><Wrench size={28} style={{opacity:0.3,marginBottom:8}}/><p className="text-sm">لم تُضف مواصفات بعد</p></div>}
            </motion.div>}
            {tab==="media"&&<motion.div role="tabpanel" id="trn-panel-media" aria-labelledby="trn-tab-media" key="media" initial={{opacity:0}} animate={{opacity:1}} transition={{duration:0.12}} className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="font-bold text-sm flex items-center gap-2" style={{color:B.black}}>صور وفيديو المركبة
                  <span className="px-2 py-0.5 rounded-md text-xs font-bold" style={{background:media.length>=TRANSPORT_MEDIA_MAX?"#FBE6E6":B.bg,color:media.length>=TRANSPORT_MEDIA_MAX?"#BE2626":B.muted,border:`1px solid ${media.length>=TRANSPORT_MEDIA_MAX?"#F3C9C9":B.border}`}}>{media.length} / {TRANSPORT_MEDIA_MAX}</span>
                </p>
                <div className="flex items-center gap-2">
                  <button onClick={()=>addMedia("image")} disabled={media.length>=TRANSPORT_MEDIA_MAX} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer"
                    style={{background:media.length>=TRANSPORT_MEDIA_MAX?B.bg:B.black,border:"none",color:media.length>=TRANSPORT_MEDIA_MAX?B.muted:B.cream,opacity:media.length>=TRANSPORT_MEDIA_MAX?0.6:1}}><ImagePlus size={12}/>صورة</button>
                  <button onClick={()=>addMedia("video")} disabled={media.length>=TRANSPORT_MEDIA_MAX} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer"
                    style={{background:B.bg,border:`1px solid ${B.border}`,color:"#1E52C7",opacity:media.length>=TRANSPORT_MEDIA_MAX?0.6:1}}><Film size={12}/>فيديو</button>
                </div>
              </div>
              <p className="text-xs -mt-2" style={{color:B.muted}}>رتّب العناصر بالأسهم — أول صورة أساسية تظهر كغلاف المركبة.</p>
              <AnimatePresence>{media.map((m,idx)=>(
                <motion.div key={m.id} initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}
                  className="rounded-2xl p-3 flex gap-3" style={{border:`1px solid ${m.primary?B.gold:B.border}`,background:m.primary?"rgba(192,134,44,0.05)":"#fff"}}>
                  <label className="relative rounded-xl overflow-hidden flex items-center justify-center cursor-pointer flex-shrink-0" style={{width:88,height:88,border:`1px dashed ${B.border}`,background:B.bg}}>
                    {m.url
                      ? (m.kind==="image"
                          ? <img src={m.url} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                          : <video src={m.url} style={{width:"100%",height:"100%",objectFit:"cover"}}/>)
                      : <div className="flex flex-col items-center gap-1" style={{color:B.muted}}>{m.kind==="image"?<ImagePlus size={20}/>:<Film size={20}/>}<span style={{fontSize:10}}>اختر ملفاً</span></div>}
                    <input type="file" accept={m.kind==="image"?"image/*":"video/*"} className="hidden" onChange={onPickMedia("transport",url=>updMedia(m.id,"url",url))}/>
                  </label>
                  <div className="flex-1 flex flex-col gap-2 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded-md text-xs font-bold" style={{background:B.bg,color:B.text2,border:`1px solid ${B.border}`}}>#{idx+1}</span>
                      <span className="text-xs font-bold" style={{color:m.kind==="image"?"#8a6a08":"#1E52C7"}}>{m.kind==="image"?"صورة":"فيديو"}</span>
                      {m.primary&&<span className="px-2 py-0.5 rounded-md text-xs font-bold" style={{background:"#FBF3D6",color:"#8A6A08"}}>أساسية</span>}
                    </div>
                    {m.kind==="image"&&(
                      <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={()=>setPrimaryMedia(m.id)} disabled={m.primary} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
                          style={{background:m.primary?"#FBF3D6":B.bg,color:m.primary?"#8A6A08":B.muted,border:`1px solid ${m.primary?"#EBD9A0":B.border}`}}><Star size={11}/>{m.primary?"الصورة الأساسية":"اجعلها أساسية"}</button>
                        <select value={m.category} onChange={e=>updMedia(m.id,"category",e.target.value)} className="border rounded-lg px-2.5 py-1.5 text-xs cursor-pointer"
                          style={{borderColor:B.border,background:"#fff",color:B.black,fontFamily:"inherit"}}>
                          {TRANSPORT_MEDIA_CATS.map(c=><option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button aria-label="تقديم العنصر في الترتيب" title="تقديم العنصر في الترتيب" onClick={()=>moveMedia(m.id,-1)} disabled={idx===0} className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer"
                      style={{background:B.bg,border:`1px solid ${B.border}`,color:idx===0?B.border:B.text2}}><ChevronUp size={14}/></button>
                    <button aria-label="تأخير العنصر في الترتيب" title="تأخير العنصر في الترتيب" onClick={()=>moveMedia(m.id,1)} disabled={idx===media.length-1} className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer"
                      style={{background:B.bg,border:`1px solid ${B.border}`,color:idx===media.length-1?B.border:B.text2}}><ChevronDown size={14}/></button>
                    <button aria-label="حذف الصورة أو الفيديو" title="حذف الصورة أو الفيديو" onClick={()=>delMedia(m.id)} className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer"
                      style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}><Trash2 size={13}/></button>
                  </div>
                </motion.div>
              ))}</AnimatePresence>
              {media.length===0&&<div className="flex flex-col items-center py-12 rounded-2xl" style={{border:`2px dashed ${B.border}`,color:B.muted}}><ImagePlus size={28} style={{opacity:0.3,marginBottom:8}}/><p className="text-sm">لم تُضف صور أو فيديو بعد</p></div>}
            </motion.div>}
            {tab==="reviews"&&<motion.div role="tabpanel" id="trn-panel-reviews" aria-labelledby="trn-tab-reviews" key="reviews" initial={{opacity:0}} animate={{opacity:1}} transition={{duration:0.12}} className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="font-bold text-sm" style={{color:B.black}}>آراء المعتمرين</p>
                <button onClick={addReview} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer"
                  style={{background:B.bg,border:`1px solid ${B.border}`,color:"#8a6a08"}}><Plus size={12}/>إضافة</button>
              </div>
              <AnimatePresence>{form.reviews.map(rv=>(
                <motion.div key={rv.id} initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}
                  className="rounded-2xl p-4 flex gap-3" style={{border:`1px solid ${B.border}`}}>
                  <div className="flex-1 flex flex-col gap-2">
                    <input className={inp} style={ist} value={rv.name} placeholder="الاسم الأول" onChange={e=>updReview(rv.id,"name",e.target.value)}/>
                    <textarea className={inp} style={{...ist,resize:"vertical"}} rows={2} value={rv.text} placeholder="ماذا قال عن المواصلة؟" onChange={e=>updReview(rv.id,"text",e.target.value)}/>
                    {rv.image&&(
                      <div className="relative rounded-xl overflow-hidden self-start" style={{border:`1px solid ${B.border}`,width:96,height:96}}>
                        <img src={rv.image} alt="صورة مرفقة" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                        <button aria-label="إزالة صورة الرأي" title="إزالة صورة الرأي" onClick={()=>updReview(rv.id,"image",undefined)} className="absolute top-1 left-1 w-6 h-6 rounded-lg flex items-center justify-center cursor-pointer"
                          style={{background:"rgba(190,38,38,0.92)",color:"#fff",border:"none"}}><X size={12}/></button>
                      </div>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <button onClick={()=>updReview(rv.id,"consent",!rv.consent)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
                        style={{background:rv.consent?"#E3F3E8":B.bg,color:rv.consent?"#1E7A44":B.muted,border:`1px solid ${rv.consent?"#C4E4CE":B.border}`}}>
                        <Check size={11}/>{rv.consent?"تم الإذن":"في انتظار الإذن"}
                      </button>
                      <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
                        style={{background:B.bg,color:"#8a6a08",border:`1px solid ${B.border}`}}>
                        <ImagePlus size={12}/>{rv.image?"تغيير الصورة":"إرفاق صورة (اختياري)"}
                        <input type="file" accept="image/*" className="hidden" onChange={onPickMedia("transport-reviews",url=>updReview(rv.id,"image",url))}/>
                      </label>
                    </div>
                  </div>
                  <button aria-label="حذف الرأي" title="حذف الرأي" onClick={()=>delReview(rv.id)} className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer mt-0.5"
                    style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}><X size={12}/></button>
                </motion.div>
              ))}</AnimatePresence>
              {form.reviews.length===0&&<div className="flex flex-col items-center py-12 rounded-2xl" style={{border:`2px dashed ${B.border}`,color:B.muted}}><Star size={28} style={{opacity:0.3,marginBottom:8}}/><p className="text-sm">لا توجد آراء</p></div>}
            </motion.div>}
          </AnimatePresence>
        </div>
        <div className="flex gap-3 px-6 py-4 flex-shrink-0" style={{borderTop:`1px solid ${B.border}`}}>
          <button onClick={handleSave} disabled={!canSave} className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold"
            style={{background:canSave?B.gold:"#d6cfc6",color:canSave?B.black:"#a09688",border:"none",cursor:canSave?"pointer":"not-allowed"}}>
            <Check size={14}/>حفظ المواصلة</button>
          {!canSave&&<span className="self-center text-xs font-bold" style={{color:"#BE2626"}}>{saveBlock}</span>}
          <button onClick={onClose} className="px-5 py-3 rounded-xl text-sm font-bold cursor-pointer"
            style={{background:B.bg,color:B.text2,border:"none"}}>إلغاء</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─── Transport Page ─── */
export function TransportPage({onMenuOpen}:{onMenuOpen?:()=>void}={}) {
  /* بوابة الكتابة — مرآة can_write_admin() في القاعدة. كل نقاط فتح
     نموذج التعديل تمرّ من هنا، فالموظف لا يملأ نموذجاً ليُرفض في آخره. */
  const { canWrite, isAdmin } = useRole();
  const mayWrite = canWrite("transport");
  const openForm = (t: any) => {
    if (!mayWrite) {
      toast.error("لا تملك صلاحية التعديل", { description: "هذه الشاشة يكتبها مدير النظام وحده." });
      return;
    }
    setEditTarget(t); setShowModal(true);
  };
  const transports=useStore(s=>s.transports); const setTransports=useStore(s=>s.setTransports);
  const trips=useStore(s=>s.trips); const packages=useStore(s=>s.packages);
  const [showModal,setShowModal]=useState(false);
  const [editTarget,setEditTarget]=useState<Transport|null>(null);
  const [search,setSearch]=useState("");
  /* التصفية على القيمة الساكنة لا على كل ضغطة مفتاح. */
  const query = useDebounced(search);
  const [modeFilter,setModeFilter]=useState<"all"|"bus"|"flight">("all");
  const [statusFilter,setStatusFilter]=useState<"all"|"active"|"inactive">("all");
  const [deleteId,setDeleteId]=useState<string|null>(null);
  const filtered=transports.filter(t=>
    (!query||t.name.includes(query)||t.id.toLowerCase().includes(query.toLowerCase())||t.model.includes(query))&&
    (modeFilter==="all"||t.mode===modeFilter)&&
    (statusFilter==="all"||t.status===statusFilter)
  );
  const stats={
    total:transports.length,
    active:transports.filter(t=>t.status==="active").length,
    buses:transports.filter(t=>t.mode==="bus").length,
    flights:transports.filter(t=>t.mode==="flight").length,
    totalSeats:transports.reduce((a,t)=>a+t.seats,0),
  };
  function handleSave(t:Transport){setTransports(p=>editTarget?p.map(x=>x.id===t.id?t:x):[t,...p]);setShowModal(false);}

  /* موانع الحذف النهائي — تُعرض بنصّها لا تُخفي الزرّ.

     حذف مركبةٍ تحملها رحلةٌ أو باقة يترك مرجعاً معلّقاً: الرحلة تفقد
     سعتها والباقة تفقد نقلها، ويقرأ العميل «غير متوفّر» بلا سبب.
     والأرشفة تبقى متاحة دائماً — هي الطريق الصحيح لمركبةٍ خرجت من
     الخدمة ولها تاريخ. */
  /* أرضية المقاعد: أكبر حجزٍ قائم على رحلةٍ تحمل هذه المركبة. الرحلات
     المنتهية مستثناة — مقاعدها لم تعد تُحجَز، وإبقاؤها يقفل السعة على
     رقمٍ من الماضي. */
  function seatFloorFor(id:string):number {
    const rows=trips.filter(t=>t.transportId===id&&isLive(t));
    return rows.length?Math.max(...rows.map(t=>t.bookedSeats||0)):0;
  }

  function blockersFor(id:string):string[] {
    const out:string[]=[];
    const n=trips.filter(t=>t.transportId===id).length;
    if(n) out.push(`مرتبطة بـ${n} ${n===1?"رحلة":"رحلات"} — أرشفها بدل حذفها.`);
    const p=packages.filter(x=>x.transportId===id);
    if(p.length) out.push(`تعتمد عليها ${p.length===1?"باقة":`${p.length} باقات`}: ${p.map(x=>x.name).join(" · ")}`);
    return out;
  }
  const fb=(on:boolean)=>({padding:"6px 14px",borderRadius:999,fontSize:13,fontWeight:700,cursor:"pointer" as const,border:`1px solid ${on?B.gold:B.border}`,background:on?B.primary:"#fff",color:on?B.gold:B.text2,transition:"all 0.15s"});
  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{background:B.bg}}>
      <PageHeader title="المواصلات" crumb="إدارة المواصلات" search={search} onSearch={setSearch} onMenuOpen={onMenuOpen}/>
      <div className="px-8 pt-5">
        {/* Stats */}
        <div className="grid grid-cols-5 gap-3">
          <StatCard label="إجمالي المركبات" value={stats.total} sub="في النظام" accent/>
          <StatCard label="نشطة" value={stats.active} sub={`${stats.total-stats.active} متوقفة`}/>
          <StatCard label="حافلات" value={stats.buses} sub="مسجّلة"/>
          <StatCard label="رحلات طيران" value={stats.flights} sub="مسجّلة"/>
          <StatCard label="إجمالي المقاعد" value={stats.totalSeats.toLocaleString()} sub="الطاقة الاستيعابية للأسطول"/>
        </div>
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 mt-5 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 p-1 rounded-xl" style={{background:"#fff",border:`1px solid ${B.border}`}}>
              <button style={fb(statusFilter==="all")} onClick={()=>setStatusFilter("all")}>الكل</button>
              <button style={fb(statusFilter==="active")} onClick={()=>setStatusFilter("active")}>نشط</button>
              <button style={fb(statusFilter==="inactive")} onClick={()=>setStatusFilter("inactive")}>متوقف</button>
            </div>
            <div className="flex items-center gap-1 p-1 rounded-xl" style={{background:"#fff",border:`1px solid ${B.border}`}}>
              <button style={fb(modeFilter==="all")} onClick={()=>setModeFilter("all")}>الكل</button>
              <button style={fb(modeFilter==="bus")} onClick={()=>setModeFilter("bus")}>🚌 حافلات</button>
              <button style={fb(modeFilter==="flight")} onClick={()=>setModeFilter("flight")}>✈️ طيران</button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm" style={{color:B.muted}}><b style={{color:B.black}}>{filtered.length}</b> / {transports.length}</span>
            {/* زرّ الإضافة يُخفى لا يُعطَّل: زرٌّ مرئي يعد بعملٍ لا يُنجَز. */}
            {mayWrite && (
            <button onClick={()=>{openForm(null);}} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer"
              style={{background:B.gold,color:B.black,border:"none",boxShadow:"0 4px 12px rgba(192,134,44,0.35)"}}>
              <Plus size={15}/>إضافة مواصلة
            </button>
            )}
          </div>
        </div>
        <div className="mt-5" style={{height:1,background:B.border}}/>
      </div>
      <main className="flex-1 px-4 md:px-8 pb-10 pt-6">
        <EntityGate entity="transports" label="المواصلات" skeleton="cards">
        {filtered.length===0
          ?<motion.div initial={{opacity:0}} animate={{opacity:1}} className="flex flex-col items-center justify-center py-24 rounded-2xl" style={{background:"#fff",border:`1px solid ${B.border}`}}>
            <Bus size={44} style={{opacity:0.2,color:B.gold,marginBottom:12}}/><p className="font-bold" style={{color:B.black}}>لا توجد مواصلات مطابقة</p>
          </motion.div>
          :<motion.div layout className="grid gap-5" style={{gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))"}}>
            <AnimatePresence>{filtered.map(t=>(
              <TransportCard key={t.id} tr={t} canWrite={mayWrite} isAdmin={isAdmin}
                onEdit={()=>{openForm(t);}}
                onToggleActive={next=>setTransports(p=>p.map(x=>x.id===t.id?{...x,status:next?"active":"inactive"}:x))}
                onArchive={reason=>{setArchiveReason(reason);setTransports(p=>p.filter(x=>x.id!==t.id));}}
                onDelete={async reason=>{
                  await permanentlyDelete("transports",t.id,reason);
                  writeLocalOnly(()=>setTransports(p=>p.filter(x=>x.id!==t.id)));
                }}
                deleteBlockers={blockersFor(t.id)}/>
            ))}</AnimatePresence>
          </motion.div>
        }
        </EntityGate>
      </main>
      <AnimatePresence>
        {deleteId&&<DeleteDialog onConfirm={reason=>{setArchiveReason(reason);setTransports(p=>p.filter(t=>t.id!==deleteId));setDeleteId(null);}} onCancel={()=>setDeleteId(null)}/>}
        {showModal&&<TransportModal initial={editTarget} seatFloor={editTarget?seatFloorFor(editTarget.id):0} onSave={handleSave} onClose={()=>setShowModal(false)} onDelete={editTarget?()=>{const id=editTarget.id;setShowModal(false);setDeleteId(id);}:undefined}/>}
      </AnimatePresence>
    </div>
  );
}
