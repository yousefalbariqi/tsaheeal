import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Plus, X, Users, CreditCard, Ticket, ArrowRight, Link2, ShieldAlert, Copy as CopyIcon, Check } from "lucide-react";
import { B } from "@/lib/theme";
import { useDebounced } from "@/lib/useDebounced";
import { useServerPagedSearch } from "@/lib/useServerSearch";
import type { Beneficiary, Payment, Booking, TicketEntry } from "@/types";
import { StatusBadge } from "@/components/StatusBadge";
import { StatCard } from "@/components/StatCard";
import { PageHeader } from "@/components/PageHeader";
import { NationalitySelect } from "@/components/NationalitySelect";
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
import { isSupabaseEnabled } from "@/supabase/client";
import { toast } from "sonner";
import { useRole } from "@/lib/useRole";
import { Field } from "@/components/Field";
import { Pager, usePaged } from "@/components/Pager";
import { EntityGate } from "@/components/States";
import { OrgLine } from "@/components/OrgLine";

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
const docLabel = (t?: string) => t ? `${docTypeDef(t).icon} ${docTypeDef(t).label.ar}` : "";
const isExpired = (d?: string) => !!d && d < new Date().toISOString().slice(0, 10);

function StarRating({value,onChange}:{value:number;onChange?:(v:number)=>void}) {
  const [hover,setHover]=useState(0);
  return (
    <div className="flex gap-1">
      {[1,2,3,4,5].map(n=>(
        <button key={n} type="button"
          onClick={()=>onChange?.(n)}
          onMouseEnter={()=>onChange&&setHover(n)}
          onMouseLeave={()=>onChange&&setHover(0)}
          className="text-2xl leading-none p-0 cursor-pointer"
          style={{background:"none",border:"none",color:(hover||value)>=n?B.gold:"#D8D0C4"}}>
          ★
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
  if(n>=3) return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold" style={{background:"#FBF3D6",color:"#8A6A08"}}>⭐ وفيّ</span>;
  if(n>=2) return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold" style={{background:"#E3F3E8",color:"#1E7A44"}}>متكرر</span>;
  return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold" style={{background:"#EAF1FE",color:"#1E52C7"}}>جديد</span>;
}

function BenModal({ben,onSave,onClose}:{ben:Partial<Beneficiary>;onSave:(b:Partial<Beneficiary>)=>void;onClose:()=>void}) {
  const [form,setForm]=useState<Partial<Beneficiary>&typeof EMPTY_BEN>({...EMPTY_BEN,...ben,
    /* الملفّات القديمة بلا نوع: يُخمَّن من شكل الرقم ويُعرض للتأكيد. */
    docType: ben.docType ?? (guessDocType(ben.idNumber ?? "") || undefined)});
  const [tried,setTried]=useState(false);
  const f=<K extends keyof typeof form>(k:K)=>(v:(typeof form)[K])=>setForm(p=>({...p,[k]:v}));
  const errors=validateBen(form);
  const invalid=Object.keys(errors).length>0;
  const def=docTypeDef(form.docType);
  const inp="w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none";
  const ist=(k:keyof BenErrors)=>({borderColor:tried&&errors[k]?"#BE2626":B.border,fontFamily:"inherit"} as const);
  const Err=({k}:{k:keyof BenErrors})=> tried&&errors[k] ? <div className="text-xs font-bold mt-1" style={{color:"#BE2626"}}>{errors[k]}</div> : null;
  const req=<span style={{color:"#BE2626"}}> *</span>;
  function submit(){
    setTried(true);
    if(invalid) return;
    onSave({...form, name:form.name.trim(), phone:form.phone.trim(), idNumber:(form.idNumber??"").replace(/\s/g,""),
      contactPhone:form.contactPhone?.trim()||undefined, docExpiry:form.docExpiry||undefined});
  }
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-auto"
      style={{background:"rgba(21,76,72,.55)"}} onClick={onClose}>
      <motion.div initial={{scale:.95,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:.95,opacity:0}}
        className="w-full max-w-lg my-4 rounded-2xl overflow-hidden" style={{background:"#fff"}} onClick={e=>e.stopPropagation()}>
        <div className="relative px-6 py-5" style={{background:B.primaryDeep}}>
          <div className="absolute top-0 inset-x-0 h-1" style={{background:`linear-gradient(90deg,${B.gold},${B.gold2})`}}/>
          <h3 className="font-extrabold text-base" style={{color:"#fff",margin:0}}>{ben.id?"تعديل بيانات المستفيد":"إضافة مستفيد جديد"}</h3>
          <div className="text-xs mt-1" style={{color:"#9DBAB6"}}>الحقول المعلَّمة بـ<span style={{color:"#F3A3A3"}}> * </span>إلزامية — لا يُحفظ ملفٌ ناقص</div>
          <button aria-label="إغلاق النافذة" title="إغلاق النافذة" onClick={onClose} className="absolute top-4 left-4 p-1 cursor-pointer" style={{background:"none",border:"none",color:"#9DBAB6"}}><X size={16}/></button>
        </div>
        <div className="p-6 grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Field label={<>الاسم الكامل{req}</>}>
              <input value={form.name} onChange={e=>f("name")(e.target.value)} placeholder="كما في الوثيقة" className={inp} style={ist("name")} aria-invalid={tried&&!!errors.name}/>
            </Field>
            <Err k="name"/>
          </div>
          <div>
            <Field label={<>نوع الوثيقة{req}</>}>
              <AppSelect value={form.docType??""} placeholder="اختر النوع" onChange={v=>f("docType")((v||undefined) as Beneficiary["docType"])}
                options={DOC_TYPES.map(d=>({value:d.value,label:`${d.icon} ${d.label.ar}`}))}/>
            </Field>
            <Err k="docType"/>
          </div>
          <div>
            <Field label={<>{numberLabelOf(form.docType,form.idNumber)}{req}</>}>
              <input value={form.idNumber} onChange={e=>f("idNumber")(e.target.value)} placeholder={form.docType?def.placeholder:"اختر النوع أولاً"}
                inputMode={form.docType&&def.numeric?"numeric":"text"} maxLength={form.docType?def.maxLength:15}
                className={inp} style={{...ist("idNumber"),direction:"ltr",textAlign:"left",fontFamily:"var(--font-app)"}} aria-invalid={tried&&!!errors.idNumber}/>
            </Field>
            {form.docType&&!(tried&&errors.idNumber)&&<div className="text-xs mt-1" style={{color:B.muted}}>{def.hint.ar}</div>}
            <Err k="idNumber"/>
          </div>
          <div>
            <Field label="انتهاء الوثيقة">
              <input type="date" value={form.docExpiry??""} onChange={e=>f("docExpiry")(e.target.value||undefined)}
                className={inp} style={{...ist("docExpiry"),direction:"ltr"}}/>
            </Field>
            <Err k="docExpiry"/>
          </div>
          <div>
            <Field label={<>الجنسية{req}</>}>
              <NationalitySelect value={form.nationality} onChange={f("nationality")} subInTrigger={false}/>
            </Field>
            <Err k="nationality"/>
          </div>
          <div>
            <Field label={<>تاريخ الميلاد{req}</>}>
              <input type="date" value={form.birthDate} onChange={e=>f("birthDate")(e.target.value)}
                className={inp} style={{...ist("birthDate"),direction:"ltr"}} aria-invalid={tried&&!!errors.birthDate}/>
            </Field>
            <Err k="birthDate"/>
          </div>
          <div>
            <label className="block text-xs font-bold mb-2" style={{color:B.text3}}>الجنس{req}</label>
            <div className="flex gap-3">
              {(["male","female"] as const).map(g=>(
                <button key={g} type="button" onClick={()=>f("gender")(g)}
                  className="flex-1 py-2.5 rounded-xl font-bold text-sm cursor-pointer transition-all"
                  style={{border:`1px solid ${form.gender===g?B.gold:B.border}`,background:form.gender===g?B.gold:"#fff",color:form.gender===g?B.black:B.text2}}>
                  {g==="male"?"ذكر":"أنثى"}
                </button>
              ))}
            </div>
          </div>
          {/* جوالان لا واحد: «ليس كل معتمر لديه جوال مستقل؛ فرّق بين جوال
              المستفيد وجوال مسؤول الحجز». */}
          <div>
            <Field label="جوال المستفيد">
              <input value={form.phone} onChange={e=>f("phone")(e.target.value)} placeholder="05xxxxxxxx — إن وُجد"
                className={inp} style={{...ist("phone"),direction:"ltr",textAlign:"left",fontFamily:"var(--font-app)"}}/>
            </Field>
            <Err k="phone"/>
          </div>
          <div>
            <Field label="جوال مسؤول الحجز">
              <input value={form.contactPhone??""} onChange={e=>f("contactPhone")(e.target.value)} placeholder="إن اختلف عن جوال المستفيد"
                className={inp} style={{...ist("contactPhone"),direction:"ltr",textAlign:"left",fontFamily:"var(--font-app)"}}/>
            </Field>
            <Err k="contactPhone"/>
          </div>
          <div className="col-span-2 rounded-xl px-3.5 py-2.5 text-xs" style={{background:B.fill,border:`1px dashed ${B.border}`,color:B.muted}}>
            صورة الوثيقة: تُفعَّل مع دلو التخزين الخاص (روابط موقّتة، حفظ حتى انتهاء الرحلة + ٩٠ يوماً). صورة جوازٍ في الدلو العام أسوأ من غيابها.
          </div>
        </div>
        <div className="px-6 pb-6 flex flex-col gap-3">
          {tried&&invalid&&<div className="text-xs font-bold rounded-lg px-3 py-2" style={{background:"#FBE6E6",color:"#BE2626",border:"1px solid #F3C9C9"}}>أكمل الحقول المعلَّمة — {Object.keys(errors).length} {Object.keys(errors).length===1?"حقل ناقص":"حقول ناقصة"}</div>}
          <div className="flex gap-3">
            <button onClick={submit} className="px-6 py-2.5 rounded-xl font-extrabold text-sm cursor-pointer"
              style={{background:B.gold,color:B.black,border:"none",opacity:tried&&invalid?0.6:1}}>حفظ المستفيد</button>
            <button onClick={onClose} className="px-6 py-2.5 rounded-xl font-bold text-sm cursor-pointer"
              style={{background:B.fill,color:B.text2,border:"none"}}>إلغاء</button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ═══ معاينة الربط الجماعي ═══
   «زر ربط الطلبات بالملفات يجب أن يعرض معاينة قبل التنفيذ». planLink
   كان يحسب الخطة أصلاً بلا كتابة — هنا تُعرض قبل الضغطة. */
function LinkPreviewModal({plan,bens,bookings,onConfirm,onClose}:{plan:LinkPlan;bens:Beneficiary[];bookings:Booking[];onConfirm:()=>void;onClose:()=>void}) {
  const benById=new Map(bens.map(b=>[b.id,b]));
  const bkById=new Map(bookings.map(b=>[b.id,b]));
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-auto"
      style={{background:"rgba(14,12,11,0.8)",backdropFilter:"blur(4px)"}} onClick={onClose}>
      <motion.div initial={{scale:0.95,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.95,opacity:0}}
        role="dialog" aria-modal="true" aria-label="معاينة الربط"
        className="w-full rounded-2xl overflow-hidden my-6" style={{maxWidth:620,background:"#fff"}} onClick={e=>e.stopPropagation()}>
        <div className="px-6 pt-6 pb-4">
          <h3 className="text-base font-bold" style={{color:B.black,margin:0}}>ما سيحدث عند الربط</h3>
          <p className="text-xs mt-1" style={{color:B.muted,margin:0}}>
            المطابقة برقم الوثيقة ثم الجوال — لا بالاسم. {plan.bookings} طلب سيصل إلى ملف.
          </p>
        </div>
        <div className="px-6 pb-4 flex flex-col gap-4" style={{maxHeight:"56vh",overflowY:"auto"}}>
          {plan.create.length>0&&(
            <div>
              <div className="text-xs font-bold mb-2" style={{color:"#1E7A44"}}>ملفات جديدة ({plan.create.length})</div>
              <div className="rounded-xl overflow-hidden" style={{border:`1px solid ${B.border}`}}>
                {plan.create.map((c,i)=>(
                  <div key={c.id} className="flex items-center gap-3 px-3.5 py-2.5 text-xs" style={{borderTop:i?`1px solid ${B.border}`:"none"}}>
                    <span className="font-bold text-sm flex-1 min-w-0 truncate" style={{color:B.black}}>{c.name}</span>
                    <span style={{color:B.muted,direction:"ltr",fontFamily:"var(--font-app)"}}>{formatPhone(c.phone)}</span>
                    <span style={{color:B.muted}}>{c.idNumber?`${docLabel(c.docType)||"وثيقة"} ${c.idNumber}`:"بلا وثيقة"}</span>
                    <span className="px-2 py-0.5 rounded-full font-bold" style={{background:"#E3F3E8",color:"#1E7A44"}}>{c.bookingIds.length} طلب</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {plan.attach.length>0&&(
            <div>
              <div className="text-xs font-bold mb-2" style={{color:"#1E52C7"}}>ربطٌ بملفات قائمة ({plan.attach.length})</div>
              <div className="rounded-xl overflow-hidden" style={{border:`1px solid ${B.border}`}}>
                {plan.attach.map((a,i)=>{ const b=benById.get(a.id); return (
                  <div key={a.id} className="px-3.5 py-2.5 text-xs" style={{borderTop:i?`1px solid ${B.border}`:"none"}}>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-sm flex-1 min-w-0 truncate" style={{color:B.black}}>{b?.name??a.id}</span>
                      <span style={{color:B.muted,direction:"ltr",fontFamily:"var(--font-app)"}}>{b?formatPhone(b.phone):""}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {a.add.map(id=>{ const bk=bkById.get(id); return (
                        <span key={id} className="px-2 py-0.5 rounded-md" style={{background:B.fill,border:`1px solid ${B.border}`,color:B.text2,fontFamily:"var(--font-app)"}}>
                          {id}{bk?` · ${bk.createdAt?.slice(0,10)}`:""}
                        </span>
                      );})}
                    </div>
                  </div>
                );})}
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-3 px-6 py-5" style={{borderTop:`1px solid ${B.border}`}}>
          <button onClick={onConfirm} className="flex-1 py-3 rounded-xl text-sm font-bold cursor-pointer" style={{background:B.gold,color:B.black,border:"none"}}>تنفيذ الربط</button>
          <button onClick={onClose} className="px-5 py-3 rounded-xl text-sm font-bold cursor-pointer" style={{background:B.fill,color:B.text2,border:"none"}}>تراجع</button>
        </div>
      </motion.div>
    </motion.div>
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
    return v?String(v):"—";
  };
  const merge=async(keep:Beneficiary,drop:Beneficiary)=>{ setBusy(true); await onMerge(keep,drop); setBusy(false); if(idx>=pairs.length-1) onClose(); };
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-auto"
      style={{background:"rgba(14,12,11,0.8)",backdropFilter:"blur(4px)"}} onClick={onClose}>
      <motion.div initial={{scale:0.95,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.95,opacity:0}}
        role="dialog" aria-modal="true" aria-label="تكرار محتمل"
        className="w-full rounded-2xl overflow-hidden my-6" style={{maxWidth:680,background:"#fff"}} onClick={e=>e.stopPropagation()}>
        <div className="px-6 pt-6 pb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold" style={{color:B.black,margin:0}}>تكرار محتمل {idx+1} من {pairs.length}</h3>
            <p className="text-xs mt-1" style={{color:B.muted,margin:0}}>
              تطابق {pair.reason==="doc"?"رقم الوثيقة":"الجوال"}. الدمج يُبقي ملفاً وينقل إليه حجوزات الآخر ويُكمل حقوله الفارغة، ويؤرشف الآخر بسببٍ يسمّي الباقي.
            </p>
          </div>
          <button aria-label="إغلاق" onClick={onClose} className="p-1 cursor-pointer" style={{background:"none",border:"none",color:B.muted}}><X size={16}/></button>
        </div>
        <div className="px-6 pb-4 overflow-x-auto">
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead><tr style={{background:B.cream,color:"#7a7168",fontSize:12}}>
              <th style={{padding:"9px 12px",textAlign:"right"}}>الحقل</th>
              <th style={{padding:"9px 12px",textAlign:"right"}}>{pair.a.id} · {countOf(pair.a)} طلب</th>
              <th style={{padding:"9px 12px",textAlign:"right"}}>{pair.b.id} · {countOf(pair.b)} طلب</th>
            </tr></thead>
            <tbody>
              {CMP_FIELDS.map(({k,l})=>{ const va=show(pair.a,k), vb=show(pair.b,k); const diff=va!==vb; return (
                <tr key={k} style={{borderTop:`1px solid ${B.border}`}}>
                  <td style={{padding:"9px 12px",color:B.muted,fontSize:12}}>{l}</td>
                  <td style={{padding:"9px 12px",color:B.black,fontWeight:diff?700:400,background:diff&&va!=="—"?"#FBF3D6":"transparent"}}>{va}</td>
                  <td style={{padding:"9px 12px",color:B.black,fontWeight:diff?700:400,background:diff&&vb!=="—"?"#FBF3D6":"transparent"}}>{vb}</td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-3 px-6 py-5" style={{borderTop:`1px solid ${B.border}`}}>
          <button disabled={busy} onClick={()=>merge(pair.a,pair.b)} className="flex-1 py-2.5 rounded-xl text-sm font-bold cursor-pointer" style={{background:B.gold,color:B.black,border:"none",opacity:busy?0.6:1}}>أبقِ {pair.a.id} وادمج الآخر فيه</button>
          <button disabled={busy} onClick={()=>merge(pair.b,pair.a)} className="flex-1 py-2.5 rounded-xl text-sm font-bold cursor-pointer" style={{background:B.gold,color:B.black,border:"none",opacity:busy?0.6:1}}>أبقِ {pair.b.id} وادمج الآخر فيه</button>
          <button disabled={busy} onClick={()=>idx<pairs.length-1?setIdx(i=>i+1):onClose()} className="px-4 py-2.5 rounded-xl text-sm font-bold cursor-pointer" style={{background:B.fill,color:B.text2,border:"none"}}>{idx<pairs.length-1?"ليسا الشخص نفسه — التالي":"إغلاق"}</button>
        </div>
      </motion.div>
    </motion.div>
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
    <div className="rounded-2xl p-5 mb-5" style={{background:"#fff",border:"1px solid #EBD9A0"}}>
      <div className="font-bold mb-1 flex items-center gap-2" style={{color:B.black,fontSize:15}}><ShieldAlert size={15} style={{color:"#8A6A08"}}/>احتياجات خاصة <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{background:"#FBF3D6",color:"#8A6A08"}}>يراها المدير وحده</span></div>
      <div className="text-xs mb-3" style={{color:B.muted}}>ما تحتاجه الرحلة تشغيلياً فقط — كرسي متحرك، مرافق، دواء لازم. لا تشخيصات.</div>
      {state==="unsupported"?(
        <div className="text-xs" style={{color:"#B4530C"}}>يُفعَّل بعد تشغيل ترحيل 20260914 على قاعدة البيانات.</div>
      ):(
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><Field label="احتياجات الحركة"><textarea value={mobility} onChange={e=>setMobility(e.target.value)} rows={2} placeholder="كرسي متحرك · يحتاج مرافقاً · مقعد قريب من الباب" disabled={state==="loading"}
              className="w-full rounded-xl border px-3.5 py-2.5 text-sm resize-none focus:outline-none" style={{borderColor:B.border,fontFamily:"inherit",color:B.black}}/></Field></div>
            <div><Field label="الحالة الصحية اللازمة للرحلة"><textarea value={health} onChange={e=>setHealth(e.target.value)} rows={2} placeholder="سكّري يحتاج تبريد الدواء · حساسية غذائية" disabled={state==="loading"}
              className="w-full rounded-xl border px-3.5 py-2.5 text-sm resize-none focus:outline-none" style={{borderColor:B.border,fontFamily:"inherit",color:B.black}}/></Field></div>
          </div>
          <div className="flex justify-end mt-3">
            <button onClick={save} disabled={!dirty||busy} className="px-5 py-2 rounded-xl text-xs font-bold cursor-pointer" style={{background:dirty?B.gold:B.fill,color:dirty?B.black:B.muted,border:"none"}}>{busy?"جارٍ الحفظ…":dirty?"حفظ":"محفوظ"}</button>
          </div>
        </>
      )}
    </div>
  );
}

function CancellationModal({booking,onClose}:{booking:Booking;onClose:()=>void}) {
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-auto"
      style={{background:"rgba(21,76,72,.65)"}} onClick={onClose}>
      <div className="w-full max-w-md my-6 rounded-2xl overflow-hidden" style={{background:"#fff",boxShadow:"0 24px 64px -12px rgba(21,76,72,.45)"}} onClick={e=>e.stopPropagation()}>
        <div className="relative px-6 py-5" style={{background:B.primaryDeep}}>
          <div className="absolute top-0 inset-x-0 h-1.5" style={{background:`linear-gradient(90deg,${B.gold},${B.gold2},${B.gold})`}}/>
          <div className="flex items-center justify-between">
            <div>
              <div style={{fontFamily:"var(--font-app)",fontSize:18,fontWeight:800,color:"#fff"}}>إشعار إلغاء</div>
              <div className="text-xs mt-1" style={{color:"#9DBAB6"}}>رقم الطلب: <span style={{fontFamily:"var(--font-app)"}}>{booking.id}</span></div>
            </div>
            <button aria-label="إغلاق النافذة" title="إغلاق النافذة" onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer" style={{background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.15)",color:"#CDE7E4"}}><X size={14}/></button>
          </div>
        </div>
        <div className="px-6 py-5 flex flex-col gap-4">
          <div>
            <div className="text-xs font-extrabold mb-1" style={{color:B.primary}}>العميل</div>
            <div className="font-extrabold text-base" style={{color:"#000"}}>{booking.clientName}</div>
            <div className="text-sm font-mono" style={{color:B.muted,direction:"ltr"}}>{booking.clientPhone}</div>
          </div>
          <div className="rounded-xl px-4 py-3 text-sm font-bold flex items-center gap-2" style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}>
            <X size={14}/>تم إلغاء هذا الطلب.
          </div>
          <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{background:B.fill,border:`1px solid ${B.border}`}}>
            <span className="font-bold text-sm" style={{color:"#000"}}>المبلغ المسترد</span>
            <span style={{fontFamily:"var(--font-app)",fontSize:18,fontWeight:800,color:"#000"}}>{sar(booking.total)}</span>
          </div>
          <div className="text-center text-xs font-bold pt-2" style={{color:B.text2,borderTop:`1px solid ${B.border}`}}><OrgLine/></div>
        </div>
      </div>
    </motion.div>
  );
}

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
  const [genderFilter,setGenderFilter]=useState<"all"|"male"|"female">("all");
  const [detailId,setDetailId]=useState<string|null>(null);
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

  const filtered = bens.filter(b=>
    (genderFilter==="all"||b.gender===genderFilter)&&
    (!query||(b.name+b.phone+b.idNumber).includes(query))
  );

  /* ترقيم الصفحات — الرسم على الصفحة الحالية وحدها. المفتاح يُعيد
     للصفحة الأولى عند تغيّر البحث أو المرشّح: من كان في الصفحة الخامسة
     ثم بحث عن اسم يجب أن يرى أول النتائج لا صفحتها الخامسة. */
  const localPg = usePaged(filtered, `${query}|${genderFilter}`);

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
    if(detailId===drop.id) setDetailId(keep.id);
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
  };

  const gBtn=(v:"all"|"male"|"female",l:string)=>({
    padding:"7px 18px",borderRadius:999,fontSize:13,fontWeight:700,cursor:"pointer" as const,
    border:`1px solid ${genderFilter===v?B.gold:B.border}`,
    background:genderFilter===v?B.gold:"#fff",
    color:genderFilter===v?B.black:B.text2,
  });

  /* سجلّ الملف مشتقٌّ لا مقروءٌ من bookingIds وحده: حجزٌ وصل من التطبيق
     ولم يُربط بعد كان يجعل ملفّ عميلٍ حجز ثلاث مرّات يقول «لا توجد
     طلبات مسجّلة». */
  const detailBookings = detail ? (benBookings.get(detail.id) ?? []) : [];
  if(detail) return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{background: B.bg}}>
      <PageHeader title="المستفيدون" crumb="ملف المستفيد" search={search} onSearch={setSearch} onMenuOpen={onMenuOpen}/>
      <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className="flex-1 px-4 md:px-8 pb-12 pt-5 max-w-4xl">
        <button onClick={()=>setDetailId(null)} className="flex items-center gap-2 text-sm font-bold mb-5 cursor-pointer" style={{background:"none",border:"none",color:B.text2}}>
          <ArrowRight size={14}/>عودة للمستفيدين
        </button>
        {/* Profile header */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          <div className="rounded-2xl p-5 flex items-center gap-4" style={{background:"#fff",border:`1px solid ${B.border}`}}>
            <div className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0 font-extrabold text-2xl"
              style={{background:detail.gender==="female"?"#F1E9FA":"#12100F",color:detail.gender==="female"?"#7226BE":B.gold}}>
              {detail.name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-extrabold text-lg" style={{color:B.black,fontFamily:"var(--font-app)"}}>{detail.name}</div>
              <div className="text-sm font-mono mt-0.5" style={{color:B.muted,direction:"ltr"}}>{detail.phone}</div>
              <div className="mt-2"><BenTag b={detail} count={detailBookings.length}/></div>
            </div>
            <div className="flex flex-col gap-2 flex-shrink-0">
              <button onClick={()=>openEdit(detail)} className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer" style={{background:"#fff",color:B.text2,border:`1px solid ${B.border}`}}>تعديل</button>
              <button onClick={()=>toggleSuspend(detail.id)} className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
                style={{background:detail.suspended?"#E3F3E8":"#FBE6E6",color:detail.suspended?"#1E7A44":"#BE2626",border:`1px solid ${detail.suspended?"#C4E4CE":"#F3C9C9"}`}}>
                {detail.suspended?"إلغاء الإيقاف":"إيقاف"}
              </button>
            </div>
          </div>
          <div className="rounded-2xl p-5" style={{background:B.surface,border:`1px solid ${B.border}`}}>
            <div className="grid grid-cols-3 gap-4">
              {[{l:"الطلبات",v:detailBookings.length},{l:"مكتملة",v:detailBookings.filter(bk=>bk.status==="confirmed").length},{l:"الإنفاق",v:sar(detailBookings.filter(bk=>["paid","confirmed"].includes(bk.status)).reduce((a,bk)=>a+bk.total,0))}].map(s=>(
                <div key={s.l}>
                  <div className="text-xs mb-1" style={{color:B.muted,fontWeight:600}}>{s.l}</div>
                  <div className="font-extrabold text-xl leading-tight" style={{color:B.gold,fontFamily:"var(--font-app)"}}>{s.v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* Personal data */}
        <div className="rounded-2xl p-5 mb-5" style={{background:"#fff",border:`1px solid ${B.border}`}}>
          <div className="font-bold mb-4 flex items-center gap-2 flex-wrap" style={{color:B.black,fontSize:15}}>البيانات الشخصية
            {detail.source==="auto"&&<span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{background:"#EAF1FE",color:"#1E52C7"}}>أُنشئ تلقائياً من الحجز {detail.createdFrom}</span>}
            {isExpired(detail.docExpiry)&&<span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{background:"#FBE6E6",color:"#BE2626"}}>الوثيقة منتهية</span>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              {l:"نوع الوثيقة",v:docLabel(detail.docType||guessDocType(detail.idNumber))||"—"},
              {l:numberLabelOf(detail.docType,detail.idNumber),v:detail.idNumber||"—",mono:true},
              {l:"انتهاء الوثيقة",v:detail.docExpiry||"—",mono:true},
              {l:"الجنس",v:detail.gender==="male"?"ذكر":"أنثى"},
              {l:"الجنسية",v:detail.nationality||"—"},
              {l:"تاريخ الميلاد",v:detail.birthDate||"—",mono:true},
              {l:"جوال المستفيد",v:detail.phone?formatPhone(detail.phone):"—",mono:true},
              {l:"جوال مسؤول الحجز",v:detail.contactPhone?formatPhone(detail.contactPhone):"نفسه",mono:true},
            ].map(f=>(
              <div key={f.l}>
                <div className="text-xs font-semibold mb-0.5" style={{color:B.muted}}>{f.l}</div>
                <div className="font-bold text-sm" style={{color:B.black,fontFamily:f.mono?"var(--font-app)":"inherit",direction:f.mono?"ltr":undefined,textAlign:"right"}}>{f.v}</div>
              </div>
            ))}
          </div>
        </div>
        {isAdmin&&<PrivateNeeds benId={detail.id}/>}
        {/* Rating + Notes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          <div className="rounded-2xl p-5" style={{background:"#fff",border:`1px solid ${B.border}`}}>
            <div className="font-bold mb-3" style={{color:B.black,fontSize:15}}>تقييم المستفيد</div>
            <StarRating value={detail.rating} onChange={r=>setRating(detail.id,r)}/>
            <div className="text-xs mt-2" style={{color:B.muted}}>اضغط على النجوم لتحديث التقييم</div>
          </div>
          <div className="rounded-2xl p-5" style={{background:"#fff",border:`1px solid ${B.border}`}}>
            <div className="font-bold mb-3" style={{color:B.black,fontSize:15}}>ملاحظات داخلية</div>
            <textarea value={detail.notes} onChange={e=>setNotes(detail.id,e.target.value)}
              rows={3} placeholder="تفضيلاته، متطلبات خاصة..."
              className="w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none resize-none"
              style={{borderColor:B.border,fontFamily:"inherit",color:B.black}}/>
          </div>
        </div>
        {/* Booking history */}
        <div className="rounded-2xl overflow-hidden" style={{background:"#fff",border:`1px solid ${B.border}`}}>
          <div className="px-5 py-4 font-bold" style={{color:B.black,borderBottom:`1px solid ${B.border}`}}>سجل الطلبات ({detailBookings.length})</div>
          <div className="tbl-scroll">
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
              <thead>
                <tr style={{background:B.cream,color:"#7a7168",fontSize:12,textAlign:"right"}}>
                  {["رقم الطلب","التاريخ","المبلغ","الحالة","المستندات"].map(h=>(
                    <th key={h} className={h==="إجراء"||h==="إجراءات"?"col-action":undefined} style={{padding:"11px 16px",fontWeight:700}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detailBookings.map(bk=>{
                  const docBtn=(label:string,on:()=>void,icon:any)=>{const Icon=icon;return (
                    <button onClick={on} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
                      style={{background:B.fill,border:`1px solid ${B.border}`,color:"#8a6a08"}}><Icon size={12}/>{label}</button>
                  );};
                  const cancelled=bk.status==="cancelled"||bk.status==="rejected";
                  const confirmed=bk.status==="confirmed";
                  return (
                  <tr key={bk.id} style={{borderTop:`1px solid ${B.border}`}}>
                    <td style={{padding:"13px 16px",fontWeight:700,fontFamily:"var(--font-app)",color:B.black,fontSize:13}}>{bk.id}</td>
                    <td style={{padding:"13px 16px",color:B.text3}}>{bk.createdAt}</td>
                    <td style={{padding:"13px 16px",fontWeight:700,color:B.black,fontFamily:"var(--font-app)"}}>{sar(bk.total)}</td>
                    <td style={{padding:"13px 16px"}}><StatusBadge status={bk.status} entity="booking"/></td>
                    <td style={{padding:"10px 16px"}}>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {cancelled
                          ? docBtn("إشعار الإلغاء",()=>setCancelView(bk),X)
                          : confirmed
                            ? <>{docBtn("الفاتورة",()=>openInvoice(bk),CreditCard)}{docBtn("التذكرة",()=>openTicket(bk),Ticket)}</>
                            : docBtn("الفاتورة المبدئية",()=>openInvoice(bk),CreditCard)}
                      </div>
                    </td>
                  </tr>
                  );
                })}
                {detailBookings.length===0&&<tr><td colSpan={5} style={{padding:"32px 16px",textAlign:"center",color:B.muted}}>لا توجد طلبات مسجّلة</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>
      <AnimatePresence>
        {showModal&&<BenModal ben={editTarget||{}} onSave={saveBen} onClose={()=>{setShowModal(false);setEditTarget(null);}}/>}
        {invoiceView&&<InvoiceModal pay={invoiceView} onClose={()=>setInvoiceView(null)}/>}
        {ticketView&&<TicketCard ticket={ticketView} onClose={()=>setTicketView(null)}/>}
        {cancelView&&<CancellationModal booking={cancelView} onClose={()=>setCancelView(null)}/>}
      </AnimatePresence>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{background: B.bg}}>
      <PageHeader title="المستفيدون" crumb="إدارة المستفيدين" search={search} onSearch={setSearch} onMenuOpen={onMenuOpen}/>
      {/* Stats */}
      <div className="px-4 md:px-8 pt-4 md:pt-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="إجمالي المستفيدين" value={stats.total} sub="في السجل" accent/>
          <StatCard label="ذكور" value={stats.male} sub="معتمر"/>
          <StatCard label="إناث" value={stats.female} sub="معتمرة"/>
          <StatCard label="حجوزات متكررة" value={stats.repeat} sub="أكثر من رحلة"/>
        </div>
        <div className="flex items-center justify-between gap-3 mt-5 flex-wrap">
          <div className="flex gap-2">
            <button style={gBtn("all","الكل")} onClick={()=>setGenderFilter("all")}>الكل</button>
            <button style={gBtn("male","ذكور")} onClick={()=>setGenderFilter("male")}>ذكور</button>
            <button style={gBtn("female","إناث")} onClick={()=>setGenderFilter("female")}>إناث</button>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm" style={{color:B.muted}}>{srv.searching?"جارِ البحث…":`${pg.total} مستفيد`}</span>
            {/* زرّ الإضافة يُخفى لا يُعطَّل: زرٌّ مرئي يعد بعملٍ لا يُنجَز. */}
            {mayWrite && (
            <button onClick={()=>{openForm(null);}} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer"
              style={{background:B.gold,color:B.black,border:"none",boxShadow:"0 4px 12px rgba(192,134,44,0.3)"}}>
              <Plus size={14}/>إضافة مستفيد
            </button>
            )}
          </div>
        </div>
        {/* طلبات وصلت بلا ملف مستفيد. شريطٌ يُقال لا عمل صامت: إنشاء
            ملفات في القاعدة قرارٌ، ولغير المدير يردّه حرس الكتابة. */}
        {!planIsEmpty(plan)&&(
          <div className="flex flex-wrap items-center gap-3 mt-4 px-4 py-3 rounded-xl"
            style={{background:"#FBF3D6",border:"1px solid #E8D9A8"}}>
            <Link2 size={16} style={{color:"#8A6A08",flexShrink:0}}/>
            <div className="flex-1 min-w-0 text-sm" style={{color:"#6b5306"}}>
              <span className="font-bold">{plan.bookings} طلب</span>
              {" بلا ربط بملف مستفيد"}
              {plan.create.length>0&&<> — منها <span className="font-bold">{plan.create.length}</span> تحتاج ملفاً جديداً</>}
            </div>
            {mayWrite
              ? <div className="flex gap-2 flex-shrink-0">
                  <button onClick={()=>setLinkPreview(true)} className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
                    style={{background:B.gold,color:B.black,border:"none"}}>معاينة الربط</button>
                  {isSupabaseEnabled&&<button onClick={autoLink} title="يُنشئ الملفات في القاعدة من بطاقات المعتمرين (ترحيل 20260914)" className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
                    style={{background:"#fff",color:B.text2,border:`1px solid ${B.border}`}}>إنشاء تلقائي من الحجوزات المؤكَّدة</button>}
                </div>
              : <span className="text-xs flex-shrink-0" style={{color:"#8A6A08"}}>الربط لمدير النظام</span>}
          </div>
        )}
        {/* تكرارٌ محتمل — بالجوال أو الوثيقة. يُعرض ولا يُدمج من تلقائه. */}
        {dups.length>0&&(
          <div className="flex flex-wrap items-center gap-3 mt-3 px-4 py-3 rounded-xl" style={{background:"#FBE6E6",border:"1px solid #F3C9C9"}}>
            <CopyIcon size={16} style={{color:"#BE2626",flexShrink:0}}/>
            <div className="flex-1 min-w-0 text-sm" style={{color:"#8A2020"}}>
              <span className="font-bold">{dups.length}</span> {dups.length===1?"تكرار محتمل":"تكرارات محتملة"} — ملفّان بنفس {dups.some(d=>d.reason==="doc")?"رقم الوثيقة":"الجوال"}
            </div>
            <button onClick={()=>setDupOpen(true)} className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer flex-shrink-0"
              style={{background:"#fff",color:"#BE2626",border:"1px solid #F3C9C9"}}>{mayWrite?"مقارنة ودمج":"عرض المقارنة"}</button>
          </div>
        )}
        <div className="mt-4" style={{height:1,background:B.border}}/>
      </div>
      {/* Desktop table */}
      <main className="flex-1 px-4 md:px-8 pb-12 pt-6">
        <EntityGate entity="beneficiaries" label="المستفيدين" cols={8}>
        <div className="hidden md:block rounded-2xl overflow-hidden" style={{background:"#fff",border:`1px solid ${B.border}`}}>
          <div className="tbl-scroll tbl-wide">
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
            <thead>
              <tr style={{background:B.cream,color:"#7a7168",fontSize:12,textAlign:"right"}}>
                {["المستفيد","الجوال","الجنس","رقم الهوية","الطلبات","التقييم","التصنيف","إجراء"].map(h=>(
                  <th key={h} className={h==="إجراء"||h==="إجراءات"?"col-action":undefined} style={{padding:"13px 16px",fontWeight:700}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pg.rows.map((b,i)=>(
                <tr key={b.id} style={{borderTop:`1px solid ${B.border}`,background:i%2===0?"#fff":"#FDFCFA"}}>
                  <td style={{padding:"14px 16px"}}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                        style={{background:b.gender==="female"?"#F1E9FA":"#12100F",color:b.gender==="female"?"#7226BE":B.gold}}>
                        {b.name[0]}
                      </div>
                      <span className="font-bold" style={{color:B.black}}>{b.name}</span>
                    </div>
                  </td>
                  <td style={{padding:"14px 16px",fontFamily:"var(--font-app)",color:B.text2,fontSize:13}}>{b.phone}</td>
                  <td style={{padding:"14px 16px",color:B.text3}}>{b.gender==="male"?"ذكر":"أنثى"}</td>
                  <td style={{padding:"14px 16px",fontFamily:"var(--font-app)",color:B.muted,fontSize:13}}>
                    <div style={{direction:"ltr",textAlign:"right"}}>{b.idNumber||"—"}</div>
                    {(b.docType||guessDocType(b.idNumber))&&<div className="text-xs" style={{fontFamily:"inherit",color:isExpired(b.docExpiry)?"#BE2626":B.muted}}>{docLabel(b.docType||guessDocType(b.idNumber))}{isExpired(b.docExpiry)?" · منتهية":""}</div>}
                  </td>
                  <td style={{padding:"14px 16px",fontWeight:700,color:B.black,textAlign:"center"}}>{countOf(b)}</td>
                  <td style={{padding:"14px 16px"}}>
                    <div className="flex gap-0.5">
                      {[1,2,3,4,5].map(n=><span key={n} style={{color:n<=b.rating?B.gold:"#D8D0C4",fontSize:16}}>★</span>)}
                    </div>
                  </td>
                  <td style={{padding:"14px 16px"}}><BenTag b={b} count={countOf(b)}/></td>
                  <td className="col-action" style={{padding:"14px 16px"}}>
                    <div className="flex gap-2">
                      <button onClick={()=>setDetailId(b.id)} className="px-4 py-1.5 rounded-lg text-xs font-bold cursor-pointer" style={{background:B.gold,color:B.black,border:"none"}}>الملف</button>
                      <button onClick={()=>openEdit(b)} className="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer" style={{background:"#fff",color:B.text2,border:`1px solid ${B.border}`}}>تعديل</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!srv.searching&&pg.total===0&&<tr><td colSpan={8} style={{padding:"48px 16px",textAlign:"center",color:B.muted,fontWeight:600}}>لا يوجد مستفيدون مطابقون</td></tr>}
            </tbody>
          </table>
          </div>
        </div>
        {/* Mobile cards */}
        <div className="md:hidden flex flex-col gap-3">
          {pg.rows.map(b=>(
            <motion.div key={b.id} initial={{opacity:0,y:6}} animate={{opacity:1,y:0}}
              className="rounded-2xl p-4" style={{background:"#fff",border:`1px solid ${B.border}`}}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold flex-shrink-0"
                  style={{background:b.gender==="female"?"#F1E9FA":"#12100F",color:b.gender==="female"?"#7226BE":B.gold}}>
                  {b.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm" style={{color:B.black}}>{b.name}</div>
                  <div className="text-xs font-mono" style={{color:B.muted}}>{b.phone}</div>
                </div>
                <BenTag b={b} count={countOf(b)}/>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex gap-0.5">{[1,2,3,4,5].map(n=><span key={n} style={{color:n<=b.rating?B.gold:"#D8D0C4",fontSize:14}}>★</span>)}</div>
                <div className="flex gap-2">
                  <button onClick={()=>setDetailId(b.id)} className="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer" style={{background:B.gold,color:B.black,border:"none"}}>الملف</button>
                  <button onClick={()=>openEdit(b)} className="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer" style={{background:"#fff",color:B.text2,border:`1px solid ${B.border}`}}>تعديل</button>
                </div>
              </div>
            </motion.div>
          ))}
          {!srv.searching&&pg.total===0&&<div className="flex flex-col items-center py-16 rounded-2xl" style={{border:`2px dashed ${B.border}`,color:B.muted}}><Users size={28} style={{opacity:.3,marginBottom:8}}/><p className="text-sm">لا يوجد مستفيدون مطابقون</p></div>}
        </div>
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
