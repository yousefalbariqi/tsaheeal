import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useSearchParams } from "react-router";
import { X, Check, BookOpen, Plus } from "lucide-react";
import { B } from "@/lib/theme";
import type { Pkg, Trip, Pilgrim, BookingStatus, Booking, Transport } from "@/types";
import { newId, todayYMD } from "@/lib/utils";
import { statusLabel } from "@/lib/status";
import { isSellable } from "@/lib/trip";
import { EntityGate } from "@/components/States";
import { useServerPagedSearch } from "@/lib/useServerSearch";
import { Spinner } from "@/components/Spinner";
import { StatCard } from "@/components/StatCard";
import { PageHeader } from "@/components/PageHeader";
import { AppSelect } from "@/components/AppSelect";
import { useStore, flushSync, clearSyncError } from "@/store/useStore";
import { Field } from "@/components/Field";
import { NumericInput } from "@/components/NumericInput";
import { Pager, type Paged, usePaged } from "@/components/Pager";
import { sar } from "@/lib/money";
import { isStale } from "./flow";
/* لغةٌ واحدة في الجدول والشاشة: عمود «الحالة» يقول الخطوة التي يقف
   عندها الطلب (stages.ts) لا اسم حالته في القاعدة — «جديد» و«مقبول»
   كانتا تظهران هنا بينما تقول شاشة الطلب شيئاً آخر. */
import { BookingDetail } from "./BookingDetail";
import { STAGES, closedAs, stageLabel, stageOf, type StageKey } from "./stages";
import { closeStaleBookings, searchCustomers, type CustomerHit } from "./ops";
import { packagePrice, roomSplits, splitSummary, type RoomSplit } from "@/features/customer/roomSplit";
import { normPhone } from "@/features/beneficiaries/link";
import { toast } from "sonner";

const PAY_METHODS_INTERNAL = ["كاش","تحويل بنكي","آجل للموظف"];

/* ════════ مرشّح الجدول: خطوةُ عملٍ لا اسمُ حالة ════════

   كانت الشرائح سبعاً بأسماء الحالات: «جديد» و«قيد المراجعة» و«مقبول»
   ثلاثٌ لمعنًى لم يعد معروضاً في أي شاشة، و«مقبول» و«بانتظار الدفع»
   شريحتان لخطوةٍ واحدة. صارت خطوات المسار الأربع، ومعها «مغلق» يجمع
   المرفوض والملغى — فالموظف يسأل «وين تكدّس الشغل؟» لا «كم طلباً
   حالته كذا؟».

   و«مغلق» ليس خطوةً في المسار، فهو هنا وحده. */
type StageFilter = "all" | StageKey | "closed";
const STAGE_FILTERS: [StageFilter,string][] = [
  ["all","الكل"],
  ...STAGES.map(s=>[s.key,s.label] as [StageFilter,string]),
  ["closed","مغلق"],
];
const STAGE_KEYS = STAGE_FILTERS.map(([v])=>v);
/** خطوة الطلب كما يراها المرشّح — المغلق خارج الخطوات الأربع. */
const filterStageOf = (b:Booking):StageFilter => closedAs(b.status) ? "closed" : stageOf(b);
const BOOKING_STATUSES:BookingStatus[] = ["new","reviewing","needs_edit","rejected","accepted","awaiting_payment","awaiting_trip","paid","verifying","verified","confirmed","cancelled"];
const validPhone = (p:string) => /^(05\d{8}|(\+?966)5\d{8})$/.test(p.replace(/\s/g,""));

/* شارة الخطوة في الجدول — الموظف يقرأ في القائمة نفس ما يقرؤه داخل
   الطلب: «التحقق من البيانات» لا «جديد»، و«بانتظار الدفع» لا «مقبول». */
function StageBadge({booking}:{booking:Booking}) {
  const closed=closedAs(booking.status);
  const label=closed?(closed==="rejected"?"مرفوض":"ملغى"):stageLabel(stageOf(booking));
  const tone=closed
    ? {bg:"#FBE6E6",fg:"#BE2626",br:"#F3C9C9"}
    : booking.status==="confirmed"
      ? {bg:"#E3F3E8",fg:"#1E7A44",br:"#C4E4CE"}
      : {bg:B.cream,fg:"#8A6A08",br:"#EDE4CF"};
  return (
    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap"
      style={{background:tone.bg,color:tone.fg,border:`1px solid ${tone.br}`}}>{label}</span>
  );
}

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

function NewOrderModal({packages,trips,transports,onCreate,onClose}:{
  packages:Pkg[];trips:Trip[];transports:Transport[];
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
  const transport = transports.find(t=>t.id===(selTrip?.transportId||selPkg?.transportId));
  const maxSeats = selTrip ? Math.max(1,selTrip.seats-selTrip.bookedSeats) : 1;
  const Err=({k}:{k:string})=> errors[k] ? <div className="text-xs font-bold mt-1" style={{color:"#BE2626"}}>{errors[k]}</div> : null;

  /* نوع السكن — نفس توزيعات شاشة المستفيد حرفياً، فالطلب اليدوي يمرّ
     بنفس قواعد السعر (ملاحظة «المسار»). */
  const housing = (selPkg?.nights??0)>0 && (selPkg?.roomPrices?.length??0)>0;
  const splits = useMemo(()=>selPkg&&housing?roomSplits(selPkg.roomPrices,persons):[],[selPkg,housing,persons]);
  useEffect(()=>{ setSplit(prev=>prev&&splits.some(x=>x.key===prev.key)?prev:(splits[0]??null)); },[splits]);
  const price = housing&&split ? packagePrice(split,persons,selPkg?.seatCostOverride ?? transport?.seatCost ?? 0,selPkg?.nights ?? 1) : null;
  const estimate = price?.total ?? (selTrip?.price||selPkg?.marketPrice||0)*persons;

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
        <div className="relative px-6 py-5" style={{background:B.primaryDeep}}>
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
            <div className="col-span-2 rounded-xl overflow-hidden" style={{border:`1px solid ${picked?"#C4E4CE":B.border}`,background:picked?"#F3FAF5":B.fill}}>
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
                        style={{background:on?B.gold:"#fff",border:`1px solid ${on?B.gold:B.border}`,color:B.black}}>
                        <div className="text-sm font-bold">{splitSummary(sp,tAr)}</div>
                        <div className="text-xs mt-0.5" style={{color:on?B.black:B.muted}}>
                          {sar(sp.perNight)} للغرفة مرة واحدة{sp.spare>0?` · ${sp.spare} سرير فائض`:""}
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
                {housing&&split&&price
                  ? <>المواصلات: {persons} مقاعد × {sar(price.seatPrice)} = {sar(price.transport)}<br/>السكن: {split.rooms.length} {split.rooms.length===1?"غرفة":"غرف"} = {sar(price.accommodation)}</>
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
          <button onClick={onClose} className="px-6 py-2.5 rounded-xl font-bold text-sm cursor-pointer" style={{background:B.fill,color:B.text2,border:"none"}}>إلغاء</button>
        </div>
        </>
        )}
      </motion.div>
    </motion.div>
  );
}

export function BookingsPage({packages,trips,onMenuOpen}:{packages:Pkg[];trips:Trip[];onMenuOpen?:()=>void}) {
  const bookings=useStore(s=>s.bookings); const setBookings=useStore(s=>s.setBookings);
  const transports=useStore(s=>s.transports);
  const refreshTrips=useStore(s=>s.refreshTrips);
  const refreshBookings=useStore(s=>s.refreshBookings);
  const currentUser=useStore(s=>s.currentUser);
  const beneficiaries=useStore(s=>s.beneficiaries);
  const [searchParams,setSearchParams]=useSearchParams();
  /* اليوم بالتوقيت المحلي — للطلبات التي مضت رحلتها. لا toISOString:
     هي UTC فتُقدّم اليوم أو تُؤخّره ثلاث ساعات عن الرياض. */
  const today=todayYMD();
  const [search,setSearch]=useState("");
  const [stageFilter,setStageFilter]=useState<StageFilter>("all");
  /* رابطٌ قديمٌ محفوظ يصفّي باسم الحالة (`?status=accepted`). يبقى عاملاً
     كما كان، ويُقال للموظف صراحةً بأيّ حالةٍ صُفّي الجدول وكيف يُزال —
     وإلا رأى جدولاً منقوصاً ولا شريحةَ مضيئة تفسّره. */
  const [legacyStatus,setLegacyStatus]=useState<BookingStatus|null>(null);
  const [detailId,setDetailId]=useState<string|null>(null);
  const [onlyStale,setOnlyStale]=useState(false);
  const [showNew,setShowNew]=useState(false);

  /* روابط بطاقات الرئيسية قابلة للمشاركة: لا تضيع المرشحات بعد نسخ الرابط
     أو تحديث الصفحة. */
  useEffect(()=>{
    const stage=searchParams.get("stage");
    setStageFilter(stage && (STAGE_KEYS as string[]).includes(stage) ? stage as StageFilter : "all");
    const status=searchParams.get("status");
    setLegacyStatus(status && (BOOKING_STATUSES as string[]).includes(status) ? status as BookingStatus : null);
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
  const selectStage=(stage:StageFilter)=>{
    const next=new URLSearchParams(searchParams);
    /* اختيار خطوةٍ يُسقط مرشّح الحالة القديم: مرشّحان على العمود نفسه
       يُنتجان جدولاً فارغاً بلا سببٍ ظاهر. */
    next.delete("status");
    if(stage==="all") next.delete("stage"); else next.set("stage",stage);
    setSearchParams(next, {replace:true});
  };
  const clearLegacyStatus=()=>{
    const next=new URLSearchParams(searchParams);
    next.delete("status");
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
  /* تصحيح اسم العميل أو جوّاله من شاشة المراجعة — يمرّ بنفس مسار الحفظ
     (upsert_booking يكتب client_name و client_phone)، فلا حاجة لدالّة جديدة. */
  function updateClient(id:string,patch:{clientName:string;clientPhone:string}){setBookings(p=>p.map(b=>b.id===id?{...b,...patch}:b));}
  function updateSeats(id:string,seats:number[]){setBookings(p=>p.map(b=>b.id===id?{...b,seats}:b));}

  const curBooking = detailId ? bookings.find(b=>b.id===detailId) : null;

  const createdOn=searchParams.get("created_on");
  const onlyUnlinked=searchParams.get("beneficiary")==="unlinked";
  /* «متأخّرة» تُشتقّ من تاريخ الرحلة لا من عمود، فتُصفّى في المتصفّح
     على الصفحة القادمة من الخادم كذلك — والعدّ في الشريحة يقول الحقيقة
     الكاملة لأنه محسوبٌ على كل المحمَّل. */
  const staleFilter = (b:Booking)=>!onlyStale||isStale(b,trips.find(t=>t.id===b.tripId),today);
  const stagePass = (b:Booking)=>stageFilter==="all"||filterStageOf(b)===stageFilter;
  const filtered = bookings.filter(b=>
    staleFilter(b)&&
    stagePass(b)&&
    (!legacyStatus||b.status===legacyStatus)&&
    (!createdOn||b.createdAt?.startsWith(createdOn))&&
    (!onlyUnlinked||!beneficiaries.some(x=>x.bookingIds.includes(b.id)))&&
    (!search||(b.id+b.clientName+b.clientPhone).toLowerCase().includes(search.toLowerCase()))
  );

  /* ترقيم الصفحات — الرسم على الصفحة الحالية وحدها. المفتاح يُعيد
     للصفحة الأولى عند تغيّر البحث أو المرشّح: من كان في الصفحة الخامسة
     ثم بحث عن اسم يجب أن يرى أول النتائج لا صفحتها الخامسة. */
  const pg = usePaged(filtered, `${search}|${stageFilter}|${legacyStatus ?? ""}|${onlyStale}`);

  /* في Supabase لا نبحث في العناصر المحمّلة: الدالة تفلتر وتُرقّم في
     PostgreSQL. الوضع المحلي يبقى للمشاهدة التجريبية فقط. */
  const srv = useServerPagedSearch({
    fn: "admin_search_bookings",
    args: {
      /* `stage_filter` ينزل مع ترحيل 20261004. قبله ترفضه القاعدة فتُعيد
         الدالّة المحاولة بدونه وتُصفّى الخطوة في المتصفّح — والبحث
         النصّيّ والتاريخ يبقيان في PostgreSQL كما هما اليوم. */
      q: search, status_filter: legacyStatus,
      stage_filter: stageFilter === "all" ? null : stageFilter,
      created_on: createdOn || null, only_unlinked: onlyUnlinked,
    },
    optional: ["stage_filter"],
    resetKey: `${search}|${stageFilter}|${legacyStatus ?? ""}|${createdOn ?? ""}|${onlyUnlinked}`,
    all: bookings, idOf: b => b.id, idField: "booking_id",
  });
  const serverSearching = srv.searching;
  const base: Paged<Booking> = srv.supported ? srv.paged : pg;
  /* بُعدان لا تعرفهما القاعدة دائماً: «متأخّرة» صفةٌ مشتقّة لا عمود،
     والخطوة قبل ترحيل 20261004. كلاهما يُصفّى على صفحة الخادم — فالعدّ
     فوق الجدول يقول عدد الخادم، والشريحة تقول العدد الكامل للمحمَّل. */
  const localOnly = onlyStale || srv.degraded;
  const activePg: Paged<Booking> = localOnly && srv.supported
    ? { ...base, rows: base.rows.filter(b => staleFilter(b) && (!srv.degraded || stagePass(b))) }
    : base;

  /* العدّ على كل ما حُمِّل — كما كان. الشريحة والبطاقة يقرآن الرقم نفسه
     فلا يقول أحدهما غير ما يقوله الآخر. */
  const byStage = (k:StageFilter)=>bookings.filter(b=>filterStageOf(b)===k).length;
  const stats = {
    total:bookings.length,
    verify:byStage("verify"),
    seats:byStage("seats"),
    payment:byStage("payment"),
    confirmed:byStage("done"),
    revenue:bookings.filter(b=>["paid","confirmed"].includes(b.status)).reduce((a,b)=>a+b.total,0),
    /* الطلبات التي مضت رحلتها وما زالت مفتوحة — الرقم الذي رآه الفريق
       في البيانات: طلبٌ بتاريخ رحلة ٣٠ يوليو ما زال قيد المراجعة. */
    stale:bookings.filter(b=>isStale(b,trips.find(t=>t.id===b.tripId),today)).length,
  };

  const fb=(on:boolean)=>({padding:"7px 16px",borderRadius:999,fontSize:13,fontWeight:700,cursor:"pointer" as const,border:`1px solid ${on?B.gold:B.border}`,background:on?B.gold:"#fff",color:on?B.black:B.text2,transition:"all 0.15s",whiteSpace:"nowrap" as const});

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{background: B.bg}}>
      <PageHeader title="الطلبات" crumb="إدارة الطلبات" search={search} onSearch={setSearch} onMenuOpen={onMenuOpen}/>

      {curBooking ? (
        <BookingDetail booking={curBooking} trips={trips} packages={packages} allBookings={bookings}
          onBack={()=>{ setDetailId(null); if(searchParams.get("open")){ const n=new URLSearchParams(searchParams); n.delete("open"); setSearchParams(n,{replace:true}); } }}
          onStatusChange={changeStatus} onPilgrimsChange={updatePilgrims} onClientChange={updateClient} onSeatsChange={updateSeats} onRefresh={refreshBookings}/>
      ) : (
        <>
          {/* Stats */}
          <div className="px-4 md:px-8 pt-4 md:pt-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              <StatCard label="إجمالي الطلبات" value={stats.total} sub="كل الخطوات" accent/>
              <StatCard label="التحقق من البيانات" value={stats.verify} sub="بانتظار مراجعة الموظف"/>
              <StatCard label="اختيار المقاعد" value={stats.seats} sub="تُحُقِّق منها ولم تُقفل مقاعدها"/>
              <StatCard label="بانتظار الدفع" value={stats.payment} sub="مقاعدها مقفلة ولم تُسدَّد"/>
              <StatCard label="مؤكدة" value={stats.confirmed} sub="صدرت فاتورتها وتذكرتها"/>
              <StatCard label="إجمالي الإيرادات" value={sar(stats.revenue)} sub="محصّلة"/>
              <StatCard label="متأخّرة" value={stats.stale} sub={stats.stale?"مضت رحلتها ولم تُغلق":"لا شيء متأخّر"}/>
            </div>
            {/* Filter chips */}
            <div className="flex items-center gap-2 mt-5 flex-wrap">
              {STAGE_FILTERS.map(([v,l])=>{
                const n = v==="all" ? bookings.length : byStage(v);
                return (
                  <button key={v} style={fb(stageFilter===v&&!onlyStale&&!legacyStatus)}
                    onClick={()=>{setOnlyStale(false);selectStage(v);}}>
                    {l}{v==="all"?"":` (${n})`}
                  </button>
                );
              })}
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
              {/* رابطٌ قديم صفّى باسم الحالة: يُقال بأيّه صُفّي ويُزال بضغطة،
                  فلا يبقى جدولٌ منقوصٌ بلا شريحةٍ مضيئة تفسّره. */}
              {legacyStatus&&(
                <button onClick={clearLegacyStatus} title="إزالة مرشّح الحالة القديم"
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold cursor-pointer"
                  style={{background:"#F1E9FA",border:"1px solid #D8BBFA",color:"#7226BE"}}>
                  الحالة: {statusLabel(legacyStatus,"booking")}<X size={12}/>
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
                          وتاريخ الرحلة والموظف. الثلاثة موجودةٌ في البيانات
                          أصلاً ولم تكن معروضة. و«الموظف» هو مُنشئ الطلب أو
                          مصدره: لا مسؤول معيَّن للطلب بعد قرار ٢٠٢٦-٠٩-١١. */}
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
                            {b.staff||(b.source==="public"?"من التطبيق":"—")}
                          </td>
                          <td style={{padding:"14px 16px"}}><StageBadge booking={b}/></td>
                          <td className="col-action" style={{padding:"14px 16px"}} onClick={e=>e.stopPropagation()}>
                            <button onClick={()=>setDetailId(b.id)} className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
                              style={{background:B.gold,color:B.black,border:"none"}}>فتح الطلب</button>
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
                      <StageBadge booking={b}/>
                    </div>
                    <div className="font-bold text-sm mb-0.5" style={{color:B.black}}>{b.clientName}</div>
                    <div className="text-xs mb-3" style={{color:B.muted}}>{pkg?.name??"—"} · {b.persons} معتمر · {b.roomType}</div>
                    <div className="flex items-center justify-between">
                      <div className="font-extrabold" style={{color:B.gold,fontFamily:"var(--font-app)"}}>{sar(b.total)}</div>
                      <button onClick={e=>{e.stopPropagation();setDetailId(b.id);}} className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
                        style={{background:B.gold,color:B.black,border:"none"}}>فتح الطلب</button>
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
        {showNew&&<NewOrderModal packages={packages} trips={trips} transports={transports} onCreate={createInternalOrder} onClose={()=>setShowNew(false)}/>}
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
                <button onClick={()=>!bulkBusy&&setBulkOpen(false)} className="px-5 py-3 rounded-xl text-sm font-bold cursor-pointer" style={{background:B.fill,color:B.text2,border:"none"}}>تراجع</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
