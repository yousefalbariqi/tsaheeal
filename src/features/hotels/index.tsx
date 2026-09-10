import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Building2, MapPin, Star, Plus, Pencil, Trash2, Archive, X, Check,
  Wifi, UtensilsCrossed, ParkingCircle, Waves, Wind, Dumbbell, Coffee,
  ShieldCheck, BellRing, ImagePlus, ArrowRight, ChevronUp, ChevronDown, Film,
} from "lucide-react";
import { B } from "@/lib/theme";
import { useDebounced } from "@/lib/useDebounced";
import { EntityGate } from "@/components/States";
import { TabStrip } from "@/components/Tabs";
import type { MediaKind, HotelFeature, HotelReview, HotelMedia, RoomType, Hotel } from "@/types";
import { uid, newId} from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";
import { StatCard } from "@/components/StatCard";
import { PageHeader } from "@/components/PageHeader";
import { AppSelect } from "@/components/AppSelect";
import { DeleteDialog } from "@/components/DeleteDialog";
import { useStore } from "@/store/useStore";
import { setArchiveReason } from "@/data/repository";
import { useRole } from "@/lib/useRole";
import { toast } from "sonner";
import { Field } from "@/components/Field";
import { NumericInput } from "@/components/NumericInput";
import { onPickMedia } from "@/lib/mediaUpload";
import { sar, SAR } from "@/lib/money";
import { phoneError } from "@/lib/phone";
import { cleanHotelName, hasHotelPrefix, hotelDisplayName } from "@/lib/hotelName";
import { EntityActions } from "@/components/EntityActions";
import { permanentlyDelete } from "@/data/repository";
import { writeLocalOnly } from "@/store/useStore";
import { hotelReadiness, hotelCover, isPublished } from "./readiness";
import { useInternalSettings } from "@/data/useSettings";

const HOTEL_FEATURE_ICONS: Record<string, React.FC<{size?:number;style?:React.CSSProperties}>> = {
  wifi:Wifi, breakfast:Coffee, restaurant:UtensilsCrossed,
  pool:Waves, parking:ParkingCircle, gym:Dumbbell, ac:Wind, spa:ShieldCheck, room_service:BellRing,
};

const HOTEL_TYPE_OPTIONS = ["حافلة","رحلة VIP","طيران","فندق فقط"];

function HotelCardHero({name,city,stars,status,cover}:{name:string;city:string;stars:number;status:string;cover?:string}) {
  return (
    <div className="relative overflow-hidden" style={{height:160,background:B.primary}}>
      {cover
        ? <><img src={cover} alt="" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}/>
            <div className="absolute inset-0" style={{background:"linear-gradient(180deg,rgba(14,12,11,0.15) 0%,rgba(14,12,11,0.55) 100%)"}}/></>
        : <>
            <div className="absolute inset-0" style={{backgroundImage:`repeating-linear-gradient(45deg,rgba(192,134,44,0.045) 0px,rgba(192,134,44,0.045) 1px,transparent 1px,transparent 18px),repeating-linear-gradient(-45deg,rgba(192,134,44,0.045) 0px,rgba(192,134,44,0.045) 1px,transparent 1px,transparent 18px)`}}/>
            <div className="absolute inset-0" style={{background:"radial-gradient(ellipse at 30% 50%,rgba(60,40,10,0.5) 0%,rgba(21,76,72,0.92) 70%)"}}/>
            <div className="absolute inset-0 flex items-center justify-center" style={{userSelect:"none"}}>
              <span style={{fontFamily:"var(--font-app)",fontSize:88,fontWeight:800,color:"rgba(192,134,44,0.1)",lineHeight:1}}>{name.charAt(0)}</span>
            </div>
          </>}
      <div className="absolute top-0 inset-x-0" style={{height:3,background:`linear-gradient(90deg,${B.gold},${B.gold2},${B.gold})`}}/>
      <div className="absolute top-3 right-3"><StatusBadge status={status} entity="hotel"/></div>
      <div className="absolute top-3 left-3">
        <span className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full"
          style={{background:"rgba(14,12,11,0.7)",color:B.cream,border:"1px solid rgba(255,255,255,0.08)"}}>
          {city==="مكة"?"🕋":"🕌"} {city}
        </span>
      </div>
      <div className="absolute bottom-0 inset-x-0 flex items-end justify-between px-4 pb-3">
        <div className="flex items-center gap-0.5">
          {Array.from({length:5},(_,i)=><Star key={i} size={12} fill={i<stars?B.gold:"none"} stroke={i<stars?B.gold:"rgba(255,255,255,0.2)"}/>)}
        </div>
        <span className="text-xs font-bold" style={{color:"rgba(192,134,44,0.85)"}}>{stars} نجوم</span>
      </div>
    </div>
  );
}

function HotelCard({hotel,onEdit,actions}:{hotel:Hotel;onEdit:()=>void;actions?:React.ReactNode}) {
  /* الجاهزية تُقرأ في البطاقة لا في النموذج وحده: الفريق يريد أن يعرف
     أيّ الفنادق ناقصةٌ من القائمة، لا أن يفتح عشرةً ليكتشف واحداً. */
  const ready = hotelReadiness(hotel);
  return (
    <motion.div layout initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} exit={{opacity:0,scale:0.95}}
      whileHover={{y:-4}} transition={{duration:0.2}}
      className="rounded-2xl overflow-hidden flex flex-col"
      style={{background:"#fff",border:`1px solid ${B.border}`,boxShadow:"0 2px 12px -4px rgba(21,76,72,0.08)",transition:"box-shadow 0.2s"}}>
      <HotelCardHero name={cleanHotelName(hotel.name)} city={hotel.city} stars={hotel.stars} status={hotel.status}
        cover={hotelCover(hotel)}/>
      <div className="flex flex-col flex-1 px-5 pt-4 pb-4 gap-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-extrabold leading-snug" style={{color:B.black,fontSize:15,fontFamily:"var(--font-app)"}}>{hotelDisplayName(hotel.name)}</h3>
            <div className="flex items-center gap-1.5 mt-1 text-xs" style={{color:B.text2}}>
              <MapPin size={11} style={{color:B.gold}}/>
              <span>{hotel.district}</span>
            </div>
          </div>
          <span className="text-xs font-mono flex-shrink-0 px-2 py-0.5 rounded-lg mt-0.5"
            style={{background:B.bg,color:B.muted,border:`1px solid ${B.border}`,fontSize:10}}>{hotel.id}</span>
        </div>
        {hotel.features.length>0 && (
          <div className="flex flex-wrap gap-1.5">
            {hotel.features.slice(0,3).map(f=>{const Icon=HOTEL_FEATURE_ICONS[f.icon]??ShieldCheck;return(
              <span key={f.id} className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{background:B.bg,border:`1px solid ${B.border}`,color:B.text3}}>
                <Icon size={9} style={{color:B.gold}}/>{f.text}
              </span>
            );})}
            {hotel.features.length>3&&<span className="text-xs px-2.5 py-1 rounded-full" style={{background:B.bg,border:`1px solid ${B.border}`,color:B.muted}}>+{hotel.features.length-3}</span>}
          </div>
        )}
        {ready.fromPrice>0&&(
          <div className="text-xs font-bold" style={{color:B.text2}}>
            يبدأ من <span style={{color:"#8a6a08",fontFamily:"var(--font-app)"}}>{sar(ready.fromPrice)}</span> / الليلة للفرد
          </div>
        )}
        {/* ما ينقصه للنشر — بنصّه لا بنسبةٍ مجرّدة: «٤٠٪ مكتمل» لا تقول
            للموظف ما يفعله، و«غرفة بلا صورة» تقول. */}
        {ready.blockers.length>0&&(
          <div className="rounded-xl px-3 py-2 flex flex-col gap-1" style={{background:"#FBF3D6",border:"1px solid #EBD9A0"}}>
            <span className="text-xs font-bold" style={{color:"#8A6A08"}}>
              {isPublished(hotel.status)?"منشور وناقص":"ينقصه للنشر"} ({ready.blockers.length})
            </span>
            <span className="text-xs leading-relaxed" style={{color:"#6b5a2a"}}>
              {ready.blockers.map(b=>b.label).join(" · ")}
            </span>
          </div>
        )}
        <div className="mt-auto">
          {actions ?? (
            <button onClick={onEdit} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold cursor-pointer"
              style={{background:B.primary,color:B.cream,border:"none"}}><Pencil size={13}/>تعديل</button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Hotel Modal ─── */
const HOTEL_MEDIA_MAX = 8;
const HOTEL_MEDIA_CATS = [
  "الواجهة الخارجية","الاستقبال / اللوبي","الغرفة","دورة المياه",
  "المطعم / الإفطار","المسبح","الإطلالة","القرب من الحرم","المرافق العامة","أخرى",
];
const ROOM_MEDIA_MAX = 8;
const ROOM_MEDIA_CATS = ["عامة","السرير / النوم","دورة المياه","الإطلالة","المرافق","أخرى"];
type HotelTab="info"|"features"|"rooms"|"media"|"reviews";
function HotelModal({initial,onSave,onClose,onDelete}:{initial:Hotel|null;onSave:(h:Hotel)=>void;onClose:()=>void;onDelete?:()=>void}) {
  const isEdit=initial!==null;
  const [tab,setTab]=useState<HotelTab>("info");
  const [form,setForm]=useState<Hotel>(initial?{...initial,media:initial.media??[]}:{id:newId("HTL"),name:"",city:"مكة",stars:4,distanceM:0,district:"",phone:"",mapUrl:"",status:"draft",notes:"",features:[],roomTypes:[],tasaheelNote:"",reviews:[],media:[]});
  const settings=useInternalSettings();
  const featureOptions=settings.hotelFeatureOptions;
  const set=<K extends keyof Hotel>(k:K,v:Hotel[K])=>setForm(f=>({...f,[k]:v}));
  const addFeat=()=>{ const option=featureOptions[0]; set("features",[...form.features,{id:uid(),icon:option?.id??"wifi",text:option?.label??"واي فاي"}]); };
  const delFeat=(id:string)=>set("features",form.features.filter(f=>f.id!==id));
  const updFeat=(id:string,field:keyof HotelFeature,val:string)=>set("features",form.features.map(f=>f.id===id?{...f,[field]:val}:f));
  const chooseFeatIcon=(id:string,icon:string)=>{
    const next=featureOptions.find(option=>option.id===icon);
    set("features",form.features.map(feature=>{
      if(feature.id!==id) return feature;
      const current=featureOptions.find(option=>option.id===feature.icon);
      return {...feature,icon,text:!feature.text.trim()||feature.text===current?.label?(next?.label??feature.text):feature.text};
    }));
  };
  const addRoom=()=>set("roomTypes",[...form.roomTypes,{id:uid(),kind:"private",beds:1,pricePerNight:0}]);
  const delRoom=(id:string)=>set("roomTypes",form.roomTypes.filter(r=>r.id!==id));
  const updRoom=(id:string,field:keyof RoomType,val:any)=>set("roomTypes",form.roomTypes.map(r=>r.id===id?{...r,[field]:val}:r));
  const updRoomPhotos=(rid:string,fn:(ps:HotelMedia[])=>HotelMedia[])=>set("roomTypes",form.roomTypes.map(r=>r.id===rid?{...r,photos:fn(r.photos??[])}:r));
  const addRoomPhoto=(rid:string)=>updRoomPhotos(rid,ps=>ps.length>=ROOM_MEDIA_MAX?ps:[...ps,{id:uid(),kind:"image" as MediaKind,url:"",primary:!ps.some(p=>p.primary),category:ROOM_MEDIA_CATS[0]}]);
  const delRoomPhoto=(rid:string,pid:string)=>updRoomPhotos(rid,ps=>ps.filter(p=>p.id!==pid));
  const updRoomPhoto=(rid:string,pid:string,field:keyof HotelMedia,val:any)=>updRoomPhotos(rid,ps=>ps.map(p=>p.id===pid?{...p,[field]:val}:p));
  const setRoomPrimary=(rid:string,pid:string)=>updRoomPhotos(rid,ps=>ps.map(p=>({...p,primary:p.id===pid})));
  const moveRoomPhoto=(rid:string,pid:string,dir:-1|1)=>updRoomPhotos(rid,ps=>{const arr=[...ps];const i=arr.findIndex(p=>p.id===pid);const j=i+dir;if(j<0||j>=arr.length)return ps;[arr[i],arr[j]]=[arr[j],arr[i]];return arr;});
  const addReview=()=>set("reviews",[...form.reviews,{id:uid(),name:"",text:"",consent:false}]);
  const delReview=(id:string)=>set("reviews",form.reviews.filter(r=>r.id!==id));
  const updReview=(id:string,field:keyof HotelReview,val:any)=>set("reviews",form.reviews.map(r=>r.id===id?{...r,[field]:val}:r));
  const media=form.media??[];
  const addMedia=(kind:MediaKind)=>{ if(media.length>=HOTEL_MEDIA_MAX) return; set("media",[...media,{id:uid(),kind,url:"",primary:kind==="image"&&!media.some(m=>m.primary&&m.kind==="image"),category:kind==="image"?HOTEL_MEDIA_CATS[0]:""}]); };
  const delMedia=(id:string)=>set("media",media.filter(m=>m.id!==id));
  const updMedia=(id:string,field:keyof HotelMedia,val:any)=>set("media",media.map(m=>m.id===id?{...m,[field]:val}:m));
  const setPrimaryMedia=(id:string)=>set("media",media.map(m=>({...m,primary:m.id===id&&m.kind==="image"})));
  const moveMedia=(id:string,dir:-1|1)=>{const arr=[...media];const i=arr.findIndex(m=>m.id===id);const j=i+dir;if(j<0||j>=arr.length)return;[arr[i],arr[j]]=[arr[j],arr[i]];set("media",arr);};
  /* الجاهزية تُحسب من النموذج لحظةً بلحظة لا من السجل المحفوظ: الموظف
     يرى الشرط يُستوفى وهو يكتب، فلا يحفظ ثم يكتشف. */
  const ready = hotelReadiness(form);
  const nameError = hasHotelPrefix(form.name) ? "كلمة «فندق» تُضاف تلقائياً عند العرض — اكتب الاسم مجرَّداً" : null;
  const phoneMsg = phoneError(form.phone);

  /* حفظٌ واحدٌ لكل المسارات: يُنظَّف الاسم، ويُمنع النشر بنواقص.
     منعُ النشر هنا لا في القائمة وحدها: «نشط» تعني ظهور الفندق للعميل،
     ولا معنى لأن يظهر سكنٌ بلا سعر ولا صورة. */
  const submit = () => {
    const clean = { ...form, name: cleanHotelName(form.name) };
    if (isPublished(clean.status)) {
      const r = hotelReadiness(clean);
      if (!r.canPublish) {
        toast.error("لا يمكن نشر الفندق ناقصاً", {
          description: r.blockers.map(b=>b.label).join(" · "),
          duration: 9000,
        });
        setTab(r.blockers[0].tab as HotelTab);
        return;
      }
    }
    onSave(clean);
  };

  const inp="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none transition-all";
  const ist={borderColor:B.border,background:"#fff",color:B.black,fontFamily:"inherit"};
  const TABS:{id:HotelTab;label:string}[]=[{id:"info",label:"معلومات"},{id:"features",label:"المرافق"},{id:"rooms",label:"الغرف"},{id:"media",label:"الصور والفيديو"},{id:"reviews",label:"الآراء"}];
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6"
      style={{background:"rgba(14,12,11,0.78)",backdropFilter:"blur(4px)"}} onClick={onClose}>
      <motion.div initial={{opacity:0,y:40}} animate={{opacity:1,y:0}} exit={{opacity:0,y:40}}
        transition={{type:"spring",damping:30,stiffness:400}}
        className="w-full sm:rounded-2xl overflow-hidden flex flex-col"
        style={{maxWidth:660,maxHeight:"92vh",background:"#fff"}} onClick={e=>e.stopPropagation()}>
        <div className="relative px-6 pt-6 pb-0 flex-shrink-0" style={{background:B.primary}}>
          <div className="absolute top-0 inset-x-0 h-1" style={{background:`linear-gradient(90deg,${B.gold},${B.gold2},${B.gold})`}}/>
          <div className="flex items-start justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{background:"rgba(192,134,44,0.15)",border:"1px solid rgba(192,134,44,0.3)"}}>
                <Building2 size={18} style={{color:B.gold}}/>
              </div>
              <div>
                <h2 className="font-extrabold text-white" style={{fontSize:17,fontFamily:"var(--font-app)"}}>{isEdit?"تعديل الفندق":"إضافة فندق جديد"}</h2>
                <div className="text-xs mt-0.5" style={{color:B.muted}}>{isEdit?form.id:"معرّف تلقائي"}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {isEdit&&onDelete&&<button onClick={onDelete} title="أرشفة الفندق" aria-label="أرشفة الفندق" className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-bold cursor-pointer"
                style={{background:"rgba(138,106,8,0.2)",border:"1px solid rgba(232,217,168,.55)",color:"#F7E9AE"}}><Archive size={13}/>أرشفة</button>}
              <button onClick={onClose} aria-label="إغلاق النافذة" title="إغلاق" className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer"
                style={{background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.1)",color:"#7a7068"}}><X size={15}/></button>
            </div>
          </div>
          <TabStrip tabs={TABS} active={tab} onChange={t=>setTab(t)} tone="onDark" idPrefix="htl"/>
        </div>
        <div className="flex-1 overflow-y-auto p-6" style={{scrollbarWidth:"none"}}>
          <AnimatePresence mode="wait">
            {tab==="info"&&<motion.div role="tabpanel" id="htl-panel-info" aria-labelledby="htl-tab-info" key="info" initial={{opacity:0}} animate={{opacity:1}} transition={{duration:0.12}} className="flex flex-col gap-4">
              <div><Field label={<>اسم الفندق <span style={{color:B.gold}}>*</span> <span className="font-normal" style={{color:B.muted}}>(بلا كلمة «فندق»)</span></>}>
                     <input className={inp} style={ist} value={form.name} placeholder="مثال: دار الإيمان جراند"
                       onChange={e=>set("name",e.target.value)} onBlur={()=>set("name",cleanHotelName(form.name))}/>
                   </Field>
                   {nameError
                     ? <div className="text-xs font-bold mt-1.5" style={{color:"#B4530C"}}>{nameError}</div>
                     : form.name.trim()&&<div className="text-xs mt-1.5" style={{color:B.muted}}>يظهر للعميل: <b style={{color:B.text3}}>{hotelDisplayName(form.name)}</b></div>}
                   </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Field label="المدينة">
                       <AppSelect value={form.city} onChange={v=>set("city",v as Hotel["city"])} options={[{value:"مكة",label:"🕋 مكة"},{value:"المدينة",label:"🕌 المدينة"}]}/>
                     </Field></div>
                <div><Field label="التصنيف">
                       <AppSelect value={String(form.stars)} onChange={v=>set("stars",Number(v) as Hotel["stars"])} options={[{value:"5",label:"★★★★★"},{value:"4",label:"★★★★☆"},{value:"3",label:"★★★☆☆"},{value:"2",label:"★★☆☆☆"}]}/>
                     </Field></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Field label="الحي">
                       <input className={inp} style={ist} value={form.district} placeholder="أجياد" onChange={e=>set("district",e.target.value)}/>
                     </Field></div>
                <div><Field label="رقم تواصل الفندق">
                       <input className={inp} style={{...ist,direction:"ltr",textAlign:"left",borderColor:phoneMsg?"#F3C9C9":B.border}}
                         value={form.phone} placeholder="مثال: +966 12 543 7777" onChange={e=>set("phone",e.target.value)}/>
                     </Field>
                     {phoneMsg&&<div className="text-xs font-bold mt-1.5" style={{color:"#B4530C"}}>{phoneMsg}</div>}
                     </div>
              </div>
              <div><label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>رابط الموقع في خرائط Google</label>
                <div className="relative">
                  <MapPin size={15} style={{color:B.gold,position:"absolute",top:"50%",insetInlineStart:12,transform:"translateY(-50%)",pointerEvents:"none"}}/>
                  <input className={inp} style={{...ist,direction:"ltr",textAlign:"left",paddingInlineStart:36}} value={form.mapUrl} placeholder="https://maps.google.com/..." onChange={e=>set("mapUrl",e.target.value)}/>
                </div>
                {form.mapUrl&&<a href={form.mapUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold mt-1.5" style={{color:B.gold}}>فتح الموقع في خرائط Google<ArrowRight size={11}/></a>}
              </div>
              <div><label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>الحالة</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    {v:"draft"    as const, label:"مسودة",        hint:"لا يظهر للعميل", on:"#FBF3D6", fg:"#8A6A08", bd:"#EBD9A0"},
                    {v:"active"   as const, label:"نشط ومتاح",     hint:"يظهر للعميل",    on:"#E3F3E8", fg:"#1E7A44", bd:"#C4E4CE"},
                    {v:"inactive" as const, label:"متوقف مؤقتاً",  hint:"محجوب مؤقتاً",   on:"#FBE6E6", fg:"#BE2626", bd:"#F3C9C9"},
                  ]).map(o=>{
                    const on = form.status===o.v;
                    /* زرّ «نشط» يُعطَّل لا يُخفى: إخفاؤه يترك الموظف يبحث
                       عن النشر، وتعطيلُه مع سطر النواقص يقول لماذا. */
                    const locked = o.v==="active" && !ready.canPublish;
                    return (
                      <button key={o.v} onClick={()=>{ if(locked) return; set("status",o.v); }} disabled={locked}
                        title={locked?"أكمل النواقص أدناه قبل النشر":undefined}
                        className="flex flex-col items-start gap-0.5 py-2.5 px-3 rounded-xl font-bold text-sm"
                        style={{background:on?o.on:B.bg,color:on?o.fg:B.muted,border:`1.5px solid ${on?o.bd:B.border}`,
                          cursor:locked?"not-allowed":"pointer",opacity:locked?0.5:1}}>
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{background:on?o.fg:B.border}}/>{o.label}
                        </span>
                        <span className="text-xs font-normal" style={{color:on?o.fg:B.muted,opacity:.8}}>{o.hint}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* قائمة النواقص — الشرط المانع ثم التنبيه، وكلٌّ يقفز إلى تبويبه.
                  تُعرض دائماً لا عند الفشل فقط: الموظف يرى ما بقي قبل أن يحاول. */
              (ready.blockers.length>0||ready.warnings.length>0)&&(
                <div className="rounded-2xl p-4 flex flex-col gap-2.5"
                  style={{background:ready.canPublish?"#F7F4EC":"#FBF3D6",border:`1px solid ${ready.canPublish?B.border:"#EBD9A0"}`}}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold" style={{color:ready.canPublish?B.text3:"#8A6A08"}}>
                      {ready.canPublish?"جاهز للنشر — وبقيت تحسينات":`ينقصه ${ready.blockers.length} للنشر`}
                    </span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-md"
                      style={{background:"#fff",border:`1px solid ${B.border}`,color:B.text2,fontFamily:"var(--font-app)"}}>{ready.percent}%</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {[...ready.blockers,...ready.warnings].map(c=>(
                      <button key={c.key} onClick={()=>setTab(c.tab as HotelTab)}
                        className="flex items-center gap-2 text-xs font-semibold text-start cursor-pointer"
                        style={{background:"none",border:"none",padding:0,color:c.blocking?"#BE2626":B.text2}}>
                        <span className="w-4 h-4 rounded-md flex items-center justify-center flex-shrink-0"
                          style={{background:c.blocking?"#FBE6E6":"#fff",border:`1px solid ${c.blocking?"#F3C9C9":B.border}`,fontSize:9,color:c.blocking?"#BE2626":B.muted}}>
                          {c.blocking?"!":"·"}
                        </span>
                        {c.label}
                        <span style={{color:B.muted,fontWeight:400}}>— {c.blocking?"مطلوب":"مستحسن"}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div><Field label={<>رأي تساهيل <span className="font-normal" style={{color:B.muted}}>(يظهر للعميل)</span></>}>
                     <textarea className={inp} style={{...ist,resize:"vertical"}} rows={2} value={form.tasaheelNote} placeholder="ملاحظة الفريق..." onChange={e=>set("tasaheelNote",e.target.value)}/>
                   </Field></div>
              <div><Field label={<>ملاحظات داخلية للإدارة <span className="font-normal" style={{color:B.muted}}>(لا تظهر للعميل)</span></>}>
                     <textarea className={inp} style={{...ist,resize:"vertical",background:B.bg}} rows={2} value={form.notes} placeholder="ملاحظات خاصة بالفريق الداخلي فقط..." onChange={e=>set("notes",e.target.value)}/>
                   </Field></div>
            </motion.div>}
            {tab==="features"&&<motion.div role="tabpanel" id="htl-panel-features" aria-labelledby="htl-tab-features" key="features" initial={{opacity:0}} animate={{opacity:1}} transition={{duration:0.12}} className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="font-bold text-sm" style={{color:B.black}}>المرافق والمميزات</p>
                <button onClick={addFeat} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer"
                  style={{background:B.bg,border:`1px solid ${B.border}`,color:"#8a6a08"}}><Plus size={12}/>إضافة</button>
              </div>
              <AnimatePresence>{form.features.map(f=>(
                <motion.div key={f.id} initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}} className="flex gap-2 items-center">
                  <select aria-label="رمز المرفق" className="border rounded-xl px-2.5 py-2.5 text-sm cursor-pointer flex-shrink-0"
                    style={{borderColor:B.border,background:"#fff",color:B.black,width:150,fontFamily:"inherit"}}
                    value={f.icon} onChange={e=>chooseFeatIcon(f.id,e.target.value)}>
                    {!featureOptions.some(option=>option.id===f.icon)&&<option value={f.icon}>خيار محفوظ</option>}
                    {featureOptions.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}
                  </select>
                  <input className={`${inp} flex-1`} style={ist} value={f.text} placeholder="وصف إضافي للمرفق (اختياري)" onChange={e=>updFeat(f.id,"text",e.target.value)}/>
                  <button aria-label="حذف الميزة" title="حذف الميزة" onClick={()=>delFeat(f.id)} className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer flex-shrink-0"
                    style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}><X size={13}/></button>
                </motion.div>
              ))}</AnimatePresence>
              {form.features.length===0&&<div className="flex flex-col items-center py-12 rounded-2xl" style={{border:`2px dashed ${B.border}`,color:B.muted}}><Wifi size={28} style={{opacity:0.3,marginBottom:8}}/><p className="text-sm">لم تُضف مرافق بعد</p></div>}
            </motion.div>}
            {tab==="rooms"&&<motion.div role="tabpanel" id="htl-panel-rooms" aria-labelledby="htl-tab-rooms" key="rooms" initial={{opacity:0}} animate={{opacity:1}} transition={{duration:0.12}} className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="font-bold text-sm" style={{color:B.black}}>أنواع الغرف</p>
                <button onClick={addRoom} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer"
                  style={{background:B.primary,border:"none",color:B.cream}}><Plus size={12}/>إضافة غرفة</button>
              </div>
              <AnimatePresence>{form.roomTypes.map(r=>(
                <motion.div key={r.id} initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}
                  className="rounded-2xl p-4" style={{border:`1px solid ${B.border}`}}>
                  <div className="flex gap-3 items-end">
                    <div className="flex-1">
                      <label className="block text-xs font-bold mb-2" style={{color:B.muted}}>النوع</label>
                      <div className="flex gap-1 p-1 rounded-xl" style={{background:B.bg,border:`1px solid ${B.border}`}}>
                        {(["private","shared"] as const).map(k=>(
                          <button key={k} onClick={()=>updRoom(r.id,"kind",k)} className="flex-1 py-2 rounded-lg text-xs font-bold cursor-pointer"
                            style={{background:r.kind===k?B.primary:"transparent",color:r.kind===k?B.cream:B.muted,border:"none"}}>
                            {k==="private"?"خاصة":"مشتركة"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{width:80}}><Field label="الأسرّة" labelClass="block text-xs font-bold mb-2" labelStyle={{color:B.muted}}>
                                              <NumericInput min={1} className={inp} style={ist} value={r.beds} onValueChange={v=>updRoom(r.id,"beds",Number(v))}/>
                                            </Field></div>
                    <div style={{width:120}}><Field label={`${SAR} / ليلة`} labelClass="block text-xs font-bold mb-2" labelStyle={{color:B.muted}}>
                                               <NumericInput min={0} className={inp} style={{...ist,color:B.gold,fontWeight:800}} value={r.pricePerNight} onValueChange={v=>updRoom(r.id,"pricePerNight",Number(v))}/>
                                             </Field></div>
                    <button aria-label="حذف نوع الغرفة" title="حذف نوع الغرفة" onClick={()=>delRoom(r.id)} className="w-9 h-9 mb-0.5 rounded-xl flex items-center justify-center cursor-pointer"
                      style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}><X size={13}/></button>
                  </div>
                  <div className="mt-4 pt-4" style={{borderTop:`1px dashed ${B.border}`}}>
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      <p className="text-xs font-bold flex items-center gap-2" style={{color:B.text3}}>صور الغرفة
                        <span className="px-1.5 py-0.5 rounded-md" style={{background:(r.photos??[]).length>=ROOM_MEDIA_MAX?"#FBE6E6":B.bg,color:(r.photos??[]).length>=ROOM_MEDIA_MAX?"#BE2626":B.muted,border:`1px solid ${(r.photos??[]).length>=ROOM_MEDIA_MAX?"#F3C9C9":B.border}`}}>{(r.photos??[]).length} / {ROOM_MEDIA_MAX}</span>
                      </p>
                      <button onClick={()=>addRoomPhoto(r.id)} disabled={(r.photos??[]).length>=ROOM_MEDIA_MAX} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
                        style={{background:B.bg,border:`1px solid ${B.border}`,color:"#8a6a08",opacity:(r.photos??[]).length>=ROOM_MEDIA_MAX?0.6:1}}><ImagePlus size={12}/>إضافة صورة</button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(r.photos??[]).map((p,pi)=>(
                        <div key={p.id} className="rounded-xl p-2 flex flex-col gap-1.5" style={{width:150,border:`1px solid ${p.primary?B.gold:B.border}`,background:p.primary?"rgba(192,134,44,0.05)":"#fff"}}>
                          <label className="relative rounded-lg overflow-hidden flex items-center justify-center cursor-pointer" style={{height:84,border:`1px dashed ${B.border}`,background:B.bg}}>
                            {p.url?<img src={p.url} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<div className="flex flex-col items-center gap-0.5" style={{color:B.muted}}><ImagePlus size={18}/><span style={{fontSize:10}}>اختر صورة</span></div>}
                            <input type="file" accept="image/*" className="hidden" onChange={onPickMedia("hotel-rooms",url=>updRoomPhoto(r.id,p.id,"url",url))}/>
                          </label>
                          <div className="flex items-center justify-between gap-1">
                            <span className="px-1.5 py-0.5 rounded-md text-xs font-bold" style={{background:B.bg,color:B.text2,border:`1px solid ${B.border}`}}>#{pi+1}</span>
                            <button onClick={()=>setRoomPrimary(r.id,p.id)} className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold cursor-pointer" title={p.primary?"الصورة الأساسية":"اجعلها أساسية"}
                              style={{background:p.primary?"#FBF3D6":B.bg,color:p.primary?"#8A6A08":B.muted,border:`1px solid ${p.primary?"#EBD9A0":B.border}`}}><Star size={11}/>{p.primary?"أساسية":"تعيين"}</button>
                          </div>
                          <select value={p.category} onChange={e=>updRoomPhoto(r.id,p.id,"category",e.target.value)} className="border rounded-md px-2 py-1.5 text-xs cursor-pointer w-full"
                            style={{borderColor:B.border,background:"#fff",color:B.black,fontFamily:"inherit"}}>
                            {ROOM_MEDIA_CATS.map(c=><option key={c} value={c}>{c}</option>)}
                          </select>
                          <div className="flex items-center gap-1">
                            <button aria-label="تقديم الصورة في الترتيب" title="تقديم الصورة في الترتيب" onClick={()=>moveRoomPhoto(r.id,p.id,-1)} disabled={pi===0} className="flex-1 h-7 rounded-md flex items-center justify-center cursor-pointer" style={{background:B.bg,border:`1px solid ${B.border}`,color:pi===0?B.border:B.text2}}><ChevronUp size={13}/></button>
                            <button aria-label="تأخير الصورة في الترتيب" title="تأخير الصورة في الترتيب" onClick={()=>moveRoomPhoto(r.id,p.id,1)} disabled={pi===(r.photos??[]).length-1} className="flex-1 h-7 rounded-md flex items-center justify-center cursor-pointer" style={{background:B.bg,border:`1px solid ${B.border}`,color:pi===(r.photos??[]).length-1?B.border:B.text2}}><ChevronDown size={13}/></button>
                            <button aria-label="حذف صورة الغرفة" title="حذف صورة الغرفة" onClick={()=>delRoomPhoto(r.id,p.id)} className="flex-1 h-7 rounded-md flex items-center justify-center cursor-pointer" style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}><Trash2 size={12}/></button>
                          </div>
                        </div>
                      ))}
                      {(r.photos??[]).length===0&&<p className="text-xs py-2" style={{color:B.muted}}>لا توجد صور لهذه الغرفة بعد.</p>}
                    </div>
                  </div>
                </motion.div>
              ))}</AnimatePresence>
              {form.roomTypes.length===0&&<div className="flex flex-col items-center py-12 rounded-2xl" style={{border:`2px dashed ${B.border}`,color:B.muted}}><ImagePlus size={28} style={{opacity:0.3,marginBottom:8}}/><p className="text-sm">لم تُضف غرف بعد</p></div>}
            </motion.div>}
            {tab==="media"&&<motion.div role="tabpanel" id="htl-panel-media" aria-labelledby="htl-tab-media" key="media" initial={{opacity:0}} animate={{opacity:1}} transition={{duration:0.12}} className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="font-bold text-sm flex items-center gap-2" style={{color:B.black}}>الصور والفيديو
                  <span className="px-2 py-0.5 rounded-md text-xs font-bold" style={{background:media.length>=HOTEL_MEDIA_MAX?"#FBE6E6":B.bg,color:media.length>=HOTEL_MEDIA_MAX?"#BE2626":B.muted,border:`1px solid ${media.length>=HOTEL_MEDIA_MAX?"#F3C9C9":B.border}`}}>{media.length} / {HOTEL_MEDIA_MAX}</span>
                </p>
                <div className="flex items-center gap-2">
                  <button onClick={()=>addMedia("image")} disabled={media.length>=HOTEL_MEDIA_MAX} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer"
                    style={{background:media.length>=HOTEL_MEDIA_MAX?B.bg:B.black,border:"none",color:media.length>=HOTEL_MEDIA_MAX?B.muted:B.cream,opacity:media.length>=HOTEL_MEDIA_MAX?0.6:1}}><ImagePlus size={12}/>صورة</button>
                  <button onClick={()=>addMedia("video")} disabled={media.length>=HOTEL_MEDIA_MAX} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer"
                    style={{background:B.bg,border:`1px solid ${B.border}`,color:"#1E52C7",opacity:media.length>=HOTEL_MEDIA_MAX?0.6:1}}><Film size={12}/>فيديو</button>
                </div>
              </div>
              <p className="text-xs -mt-2" style={{color:B.muted}}>رتّب العناصر بالأسهم — أول صورة أساسية تظهر كغلاف الفندق.</p>
              <AnimatePresence>{media.map((m,idx)=>(
                <motion.div key={m.id} initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}
                  className="rounded-2xl p-3 flex gap-3" style={{border:`1px solid ${m.primary?B.gold:B.border}`,background:m.primary?"rgba(192,134,44,0.05)":"#fff"}}>
                  <label className="relative rounded-xl overflow-hidden flex items-center justify-center cursor-pointer flex-shrink-0" style={{width:88,height:88,border:`1px dashed ${B.border}`,background:B.bg}}>
                    {m.url
                      ? (m.kind==="image"
                          ? <img src={m.url} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                          : <video src={m.url} style={{width:"100%",height:"100%",objectFit:"cover"}}/>)
                      : <div className="flex flex-col items-center gap-1" style={{color:B.muted}}>{m.kind==="image"?<ImagePlus size={20}/>:<Film size={20}/>}<span style={{fontSize:10}}>اختر ملفاً</span></div>}
                    <input type="file" accept={m.kind==="image"?"image/*":"video/*"} className="hidden" onChange={onPickMedia("hotels",url=>updMedia(m.id,"url",url))}/>
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
                          {HOTEL_MEDIA_CATS.map(c=><option key={c} value={c}>{c}</option>)}
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
            {tab==="reviews"&&<motion.div role="tabpanel" id="htl-panel-reviews" aria-labelledby="htl-tab-reviews" key="reviews" initial={{opacity:0}} animate={{opacity:1}} transition={{duration:0.12}} className="flex flex-col gap-4">
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
                    <textarea className={inp} style={{...ist,resize:"vertical"}} rows={2} value={rv.text} placeholder="ماذا قال؟" onChange={e=>updReview(rv.id,"text",e.target.value)}/>
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
                        <Check size={11}/>{rv.consent?"تم الحصول على الإذن":"في انتظار الإذن"}
                      </button>
                      <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
                        style={{background:B.bg,color:"#8a6a08",border:`1px solid ${B.border}`}}>
                        <ImagePlus size={12}/>{rv.image?"تغيير الصورة":"إرفاق صورة"}
                        <input type="file" accept="image/*" className="hidden" onChange={onPickMedia("hotel-reviews",url=>updReview(rv.id,"image",url))}/>
                      </label>
                    </div>
                  </div>
                  <button aria-label="حذف الرأي" title="حذف الرأي" onClick={()=>delReview(rv.id)} className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer mt-0.5"
                    style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}><X size={12}/></button>
                </motion.div>
              ))}</AnimatePresence>
              {form.reviews.length===0&&<div className="flex flex-col items-center py-12 rounded-2xl" style={{border:`2px dashed ${B.border}`,color:B.muted}}><Star size={28} style={{opacity:0.3,marginBottom:8}}/><p className="text-sm">لا توجد آراء بعد</p></div>}
            </motion.div>}
          </AnimatePresence>
        </div>
        <div className="flex gap-3 px-6 py-4 flex-shrink-0" style={{borderTop:`1px solid ${B.border}`}}>
          <button onClick={submit} className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold cursor-pointer"
            style={{background:B.gold,color:B.black,border:"none"}}><Check size={14}/>حفظ الفندق</button>
          <button onClick={onClose} className="px-5 py-3 rounded-xl text-sm font-bold cursor-pointer"
            style={{background:B.bg,color:B.text2,border:"none"}}>إلغاء</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─── Hotels Page ─── */
export function HotelsPage({onMenuOpen}:{onMenuOpen?:()=>void}={}) {
  /* بوابة الكتابة — مرآة can_write_admin() في القاعدة. كل نقاط فتح
     نموذج التعديل تمرّ من هنا، فالموظف لا يملأ نموذجاً ليُرفض في آخره. */
  const { canWrite, isAdmin } = useRole();
  const mayWrite = canWrite("hotels");
  const openForm = (t: any) => {
    if (!mayWrite) {
      toast.error("لا تملك صلاحية التعديل", { description: "هذه الشاشة يكتبها مدير النظام وحده." });
      return;
    }
    setEditTarget(t); setShowModal(true);
  };
  const hotels=useStore(s=>s.hotels); const setHotels=useStore(s=>s.setHotels);
  /* الارتباط يُفحَص قبل الحذف لا بعده: فندقٌ تحمله باقةٌ منشورة حذفُه
     يترك مرجعاً معلَّقاً يقرؤه العميل «سكن غير متوفّر». */
  const packages=useStore(s=>s.packages);
  const trips=useStore(s=>s.trips);
  const deleteBlockersFor=(id:string):string[]=>{
    const pk=packages.filter(p=>p.hotelId===id).length;
    const tr=trips.filter(t=>t.hotelId===id).length;
    const out:string[]=[];
    if(pk) out.push(`مرتبط بـ${pk} ${pk===1?"باقة":"باقات"}`);
    if(tr) out.push(`مرتبط بـ${tr} ${tr===1?"رحلة":"رحلات"}`);
    return out;
  };
  const [showModal,setShowModal]=useState(false);
  const [editTarget,setEditTarget]=useState<Hotel|null>(null);
  const [search,setSearch]=useState("");
  /* التصفية على القيمة الساكنة لا على كل ضغطة مفتاح. */
  const query = useDebounced(search);
  const [cityFilter,setCityFilter]=useState<"all"|"مكة"|"المدينة">("all");
  const [statusFilter,setStatusFilter]=useState<"all"|"draft"|"active"|"inactive">("all");
  const [deleteId,setDeleteId]=useState<string|null>(null);
  /* البحث يُطبَّع طرفيه: من كتب «فندق ايلاف» يجب أن يجد «ايلاف». */
  const nq=cleanHotelName(query);
  const filtered=hotels.filter(h=>(!nq||cleanHotelName(h.name).includes(nq)||h.id.toLowerCase().includes(nq.toLowerCase())||h.district.includes(nq)||h.phone.includes(nq))&&(cityFilter==="all"||h.city===cityFilter)&&(statusFilter==="all"||h.status===statusFilter));
  const stats={
    total:hotels.length,
    active:hotels.filter(h=>h.status==="active").length,
    draft:hotels.filter(h=>h.status==="draft").length,
    /* «منشور وناقص» — الفنادق التي يراها العميل وفيها شرطٌ مانع.
       أهمّ رقمٍ في الشاشة: هذه هي التي تُنتج شكوى عميل. */
    incomplete:hotels.filter(h=>h.status==="active"&&!hotelReadiness(h).canPublish).length,
    mecca:hotels.filter(h=>h.city==="مكة").length,
  };
  function handleSave(h:Hotel){setHotels(p=>editTarget?p.map(x=>x.id===h.id?h:x):[h,...p]);setShowModal(false);}
  const fb=(on:boolean)=>({padding:"6px 14px",borderRadius:999,fontSize:13,fontWeight:700,cursor:"pointer" as const,border:`1px solid ${on?B.gold:B.border}`,background:on?B.primary:"#fff",color:on?B.gold:B.text2,transition:"all 0.15s"});
  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{background:B.bg}}>
      <PageHeader title="الفنادق" crumb="إدارة الفنادق" search={search} onSearch={setSearch} onMenuOpen={onMenuOpen}/>
      <div className="px-4 md:px-8 pt-4 md:pt-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="إجمالي الفنادق" value={stats.total} sub="في النظام" accent/>
          <StatCard label="منشورة للعميل" value={stats.active} sub={`${stats.total-stats.active} غير منشورة`}/>
          <StatCard label="مسودات" value={stats.draft} sub="بانتظار الإكمال"/>
          <StatCard label="منشورة وناقصة" value={stats.incomplete} sub={stats.incomplete?"تحتاج مراجعة الآن":"لا شيء ناقص"}/>
        </div>
        <div className="flex items-center justify-between gap-3 mt-5 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 p-1 rounded-xl" style={{background:"#fff",border:`1px solid ${B.border}`}}>
              <button style={fb(statusFilter==="all")} onClick={()=>setStatusFilter("all")}>الكل</button>
              <button style={fb(statusFilter==="active")} onClick={()=>setStatusFilter("active")}>نشط</button>
              <button style={fb(statusFilter==="draft")} onClick={()=>setStatusFilter("draft")}>مسودة</button>
              <button style={fb(statusFilter==="inactive")} onClick={()=>setStatusFilter("inactive")}>متوقف</button>
            </div>
            <div className="flex items-center gap-1 p-1 rounded-xl" style={{background:"#fff",border:`1px solid ${B.border}`}}>
              <button style={fb(cityFilter==="all")} onClick={()=>setCityFilter("all")}>كل المدن</button>
              <button style={fb(cityFilter==="مكة")} onClick={()=>setCityFilter("مكة")}>🕋 مكة</button>
              <button style={fb(cityFilter==="المدينة")} onClick={()=>setCityFilter("المدينة")}>🕌 المدينة</button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm" style={{color:B.muted}}><b style={{color:B.black}}>{filtered.length}</b> / {hotels.length}</span>
            {/* زرّ الإضافة يُخفى لا يُعطَّل: زرٌّ مرئي يعد بعملٍ لا يُنجَز. */}
            {mayWrite && (
            <button onClick={()=>{openForm(null);}} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer"
              style={{background:B.gold,color:B.black,border:"none",boxShadow:"0 4px 12px rgba(192,134,44,0.35)"}}>
              <Plus size={15}/>إضافة فندق
            </button>
            )}
          </div>
        </div>
        <div className="mt-5" style={{height:1,background:B.border}}/>
      </div>
      <main className="flex-1 px-4 md:px-8 pb-10 pt-6">
        <EntityGate entity="hotels" label="الفنادق" skeleton="cards">
        {filtered.length===0
          ?<motion.div initial={{opacity:0}} animate={{opacity:1}} className="flex flex-col items-center justify-center py-24 rounded-2xl" style={{background:"#fff",border:`1px solid ${B.border}`}}>
            <Building2 size={44} style={{opacity:0.2,color:B.gold,marginBottom:12}}/><p className="font-bold" style={{color:B.black}}>لا توجد فنادق مطابقة</p>
          </motion.div>
          :<motion.div layout className="grid gap-5" style={{gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))"}}>
            <AnimatePresence>{filtered.map(h=>(
              <HotelCard key={h.id} hotel={h} onEdit={()=>{openForm(h);}}
                actions={
                  <EntityActions
                    name={hotelDisplayName(h.name)} label="الفندق"
                    canWrite={mayWrite} isAdmin={isAdmin}
                    onEdit={()=>{openForm(h);}}
                    active={h.status==="active"}
                    disableLabel="إيقاف مؤقت"
                    /* التعطيل لا يمرّ بالجاهزية: إيقافُ فندقٍ ناقص مطلوبٌ
                       دائماً، والتنشيط هو المحروس. */
                    onToggleActive={next=>{
                      if(next){
                        const r=hotelReadiness(h);
                        if(!r.canPublish){
                          toast.error("لا يمكن نشر الفندق ناقصاً",{description:r.blockers.map(b=>b.label).join(" · "),duration:9000});
                          return;
                        }
                      }
                      setHotels(p=>p.map(x=>x.id===h.id?{...x,status:next?"active":"inactive"}:x));
                      toast.success(next?"نُشر الفندق":"أُوقف الفندق مؤقتاً");
                    }}
                    onArchive={reason=>{ setArchiveReason(reason); setHotels(p=>p.filter(x=>x.id!==h.id)); toast.success("أُرشف الفندق"); }}
                    deleteBlockers={deleteBlockersFor(h.id)}
                    /* الحذف النهائي ينادي الدالّة أولاً ثم يُنزع الصفّ محلياً
                       بلا مزامنة — وإلّا قرأت المزامنة الغياب أرشفةً. */
                    onPermanentDelete={async reason=>{
                      await permanentlyDelete("hotels",h.id,reason);
                      writeLocalOnly(()=>setHotels(p=>p.filter(x=>x.id!==h.id)));
                    }}
                  />
                }/>
            ))}</AnimatePresence>
          </motion.div>
        }
        </EntityGate>
      </main>
      <AnimatePresence>
        {deleteId&&<DeleteDialog onConfirm={reason=>{setArchiveReason(reason);setHotels(p=>p.filter(h=>h.id!==deleteId));setDeleteId(null);}} onCancel={()=>setDeleteId(null)}/>}
        {showModal&&<HotelModal initial={editTarget} onSave={handleSave} onClose={()=>setShowModal(false)} onDelete={editTarget?()=>{const id=editTarget.id;setShowModal(false);setDeleteId(id);}:undefined}/>}
      </AnimatePresence>
    </div>
  );
}
