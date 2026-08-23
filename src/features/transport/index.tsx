import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Armchair, Car, Pencil, Trash2, X, Plus, Wrench,
  ImagePlus, Film, Star, ChevronUp, ChevronDown, Check, Bus,
} from "lucide-react";
import { B } from "@/lib/theme";
import type { VehicleMode, VehicleStatus, MediaKind, HotelMedia, TransportFeature, TransportReview, Transport } from "@/types";
import { uid, newId} from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";
import { StatCard } from "@/components/StatCard";
import { PageHeader } from "@/components/PageHeader";
import { AppSelect } from "@/components/AppSelect";
import { DeleteDialog } from "@/components/DeleteDialog";
import { useStore } from "@/store/useStore";
import { useRole } from "@/lib/useRole";
import { toast } from "sonner";

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
        <StatusBadge status={status}/>
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
function TransportCard({tr,onEdit}:{tr:Transport;onEdit:()=>void}) {
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
        <div className="flex gap-2 mt-auto">
          <button onClick={onEdit} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold cursor-pointer"
            style={{background:B.primary,color:B.cream,border:"none"}}><Pencil size={13}/>تعديل</button>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Transport Modal ─── */
const TRANSPORT_MEDIA_MAX = 8;
const TRANSPORT_MEDIA_CATS = ["المظهر الخارجي","المقاعد الداخلية","لوحة القيادة","وسائل الراحة","الأمتعة","أخرى"];
type TrTab="info"|"features"|"media"|"reviews";
function TransportModal({initial,onSave,onClose,onDelete}:{initial:Transport|null;onSave:(t:Transport)=>void;onClose:()=>void;onDelete?:()=>void}) {
  const isEdit=initial!==null;
  const [tab,setTab]=useState<TrTab>("info");
  const [form,setForm]=useState<Transport>(initial?{...initial,media:initial.media??[]}:{id:newId("TRN"),name:"",mode:"bus",vehicleType:"حافلة عادية",seats:49,seatCost:0,model:"",year:"",plate:"",driver:"",supervisor:"",status:"active",notes:"",features:[],reviews:[],media:[]});
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
  const TABS:{id:TrTab;label:string}[]=[{id:"info",label:"المعلومات"},{id:"features",label:"المواصفات"},{id:"media",label:"الصور والفيديو"},{id:"reviews",label:"الآراء"}];
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
              {isEdit&&onDelete&&<button onClick={onDelete} title="حذف المواصلة" className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-bold cursor-pointer"
                style={{background:"rgba(190,38,38,0.15)",border:"1px solid rgba(190,38,38,0.4)",color:"#F3C9C9"}}><Trash2 size={13}/>حذف</button>}
              <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer"
                style={{background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.1)",color:"#7a7068"}}><X size={15}/></button>
            </div>
          </div>
          <div className="flex gap-1">
            {TABS.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} className="relative px-4 py-2.5 text-xs font-bold cursor-pointer rounded-t-lg"
                style={{background:tab===t.id?"#fff":"transparent",color:tab===t.id?B.black:"#CFC5B6",border:"none"}}>
                {t.label}
                {tab===t.id&&<motion.div layoutId="trtab" className="absolute inset-x-0 top-0 h-0.5" style={{background:B.gold}}/>}
              </button>
            ))}
          </div>
        </div>
        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6" style={{scrollbarWidth:"none"}}>
          <AnimatePresence mode="wait">
            {tab==="info"&&<motion.div key="ti" initial={{opacity:0,x:10}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-10}} className="flex flex-col gap-4">
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
              <div><label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>الاسم <span style={{color:B.gold}}>*</span></label>
                <input className={inp} style={ist} value={form.name} placeholder="مثال: حافلة الحرمين 1" onChange={e=>set("name",e.target.value)}/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>النوع</label>
                  <AppSelect value={form.vehicleType} onChange={v=>set("vehicleType",v)} options={typeOptions.map(o=>({value:o,label:o}))}/>
                </div>
                <div><label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>عدد المقاعد</label>
                  <input type="number" min={1} className={inp} style={ist} value={form.seats} onChange={e=>set("seats",Number(e.target.value))}/></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>تكلفة المقعد (ر.س) <span style={{color:B.gold}}>*</span></label>
                  <input type="number" min={0} className={inp} style={{...ist,color:B.gold,fontWeight:800,fontFamily:"var(--font-app)"}} value={form.seatCost} onChange={e=>set("seatCost",Number(e.target.value))}/></div>
                <div><label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>{form.mode==="bus"?"الشركة / الموديل":"شركة الطيران"}</label>
                  <input className={inp} style={ist} value={form.model} placeholder={form.mode==="bus"?"مرسيدس توريزمو":"طيران ناس"} onChange={e=>set("model",e.target.value)}/></div>
              </div>
              <div><label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>سنة التصنيع</label>
                <input type="number" min={1990} max={2030} className={inp} style={ist} value={form.year} placeholder="2024" onChange={e=>set("year",e.target.value)}/></div>
              <div><label className="block text-xs font-bold mb-2" style={{color:B.text3}}>الحالة</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["active","inactive"] as const).map(s=>(
                    <button key={s} onClick={()=>set("status",s)} className="flex items-center gap-2 py-3 px-4 rounded-xl font-bold text-sm cursor-pointer"
                      style={{background:form.status===s?(s==="active"?"#E3F3E8":"#FBE6E6"):B.bg,color:form.status===s?(s==="active"?"#1E7A44":"#BE2626"):B.muted,border:`1.5px solid ${form.status===s?(s==="active"?"#C4E4CE":"#F3C9C9"):B.border}`}}>
                      <span className="w-2 h-2 rounded-full" style={{background:form.status===s?(s==="active"?"#1E7A44":"#BE2626"):B.border}}/>{s==="active"?"نشطة ومتاحة":"متوقفة"}
                    </button>
                  ))}
                </div>
              </div>
              {/* Live preview */}
              <div className="rounded-xl p-4" style={{background:`linear-gradient(135deg,${B.primary} 0%,${B.primaryDeep} 100%)`,border:"1px solid rgba(192,134,44,0.25)"}}>
                <div className="text-xs font-bold mb-3" style={{color:B.muted}}>معاينة سريعة</div>
                <div className="grid grid-cols-3 gap-3">
                  <div><div className="text-xs" style={{color:B.muted}}>المقاعد</div><div className="text-lg font-bold" style={{color:B.cream}}>{form.seats||"—"}</div></div>
                  <div><div className="text-xs" style={{color:B.muted}}>تكلفة المقعد</div><div className="text-lg font-bold" style={{color:B.gold}}>{form.seatCost||"—"} <span className="text-xs" style={{color:B.gold2}}>ر.س</span></div></div>
                  <div><div className="text-xs" style={{color:B.muted}}>الطاقة الكاملة</div><div className="text-lg font-bold" style={{color:B.cream}}>{((form.seats||0)*(form.seatCost||0)).toLocaleString()} <span className="text-xs" style={{color:B.muted}}>ر.س</span></div></div>
                </div>
              </div>
            </motion.div>}
            {tab==="features"&&<motion.div key="tf" initial={{opacity:0,x:10}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-10}} className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div><p className="font-bold text-sm" style={{color:B.black}}>مواصفات المركبة</p>
                  <p className="text-xs mt-0.5" style={{color:B.muted}}>ما يميزها — تُعرض للعميل</p></div>
                <button onClick={addFeat} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer"
                  style={{background:B.bg,border:`1px solid ${B.border}`,color:"#8a6a08"}}><Plus size={12}/>إضافة</button>
              </div>
              <AnimatePresence>{form.features.map(f=>(
                <motion.div key={f.id} initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}} className="flex gap-2 items-center">
                  <select className="border rounded-xl px-2.5 py-2.5 text-sm cursor-pointer flex-shrink-0"
                    style={{borderColor:B.border,background:"#fff",color:B.black,width:160,fontFamily:"inherit"}}
                    value={f.icon||"ac"} onChange={e=>updFeat(f.id,"icon",e.target.value)}>
                    <option value="ac">❄️ تكييف</option><option value="wifi">📶 واي فاي</option>
                    <option value="screen">📺 شاشات</option><option value="meal">🍽️ وجبات</option>
                    <option value="drink">☕ مشروبات</option><option value="wc">🚻 دورة مياه</option>
                    <option value="seat">💺 مقاعد مريحة</option><option value="charge">🔌 منافذ شحن</option>
                    <option value="luggage">🧳 أمتعة</option><option value="other">⭐ أخرى</option>
                  </select>
                  <input className={`${inp} flex-1`} style={ist} value={f.text} placeholder="مثال: مكيف هواء" onChange={e=>updFeat(f.id,"text",e.target.value)}/>
                  <button onClick={()=>delFeat(f.id)} className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer flex-shrink-0"
                    style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}><X size={13}/></button>
                </motion.div>
              ))}</AnimatePresence>
              {form.features.length===0&&<div className="flex flex-col items-center py-12 rounded-2xl" style={{border:`2px dashed ${B.border}`,color:B.muted}}><Wrench size={28} style={{opacity:0.3,marginBottom:8}}/><p className="text-sm">لم تُضف مواصفات بعد</p></div>}
            </motion.div>}
            {tab==="media"&&<motion.div key="tmd" initial={{opacity:0,x:10}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-10}} className="flex flex-col gap-4">
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
                    <input type="file" accept={m.kind==="image"?"image/*":"video/*"} className="hidden" onChange={e=>{const file=e.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=()=>updMedia(m.id,"url",reader.result as string);reader.readAsDataURL(file);e.target.value="";}}/>
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
                    <button onClick={()=>moveMedia(m.id,-1)} disabled={idx===0} className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer"
                      style={{background:B.bg,border:`1px solid ${B.border}`,color:idx===0?B.border:B.text2}}><ChevronUp size={14}/></button>
                    <button onClick={()=>moveMedia(m.id,1)} disabled={idx===media.length-1} className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer"
                      style={{background:B.bg,border:`1px solid ${B.border}`,color:idx===media.length-1?B.border:B.text2}}><ChevronDown size={14}/></button>
                    <button onClick={()=>delMedia(m.id)} className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer"
                      style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}><Trash2 size={13}/></button>
                  </div>
                </motion.div>
              ))}</AnimatePresence>
              {media.length===0&&<div className="flex flex-col items-center py-12 rounded-2xl" style={{border:`2px dashed ${B.border}`,color:B.muted}}><ImagePlus size={28} style={{opacity:0.3,marginBottom:8}}/><p className="text-sm">لم تُضف صور أو فيديو بعد</p></div>}
            </motion.div>}
            {tab==="reviews"&&<motion.div key="trv" initial={{opacity:0,x:10}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-10}} className="flex flex-col gap-4">
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
                        <button onClick={()=>updReview(rv.id,"image",undefined)} className="absolute top-1 left-1 w-6 h-6 rounded-lg flex items-center justify-center cursor-pointer"
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
                        <input type="file" accept="image/*" className="hidden" onChange={e=>{const file=e.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=()=>updReview(rv.id,"image",reader.result as string);reader.readAsDataURL(file);e.target.value="";}}/>
                      </label>
                    </div>
                  </div>
                  <button onClick={()=>delReview(rv.id)} className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer mt-0.5"
                    style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}><X size={12}/></button>
                </motion.div>
              ))}</AnimatePresence>
              {form.reviews.length===0&&<div className="flex flex-col items-center py-12 rounded-2xl" style={{border:`2px dashed ${B.border}`,color:B.muted}}><Star size={28} style={{opacity:0.3,marginBottom:8}}/><p className="text-sm">لا توجد آراء</p></div>}
            </motion.div>}
          </AnimatePresence>
        </div>
        <div className="flex gap-3 px-6 py-4 flex-shrink-0" style={{borderTop:`1px solid ${B.border}`}}>
          <button onClick={()=>onSave(form)} className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold cursor-pointer"
            style={{background:B.gold,color:B.black,border:"none"}}><Check size={14}/>حفظ المواصلة</button>
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
  const { canWrite } = useRole();
  const mayWrite = canWrite("transport");
  const openForm = (t: any) => {
    if (!mayWrite) {
      toast.error("لا تملك صلاحية التعديل", { description: "هذه الشاشة يكتبها مدير النظام وحده." });
      return;
    }
    setEditTarget(t); setShowModal(true);
  };
  const transports=useStore(s=>s.transports); const setTransports=useStore(s=>s.setTransports);
  const [showModal,setShowModal]=useState(false);
  const [editTarget,setEditTarget]=useState<Transport|null>(null);
  const [search,setSearch]=useState("");
  const [modeFilter,setModeFilter]=useState<"all"|"bus"|"flight">("all");
  const [statusFilter,setStatusFilter]=useState<"all"|"active"|"inactive">("all");
  const [deleteId,setDeleteId]=useState<string|null>(null);
  const filtered=transports.filter(t=>
    (!search||t.name.includes(search)||t.id.toLowerCase().includes(search.toLowerCase())||t.model.includes(search))&&
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
          <StatCard label="إجمالي عدد المقاعد المحجوزة" value={stats.totalSeats.toLocaleString()} sub="طاقة استيعابية"/>
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
        {filtered.length===0
          ?<motion.div initial={{opacity:0}} animate={{opacity:1}} className="flex flex-col items-center justify-center py-24 rounded-2xl" style={{background:"#fff",border:`1px solid ${B.border}`}}>
            <Bus size={44} style={{opacity:0.2,color:B.gold,marginBottom:12}}/><p className="font-bold" style={{color:B.black}}>لا توجد مواصلات مطابقة</p>
          </motion.div>
          :<motion.div layout className="grid gap-5" style={{gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))"}}>
            <AnimatePresence>{filtered.map(t=><TransportCard key={t.id} tr={t} onEdit={()=>{openForm(t);}}/>)}</AnimatePresence>
          </motion.div>
        }
      </main>
      <AnimatePresence>
        {deleteId&&<DeleteDialog onConfirm={()=>{setTransports(p=>p.filter(t=>t.id!==deleteId));setDeleteId(null);}} onCancel={()=>setDeleteId(null)}/>}
        {showModal&&<TransportModal initial={editTarget} onSave={handleSave} onClose={()=>setShowModal(false)} onDelete={editTarget?()=>{const id=editTarget.id;setShowModal(false);setDeleteId(id);}:undefined}/>}
      </AnimatePresence>
    </div>
  );
}
