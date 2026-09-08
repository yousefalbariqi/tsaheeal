import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useSearchParams } from "react-router";
import { Pencil, X, Check, Bus, BookOpen, Armchair, ArrowRight, Repeat, Phone, Link2, Plus, Copy as CopyIcon } from "lucide-react";
import { B } from "@/lib/theme";
import type { Pkg, Trip, Payment, Pilgrim, BookingStatus, Booking } from "@/types";
import { openWhatsApp, copyText, payLinkFor, firstTwo, genderGlyph, newId} from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";
import { statusChips, statusLabel } from "@/lib/status";
import { isSellable } from "@/lib/trip";
import { EntityGate } from "@/components/States";
import { useServerPagedSearch } from "@/lib/useServerSearch";
import { Spinner } from "@/components/Spinner";
import { StatCard } from "@/components/StatCard";
import { PageHeader } from "@/components/PageHeader";
import { AppSelect } from "@/components/AppSelect";
import { NationalitySelect } from "@/components/NationalitySelect";
import { DOC_TYPES, docTypeDef, guessDocType, numberLabelOf } from "@/data/docTypes";
import { BusSeatGrid } from "@/components/BusSeatGrid";
import { useStore, flushSync, clearSyncError } from "@/store/useStore";
import { PAY_ACCOUNT, InvoiceModal } from "@/features/payments";
import { formatPhone } from "@/lib/phone";
import { Field } from "@/components/Field";
import { NumericInput } from "@/components/NumericInput";
import { Pager, type Paged, usePaged } from "@/components/Pager";
import { sar, sarNumber, SAR } from "@/lib/money";
import { todayYMD } from "@/lib/utils";
import { bookingGaps, transitionsFor, waitingFor, isStale, staleDays, type Transition } from "./flow";
import { ConfirmTransition, type TransitionSubmit } from "./ConfirmTransition";
import { acceptBooking, rejectBooking, cancelBooking, assignBooking, closeStaleBookings, applyDiscount, searchCustomers, type CustomerHit } from "./ops";
import { EventTimeline } from "@/components/EventTimeline";
import { logDocEvent, SEND_OUTCOMES } from "@/features/docs/docEvents";
import { invoicePhase, INVOICE_PHASE_LABEL, INVOICE_PHASE_TONE } from "@/lib/docPhase";
import { roomSplits, splitTotal, splitSummary, type RoomSplit } from "@/features/customer/roomSplit";
import { normPhone } from "@/features/beneficiaries/link";
import { useRole } from "@/lib/useRole";
import { toast } from "sonner";

const PAY_METHODS_INTERNAL = ["كاش","تحويل بنكي","آجل للموظف"];
const validPhone = (p:string) => /^(05\d{8}|(\+?966)5\d{8})$/.test(p.replace(/\s/g,""));

/* ════════ إضافة طلب جديد (حجز داخلي للموظف) ════════ */
export interface InternalOrderInput {
  clientName:string; clientPhone:string; tripId:string; persons:number; payMethod:string;
  /** ملخّص السكن المقروء + توزيعه المفصّل (يُحفظ في booking_rooms). */
  roomType:string; rooms?:{tierId?:string;type:string;persons:number;perNight:number}[];
  /** المبلغ المعروض للموظف — تقديرٌ محلي بنفس معادلة القاعدة؛ القاعدة
      تحسب المعتمد ولا تأخذ هذا الرقم (قرار ٢٠٢٦-٠٩-٠٦ رقم ١). */
  total:number;
}
const tAr=(k:string)=>(({guests:"أفراد",spotsUnit:"أماكن",roomsUnit:"غرف"}) as Record<string,string>)[k]??k;

/* بحثٌ محلي — لقاعدةٍ لم يُشغَّل عليها ترحيل search_customers بعد،
   ولوضع التجربة. نفس المنطق: ملفّات المستفيدين ثم عملاء الحجوزات. */
function localCustomerSearch(q:string):CustomerHit[]{
  const st=useStore.getState(); const d=normPhone(q); const k=q.trim().toLowerCase();
  const matchP=(ph:string)=>!!d&&d.length>=4&&normPhone(ph).includes(d);
  const matchN=(n:string)=>k.length>=2&&(n||"").toLowerCase().includes(k);
  const out:CustomerHit[]=[];
  for(const b of st.beneficiaries){
    if(matchP(b.phone)||matchN(b.name)) out.push({source:"beneficiary",refId:b.id,name:b.name,phone:b.phone,idNumber:b.idNumber,bookingsCount:b.bookingIds.length});
  }
  const seen=new Set(out.map(h=>normPhone(h.phone)));
  const byPhone=new Map<string,CustomerHit>();
  for(const bk of st.bookings){
    const np=normPhone(bk.clientPhone); if(!np||seen.has(np)) continue;
    if(!(matchP(bk.clientPhone)||matchN(bk.clientName))) continue;
    const h=byPhone.get(np);
    if(h) h.bookingsCount++;
    else byPhone.set(np,{source:"booking",refId:bk.id,name:bk.clientName,phone:bk.clientPhone,idNumber:bk.pilgrims?.[0]?.idNumber,bookingsCount:1,lastBooking:bk.createdAt});
  }
  return [...out,...byPhone.values()].slice(0,8);
}

function NewOrderModal({packages,trips,onCreate,onClose}:{
  packages:Pkg[];trips:Trip[];
  onCreate:(d:InternalOrderInput)=>string|null;
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
  const [split,setSplit]=useState<RoomSplit|null>(null);
  /* البحث عن عميلٍ قائم قبل إنشاء جديد — نصّ الملاحظة. */
  const [hits,setHits]=useState<CustomerHit[]>([]);
  const [searching,setSearching]=useState(false);
  const [picked,setPicked]=useState<CustomerHit|null>(null);
  const inp="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none";
  const ist={borderColor:B.border,background:"#fff",color:B.black,fontFamily:"inherit"} as const;
  const req=<span style={{color:B.gold}}>*</span>;

  /* isSellable لا `status === "open"`: العمود يبقى open بعد انطلاق
     الرحلة، فكانت قائمة «الرحلات المتاحة» تعرض للموظف رحلةً راحت أمس
     ويحجز عليها معتمراً. الشرط الآن واحدٌ يقرؤه الجميع — اللوحة ونموذج
     الحجز وشاشة المستفيد. */
  const availTrips = trips.filter(t=>t.packageId===packageId && isSellable(t));
  const selTrip = trips.find(t=>t.id===tripId);
  const selPkg = packages.find(p=>p.id===packageId);
  const maxSeats = selTrip ? Math.max(1,selTrip.seats-selTrip.bookedSeats) : 1;
  const Err=({k}:{k:string})=> errors[k] ? <div className="text-xs font-bold mt-1" style={{color:"#BE2626"}}>{errors[k]}</div> : null;

  /* نوع السكن — نفس توزيعات شاشة المستفيد حرفياً، فالطلب اليدوي يمرّ
     بنفس قواعد السعر (ملاحظة «المسار»). */
  const housing = (selPkg?.nights??0)>0 && (selPkg?.roomPrices?.length??0)>0;
  const splits = useMemo(()=>selPkg&&housing?roomSplits(selPkg.roomPrices,persons):[],[selPkg,housing,persons]);
  useEffect(()=>{ setSplit(prev=>prev&&splits.some(x=>x.key===prev.key)?prev:(splits[0]??null)); },[splits]);
  const nights = Math.max(1, selPkg?.nights??1);
  const estimate = housing&&split ? splitTotal(split,nights) : (selTrip?.price||selPkg?.marketPrice||0)*persons;

  useEffect(()=>{
    const q = clientPhone.replace(/\D/g,"").length>=4 ? clientPhone : clientName.trim().length>=2 ? clientName : "";
    if(!q||picked){ setHits([]); setSearching(false); return; }
    let alive=true; setSearching(true);
    const t=setTimeout(async()=>{
      const r=await searchCustomers(q);
      if(!alive) return;
      setHits(r.unsupported?localCustomerSearch(q):r.hits);
      setSearching(false);
    },350);
    return ()=>{ alive=false; clearTimeout(t); };
  },[clientPhone,clientName,picked]);

  function pick(h:CustomerHit){ setPicked(h); setClientName(h.name); setClientPhone(h.phone); setHits([]); }

  function validate(){
    const e:{[k:string]:string}={};
    if(!clientName.trim()) e.name="اسم العميل مطلوب";
    if(!validPhone(clientPhone)) e.phone="رقم جوال غير صحيح";
    if(!packageId) e.pkg="اختر الباقة";
    if(!tripId) e.trip="اختر الرحلة";
    if(persons<1) e.persons="عدد المقاعد على الأقل 1";
    else if(selTrip && persons>maxSeats) e.persons=`المتبقي ${maxSeats} مقاعد فقط`;
    if(housing&&!split) e.room="اختر نوع السكن — الباقة تشمل إقامة";
    setErrors(e); return Object.keys(e).length===0;
  }
  /* ينتظر ردّ القاعدة قبل شاشة النجاح. كان يعرض «تمت الإضافة بنجاح»
     فور استدعاء onCreate — والكتابة تفاؤلية، فالرفض (سعة ممتلئة، مقعد
     مبيع، صلاحية ناقصة) يصل بعد أن قرأ الموظف النجاح وأغلق النافذة. */
  async function submit(){
    if(busy) return;
    if(!validate()) return;
    setBusy(true);
    const err=onCreate({
      clientName:clientName.trim(),clientPhone:clientPhone.replace(/\s/g,""),tripId,persons,payMethod,
      roomType: housing&&split ? splitSummary(split,tAr) : "",
      rooms: housing&&split ? split.rooms.map(r=>({tierId:r.id,type:r.type,persons:r.persons,perNight:r.perNight})) : undefined,
      total: estimate,
    });
    if(err){ setErrors(x=>({...x,seats:err})); setBusy(false); return; }
    const syncErr=await flushSync();
    if(syncErr){ setErrors(x=>({...x,seats:syncErr})); setBusy(false); return; }
    setBusy(false);
    setDone("أُنشئ الطلب بحالة «قيد المراجعة». أكمل بيانات المعتمرين ثم اقبله واحصّل المبلغ.");
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
          <button aria-label="إغلاق النافذة" title="إغلاق النافذة" onClick={onClose} className="absolute top-4 left-4 p-1 cursor-pointer" style={{background:"none",border:"none",color:"#9DBAB6"}}><X size={16}/></button>
        </div>

        {done ? (
          <div className="p-8 flex flex-col items-center text-center gap-3">
            <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{background:"#E3F3E8"}}><Check size={32} style={{color:"#1E7A44"}}/></div>
            <div className="font-extrabold text-lg" style={{color:B.black}}>أُنشئ الطلب</div>
            <div className="text-sm" style={{color:B.text2}}>{done}</div>
            <button onClick={onClose} className="mt-2 px-6 py-2.5 rounded-xl font-bold text-sm cursor-pointer" style={{background:B.gold,color:B.black,border:"none"}}>تم</button>
          </div>
        ) : (
        <>
        <div className="p-6 grid grid-cols-2 gap-4">
          <div>
            <Field label={<>اسم العميل {req}</>}>
              <input value={clientName} onChange={e=>{setClientName(e.target.value);setPicked(null);}} placeholder="الاسم الكامل" className={inp} style={ist}/>
            </Field>
            <Err k="name"/>
          </div>
          <div>
            <Field label={<>رقم الجوال {req}</>}>
              <input value={clientPhone} onChange={e=>{setClientPhone(e.target.value);setPicked(null);}} placeholder="05xxxxxxxx" className={inp} style={{...ist,direction:"ltr",textAlign:"right"}}/>
            </Field>
            <Err k="phone"/>
          </div>
          {/* عميلٌ قائم؟ — يُعرض قبل أن يُنشأ ملفٌ مكرّر. */}
          {(hits.length>0||searching||picked)&&(
            <div className="col-span-2 rounded-xl overflow-hidden" style={{border:`1px solid ${picked?"#C4E4CE":B.border}`,background:picked?"#F3FAF5":B.bg}}>
              {picked ? (
                <div className="flex items-center gap-2 px-3.5 py-2.5 text-xs" style={{color:"#1E7A44"}}>
                  <Check size={13}/>عميل قائم — {picked.source==="beneficiary"?"ملف مستفيد":"سبق أن حجز"} · {picked.bookingsCount} طلب
                  <button onClick={()=>setPicked(null)} className="mr-auto cursor-pointer text-xs font-bold" style={{background:"none",border:"none",color:B.text2}}>تغيير</button>
                </div>
              ) : searching ? (
                <div className="px-3.5 py-2.5 text-xs" style={{color:B.muted}}>جارٍ البحث عن عميلٍ قائم…</div>
              ) : (
                <>
                  <div className="px-3.5 pt-2.5 pb-1 text-xs font-bold" style={{color:B.text3}}>عملاء قائمون بنفس البيانات — اختر بدل الإنشاء المكرّر</div>
                  {hits.map(h=>(
                    <button key={`${h.source}:${h.refId}`} onClick={()=>pick(h)}
                      className="w-full flex items-center gap-3 px-3.5 py-2 text-start cursor-pointer"
                      style={{background:"none",border:"none",borderTop:`1px solid ${B.border}`}}>
                      <span className="font-bold text-sm flex-1 min-w-0 truncate" style={{color:B.black}}>{h.name||"—"}</span>
                      <span className="text-xs" style={{color:B.muted,direction:"ltr",fontFamily:"var(--font-app)"}}>{h.phone}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{background:h.source==="beneficiary"?"#E3F3E8":"#EAF1FE",color:h.source==="beneficiary"?"#1E7A44":"#1E52C7"}}>
                        {h.source==="beneficiary"?"ملف":"حجز"} · {h.bookingsCount}
                      </span>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
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
            <Field label={<>عدد المعتمرين {req}</>}>
              <NumericInput min={1} max={maxSeats} value={persons} onValueChange={v=>setPersons(Math.max(1,Number(v)||1))} className={inp} style={{...ist,direction:"ltr",textAlign:"right"}}/>
            </Field>
            <Err k="persons"/>
          </div>
          <div>
            <Field label={<>طريقة الدفع المتوقّعة {req}</>}>
              <AppSelect value={payMethod} onChange={setPayMethod} options={PAY_METHODS_INTERNAL.map(m=>({value:m,label:m}))}/>
            </Field>
            <div className="text-xs mt-1" style={{color:B.muted}}>اختيار الطريقة لا يعني الدفع — التحصيل يُسجَّل من داخل الطلب بإثباته.</div>
          </div>

          {/* نوع السكن — كان النموذج لا يطلبه أصلاً فيُحسب السعر بلا سكن. */}
          {housing&&(
            <div className="col-span-2">
              <Field label={<>نوع السكن {req}</>}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {splits.map(sp=>{
                    const on=split?.key===sp.key;
                    return (
                      <button key={sp.key} type="button" onClick={()=>setSplit(sp)}
                        className="text-start rounded-xl px-3.5 py-2.5 cursor-pointer"
                        style={{background:on?B.primary:"#fff",border:`1px solid ${on?B.gold:B.border}`,color:on?B.cream:B.black}}>
                        <div className="text-sm font-bold">{splitSummary(sp,tAr)}</div>
                        <div className="text-xs mt-0.5" style={{color:on?"#CDE7E4":B.muted}}>
                          {sar(sp.perNight)} / الليلة للمجموعة{sp.spare>0?` · ${sp.spare} سرير فائض`:""}
                        </div>
                      </button>
                    );
                  })}
                  {splits.length===0&&<div className="text-xs" style={{color:"#B4530C"}}>لا توزيع غرفٍ ممكن لهذا العدد — راجع أسعار الغرف في الباقة.</div>}
                </div>
              </Field>
              <Err k="room"/>
            </div>
          )}

          {/* السعر المحسوب وتفصيله قبل الإنشاء — لا مبلغ حرّ. */}
          {tripId&&(
            <div className="col-span-2 rounded-xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap" style={{background:B.cream,border:"1px solid #EDE4CF"}}>
              <div className="text-xs" style={{color:B.text2}}>
                {housing&&split
                  ? <>{split.rooms.length} {split.rooms.length===1?"غرفة":"غرف"} × {nights} {nights===1?"ليلة":"ليالٍ"} · {persons} معتمر</>
                  : <>{persons} معتمر × {sar(selTrip?.price||selPkg?.marketPrice||0)}</>}
                <div style={{color:B.muted,marginTop:2}}>المبلغ المعتمد تحسبه القاعدة من أسعار الباقة — لا يُرسل من هنا.</div>
              </div>
              <div className="font-extrabold" style={{color:B.black,fontFamily:"var(--font-app)",fontSize:18}}>{sar(estimate)}</div>
            </div>
          )}

          {errors.seats&&<div className="col-span-2 rounded-xl px-4 py-3 text-xs font-bold" style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}>{errors.seats}</div>}
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={submit} disabled={busy} className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-extrabold text-sm"
            style={{background:busy?"#d6cfc6":B.gold,color:busy?"#a09688":B.black,border:"none",cursor:busy?"not-allowed":"pointer"}}>
            {busy&&<Spinner size={14} color={B.black}/>}
            {busy?"جارٍ الحفظ…":"إنشاء طلب"}
          </button>
          <button onClick={onClose} className="px-6 py-2.5 rounded-xl font-bold text-sm cursor-pointer" style={{background:B.bg,color:B.text2,border:"none"}}>إلغاء</button>
        </div>
        </>
        )}
      </motion.div>
    </motion.div>
  );
}

/* ════════ الخصم الموثَّق — للمدير وحده (قرار ١) ════════ */
function DiscountPanel({booking,onDone}:{booking:Booking;onDone:()=>Promise<void>}) {
  const [open,setOpen]=useState(false);
  const [pct,setPct]=useState(String(booking.discountPercent??""));
  const [reason,setReason]=useState(booking.discountReason??"");
  const [busy,setBusy]=useState(false);
  const inp="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none";
  const ist={borderColor:B.border,background:"#fff",color:B.black,fontFamily:"inherit"} as const;
  async function save(){
    const p=Number(pct);
    if(Number.isNaN(p)||p<0||p>100){ toast.error("النسبة بين 0 و100"); return; }
    if(p>0&&!reason.trim()){ toast.error("سبب الخصم إلزامي"); return; }
    setBusy(true);
    const r=await applyDiscount(booking.id,p,reason.trim());
    setBusy(false);
    if(r.unsupported){ toast.info("الخصم الموثَّق يحتاج ترحيل 20260910 على القاعدة."); return; }
    if(r.error){ toast.error(r.error); return; }
    toast.success(p>0?`اعتُمد خصم ${p}% — الإجمالي ${sar(r.total??0)}`:"أُلغي الخصم");
    setOpen(false); await onDone();
  }
  if(!open) return (
    <button onClick={()=>setOpen(true)} className="text-xs font-bold px-3.5 py-2 rounded-xl cursor-pointer"
      style={{background:"#fff",border:`1px solid ${B.border}`,color:"#8A6A08"}}>
      {booking.discountPercent?"تعديل الخصم":"خصم موثَّق (للمدير)"}
    </button>
  );
  return (
    <div className="rounded-2xl p-5 flex flex-col gap-3" style={{background:"#FFFBF0",border:"1px solid #EBD9A0"}}>
      <div className="text-sm font-bold" style={{color:B.black}}>خصم موثَّق</div>
      <div className="text-xs" style={{color:B.text2}}>يُسجَّل باسمك ووقته وسببه، ويظهر سطراً مستقلاً في الفاتورة. يُحسب من السعر الأصلي لا من الإجمالي الحالي، فلا يتراكب خصمٌ على خصم.</div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div><Field label="النسبة %"><NumericInput min={0} max={100} className={inp} style={{...ist,direction:"ltr"}} value={pct} onValueChange={setPct}/></Field></div>
        <div className="sm:col-span-2"><Field label="السبب"><input className={inp} style={ist} value={reason} placeholder="مثال: عميل متكرر · مجموعة · تعويض عن خطأ" onChange={e=>setReason(e.target.value)}/></Field></div>
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={busy} className="px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer" style={{background:B.gold,color:B.black,border:"none"}}>{busy?"جارٍ الحفظ…":"اعتماد"}</button>
        <button onClick={()=>setOpen(false)} className="px-4 py-2.5 rounded-xl text-sm font-bold cursor-pointer" style={{background:B.bg,color:B.text2,border:"none"}}>إغلاق</button>
      </div>
    </div>
  );
}

/* ألوان النقلات — من نغمة الإجراء في flow.ts لا من كل موضع رسم.
   النغمة معنى (خطر · تمام · محايد) واللون ترجمتها، فتُترجم مرّة. */
const TONE: Record<string,{bg:string;fg:string;br:string}> = {
  primary: { bg: B.primary, fg: B.cream,  br: B.primary },
  ok:      { bg: "#E3F3E8", fg: "#1E7A44", br: "#C4E4CE" },
  warn:    { bg: "#FBF3D6", fg: "#8A6A08", br: "#EBD9A0" },
  risk:    { bg: "#FBE6E6", fg: "#BE2626", br: "#F3C9C9" },
  neutral: { bg: "#fff",    fg: B.text2,   br: B.border  },
};

/* نقلاتٌ لا تمضي بضغطةٍ واحدة: لها أثرٌ على المقعد أو المال أو التذكرة،
   فتُعرَض آثارها أوّلاً. وإرسال رابط الدفع ليس منها — لا يُتلف شيئاً. */
const NEEDS_DIALOG: BookingStatus[] = ["paid","confirmed","cancelled","rejected"];

const BOOKING_TIMELINE: {status:BookingStatus;label:string}[] = [
  {status:"new",label:"جديد"},{status:"reviewing",label:"قيد المراجعة"},{status:"accepted",label:"مقبول"},
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
            <button aria-label="إغلاق النافذة" title="إغلاق النافذة" onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer" style={{background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.15)",color:"#CDE7E4"}}><X size={14}/></button>
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
function PaymentLinkCard({booking,trip,pkg,onLogged}:{booking:Booking;trip:Trip|undefined;pkg:Pkg|undefined;onLogged?:()=>void}) {
  const [copied,setCopied]=useState(false);
  /* الفروع النشطة وحدها، مرتّبةً بالاسم — من المخزن لا من مصفوفة ثابتة. */
  const branches=useStore(s=>s.branches);
  const activeBranches=useMemo(
    ()=>branches.filter(b=>b.isActive).sort((a,b)=>a.name.localeCompare(b.name,"ar")),
    [branches]);
  const link=payLinkFor(booking.id,booking.payToken);
  const hours=trip?.settings?.paymentDeadlineHours??pkg?.settings?.paymentDeadlineHours??24;
  const amount=sar(booking.total);
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
        {/* كل إرسال يُسجَّل حدثاً (القالب والوقت والموظف) ويُسأل عن نتيجته
            في سجلّ الطلب — قرار ٢: لا واجهة برمجية لواتساب، فالنتيجة يدوية. */}
        <button onClick={()=>{ openWhatsApp(booking.clientPhone,waMsg); void logDocEvent("booking",booking.id,"whatsapp",{note:"قالب: رابط الدفع"}).then(()=>onLogged?.()); }}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold cursor-pointer" style={{background:"#25D366",color:"#fff",border:"none"}}><Phone size={14}/>إرسال عبر واتساب</button>
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
      {/* ── مواقع الفروع ──
          من جدول الفروع الحيّ لا من مصفوفة في الشفرة: كانت ثلاثة فروع
          مكتوبة (الرياض وجدة ومكة) تُعرض للعميل مهما تغيّرت الفروع
          فعلاً — فرعٌ أُغلق يبقى معروضاً، وفرعٌ فُتح لا يظهر. والمعطَّل
          يُستبعد: عنوانُ فرعٍ لا يعمل يُرسل العميل بنقوده إلى بابٍ مغلق. */}
      {activeBranches.length > 0 && (
        <div>
          <div className="text-xs font-bold mb-2.5" style={{color:B.text2}}>مواقع الفروع</div>
          <div className="flex flex-col gap-2">
            {activeBranches.map(b=>(
              <div key={b.id} className="rounded-xl px-4 py-3" style={{border:`1px solid ${B.border}`}}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold" style={{color:B.black}}>{b.name}</span>
                  {b.phone && <span className="text-xs" style={{color:B.muted,direction:"ltr"}}>{formatPhone(b.phone)}</span>}
                </div>
                <div className="text-xs mt-0.5" style={{color:B.text2}}>
                  {[b.address, b.city].map(x=>(x||"").trim()).filter(Boolean).join("، ") || "—"}
                </div>
                {b.gmapUrl && (
                  <a href={b.gmapUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-bold mt-1 inline-block" style={{color:B.gold}}>
                    الموقع على الخريطة ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BookingDetail({booking,trips,packages,allBookings,onBack,onStatusChange,onPilgrimsChange,onSeatsChange,onRefresh}:{booking:Booking;trips:Trip[];packages:Pkg[];allBookings:Booking[];onBack:()=>void;onStatusChange:(id:string,s:BookingStatus,patch?:Partial<Booking>)=>void;onPilgrimsChange:(id:string,pilgrims:Pilgrim[])=>void;onSeatsChange:(id:string,seats:number[])=>void;onRefresh:()=>Promise<void>}) {
  const trip  = trips.find(t=>t.id===booking.tripId);
  const pkg   = packages.find(p=>p.id===trip?.packageId);
  const users=useStore(s=>s.users);
  const currentUser=useStore(s=>s.currentUser);
  const { isAdmin } = useRole();
  /* إجراءٌ جارٍ في القاعدة — يمنع النقر المزدوج على نقلةٍ ذات أثر. */
  const [busy,setBusy]=useState(false);
  /* يتغيّر بعد كل إجراء فيعيد سجلّ الأحداث جلبه. */
  const [evKey,setEvKey]=useState(0);
  const bump=()=>setEvKey(k=>k+1);
  const [invoiceOpen,setInvoiceOpen]=useState(false);
  /* الفاتورة والتذكرة والمستفيد تُقرأ من المخزن لا تُمرَّر: أثر الإلغاء
     يحتاج أن يعرف هل صدرت فاتورةٌ فعلاً، وتحذير النواقص يحتاج أن يعرف
     هل رُبط الطلب بملف مستفيد. */
  const payments=useStore(s=>s.payments);
  const tickets=useStore(s=>s.tickets);
  const beneficiaries=useStore(s=>s.beneficiaries);

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
  /* التوقيت المحلي لا UTC: toISOString تُقدّم اليوم أو تُؤخّره ثلاث
     ساعات عن الرياض، فيُسجَّل الدفع بتاريخ أمس أو غد. */
  const today = todayYMD();
  const CASH_AT_BRANCH = "كاش في الفرع";

  /* الإجراءات تُقرأ من جدول المسار (flow.ts) لا تُكتب هنا: الشرط والأثر
     والتسمية في وحدةٍ واحدة تقرؤها الشاشة والنافذة، وستقرؤها دوالّ
     القاعدة في الموجة القادمة. */
  const flowCtx = {
    booking, trip, pkg,
    allVerified,
    payReceived,
    hasInvoice: payments.some(x=>x.bookingId===booking.id),
    hasTicket: tickets.some(x=>x.bookingId===booking.id),
    beneficiaryLinked: beneficiaries.some(x=>x.bookingIds.includes(booking.id)),
    today,
  };
  const gaps = bookingGaps(flowCtx);
  const actions = transitionsFor(flowCtx);
  const [pending,setPending]=useState<Transition|null>(null);
  const invoice = payments.find(x=>x.bookingId===booking.id);
  const assignee = users.find(u=>u.id===booking.assignedTo);
  const activeUsers = users.filter(u=>u.status==="active");

  /* التعيين يمرّ من القاعدة (assign_booking): يُثبَّت ويُنبَّه المعيَّن.
     قاعدةٌ بلا الترحيل تُقال لها الحال بدل تعديلٍ صامتٍ لا يُحفظ. */
  async function assign(uid:string|null){
    if(busy) return;
    setBusy(true);
    const r=await assignBooking(booking.id,uid);
    setBusy(false);
    if(r.unsupported){ toast.info("التعيين يحتاج ترحيل 20260910 على قاعدة البيانات."); return; }
    if(r.error){ toast.error(r.error); return; }
    await onRefresh(); bump();
  }

  /* طرق الدفع تُحفظ مع النقلة: patch القادم من الجدول لا يحمل الطريقة
     المختارة في الشاشة ولا تاريخ اليوم — فيُكمَلان هنا. */
  const patchFor = (t:Transition):Partial<Booking>|undefined => {
    if(t.to!=="paid") return t.patch;
    return {
      ...t.patch,
      payMethod: booking.status==="accepted" ? CASH_AT_BRANCH : payMethodSel,
      payDate: today,
    };
  };

  /* الرفض والإلغاء يُنفَّذان في القاعدة (reject_booking · cancel_booking):
     سببٌ إلزامي وقيدٌ في السجل وتحرير المقاعد وإلغاء المستندات في
     معاملةٍ واحدة. قاعدةٌ بلا الترحيل تسلك المسار القديم (الكتابة
     المباشرة) فلا يتعطّل شيء قبل تشغيله. */
  const runTransition = async (t:Transition, v?:TransitionSubmit) => {
    if(busy) return;
    setBusy(true);
    let handled=false;
    if(t.to==="rejected"&&v){
      const r=await rejectBooking(booking.id,v.internalReason,v.customerMessage);
      if(!r.unsupported){ handled=true; if(r.error){ toast.error(r.error); setBusy(false); return; } }
    } else if(t.to==="cancelled"&&v){
      const r=await cancelBooking(booking.id,v.internalReason);
      if(!r.unsupported){ handled=true; if(r.error){ toast.error(r.error); setBusy(false); return; } }
    }
    if(handled){
      await onRefresh();
    } else {
      onStatusChange(booking.id,t.to,patchFor(t));
      void logDocEvent("booking",booking.id,
        t.to==="rejected"?"reject":t.to==="cancelled"?"cancel":"status",
        {note:`→ ${statusLabel(t.to,"booking")}${v?.internalReason?` — ${v.internalReason}`:""}`});
    }
    if(v?.notify && v.customerMessage){
      openWhatsApp(booking.clientPhone, v.customerMessage);
      void logDocEvent("booking",booking.id,"whatsapp",{note:`قالب: ${t.to==="rejected"?"رفض":"إلغاء"} — ${v.customerMessage.slice(0,120)}`});
    }
    setBusy(false); setPending(null); bump();
  };

  return (
    <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className="flex-1 px-4 md:px-8 pb-12 pt-5 max-w-4xl">
      <button onClick={onBack} className="flex items-center gap-2 text-sm font-bold mb-5 cursor-pointer" style={{background:"none",border:"none",color:B.text2}}>
        <ArrowRight size={14}/>عودة للطلبات
      </button>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <div className="font-extrabold mb-0.5" style={{fontFamily:"var(--font-app)",fontSize:22,color:B.black}}>{booking.id}</div>
          <div className="text-xs" style={{color:B.muted}}>
            أُنشئ {booking.createdAt} · رحلة {trip?.departureDate??"—"} · موظف: {booking.staff||"—"}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <StatusBadge status={booking.status} entity="booking"/>
          {/* الحالة تقول ما وصل إليه الطلب، وهذا يقول ما ينتظره — وهو
              ما كان ناقصاً: «مقبول» لا تخبر الموظف أن الدفع لم يُرسل. */}
          <span className="text-xs font-semibold" style={{color:B.text2}}>{waitingFor(booking.status)}</span>
        </div>
      </div>

      {/* المسؤول عن الطلب — تعيينٌ صريح، وتنبيهٌ لمن يفتح طلباً ليس له
          («منع معالجة نفس الطلب بالتوازي دون تنبيه»). */}
      <div className="rounded-2xl px-5 py-3 mb-5 flex flex-wrap items-center gap-3" style={{background:"#fff",border:`1px solid ${B.border}`}}>
        <span className="text-xs font-bold" style={{color:B.text3}}>الموظف المسؤول</span>
        <div style={{minWidth:220}}>
          <AppSelect value={booking.assignedTo??""} placeholder="غير معيَّن" onChange={v=>assign(v||null)}
            options={[{value:"",label:"— بلا مسؤول —"},...activeUsers.map(u=>({value:u.id,label:u.name}))]}/>
        </div>
        {booking.assignedAt&&<span className="text-xs" style={{color:B.muted,fontFamily:"var(--font-app)"}}>منذ {booking.assignedAt.slice(0,10)}</span>}
        {booking.assignedTo&&currentUser&&booking.assignedTo!==currentUser.id&&(
          <span className="text-xs font-bold px-3 py-1 rounded-full" style={{background:"#FBF3D6",color:"#8A6A08"}}>
            مُسنَد إلى {assignee?.name??"موظف آخر"} — نبّهه قبل أن تُعدّل
          </span>
        )}
        {currentUser&&booking.assignedTo!==currentUser.id&&(
          <button onClick={()=>assign(currentUser.id)} disabled={busy} className="text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer"
            style={{background:B.bg,border:`1px solid ${B.border}`,color:B.text2}}>أسنده إليّ</button>
        )}
      </div>

      {/* طلبٌ انتهت رحلته وما زال مفتوحاً — يُوسَم ولا يُغلق من تلقائه. */}
      {isStale(booking,trip,today)&&(
        <div className="rounded-2xl px-5 py-3.5 mb-5 flex items-start gap-3"
          style={{background:"#FCEBDD",border:"1px solid #F3D2B4"}}>
          <span className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 font-bold"
            style={{background:"#B4530C",color:"#fff",fontSize:12}}>!</span>
          <div className="text-sm leading-relaxed" style={{color:"#8A3F09"}}>
            <b>مضت رحلة هذا الطلب قبل {staleDays(trip,today)} يوماً</b> وهو ما زال «{waitingFor(booking.status)}».
            أغلقه بالرفض أو الإلغاء، أو انقله إلى رحلةٍ قادمة.
          </div>
        </div>
      )}

      {/* البيانات الناقصة أعلى الطلب — نصّ الملاحظة حرفياً: المستفيد،
          الهوية، الغرفة، الدفع، المقاعد. */}
      {gaps.length>0&&(
        <div className="rounded-2xl px-5 py-4 mb-5"
          style={{background:gaps.some(g=>g.blocking)?"#FBE6E6":"#FBF3D6",
                  border:`1px solid ${gaps.some(g=>g.blocking)?"#F3C9C9":"#EBD9A0"}`}}>
          <div className="text-xs font-bold mb-2" style={{color:gaps.some(g=>g.blocking)?"#BE2626":"#8A6A08"}}>
            بيانات ناقصة ({gaps.length})
          </div>
          <div className="flex flex-col gap-1.5">
            {gaps.map(g=>(
              <div key={g.key} className="flex items-center gap-2 text-xs font-semibold" style={{color:g.blocking?"#8A2020":"#6b5a2a"}}>
                <span className="w-4 h-4 rounded-md flex items-center justify-center flex-shrink-0"
                  style={{background:"#fff",border:`1px solid ${g.blocking?"#F3C9C9":B.border}`,fontSize:9,color:g.blocking?"#BE2626":B.muted}}>
                  {g.blocking?"!":"·"}
                </span>
                {g.label}
                <span style={{fontWeight:400,color:B.muted}}>— {g.blocking?"يمنع القبول والتأكيد":"تنبيه"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

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
              const disabled=a.blockers.length>0;
              const tone=TONE[a.tone];
              return (
              <button key={a.label} disabled={disabled}
                title={disabled?a.blockers.join(" · "):a.effects.join(" · ")}
                /* لا window.confirm: النقلة ذات الأثر تفتح نافذةً تقول
                   الأثر وتطلب السبب. وما لا أثر له (إرسال الرابط) يمضي. */
                onClick={()=>{ if(disabled) return;
                  if(a.opensSeatMap){setSeatOpen(true);return;}
                  if(NEEDS_DIALOG.includes(a.to)||a.reason){setPending(a);return;}
                  runTransition(a); }}
                className="px-5 py-2.5 rounded-xl font-bold text-sm"
                style={{background:disabled?"#EEECEA":tone.bg,color:disabled?B.muted:tone.fg,border:`1px solid ${disabled?B.border:tone.br}`,cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.7:1}}>
                {a.label}
              </button>
              );
            })}
          </div>
          {/* لماذا الزرّ معطَّل — بنصّه لا بتلميحٍ يُكتشف بالمرور. */}
          {actions.some(a=>a.blockers.length>0)&&(
            <div className="mt-3 flex flex-col gap-1.5">
              {actions.filter(a=>a.blockers.length>0).map(a=>(
                <div key={a.label} className="text-xs leading-relaxed" style={{color:"#B4530C"}}>
                  <b style={{color:"#8A6A08"}}>{a.label}:</b> {a.blockers.join(" · ")}
                </div>
              ))}
            </div>
          )}
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
                      {sar(r.perNight)} / للفرد / الليلة
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="rounded-2xl p-5 flex flex-col justify-center" style={{background:B.primary}}>
          <div className="text-xs font-semibold mb-1" style={{color:"#9DBAB6"}}>المبلغ الإجمالي</div>
          <div className="font-extrabold" style={{color:B.gold,fontSize:32,fontFamily:"var(--font-app)",lineHeight:1.2}}>{sarNumber(booking.total)}</div>
          <div className="text-xs mt-1" style={{color:"#9DBAB6"}}>{SAR}</div>
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
        <PaymentLinkCard booking={booking} trip={trip} pkg={pkg} onLogged={bump}/>
      )}

      {/* الفاتورة داخل الطلب — حالتها والمدفوع والمتبقي ورابطٌ مباشر
          («أظهر داخل الطلب الفاتورة وحالة الدفع والمبلغ المدفوع والمتبقي»). */}
      {invoice&&(()=>{
        const ph=invoicePhase(invoice); const tone=INVOICE_PHASE_TONE[ph];
        const paid=invoice.payStatus==="verified"?invoice.total:0;
        return (
          <div className="rounded-2xl p-5 mb-5 flex flex-wrap items-center gap-4" style={{background:"#fff",border:`1px solid ${B.border}`}}>
            <div className="flex-1 min-w-0">
              <div className="font-bold mb-1.5 flex items-center gap-2 flex-wrap" style={{color:B.black,fontSize:15}}>
                الفاتورة <span style={{fontFamily:"var(--font-app)",color:B.text3,fontSize:13}}>{invoice.id}</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold" style={{background:tone.bg,color:tone.fg}}>{INVOICE_PHASE_LABEL[ph]}</span>
              </div>
              <div className="flex flex-wrap gap-4 text-xs" style={{color:B.text2}}>
                <span>الإجمالي <b style={{fontFamily:"var(--font-app)",color:B.black}}>{sar(invoice.total)}</b></span>
                <span>المدفوع <b style={{fontFamily:"var(--font-app)",color:"#1E7A44"}}>{sar(paid)}</b></span>
                <span>المتبقي <b style={{fontFamily:"var(--font-app)",color:paid>=invoice.total?B.muted:"#BE2626"}}>{sar(Math.max(0,invoice.total-paid))}</b></span>
                {invoice.dueAt&&ph!=="paid"&&<span>ينتهي الرابط <span style={{fontFamily:"var(--font-app)"}}>{new Date(invoice.dueAt).toLocaleString("ar-SA-u-nu-latn",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Riyadh"})}</span></span>}
              </div>
            </div>
            <button onClick={()=>setInvoiceOpen(true)} className="px-4 py-2.5 rounded-xl text-sm font-bold cursor-pointer" style={{background:B.primary,color:B.cream,border:"none"}}>فتح الفاتورة</button>
          </div>
        );
      })()}

      {/* الخصم — المدير يعتمده، والموظف يراه. لا خصم بعد التحصيل: ذاك استرجاع. */}
      {booking.discountPercent?(
        <div className="rounded-xl px-4 py-2.5 mb-3 text-xs" style={{background:"#FBF3D6",border:"1px solid #EBD9A0",color:"#6b5a2a"}}>
          خصم معتمد <b>{booking.discountPercent}%</b> — {booking.discountReason}{booking.discountAt?<span style={{fontFamily:"var(--font-app)"}}> · {booking.discountAt.slice(0,10)}</span>:null}
        </div>
      ):null}
      {isAdmin&&booking.paymentStatus!=="verified"&&!["cancelled","rejected"].includes(booking.status)&&(
        <div className="mb-5"><DiscountPanel booking={booking} onDone={async()=>{ await onRefresh(); bump(); }}/></div>
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

      {/* سجلّ الطلب — كل انتقالٍ وإرسالٍ وتعيينٍ بصاحبه ووقته. */}
      <EventTimeline docType="booking" docId={booking.id} title="سجلّ الطلب" outcomes={SEND_OUTCOMES} reloadKey={evKey}/>

      <AnimatePresence>
        {seatOpen&&(
          <SeatMap booking={booking} trip={trip} allBookings={allBookings}
            onClose={()=>setSeatOpen(false)}
            /* القبول والمقاعد في معاملةٍ واحدة (accept_booking): كانا نداءين
               متعاقبين قد ينجح أوّلهما ويفشل ثانيهما — طلبٌ مقبول بلا مقاعد
               أو مقاعدُ محجوزةٌ لطلبٍ لم يُقبل. */
            onConfirm={async(seats)=>{
              if(busy) return;
              const accepting = booking.status==="new"||booking.status==="reviewing"||booking.status==="needs_edit";
              if(accepting){
                setBusy(true);
                const r=await acceptBooking(booking.id,seats);
                setBusy(false);
                if(!r.unsupported){
                  if(r.error){ toast.error(r.error); return; }
                  setSeatOpen(false); await onRefresh(); bump(); return;
                }
                onSeatsChange(booking.id,seats); onStatusChange(booking.id,"accepted");
                void logDocEvent("booking",booking.id,"accept",{note:`المقاعد: ${seats.join("، ")}`});
              } else {
                onSeatsChange(booking.id,seats);
              }
              setSeatOpen(false); bump();
            }}/>
        )}
        {pending&&(
          <ConfirmTransition t={pending} booking={{id:booking.id,clientName:booking.clientName}} busy={busy}
            onCancel={()=>setPending(null)}
            onConfirm={v=>{ void runTransition(pending,v); }}/>
        )}
        {invoiceOpen&&invoice&&<InvoiceModal pay={invoice} onClose={()=>setInvoiceOpen(false)}/>}
      </AnimatePresence>
    </motion.div>
  );
}

export function BookingsPage({packages,trips,onMenuOpen}:{packages:Pkg[];trips:Trip[];onMenuOpen?:()=>void}) {
  const bookings=useStore(s=>s.bookings); const setBookings=useStore(s=>s.setBookings);
  const refreshTrips=useStore(s=>s.refreshTrips);
  const refreshBookings=useStore(s=>s.refreshBookings);
  const currentUser=useStore(s=>s.currentUser);
  const beneficiaries=useStore(s=>s.beneficiaries);
  const users=useStore(s=>s.users);
  const nameOf=(uid?:string)=>uid?users.find(u=>u.id===uid)?.name:undefined;
  const [searchParams,setSearchParams]=useSearchParams();
  /* اليوم بالتوقيت المحلي — للطلبات التي مضت رحلتها. لا toISOString:
     هي UTC فتُقدّم اليوم أو تُؤخّره ثلاث ساعات عن الرياض. */
  const today=todayYMD();
  const [search,setSearch]=useState("");
  const [statusFilter,setStatusFilter]=useState<"all"|BookingStatus>("all");
  const [detailId,setDetailId]=useState<string|null>(null);
  const [onlyStale,setOnlyStale]=useState(false);
  const [showNew,setShowNew]=useState(false);

  /* روابط بطاقات الرئيسية قابلة للمشاركة: لا تضيع المرشحات بعد نسخ الرابط
     أو تحديث الصفحة. */
  useEffect(()=>{
    const status=searchParams.get("status");
    setStatusFilter(status && ["new","reviewing","needs_edit","rejected","accepted","awaiting_payment","awaiting_trip","paid","verifying","verified","confirmed","cancelled"].includes(status)
      ? status as BookingStatus : "all");
    /* رابط التنبيه «أُسند إليك طلب» يفتح الطلب نفسه. */
    const open=searchParams.get("open");
    if(open) setDetailId(open);
  },[searchParams]);

  /* الإغلاق الجماعي للمتأخّرة — بيد الموظف وبسببٍ واحد (قرار ٣). */
  const [bulkOpen,setBulkOpen]=useState(false);
  const [bulkReason,setBulkReason]=useState("انتهت الرحلة دون إتمام الطلب");
  const [bulkBusy,setBulkBusy]=useState(false);
  async function runBulkClose(){
    const ids=bookings.filter(b=>isStale(b,trips.find(t=>t.id===b.tripId),today)).map(b=>b.id);
    if(!ids.length||!bulkReason.trim()) return;
    setBulkBusy(true);
    const r=await closeStaleBookings(ids,bulkReason.trim());
    if(r.unsupported){
      setBookings(p=>p.map(b=>ids.includes(b.id)?{...b,status:"cancelled" as BookingStatus,closedReason:bulkReason.trim()}:b));
      toast.success(`أُغلق ${ids.length} طلباً متأخّراً`);
    } else if(r.error){
      toast.error(r.error);
    } else {
      toast.success(`أُغلق ${r.closed??ids.length} طلباً متأخّراً — مسجَّلٌ في سجلّ كل طلب`);
      await refreshBookings();
    }
    setBulkBusy(false); setBulkOpen(false); setOnlyStale(false);
    void refreshTrips();
  }
  const selectStatus=(status:"all"|BookingStatus)=>{
    const next=new URLSearchParams(searchParams);
    if(status==="all") next.delete("status"); else next.set("status",status);
    setSearchParams(next, {replace:true});
  };

  /* الإلغاء والرفض يحرّران المقاعد في القاعدة (حارس trg_booking_seats_sync)،
     فتُعاد قراءة الرحلات بعده — لا تُحسب محلياً. كان تغيير الحالة لا يُنقص
     bookedSeats إطلاقاً، فتظهر الرحلة ممتلئة وهي فارغة. */
  function changeStatus(id:string,s:BookingStatus,patch?:Partial<Booking>){
    setBookings(p=>p.map(b=>b.id===id?{...b,...patch,status:s}:b));
    void refreshTrips();
  }

  // إنشاء حجز داخلي — إعادة التحقق من المقاعد وخصمها وإسناد الموظف/الفرع
  function createInternalOrder(d:InternalOrderInput):string|null {
    const trip=useStore.getState().trips.find(t=>t.id===d.tripId);
    if(!trip) return "الرحلة غير متاحة";
    const avail=Math.max(0,trip.seats-trip.bookedSeats);
    if(d.persons>avail) return `عذراً، المقاعد المتبقية ${avail} فقط.`;
    const id=newId("TSH");
    const booking:Booking={
      id, tripId:trip.id, packageId:trip.packageId,
      clientName:d.clientName, clientPhone:d.clientPhone, roomType:d.roomType, rooms:d.rooms, persons:d.persons,
      /* «قيد المراجعة» لا «مؤكد».

         كان يُنشأ مؤكداً وحالة دفعه none — وحارس trg_booking_confirm_docs
         يُصدر الفاتورة والتذكرة لحظةَ صيرورة الطلب مؤكداً. أي أن الطلب
         اليدوي كان يُخرج تذكرة سفرٍ مقابل صفر ريال. والتأكيد أثرُ الدفع
         والمراجعة لا أثرُ زرّ الإنشاء — وهو نصّ ملاحظة الفريق. */
      /* المبلغ تقديرٌ للعرض فقط: upsert_booking (ترحيل 20260910) يحسب المعتمد
         من أسعار الباقة ويتجاهل ما يصله — الطلب اليدوي يمرّ بنفس قواعد
         السعر التي يمرّ بها طلب العميل. */
      total:d.total, status:"reviewing", paymentStatus:"none",
      payMethod:d.payMethod, seats:[], createdAt:todayYMD(),
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

  const createdOn=searchParams.get("created_on");
  const onlyUnlinked=searchParams.get("beneficiary")==="unlinked";
  /* «متأخّرة» تُشتقّ من تاريخ الرحلة لا من عمود، فتُصفّى في المتصفّح
     على الصفحة القادمة من الخادم كذلك — والعدّ في الشريحة يقول الحقيقة
     الكاملة لأنه محسوبٌ على كل المحمَّل. */
  const staleFilter = (b:Booking)=>!onlyStale||isStale(b,trips.find(t=>t.id===b.tripId),today);
  const filtered = bookings.filter(b=>
    staleFilter(b)&&
    (statusFilter==="all"||b.status===statusFilter)&&
    (!createdOn||b.createdAt?.startsWith(createdOn))&&
    (!onlyUnlinked||!beneficiaries.some(x=>x.bookingIds.includes(b.id)))&&
    (!search||(b.id+b.clientName+b.clientPhone).toLowerCase().includes(search.toLowerCase()))
  );

  /* ترقيم الصفحات — الرسم على الصفحة الحالية وحدها. المفتاح يُعيد
     للصفحة الأولى عند تغيّر البحث أو المرشّح: من كان في الصفحة الخامسة
     ثم بحث عن اسم يجب أن يرى أول النتائج لا صفحتها الخامسة. */
  const pg = usePaged(filtered, `${search}|${statusFilter}|${onlyStale}`);

  /* في Supabase لا نبحث في العناصر المحمّلة: الدالة تفلتر وتُرقّم في
     PostgreSQL. الوضع المحلي يبقى للمشاهدة التجريبية فقط. */
  const srv = useServerPagedSearch({
    fn: "admin_search_bookings",
    args: {
      q: search, status_filter: statusFilter === "all" ? null : statusFilter,
      created_on: createdOn || null, only_unlinked: onlyUnlinked,
    },
    resetKey: `${search}|${statusFilter}|${createdOn ?? ""}|${onlyUnlinked}`,
    all: bookings, idOf: b => b.id, idField: "booking_id",
  });
  const serverSearching = srv.searching;
  const base: Paged<Booking> = srv.supported ? srv.paged : pg;
  const activePg: Paged<Booking> = onlyStale && srv.supported
    ? { ...base, rows: base.rows.filter(staleFilter) }
    : base;

  const stats = {
    total:bookings.length,
    new:bookings.filter(b=>["new","reviewing"].includes(b.status)).length,
    awaitingPayment:bookings.filter(b=>b.status==="awaiting_payment").length,
    confirmed:bookings.filter(b=>b.status==="confirmed").length,
    revenue:bookings.filter(b=>["paid","confirmed"].includes(b.status)).reduce((a,b)=>a+b.total,0),
    /* الطلبات التي مضت رحلتها وما زالت مفتوحة — الرقم الذي رآه الفريق
       في البيانات: طلبٌ بتاريخ رحلة ٣٠ يوليو ما زال قيد المراجعة. */
    stale:bookings.filter(b=>isStale(b,trips.find(t=>t.id===b.tripId),today)).length,
  };

  /* الصياغة من المعجم لا مكتوبةً هنا: الشريحة والشارة في الصفّ نفسه
     كانتا تقولان «مؤكدة» و«مؤكد» لحالةٍ واحدة. الطلب مذكّر. */
  const filterChips = statusChips(
    ["new","reviewing","accepted","awaiting_payment","confirmed","cancelled"] as const, "booking",
  );

  const fb=(on:boolean)=>({padding:"7px 16px",borderRadius:999,fontSize:13,fontWeight:700,cursor:"pointer" as const,border:`1px solid ${on?B.gold:B.border}`,background:on?B.primary:"#fff",color:on?B.gold:B.text2,transition:"all 0.15s",whiteSpace:"nowrap" as const});

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{background:B.bg}}>
      <PageHeader title="الطلبات" crumb="إدارة الطلبات" search={search} onSearch={setSearch} onMenuOpen={onMenuOpen}/>

      {curBooking ? (
        <BookingDetail booking={curBooking} trips={trips} packages={packages} allBookings={bookings}
          onBack={()=>{ setDetailId(null); if(searchParams.get("open")){ const n=new URLSearchParams(searchParams); n.delete("open"); setSearchParams(n,{replace:true}); } }}
          onStatusChange={changeStatus} onPilgrimsChange={updatePilgrims} onSeatsChange={updateSeats} onRefresh={refreshBookings}/>
      ) : (
        <>
          {/* Stats */}
          <div className="px-4 md:px-8 pt-4 md:pt-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <StatCard label="إجمالي الطلبات" value={stats.total} sub="كل الحالات" accent/>
              <StatCard label="طلبات جديدة" value={stats.new} sub="تنتظر المراجعة"/>
              <StatCard label="بانتظار الدفع" value={stats.awaitingPayment} sub="أُرسل رابط الدفع"/>
              <StatCard label="مؤكدة" value={stats.confirmed} sub="مكتملة الإجراءات"/>
              <StatCard label="إجمالي الإيرادات" value={sar(stats.revenue)} sub="محصّلة"/>
              <StatCard label="متأخّرة" value={stats.stale} sub={stats.stale?"مضت رحلتها ولم تُغلق":"لا شيء متأخّر"}/>
            </div>
            {/* Filter chips */}
            <div className="flex items-center gap-2 mt-5 flex-wrap">
              {filterChips.map(([v,l])=>(
                <button key={v} style={fb(statusFilter===v&&!onlyStale)} onClick={()=>{setOnlyStale(false);selectStatus(v as "all"|BookingStatus);}}>{l}</button>
              ))}
              {/* مرشّحٌ تشغيلي لا حالةٌ في القاعدة: «متأخّرة» صفةٌ تُشتقّ من
                  تاريخ الرحلة، فمكانها بجانب الحالات لا بينها. */}
              <button style={{...fb(onlyStale),borderColor:onlyStale?"#B4530C":B.border}}
                onClick={()=>{setOnlyStale(v=>!v);}}>
                متأخّرة{stats.stale?` (${stats.stale})`:""}
              </button>
              {onlyStale&&stats.stale>0&&(
                <button onClick={()=>setBulkOpen(true)} className="px-4 py-1.5 rounded-full text-xs font-bold cursor-pointer"
                  style={{background:"#FCEBDD",border:"1px solid #F3D2B4",color:"#8A3F09"}}>
                  إغلاق الكل بسببٍ واحد ({stats.stale})
                </button>
              )}
              <span className="mr-auto text-sm font-semibold" style={{color:B.muted}}>{serverSearching?"جارِ البحث…":`${activePg.total} / ${bookings.length}`}</span>
              <button onClick={()=>setShowNew(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer"
                style={{background:B.gold,color:B.black,border:"none",boxShadow:"0 4px 12px rgba(192,134,44,0.3)"}}>
                <Plus size={14}/>إضافة طلب جديد
              </button>
            </div>
            <div className="mt-5" style={{height:1,background:B.border}}/>
          </div>

          {/* Table on desktop / Cards on mobile */}
          <main className="flex-1 px-4 md:px-8 py-6">
            <EntityGate entity="bookings" label="الطلبات" cols={7}>
            {/* Desktop table */}
            <div className="hidden md:block rounded-2xl overflow-hidden" style={{background:"#fff",border:`1px solid ${B.border}`}}>
              <div className="tbl-scroll tbl-wide">
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
                  <thead>
                    <tr style={{background:B.cream,color:"#7a7168",fontSize:12,textAlign:"right"}}>
                      {/* أُضيفت ثلاثة أعمدة بطلب الفريق: تاريخ الإنشاء
                          وتاريخ الرحلة والموظف المسؤول. الثلاثة موجودةٌ في
                          البيانات أصلاً ولم تكن معروضة. */}
                      {["رقم الطلب","العميل","الباقة","تاريخ الطلب","تاريخ الرحلة","المعتمرون","المبلغ","الموظف","الحالة","إجراء"].map(h=>(
                        <th key={h} className={h==="إجراء"||h==="إجراءات"?"col-action":undefined} style={{padding:"13px 16px",fontWeight:700}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activePg.rows.map((b,i)=>{
                      const rowTrip=trips.find(t=>t.id===b.tripId);
                      const pkg=packages.find(p=>p.id===rowTrip?.packageId);
                      const stale=isStale(b,rowTrip,today);
                      return (
                        <tr key={b.id} onClick={()=>setDetailId(b.id)} title="فتح مراجعة الطلب"
                          className="hover:brightness-95" style={{borderTop:`1px solid ${B.border}`,background:i%2===0?"#fff":"#FDFCFA",cursor:"pointer",transition:"filter 0.12s"}}>
                          <td style={{padding:"14px 16px",fontWeight:700,fontFamily:"var(--font-app)",color:B.black,fontSize:13}}>{b.id}</td>
                          <td style={{padding:"14px 16px"}}>
                            <div className="font-bold text-sm" style={{color:B.black}}>{b.clientName}</div>
                            <div className="text-xs font-mono" style={{color:B.muted,direction:"ltr"}}>{b.clientPhone}</div>
                          </td>
                          <td style={{padding:"14px 16px",color:B.text2,fontSize:13}}>{pkg?.name??"—"}</td>
                          <td style={{padding:"14px 16px",color:B.text2,fontSize:12,fontFamily:"var(--font-app)",whiteSpace:"nowrap"}}>{b.createdAt?.slice(0,10)||"—"}</td>
                          <td style={{padding:"14px 16px",fontSize:12,fontFamily:"var(--font-app)",whiteSpace:"nowrap",color:stale?"#B4530C":B.text2,fontWeight:stale?700:400}}>
                            {rowTrip?.departureDate??"—"}
                            {stale&&<div style={{fontSize:10,fontWeight:700}}>مضت — لم يُغلق</div>}
                          </td>
                          <td style={{padding:"14px 16px",fontWeight:700,color:B.black,textAlign:"center"}}>{b.persons}</td>
                          <td style={{padding:"14px 16px",fontWeight:700,color:B.black,fontFamily:"var(--font-app)"}}>{sar(b.total)}</td>
                          <td style={{padding:"14px 16px",color:B.text2,fontSize:12,whiteSpace:"nowrap"}}>
                            {nameOf(b.assignedTo)
                              ? <span className="font-bold" style={{color:B.black}}>{nameOf(b.assignedTo)}</span>
                              : (b.staff||(b.source==="public"?"من التطبيق":"—"))}
                          </td>
                          <td style={{padding:"14px 16px"}}><StatusBadge status={b.status} entity="booking"/></td>
                          <td className="col-action" style={{padding:"14px 16px"}} onClick={e=>e.stopPropagation()}>
                            <button onClick={()=>setDetailId(b.id)} className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
                              style={{background:B.primary,color:B.cream,border:"none"}}>فتح الطلب</button>
                          </td>
                        </tr>
                      );
                    })}
                    {serverSearching&&<tr><td colSpan={10} style={{padding:"48px 16px",textAlign:"center",color:B.muted,fontWeight:600}}>جارِ البحث في السجل…</td></tr>}
                    {!serverSearching&&activePg.total===0&&(
                      <tr><td colSpan={10} style={{padding:"48px 16px",textAlign:"center",color:B.muted,fontWeight:600}}>لا توجد طلبات مطابقة</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden flex flex-col gap-3">
              {activePg.rows.map(b=>{
                const pkg=packages.find(p=>p.id===trips.find(t=>t.id===b.tripId)?.packageId);
                return (
                  <motion.div key={b.id} initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} onClick={()=>setDetailId(b.id)}
                    className="rounded-2xl p-4" style={{background:"#fff",border:`1px solid ${B.border}`,cursor:"pointer"}}>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <div className="font-extrabold text-sm" style={{color:B.black,fontFamily:"var(--font-app)"}}>{b.id}</div>
                        <div className="text-xs mt-0.5" style={{color:B.muted}}>
                          أُنشئ {b.createdAt?.slice(0,10)} · رحلة {trips.find(t=>t.id===b.tripId)?.departureDate??"—"}
                        </div>
                        {isStale(b,trips.find(t=>t.id===b.tripId),today)&&(
                          <div className="text-xs font-bold mt-1" style={{color:"#B4530C"}}>مضت رحلته ولم يُغلق</div>
                        )}
                      </div>
                      <StatusBadge status={b.status} entity="booking"/>
                    </div>
                    <div className="font-bold text-sm mb-0.5" style={{color:B.black}}>{b.clientName}</div>
                    <div className="text-xs mb-3" style={{color:B.muted}}>{pkg?.name??"—"} · {b.persons} معتمر · {b.roomType}</div>
                    <div className="flex items-center justify-between">
                      <div className="font-extrabold" style={{color:B.gold,fontFamily:"var(--font-app)"}}>{sar(b.total)}</div>
                      <button onClick={e=>{e.stopPropagation();setDetailId(b.id);}} className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
                        style={{background:B.primary,color:B.cream,border:"none"}}>فتح الطلب</button>
                    </div>
                  </motion.div>
                );
              })}
              {serverSearching&&<div className="flex flex-col items-center py-16 rounded-2xl" style={{border:`2px dashed ${B.border}`,color:B.muted}}><span className="text-sm font-medium">جارِ البحث في السجل…</span></div>}
              {!serverSearching&&activePg.total===0&&(
                <div className="flex flex-col items-center py-16 rounded-2xl" style={{border:`2px dashed ${B.border}`,color:B.muted}}>
                  <BookOpen size={28} style={{opacity:0.3,marginBottom:8}}/>
                  <p className="text-sm font-medium">لا توجد طلبات مطابقة</p>
                </div>
              )}
            </div>
            </EntityGate>
            <Pager p={activePg} unit="طلب"/>
          </main>
        </>
      )}
      <AnimatePresence>
        {showNew&&<NewOrderModal packages={packages} trips={trips} onCreate={createInternalOrder} onClose={()=>setShowNew(false)}/>}
        {bulkOpen&&(
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-auto"
            style={{background:"rgba(14,12,11,0.8)",backdropFilter:"blur(4px)"}} onClick={()=>!bulkBusy&&setBulkOpen(false)}>
            <motion.div initial={{scale:0.95,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.95,opacity:0}}
              role="dialog" aria-modal="true" aria-label="إغلاق الطلبات المتأخّرة"
              className="w-full rounded-2xl overflow-hidden my-6 p-6 flex flex-col gap-4" style={{maxWidth:460,background:"#fff"}} onClick={e=>e.stopPropagation()}>
              <div>
                <h3 className="text-base font-bold" style={{color:B.black,margin:0}}>إغلاق {stats.stale} طلباً متأخّراً</h3>
                <p className="text-xs mt-1" style={{color:B.muted,margin:0}}>
                  كلها انتهت رحلتها وما زالت مفتوحة. تُغلق «ملغاة» بسببٍ واحد يُكتب في سجلّ كل طلب باسمك، وتعود مقاعدها للبيع. لا شيء يُحذف.
                </p>
              </div>
              <div>
                <label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>سبب الإغلاق <span style={{color:"#BE2626"}}>*</span></label>
                <textarea value={bulkReason} onChange={e=>setBulkReason(e.target.value)} rows={2}
                  className="w-full rounded-xl border px-3 py-2.5 text-sm resize-none focus:outline-none" style={{borderColor:B.border,fontFamily:"inherit",color:B.black}}/>
              </div>
              <div className="flex gap-3">
                <button onClick={runBulkClose} disabled={bulkBusy||!bulkReason.trim()}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold"
                  style={{background:"#B4530C",color:"#fff",border:"none",opacity:bulkBusy||!bulkReason.trim()?0.5:1,cursor:bulkBusy?"not-allowed":"pointer"}}>
                  {bulkBusy&&<Spinner size={13} color="#fff" track="rgba(255,255,255,0.3)"/>}
                  {bulkBusy?"جارٍ الإغلاق…":`إغلاق ${stats.stale} طلباً`}
                </button>
                <button onClick={()=>!bulkBusy&&setBulkOpen(false)} className="px-5 py-3 rounded-xl text-sm font-bold cursor-pointer" style={{background:B.bg,color:B.text2,border:"none"}}>تراجع</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
