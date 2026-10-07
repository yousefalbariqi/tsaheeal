import { useCallback, useEffect, useRef, useState, type CSSProperties, type ChangeEventHandler, type ReactNode } from "react";
import {
  Armchair, Trash2, X, Plus, Wrench, Layers, CircleCheck, SearchX, MessageSquareText,
  ImagePlus, Film, Star, ChevronUp, ChevronDown, Check, Bus, Plane, Download, FileUp,
} from "lucide-react";
import { B, TONE, ELEV } from "@/lib/theme";
import { SAR } from "@/lib/money";
import { useDebounced } from "@/lib/useDebounced";
import { EntityGate, EmptyState } from "@/components/States";
import { TabStrip, TabPanel } from "@/components/Tabs";
import { Badge, Button, IconButton, Input, Textarea, Modal, Note, Segmented, Switch, confirmDialog } from "@/components/ui";
import type { VehicleMode, MediaKind, HotelMedia, TransportReview, Transport } from "@/types";
import { uid, newId} from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";
import { StatCard } from "@/components/StatCard";
import { PageHeader } from "@/components/PageHeader";
import { AppSelect } from "@/components/AppSelect";
import { EntityActions } from "@/components/EntityActions";
import { useStore, writeLocalOnly } from "@/store/useStore";
import { transportReadiness, gapsByTab, type TrTab } from "./readiness";
import { isLive } from "@/lib/trip";
import { busCountOf } from "@/lib/buses";
import { permanentlyDelete } from "@/data/repository";
import { useRole } from "@/lib/useRole";
import { toast } from "sonner";
import { Field } from "@/components/Field";
import { NumericInput } from "@/components/NumericInput";
import { onPickMedia } from "@/lib/mediaUpload";
import { TRANSPORT_FEATURE_CATALOG, transportFeatureIcon } from "./featureIcons";

const transportsWord=(n:number)=>`${n} ${n>=3&&n<=10?"مواصلات":"مواصلة"}`;
const vehiclesWord=(n:number)=>n===1?"مركبة واحدة":n===2?"مركبتان":`${n} ${n<=10?"مركبات":"مركبة"}`;

/* وسم التجهيزة على البطاقة — للقراءة لا للضغط، فليس شريحة ترشيح. */
const featureTag:CSSProperties={display:"inline-flex",alignItems:"center",gap:6,height:26,padding:"0 10px",borderRadius:999,
  background:B.fill,border:`1px solid ${B.border}`,color:B.text3,fontSize:12,fontWeight:500,whiteSpace:"nowrap",maxWidth:"100%"};

/* ─── Transport Card ─── */
/* بطاقة المواصلة تعرض الإجراءين التشغيليين فقط: إيقاف/تفعيل أو حذف نهائي.
   وصدرها صورة المركبة إن رُفعت، وإلّا لوحٌ هادئ بأيقونة الوسيلة — لا رمزٌ
   تعبيريّ بحجم ٧٢ يتبدّل شكله من جهازٍ لآخر. */
function TransportCard({tr,onEdit,canWrite,isAdmin,onToggleActive,onDelete,deleteBlockers}:{
  tr:Transport;onEdit:()=>void;canWrite:boolean;isAdmin:boolean;
  onToggleActive:(next:boolean)=>void;
  onDelete:(reason:string)=>Promise<void>|void;deleteBlockers:string[];
}) {
  const isBus = tr.mode==="bus";
  const ModeIcon = isBus?Bus:Plane;
  const cover = tr.media?.find(m=>m.primary&&m.kind==="image")?.url||tr.media?.find(m=>m.kind==="image")?.url;
  /* المتوقفة تَبهت ولا تختفي: سطحها لون الصفحة وصورتها بلا ألوان، وأزرارها
     تبقى بوضوحها لأن «تفعيل» هو المخرج منها. */
  const paused = tr.status!=="active";
  return (
    <article className={`ui-card ui-card--hover overflow-hidden flex flex-col${paused?" ui-card--flat":""}`}
      style={paused?{background:B.bg}:undefined}>
      <div className="relative" style={{aspectRatio:"2 / 1",background:B.fill,borderBottom:`1px solid ${B.border}`}}>
        {cover
          ? <img src={cover} alt="" loading="lazy"
              style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",...(paused?{filter:"grayscale(1)",opacity:0.6}:null)}}/>
          : <span aria-hidden className="absolute inset-0 flex items-center justify-center" style={{color:B.borderStrong}}>
              <ModeIcon size={44} strokeWidth={1.25}/>
            </span>}
        {/* الشارة فوق أرضيةٍ بيضاء: حشوتها الباهتة تضيع على الصورة وعلى الغائر. */}
        <span className="absolute inline-flex rounded-full" style={{top:12,insetInlineStart:12,background:B.surface,boxShadow:ELEV[1]}}>
          <StatusBadge status={tr.status} entity="transport"/>
        </span>
      </div>
      <div className="flex flex-col flex-1 p-4 gap-3">
        {/* Name + ID */}
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-3">
            <h3 className="ui-card-title min-w-0" style={paused?{color:B.text2}:undefined}>{tr.name}</h3>
            <span dir="ltr" className="flex-shrink-0" style={{fontSize:12,color:B.muted,lineHeight:"21px"}}>{tr.id}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-1 min-w-0" style={{fontSize:13,color:B.text2}}>
            <ModeIcon size={14} style={{color:B.muted,flexShrink:0}}/>
            <span className="truncate">{tr.vehicleType||(isBus?"حافلة":"طيران")}</span>
          </div>
        </div>
        {/* السعة للحافلة وحدها: النوع يُسجَّل مرّة، وعدد مركباته بجانب مقاعده. */}
        {isBus&&(
          <div className="flex items-center gap-1.5 min-w-0" style={{fontSize:13,color:B.text2}}>
            <Armchair size={14} style={{color:B.muted,flexShrink:0}}/>
            <span className="truncate"><b style={{color:paused?B.text2:B.black,fontWeight:600}}>{tr.seats}</b> مقعد · {vehiclesWord(Math.max(1,tr.fleetCount??1))}</span>
          </div>
        )}

        {/* Features */}
        {tr.features.length>0 && (
          <div className="flex flex-wrap gap-1.5">
            {tr.features.slice(0,3).map(f=>{
              const Icon=transportFeatureIcon(f.icon);
              /* تجهيزةٌ قديمة بلا رمزٍ محفوظ تُكتب نصّاً وحده — لا نجمةٌ بديلة تتكرّر على كل وسم. */
              return <span key={f.id} style={featureTag}>{f.icon&&<Icon size={14} style={{color:B.muted,flexShrink:0}}/>}<span className="truncate">{f.text}</span></span>;
            })}
            {tr.features.length>3&&<span dir="ltr" style={{...featureTag,color:B.muted}} title={tr.features.slice(3).map(f=>f.text).filter(Boolean).join(" · ")}>+{tr.features.length-3}</span>}
          </div>
        )}

        {/* Actions */}
        {canWrite&&(
          <div className="mt-auto pt-3" style={{borderTop:`1px solid ${B.border}`}}>
            <EntityActions
              name={tr.name} label="المواصلة" canWrite={canWrite} isAdmin={isAdmin}
              onEdit={onEdit}
              active={tr.status==="active"} onToggleActive={onToggleActive} toggleAsLabel safeAlternative="الإيقاف"
              onPermanentDelete={onDelete} deleteBlockers={deleteBlockers}/>
          </div>
        )}
      </div>
    </article>
  );
}

/* قسمٌ معنون داخل النموذج: عنوانٌ وسطرُ شرحٍ وفعلُ القسم عند طرفه. */
function FormSection({title,sub,aside,first=false,children}:{title:ReactNode;sub?:ReactNode;aside?:ReactNode;first?:boolean;children:ReactNode}) {
  return (
    <section className="flex flex-col gap-3.5" style={first?undefined:{borderTop:`1px solid ${B.border}`,marginTop:8,paddingTop:20}}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        {/* العنوان ينكمش وسطرُ شرحه يلتفّ، فتبقى أفعال القسم بجانبه ما اتّسع السطر. */}
        <div className="min-w-0 flex-1" style={{flexBasis:220}}>
          <h3 className="ts-section-title flex items-center gap-2">{title}</h3>
          {sub&&<p className="ui-card-sub" style={{margin:"2px 0 0"}}>{sub}</p>}
        </div>
        {aside&&<div className="flex items-center gap-2 flex-wrap flex-shrink-0">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

/* فراغ قسمٍ داخل النموذج — سطرٌ هادئ لا لوحة. */
function FormEmpty({icon,children}:{icon:ReactNode;children:ReactNode}) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-xl text-center" style={{border:`1.5px dashed ${B.border}`,padding:"18px 16px",fontSize:13,lineHeight:1.6,color:B.muted}}>
      <span aria-hidden className="flex-shrink-0">{icon}</span><span>{children}</span>
    </div>
  );
}

/* زرّ اختيار ملف بهيئة الزرّ الثانوي. الحقل مخفيٌّ عن العين لا عن لوحة
   المفاتيح (sr-only لا hidden): يُبلَغ بـTab وتظهر حلقة التركيز على الزرّ. */
const pickRing="relative has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--k-gold)]";
function FileButton({accept,onChange,icon,variant="secondary",children}:{accept:string;onChange:ChangeEventHandler<HTMLInputElement>;icon?:ReactNode;variant?:"secondary"|"ghost";children:ReactNode}) {
  return (
    <label className={`ui-btn ui-btn--${variant} ui-btn--sm ${pickRing}`}>
      {icon}{children}
      <input type="file" accept={accept} className="sr-only" onChange={onChange}/>
    </label>
  );
}

/* ─── Transport Modal ─── */
const TRANSPORT_MEDIA_MAX = 8;
const TRANSPORT_MEDIA_CATS = ["المظهر الخارجي","المقاعد الداخلية","لوحة القيادة","وسائل الراحة","الأمتعة","أخرى"];
type ImportedTransportReview = Pick<TransportReview, "name" | "text" | "consent" | "rating">;

function csvCells(line:string, delimiter:string): string[] {
  const cells:string[]=[]; let cell=""; let quoted=false;
  for(let i=0;i<line.length;i++) {
    const char=line[i];
    if(char==='"') { if(quoted&&line[i+1]==='"') { cell+='"'; i++; } else quoted=!quoted; }
    else if(char===delimiter&&!quoted) { cells.push(cell.trim()); cell=""; }
    else cell+=char;
  }
  cells.push(cell.trim()); return cells;
}
function parsePublished(raw:string): boolean | null {
  const value=raw.trim().toLowerCase().replace(/\s/g,"");
  if(["منشور","نعم","نشر","published","publish","true","1","yes"].includes(value)) return true;
  if(["غيرمنشور","لا","مسودة","unpublished","draft","false","0","no"].includes(value)) return false;
  return null;
}
function parseTransportReviewsCsv(source:string): ImportedTransportReview[] {
  const lines=source.replace(/^\uFEFF/,"").split(/\r?\n/).filter(line=>line.trim());
  if(lines.length<2) throw new Error("الملف يحتاج صف العناوين ورأياً واحداً على الأقل.");
  const delimiter=(lines[0].match(/;/g)?.length??0)>(lines[0].match(/,/g)?.length??0)?";":",";
  const headers=csvCells(lines[0],delimiter).map(value=>value.replace(/\s/g,"").toLowerCase());
  const find=(names:string[])=>headers.findIndex(value=>names.includes(value));
  const nameAt=find(["اسمالعميل","اسم","الاسم","customername","name"]);
  const textAt=find(["نصالرأي","الرأي","راي","review","text","comment"]);
  const ratingAt=find(["التقييم","rating"]);
  const publishedAt=find(["حالةالنشر","حالة","النشر","published","publishstatus","status"]);
  if(nameAt<0||textAt<0||ratingAt<0||publishedAt<0) throw new Error("الأعمدة المطلوبة: اسم العميل، نص الرأي، التقييم، حالة النشر.");
  return lines.slice(1).map((line,index)=>{
    const cells=csvCells(line,delimiter);
    const name=(cells[nameAt]??"").trim(), text=(cells[textAt]??"").trim();
    const rating=Number((cells[ratingAt]??"").trim());
    const consent=parsePublished(cells[publishedAt]??"");
    if(!name||!text||!Number.isFinite(rating)||rating<1||rating>5||consent===null) {
      throw new Error(`تحقق من الصف ${index+2}: الاسم والرأي وتقييم من 1 إلى 5 وحالة نشر صحيحة مطلوبة.`);
    }
    return {name,text,rating,consent};
  });
}
function downloadTransportReviewTemplate() {
  const content="\uFEFFاسم العميل,نص الرأي,التقييم,حالة النشر\nأحمد محمد,رحلة مريحة والتنظيم ممتاز,5,منشور\n";
  const url=URL.createObjectURL(new Blob([content],{type:"text/csv;charset=utf-8"}));
  const link=document.createElement("a");
  link.href=url; link.download="نموذج-آراء-المواصلات.csv"; link.click();
  URL.revokeObjectURL(url);
}
type TransportEditorDraft = {
  form: Transport;
  baseline: Transport;
  editId: string | null;
  tab: TrTab;
  scrollByTab: Partial<Record<TrTab, number>>;
};

const TRANSPORT_DRAFT_KEY = "tsaheel.transport-editor-draft.v1";
const copyDraftValue = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const newTransport = (): Transport => ({ id:newId("TRN"),name:"",mode:"bus",vehicleType:"حافلة عادية",seats:49,seatCost:0,fleetCount:1,model:"",year:"",plate:"",driver:"",supervisor:"",status:"inactive",notes:"",features:[],reviews:[],media:[] });
const normalizeTransportStatus = (transport: Transport): Transport =>
  (transport.status as string) === "draft" ? { ...transport, status: "inactive" } : transport;
const createTransportDraft = (transport: Transport | null): TransportEditorDraft => {
  const form = copyDraftValue(normalizeTransportStatus(transport ?? newTransport()));
  return { form, baseline: copyDraftValue(form), editId: transport?.id ?? null, tab: "info", scrollByTab: {} };
};
function readTransportDraft(): TransportEditorDraft | null {
  try {
    const raw = sessionStorage.getItem(TRANSPORT_DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<TransportEditorDraft>;
    return draft.form && draft.baseline && typeof draft.editId !== "undefined" && draft.tab
      ? { form:normalizeTransportStatus(draft.form as Transport), baseline:normalizeTransportStatus(draft.baseline as Transport), editId:draft.editId ?? null, tab:draft.tab as TrTab, scrollByTab:draft.scrollByTab ?? {} }
      : null;
  } catch { return null; }
}

function TransportModal({draft,onSave,onCancel,seatFloor,onDraftChange}:{
  draft:TransportEditorDraft; onSave:(t:Transport)=>void; onCancel:()=>void;
  onDraftChange:(next:TransportEditorDraft)=>void;
  /* ٢٥) أكبر عدد مقاعد محجوز في رحلةٍ مرتبطة بهذه المركبة. تخفيض السعة
     تحته يترك معتمرين بمقاعدَ لا وجود لها — والحجز موجودٌ ومدفوع.
     التخفيض يُمنع؛ الزيادة حرّة. */
  seatFloor:number;
}) {
  const isEdit=draft.editId!==null;
  const [tab,setTab]=useState<TrTab>(draft.tab);
  const [featureIconTarget,setFeatureIconTarget]=useState<string|null>(null);
  const [showFeatGallery,setShowFeatGallery]=useState(false);
  const [form,setForm]=useState<Transport>(()=>copyDraftValue(draft.form));
  const formRef=useRef(form);
  const [reviewImport,setReviewImport]=useState<ImportedTransportReview[]|null>(null);
  const bodyRef=useRef<HTMLElement|null>(null);
  const anchorRef=useRef<HTMLDivElement>(null);
  const scrollByTabRef=useRef<Partial<Record<TrTab,number>>>(draft.scrollByTab);
  const snapshot = (nextForm:Transport, nextTab=tab, scrollByTab=scrollByTabRef.current) =>
    onDraftChange({ ...draft, form:copyDraftValue(nextForm), tab:nextTab, scrollByTab:{...scrollByTab} });
  const set=<K extends keyof Transport>(k:K,v:Transport[K])=>{
    const next={...formRef.current,[k]:v};
    formRef.current=next;
    setForm(next);
    snapshot(next);
  };
  const selectTab=(next:TrTab)=>{
    setTab(next);
    snapshot(form,next);
  };
  const saveScroll=()=>{
    if (!bodyRef.current) return;
    scrollByTabRef.current={...scrollByTabRef.current,[tab]:bodyRef.current.scrollTop};
    snapshot(form,tab,scrollByTabRef.current);
  };
  /* ما يُمرَّر هو جسم النافذة المشتركة، ولا مرجع إليه من هنا: يُلتقط من
     علامةٍ داخله ويُسمَع تمريره مباشرةً — فحفظ موضع كل تبويب في المسوّدة
     يبقى كما كان. والمستمع يقرأ آخر saveScroll لا نسخة أول رسم. */
  const saveScrollRef=useRef(saveScroll);
  saveScrollRef.current=saveScroll;
  useEffect(()=>{
    const el=anchorRef.current?.closest<HTMLElement>(".ui-modal-body")??null;
    bodyRef.current=el;
    if(!el) return;
    const onScroll=()=>saveScrollRef.current();
    el.addEventListener("scroll",onScroll,{passive:true});
    return ()=>el.removeEventListener("scroll",onScroll);
  },[]);
  useEffect(()=>{
    const frame=requestAnimationFrame(()=>{ if(bodyRef.current) bodyRef.current.scrollTop=scrollByTabRef.current[tab]??0; });
    return ()=>cancelAnimationFrame(frame);
  },[tab]);
  /* التجهيزات تُدار كسطورٍ لا كشبكة مضيئة — نفس نمط مرافق الفندق.

     الشبكة الوحيدة كانت تكذب: تعدّ سبعاً وتُضيء خمساً، لأن التجهيزات
     المحفوظة قديماً نصٌّ بلا رمز فلا يجد لها المعرض ما يُضيئه؛ ولا سبيل
     لحذفها ولا لتصحيح لفظها. والسطر يُظهر ما هو محفوظ فعلاً: رمزٌ
     يُبدَّل، ونصٌّ يُكتب كما يقرؤه المعتمر، وزرُّ حذف. */
  const addFeat=(icon:string,label:string)=>set("features",[...formRef.current.features,{id:uid(),icon,text:label}]);
  const delFeat=(id:string)=>set("features",formRef.current.features.filter(feature=>feature.id!==id));
  const updFeat=(id:string,text:string)=>set("features",formRef.current.features.map(feature=>feature.id===id?{...feature,text}:feature));
  const chooseFeatIcon=(id:string,icon:string)=>set("features",formRef.current.features.map(feature=>feature.id===id?{...feature,icon}:feature));
  const moveFeat=(id:string,dir:-1|1)=>{
    const next=[...formRef.current.features];
    const from=next.findIndex(feature=>feature.id===id); const to=from+dir;
    if(from<0||to<0||to>=next.length) return;
    [next[from],next[to]]=[next[to],next[from]]; set("features",next);
  };
  const addReview=()=>set("reviews",[...form.reviews,{id:uid(),name:"",text:"",consent:false,rating:5}]);
  const delReview=(id:string)=>set("reviews",form.reviews.filter(r=>r.id!==id));
  const updReview=(id:string,field:keyof TransportReview,val:any)=>set("reviews",form.reviews.map(r=>r.id===id?{...r,[field]:val}:r));
  const readReviewImport=(file?:File)=>{
    if(!file) return;
    const reader=new FileReader();
    reader.onerror=()=>toast.error("تعذّرت قراءة ملف الآراء");
    reader.onload=()=>{
      try {
        const rows=parseTransportReviewsCsv(String(reader.result??""));
        setReviewImport(rows);
      } catch(error) {
        setReviewImport(null);
        toast.error("ملف الآراء غير صالح",{description:error instanceof Error?error.message:"تحقق من الملف."});
      }
    };
    reader.readAsText(file,"UTF-8");
  };
  const confirmReviewImport=()=>{
    if(!reviewImport?.length) return;
    set("reviews",[...form.reviews,...reviewImport.map(review=>({...review,id:uid()}))]);
    toast.success(`تم استيراد ${reviewImport.length} رأي`);
    setReviewImport(null);
  };
  const media=form.media??[];
  const addMedia=(kind:MediaKind)=>{ if(media.length>=TRANSPORT_MEDIA_MAX) return; set("media",[...media,{id:uid(),kind,url:"",primary:kind==="image"&&!media.some(m=>m.primary&&m.kind==="image"),category:kind==="image"?TRANSPORT_MEDIA_CATS[0]:""}]); };
  const delMedia=(id:string)=>set("media",media.filter(m=>m.id!==id));
  const updMedia=(id:string,field:keyof HotelMedia,val:any)=>set("media",media.map(m=>m.id===id?{...m,[field]:val}:m));
  const setPrimaryMedia=(id:string)=>set("media",media.map(m=>({...m,primary:m.id===id&&m.kind==="image"})));
  const moveMedia=(id:string,dir:-1|1)=>{const arr=[...media];const i=arr.findIndex(m=>m.id===id);const j=i+dir;if(j<0||j>=arr.length)return;[arr[i],arr[j]]=[arr[j],arr[i]];set("media",arr);};
  const req=<span className="ui-req">*</span>;
  /* الحفظ يُمنع لسببين فقط — اسمٌ فارغ، وسعةٌ تحت المحجوز. الباقي يُمنع
     التفعيلَ لا الحفظ: الموظف يدّخر عملاً نصف مكتمل ويعود إليه. */
  const seatsTooLow=form.mode==="bus"&&form.seats<seatFloor;
  const saveBlock=!form.name.trim() ? "الاسم مطلوب" : seatsTooLow ? `السعة لا تنزل تحت ${seatFloor}` : "";
  const canSave=!saveBlock;

  /* ── التشغيل يُدار من البطاقة لا من داخل الملف ──

     التفعيل والإيقاف قرارُ أسطولٍ لا حقلُ نموذج: الموظف يرى الحافلات
     صفّاً في الصفحة فيوقف واحدةً أو يُعيدها، وحارسُ الجاهزية هناك قائم
     — يرفض التفعيل ويسمّي النواقص. فتكرارُه هنا كان يجعل النموذج
     يسأل سؤالاً لا يخصّه: الموظف جاء ليعرّف مركبةً تُربط بباقة، لا
     ليقرّر تشغيلها الساعة. والحالة تُحفظ كما جاءت. */
  function handleSave(){
    if(!canSave) return;
    onSave(form);
  }
  const gaps=gapsByTab(form);
  /* ٢٧) العدد داخل اسم التبويب لا في مكانٍ آخر: «المواصفات 3» يقول ما
     فيها، و«المعلومات · ينقص 2» يقول أين النقص — فلا يفتح الموظف أربعة
     تبويبات ليعرف أيّها ينتظره. والنقص يُكتب كلمةً لا رمز تحذيرٍ تعبيريّاً. */
  const count=(n:number)=>n>0?` ${n}`:"";
  const gap=(n:number)=>n>0?` · ينقص ${n}`:"";
  const TABS:{id:TrTab;label:string}[]=[
    {id:"info",    label:`المعلومات${gap(gaps.info)}`},
    {id:"features",label:`المواصفات${count(form.features.length)}${gap(gaps.features)}`},
    /* الوسائط بلا عدّاد في اسم التبويب — العدد وسقفه داخل اللوحة نفسها
       («٣ / ٨»)، ورقمٌ عارٍ في الشريط لا يقول أيّهما هو. */
    {id:"media",   label:`الصور والفيديوهات${gap(gaps.media)}`},
    {id:"reviews", label:`الآراء${count(form.reviews.length)}`},
  ];
  const BUS_TYPES=["حافلة عادية","حافلة VIP","ميني باص"];
  const FLIGHT_TYPES=["طيران داخلي","طيران دولي","طيران خاص"];
  const typeOptions=form.mode==="bus"?BUS_TYPES:FLIGHT_TYPES;
  const mediaFull=media.length>=TRANSPORT_MEDIA_MAX;
  /* المعرض يُطوى كما في مرافق الفندق: سبعٌ وعشرون شريحةً مفتوحةً دائماً تدفع
     السطور المحفوظة خارج الشاشة على الجوال. يُفتح للإضافة ولتبديل رمز، ويبقى
     مفتوحاً ما دامت القائمة فارغة — فلا يُسأل الموظف ضغطةً قبل أول تجهيزة. */
  const galleryOpen=showFeatGallery||!!featureIconTarget||form.features.length===0;
  const autosaveNote="التعديلات غير المحفوظة تُحفظ تلقائياً";
  return (
    <Modal open onClose={onCancel} width={760}
      title={isEdit?"تعديل المواصلة":"إضافة مواصلة"}
      sub={isEdit?<><span dir="ltr">{form.id}</span> · {autosaveNote}</>:autosaveNote}
      /* خطّ الشريط وخطّ حاويته على السطر نفسه: التبويبات تبدأ بمحاذاة المحتوى والخطّ يبلغ الحافتين. */
      toolbar={<div className="flex-shrink-0" style={{paddingInline:8,boxShadow:`inset 0 -1px 0 ${B.border}`}}>
        <TabStrip tabs={TABS} active={tab} onChange={selectTab} tone="onLight" idPrefix="trn"/>
      </div>}
      footer={<div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 w-full">
        {!canSave&&<span role="status" className={`${seatsTooLow?"ui-error":"ui-hint"} basis-full sm:basis-auto sm:order-last`} style={{margin:0}}>{saveBlock}</span>}
        <Button variant="primary" className="flex-1 sm:flex-none" icon={<Check size={16}/>} disabled={!canSave} onClick={handleSave}>حفظ المواصلة</Button>
        <Button variant="secondary" className="flex-1 sm:flex-none" onClick={onCancel}>إلغاء</Button>
      </div>}>
      {/* تبديل التبويب بلا انتظار خروج سابقه (TabPanel): المحتوى حاضر، والانتظار كان مصطنعاً. */}
      <div ref={anchorRef}>
        <TabPanel id="info" idPrefix="trn" active={tab==="info"}>
          <FormSection first title="التعريف">
            {/* Mode toggle */}
            <div>
              <div className="ui-label">وسيلة النقل{req}</div>
              <Segmented<VehicleMode> label="وسيلة النقل" value={form.mode}
                options={[{value:"bus",label:<><Bus size={16}/>حافلة</>},{value:"flight",label:<><Plane size={16}/>طيران</>}]}
                onChange={m=>{
                  set("mode",m);
                  if(m==="flight") {
                    set("vehicleType","طيران"); set("seats",0); set("seatCost",0);
                    set("model",""); set("year",""); set("status","inactive");
                  } else {
                    set("vehicleType","حافلة عادية");
                    if(formRef.current.seats<=0) set("seats",49);
                    set("status","inactive");
                  }
                }}/>
            </div>
            <div><Field label={<>{form.mode==="flight"?"اسم المواصلة / الطيران":"الاسم"}{req}</>}>
                   <Input value={form.name} placeholder={form.mode==="flight"?"مثال: طيران الرياض إلى جدة":"مثال: حافلة الحرمين 1"} onChange={e=>set("name",e.target.value)}/>
                 </Field></div>
          </FormSection>
          {form.mode==="flight"&&(
            <Note tone="neutral" icon={<Plane size={16}/>}>الطيران خيارُ نقلٍ يُعرض ضمن الباقة — لا تُدار مقاعده ولا تكلفته من هنا.</Note>
          )}
          {form.mode==="bus"&&<>
          <FormSection title="السعة والأسطول"
            sub="تُسجّل مواصفات هذا النوع مرة واحدة، ويُوزَّع عدد مركباته على الرحلات المتداخلة: رحلةٌ بثلاثة باصات تأخذ ثلاثة منه.">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div><Field label="النوع">
                     <AppSelect value={form.vehicleType} onChange={v=>set("vehicleType",v)} options={typeOptions.map(o=>({value:o,label:o}))}/>
                   </Field>
              </div>
              <div><Field label={<>عدد المقاعد{req}</>}
                     error={seatFloor>0&&form.seats<seatFloor?`لا تنزل تحت ${seatFloor} — محجوزة في رحلة مرتبطة.`:undefined}
                     hint={seatFloor>0?`الحدّ الأدنى ${seatFloor} مقعداً (محجوزة حالياً).`:undefined}>
                     <NumericInput min={Math.max(1,seatFloor)} className={`ui-input${form.seats<seatFloor?" is-invalid":""}`}
                       value={form.seats} onValueChange={v=>set("seats",Number(v))}/>
                   </Field></div>
              <div><Field label="عدد المركبات من هذا النوع">
                     <NumericInput min={1} className="ui-input" value={form.fleetCount ?? 1} onValueChange={v=>set("fleetCount",Math.max(1,Number(v)||1))}/>
                   </Field></div>
            </div>
          </FormSection>
          <FormSection title="التكلفة والمركبة">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div><Field label={<>تكلفة المقعد ({SAR}){req}</>}
                     hint={form.seatCost<=0?<span style={{color:TONE.warn.fg,fontWeight:600}}>صفرٌ ليس سعراً — تدخل هذه القيمة تسعير كل باقة مرتبطة.</span>:undefined}>
                     <NumericInput min={1} className="ui-input" value={form.seatCost} onValueChange={v=>set("seatCost",Number(v))}/>
                   </Field></div>
              <div><Field label="الشركة / الموديل">
                     <Input value={form.model} placeholder={form.mode==="bus"?"مرسيدس توريزمو":"شركة الطيران"} onChange={e=>set("model",e.target.value)}/>
                   </Field></div>
              <div><Field label="سنة التصنيع">
                     <NumericInput min={1990} max={new Date().getFullYear()+1} className="ui-input" value={form.year} placeholder="2024" onValueChange={v=>set("year",v)}/>
                   </Field></div>
            </div>
          </FormSection>
          </>}
        </TabPanel>

        <TabPanel id="features" idPrefix="trn" active={tab==="features"}>
          <FormSection first
            title={<>تجهيزات الحافلة{form.features.length>0&&<Badge>{form.features.length}</Badge>}</>}
            sub="اختر تجهيزةً لتُضاف سطراً، ثم عدّل اسمها كما سيظهر للعميل."
            aside={form.features.length>0&&(
              <Button size="sm" variant="secondary" icon={galleryOpen&&!featureIconTarget?<X size={14}/>:<Plus size={14}/>}
                onClick={()=>{setFeatureIconTarget(null);setShowFeatGallery(v=>!v);}}>
                {galleryOpen&&!featureIconTarget?"إغلاق المعرض":"إضافة تجهيزة"}
              </Button>)}>
            {/* المعرض شرائحُ برمزها واسمها: الرمز وحده كان يُختار على التخمين.
                والشريحة تُضيف سطراً ولا «تُضيء» — ما أُضيف يُقرأ في السطور تحتها. */}
            {galleryOpen&&(
            <div className="rounded-xl p-3" style={{background:B.fill,border:`1px solid ${B.border}`}}>
              {featureIconTarget&&<p style={{margin:"0 0 10px",fontSize:12,lineHeight:1.5,fontWeight:600,color:B.text3}}>اختر الرمز الجديد لهذه التجهيزة.</p>}
              <div className="flex flex-wrap gap-1.5">
                {TRANSPORT_FEATURE_CATALOG.map(({id,label,Icon})=>(
                  <button key={id} type="button" className="ui-chip" title={featureIconTarget?`استعمل رمز «${label}»`:`إضافة «${label}»`} onClick={()=>{
                    if(featureIconTarget) { chooseFeatIcon(featureIconTarget,id); setFeatureIconTarget(null); }
                    else addFeat(id,label);
                  }}><Icon size={15}/>{label}</button>
                ))}
              </div>
            </div>
            )}
            {form.features.length>0&&(
              <div className="flex flex-col gap-2">
                {form.features.map((f,idx)=>{ const Icon=transportFeatureIcon(f.icon); const picking=featureIconTarget===f.id; return (
                  <div key={f.id} className="flex gap-2 items-center">
                    {/* المحدَّد أسودُ لا ذهبي: هو موضع التبديل لا فعلٌ يُضغط. */}
                    <button type="button" aria-label="تغيير رمز التجهيزة" title="تغيير الرمز" aria-pressed={picking}
                      onClick={()=>setFeatureIconTarget(picking?null:f.id)} className="ui-iconbtn ui-iconbtn--outline"
                      style={{width:42,height:42,...(picking?{background:B.ink,borderColor:B.ink,color:B.onInk}:{background:B.fill,color:B.text3})}}><Icon size={18}/></button>
                    <Input className="flex-1 min-w-0" value={f.text} placeholder="مثال: واي فاي مجاني" aria-label="اسم التجهيزة" onChange={e=>updFeat(f.id,e.target.value)}/>
                    <div className="flex items-center flex-shrink-0">
                      <IconButton size="sm" label="تقديم التجهيزة" disabled={idx===0} onClick={()=>moveFeat(f.id,-1)}><ChevronUp size={16}/></IconButton>
                      <IconButton size="sm" label="تأخير التجهيزة" disabled={idx===form.features.length-1} onClick={()=>moveFeat(f.id,1)}><ChevronDown size={16}/></IconButton>
                      <IconButton size="sm" variant="danger" label="حذف التجهيزة" onClick={()=>delFeat(f.id)}><Trash2 size={15}/></IconButton>
                    </div>
                  </div>
                );})}
              </div>
            )}
            {form.features.length===0&&<FormEmpty icon={<Wrench size={18}/>}>لم تُضف تجهيزات بعد — اختر من المعرض أعلاه.</FormEmpty>}
          </FormSection>
        </TabPanel>

        <TabPanel id="media" idPrefix="trn" active={tab==="media"}>
          <FormSection first
            title={<>صور وفيديو المركبة<Badge tone={mediaFull?"danger":"neutral"}><span dir="ltr">{media.length} / {TRANSPORT_MEDIA_MAX}</span></Badge></>}
            sub="رتّب العناصر بالأسهم — أول صورة أساسية تظهر كغلاف المركبة."
            aside={<>
              <Button size="sm" variant="secondary" icon={<ImagePlus size={14}/>} disabled={mediaFull} onClick={()=>addMedia("image")}>صورة</Button>
              <Button size="sm" variant="secondary" icon={<Film size={14}/>} disabled={mediaFull} onClick={()=>addMedia("video")}>فيديو</Button>
            </>}>
            {media.map((m,idx)=>(
              <div key={m.id} className="ui-card ui-card--flat p-3 flex gap-3 items-start">
                <label title={m.url?"تغيير الملف":"اختر ملفاً"}
                  className={`rounded-xl overflow-hidden flex items-center justify-center cursor-pointer flex-shrink-0 bg-[var(--k-fill)] hover:bg-[var(--k-surface)] transition-colors ${pickRing}`}
                  style={{width:88,height:88,border:m.url?`1px solid ${B.border}`:`1.5px dashed ${B.borderStrong}`}}>
                  {m.url
                    ? (m.kind==="image"
                        ? <img src={m.url} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                        : <video src={m.url} style={{width:"100%",height:"100%",objectFit:"cover"}}/>)
                    : <div className="flex flex-col items-center gap-1" style={{color:B.muted}}>{m.kind==="image"?<ImagePlus size={20}/>:<Film size={20}/>}<span style={{fontSize:12}}>اختر ملفاً</span></div>}
                  <input type="file" accept={m.kind==="image"?"image/*":"video/*"} className="sr-only" onChange={onPickMedia("transport",url=>updMedia(m.id,"url",url))}/>
                </label>
                <div className="flex-1 flex flex-col gap-2 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap" style={{minHeight:32}}>
                    <span style={{fontSize:14,fontWeight:600,color:B.black}}>{m.kind==="image"?"صورة":"فيديو"} {idx+1}</span>
                    {m.kind==="image"&&(m.primary
                      ? <Badge style={{background:B.ink,color:B.onInk}}><Star size={12} fill={B.gold} stroke={B.gold}/>أساسية</Badge>
                      : <Button size="sm" variant="ghost" icon={<Star size={14}/>} onClick={()=>setPrimaryMedia(m.id)}>اجعلها أساسية</Button>)}
                  </div>
                  {m.kind==="image"&&(
                    <div style={{maxWidth:240}}>
                      <AppSelect ariaLabel="تصنيف الصورة" value={m.category} onChange={v=>updMedia(m.id,"category",v)}
                        options={TRANSPORT_MEDIA_CATS.map(c=>({value:c,label:c}))} placeholder="تصنيف الصورة"/>
                    </div>
                  )}
                </div>
                <div className="flex flex-col flex-shrink-0">
                  <IconButton size="sm" label="تقديم العنصر في الترتيب" onClick={()=>moveMedia(m.id,-1)} disabled={idx===0}><ChevronUp size={16}/></IconButton>
                  <IconButton size="sm" label="تأخير العنصر في الترتيب" onClick={()=>moveMedia(m.id,1)} disabled={idx===media.length-1}><ChevronDown size={16}/></IconButton>
                  <IconButton size="sm" variant="danger" label="حذف الصورة أو الفيديو" onClick={()=>delMedia(m.id)}><Trash2 size={15}/></IconButton>
                </div>
              </div>
            ))}
            {media.length===0&&(
              <button type="button" onClick={()=>addMedia("image")}
                className="flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer rounded-2xl border-[1.5px] border-dashed border-[var(--k-border-strong)] bg-[var(--k-fill)] hover:bg-[var(--k-surface)] hover:border-[var(--k-muted)] transition-colors"
                style={{color:B.text2,padding:16,minHeight:136,fontFamily:"inherit",filter:"none"}}>
                <ImagePlus size={22} style={{color:B.muted}}/>
                <span style={{fontSize:13,fontWeight:600}}>أضف صور المركبة</span>
                <span style={{fontSize:12,color:B.muted}}>أول صورةٍ تصير الغلاف — حتى {TRANSPORT_MEDIA_MAX} ملفات.</span>
              </button>
            )}
          </FormSection>
        </TabPanel>

        <TabPanel id="reviews" idPrefix="trn" active={tab==="reviews"}>
          <FormSection first title="آراء المعتمرين"
            sub="CSV مطلوب بالأعمدة: اسم العميل، نص الرأي، التقييم (1–5)، حالة النشر (منشور / غير منشور)."
            aside={<>
              <Button size="sm" variant="secondary" icon={<Download size={14}/>} onClick={downloadTransportReviewTemplate}>تحميل النموذج</Button>
              <FileButton accept=".csv,text/csv" icon={<FileUp size={14}/>} onChange={event=>{readReviewImport(event.target.files?.[0]);event.currentTarget.value="";}}>استيراد CSV</FileButton>
              <Button size="sm" variant="secondary" icon={<Plus size={14}/>} onClick={addReview}>إضافة</Button>
            </>}>
            {reviewImport&&(
              <div className="rounded-xl p-3 flex flex-col gap-3" style={{background:B.fill,border:`1px solid ${B.border}`}}>
                <strong style={{fontSize:14,fontWeight:600,color:B.black}}>معاينة قبل الاستيراد — {reviewImport.length} رأي</strong>
                <div className="ui-table-wrap" style={{boxShadow:"none",borderRadius:12}}>
                  <div className="ui-table-scroll">
                    <table className="ui-table" style={{minWidth:460}}>
                      <thead><tr><th>العميل</th><th>الرأي</th><th>التقييم</th><th>النشر</th></tr></thead>
                      <tbody>{reviewImport.slice(0,8).map((review,index)=><tr key={`${review.name}-${index}`}>
                        <td className="nowrap cell-main">{review.name}</td><td>{review.text}</td>
                        <td className="nowrap"><span dir="ltr">{review.rating} / 5</span></td>
                        <td className="nowrap">{review.consent?"منشور":"غير منشور"}</td>
                      </tr>)}</tbody>
                    </table>
                  </div>
                </div>
                {reviewImport.length>8&&<p style={{margin:0,fontSize:12,color:B.muted}}>تُعرض أول 8 آراء من أصل {reviewImport.length}.</p>}
                {/* داكنٌ لا ذهبي: الذهبي في هذه النافذة لـ«حفظ المواصلة» وحده. */}
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="dark" icon={<Check size={14}/>} onClick={confirmReviewImport}>اعتماد الاستيراد</Button>
                  <Button size="sm" variant="ghost" onClick={()=>setReviewImport(null)}>إلغاء</Button>
                </div>
              </div>
            )}
            {form.reviews.map((rv,idx)=>(
              <div key={rv.id} className="ui-card ui-card--flat p-3 flex gap-2 items-start">
                <div className="flex-1 flex flex-col gap-2 min-w-0">
                  <Input value={rv.name} placeholder="الاسم الأول" aria-label={`اسم صاحب الرأي ${idx+1}`} onChange={e=>updReview(rv.id,"name",e.target.value)}/>
                  <Textarea rows={2} value={rv.text} placeholder="ماذا قال عن المواصلة؟" aria-label={`نصّ الرأي ${idx+1}`} style={{minHeight:68}} onChange={e=>updReview(rv.id,"text",e.target.value)}/>
                  <div className="flex items-center gap-x-4 gap-y-2 flex-wrap">
                    <label className="inline-flex items-center gap-2 cursor-pointer" style={{fontSize:13,fontWeight:500,color:rv.consent?TONE.success.fg:B.text2}}>
                      <Switch checked={rv.consent} onChange={()=>updReview(rv.id,"consent",!rv.consent)} label="إذن النشر"/>
                      {rv.consent?"تم الإذن":"في انتظار الإذن"}
                    </label>
                    {typeof rv.rating==="number"&&(
                      <span className="inline-flex items-center gap-1.5" style={{fontSize:13,color:B.text2}}>
                        <Star aria-hidden size={14} fill={B.gold} stroke={B.gold}/>التقييم {rv.rating} من 5
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {rv.image&&(
                      <div className="rounded-lg overflow-hidden flex-shrink-0" style={{border:`1px solid ${B.border}`,width:44,height:44}}>
                        <img src={rv.image} alt="صورة مرفقة" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                      </div>
                    )}
                    <FileButton variant="ghost" accept="image/*" icon={<ImagePlus size={14}/>} onChange={onPickMedia("transport-reviews",url=>updReview(rv.id,"image",url))}>
                      {rv.image?"تغيير الصورة":"إرفاق صورة (اختياري)"}
                    </FileButton>
                    {rv.image&&<Button size="sm" variant="ghost" icon={<X size={14}/>} onClick={()=>updReview(rv.id,"image",undefined)}>إزالة الصورة</Button>}
                  </div>
                </div>
                <IconButton size="sm" variant="danger" label="حذف الرأي" onClick={()=>delReview(rv.id)}><Trash2 size={15}/></IconButton>
              </div>
            ))}
            {form.reviews.length===0&&!reviewImport&&<FormEmpty icon={<MessageSquareText size={18}/>}>لا آراء بعد — أضف رأياً يدوياً أو استورد ملف CSV.</FormEmpty>}
          </FormSection>
        </TabPanel>
      </div>
    </Modal>
  );
}

/* ─── Transport Page ─── */
export function TransportPage({onMenuOpen}:{onMenuOpen?:()=>void}={}) {
  /* بوابة الكتابة — مرآة can_write_admin() في القاعدة. كل نقاط فتح
     نموذج التعديل تمرّ من هنا، فالموظف لا يملأ نموذجاً ليُرفض في آخره. */
  const { canWrite, isAdmin } = useRole();
  const mayWrite = canWrite("transport");
  const transports=useStore(s=>s.transports); const setTransports=useStore(s=>s.setTransports);
  const trips=useStore(s=>s.trips); const packages=useStore(s=>s.packages);
  /* التعديلات غير المحفوظة في sessionStorage أيضاً، لا في ذاكرة الصفحة فقط. لذلك تبقى
     نافذة التعديل كما هي عند تبديل قسمٍ في اللوحة، وحتى لو أُعيد تركيب
     صفحة المواصلات لسببٍ تقني. لا تذهب إلا بحفظٍ أو إلغاءٍ صريح. */
  const [editorDraft,setEditorDraft]=useState<TransportEditorDraft|null>(()=>readTransportDraft());
  const saveEditorDraft=useCallback((next:TransportEditorDraft)=>{
    setEditorDraft(next);
    try { sessionStorage.setItem(TRANSPORT_DRAFT_KEY,JSON.stringify(next)); } catch { /* تبقى التعديلات في الذاكرة */ }
  },[]);
  const discardEditorDraft=useCallback(()=>{
    setEditorDraft(null);
    try { sessionStorage.removeItem(TRANSPORT_DRAFT_KEY); } catch { /* لا شيء */ }
  },[]);
  const openForm = (transport: Transport | null) => {
    if (!mayWrite) {
      toast.error("لا تملك صلاحية التعديل", { description: "هذه الشاشة يكتبها مدير النظام وحده." });
      return;
    }
    /* لا نكتب فوق تعديل مفتوح بالخطأ: يعود الموظف له أولاً أو يلغيها. */
    if (editorDraft) {
      toast.message("لديك تعديل غير محفوظ مفتوح بالفعل");
      return;
    }
    saveEditorDraft(createTransportDraft(transport));
  };
  const [search,setSearch]=useState("");
  /* التصفية على القيمة الساكنة لا على كل ضغطة مفتاح. */
  const query = useDebounced(search);
  const [modeFilter,setModeFilter]=useState<"all"|"bus"|"flight">("all");
  const [statusFilter,setStatusFilter]=useState<"all"|"active"|"inactive">("all");
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
    totalSeats:transports.reduce((a,t)=>a+t.seats*Math.max(1,t.fleetCount??1),0),
  };
  function handleSave(t:Transport){
    setTransports(p=>editorDraft?.editId?p.map(x=>x.id===t.id?t:x):[t,...p]);
    discardEditorDraft();
  }
  /* الإغلاق يسأل دائماً ثم يمحو المسوّدة — السؤال حوار اللوحة الموحَّد
     (confirmDialog) بدل حوارٍ منسوخٍ في هذا الملف؛ والمسار نفسه: «متابعة
     التعديل» تُبقي النافذة ومسوّدتها، و«إلغاء التعديلات» تمحوهما. */
  const requestCancel=()=>{
    if(!editorDraft) return;
    void confirmDialog({
      title:"إلغاء التعديلات؟",
      message:"ستُحذف كل التعديلات غير المحفوظة على بيانات المواصلة. لا يمكن التراجع عن هذا الإجراء.",
      confirmLabel:"إلغاء التعديلات", cancelLabel:"متابعة التعديل", tone:"danger",
    }).then(ok=>{ if(ok) discardEditorDraft(); });
  };

  /* موانع الحذف النهائي — تُعرض بنصّها لا تُخفي الزرّ.

     حذف مركبةٍ تحملها رحلةٌ أو باقة يترك مرجعاً معلّقاً: الرحلة تفقد
     سعتها والباقة تفقد نقلها، ويقرأ العميل «غير متوفّر» بلا سبب.
     والإيقاف يبقى متاحاً دائماً — هو الطريق الصحيح لمركبةٍ خرجت من
     الخدمة ولها تاريخ. */
  /* أرضية المقاعد: أكبر حجزٍ قائم على باصٍ واحد من رحلةٍ تحمل هذا النوع.
     الرحلة بثلاثة باصات و٦٠ محجوزاً تحتاج باصاً من ٢٠ مقعداً لا من ٦٠.
     الرحلات المنتهية مستثناة — مقاعدها لم تعد تُحجَز، وإبقاؤها يقفل السعة
     على رقمٍ من الماضي. */
  function seatFloorFor(id:string):number {
    const rows=trips.filter(t=>t.transportId===id&&isLive(t));
    return rows.length?Math.max(...rows.map(t=>Math.ceil((t.bookedSeats||0)/busCountOf(t)))):0;
  }

  function blockersFor(id:string):string[] {
    const out:string[]=[];
    const n=trips.filter(t=>t.transportId===id).length;
    if(n) out.push(`مرتبطة بـ${n} ${n===1?"رحلة":"رحلات"} — أوقفها بدل حذفها.`);
    const p=packages.filter(x=>x.transportId===id);
    if(p.length) out.push(`تعتمد عليها ${p.length===1?"باقة":`${p.length} باقات`}: ${p.map(x=>x.name).join(" · ")}`);
    return out;
  }
  const clearFilters=()=>{setSearch("");setModeFilter("all");setStatusFilter("all");};
  /* «لا شيء بعد» غير «لا شيء يطابق»: الأول يُخرَج منه بالإضافة، والثاني بإزالة المرشّحات. */
  const filteredOut=transports.length>0;
  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{background: B.bg}}>
      {/* زرّ الإضافة يُخفى لا يُعطَّل: زرٌّ مرئي يعد بعملٍ لا يُنجَز. */}
      <PageHeader title="المواصلات" crumb="إدارة المواصلات" search={search} onSearch={setSearch} onMenuOpen={onMenuOpen}
        searchPlaceholder="ابحث بالاسم أو المعرّف أو الموديل"
        actions={mayWrite&&<Button variant="primary" icon={<Plus size={16}/>} onClick={()=>{openForm(null);}}>
          <span className="hidden sm:inline">إضافة مواصلة</span><span className="sm:hidden">إضافة</span>
        </Button>}/>
      <div className="px-4 md:px-8 pt-1">
        {/* Stats — أربعٌ لا خمس: مقاعد الأسطول سطرٌ تحت عدد الحافلات، فهي
            مقاعدها وحدها. وكل بطاقةٍ تُرشِّح القائمة بما تعدّه. */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="كل المواصلات" value={stats.total} sub="في النظام" accent icon={<Layers size={15}/>} onClick={clearFilters}/>
          <StatCard label="نشطة" value={stats.active} sub={`${stats.total-stats.active} متوقفة`} icon={<CircleCheck size={15}/>} onClick={()=>setStatusFilter("active")}/>
          <StatCard label="حافلات" value={stats.buses} sub={`${stats.totalSeats.toLocaleString("en-US")} مقعد في الأسطول`} icon={<Bus size={15}/>} onClick={()=>setModeFilter("bus")}/>
          <StatCard label="طيران" value={stats.flights} sub="خيارات مسجّلة" icon={<Plane size={15}/>} onClick={()=>setModeFilter("flight")}/>
        </div>
        {/* Toolbar */}
        <div className="ts-toolbar">
          <Segmented<"all"|"active"|"inactive"> label="حالة المواصلة" value={statusFilter} onChange={setStatusFilter}
            options={[{value:"all",label:"الكل"},{value:"active",label:"نشط"},{value:"inactive",label:"متوقف"}]}/>
          <Segmented<"all"|"bus"|"flight"> label="وسيلة النقل" value={modeFilter} onChange={setModeFilter}
            options={[{value:"all",label:"كل الوسائل"},{value:"bus",label:<><Bus size={15}/>حافلات</>},{value:"flight",label:<><Plane size={15}/>طيران</>}]}/>
          <span className="ts-toolbar-end ts-count" aria-live="polite">
            {filtered.length===transports.length?transportsWord(transports.length):`${filtered.length} من ${transports.length}`}
          </span>
        </div>
      </div>
      <main className="flex-1 px-4 md:px-8 pb-8">
        <EntityGate entity="transports" label="المواصلات" skeleton="cards">
        {filtered.length===0
          ?<EmptyState
              icon={filteredOut?<SearchX size={22}/>:<Bus size={22}/>}
              title={filteredOut?"لا مواصلات تطابق البحث":"لا مواصلات بعد"}
              note={filteredOut?"جرّب كلمةً أخرى أو أزل المرشّحات.":"أضف أنواع الحافلات وخيارات الطيران لتُربط بالباقات والرحلات."}
              action={filteredOut
                ? <Button variant="secondary" onClick={clearFilters}>إزالة المرشّحات</Button>
                : mayWrite&&<Button variant="primary" icon={<Plus size={16}/>} onClick={()=>{openForm(null);}}>إضافة مواصلة</Button>}/>
          :<div className="grid gap-4" style={{gridTemplateColumns:"repeat(auto-fill,minmax(min(100%,300px),1fr))"}}>
            {filtered.map(t=>(
              <TransportCard key={t.id} tr={t} canWrite={mayWrite} isAdmin={isAdmin}
                onEdit={()=>{openForm(t);}}
                onToggleActive={next=>{
                  if(next) {
                    const readiness=transportReadiness(t);
                    if(!readiness.canActivate) {
                      toast.error("أكمل بيانات المواصلة قبل تفعيلها",{description:readiness.blockers.map(item=>item.label).join(" · ")});
                      return;
                    }
                  }
                  setTransports(p=>p.map(x=>x.id===t.id?{...x,status:next?"active":"inactive"}:x));
                }}
                onDelete={async reason=>{
                  await permanentlyDelete("transports",t.id,reason);
                  writeLocalOnly(()=>setTransports(p=>p.filter(x=>x.id!==t.id)));
                }}
                deleteBlockers={blockersFor(t.id)}/>
            ))}
          </div>
        }
        </EntityGate>
      </main>
      {editorDraft&&<TransportModal draft={editorDraft} seatFloor={editorDraft.editId?seatFloorFor(editorDraft.editId):0}
        onDraftChange={saveEditorDraft} onSave={handleSave} onCancel={requestCancel}/>}
    </div>
  );
}
