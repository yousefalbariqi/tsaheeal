import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Building2, MapPin, Star, Plus, Pencil, Trash2, X, Check,
  Wifi, UtensilsCrossed, ParkingCircle, Waves, Wind, Dumbbell, Coffee,
  ShieldCheck, BellRing, ImagePlus, ArrowRight, ChevronUp, ChevronDown, Film,
} from "lucide-react";
import { B } from "@/lib/theme";
import type { MediaKind, HotelFeature, HotelReview, HotelMedia, RoomType, Hotel } from "@/types";
import { uid, formatKmValue, parseKmToMeters, distanceLabel } from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";
import { StatCard } from "@/components/StatCard";
import { PageHeader } from "@/components/PageHeader";
import { DeleteDialog } from "@/components/DeleteDialog";
import { useStore } from "@/store/useStore";

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
              <span style={{fontFamily:"'Noto Kufi Arabic',serif",fontSize:88,fontWeight:800,color:"rgba(192,134,44,0.1)",lineHeight:1}}>{name.charAt(0)}</span>
            </div>
          </>}
      <div className="absolute top-0 inset-x-0" style={{height:3,background:`linear-gradient(90deg,${B.gold},${B.gold2},${B.gold})`}}/>
      <div className="absolute top-3 right-3"><StatusBadge status={status}/></div>
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

function HotelCard({hotel,onEdit}:{hotel:Hotel;onEdit:()=>void}) {
  return (
    <motion.div layout initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} exit={{opacity:0,scale:0.95}}
      whileHover={{y:-4}} transition={{duration:0.2}}
      className="rounded-2xl overflow-hidden flex flex-col"
      style={{background:"#fff",border:`1px solid ${B.border}`,boxShadow:"0 2px 12px -4px rgba(21,76,72,0.08)",transition:"box-shadow 0.2s"}}>
      <HotelCardHero name={hotel.name} city={hotel.city} stars={hotel.stars} status={hotel.status}
        cover={hotel.media?.find(m=>m.primary&&m.kind==="image")?.url||hotel.media?.find(m=>m.kind==="image")?.url}/>
      <div className="flex flex-col flex-1 px-5 pt-4 pb-4 gap-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-extrabold leading-snug" style={{color:B.black,fontSize:15,fontFamily:"'Noto Kufi Arabic',serif"}}>فندق {hotel.name}</h3>
            <div className="flex items-center gap-1.5 mt-1 text-xs" style={{color:B.text2}}>
              <MapPin size={11} style={{color:B.gold}}/>
              <span>{hotel.district}</span>
              <span style={{color:B.border}}>·</span>
              <span>{distanceLabel(hotel.distanceM)}</span>
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
        <div className="flex gap-2 mt-auto">
          <button onClick={onEdit} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold cursor-pointer"
            style={{background:B.primary,color:B.cream,border:"none"}}><Pencil size={13}/>تعديل</button>
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
  const [form,setForm]=useState<Hotel>(initial?{...initial,media:initial.media??[]}:{id:`HTL-${String(Date.now()).slice(-4)}`,name:"",city:"مكة",stars:4,distanceM:500,district:"",phone:"",mapUrl:"",status:"active",notes:"",features:[],roomTypes:[],tasaheelNote:"",reviews:[],media:[]});
  const [distanceKmInput,setDistanceKmInput]=useState(()=>formatKmValue(initial?.distanceM??500));
  const set=<K extends keyof Hotel>(k:K,v:Hotel[K])=>setForm(f=>({...f,[k]:v}));
  const handleDistanceChange = (value:string) => {
    if (!/^[0-9]*[.,]?[0-9]*$/.test(value)) return;
    setDistanceKmInput(value);
    const meters = parseKmToMeters(value);
    if (meters!==null) set("distanceM",meters);
  };
  const handleDistanceBlur = () => {
    const meters = parseKmToMeters(distanceKmInput);
    if (meters===null) {
      set("distanceM",0);
      setDistanceKmInput("0");
      return;
    }
    set("distanceM",meters);
    setDistanceKmInput(formatKmValue(meters));
  };
  const addFeat=()=>set("features",[...form.features,{id:uid(),icon:"wifi",text:""}]);
  const delFeat=(id:string)=>set("features",form.features.filter(f=>f.id!==id));
  const updFeat=(id:string,field:keyof HotelFeature,val:string)=>set("features",form.features.map(f=>f.id===id?{...f,[field]:val}:f));
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
                <h2 className="font-extrabold text-white" style={{fontSize:17,fontFamily:"'Noto Kufi Arabic',serif"}}>{isEdit?"تعديل الفندق":"إضافة فندق جديد"}</h2>
                <div className="text-xs mt-0.5" style={{color:B.muted}}>{isEdit?form.id:"معرّف تلقائي"}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {isEdit&&onDelete&&<button onClick={onDelete} title="حذف الفندق" className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-bold cursor-pointer"
                style={{background:"rgba(190,38,38,0.15)",border:"1px solid rgba(190,38,38,0.4)",color:"#F3C9C9"}}><Trash2 size={13}/>حذف</button>}
              <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer"
                style={{background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.1)",color:"#7a7068"}}><X size={15}/></button>
            </div>
          </div>
          <div className="flex gap-1">
            {TABS.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)}
                className="relative px-4 py-2.5 text-xs font-bold cursor-pointer rounded-t-lg transition-all"
                style={{background:tab===t.id?"#fff":"transparent",color:tab===t.id?B.black:"#CFC5B6",border:"none"}}>
                {t.label}
                {tab===t.id&&<motion.div layoutId="htab" className="absolute inset-x-0 top-0 h-0.5" style={{background:B.gold}}/>}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6" style={{scrollbarWidth:"none"}}>
          <AnimatePresence mode="wait">
            {tab==="info"&&<motion.div key="hi" initial={{opacity:0,x:10}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-10}} className="flex flex-col gap-4">
              <div><label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>اسم الفندق <span style={{color:B.gold}}>*</span></label>
                <input className={inp} style={ist} value={form.name} placeholder="مثال: دار الإيمان جراند" onChange={e=>set("name",e.target.value)}/></div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>المدينة</label>
                  <select className={inp} style={ist} value={form.city} onChange={e=>set("city",e.target.value as Hotel["city"])}><option value="مكة">🕋 مكة</option><option value="المدينة">🕌 المدينة</option></select></div>
                <div><label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>التصنيف</label>
                  <select className={inp} style={ist} value={form.stars} onChange={e=>set("stars",Number(e.target.value) as Hotel["stars"])}><option value={5}>★★★★★</option><option value={4}>★★★★☆</option><option value={3}>★★★☆☆</option><option value={2}>★★☆☆☆</option></select></div>
                <div><label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>المسافة (كيلومتر)</label>
                  <input type="text" inputMode="decimal" className={inp} style={ist} value={distanceKmInput} placeholder="0.5" onChange={e=>handleDistanceChange(e.target.value)} onBlur={handleDistanceBlur}/></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>الحي</label>
                  <input className={inp} style={ist} value={form.district} placeholder="أجياد" onChange={e=>set("district",e.target.value)}/></div>
                <div><label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>رقم تواصل الفندق</label>
                  <input className={inp} style={{...ist,direction:"ltr",textAlign:"left"}} value={form.phone} placeholder="مثال: +966 12 xxx xxxx" onChange={e=>set("phone",e.target.value)}/></div>
              </div>
              <div><label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>رابط الموقع في خرائط Google</label>
                <div className="relative">
                  <MapPin size={15} style={{color:B.gold,position:"absolute",top:"50%",insetInlineStart:12,transform:"translateY(-50%)",pointerEvents:"none"}}/>
                  <input className={inp} style={{...ist,direction:"ltr",textAlign:"left",paddingInlineStart:36}} value={form.mapUrl} placeholder="https://maps.google.com/..." onChange={e=>set("mapUrl",e.target.value)}/>
                </div>
                {form.mapUrl&&<a href={form.mapUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold mt-1.5" style={{color:B.gold}}>فتح الموقع في خرائط Google<ArrowRight size={11}/></a>}
              </div>
              <div><label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>الحالة</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["active","inactive"] as const).map(s=>(
                    <button key={s} onClick={()=>set("status",s)} className="flex items-center gap-2 py-3 px-4 rounded-xl font-bold text-sm cursor-pointer"
                      style={{background:form.status===s?(s==="active"?"#E3F3E8":"#FBE6E6"):B.bg,color:form.status===s?(s==="active"?"#1E7A44":"#BE2626"):B.muted,border:`1.5px solid ${form.status===s?(s==="active"?"#C4E4CE":"#F3C9C9"):B.border}`}}>
                      <span className="w-2 h-2 rounded-full" style={{background:form.status===s?(s==="active"?"#1E7A44":"#BE2626"):B.border}}/>{s==="active"?"نشط ومتاح":"متوقف مؤقتاً"}
                    </button>
                  ))}
                </div>
              </div>
              <div><label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>رأي تساهيل <span className="font-normal" style={{color:B.muted}}>(يظهر للعميل)</span></label>
                <textarea className={inp} style={{...ist,resize:"vertical"}} rows={2} value={form.tasaheelNote} placeholder="ملاحظة الفريق..." onChange={e=>set("tasaheelNote",e.target.value)}/></div>
              <div><label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>ملاحظات داخلية للإدارة <span className="font-normal" style={{color:B.muted}}>(لا تظهر للعميل)</span></label>
                <textarea className={inp} style={{...ist,resize:"vertical",background:B.bg}} rows={2} value={form.notes} placeholder="ملاحظات خاصة بالفريق الداخلي فقط..." onChange={e=>set("notes",e.target.value)}/></div>
            </motion.div>}
            {tab==="features"&&<motion.div key="hf" initial={{opacity:0,x:10}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-10}} className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="font-bold text-sm" style={{color:B.black}}>المرافق والمميزات</p>
                <button onClick={addFeat} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer"
                  style={{background:B.bg,border:`1px solid ${B.border}`,color:"#8a6a08"}}><Plus size={12}/>إضافة</button>
              </div>
              <AnimatePresence>{form.features.map(f=>(
                <motion.div key={f.id} initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}} className="flex gap-2 items-center">
                  <select className="border rounded-xl px-2.5 py-2.5 text-sm cursor-pointer flex-shrink-0"
                    style={{borderColor:B.border,background:"#fff",color:B.black,width:150,fontFamily:"inherit"}}
                    value={f.icon} onChange={e=>updFeat(f.id,"icon",e.target.value)}>
                    <option value="wifi">📶 واي فاي</option><option value="breakfast">☕ إفطار</option>
                    <option value="restaurant">🍽️ مطعم</option><option value="pool">🏊 مسبح</option>
                    <option value="parking">🅿️ موقف</option><option value="gym">🏋️ صالة</option>
                    <option value="spa">✨ سبا</option><option value="room_service">🛎️ خدمة غرف</option>
                  </select>
                  <input className={`${inp} flex-1`} style={ist} value={f.text} placeholder="اسم المرفق" onChange={e=>updFeat(f.id,"text",e.target.value)}/>
                  <button onClick={()=>delFeat(f.id)} className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer flex-shrink-0"
                    style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}><X size={13}/></button>
                </motion.div>
              ))}</AnimatePresence>
              {form.features.length===0&&<div className="flex flex-col items-center py-12 rounded-2xl" style={{border:`2px dashed ${B.border}`,color:B.muted}}><Wifi size={28} style={{opacity:0.3,marginBottom:8}}/><p className="text-sm">لم تُضف مرافق بعد</p></div>}
            </motion.div>}
            {tab==="rooms"&&<motion.div key="hr" initial={{opacity:0,x:10}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-10}} className="flex flex-col gap-4">
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
                    <div style={{width:80}}><label className="block text-xs font-bold mb-2" style={{color:B.muted}}>الأسرّة</label>
                      <input type="number" min={1} className={inp} style={ist} value={r.beds} onChange={e=>updRoom(r.id,"beds",Number(e.target.value))}/></div>
                    <div style={{width:120}}><label className="block text-xs font-bold mb-2" style={{color:B.muted}}>ر.س / ليلة</label>
                      <input type="number" min={0} className={inp} style={{...ist,color:B.gold,fontWeight:800}} value={r.pricePerNight} onChange={e=>updRoom(r.id,"pricePerNight",Number(e.target.value))}/></div>
                    <button onClick={()=>delRoom(r.id)} className="w-9 h-9 mb-0.5 rounded-xl flex items-center justify-center cursor-pointer"
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
                            <input type="file" accept="image/*" className="hidden" onChange={e=>{const file=e.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=()=>updRoomPhoto(r.id,p.id,"url",reader.result as string);reader.readAsDataURL(file);e.target.value="";}}/>
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
                            <button onClick={()=>moveRoomPhoto(r.id,p.id,-1)} disabled={pi===0} className="flex-1 h-7 rounded-md flex items-center justify-center cursor-pointer" style={{background:B.bg,border:`1px solid ${B.border}`,color:pi===0?B.border:B.text2}}><ChevronUp size={13}/></button>
                            <button onClick={()=>moveRoomPhoto(r.id,p.id,1)} disabled={pi===(r.photos??[]).length-1} className="flex-1 h-7 rounded-md flex items-center justify-center cursor-pointer" style={{background:B.bg,border:`1px solid ${B.border}`,color:pi===(r.photos??[]).length-1?B.border:B.text2}}><ChevronDown size={13}/></button>
                            <button onClick={()=>delRoomPhoto(r.id,p.id)} className="flex-1 h-7 rounded-md flex items-center justify-center cursor-pointer" style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}><Trash2 size={12}/></button>
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
            {tab==="media"&&<motion.div key="hmd" initial={{opacity:0,x:10}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-10}} className="flex flex-col gap-4">
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
                          {HOTEL_MEDIA_CATS.map(c=><option key={c} value={c}>{c}</option>)}
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
            {tab==="reviews"&&<motion.div key="hrv" initial={{opacity:0,x:10}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-10}} className="flex flex-col gap-4">
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
                        <button onClick={()=>updReview(rv.id,"image",undefined)} className="absolute top-1 left-1 w-6 h-6 rounded-lg flex items-center justify-center cursor-pointer"
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
                        <input type="file" accept="image/*" className="hidden" onChange={e=>{const file=e.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=()=>updReview(rv.id,"image",reader.result as string);reader.readAsDataURL(file);e.target.value="";}}/>
                      </label>
                    </div>
                  </div>
                  <button onClick={()=>delReview(rv.id)} className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer mt-0.5"
                    style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}><X size={12}/></button>
                </motion.div>
              ))}</AnimatePresence>
              {form.reviews.length===0&&<div className="flex flex-col items-center py-12 rounded-2xl" style={{border:`2px dashed ${B.border}`,color:B.muted}}><Star size={28} style={{opacity:0.3,marginBottom:8}}/><p className="text-sm">لا توجد آراء بعد</p></div>}
            </motion.div>}
          </AnimatePresence>
        </div>
        <div className="flex gap-3 px-6 py-4 flex-shrink-0" style={{borderTop:`1px solid ${B.border}`}}>
          <button onClick={()=>onSave(form)} className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold cursor-pointer"
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
  const hotels=useStore(s=>s.hotels); const setHotels=useStore(s=>s.setHotels);
  const [showModal,setShowModal]=useState(false);
  const [editTarget,setEditTarget]=useState<Hotel|null>(null);
  const [search,setSearch]=useState("");
  const [cityFilter,setCityFilter]=useState<"all"|"مكة"|"المدينة">("all");
  const [statusFilter,setStatusFilter]=useState<"all"|"active"|"inactive">("all");
  const [deleteId,setDeleteId]=useState<string|null>(null);
  const filtered=hotels.filter(h=>(!search||h.name.includes(search)||h.id.toLowerCase().includes(search)||h.district.includes(search))&&(cityFilter==="all"||h.city===cityFilter)&&(statusFilter==="all"||h.status===statusFilter));
  const stats={total:hotels.length,active:hotels.filter(h=>h.status==="active").length,mecca:hotels.filter(h=>h.city==="مكة").length,medina:hotels.filter(h=>h.city==="المدينة").length};
  function handleSave(h:Hotel){setHotels(p=>editTarget?p.map(x=>x.id===h.id?h:x):[h,...p]);setShowModal(false);}
  const fb=(on:boolean)=>({padding:"6px 14px",borderRadius:999,fontSize:13,fontWeight:700,cursor:"pointer" as const,border:`1px solid ${on?B.gold:B.border}`,background:on?B.primary:"#fff",color:on?B.gold:B.text2,transition:"all 0.15s"});
  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{background:B.bg}}>
      <PageHeader title="الفنادق" crumb="إدارة الفنادق" search={search} onSearch={setSearch} onMenuOpen={onMenuOpen}/>
      <div className="px-4 md:px-8 pt-4 md:pt-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="إجمالي الفنادق" value={stats.total} sub="في النظام" accent/>
          <StatCard label="فنادق نشطة" value={stats.active} sub={`${stats.total-stats.active} متوقفة`}/>
          <StatCard label="فنادق مكة" value={stats.mecca} sub="المكرمة"/>
          <StatCard label="فنادق المدينة" value={stats.medina} sub="المنورة"/>
        </div>
        <div className="flex items-center justify-between gap-3 mt-5 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 p-1 rounded-xl" style={{background:"#fff",border:`1px solid ${B.border}`}}>
              <button style={fb(statusFilter==="all")} onClick={()=>setStatusFilter("all")}>الكل</button>
              <button style={fb(statusFilter==="active")} onClick={()=>setStatusFilter("active")}>نشط</button>
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
            <button onClick={()=>{setEditTarget(null);setShowModal(true);}} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer"
              style={{background:B.gold,color:B.black,border:"none",boxShadow:"0 4px 12px rgba(192,134,44,0.35)"}}>
              <Plus size={15}/>إضافة فندق
            </button>
          </div>
        </div>
        <div className="mt-5" style={{height:1,background:B.border}}/>
      </div>
      <main className="flex-1 px-4 md:px-8 pb-10 pt-6">
        {filtered.length===0
          ?<motion.div initial={{opacity:0}} animate={{opacity:1}} className="flex flex-col items-center justify-center py-24 rounded-2xl" style={{background:"#fff",border:`1px solid ${B.border}`}}>
            <Building2 size={44} style={{opacity:0.2,color:B.gold,marginBottom:12}}/><p className="font-bold" style={{color:B.black}}>لا توجد فنادق مطابقة</p>
          </motion.div>
          :<motion.div layout className="grid gap-5" style={{gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))"}}>
            <AnimatePresence>{filtered.map(h=><HotelCard key={h.id} hotel={h} onEdit={()=>{setEditTarget(h);setShowModal(true);}}/>)}</AnimatePresence>
          </motion.div>
        }
      </main>
      <AnimatePresence>
        {deleteId&&<DeleteDialog onConfirm={()=>{setHotels(p=>p.filter(h=>h.id!==deleteId));setDeleteId(null);}} onCancel={()=>setDeleteId(null)}/>}
        {showModal&&<HotelModal initial={editTarget} onSave={handleSave} onClose={()=>setShowModal(false)} onDelete={editTarget?()=>{const id=editTarget.id;setShowModal(false);setDeleteId(id);}:undefined}/>}
      </AnimatePresence>
    </div>
  );
}
