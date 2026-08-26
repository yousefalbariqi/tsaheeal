import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Building2, MapPin, Star, Plus, Trash2, X, Check, Wifi, UtensilsCrossed, Coffee, ShieldCheck, Package, Plane, Bus, BookOpen, Users, Ticket, Search, ChevronRight, ImagePlus, Armchair, ChevronUp, ChevronDown, Copy, ArrowRight, Repeat, CalendarDays, ListChecks, Archive, ArchiveRestore } from "lucide-react";
import { B } from "@/lib/theme";
import type { Hotel, Transport, PkgStatus, PkgDest, ProgramStage, RoomPrice, PkgReview, PkgFeature, Pkg, TripSettings } from "@/types";
import { uid, distanceLabel, newId} from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";
import { StatCard } from "@/components/StatCard";
import { PageHeader } from "@/components/PageHeader";
import { AppSelect } from "@/components/AppSelect";
import { useStore } from "@/store/useStore";
import { Field } from "@/components/Field";
import { onPickMedia } from "@/lib/mediaUpload";

/* شعارات مميزات الباقة — قائمة يختار منها المستخدم */
const PKG_FEATURE_ICONS: Record<string,{icon:React.FC<{size?:number;style?:React.CSSProperties}>;label:string}> = {
  check:{icon:Check,label:"عام"},
  guide:{icon:BookOpen,label:"مرشد ديني"},
  meal:{icon:UtensilsCrossed,label:"ضيافة / وجبة"},
  coffee:{icon:Coffee,label:"مشروبات"},
  supervisor:{icon:Users,label:"مشرف"},
  transport:{icon:Bus,label:"مواصلات"},
  flight:{icon:Plane,label:"طيران"},
  hotel:{icon:Building2,label:"سكن / فندق"},
  wifi:{icon:Wifi,label:"واي فاي"},
  seat:{icon:Armchair,label:"مقاعد مريحة"},
  view:{icon:Star,label:"إطلالة مميزة"},
  vip:{icon:ShieldCheck,label:"خدمة VIP"},
  ticket:{icon:Ticket,label:"تذاكر / دخول"},
  location:{icon:MapPin,label:"موقع مميز"},
};

/* ═══════════════════════ UTILS ═══════════════════════ */

/* ════════════════════════════════════════════════════════════
   SHARED COMPONENTS
════════════════════════════════════════════════════════════ */
/* ════════════════════════════════════════════════════════════
   PACKAGES PAGE
════════════════════════════════════════════════════════════ */

const PRODUCT_TYPE_OPTS = ["حافلة","رحلة VIP","طيران","فندق فقط"];
const DEST_OPTS: PkgDest[] = ["مكة","مكة والمدينة"];
const AUDIENCE_OPTS = ["عموم المعتمرين","العائلات","كبار السن وذوي الاحتياجات الخاصة"];
const RECUR_DAYS = ["السبت","الأحد","الإثنين","الثلاثاء","الأربعاء","الخميس","الجمعة"];
const PKG_GALLERY_MAX = 6;
const DEFAULT_PKG_SETTINGS:TripSettings = {allowOnlineBooking:true,manualConfirm:true,waitlistEnabled:false,requirePaymentFirst:true,showTicketAfterConfirm:true,paymentDeadlineHours:24,maxPilgrims:10};
const STAGE_ICONS = ["🚌","✈️","🕋","🕌","🏨","🏛️","🍽️","🌙","🔙","📿","🎒","⭐"];

export function destBadge(d:string) {
  return d==="مكة والمدينة"
    ? <span title={d} className="inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap max-w-full" style={{background:"#E3F3E8",color:"#1E7A44"}}>🕋🕌 مكة + المدينة</span>
    : <span title={d} className="inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap max-w-full" style={{background:"#E0F2FB",color:"#0E7CA8"}}>🕋 {d}</span>;
}
export function typeBadge(t:string) {
  const isVip = t.includes("VIP");
  return <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{background:isVip?"rgba(192,134,44,0.12)":"#EEECEA",color:isVip?B.gold:B.text2,border:isVip?"1px solid rgba(192,134,44,0.3)":"none"}}>{t}</span>;
}

/* ─── Add Package Modal ─── */
function AddPkgModal({onSave,onClose}:{onSave:(p:Pkg)=>void;onClose:()=>void}) {
  const [form,setForm]=useState<Omit<Pkg,"id"|"order"|"program"|"roomPrices"|"reviews"|"notes">>({
    name:"",productType:"حافلة",destination:"مكة",audience:"عموم المعتمرين",
    days:3,nights:2,status:"draft",marketPrice:0,
    recurring:true,recurDay:"الخميس",startDate:"",
    transportId:"",hotelId:"",features:[],policies:[],
  });
  const set=<K extends keyof typeof form>(k:K,v:(typeof form)[K])=>setForm(f=>({...f,[k]:v}));
  const inp="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none";
  const ist={borderColor:B.border,background:"#fff",color:B.black,fontFamily:"inherit"};
  function handleSave(){
    onSave({...form,id:newId("PKG"),order:999,program:[],roomPrices:[],reviews:[],notes:"",policies:[]});
  }
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{background:"rgba(14,12,11,0.78)",backdropFilter:"blur(4px)"}} onClick={onClose}>
      <motion.div initial={{opacity:0,y:30}} animate={{opacity:1,y:0}} exit={{opacity:0,y:30}}
        transition={{type:"spring",damping:30,stiffness:400}}
        className="w-full rounded-2xl overflow-hidden flex flex-col"
        style={{maxWidth:520,maxHeight:"90vh",background:"#fff"}} onClick={e=>e.stopPropagation()}>
        <div className="relative px-6 pt-5 pb-4 flex-shrink-0" style={{background:B.primary}}>
          <div className="absolute top-0 inset-x-0 h-1" style={{background:`linear-gradient(90deg,${B.gold},${B.gold2},${B.gold})`}}/>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{background:"rgba(192,134,44,0.15)",border:"1px solid rgba(192,134,44,0.3)"}}>
                <Package size={16} style={{color:B.gold}}/>
              </div>
              <h2 className="font-extrabold text-white" style={{fontSize:16,fontFamily:"var(--font-app)"}}>إضافة باقة جديدة</h2>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer"
              style={{background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.1)",color:"#7a7068"}}><X size={14}/></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4" style={{scrollbarWidth:"none"}}>
          <div className="rounded-xl px-4 py-3 flex items-start gap-2.5" style={{background:"#FBF3D6",border:"1px solid #EBD9A0"}}>
            <ListChecks size={16} style={{color:"#8A6A08",flexShrink:0,marginTop:1}}/>
            <p className="text-xs leading-relaxed" style={{color:"#8A6A08"}}>هذه بيانات مبدئية. بعد الحفظ ستُفتح صفحة التفاصيل تلقائياً لإكمال باقي البيانات (البرنامج، الغرف والأسعار، مميزات الرحلة، السياسات، الآراء).</p>
          </div>
          <div><Field label={<>اسم الباقة <span style={{color:B.gold}}>*</span></>}>
                 <input className={inp} style={ist} value={form.name} placeholder="مثال: عمرة مكة 3 أيام" onChange={e=>set("name",e.target.value)}/>
               </Field></div>
          <div><Field label="الوجهة">
                 <AppSelect value={form.destination} onChange={v=>set("destination",v as PkgDest)} options={DEST_OPTS.map(o=>({value:o,label:o}))}/>
               </Field>
            <p className="text-xs mt-1.5" style={{color:B.muted}}>نوع المنتج يُحدَّد تلقائياً من المواصلة المرتبطة في تفاصيل الباقة.</p></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Field label="الأيام">
                   <input type="number" min={1} className={inp} style={ist} value={form.days} onChange={e=>set("days",Number(e.target.value))}/>
                 </Field></div>
            <div><Field label="الليالي">
                   <input type="number" min={0} className={inp} style={ist} value={form.nights} onChange={e=>set("nights",Number(e.target.value))}/>
                 </Field></div>
          </div>
          <div><label className="block text-xs font-bold mb-2" style={{color:B.text3}}>الحالة</label>
            <div className="grid grid-cols-2 gap-2">
              {([["active","نشطة","#E3F3E8","#1E7A44"],["draft","مسودة","#FBF3D6","#8A6A08"],["hidden","مخفية","#EEECEA","#5C554E"],["suspended","موقوفة","#FBE6E6","#BE2626"]] as const).map(([v,l,bg,fg])=>(
                <button key={v} onClick={()=>set("status",v as PkgStatus)} className="flex items-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold cursor-pointer"
                  style={{background:form.status===v?bg:B.bg,color:form.status===v?fg:B.muted,border:`1.5px solid ${form.status===v?fg.replace("26","C9"):B.border}`}}>
                  <span className="w-2 h-2 rounded-full" style={{background:form.status===v?fg:B.border}}/>{l}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl p-4" style={{background:B.bg,border:`1px solid ${B.border}`}}>
            <Field label="أيام التشغيل المقترحة">
              <AppSelect value={form.recurDay} onChange={v=>set("recurDay",v)} options={RECUR_DAYS.map(d=>({value:d,label:d}))}/>
            </Field>
            <p className="text-xs mt-2 flex items-center gap-1.5" style={{color:B.muted}}><CalendarDays size={12} style={{color:B.gold}}/>اقتراح فقط — تُحدَّد تواريخ الانطلاق الفعلية عند إطلاق الرحلات.</p>
          </div>
        </div>
        <div className="flex gap-3 px-6 py-4 flex-shrink-0" style={{borderTop:`1px solid ${B.border}`}}>
          <button onClick={handleSave} className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold cursor-pointer"
            style={{background:B.gold,color:B.black,border:"none"}}><Check size={14}/>حفظ الباقة</button>
          <button onClick={onClose} className="px-5 py-3 rounded-xl text-sm font-bold cursor-pointer"
            style={{background:B.bg,color:B.text2,border:"none"}}>إلغاء</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─── Searchable feature-icon picker (with logos) ─── */
function FeatureIconPicker({value,onChange}:{value:string;onChange:(k:string)=>void}) {
  const [open,setOpen]=useState(false);
  const [q,setQ]=useState("");
  const CurIcon=(PKG_FEATURE_ICONS[value]??PKG_FEATURE_ICONS.check).icon;
  const entries=Object.entries(PKG_FEATURE_ICONS).filter(([,v])=>v.label.includes(q.trim()));
  return (
    <div className="relative flex-shrink-0">
      <button type="button" onClick={()=>setOpen(o=>!o)} title="اختر شعار الميزة"
        className="h-10 px-2.5 rounded-xl flex items-center gap-1.5 cursor-pointer"
        style={{background:`linear-gradient(135deg,${B.gold},${B.gold2})`,color:B.black,border:"none"}}>
        <CurIcon size={16}/>
        <ChevronDown size={13} style={{opacity:0.75}}/>
      </button>
      {open&&(
        <>
          <div className="fixed inset-0" style={{zIndex:40}} onClick={()=>{setOpen(false);setQ("");}}/>
          <div className="absolute mt-1 rounded-xl overflow-hidden flex flex-col"
            style={{zIndex:41,top:"100%",insetInlineStart:0,width:230,maxWidth:"calc(100vw - 32px)",background:"#fff",border:`1px solid ${B.border}`,boxShadow:"0 12px 30px rgba(0,0,0,0.15)"}}>
            <div className="p-2" style={{borderBottom:`1px solid ${B.border}`}}>
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg" style={{background:B.bg,border:`1px solid ${B.border}`}}>
                <Search size={13} style={{color:B.muted}}/>
                <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="ابحث عن شعار..."
                  className="flex-1 text-xs focus:outline-none" style={{background:"none",border:"none",color:B.black,fontFamily:"inherit"}}/>
              </div>
            </div>
            <div className="overflow-y-auto" style={{maxHeight:248,scrollbarWidth:"thin"}}>
              {entries.map(([k,v])=>{ const Icon=v.icon; const active=k===value; return (
                <button key={k} type="button" onClick={()=>{onChange(k);setOpen(false);setQ("");}}
                  className="w-full flex items-center gap-2.5 px-3 py-2 cursor-pointer text-right"
                  style={{background:active?"rgba(192,134,44,0.1)":"#fff",border:"none",borderBottom:`1px solid ${B.border}`}}>
                  <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{background:active?`linear-gradient(135deg,${B.gold},${B.gold2})`:B.bg,color:active?B.black:B.text2}}><Icon size={14}/></span>
                  <span className="text-sm font-semibold" style={{color:B.black}}>{v.label}</span>
                  {active&&<Check size={14} style={{color:B.gold,marginRight:"auto"}}/>}
                </button>
              );})}
              {entries.length===0&&<div className="px-3 py-5 text-center text-xs" style={{color:B.muted}}>لا نتائج مطابقة</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Package Detail ─── */
type PkgTab = "info"|"program"|"rooms"|"features"|"policies"|"reviews"|"settings";
function PackageDetail({pkg,transports,hotels,onSave,onBack}:{pkg:Pkg;transports:Transport[];hotels:Hotel[];onSave:(p:Pkg)=>void;onBack:()=>void}) {
  const [tab,setTab]=useState<PkgTab>("info");
  const [form,setForm]=useState<Pkg>(pkg);
  const set=<K extends keyof Pkg>(k:K,v:Pkg[K])=>setForm(f=>({...f,[k]:v}));
  const inp="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none";
  const ist={borderColor:B.border,background:"#fff",color:B.black,fontFamily:"inherit"};

  // Images (main + gallery)
  const gallery=form.gallery??[];
  const addGalleryImg=(url:string)=>{ if(gallery.length>=PKG_GALLERY_MAX) return; set("gallery",[...gallery,url]); };
  const delGalleryImg=(i:number)=>set("gallery",gallery.filter((_,idx)=>idx!==i));
  const promoteGalleryImg=(i:number)=>{ const url=gallery[i]; const rest=gallery.filter((_,idx)=>idx!==i); const demoted=form.coverImage?[form.coverImage,...rest]:rest; setForm(f=>({...f,coverImage:url,gallery:demoted.slice(0,PKG_GALLERY_MAX)})); };

  // Booking settings
  const settings=form.settings??DEFAULT_PKG_SETTINGS;
  const setSetting=<K extends keyof TripSettings>(k:K,v:TripSettings[K])=>set("settings",{...settings,[k]:v});

  // Program
  const activeStages=form.program.filter(s=>!s.archived);
  const archivedStages=form.program.filter(s=>s.archived);
  const addStage=()=>set("program",[...form.program,{id:uid(),order:form.program.length+1,icon:"🕋",day:"",time:"",title:"",desc:""}]);
  const delStage=(id:string)=>set("program",form.program.filter(s=>s.id!==id));
  const updStage=(id:string,field:keyof ProgramStage,val:any)=>set("program",form.program.map(s=>s.id===id?{...s,[field]:val}:s));
  const archiveStage=(id:string)=>set("program",form.program.map(s=>s.id===id?{...s,archived:true}:s));
  const unarchiveStage=(id:string)=>set("program",form.program.map(s=>s.id===id?{...s,archived:false}:s));
  const moveStage=(id:string,dir:-1|1)=>{
    const ai=activeStages.findIndex(s=>s.id===id);const aj=ai+dir;
    if(aj<0||aj>=activeStages.length)return;
    const targetId=activeStages[aj].id;
    const arr=[...form.program];const i=arr.findIndex(s=>s.id===id);const j=arr.findIndex(s=>s.id===targetId);
    [arr[i],arr[j]]=[arr[j],arr[i]];
    set("program",arr.map((s,idx)=>({...s,order:idx+1})));
  };

  // Rooms
  const addRoom=()=>set("roomPrices",[...form.roomPrices,{id:uid(),type:"غرفة خاصة",persons:2,perNight:0,seatCost:selTransport?.seatCost??0}]);
  const delRoom=(id:string)=>set("roomPrices",form.roomPrices.filter(r=>r.id!==id));
  const updRoom=(id:string,field:keyof RoomPrice,val:any)=>set("roomPrices",form.roomPrices.map(r=>r.id===id?{...r,[field]:val}:r));

  // Features
  const addFeat=()=>set("features",[...form.features,{id:uid(),icon:"check",text:""}]);
  const delFeat=(id:string)=>set("features",form.features.filter(f=>f.id!==id));
  const updFeat=(id:string,field:keyof PkgFeature,val:string)=>set("features",form.features.map(f=>f.id===id?{...f,[field]:val}:f));

  // Policies (each policy is a separate box)
  const addPolicy=()=>set("policies",[...form.policies,""]);
  const delPolicy=(i:number)=>set("policies",form.policies.filter((_,idx)=>idx!==i));
  const updPolicy=(i:number,val:string)=>set("policies",form.policies.map((p,idx)=>idx===i?val:p));
  const movePolicy=(i:number,dir:-1|1)=>{const arr=[...form.policies];const j=i+dir;if(j<0||j>=arr.length)return;[arr[i],arr[j]]=[arr[j],arr[i]];set("policies",arr);};

  // Reviews
  const addReview=()=>set("reviews",[...form.reviews,{id:uid(),name:"",text:"",consent:false,rating:9}]);
  const delReview=(id:string)=>set("reviews",form.reviews.filter(r=>r.id!==id));
  const updReview=(id:string,field:keyof PkgReview,val:any)=>set("reviews",form.reviews.map(r=>r.id===id?{...r,[field]:val}:r));

  const selTransport = transports.find(t=>t.id===form.transportId);
  const selHotel     = hotels.find(h=>h.id===form.hotelId);
  const TABS:{id:PkgTab;label:string}[]=[{id:"info",label:"المعلومات"},{id:"program",label:"تفاصيل البرنامج"},{id:"rooms",label:"الغرف والأسعار"},{id:"features",label:"مميزات الرحلة"},{id:"policies",label:"السياسات"},{id:"reviews",label:"الآراء"},{id:"settings",label:"الإعدادات"}];

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{background:B.bg}}>
      {/* Sticky header */}
      <div className="sticky top-0 z-20 px-4 md:px-8 pt-4 md:pt-6 pb-0" style={{background:B.bg}}>
        <div className="flex items-center gap-3 mb-4">
          <button onClick={onBack} className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer"
            style={{background:"#fff",border:`1px solid ${B.border}`,color:B.text2}}>
            <ArrowRight size={12}/>العودة للباقات
          </button>
          <ChevronRight size={14} style={{color:B.border}}/>
          <span className="text-sm font-bold" style={{color:B.black}}>{form.name}</span>
          <span className="text-xs font-mono px-2 py-0.5 rounded-lg" style={{background:B.bg,border:`1px solid ${B.border}`,color:B.muted}}>{form.id}</span>
          <div className="mr-auto flex items-center gap-2">
            <StatusBadge status={form.status}/>
          </div>
        </div>
        {/* Package hero strip */}
        <div className="relative rounded-2xl overflow-hidden mb-0" style={{height:96,background:B.primary}}>
          <div className="absolute inset-0" style={{backgroundImage:`repeating-linear-gradient(45deg,rgba(192,134,44,0.035) 0px,rgba(192,134,44,0.035) 1px,transparent 1px,transparent 20px),repeating-linear-gradient(-45deg,rgba(192,134,44,0.035) 0px,rgba(192,134,44,0.035) 1px,transparent 1px,transparent 20px)`}}/>
          <div className="absolute inset-0" style={{background:"radial-gradient(ellipse at 20% 50%,rgba(60,40,10,0.4) 0%,rgba(14,12,11,0.85) 70%)"}}/>
          <div className="absolute top-0 inset-x-0 h-0.5" style={{background:`linear-gradient(90deg,${B.gold},${B.gold2},${B.gold})`}}/>
          <div className="relative flex items-center h-full px-6 gap-5">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 overflow-hidden"
              style={{background:"rgba(192,134,44,0.15)",border:"1px solid rgba(192,134,44,0.3)"}}>
              {form.coverImage?<img src={form.coverImage} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:"🕋"}</div>
            <div className="flex-1 min-w-0">
              <h1 style={{fontFamily:"var(--font-app)",fontSize:20,fontWeight:800,color:"#fff",margin:0,lineHeight:1.2}}>{form.name}</h1>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {destBadge(form.destination)}
                {typeBadge(form.productType)}
                <span className="text-xs px-2.5 py-1 rounded-full" style={{background:"rgba(255,255,255,0.08)",color:"rgba(240,230,204,0.7)"}}>
                  {form.days} أيام / {form.nights} ليالٍ
                </span>
                {form.recurDay && <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full" style={{background:"rgba(255,255,255,0.08)",color:"rgba(240,230,204,0.7)"}}>
                    <Repeat size={10}/> {form.recurDay}
                  </span>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-xs" style={{color:B.muted}}>يبدأ من</div>
                <div className="text-2xl font-extrabold" style={{color:B.gold,fontFamily:"var(--font-app)",lineHeight:1}}>{form.marketPrice}<span className="text-sm font-bold mr-1" style={{color:B.gold2}}>ر.س</span></div>
              </div>
              <button onClick={()=>onSave(form)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer"
                style={{background:B.gold,color:B.black,border:"none"}}><Check size={13}/>حفظ</button>
            </div>
          </div>
        </div>
        {/* Tabs */}
        <div className="flex gap-1 pt-3">
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} className="relative px-4 py-2.5 text-sm font-bold cursor-pointer rounded-t-xl"
              style={{background:tab===t.id?"#fff":"transparent",color:tab===t.id?B.black:B.muted,border:"none",borderBottom:tab===t.id?"none":"none"}}>
              {t.label}
              {tab===t.id&&<motion.div layoutId="pktab" className="absolute inset-x-0 bottom-0 h-0.5" style={{background:B.gold}}/>}
            </button>
          ))}
        </div>
        <div style={{height:1,background:B.border}}/>
      </div>
      {/* Body */}
      <div className="flex-1 px-4 md:px-8 pb-12 pt-6 overflow-y-auto" style={{scrollbarWidth:"none"}}>
        <AnimatePresence mode="wait">
          {tab==="info"&&<motion.div key="pi" initial={{opacity:0,x:10}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-10}} className="grid gap-5" style={{gridTemplateColumns:"1.4fr 1fr",maxWidth:900}}>
            {/* LEFT */}
            <div className="flex flex-col gap-4">
              <div className="rounded-2xl p-5 flex flex-col gap-4" style={{background:"#fff",border:`1px solid ${B.border}`}}>
                <h3 className="text-sm font-bold" style={{color:B.black,margin:0}}>المعلومات الأساسية</h3>
                {/* Package images: main + gallery */}
                <div>
                  <label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>صور الباقة</label>
                  <div className="flex gap-3">
                    {/* Main image */}
                    <label className="relative rounded-xl overflow-hidden flex items-center justify-center cursor-pointer flex-shrink-0"
                      style={{width:132,height:132,border:`1.5px solid ${form.coverImage?B.gold:B.border}`,background:form.coverImage?"transparent":B.bg}}>
                      {form.coverImage
                        ? <img src={form.coverImage} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                        : <div className="flex flex-col items-center gap-1" style={{color:B.muted}}><ImagePlus size={22}/><span style={{fontSize:11,fontWeight:700}}>الصورة الأساسية</span></div>}
                      <span className="absolute top-1.5 right-1.5 flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold"
                        style={{background:"rgba(192,134,44,0.92)",color:"#fff"}}><Star size={10}/>أساسية</span>
                      {form.coverImage&&<button onClick={e=>{e.preventDefault();set("coverImage","");}} className="absolute bottom-1.5 left-1.5 w-6 h-6 rounded-md flex items-center justify-center cursor-pointer"
                        style={{background:"rgba(190,38,38,0.9)",border:"none",color:"#fff"}} title="حذف الصورة الأساسية"><Trash2 size={12}/></button>}
                      <input type="file" accept="image/*" className="hidden" onChange={onPickMedia("packages",url=>set("coverImage",url))}/>
                    </label>
                    {/* Gallery thumbnails */}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs mb-1.5" style={{color:B.muted}}>صور فرعية · {gallery.length}/{PKG_GALLERY_MAX}</div>
                      <div className="flex flex-wrap gap-2">
                        {gallery.map((url,i)=>(
                          <div key={i} className="relative rounded-lg overflow-hidden group" style={{width:58,height:58,border:`1px solid ${B.border}`}}>
                            <img src={url} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                            <button onClick={()=>promoteGalleryImg(i)} className="absolute top-0.5 right-0.5 w-5 h-5 rounded flex items-center justify-center cursor-pointer"
                              style={{background:"rgba(255,255,255,0.85)",border:"none",color:B.gold}} title="اجعلها الصورة الأساسية"><Star size={11}/></button>
                            <button onClick={()=>delGalleryImg(i)} className="absolute bottom-0.5 left-0.5 w-5 h-5 rounded flex items-center justify-center cursor-pointer"
                              style={{background:"rgba(190,38,38,0.9)",border:"none",color:"#fff"}} title="حذف"><X size={10}/></button>
                          </div>
                        ))}
                        {gallery.length<PKG_GALLERY_MAX&&(
                          <label className="rounded-lg flex flex-col items-center justify-center cursor-pointer" style={{width:58,height:58,border:`1px dashed ${B.border}`,background:B.bg,color:B.muted}}>
                            <ImagePlus size={16}/>
                            <input type="file" accept="image/*" className="hidden" onChange={onPickMedia("package-gallery",url=>addGalleryImg(url))}/>
                          </label>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div><Field label="اسم الباقة">
                       <input className={inp} style={ist} value={form.name} onChange={e=>set("name",e.target.value)}/>
                     </Field></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Field label="نوع المنتج">
                         <AppSelect value={form.productType} onChange={v=>set("productType",v)} options={PRODUCT_TYPE_OPTS.map(o=>({value:o,label:o}))}/>
                       </Field></div>
                  <div><Field label="الوجهة">
                         <AppSelect value={form.destination} onChange={v=>set("destination",v as PkgDest)} options={DEST_OPTS.map(o=>({value:o,label:o}))}/>
                       </Field></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Field label="الأيام">
                         <input type="number" min={1} className={inp} style={ist} value={form.days} onChange={e=>set("days",Number(e.target.value))}/>
                       </Field></div>
                  <div><Field label="الليالي">
                         <input type="number" min={0} className={inp} style={ist} value={form.nights} onChange={e=>set("nights",Number(e.target.value))}/>
                       </Field></div>
                  
                </div>
                <div><Field label="الحالة">
                       <AppSelect value={form.status} onChange={v=>set("status",v as PkgStatus)}
                                           options={[{value:"active",label:"نشطة"},{value:"draft",label:"مسودة"},{value:"hidden",label:"مخفية"},{value:"suspended",label:"موقوفة"}]}/>
                     </Field></div>
              </div>
              {/* Suggested operating days */}
              <div className="rounded-2xl p-5 flex flex-col gap-3" style={{background:"#fff",border:`1px solid ${B.border}`}}>
                <div><div className="text-sm font-bold" style={{color:B.black}}>أيام التشغيل المقترحة</div>
                  <div className="text-xs mt-0.5" style={{color:B.muted}}>اليوم الأسبوعي المقترح لتشغيل الباقة · التواريخ الفعلية تُحدد في الرحلات</div></div>
                <div><Field label="اليوم المقترح">
                       <AppSelect value={form.recurDay} onChange={v=>set("recurDay",v)} options={RECUR_DAYS.map(d=>({value:d,label:d}))}/>
                     </Field></div>
              </div>
            </div>
            {/* RIGHT */}
            <div className="flex flex-col gap-4">
              {/* Transport link */}
              <div className="rounded-2xl p-5 flex flex-col gap-3" style={{background:"#fff",border:`1px solid ${B.border}`}}>
                <h3 className="text-sm font-bold" style={{color:B.black,margin:0}}>المواصلة المرتبطة</h3>
                <AppSelect value={form.transportId} placeholder="اختر مواصلة" onChange={v=>{
                  const t=transports.find(x=>x.id===v);
                  setForm(f=>({...f,transportId:v,productType:t?(t.mode==="flight"?"طيران":t.vehicleType.includes("VIP")?"رحلة VIP":"حافلة"):f.productType}));
                }} options={transports.map(t=>({value:t.id,label:`${t.name} · ${t.vehicleType} · ${t.seats} مقعد`}))}/>
                {selTransport && (()=>{ const cover=selTransport.media?.find(m=>m.primary&&m.kind==="image")?.url||selTransport.media?.find(m=>m.kind==="image")?.url; return (
                  <div className="flex items-center gap-3 p-3 rounded-xl" style={{background:`linear-gradient(135deg,${B.primary},${B.primaryDeep})`,border:"1px solid rgba(192,134,44,0.2)"}}>
                    <div className="w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0" style={{background:"rgba(255,255,255,0.08)"}}>
                      {cover?<img src={cover} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<span className="text-2xl">{selTransport.mode==="bus"?"🚌":"✈️"}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold" style={{color:"#fff"}}>{selTransport.name}</div>
                      <div className="text-xs mt-0.5" style={{color:B.gold2}}>{selTransport.vehicleType} · {selTransport.seats} مقعد</div>
                    </div>
                  </div>
                ); })()}
              </div>
              {/* Hotel link */}
              <div className="rounded-2xl p-5 flex flex-col gap-3" style={{background:"#fff",border:`1px solid ${B.border}`}}>
                <h3 className="text-sm font-bold" style={{color:B.black,margin:0}}>الفندق المرتبط</h3>
                <AppSelect value={form.hotelId} placeholder="اختر فندقاً" onChange={v=>set("hotelId",v)}
                  options={hotels.map(h=>({value:h.id,label:`${h.name} · ${h.city} · ${h.stars}★`}))}/>
                {selHotel && (()=>{ const cover=selHotel.media?.find(m=>m.primary&&m.kind==="image")?.url||selHotel.media?.find(m=>m.kind==="image")?.url; return (
                  <div className="flex items-center gap-3 p-3 rounded-xl" style={{background:B.bg,border:`1px solid ${B.border}`}}>
                    <div className="w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0" style={{background:"#fff",border:`1px solid ${B.border}`}}>
                      {cover?<img src={cover} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<Building2 size={18} style={{color:B.muted}}/>}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-sm mb-0.5" style={{color:B.black}}>فندق {selHotel.name}</div>
                      <div className="flex items-center gap-2 text-xs" style={{color:B.text2}}>
                        <MapPin size={10} style={{color:B.gold}}/>
                        <span>{selHotel.city}</span><span>·</span>
                        <span>{distanceLabel(selHotel.distanceM)}</span><span>·</span>
                        <div className="flex gap-0.5">{Array.from({length:selHotel.stars},(_,i)=><Star key={i} size={9} fill={B.gold} stroke={B.gold}/>)}</div>
                      </div>
                    </div>
                  </div>
                ); })()}
              </div>
              {/* Notes */}
              <div className="rounded-2xl p-5 flex flex-col gap-2" style={{background:"#fff",border:`1px solid ${B.border}`}}>
                <Field label="ملاحظات داخلية" labelClass="text-sm font-bold" labelStyle={{color:B.black}}>
                  <textarea className={inp} style={{...ist,resize:"vertical"}} rows={4} value={form.notes} onChange={e=>set("notes",e.target.value)} placeholder="ملاحظات للفريق..."/>
                </Field>
              </div>
            </div>
          </motion.div>}

          {tab==="program"&&<motion.div key="pp" initial={{opacity:0,x:10}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-10}}>
            <div style={{display:"grid",gridTemplateColumns:"1.3fr 1fr",gap:24,maxWidth:860}}>
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold" style={{color:B.black}}>مراحل البرنامج</h3>
                  <button onClick={addStage} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer"
                    style={{background:B.primary,border:"none",color:B.cream}}><Plus size={12}/>إضافة مرحلة</button>
                </div>
                <AnimatePresence>{activeStages.map((s,idx)=>(
                  <motion.div key={s.id} initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}
                    className="rounded-2xl overflow-hidden" style={{border:`1px solid ${B.border}`}}>
                    <div className="flex items-center gap-2 px-4 py-2.5" style={{background:B.bg,borderBottom:`1px solid ${B.border}`}}>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs" style={{background:B.primary,color:B.gold}}>{idx+1}</div>
                      <span className="text-sm font-bold flex-1" style={{color:B.black}}>{s.title||"مرحلة جديدة"}</span>
                      <div className="flex gap-1">
                        <button onClick={()=>moveStage(s.id,-1)} disabled={idx===0} className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer"
                          style={{background:"#fff",border:`1px solid ${B.border}`,color:B.muted,opacity:idx===0?0.4:1}}><ChevronUp size={12}/></button>
                        <button onClick={()=>moveStage(s.id,1)} disabled={idx===activeStages.length-1} className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer"
                          style={{background:"#fff",border:`1px solid ${B.border}`,color:B.muted,opacity:idx===activeStages.length-1?0.4:1}}><ChevronDown size={12}/></button>
                        <button onClick={()=>archiveStage(s.id)} title="أرشفة المرحلة" className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer"
                          style={{background:"#fff",border:`1px solid ${B.border}`,color:"#8a6a08"}}><Archive size={12}/></button>
                        <button onClick={()=>delStage(s.id)} className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer"
                          style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}><X size={11}/></button>
                      </div>
                    </div>
                    <div className="p-4 grid grid-cols-2 gap-3">
                      <div><Field label="الأيقونة" labelClass="block text-xs font-bold mb-1" labelStyle={{color:B.muted}}>
                             <select className={inp} style={{...ist,fontSize:16}} value={s.icon} onChange={e=>updStage(s.id,"icon",e.target.value)}>
                                                       {STAGE_ICONS.map(i=><option key={i} value={i}>{i}</option>)}</select>
                           </Field></div>
                      <div><Field label="الوقت" labelClass="block text-xs font-bold mb-1" labelStyle={{color:B.muted}}>
                             <input className={inp} style={{...ist,direction:"ltr"}} value={s.time} placeholder="22:00" onChange={e=>updStage(s.id,"time",e.target.value)}/>
                           </Field></div>
                      <div style={{gridColumn:"1/-1"}}>
                        <Field label="اليوم" labelClass="block text-xs font-bold mb-1" labelStyle={{color:B.muted}}>
                          <input className={inp} style={ist} value={s.day} placeholder="اليوم الأول" onChange={e=>updStage(s.id,"day",e.target.value)}/>
                        </Field></div>
                      <div style={{gridColumn:"1/-1"}}>
                        <Field label="عنوان المرحلة" labelClass="block text-xs font-bold mb-1" labelStyle={{color:B.muted}}>
                          <input className={inp} style={ist} value={s.title} placeholder="الانطلاق من الرياض" onChange={e=>updStage(s.id,"title",e.target.value)}/>
                        </Field></div>
                      <div style={{gridColumn:"1/-1"}}>
                        <Field label="وصف مختصر" labelClass="block text-xs font-bold mb-1" labelStyle={{color:B.muted}}>
                          <textarea className={inp} style={{...ist,resize:"vertical"}} rows={2} value={s.desc} onChange={e=>updStage(s.id,"desc",e.target.value)}/>
                        </Field></div>
                    </div>
                  </motion.div>
                ))}</AnimatePresence>
                {activeStages.length===0&&<div className="flex flex-col items-center py-16 rounded-2xl" style={{border:`2px dashed ${B.border}`,color:B.muted}}><ListChecks size={28} style={{opacity:0.3,marginBottom:8}}/><p className="text-sm">لم تُضف مراحل بعد</p></div>}
                {/* Archived stages */}
                {archivedStages.length>0&&(
                  <div className="mt-2 rounded-2xl p-4 flex flex-col gap-2" style={{background:B.bg,border:`1px dashed ${B.border}`}}>
                    <div className="flex items-center gap-2 mb-1">
                      <Archive size={13} style={{color:"#8a6a08"}}/>
                      <span className="text-xs font-bold" style={{color:B.text2}}>مراحل مؤرشفة ({archivedStages.length})</span>
                      <span className="text-xs" style={{color:B.muted}}>— لا تظهر للمستخدم، يمكن إعادة تفعيلها</span>
                    </div>
                    <AnimatePresence>{archivedStages.map(s=>(
                      <motion.div key={s.id} initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{background:"#fff",border:`1px solid ${B.border}`}}>
                        <span className="text-base flex-shrink-0" style={{opacity:0.6}}>{s.icon}</span>
                        <span className="text-sm font-bold flex-1 min-w-0 truncate" style={{color:B.muted}}>{s.title||"مرحلة بدون عنوان"}</span>
                        <button onClick={()=>unarchiveStage(s.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
                          style={{background:"#E3F3E8",border:"1px solid #C4E4CE",color:"#1E7A44"}}><ArchiveRestore size={12}/>إعادة تفعيل</button>
                        <button onClick={()=>delStage(s.id)} className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer"
                          style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}><Trash2 size={11}/></button>
                      </motion.div>
                    ))}</AnimatePresence>
                  </div>
                )}
              </div>
              {/* Preview */}
              <div className="sticky top-4">
                <h3 className="text-sm font-bold mb-3" style={{color:B.black}}>معاينة العرض للمستخدم</h3>
                <div className="rounded-2xl p-5" style={{background:"#fff",border:`1px solid ${B.border}`}}>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-lg" style={{color:B.gold}}>〰</span>
                    <span className="font-extrabold" style={{color:B.black,fontFamily:"var(--font-app)",fontSize:15}}>برنامج الرحلة اليومي</span>
                  </div>
                  {activeStages.map((s,idx)=>(
                    <div key={s.id} className="flex gap-3">
                      <div className="flex flex-col items-center flex-shrink-0">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base" style={{background:B.bg,border:`1.5px solid ${B.border}`}}>{s.icon}</div>
                        {idx<activeStages.length-1&&<div className="flex-1 w-0.5 my-1" style={{background:B.border,minHeight:12}}/>}
                      </div>
                      <div className="pb-4 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-bold text-sm" style={{color:B.black}}>{s.day||"—"}</span>
                          {s.time&&<span className="text-xs px-2 py-0.5 rounded-lg font-bold" style={{background:"#FBF3D6",color:"#8A6A08"}}>{s.time}</span>}
                        </div>
                        <div className="text-xs font-semibold" style={{color:B.text2}}>{s.title||"—"}</div>
                        {s.desc&&<div className="text-xs mt-0.5" style={{color:B.muted}}>{s.desc}</div>}
                      </div>
                    </div>
                  ))}
                  {activeStages.length===0&&<div className="text-center py-8 text-xs" style={{color:B.muted}}>لا توجد مراحل</div>}
                </div>
              </div>
            </div>
          </motion.div>}

          {tab==="rooms"&&<motion.div key="pr" initial={{opacity:0,x:10}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-10}}><div style={{maxWidth:800}}>
            {/* "يبدأ من" marketing price */}
            <div className="rounded-2xl p-4 mb-4 flex items-center justify-between gap-3 flex-wrap" style={{background:"#fff",border:`1px solid ${B.border}`}}>
              <div>
                <label className="block text-sm font-bold mb-0.5" style={{color:B.black}}>السعر يبدأ من (ر.س)</label>
                <p className="text-xs" style={{color:B.muted}}>سعر تسويقي يظهر للعميل كنقطة بداية — لا يؤثر على حساب الأسعار الفعلية أدناه.</p>
              </div>
              <input type="number" min={0} className="border rounded-xl px-3.5 py-2.5 text-lg font-extrabold text-center focus:outline-none"
                style={{borderColor:B.gold,background:"#FFF7EA",color:B.gold,fontFamily:"var(--font-app)",width:140}}
                value={form.marketPrice} onChange={e=>set("marketPrice",Number(e.target.value))}/>
            </div>

            {/* Read-only review: selected transport + hotel rooms */}
            <div className="rounded-2xl p-4 mb-4" style={{background:B.bg,border:`1px dashed ${B.border}`}}>
              <div className="text-xs font-bold mb-2.5 flex items-center gap-1.5" style={{color:B.text2}}><ListChecks size={13} style={{color:B.gold}}/>مراجعة سريعة قبل التسعير (عرض فقط)</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Transport */}
                <div className="rounded-xl p-3" style={{background:"#fff",border:`1px solid ${B.border}`}}>
                  <div className="text-xs font-bold mb-2" style={{color:B.muted}}>المواصلة المختارة</div>
                  {selTransport
                    ? <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-bold" style={{color:B.black}}>{selTransport.mode==="bus"?"🚌":"✈️"} {selTransport.name}</span>
                        <span className="font-bold" style={{color:B.gold,fontFamily:"var(--font-app)"}}>{selTransport.seatCost} ر.س<span className="text-xs font-normal" style={{color:B.muted}}> /مقعد</span></span>
                      </div>
                    : <div className="text-xs" style={{color:B.muted}}>لم تُربط مواصلة بعد.</div>}
                </div>
                {/* Hotel rooms */}
                <div className="rounded-xl p-3" style={{background:"#fff",border:`1px solid ${B.border}`}}>
                  <div className="text-xs font-bold mb-2" style={{color:B.muted}}>غرف الفندق المختار{selHotel?` · ${selHotel.name}`:""}</div>
                  {selHotel&&selHotel.roomTypes.length>0
                    ? <div className="flex flex-col gap-1">{selHotel.roomTypes.map(rt=>(
                        <div key={rt.id} className="flex items-center justify-between gap-2 text-xs">
                          <span style={{color:B.text2}}>{rt.kind==="shared"?"سكن مشترك":"غرفة خاصة"} · {rt.beds} سرير</span>
                          <span className="font-bold" style={{color:B.black,fontFamily:"var(--font-app)"}}>{rt.pricePerNight} ر.س</span>
                        </div>
                      ))}</div>
                    : <div className="text-xs" style={{color:B.muted}}>لا فندق مرتبط أو لا توجد غرف.</div>}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between mb-2">
              <div><h3 className="text-sm font-bold" style={{color:B.black}}>جدول الغرف والأسعار</h3>
                <p className="text-xs mt-0.5" style={{color:B.muted}}>كل صف مستقل — عدّل عدد الأشخاص وتكلفة المقعد لكل نوع سكن على حِدة. الإجمالي للفرد = تكلفة المقعد + (سعر الليلة × عدد الليالي)</p></div>
              <button onClick={addRoom} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold cursor-pointer"
                style={{background:B.primary,border:"none",color:B.cream}}><Plus size={12}/>إضافة نوع</button>
            </div>
            <div className="rounded-2xl overflow-hidden" style={{border:`1px solid ${B.border}`}}>
              <div className="grid text-xs font-bold" style={{gridTemplateColumns:"1.6fr .8fr 1.3fr .65fr 1.1fr 1.2fr 36px",background:B.bg,color:B.muted,borderBottom:`1px solid ${B.border}`}}>
                {["نوع السكن","عدد الأشخاص","سعر السكن للفرد / الليلة","عدد الليالي","تكلفة المقعد","الإجمالي للفرد",""].map((h,i)=>(
                  <div key={i} className="px-3 py-3 text-center first:text-right">{h}</div>
                ))}
              </div>
              <AnimatePresence>{form.roomPrices.map(r=>{
                const seatCost = r.seatCost ?? (selTransport?.seatCost ?? 0);
                const total = r.perNight * form.nights + seatCost;
                return (
                  <motion.div key={r.id} initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}
                    className="grid items-center" style={{gridTemplateColumns:"1.6fr .8fr 1.3fr .65fr 1.1fr 1.2fr 36px",borderTop:`1px solid ${B.border}`,background:"#fff"}}>
                    <div className="px-3 py-2">
                      <select className="w-full border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none cursor-pointer"
                        style={{borderColor:B.border,background:"#fff",color:B.black,fontFamily:"inherit"}}
                        value={r.type} onChange={e=>updRoom(r.id,"type",e.target.value)}>
                        <option>سكن مشترك</option><option>غرفة خاصة</option><option>جناح عائلي</option>
                      </select>
                    </div>
                    <div className="px-3 py-2"><input type="number" min={1} className="w-full border rounded-xl px-2 py-2 text-xs text-center focus:outline-none"
                      style={{borderColor:B.border,fontFamily:"inherit"}} value={r.persons} onChange={e=>updRoom(r.id,"persons",Number(e.target.value))}/></div>
                    <div className="px-3 py-2"><input type="number" min={0} className="w-full border rounded-xl px-2 py-2 text-xs font-bold text-center focus:outline-none"
                      style={{borderColor:B.border,color:B.gold,fontFamily:"inherit"}} value={r.perNight} onChange={e=>updRoom(r.id,"perNight",Number(e.target.value))}/></div>
                    <div className="px-3 py-2 text-xs font-bold text-center" style={{color:B.text2}}>{form.nights}</div>
                    <div className="px-3 py-2"><input type="number" min={0} className="w-full border rounded-xl px-2 py-2 text-xs font-bold text-center focus:outline-none"
                      style={{borderColor:r.seatCost!=null?B.gold:B.border,color:B.text2,fontFamily:"var(--font-app)"}} value={seatCost}
                      onChange={e=>updRoom(r.id,"seatCost",Number(e.target.value))}/></div>
                    <div className="px-3 py-2 text-sm font-extrabold text-center" style={{color:B.black,fontFamily:"var(--font-app)"}}>{total.toLocaleString()} ر.س</div>
                    <div className="px-2 py-2"><button onClick={()=>delRoom(r.id)} className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer"
                      style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}><X size={11}/></button></div>
                  </motion.div>
                );
              })}</AnimatePresence>
              {form.roomPrices.length===0&&<div className="flex flex-col items-center py-16" style={{color:B.muted}}><Building2 size={28} style={{opacity:0.3,marginBottom:8}}/><p className="text-sm">لم تُضف خيارات غرف بعد</p></div>}
            </div>
            <div className="flex items-center gap-2 mt-2 px-1 flex-wrap">
              <p className="text-xs" style={{color:B.muted}}>
                💡 أعطِ خصماً على المقعد كلما زاد عدد الأشخاص في الغرفة (مثال: 3 أشخاص = سعر أقل، شخص واحد = سعر أعلى).
                {selTransport&&<> القيمة المبدئية للمقعد من المواصلة ({selTransport.name}): {selTransport.seatCost} ر.س.</>}
              </p>
            </div>
          </div></motion.div>}

          {tab==="features"&&<motion.div key="pf" initial={{opacity:0,x:10}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-10}} style={{maxWidth:600}} className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div><h3 className="text-sm font-bold" style={{color:B.black}}>مميزات الرحلة</h3>
                <p className="text-xs mt-0.5" style={{color:B.muted}}>تظهر للعميل في صفحة الباقة</p></div>
              <button onClick={addFeat} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer"
                style={{background:B.bg,border:`1px solid ${B.border}`,color:"#8a6a08"}}><Plus size={12}/>إضافة</button>
            </div>
            <AnimatePresence>{form.features.map(f=>(
              <motion.div key={f.id} initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}} className="flex gap-2 items-center">
                <FeatureIconPicker value={f.icon} onChange={k=>updFeat(f.id,"icon",k)}/>
                <input className={`${inp} flex-1`} style={{borderColor:B.border,background:"#fff",color:B.black,fontFamily:"inherit"}}
                  value={f.text} placeholder="ما الذي يشمله هذه الباقة؟" onChange={e=>updFeat(f.id,"text",e.target.value)}/>
                <button onClick={()=>delFeat(f.id)} className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer flex-shrink-0"
                  style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}><X size={12}/></button>
              </motion.div>
            ))}</AnimatePresence>
            {form.features.length===0&&<div className="flex flex-col items-center py-16 rounded-2xl" style={{border:`2px dashed ${B.border}`,color:B.muted}}><ListChecks size={28} style={{opacity:0.3,marginBottom:8}}/><p className="text-sm">لم تُضف مميزات بعد</p></div>}
            {form.features.length>0&&(
              <div className="mt-3 p-5 rounded-2xl" style={{background:"#fff",border:`1px solid ${B.border}`}}>
                <h4 className="text-xs font-bold mb-3" style={{color:B.muted}}>معاينة — كما يراها العميل</h4>
                <div className="flex flex-wrap gap-2">
                  {form.features.map(f=>{
                    const Icon=(PKG_FEATURE_ICONS[f.icon]??PKG_FEATURE_ICONS.check).icon;
                    return (
                    <span key={f.id} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full"
                      style={{background:B.bg,border:`1px solid ${B.border}`,color:B.text3}}>
                      <Icon size={13} style={{color:B.gold}}/>{f.text}
                    </span>
                    );
                  })}
                </div>
              </div>
            )}
          </motion.div>}

          {tab==="policies"&&<motion.div key="ppol" initial={{opacity:0,x:10}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-10}} style={{maxWidth:640}} className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div><h3 className="text-sm font-bold" style={{color:B.black}}>سياسات الباقة</h3>
                <p className="text-xs mt-0.5" style={{color:B.muted}}>كل سياسة في مربع مستقل — أضف واحذف ورتّب الأهمية بالأسهم</p></div>
              <button onClick={addPolicy} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer"
                style={{background:B.bg,border:`1px solid ${B.border}`,color:"#8a6a08"}}><Plus size={12}/>إضافة سياسة</button>
            </div>
            <AnimatePresence>{form.policies.map((p,i)=>(
              <motion.div key={i} initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}} className="flex gap-2 items-center">
                <span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{background:`linear-gradient(135deg,${B.gold},${B.gold2})`,color:B.black,fontSize:11,fontWeight:900}}>{i+1}</span>
                <input className="flex-1 border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none" style={{borderColor:B.border,background:"#fff",color:B.black,fontFamily:"inherit"}}
                  value={p} placeholder="مثال: إلغاء مجاني قبل 48 ساعة من موعد الرحلة" onChange={e=>updPolicy(i,e.target.value)}/>
                <div className="flex flex-col gap-0.5 flex-shrink-0">
                  <button onClick={()=>movePolicy(i,-1)} disabled={i===0} className="w-7 h-4 flex items-center justify-center rounded cursor-pointer" style={{background:B.bg,border:`1px solid ${B.border}`,color:i===0?B.border:B.text2}}><ChevronUp size={11}/></button>
                  <button onClick={()=>movePolicy(i,1)} disabled={i===form.policies.length-1} className="w-7 h-4 flex items-center justify-center rounded cursor-pointer" style={{background:B.bg,border:`1px solid ${B.border}`,color:i===form.policies.length-1?B.border:B.text2}}><ChevronDown size={11}/></button>
                </div>
                <button onClick={()=>delPolicy(i)} className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer flex-shrink-0"
                  style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}><X size={12}/></button>
              </motion.div>
            ))}</AnimatePresence>
            {form.policies.length===0&&<div className="flex flex-col items-center py-16 rounded-2xl" style={{border:`2px dashed ${B.border}`,color:B.muted}}><ListChecks size={28} style={{opacity:0.3,marginBottom:8}}/><p className="text-sm">لم تُضف سياسات بعد</p></div>}
          </motion.div>}

          {tab==="reviews"&&<motion.div key="prv" initial={{opacity:0,x:10}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-10}} style={{maxWidth:620}} className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <p className="font-bold text-sm" style={{color:B.black}}>آراء المعتمرين</p>
              <button onClick={addReview} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer"
                style={{background:B.bg,border:`1px solid ${B.border}`,color:"#8a6a08"}}><Plus size={12}/>إضافة</button>
            </div>
            <AnimatePresence>{form.reviews.map(rv=>(
              <motion.div key={rv.id} initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}
                className="rounded-2xl p-4 flex gap-3" style={{border:`1px solid ${B.border}`,background:"#fff"}}>
                <div className="flex-1 flex flex-col gap-2">
                  <div className="flex gap-2">
                    <input className="flex-1 border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none" style={{borderColor:B.border,background:"#fff",color:B.black,fontFamily:"inherit"}}
                      value={rv.name} placeholder="الاسم الأول" onChange={e=>updReview(rv.id,"name",e.target.value)}/>
                    {/* الدرجة من 10 — التقييم العام في صفحة الباقة متوسط هذه الدرجات.
                        تركها فارغة يعرض الرأي بلا احتساب في المتوسط. */}
                    <div className="flex items-center gap-1.5 px-3 rounded-xl" style={{border:`1px solid ${B.border}`,background:"#fff"}}>
                      <Star size={13} style={{color:B.gold,flexShrink:0}}/>
                      <input type="number" min={1} max={10} step={0.1} value={rv.rating ?? ""} placeholder="—"
                        onChange={e=>{const v=e.target.value;updReview(rv.id,"rating",v===""?undefined:Math.min(10,Math.max(1,Number(v))));}}
                        className="text-sm focus:outline-none" style={{width:52,border:"none",background:"transparent",color:B.black,direction:"ltr",textAlign:"center",fontFamily:"inherit"}}/>
                      <span className="text-xs" style={{color:B.muted,flexShrink:0}}>/10</span>
                    </div>
                  </div>
                  <textarea className="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none" style={{borderColor:B.border,background:"#fff",color:B.black,fontFamily:"inherit",resize:"vertical"}}
                    rows={2} value={rv.text} placeholder="ماذا قال عن الباقة؟" onChange={e=>updReview(rv.id,"text",e.target.value)}/>
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
                      <input type="file" accept="image/*" className="hidden" onChange={onPickMedia("package-reviews",url=>updReview(rv.id,"image",url))}/>
                    </label>
                  </div>
                </div>
                <button onClick={()=>delReview(rv.id)} className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer mt-0.5"
                  style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}><X size={12}/></button>
              </motion.div>
            ))}</AnimatePresence>
            {form.reviews.length===0&&<div className="flex flex-col items-center py-16 rounded-2xl" style={{border:`2px dashed ${B.border}`,color:B.muted}}><Star size={28} style={{opacity:0.3,marginBottom:8}}/><p className="text-sm">لا توجد آراء</p></div>}
          </motion.div>}

          {tab==="settings"&&<motion.div key="pset" initial={{opacity:0,x:10}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-10}} style={{maxWidth:680}} className="flex flex-col gap-4">
            <div>
              <h3 className="text-sm font-bold" style={{color:B.black}}>إعدادات الحجز الافتراضية</h3>
              <p className="text-xs mt-0.5" style={{color:B.muted}}>تُطبَّق مبدئياً على كل رحلة تُطلق من هذه الباقة، ويمكن تعديلها لكل رحلة على حدة.</p>
            </div>
            <div className="rounded-2xl p-5" style={{background:"#fff",border:`1px solid ${B.border}`}}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                {([
                  {key:"allowOnlineBooking",label:"إتاحة الحجز الإلكتروني"},
                  {key:"manualConfirm",label:"تأكيد يدوي للطلبات"},
                  {key:"waitlistEnabled",label:"تفعيل قائمة الانتظار"},
                  {key:"requirePaymentFirst",label:"يتطلب الدفع قبل التأكيد"},
                  {key:"showTicketAfterConfirm",label:"إظهار التذكرة بعد التأكيد فقط"},
                ] as {key:keyof TripSettings;label:string}[]).map(s=>{
                  const on=settings[s.key] as boolean;
                  return (
                    <button key={s.key} onClick={()=>setSetting(s.key,!on as any)}
                      className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl cursor-pointer"
                      style={{background:on?"rgba(30,122,68,0.06)":B.bg,border:`1px solid ${on?"#C4E4CE":B.border}`}}>
                      <span className="text-sm font-semibold" style={{color:B.black}}>{s.label}</span>
                      <div className="relative w-11 h-6 rounded-full transition-colors flex-shrink-0"
                        style={{background:on?"#1E7A44":"#C9C2BA"}}>
                        <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
                          style={{right:on?"0.25rem":"calc(100% - 1.5rem)"}}/>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 mt-4 pt-4" style={{borderTop:`1px solid ${B.border}`}}>
                <div>
                  <Field label="مهلة الدفع (بالساعات)">
                    <input type="number" min={0} className={inp} style={{...ist,direction:"ltr",textAlign:"right"}}
                      value={settings.paymentDeadlineHours} onChange={e=>setSetting("paymentDeadlineHours",Number(e.target.value))}/>
                  </Field>
                </div>
                <div>
                  <Field label="الحد الأقصى للمعتمرين في الطلب الواحد">
                    <input type="number" min={1} className={inp} style={{...ist,direction:"ltr",textAlign:"right"}}
                      value={settings.maxPilgrims} onChange={e=>setSetting("maxPilgrims",Number(e.target.value))}/>
                  </Field>
                </div>
              </div>
            </div>
          </motion.div>}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ─── Packages Page (list) ─── */
export function PackagesPage({transports,hotels,onMenuOpen}:{transports:Transport[];hotels:Hotel[];onMenuOpen?:()=>void}) {
  const packages=useStore(s=>s.packages); const setPackages=useStore(s=>s.setPackages);
  const [search,setSearch]=useState("");
  const [destFilter,setDestFilter]=useState<"all"|PkgDest>("all");
  const [statusFilter,setStatusFilter]=useState<"all"|PkgStatus>("all");
  const [showAdd,setShowAdd]=useState(false);
  const [detailId,setDetailId]=useState<string|null>(null);

  function move(id:string,dir:-1|1) {
    setPackages(prev=>{
      const arr=[...prev].sort((a,b)=>a.order-b.order);
      const i=arr.findIndex(p=>p.id===id);const j=i+dir;
      if(j<0||j>=arr.length)return prev;
      /* صفوف جديدة لا تعديل في مكانها: [...prev] نسخة ضحلة، فتبديل
         arr[i].order كان يغيّر صفوف prev نفسها — فيرى syncDiff القديم
         والجديد متطابقين ولا يرسل شيئاً، فيعود الترتيب عند أول تحديث. */
      const oi=arr[i].order, oj=arr[j].order;
      arr[i]={...arr[i],order:oj};
      arr[j]={...arr[j],order:oi};
      return [...arr];
    });
  }
  function handleSaveNew(p:Pkg){setPackages(prev=>[...prev,{...p,order:prev.length+1}]);setShowAdd(false);setDetailId(p.id);}
  function handleSaveDetail(p:Pkg){setPackages(prev=>prev.map(x=>x.id===p.id?p:x));setDetailId(null);}

  const detail = packages.find(p=>p.id===detailId);
  if(detail) return <PackageDetail pkg={detail} transports={transports} hotels={hotels} onSave={handleSaveDetail} onBack={()=>setDetailId(null)}/>;

  const filtered=packages
    .filter(p=>(!search||p.name.includes(search)||p.id.toLowerCase().includes(search.toLowerCase()))&&(destFilter==="all"||p.destination===destFilter)&&(statusFilter==="all"||p.status===statusFilter))
    .sort((a,b)=>a.order-b.order);

  const stats={total:packages.length,active:packages.filter(p=>p.status==="active").length,mecca:packages.filter(p=>p.destination==="مكة").length,both:packages.filter(p=>p.destination==="مكة والمدينة").length};
  const fb=(on:boolean)=>({padding:"6px 14px",borderRadius:999,fontSize:13,fontWeight:700,cursor:"pointer" as const,border:`1px solid ${on?B.gold:B.border}`,background:on?B.primary:"#fff",color:on?B.gold:B.text2,transition:"all 0.15s"});

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{background:B.bg}}>
      <PageHeader title="الباقات" crumb="إدارة الباقات" search={search} onSearch={setSearch} onMenuOpen={onMenuOpen}/>
      <div className="px-4 md:px-8 pt-4 md:pt-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="إجمالي الباقات" value={stats.total} sub="في النظام" accent/>
          <StatCard label="باقات نشطة" value={stats.active} sub={`${stats.total-stats.active} غير نشطة`}/>
          <StatCard label="باقات مكة" value={stats.mecca} sub="المكرمة فقط"/>
          <StatCard label="مكة والمدينة" value={stats.both} sub="وجهة مزدوجة"/>
        </div>
        <div className="flex items-center justify-between gap-3 mt-5 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 p-1 rounded-xl" style={{background:"#fff",border:`1px solid ${B.border}`}}>
              <button style={fb(statusFilter==="all")} onClick={()=>setStatusFilter("all")}>الكل</button>
              <button style={fb(statusFilter==="active")} onClick={()=>setStatusFilter("active")}>نشطة</button>
              <button style={fb(statusFilter==="draft")} onClick={()=>setStatusFilter("draft")}>مسودة</button>
              <button style={fb(statusFilter==="hidden")} onClick={()=>setStatusFilter("hidden")}>مخفية</button>
            </div>
            <div className="flex items-center gap-1 p-1 rounded-xl" style={{background:"#fff",border:`1px solid ${B.border}`}}>
              <button style={fb(destFilter==="all")} onClick={()=>setDestFilter("all")}>كل الوجهات</button>
              <button style={fb(destFilter==="مكة")} onClick={()=>setDestFilter("مكة")}>🕋 مكة</button>
              <button style={fb(destFilter==="مكة والمدينة")} onClick={()=>setDestFilter("مكة والمدينة")}>🕋🕌 مكة والمدينة</button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm" style={{color:B.muted}}><b style={{color:B.black}}>{filtered.length}</b> / {packages.length}</span>
            <button onClick={()=>setShowAdd(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer"
              style={{background:B.gold,color:B.black,border:"none",boxShadow:"0 4px 12px rgba(192,134,44,0.35)"}}>
              <Plus size={15}/>إضافة باقة
            </button>
          </div>
        </div>
        <div className="mt-5" style={{height:1,background:B.border}}/>
      </div>
      <main className="flex-1 px-8 pb-10 pt-4">
        {filtered.length===0
          ?<motion.div initial={{opacity:0}} animate={{opacity:1}} className="flex flex-col items-center justify-center py-24 rounded-2xl" style={{background:"#fff",border:`1px solid ${B.border}`}}>
            <Package size={44} style={{opacity:0.2,color:B.gold,marginBottom:12}}/><p className="font-bold" style={{color:B.black}}>لا توجد باقات مطابقة</p>
          </motion.div>
          :<div className="rounded-2xl overflow-hidden" style={{background:"#fff",border:`1px solid ${B.border}`}}>
            {/* Table header */}
            <div className="grid text-xs font-bold" style={{gridTemplateColumns:"60px 1fr 120px 100px 80px 110px 200px",background:B.bg,color:B.muted,borderBottom:`1px solid ${B.border}`}}>
              {["الترتيب","اسم الباقة","الوجهة","النوع","المدة","الحالة","إجراءات"].map((h,i)=>(
                <div key={i} className="px-4 py-3">{h}</div>
              ))}
            </div>
            <AnimatePresence>
              {filtered.map((p,idx)=>(
                <motion.div key={p.id} layout initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0,height:0}}
                  className="grid items-center group"
                  onClick={()=>setDetailId(p.id)} title="فتح تفاصيل الباقة"
                  style={{gridTemplateColumns:"60px 1fr 120px 100px 80px 110px 200px",borderTop:`1px solid ${B.border}`,background:"#fff",transition:"background 0.12s",cursor:"pointer"}}
                  onMouseEnter={e=>(e.currentTarget.style.background=B.bg)} onMouseLeave={e=>(e.currentTarget.style.background="#fff")}>
                  {/* Order */}
                  <div className="px-3 py-3 flex items-center gap-1" onClick={e=>e.stopPropagation()} style={{cursor:"default"}}>
                    <span className="text-xs font-bold w-5 text-center" style={{color:B.muted}}>{p.order}</span>
                    <div className="flex flex-col gap-0.5">
                      <button onClick={()=>move(p.id,-1)} disabled={idx===0} className="w-5 h-4 flex items-center justify-center rounded cursor-pointer"
                        style={{background:"#fff",border:`1px solid ${B.border}`,color:B.muted,opacity:idx===0?0.3:1}}><ChevronUp size={9}/></button>
                      <button onClick={()=>move(p.id,1)} disabled={idx===filtered.length-1} className="w-5 h-4 flex items-center justify-center rounded cursor-pointer"
                        style={{background:"#fff",border:`1px solid ${B.border}`,color:B.muted,opacity:idx===filtered.length-1?0.3:1}}><ChevronDown size={9}/></button>
                    </div>
                  </div>
                  {/* Name */}
                  <div className="px-4 py-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0"
                      style={{background:B.bg,border:`1px solid ${B.border}`}}>
                      {p.coverImage?<img src={p.coverImage} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<span style={{fontSize:16}}>🕋</span>}</div>
                    <div className="min-w-0">
                      <div className="font-extrabold text-sm" style={{color:B.black}}>{p.name}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs font-mono" style={{color:B.muted}}>{p.id}</span>
                        {p.recurDay&&<span className="flex items-center gap-0.5 text-xs" style={{color:B.muted}}><Repeat size={9}/> {p.recurDay}</span>}
                      </div>
                    </div>
                  </div>
                  {/* Destination */}
                  <div className="px-3 py-3">{destBadge(p.destination)}</div>
                  {/* Type */}
                  <div className="px-3 py-3">{typeBadge(p.productType)}</div>
                  {/* Duration */}
                  <div className="px-3 py-3 text-sm font-bold" style={{color:B.text2}}>{p.days} أيام</div>
                  {/* Status */}
                  <div className="px-3 py-3"><StatusBadge status={p.status}/></div>
                  {/* Actions */}
                  <div className="px-4 py-3 flex gap-2" onClick={e=>e.stopPropagation()} style={{cursor:"default"}}>
                    <button onClick={()=>setDetailId(p.id)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer"
                      style={{background:B.primary,color:B.cream,border:"none"}}>تفاصيل <ArrowRight size={11}/></button>
                    <button onClick={()=>{const dup={...p,id:newId("PKG"),name:p.name+" (نسخة)",order:packages.length+1};setPackages(prev=>[...prev,dup]);}}
                      className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold cursor-pointer"
                      style={{background:"#fff",border:`1px solid ${B.border}`,color:B.text2}}><Copy size={11}/></button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        }
      </main>
      <AnimatePresence>
        {showAdd&&<AddPkgModal onSave={handleSaveNew} onClose={()=>setShowAdd(false)}/>}
      </AnimatePresence>
    </div>
  );
}
