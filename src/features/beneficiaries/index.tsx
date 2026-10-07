import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useSearchParams } from "react-router";
import { AnimatePresence } from "motion/react";
import { Plus, Users, CreditCard, Ticket, ArrowRight, Link2, ShieldAlert, Copy as CopyIcon, Star, Award, Pencil, ChevronLeft, SearchX, Ban, FileX, CirclePause, CirclePlay, AlertCircle, BookOpen } from "lucide-react";
import { B, TONE } from "@/lib/theme";
import { useDebounced } from "@/lib/useDebounced";
import { useServerPagedSearch } from "@/lib/useServerSearch";
import type { Beneficiary, Payment, Booking, TicketEntry } from "@/types";
import { StatusBadge } from "@/components/StatusBadge";
import { StatCard } from "@/components/StatCard";
import { PageHeader } from "@/components/PageHeader";
import { NationalitySelect } from "@/components/NationalitySelect";
import { ArabicDatePicker } from "@/components/ArabicDatePicker";
import { useStore } from "@/store/useStore";
import { InvoiceModal } from "@/features/payments";
import { TicketCard } from "@/features/tickets";
import { newId } from "@/lib/utils";
import { bookingsOf, planLink, applyLink, planIsEmpty, findDuplicates, mergeLocally, type DupPair, type LinkPlan } from "./link";
import { fetchPrivate, savePrivate, mergeBeneficiaries, ensureBookingBeneficiaries } from "./ops";
import { DOC_TYPES, docTypeDef, guessDocType, numberLabelOf } from "@/data/docTypes";
import { phoneError, formatPhone } from "@/lib/phone";
import { AppSelect } from "@/components/AppSelect";
import { sar } from "@/lib/money";
import { fmtDate, fmtDateShort } from "@/lib/dates";
import { isSupabaseEnabled } from "@/supabase/client";
import { toast } from "sonner";
import { useRole } from "@/lib/useRole";
import { Field } from "@/components/Field";
import { Pager, usePaged } from "@/components/Pager";
import { EntityGate, EmptyState } from "@/components/States";
import { OrgLine } from "@/components/OrgLine";
import { useConfirmDiscard } from "@/lib/useUnsavedGuard";
import { Badge, Button, FilterChips, IconButton, Modal, ModalIcon, Note, Segmented, SortTh, Textarea, useSort, type ChipOption } from "@/components/ui";

const EMPTY_BEN: Omit<Beneficiary,"id"|"bookingIds"> = { name:"", phone:"", idNumber:"", nationality:"", gender:"male", birthDate:"", rating:0, notes:"", suspended:false, contactPhone:"" };

/* ═══ التحقّق من ملف المستفيد ═══
   «نموذج إضافة مستفيد لا يوضح أي حقل إلزامي» و«امنع إنشاء ملف فارغ
   وأظهر الأخطاء بجانب الحقول». الإلزامي هنا هو ما تحتاجه الرحلة فعلاً:
   الاسم، نوع الوثيقة ورقمها بشكلها الصحيح، الجنسية، الميلاد، الجنس.
   الجوال اختياري — طفلٌ في حجز أبيه بلا جوال — لكن إن كُتب فليصحّ. */
type BenErrors = Partial<Record<"name"|"docType"|"idNumber"|"nationality"|"birthDate"|"phone"|"contactPhone"|"docExpiry", string>>;
function validateBen(f: Partial<Beneficiary>): BenErrors {
  const e: BenErrors = {};
  if (!(f.name ?? "").trim()) e.name = "الاسم الكامل مطلوب";
  const dt = f.docType;
  if (!dt) e.docType = "اختر نوع الوثيقة";
  const num = (f.idNumber ?? "").replace(/\s/g, "");
  if (!num) e.idNumber = "رقم الوثيقة مطلوب";
  else if (dt && !docTypeDef(dt).test(num)) e.idNumber = docTypeDef(dt).error.ar;
  if (!(f.nationality ?? "").trim()) e.nationality = "الجنسية مطلوبة";
  if (!(f.birthDate ?? "").trim()) e.birthDate = "تاريخ الميلاد مطلوب";
  const ph = phoneError(f.phone ?? "", { required: false });
  if (ph) e.phone = ph;
  const cp = phoneError(f.contactPhone ?? "", { required: false });
  if (cp) e.contactPhone = cp;
  if (f.docExpiry && f.docExpiry < new Date().toISOString().slice(0, 10)) e.docExpiry = "الوثيقة منتهية — لا تصلح للسفر";
  return e;
}
/* اسم الوثيقة نصّاً وحده: رمزها التعبيري في بيانات الأنواع لا يُرسم في اللوحة. */
const docLabel = (t?: string) => t ? docTypeDef(t).label.ar : "";
const isExpired = (d?: string) => !!d && d < new Date().toISOString().slice(0, 10);
const genderText = (g: Beneficiary["gender"]) => g === "female" ? "أنثى" : "ذكر";

/** الحرف الأول في دائرةٍ هادئة — كانت كتلةً سوداء للذكر وبنفسجية للأنثى
    في كل صفّ؛ الجنس يُقرأ نصّاً في عموده لا من لون الدائرة. */
function Avatar({name,size=36}:{name:string;size?:number}) {
  return (
    <span aria-hidden className="flex items-center justify-center flex-shrink-0"
      style={{width:size,height:size,borderRadius:999,background:B.fill,color:B.text3,fontSize:size*0.4,fontWeight:600,border:`1px solid ${B.border}`}}>
      {name.trim().charAt(0)||"؟"}
    </span>
  );
}

const starStyle=(on:boolean):CSSProperties=>({color:on?B.gold:B.borderStrong,fill:on?B.gold:"transparent"});

/** التقييم للقراءة — خمس نجماتٍ بنصٍّ بديل واحد لا خمسة رموز. */
function Stars({value,size=15}:{value:number;size?:number}) {
  return (
    <span role="img" aria-label={value?`التقييم ${value} من 5`:"بلا تقييم"} className="inline-flex items-center gap-0.5" style={{verticalAlign:"middle"}}>
      {[1,2,3,4,5].map(n=><Star key={n} aria-hidden size={size} strokeWidth={1.75} style={starStyle(n<=value)}/>)}
    </span>
  );
}

/** التقييم للتعديل — أزرارٌ حقيقية تُبلَغ بـTab وتُضغط بـEnter/المسافة. */
function StarRating({value,onChange}:{value:number;onChange?:(v:number)=>void}) {
  const [hover,setHover]=useState(0);
  return (
    <div role="group" aria-label="تقييم المستفيد" className="inline-flex items-center gap-0.5" style={{marginInlineStart:-6}}>
      {[1,2,3,4,5].map(n=>(
        <button key={n} type="button" aria-label={`${n} من 5`} title={`${n} من 5`} aria-pressed={value===n}
          onClick={()=>onChange?.(n)}
          onMouseEnter={()=>onChange&&setHover(n)}
          onMouseLeave={()=>onChange&&setHover(0)}
          className="ui-iconbtn">
          <Star size={22} strokeWidth={1.75} style={starStyle((hover||value)>=n)}/>
        </button>
      ))}
    </div>
  );
}

/* العدد يُمرَّر مشتقّاً: bookingIds لا يُملأ للحجوزات الآتية من التطبيق،
   فكان التصنيف يقول «جديد» لعميلٍ حجز أربع مرّات. */
function BenTag({b,count}:{b:Beneficiary;count?:number}) {
  const n=count??b.bookingIds.length;
  if(b.suspended) return <StatusBadge status="suspended" entity="beneficiary"/>;
  if(n>=3) return <Badge tone="gold"><Award size={13} aria-hidden/>وفيّ</Badge>;
  if(n>=2) return <Badge tone="success" dot>متكرر</Badge>;
  return <Badge tone="neutral" dot>جديد</Badge>;
}

function BenModal({ben,onSave,onClose}:{ben:Partial<Beneficiary>;onSave:(b:Partial<Beneficiary>)=>void;onClose:()=>void}) {
  const [form,setForm]=useState<Partial<Beneficiary>&typeof EMPTY_BEN>({...EMPTY_BEN,...ben,
    /* الملفّات القديمة بلا نوع: يُخمَّن من شكل الرقم ويُعرض للتأكيد. */
    docType: ben.docType ?? (guessDocType(ben.idNumber ?? "") || undefined)});
  const [tried,setTried]=useState(false);
  const requestClose=useConfirmDiscard(form,onClose);
  const f=<K extends keyof typeof form>(k:K)=>(v:(typeof form)[K])=>setForm(p=>({...p,[k]:v}));
  const errors=validateBen(form);
  const invalid=Object.keys(errors).length>0;
  const def=docTypeDef(form.docType);
  const err=(k:keyof BenErrors)=>tried?errors[k]:undefined;
  const bad=(k:keyof BenErrors)=>tried&&!!errors[k];
  const req=<span className="ui-req">*</span>;
  function submit(){
    setTried(true);
    if(invalid) return;
    onSave({...form, name:form.name.trim(), phone:form.phone.trim(), idNumber:(form.idNumber??"").replace(/\s/g,""),
      contactPhone:form.contactPhone?.trim()||undefined, docExpiry:form.docExpiry||undefined});
  }
  const missing=Object.keys(errors).length;
  return (
    <Modal open onClose={requestClose} width={560}
      title={ben.id?"تعديل بيانات المستفيد":"إضافة مستفيد جديد"}
      sub={<>الحقول المعلَّمة بـ{req} إلزامية — لا يُحفظ ملفٌ ناقص.</>}
      footer={<>
        <Button variant="primary" onClick={submit}>حفظ المستفيد</Button>
        <Button variant="secondary" onClick={requestClose}>إلغاء</Button>
      </>}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <Field label={<>الاسم الكامل{req}</>} error={err("name")}>
            <input value={form.name} onChange={e=>f("name")(e.target.value)} placeholder="كما في الوثيقة" className="ui-input" aria-invalid={bad("name")} autoComplete="off"/>
          </Field>
        </div>
        <div>
          <Field label={<>نوع الوثيقة{req}</>} error={err("docType")}>
            <AppSelect value={form.docType??""} placeholder="اختر النوع" invalid={bad("docType")} onChange={v=>f("docType")((v||undefined) as Beneficiary["docType"])}
              options={DOC_TYPES.map(d=>({value:d.value,label:d.label.ar}))}/>
          </Field>
        </div>
        <div>
          <Field label={<>{numberLabelOf(form.docType,form.idNumber)}{req}</>} error={err("idNumber")} hint={form.docType?def.hint.ar:undefined}>
            <input value={form.idNumber} onChange={e=>f("idNumber")(e.target.value)} placeholder={form.docType?def.placeholder:"اختر النوع أولاً"}
              inputMode={form.docType&&def.numeric?"numeric":"text"} maxLength={form.docType?def.maxLength:15}
              className="ui-input" dir="ltr" style={{textAlign:"end"}} aria-invalid={bad("idNumber")} autoComplete="off"/>
          </Field>
        </div>
        <div>
          <Field label="انتهاء الوثيقة" error={err("docExpiry")}>
            <ArabicDatePicker value={form.docExpiry??""} onChange={v=>f("docExpiry")(v||undefined)} invalid={bad("docExpiry")} placeholder="يوم/شهر/سنة"/>
          </Field>
        </div>
        <div>
          <Field label={<>الجنسية{req}</>} error={err("nationality")}>
            <NationalitySelect value={form.nationality} onChange={f("nationality")} subInTrigger={false} invalid={bad("nationality")}/>
          </Field>
        </div>
        <div>
          <Field label={<>تاريخ الميلاد{req}</>} error={err("birthDate")}>
            <ArabicDatePicker value={form.birthDate} onChange={f("birthDate")} invalid={bad("birthDate")} placeholder="يوم/شهر/سنة"/>
          </Field>
        </div>
        <div>
          <span className="ui-label">الجنس{req}</span>
          <Segmented label="الجنس" value={form.gender} onChange={g=>f("gender")(g)}
            options={[{value:"male",label:"ذكر"},{value:"female",label:"أنثى"}]}/>
        </div>
        {/* جوالان لا واحد: «ليس كل معتمر لديه جوال مستقل؛ فرّق بين جوال
            المستفيد وجوال مسؤول الحجز». */}
        <div>
          <Field label="جوال المستفيد" error={err("phone")}>
            <input value={form.phone} onChange={e=>f("phone")(e.target.value)} placeholder="05xxxxxxxx — إن وُجد" inputMode="tel"
              className="ui-input" dir="ltr" style={{textAlign:"end"}} aria-invalid={bad("phone")} autoComplete="off"/>
          </Field>
        </div>
        <div>
          <Field label="جوال مسؤول الحجز" error={err("contactPhone")}>
            <input value={form.contactPhone??""} onChange={e=>f("contactPhone")(e.target.value)} placeholder="إن اختلف عن جوال المستفيد" inputMode="tel"
              className="ui-input" dir="ltr" style={{textAlign:"end"}} aria-invalid={bad("contactPhone")} autoComplete="off"/>
          </Field>
        </div>
        <Note tone="neutral" className="sm:col-span-2">
          صورة الوثيقة: تُفعَّل مع دلو التخزين الخاص (روابط موقّتة، حفظ حتى انتهاء الرحلة + ٩٠ يوماً). صورة جوازٍ في الدلو العام أسوأ من غيابها.
        </Note>
        {tried&&invalid&&(
          <Note tone="danger" icon={<AlertCircle size={15}/>} className="sm:col-span-2">
            أكمل الحقول المعلَّمة — {missing} {missing===1?"حقل ناقص":"حقول ناقصة"}
          </Note>
        )}
      </div>
    </Modal>
  );
}

/* ═══ معاينة الربط الجماعي ═══
   «زر ربط الطلبات بالملفات يجب أن يعرض معاينة قبل التنفيذ». planLink
   كان يحسب الخطة أصلاً بلا كتابة — هنا تُعرض قبل الضغطة. */
function LinkPreviewModal({plan,bens,bookings,onConfirm,onClose}:{plan:LinkPlan;bens:Beneficiary[];bookings:Booking[];onConfirm:()=>void;onClose:()=>void}) {
  const benById=new Map(bens.map(b=>[b.id,b]));
  const bkById=new Map(bookings.map(b=>[b.id,b]));
  const rowStyle=(i:number):CSSProperties=>({borderTop:i?`1px solid ${B.border}`:"none"});
  return (
    <Modal open onClose={onClose} width={560}
      title="ما سيحدث عند الربط"
      sub={<>المطابقة برقم الوثيقة ثم الجوال — لا بالاسم. {plan.bookings} طلب سيصل إلى ملف.</>}
      icon={<ModalIcon tone="gold"><Link2 size={19}/></ModalIcon>}
      footer={<>
        <Button variant="primary" onClick={onConfirm}>تنفيذ الربط</Button>
        <Button variant="secondary" onClick={onClose}>تراجع</Button>
      </>}>
      <div className="flex flex-col gap-5">
        {plan.create.length>0&&(
          <section>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="ts-section-title">ملفات جديدة</h3>
              <Badge tone="success">{plan.create.length}</Badge>
            </div>
            <div className="ui-card ui-card--flat overflow-hidden">
              {plan.create.map((c,i)=>(
                <div key={c.id} className="flex items-center gap-3 px-4 py-3" style={rowStyle(i)}>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate" style={{color:B.black}}>{c.name}</div>
                    <div className="text-xs mt-0.5" style={{color:B.muted}}>
                      <bdi dir="ltr">{formatPhone(c.phone)}</bdi> · {c.idNumber?<>{docLabel(c.docType)||"وثيقة"} <bdi dir="ltr">{c.idNumber}</bdi></>:"بلا وثيقة"}
                    </div>
                  </div>
                  <Badge tone="neutral">{c.bookingIds.length} طلب</Badge>
                </div>
              ))}
            </div>
          </section>
        )}
        {plan.attach.length>0&&(
          <section>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="ts-section-title">ربطٌ بملفات قائمة</h3>
              <Badge tone="info">{plan.attach.length}</Badge>
            </div>
            <div className="ui-card ui-card--flat overflow-hidden">
              {plan.attach.map((a,i)=>{ const b=benById.get(a.id); return (
                <div key={a.id} className="px-4 py-3" style={rowStyle(i)}>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-sm flex-1 min-w-0 truncate" style={{color:B.black}}>{b?.name??a.id}</span>
                    <bdi dir="ltr" className="text-xs" style={{color:B.muted}}>{b?formatPhone(b.phone):""}</bdi>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {a.add.map(id=>{ const bk=bkById.get(id); return (
                      <Badge key={id} tone="neutral"><bdi dir="ltr">{id}</bdi>{bk?` · ${fmtDateShort(bk.createdAt)}`:""}</Badge>
                    );})}
                  </div>
                </div>
              );})}
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
}

/* ═══ التكرار والدمج ═══
   «اعرض اقتراح دمج مع مقارنة الحقول». مقارنةٌ حقلاً بحقل، والمدير يختار
   الملف الذي يبقى. الدمج في القاعدة (merge_beneficiaries)؛ وقاعدةٌ بلا
   الترحيل تدمج محلياً وتؤرشف الآخر عبر المسار العادي. */
const CMP_FIELDS:{k:keyof Beneficiary;l:string}[]=[
  {k:"name",l:"الاسم"},{k:"phone",l:"الجوال"},{k:"contactPhone",l:"جوال المسؤول"},{k:"idNumber",l:"رقم الوثيقة"},
  {k:"docType",l:"نوع الوثيقة"},{k:"nationality",l:"الجنسية"},{k:"birthDate",l:"الميلاد"},{k:"gender",l:"الجنس"},{k:"notes",l:"ملاحظات"},
];
const CMP_LTR:ReadonlySet<keyof Beneficiary>=new Set<keyof Beneficiary>(["phone","contactPhone","idNumber"]);
function DuplicatesModal({pairs,countOf,onMerge,onClose}:{pairs:DupPair[];countOf:(b:Beneficiary)=>number;onMerge:(keep:Beneficiary,drop:Beneficiary)=>Promise<void>;onClose:()=>void}) {
  const [idx,setIdx]=useState(0);
  const [busy,setBusy]=useState(false);
  const pair=pairs[Math.min(idx,pairs.length-1)];
  if(!pair) return null;
  const show=(b:Beneficiary,k:keyof Beneficiary)=>{
    const v=b[k];
    if(k==="docType") return docLabel(v as string)||"—";
    if(k==="gender") return v==="female"?"أنثى":"ذكر";
    if(k==="phone"||k==="contactPhone") return v?formatPhone(String(v)):"—";
    if(k==="birthDate") return v?fmtDate(String(v)):"—";
    return v?String(v):"—";
  };
  const merge=async(keep:Beneficiary,drop:Beneficiary)=>{ setBusy(true); await onMerge(keep,drop); setBusy(false); if(idx>=pairs.length-1) onClose(); };
  const last=idx>=pairs.length-1;
  const cell=(k:keyof Beneficiary,v:string,diff:boolean)=>(
    <td style={diff&&v!=="—"?{background:TONE.warn.bg,fontWeight:600}:undefined}>
      {CMP_LTR.has(k)&&v!=="—"?<bdi dir="ltr">{v}</bdi>:v}
    </td>
  );
  /* الزرّان متماثلان فلا ذهبيّ بينهما: أيُّ الملفَّين يبقى قرارُ المدير،
     ولا يُرجَّح له أحدهما بلون. */
  return (
    <Modal open onClose={onClose} width={760}
      title={`تكرار محتمل ${idx+1} من ${pairs.length}`}
      sub={<>تطابق {pair.reason==="doc"?"رقم الوثيقة":"الجوال"}. الدمج يُبقي ملفاً وينقل إليه حجوزات الآخر ويُكمل حقوله الفارغة، ويؤرشف الآخر بسببٍ يسمّي الباقي.</>}
      icon={<ModalIcon tone="warn"><CopyIcon size={19}/></ModalIcon>}
      footer={
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full">
          <Button variant="dark" disabled={busy} onClick={()=>merge(pair.a,pair.b)}>أبقِ {pair.a.id} وادمج الآخر فيه</Button>
          <Button variant="dark" disabled={busy} onClick={()=>merge(pair.b,pair.a)}>أبقِ {pair.b.id} وادمج الآخر فيه</Button>
          <Button variant="secondary" disabled={busy} className="sm:ms-auto" onClick={()=>last?onClose():setIdx(i=>i+1)}>{last?"إغلاق":"ليسا الشخص نفسه — التالي"}</Button>
        </div>
      }>
      <div className="ui-table-wrap" style={{boxShadow:"none"}}>
        <div className="ui-table-scroll">
          <table className="ui-table" style={{minWidth:460}}>
            <thead><tr>
              <th>الحقل</th>
              <th><bdi dir="ltr">{pair.a.id}</bdi> · {countOf(pair.a)} طلب</th>
              <th><bdi dir="ltr">{pair.b.id}</bdi> · {countOf(pair.b)} طلب</th>
            </tr></thead>
            <tbody>
              {CMP_FIELDS.map(({k,l})=>{ const va=show(pair.a,k), vb=show(pair.b,k); const diff=va!==vb; return (
                <tr key={k}>
                  <td className="nowrap" style={{color:B.muted,fontSize:13}}>{l}</td>
                  {cell(k,va,diff)}
                  {cell(k,vb,diff)}
                </tr>
              );})}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

/* ═══ الاحتياجات الخاصة — للمدير وحده ═══
   «أضف احتياجات الحركة والحالة الصحية ضمن صلاحيات خصوصية محددة». الجدول
   منفصلٌ وRLS تحجبه عن غير المدير؛ وهنا لا يُرسَم القسم أصلاً لغيره. */
function PrivateNeeds({benId}:{benId:string}) {
  const [state,setState]=useState<"loading"|"ready"|"unsupported"|"forbidden">("loading");
  const [mobility,setMobility]=useState(""); const [health,setHealth]=useState("");
  const [saved,setSaved]=useState<{m:string;h:string}>({m:"",h:""});
  const [busy,setBusy]=useState(false);
  useEffect(()=>{ let alive=true; setState("loading");
    fetchPrivate(benId).then(r=>{ if(!alive) return;
      if(r.unsupported){ setState("unsupported"); return; }
      if(r.forbidden){ setState("forbidden"); return; }
      const m=r.data?.mobility??"", h=r.data?.health??"";
      setMobility(m); setHealth(h); setSaved({m,h}); setState("ready"); });
    return ()=>{ alive=false; }; },[benId]);
  const dirty=mobility!==saved.m||health!==saved.h;
  async function save(){ setBusy(true); const r=await savePrivate(benId,mobility,health); setBusy(false);
    if(r.unsupported){ toast.info("الاحتياجات الخاصة تحتاج ترحيل 20260914."); return; }
    if(r.error){ toast.error(r.error); return; }
    setSaved({m:mobility,h:health}); toast.success("حُفظت الاحتياجات الخاصة"); }
  if(!isSupabaseEnabled||state==="forbidden") return null;
  return (
    <section className="ui-card mt-4">
      <div className="ui-card-head">
        <h3 className="ui-card-title flex items-center gap-2"><ShieldAlert size={16} aria-hidden style={{color:TONE.warn.fg}}/>احتياجات خاصة</h3>
        <Badge tone="warn">يراها المدير وحده</Badge>
      </div>
      <div className="p-5">
        <p className="ui-card-sub" style={{margin:"0 0 16px"}}>ما تحتاجه الرحلة تشغيلياً فقط — كرسي متحرك، مرافق، دواء لازم. لا تشخيصات.</p>
        {state==="unsupported"?(
          <Note tone="warn">يُفعَّل بعد تشغيل ترحيل 20260914 على قاعدة البيانات.</Note>
        ):(
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Field label="احتياجات الحركة"><Textarea value={mobility} onChange={e=>setMobility(e.target.value)} rows={2} placeholder="كرسي متحرك · يحتاج مرافقاً · مقعد قريب من الباب" disabled={state==="loading"}
                style={{resize:"none"}}/></Field></div>
              <div><Field label="الحالة الصحية اللازمة للرحلة"><Textarea value={health} onChange={e=>setHealth(e.target.value)} rows={2} placeholder="سكّري يحتاج تبريد الدواء · حساسية غذائية" disabled={state==="loading"}
                style={{resize:"none"}}/></Field></div>
            </div>
            <div className="flex justify-end mt-4">
              <Button size="sm" variant={dirty?"dark":"secondary"} onClick={save} disabled={!dirty} loading={busy}>{busy?"جارٍ الحفظ…":dirty?"حفظ":"محفوظ"}</Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/* إشعارٌ يُقرأ ولا يُحرَّر — لا مسوّدة فيه تُفقد، فيُغلق بـEscape وبالنقر خارجه. */
function CancellationModal({booking,onClose}:{booking:Booking;onClose:()=>void}) {
  return (
    <Modal open onClose={onClose} width={440} dismissible
      title="إشعار إلغاء"
      sub={<>رقم الطلب: <bdi dir="ltr">{booking.id}</bdi></>}
      icon={<ModalIcon tone="danger"><Ban size={19}/></ModalIcon>}>
      <div className="flex flex-col gap-4">
        <div className="ts-kv">
          <span className="ts-kv-k">العميل</span>
          <span className="ts-kv-v" style={{fontSize:15}}>{booking.clientName}</span>
          <span style={{fontSize:13,color:B.muted}}><bdi dir="ltr">{booking.clientPhone}</bdi></span>
        </div>
        <Note tone="danger" icon={<Ban size={15}/>}>تم إلغاء هذا الطلب.</Note>
        <div className="flex items-center justify-between gap-3 rounded-xl px-4 py-3" style={{background:B.fill,border:`1px solid ${B.border}`}}>
          <span className="text-sm" style={{color:B.text2}}>المبلغ المسترد</span>
          <span style={{fontSize:17,fontWeight:700,color:B.black}}>{sar(booking.total)}</span>
        </div>
        <div className="text-center text-xs pt-3" style={{color:B.muted,borderTop:`1px solid ${B.border}`,lineHeight:1.7}}><OrgLine/></div>
      </div>
    </Modal>
  );
}

type GenderFilter = "all"|"male"|"female";
type SortKey = "name"|"count"|"rating";

export function BeneficiariesPage({bookings,onMenuOpen}:{bookings:Booking[];onMenuOpen?:()=>void}) {
  /* بوابة الكتابة — مرآة can_write_admin() في القاعدة. كل نقاط فتح
     نموذج التعديل تمرّ من هنا، فالموظف لا يملأ نموذجاً ليُرفض في آخره. */
  const { canWrite, isAdmin } = useRole();
  const mayWrite = canWrite("beneficiaries");
  const [linkPreview,setLinkPreview]=useState(false);
  const [dupOpen,setDupOpen]=useState(false);
  const openForm = (t: any) => {
    if (!mayWrite) {
      toast.error("لا تملك صلاحية التعديل", { description: "هذه الشاشة يكتبها مدير النظام وحده." });
      return;
    }
    setEditTarget(t); setShowModal(true);
  };
  const bens=useStore(s=>s.beneficiaries); const setBens=useStore(s=>s.setBeneficiaries);
  const payments=useStore(s=>s.payments); const tickets=useStore(s=>s.tickets);
  const [search,setSearch]=useState("");
  /* التصفية على القيمة الساكنة لا على كل ضغطة مفتاح. */
  const query = useDebounced(search);
  const [genderFilter,setGenderFilter]=useState<GenderFilter>("all");
  /* يمكن أن يأتي الموظف من تفاصيل طلبٍ برابط مباشر إلى الملف. نفتح الملف
     نفسه، لا ننسخ طلبه أو مستنداته إلى صفحة أخرى. */
  const [searchParams,setSearchParams]=useSearchParams();
  const requestedDetailId=searchParams.get("beneficiary");
  const [detailId,setDetailId]=useState<string|null>(()=>requestedDetailId);
  const [showModal,setShowModal]=useState(false);
  const [editTarget,setEditTarget]=useState<Beneficiary|null>(null);
  const [invoiceView,setInvoiceView]=useState<Payment|null>(null);
  const [ticketView,setTicketView]=useState<TicketEntry|null>(null);
  const [cancelView,setCancelView]=useState<Booking|null>(null);
  /* لا تلفيق فاتورة عند غيابها. كان يُصنع كائن فاتورة في الذاكرة برقم
     INV-<رقم الطلب> ويُعرض ويُطبع — ورقمٌ لا وجود له في القاعدة يصل يد
     العميل، ولا يجده أحد في شاشة الفواتير حين يسأل عنه.

     الفواتير تُنشأ الآن في القاعدة تلقائياً عند تأكيد الطلب (حارس
     trg_booking_confirm_docs، ترحيل 20260823). فغيابها هنا يعني أمراً
     واحداً: الطلب ليس مؤكَّداً بعد — وهذا ما يُقال. */
  const openInvoice=(bk:Booking)=>{
    const found=payments.find(p=>p.bookingId===bk.id);
    if(found){ setInvoiceView(found); return; }
    toast.info("لا توجد فاتورة لهذا الطلب",{
      description:bk.status==="confirmed"
        ? "الطلب مؤكَّد لكن فاتورته لم تصل بعد — حدّث الصفحة بعد لحظات."
        : "تُنشأ الفاتورة تلقائياً عند تأكيد الطلب.",
      duration:7000,
    });
  };
  const openTicket=(bk:Booking)=>{const t=tickets.find(t=>t.bookingId===bk.id);if(t)setTicketView(t);};

  const detail = detailId ? bens.find(b=>b.id===detailId) : null;

  useEffect(()=>{
    if(requestedDetailId && bens.some(b=>b.id===requestedDetailId)) setDetailId(requestedDetailId);
  },[requestedDetailId,bens]);
  const openDetail=(id:string)=>{
    setDetailId(id);
    const next=new URLSearchParams(searchParams);
    next.set("beneficiary",id);
    setSearchParams(next);
  };
  const closeDetail=()=>{
    setDetailId(null);
    const next=new URLSearchParams(searchParams);
    next.delete("beneficiary");
    setSearchParams(next,{replace:true});
  };

  /* ── ربط الحجوزات بالملفّات ──
     ما يُعرض مشتقٌّ لحظةَ العرض (bookingsOf): يصحّ فوراً بلا كتابة،
     فيراه كل موظف لا المدير وحده. وما يُنشأ يُطلَب صراحةً بالزرّ. */
  const plan = useMemo(()=>planLink(bens,bookings),[bens,bookings]);
  const benBookings = useMemo(()=>{
    const m=new Map<string,Booking[]>();
    for(const b of bens) m.set(b.id,bookingsOf(b,bookings));
    return m;
  },[bens,bookings]);
  const countOf=(b:Beneficiary)=>benBookings.get(b.id)?.length??b.bookingIds.length;

  const filtered = bens.filter(b=>
    (genderFilter==="all"||b.gender===genderFilter)&&
    (!query||(b.name+b.phone+b.idNumber).includes(query))
  );

  /* الفرز على المسار المحلي وحده، وقبل القصّ على صفحات: فرزُ صفحةٍ واحدة
     يُري «أعلى تقييم» في خمسةٍ وعشرين صفّاً لا في السجل. وحين يبحث الخادم
     يأتي الترتيب منه، فتُرسم رؤوس الأعمدة بلا أزرار فرز (sortTh أدناه). */
  const sorter = useSort<Beneficiary,SortKey>(filtered,{
    name:b=>b.name,
    count:b=>countOf(b),
    rating:b=>b.rating,
  });

  /* ترقيم الصفحات — الرسم على الصفحة الحالية وحدها. المفتاح يُعيد
     للصفحة الأولى عند تغيّر البحث أو المرشّح أو الفرز: من كان في الصفحة
     الخامسة ثم بحث عن اسم يجب أن يرى أول النتائج لا صفحتها الخامسة. */
  const localPg = usePaged(sorter.rows, `${query}|${genderFilter}|${sorter.sort.key??""}|${sorter.sort.dir}`);

  /* البحث الحقيقي في القاعدة: الاسم والجوال ورقم الهوية ورقم الملفّ،
     مُرقَّماً هناك. التصفية المحلية أعلاه تبقى لوضع التجربة بلا قاعدة،
     ولنشرٍ سبق ترحيل البحث. */
  const srv = useServerPagedSearch({
    fn: "admin_search_beneficiaries",
    args: { q: query, gender_filter: genderFilter === "all" ? null : genderFilter },
    resetKey: `${query}|${genderFilter}`,
    all: bens, idOf: b => b.id, idField: "beneficiary_id",
  });
  const pg = srv.supported ? srv.paged : localPg;

  function runLink(){
    setLinkPreview(false);
    setBens(p=>applyLink(p,plan));
    toast.success(`رُبط ${plan.bookings} طلباً`,{
      description: plan.create.length
        ? `أُنشئ ${plan.create.length} ملف مستفيد جديد.`
        : "لم يلزم إنشاء ملفات جديدة.",
      duration:7000,
    });
  }
  /* التكرار يُكشف بالجوال أو الوثيقة، لا بالاسم. */
  const dups=useMemo(()=>findDuplicates(bens),[bens]);
  async function mergePair(keep:Beneficiary,drop:Beneficiary){
    const r=await mergeBeneficiaries(keep.id,drop.id);
    if(r.error){ toast.error(r.error); return; }
    if(r.unsupported){
      /* بلا ترحيل: يُدمج محلياً ويُؤرشف الآخر عبر مسار الحذف العادي (archive_entity). */
      setBens(p=>p.map(b=>b.id===keep.id?mergeLocally(keep,drop):b).filter(b=>b.id!==drop.id));
    } else {
      setBens(p=>p.map(b=>b.id===keep.id?mergeLocally(keep,drop):b).filter(b=>b.id!==drop.id));
    }
    if(detailId===drop.id) openDetail(keep.id);
    toast.success(`دُمج ${drop.id} في ${keep.id}`,{description:"انتقلت الحجوزات وأُكملت الحقول الفارغة، وأُرشف الملف الآخر."});
  }
  /* حجزٌ مؤكَّد بلا ملف على قاعدةٍ شُغِّل عليها الترحيل بعد تأكيده — تعبئةٌ بضغطة. */
  async function autoLink(){
    const unlinked=bookings.filter(b=>b.status==="confirmed"&&!bens.some(x=>x.bookingIds.includes(b.id)));
    let made=0, unsupported=false;
    for(const b of unlinked){ const r=await ensureBookingBeneficiaries(b.id); if(r.unsupported){ unsupported=true; break; } made+=r.made; }
    if(unsupported){ setLinkPreview(true); return; }
    await useStore.getState().retryEntity("beneficiaries");
    toast.success(`اكتملت الملفات — أُنشئ ${made} ملفاً جديداً`,{description:"الحجوزات المؤكَّدة القادمة تُنشئ ملفاتها تلقائياً في القاعدة."});
  }

  function saveBen(form:Partial<Beneficiary>) {
    if(editTarget) {
      setBens(p=>p.map(b=>b.id===editTarget.id?{...b,...form}:b));
    } else {
      const nb:Beneficiary={...EMPTY_BEN,...form,id:newId("BEN"),bookingIds:[],source:"manual"};
      setBens(p=>[...p,nb]);
    }
    setShowModal(false); setEditTarget(null);
  }
  function openEdit(b:Beneficiary){openForm(b);}
  function toggleSuspend(id:string){setBens(p=>p.map(b=>b.id===id?{...b,suspended:!b.suspended}:b));}
  function setRating(id:string,r:number){setBens(p=>p.map(b=>b.id===id?{...b,rating:r}:b));}
  function setNotes(id:string,n:string){setBens(p=>p.map(b=>b.id===id?{...b,notes:n}:b));}

  const stats={
    total:bens.length,
    male:bens.filter(b=>b.gender==="male").length,
    female:bens.filter(b=>b.gender==="female").length,
    /* على العدد المشتقّ: على bookingIds وحده كان الرقم يبقى ثابتاً على
       بيانات البذرة مهما بلغت الحجوزات الحقيقية. */
    repeat:bens.filter(b=>countOf(b)>1).length,
    suspended:bens.filter(b=>b.suspended).length,
    expired:bens.filter(b=>isExpired(b.docExpiry)).length,
  };

  /* سجلّ الملف مشتقٌّ لا مقروءٌ من bookingIds وحده: حجزٌ وصل من التطبيق
     ولم يُربط بعد كان يجعل ملفّ عميلٍ حجز ثلاث مرّات يقول «لا توجد
     طلبات مسجّلة». */
  const detailBookings = detail ? (benBookings.get(detail.id) ?? []) : [];
  if(detail) {
    const docBtn=(label:string,on:()=>void,icon:React.ReactNode)=>(
      <Button size="sm" variant="secondary" icon={icon} onClick={on}>{label}</Button>
    );
    const docsOf=(bk:Booking)=>{
      const cancelled=bk.status==="cancelled"||bk.status==="rejected";
      const confirmed=bk.status==="confirmed";
      return cancelled
        ? docBtn("إشعار الإلغاء",()=>setCancelView(bk),<FileX size={14}/>)
        : confirmed
          ? <>{docBtn("الفاتورة",()=>openInvoice(bk),<CreditCard size={14}/>)}{docBtn("التذكرة",()=>openTicket(bk),<Ticket size={14}/>)}</>
          : docBtn("الفاتورة المبدئية",()=>openInvoice(bk),<CreditCard size={14}/>);
    };
    const ltr=(v:string)=><bdi dir="ltr">{v}</bdi>;
    const facts:{l:string;v:React.ReactNode}[]=[
      {l:"نوع الوثيقة",v:docLabel(detail.docType||guessDocType(detail.idNumber))||"—"},
      {l:numberLabelOf(detail.docType,detail.idNumber),v:detail.idNumber?ltr(detail.idNumber):"—"},
      {l:"انتهاء الوثيقة",v:fmtDate(detail.docExpiry)},
      {l:"الجنس",v:genderText(detail.gender)},
      {l:"الجنسية",v:detail.nationality||"—"},
      {l:"تاريخ الميلاد",v:fmtDate(detail.birthDate)},
      {l:"جوال المستفيد",v:detail.phone?ltr(formatPhone(detail.phone)):"—"},
      {l:"جوال مسؤول الحجز",v:detail.contactPhone?ltr(formatPhone(detail.contactPhone)):"نفسه"},
    ];
    return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{background: B.bg}}>
      <PageHeader title="المستفيدون" crumb="ملف المستفيد" search={search} onSearch={setSearch} onMenuOpen={onMenuOpen} hideSearch/>
      <main className="flex-1 px-4 md:px-8 pb-10 pt-1" style={{maxWidth:980}}>
        <button type="button" onClick={closeDetail} className="ui-btn ui-btn--ghost ui-btn--sm mb-3" style={{marginInlineStart:-8}}>
          <ArrowRight size={15}/>المستفيدون
        </button>

        {/* رأس الملف: من هو، وما حاله، وما يُفعل به. */}
        <section className="ui-card p-5">
          <div className="flex items-center flex-wrap gap-x-4 gap-y-4">
            <Avatar name={detail.name} size={52}/>
            <div className="flex-1 min-w-0" style={{minWidth:200}}>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 style={{margin:0,fontSize:20,fontWeight:700,color:B.black,lineHeight:1.4}}>{detail.name}</h2>
                <BenTag b={detail} count={detailBookings.length}/>
              </div>
              <div className="flex items-center gap-2 flex-wrap mt-1" style={{fontSize:13,color:B.muted}}>
                {detail.phone&&<><bdi dir="ltr">{detail.phone}</bdi><span aria-hidden>·</span></>}
                <bdi dir="ltr">{detail.id}</bdi><span aria-hidden>·</span><span>{genderText(detail.gender)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" icon={<Pencil size={14}/>} onClick={()=>openEdit(detail)}>تعديل</Button>
              <Button variant={detail.suspended?"secondary":"danger-soft"} icon={detail.suspended?<CirclePlay size={15}/>:<CirclePause size={15}/>}
                onClick={()=>toggleSuspend(detail.id)}>{detail.suspended?"إلغاء الإيقاف":"إيقاف"}</Button>
            </div>
          </div>
        </section>

        {/* الإنفاق يأخذ السطر كاملاً على الجوال: مبلغٌ بوحدته لا يسعه ثلث الشاشة. */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
          <StatCard label="الطلبات" value={detailBookings.length} sub="في سجل الملف"/>
          <StatCard label="مؤكدة" value={detailBookings.filter(bk=>bk.status==="confirmed").length} sub="صدرت فاتورتها وتذكرتها"/>
          <div className="col-span-2 md:col-span-1 grid">
            <StatCard label="الإنفاق" value={sar(detailBookings.filter(bk=>["paid","confirmed"].includes(bk.status)).reduce((a,bk)=>a+bk.total,0))} sub="من الطلبات المدفوعة والمؤكدة"/>
          </div>
        </div>

        <section className="ui-card mt-4">
          <div className="ui-card-head flex-wrap">
            <h3 className="ui-card-title">البيانات الشخصية</h3>
            <div className="flex items-center gap-2 flex-wrap">
              {detail.source==="auto"&&<Badge tone="info">أُنشئ تلقائياً من الحجز <bdi dir="ltr">{detail.createdFrom}</bdi></Badge>}
              {isExpired(detail.docExpiry)&&<Badge tone="danger" dot>الوثيقة منتهية</Badge>}
            </div>
          </div>
          <div className="p-5 grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-5">
            {facts.map(f=>(
              <div key={f.l} className="ts-kv">
                <span className="ts-kv-k">{f.l}</span>
                <span className="ts-kv-v">{f.v}</span>
              </div>
            ))}
          </div>
        </section>

        {isAdmin&&<PrivateNeeds benId={detail.id}/>}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <section className="ui-card p-5">
            <h3 className="ts-section-title" style={{marginBottom:10}}>تقييم المستفيد</h3>
            <StarRating value={detail.rating} onChange={r=>setRating(detail.id,r)}/>
            <div className="ui-hint">{detail.rating?`${detail.rating} من 5 — اضغط نجمةً لتحديث التقييم`:"لم يُقيَّم بعد — اضغط نجمةً للتقييم"}</div>
          </section>
          <section className="ui-card p-5 md:col-span-2">
            <label htmlFor="ben-notes" className="ts-section-title block" style={{marginBottom:12}}>ملاحظات داخلية</label>
            <Textarea id="ben-notes" value={detail.notes} onChange={e=>setNotes(detail.id,e.target.value)}
              rows={3} placeholder="تفضيلاته، متطلبات خاصة..." style={{resize:"none"}}/>
          </section>
        </div>

        <section className="ui-card mt-4 overflow-hidden">
          <div className="ui-card-head">
            <h3 className="ui-card-title">سجل الطلبات</h3>
            <span className="ts-count">{detailBookings.length} طلب</span>
          </div>
          {detailBookings.length===0 ? (
            <EmptyState compact icon={<BookOpen size={22}/>} title="لا توجد طلبات مسجّلة" note="طلبات هذا المستفيد تظهر هنا فور وصولها، مطابَقةً بجواله أو مربوطةً بملفه."/>
          ) : <>
            <div className="hidden md:block ui-table-scroll">
              <table className="ui-table">
                <thead>
                  <tr>
                    <th>رقم الطلب</th>
                    <th>التاريخ</th>
                    <th>المبلغ</th>
                    <th>الحالة</th>
                    <th>المستندات</th>
                  </tr>
                </thead>
                <tbody>
                  {detailBookings.map(bk=>(
                    <tr key={bk.id}>
                      <td className="nowrap"><span className="cell-main num">{bk.id}</span></td>
                      <td className="nowrap" style={{color:B.text2}}>{fmtDate(bk.createdAt)}</td>
                      <td className="nowrap cell-main">{sar(bk.total)}</td>
                      <td><StatusBadge status={bk.status} entity="booking"/></td>
                      <td><div className="flex items-center gap-1.5 flex-wrap">{docsOf(bk)}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* على الجوال: الطلب بطاقةُ سطرين وتحتها مستنداته — لا جدولٌ يُمرَّر أفقياً. */}
            <div className="md:hidden">
              {detailBookings.map((bk,i)=>(
                <div key={bk.id} className="p-4" style={{borderTop:i?`1px solid ${B.border}`:"none"}}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold text-sm" style={{color:B.black}}><bdi dir="ltr">{bk.id}</bdi></div>
                      <div className="text-xs mt-0.5" style={{color:B.muted}}>{fmtDate(bk.createdAt)} · {sar(bk.total)}</div>
                    </div>
                    <StatusBadge status={bk.status} entity="booking"/>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap mt-3">{docsOf(bk)}</div>
                </div>
              ))}
            </div>
          </>}
        </section>
      </main>
      <AnimatePresence>
        {showModal&&<BenModal ben={editTarget||{}} onSave={saveBen} onClose={()=>{setShowModal(false);setEditTarget(null);}}/>}
        {invoiceView&&<InvoiceModal pay={invoiceView} onClose={()=>setInvoiceView(null)}/>}
        {ticketView&&<TicketCard ticket={ticketView} onClose={()=>setTicketView(null)}/>}
        {cancelView&&<CancellationModal booking={cancelView} onClose={()=>setCancelView(null)}/>}
      </AnimatePresence>
    </div>
    );
  }

  /* عدّ الذكور والإناث صار على الشريحتين، فلا تكرّره بطاقتان فوقهما. */
  const genderChips:ChipOption<GenderFilter>[]=[
    {value:"all",label:"الكل",count:stats.total},
    {value:"male",label:"ذكور",count:stats.male},
    {value:"female",label:"إناث",count:stats.female},
  ];
  const narrowed=genderFilter!=="all"||!!query;
  const filteredOut=bens.length>0;
  const sortTh=(k:SortKey,label:string,style?:CSSProperties)=>srv.supported
    ? <th style={style}>{label}</th>
    : <SortTh k={k} sorter={sorter} style={style}>{label}</SortTh>;
  const docTypeOf=(b:Beneficiary)=>b.docType||guessDocType(b.idNumber);
  const addButton=(short=true)=>(
    <Button variant="primary" icon={<Plus size={16}/>} onClick={()=>{openForm(null);}}>
      {short?<><span className="hidden sm:inline">إضافة مستفيد</span><span className="sm:hidden">إضافة</span></>:"إضافة مستفيد"}
    </Button>
  );

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{background: B.bg}}>
      {/* زرّ الإضافة يُخفى لا يُعطَّل: زرٌّ مرئي يعد بعملٍ لا يُنجَز. */}
      <PageHeader title="المستفيدون" crumb="إدارة المستفيدين" search={search} onSearch={setSearch} onMenuOpen={onMenuOpen}
        actions={mayWrite&&addButton()}/>
      <div className="px-4 md:px-8 pt-1">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="إجمالي المستفيدين" value={stats.total} sub="في السجل" accent onClick={()=>setGenderFilter("all")}/>
          <StatCard label="حجوزات متكررة" value={stats.repeat} sub="أكثر من رحلة"/>
          <StatCard label="موقوفون" value={stats.suspended} sub="ملفات موقوفة"/>
          <StatCard label="وثائق منتهية" value={stats.expired} alert sub={stats.expired?"لا تصلح للسفر قبل تجديدها":"لا وثيقة منتهية"}/>
        </div>
        {(!planIsEmpty(plan)||dups.length>0)&&(
          <div className="flex flex-col gap-2 mt-4">
            {/* طلبات وصلت بلا ملف مستفيد. شريطٌ يُقال لا عمل صامت: إنشاء
                ملفات في القاعدة قرارٌ، ولغير المدير يردّه حرس الكتابة. */}
            {!planIsEmpty(plan)&&(
              <Note tone="warn" icon={<Link2 size={16} style={{marginTop:8}}/>}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2" style={{minHeight:32}}>
                  <div className="flex-1" style={{minWidth:200}}>
                    <b style={{fontWeight:600}}>{plan.bookings} طلب</b>
                    {" بلا ربط بملف مستفيد"}
                    {plan.create.length>0&&<> — منها <b style={{fontWeight:600}}>{plan.create.length}</b> تحتاج ملفاً جديداً</>}
                  </div>
                  {mayWrite
                    ? <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" onClick={()=>setLinkPreview(true)}>معاينة الربط</Button>
                        {isSupabaseEnabled&&<Button size="sm" variant="ghost" onClick={autoLink} title="يُنشئ الملفات في القاعدة من بطاقات المعتمرين (ترحيل 20260914)">إنشاء تلقائي من الحجوزات المؤكَّدة</Button>}
                      </div>
                    : <span className="text-xs">الربط لمدير النظام</span>}
                </div>
              </Note>
            )}
            {/* تكرارٌ محتمل — بالجوال أو الوثيقة. يُعرض ولا يُدمج من تلقائه. */}
            {dups.length>0&&(
              <Note tone="warn" icon={<CopyIcon size={16} style={{marginTop:8}}/>}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2" style={{minHeight:32}}>
                  <div className="flex-1" style={{minWidth:200}}>
                    <b style={{fontWeight:600}}>{dups.length}</b> {dups.length===1?"تكرار محتمل":"تكرارات محتملة"} — ملفّان بنفس {dups.some(d=>d.reason==="doc")?"رقم الوثيقة":"الجوال"}
                  </div>
                  <Button size="sm" variant="secondary" onClick={()=>setDupOpen(true)}>{mayWrite?"مقارنة ودمج":"عرض المقارنة"}</Button>
                </div>
              </Note>
            )}
          </div>
        )}
        <div className="ts-toolbar">
          <FilterChips label="الجنس" options={genderChips} value={genderFilter} onChange={v=>setGenderFilter(v)}/>
          <span className="ts-toolbar-end ts-count" aria-live="polite">
            {srv.searching?"جارٍ البحث…":narrowed?`${pg.total} من ${bens.length}`:`${pg.total} مستفيد`}
          </span>
        </div>
      </div>
      <main className="flex-1 px-4 md:px-8 pb-8">
        <EntityGate entity="beneficiaries" label="المستفيدين" cols={7}>
        {!srv.searching&&pg.total===0 ? (
          <EmptyState
            icon={filteredOut?<SearchX size={22}/>:<Users size={22}/>}
            title={filteredOut?"لا مستفيدين يطابقون البحث":"لا مستفيدين بعد"}
            note={filteredOut?"جرّب اسماً أو جوالاً أو رقم وثيقةٍ آخر، أو أزل المرشّح.":"تُنشأ الملفات من الحجوزات المؤكَّدة، ويمكنك إضافة مستفيدٍ يدوياً."}
            action={filteredOut
              ? <Button variant="secondary" onClick={()=>{setSearch("");setGenderFilter("all");}}>إزالة المرشّحات</Button>
              : mayWrite?addButton(false):undefined}/>
        ) : <>
        {/* Desktop table */}
        <div className="hidden md:block ui-table-wrap" style={{opacity:srv.searching?0.55:1,transition:"opacity .15s"}}>
          <div className="ui-table-scroll">
          <table className="ui-table" style={{minWidth:860}}>
            <thead>
              <tr>
                {/* الجوال صار سطراً ثانياً تحت الاسم، ونوع الوثيقة تحت رقمها:
                    المعلومة باقية، والجدول يتّسع للاسم كاملاً بلا انكسار. */}
                {sortTh("name","المستفيد")}
                <th>الوثيقة</th>
                <th>الجنس</th>
                {sortTh("count","الطلبات",{textAlign:"center"})}
                {sortTh("rating","التقييم")}
                <th>التصنيف</th>
                <th className="col-action"><span className="sr-only">إجراءات</span></th>
              </tr>
            </thead>
            <tbody>
              {pg.rows.map(b=>{
                const dt=docTypeOf(b), expired=isExpired(b.docExpiry);
                return (
                <tr key={b.id} className="is-clickable" tabIndex={0} aria-label={`فتح ملف ${b.name}`}
                  onClick={()=>openDetail(b.id)}
                  onKeyDown={e=>{ if(e.key==="Enter"&&e.target===e.currentTarget) openDetail(b.id); }}>
                  <td>
                    <div className="flex items-center gap-3">
                      <Avatar name={b.name}/>
                      <div className="min-w-0">
                        <div className="cell-main nowrap">{b.name}</div>
                        <div className="cell-sub num">{b.phone||"—"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="nowrap">
                    <div className="num" style={{display:"block",textAlign:"right",color:B.text3}}>{b.idNumber||"—"}</div>
                    {dt&&<div className="cell-sub" style={expired?{color:"var(--k-danger)",fontWeight:600}:undefined}>{docLabel(dt)}{expired?" · منتهية":""}</div>}
                  </td>
                  <td className="nowrap" style={{color:B.text2}}>{genderText(b.gender)}</td>
                  <td className="cell-main" style={{textAlign:"center"}}>{countOf(b)}</td>
                  <td><Stars value={b.rating}/></td>
                  <td><BenTag b={b} count={countOf(b)}/></td>
                  <td className="col-action" onClick={e=>e.stopPropagation()}>
                    <div className="row-actions">
                      <IconButton size="sm" label={`تعديل ${b.name}`} onClick={()=>openEdit(b)}><Pencil size={15}/></IconButton>
                      <IconButton size="sm" label={`فتح ملف ${b.name}`} onClick={()=>openDetail(b.id)}><ChevronLeft size={16}/></IconButton>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
        {/* Mobile cards — فيها كل ما في صفّ المكتب: الوثيقة والجنس وعدد الطلبات والفعلان. */}
        <div className="md:hidden flex flex-col gap-2.5" style={{opacity:srv.searching?0.55:1}}>
          {pg.rows.map(b=>{
            const dt=docTypeOf(b), expired=isExpired(b.docExpiry);
            return (
            <div key={b.id} role="button" tabIndex={0} aria-label={`فتح ملف ${b.name}`} onClick={()=>openDetail(b.id)}
              onKeyDown={e=>{ if(e.key==="Enter"&&e.target===e.currentTarget) openDetail(b.id); }}
              className="ui-card ui-card--hover p-4" style={{cursor:"pointer"}}>
              <div className="flex items-center gap-3">
                <Avatar name={b.name} size={40}/>
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate" style={{color:B.black,fontSize:15}}>{b.name}</div>
                  <div className="text-xs mt-0.5" style={{color:B.muted}}><bdi dir="ltr">{b.phone||"—"}</bdi></div>
                </div>
                <BenTag b={b} count={countOf(b)}/>
              </div>
              <div className="flex items-center gap-x-2 gap-y-1 flex-wrap mt-3 text-xs" style={{color:B.muted}}>
                <span>{genderText(b.gender)}</span>
                <span aria-hidden>·</span>
                <span style={expired?{color:"var(--k-danger)",fontWeight:600}:undefined}>
                  {b.idNumber?<>{dt?`${docLabel(dt)} `:""}<bdi dir="ltr">{b.idNumber}</bdi></>:"بلا وثيقة"}{expired?" · منتهية":""}
                </span>
                <span aria-hidden>·</span>
                <span>{countOf(b)} طلب</span>
              </div>
              <div className="flex items-center justify-between mt-3 pt-3" style={{borderTop:`1px solid ${B.border}`}}>
                <Stars value={b.rating}/>
                <div className="flex items-center gap-1" onClick={e=>e.stopPropagation()}>
                  <Button size="sm" variant="secondary" icon={<Pencil size={14}/>} onClick={()=>openEdit(b)}>تعديل</Button>
                  <ChevronLeft size={18} style={{color:B.muted,marginInlineStart:4}} aria-hidden/>
                </div>
              </div>
            </div>
            );
          })}
        </div>
        </>}
        </EntityGate>
        <Pager p={pg} unit="مستفيد"/>
      </main>
      <AnimatePresence>
        {showModal&&<BenModal ben={editTarget||{}} onSave={saveBen} onClose={()=>{setShowModal(false);setEditTarget(null);}}/>}
        {linkPreview&&<LinkPreviewModal plan={plan} bens={bens} bookings={bookings} onConfirm={runLink} onClose={()=>setLinkPreview(false)}/>}
        {dupOpen&&dups.length>0&&<DuplicatesModal pairs={dups} countOf={countOf} onClose={()=>setDupOpen(false)}
          onMerge={async(k,d)=>{ if(!mayWrite){ toast.error("الدمج لمدير النظام"); return; } await mergePair(k,d); }}/>}
      </AnimatePresence>
    </div>
  );
}
