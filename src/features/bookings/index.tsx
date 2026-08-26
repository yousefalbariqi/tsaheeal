import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Pencil, X, Check, Bus, BookOpen, Armchair, ArrowRight, Repeat, Phone, Link2, Plus, Copy as CopyIcon } from "lucide-react";
import { B } from "@/lib/theme";
import type { Pkg, Trip, Payment, Pilgrim, BookingStatus, Booking } from "@/types";
import { openWhatsApp, copyText, payLinkFor, firstTwo, genderGlyph, newId} from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";
import { Spinner } from "@/components/Spinner";
import { StatCard } from "@/components/StatCard";
import { PageHeader } from "@/components/PageHeader";
import { AppSelect } from "@/components/AppSelect";
import { NationalitySelect } from "@/components/NationalitySelect";
import { DOC_TYPES, docTypeDef, guessDocType, numberLabelOf } from "@/data/docTypes";
import { BusSeatGrid } from "@/components/BusSeatGrid";
import { useStore, flushSync, clearSyncError } from "@/store/useStore";
import { PAY_ACCOUNT, TASAHEEL_BRANCHES } from "@/features/payments";
import { Field } from "@/components/Field";
import { Pager, usePaged } from "@/components/Pager";

const PAY_METHODS_INTERNAL = ["كاش","تحويل بنكي","آجل للموظف"];
const validPhone = (p:string) => /^(05\d{8}|(\+?966)5\d{8})$/.test(p.replace(/\s/g,""));

/* ════════ إضافة طلب جديد (حجز داخلي للموظف) ════════ */
function NewOrderModal({packages,trips,onCreate,onClose}:{
  packages:Pkg[];trips:Trip[];
  onCreate:(d:{clientName:string;clientPhone:string;tripId:string;persons:number;payMethod:string})=>string|null;
  onClose:()=>void;
}) {
  const [clientName,setClientName]=useState("");
  const [clientPhone,setClientPhone]=useState("");
  const [packageId,setPackageId]=useState("");
  const [tripId,setTripId]=useState("");
  const [persons,setPersons]=useState(1);
  const [payMethod,setPayMethod]=useState(PAY_METHODS_INTERNAL[0]);
  const [errors,setErrors]=useState<{[k:string]:string}>({});
  const [busy,setBusy]=useState(false);
  const [done,setDone]=useState<string|null>(null);
  const inp="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none";
  const ist={borderColor:B.border,background:"#fff",color:B.black,fontFamily:"inherit"} as const;
  const req=<span style={{color:B.gold}}>*</span>;

  const availTrips = trips.filter(t=>t.packageId===packageId && t.status==="open" && (t.seats-t.bookedSeats)>0);
  const selTrip = trips.find(t=>t.id===tripId);
  const maxSeats = selTrip ? Math.max(1,selTrip.seats-selTrip.bookedSeats) : 1;
  const Err=({k}:{k:string})=> errors[k] ? <div className="text-xs font-bold mt-1" style={{color:"#BE2626"}}>{errors[k]}</div> : null;

  function validate(){
    const e:{[k:string]:string}={};
    if(!clientName.trim()) e.name="اسم العميل مطلوب";
    if(!validPhone(clientPhone)) e.phone="رقم جوال غير صحيح";
    if(!packageId) e.pkg="اختر الباقة";
    if(!tripId) e.trip="اختر الرحلة";
    if(persons<1) e.persons="عدد المقاعد على الأقل 1";
    else if(selTrip && persons>maxSeats) e.persons=`المتبقي ${maxSeats} مقاعد فقط`;
    setErrors(e); return Object.keys(e).length===0;
  }
  /* ينتظر ردّ القاعدة قبل شاشة النجاح. كان يعرض «تمت الإضافة بنجاح»
     فور استدعاء onCreate — والكتابة تفاؤلية، فالرفض (سعة ممتلئة، مقعد
     مبيع، صلاحية ناقصة) يصل بعد أن قرأ الموظف النجاح وأغلق النافذة. */
  async function submit(){
    if(busy) return;
    if(!validate()) return;
    setBusy(true);
    const err=onCreate({clientName:clientName.trim(),clientPhone:clientPhone.replace(/\s/g,""),tripId,persons,payMethod});
    if(err){ setErrors(x=>({...x,seats:err})); setBusy(false); return; }
    const syncErr=await flushSync();
    if(syncErr){ setErrors(x=>({...x,seats:syncErr})); setBusy(false); return; }
    setBusy(false);
    setDone(`تم إنشاء الطلب بحالة «مؤكد».`);
  }

  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-auto"
      style={{background:"rgba(21,76,72,.6)"}} onClick={onClose}>
      <motion.div initial={{scale:.96,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:.96,opacity:0}}
        className="w-full max-w-lg my-4 rounded-2xl overflow-hidden" style={{background:"#fff"}} onClick={e=>e.stopPropagation()}>
        <div className="relative px-6 py-5" style={{background:B.primary}}>
          <div className="absolute top-0 inset-x-0 h-1" style={{background:`linear-gradient(90deg,${B.gold},${B.gold2})`}}/>
          <h3 className="font-extrabold text-base" style={{color:"#fff",margin:0,fontFamily:"var(--font-app)"}}>إضافة طلب جديد</h3>
          <button onClick={onClose} className="absolute top-4 left-4 p-1 cursor-pointer" style={{background:"none",border:"none",color:"#9DBAB6"}}><X size={16}/></button>
        </div>

        {done ? (
          <div className="p-8 flex flex-col items-center text-center gap-3">
            <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{background:"#E3F3E8"}}><Check size={32} style={{color:"#1E7A44"}}/></div>
            <div className="font-extrabold text-lg" style={{color:B.black}}>تمت الإضافة بنجاح</div>
            <div className="text-sm" style={{color:B.text2}}>{done}</div>
            <button onClick={onClose} className="mt-2 px-6 py-2.5 rounded-xl font-bold text-sm cursor-pointer" style={{background:B.gold,color:B.black,border:"none"}}>تم</button>
          </div>
        ) : (
        <>
        <div className="p-6 grid grid-cols-2 gap-4">
          <div>
            <Field label={<>اسم العميل {req}</>}>
              <input value={clientName} onChange={e=>setClientName(e.target.value)} placeholder="الاسم الكامل" className={inp} style={ist}/>
            </Field>
            <Err k="name"/>
          </div>
          <div>
            <Field label={<>رقم الجوال {req}</>}>
              <input value={clientPhone} onChange={e=>setClientPhone(e.target.value)} placeholder="05xxxxxxxx" className={inp} style={{...ist,direction:"ltr",textAlign:"right"}}/>
            </Field>
            <Err k="phone"/>
          </div>
          <div className="col-span-2">
            <Field label={<>الباقة {req}</>}>
              <AppSelect value={packageId} placeholder="اختر الباقة" onChange={v=>{setPackageId(v);setTripId("");}}
                options={packages.map(p=>({value:p.id,label:p.name}))}/>
            </Field>
            <Err k="pkg"/>
          </div>
          <div className="col-span-2">
            <Field label={<>الرحلة {req}</>}>
              <AppSelect value={tripId} placeholder={packageId?"اختر الرحلة المتاحة":"اختر الباقة أولاً"}
                disabled={!packageId} onChange={setTripId}
                options={availTrips.map(t=>({value:t.id,label:`${t.departureDate} · ${packages.find(p=>p.id===t.packageId)?.name??t.id} · المتبقي ${t.seats-t.bookedSeats}`}))}/>
            </Field>
            {packageId&&availTrips.length===0&&<div className="text-xs mt-1" style={{color:B.muted}}>لا توجد رحلات متاحة لهذه الباقة.</div>}
            <Err k="trip"/>
          </div>
          <div>
            <Field label={<>عدد المقاعد {req}</>}>
              <input type="number" min={1} max={maxSeats} value={persons} onChange={e=>setPersons(Math.max(1,Number(e.target.value)||1))} className={inp} style={{...ist,direction:"ltr",textAlign:"right"}}/>
            </Field>
            <Err k="persons"/>
          </div>
          <div>
            <Field label={<>طريقة الدفع {req}</>}>
              <AppSelect value={payMethod} onChange={setPayMethod} options={PAY_METHODS_INTERNAL.map(m=>({value:m,label:m}))}/>
            </Field>
          </div>
          {errors.seats&&<div className="col-span-2 rounded-xl px-4 py-3 text-xs font-bold" style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}>{errors.seats}</div>}
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={submit} disabled={busy} className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-extrabold text-sm"
            style={{background:busy?"#d6cfc6":B.gold,color:busy?"#a09688":B.black,border:"none",cursor:busy?"not-allowed":"pointer"}}>
            {busy&&<Spinner size={14} color={B.black}/>}
            {busy?"جارٍ الحفظ…":"تأكيد الحجز"}
          </button>
          <button onClick={onClose} className="px-6 py-2.5 rounded-xl font-bold text-sm cursor-pointer" style={{background:B.bg,color:B.text2,border:"none"}}>إلغاء</button>
        </div>
        </>
        )}
      </motion.div>
    </motion.div>
  );
}

const BOOKING_TIMELINE: {status:BookingStatus;label:string}[] = [
  {status:"new",label:"جديد"},{status:"reviewing",label:"مراجعة"},{status:"accepted",label:"مقبول"},
  {status:"awaiting_payment",label:"بانتظار الدفع"},{status:"paid",label:"تم الدفع"},{status:"confirmed",label:"مؤكد"},
];

function BookingTimeline({status}:{status:BookingStatus}) {
  const cancelled = status==="cancelled"||status==="rejected";
  const activeIdx = BOOKING_TIMELINE.findIndex(s=>s.status===status);
  return (
    <div className="flex items-center gap-0 overflow-x-auto" style={{scrollbarWidth:"none"}}>
      {BOOKING_TIMELINE.map((s,i)=>{
        const done = cancelled ? false : (activeIdx>=0 && i<=activeIdx);
        const active = !cancelled && i===activeIdx;
        return (
          <div key={s.status} className="flex items-center min-w-0 flex-1">
            <div className="flex flex-col items-center gap-1 min-w-0" style={{minWidth:60}}>
              <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold transition-all"
                style={{background:cancelled?"#EEECEA":done?B.gold:"#fff",border:active?`2px solid ${B.gold}`:done?"none":`1px solid ${B.border}`,color:cancelled?"#9a9186":done?B.black:B.muted}}>
                {done&&!active?<Check size={12}/>:<span>{i+1}</span>}
              </div>
              <span className="text-center whitespace-nowrap" style={{fontSize:10,fontWeight:active?700:500,color:cancelled?B.muted:done?B.text3:B.muted}}>{s.label}</span>
            </div>
            {i<BOOKING_TIMELINE.length-1&&(
              <div className="flex-1 h-px mx-1 flex-shrink" style={{background:done&&activeIdx>i?B.gold:B.border,minWidth:8}}/>
            )}
          </div>
        );
      })}
      {cancelled&&<div className="flex flex-col items-center gap-1 mr-2" style={{minWidth:60}}>
        <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{background:"#FBE6E6",border:"1px solid #F3C9C9"}}><X size={12} style={{color:"#BE2626"}}/></div>
        <span style={{fontSize:10,fontWeight:700,color:"#BE2626"}}>{status==="rejected"?"مرفوض":"ملغى"}</span>
      </div>}
    </div>
  );
}

function PilgrimCard({pilgrim,index}:{pilgrim:Pilgrim;index:number}) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{border:`1px solid ${B.border}`,background:"#fff"}}>
      <div className="flex items-center gap-3 px-4 py-3" style={{background:B.cream,borderBottom:`1px solid ${B.border}`}}>
        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-xs"
          style={{background:pilgrim.gender==="female"?"#F1E9FA":"#EAF1FE",color:pilgrim.gender==="female"?"#7226BE":"#1E52C7"}}>
          {pilgrim.gender==="female"?"♀":"♂"}
        </div>
        <span className="font-extrabold text-sm" style={{color:B.black}}>معتمر {index+1}</span>
        <span className="text-xs font-medium mr-auto" style={{color:B.muted}}>{pilgrim.nationality}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4">
        {[
          {l:"الاسم الكامل",v:pilgrim.name,col:true},
          {l:"رقم الهوية",v:pilgrim.idNumber||"—"},
          {l:"الجوال",v:pilgrim.phone||"—"},
          {l:"تاريخ الميلاد",v:pilgrim.birthDate||"—"},
          {l:"الجنس",v:pilgrim.gender==="male"?"ذكر":"أنثى"},
        ].map(f=>(
          <div key={f.l} className={f.col?"col-span-2 sm:col-span-3":""}>
            <div className="text-xs mb-0.5 font-semibold" style={{color:B.muted}}>{f.l}</div>
            <div className="font-bold text-sm" style={{color:B.black,fontFamily:f.l==="رقم الهوية"||f.l==="الجوال"?"var(--font-app)":"inherit"}}>{f.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Bus/flight seat-selection map ─── */
function SeatMap({booking,trip,allBookings,onConfirm,onClose}:{booking:Booking;trip:Trip|undefined;allBookings:Booking[];onConfirm:(seats:number[])=>void;onClose:()=>void}) {
  const capacity=trip?.seats??49;
  const need=booking.persons;
  // occupied seats from other active bookings on the same trip
  const occupied=new Map<number,"male"|"female">();
  allBookings.forEach(b=>{
    if(b.id===booking.id||b.tripId!==booking.tripId||b.status==="cancelled"||b.status==="rejected") return;
    b.seats.forEach((sn,idx)=>occupied.set(sn,b.pilgrims[idx]?.gender??"male"));
  });
  const [sel,setSel]=useState<number[]>(()=>booking.seats.filter(s=>!occupied.has(s)));
  const toggle=(n:number)=>{ if(occupied.has(n)) return; setSel(prev=>prev.includes(n)?prev.filter(x=>x!==n):(prev.length>=need?prev:[...prev,n])); };
  const occupiedSet=new Set(occupied.keys());
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-50 flex items-start justify-center p-6 overflow-auto"
      style={{background:"rgba(21,76,72,0.55)",backdropFilter:"blur(4px)"}} onClick={onClose}>
      <motion.div initial={{opacity:0,y:30}} animate={{opacity:1,y:0}} exit={{opacity:0,y:30}} transition={{type:"spring",damping:30,stiffness:400}}
        className="w-full rounded-2xl overflow-hidden flex flex-col my-4" style={{maxWidth:480,background:"#fff",maxHeight:"92vh"}} onClick={e=>e.stopPropagation()}>
        <div className="relative px-6 pt-5 pb-4 flex-shrink-0" style={{background:B.primary}}>
          <div className="absolute top-0 inset-x-0 h-1" style={{background:`linear-gradient(90deg,${B.gold},${B.gold2},${B.gold})`}}/>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-extrabold text-white" style={{fontSize:16,fontFamily:"var(--font-app)"}}>{(booking.status==="new"||booking.status==="reviewing")?"اختيار المقاعد قبل القبول":"تعديل المقاعد"}</h2>
              <div className="text-xs mt-1" style={{color:"#CDE7E4"}}>{booking.clientName} · رحلة {trip?.departureDate??"—"} — اختر {need} مقعد</div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer" style={{background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.15)",color:"#CDE7E4"}}><X size={14}/></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3.5" style={{scrollbarWidth:"none"}}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold" style={{color:B.black}}>المقاعد المختارة</span>
            <span className="px-2.5 py-1 rounded-full text-xs font-bold" style={{background:sel.length===need?"#E3F3E8":B.bg,color:sel.length===need?"#1E7A44":B.muted,border:`1px solid ${sel.length===need?"#C4E4CE":B.border}`}}>{sel.length} / {need}</span>
          </div>
          {/* Numbered label list: seat → first+second name */}
          <div className="flex flex-col gap-1.5">
            {booking.pilgrims.map((pg,idx)=>{
              const seatNum=sel[idx];
              const gCol=pg.gender==="female"?"#B4266E":"#1E52C7";
              const gBg=pg.gender==="female"?"#FBE9F1":"#EAF1FE";
              return (
                <div key={idx} className="flex items-center gap-2.5 rounded-xl px-3 py-2" style={{background:B.bg,border:`1px solid ${B.border}`}}>
                  <span className="w-6 h-6 rounded-lg flex items-center justify-center font-extrabold flex-shrink-0" style={{background:B.primary,color:B.cream,fontSize:11}}>{idx+1}</span>
                  <span className="font-bold text-sm flex-1 min-w-0 truncate" style={{color:B.black}}>{firstTwo(pg.name)}</span>
                  <span className="flex items-center justify-center rounded-md flex-shrink-0" style={{width:22,height:22,background:gBg,color:gCol,fontSize:12,fontWeight:800}} title={pg.gender==="female"?"أنثى":"ذكر"}>{genderGlyph(pg.gender)}</span>
                  {seatNum!=null
                    ? <span className="flex items-center justify-center rounded-lg font-extrabold flex-shrink-0" style={{minWidth:30,height:26,padding:"0 6px",background:"#FFF7EA",border:`1px solid ${B.gold}`,color:"#8a6a08",fontSize:12}}>مقعد {seatNum}</span>
                    : <span className="text-xs font-bold flex-shrink-0" style={{color:B.muted}}>لم يُختَر</span>}
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold leading-relaxed" style={{background:"#EAF1FE",border:"1px solid #CBDBFB",color:"#1E52C7"}}>
            <span className="flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center" style={{background:"#1E52C7",color:"#fff"}}>💺</span>
            <span>اضغط على أي مقعد متاح لحجزه للمعتمر. اضغط على المقعد المختار (الذهبي) مرة أخرى لإلغائه واختيار غيره.</span>
          </div>
          <BusSeatGrid capacity={capacity} occupied={occupiedSet} selected={sel} need={need} onToggle={toggle}
            occGender={(n)=>occupied.get(n)??null} selGender={(n)=>booking.pilgrims[sel.indexOf(n)]?.gender??null} showLegend={false}/>
          <div className="flex flex-wrap gap-3 justify-center pt-3" style={{borderTop:`1px solid ${B.border}`}}>
            {[["#fff",B.border,"متاح"],["#EAF1FE","#CBDBFB","ذكر"],["#FBE9F1","#F3CADF","أنثى"]].map(([bg,bd,l])=>(
              <span key={l} className="inline-flex items-center gap-1.5 text-xs font-bold" style={{color:B.text2}}>
                <span className="rounded" style={{width:14,height:14,background:bg as string,border:`1px solid ${bd}`}}/>{l}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5 text-xs font-bold" style={{color:B.text2}}>
              <span className="rounded" style={{width:14,height:14,background:"#FFF7EA",border:`1px solid ${B.gold}`,boxShadow:`0 0 0 2px ${B.gold}`}}/>اختيارك
            </span>
          </div>
        </div>
        <div className="flex gap-3 p-4 flex-shrink-0" style={{borderTop:`1px solid ${B.border}`}}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl font-bold text-sm cursor-pointer" style={{background:"#fff",color:B.text2,border:`1px solid ${B.border}`}}>إلغاء</button>
          <button onClick={()=>onConfirm(sel)} disabled={sel.length!==need}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-bold text-sm" style={{background:sel.length===need?B.primary:"#EEECEA",color:sel.length===need?B.cream:B.muted,border:"none",cursor:sel.length===need?"pointer":"not-allowed"}}>
            <Check size={14}/>تم تأكيد المقاعد
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─── Payment link card (admin) ─── */
function PaymentLinkCard({booking,trip,pkg}:{booking:Booking;trip:Trip|undefined;pkg:Pkg|undefined}) {
  const [copied,setCopied]=useState(false);
  const link=payLinkFor(booking.id,booking.payToken);
  const hours=trip?.settings?.paymentDeadlineHours??pkg?.settings?.paymentDeadlineHours??24;
  const amount=booking.total.toLocaleString("en-US")+" ر.س";
  const sent=booking.status==="awaiting_payment";
  const waMsg=`مرحباً ${booking.clientName}،\nرابط دفع باقة (${pkg?.name??"العمرة"}):\n${link}\nالمبلغ المطلوب: ${amount}\nالرابط صالح لمدة ${hours} ساعة.`;
  const copy=()=>{ copyText(link); setCopied(true); setTimeout(()=>setCopied(false),1500); };
  return (
    <div className="rounded-2xl p-5 mb-5 flex flex-col gap-4" style={{background:"#fff",border:`1px solid ${B.border}`}}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="font-bold flex items-center gap-2" style={{color:B.black,fontSize:15}}><Link2 size={15} style={{color:B.gold}}/>رابط الدفع</div>
          <div className="text-xs mt-0.5" style={{color:B.muted}}>راجع التفاصيل ثم أرسل الرابط لجوال العميل.</div>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold" style={{background:sent?"#F1E9FA":"#E3F3E8",color:sent?"#7226BE":"#1E7A44",border:`1px solid ${sent?"#D8BBFA":"#C4E4CE"}`}}>
          <span className="w-1.5 h-1.5 rounded-full" style={{background:sent?"#7226BE":"#1E7A44"}}/>{sent?"أُرسل الرابط":"جاهز للإرسال"}
        </span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-0 flex items-center gap-2 rounded-xl px-3.5 py-2.5" style={{background:B.bg,border:`1px solid ${B.border}`}}>
          <Link2 size={13} style={{color:B.muted,flexShrink:0}}/>
          <span className="text-sm font-bold truncate" style={{color:B.black,direction:"ltr",fontFamily:"var(--font-app)"}}>{link}</span>
        </div>
        <button onClick={copy} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold cursor-pointer flex-shrink-0" style={{background:B.gold,color:B.black,border:"none"}}>
          {copied?<Check size={14}/>:<CopyIcon size={14}/>}{copied?"تم النسخ":"نسخ الرابط"}
        </button>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={()=>openWhatsApp(booking.clientPhone,waMsg)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold cursor-pointer" style={{background:"#25D366",color:"#fff",border:"none"}}><Phone size={14}/>إرسال عبر واتساب</button>
        <a href={link} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold cursor-pointer" style={{background:B.primary,color:B.cream,border:"none",textDecoration:"none"}}><Link2 size={14}/>فتح صفحة الدفع (تجربة العميل)</a>
        <span className="text-xs" style={{color:B.muted}}>ينتهي الرابط خلال <b style={{color:B.text2}}>{hours} ساعة</b> من الإرسال</span>
      </div>
      {/* Payment methods */}
      <div style={{borderTop:`1px solid ${B.border}`,paddingTop:14}}>
        <div className="text-xs font-bold mb-2.5" style={{color:B.text2}}>طرق الدفع</div>
        <div className="flex flex-col gap-2">
          <div className="rounded-xl px-4 py-3" style={{border:`1px solid ${B.border}`}}>
            <div className="text-sm font-bold mb-2" style={{color:B.black}}>تحويل بنكي</div>
            <div className="flex flex-col gap-1 text-xs">
              <div className="flex gap-2"><span style={{color:B.muted,minWidth:60}}>المؤسسة</span><span className="font-bold" style={{color:B.black}}>{PAY_ACCOUNT.org}</span></div>
              <div className="flex gap-2"><span style={{color:B.muted,minWidth:60}}>البنك</span><span className="font-bold" style={{color:B.black}}>{PAY_ACCOUNT.bank}</span></div>
              <div className="flex gap-2 items-center"><span style={{color:B.muted,minWidth:60}}>الآيبان</span><span className="font-bold" style={{color:B.black,fontFamily:"var(--font-app)",letterSpacing:.5,direction:"ltr"}}>{PAY_ACCOUNT.iban}</span>
                <button onClick={()=>copyText(PAY_ACCOUNT.iban.replace(/\s/g,""))} className="cursor-pointer" style={{background:"none",border:"none",color:B.gold}} title="نسخ الآيبان"><CopyIcon size={12}/></button></div>
            </div>
          </div>
          <div className="rounded-xl px-4 py-3" style={{border:`1px solid ${B.border}`}}>
            <div className="text-sm font-bold mb-1" style={{color:B.black}}>الدفع الإلكتروني عبر الرابط</div>
            <div className="text-xs mb-2.5" style={{color:B.text2}}>عند فتح العميل للرابط تُفتح بوابة دفع آمنة تقبل:</div>
            <div className="flex flex-wrap gap-2">
              {["مدى","Apple Pay","Visa / Mastercard","STC Pay"].map(m=>(
                <span key={m} className="px-3 py-1.5 rounded-lg text-xs font-bold" style={{background:B.bg,border:`1px solid ${B.border}`,color:B.black}}>{m}</span>
              ))}
            </div>
          </div>
          <div className="rounded-xl px-4 py-3" style={{border:`1px solid ${B.border}`}}>
            <div className="text-sm font-bold mb-1" style={{color:B.black}}>كاش في الفرع</div>
            <div className="text-xs leading-relaxed" style={{color:B.text2}}>يُسلّم المبلغ في أي فرع من فروع تساهيل خلال {hours} ساعة كحدٍّ أقصى من إنشاء الطلب.</div>
          </div>
        </div>
      </div>
      {/* Branches */}
      <div>
        <div className="text-xs font-bold mb-2.5" style={{color:B.text2}}>مواقع الفروع</div>
        <div className="flex flex-col gap-2">
          {TASAHEEL_BRANCHES.map(b=>(
            <div key={b.name} className="rounded-xl px-4 py-3" style={{border:`1px solid ${B.border}`}}>
              <div className="flex items-center justify-between gap-2"><span className="text-sm font-bold" style={{color:B.black}}>{b.name}</span><span className="text-xs" style={{color:B.muted}}>{b.hours}</span></div>
              <div className="text-xs mt-0.5" style={{color:B.text2}}>{b.address}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BookingDetail({booking,trips,packages,allBookings,onBack,onStatusChange,onPilgrimsChange,onSeatsChange}:{booking:Booking;trips:Trip[];packages:Pkg[];allBookings:Booking[];onBack:()=>void;onStatusChange:(id:string,s:BookingStatus,patch?:Partial<Booking>)=>void;onPilgrimsChange:(id:string,pilgrims:Pilgrim[])=>void;onSeatsChange:(id:string,seats:number[])=>void}) {
  const trip  = trips.find(t=>t.id===booking.tripId);
  const pkg   = packages.find(p=>p.id===trip?.packageId);

  type VerifStatus = "pending"|"verified"|"error";
  const [verif,setVerif]=useState<Record<number,VerifStatus>>(()=>Object.fromEntries(booking.pilgrims.map((_,i)=>[i,"pending"])));
  const [editIdx,setEditIdx]=useState<number|null>(null);
  const [draft,setDraft]=useState<Pilgrim|null>(null);
  const startEdit=(i:number)=>{setEditIdx(i);setDraft({...booking.pilgrims[i]});};
  const cancelEdit=()=>{setEditIdx(null);setDraft(null);};
  const saveEdit=()=>{ if(editIdx===null||!draft) return; onPilgrimsChange(booking.id,booking.pilgrims.map((p,idx)=>idx===editIdx?draft:p)); setEditIdx(null); setDraft(null); };
  const setD=<K extends keyof Pilgrim>(k:K,v:Pilgrim[K])=>setDraft(d=>d?{...d,[k]:v}:d);
  const einp="w-full border rounded-lg px-2.5 py-2 text-sm focus:outline-none";
  const eist={borderColor:B.gold,background:"#fff",color:B.black,fontFamily:"inherit"};
  const [seatOpen,setSeatOpen]=useState(false);
  const [payReceived,setPayReceived]=useState(false);
  const [payMethodSel,setPayMethodSel]=useState(booking.payMethod&&booking.payMethod!=="—"?booking.payMethod:"تحويل بنكي");
  const verifiedCount = Object.values(verif).filter(v=>v==="verified").length;
  const allVerified   = verifiedCount===booking.pilgrims.length;

  const needsVerif = booking.status==="new"||booking.status==="reviewing";

  /* الدفع المسجَّل يُحفظ مع نقلة الحالة لا بعدها: كانت طريقة الدفع تُختار
     في الشاشة ثم تُهمل — يصير الطلب «مدفوعاً» بلا طريقة ولا تاريخ. */
  const today = new Date().toISOString().slice(0,10);
  const CASH_AT_BRANCH = "كاش في الفرع";

  const actions:{label:string;next:BookingStatus;bg:string;fg:string;br:string;disabled?:boolean;patch?:Partial<Booking>;confirm?:string}[] = (() => {
    switch(booking.status) {
      case "new":
      case "reviewing": return [
        {label:"قبول الطلب واختيار المقاعد",next:"accepted",bg:"#E3F3E8",fg:"#1E7A44",br:"#C4E4CE",disabled:!allVerified},
        {label:"رفض الطلب",next:"rejected",bg:"#FBE6E6",fg:"#BE2626",br:"#F3C9C9",
         confirm:`رفض الطلب ${booking.id} للعميل ${booking.clientName}؟ لا يمكن التراجع.`},
        {label:"إلغاء الطلب",next:"cancelled",bg:"#fff",fg:B.text2,br:B.border},
      ];
      /* الدفع كاش في الفرع لا يمرّ برابط: المبلغ في اليد، فينتقل الطلب
         إلى «مدفوع» مباشرة موثّقاً بالطريقة والتاريخ. */
      case "accepted": return [
        {label:"إرسال رابط الدفع",next:"awaiting_payment",bg:B.primary,fg:B.cream,br:B.primary},
        {label:"تم الدفع كاش في الفرع",next:"paid",bg:"#E3F3E8",fg:"#1E7A44",br:"#C4E4CE",
         patch:{paymentStatus:"verified",payMethod:CASH_AT_BRANCH,payDate:today},
         confirm:`تأكيد استلام ${booking.total.toLocaleString("en-US")} ر.س كاش في الفرع من ${booking.clientName}؟ ينتقل الطلب إلى «تم الدفع» بلا رابط دفع.`},
      ];
      case "awaiting_payment": return [{label:"تأكيد الدفع يدوياً",next:"paid",bg:"#DDF3F0",fg:"#0C766B",br:"#A8DDD8",
        patch:{paymentStatus:"verified",payMethod:payMethodSel,payDate:today}}];
      case "paid":     return [{label:"تحقق وتأكيد",next:"confirmed",bg:"#E3F3E8",fg:"#1E7A44",br:"#C4E4CE"}];
      case "confirmed":return [{label:"إلغاء",next:"cancelled",bg:"#FBE6E6",fg:"#BE2626",br:"#F3C9C9"}];
      default:         return [];
    }
  })();

  return (
    <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className="flex-1 px-4 md:px-8 pb-12 pt-5 max-w-4xl">
      <button onClick={onBack} className="flex items-center gap-2 text-sm font-bold mb-5 cursor-pointer" style={{background:"none",border:"none",color:B.text2}}>
        <ArrowRight size={14}/>عودة للطلبات
      </button>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <div className="font-extrabold mb-0.5" style={{fontFamily:"var(--font-app)",fontSize:22,color:B.black}}>{booking.id}</div>
          <div className="text-xs" style={{color:B.muted}}>أُنشئ {booking.createdAt} · موظف: {booking.staff}</div>
        </div>
        <StatusBadge status={booking.status}/>
      </div>

      {/* Timeline */}
      <div className="rounded-2xl p-5 mb-5" style={{background:"#fff",border:`1px solid ${B.border}`}}>
        <div className="text-sm font-bold mb-4" style={{color:B.text2}}>مسار الطلب</div>
        <BookingTimeline status={booking.status}/>
      </div>

      {/* Actions */}
      {actions.length>0&&(
        <div className="rounded-2xl px-5 py-4 mb-5" style={{background:B.cream,border:`1px solid #EDE4CF`}}>
          <div className="text-xs font-bold mb-3" style={{color:B.text2}}>الإجراءات</div>
          {needsVerif&&!allVerified&&(
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl mb-3 text-sm font-semibold"
              style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}>
              تم التحقق من {verifiedCount} من {booking.pilgrims.length} — لا يمكن قبول الطلب حتى يُتحقق من جميع المعتمرين.
            </div>
          )}
          {/* Payment gate before manual confirm */}
          {booking.status==="awaiting_payment"&&(
            <div className="rounded-xl p-4 mb-3 flex flex-col gap-3" style={{background:"#fff",border:`1px solid ${B.border}`}}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Field label="طريقة الدفع">
                    <AppSelect value={payMethodSel} onChange={setPayMethodSel}
                      options={["تحويل بنكي","بطاقة مدى","Apple Pay","تابي","تمارا","كاش في الفرع"].map(m=>({value:m,label:m}))}/>
                  </Field>
                </div>
                <label className="flex items-end gap-2.5 cursor-pointer pb-1.5">
                  <span onClick={()=>setPayReceived(v=>!v)} className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0" style={{background:payReceived?"#1E7A44":"#fff",border:`1.5px solid ${payReceived?"#1E7A44":B.border}`}}>
                    {payReceived&&<Check size={14} style={{color:"#fff"}}/>}
                  </span>
                  <span className="text-sm font-bold" style={{color:B.black}} onClick={()=>setPayReceived(v=>!v)}>تم استلام الدفع فعلياً</span>
                </label>
              </div>
              {!payReceived&&<div className="text-xs" style={{color:"#B4530C"}}>فعّل «تم استلام الدفع» لتتمكن من تأكيد الدفع يدوياً.</div>}
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            {actions.map(a=>{
              /* شرط «استلمت الدفع» يخصّ التأكيد اليدوي بعد إرسال الرابط.
                 الكاش في الفرع مرّ بتأكيده الخاص، فلا يُحجب به. */
              const gated=a.next==="paid"&&booking.status==="awaiting_payment"&&!payReceived;
              const disabled=a.disabled||gated;
              return (
              <button key={a.label}
                /* ما لا رجعة فيه — الرفض واستلام الكاش — يحمل تأكيداً
                   واحداً يفصل الخطأ عن القرار. */
                onClick={()=>{ if(disabled) return;
                  if(a.next==="accepted"){setSeatOpen(true);return;}
                  if(a.confirm&&!window.confirm(a.confirm)) return;
                  onStatusChange(booking.id,a.next,a.patch); }}
                className="px-5 py-2.5 rounded-xl font-bold text-sm"
                style={{background:disabled?"#EEECEA":a.bg,color:disabled?B.muted:a.fg,border:`1px solid ${disabled?B.border:a.br}`,cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.7:1}}>
                {a.label}
              </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Client + Total side by side */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <div className="md:col-span-2 rounded-2xl p-5" style={{background:"#fff",border:`1px solid ${B.border}`}}>
          <div className="font-bold mb-4" style={{color:B.black,fontSize:15}}>بيانات العميل</div>
          <div className="grid grid-cols-2 gap-4">
            {[
              {l:"الاسم",v:booking.clientName},
              {l:"الجوال",v:booking.clientPhone},
              {l:"الباقة",v:pkg?.name??"—"},
              {l:"تاريخ الرحلة",v:trip?.departureDate??"—"},
              {l:"نوع الغرفة",v:booking.roomType},
              {l:"عدد المعتمرين",v:booking.persons},
            ].map(f=>(
              <div key={f.l}>
                <div className="text-xs font-semibold mb-0.5" style={{color:B.muted}}>{f.l}</div>
                <div className="font-bold text-sm" style={{color:B.black}}>{f.v}</div>
              </div>
            ))}
          </div>

          {/* توزيع الغرف مفصّلاً — ما يحتاجه التسكين فعلاً: «غرفة ثلاثية
              وغرفة ثنائية» لا جملة واحدة. يظهر للحجوزات العامة الجديدة
              وحدها؛ القديمة والداخلية بلا صفوف توزيع. */}
          {!!booking.rooms?.length&&(
            <div className="mt-4">
              <div className="text-xs font-semibold mb-1.5" style={{color:B.muted}}>توزيع الغرف</div>
              <div className="rounded-xl overflow-hidden" style={{border:`1px solid ${B.border}`}}>
                {booking.rooms.map((r,i)=>(
                  <div key={i} className="flex items-center justify-between px-3 py-2 text-xs"
                    style={{borderTop:i?`1px solid ${B.border}`:"none",background:"#fff"}}>
                    <span style={{color:B.text2}}>غرفة {i+1} · {r.type} · {r.persons} أفراد</span>
                    <span className="font-bold" style={{color:B.black,fontFamily:"var(--font-app)"}}>
                      {r.perNight} ر.س / للفرد / الليلة
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="rounded-2xl p-5 flex flex-col justify-center" style={{background:B.primary}}>
          <div className="text-xs font-semibold mb-1" style={{color:"#9DBAB6"}}>المبلغ الإجمالي</div>
          <div className="font-extrabold" style={{color:B.gold,fontSize:32,fontFamily:"var(--font-app)",lineHeight:1.2}}>{booking.total.toLocaleString("en-US")}</div>
          <div className="text-xs mt-1" style={{color:"#9DBAB6"}}>ريال سعودي</div>
          {booking.paymentStatus!=="none"&&(
            <div className="mt-3 pt-3" style={{borderTop:"1px solid rgba(255,255,255,0.14)"}}>
              <div className="text-xs font-semibold mb-1" style={{color:"#9DBAB6"}}>طريقة الدفع</div>
              <div className="text-sm font-bold" style={{color:B.cream}}>{booking.payMethod||"—"}</div>
              {booking.txnNo&&booking.txnNo!=="—"&&<div className="text-xs font-mono mt-0.5" style={{color:B.muted}}>{booking.txnNo}</div>}
            </div>
          )}
        </div>
      </div>

      {/* Seats */}
      <div className="rounded-2xl p-5 mb-5 flex items-center justify-between gap-3 flex-wrap" style={{background:"#fff",border:`1px solid ${B.border}`}}>
        <div>
          <div className="font-bold mb-1" style={{color:B.black,fontSize:15}}>المقاعد المخصّصة</div>
          {booking.seats.length>0
            ? <div className="flex items-center gap-1.5 flex-wrap">{booking.seats.map(s=>(
                <span key={s} className="inline-flex items-center justify-center rounded-lg text-sm font-extrabold" style={{minWidth:34,height:34,padding:"0 8px",background:"#FFF7EA",border:`1px solid ${B.gold}`,color:"#8a6a08"}}>{s}</span>
              ))}</div>
            : <div className="text-sm" style={{color:B.muted}}>لم تُختَر مقاعد بعد — تُختار عند قبول الطلب.</div>}
        </div>
        <button onClick={()=>setSeatOpen(true)} disabled={booking.status==="new"||booking.status==="reviewing"?!allVerified:false}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold"
          style={{background:B.primary,color:B.cream,border:"none",opacity:((booking.status==="new"||booking.status==="reviewing")&&!allVerified)?0.5:1,cursor:((booking.status==="new"||booking.status==="reviewing")&&!allVerified)?"not-allowed":"pointer"}}>
          <Armchair size={14}/>{booking.seats.length>0?"تعديل المقاعد":"اختيار المقاعد"}
        </button>
      </div>

      {/* Payment link (after acceptance) */}
      {(booking.status==="accepted"||booking.status==="awaiting_payment")&&(
        <PaymentLinkCard booking={booking} trip={trip} pkg={pkg}/>
      )}

      {/* Pilgrims */}
      <div className="rounded-2xl p-5 mb-5" style={{background:"#fff",border:`1px solid ${B.border}`}}>
        <div className="font-bold mb-4" style={{color:B.black,fontSize:15}}>بيانات المعتمرين ({booking.persons})</div>
        <div className="flex flex-col gap-3">
          {booking.pilgrims.map((pg,i)=>{
            const vs=verif[i]??"pending";
            const verifBg=vs==="verified"?"#E3F3E8":vs==="error"?"#FBE6E6":"#F0EAE0";
            const verifFg=vs==="verified"?"#1E7A44":vs==="error"?"#BE2626":"#8A6A08";
            const verifLabel=vs==="verified"?"تم التحقق":vs==="error"?"يوجد خطأ":"بانتظار التحقق";
            return (
              <div key={i} className="rounded-xl overflow-hidden" style={{border:`1.5px solid ${vs==="verified"?"#C4E4CE":vs==="error"?"#F3C9C9":B.border}`}}>
                <div className="flex items-center gap-3 px-4 py-2.5 flex-wrap" style={{background:B.cream,borderBottom:`1px solid ${B.border}`}}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{background:pg.gender==="female"?"#F1E9FA":"#EAF1FE",color:pg.gender==="female"?"#7226BE":"#1E52C7"}}>
                    {i+1}
                  </div>
                  <span className="font-extrabold text-sm" style={{color:B.black}}>{pg.name||`معتمر ${i+1}`}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                    style={{background:pg.gender==="female"?"#F1E9FA":"#EAF1FE",color:pg.gender==="female"?"#7226BE":"#1E52C7"}}>
                    {pg.gender==="male"?"ذكر":"أنثى"}
                  </span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-bold"
                    style={{background:verifBg,color:verifFg}}>{verifLabel}</span>
                  <div className="flex items-center gap-2 mr-auto">
                    <span className="text-xs" style={{color:B.muted}}>{pg.nationality}</span>
                    {editIdx!==i&&<button onClick={()=>startEdit(i)} title="تعديل بيانات المعتمر"
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer"
                      style={{background:"#fff",border:`1px solid ${B.border}`,color:"#8a6a08"}}><Pencil size={11}/>تعديل</button>}
                  </div>
                </div>
                {editIdx===i&&draft
                  ? <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4">
                      <div className="col-span-2 sm:col-span-2"><div className="text-xs font-semibold mb-1" style={{color:B.muted}}>الاسم الكامل</div>
                        <input className={einp} style={eist} value={draft.name} onChange={e=>setD("name",e.target.value)}/></div>
                      <div><div className="text-xs font-semibold mb-1" style={{color:B.muted}}>نوع الوثيقة</div>
                        <AppSelect value={draft.docType??guessDocType(draft.idNumber)} onChange={v=>setD("docType",v as Pilgrim["docType"])}
                          options={DOC_TYPES.map(d=>({value:d.value,label:`${d.icon} ${d.label.ar}`}))} placeholder="اختر النوع"/></div>
                      <div><div className="text-xs font-semibold mb-1" style={{color:B.muted}}>{numberLabelOf(draft.docType,draft.idNumber)}</div>
                        <input className={einp} style={{...eist,direction:"ltr"}} value={draft.idNumber}
                          placeholder={docTypeDef(draft.docType).placeholder} onChange={e=>setD("idNumber",e.target.value)}/></div>
                      <div><div className="text-xs font-semibold mb-1" style={{color:B.muted}}>الجنسية</div>
                        <NationalitySelect value={draft.nationality} onChange={v=>setD("nationality",v)} subInTrigger={false} compact/></div>
                      <div><div className="text-xs font-semibold mb-1" style={{color:B.muted}}>الجنس</div>
                        <AppSelect value={draft.gender} onChange={v=>setD("gender",v as Pilgrim["gender"])}
                          options={[{value:"male",label:"ذكر"},{value:"female",label:"أنثى"}]}/></div>
                      <div><div className="text-xs font-semibold mb-1" style={{color:B.muted}}>تاريخ الميلاد</div>
                        <input type="date" className={einp} style={{...eist,direction:"ltr"}} value={draft.birthDate} onChange={e=>setD("birthDate",e.target.value)}/></div>
                      <div><div className="text-xs font-semibold mb-1" style={{color:B.muted}}>الجوال</div>
                        <input className={einp} style={{...eist,direction:"ltr"}} value={draft.phone} onChange={e=>setD("phone",e.target.value)}/></div>
                    </div>
                  : <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4">
                      {[
                        {l:numberLabelOf(pg.docType,pg.idNumber),v:pg.idNumber||"—",mono:true},
                        {l:"الجنسية",v:pg.nationality||"—"},
                        {l:"تاريخ الميلاد",v:pg.birthDate||"—",mono:true},
                        {l:"الجوال",v:pg.phone||"—",mono:true},
                      ].map(f=>(
                        <div key={f.l}>
                          <div className="text-xs font-semibold mb-0.5" style={{color:B.muted}}>{f.l}</div>
                          <div className="font-bold text-sm" style={{color:B.black,fontFamily:f.mono?"var(--font-app)":"inherit"}}>{f.v}</div>
                        </div>
                      ))}
                    </div>
                }
                <div className="px-4 pb-4">
                  {editIdx===i
                    ? <div className="grid grid-cols-2 gap-3">
                        <button onClick={cancelEdit} className="py-2.5 rounded-xl font-bold text-sm cursor-pointer"
                          style={{background:"#fff",color:B.text2,border:`1px solid ${B.border}`}}>إلغاء</button>
                        <button onClick={saveEdit} className="py-2.5 rounded-xl font-bold text-sm cursor-pointer"
                          style={{background:B.primary,color:B.cream,border:"none"}}>حفظ التعديلات</button>
                      </div>
                    : vs==="pending"
                      ? <div className="grid grid-cols-2 gap-3">
                          <button onClick={()=>setVerif(v=>({...v,[i]:"error"}))}
                            className="py-2.5 rounded-xl font-bold text-sm cursor-pointer"
                            style={{background:"#FBE6E6",color:"#BE2626",border:"1px solid #F3C9C9"}}>
                            يوجد خطأ
                          </button>
                          <button onClick={()=>setVerif(v=>({...v,[i]:"verified"}))}
                            className="py-2.5 rounded-xl font-bold text-sm cursor-pointer"
                            style={{background:"#E3F3E8",color:"#1E7A44",border:"1px solid #C4E4CE"}}>
                            تم التحقق
                          </button>
                        </div>
                      : <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl" style={{background:verifBg,border:`1px solid ${vs==="verified"?"#C4E4CE":"#F3C9C9"}`}}>
                          <span className="flex items-center gap-2 text-sm font-bold" style={{color:verifFg}}>
                            {vs==="verified"?<Check size={14}/>:<X size={14}/>}{vs==="verified"?"تم التحقق من هذا المعتمر":"تم وضع علامة خطأ على البيانات"}
                          </span>
                          <div className="flex items-center gap-2">
                            {vs==="error"&&<button onClick={()=>startEdit(i)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
                              style={{background:"#fff",border:`1px solid ${B.border}`,color:"#8a6a08"}}><Pencil size={11}/>تعديل البيانات</button>}
                            <button onClick={()=>setVerif(v=>({...v,[i]:"pending"}))} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
                              style={{background:"#fff",border:`1px solid ${B.border}`,color:B.text2}}><Repeat size={11}/>تغيير الحالة</button>
                          </div>
                        </div>
                  }
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <AnimatePresence>
        {seatOpen&&(
          <SeatMap booking={booking} trip={trip} allBookings={allBookings}
            onClose={()=>setSeatOpen(false)}
            onConfirm={(seats)=>{ onSeatsChange(booking.id,seats); if(booking.status==="new"||booking.status==="reviewing") onStatusChange(booking.id,"accepted"); setSeatOpen(false); }}/>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function BookingsPage({packages,trips,onMenuOpen}:{packages:Pkg[];trips:Trip[];onMenuOpen?:()=>void}) {
  const bookings=useStore(s=>s.bookings); const setBookings=useStore(s=>s.setBookings);
  const refreshTrips=useStore(s=>s.refreshTrips);
  const currentUser=useStore(s=>s.currentUser);
  const [search,setSearch]=useState("");
  const [statusFilter,setStatusFilter]=useState<"all"|BookingStatus>("all");
  const [detailId,setDetailId]=useState<string|null>(null);
  const [showNew,setShowNew]=useState(false);

  /* الإلغاء والرفض يحرّران المقاعد في القاعدة (حارس trg_booking_seats_sync)،
     فتُعاد قراءة الرحلات بعده — لا تُحسب محلياً. كان تغيير الحالة لا يُنقص
     bookedSeats إطلاقاً، فتظهر الرحلة ممتلئة وهي فارغة. */
  function changeStatus(id:string,s:BookingStatus,patch?:Partial<Booking>){
    setBookings(p=>p.map(b=>b.id===id?{...b,...patch,status:s}:b));
    void refreshTrips();
  }

  // إنشاء حجز داخلي — إعادة التحقق من المقاعد وخصمها وإسناد الموظف/الفرع
  function createInternalOrder(d:{clientName:string;clientPhone:string;tripId:string;persons:number;payMethod:string}):string|null {
    const trip=useStore.getState().trips.find(t=>t.id===d.tripId);
    if(!trip) return "الرحلة غير متاحة";
    const avail=Math.max(0,trip.seats-trip.bookedSeats);
    if(d.persons>avail) return `عذراً، المقاعد المتبقية ${avail} فقط.`;
    const id=newId("TSH");
    const booking:Booking={
      id, tripId:trip.id, packageId:trip.packageId,
      clientName:d.clientName, clientPhone:d.clientPhone, roomType:"", persons:d.persons,
      total:trip.price*d.persons, status:"confirmed", paymentStatus:"none",
      payMethod:d.payMethod, seats:[], createdAt:new Date().toISOString().slice(0,10),
      staff:currentUser?.name??"—", createdBy:currentUser?.id, branchId:currentUser?.branch, source:"internal", sentDate:"", pilgrims:[],
    };
    clearSyncError();
    setBookings(p=>[booking,...p]);
    /* لا زيادة محلية لـbookedSeats: صارت مشتقّة في القاعدة و upsert_trip
       يتجاهل ما ترسله الواجهة. نقرأ القيمة الصحيحة بدل تخمينها. */
    void refreshTrips();
    return null;
  }
  function updatePilgrims(id:string,pilgrims:Pilgrim[]){setBookings(p=>p.map(b=>b.id===id?{...b,pilgrims}:b));}
  function updateSeats(id:string,seats:number[]){setBookings(p=>p.map(b=>b.id===id?{...b,seats}:b));}

  const curBooking = detailId ? bookings.find(b=>b.id===detailId) : null;

  const filtered = bookings.filter(b=>
    (statusFilter==="all"||b.status===statusFilter)&&
    (!search||(b.id+b.clientName+b.clientPhone).toLowerCase().includes(search.toLowerCase()))
  );

  /* ترقيم الصفحات — الرسم على الصفحة الحالية وحدها. المفتاح يُعيد
     للصفحة الأولى عند تغيّر البحث أو المرشّح: من كان في الصفحة الخامسة
     ثم بحث عن اسم يجب أن يرى أول النتائج لا صفحتها الخامسة. */
  const pg = usePaged(filtered, `${search}|${statusFilter}`);

  const stats = {
    total:bookings.length,
    new:bookings.filter(b=>["new","reviewing"].includes(b.status)).length,
    awaitingPayment:bookings.filter(b=>b.status==="awaiting_payment").length,
    confirmed:bookings.filter(b=>b.status==="confirmed").length,
    revenue:bookings.filter(b=>["paid","confirmed"].includes(b.status)).reduce((a,b)=>a+b.total,0),
  };

  const filterChips:[string,string][] = [
    ["all","الكل"],["new","جديدة"],["reviewing","مراجعة"],["accepted","مقبول"],
    ["awaiting_payment","بانتظار الدفع"],["confirmed","مؤكدة"],["cancelled","ملغاة"],
  ];

  const fb=(on:boolean)=>({padding:"7px 16px",borderRadius:999,fontSize:13,fontWeight:700,cursor:"pointer" as const,border:`1px solid ${on?B.gold:B.border}`,background:on?B.primary:"#fff",color:on?B.gold:B.text2,transition:"all 0.15s",whiteSpace:"nowrap" as const});

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{background:B.bg}}>
      <PageHeader title="الطلبات" crumb="إدارة الطلبات" search={search} onSearch={setSearch} onMenuOpen={onMenuOpen}/>

      {curBooking ? (
        <BookingDetail booking={curBooking} trips={trips} packages={packages} allBookings={bookings}
          onBack={()=>setDetailId(null)} onStatusChange={changeStatus} onPilgrimsChange={updatePilgrims} onSeatsChange={updateSeats}/>
      ) : (
        <>
          {/* Stats */}
          <div className="px-4 md:px-8 pt-4 md:pt-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <StatCard label="إجمالي الطلبات" value={stats.total} sub="كل الحالات" accent/>
              <StatCard label="طلبات جديدة" value={stats.new} sub="تنتظر المراجعة"/>
              <StatCard label="بانتظار الدفع" value={stats.awaitingPayment} sub="أُرسل رابط الدفع"/>
              <StatCard label="مؤكدة" value={stats.confirmed} sub="مكتملة الإجراءات"/>
              <StatCard label="إجمالي الإيرادات" value={stats.revenue.toLocaleString("en-US")+" ر.س"} sub="محصّلة"/>
            </div>
            {/* Filter chips */}
            <div className="flex items-center gap-2 mt-5 flex-wrap">
              {filterChips.map(([v,l])=>(
                <button key={v} style={fb(statusFilter===v)} onClick={()=>setStatusFilter(v as "all"|BookingStatus)}>{l}</button>
              ))}
              <span className="mr-auto text-sm font-semibold" style={{color:B.muted}}>{filtered.length} / {bookings.length}</span>
              <button onClick={()=>setShowNew(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer"
                style={{background:B.gold,color:B.black,border:"none",boxShadow:"0 4px 12px rgba(192,134,44,0.3)"}}>
                <Plus size={14}/>إضافة طلب جديد
              </button>
            </div>
            <div className="mt-5" style={{height:1,background:B.border}}/>
          </div>

          {/* Table on desktop / Cards on mobile */}
          <main className="flex-1 px-4 md:px-8 py-6">
            {/* Desktop table */}
            <div className="hidden md:block rounded-2xl overflow-hidden" style={{background:"#fff",border:`1px solid ${B.border}`}}>
              <div className="overflow-x-auto">
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
                  <thead>
                    <tr style={{background:B.cream,color:"#7a7168",fontSize:12,textAlign:"right"}}>
                      {["رقم الطلب","العميل","الباقة","المعتمرون","المبلغ","الحالة","إجراء"].map(h=>(
                        <th key={h} style={{padding:"13px 16px",fontWeight:700}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pg.rows.map((b,i)=>{
                      const pkg=packages.find(p=>p.id===trips.find(t=>t.id===b.tripId)?.packageId);
                      return (
                        <tr key={b.id} onClick={()=>setDetailId(b.id)} title="فتح مراجعة الطلب"
                          className="hover:brightness-95" style={{borderTop:`1px solid ${B.border}`,background:i%2===0?"#fff":"#FDFCFA",cursor:"pointer",transition:"filter 0.12s"}}>
                          <td style={{padding:"14px 16px",fontWeight:700,fontFamily:"var(--font-app)",color:B.black,fontSize:13}}>{b.id}</td>
                          <td style={{padding:"14px 16px"}}>
                            <div className="font-bold text-sm" style={{color:B.black}}>{b.clientName}</div>
                            <div className="text-xs font-mono" style={{color:B.muted,direction:"ltr"}}>{b.clientPhone}</div>
                          </td>
                          <td style={{padding:"14px 16px",color:B.text2,fontSize:13}}>{pkg?.name??"—"}</td>
                          <td style={{padding:"14px 16px",fontWeight:700,color:B.black,textAlign:"center"}}>{b.persons}</td>
                          <td style={{padding:"14px 16px",fontWeight:700,color:B.black,fontFamily:"var(--font-app)"}}>{b.total.toLocaleString("en-US")} ر.س</td>
                          <td style={{padding:"14px 16px"}}><StatusBadge status={b.status}/></td>
                          <td style={{padding:"14px 16px"}} onClick={e=>e.stopPropagation()}>
                            <button onClick={()=>setDetailId(b.id)} className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
                              style={{background:B.primary,color:B.cream,border:"none"}}>مراجعة</button>
                          </td>
                        </tr>
                      );
                    })}
                    {filtered.length===0&&(
                      <tr><td colSpan={7} style={{padding:"48px 16px",textAlign:"center",color:B.muted,fontWeight:600}}>لا توجد طلبات مطابقة</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden flex flex-col gap-3">
              {pg.rows.map(b=>{
                const pkg=packages.find(p=>p.id===trips.find(t=>t.id===b.tripId)?.packageId);
                return (
                  <motion.div key={b.id} initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} onClick={()=>setDetailId(b.id)}
                    className="rounded-2xl p-4" style={{background:"#fff",border:`1px solid ${B.border}`,cursor:"pointer"}}>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <div className="font-extrabold text-sm" style={{color:B.black,fontFamily:"var(--font-app)"}}>{b.id}</div>
                        <div className="text-xs mt-0.5" style={{color:B.muted}}>{b.createdAt}</div>
                      </div>
                      <StatusBadge status={b.status}/>
                    </div>
                    <div className="font-bold text-sm mb-0.5" style={{color:B.black}}>{b.clientName}</div>
                    <div className="text-xs mb-3" style={{color:B.muted}}>{pkg?.name??"—"} · {b.persons} معتمر · {b.roomType}</div>
                    <div className="flex items-center justify-between">
                      <div className="font-extrabold" style={{color:B.gold,fontFamily:"var(--font-app)"}}>{b.total.toLocaleString("en-US")} ر.س</div>
                      <button onClick={e=>{e.stopPropagation();setDetailId(b.id);}} className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
                        style={{background:B.primary,color:B.cream,border:"none"}}>مراجعة</button>
                    </div>
                  </motion.div>
                );
              })}
              {filtered.length===0&&(
                <div className="flex flex-col items-center py-16 rounded-2xl" style={{border:`2px dashed ${B.border}`,color:B.muted}}>
                  <BookOpen size={28} style={{opacity:0.3,marginBottom:8}}/>
                  <p className="text-sm font-medium">لا توجد طلبات مطابقة</p>
                </div>
              )}
            </div>
            <Pager p={pg} unit="طلب"/>
          </main>
        </>
      )}
      <AnimatePresence>
        {showNew&&<NewOrderModal packages={packages} trips={trips} onCreate={createInternalOrder} onClose={()=>setShowNew(false)}/>}
      </AnimatePresence>
    </div>
  );
}
