import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Building2, MapPin, Star, Plus, Trash2, X, Check, Package, Search, ChevronRight, ImagePlus, ChevronUp, ChevronDown, Copy, ArrowRight, CalendarDays, ListChecks, Archive, ArchiveRestore, ChevronLeft, Eye, AlertTriangle, Info, BookOpen, BedDouble, Bus as BusIcon, Plane, RotateCw, Upload, SearchX } from "lucide-react";
import { B, TONE, ELEV } from "@/lib/theme";
import { SAR, sar, sarNumber } from "@/lib/money";
import { cleanHotelName, hotelDisplayName } from "@/lib/hotelName";
import { linkableHotels, isPublished } from "@/features/hotels/readiness";
import { useDebounced } from "@/lib/useDebounced";
import { EntityGate, EmptyState } from "@/components/States";
import { linkableTransports } from "@/features/transport/readiness";
import { TabStrip, TabPanel } from "@/components/Tabs";
import { Spinner } from "@/components/Spinner";
import { Button, IconButton, Input, Textarea, Badge, Note, FilterChips, Segmented, Switch, Modal, ModalIcon } from "@/components/ui";
import type { Hotel, Transport, PkgStatus, PkgDest, ProgramStage, RoomPrice, PkgReview, PkgFeature, Pkg, TripSettings, TravellerType } from "@/types";
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
import { useEditor, type SaveState } from "@/lib/useEditor";
import { useConfirmDiscard } from "@/lib/useUnsavedGuard";
import { useInternalSettings } from "@/data/useSettings";
import { readiness, isSellableTier, type PkgTab, type Readiness } from "./readiness";
/* ألوان الجمهور هي ألوان بطاقات «من المسافر؟» في واجهة العميل:
   من يضبط الباقة يرى نفس الإشارة التي يراها المشتري. */
const AUD_ON:Record<string,{fill:string;line:string;ink:string}>={
  male_solo:{fill:"#E9F1FA",line:"#2E6DB4",ink:"#2E6DB4"},
  female_solo:{fill:"#FBECF2",line:"#C2557E",ink:"#C2557E"},
  family:{fill:"#F7EEDC",line:"#B7893F",ink:"#8C6423"},
};
import {
  HOUSING_KINDS, AUDIENCE, ALL_AUDIENCE, audienceOf, audienceSummary,
  tierLabel, typeOfKind, kindOf, newTier, BEDS_MIN, BEDS_MAX, type HousingKind,
} from "@/data/housing";
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

/* الوجهة والنوع شارتان هادئتان بلا رمزٍ تعبيري: الاسم يكفي، واللون يفرّق
   الوجهة المزدوجة عن المفردة ورحلة VIP عن غيرها — لا أكثر. */
export function destBadge(d:string) {
  return <Badge tone={d==="مكة والمدينة"?"info":"neutral"}>{d}</Badge>;
}
export function typeBadge(t:string) {
  return <Badge tone={t.includes("VIP")?"gold":"neutral"}>{t}</Badge>;
}

type CopySection = "program" | "features" | "policies" | "reviews";
const COPY_SECTION_LABEL: Record<CopySection, string> = {
  program: "تفاصيل البرنامج", features: "مميزات الرحلة", policies: "السياسات", reviews: "الآراء",
};

/* استيراد القسم المقصود وحده يحفظ هوية الباقة الجديدة: لا ننقل الفندق
   أو السعر أو الغرف عرضاً، بل النصوص المتشابهة فقط التي يكررها الفريق. */
function CopyFromPackageModal({ section, sources, onImport, onClose }: {
  section: CopySection; sources: Pkg[];
  onImport: (source: Pkg, mode: "replace" | "append") => void; onClose: () => void;
}) {
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? "");
  const source = sources.find(p => p.id === sourceId);
  const count = source ? ({
    program: source.program.filter(s => !s.archived).length,
    features: source.features.length,
    policies: source.policies.filter(x => x.trim()).length,
    reviews: source.reviews.length,
  } as Record<CopySection, number>)[section] : 0;
  const label = COPY_SECTION_LABEL[section];
  const off = !source || count === 0;
  return (
    <Modal open onClose={onClose} width={480}
      title={`استيراد ${label}`}
      sub="اختر باقةً جاهزة. لا تُنسخ الأسعار أو الغرف أو الفندق."
      icon={<ModalIcon tone="neutral"><Copy size={18} /></ModalIcon>}
      footer={sources.length ? <>
        <Button variant="primary" disabled={off} onClick={() => source && onImport(source, "replace")}>استبدال محتوى القسم</Button>
        <Button variant="secondary" disabled={off} onClick={() => source && onImport(source, "append")}>إضافة إلى الموجود</Button>
      </> : <Button variant="secondary" onClick={onClose}>إغلاق</Button>}>
      {sources.length ? <>
        <Field label="الباقة المصدر"><AppSelect value={sourceId} onChange={setSourceId} options={sources.map(p => ({ value: p.id, label: `${p.name || p.id} · ${p.destination}` }))} /></Field>
        <Note tone="neutral" className="mt-3">
          سيُنسخ <b style={{ color: B.black }}>{count}</b> {section === "program" ? "مرحلة" : section === "features" ? "ميزة" : section === "policies" ? "سياسة" : "رأي"} من <b style={{ color: B.black }}>{source?.name || "الباقة المختارة"}</b>.
        </Note>
        <p className="ui-hint">«استبدال» يحذف محتوى هذا القسم في الباقة الحالية فقط؛ لا يمس الباقة المصدر.</p>
      </> : <EmptyState compact icon={<Package size={22} />} title="لا باقة أخرى بعد" note="لا توجد باقة أخرى يمكن الاستيراد منها بعد." />}
    </Modal>
  );
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
    transportId:"",hotelId:"",features:[],policies:[],
  });
  const requestClose=useConfirmDiscard(form,onClose);
  const set=<K extends keyof typeof form>(k:K,v:(typeof form)[K])=>setForm(f=>({...f,[k]:v}));
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
    <Modal open onClose={requestClose} width={560}
      title="إضافة باقة جديدة"
      sub={<>تُحفظ الباقة <b>مسودة</b> ولا تظهر للعملاء. بعد الحفظ تُفتح صفحة الإكمال (الصور، البرنامج، الغرف والأسعار، المميزات، السياسات) — ويصبح النشر متاحاً حين تكتمل الشروط.</>}
      icon={<ModalIcon tone="gold"><Package size={19}/></ModalIcon>}
      footer={<>
        <Button variant="primary" loading={saving} disabled={!nameOk} icon={<Check size={16}/>} onClick={()=>void handleSave()}>
          {saving?"جارٍ الحفظ…":"حفظ الآن"}
        </Button>
        <Button variant="secondary" onClick={requestClose}>إلغاء</Button>
        {!nameOk&&<span className="hidden sm:inline text-xs" style={{color:B.muted}}>اسم الباقة مطلوب</span>}
      </>}>
      <div className="flex flex-col gap-4">
        <div><Field label={<>اسم الباقة<span className="ui-req">*</span></>}>
               <Input value={form.name} placeholder="مثال: عمرة مكة 3 أيام"
                 onChange={e=>set("name",e.target.value)} onKeyDown={e=>{if(e.key==="Enter") void handleSave();}}/>
             </Field></div>
        <div><Field label="الوجهة" hint="نوع المنتج يُحدَّد تلقائياً من المواصلة المرتبطة في تفاصيل الباقة.">
               <AppSelect value={form.destination} onChange={v=>set("destination",v as PkgDest)} options={DEST_OPTS.map(o=>({value:o,label:o}))}/>
             </Field></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Field label="الأيام">
                 <NumericInput min={1} className="ui-input" value={form.days} onValueChange={v=>set("days",Number(v))}/>
               </Field></div>
          <div><Field label="الليالي">
                 <NumericInput min={0} className="ui-input" value={form.nights} onValueChange={v=>set("nights",Number(v))}/>
               </Field></div>
        </div>
        {/* الليالي تحدّد وجود السكن — لا علمَ منفصلاً يتعارض معها */}
        <Note tone="neutral" icon={<Info size={15}/>}>
          {form.nights>0
            ? <>الباقة تشمل سكناً ({form.nights} ليالٍ) — سيُطلب ربط فندق وخيار غرفة واحد على الأقل قبل النشر.</>
            : <>صفر ليالٍ = <b>مواصلات فقط</b> بلا سكن — لن يُطلب فندق ولا غرف.</>}
        </Note>
      </div>
    </Modal>
  );
}
/* إغلاق قائمةٍ منبثقة صغيرة بالنقر خارجها أو بـEscape — مستمعٌ على
   المستند لا ستارةٌ شفّافة تغطّي الشاشة: الستارة كانت تبتلع أول نقرةٍ
   على أي حقلٍ آخر، فيُضغط مرّتين. */
function useDismiss(open:boolean,close:()=>void) {
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!open) return;
    const onDown=(e:MouseEvent)=>{ if(ref.current&&!ref.current.contains(e.target as Node)) close(); };
    const onKey=(e:KeyboardEvent)=>{ if(e.key==="Escape") close(); };
    document.addEventListener("mousedown",onDown);
    document.addEventListener("keydown",onKey);
    return ()=>{ document.removeEventListener("mousedown",onDown); document.removeEventListener("keydown",onKey); };
  });
  return ref;
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
  const box=useDismiss(open,()=>setOpen(false));
  return (
    <div ref={box} className="relative flex-shrink-0">
      <button type="button" onClick={()=>setOpen(o=>!o)} title="اختر أيقونة الميزة" aria-label="اختر أيقونة الميزة" aria-expanded={open}
        className="ui-input flex items-center justify-center gap-1 cursor-pointer"
        style={{width:52,padding:0,color:CurIcon?B.text3:B.muted}}>
        {CurIcon?<CurIcon size={16}/>:<span className="text-xs font-bold">—</span>}
        <ChevronDown size={12} style={{opacity:0.55}}/>
      </button>
      {open&&(
        <>
          <div className="absolute mt-1 rounded-xl p-2"
            style={{zIndex:41,top:"100%",insetInlineStart:0,width:196,background:B.surface,border:`1px solid ${B.border}`,boxShadow:ELEV[3]}}>
            <div className="grid grid-cols-4 gap-1">
              {PKG_FEATURE_CATALOG.map(({id,label,Icon})=>{
                const active=id===current;
                return (
                  <button key={id} type="button" title={label} aria-label={label} aria-pressed={active}
                    onClick={()=>{onChange(id);setOpen(false);}}
                    className="h-10 rounded-lg flex items-center justify-center cursor-pointer"
                    style={{background:active?B.ink:B.fill,color:active?B.onInk:B.text2,border:`1px solid ${active?B.ink:B.border}`}}>
                    {Icon?<Icon size={16}/>:<span className="text-xs font-bold">بلا</span>}
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
   العربي: من يريد رمز الطيران يكتب «طيران» ولا يفتّش شبكةً من أربعين.

   الرمز هنا تعبيريٌّ عن قصد (استثناء القاعدة): يُخزَّن نصّاً في بيانات
   الباقة ويُرسم كما هو في صفحة المستفيد. */
function StageIconPicker({value,onChange,id}:{value:string;onChange:(icon:string)=>void;id?:string}) {
  const [open,setOpen]=useState(false);
  const [q,setQ]=useState("");
  const term=q.trim();
  const groups=PROGRAM_STAGE_CATALOG
    .map(g=>({...g,items:term?g.items.filter(i=>i.label.includes(term)):g.items}))
    .filter(g=>g.items.length>0);
  const close=()=>{setOpen(false);setQ("");};
  const box=useDismiss(open,close);
  return (
    <div ref={box} className="relative">
      <button type="button" id={id} onClick={()=>setOpen(o=>!o)} aria-expanded={open}
        title={stageIconLabel(value)||"اختر أيقونة المرحلة"} aria-label="اختر أيقونة المرحلة"
        className="ui-input flex items-center gap-2 cursor-pointer">
        <span style={{fontSize:18,lineHeight:1}}>{value||DEFAULT_STAGE_ICON}</span>
        <span className="text-sm flex-1 text-start truncate" style={{color:B.text2}}>{stageIconLabel(value)}</span>
        <ChevronDown size={16} style={{color:B.muted,flexShrink:0}}/>
      </button>
      {open&&(
        <>
          <div className="absolute mt-1 rounded-xl overflow-hidden flex flex-col"
            style={{zIndex:41,top:"100%",insetInlineStart:0,width:268,maxWidth:"calc(100vw - 32px)",background:B.surface,border:`1px solid ${B.border}`,boxShadow:ELEV[3]}}>
            <div className="p-2" style={{borderBottom:`1px solid ${B.border}`}}>
              <div className="ts-search">
                <Search size={14}/>
                <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="ابحث: فندق، وجبة، رجوع…" aria-label="ابحث عن رمز المرحلة"
                  className="ui-input ui-input--sm" style={{paddingInlineStart:34}}/>
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
                        <button key={item.icon} type="button" title={item.label} aria-label={item.label} aria-pressed={active}
                          onClick={()=>{onChange(item.icon);close();}}
                          className="h-9 rounded-lg flex items-center justify-center cursor-pointer"
                          style={{background:active?B.surface:B.fill,border:`1px solid ${active?B.black:B.border}`,boxShadow:active?`inset 0 0 0 1px ${B.black}`:"none",fontSize:17,lineHeight:1}}>
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
  /* باقةٌ مكتملة ومنشورة لا شيء يُقال لها: كل سطر فوق التبويبات يقتطع
     من مساحة العمل. الشريط يظهر حين ينقص شيء أو حين تكون الباقة غير
     منشورة — وهناك «مكتملة، جاهزة للنشر» معلومةٌ تُفيد. */
  if(r.percent===100&&status==="active") return null;
  const missing=[...r.blockers,...r.warnings];
  const full=r.percent===100;
  /* باقة منشورة تنقصها شروط: خطر قائم يراه العميل الآن، لا تذكير.
     لا تُنزَع حالتها تلقائياً — ذلك قرار الموظف — لكنها تُصرَخ به. */
  const live=status==="active"&&r.blockers.length>0;
  /* اللون للمقياس والأيقونة وحدهما، والبطاقة بيضاء: شريطٌ ملوَّن بعرض
     الصفحة فوق كل تبويب كان أعلى صوتاً من المحتوى الذي يُحرَّر تحته. */
  const tone=live?TONE.danger:full?TONE.success:TONE.warn;
  const done=r.checks.length-missing.length;
  return (
    <div className="ui-card" style={live?{borderColor:tone.line}:undefined}>
      <div className="flex items-center gap-x-4 gap-y-3 px-4 py-3 flex-wrap">
        <div className="flex items-center gap-3 flex-1" style={{minWidth:240}}>
          <span aria-hidden className="flex items-center justify-center flex-shrink-0"
            style={{width:36,height:36,borderRadius:10,background:tone.bg,color:tone.fg}}>
            {live?<AlertTriangle size={18}/>:full?<Check size={18}/>:<ListChecks size={18}/>}
          </span>
          <div className="min-w-0">
            <div className="text-sm font-bold" style={{color:B.black}}>اكتمال الباقة {r.percent}%</div>
            <div className="text-xs" style={{color:live?tone.fg:B.text2,lineHeight:1.6,marginTop:1,fontWeight:live?600:400}}>
              {live?<>منشورة وينقصها {r.blockers.length} شرطاً إلزامياً — يراها العملاء الآن.</>
               :full?"مكتملة — جاهزة للنشر."
               :r.blockers.length>0?<>ينقصها <b style={{color:B.black}}>{r.blockers.length}</b> شرطاً إلزامياً للنشر{r.warnings.length>0&&<> و{r.warnings.length} تحسيناً</>}.</>
               :<>جاهزة للنشر · {r.warnings.length} تحسيناً اختيارياً.</>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-1 sm:flex-none" style={{minWidth:180}}>
          <div className="ui-meter flex-1 sm:flex-none sm:w-[180px]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={r.percent} aria-label="اكتمال الباقة">
            <span style={{width:`${r.percent}%`,background:tone.fg}}/>
          </div>
          <span className="text-xs whitespace-nowrap" style={{color:B.muted}}>{done} من {r.checks.length}</span>
        </div>
        {missing.length>0&&(
          <Button size="sm" variant="secondary" aria-expanded={open} onClick={()=>setOpen(o=>!o)}
            iconEnd={open?<ChevronUp size={14}/>:<ChevronDown size={14}/>}>
            {open?"إخفاء النواقص":"عرض النواقص"}
          </Button>
        )}
      </div>
      {open&&missing.length>0&&(
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-2 gap-y-1 px-3 py-3 m-0 list-none" style={{borderTop:`1px solid ${B.border}`}}>
          {missing.map(c=>(
            <li key={c.key}>
              <button type="button" onClick={()=>{onGo(c.tab);setOpen(false);}}
                title="اذهب إلى تبويب الإصلاح"
                className="ui-btn ui-btn--ghost ui-btn--sm w-full" style={{justifyContent:"flex-start",height:36}}>
                <span aria-hidden className="ui-badge-dot" style={{background:c.blocking?TONE.danger.fg:TONE.warn.fg}}/>
                <span className="truncate" style={{color:B.black}}>{c.label}</span>
                <span className="text-xs flex-shrink-0" style={{color:c.blocking?TONE.danger.fg:B.muted,fontWeight:500}}>{c.blocking?"إلزامي":"اختياري"}</span>
                <ChevronLeft size={14} className="ms-auto flex-shrink-0" style={{color:B.muted}}/>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ─── تأكيد المغادرة بتعديل غير محفوظ ─── */
function LeaveGuard({onSaveAndLeave,onDiscard,onCancel,saving}:{onSaveAndLeave:()=>void;onDiscard:()=>void;onCancel:()=>void;saving:boolean}) {
  return (
    <Modal open onClose={onCancel} width={440} hideClose zIndex={70}
      title="لديك تعديلات لم تُحفظ"
      icon={<ModalIcon tone="warn"><AlertTriangle size={19}/></ModalIcon>}
      footer={
        /* ثلاثة أزرار لا تتّسع صفّاً على الجوال: الأساسي بعرض الورقة،
           والآخران يتقاسمان السطر تحته. */
        <div className="flex flex-wrap gap-2.5 w-full">
          <Button variant="primary" loading={saving} icon={<Check size={16}/>} onClick={onSaveAndLeave} className="w-full sm:w-auto">
            {saving?"جارٍ الحفظ…":"احفظ ثم اخرج"}
          </Button>
          <Button variant="danger-soft" onClick={onDiscard} className="flex-1 sm:flex-none">اخرج بلا حفظ</Button>
          <Button variant="secondary" onClick={onCancel} className="flex-1 sm:flex-none">ابقَ هنا</Button>
        </div>
      }>
      <p className="text-sm" style={{color:B.text2,lineHeight:1.8,margin:0}}>الخروج الآن يُلغي ما غيّرته في هذه الصفحة ولا يمكن استرجاعه.</p>
    </Modal>
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
  const c = tone === "warn" ? TONE.danger : tone === "clear" ? TONE.success : TONE.neutral;
  return (
    <div className="flex items-start gap-3 py-3.5" style={{ borderTop: divided ? `1px solid ${B.border}` : "none" }}>
      <span aria-hidden className="flex items-center justify-center flex-shrink-0"
        style={{ width: 32, height: 32, borderRadius: 10, background: c.bg, color: c.fg }}>
        <Icon size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-bold" style={{ color: B.black }}>{title}</span>
          <span className="text-sm font-bold" style={{ color: tone === "neutral" ? B.text3 : c.fg }}>{value}</span>
          {detail && <span className="text-xs" style={{ color: B.muted }}>{detail}</span>}
        </div>
        {note && <p className="text-xs mt-0.5 leading-relaxed m-0" style={{ color: B.text2 }}>{note}</p>}
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
      {/* بطاقةٌ بحدٍّ أحمر ورأسٍ محمرّ، مفصولةٌ بفراغٍ عن إعدادات الحجز:
          آخر ما في الصفحة، ولا يُخلط بمفتاحٍ يُقلَب فوقه. */}
      <section className="ui-card overflow-hidden mt-4" style={{ borderColor: TONE.danger.line }} aria-labelledby="pkg-danger-title">
        <div className="ui-card-head" style={{ background: TONE.danger.bg, borderBottomColor: TONE.danger.line, alignItems: "flex-start" }}>
          <div className="min-w-0">
            <h3 id="pkg-danger-title" className="ui-card-title" style={{ color: TONE.danger.fg }}>حذف الباقة</h3>
            <p className="ui-card-sub m-0 mt-0.5" style={{ color: B.text2 }}>
              الأرشفة تُخفي الباقة من العمل اليومي وتُبقي رحلاتها وحجوزاتها منسوبةً إليها. الحذف النهائي يمحوها من قاعدة البيانات.
            </p>
          </div>
        </div>

        {/* لوحة الفحص — ما يرتبط بالباقة الآن، قبل أي زرّ. */}
        <div className="px-5 pt-4">
          <div className="text-xs font-bold" style={{ color: B.muted }}>ما يرتبط بهذه الباقة في السجل الحالي</div>
        </div>
        <div className="px-5 pb-1">
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
          <div className="px-5 pb-4">
            <Note tone="warn" icon={<AlertTriangle size={15} />}>
              <div style={{ fontWeight: 600 }}>الحذف النهائي غير متاح لهذه الباقة</div>
              أرشِفها بدلاً منه: تُخفى من العمل اليومي وتبقى رحلاتها وحجوزاتها مقروءةً منسوبةً إليها.
            </Note>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2.5 px-5 py-4" style={{ borderTop: `1px solid ${B.border}`, background: B.fill }}>
          <Button variant="secondary" icon={<Archive size={16} />} onClick={() => setDialog("archive")}>أرشفة الباقة</Button>
          {isAdmin && (
            <Button variant="danger-soft" icon={<Trash2 size={16} />} onClick={() => setDialog("delete")}
              title={blockers.length ? "الحذف غير متاح — الباقة مرتبطة بغيرها" : "حذف الباقة نهائياً"}
              style={blockers.length ? { opacity: 0.6 } : undefined}>
              حذف نهائي
            </Button>
          )}
          <span className="text-xs" style={{ color: B.muted }}>
            {isAdmin ? "كلا الإجراءين يطلب سبباً يُحفظ في سجل التدقيق." : "الحذف النهائي لمدير النظام وحده."}
          </span>
        </div>
      </section>

      {dialog === "archive" && (
        <DeleteDialog onCancel={() => setDialog(null)}
          onConfirm={reason => { onArchive(reason); setDialog(null); }} />
      )}
      {dialog === "delete" && (
        <PermanentDeleteDialog name={pkg.name || pkg.id} label="الباقة" blockers={blockers} busy={busy}
          onConfirm={runDelete} onCancel={() => !busy && setDialog(null)} />
      )}
    </>
  );
}
/* ─── قطعتان يبني بهما المحرّر ─── */
/* قسمٌ في لوحة تبويب: بطاقةٌ برأسٍ فيه العنوان وسطرُه التوضيحي وأفعاله.
   كان كل لوحٍ يرسم بطاقته بيده — حشوةٌ هنا ١٦ وهناك ٢٠، وعنوانٌ داخل
   البطاقة مرّةً وفوقها مرّة — فيتبدّل شكل الصفحة مع كل تبويب. */
function Section({title,sub,step,actions,children,flush=false,id}:{
  title:React.ReactNode; sub?:React.ReactNode;
  /** رقم الخطوة في تبويب الأسعار — يُقرأ التدفّق من أعلى إلى أسفل. */
  step?:number;
  actions?:React.ReactNode; children:React.ReactNode;
  /** بلا حشوة — لجدولٍ أو قائمةٍ تلتصق بحواف البطاقة. */
  flush?:boolean; id?:string;
}) {
  return (
    <section className={flush?"ui-card overflow-hidden":"ui-card"} aria-labelledby={id}>
      <div className="ui-card-head flex-wrap" style={{alignItems:"flex-start",padding:"14px 20px"}}>
        <div className="flex items-start gap-3 min-w-0 flex-1" style={{minWidth:200}}>
          {step!=null&&<span aria-hidden className="flex items-center justify-center flex-shrink-0 text-xs font-bold"
            style={{width:24,height:24,borderRadius:999,background:B.ink,color:B.onInk,marginTop:1}}>{step}</span>}
          <div className="min-w-0">
            <h3 id={id} className="ui-card-title">{title}</h3>
            {sub&&<p className="ui-card-sub m-0" style={{marginTop:2}}>{sub}</p>}
          </div>
        </div>
        {actions&&<div className="flex items-center gap-2 flex-wrap">{actions}</div>}
      </div>
      <div className={flush?undefined:"p-4 md:p-5 flex flex-col gap-4"}>{children}</div>
    </section>
  );
}

/* حالة الحفظ التلقائي — سطرٌ هادئ بجوار العنوان لا حبّةٌ ملوّنة: الحفظ
   يجري مع كل تعديل، وحبّةٌ صفراء تومض كل ثانيتين تُقرأ تحذيراً. اللون
   للفشل وحده، ومعه زرّ الإعادة. */
function SaveStatus({state,dirty,onRetry}:{state:SaveState;dirty:boolean;onRetry:()=>void}) {
  const base="inline-flex items-center gap-1.5 text-xs whitespace-nowrap";
  return (
    <span aria-live="polite" className="inline-flex items-center">
      {state==="saving"&&<span className={base} style={{color:B.muted}}><Spinner size={12} border={1.5}/>جارٍ الحفظ…</span>}
      {state==="saved"&&<span className={base} style={{color:TONE.success.fg,fontWeight:600}}><Check size={14}/>حُفظ</span>}
      {state==="error"&&<button type="button" onClick={onRetry} className={`${base} ui-btn ui-btn--link`} style={{color:TONE.danger.fg,fontSize:12}}><RotateCw size={13}/>تعذّر الحفظ — إعادة المحاولة</button>}
      {dirty&&state==="idle"&&<span className={base} style={{color:B.muted}}><span aria-hidden className="ui-badge-dot" style={{background:TONE.warn.fg}}/>سيُحفظ تلقائياً…</span>}
    </span>
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
  const [copySection,setCopySection]=useState<CopySection | null>(null);
  const setPackages=useStore(s=>s.setPackages);
  const packages=useStore(s=>s.packages);
  const {canWrite,isAdmin}=useRole();
  const mayWrite=canWrite("packages");
  const autosaveDelay = useRef(900);

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
  const updRoom=(id:string,field:keyof RoomPrice,val:any)=>set("roomPrices",form.roomPrices.map(r=>r.id===id?{...r,[field]:val}:r));

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

  const copySources = packages.filter(p => p.id !== pkg.id);
  const importFromPackage = (source: Pkg, mode: "replace" | "append") => {
    if (!copySection) return;
    if (copySection === "program") {
      const incoming = source.program.filter(s => !s.archived).map(s => ({ ...s, id: uid(), archived: false }));
      const next = mode === "replace" ? incoming : [...form.program, ...incoming];
      set("program", next.map((s, index) => ({ ...s, order: index + 1 })));
    }
    if (copySection === "features") {
      const incoming = source.features.map(f => ({ ...f, id: uid() }));
      set("features", mode === "replace" ? incoming : [...form.features, ...incoming]);
    }
    if (copySection === "policies") {
      const incoming = source.policies.filter(p => p.trim());
      set("policies", mode === "replace" ? incoming : [...form.policies, ...incoming]);
    }
    if (copySection === "reviews") {
      const incoming = source.reviews.map(r => ({ ...r, id: uid() }));
      set("reviews", mode === "replace" ? incoming : [...form.reviews, ...incoming]);
    }
    saveImmediately();
    toast.success(`تم استيراد ${COPY_SECTION_LABEL[copySection]} من «${source.name}»`);
    setCopySection(null);
  };

  const selTransport = transports.find(t=>t.id===form.transportId);
  const selHotel     = hotels.find(h=>h.id===form.hotelId);
  const TABS:{id:PkgTab;label:string}[]=[{id:"info",label:"المعلومات"},{id:"program",label:"تفاصيل البرنامج"},{id:"rooms",label:"الغرف والأسعار"},{id:"features",label:"مميزات الرحلة"},{id:"policies",label:"السياسات"},{id:"reviews",label:"الآراء"},{id:"settings",label:"الإعدادات"}];

  const saving=ed.state==="saving";
  const previewHref=`/focus/p/${encodeURIComponent(form.id)}?preview=1`;
  const previewTitle=dirty?"المعاينة تعرض آخر نسخة محفوظة — احفظ أولاً لترى تعديلاتك":"معاينة صفحة الباقة كما يراها العميل";
  /* حقائق الباقة في الشريط الداكن — ما كان يُقرأ من ثلاثة تبويبات. */
  const facts:[string,string][]=[
    ["الوجهة",form.destination],
    ["النوع",form.productType],
    ["المدة",`${form.days} أيام / ${form.nights} ليالٍ`],
  ];
  /* اللاصق تحت الرأس والتبويبات: ارتفاع الرأس ٦٨ والتبويبات ٤٤ وفراغ ١٦. */
  const STICK_TOP=128;
  /* البطاقة الصغيرة التي تعرّف بالمواصلة أو الفندق المربوط تحت قائمته. */
  const linked=(cover:string|undefined,Icon:React.FC<{size?:number}>,name:string,sub:React.ReactNode)=>(
    <div className="flex items-center gap-3 p-3 rounded-xl" style={{background:B.fill}}>
      <div className="rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0"
        style={{width:44,height:44,background:B.surface,border:`1px solid ${B.border}`,color:B.muted}}>
        {cover?<img src={cover} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<Icon size={18}/>}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-bold truncate" style={{color:B.black}}>{name}</div>
        <div className="text-xs mt-0.5" style={{color:B.muted}}>{sub}</div>
      </div>
    </div>
  );

  return (
    <div className="ts-page">
      {/* ── رأس الصفحة ── رجوعٌ واسمٌ وحالةٌ وحفظ، في سطرٍ واحد لاصق.
          كان فوقه شريطٌ بلون آخر وتحته بطاقةٌ داكنة وشريط اكتمال، كلّها
          لاصقة: ثلث الشاشة يثبت والمحرَّر يُمرَّر في ما بقي. الآن اللاصق
          هذا السطر والتبويبات، وما بينهما يمضي مع التمرير. */}
      <header className="ts-page-head px-4 md:px-8">
        {/* الخلفية تمتدّ بعرض الشاشة والمحتوى يتوسّط — كي تُحاذي حافةُ
            الرأس والتبويبات حافةَ ألواح المحتوى تحتها بالضبط. */}
        <div style={panelBox}>
          <div className="flex items-center gap-2.5 md:gap-3 h-[56px] md:h-[68px]">
            <IconButton variant="outline" label="العودة للباقات" onClick={back}><ArrowRight size={18}/></IconButton>
            <div className="min-w-0 flex-1">
              <div className="truncate" style={{fontSize:12,color:B.muted,lineHeight:1.4}}>الباقات · <bdi>{form.id}</bdi></div>
              <h1 className="ts-page-title truncate text-[17px] md:text-[20px]">{form.name||"—"}</h1>
            </div>
            <div className="hidden md:flex items-center gap-3 flex-shrink-0">
              <SaveStatus state={ed.state} dirty={dirty} onRetry={save}/>
              <StatusBadge status={form.status} entity="package"/>
              {/* المعاينة تفتح صفحة المستفيد نفسها لا نسخةً منها: نسخةٌ ثانية
                  تتفارق عن الأصل عند أول تعديل، فتُطمئن الموظف على شكلٍ لا
                  يراه أحد. تُفتح في تبويب جديد كي لا يُفقد ما لم يُحفظ. */}
              <a href={previewHref} target="_blank" rel="noopener noreferrer" title={previewTitle}
                className="ui-btn ui-btn--secondary"><Eye size={16}/><span className="xl:hidden">معاينة</span><span className="hidden xl:inline">معاينة كما يراها العميل</span></a>
            </div>
            <Button variant="primary" onClick={save} disabled={!dirty||saving} loading={saving}
              title={!dirty?"لا توجد تغييرات لحفظها":"حفظ التعديلات"}
              icon={ed.state==="error"?<RotateCw size={16}/>:<Check size={16}/>}>
              {saving?"جارٍ الحفظ…":ed.state==="error"?"إعادة المحاولة":<><span className="hidden sm:inline">حفظ الآن</span><span className="sm:hidden">حفظ</span></>}
            </Button>
          </div>
          {/* على الجوال تنزل الحالة والمعاينة سطراً — الاسم أحقّ بعرض السطر الأول. */}
          <div className="md:hidden flex items-center gap-3 h-[36px] pb-2">
            <StatusBadge status={form.status} entity="package"/>
            <SaveStatus state={ed.state} dirty={dirty} onRetry={save}/>
            <a href={previewHref} target="_blank" rel="noopener noreferrer" title={previewTitle}
              className="ui-btn ui-btn--link ms-auto" style={{fontSize:13}}><Eye size={15}/>معاينة</a>
          </div>
        </div>
      </header>

      <div className="px-4 md:px-8 pt-1 pb-4">
        <div style={panelBox} className="flex flex-col gap-3">
          {/* رسالة الفشل — تبقى حتى ينجح الحفظ أو يُلغى، لا توست يمرّ */}
          {ed.state==="error"&&ed.error&&(
            <Note tone="danger" icon={<AlertTriangle size={15}/>}>
              <b>تعذّر الحفظ:</b> {ed.error} تعديلاتك محفوظة محلياً على هذا الجهاز. أعد المحاولة عند عودة الاتصال.
            </Note>
          )}
          {/* شريط الباقة — سطحُ البنية الأسود وعليه الصورة والحقائق والسعر.
              بلا زخرفةٍ ولا تدرّج ولا رمزٍ مكان الصورة الغائبة، والأرقام
              عاجيّة لا ذهبية: الذهبي في هذه الصفحة لزرّ الحفظ وحده. */}
          <section aria-label="ملخّص الباقة" className="rounded-2xl overflow-hidden" style={{background:B.ink,color:B.onInk}}>
            <div className="flex items-center gap-4 md:gap-6 px-4 py-4 md:px-6">
              <div className="rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0 w-[72px] h-[54px] md:w-[96px] md:h-[64px]"
                style={{background:B.ink2,border:`1px solid ${B.inkLine}`,color:B.onInk3}}>
                {form.coverImage?<img src={form.coverImage} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<Package size={22}/>}
              </div>
              <dl className="hidden md:flex items-center gap-10 m-0 min-w-0">
                {facts.map(([k,v])=>(
                  <div key={k} className="min-w-0">
                    <dt style={{fontSize:12,color:B.onInk3,lineHeight:1.4}}>{k}</dt>
                    <dd className="m-0 whitespace-nowrap" style={{fontSize:15,fontWeight:600,color:B.onInk,lineHeight:1.6}}>{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="ms-auto text-end flex-shrink-0">
                <div style={{fontSize:12,color:B.onInk3,lineHeight:1.4}}>يبدأ من</div>
                <div className="whitespace-nowrap" style={{fontSize:24,fontWeight:700,lineHeight:1.2,color:ready.startsFrom>0?B.onInk:B.onInk3}}>
                  {ready.startsFrom>0?sarNumber(ready.startsFrom):"—"}
                  <span style={{fontSize:13,fontWeight:600,color:B.onInk2,marginInlineStart:5}}>{SAR}</span>
                </div>
              </div>
            </div>
            <dl className="md:hidden grid grid-cols-3 gap-3 m-0 px-4 py-3" style={{borderTop:`1px solid ${B.inkLine}`}}>
              {facts.map(([k,v])=>(
                <div key={k} className="min-w-0">
                  <dt style={{fontSize:12,color:B.onInk3,lineHeight:1.4}}>{k}</dt>
                  <dd className="m-0" style={{fontSize:13,fontWeight:600,color:B.onInk,lineHeight:1.6}}>{v}</dd>
                </div>
              ))}
            </dl>
          </section>
          {/* شريط الاكتمال — يجيب «ماذا ينقص؟» في مكانٍ واحد بدل تفرّقه */}
          <ReadinessBar r={ready} status={form.status} onGo={setTab}/>
        </div>
      </div>

      {/* Tabs — لاصقةٌ تحت الرأس، وتُمرَّر أفقياً على الجوال. خلفيتها
          مصمتة لا زجاجية: زرٌّ داكن يمرّ تحتها كان يظهر لطخةً خلف الأسماء. */}
      <div className="sticky z-10 top-[92px] md:top-[68px] px-4 md:px-8" style={{background:B.bg}}>
        <div style={panelBox}>
          <TabStrip tabs={TABS} active={tab} onChange={t=>setTab(t)} tone="onLight" idPrefix="pkg"/>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 px-4 md:px-8 pb-12 pt-5">
        <div style={panelBox}>
          {/* لا AnimatePresence حول الألواح: «انتظر خروج القديم» كان يُبقي
              التبويب السابق معروضاً لحظةً بعد الضغط. اللوح يظهر فوراً. */}
          <TabPanel id="info" idPrefix="pkg" active={tab==="info"}>
            <div className="grid gap-4 md:gap-5 pkg-two-col" style={{gridTemplateColumns:"1.45fr 1fr",alignItems:"start"}}>
            {/* LEFT */}
            <div className="flex flex-col gap-4 min-w-0">
              <Section title="المعلومات الأساسية">
                {/* الصورة الأساسية: اختيار ثم معاينة مباشرة، بلا قصّ أو تكبير. */}
                <div>
                  <div className="ui-label">الصورة الأساسية للباقة<span className="ui-req">*</span></div>
                  <div className="flex flex-col sm:flex-row gap-3">
                    {/* لا يُفرض المقاس: العرض في البطاقة يغطي الإطار تلقائياً. */}
                    <label className="relative rounded-xl overflow-hidden flex items-center justify-center cursor-pointer flex-shrink-0 w-full h-[150px] sm:w-[180px] sm:h-[120px]"
                      style={{border:form.coverImage?`1px solid ${B.border}`:`1.5px dashed ${TONE.danger.line}`,background:form.coverImage?"transparent":B.fill}}>
                      {form.coverImage
                        ? <img src={form.coverImage} alt="الصورة الأساسية للباقة" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                        : <div className="flex flex-col items-center gap-1 text-xs" style={{color:B.text2}}><ImagePlus size={22}/><span className="font-bold">ارفع الصورة الأساسية</span><span style={{color:TONE.danger.fg,fontWeight:600}}>مطلوبة للنشر</span></div>}
                      {form.coverImage&&<span className="absolute flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold"
                        style={{top:6,insetInlineStart:6,background:"rgba(20,17,14,.72)",color:B.onInk}}><Star size={12}/>أساسية</span>}
                      {form.coverImage&&<span className="absolute px-2 py-1 rounded-md text-xs font-bold"
                        style={{bottom:6,insetInlineEnd:6,background:"rgba(20,17,14,.72)",color:B.onInk}}>تغيير الصورة</span>}
                      <input type="file" accept="image/*" className="hidden"
                        onChange={onPickMedia("packages",url=>{saveImmediately();set("coverImage",url);})}/>
                    </label>
                    <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                      <p className="text-sm font-bold m-0" style={{color:B.text3}}>{form.coverImage?"معاينة الصورة الأساسية":"ارفع الصورة لعرض معاينتها هنا"}</p>
                      <p className="text-xs m-0" style={{color:B.muted}}>المقاس المقترح: 1200 × 800 بكسل (3:2)</p>
                      <p className="text-xs leading-relaxed m-0" style={{color:B.muted}}>المقاس اختياري؛ الصور المختلفة تُعرض تلقائياً داخل البطاقة مع الحفاظ على امتلاء الإطار.</p>
                    </div>
                  </div>
                </div>
                {/* الصور الفرعية — اختيار ورفع مباشر بلا قصّ. */}
                <div className="pt-4" style={{borderTop:`1px solid ${B.border}`}}>
                  <div className="ui-label" style={{marginBottom:2}}>صور فرعية <span style={{color:B.muted,fontWeight:500}}>· {gallery.length}/{PKG_GALLERY_MAX}</span></div>
                  <div className="ui-hint" style={{marginTop:0,marginBottom:10}}>رفع مباشر بلا قصّ · المقاس المقترح 1200 × 800 بكسل (3:2)</div>
                  {/* أفعال الصورة صفٌّ تحتها لا أزرارٌ بعشرين بكسل فوقها:
                      أربعة أهدافٍ متلاصقة على صورةٍ بعرض ٧٦ كانت تُخطأ باللمس،
                      وزرّ الحذف منها بجوار زرّ الترتيب. */}
                  <div className="flex flex-wrap gap-2.5">
                    {gallery.map((url,i)=>(
                      <div key={`${url}-${i}`} className="rounded-xl overflow-hidden" style={{width:132,border:`1px solid ${B.border}`,background:B.surface}}>
                        <div className="relative" style={{height:88}}>
                          <img src={url} alt={`صورة فرعية ${i+1}`} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                          <span className="absolute px-1.5 rounded text-xs font-bold" style={{top:5,insetInlineStart:5,background:"rgba(20,17,14,.72)",color:B.onInk}}>{i+1}</span>
                        </div>
                        <div className="flex items-center justify-between" style={{padding:2,borderTop:`1px solid ${B.border}`}}>
                          <IconButton size="sm" label="اجعلها الصورة الأساسية" onClick={()=>promoteGalleryImg(i)}><Star size={15}/></IconButton>
                          <IconButton size="sm" label="تقديم الصورة" onClick={()=>moveGalleryImg(i,-1)} disabled={i===0}><ChevronRight size={16}/></IconButton>
                          <IconButton size="sm" label="تأخير الصورة" onClick={()=>moveGalleryImg(i,1)} disabled={i===gallery.length-1}><ChevronLeft size={16}/></IconButton>
                          <IconButton size="sm" variant="danger" label="حذف الصورة" onClick={()=>delGalleryImg(i)}><Trash2 size={15}/></IconButton>
                        </div>
                      </div>
                    ))}
                    {gallery.length<PKG_GALLERY_MAX&&(
                      <label className="rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer text-xs font-bold"
                        style={{width:132,height:gallery.length?124:88,border:`1.5px dashed ${B.borderStrong}`,background:B.fill,color:B.text2}}>
                        <ImagePlus size={18}/>إضافة صورة
                        <input type="file" accept="image/*" className="hidden"
                          onChange={onPickMedia("package-gallery",url=>{saveImmediately();addGalleryImg(url);})}/>
                      </label>
                    )}
                  </div>
                </div>
                <div className="pt-4 flex flex-col gap-4" style={{borderTop:`1px solid ${B.border}`}}>
                <div><Field label="اسم الباقة">
                       <Input value={form.name} onChange={e=>set("name",e.target.value)}/>
                     </Field></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><Field label="نوع المنتج">
                         <AppSelect value={form.productType} onChange={v=>{saveImmediately();set("productType",v);}} options={PRODUCT_TYPE_OPTS.map(o=>({value:o,label:o}))}/>
                       </Field></div>
                  <div><Field label="الوجهة">
                         <AppSelect value={form.destination} onChange={v=>{saveImmediately();set("destination",v as PkgDest);}} options={DEST_OPTS.map(o=>({value:o,label:o}))}/>
                       </Field></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Field label="الأيام">
                         <NumericInput min={1} className="ui-input" value={form.days} onValueChange={v=>set("days",Number(v))}/>
                       </Field></div>
                  <div><Field label="الليالي">
                         <NumericInput min={0} className="ui-input" value={form.nights} onValueChange={v=>set("nights",Number(v))}/>
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
                    <Note tone={form.status==="active"?"danger":"warn"} icon={<AlertTriangle size={15}/>} className="mt-2.5">
                      لا يمكن النشر قبل: {ready.blockers.map(b=>b.label).join("، ")}.
                    </Note>
                  )}
                  {form.nights===0&&(
                    <Note tone="neutral" icon={<Info size={15}/>} className="mt-2.5">
                      هذه الباقة <b>مواصلات فقط</b> (صفر ليالٍ) — لا يُطلب فندق ولا خيارات غرف.
                    </Note>
                  )}
                </div>
                </div>
              </Section>
            </div>
            {/* RIGHT */}
            <div className="flex flex-col gap-4 min-w-0">
              {/* Transport link */}
              <Section title="المواصلة المرتبطة">
                <AppSelect value={form.transportId} placeholder="اختر مواصلة" ariaLabel="المواصلة المرتبطة" onChange={v=>{
                  saveImmediately();
                  const t=transports.find(x=>x.id===v);
                  setForm(f=>({...f,transportId:v,productType:t?(t.mode==="flight"?"طيران":t.vehicleType.includes("VIP")?"رحلة VIP":"حافلة"):f.productType}));
                }} options={linkableTransports(transports).map(t=>({value:t.id,label:`${t.name} · ${t.vehicleType} · ${t.seats} مقعد · ${sar(t.seatCost)}`}))}/>
                {/* المسوّدات والمتوقفة محجوبة عن الربط: ربطُ باقةٍ منشورة
                    بمركبةٍ لم تُعتمد كان ينقل العلّة ولا يحلّها — الباقة
                    تأخذ سعتها وتكلفتها من صفٍّ نصف مكتمل. */}
                {form.transportId&&!linkableTransports(transports).some(t=>t.id===form.transportId)&&(
                  <Note tone="warn" icon={<AlertTriangle size={15}/>}>
                    المواصلة المرتبطة حالياً مسودة أو متوقفة — فعّلها من شاشة المواصلات أو اختر غيرها.
                  </Note>
                )}
                {selTransport && linked(
                  selTransport.media?.find(m=>m.primary&&m.kind==="image")?.url||selTransport.media?.find(m=>m.kind==="image")?.url,
                  selTransport.mode==="bus"?BusIcon:Plane,
                  selTransport.name,
                  <>{selTransport.vehicleType} · {selTransport.seats} مقعد</>,
                )}
              </Section>
              {/* Hotel link */}
              <Section title="الفندق المرتبط">
                {/* المنشورة وحدها: قائمةٌ تسرد كل الفنادق تسمح بربط باقةٍ
                    نشطة بفندقٍ مسودةٍ أو متوقّف — فيراه العميل سكناً بلا
                    سعر. الفندق المربوط سابقاً يبقى في القائمة كي لا يختفي
                    اختيارٌ قائم بلا تفسير. */}
                <AppSelect value={form.hotelId} placeholder="اختر فندقاً" ariaLabel="الفندق المرتبط" onChange={v=>{saveImmediately();set("hotelId",v);}}
                  options={[...linkableHotels(hotels), ...hotels.filter(h=>h.id===form.hotelId&&!isPublished(h.status))]
                    .map(h=>({value:h.id,label:`${cleanHotelName(h.name)} · ${h.city} · ${h.stars} نجوم${isPublished(h.status)?"":" — غير منشور"}`}))}/>
                {selHotel&&!isPublished(selHotel.status)&&(
                  <Note tone="warn" icon={<AlertTriangle size={15}/>}>
                    هذا الفندق متوقف — لن يراه العميل حتى يُفعَّل من شاشة الفنادق.
                  </Note>
                )}
                {/* التصنيف نصّاً لا صفّاً من نجوم: خمس رسماتٍ ذهبية
                    بقياس ٩ بكسل تُعيد رسم نفسها وتتبدّل عدداً مع كل
                    تبديل فندق — ضجيجٌ بصري ثمنه معلومةٌ يقولها رقمٌ
                    واحد بهدوء، وهي مكتوبة أصلاً في قائمة الاختيار. */}
                {selHotel && linked(
                  selHotel.media?.find(m=>m.primary&&m.kind==="image")?.url||selHotel.media?.find(m=>m.kind==="image")?.url,
                  Building2,
                  hotelDisplayName(selHotel.name),
                  <span className="inline-flex items-center gap-1.5"><MapPin size={12}/>{selHotel.city} · {selHotel.stars} نجوم</span>,
                )}
              </Section>
              {/* Notes */}
              <Section title="ملاحظات داخلية" sub="للفريق وحده — لا تظهر للعميل.">
                <Textarea rows={4} aria-label="ملاحظات داخلية" value={form.notes} onChange={e=>set("notes",e.target.value)} placeholder="ملاحظات للفريق…"/>
              </Section>
            </div>
            </div>
          </TabPanel>

          <TabPanel id="program" idPrefix="pkg" active={tab==="program"}>
            <div className="pkg-two-col grid gap-4 md:gap-5" style={{gridTemplateColumns:"1.35fr 1fr",alignItems:"start"}}>
              <div className="flex flex-col gap-4 min-w-0">
                <Section title="مراحل البرنامج" sub={activeStages.length?`${activeStages.length} مرحلة تظهر للعميل بهذا الترتيب.`:undefined}
                  actions={<>
                    <Button size="sm" variant="secondary" icon={<Copy size={14}/>} onClick={()=>setCopySection("program")}>استيراد من باقة</Button>
                    <Button size="sm" variant="dark" icon={<Plus size={14}/>} onClick={addStage}>إضافة مرحلة</Button>
                  </>}>
                  {activeStages.map((s,idx)=>(
                    <div key={s.id} className="rounded-xl" style={{border:`1px solid ${B.border}`}}>
                      {/* بلا overflow-hidden: قائمة الأيقونات تنبثق خارج حدود البطاقة. */}
                      <div className="flex items-center gap-2.5 ps-3.5 pe-1.5 py-1.5 rounded-t-xl" style={{background:B.fill,borderBottom:`1px solid ${B.border}`}}>
                        <span className="flex items-center justify-center text-xs font-bold flex-shrink-0"
                          style={{width:24,height:24,borderRadius:999,background:B.surface,border:`1px solid ${B.borderStrong}`,color:B.black}}>{idx+1}</span>
                        <span className="text-sm font-bold flex-1 min-w-0 truncate" style={{color:B.black}}>{s.title||"مرحلة جديدة"}</span>
                        <div className="flex items-center flex-shrink-0">
                          <IconButton size="sm" label="تقديم المرحلة في البرنامج" onClick={()=>moveStage(s.id,-1)} disabled={idx===0}><ChevronUp size={16}/></IconButton>
                          <IconButton size="sm" label="تأخير المرحلة في البرنامج" onClick={()=>moveStage(s.id,1)} disabled={idx===activeStages.length-1}><ChevronDown size={16}/></IconButton>
                          <IconButton size="sm" label="أرشفة المرحلة" onClick={()=>archiveStage(s.id)}><Archive size={15}/></IconButton>
                          <IconButton size="sm" variant="danger" label="حذف المرحلة" onClick={()=>delStage(s.id)}><Trash2 size={15}/></IconButton>
                        </div>
                      </div>
                      {/* الأيقونة واليوم والوقت في صفٍّ واحد: ثلاثة حقولٍ قصيرة
                          كانت تأخذ صفّين، فتطول بطاقة المرحلة شاشةً كاملة. */}
                      <div className="p-3.5 md:p-4 grid grid-cols-2 sm:grid-cols-[1.15fr_1.15fr_.7fr] gap-3">
                        <div className="col-span-2 sm:col-span-1"><Field label="الأيقونة">
                               <StageIconPicker value={s.icon} onChange={icon=>updStage(s.id,"icon",icon)}/>
                             </Field></div>
                        <div><Field label="اليوم">
                            <Input value={s.day} placeholder="اليوم الأول" onChange={e=>updStage(s.id,"day",e.target.value)}/>
                          </Field></div>
                        <div><Field label="الوقت">
                               <Input style={{direction:"ltr",textAlign:"end"}} value={s.time} placeholder="22:00" onChange={e=>updStage(s.id,"time",e.target.value)}/>
                             </Field></div>
                        <div style={{gridColumn:"1/-1"}}>
                          <Field label="عنوان المرحلة">
                            <Input value={s.title} placeholder="الانطلاق من الرياض" onChange={e=>updStage(s.id,"title",e.target.value)}/>
                          </Field></div>
                        <div style={{gridColumn:"1/-1"}}>
                          <Field label="وصف مختصر">
                            <Textarea rows={2} style={{minHeight:64}} value={s.desc} onChange={e=>updStage(s.id,"desc",e.target.value)}/>
                          </Field></div>
                      </div>
                    </div>
                  ))}
                  {activeStages.length===0&&<EmptyState compact icon={<ListChecks size={22}/>} title="لم تُضف مراحل بعد"
                    note="مرحلةٌ واحدة على الأقل شرطٌ للنشر. أضف المراحل بترتيب الرحلة."
                    action={<Button variant="secondary" icon={<Plus size={16}/>} onClick={addStage}>إضافة مرحلة</Button>}/>}
                </Section>
                {/* Archived stages */}
                {archivedStages.length>0&&(
                  <Section title={`مراحل مؤرشفة (${archivedStages.length})`} sub="لا تظهر للمستخدم، يمكن إعادة تفعيلها.">
                    <div className="flex flex-col gap-2">
                    {archivedStages.map(s=>(
                      <div key={s.id} className="flex items-center gap-2.5 ps-3 pe-1.5 py-1.5 rounded-xl" style={{background:B.fill}}>
                        <span className="text-base flex-shrink-0" style={{opacity:0.6}}>{s.icon}</span>
                        <span className="text-sm font-bold flex-1 min-w-0 truncate" style={{color:B.text2}}>{s.title||"مرحلة بدون عنوان"}</span>
                        <Button size="sm" variant="secondary" icon={<ArchiveRestore size={14}/>} onClick={()=>unarchiveStage(s.id)}>إعادة تفعيل</Button>
                        <IconButton size="sm" variant="danger" label="حذف المرحلة" onClick={()=>delStage(s.id)}><Trash2 size={15}/></IconButton>
                      </div>
                    ))}
                    </div>
                  </Section>
                )}
              </div>
              {/* Preview */}
              <div className="min-w-0 min-[901px]:sticky" style={{top:STICK_TOP}}>
                <Section title="معاينة العرض للمستخدم" sub="برنامج الرحلة اليومي كما يراه العميل.">
                  <div>
                  {activeStages.map((s,idx)=>(
                    <div key={s.id} className="flex gap-3">
                      <div className="flex flex-col items-center flex-shrink-0">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base" style={{background:B.fill,border:`1px solid ${B.border}`}}>{s.icon}</div>
                        {idx<activeStages.length-1&&<div className="flex-1 my-1" style={{width:1,background:B.borderStrong,minHeight:12}}/>}
                      </div>
                      <div className="pb-4 flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="font-bold text-sm" style={{color:B.black}}>{s.day||"—"}</span>
                          {s.time&&<Badge tone="neutral">{s.time}</Badge>}
                        </div>
                        <div className="text-sm" style={{color:B.text2}}>{s.title||"—"}</div>
                        {s.desc&&<div className="text-xs mt-0.5 leading-relaxed" style={{color:B.muted}}>{s.desc}</div>}
                      </div>
                    </div>
                  ))}
                  {activeStages.length===0&&<div className="text-center py-6 text-sm" style={{color:B.muted}}>لا مراحل تُعرض بعد.</div>}
                  </div>
                </Section>
              </div>
            </div>
          </TabPanel>

          {tab==="rooms"&&(()=>{
            /* ── التسعير: نموذج إعداد لا لوحة محاسبة ──

               كان الرقم الواحد موزّعاً على أربعة أماكن: السعر المعلن في
               بطاقة، ومراجعةٌ تكرّر الفندق والمواصلة، وجدولٌ بثمانية أعمدة
               يخلط تكلفة المقعد بسعر الغرفة، وصندوق «مواصلات فقط» بينهما.
               فمن يريد أن يعرف «كم يدفع الفرد؟» يجمع بنفسه من أربع نواحٍ.

               التدفّق الآن من أعلى إلى أسفل — سعرٌ معلن، ثم سكن، ثم نقل —
               وإلى جانبه بطاقةٌ واحدة تجمع: السكن + النقل = الإجمالي، تتغيّر
               مع كل ضغطة مفتاح. الأرقام تُدخَل مرّةً وتُقرأ مرّة. */
            /* سعر النقل للباقة كلّها: ما كتبه الموظف، وإلا تكلفة مقعد
               المركبة المرتبطة. رقمٌ واحد يقرؤه الجدول والملخّص معاً. */
            const seatPrice=Math.max(0,form.seatCostOverride ?? selTransport?.seatCost ?? 0);
            /* يعرض الملخّص إجمالي السكن الكامل، لا سعر ليلة واحدة. */
            const lodgingNights=Math.max(0,Math.trunc(form.nights)||0);
            const stayOf=(r:RoomPrice)=>(r.perNight||0)*lodgingNights;
            const totalOf=(r:RoomPrice)=>stayOf(r)+seatPrice;
            /* الخيارات الأربعة تُشتقّ من roomPrices ولا تُخزَّن بجانبها:
               نسخةٌ ثانيةٌ تُزامَن تتفارق مع الأولى عند أول حفظٍ لم يُحسب. */
            /* الصفوف حرّة تُضاف وتُحذف: النوع والسعة والجمهور قرارات
               تجارية تتغيّر مع كل فندق، لا ثوابت تُدفن في الكود. */
            const addRoom=()=>set("roomPrices",[...form.roomPrices,newTier(uid())]);
            const delRoom=(id:string)=>set("roomPrices",form.roomPrices.filter(r=>r.id!==id));
            const updRoom=(id:string,patch:Partial<RoomPrice>)=>
              set("roomPrices",form.roomPrices.map(r=>r.id===id?{...r,...patch}:r));
            const moveRoom=(i:number,dir:-1|1)=>{const arr=[...form.roomPrices];const j=i+dir;if(j<0||j>=arr.length)return;[arr[i],arr[j]]=[arr[j],arr[i]];set("roomPrices",arr);};
            /* تبديل جمهورٍ واحد. الجمهور الفارغ يُكتب صراحةً ولا يُترك
               غائباً: الغياب يعني «للجميع» عند القراءة، فلو تُرك لانقلب
               صفٌّ مُنع عن الكل إلى معروضٍ للكل. */
            const toggleAud=(r:RoomPrice,v:TravellerType)=>{
              const cur=audienceOf(r);
              const next=cur.includes(v)?cur.filter(x=>x!==v):ALL_AUDIENCE.filter(x=>cur.includes(x)||x===v);
              updRoom(r.id,{audience:next});
            };
            const sellable=form.roomPrices.filter(isSellableTier);
            const cheapest=sellable.length?Math.min(...sellable.map(totalOf)):0;
            const announced=form.marketPrice||0;
            /* فجوةٌ بين المعلن وأرخص إجمالي فعلي ليست خطأً دائماً (سعرٌ
               ترويجي مقصود)، لكنها لا تُكتشف بالصدفة بعد النشر. */
            const gap=announced>0&&cheapest>0&&announced!==cheapest;
            /* عناصر الصفّ تُعرَّف مرّةً وتُرسم مرّتين: خلايا في جدول المكتب،
               وحقولاً في بطاقة الجوال — ستّة أعمدةٍ فيها حقول لا تُعصر في ٣٩٠. */
            const kindSel=(r:RoomPrice)=>(
              <AppSelect ariaLabel="نوع السكن" value={kindOf(r.type)} onChange={v=>updRoom(r.id,{type:typeOfKind(v as HousingKind)})}
                options={HOUSING_KINDS.map(k=>({value:k.value,label:k.label}))}/>
            );
            const audBtns=(r:RoomPrice)=>{
              const aud=audienceOf(r);
              return AUDIENCE.map(a=>{
                const on=aud.includes(a.value);
                return <button key={a.value} type="button" onClick={()=>toggleAud(r,a.value)}
                  aria-pressed={on} title={`${on?"إخفاء عن":"عرض لـ"} ${a.label}`}
                  className="inline-flex items-center justify-center rounded-full text-xs font-bold cursor-pointer"
                  style={{height:28,padding:"0 11px",border:`1px solid ${on?AUD_ON[a.value].line:B.borderStrong}`,background:on?AUD_ON[a.value].fill:B.surface,color:on?AUD_ON[a.value].ink:B.muted}}>
                  {a.short}
                </button>;
              });
            };
            /* صفٌّ لا يراه أحد يُقال صراحةً: بلا هذا يبقى مسجّلاً
               بسعره ولا يظهر للعميل، فيُبحث عن العطب في الحجز. */
            const audNote=(r:RoomPrice)=>audienceOf(r).length===0
              ? <div className="text-xs font-bold" style={{color:TONE.danger.fg,marginTop:4}}>لا يُعرض لأحد — فعّل جمهوراً واحداً على الأقل.</div>
              : <div className="text-xs" style={{color:B.muted,marginTop:4}}>{audienceSummary(r)}</div>;
            const rowActs=(r:RoomPrice,ri:number)=>(<>
              <IconButton size="sm" label="تقديم" onClick={()=>moveRoom(ri,-1)} disabled={ri===0}><ChevronUp size={16}/></IconButton>
              <IconButton size="sm" label="تأخير" onClick={()=>moveRoom(ri,1)} disabled={ri===form.roomPrices.length-1}><ChevronDown size={16}/></IconButton>
              <IconButton size="sm" variant="danger" label="حذف" onClick={()=>delRoom(r.id)}><Trash2 size={15}/></IconButton>
            </>);
            const numLtr:React.CSSProperties={direction:"ltr",textAlign:"end"};
            return (
          <TabPanel id="rooms" idPrefix="pkg" active>
            <div className="pkg-price-grid" style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) 304px",gap:20,alignItems:"start"}}>
              <div className="flex flex-col gap-4 min-w-0">

                {/* ① السعر المعلن */}
                <Section step={1} title="السعر المعلن للعميل" sub="الرقم الذي يراه العميل في بطاقة الباقة تحت «يبدأ من». تحدده أنت، ولا يتغيّر تلقائياً مع أسعار الغرف.">
                  <div className="flex items-start gap-x-5 gap-y-2 flex-wrap">
                    <div style={{width:190}}>
                      <Field label={`يبدأ من (${SAR})`} error={!announced?"أدخل السعر المعلن قبل نشر الباقة.":undefined}>
                        <NumericInput min={1} value={form.marketPrice || ""} placeholder="50" normalizeArabicDigits
                          onValueChange={value=>set("marketPrice",value===""?0:Number(value))}
                          className={`ui-input${announced>0?"":" is-invalid"}`}
                          style={{...numLtr,height:46,fontSize:18,fontWeight:700}}/>
                      </Field>
                    </div>
                    <p className="text-xs leading-relaxed flex-1 min-w-[220px] m-0 sm:pt-8" style={{color:B.muted}}>
                      <b style={{color:B.text2}}>الأسعار نهائية شاملة الضريبة والخدمة</b> — لا تُضاف نسبة لاحقاً، وما يظهر للعميل هو ما يدفعه.
                    </p>
                  </div>
                </Section>

                {/* ② السكن وأسعاره */}
                <Section step={2} title="السكن وأسعاره" flush
                  sub={form.nights>0
                    ?`نوع الغرفة وعدد أسرّتها وسعر الليلة للغرفة، ولمن تُعرض. ملخص السعر يضربها في ${form.nights} ليالٍ.`
                    :"الباقة بلا مبيت (صفر ليالٍ) — السكن اختياري هنا."}
                  actions={<Button size="sm" variant="dark" icon={<Plus size={14}/>} onClick={addRoom}>إضافة غرفة</Button>}>
                  {/* لا أسعار «للاسترشاد» من صفّ الفندق: الفندق صار بطاقة
                      تعريف بلا غرفٍ ولا أسعار، والسعر هنا هو المصدر. */}
                  {/* الصفّ يحمل قراره كاملاً: نوعه وعدد أسرّته وسعره ومن
                      تُعرض عليه. «يظهر لـ» عمودٌ لأنه يتغيّر من غرفةٍ إلى
                      أخرى — مشتركٌ للرجال وآخر للنساء وخاصةٌ للعوائل
                      وحدها، كلها في باقةٍ واحدة. */}
                  {form.roomPrices.length>0&&<>
                  <div className="hidden lg:block ui-table-scroll">
                    <table className="ui-table" style={{minWidth:640}}>
                      <thead>
                        <tr>
                          <th>النوع</th>
                          <th>عدد الأسرّة</th>
                          <th>سعر الليلة للغرفة</th>
                          <th>يظهر لـ</th>
                          <th>إجمالي {lodgingNights} ليالٍ</th>
                          <th className="col-action"><span className="sr-only">إجراءات</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {form.roomPrices.map((r,ri)=>(
                          <tr key={r.id}>
                            <td style={{minWidth:176,verticalAlign:"top"}}>
                              {kindSel(r)}
                              <div className="cell-sub" style={{marginTop:4}}>{tierLabel(r.type,r.persons)}</div>
                            </td>
                            <td style={{verticalAlign:"top"}}><NumericInput min={BEDS_MIN} max={BEDS_MAX} aria-label="عدد الأسرّة"
                              className="ui-input text-center" style={{width:72}} value={r.persons}
                              onValueChange={v=>updRoom(r.id,{persons:Number(v)||1})}/></td>
                            <td style={{verticalAlign:"top"}}><NumericInput min={0} aria-label="سعر الليلة للغرفة"
                              className="ui-input text-center" style={{width:96,fontWeight:600}} value={r.perNight}
                              onValueChange={v=>updRoom(r.id,{perNight:Number(v)||0})}/></td>
                            <td style={{verticalAlign:"top"}}>
                              <div className="flex items-center gap-1.5" style={{minHeight:42}}>{audBtns(r)}</div>
                              {audNote(r)}
                            </td>
                            <td className="nowrap cell-main" style={{verticalAlign:"top",paddingTop:25}}>{sar(stayOf(r))}</td>
                            <td className="col-action" style={{verticalAlign:"top",paddingTop:20}}><div className="row-actions" style={{gap:0}}>{rowActs(r,ri)}</div></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="lg:hidden flex flex-col gap-3 p-4">
                    {form.roomPrices.map((r,ri)=>(
                      <div key={r.id} className="rounded-xl p-3.5 flex flex-col gap-3" style={{border:`1px solid ${B.border}`}}>
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 min-w-0">{kindSel(r)}</div>
                          <div className="flex items-center flex-shrink-0">{rowActs(r,ri)}</div>
                        </div>
                        <div className="text-xs" style={{color:B.muted,marginTop:-6}}>{tierLabel(r.type,r.persons)}</div>
                        <div className="grid grid-cols-2 gap-3">
                          <div><Field label="عدد الأسرّة">
                            <NumericInput min={BEDS_MIN} max={BEDS_MAX} className="ui-input" value={r.persons}
                              onValueChange={v=>updRoom(r.id,{persons:Number(v)||1})}/>
                          </Field></div>
                          <div><Field label="سعر الليلة للغرفة">
                            <NumericInput min={0} className="ui-input" style={{fontWeight:600}} value={r.perNight}
                              onValueChange={v=>updRoom(r.id,{perNight:Number(v)||0})}/>
                          </Field></div>
                        </div>
                        <div>
                          <div className="ui-label">يظهر لـ</div>
                          <div className="flex items-center gap-1.5 flex-wrap">{audBtns(r)}</div>
                          {audNote(r)}
                        </div>
                        <div className="flex items-center justify-between pt-3 text-sm" style={{borderTop:`1px solid ${B.border}`}}>
                          <span style={{color:B.text2}}>إجمالي {lodgingNights} ليالٍ</span>
                          <b style={{color:B.black}}>{sar(stayOf(r))}</b>
                        </div>
                      </div>
                    ))}
                  </div>
                  </>}
                  {form.roomPrices.length===0&&<EmptyState compact icon={<BedDouble size={22}/>} title="لم تُضف أنواع سكن بعد"
                    note={ready.housing?"مطلوب نوع واحد على الأقل قبل النشر — الباقة تشمل سكناً.":"الباقة بلا مبيت — السكن اختياري."}
                    action={<Button variant="secondary" icon={<Plus size={16}/>} onClick={addRoom}>إضافة غرفة</Button>}/>}
                </Section>

                {/* ③ المواصلات — وسيلةٌ وسعرٌ واحد، لا جدول */}
                <Section step={3} title="المواصلات" sub="سعرٌ واحد للفرد يشمل الذهاب والعودة، يُضرب في عدد الأشخاص ثم يُضاف إليه سعر الغرفة.">
                  {selTransport
                    ? <div className="flex items-center justify-between gap-x-3 gap-y-1 flex-wrap px-3.5 py-2.5 rounded-xl" style={{background:B.fill}}>
                        <span className="text-sm font-bold inline-flex items-center gap-2" style={{color:B.black}}>
                          {selTransport.mode==="bus"?<BusIcon size={16} style={{color:B.muted}}/>:<Plane size={16} style={{color:B.muted}}/>}{selTransport.name}
                        </span>
                        <span className="text-xs" style={{color:B.muted}}>تُبدَّل من تبويب «المعلومات»</span>
                      </div>
                    : <Note tone="warn" icon={<AlertTriangle size={15}/>}>
                        لم تُربط مواصلة بعد — اربطها من تبويب «المعلومات».
                      </Note>}
                  {/* ٣٠) النقل لا يتبع الغرفة.

                      كان الجدول يسأل عن تكلفة المقعد في كل صفّ سكن —
                      مشتركة وخاصة وعائلية — والجواب في كل مرّة هو الرقم
                      نفسه، لأن المقعد في الحافلة واحد مهما كان مبيت
                      صاحبه. أربعة حقول تُملأ بقيمةٍ واحدة تفتح باب
                      التفاوت بالسهو: يُعدَّل صفٌّ ويُنسى الباقي فيدفع
                      اثنان في الحافلة نفسها سعرين.

                      حقلٌ واحد للباقة، قيمته المبدئية من المركبة. */}
                  <div style={{maxWidth:320}}>
                    <Field label={`سعر المواصلات للفرد — ذهاب وعودة (${SAR})`}
                      hint={selTransport
                        ? `القيمة المبدئية من «${selTransport.name}» هي ${sarNumber(selTransport.seatCost)} — عدّلها كما تبيع.`
                        : "سعر البيع للعميل، ولا يتغيّر بنوع الغرفة."}>
                      <NumericInput min={0} className="ui-input" style={{...numLtr,fontWeight:600}}
                        value={seatPrice} placeholder="مثال: 150" onValueChange={v=>set("seatCostOverride",v===""?undefined:Number(v))}/>
                    </Field>
                  </div>
                </Section>
              </div>

              {/* ④ الملخّص — بطاقةٌ واحدة تتحدّث مع كل ضغطة مفتاح */}
              <aside className="ui-card" style={{position:"sticky",top:STICK_TOP}} aria-labelledby="pkg-price-summary">
                <div className="ui-card-head" style={{padding:"14px 18px"}}><h3 id="pkg-price-summary" className="ui-card-title">ملخّص السعر</h3></div>
                <div className="p-4 flex flex-col gap-3">
                <div className="rounded-xl px-3.5 py-3" style={{background:B.fill}}>
                  <div className="text-xs" style={{color:B.muted}}>المعلن للعميل «يبدأ من»</div>
                  <div className="mt-0.5 whitespace-nowrap" style={{fontSize:22,fontWeight:700,lineHeight:1.3,color:announced>0?B.black:TONE.danger.fg}}>
                    {announced>0?sarNumber(announced):"—"}<span className="ts-stat-unit">{SAR}</span>
                  </div>
                </div>

                {sellable.length>0
                  ? <div className="flex flex-col gap-2.5">
                      {sellable.map(r=>(
                        <div key={r.id} className="rounded-xl px-3.5 py-3" style={{border:`1px solid ${B.border}`}}>
                          <div className="text-sm font-bold mb-1.5" style={{color:B.black}}>{r.type}</div>
                          <div className="flex items-center justify-between gap-2 text-xs" style={{color:B.text2}}>
                            <span>السكن <span style={{color:B.muted}}>(غرفة واحدة · {lodgingNights} ليالٍ)</span></span>
                            <span>{sarNumber(stayOf(r))}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2 text-xs mt-1" style={{color:B.text2}}>
                            <span>النقل <span style={{color:B.muted}}>(ذهاب وعودة)</span></span>
                            <span>{sarNumber(seatPrice)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2 text-sm font-bold mt-2 pt-2" style={{color:B.black,borderTop:`1px solid ${B.border}`}}>
                            <span>إجمالي شخص واحد</span>
                            <span className="whitespace-nowrap">{sar(totalOf(r))}</span>
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center justify-between gap-2 text-xs font-bold px-1" style={{color:B.text2}}>
                        <span>أرخص إجمالي لشخص واحد</span>
                        <span className="whitespace-nowrap">{sar(cheapest)}</span>
                      </div>
                      {gap&&(
                        <Note tone="warn" icon={<Info size={15}/>}>
                          المعلن {sarNumber(announced)} وأرخص إجمالي {sarNumber(cheapest)} — تأكّد أن الفرق مقصود.
                        </Note>
                      )}
                    </div>
                  : <p className="text-xs leading-relaxed m-0" style={{color:B.muted}}>
                      أضف نوع سكن بسعر أكبر من صفر ليظهر إجمالي الشخص الواحد هنا.
                    </p>}
                </div>
              </aside>
            </div>
          </TabPanel>
            );
          })()}

          <TabPanel id="features" idPrefix="pkg" active={tab==="features"}>
            <div style={formBox} className="flex flex-col gap-4">
            <Section title="مميزات الرحلة" sub="نصّ الميزة وأيقونة اختيارية — لا أكثر. تظهر للعميل في صفحة الباقة."
              actions={<>
                <Button size="sm" variant="secondary" icon={<Copy size={14}/>} onClick={()=>setCopySection("features")}>استيراد</Button>
                <Button size="sm" variant="dark" icon={<Plus size={14}/>} onClick={addFeat}>إضافة</Button>
              </>}>
              {form.features.length>0&&<div className="flex flex-col gap-2.5">
              {form.features.map((f,fi)=>(
                /* على الجوال ينزل حقل النصّ سطراً تحت أدوات الميزة: خمسة عناصر
                   في صفٍّ واحد تترك للنصّ مئةً وخمسين بكسلاً لا تكفي جملة.
                   والسطران في إطارٍ واحد كي تُقرأ كل ميزةٍ وحدةً. */
                <div key={f.id} className="flex gap-x-2 gap-y-2 items-center flex-wrap sm:flex-nowrap max-sm:p-2.5 max-sm:rounded-xl max-sm:border" style={{borderColor:B.border}}>
                  <div className="flex items-center flex-shrink-0">
                    <IconButton size="sm" label="تقديم الميزة" onClick={()=>moveFeat(fi,-1)} disabled={fi===0}><ChevronUp size={16}/></IconButton>
                    <IconButton size="sm" label="تأخير الميزة" onClick={()=>moveFeat(fi,1)} disabled={fi===form.features.length-1}><ChevronDown size={16}/></IconButton>
                  </div>
                  <FeatureIconPicker value={f.icon} onChange={k=>updFeat(f.id,"icon",k)}/>
                  <div className="order-last sm:order-none basis-full sm:basis-0 flex-1 min-w-0">
                    <Input aria-label={`نصّ الميزة ${fi+1}`} value={f.text} placeholder="ما الذي يشمله هذه الباقة؟" onChange={e=>updFeat(f.id,"text",e.target.value)}/>
                  </div>
                  <IconButton variant="danger" className="ms-auto sm:ms-0" label="حذف الميزة" onClick={()=>delFeat(f.id)}><Trash2 size={16}/></IconButton>
                </div>
              ))}
              </div>}
              {form.features.length===0&&<EmptyState compact icon={<ListChecks size={22}/>} title="لم تُضف مميزات بعد"
                note="ما الذي تشمله الباقة؟ وجبات، نقل داخلي، مرشد…"
                action={<Button variant="secondary" icon={<Plus size={16}/>} onClick={addFeat}>إضافة ميزة</Button>}/>}
            </Section>
            {form.features.length>0&&(
              <Section title="معاينة" sub="كما يراها العميل.">
                <div className="flex flex-wrap gap-2">
                  {form.features.map(f=>{
                    const Icon=pkgFeatureIcon(f.icon);
                    return (
                    <span key={f.id} className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full"
                      style={{background:B.fill,border:`1px solid ${B.border}`,color:B.text3}}>
                      {Icon&&<Icon size={14} style={{color:B.muted}}/>}{f.text||"—"}
                    </span>
                    );
                  })}
                </div>
              </Section>
            )}
            </div>
          </TabPanel>

          <TabPanel id="policies" idPrefix="pkg" active={tab==="policies"}>
            <div style={formBox} className="flex flex-col gap-4">
            <Section title="سياسات الباقة" sub="سطرٌ لكل سياسة. كل سطرٍ يصير بنداً مستقلاً عند العميل، بترتيب الأسطر نفسه."
              actions={<Button size="sm" variant="secondary" icon={<Copy size={14}/>} onClick={()=>setCopySection("policies")}>استيراد</Button>}>
            {/* حقلٌ واحد لا حقلٌ لكل بند: «إضافة سياسة» ثم كتابة ثم إضافة
                ثانية — ضغطتان لكل سطر، وثمانُ سياساتٍ ستّ عشرة ضغطة قبل
                أول حرف. واللصق من ملف الشروط كان مستحيلاً.

                القيمة تُشتقّ من المصفوفة مباشرةً بلا حالةٍ محلية: split ثم
                join دورةٌ مطابقة تماماً، فما يكتبه الموظف يعود كما كتبه —
                بأسطره الفارغة وهو في منتصف الكتابة. والتشذيب عند الخروج من
                الحقل لا مع كل حرف، وإلّا مُحي السطر الفارغ تحت إصبعه. */}
            <div>
            <Textarea aria-label="سياسات الباقة — سطرٌ لكل سياسة"
              style={{minHeight:280,lineHeight:2.1}}
              value={(form.policies??[]).join("\n")}
              onChange={e=>set("policies",e.target.value.split("\n"))}
              onBlur={e=>{
                const clean=e.target.value.split("\n").map(line=>line.trim()).filter(Boolean);
                const now=form.policies??[];
                if(clean.length!==now.length||clean.some((line,i)=>line!==now[i])) set("policies",clean);
              }}
              placeholder={"إلغاء مجاني قبل 48 ساعة من موعد الرحلة\nالتأخر عن موعد الانطلاق لا يستوجب تعويضاً\nيلزم إحضار الهوية الوطنية أو الإقامة سارية المفعول"}/>
            {(()=>{ const live=(form.policies??[]).filter(x=>x.trim()); return (
                <div className="ui-hint flex items-center gap-1.5">
                  <ListChecks size={14}/>
                  {live.length?<><b style={{color:B.text2}}>{live.length}</b> سياسة ستظهر للعميل</>:"لم تُكتب سياسات بعد — الأسطر الفارغة لا تُحسب."}
                </div>
            ); })()}
            </div>
            </Section>
            {(()=>{ const live=(form.policies??[]).filter(x=>x.trim()); return live.length>0&&(
                  <Section title="معاينة" sub="كما يراها العميل.">
                    <ol className="flex flex-col gap-2.5 m-0 p-0 list-none">
                      {live.map((line,i)=>(
                        <li key={i} className="flex items-start gap-2.5">
                          <span className="flex items-center justify-center flex-shrink-0 text-xs font-bold"
                            style={{width:22,height:22,borderRadius:999,marginTop:2,background:B.fill,border:`1px solid ${B.border}`,color:B.text2}}>{i+1}</span>
                          <span className="text-sm leading-relaxed" style={{color:B.text3}}>{line.trim()}</span>
                        </li>
                      ))}
                    </ol>
                  </Section>
            ); })()}
            </div>
          </TabPanel>

          <TabPanel id="reviews" idPrefix="pkg" active={tab==="reviews"}>
            <div style={formBox} className="flex flex-col gap-4">
            <Section title="آراء المعتمرين" sub="الاسم والتقييم من 5 والرأي، مع صورة اختيارية."
              actions={<>
                <Button size="sm" variant="secondary" icon={<Copy size={14}/>} onClick={()=>setCopySection("reviews")}>من باقة</Button>
                <label className="ui-btn ui-btn--secondary ui-btn--sm">
                  <Upload size={14}/>استيراد CSV
                  <input type="file" accept=".csv,text/csv" className="hidden" onChange={importReviews}/>
                </label>
                <Button size="sm" variant="dark" icon={<Plus size={14}/>} onClick={addReview}>إضافة</Button>
              </>}>
            <p className="ui-hint" style={{margin:0}}>ملف CSV بثلاثة أعمدة: الاسم، التقييم، الرأي. الصور يمكن إضافتها لاحقاً لكل رأي.</p>
            {form.reviews.map((rv,ri)=>(
              <div key={rv.id} className="rounded-xl overflow-hidden" style={{border:`1px solid ${B.border}`}}>
                <div className="flex items-center gap-2 ps-3.5 pe-1.5 py-1.5" style={{background:B.fill,borderBottom:`1px solid ${B.border}`}}>
                  <span className="text-sm font-bold flex-1 min-w-0 truncate" style={{color:B.black}}>{rv.name||`رأي ${ri+1}`}</span>
                  <IconButton size="sm" variant="danger" label="حذف الرأي" onClick={()=>delReview(rv.id)}><Trash2 size={15}/></IconButton>
                </div>
                <div className="p-3.5 md:p-4 flex flex-col gap-3">
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-3">
                    <div><Field label="اسم العميل"><Input value={rv.name} placeholder="خالد" onChange={e=>updReview(rv.id,"name",e.target.value)}/></Field></div>
                    <div><Field label="التقييم من 5">
                      <NumericInput min={1} max={5} step={1} value={rv.rating ?? 5} placeholder="5"
                        onValueChange={v=>updReview(rv.id,"rating",Math.min(5,Math.max(1,Number(v)||1)))}
                        className="ui-input text-center"/>
                    </Field></div>
                  </div>
                  <div><Field label="نص الرأي"><Textarea rows={2} style={{minHeight:64}} value={rv.text} placeholder="الرحلة كانت ممتازة والتنظيم رائع." onChange={e=>updReview(rv.id,"text",e.target.value)}/></Field></div>
                  <div className="flex items-end gap-3 flex-wrap">
                    {rv.image&&(
                      <div className="relative rounded-xl overflow-hidden" style={{border:`1px solid ${B.border}`,width:96,height:96}}>
                        <img src={rv.image} alt="صورة مرفقة" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                        <IconButton size="sm" label="إزالة صورة الرأي" onClick={()=>updReview(rv.id,"image",undefined)}
                          className="absolute" style={{top:4,insetInlineEnd:4,background:"rgba(20,17,14,.72)",color:B.onInk}}><X size={14}/></IconButton>
                      </div>
                    )}
                    <label className="ui-btn ui-btn--secondary ui-btn--sm">
                      <ImagePlus size={14}/>{rv.image?"تغيير الصورة":"صورة — اختياري"}
                      <input type="file" accept="image/*" className="hidden" onChange={onPickMedia("package-reviews",url=>{saveImmediately();updReview(rv.id,"image",url);})}/>
                    </label>
                  </div>
                </div>
              </div>
            ))}
            {form.reviews.length===0&&<EmptyState compact icon={<Star size={22}/>} title="لا توجد آراء"
              note="أضف رأياً يدوياً، أو استورد عدّة آراء من ملف CSV أو من باقةٍ أخرى."
              action={<Button variant="secondary" icon={<Plus size={16}/>} onClick={addReview}>إضافة رأي</Button>}/>}
            </Section>
            </div>
          </TabPanel>

          <TabPanel id="settings" idPrefix="pkg" active={tab==="settings"}>
            <div style={formBox} className="flex flex-col gap-4">
            <Section title="إعدادات الحجز الافتراضية" sub="تُطبَّق مبدئياً على كل رحلة تُطلق من هذه الباقة، ويمكن تعديلها لكل رحلة على حدة.">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                     مفعّل أم لا». المفتاح يميّزه من يميّز الداكن من
                     الرمادي وهو ينظر إلى ستّة مفاتيح متجاورة على شاشة
                     ساطعة — وقرار «تأكيد يدوي» يمسّ كل طلب يصل.

                     والصفّ كلّه <label>: الضغط على النصّ يقلب المفتاح كما
                     كان يقلبه الزرّ العريض قبله. */
                  return (
                    <label key={s.key} className="flex items-center justify-between gap-3 px-4 rounded-xl cursor-pointer"
                      style={{minHeight:52,border:`1px solid ${B.border}`,background:B.surface}}>
                      <span className="text-sm font-semibold" style={{color:B.black}}>{s.label}</span>
                      <span className="flex items-center gap-2.5 flex-shrink-0">
                        <span className="text-xs font-bold" style={{color:on?TONE.success.fg:B.muted}}>{on?"مفعّل":"متوقف"}</span>
                        <Switch checked={on} onChange={next=>setSetting(s.key,next as any)} label={`${s.label}: ${on?"مفعّل":"متوقف"}`}/>
                      </span>
                    </label>
                  );
                })}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4 pt-4" style={{borderTop:`1px solid ${B.border}`}}>
                <div>
                  {/* ثلاث نسخ مستقلّة عن قصد: النظام ← الباقة (لحظة الإنشاء)
                      ← الرحلة (لحظة الإطلاق). تعديل هنا لا يمسّ رحلةً
                      انطلقت وأُرسل رابط دفعها بمهلةٍ أُعلنت للعميل. */}
                  <Field label="مهلة الدفع (بالساعات)"
                    hint="وُرِثت من إعدادات النظام عند إنشاء الباقة. تعديلها هنا يسري على الرحلات الجديدة فقط — الرحلات المنطلقة تحتفظ بمهلتها.">
                    <NumericInput min={0} className="ui-input" style={{direction:"ltr",textAlign:"end"}}
                      value={settings.paymentDeadlineHours} onValueChange={v=>setSetting("paymentDeadlineHours",Number(v))}/>
                  </Field>
                </div>
                <div>
                  <Field label="الحد الأقصى للمعتمرين في الطلب الواحد">
                    <NumericInput min={1} className="ui-input" style={{direction:"ltr",textAlign:"end"}}
                      value={settings.maxPilgrims} onValueChange={v=>setSetting("maxPilgrims",Number(v))}/>
                  </Field>
                </div>
              </div>
            </Section>
            <PackageDangerZone pkg={form} canWrite={mayWrite} isAdmin={isAdmin}
              onArchive={archivePkg} onPermanentDelete={deletePkg}/>
            </div>
          </TabPanel>
        </div>
      </div>
      {/* حارس مغادرة التعديلات غير المحفوظة. */}
      {leaving&&<LeaveGuard saving={ed.state==="saving"}
        onSaveAndLeave={()=>{void ed.save(commit).then(ok=>{ if(ok){setLeaving(false);onBack();} else setLeaving(false); });}}
        onDiscard={()=>{setLeaving(false);onBack();}}
        onCancel={()=>setLeaving(false)}/>}
      {copySection&&<CopyFromPackageModal section={copySection} sources={copySources} onImport={importFromPackage} onClose={()=>setCopySection(null)}/>}
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
  const filteredOut=filtered.length===0&&packages.length>0;
  const clearFilters=()=>{setSearch("");setDestFilter("all");setStatusFilter("all");};
  /* النسخة تولد مسودة ولو كان الأصل منشوراً: نسخةٌ نشطة
     تظهر للعملاء فوراً باسم «(نسخة)» وأسعار لم تُراجَع. */
  const duplicate=(p:Pkg)=>{const dup:Pkg={...p,id:newId("PKG"),name:p.name+" (نسخة)",order:packages.length+1,status:"draft"};setPackages(prev=>[...prev,dup]);};
  const open=(id:string)=>setDetailId(id);
  const thumb=(p:Pkg)=>(
    <div className="rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0"
      style={{width:40,height:40,background:B.fill,border:`1px solid ${B.border}`,color:B.muted}}>
      {p.coverImage?<img src={p.coverImage} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<Package size={18}/>}
    </div>
  );
  /* شارة «ناقصة» لمنشورةٍ ينقصها شرط إلزامي: هذه الحالة يراها العميل
     الآن، فلا تُكتشف بفتح الباقة. وما ينقص يُقرأ في تلميحها. */
  const lacking=(p:Pkg)=>{const r=readiness(p);return p.status==="active"&&r.blockers.length>0
    ? <span title={`ينقصها: ${r.blockers.map(b=>b.label).join("، ")}`}><Badge tone="warn"><AlertTriangle size={12}/>ناقصة</Badge></span>
    : null;};
  const reorder=(p:Pkg,idx:number)=>(<>
    <IconButton size="sm" label="تقديم الباقة في ترتيب العرض" onClick={()=>move(p.id,-1)} disabled={idx===0}><ChevronUp size={16}/></IconButton>
    <IconButton size="sm" label="تأخير الباقة في ترتيب العرض" onClick={()=>move(p.id,1)} disabled={idx===filtered.length-1}><ChevronDown size={16}/></IconButton>
  </>);

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{background: B.bg}}>
      <PageHeader title="الباقات" crumb="إدارة الباقات" search={search} onSearch={setSearch} onMenuOpen={onMenuOpen}
        searchPlaceholder="ابحث باسم الباقة أو رقمها"
        actions={<Button variant="primary" icon={<Plus size={16}/>} onClick={()=>setShowAdd(true)}>
          <span className="hidden sm:inline">إضافة باقة</span><span className="sm:hidden">إضافة</span>
        </Button>}/>
      <div className="px-4 md:px-8 pt-1">
        {/* البطاقات تعدّ وتُرشِّح بما تعدّه؛ والشرائح تحتها بلا أرقام —
            لا يُكتب العدد نفسه مرّتين في شاشةٍ واحدة. */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="إجمالي الباقات" value={stats.total} sub="في النظام" accent onClick={clearFilters}/>
          <StatCard label="باقات نشطة" value={stats.active} sub={`${stats.total-stats.active} غير نشطة`} onClick={()=>setStatusFilter("active")}/>
          <StatCard label="باقات مكة" value={stats.mecca} sub="المكرمة فقط" onClick={()=>setDestFilter("مكة")}/>
          <StatCard label="مكة والمدينة" value={stats.both} sub="وجهة مزدوجة" onClick={()=>setDestFilter("مكة والمدينة")}/>
        </div>
        <div className="ts-toolbar">
          <FilterChips<"all"|PkgStatus> label="حالة الباقة" value={statusFilter} onChange={setStatusFilter}
            options={[{value:"all",label:"الكل"},{value:"active",label:"نشطة"},{value:"draft",label:"مسودة"},{value:"hidden",label:"مخفية"}]}/>
          <Segmented<"all"|PkgDest> label="الوجهة" value={destFilter} onChange={setDestFilter}
            options={[{value:"all",label:"كل الوجهات"},{value:"مكة",label:"مكة"},{value:"مكة والمدينة",label:"مكة والمدينة"}]}/>
          <span className="ts-toolbar-end ts-count" aria-live="polite">
            {filtered.length===packages.length?`${packages.length} باقة`:`${filtered.length} من ${packages.length}`}
          </span>
        </div>
      </div>
      <main className="flex-1 px-4 md:px-8 pb-8">
        <EntityGate entity="packages" label="الباقات" cols={7}>
        {filtered.length===0
          ? <EmptyState
              icon={filteredOut?<SearchX size={22}/>:<Package size={22}/>}
              title={filteredOut?"لا باقات تطابق البحث":"لا باقات بعد"}
              note={filteredOut?"جرّب كلمةً أخرى أو أزل المرشّحات.":"أضف أول باقة؛ تُحفظ مسودةً حتى تكتمل شروط نشرها."}
              action={filteredOut
                ? <Button variant="secondary" onClick={clearFilters}>إزالة المرشّحات</Button>
                : <Button variant="primary" icon={<Plus size={16}/>} onClick={()=>setShowAdd(true)}>إضافة باقة</Button>}/>
          : <>
          {/* Desktop table — جدولٌ حقيقي لا شبكةٌ تحاكيه: رؤوسٌ يقرؤها قارئ
              الشاشة، وصفٌّ يُفتح بالنقر وبـEnter، ومرورٌ من الصنف لا من
              معالجَي فأرة. والصفوف بلا حركة خروج: طيُّ الارتفاع عند كل
              ترشيح كان يُرقّص الجدول. */}
          <div className="hidden md:block ui-table-wrap">
            <div className="ui-table-scroll">
              <table className="ui-table" style={{minWidth:760}}>
                <thead>
                  <tr>
                    <th style={{width:1}}>الترتيب</th>
                    <th>الباقة</th>
                    <th>الوجهة</th>
                    <th>النوع</th>
                    <th>المدة</th>
                    <th>الحالة</th>
                    <th className="col-action"><span className="sr-only">إجراءات</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p,idx)=>(
                    <tr key={p.id} className="is-clickable" tabIndex={0} aria-label={`فتح تفاصيل الباقة ${p.name}`}
                      onClick={()=>open(p.id)}
                      onKeyDown={e=>{ if(e.key==="Enter"&&e.target===e.currentTarget) open(p.id); }}>
                      {/* Order */}
                      <td className="nowrap" onClick={e=>e.stopPropagation()} style={{cursor:"default"}}>
                        <div className="flex items-center gap-1">
                          <span className="text-sm font-bold text-center" style={{color:B.text2,minWidth:20}}>{p.order}</span>
                          {reorder(p,idx)}
                        </div>
                      </td>
                      {/* Name */}
                      <td>
                        <div className="flex items-center gap-3">
                          {thumb(p)}
                          <div className="min-w-0">
                            <div className="cell-main nowrap">{p.name}</div>
                            <div className="cell-sub">{p.id}</div>
                          </div>
                        </div>
                      </td>
                      <td>{destBadge(p.destination)}</td>
                      <td>{typeBadge(p.productType)}</td>
                      <td className="nowrap">
                        <div style={{color:B.text3}}>{p.days} أيام</div>
                        <div className="cell-sub">{p.nights>0?`${p.nights} ليالٍ`:"بلا مبيت"}</div>
                      </td>
                      <td><div className="flex items-center gap-1.5 flex-wrap"><StatusBadge status={p.status} entity="package"/>{lacking(p)}</div></td>
                      <td className="col-action" onClick={e=>e.stopPropagation()}>
                        <div className="row-actions">
                          <IconButton size="sm" label="نسخ الباقة كمسودة" onClick={()=>duplicate(p)}><Copy size={15}/></IconButton>
                          <IconButton size="sm" label={`فتح تفاصيل الباقة ${p.name}`} onClick={()=>open(p.id)}><ChevronLeft size={16}/></IconButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden flex flex-col gap-2.5">
            {filtered.map((p,idx)=>(
              <div key={p.id} role="button" tabIndex={0} aria-label={`فتح تفاصيل الباقة ${p.name}`} onClick={()=>open(p.id)}
                onKeyDown={e=>{ if(e.key==="Enter"&&e.target===e.currentTarget) open(p.id); }}
                className="ui-card ui-card--hover p-4" style={{cursor:"pointer"}}>
                <div className="flex items-center gap-3">
                  {thumb(p)}
                  <div className="min-w-0 flex-1">
                    <div className="font-bold truncate" style={{color:B.black,fontSize:15}}>{p.name}</div>
                    <div className="text-xs mt-0.5" style={{color:B.muted}}><bdi>{p.id}</bdi> · {p.days} أيام{p.nights>0?` / ${p.nights} ليالٍ`:" · بلا مبيت"}</div>
                  </div>
                  <ChevronLeft size={18} style={{color:B.muted,flexShrink:0}} aria-hidden/>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap mt-3">
                  <StatusBadge status={p.status} entity="package"/>{lacking(p)}
                  {destBadge(p.destination)}{typeBadge(p.productType)}
                </div>
                <div className="flex items-center justify-between mt-3 pt-2.5" style={{borderTop:`1px solid ${B.border}`}} onClick={e=>e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    <span className="text-xs" style={{color:B.muted}}>الترتيب</span>
                    <span className="text-sm font-bold text-center" style={{color:B.text2,minWidth:20}}>{p.order}</span>
                    {reorder(p,idx)}
                  </div>
                  <IconButton size="sm" variant="outline" label="نسخ الباقة كمسودة" onClick={()=>duplicate(p)}><Copy size={15}/></IconButton>
                </div>
              </div>
            ))}
          </div>
          </>
        }
        </EntityGate>
      </main>
      {showAdd&&<AddPkgModal onSave={handleSaveNew} onClose={()=>setShowAdd(false)}/>}
    </div>
  );
}
