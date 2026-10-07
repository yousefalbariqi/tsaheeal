import { useId, useRef, useState, type CSSProperties, type ChangeEventHandler, type ReactNode } from "react";
import {
  Building2, MapPin, Star, Plus, Trash2, X, Check, CircleCheck,
  ImagePlus, ArrowRight, ArrowLeft, ChevronUp, ChevronDown, Film, FileUp,
  ExternalLink, SearchX, MessageSquareText,
} from "lucide-react";
import { B, TONE, ELEV } from "@/lib/theme";
import { useDebounced } from "@/lib/useDebounced";
import { EntityGate, EmptyState } from "@/components/States";
import { Badge, Button, IconButton, Input, Textarea, Modal, Segmented } from "@/components/ui";
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
import { useConfirmDiscard } from "@/lib/useUnsavedGuard";

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

/* التصنيف نجومٌ مرسومة لا حروف «★»: الحرف يتبع خطّ النظام فيتبدّل حجمه
   ولونه من جهازٍ لآخر، وقارئ الشاشة يقرؤه «نجمة سوداء» خمس مرّات. هنا
   صورةٌ واحدة باسمٍ واحد: «4 من 5 نجوم». */
function Stars({n,size=14,muted=false}:{n:number;size?:number;muted?:boolean}) {
  return (
    <span role="img" aria-label={`${n} من 5 نجوم`} className="inline-flex items-center gap-0.5 flex-shrink-0">
      {Array.from({length:5},(_,i)=>{
        const on=i<n; const c=on?(muted?B.muted:B.gold):B.borderStrong;
        return <Star key={i} aria-hidden size={size} fill={on?c:"none"} stroke={c} strokeWidth={1.75}/>;
      })}
    </span>
  );
}

const starsWord=(n:number)=>`${n} ${n>=3&&n<=10?"نجوم":"نجمة"}`;
const hotelsWord=(n:number)=>`${n} ${n>=3&&n<=10?"فنادق":"فندق"}`;

/* وسم المرفق على البطاقة — للقراءة لا للضغط، فليس شريحة ترشيح. */
const featureTag:CSSProperties={display:"inline-flex",alignItems:"center",gap:6,height:26,padding:"0 10px",borderRadius:999,
  background:B.fill,border:`1px solid ${B.border}`,color:B.text3,fontSize:12,fontWeight:500,whiteSpace:"nowrap",maxWidth:"100%"};

function HotelCard({hotel,actions}:{hotel:Hotel;actions?:ReactNode}) {
  /* ما ينقص يُقرأ من القائمة لا بفتح كل فندق. سطرٌ هادئ لا صندوق إنذار:
     النقص هنا لم يعد يمنع شيئاً بعد أن انتقل البيع إلى الباقة. */
  const missing = hotelReadiness(hotel).missing;
  const cover = hotelCover(hotel);
  /* المتوقف يَبهت ولا يختفي: سطحه لون الصفحة وصورته بلا ألوان، فتقع العين
     على النشط أولاً — وأزراره تبقى بوضوحها لأن «تفعيل» هو المخرج منه. */
  const paused = hotel.status!=="active";
  const place = [hotel.district,hotel.city].filter(Boolean).join(" · ");
  return (
    <article className={`ui-card ui-card--hover overflow-hidden flex flex-col${paused?" ui-card--flat":""}`}
      style={paused?{background:B.bg}:undefined}>
      <div className="relative" style={{aspectRatio:"2 / 1",background:B.fill,borderBottom:`1px solid ${B.border}`}}>
        {cover
          ? <img src={cover} alt="" loading="lazy"
              style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",...(paused?{filter:"grayscale(1)",opacity:0.6}:null)}}/>
          : <span aria-hidden className="absolute inset-0 flex items-center justify-center" style={{color:B.borderStrong}}>
              <Building2 size={44} strokeWidth={1.25}/>
            </span>}
        {/* الشارة فوق أرضيةٍ بيضاء: حشوتها الباهتة تضيع على الصورة وعلى الغائر. */}
        <span className="absolute inline-flex rounded-full" style={{top:12,insetInlineStart:12,background:B.surface,boxShadow:ELEV[1]}}>
          <StatusBadge status={hotel.status} entity="hotel"/>
        </span>
      </div>
      <div className="flex flex-col flex-1 p-4 gap-3">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-3">
            <h3 className="ui-card-title min-w-0" style={paused?{color:B.text2}:undefined}>{hotelDisplayName(hotel.name)}</h3>
            <span dir="ltr" className="flex-shrink-0" style={{fontSize:12,color:B.muted,lineHeight:"21px"}}>{hotel.id}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-1 min-w-0" style={{fontSize:13,color:B.text2}}>
            <MapPin size={14} style={{color:B.muted,flexShrink:0}}/>
            <span className="truncate">{place||"—"}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Stars n={hotel.stars} muted={paused}/>
          <span aria-hidden style={{fontSize:12,color:B.muted}}>{starsWord(hotel.stars)}</span>
        </div>
        {hotel.features.length>0 && (
          <div className="flex flex-wrap gap-1.5">
            {hotel.features.slice(0,3).map(f=>{const Icon=hotelFeatureIcon(f.icon);return(
              <span key={f.id} style={featureTag}>
                <Icon size={14} style={{color:B.muted,flexShrink:0}}/><span className="truncate">{f.text}</span>
              </span>
            );})}
            {hotel.features.length>3&&<span dir="ltr" style={{...featureTag,color:B.muted}} title={hotel.features.slice(3).map(f=>f.text).filter(Boolean).join(" · ")}>+{hotel.features.length-3}</span>}
          </div>
        )}
        {missing.length>0&&(
          <div className="flex items-start gap-2" style={{fontSize:12,lineHeight:1.6,color:TONE.warn.fg}}>
            <span aria-hidden className="rounded-full flex-shrink-0" style={{width:6,height:6,marginTop:7,background:"currentColor"}}/>
            <span>ينقصه: {missing.map(m=>m.label).join(" · ")}</span>
          </div>
        )}
        {actions&&<div className="mt-auto pt-3" style={{borderTop:`1px solid ${B.border}`}}>{actions}</div>}
      </div>
    </article>
  );
}

/* قسمٌ معنون داخل النموذج: عنوانٌ وسطرُ شرحٍ وفعلُ القسم عند طرفه. */
function FormSection({title,sub,aside,first=false,children}:{title:ReactNode;sub?:ReactNode;aside?:ReactNode;first?:boolean;children:ReactNode}) {
  return (
    <section className="flex flex-col gap-3.5" style={first?undefined:{borderTop:`1px solid ${B.border}`,marginTop:24,paddingTop:20}}>
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

/* فراغ قسمٍ داخل النموذج — سطرٌ هادئ لا لوحة: فراغ القائمة الكبير (EmptyState)
   يأكل نصف النافذة إن تكرّر في كل قسم. */
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
  const requestClose=useConfirmDiscard(form,onClose);
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
     ما يمنع العميل من رؤية شيءٍ ناقص هو حالة الباقة لا حالة الفندق.
     والاسم الفارغ يُقال تحت حقله ويُعاد إليه التركيز — لا في إشعارٍ عابر
     يزول والحقل خارج الشاشة في نموذجٍ بهذا الطول. */
  const [nameMissing,setNameMissing]=useState(false);
  const nameRef=useRef<HTMLInputElement>(null);
  const mapId=useId();
  const submit = () => {
    const name = cleanHotelName(form.name);
    if (!name) { setNameMissing(true); nameRef.current?.focus(); return; }
    onSave({ ...form, name });
  };
  const showNameMissing=nameMissing&&!cleanHotelName(form.name);
  const mediaFull=media.length>=HOTEL_MEDIA_MAX;

  return (
    <Modal open onClose={requestClose} width={760}
      title={isEdit?"تعديل الفندق":"إضافة فندق"}
      sub={isEdit?<span dir="ltr">{form.id}</span>:"الاسم وحده مطلوب، والباقي يُكمَل متى توفّر."}
      footer={<>
        <Button variant="primary" icon={<Check size={16}/>} onClick={submit}>حفظ الفندق</Button>
        <Button variant="secondary" onClick={requestClose}>إلغاء</Button>
      </>}>

      {/* ── بيانات الفندق ── */}
      <FormSection first title="بيانات الفندق">
        <div>
          <Field label={<>اسم الفندق<span className="ui-req">*</span></>}
            error={showNameMissing?"اسم الفندق مطلوب":undefined}
            hint={nameError
              ? <span style={{color:TONE.warn.fg,fontWeight:600}}>{nameError}</span>
              : form.name.trim()
                ? <>يظهر للعميل: <b style={{color:B.text3,fontWeight:600}}>{hotelDisplayName(form.name)}</b></>
                : "اكتبه بلا كلمة «فندق» — تُضاف تلقائياً عند العرض."}>
            <Input ref={nameRef} invalid={showNameMissing} value={form.name} placeholder="مثال: دار الإيمان جراند"
              onChange={e=>set("name",e.target.value)} onBlur={()=>set("name",cleanHotelName(form.name))}/>
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          <div><Field label="المدينة">
                 <AppSelect value={form.city} onChange={v=>set("city",v as Hotel["city"])} options={[{value:"مكة",label:"مكة"},{value:"المدينة",label:"المدينة"}]}/>
               </Field></div>
          <div><Field label="الحي">
                 <Input value={form.district} placeholder="أجياد" onChange={e=>set("district",e.target.value)}/>
               </Field></div>
          <div><Field label="التصنيف">
                 <AppSelect value={String(form.stars)} onChange={v=>set("stars",Number(v) as Hotel["stars"])}
                   options={[5,4,3,2].map(n=>({value:String(n),label:<span className="flex items-center gap-2"><Stars n={n}/><span aria-hidden>{starsWord(n)}</span></span>}))}/>
               </Field></div>
        </div>
        <div>
          <label className="ui-label" htmlFor={mapId}>رابط الموقع في خرائط Google</label>
          {/* الرابط لاتينيّ: الحقل وأيقونته في اتجاهٍ واحد، فلا تقع الأيقونة فوق آخر النصّ. */}
          <div className="relative" dir="ltr">
            <MapPin size={16} style={{color:B.muted,position:"absolute",top:"50%",insetInlineStart:13,transform:"translateY(-50%)",pointerEvents:"none"}}/>
            <Input id={mapId} type="url" inputMode="url" style={{paddingInlineStart:38}} value={form.mapUrl} placeholder="https://maps.google.com/..." onChange={e=>set("mapUrl",e.target.value)}/>
          </div>
          {form.mapUrl&&<a href={form.mapUrl} target="_blank" rel="noreferrer" className="ui-btn ui-btn--link" style={{marginTop:8,fontSize:13}}>فتح الموقع في خرائط Google<ExternalLink size={14}/></a>}
        </div>
      </FormSection>

      {/* ── المرافق ── */}
      <FormSection title="المرافق" sub="ما يظهر للعميل في بطاقة الفندق."
        aside={
          <Button size="sm" variant="secondary" icon={galleryOpen&&!featureIconTarget?<X size={14}/>:<Plus size={14}/>}
            onClick={()=>{setFeatureIconTarget(null);setShowFeatIcons(v=>!v);}}>
            {galleryOpen&&!featureIconTarget?"إغلاق المعرض":"إضافة مرفق"}
          </Button>}>
        {/* معرض الرموز يُطوى: عشرون رمزاً مفتوحةً دائماً تجعل النموذج
            يبدو لوحة إعدادات، وهي لا تُستعمل إلّا لحظة الإضافة. */}
        {galleryOpen&&(
          <div className="rounded-xl p-3" style={{background:B.fill,border:`1px solid ${B.border}`}}>
            <p style={{margin:"0 0 10px",fontSize:12,lineHeight:1.5,color:featureIconTarget?B.text3:B.muted,fontWeight:featureIconTarget?600:400}}>
              {featureIconTarget?"اختر الرمز الجديد لهذا المرفق.":"اختر رمزاً ليُضاف سطرٌ تكتب فيه اسم المرفق."}
            </p>
            <div className="grid gap-1.5" style={{gridTemplateColumns:"repeat(auto-fill, minmax(40px, 1fr))"}}>
              {HOTEL_FEATURE_CATALOG.map(({id,label,Icon})=>(
                <IconButton key={id} variant="outline" label={label} style={{width:"100%",height:40}} onClick={()=>{
                  if(featureIconTarget) { chooseFeatIcon(featureIconTarget,id); setFeatureIconTarget(null); }
                  else addFeat(id);
                }}><Icon size={18}/></IconButton>
              ))}
            </div>
          </div>
        )}
        {form.features.length>0&&(
          <div className="flex flex-col gap-2">
            {form.features.map((f,idx)=>{ const Icon=hotelFeatureIcon(f.icon); const picking=featureIconTarget===f.id; return (
              <div key={f.id} className="flex gap-2 items-center">
                {/* المحدَّد أسودُ لا ذهبي: هو موضع التبديل لا فعلٌ يُضغط. */}
                <button type="button" aria-label="تغيير رمز المرفق" title="تغيير الرمز" aria-pressed={picking}
                  onClick={()=>setFeatureIconTarget(picking?null:f.id)} className="ui-iconbtn ui-iconbtn--outline"
                  style={{width:42,height:42,...(picking?{background:B.ink,borderColor:B.ink,color:B.onInk}:{background:B.fill,color:B.text3})}}><Icon size={18}/></button>
                <Input className="flex-1 min-w-0" value={f.text} placeholder="مثال: إفطار مجاني" aria-label="اسم المرفق" onChange={e=>updFeat(f.id,"text",e.target.value)}/>
                <div className="flex items-center flex-shrink-0">
                  <IconButton size="sm" label="تقديم المرفق" disabled={idx===0} onClick={()=>moveFeat(f.id,-1)}><ChevronUp size={16}/></IconButton>
                  <IconButton size="sm" label="تأخير المرفق" disabled={idx===form.features.length-1} onClick={()=>moveFeat(f.id,1)}><ChevronDown size={16}/></IconButton>
                  <IconButton size="sm" variant="danger" label="حذف المرفق" onClick={()=>delFeat(f.id)}><Trash2 size={15}/></IconButton>
                </div>
              </div>
            );})}
          </div>
        )}
        {form.features.length===0&&!galleryOpen&&(
          <FormEmpty icon={<CircleCheck size={18}/>}>لا مرافق بعد — أضف ما يميّز الفندق: إفطار، نقل للحرم، واي فاي…</FormEmpty>
        )}
      </FormSection>

      {/* ── الصور ── */}
      <FormSection
        title={<>صور الفندق<Badge tone={mediaFull?"danger":"neutral"}><span dir="ltr">{media.length} / {HOTEL_MEDIA_MAX}</span></Badge></>}
        sub="الصورة الموسومة «الغلاف» هي التي يراها العميل أولاً."
        aside={!mediaFull&&(
          <FileButton accept="video/*" icon={<Film size={14}/>} onChange={onPickMedia("hotels",url=>appendMedia("video",url))}>إضافة فيديو</FileButton>
        )}>
        <div className="grid gap-3" style={{gridTemplateColumns:"repeat(auto-fill,minmax(148px,1fr))"}}>
          {media.map((m,idx)=>(
            <div key={m.id} className="ui-card ui-card--flat overflow-hidden flex flex-col">
              <div className="relative" style={{aspectRatio:"4 / 3",background:B.fill}}>
                {m.url
                  ? (m.kind==="image"
                      ? <img src={m.url} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                      : <video src={m.url} style={{width:"100%",height:"100%",objectFit:"cover"}}/>)
                  /* صفٌّ قديم بلا رابط — يبقى قابلاً للإصلاح لا معطوباً. */
                  : <label className={`absolute inset-0 flex flex-col items-center justify-center gap-1 cursor-pointer ${pickRing}`} style={{color:B.muted}}>
                      {m.kind==="image"?<ImagePlus size={18}/>:<Film size={18}/>}<span style={{fontSize:12}}>اختر ملفاً</span>
                      <input type="file" accept={m.kind==="image"?"image/*":"video/*"} className="sr-only" onChange={onPickMedia("hotels",url=>updMedia(m.id,"url",url))}/>
                    </label>}
                {(m.primary||m.kind==="video")&&(
                  <span className="absolute inline-flex" style={{top:6,insetInlineStart:6}}>
                    <Badge style={{background:B.ink,color:B.onInk}}>{m.kind==="video"?<><Film size={12}/>فيديو</>:"الغلاف"}</Badge>
                  </span>
                )}
              </div>
              <div className="flex items-center p-1" style={{borderTop:`1px solid ${B.border}`}}>
                {m.kind==="image"&&(
                  <IconButton size="sm" aria-pressed={m.primary} label={m.primary?"صورة الغلاف":"اجعلها الغلاف"} onClick={()=>setPrimaryMedia(m.id)}>
                    <Star size={15} fill={m.primary?B.gold:"none"} stroke={m.primary?B.gold:"currentColor"}/>
                  </IconButton>
                )}
                {/* الشبكة تُقرأ من اليمين: «تقديم» يحرّك الصورة يميناً نحو الأولى. */}
                <IconButton size="sm" label="تقديم في الترتيب" disabled={idx===0} onClick={()=>moveMedia(m.id,-1)}><ArrowRight size={15}/></IconButton>
                <IconButton size="sm" label="تأخير في الترتيب" disabled={idx===media.length-1} onClick={()=>moveMedia(m.id,1)}><ArrowLeft size={15}/></IconButton>
                <IconButton size="sm" variant="danger" className="ms-auto" label="حذف الملف" onClick={()=>delMedia(m.id)}><Trash2 size={15}/></IconButton>
              </div>
            </div>
          ))}
          {!mediaFull&&(
            <label className={`flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer rounded-2xl border-[1.5px] border-dashed border-[var(--k-border-strong)] bg-[var(--k-fill)] hover:bg-[var(--k-surface)] hover:border-[var(--k-muted)] transition-colors ${pickRing}`}
              style={{color:B.text2,padding:16,minHeight:media.length?undefined:136,gridColumn:media.length?undefined:"1 / -1"}}>
              <ImagePlus size={22} style={{color:B.muted}}/>
              <span style={{fontSize:13,fontWeight:600}}>{media.length?"إضافة صورة":"أضف صور الفندق"}</span>
              {media.length===0&&<span style={{fontSize:12,color:B.muted}}>أول صورةٍ تصير الغلاف — حتى {HOTEL_MEDIA_MAX} ملفات.</span>}
              <input type="file" accept="image/*" className="sr-only" onChange={onPickMedia("hotels",url=>appendMedia("image",url))}/>
            </label>
          )}
        </div>
      </FormSection>

      {/* ── الآراء ── */}
      <FormSection title="آراء النزلاء" sub={<>استيراد CSV بعمودين: <b style={{color:B.text3,fontWeight:600}}>الاسم، الرأي</b>.</>}
        aside={<>
          <FileButton accept=".csv,text/csv" icon={<FileUp size={14}/>} onChange={event=>{ importReviews(event.target.files?.[0]); event.currentTarget.value=""; }}>استيراد CSV</FileButton>
          <Button size="sm" variant="secondary" icon={<Plus size={14}/>} onClick={addReview}>إضافة رأي</Button>
        </>}>
        {form.reviews.map((rv,idx)=>(
          <div key={rv.id} className="ui-card ui-card--flat p-3 flex gap-2 items-start">
            <div className="flex-1 flex flex-col gap-2 min-w-0">
              <Input value={rv.name} placeholder="الاسم الأول" aria-label={`اسم صاحب الرأي ${idx+1}`} onChange={e=>updReview(rv.id,"name",e.target.value)}/>
              <Textarea rows={2} value={rv.text} placeholder="ماذا قال؟" aria-label={`نصّ الرأي ${idx+1}`} style={{minHeight:68}} onChange={e=>updReview(rv.id,"text",e.target.value)}/>
              <div className="flex items-center gap-2 flex-wrap">
                {rv.image&&(
                  <div className="relative rounded-lg overflow-hidden flex-shrink-0" style={{border:`1px solid ${B.border}`,width:44,height:44}}>
                    <img src={rv.image} alt="صورة مرفقة" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                  </div>
                )}
                <FileButton variant="ghost" accept="image/*" icon={<ImagePlus size={14}/>} onChange={onPickMedia("hotel-reviews",url=>updReview(rv.id,"image",url))}>
                  {rv.image?"تغيير الصورة":"صورة — اختياري"}
                </FileButton>
                {rv.image&&<Button size="sm" variant="ghost" icon={<X size={14}/>} onClick={()=>updReview(rv.id,"image",undefined)}>إزالة الصورة</Button>}
              </div>
            </div>
            <IconButton size="sm" variant="danger" label="حذف الرأي" onClick={()=>delReview(rv.id)}><Trash2 size={15}/></IconButton>
          </div>
        ))}
        {form.reviews.length===0&&(
          <FormEmpty icon={<MessageSquareText size={18}/>}>لا آراء بعد — أضف رأياً يدوياً أو استورد ملف CSV.</FormEmpty>
        )}
      </FormSection>
    </Modal>
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
  const clearFilters=()=>{setSearch("");setCityFilter("all");setStatusFilter("all");};
  /* «لا شيء بعد» غير «لا شيء يطابق»: الأول يُخرَج منه بالإضافة، والثاني بإزالة المرشّحات. */
  const filteredOut=hotels.length>0;
  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{background: B.bg}}>
      {/* زرّ الإضافة يُخفى لا يُعطَّل: زرٌّ مرئي يعد بعملٍ لا يُنجَز. */}
      <PageHeader title="الفنادق" crumb="إدارة الفنادق" search={search} onSearch={setSearch} onMenuOpen={onMenuOpen}
        actions={mayWrite&&<Button variant="primary" icon={<Plus size={16}/>} onClick={()=>{openForm(null);}}>
          <span className="hidden sm:inline">إضافة فندق</span><span className="sm:hidden">إضافة</span>
        </Button>}/>
      <div className="px-4 md:px-8 pt-1">
        {/* كل بطاقةٍ تُرشِّح القائمة بما تعدّه، فلا يُكرَّر العدّ على شرائح الترشيح. */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="كل الفنادق" value={stats.total} sub="في النظام" accent icon={<Building2 size={15}/>} onClick={clearFilters}/>
          <StatCard label="نشطة" value={stats.active} sub={`${stats.total-stats.active} متوقفة`} icon={<CircleCheck size={15}/>} onClick={()=>setStatusFilter("active")}/>
          <StatCard label="مكة" value={stats.mecca} sub="مسجّلة" icon={<MapPin size={15}/>} onClick={()=>setCityFilter("مكة")}/>
          <StatCard label="المدينة" value={stats.madinah} sub="مسجّلة" icon={<MapPin size={15}/>} onClick={()=>setCityFilter("المدينة")}/>
        </div>
        <div className="ts-toolbar">
          <Segmented<"all"|"active"|"inactive"> label="حالة الفندق" value={statusFilter} onChange={setStatusFilter}
            options={[{value:"all",label:"الكل"},{value:"active",label:"نشط"},{value:"inactive",label:"متوقف"}]}/>
          <Segmented<"all"|"مكة"|"المدينة"> label="المدينة" value={cityFilter} onChange={setCityFilter}
            options={[{value:"all",label:"كل المدن"},{value:"مكة",label:"مكة"},{value:"المدينة",label:"المدينة"}]}/>
          <span className="ts-toolbar-end ts-count" aria-live="polite">
            {filtered.length===hotels.length?hotelsWord(hotels.length):`${filtered.length} من ${hotels.length}`}
          </span>
        </div>
      </div>
      <main className="flex-1 px-4 md:px-8 pb-8">
        <EntityGate entity="hotels" label="الفنادق" skeleton="cards">
        {filtered.length===0
          ?<EmptyState
              icon={filteredOut?<SearchX size={22}/>:<Building2 size={22}/>}
              title={filteredOut?"لا فنادق تطابق البحث":"لا فنادق بعد"}
              note={filteredOut?"جرّب كلمةً أخرى أو أزل المرشّحات.":"أضف الفنادق التي تتعامل معها لتُربط بالباقات."}
              action={filteredOut
                ? <Button variant="secondary" onClick={clearFilters}>إزالة المرشّحات</Button>
                : mayWrite&&<Button variant="primary" icon={<Plus size={16}/>} onClick={()=>{openForm(null);}}>إضافة فندق</Button>}/>
          :<div className="grid gap-4" style={{gridTemplateColumns:"repeat(auto-fill,minmax(min(100%,300px),1fr))"}}>
            {filtered.map(h=>(
              <HotelCard key={h.id} hotel={h}
                actions={mayWrite&&(
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
                )}/>
            ))}
          </div>
        }
        </EntityGate>
      </main>
      {showModal&&<HotelModal initial={editTarget} onSave={handleSave} onClose={()=>setShowModal(false)}/>}
    </div>
  );
}
