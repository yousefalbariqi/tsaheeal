import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Building2, MapPin, Star, Plus, Pencil, Trash2, X, Check,
  ImagePlus, ArrowRight, ChevronUp, ChevronDown, Film, FileUp,
} from "lucide-react";
import { B } from "@/lib/theme";
import { useDebounced } from "@/lib/useDebounced";
import { EntityGate } from "@/components/States";
import type { MediaKind, HotelFeature, HotelReview, HotelMedia, Hotel } from "@/types";
import { uid, newId} from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";
import { StatCard } from "@/components/StatCard";
import { PageHeader } from "@/components/PageHeader";
import { AppSelect } from "@/components/AppSelect";
import { useStore, writeLocalOnly } from "@/store/useStore";
import { useRole } from "@/lib/useRole";
import { toast } from "sonner";
import { Field } from "@/components/Field";
import { onPickMedia } from "@/lib/mediaUpload";
import { cleanHotelName, hasHotelPrefix, hotelDisplayName } from "@/lib/hotelName";
import { EntityActions } from "@/components/EntityActions";
import { permanentlyDelete } from "@/data/repository";
import { hotelReadiness, hotelCover } from "./readiness";
import { HOTEL_FEATURE_CATALOG, hotelFeatureIcon } from "./featureIcons";

/** استيراد الآراء يقبل ملف CSV فقط، بعناوين واضحة حتى لا تُخمن الأعمدة. */
function csvCells(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(cell.trim()); cell = "";
    } else cell += char;
  }
  cells.push(cell.trim());
  return cells;
}

function importHotelReviewsCsv(source: string): Omit<HotelReview, "id">[] {
  const rows = source.replace(/^﻿/, "").split(/\r?\n/).filter(line => line.trim());
  if (rows.length < 2) throw new Error("الملف يحتاج صف عناوين وصف رأي واحد على الأقل.");
  const delimiter = rows[0].includes(";") && !rows[0].includes(",") ? ";" : ",";
  const headers = csvCells(rows[0], delimiter).map(value => value.trim().toLowerCase());
  const nameIndex = headers.findIndex(value => ["الاسم", "اسم", "name"].includes(value));
  const textIndex = headers.findIndex(value => ["الرأي", "التقييم", "review", "comment", "text"].includes(value));
  if (nameIndex < 0 || textIndex < 0) throw new Error("الأعمدة المطلوبة هي: الاسم، الرأي.");
  const reviews = rows.slice(1).flatMap(line => {
    const cells = csvCells(line, delimiter);
    const name = (cells[nameIndex] ?? "").trim();
    const text = (cells[textIndex] ?? "").trim();
    return name && text ? [{ name, text, consent: true }] : [];
  });
  if (!reviews.length) throw new Error("لم نجد آراء مكتملة؛ يجب تعبئة الاسم والرأي في كل صف.");
  return reviews;
}

function HotelCardHero({name,city,stars,status,cover}:{name:string;city:string;stars:number;status:string;cover?:string}) {
  return (
    <div className="relative overflow-hidden" style={{height:160,background:B.primaryDeep}}>
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
  /* ما ينقص يُقرأ من القائمة لا بفتح كل فندق. سطرٌ هادئ لا صندوق إنذار:
     النقص هنا لم يعد يمنع شيئاً بعد أن انتقل البيع إلى الباقة. */
  const missing = hotelReadiness(hotel).missing;
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
              <span>{hotel.district||"—"}</span>
            </div>
          </div>
          <span className="text-xs font-mono flex-shrink-0 px-2 py-0.5 rounded-lg mt-0.5"
            style={{background:B.fill,color:B.muted,border:`1px solid ${B.border}`,fontSize:10}}>{hotel.id}</span>
        </div>
        {hotel.features.length>0 && (
          <div className="flex flex-wrap gap-1.5">
            {hotel.features.slice(0,3).map(f=>{const Icon=hotelFeatureIcon(f.icon);return(
              <span key={f.id} className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full"
                style={{background:B.fill,border:`1px solid ${B.border}`,color:B.text3}}>
                <Icon size={9} style={{color:B.gold}}/>{f.text}
              </span>
            );})}
            {hotel.features.length>3&&<span className="text-xs px-2.5 py-1 rounded-full" style={{background:B.fill,border:`1px solid ${B.border}`,color:B.muted}}>+{hotel.features.length-3}</span>}
          </div>
        )}
        {missing.length>0&&(
          <div className="flex items-center gap-1.5 text-xs" style={{color:"#8A6A08"}}>
            <span aria-hidden className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{background:"#D9A93A"}}/>
            <span>ينقصه: {missing.map(m=>m.label).join(" · ")}</span>
          </div>
        )}
        <div className="mt-auto pt-3" style={{borderTop:`1px solid ${B.border}`}}>
          {actions ?? (
            <button onClick={onEdit} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold cursor-pointer"
              style={{background:B.gold,color:B.black,border:"none"}}><Pencil size={13}/>تعديل</button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Hotel Modal ───────────────────────────────────────────────────
   نموذجٌ بلا تبويبات: الفندق صار بطاقة تعريف — اسمٌ وحيٌّ وموقعٌ ومرافق
   وصورٌ وآراء — فثلاثُ لفّاتٍ بالفأرة تُغني عن خمسة تبويباتٍ يُفتَّش
   فيها. وما سقط سقط لأنه لم يكن يُستعمل أو لأنه انتقل إلى الباقة:

   • الغرف وأسعارها وصورها → الباقة، حيث تُباع فعلاً.
   • الحالة (نشط/متوقف)   → زرّ «إيقاف» على البطاقة، كالمواصلات.
   • رأي تساهيل            → لم يكن يظهر للعميل في أي شاشة.
   • تصنيف كل صورة والإذن  → حقولٌ تُملأ ولا يقرؤها أحد. */
const HOTEL_MEDIA_MAX = 8;
function HotelModal({initial,onSave,onClose}:{initial:Hotel|null;onSave:(h:Hotel)=>void;onClose:()=>void}) {
  const isEdit=initial!==null;
  const [featureIconTarget,setFeatureIconTarget]=useState<string|null>(null);
  const [showFeatIcons,setShowFeatIcons]=useState(false);
  /* تبديل رمز مرفقٍ قائم يفتح المعرض حتماً — وإلّا ضغط الموظف «تغيير
     الرمز» فلا يظهر شيء. */
  const galleryOpen=showFeatIcons||!!featureIconTarget;
  /* الحقول المتقاعدة تبقى في الحالة كما جاءت من القاعدة (roomTypes و
     notes و tasaheelNote و phone): النموذج لا يعرضها ولا يمسّها، والحفظ
     يعيدها كما هي — فلا يدهس التبسيطُ بياناتٍ قائمة. */
  const [form,setForm]=useState<Hotel>(initial?{...initial,media:initial.media??[]}:{id:newId("HTL"),name:"",city:"مكة",stars:4,distanceM:0,district:"",phone:"",mapUrl:"",status:"active",notes:"",features:[],roomTypes:[],tasaheelNote:"",reviews:[],media:[]});
  const set=<K extends keyof Hotel>(k:K,v:Hotel[K])=>setForm(f=>({...f,[k]:v}));
  const addFeat=(icon=HOTEL_FEATURE_CATALOG[0].id)=>set("features",[...form.features,{id:uid(),icon,text:""}]);
  const delFeat=(id:string)=>set("features",form.features.filter(f=>f.id!==id));
  const updFeat=(id:string,field:keyof HotelFeature,val:string)=>set("features",form.features.map(f=>f.id===id?{...f,[field]:val}:f));
  const chooseFeatIcon=(id:string,icon:string)=>set("features",form.features.map(feature=>feature.id===id?{...feature,icon}:feature));
  const moveFeat=(id:string,dir:-1|1)=>{
    const next=[...form.features]; const from=next.findIndex(feature=>feature.id===id); const to=from+dir;
    if(from<0||to<0||to>=next.length) return;
    [next[from],next[to]]=[next[to],next[from]]; set("features",next);
  };
  /* الرأي يُعتمد بمجرّد إدخاله: خانة «الإذن» كانت تُملأ يدوياً ولا تُقرأ
     في أي شاشة عميل — نفس ما استقرّت عليه آراء الباقة. */
  const addReview=()=>set("reviews",[...form.reviews,{id:uid(),name:"",text:"",consent:true}]);
  const delReview=(id:string)=>set("reviews",form.reviews.filter(r=>r.id!==id));
  const updReview=(id:string,field:keyof HotelReview,val:any)=>set("reviews",form.reviews.map(r=>r.id===id?{...r,[field]:val}:r));
  const importReviews = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => toast.error("تعذّرت قراءة ملف الآراء");
    reader.onload = () => {
      try {
        const rows = importHotelReviewsCsv(String(reader.result ?? ""));
        setForm(f=>({...f, reviews:[...f.reviews, ...rows.map(row => ({ ...row, id: uid() }))]}));
        toast.success(`تم استيراد ${rows.length} رأي`);
      } catch (error) {
        toast.error("ملف الآراء غير صالح", { description: error instanceof Error ? error.message : "تحقق من الأعمدة المطلوبة." });
      }
    };
    reader.readAsText(file, "UTF-8");
  };
  const media=form.media??[];
  /* الملف يُرفع أولاً ثم يُضاف صفُّه — لا صفٌّ فارغ ينتظر صورة. والتحديث
     دالّيٌّ لأن رفعين متزامنين وإلّا دهس أحدهما الآخر. */
  const appendMedia=(kind:MediaKind,url:string)=>setForm(f=>{
    const cur=f.media??[];
    if(cur.length>=HOTEL_MEDIA_MAX) return f;
    return {...f,media:[...cur,{id:uid(),kind,url,primary:kind==="image"&&!cur.some(m=>m.primary&&m.kind==="image"),category:""}]};
  });
  const delMedia=(id:string)=>set("media",media.filter(m=>m.id!==id));
  const updMedia=(id:string,field:keyof HotelMedia,val:any)=>set("media",media.map(m=>m.id===id?{...m,[field]:val}:m));
  const setPrimaryMedia=(id:string)=>set("media",media.map(m=>({...m,primary:m.id===id&&m.kind==="image"})));
  const moveMedia=(id:string,dir:-1|1)=>{const arr=[...media];const i=arr.findIndex(m=>m.id===id);const j=i+dir;if(j<0||j>=arr.length)return;[arr[i],arr[j]]=[arr[j],arr[i]];set("media",arr);};
  const nameError = hasHotelPrefix(form.name) ? "كلمة «فندق» تُضاف تلقائياً عند العرض — اكتب الاسم مجرَّداً" : null;

  /* حفظٌ بلا حرّاس: الاسم يُنظَّف، والباقي اختياريٌّ يُكمَل متى توفّر.
     ما يمنع العميل من رؤية شيءٍ ناقص هو حالة الباقة لا حالة الفندق. */
  const submit = () => {
    const name = cleanHotelName(form.name);
    if (!name) { toast.error("اسم الفندق مطلوب"); return; }
    onSave({ ...form, name });
  };

  const inp="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none transition-all";
  const ist={borderColor:B.border,background:"#fff",color:B.black,fontFamily:"inherit"};
  const tinyBtn=(tone:"neutral"|"gold"|"danger",off=false):React.CSSProperties=>({
    width:28,height:28,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",
    cursor:off?"not-allowed":"pointer",opacity:off?0.4:1,
    ...(tone==="gold"?{background:"#FBF3D6",border:"1px solid #EBD9A0",color:"#8A6A08"}
      :tone==="danger"?{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}
      :{background:B.fill,border:`1px solid ${B.border}`,color:B.text2}),
  });
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6"
      style={{background:"rgba(14,12,11,0.78)",backdropFilter:"blur(4px)"}} onClick={onClose}>
      <motion.div initial={{opacity:0,y:40}} animate={{opacity:1,y:0}} exit={{opacity:0,y:40}}
        transition={{type:"spring",damping:30,stiffness:400}}
        className="w-full sm:rounded-2xl overflow-hidden flex flex-col"
        style={{maxWidth:620,maxHeight:"92vh",background:"#fff"}} onClick={e=>e.stopPropagation()}>
        <div className="relative px-6 py-5 flex-shrink-0" style={{background:B.primaryDeep}}>
          <div className="absolute top-0 inset-x-0 h-1" style={{background:`linear-gradient(90deg,${B.gold},${B.gold2},${B.gold})`}}/>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{background:"rgba(192,134,44,0.15)",border:"1px solid rgba(192,134,44,0.3)"}}>
                <Building2 size={18} style={{color:B.gold}}/>
              </div>
              <div>
                <h2 className="font-extrabold text-white" style={{fontSize:17,fontFamily:"var(--font-app)"}}>{isEdit?"تعديل الفندق":"إضافة فندق جديد"}</h2>
                <div className="text-xs mt-0.5" style={{color:B.muted}}>{isEdit?form.id:"معرّف تلقائي"}</div>
              </div>
            </div>
            <button onClick={onClose} aria-label="إغلاق النافذة" title="إغلاق" className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer flex-shrink-0"
              style={{background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.1)",color:"#7a7068"}}><X size={15}/></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5" style={{scrollbarWidth:"none"}}>

          {/* ── بيانات الفندق ── */}
          <section className="flex flex-col gap-3.5">
            <h3 className="font-extrabold m-0" style={{color:B.black,fontSize:14,fontFamily:"var(--font-app)"}}>بيانات الفندق</h3>
            <div>
              <Field label={<>اسم الفندق <span style={{color:B.gold}}>*</span> <span className="font-normal" style={{color:B.muted}}>(بلا كلمة «فندق»)</span></>}>
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
            <div><Field label="الحي">
                   <input className={inp} style={ist} value={form.district} placeholder="أجياد" onChange={e=>set("district",e.target.value)}/>
                 </Field></div>
            <div>
              <label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>رابط الموقع في خرائط Google</label>
              <div className="relative">
                <MapPin size={15} style={{color:B.gold,position:"absolute",top:"50%",insetInlineStart:12,transform:"translateY(-50%)",pointerEvents:"none"}}/>
                <input className={inp} style={{...ist,direction:"ltr",textAlign:"left",paddingInlineStart:36}} value={form.mapUrl} placeholder="https://maps.google.com/..." onChange={e=>set("mapUrl",e.target.value)}/>
              </div>
              {form.mapUrl&&<a href={form.mapUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold mt-1.5" style={{color:B.gold}}>فتح الموقع في خرائط Google<ArrowRight size={11}/></a>}
            </div>
          </section>

          {/* ── المرافق ── */}
          <section className="flex flex-col gap-3 pt-5" style={{borderTop:`1px solid ${B.border}`}}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h3 className="font-extrabold m-0" style={{color:B.black,fontSize:14,fontFamily:"var(--font-app)"}}>المرافق</h3>
                <p className="text-xs mt-1" style={{color:B.muted}}>ما يظهر للعميل في بطاقة الفندق.</p>
              </div>
              <button type="button" onClick={()=>{setFeatureIconTarget(null);setShowFeatIcons(v=>!v);}}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer flex-shrink-0"
                style={{background:B.fill,border:`1px solid ${B.border}`,color:"#8a6a08"}}>
                {galleryOpen&&!featureIconTarget?<><X size={12}/>إغلاق المعرض</>:<><Plus size={12}/>إضافة مرفق</>}
              </button>
            </div>
            {/* معرض الرموز يُطوى: عشرون رمزاً مفتوحةً دائماً تجعل النموذج
                يبدو لوحة إعدادات، وهي لا تُستعمل إلّا لحظة الإضافة. */}
            {galleryOpen&&(
              <div className="grid gap-2 rounded-xl p-2.5" style={{gridTemplateColumns:"repeat(auto-fill, minmax(42px, 1fr))",background:B.fill,border:`1px solid ${B.border}`}}>
                {HOTEL_FEATURE_CATALOG.map(({id,label,Icon})=>(
                  <button key={id} type="button" aria-label={label} title={label} onClick={()=>{
                    if(featureIconTarget) { chooseFeatIcon(featureIconTarget,id); setFeatureIconTarget(null); }
                    else addFeat(id);
                  }}
                    className="aspect-square rounded-xl flex items-center justify-center cursor-pointer transition-all"
                    style={{background:"#fff",color:B.text2,border:`1.5px solid ${B.border}`}}><Icon size={18}/></button>
                ))}
              </div>
            )}
            {featureIconTarget&&<p className="text-xs font-bold -mt-1" style={{color:"#8A6A08"}}>اختر الرمز الجديد من المعرض أعلاه.</p>}
            <AnimatePresence>{form.features.map(f=>(
              <motion.div key={f.id} initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}} className="flex gap-2 items-center rounded-xl p-2" style={{background:"#fff",border:`1px solid ${B.border}`}}>
                {(()=>{ const Icon=hotelFeatureIcon(f.icon); const picking=featureIconTarget===f.id; return <button type="button" aria-label="تغيير رمز المرفق" title="تغيير الرمز" onClick={()=>setFeatureIconTarget(picking?null:f.id)} className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 cursor-pointer" style={{background:picking?B.gold:"#FBF3D6",border:`1px solid ${picking?B.gold:"#EBD9A0"}`,color:picking?B.black:"#8A6A08"}}><Icon size={18}/></button>; })()}
                <input className={`${inp} flex-1`} style={ist} value={f.text} placeholder="مثال: إفطار مجاني" onChange={e=>updFeat(f.id,"text",e.target.value)}/>
                <div className="flex flex-col gap-1">
                  <button aria-label="تقديم المرفق" title="تقديم" onClick={()=>moveFeat(f.id,-1)} className="w-7 h-5 rounded flex items-center justify-center cursor-pointer" style={{background:B.fill,border:`1px solid ${B.border}`,color:B.text2}}><ChevronUp size={12}/></button>
                  <button aria-label="تأخير المرفق" title="تأخير" onClick={()=>moveFeat(f.id,1)} className="w-7 h-5 rounded flex items-center justify-center cursor-pointer" style={{background:B.fill,border:`1px solid ${B.border}`,color:B.text2}}><ChevronDown size={12}/></button>
                </div>
                <button aria-label="حذف المرفق" title="حذف المرفق" onClick={()=>delFeat(f.id)} className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer flex-shrink-0"
                  style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}><X size={13}/></button>
              </motion.div>
            ))}</AnimatePresence>
          </section>

          {/* ── الصور ── */}
          <section className="flex flex-col gap-3 pt-5" style={{borderTop:`1px solid ${B.border}`}}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="font-extrabold m-0 flex items-center gap-2" style={{color:B.black,fontSize:14,fontFamily:"var(--font-app)"}}>
                  صور الفندق
                  <span className="px-2 py-0.5 rounded-md text-xs font-bold" style={{background:media.length>=HOTEL_MEDIA_MAX?"#FBE6E6":B.fill,color:media.length>=HOTEL_MEDIA_MAX?"#BE2626":B.muted,border:`1px solid ${media.length>=HOTEL_MEDIA_MAX?"#F3C9C9":B.border}`}}>{media.length} / {HOTEL_MEDIA_MAX}</span>
                </h3>
                <p className="text-xs mt-1" style={{color:B.muted}}>الصورة الموسومة «الغلاف» هي التي يراها العميل أولاً.</p>
              </div>
              {media.length<HOTEL_MEDIA_MAX&&(
                <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer flex-shrink-0"
                  style={{background:B.fill,border:`1px solid ${B.border}`,color:"#1E52C7"}}>
                  <Film size={12}/>إضافة فيديو
                  <input type="file" accept="video/*" className="hidden" onChange={onPickMedia("hotels",url=>appendMedia("video",url))}/>
                </label>
              )}
            </div>
            <div className="grid gap-2.5" style={{gridTemplateColumns:"repeat(auto-fill,minmax(132px,1fr))"}}>
              {media.map((m,idx)=>(
                <div key={m.id} className="rounded-xl overflow-hidden flex flex-col"
                  style={{border:`1.5px solid ${m.primary?B.gold:B.border}`,background:"#fff"}}>
                  <div className="relative" style={{aspectRatio:"4 / 3",background:B.fill}}>
                    {m.url
                      ? (m.kind==="image"
                          ? <img src={m.url} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                          : <video src={m.url} style={{width:"100%",height:"100%",objectFit:"cover"}}/>)
                      /* صفٌّ قديم بلا رابط — يبقى قابلاً للإصلاح لا معطوباً. */
                      : <label className="absolute inset-0 flex flex-col items-center justify-center gap-1 cursor-pointer" style={{color:B.muted}}>
                          {m.kind==="image"?<ImagePlus size={18}/>:<Film size={18}/>}<span style={{fontSize:10}}>اختر ملفاً</span>
                          <input type="file" accept={m.kind==="image"?"image/*":"video/*"} className="hidden" onChange={onPickMedia("hotels",url=>updMedia(m.id,"url",url))}/>
                        </label>}
                    {m.primary&&<span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md text-xs font-bold" style={{background:B.gold,color:B.black}}>الغلاف</span>}
                    {m.kind==="video"&&<span className="absolute top-1.5 right-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-bold" style={{background:"rgba(14,12,11,0.72)",color:B.cream}}><Film size={10}/>فيديو</span>}
                  </div>
                  <div className="flex items-center gap-1 p-1.5" style={{borderTop:`1px solid ${B.border}`}}>
                    {m.kind==="image"&&(
                      <button type="button" onClick={()=>setPrimaryMedia(m.id)} disabled={m.primary}
                        title={m.primary?"هذه هي صورة الغلاف":"اجعلها الغلاف"} aria-label={m.primary?"صورة الغلاف":"اجعلها الغلاف"}
                        style={tinyBtn("gold",m.primary)}><Star size={13}/></button>
                    )}
                    <button type="button" onClick={()=>moveMedia(m.id,-1)} disabled={idx===0} title="تقديم" aria-label="تقديم في الترتيب"
                      style={tinyBtn("neutral",idx===0)}><ChevronUp size={13}/></button>
                    <button type="button" onClick={()=>moveMedia(m.id,1)} disabled={idx===media.length-1} title="تأخير" aria-label="تأخير في الترتيب"
                      style={tinyBtn("neutral",idx===media.length-1)}><ChevronDown size={13}/></button>
                    <button type="button" onClick={()=>delMedia(m.id)} title="حذف" aria-label="حذف الملف"
                      className="ms-auto" style={tinyBtn("danger")}><Trash2 size={13}/></button>
                  </div>
                </div>
              ))}
              {media.length<HOTEL_MEDIA_MAX&&(
                <label className="rounded-xl flex flex-col items-center justify-center gap-1.5 cursor-pointer"
                  style={{border:`2px dashed ${B.border}`,background:B.fill,color:B.muted,minHeight:132}}>
                  <ImagePlus size={20}/><span className="text-xs font-bold">إضافة صورة</span>
                  <input type="file" accept="image/*" className="hidden" onChange={onPickMedia("hotels",url=>appendMedia("image",url))}/>
                </label>
              )}
            </div>
          </section>

          {/* ── الآراء ── */}
          <section className="flex flex-col gap-3 pt-5" style={{borderTop:`1px solid ${B.border}`}}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h3 className="font-extrabold m-0" style={{color:B.black,fontSize:14,fontFamily:"var(--font-app)"}}>آراء النزلاء</h3>
                <p className="text-xs mt-1" style={{color:B.muted}}>استيراد CSV بعمودين: <b>الاسم، الرأي</b>.</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer"
                  style={{background:B.fill,border:`1px solid ${B.border}`,color:B.text2}}>
                  <FileUp size={12}/>استيراد CSV
                  <input type="file" accept=".csv,text/csv" className="hidden" onChange={event=>{ importReviews(event.target.files?.[0]); event.currentTarget.value=""; }}/>
                </label>
                <button onClick={addReview} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer"
                  style={{background:B.fill,border:`1px solid ${B.border}`,color:"#8a6a08"}}><Plus size={12}/>إضافة رأي</button>
              </div>
            </div>
            <AnimatePresence>{form.reviews.map(rv=>(
              <motion.div key={rv.id} initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}
                className="rounded-2xl p-3 flex gap-3" style={{border:`1px solid ${B.border}`}}>
                <div className="flex-1 flex flex-col gap-2 min-w-0">
                  <input className={inp} style={ist} value={rv.name} placeholder="الاسم الأول" onChange={e=>updReview(rv.id,"name",e.target.value)}/>
                  <textarea className={inp} style={{...ist,resize:"vertical"}} rows={2} value={rv.text} placeholder="ماذا قال؟" onChange={e=>updReview(rv.id,"text",e.target.value)}/>
                  <div className="flex items-center gap-2 flex-wrap">
                    {rv.image&&(
                      <div className="relative rounded-lg overflow-hidden flex-shrink-0" style={{border:`1px solid ${B.border}`,width:44,height:44}}>
                        <img src={rv.image} alt="صورة مرفقة" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                        <button aria-label="إزالة صورة الرأي" title="إزالة صورة الرأي" onClick={()=>updReview(rv.id,"image",undefined)} className="absolute top-0 left-0 w-5 h-5 flex items-center justify-center cursor-pointer"
                          style={{background:"rgba(190,38,38,0.92)",color:"#fff",border:"none",borderBottomRightRadius:8}}><X size={10}/></button>
                      </div>
                    )}
                    <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
                      style={{background:B.fill,color:"#8a6a08",border:`1px solid ${B.border}`}}>
                      <ImagePlus size={12}/>{rv.image?"تغيير الصورة":"صورة — اختياري"}
                      <input type="file" accept="image/*" className="hidden" onChange={onPickMedia("hotel-reviews",url=>updReview(rv.id,"image",url))}/>
                    </label>
                  </div>
                </div>
                <button aria-label="حذف الرأي" title="حذف الرأي" onClick={()=>delReview(rv.id)} className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer flex-shrink-0"
                  style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}><X size={12}/></button>
              </motion.div>
            ))}</AnimatePresence>
            {form.reviews.length===0&&<div className="flex flex-col items-center py-8 rounded-2xl" style={{border:`2px dashed ${B.border}`,color:B.muted}}><Star size={24} style={{opacity:0.3,marginBottom:6}}/><p className="text-sm m-0">لا توجد آراء بعد</p></div>}
          </section>
        </div>

        <div className="flex gap-3 px-6 py-4 flex-shrink-0" style={{borderTop:`1px solid ${B.border}`}}>
          <button onClick={submit} className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold cursor-pointer"
            style={{background:B.gold,color:B.black,border:"none"}}><Check size={14}/>حفظ الفندق</button>
          <button onClick={onClose} className="px-5 py-3 rounded-xl text-sm font-bold cursor-pointer"
            style={{background:B.fill,color:B.text2,border:"none"}}>إلغاء</button>
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
  const openForm = (t: Hotel|null) => {
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
  const [statusFilter,setStatusFilter]=useState<"all"|"active"|"inactive">("all");
  /* البحث يُطبَّع طرفيه: من كتب «فندق ايلاف» يجب أن يجد «ايلاف». */
  const nq=cleanHotelName(query);
  const filtered=hotels.filter(h=>(!nq||cleanHotelName(h.name).includes(nq)||h.id.toLowerCase().includes(nq.toLowerCase())||h.district.includes(nq))&&(cityFilter==="all"||h.city===cityFilter)&&(statusFilter==="all"||h.status===statusFilter));
  const stats={
    total:hotels.length,
    active:hotels.filter(h=>h.status==="active").length,
    mecca:hotels.filter(h=>h.city==="مكة").length,
    madinah:hotels.filter(h=>h.city==="المدينة").length,
  };
  function handleSave(h:Hotel){setHotels(p=>editTarget?p.map(x=>x.id===h.id?h:x):[h,...p]);setShowModal(false);}
  const fb=(on:boolean)=>({padding:"6px 14px",borderRadius:999,fontSize:13,fontWeight:700,cursor:"pointer" as const,border:`1px solid ${on?B.gold:B.border}`,background:on?B.gold:"#fff",color:on?B.black:B.text2,transition:"all 0.15s"});
  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{background: B.bg}}>
      <PageHeader title="الفنادق" crumb="إدارة الفنادق" search={search} onSearch={setSearch} onMenuOpen={onMenuOpen}/>
      <div className="px-4 md:px-8 pt-4 md:pt-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="إجمالي الفنادق" value={stats.total} sub="في النظام" accent/>
          <StatCard label="نشطة" value={stats.active} sub={`${stats.total-stats.active} متوقفة`}/>
          <StatCard label="🕋 مكة" value={stats.mecca} sub="مسجّلة"/>
          <StatCard label="🕌 المدينة" value={stats.madinah} sub="مسجّلة"/>
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
                  /* إجراءان تشغيليان لا أربعة — كما في المواصلات: إيقاف أو
                     حذف نهائي. الإخفاء برمز العين والأرشفة أُسقطا: ثلاثة
                     أزرارٍ تعني «احجبه» فرّقت الموظف بلا فارقٍ حقيقي. */
                  <EntityActions
                    name={hotelDisplayName(h.name)} label="الفندق"
                    canWrite={mayWrite} isAdmin={isAdmin}
                    onEdit={()=>{openForm(h);}}
                    active={h.status==="active"} toggleAsLabel safeAlternative="الإيقاف"
                    onToggleActive={next=>{
                      setHotels(p=>p.map(x=>x.id===h.id?{...x,status:next?"active":"inactive"}:x));
                      toast.success(next?"فُعّل الفندق":"أُوقف الفندق");
                    }}
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
        {showModal&&<HotelModal initial={editTarget} onSave={handleSave} onClose={()=>setShowModal(false)}/>}
      </AnimatePresence>
    </div>
  );
}
