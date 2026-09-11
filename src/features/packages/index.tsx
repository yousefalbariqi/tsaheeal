import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Building2, MapPin, Star, Plus, Trash2, X, Check, Package, Search, ChevronRight, ImagePlus, ChevronUp, ChevronDown, Copy, ArrowRight, Repeat, CalendarDays, ListChecks, Archive, ArchiveRestore, ChevronLeft, Eye, AlertTriangle, Loader2, Info, BookOpen, BedDouble, Bus as BusIcon, Wallet } from "lucide-react";
import { B } from "@/lib/theme";
import { SAR, sar, sarNumber } from "@/lib/money";
import { cleanHotelName, hotelDisplayName } from "@/lib/hotelName";
import { linkableHotels, isPublished } from "@/features/hotels/readiness";
import { useDebounced } from "@/lib/useDebounced";
import { EntityGate } from "@/components/States";
import { linkableTransports } from "@/features/transport/readiness";
import { TabStrip } from "@/components/Tabs";
import type { Hotel, Transport, PkgStatus, PkgDest, ProgramStage, RoomPrice, PkgReview, PkgFeature, Pkg, TripSettings } from "@/types";
import { uid, newId} from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";
import { StatCard } from "@/components/StatCard";
import { PageHeader } from "@/components/PageHeader";
import { AppSelect } from "@/components/AppSelect";
import { useStore, clearSyncError, flushSync, writeLocalOnly } from "@/store/useStore";
import { toast } from "sonner";
import { Field } from "@/components/Field";
import { NumericInput } from "@/components/NumericInput";
import { onPickMedia } from "@/lib/mediaUpload";
import { useEditor } from "@/lib/useEditor";
import { useInternalSettings } from "@/data/useSettings";
import { readiness, isSellableTier, type PkgTab, type Readiness } from "./readiness";
import { packageDeleteImpact, packageDeleteBlockers, countAr, tripsCount, bookingsCount, tripsDetail, bookingsDetail, type PackageDeleteImpact } from "./deletion";
import { setArchiveReason, permanentlyDelete } from "@/data/repository";
import { useRole } from "@/lib/useRole";
import { DeleteDialog } from "@/components/DeleteDialog";
import { PermanentDeleteDialog } from "@/components/EntityActions";
import {
  PROGRAM_STAGE_CATALOG, DEFAULT_STAGE_ICON, stageIconLabel,
  PKG_FEATURE_CATALOG, DEFAULT_PKG_FEATURE_ICON, pkgFeatureIcon, pkgFeatureKey,
} from "./featureIcons";

/* بنكا الأيقونات — مراحل البرنامج والمميزات — في وحدةٍ مجاورة (featureIcons). */

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
/* عرض منطقة المحتوى — رقمٌ واحد يحكم الرأس والتبويبات وكل لوح.
   قبله كان لكل لوحٍ سقفه (٦٠٠ و٦٤٠ و٨٠٠ و٩٠٠)، فتتراقص حافة المحتوى
   كلما انتقل الموظف بين التبويبات، ويبقى نصف الشاشة فارغاً بلا سبب. */
const PANEL_MAX = 1180;
const panelBox: React.CSSProperties = { maxWidth: PANEL_MAX, marginInline: "auto", width: "100%" };
/* الألواح ذات العمود الواحد لا تُمطّ إلى ١١٨٠ — سطرٌ بهذا الطول يتعب
   العين. تُحدّ ثم تتوسّط: `marginInline:auto` هو ما كان ناقصاً، إذ كان
   السقف وحده يلصقها بحافة البداية (يمين الشاشة) وتُترك الشاشة فارغة. */
const formBox: React.CSSProperties = { maxWidth: 880, marginInline: "auto", width: "100%" };

/* مسودة المتصفح مكملة للحفظ الخادمي وليست بديلاً عنه: تُكتب فور كل
   تعديل كي لا تضيع دقيقة الانتظار أو انقطاع الشبكة قبل وصول الحفظ. */
const PACKAGE_DRAFT_VERSION = 1;
const packageDraftKey = (id:string) => `tasaheel_package_draft:${id}`;
function readPackageDraft(pkg:Pkg): Pkg | null {
  try {
    const raw = localStorage.getItem(packageDraftKey(pkg.id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v?:number; form?:Pkg };
    return parsed.v === PACKAGE_DRAFT_VERSION && parsed.form?.id === pkg.id ? parsed.form : null;
  } catch { return null; }
}
function writePackageDraft(pkg:Pkg) {
  try { localStorage.setItem(packageDraftKey(pkg.id), JSON.stringify({v:PACKAGE_DRAFT_VERSION,form:pkg,savedAt:Date.now()})); } catch { /* مساحة المتصفح قد تكون ممتلئة */ }
}
function clearPackageDraft(id:string) {
  try { localStorage.removeItem(packageDraftKey(id)); } catch { /* التخزين محظور */ }
}

function csvCells(line:string, delimiter:string) {
  const cells:string[]=[]; let cell=""; let quoted=false;
  for(let i=0;i<line.length;i++) {
    const char=line[i];
    if(char==='"') { if(quoted&&line[i+1]==='"') { cell+='"'; i++; } else quoted=!quoted; }
    else if(char===delimiter&&!quoted) { cells.push(cell.trim()); cell=""; }
    else cell+=char;
  }
  cells.push(cell.trim()); return cells;
}
function importPackageReviewsCsv(source:string): Omit<PkgReview,"id">[] {
  const lines=source.replace(/^\uFEFF/,"").split(/\r?\n/).filter(line=>line.trim());
  if(lines.length<2) throw new Error("الملف يحتاج صف العناوين ورأياً واحداً على الأقل.");
  const delimiter=(lines[0].match(/;/g)?.length??0)>(lines[0].match(/,/g)?.length??0)?";":",";
  const header=csvCells(lines[0],delimiter).map(x=>x.replace(/\s/g,"").toLowerCase());
  const find=(names:string[])=>header.findIndex(x=>names.includes(x));
  const nameAt=find(["الاسم","اسم","name"]), ratingAt=find(["التقييم","rating"]), textAt=find(["الرأي","راي","review","text"]);
  if(nameAt<0||ratingAt<0||textAt<0) throw new Error("العناوين المطلوبة هي: الاسم، التقييم، الرأي.");
  return lines.slice(1).map((line,index)=>{
    const cells=csvCells(line,delimiter);
    const name=cells[nameAt]?.trim(), text=cells[textAt]?.trim(), rating=Number(cells[ratingAt]);
    if(!name||!text||!Number.isFinite(rating)||rating<1||rating>5) throw new Error(`تحقق من الصف ${index+2}: الاسم والتقييم من 1 إلى 5 والرأي مطلوبة.`);
    return {name,text,rating,consent:true};
  });
}

export function destBadge(d:string) {
  return d==="مكة والمدينة"
    ? <span title={d} className="inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap max-w-full" style={{background:"#E3F3E8",color:"#1E7A44"}}>🕋🕌 مكة + المدينة</span>
    : <span title={d} className="inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap max-w-full" style={{background:"#E0F2FB",color:"#0E7CA8"}}>🕋 {d}</span>;
}
export function typeBadge(t:string) {
  const isVip = t.includes("VIP");
  return <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{background:isVip?"rgba(192,134,44,0.12)":"#EEECEA",color:isVip?B.black:B.text2,border:isVip?"1px solid rgba(192,134,44,0.3)":"none"}}>{t}</span>;
}

/* ─── Add Package Modal ─── */
/* الحفظ الأول مسودة دائماً — لا خيار حالة في هذا النموذج.

   قبله كان يعرض الحالات الأربع، فباقة تُنشر للمستفيدين بلا صورة ولا
   فندق ولا برنامج ولا سعر بضغطة واحدة. وهي حرفياً الحالات التي رصدها
   الفريق: «يبدأ من 0 ر.س»، ونشطة بلا فندق، ونشطة بلا مراحل. النشر صار
   قراراً يُتّخذ في صفحة التفاصيل بعد استيفاء الشروط، لا افتراضاً يُنسى. */
function AddPkgModal({onSave,onClose}:{onSave:(p:Pkg)=>Promise<boolean>;onClose:()=>void}) {
  const sys=useInternalSettings();
  const [saving,setSaving]=useState(false);
  const [autoAttempted,setAutoAttempted]=useState(false);
  const [form,setForm]=useState<Omit<Pkg,"id"|"order"|"program"|"roomPrices"|"reviews"|"notes"|"status">>({
    name:"",productType:"حافلة",destination:"مكة",audience:"عموم المعتمرين",
    days:3,nights:2,marketPrice:0,
    recurring:true,recurDay:"الخميس",startDate:"",
    transportId:"",hotelId:"",features:[],policies:[],
  });
  const set=<K extends keyof typeof form>(k:K,v:(typeof form)[K])=>setForm(f=>({...f,[k]:v}));
  const inp="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none";
  const ist={borderColor:B.border,background:"#fff",color:B.black,fontFamily:"inherit"};
  const nameOk=!!form.name.trim();
  async function handleSave(){
    if(!nameOk||saving) return;
    setSaving(true);
    /* إعدادات الحجز تُنسخ من إعدادات النظام لحظة الإنشاء ولا تُقرأ منها
       بعدها: الباقة تحمل نسختها، والرحلة تنسخ نسخة الباقة عند إطلاقها.
       ثلاث نسخ مستقلّة عن قصد — تغيير الإعداد العام لا يُحرّك مهلة دفعِ
       رحلةٍ انطلقت وأُرسل رابط دفعها للعميل. */
    const ok=await onSave({...form,id:newId("PKG"),order:999,status:"draft",
      program:[],roomPrices:[],reviews:[],notes:"",policies:[],
      settings:{allowOnlineBooking:true,manualConfirm:true,waitlistEnabled:false,
        requirePaymentFirst:true,showTicketAfterConfirm:true,
        paymentDeadlineHours:sys.paymentDeadlineHours,maxPilgrims:sys.maxPilgrimsPerBooking}});
    if(!ok) setSaving(false);
  }
  /* أول اسم صالح ينشئ المسودة تلقائياً بعد وقفة قصيرة. إن واصل الموظف
     تعديل الوجهة أو المدة خلال الوقفة تُعاد المهلة، فيُحفظ آخر ما كتبه
     ثم تنتقل النافذة إلى محرر الباقة الذي يكمل الحفظ التلقائي. */
  useEffect(()=>{
    if(!nameOk||saving||autoAttempted) return;
    const timer=window.setTimeout(()=>{ setAutoAttempted(true); void handleSave(); },900);
    return ()=>window.clearTimeout(timer);
  },[form,nameOk,saving,autoAttempted]);
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{background:"rgba(14,12,11,0.78)",backdropFilter:"blur(4px)"}} onClick={onClose}>
      <motion.div initial={{opacity:0,y:30}} animate={{opacity:1,y:0}} exit={{opacity:0,y:30}}
        transition={{type:"spring",damping:30,stiffness:400}}
        className="w-full rounded-2xl overflow-hidden flex flex-col"
        style={{maxWidth:520,maxHeight:"90vh",background:"#fff"}} onClick={e=>e.stopPropagation()}>
        <div className="relative px-6 pt-5 pb-4 flex-shrink-0" style={{background:B.primaryDeep}}>
          <div className="absolute top-0 inset-x-0 h-1" style={{background:`linear-gradient(90deg,${B.gold},${B.gold2},${B.gold})`}}/>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{background:"rgba(192,134,44,0.15)",border:"1px solid rgba(192,134,44,0.3)"}}>
                <Package size={16} style={{color:B.gold}}/>
              </div>
              <h2 className="font-extrabold text-white" style={{fontSize:16,fontFamily:"var(--font-app)"}}>إضافة باقة جديدة</h2>
            </div>
            <button aria-label="إغلاق النافذة" title="إغلاق النافذة" onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer"
              style={{background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.1)",color:"#7a7068"}}><X size={14}/></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4" style={{scrollbarWidth:"none"}}>
          <div className="rounded-xl px-4 py-3 flex items-start gap-2.5" style={{background:"#FBF3D6",border:"1px solid #EBD9A0"}}>
            <ListChecks size={16} style={{color:"#8A6A08",flexShrink:0,marginTop:1}}/>
            <p className="text-xs leading-relaxed" style={{color:"#8A6A08"}}>تُحفظ الباقة <b>مسودة</b> ولا تظهر للعملاء. بعد الحفظ تُفتح صفحة الإكمال (الصور، البرنامج، الغرف والأسعار، المميزات، السياسات) — ويصبح النشر متاحاً حين تكتمل الشروط.</p>
          </div>
          <div><Field label={<>اسم الباقة <span style={{color:B.gold}}>*</span></>}>
                 <input className={inp} style={ist} value={form.name} placeholder="مثال: عمرة مكة 3 أيام"
                   onChange={e=>set("name",e.target.value)} onKeyDown={e=>{if(e.key==="Enter") void handleSave();}}/>
               </Field></div>
          <div><Field label="الوجهة">
                 <AppSelect value={form.destination} onChange={v=>set("destination",v as PkgDest)} options={DEST_OPTS.map(o=>({value:o,label:o}))}/>
               </Field>
            <p className="text-xs mt-1.5" style={{color:B.muted}}>نوع المنتج يُحدَّد تلقائياً من المواصلة المرتبطة في تفاصيل الباقة.</p></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Field label="الأيام">
                   <NumericInput min={1} className={inp} style={ist} value={form.days} onValueChange={v=>set("days",Number(v))}/>
                 </Field></div>
            <div><Field label="الليالي">
                   <NumericInput min={0} className={inp} style={ist} value={form.nights} onValueChange={v=>set("nights",Number(v))}/>
                 </Field></div>
          </div>
          {/* الليالي تحدّد وجود السكن — لا علمَ منفصلاً يتعارض معها */}
          <div className="rounded-xl px-4 py-2.5 flex items-start gap-2" style={{background:B.fill,border:`1px solid ${B.border}`}}>
            <Info size={13} style={{color:B.gold,flexShrink:0,marginTop:2}}/>
            <p className="text-xs leading-relaxed" style={{color:B.text2}}>
              {form.nights>0
                ? <>الباقة تشمل سكناً ({form.nights} ليالٍ) — سيُطلب ربط فندق وخيار غرفة واحد على الأقل قبل النشر.</>
                : <>صفر ليالٍ = <b>مواصلات فقط</b> بلا سكن — لن يُطلب فندق ولا غرف.</>}
            </p>
          </div>
          <div className="rounded-xl p-4" style={{background:B.fill,border:`1px solid ${B.border}`}}>
            <Field label="أيام التشغيل المقترحة">
              <AppSelect value={form.recurDay} onChange={v=>set("recurDay",v)} options={RECUR_DAYS.map(d=>({value:d,label:d}))}/>
            </Field>
            <p className="text-xs mt-2 flex items-center gap-1.5" style={{color:B.muted}}><CalendarDays size={12} style={{color:B.gold}}/>اقتراح فقط — تُحدَّد تواريخ الانطلاق الفعلية عند إطلاق الرحلات.</p>
          </div>
        </div>
        <div className="flex gap-3 px-6 py-4 flex-shrink-0 items-center" style={{borderTop:`1px solid ${B.border}`}}>
          <button onClick={()=>void handleSave()} disabled={!nameOk||saving}
            className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold"
            style={{background:B.gold,color:B.black,border:"none",opacity:!nameOk||saving?0.5:1,cursor:!nameOk||saving?"not-allowed":"pointer"}}>
            {saving?<Loader2 size={14} className="animate-spin"/>:<Check size={14}/>}{saving?"جارٍ الحفظ…":"حفظ الآن"}
          </button>
          <button onClick={onClose} className="px-5 py-3 rounded-xl text-sm font-bold cursor-pointer"
            style={{background:B.fill,color:B.text2,border:"none"}}>إلغاء</button>
          {!nameOk&&<span className="text-xs" style={{color:B.muted}}>اسم الباقة مطلوب</span>}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─── Searchable feature-icon picker (with logos) ─── */
/* منتقي أيقونة الميزة — شبكةٌ صغيرة بلا بحث.

   أحد عشر خياراً لا تُبحث، تُرى. وصندوق البحث في قائمةٍ بهذا الحجم
   ضغطةٌ وحقلُ كتابةٍ ثمناً لما كان ظاهراً أصلاً. و«بدون أيقونة» خيارٌ
   أول لا استثناء: أكثر المميزات نصٌّ يكفي نفسه. */
function FeatureIconPicker({value,onChange}:{value:string;onChange:(k:string)=>void}) {
  const [open,setOpen]=useState(false);
  const current=pkgFeatureKey(value);
  const CurIcon=pkgFeatureIcon(value);
  return (
    <div className="relative flex-shrink-0">
      <button type="button" onClick={()=>setOpen(o=>!o)} title="اختر أيقونة الميزة" aria-label="اختر أيقونة الميزة"
        className="h-10 w-11 rounded-xl flex items-center justify-center gap-1 cursor-pointer"
        style={{background:CurIcon?B.fill:"#fff",color:CurIcon?B.text3:B.muted,border:`1px solid ${B.border}`}}>
        {CurIcon?<CurIcon size={16}/>:<span className="text-xs font-bold">—</span>}
        <ChevronDown size={11} style={{opacity:0.55}}/>
      </button>
      {open&&(
        <>
          <div className="fixed inset-0" style={{zIndex:40}} onClick={()=>setOpen(false)}/>
          <div className="absolute mt-1 rounded-xl p-2"
            style={{zIndex:41,top:"100%",insetInlineStart:0,width:196,background:"#fff",border:`1px solid ${B.border}`,boxShadow:"0 12px 30px rgba(0,0,0,0.15)"}}>
            <div className="grid grid-cols-4 gap-1">
              {PKG_FEATURE_CATALOG.map(({id,label,Icon})=>{
                const active=id===current;
                return (
                  <button key={id} type="button" title={label} aria-label={label}
                    onClick={()=>{onChange(id);setOpen(false);}}
                    className="h-10 rounded-lg flex items-center justify-center cursor-pointer"
                    style={{background:active?B.gold:B.fill,color:active?B.black:B.text2,border:`1px solid ${active?B.gold:B.border}`}}>
                    {Icon?<Icon size={15}/>:<span className="text-xs font-bold">بلا</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* منتقي أيقونة المرحلة — بنكٌ واسع مصنّف، لا قائمةٌ من اثني عشر.

   القائمة المنسدلة القديمة كانت تحصر المرحلة في رموزٍ معدودة، فيُكتب
   «الإفطار في الفندق» برمز الحافلة لعدم وجود غيره. وهنا بحثٌ بالاسم
   العربي: من يريد رمز الطيران يكتب «طيران» ولا يفتّش شبكةً من أربعين. */
function StageIconPicker({value,onChange}:{value:string;onChange:(icon:string)=>void}) {
  const [open,setOpen]=useState(false);
  const [q,setQ]=useState("");
  const term=q.trim();
  const groups=PROGRAM_STAGE_CATALOG
    .map(g=>({...g,items:term?g.items.filter(i=>i.label.includes(term)):g.items}))
    .filter(g=>g.items.length>0);
  const close=()=>{setOpen(false);setQ("");};
  return (
    <div className="relative">
      <button type="button" onClick={()=>setOpen(o=>!o)}
        title={stageIconLabel(value)||"اختر أيقونة المرحلة"} aria-label="اختر أيقونة المرحلة"
        className="w-full rounded-xl px-3 py-2 flex items-center gap-2 cursor-pointer"
        style={{background:"#fff",border:`1px solid ${B.border}`}}>
        <span style={{fontSize:18,lineHeight:1}}>{value||DEFAULT_STAGE_ICON}</span>
        <span className="text-xs flex-1 text-right truncate" style={{color:B.muted}}>{stageIconLabel(value)}</span>
        <ChevronDown size={12} style={{color:B.muted}}/>
      </button>
      {open&&(
        <>
          <div className="fixed inset-0" style={{zIndex:40}} onClick={close}/>
          <div className="absolute mt-1 rounded-xl overflow-hidden flex flex-col"
            style={{zIndex:41,top:"100%",insetInlineStart:0,width:268,maxWidth:"calc(100vw - 32px)",background:"#fff",border:`1px solid ${B.border}`,boxShadow:"0 12px 30px rgba(0,0,0,0.15)"}}>
            <div className="p-2" style={{borderBottom:`1px solid ${B.border}`}}>
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg" style={{background:B.fill,border:`1px solid ${B.border}`}}>
                <Search size={13} style={{color:B.muted}}/>
                <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="ابحث: فندق، وجبة، رجوع…"
                  className="flex-1 text-xs focus:outline-none" style={{background:"none",border:"none",color:B.black,fontFamily:"inherit"}}/>
              </div>
            </div>
            <div className="overflow-y-auto p-2 flex flex-col gap-2" style={{maxHeight:280,scrollbarWidth:"thin"}}>
              {groups.map(g=>(
                <div key={g.group}>
                  <div className="text-xs font-bold mb-1 px-0.5" style={{color:B.muted}}>{g.group}</div>
                  <div className="grid grid-cols-6 gap-1">
                    {g.items.map(item=>{
                      const active=item.icon===value;
                      return (
                        <button key={item.icon} type="button" title={item.label} aria-label={item.label}
                          onClick={()=>{onChange(item.icon);close();}}
                          className="h-9 rounded-lg flex items-center justify-center cursor-pointer"
                          style={{background:active?B.gold:B.fill,border:`1px solid ${active?B.gold:B.border}`,fontSize:17,lineHeight:1}}>
                          {item.icon}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {groups.length===0&&<div className="px-3 py-5 text-center text-xs" style={{color:B.muted}}>لا رمز يطابق «{term}»</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── شريط اكتمال الباقة ─── */
/* يجمع في مكان واحد ما كان مفرّقاً: النسبة، وما ينقص، ولماذا لا يُسمح
   بالنشر. كل نقصٍ زرٌّ يقفز إلى تبويبه — قائمة نواقص لا تقول «أين»
   تترك الموظف يفتّش التبويبات السبعة واحداً واحداً. */
function ReadinessBar({r,status,onGo}:{r:Readiness;status:PkgStatus;onGo:(t:PkgTab)=>void}) {
  const [open,setOpen]=useState(false);
  /* باقةٌ مكتملة ومنشورة لا شيء يُقال لها: الرأس ملتصق أعلى الصفحة،
     وكل سطر فيه يقتطع من مساحة العمل. الشريط يظهر حين ينقص شيء أو حين
     تكون الباقة غير منشورة — وهناك «مكتملة، جاهزة للنشر» معلومةٌ تُفيد. */
  if(r.percent===100&&status==="active") return null;
  const missing=[...r.blockers,...r.warnings];
  const full=r.percent===100;
  /* باقة منشورة تنقصها شروط: خطر قائم يراه العميل الآن، لا تذكير.
     لا تُنزَع حالتها تلقائياً — ذلك قرار الموظف — لكنها تُصرَخ به. */
  const live=status==="active"&&r.blockers.length>0;
  const tone=live?{bg:"#FBE6E6",bd:"#F3C9C9",fg:"#BE2626"}
    :full?{bg:"#E3F3E8",bd:"#C4E4CE",fg:"#1E7A44"}
    :{bg:"#FBF3D6",bd:"#EBD9A0",fg:"#8A6A08"};
  return (
    <div className="mt-3 rounded-xl overflow-hidden" style={{background:tone.bg,border:`1px solid ${tone.bd}`}}>
      <div className="flex items-center gap-3 px-4 py-2.5 flex-wrap">
        {live?<AlertTriangle size={15} style={{color:tone.fg,flexShrink:0}}/>:<ListChecks size={15} style={{color:tone.fg,flexShrink:0}}/>}
        <span className="text-xs font-extrabold" style={{color:tone.fg}}>اكتمال الباقة {r.percent}%</span>
        <div className="rounded-full overflow-hidden flex-shrink-0" style={{width:120,height:6,background:"rgba(0,0,0,0.08)"}}>
          <div style={{width:`${r.percent}%`,height:"100%",background:tone.fg,transition:"width .25s"}}/>
        </div>
        <span className="text-xs" style={{color:tone.fg}}>
          {live?<b>منشورة وينقصها {r.blockers.length} شرطاً إلزامياً — يراها العملاء الآن.</b>
           :full?"مكتملة — جاهزة للنشر."
           :r.blockers.length>0?<>ينقصها <b>{r.blockers.length}</b> شرطاً إلزامياً للنشر{r.warnings.length>0&&<> و{r.warnings.length} تحسيناً</>}.</>
           :<>جاهزة للنشر · {r.warnings.length} تحسيناً اختيارياً.</>}
        </span>
        {missing.length>0&&(
          <button onClick={()=>setOpen(o=>!o)} className="mr-auto flex items-center gap-1 text-xs font-bold cursor-pointer px-2.5 py-1 rounded-lg"
            style={{background:"rgba(255,255,255,0.7)",border:`1px solid ${tone.bd}`,color:tone.fg}}>
            {open?"إخفاء النواقص":"عرض النواقص"}{open?<ChevronUp size={12}/>:<ChevronDown size={12}/>}
          </button>
        )}
      </div>
      {open&&missing.length>0&&(
        <div className="px-4 pb-3 flex flex-wrap gap-2" style={{borderTop:`1px solid ${tone.bd}`,paddingTop:10}}>
          {missing.map(c=>(
            <button key={c.key} onClick={()=>{onGo(c.tab);setOpen(false);}}
              title={`اذهب إلى تبويب الإصلاح`}
              className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg cursor-pointer"
              style={{background:"#fff",border:`1px solid ${c.blocking?"#F3C9C9":B.border}`,color:c.blocking?"#BE2626":B.text2}}>
              <span className="w-1.5 h-1.5 rounded-full" style={{background:c.blocking?"#BE2626":"#8A6A08"}}/>
              {c.label}{!c.blocking&&<span style={{color:B.muted,fontWeight:400}}>· اختياري</span>}
              <ChevronLeft size={11} style={{opacity:0.5}}/>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── تأكيد المغادرة بتعديل غير محفوظ ─── */
function LeaveGuard({onSaveAndLeave,onDiscard,onCancel,saving}:{onSaveAndLeave:()=>void;onDiscard:()=>void;onCancel:()=>void;saving:boolean}) {
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-[55] flex items-center justify-center p-4"
      style={{background:"rgba(14,12,11,0.78)",backdropFilter:"blur(4px)"}} onClick={onCancel}>
      <motion.div initial={{scale:0.94,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.94,opacity:0}}
        className="rounded-2xl p-7 w-full" style={{maxWidth:400,background:"#fff"}} onClick={e=>e.stopPropagation()}>
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{background:"#FBF3D6"}}>
          <AlertTriangle size={20} style={{color:"#8A6A08"}}/>
        </div>
        <h3 className="text-base font-bold mb-1" style={{color:B.black}}>لديك تعديلات لم تُحفظ</h3>
        <p className="text-sm leading-relaxed mb-5" style={{color:B.text2}}>الخروج الآن يُلغي ما غيّرته في هذه الصفحة ولا يمكن استرجاعه.</p>
        <div className="flex flex-col gap-2">
          <button onClick={onSaveAndLeave} disabled={saving} className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
            style={{background:B.gold,color:B.black,border:"none",opacity:saving?0.6:1,cursor:saving?"not-allowed":"pointer"}}>
            {saving?<Loader2 size={14} className="animate-spin"/>:<Check size={14}/>}{saving?"جارٍ الحفظ…":"احفظ ثم اخرج"}
          </button>
          <div className="flex gap-2">
            <button onClick={onDiscard} className="flex-1 py-3 rounded-xl text-sm font-bold cursor-pointer"
              style={{background:"#FBE6E6",color:"#BE2626",border:"none"}}>اخرج بلا حفظ</button>
            <button onClick={onCancel} className="flex-1 py-3 rounded-xl text-sm font-bold cursor-pointer"
              style={{background:B.fill,color:B.text2,border:"none"}}>ابقَ هنا</button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ═══════════ منطقة الخطر — أرشفة الباقة أو محوها ═══════════

   موضعها آخر تبويب «الإعدادات» لا صفّ إجراءاتٍ في الجدول: الحذف من
   قائمةٍ فيها عشرون صفّاً ضغطةٌ في مكان ضغطةٍ أخرى، ومن داخل الباقة
   بعد سبعة تبويبات قرارٌ يعرف صاحبُه ما يحذف.

   ولا يُسأل «هل أنت متأكد؟» على فراغ: الأرقام قبل الأزرار — كم رحلةً
   تُنسب إليها، وكم حجزاً، وكم مالاً محصَّلاً عليها، وما الذي يُمحى معها.
   «سيؤثر على البيانات المرتبطة» جملةٌ لا تُعين على قرار. */
function ImpactRow({ icon: Icon, title, value, detail, note, tone, divided }: {
  icon: React.FC<{ size?: number; style?: React.CSSProperties }>;
  title: string; value: string; detail?: string; note?: string;
  tone: "clear" | "warn" | "neutral";
  /** فاصلٌ علويّ — لكل صفٍّ بعد الأول. */
  divided?: boolean;
}) {
  const c = tone === "warn" ? { bg: "#FBE6E6", fg: "#BE2626", br: "#F3C9C9" }
    : tone === "clear" ? { bg: "#E3F3E8", fg: "#1E7A44", br: "#C4E4CE" }
    : { bg: B.fill, fg: B.text3, br: B.border };
  return (
    <div className="flex items-start gap-3 py-3" style={{ borderTop: divided ? `1px solid ${B.border}` : "none" }}>
      <span className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: c.bg, border: `1px solid ${c.br}`, color: c.fg }}>
        <Icon size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-bold" style={{ color: B.black }}>{title}</span>
          <span className="text-sm font-extrabold" style={{ color: c.fg }}>{value}</span>
          {detail && <span className="text-xs" style={{ color: B.muted }}>{detail}</span>}
        </div>
        {note && <p className="text-xs mt-0.5 leading-relaxed" style={{ color: B.text3 }}>{note}</p>}
      </div>
    </div>
  );
}

function PackageDangerZone({ pkg, canWrite, isAdmin, onArchive, onPermanentDelete }: {
  /* النموذج الحيّ لا الصفّ المحفوظ: عدّ ما يُمحى يجب أن يطابق ما يراه
     الموظف في التبويبات الآن، بما فيه ما أضافه ولم يُحفظ بعد. */
  pkg: Pkg;
  canWrite: boolean;
  isAdmin: boolean;
  onArchive: (reason: string) => void;
  onPermanentDelete: (reason: string) => Promise<void>;
}) {
  const trips = useStore(s => s.trips);
  const bookings = useStore(s => s.bookings);
  const [dialog, setDialog] = useState<null | "archive" | "delete">(null);
  const [busy, setBusy] = useState(false);

  const impact: PackageDeleteImpact = useMemo(() => packageDeleteImpact(pkg, trips, bookings), [pkg, trips, bookings]);
  const blockers = useMemo(() => packageDeleteBlockers(impact), [impact]);

  /* بلا صلاحية كتابة لا يُعرض القسم أصلاً — لا زرٌّ معطَّل يَعِد بعملٍ
     ترفضه القاعدة. وكتابة الباقات محروسة بالمدير في الحالين. */
  if (!canWrite) return null;

  const { trips: t, bookings: b, owned } = impact;
  const ownedParts = [
    owned.stages && `${countAr(owned.stages, "مرحلة", "مرحلتان", "مراحل", "مرحلة")} برنامج`,
    owned.rooms && countAr(owned.rooms, "خيار غرفة", "خيارا غرف", "خيارات غرف", "خيار غرفة"),
    owned.features && countAr(owned.features, "ميزة", "ميزتان", "مميزات", "ميزة"),
    owned.policies && countAr(owned.policies, "سياسة", "سياستان", "سياسات", "سياسة"),
    owned.reviews && countAr(owned.reviews, "رأي", "رأيان", "آراء", "رأياً"),
    owned.images && countAr(owned.images, "صورة", "صورتان", "صور", "صورة"),
  ].filter(Boolean) as string[];

  const runDelete = async (reason: string) => {
    setBusy(true);
    try {
      await onPermanentDelete(reason);
      setDialog(null);
      toast.success("حُذفت الباقة نهائياً");
    } catch (e) {
      toast.error("تعذّر حذف الباقة", { description: (e as Error)?.message ?? String(e), duration: 9000 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div>
        <h3 className="text-sm font-bold" style={{ color: "#BE2626" }}>حذف الباقة</h3>
        <p className="text-xs mt-0.5" style={{ color: B.muted }}>
          الأرشفة تُخفي الباقة من العمل اليومي وتُبقي رحلاتها وحجوزاتها منسوبةً إليها. الحذف النهائي يمحوها من قاعدة البيانات.
        </p>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: "1px solid #F3C9C9" }}>
        {/* لوحة الفحص — ما يرتبط بالباقة الآن، قبل أي زرّ. */}
        <div className="px-5 py-2" style={{ background: "#FDF6F6" }}>
          <span className="text-xs font-extrabold" style={{ color: "#BE2626" }}>ما يرتبط بهذه الباقة في السجل الحالي</span>
        </div>
        <div className="px-5">
          <ImpactRow icon={CalendarDays} tone={t.total ? "warn" : "clear"} title="الرحلات"
            value={t.total ? tripsCount(t.total) : "لا توجد"}
            detail={tripsDetail(t) || undefined}
            note={t.total ? "لا تُحذف مع الباقة — تبقى في القاعدة وتفقد نسبها إليها، فتظهر في شاشة الرحلات بلا اسم باقة." : undefined} />

          <ImpactRow icon={BookOpen} divided tone={b.total ? "warn" : "clear"} title="الحجوزات"
            value={b.total ? bookingsCount(b.total) : "لا توجد"}
            detail={bookingsDetail(b) || undefined}
            note={b.total
              ? `تحتفظ بمعرّف الباقة نصّاً، فيرى المستفيد حجزه بلا اسم باقة ولا برنامج.${b.paidCount ? ` والمحصَّل المتحقَّق منه عليها ${sar(b.paidTotal)}.` : ""}`
              : undefined} />

          <ImpactRow icon={Package} divided tone="neutral" title="محتوى الباقة"
            value={ownedParts.length ? ownedParts.join(" · ") : "فارغ"}
            note="يُمحى مع الباقة في الحذف النهائي، ويبقى معها كما هو في الأرشفة." />
        </div>

        {/* المانع يُقال قبل الضغط لا بعده. */}
        {blockers.length > 0 && (
          <div className="mx-5 mb-4 rounded-xl px-4 py-3" style={{ background: "#FBF3D6", border: "1px solid #EBD9A0" }}>
            <div className="flex items-center gap-1.5 text-xs font-bold mb-1" style={{ color: "#8A6A08" }}>
              <AlertTriangle size={12} />الحذف النهائي غير متاح لهذه الباقة
            </div>
            <p className="text-xs leading-relaxed m-0" style={{ color: "#6b5a2a" }}>
              أرشِفها بدلاً منه: تُخفى من العمل اليومي وتبقى رحلاتها وحجوزاتها مقروءةً منسوبةً إليها.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2 px-5 py-4" style={{ borderTop: `1px solid ${B.border}`, background: B.fill }}>
          <button onClick={() => setDialog("archive")}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold cursor-pointer"
            style={{ background: "#FBF3D6", border: "1px solid #EBD9A0", color: "#8A6A08" }}>
            <Archive size={14} />أرشفة الباقة
          </button>
          {isAdmin && (
            <button onClick={() => setDialog("delete")}
              title={blockers.length ? "الحذف غير متاح — الباقة مرتبطة بغيرها" : "حذف الباقة نهائياً"}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold cursor-pointer"
              style={{ background: blockers.length ? "#fff" : "#FBE6E6", border: "1px solid #F3C9C9", color: "#BE2626", opacity: blockers.length ? 0.6 : 1 }}>
              <Trash2 size={14} />حذف نهائي
            </button>
          )}
          <span className="text-xs self-center" style={{ color: B.muted }}>
            {isAdmin ? "كلا الإجراءين يطلب سبباً يُحفظ في سجل التدقيق." : "الحذف النهائي لمدير النظام وحده."}
          </span>
        </div>
      </div>

      <AnimatePresence>
        {dialog === "archive" && (
          <DeleteDialog onCancel={() => setDialog(null)}
            onConfirm={reason => { onArchive(reason); setDialog(null); }} />
        )}
        {dialog === "delete" && (
          <PermanentDeleteDialog name={pkg.name || pkg.id} label="الباقة" blockers={blockers} busy={busy}
            onConfirm={runDelete} onCancel={() => !busy && setDialog(null)} />
        )}
      </AnimatePresence>
    </>
  );
}

/* ─── Package Detail ─── */
function PackageDetail({pkg,transports,hotels,onSave,onBack}:{pkg:Pkg;transports:Transport[];hotels:Hotel[];onSave:(p:Pkg)=>void;onBack:()=>void}) {
  const [tab,setTab]=useState<PkgTab>("info");
  const ed=useEditor<Pkg>(pkg);
  const {form,setForm,set,dirty}=ed;
  const [leaving,setLeaving]=useState(false);
  const [draftReady,setDraftReady]=useState(false);
  const [deleting,setDeleting]=useState(false);
  const setPackages=useStore(s=>s.setPackages);
  const {canWrite,isAdmin}=useRole();
  const mayWrite=canWrite("packages");
  const autosaveDelay = useRef(900);
  const inp="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none";
  const ist={borderColor:B.border,background:"#fff",color:B.black,fontFamily:"inherit"};

  /* الجاهزية تُحسب من النموذج الحيّ لا من الصفّ المحفوظ: الموظف يرى
     النسبة ترتفع وهو يكتب، فيعرف أثر ما يفعله قبل أن يحفظ. */
  const ready=useMemo(()=>readiness(form),[form]);

  /* «يبدأ من» سعر يدوي؛ الحفظ لا يشتقه من الغرف أو المواصلات. */
  const commit=useCallback((p:Pkg)=>{onSave(p);return p;},[onSave]);
  const save=()=>void ed.save(commit);
  /* الاختيار أو الصورة لا ينتظران مهلة الكتابة. الاستدعاء يسبق set،
     والأثر أدناه يلتقط القيمة الجديدة بعد الرسم. */
  const saveImmediately=useCallback(()=>{ autosaveDelay.current=0; },[]);

  /* تُعاد المسودة فوق النسخة القادمة من الخادم مرة واحدة فقط. لا نمسحها
     قبل إتمام هذه القراءة، وإلا يصبح التحديث السريع بعد فتح الصفحة سبباً
     لفقدان ما كتبه الموظف خارج الشبكة. */
  useEffect(()=>{
    const draft=readPackageDraft(pkg);
    if (draft) setForm(draft);
    setDraftReady(true);
  },[pkg.id,setForm]);

  useEffect(()=>{
    if (!draftReady) return;
    /* صفٌّ في طريقه إلى الحذف لا يُحفظ ولا تُكتب له مسودة: upsert_package
       بعد محو الصفّ يبعثه من جديد، والمسودة تعيده عند فتح الصفحة. */
    if (deleting) return;
    if (!dirty) { clearPackageDraft(form.id); return; }
    if (!dirty) { clearPackageDraft(form.id); return; }
    writePackageDraft(form);
    if (ed.state === "saving" || ed.state === "error") return;
    const delay = autosaveDelay.current;
    autosaveDelay.current = 900;
    const timer = window.setTimeout(()=>{ void ed.save(commit); },delay);
    return ()=>window.clearTimeout(timer);
  },[draftReady,deleting,form,dirty,ed.state,ed.save,commit]);
  /* الرجوع بتعديل غير محفوظ يسأل قبل أن يبتلعه — الخسارة الصامتة أخطر
     ما في الصفحة، لأن الموظف لا يعلم أصلاً أن شيئاً ضاع. */
  const back=()=>{ if(dirty) setLeaving(true); else onBack(); };

  /* ── الأرشفة والحذف ──
     كلاهما يرفع علم الحذف ويمسح المسودة أولاً، ثم يخرج إلى القائمة بلا
     حارس مغادرة: السؤال عن «تعديلات غير محفوظة» في باقةٍ حُذفت لغوٌ.

     والفرق بينهما في المسار لا في النصّ وحده: الأرشفة كتابةٌ عادية يمرّ
     حذفُها المحلي على المزامنة فتنادي archive_entity (وترتدّ وتُنبّه إن
     رفضت القاعدة)، والحذف النهائي ينادي دالّته أولاً ثم يُنزع الصفّ
     بـwriteLocalOnly — وإلّا قرأت المزامنة الغياب أرشفةً لصفٍّ لم يبق. */
  const archivePkg=(reason:string)=>{
    setDeleting(true);
    clearPackageDraft(pkg.id);
    setArchiveReason(reason);
    setPackages(prev=>prev.filter(p=>p.id!==pkg.id));
    toast.success("أُرشفت الباقة",{description:"أُخفيت من العمل اليومي وتبقى في سجل التدقيق."});
    onBack();
  };
  const deletePkg=async(reason:string)=>{
    setDeleting(true);
    try {
      await permanentlyDelete("packages",pkg.id,reason);
      clearPackageDraft(pkg.id);
      writeLocalOnly(()=>setPackages(prev=>prev.filter(p=>p.id!==pkg.id)));
      onBack();
    } catch(e) {
      /* فشل الحذف يُعيد الصفحة إلى العمل: الرمي يصل إلى منطقة الخطر
         فتعرض رسالة القاعدة العربية ويبقى الموظف حيث هو. */
      setDeleting(false);
      throw e;
    }
  };

  // Images (main + gallery)
  const gallery=form.gallery??[];
  const addGalleryImg=(url:string)=>setForm(f=>{const g=f.gallery??[];return g.length>=PKG_GALLERY_MAX?f:{...f,gallery:[...g,url]};});
  const delGalleryImg=(i:number)=>set("gallery",gallery.filter((_,idx)=>idx!==i));
  const promoteGalleryImg=(i:number)=>{ const url=gallery[i]; const rest=gallery.filter((_,idx)=>idx!==i); const demoted=form.coverImage?[form.coverImage,...rest]:rest; setForm(f=>({...f,coverImage:url,gallery:demoted.slice(0,PKG_GALLERY_MAX)})); };
  /* ترتيب مستقلّ للصور الفرعية — الأول بعد الأساسية هو أول ما يراه
     المستفيد في شريط الصور، فترتيبها ليس تفصيلاً شكلياً. */
  const moveGalleryImg=(i:number,dir:-1|1)=>{const arr=[...gallery];const j=i+dir;if(j<0||j>=arr.length)return;[arr[i],arr[j]]=[arr[j],arr[i]];set("gallery",arr);};

  // Booking settings
  const settings=form.settings??DEFAULT_PKG_SETTINGS;
  const setSetting=<K extends keyof TripSettings>(k:K,v:TripSettings[K])=>{ saveImmediately(); set("settings",{...settings,[k]:v}); };

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
  const moveRoom=(i:number,dir:-1|1)=>{const arr=[...form.roomPrices];const j=i+dir;if(j<0||j>=arr.length)return;[arr[i],arr[j]]=[arr[j],arr[i]];set("roomPrices",arr);};

  // Features
  const addFeat=()=>set("features",[...form.features,{id:uid(),icon:DEFAULT_PKG_FEATURE_ICON,text:""}]);
  const delFeat=(id:string)=>set("features",form.features.filter(f=>f.id!==id));
  const updFeat=(id:string,field:keyof PkgFeature,val:string)=>set("features",form.features.map(f=>f.id===id?{...f,[field]:val}:f));
  const moveFeat=(i:number,dir:-1|1)=>{const arr=[...form.features];const j=i+dir;if(j<0||j>=arr.length)return;[arr[i],arr[j]]=[arr[j],arr[i]];set("features",arr);};

  /* لا معالجات للسياسات: مربّع النصّ يكتب المصفوفة كاملةً بـset. */

  // Reviews — الاسم والتقييم والنص والصورة الاختيارية فقط.
  // consent:true توافقٌ خلفي مع العمود القديم، وليس حقلاً في واجهة الإدارة.
  const addReview=()=>set("reviews",[...form.reviews,{id:uid(),name:"",text:"",consent:true,rating:5}]);
  const delReview=(id:string)=>set("reviews",form.reviews.filter(r=>r.id!==id));
  const updReview=(id:string,field:keyof PkgReview,val:any)=>set("reviews",form.reviews.map(r=>r.id===id?{...r,[field]:val}:r));
  const importReviews=(event:React.ChangeEvent<HTMLInputElement>)=>{
    const file=event.target.files?.[0]; event.target.value="";
    if(!file) return;
    const reader=new FileReader();
    reader.onerror=()=>toast.error("تعذر قراءة ملف الآراء.");
    reader.onload=()=>{
      try {
        const reviews=importPackageReviewsCsv(String(reader.result??""));
        saveImmediately();
        set("reviews",[...form.reviews,...reviews.map(review=>({...review,id:uid()}) as PkgReview)]);
        toast.success(`تم استيراد ${reviews.length} رأي.`);
      } catch(error) { toast.error(error instanceof Error?error.message:"تعذر استيراد الآراء."); }
    };
    reader.readAsText(file,"UTF-8");
  };

  const selTransport = transports.find(t=>t.id===form.transportId);
  const selHotel     = hotels.find(h=>h.id===form.hotelId);
  const TABS:{id:PkgTab;label:string}[]=[{id:"info",label:"المعلومات"},{id:"program",label:"تفاصيل البرنامج"},{id:"rooms",label:"الغرف والأسعار"},{id:"features",label:"مميزات الرحلة"},{id:"policies",label:"السياسات"},{id:"reviews",label:"الآراء"},{id:"settings",label:"الإعدادات"}];

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{background: B.bg}}>
      {/* Sticky header */}
      <div className="sticky top-0 z-20 px-4 md:px-8 pt-4 md:pt-6 pb-0" style={{background:B.fill}}>
        {/* الخلفية تمتدّ بعرض الشاشة والمحتوى يتوسّط — كي تُحاذي حافةُ
            الرأس والتبويبات حافةَ ألواح المحتوى تحتها بالضبط. */}
        <div style={panelBox}>
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <button onClick={back} className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer"
            style={{background:"#fff",border:`1px solid ${B.border}`,color:B.text2}}>
            <ArrowRight size={12}/>العودة للباقات
          </button>
          <ChevronRight size={14} style={{color:B.border}}/>
          <span className="text-sm font-bold" style={{color:B.black}}>{form.name}</span>
          <span className="text-xs font-mono px-2 py-0.5 rounded-lg" style={{background:B.fill,border:`1px solid ${B.border}`,color:B.muted}}>{form.id}</span>
          <div className="mr-auto flex items-center gap-2">
            {ed.state==="saving"&&<span className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full" style={{background:"#FBF3D6",color:"#8A6A08"}}><Loader2 size={12} className="animate-spin"/>جاري الحفظ…</span>}
            {ed.state==="saved"&&<span className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full" style={{background:"#E3F3E8",color:"#1E7A44"}}><Check size={12}/>تم الحفظ</span>}
            {ed.state==="error"&&<button onClick={save} className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full cursor-pointer" style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}><AlertTriangle size={12}/>تعذر الحفظ — إعادة المحاولة</button>}
            {dirty&&ed.state==="idle"&&<span className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full" style={{background:"#FBF3D6",color:"#8A6A08"}}><span className="w-1.5 h-1.5 rounded-full" style={{background:"#8A6A08"}}/>سيُحفظ تلقائياً…</span>}
            {/* المعاينة تفتح صفحة المستفيد نفسها لا نسخةً منها: نسخةٌ ثانية
                تتفارق عن الأصل عند أول تعديل، فتُطمئن الموظف على شكلٍ لا
                يراه أحد. تُفتح في تبويب جديد كي لا يُفقد ما لم يُحفظ. */}
            <a href={`/p/${encodeURIComponent(form.id)}?preview=1`} target="_blank" rel="noopener noreferrer"
              title={dirty?"المعاينة تعرض آخر نسخة محفوظة — احفظ أولاً لترى تعديلاتك":"معاينة صفحة الباقة كما يراها العميل"}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold no-underline"
              style={{background:"#fff",border:`1px solid ${B.border}`,color:B.text2}}>
              <Eye size={12}/>معاينة كما يراها العميل
            </a>
            <StatusBadge status={form.status} entity="package"/>
          </div>
        </div>
        {/* Package hero strip */}
        <div className="relative rounded-2xl overflow-hidden mb-0" style={{height:96,background:B.primaryDeep}}>
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
                <div className="text-2xl font-extrabold" style={{color:ready.startsFrom>0?B.gold:"#BE2626",fontFamily:"var(--font-app)",lineHeight:1}}>
                  {ready.startsFrom>0?sarNumber(ready.startsFrom):"—"}
                  <span className="text-sm font-bold mr-1" style={{color:ready.startsFrom>0?B.gold2:"#BE2626"}}>{SAR}</span>
                </div>
              </div>
              <button onClick={save} disabled={!dirty||ed.state==="saving"}
                title={!dirty?"لا توجد تغييرات لحفظها":"حفظ التعديلات"}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold"
                style={{
                  background:ed.state==="saved"?"#1E7A44":ed.state==="error"?"#BE2626":B.gold,
                  color:ed.state==="saved"||ed.state==="error"?"#fff":B.black,
                  border:"none",opacity:!dirty&&ed.state==="idle"?0.45:1,
                  cursor:!dirty||ed.state==="saving"?"not-allowed":"pointer",transition:"background .15s",
                }}>
                {ed.state==="saving"?<Loader2 size={13} className="animate-spin"/>
                 :ed.state==="error"?<AlertTriangle size={13}/>:<Check size={13}/>}
                {ed.state==="saving"?"جارٍ الحفظ…":ed.state==="saved"?"تم الحفظ":ed.state==="error"?"إعادة المحاولة":"حفظ الآن"}
              </button>
            </div>
          </div>
        </div>
        {/* رسالة الفشل — تبقى حتى ينجح الحفظ أو يُلغى، لا توست يمرّ */}
        {ed.state==="error"&&ed.error&&(
          <div className="mt-2 rounded-xl px-4 py-2.5 flex items-start gap-2 text-xs" style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}>
            <AlertTriangle size={14} style={{flexShrink:0,marginTop:1}}/>
            <span><b>تعذّر الحفظ:</b> {ed.error} تعديلاتك محفوظة محلياً على هذا الجهاز. أعد المحاولة عند عودة الاتصال.</span>
          </div>
        )}
        {/* شريط الاكتمال — يجيب «ماذا ينقص؟» في مكانٍ واحد بدل تفرّقه */}
        <ReadinessBar r={ready} status={form.status} onGo={setTab}/>
        {/* Tabs */}
        <TabStrip tabs={TABS} active={tab} onChange={t=>setTab(t)} tone="onLight" idPrefix="pkg"/>
        <div style={{height:1,background:B.border}}/>
        </div>
      </div>
      {/* Body */}
      <div className="flex-1 px-4 md:px-8 pb-12 pt-6 overflow-y-auto" style={{scrollbarWidth:"none"}}>
        <div style={panelBox}>
        <AnimatePresence mode="wait">
          {tab==="info"&&<motion.div role="tabpanel" id="pkg-panel-info" aria-labelledby="pkg-tab-info" key="info" initial={{opacity:0}} animate={{opacity:1}} transition={{duration:0.12}} className="grid gap-5 pkg-two-col" style={{...panelBox,gridTemplateColumns:"1.45fr 1fr"}}>
            {/* LEFT */}
            <div className="flex flex-col gap-4">
              <div className="rounded-2xl p-5 flex flex-col gap-4" style={{background:"#fff",border:`1px solid ${B.border}`}}>
                <h3 className="text-sm font-bold" style={{color:B.black,margin:0}}>المعلومات الأساسية</h3>
                {/* الصورة الأساسية: اختيار ثم معاينة مباشرة، بلا قصّ أو تكبير. */}
                <div>
                  <label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>
                    الصورة الأساسية للباقة <span style={{color:B.gold}}>*</span>
                  </label>
                  <div className="flex gap-3">
                    {/* لا يُفرض المقاس: العرض في البطاقة يغطي الإطار تلقائياً. */}
                    <label className="relative rounded-xl overflow-hidden flex items-center justify-center cursor-pointer flex-shrink-0"
                      style={{width:180,height:120,border:`1.5px solid ${form.coverImage?B.gold:"#F3C9C9"}`,background:form.coverImage?"transparent":"#FDF6F6"}}>
                      {form.coverImage
                        ? <img src={form.coverImage} alt="الصورة الأساسية للباقة" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                        : <div className="flex flex-col items-center gap-1" style={{color:"#BE2626"}}><ImagePlus size={22}/><span style={{fontSize:11,fontWeight:700}}>الصورة الأساسية</span><span style={{fontSize:10}}>مطلوبة</span></div>}
                      <span className="absolute top-1.5 right-1.5 flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold"
                        style={{background:"rgba(192,134,44,0.92)",color:"#fff"}}><Star size={10}/>أساسية</span>
                      {form.coverImage&&<span className="absolute bottom-1.5 left-1.5 px-2 py-1 rounded-md text-xs font-bold"
                        style={{background:"rgba(14,12,11,0.78)",color:"#fff"}}>تغيير الصورة</span>}
                      <input type="file" accept="image/*" className="hidden"
                        onChange={onPickMedia("packages",url=>{saveImmediately();set("coverImage",url);})}/>
                    </label>
                    <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
                      <p className="text-xs font-bold" style={{color:B.text3}}>{form.coverImage?"معاينة الصورة الأساسية":"ارفع الصورة لعرض معاينتها هنا"}</p>
                      <p className="text-xs" style={{color:B.muted}}>المقاس المقترح: 1200 × 800 بكسل (3:2)</p>
                      <p className="text-xs leading-relaxed" style={{color:B.muted}}>المقاس اختياري؛ الصور المختلفة تُعرض تلقائياً داخل البطاقة مع الحفاظ على امتلاء الإطار.</p>
                    </div>
                  </div>
                  {/* الصور الفرعية — اختيار ورفع مباشر بلا قصّ. */}
                  <div className="mt-3 pt-3" style={{borderTop:`1px solid ${B.border}`}}>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs mb-1.5" style={{color:B.muted}}>صور فرعية · {gallery.length}/{PKG_GALLERY_MAX} · رفع مباشر بلا قصّ · المقاس المقترح 1200 × 800 بكسل (3:2)</div>
                      <div className="flex flex-wrap gap-2">
                        {gallery.map((url,i)=>(
                          <div key={`${url}-${i}`} className="relative rounded-lg overflow-hidden" style={{width:76,height:57,border:`1px solid ${B.border}`}}>
                            <img src={url} alt={`صورة فرعية ${i+1}`} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                            <span className="absolute top-0.5 right-0.5 px-1 rounded text-xs font-bold" style={{background:"rgba(14,12,11,0.65)",color:"#fff",fontSize:9}}>{i+1}</span>
                            <button onClick={()=>promoteGalleryImg(i)} className="absolute top-0.5 left-0.5 w-5 h-5 rounded flex items-center justify-center cursor-pointer"
                              style={{background:"rgba(255,255,255,0.9)",border:"none",color:B.gold}} aria-label="اجعلها الصورة الأساسية" title="اجعلها الصورة الأساسية"><Star size={11}/></button>
                            <div className="absolute bottom-0.5 right-0.5 flex gap-0.5">
                              <button onClick={()=>moveGalleryImg(i,-1)} disabled={i===0} className="w-5 h-5 rounded flex items-center justify-center cursor-pointer"
                                style={{background:"rgba(255,255,255,0.9)",border:"none",color:B.text2,opacity:i===0?0.35:1}} aria-label="تقديم الصورة" title="تقديم الصورة"><ChevronRight size={11}/></button>
                              <button onClick={()=>moveGalleryImg(i,1)} disabled={i===gallery.length-1} className="w-5 h-5 rounded flex items-center justify-center cursor-pointer"
                                style={{background:"rgba(255,255,255,0.9)",border:"none",color:B.text2,opacity:i===gallery.length-1?0.35:1}} aria-label="تأخير الصورة" title="تأخير الصورة"><ChevronLeft size={11}/></button>
                            </div>
                            <button onClick={()=>delGalleryImg(i)} className="absolute bottom-0.5 left-0.5 w-5 h-5 rounded flex items-center justify-center cursor-pointer"
                              style={{background:"rgba(190,38,38,0.9)",border:"none",color:"#fff"}} aria-label="حذف الصورة" title="حذف الصورة"><X size={10}/></button>
                          </div>
                        ))}
                        {gallery.length<PKG_GALLERY_MAX&&(
                          <label className="rounded-lg flex flex-col items-center justify-center cursor-pointer" style={{width:76,height:57,border:`1px dashed ${B.border}`,background:B.fill,color:B.muted}}>
                            <ImagePlus size={16}/>
                            <input type="file" accept="image/*" className="hidden"
                              onChange={onPickMedia("package-gallery",url=>{saveImmediately();addGalleryImg(url);})}/>
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
                         <AppSelect value={form.productType} onChange={v=>{saveImmediately();set("productType",v);}} options={PRODUCT_TYPE_OPTS.map(o=>({value:o,label:o}))}/>
                       </Field></div>
                  <div><Field label="الوجهة">
                         <AppSelect value={form.destination} onChange={v=>{saveImmediately();set("destination",v as PkgDest);}} options={DEST_OPTS.map(o=>({value:o,label:o}))}/>
                       </Field></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Field label="الأيام">
                         <NumericInput min={1} className={inp} style={ist} value={form.days} onValueChange={v=>set("days",Number(v))}/>
                       </Field></div>
                  <div><Field label="الليالي">
                         <NumericInput min={0} className={inp} style={ist} value={form.nights} onValueChange={v=>set("nights",Number(v))}/>
                       </Field></div>
                  
                </div>
                {/* «نشطة» تعني «يراها العملاء الآن». تُمنَع ما دام ينقص شرط
                    إلزامي، ويُقال أيّ شرط — المنع بلا سبب يُقرأ عطلاً. */}
                <div><Field label="الحالة">
                       <AppSelect value={form.status} onChange={v=>{saveImmediately();set("status",v as PkgStatus);}}
                         options={[
                           {value:"active",label:ready.canActivate?"نشطة":`نشطة — يتعذّر: ينقص ${ready.blockers.length} شرطاً`,disabled:!ready.canActivate&&form.status!=="active"},
                           {value:"draft",label:"مسودة"},{value:"hidden",label:"مخفية"},{value:"suspended",label:"موقوفة"},
                         ]}/>
                     </Field>
                  {!ready.canActivate&&(
                    <p className="text-xs mt-1.5 flex items-start gap-1.5" style={{color:"#BE2626"}}>
                      <AlertTriangle size={12} style={{flexShrink:0,marginTop:1}}/>
                      <span>لا يمكن النشر قبل: {ready.blockers.map(b=>b.label).join("، ")}.</span>
                    </p>
                  )}
                  {form.nights===0&&(
                    <p className="text-xs mt-1.5 flex items-start gap-1.5" style={{color:B.muted}}>
                      <Info size={12} style={{flexShrink:0,marginTop:1,color:B.gold}}/>
                      <span>هذه الباقة <b>مواصلات فقط</b> (صفر ليالٍ) — لا يُطلب فندق ولا خيارات غرف.</span>
                    </p>
                  )}
                </div>
              </div>
              {/* Suggested operating days */}
              <div className="rounded-2xl p-5 flex flex-col gap-3" style={{background:"#fff",border:`1px solid ${B.border}`}}>
                <div><div className="text-sm font-bold" style={{color:B.black}}>أيام التشغيل المقترحة</div>
                  <div className="text-xs mt-0.5" style={{color:B.muted}}>اليوم الأسبوعي المقترح لتشغيل الباقة · التواريخ الفعلية تُحدد في الرحلات</div></div>
                <div><Field label="اليوم المقترح">
                       <AppSelect value={form.recurDay} onChange={v=>{saveImmediately();set("recurDay",v);}} options={RECUR_DAYS.map(d=>({value:d,label:d}))}/>
                     </Field></div>
              </div>
            </div>
            {/* RIGHT */}
            <div className="flex flex-col gap-4">
              {/* Transport link */}
              <div className="rounded-2xl p-5 flex flex-col gap-3" style={{background:"#fff",border:`1px solid ${B.border}`}}>
                <h3 className="text-sm font-bold" style={{color:B.black,margin:0}}>المواصلة المرتبطة</h3>
                <AppSelect value={form.transportId} placeholder="اختر مواصلة" onChange={v=>{
                  saveImmediately();
                  const t=transports.find(x=>x.id===v);
                  setForm(f=>({...f,transportId:v,productType:t?(t.mode==="flight"?"طيران":t.vehicleType.includes("VIP")?"رحلة VIP":"حافلة"):f.productType}));
                }} options={linkableTransports(transports).map(t=>({value:t.id,label:`${t.name} · ${t.vehicleType} · ${t.seats} مقعد · ${sar(t.seatCost)}`}))}/>
                {/* المسوّدات والمتوقفة محجوبة عن الربط: ربطُ باقةٍ منشورة
                    بمركبةٍ لم تُعتمد كان ينقل العلّة ولا يحلّها — الباقة
                    تأخذ سعتها وتكلفتها من صفٍّ نصف مكتمل. */}
                {form.transportId&&!linkableTransports(transports).some(t=>t.id===form.transportId)&&(
                  <div className="text-xs font-bold px-3 py-2 rounded-xl" style={{background:"#FBF3D6",border:"1px solid #F0E3AE",color:"#8A6A08"}}>
                    المواصلة المرتبطة حالياً مسودة أو متوقفة — فعّلها من شاشة المواصلات أو اختر غيرها.
                  </div>
                )}
                {selTransport && (()=>{ const cover=selTransport.media?.find(m=>m.primary&&m.kind==="image")?.url||selTransport.media?.find(m=>m.kind==="image")?.url; return (
                  <div className="flex items-center gap-3 p-3 rounded-xl" style={{background:B.surface,border:`1px solid ${B.border}`}}>
                    <div className="w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0" style={{background:B.fill}}>
                      {cover?<img src={cover} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<span className="text-2xl">{selTransport.mode==="bus"?"🚌":"✈️"}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold" style={{color:B.black}}>{selTransport.name}</div>
                      <div className="text-xs mt-0.5" style={{color:B.muted}}>{selTransport.vehicleType} · {selTransport.seats} مقعد</div>
                    </div>
                  </div>
                ); })()}
              </div>
              {/* Hotel link */}
              <div className="rounded-2xl p-5 flex flex-col gap-3" style={{background:"#fff",border:`1px solid ${B.border}`}}>
                <h3 className="text-sm font-bold" style={{color:B.black,margin:0}}>الفندق المرتبط</h3>
                {/* المنشورة وحدها: قائمةٌ تسرد كل الفنادق تسمح بربط باقةٍ
                    نشطة بفندقٍ مسودةٍ أو متوقّف — فيراه العميل سكناً بلا
                    سعر. الفندق المربوط سابقاً يبقى في القائمة كي لا يختفي
                    اختيارٌ قائم بلا تفسير. */}
                <AppSelect value={form.hotelId} placeholder="اختر فندقاً" onChange={v=>{saveImmediately();set("hotelId",v);}}
                  options={[...linkableHotels(hotels), ...hotels.filter(h=>h.id===form.hotelId&&!isPublished(h.status))]
                    .map(h=>({value:h.id,label:`${cleanHotelName(h.name)} · ${h.city} · ${h.stars}★${isPublished(h.status)?"":" — غير منشور"}`}))}/>
                {selHotel&&!isPublished(selHotel.status)&&(
                  <div className="rounded-xl px-3.5 py-2.5 text-xs font-bold leading-relaxed"
                    style={{background:"#FBF3D6",border:"1px solid #EBD9A0",color:"#8A6A08"}}>
                    هذا الفندق {selHotel.status==="draft"?"مسودة":"متوقف"} — لن يراه العميل حتى يُنشر من شاشة الفنادق.
                  </div>
                )}
                {selHotel && (()=>{ const cover=selHotel.media?.find(m=>m.primary&&m.kind==="image")?.url||selHotel.media?.find(m=>m.kind==="image")?.url; return (
                  <div className="flex items-center gap-3 p-3 rounded-xl" style={{background:B.fill,border:`1px solid ${B.border}`}}>
                    <div className="w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0" style={{background:"#fff",border:`1px solid ${B.border}`}}>
                      {cover?<img src={cover} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<Building2 size={18} style={{color:B.muted}}/>}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-sm mb-0.5" style={{color:B.black}}>{hotelDisplayName(selHotel.name)}</div>
                      <div className="flex items-center gap-2 text-xs" style={{color:B.text2}}>
                        <MapPin size={10} style={{color:B.gold}}/>
                        <span>{selHotel.city}</span><span>·</span>
                        {/* التصنيف نصّاً لا صفّاً من نجوم: خمس رسماتٍ ذهبية
                            بقياس ٩ بكسل تُعيد رسم نفسها وتتبدّل عدداً مع كل
                            تبديل فندق — ضجيجٌ بصري ثمنه معلومةٌ يقولها رقمٌ
                            واحد بهدوء، وهي مكتوبة أصلاً في قائمة الاختيار. */}
                        <span>{selHotel.stars} نجوم</span>
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

          {tab==="program"&&<motion.div role="tabpanel" id="pkg-panel-program" aria-labelledby="pkg-tab-program" key="program" initial={{opacity:0}} animate={{opacity:1}} transition={{duration:0.12}}>
            <div className="pkg-two-col" style={{display:"grid",gridTemplateColumns:"1.35fr 1fr",gap:24}}>
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold" style={{color:B.black}}>مراحل البرنامج</h3>
                  <button onClick={addStage} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer"
                    style={{background:B.gold,border:"none",color:B.black}}><Plus size={12}/>إضافة مرحلة</button>
                </div>
                <AnimatePresence>{activeStages.map((s,idx)=>(
                  <motion.div key={s.id} initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}
                    className="rounded-2xl overflow-hidden" style={{border:`1px solid ${B.border}`}}>
                    <div className="flex items-center gap-2 px-4 py-2.5" style={{background:B.fill,borderBottom:`1px solid ${B.border}`}}>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs" style={{background:B.gold,color:B.black}}>{idx+1}</div>
                      <span className="text-sm font-bold flex-1" style={{color:B.black}}>{s.title||"مرحلة جديدة"}</span>
                      <div className="flex gap-1">
                        <button aria-label="تقديم المرحلة في البرنامج" title="تقديم المرحلة في البرنامج" onClick={()=>moveStage(s.id,-1)} disabled={idx===0} className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer"
                          style={{background:"#fff",border:`1px solid ${B.border}`,color:B.muted,opacity:idx===0?0.4:1}}><ChevronUp size={12}/></button>
                        <button aria-label="تأخير المرحلة في البرنامج" title="تأخير المرحلة في البرنامج" onClick={()=>moveStage(s.id,1)} disabled={idx===activeStages.length-1} className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer"
                          style={{background:"#fff",border:`1px solid ${B.border}`,color:B.muted,opacity:idx===activeStages.length-1?0.4:1}}><ChevronDown size={12}/></button>
                        <button onClick={()=>archiveStage(s.id)} title="أرشفة المرحلة" className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer"
                          style={{background:"#fff",border:`1px solid ${B.border}`,color:"#8a6a08"}}><Archive size={12}/></button>
                        <button aria-label="حذف المرحلة" title="حذف المرحلة" onClick={()=>delStage(s.id)} className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer"
                          style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}><X size={11}/></button>
                      </div>
                    </div>
                    <div className="p-4 grid grid-cols-2 gap-3">
                      <div><Field label="الأيقونة" labelClass="block text-xs font-bold mb-1" labelStyle={{color:B.muted}}>
                             <StageIconPicker value={s.icon} onChange={icon=>updStage(s.id,"icon",icon)}/>
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
                  <div className="mt-2 rounded-2xl p-4 flex flex-col gap-2" style={{background:B.fill,border:`1px dashed ${B.border}`}}>
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
                        <button aria-label="حذف المرحلة" title="حذف المرحلة" onClick={()=>delStage(s.id)} className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer"
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
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base" style={{background:B.fill,border:`1.5px solid ${B.border}`}}>{s.icon}</div>
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

          {tab==="rooms"&&(()=>{
            /* ── التسعير: نموذج إعداد لا لوحة محاسبة ──

               كان الرقم الواحد موزّعاً على أربعة أماكن: السعر المعلن في
               بطاقة، ومراجعةٌ تكرّر الفندق والمواصلة، وجدولٌ بثمانية أعمدة
               يخلط تكلفة المقعد بسعر الغرفة، وصندوق «مواصلات فقط» بينهما.
               فمن يريد أن يعرف «كم يدفع الفرد؟» يجمع بنفسه من أربع نواحٍ.

               التدفّق الآن من أعلى إلى أسفل — سعرٌ معلن، ثم سكن، ثم نقل —
               وإلى جانبه بطاقةٌ واحدة تجمع: السكن + النقل = الإجمالي، تتغيّر
               مع كل ضغطة مفتاح. الأرقام تُدخَل مرّةً وتُقرأ مرّة. */
            const nights=form.nights;
            const seatOf=(r:RoomPrice)=>r.seatCost ?? (selTransport?.seatCost ?? 0);
            const stayOf=(r:RoomPrice)=>(r.perNight||0)*nights;
            const totalOf=(r:RoomPrice)=>stayOf(r)+seatOf(r);
            const sellable=form.roomPrices.filter(isSellableTier);
            const cheapest=sellable.length?Math.min(...sellable.map(totalOf)):0;
            const announced=form.marketPrice||0;
            /* فجوةٌ بين المعلن وأرخص إجمالي فعلي ليست خطأً دائماً (سعرٌ
               ترويجي مقصود)، لكنها لا تُكتشف بالصدفة بعد النشر. */
            const gap=announced>0&&cheapest>0&&announced!==cheapest;
            const step=(n:number,Icon:typeof Wallet,title:string,note?:string)=>(
              <div className="flex items-start gap-2.5 mb-3">
                <span className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{background:B.primaryDeep,color:B.gold,fontSize:12,fontWeight:900}}>{n}</span>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold flex items-center gap-1.5" style={{color:B.black}}><Icon size={14} style={{color:B.gold}}/>{title}</h3>
                  {note&&<p className="text-xs mt-0.5 leading-relaxed" style={{color:B.muted}}>{note}</p>}
                </div>
              </div>
            );
            const card:React.CSSProperties={background:"#fff",border:`1px solid ${B.border}`};
            return (
          <motion.div role="tabpanel" id="pkg-panel-rooms" aria-labelledby="pkg-tab-rooms" key="rooms" initial={{opacity:0}} animate={{opacity:1}} transition={{duration:0.12}}>
            <div className="pkg-price-grid" style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) 304px",gap:20,alignItems:"start"}}>
              <div className="flex flex-col gap-4 min-w-0">

                {/* ① السعر المعلن */}
                <section className="rounded-2xl p-5" style={{...card,borderColor:announced>0?B.border:"#F3C9C9"}}>
                  {step(1,Wallet,"السعر المعلن للعميل","الرقم الذي يراه العميل في بطاقة الباقة تحت «يبدأ من». تحدده أنت، ولا يتغيّر تلقائياً مع أسعار الغرف.")}
                  <div className="flex items-end gap-3 flex-wrap">
                    <div style={{width:190}}>
                      <Field label="يبدأ من (ر.س)">
                        <NumericInput min={1} value={form.marketPrice || ""} placeholder="50" normalizeArabicDigits
                          onValueChange={value=>set("marketPrice",value===""?0:Number(value))}
                          className="w-full border rounded-xl px-3.5 py-2.5 text-base font-extrabold focus:outline-none"
                          style={{borderColor:announced>0?B.border:"#BE2626",background:"#fff",color:B.gold,direction:"ltr",textAlign:"right",fontFamily:"var(--font-app)"}}/>
                      </Field>
                    </div>
                    <p className="text-xs leading-relaxed flex-1 min-w-[220px] pb-2.5" style={{color:B.muted}}>
                      <b style={{color:B.text2}}>الأسعار نهائية شاملة الضريبة والخدمة</b> — لا تُضاف نسبة لاحقاً، وما يظهر للعميل هو ما يدفعه.
                    </p>
                  </div>
                  {!announced&&<p className="text-xs font-bold mt-1" style={{color:"#BE2626"}}>أدخل السعر المعلن قبل نشر الباقة.</p>}
                </section>

                {/* ② السكن وأسعاره */}
                <section className="rounded-2xl p-5" style={card}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    {step(2,BedDouble,"السكن وأسعاره",nights>0
                      ?"سعر الليلة للفرد في كل نوع سكن. الليالي مأخوذة من مدة الباقة."
                      :"الباقة بلا مبيت (صفر ليالٍ) — السكن اختياري هنا.")}
                    <button onClick={addRoom} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer"
                      style={{background:B.gold,border:"none",color:B.black}}><Plus size={12}/>إضافة نوع سكن</button>
                  </div>
                  <div className="flex items-center gap-2 mb-2.5 flex-wrap">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{background:B.fill,border:`1px solid ${B.border}`,color:B.text2}}>
                      × {nights} {nights===1?"ليلة":nights===2?"ليلتان":"ليالٍ"}
                    </span>
                    {selHotel&&selHotel.roomTypes.length>0&&(
                      <span className="text-xs" style={{color:B.muted}}>
                        للاسترشاد — أسعار {cleanHotelName(selHotel.name)}:{" "}
                        {selHotel.roomTypes.map(rt=>`${rt.kind==="shared"?"مشترك":"خاصة"} ${sarNumber(rt.pricePerNight)}`).join(" · ")}
                      </span>
                    )}
                  </div>
                  {/* خمسة أعمدة بعد ثمانية: تكلفة المقعد نزلت إلى قسم النقل،
                      والليالي صارت شارةً واحدة فوق الجدول بدل رقمٍ مكرّر في
                      كل صفّ، والأسهم والحذف في خليةٍ واحدة. */}
                  <div className="rounded-xl overflow-hidden" style={{border:`1px solid ${B.border}`}}>
                    <div className="grid text-xs font-bold" style={{gridTemplateColumns:"1.5fr .9fr 1fr 1fr 68px",background:B.fill,color:B.muted,borderBottom:`1px solid ${B.border}`}}>
                      {["نوع السكن","عدد الأشخاص","سعر الليلة للفرد","إجمالي السكن للفرد",""].map((h,i)=>(
                        <div key={i} className="px-3 py-2.5 text-center first:text-right">{h}</div>
                      ))}
                    </div>
                    <AnimatePresence>{form.roomPrices.map((r,ri)=>(
                      <motion.div key={r.id} initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}
                        className="grid items-center" style={{gridTemplateColumns:"1.5fr .9fr 1fr 1fr 68px",borderTop:`1px solid ${B.border}`,background:"#fff"}}>
                        <div className="px-3 py-2">
                          <select className="w-full border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none cursor-pointer"
                            style={{borderColor:B.border,background:"#fff",color:B.black,fontFamily:"inherit"}}
                            value={r.type} onChange={e=>updRoom(r.id,"type",e.target.value)}>
                            <option>سكن مشترك</option><option>غرفة خاصة</option><option>جناح عائلي</option>
                          </select>
                        </div>
                        <div className="px-3 py-2"><NumericInput min={1} className="w-full border rounded-xl px-2 py-2 text-xs text-center focus:outline-none"
                          style={{borderColor:B.border,fontFamily:"inherit"}} value={r.persons} onValueChange={v=>updRoom(r.id,"persons",Number(v))}/></div>
                        <div className="px-3 py-2"><NumericInput min={0} className="w-full border rounded-xl px-2 py-2 text-xs font-bold text-center focus:outline-none"
                          style={{borderColor:B.border,color:B.gold,fontFamily:"inherit"}} value={r.perNight} onValueChange={v=>updRoom(r.id,"perNight",Number(v))}/></div>
                        <div className="px-3 py-2 text-sm font-extrabold text-center" style={{color:B.black,fontFamily:"var(--font-app)"}}>{sar(stayOf(r))}</div>
                        <div className="px-2 py-2 flex items-center justify-center gap-1">
                          <div className="flex flex-col gap-0.5">
                            <button onClick={()=>moveRoom(ri,-1)} disabled={ri===0} className="w-5 h-3.5 flex items-center justify-center rounded cursor-pointer"
                              style={{background:B.fill,border:`1px solid ${B.border}`,color:B.text2,opacity:ri===0?0.35:1}} aria-label="تقديم نوع السكن" title="تقديم نوع السكن"><ChevronUp size={9}/></button>
                            <button onClick={()=>moveRoom(ri,1)} disabled={ri===form.roomPrices.length-1} className="w-5 h-3.5 flex items-center justify-center rounded cursor-pointer"
                              style={{background:B.fill,border:`1px solid ${B.border}`,color:B.text2,opacity:ri===form.roomPrices.length-1?0.35:1}} aria-label="تأخير نوع السكن" title="تأخير نوع السكن"><ChevronDown size={9}/></button>
                          </div>
                          <button aria-label="حذف نوع السكن" title="حذف نوع السكن" onClick={()=>delRoom(r.id)} className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer"
                            style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}><X size={11}/></button>
                        </div>
                      </motion.div>
                    ))}</AnimatePresence>
                    {form.roomPrices.length===0&&<div className="flex flex-col items-center py-12" style={{color:ready.housing?"#BE2626":B.muted}}>
                      <Building2 size={26} style={{opacity:0.35,marginBottom:8}}/>
                      <p className="text-sm font-bold">لم تُضف أنواع سكن بعد</p>
                      <p className="text-xs mt-1">{ready.housing?"مطلوب نوع واحد على الأقل قبل النشر — الباقة تشمل سكناً.":"الباقة بلا مبيت — السكن اختياري."}</p>
                    </div>}
                  </div>
                </section>

                {/* ③ المواصلات — قسم مستقل لا عمودٌ داخل جدول الغرف */}
                <section className="rounded-2xl p-5" style={card}>
                  {step(3,BusIcon,"المواصلات","تكلفة المقعد تُضاف إلى سعر السكن لتكوّن الإجمالي للفرد. اخفضها كلما زاد عدد الأشخاص في الغرفة.")}
                  {selTransport
                    ? <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl mb-3" style={{background:B.fill,border:`1px solid ${B.border}`}}>
                        <span className="text-sm font-bold" style={{color:B.black}}>{selTransport.mode==="bus"?"🚌":"✈️"} {selTransport.name}</span>
                        <span className="text-sm font-bold" style={{color:B.text2,fontFamily:"var(--font-app)"}}>{sar(selTransport.seatCost)}<span className="text-xs font-normal" style={{color:B.muted}}> /مقعد — القيمة المبدئية</span></span>
                      </div>
                    : <div className="rounded-xl px-3.5 py-2.5 mb-3 text-xs font-bold" style={{background:"#FBF3D6",border:"1px solid #EBD9A0",color:"#8A6A08"}}>
                        لم تُربط مواصلة بعد — تكلفة المقعد المبدئية صفر. اربطها من تبويب «المعلومات».
                      </div>}
                  {form.roomPrices.length>0&&(
                    <div className="rounded-xl overflow-hidden mb-3" style={{border:`1px solid ${B.border}`}}>
                      <div className="grid text-xs font-bold" style={{gridTemplateColumns:"1fr 140px",background:B.fill,color:B.muted,borderBottom:`1px solid ${B.border}`}}>
                        <div className="px-3 py-2.5">تكلفة المقعد لكل نوع سكن</div>
                        <div className="px-3 py-2.5 text-center">ر.س / فرد</div>
                      </div>
                      {form.roomPrices.map(r=>(
                        <div key={r.id} className="grid items-center" style={{gridTemplateColumns:"1fr 140px",borderTop:`1px solid ${B.border}`,background:"#fff"}}>
                          <div className="px-3 py-2 text-xs font-bold" style={{color:B.text2}}>{r.type} <span style={{color:B.muted,fontWeight:400}}>· {r.persons} أشخاص</span></div>
                          <div className="px-3 py-2"><NumericInput min={0} className="w-full border rounded-xl px-2 py-2 text-xs font-bold text-center focus:outline-none"
                            style={{borderColor:r.seatCost!=null?B.gold:B.border,color:B.text2,fontFamily:"var(--font-app)"}} value={seatOf(r)}
                            onValueChange={v=>updRoom(r.id,"seatCost",Number(v))}/></div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="rounded-xl p-3.5" style={{background:form.transportOnlyEnabled?"#F3FAF5":B.fill,border:`1px solid ${form.transportOnlyEnabled?"#C4E4CE":B.border}`}}>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={!!form.transportOnlyEnabled}
                        onChange={e=>{saveImmediately();set("transportOnlyEnabled",e.target.checked);}} style={{accentColor:B.primary,width:16,height:16}}/>
                      <span className="text-sm font-bold" style={{color:B.black}}>السماح بحجز مواصلات فقط (بلا سكن)</span>
                    </label>
                    {form.transportOnlyEnabled&&<div className="mt-3" style={{maxWidth:240}}>
                      <Field label="سعر المواصلات للفرد (ر.س)" hint="سعر البيع للعميل، لا تكلفة المقعد الداخلية.">
                        <NumericInput min={1} className={inp} style={{...ist,color:B.gold,fontWeight:800,direction:"ltr",textAlign:"right"}}
                          value={form.transportOnlyPrice ?? ""} placeholder="مثال: 75" onValueChange={v=>set("transportOnlyPrice",v===""?undefined:Number(v))}/>
                      </Field>
                    </div>}
                  </div>
                </section>
              </div>

              {/* ④ الملخّص — بطاقةٌ واحدة تتحدّث مع كل ضغطة مفتاح */}
              <aside className="sticky rounded-2xl p-4 flex flex-col gap-3" style={{...card,top:8}}>
                <h3 className="text-sm font-bold flex items-center gap-1.5" style={{color:B.black}}><Wallet size={14} style={{color:B.gold}}/>ملخّص السعر</h3>

                <div className="rounded-xl px-3.5 py-3" style={{background:B.fill,border:`1px solid ${B.border}`}}>
                  <div className="text-xs" style={{color:B.muted}}>المعلن للعميل «يبدأ من»</div>
                  <div className="text-xl font-extrabold mt-0.5" style={{color:announced>0?B.gold:"#BE2626",fontFamily:"var(--font-app)"}}>
                    {announced>0?sarNumber(announced):"—"}<span className="text-xs font-bold mr-1">{SAR}</span>
                  </div>
                </div>

                {sellable.length>0
                  ? <div className="flex flex-col gap-2.5">
                      {sellable.map(r=>(
                        <div key={r.id} className="rounded-xl px-3.5 py-2.5" style={{border:`1px solid ${B.border}`}}>
                          <div className="text-xs font-bold mb-1.5" style={{color:B.black}}>{r.type}</div>
                          <div className="flex items-center justify-between text-xs" style={{color:B.text2}}>
                            <span>السكن <span style={{color:B.muted}}>({nights}×{sarNumber(r.perNight)})</span></span>
                            <span style={{fontFamily:"var(--font-app)"}}>{sarNumber(stayOf(r))}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs mt-1" style={{color:B.text2}}>
                            <span>النقل</span>
                            <span style={{fontFamily:"var(--font-app)"}}>{sarNumber(seatOf(r))}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm font-extrabold mt-2 pt-2" style={{color:B.black,borderTop:`1px solid ${B.border}`}}>
                            <span>الإجمالي للفرد</span>
                            <span style={{fontFamily:"var(--font-app)",color:B.gold}}>{sar(totalOf(r))}</span>
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center justify-between text-xs font-bold px-1" style={{color:B.text2}}>
                        <span>أرخص إجمالي فعلي</span>
                        <span style={{fontFamily:"var(--font-app)"}}>{sar(cheapest)}</span>
                      </div>
                      {gap&&(
                        <div className="rounded-xl px-3 py-2.5 flex items-start gap-2 text-xs leading-relaxed"
                          style={{background:"#FBF3D6",border:"1px solid #EBD9A0",color:"#8A6A08"}}>
                          <Info size={13} style={{flexShrink:0,marginTop:1}}/>
                          <span>المعلن {sarNumber(announced)} وأرخص إجمالي {sarNumber(cheapest)} — تأكّد أن الفرق مقصود.</span>
                        </div>
                      )}
                    </div>
                  : <p className="text-xs leading-relaxed" style={{color:B.muted}}>
                      أضف نوع سكن بسعر ليلة أكبر من صفر ليظهر الإجمالي للفرد هنا.
                    </p>}

                {form.transportOnlyEnabled&&(
                  <div className="rounded-xl px-3.5 py-2.5 flex items-center justify-between text-xs font-bold" style={{background:"#F3FAF5",border:"1px solid #C4E4CE",color:"#1E7A44"}}>
                    <span>مواصلات فقط</span>
                    <span style={{fontFamily:"var(--font-app)"}}>{form.transportOnlyPrice?sar(form.transportOnlyPrice):"—"}</span>
                  </div>
                )}
              </aside>
            </div>
          </motion.div>
            );
          })()}

          {tab==="features"&&<motion.div role="tabpanel" id="pkg-panel-features" aria-labelledby="pkg-tab-features" key="features" initial={{opacity:0}} animate={{opacity:1}} transition={{duration:0.12}} style={formBox} className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div><h3 className="text-sm font-bold" style={{color:B.black}}>مميزات الرحلة</h3>
                <p className="text-xs mt-0.5" style={{color:B.muted}}>نصّ الميزة وأيقونة اختيارية — لا أكثر. تظهر للعميل في صفحة الباقة.</p></div>
              <button onClick={addFeat} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer"
                style={{background:B.fill,border:`1px solid ${B.border}`,color:"#8a6a08"}}><Plus size={12}/>إضافة</button>
            </div>
            <AnimatePresence>{form.features.map((f,fi)=>(
              <motion.div key={f.id} initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}} className="flex gap-2 items-center">
                <div className="flex flex-col gap-0.5 flex-shrink-0">
                  <button onClick={()=>moveFeat(fi,-1)} disabled={fi===0} className="w-7 h-4 flex items-center justify-center rounded cursor-pointer"
                    style={{background:B.fill,border:`1px solid ${B.border}`,color:B.text2,opacity:fi===0?0.35:1}} aria-label="تقديم الميزة" title="تقديم الميزة"><ChevronUp size={11}/></button>
                  <button onClick={()=>moveFeat(fi,1)} disabled={fi===form.features.length-1} className="w-7 h-4 flex items-center justify-center rounded cursor-pointer"
                    style={{background:B.fill,border:`1px solid ${B.border}`,color:B.text2,opacity:fi===form.features.length-1?0.35:1}} aria-label="تأخير الميزة" title="تأخير الميزة"><ChevronDown size={11}/></button>
                </div>
                <FeatureIconPicker value={f.icon} onChange={k=>updFeat(f.id,"icon",k)}/>
                <input className={`${inp} flex-1`} style={{borderColor:B.border,background:"#fff",color:B.black,fontFamily:"inherit"}}
                  value={f.text} placeholder="ما الذي يشمله هذه الباقة؟" onChange={e=>updFeat(f.id,"text",e.target.value)}/>
                <button aria-label="حذف الميزة" title="حذف الميزة" onClick={()=>delFeat(f.id)} className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer flex-shrink-0"
                  style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}><X size={12}/></button>
              </motion.div>
            ))}</AnimatePresence>
            {form.features.length===0&&<div className="flex flex-col items-center py-16 rounded-2xl" style={{border:`2px dashed ${B.border}`,color:B.muted}}><ListChecks size={28} style={{opacity:0.3,marginBottom:8}}/><p className="text-sm">لم تُضف مميزات بعد</p></div>}
            {form.features.length>0&&(
              <div className="mt-3 p-5 rounded-2xl" style={{background:"#fff",border:`1px solid ${B.border}`}}>
                <h4 className="text-xs font-bold mb-3" style={{color:B.muted}}>معاينة — كما يراها العميل</h4>
                <div className="flex flex-wrap gap-2">
                  {form.features.map(f=>{
                    const Icon=pkgFeatureIcon(f.icon);
                    return (
                    <span key={f.id} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full"
                      style={{background:B.fill,border:`1px solid ${B.border}`,color:B.text3}}>
                      {Icon&&<Icon size={13} style={{color:B.gold}}/>}{f.text||"—"}
                    </span>
                    );
                  })}
                </div>
              </div>
            )}
          </motion.div>}

          {tab==="policies"&&<motion.div role="tabpanel" id="pkg-panel-policies" aria-labelledby="pkg-tab-policies" key="policies" initial={{opacity:0}} animate={{opacity:1}} transition={{duration:0.12}} style={formBox} className="flex flex-col gap-3">
            <div>
              <h3 className="text-sm font-bold" style={{color:B.black}}>سياسات الباقة</h3>
              <p className="text-xs mt-0.5" style={{color:B.muted}}>سطرٌ لكل سياسة. كل سطرٍ يصير بنداً مستقلاً عند العميل، بترتيب الأسطر نفسه.</p>
            </div>
            {/* حقلٌ واحد لا حقلٌ لكل بند: «إضافة سياسة» ثم كتابة ثم إضافة
                ثانية — ضغطتان لكل سطر، وثمانُ سياساتٍ ستّ عشرة ضغطة قبل
                أول حرف. واللصق من ملف الشروط كان مستحيلاً.

                القيمة تُشتقّ من المصفوفة مباشرةً بلا حالةٍ محلية: split ثم
                join دورةٌ مطابقة تماماً، فما يكتبه الموظف يعود كما كتبه —
                بأسطره الفارغة وهو في منتصف الكتابة. والتشذيب عند الخروج من
                الحقل لا مع كل حرف، وإلّا مُحي السطر الفارغ تحت إصبعه. */}
            <textarea
              className="w-full border rounded-2xl px-4 py-3 text-sm focus:outline-none"
              style={{...ist,minHeight:280,resize:"vertical",lineHeight:2.1}}
              value={(form.policies??[]).join("\n")}
              onChange={e=>set("policies",e.target.value.split("\n"))}
              onBlur={e=>{
                const clean=e.target.value.split("\n").map(line=>line.trim()).filter(Boolean);
                const now=form.policies??[];
                if(clean.length!==now.length||clean.some((line,i)=>line!==now[i])) set("policies",clean);
              }}
              placeholder={"إلغاء مجاني قبل 48 ساعة من موعد الرحلة\nالتأخر عن موعد الانطلاق لا يستوجب تعويضاً\nيلزم إحضار الهوية الوطنية أو الإقامة سارية المفعول"}/>
            {(()=>{ const live=(form.policies??[]).filter(x=>x.trim()); return (
              <>
                <div className="flex items-center gap-1.5 text-xs" style={{color:B.muted}}>
                  <ListChecks size={13} style={{color:live.length?B.gold:B.muted}}/>
                  {live.length?<><b style={{color:B.text2}}>{live.length}</b> سياسة ستظهر للعميل</>:"لم تُكتب سياسات بعد — الأسطر الفارغة لا تُحسب."}
                </div>
                {live.length>0&&(
                  <div className="mt-1 p-5 rounded-2xl" style={{background:"#fff",border:`1px solid ${B.border}`}}>
                    <h4 className="text-xs font-bold mb-3" style={{color:B.muted}}>معاينة — كما يراها العميل</h4>
                    <div className="flex flex-col gap-2">
                      {live.map((line,i)=>(
                        <div key={i} className="flex items-start gap-2.5">
                          <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                            style={{background:B.fill,border:`1px solid ${B.border}`,color:B.text2,fontSize:10,fontWeight:900}}>{i+1}</span>
                          <span className="text-sm leading-relaxed" style={{color:B.text3}}>{line.trim()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ); })()}
          </motion.div>}

          {tab==="reviews"&&<motion.div role="tabpanel" id="pkg-panel-reviews" aria-labelledby="pkg-tab-reviews" key="reviews" initial={{opacity:0}} animate={{opacity:1}} transition={{duration:0.12}} style={formBox} className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-sm" style={{color:B.black}}>آراء المعتمرين</p>
                <p className="text-xs mt-0.5" style={{color:B.muted}}>الاسم والتقييم من 5 والرأي، مع صورة اختيارية.</p>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer"
                  style={{background:"#fff",border:`1px solid ${B.border}`,color:B.text2}}>
                  <ImagePlus size={12}/>استيراد آراء
                  <input type="file" accept=".csv,text/csv" className="hidden" onChange={importReviews}/>
                </label>
                <button onClick={addReview} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer"
                  style={{background:B.fill,border:`1px solid ${B.border}`,color:"#8a6a08"}}><Plus size={12}/>إضافة</button>
              </div>
            </div>
            <p className="text-xs -mt-2" style={{color:B.muted}}>CSV: الاسم، التقييم، الرأي. الصور يمكن إضافتها لاحقاً لكل رأي.</p>
            <AnimatePresence>{form.reviews.map(rv=>(
              <motion.div key={rv.id} initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}
                className="rounded-2xl p-4 flex gap-3" style={{border:`1px solid ${B.border}`,background:"#fff"}}>
                <div className="flex-1 flex flex-col gap-2">
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-2">
                    <Field label="اسم العميل"><input className="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none" style={{borderColor:B.border,background:"#fff",color:B.black,fontFamily:"inherit"}}
                      value={rv.name} placeholder="خالد" onChange={e=>updReview(rv.id,"name",e.target.value)}/></Field>
                    <Field label="التقييم من 5"><div className="flex items-center gap-1.5 px-3 rounded-xl" style={{border:`1px solid ${B.border}`,background:"#fff"}}>
                      <Star size={13} style={{color:B.gold,flexShrink:0}}/>
                      <NumericInput min={1} max={5} step={1} value={rv.rating ?? 5} placeholder="5"
                        onValueChange={v=>updReview(rv.id,"rating",Math.min(5,Math.max(1,Number(v)||1)))}
                        className="text-sm focus:outline-none" style={{width:52,border:"none",background:"transparent",color:B.black,direction:"ltr",textAlign:"center",fontFamily:"inherit"}}/>
                      <span className="text-xs" style={{color:B.muted,flexShrink:0}}>/5</span>
                    </div></Field>
                  </div>
                  <Field label="نص الرأي"><textarea className="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none" style={{borderColor:B.border,background:"#fff",color:B.black,fontFamily:"inherit",resize:"vertical"}}
                    rows={2} value={rv.text} placeholder="الرحلة كانت ممتازة والتنظيم رائع." onChange={e=>updReview(rv.id,"text",e.target.value)}/></Field>
                  {rv.image&&(
                    <div className="relative rounded-xl overflow-hidden self-start" style={{border:`1px solid ${B.border}`,width:96,height:96}}>
                      <img src={rv.image} alt="صورة مرفقة" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                      <button aria-label="إزالة صورة الرأي" title="إزالة صورة الرأي" onClick={()=>updReview(rv.id,"image",undefined)} className="absolute top-1 left-1 w-6 h-6 rounded-lg flex items-center justify-center cursor-pointer"
                        style={{background:"rgba(190,38,38,0.92)",color:"#fff",border:"none"}}><X size={12}/></button>
                    </div>
                  )}
                  <label className="flex items-center gap-2 self-start px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
                    style={{background:B.fill,color:"#8a6a08",border:`1px solid ${B.border}`}}>
                    <ImagePlus size={12}/>{rv.image?"تغيير الصورة":"صور — اختياري"}
                    <input type="file" accept="image/*" className="hidden" onChange={onPickMedia("package-reviews",url=>{saveImmediately();updReview(rv.id,"image",url);})}/>
                  </label>
                </div>
                <button aria-label="حذف الرأي" title="حذف الرأي" onClick={()=>delReview(rv.id)} className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer mt-0.5"
                  style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}><X size={12}/></button>
              </motion.div>
            ))}</AnimatePresence>
            {form.reviews.length===0&&<div className="flex flex-col items-center py-16 rounded-2xl" style={{border:`2px dashed ${B.border}`,color:B.muted}}><Star size={28} style={{opacity:0.3,marginBottom:8}}/><p className="text-sm">لا توجد آراء</p></div>}
          </motion.div>}

          {tab==="settings"&&<motion.div role="tabpanel" id="pkg-panel-settings" aria-labelledby="pkg-tab-settings" key="settings" initial={{opacity:0}} animate={{opacity:1}} transition={{duration:0.12}} style={formBox} className="flex flex-col gap-4">
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
                  /* الحالة تُقال نصّاً لا لوناً وحده.

                     الشكوى كانت حرفية: «النص وحده لا يبيّن هل تأكيد يدوي
                     مفعّل أم لا». المفتاح الأخضر يميّزه من يميّز الأخضر
                     من الرمادي وهو ينظر إلى ستّة مفاتيح متجاورة على شاشة
                     ساطعة — وقرار «تأكيد يدوي» يمسّ كل طلب يصل. */
                  return (
                    <button key={s.key} onClick={()=>setSetting(s.key,!on as any)}
                      role="switch" aria-checked={on} aria-label={`${s.label}: ${on?"مفعّل":"متوقف"}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl cursor-pointer text-right"
                      style={{background:on?"rgba(30,122,68,0.06)":B.fill,border:`1px solid ${on?"#C4E4CE":B.border}`}}>
                      <span className="text-sm font-semibold" style={{color:B.black}}>{s.label}</span>
                      <span className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs font-extrabold px-2 py-0.5 rounded-md"
                          style={{background:on?"#E3F3E8":"#EEECEA",color:on?"#1E7A44":"#5C554E"}}>{on?"مفعّل":"متوقف"}</span>
                        <span className="relative w-11 h-6 rounded-full transition-colors block"
                          style={{background:on?"#1E7A44":"#C9C2BA"}}>
                          <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all block"
                            style={{right:on?"0.25rem":"calc(100% - 1.5rem)"}}/>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 mt-4 pt-4" style={{borderTop:`1px solid ${B.border}`}}>
                <div>
                  <Field label="مهلة الدفع (بالساعات)">
                    <NumericInput min={0} className={inp} style={{...ist,direction:"ltr",textAlign:"right"}}
                      value={settings.paymentDeadlineHours} onValueChange={v=>setSetting("paymentDeadlineHours",Number(v))}/>
                  </Field>
                  {/* ثلاث نسخ مستقلّة عن قصد: النظام ← الباقة (لحظة الإنشاء)
                      ← الرحلة (لحظة الإطلاق). تعديل هنا لا يمسّ رحلةً
                      انطلقت وأُرسل رابط دفعها بمهلةٍ أُعلنت للعميل. */}
                  <p className="text-xs mt-1.5" style={{color:B.muted}}>
                    وُرِثت من إعدادات النظام عند إنشاء الباقة. تعديلها هنا يسري على الرحلات الجديدة فقط — الرحلات المنطلقة تحتفظ بمهلتها.
                  </p>
                </div>
                <div>
                  <Field label="الحد الأقصى للمعتمرين في الطلب الواحد">
                    <NumericInput min={1} className={inp} style={{...ist,direction:"ltr",textAlign:"right"}}
                      value={settings.maxPilgrims} onValueChange={v=>setSetting("maxPilgrims",Number(v))}/>
                  </Field>
                </div>
              </div>
            </div>
            <div className="mt-2" style={{height:1,background:B.border}}/>
            <PackageDangerZone pkg={form} canWrite={mayWrite} isAdmin={isAdmin}
              onArchive={archivePkg} onPermanentDelete={deletePkg}/>
          </motion.div>}
        </AnimatePresence>
        </div>
      </div>
      {/* حارس مغادرة التعديلات غير المحفوظة. */}
      <AnimatePresence>
        {leaving&&<LeaveGuard saving={ed.state==="saving"}
          onSaveAndLeave={()=>{void ed.save(commit).then(ok=>{ if(ok){setLeaving(false);onBack();} else setLeaving(false); });}}
          onDiscard={()=>{setLeaving(false);onBack();}}
          onCancel={()=>setLeaving(false)}/>}
      </AnimatePresence>
    </div>
  );
}

/* ─── Packages Page (list) ─── */
export function PackagesPage({transports,hotels,onMenuOpen}:{transports:Transport[];hotels:Hotel[];onMenuOpen?:()=>void}) {
  const packages=useStore(s=>s.packages); const setPackages=useStore(s=>s.setPackages);
  const [search,setSearch]=useState("");
  /* التصفية على القيمة الساكنة لا على كل ضغطة مفتاح. */
  const query = useDebounced(search);
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
  /* الإضافة تنتظر القاعدة قبل أن تُغلق النافذة وتفتح صفحة الإكمال:
     الإغلاق التفاؤلي كان يفتح صفحة تفاصيل لباقةٍ رفضتها القاعدة، فيملأ
     الموظف تبويباتها السبعة ثم يكتشف عند أول حفظ أنها غير موجودة. */
  async function handleSaveNew(p:Pkg):Promise<boolean>{
    clearSyncError();
    setPackages(prev=>[...prev,{...p,order:prev.length+1}]);
    const err=await flushSync();
    if(err){ toast.error("تعذّر إنشاء الباقة",{description:err,duration:9000}); return false; }
    setShowAdd(false); setDetailId(p.id);
    return true;
  }
  /* الحفظ يبقي الموظف في الصفحة: كان يخرج به إلى القائمة عند كل ضغطة،
     فحفظُ خطوةٍ وسط الإكمال يعني العودة والدخول من جديد. */
  function handleSaveDetail(p:Pkg){setPackages(prev=>prev.map(x=>x.id===p.id?p:x));}

  const detail = packages.find(p=>p.id===detailId);
  if(detail) return <PackageDetail pkg={detail} transports={transports} hotels={hotels} onSave={handleSaveDetail} onBack={()=>setDetailId(null)}/>;

  const filtered=packages
    .filter(p=>(!query||p.name.includes(query)||p.id.toLowerCase().includes(query.toLowerCase()))&&(destFilter==="all"||p.destination===destFilter)&&(statusFilter==="all"||p.status===statusFilter))
    .sort((a,b)=>a.order-b.order);

  const stats={total:packages.length,active:packages.filter(p=>p.status==="active").length,mecca:packages.filter(p=>p.destination==="مكة").length,both:packages.filter(p=>p.destination==="مكة والمدينة").length};
  const fb=(on:boolean)=>({padding:"6px 14px",borderRadius:999,fontSize:13,fontWeight:700,cursor:"pointer" as const,border:`1px solid ${on?B.gold:B.border}`,background:on?B.gold:"#fff",color:on?B.black:B.text2,transition:"all 0.15s"});

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{background: B.bg}}>
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
        <EntityGate entity="packages" label="الباقات" skeleton="cards">
        {filtered.length===0
          ?<motion.div initial={{opacity:0}} animate={{opacity:1}} className="flex flex-col items-center justify-center py-24 rounded-2xl" style={{background:"#fff",border:`1px solid ${B.border}`}}>
            <Package size={44} style={{opacity:0.2,color:B.gold,marginBottom:12}}/><p className="font-bold" style={{color:B.black}}>لا توجد باقات مطابقة</p>
          </motion.div>
          :<div className="rounded-2xl overflow-hidden" style={{background:"#fff",border:`1px solid ${B.border}`}}>
            {/* Table header */}
            <div className="grid text-xs font-bold" style={{gridTemplateColumns:"60px 1fr 120px 100px 80px 110px 200px",background:B.fill,color:B.muted,borderBottom:`1px solid ${B.border}`}}>
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
                  onMouseEnter={e=>(e.currentTarget.style.background=B.fill)} onMouseLeave={e=>(e.currentTarget.style.background="#fff")}>
                  {/* Order */}
                  <div className="px-3 py-3 flex items-center gap-1" onClick={e=>e.stopPropagation()} style={{cursor:"default"}}>
                    <span className="text-xs font-bold w-5 text-center" style={{color:B.muted}}>{p.order}</span>
                    <div className="flex flex-col gap-0.5">
                      <button aria-label="تقديم الباقة في ترتيب العرض" title="تقديم الباقة في ترتيب العرض" onClick={()=>move(p.id,-1)} disabled={idx===0} className="w-5 h-4 flex items-center justify-center rounded cursor-pointer"
                        style={{background:"#fff",border:`1px solid ${B.border}`,color:B.muted,opacity:idx===0?0.3:1}}><ChevronUp size={9}/></button>
                      <button aria-label="تأخير الباقة في ترتيب العرض" title="تأخير الباقة في ترتيب العرض" onClick={()=>move(p.id,1)} disabled={idx===filtered.length-1} className="w-5 h-4 flex items-center justify-center rounded cursor-pointer"
                        style={{background:"#fff",border:`1px solid ${B.border}`,color:B.muted,opacity:idx===filtered.length-1?0.3:1}}><ChevronDown size={9}/></button>
                    </div>
                  </div>
                  {/* Name */}
                  <div className="px-4 py-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0"
                      style={{background:B.fill,border:`1px solid ${B.border}`}}>
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
                  {/* Status — والشارة الحمراء لمنشورةٍ ينقصها شرط إلزامي:
                       هذه الحالة يراها العميل الآن، فلا تُكتشف بفتح الباقة. */}
                  <div className="px-3 py-3 flex flex-col gap-1 items-start">
                    <StatusBadge status={p.status} entity="package"/>
                    {(()=>{const r=readiness(p);return p.status==="active"&&r.blockers.length>0
                      ? <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                          title={`ينقصها: ${r.blockers.map(b=>b.label).join("، ")}`}
                          style={{background:"#FBE6E6",color:"#BE2626"}}><AlertTriangle size={10}/>ناقصة</span>
                      : null;})()}
                  </div>
                  {/* Actions */}
                  <div className="px-4 py-3 flex gap-2" onClick={e=>e.stopPropagation()} style={{cursor:"default"}}>
                    <button onClick={()=>setDetailId(p.id)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer"
                      style={{background:B.gold,color:B.black,border:"none"}}>تفاصيل <ArrowRight size={11}/></button>
                    {/* النسخة تولد مسودة ولو كان الأصل منشوراً: نسخةٌ نشطة
                        تظهر للعملاء فوراً باسم «(نسخة)» وأسعار لم تُراجَع. */}
                    <button onClick={()=>{const dup:Pkg={...p,id:newId("PKG"),name:p.name+" (نسخة)",order:packages.length+1,status:"draft"};setPackages(prev=>[...prev,dup]);}}
                      aria-label="نسخ الباقة كمسودة" title="نسخ الباقة كمسودة"
                      className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold cursor-pointer"
                      style={{background:"#fff",border:`1px solid ${B.border}`,color:B.text2}}><Copy size={11}/></button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        }
        </EntityGate>
      </main>
      <AnimatePresence>
        {showAdd&&<AddPkgModal onSave={handleSaveNew} onClose={()=>setShowAdd(false)}/>}
      </AnimatePresence>
    </div>
  );
}
