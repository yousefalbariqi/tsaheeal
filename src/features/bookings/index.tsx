import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence } from "motion/react";
import { useSearchParams } from "react-router";
import { X, Check, BookOpen, Plus, CreditCard, Ticket, ChevronLeft, AlertTriangle, SearchX } from "lucide-react";
import { B, TONE } from "@/lib/theme";
import type { Pkg, Trip, Pilgrim, BookingStatus, Booking, BookingTravellerCounts, Transport } from "@/types";
import { newId, todayYMD } from "@/lib/utils";
import { statusLabel } from "@/lib/status";
import { isSellable } from "@/lib/trip";
import { EntityGate } from "@/components/States";
import { useServerPagedSearch } from "@/lib/useServerSearch";
import { StatCard } from "@/components/StatCard";
import { PageHeader } from "@/components/PageHeader";
import { AppSelect } from "@/components/AppSelect";
import { useStore, flushSync, clearSyncError } from "@/store/useStore";
import { Field } from "@/components/Field";
import { NumericInput } from "@/components/NumericInput";
import { Pager, type Paged, usePaged } from "@/components/Pager";
import { sar } from "@/lib/money";
import { fmtDateShort, fmtDayDate } from "@/lib/dates";
import { Badge, Button, FilterChips, IconButton, Input, Modal, ModalIcon, Note, Textarea, type ChipOption } from "@/components/ui";
import { SEAT_TONE } from "@/components/BusSeatGrid";
import { EmptyState } from "@/components/States";
import { isStale } from "./flow";
/* لغةٌ واحدة في الجدول والشاشة: عمود «الحالة» يقول الخطوة التي يقف
   عندها الطلب (stages.ts) لا اسم حالته في القاعدة — «جديد» و«مقبول»
   كانتا تظهران هنا بينما تقول شاشة الطلب شيئاً آخر. */
import { BookingDetail } from "./BookingDetail";
import { InvoiceModal } from "@/features/payments";
import { TicketCard } from "@/features/tickets";
import { STAGES, closedAs, stageLabel, stageOf, type StageKey } from "./stages";
import { closeStaleBookings, searchCustomers, type CustomerHit } from "./ops";
import { packagePrice, roomSplits, splitSummary, type RoomSplit } from "@/features/customer/roomSplit";
import { normPhone } from "@/features/beneficiaries/link";
import { toast } from "sonner";
import { useConfirmDiscard } from "@/lib/useUnsavedGuard";

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
  if(closed) return <Badge tone={closed==="rejected"?"danger":"neutral"} dot>{closed==="rejected"?"مرفوض":"ملغى"}</Badge>;
  const stage=stageOf(booking);
  /* لونٌ لكل خطوة: الأصفر ما ينتظر الموظف، الأزرق والذهبي ما ينتظر
     العميل، والأخضر ما اكتمل — فيُقرأ العمود من بعيد قبل أن يُقرأ نصّه. */
  const tone=booking.status==="confirmed"||stage==="done"?"success":stage==="verify"?"warn":stage==="seats"?"info":"gold";
  return <Badge tone={tone} dot>{stageLabel(stage)}</Badge>;
}

/* ════════ إضافة طلب جديد (حجز داخلي للموظف) ════════ */
export interface InternalOrderInput {
  clientName:string; clientPhone:string; tripId:string; persons:number; payMethod:string;
  /** بيانات صاحب الطلب تُحفظ من البداية؛ لا ينشأ طلب داخلي فارغ الهوية. */
  owner:Pilgrim;
  /** توزيعٌ تشغيلي للمقاعد، لا يُستنتج من اسم صاحب الطلب أو ترتيبه. */
  travellerCounts:BookingTravellerCounts;
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

/** قسمٌ في نموذج الطلب — عنوانٌ صغير يجمع حقوله. */
function FormSection({title,children}:{title:string;children:ReactNode}) {
  return (
    <section>
      <h3 className="text-xs font-bold" style={{color:B.muted,margin:"0 0 10px"}}>{title}</h3>
      {children}
    </section>
  );
}

function NewOrderModal({packages,trips,transports,onCreate,onClose}:{
  packages:Pkg[];trips:Trip[];transports:Transport[];
  onCreate:(d:InternalOrderInput)=>string|null;
  onClose:()=>void;
}) {
  const [clientName,setClientName]=useState("");
  const [clientPhone,setClientPhone]=useState("");
  const [ownerDocType,setOwnerDocType]=useState<"national_id"|"iqama"|"passport">("national_id");
  const [ownerIdNumber,setOwnerIdNumber]=useState("");
  const [ownerNationality,setOwnerNationality]=useState("سعودي");
  const [packageId,setPackageId]=useState("");
  const [tripId,setTripId]=useState("");
  const [travellerCounts,setTravellerCounts]=useState<BookingTravellerCounts>({men:1,women:0,children:0});
  const [payMethod,setPayMethod]=useState(PAY_METHODS_INTERNAL[0]);
  const [errors,setErrors]=useState<{[k:string]:string}>({});
  const [busy,setBusy]=useState(false);
  const [done,setDone]=useState<string|null>(null);
  const [split,setSplit]=useState<RoomSplit|null>(null);
  /* البحث عن عميلٍ قائم قبل إنشاء جديد — نصّ الملاحظة. */
  const [hits,setHits]=useState<CustomerHit[]>([]);
  const [searching,setSearching]=useState(false);
  const [picked,setPicked]=useState<CustomerHit|null>(null);
  const requestClose=useConfirmDiscard({clientName,clientPhone,ownerDocType,ownerIdNumber,ownerNationality,packageId,tripId,travellerCounts,payMethod,split},onClose);

  /* isSellable لا `status === "open"`: العمود يبقى open بعد انطلاق
     الرحلة، فكانت قائمة «الرحلات المتاحة» تعرض للموظف رحلةً راحت أمس
     ويحجز عليها معتمراً. الشرط الآن واحدٌ يقرؤه الجميع — اللوحة ونموذج
     الحجز وشاشة المستفيد. */
  const availTrips = trips.filter(t=>t.packageId===packageId && isSellable(t));
  const selTrip = trips.find(t=>t.id===tripId);
  const selPkg = packages.find(p=>p.id===packageId);
  const transport = transports.find(t=>t.id===(selTrip?.transportId||selPkg?.transportId));
  const maxSeats = selTrip ? Math.max(1,selTrip.seats-selTrip.bookedSeats) : 1;
  const persons=travellerCounts.men+travellerCounts.women;
  const setTravellerCount=(key:"men"|"women", raw:string)=>{
    const value=Math.max(0,Math.trunc(Number(raw)||0));
    setTravellerCounts(prev=>{
      const other=key==="men"?prev.women:prev.men;
      return {...prev,[key]:Math.min(value,Math.max(0,maxSeats-other))};
    });
  };

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

  function pick(h:CustomerHit){ setPicked(h); setClientName(h.name); setClientPhone(h.phone); setOwnerIdNumber(h.idNumber ?? ""); setHits([]); }

  function validate(){
    const e:{[k:string]:string}={};
    if(!clientName.trim()) e.name="اسم العميل مطلوب";
    if(!validPhone(clientPhone)) e.phone="رقم جوال غير صحيح";
    if(!ownerIdNumber.trim()) e.ownerId="رقم الهوية أو الجواز مطلوب";
    if(!ownerNationality.trim()) e.ownerNationality="الجنسية مطلوبة";
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
      owner:{
        name:clientName.trim(), docType:ownerDocType, idNumber:ownerIdNumber.trim(), nationality:ownerNationality.trim(),
        gender:travellerCounts.women && !travellerCounts.men ? "female" : "male", birthDate:"", phone:clientPhone.replace(/\s/g,""),
      },
      travellerCounts,
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

  const fieldGrid="grid grid-cols-1 sm:grid-cols-2 gap-4";
  const ltr={direction:"ltr",textAlign:"end"} as const;

  return (
    <Modal open onClose={done?onClose:requestClose} width={760}
      title="إضافة طلب جديد"
      sub={done?undefined:"حجزٌ داخلي يُنشأ «قيد المراجعة» — تُكمل بيانات المعتمرين ثم تُقفل المقاعد ويُحصَّل المبلغ من داخل الطلب."}
      footer={done
        ? <Button variant="primary" onClick={onClose}>تم</Button>
        : <>
            <Button variant="primary" loading={busy} onClick={submit}>{busy?"جارٍ الحفظ…":"إنشاء طلب"}</Button>
            <Button variant="secondary" onClick={requestClose}>إلغاء</Button>
          </>}>
      {done ? (
        <div className="py-6 flex flex-col items-center text-center gap-3">
          <span aria-hidden className="flex items-center justify-center rounded-full" style={{width:56,height:56,background:TONE.success.bg,color:TONE.success.fg}}><Check size={28}/></span>
          <div className="font-extrabold" style={{color:B.black,fontSize:17}}>أُنشئ الطلب</div>
          <p className="text-sm" style={{color:B.text2,margin:0,lineHeight:1.8,maxWidth:420}}>{done}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <FormSection title="العميل">
            <div className={fieldGrid}>
              <div>
                <Field label={<>اسم العميل<span className="ui-req">*</span></>} error={errors.name}>
                  <Input value={clientName} invalid={!!errors.name} onChange={e=>{setClientName(e.target.value);setPicked(null);}} placeholder="الاسم الكامل"/>
                </Field>
              </div>
              <div>
                <Field label={<>رقم الجوال<span className="ui-req">*</span></>} error={errors.phone}>
                  <Input value={clientPhone} invalid={!!errors.phone} inputMode="tel" onChange={e=>{setClientPhone(e.target.value);setPicked(null);}} placeholder="05xxxxxxxx" style={ltr}/>
                </Field>
              </div>
            </div>
            {/* عميلٌ قائم؟ — يُعرض قبل أن يُنشأ ملفٌ مكرّر. */}
            {picked ? (
              <Note tone="success" icon={<Check size={15}/>} className="mt-3">
                <div className="flex items-center gap-3">
                  <span className="flex-1 min-w-0">عميل قائم — {picked.source==="beneficiary"?"ملف مستفيد":"سبق أن حجز"} · {picked.bookingsCount} طلب</span>
                  <Button variant="link" size="sm" onClick={()=>setPicked(null)}>تغيير</Button>
                </div>
              </Note>
            ) : searching ? (
              <div className="ui-hint" aria-live="polite">جارٍ البحث عن عميلٍ قائم…</div>
            ) : hits.length>0 ? (
              <div className="mt-3 rounded-xl overflow-hidden" style={{border:`1px solid ${B.border}`}}>
                <div className="px-3.5 py-2 text-xs font-bold" style={{color:B.text2,background:B.fill,borderBottom:`1px solid ${B.border}`}}>عملاء قائمون بنفس البيانات — اختر بدل الإنشاء المكرّر</div>
                {hits.map((h,i)=>(
                  <button key={`${h.source}:${h.refId}`} type="button" onClick={()=>pick(h)}
                    className="w-full flex items-center gap-3 px-3.5 text-start cursor-pointer hover:bg-[var(--k-cream)] focus-visible:bg-[var(--k-cream)]"
                    style={{height:44,borderTop:i?`1px solid ${B.border}`:"none",fontFamily:"inherit",filter:"none",outlineOffset:-2}}>
                    <span className="font-bold text-sm flex-1 min-w-0 truncate" style={{color:B.black}}>{h.name||"—"}</span>
                    <span className="text-xs" style={{color:B.muted,direction:"ltr"}}>{h.phone}</span>
                    <Badge size="sm" tone={h.source==="beneficiary"?"success":"info"}>{h.source==="beneficiary"?"ملف":"حجز"} · {h.bookingsCount}</Badge>
                  </button>
                ))}
              </div>
            ) : null}
          </FormSection>

          <FormSection title="هوية صاحب الطلب">
            <div className={fieldGrid}>
              <div>
                <Field label={<>نوع الوثيقة<span className="ui-req">*</span></>}>
                  <AppSelect value={ownerDocType} onChange={v=>setOwnerDocType(v as typeof ownerDocType)} options={[
                    {value:"national_id",label:"هوية وطنية"}, {value:"iqama",label:"إقامة"}, {value:"passport",label:"جواز سفر"},
                  ]}/>
                </Field>
              </div>
              <div>
                <Field label={<>رقم الهوية أو الجواز<span className="ui-req">*</span></>} error={errors.ownerId}>
                  <Input value={ownerIdNumber} invalid={!!errors.ownerId} inputMode="numeric" style={ltr}
                    onChange={e=>setOwnerIdNumber(e.target.value)} placeholder={ownerDocType==="passport" ? "رقم الجواز" : "10XXXXXXXX"}/>
                </Field>
              </div>
              <div>
                <Field label={<>الجنسية<span className="ui-req">*</span></>} error={errors.ownerNationality}>
                  <Input value={ownerNationality} invalid={!!errors.ownerNationality} onChange={e=>setOwnerNationality(e.target.value)} placeholder="مثال: سعودي"/>
                </Field>
              </div>
            </div>
          </FormSection>

          <FormSection title="الباقة والرحلة">
            <div className={fieldGrid}>
              <div>
                <Field label={<>الباقة<span className="ui-req">*</span></>} error={errors.pkg}>
                  <AppSelect value={packageId} placeholder="اختر الباقة" invalid={!!errors.pkg} onChange={v=>{setPackageId(v);setTripId("");}}
                    options={packages.map(p=>({value:p.id,label:p.name}))}/>
                </Field>
              </div>
              <div>
                <Field label={<>الرحلة<span className="ui-req">*</span></>} error={errors.trip}
                  hint={packageId&&availTrips.length===0?"لا توجد رحلات متاحة لهذه الباقة.":undefined}>
                  <AppSelect value={tripId} placeholder={packageId?"اختر الرحلة المتاحة":"اختر الباقة أولاً"}
                    disabled={!packageId} invalid={!!errors.trip} onChange={setTripId}
                    options={availTrips.map(t=>({value:t.id,label:`${fmtDayDate(t.departureDate)} · المتبقي ${t.seats-t.bookedSeats} مقعد`}))}/>
                </Field>
              </div>
            </div>
          </FormSection>

          <FormSection title="المعتمرون والسكن">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Field label={<><span aria-hidden className="inline-block rounded-full align-middle" style={{width:8,height:8,marginInlineEnd:6,background:SEAT_TONE.male.fg}}/>المعتمرون<span className="ui-req">*</span></>}>
                  <NumericInput min={0} max={maxSeats-travellerCounts.women} value={travellerCounts.men} onValueChange={v=>setTravellerCount("men",v)} className="ui-input" style={ltr}/>
                </Field>
              </div>
              <div>
                <Field label={<><span aria-hidden className="inline-block rounded-full align-middle" style={{width:8,height:8,marginInlineEnd:6,background:SEAT_TONE.female.fg}}/>المعتمرات</>}>
                  <NumericInput min={0} max={maxSeats-travellerCounts.men} value={travellerCounts.women} onValueChange={v=>setTravellerCount("women",v)} className="ui-input" style={ltr}/>
                </Field>
              </div>
            </div>
            {errors.persons
              ? <div role="alert" className="ui-error">{errors.persons}</div>
              : <div className="ui-hint">الإجمالي {persons} مقعد — يُحفظ التوزيع ليظهر الكروكي صحيحاً.</div>}

            {/* نوع السكن — كان النموذج لا يطلبه أصلاً فيُحسب السعر بلا سكن. */}
            {housing&&(
              <div className="mt-4">
                <div className="ui-label" id="new-order-room">نوع السكن<span className="ui-req">*</span></div>
                {splits.length===0 ? (
                  <Note tone="warn" icon={<AlertTriangle size={15}/>}>لا توزيع غرفٍ ممكن لهذا العدد — راجع أسعار الغرف في الباقة.</Note>
                ) : (
                  <div role="radiogroup" aria-labelledby="new-order-room" className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {splits.map(sp=>{
                      const on=split?.key===sp.key;
                      return (
                        /* المختار بحدٍّ أسود وعلامة، لا حشوةٌ ذهبية: الاختيار ليس فعلاً. */
                        <button key={sp.key} type="button" role="radio" aria-checked={on} onClick={()=>setSplit(sp)}
                          className="flex items-start gap-3 text-start rounded-xl px-3.5 py-3 cursor-pointer"
                          style={{background:on?B.cream:B.surface,border:`1px solid ${on?B.black:B.borderStrong}`,boxShadow:on?`0 0 0 1px ${B.black}`:"none",color:B.black,fontFamily:"inherit"}}>
                          <span aria-hidden className="flex items-center justify-center rounded-full flex-shrink-0"
                            style={{width:18,height:18,marginTop:2,background:on?B.black:B.surface,border:`1px solid ${on?B.black:B.borderStrong}`,color:B.onInk}}>
                            {on&&<Check size={12} strokeWidth={3}/>}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-bold">{splitSummary(sp,tAr)}</span>
                            <span className="block text-xs mt-0.5" style={{color:B.muted}}>
                              {sar(sp.perNight)} للغرفة مرة واحدة{sp.spare>0?` · ${sp.spare} سرير فائض`:""}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {errors.room&&<div role="alert" className="ui-error">{errors.room}</div>}
              </div>
            )}
          </FormSection>

          {/* الدفع والسعر متجاوران: الطريقة في عمود، والمبلغ الذي ستُحصَّل به
              في العمود المقابل — يُقرآن معاً قبل الضغط على «إنشاء طلب». */}
          <FormSection title="الدفع والسعر">
            <div className={`${fieldGrid} items-start`}>
              <div>
                <Field label={<>طريقة الدفع المتوقّعة<span className="ui-req">*</span></>}
                  hint="اختيار الطريقة لا يعني الدفع — التحصيل يُسجَّل من داخل الطلب بإثباته.">
                  <AppSelect value={payMethod} onChange={setPayMethod} options={PAY_METHODS_INTERNAL.map(m=>({value:m,label:m}))}/>
                </Field>
              </div>

              {/* السعر المحسوب وتفصيله قبل الإنشاء — لا مبلغ حرّ. */}
              {tripId ? (
                <div className="rounded-xl px-4 py-3" style={{background:B.fill,border:`1px solid ${B.border}`}}>
                  <div className="text-sm" style={{color:B.text2,lineHeight:1.8}}>
                    {housing&&split&&price
                      ? <><div>المواصلات: {persons} مقاعد × {sar(price.seatPrice)} = {sar(price.transport)}</div><div>السكن: {split.rooms.length} {split.rooms.length===1?"غرفة":"غرف"} = {sar(price.accommodation)}</div></>
                      : <div>{persons} معتمر × {sar(selTrip?.price||selPkg?.marketPrice||0)}</div>}
                  </div>
                  <div className="flex items-baseline justify-between gap-3 mt-2 pt-2" style={{borderTop:`1px solid ${B.borderStrong}`}}>
                    <span className="text-sm font-bold" style={{color:B.text3}}>الإجمالي التقديري</span>
                    <span className="font-extrabold" style={{color:B.black,fontSize:20,lineHeight:1.3,whiteSpace:"nowrap"}}>{sar(estimate)}</span>
                  </div>
                  <div className="text-xs" style={{color:B.muted,marginTop:4,lineHeight:1.6}}>المبلغ المعتمد تحسبه القاعدة من أسعار الباقة — لا يُرسل من هنا.</div>
                </div>
              ) : (
                <div className="rounded-xl px-4 flex items-center justify-center text-center text-xs" style={{minHeight:68,marginTop:25,border:`1px dashed ${B.borderStrong}`,color:B.muted}}>
                  يُحسب السعر بعد اختيار الباقة والرحلة.
                </div>
              )}
            </div>
          </FormSection>

          {errors.seats&&<Note tone="danger" icon={<AlertTriangle size={15}/>}>{errors.seats}</Note>}
        </div>
      )}
    </Modal>
  );
}

export function BookingsPage({packages,trips,onMenuOpen}:{packages:Pkg[];trips:Trip[];onMenuOpen?:()=>void}) {
  const bookings=useStore(s=>s.bookings); const setBookings=useStore(s=>s.setBookings);
  const transports=useStore(s=>s.transports);
  const payments=useStore(s=>s.payments);
  const tickets=useStore(s=>s.tickets);
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
  const [invoiceView,setInvoiceView]=useState<ReturnType<typeof payments.find>|null>(null);
  const [ticketView,setTicketView]=useState<ReturnType<typeof tickets.find>|null>(null);

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
      travellerCounts:d.travellerCounts,
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
      staff:currentUser?.name??"—", createdBy:currentUser?.id, branchId:currentUser?.branch, source:"internal", sentDate:"", pilgrims:[d.owner],
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
  function updateTravellerCounts(id:string,travellerCounts:BookingTravellerCounts){setBookings(p=>p.map(b=>b.id===id?{...b,travellerCounts}:b));}
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

  const chipsOn = !onlyStale && !legacyStatus;
  const stageChips: ChipOption<StageFilter>[] = STAGE_FILTERS.map(([v,l])=>({
    value:v, label:l, count:v==="all"?bookings.length:byStage(v),
  }));
  const filteredOut = activePg.total===0 && bookings.length>0;

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{background: B.bg}}>
      <PageHeader title="الطلبات" crumb="إدارة الطلبات" search={search} onSearch={setSearch} onMenuOpen={onMenuOpen}
        actions={!curBooking&&<Button variant="primary" icon={<Plus size={16}/>} onClick={()=>setShowNew(true)}>
          <span className="hidden sm:inline">طلب جديد</span><span className="sm:hidden">جديد</span>
        </Button>}/>

      {curBooking ? (
        <BookingDetail booking={curBooking} trips={trips} packages={packages} allBookings={bookings}
          onBack={()=>{ setDetailId(null); if(searchParams.get("open")){ const n=new URLSearchParams(searchParams); n.delete("open"); setSearchParams(n,{replace:true}); } }}
          onStatusChange={changeStatus} onPilgrimsChange={updatePilgrims} onClientChange={updateClient} onTravellerCountsChange={updateTravellerCounts} onSeatsChange={updateSeats} onRefresh={refreshBookings}/>
      ) : (
        <>
          <div className="px-4 md:px-8 pt-1">
            {/* أربع بطاقاتٍ لا سبع: عدّ كل خطوةٍ صار على شريحتها تحت، فلا
                يُكتب الرقم نفسه مرّتين في شاشةٍ واحدة. وكل بطاقةٍ تُرشِّح. */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="كل الطلبات" value={stats.total} sub={`${stats.verify+stats.seats+stats.payment} قيد الإجراء`} accent
                onClick={()=>{setOnlyStale(false);selectStage("all");}}/>
              <StatCard label="مؤكدة" value={stats.confirmed} sub="صدرت فاتورتها وتذكرتها"
                onClick={()=>{setOnlyStale(false);selectStage("done" as StageFilter);}}/>
              <StatCard label="الإيرادات المحصّلة" value={sar(stats.revenue)} sub="من الطلبات المدفوعة والمؤكدة"/>
              <StatCard label="متأخّرة" value={stats.stale} alert sub={stats.stale?"مضت رحلتها ولم تُغلق":"لا شيء متأخّر"}
                onClick={()=>setOnlyStale(v=>!v)}/>
            </div>

            <div className="flex items-center gap-2 mt-5 flex-wrap">
              <FilterChips label="خطوة الطلب" options={stageChips}
                value={chipsOn?stageFilter:("__none" as StageFilter)}
                onChange={v=>{setOnlyStale(false);selectStage(v);}}/>
              {/* مرشّحٌ تشغيلي لا حالةٌ في القاعدة: «متأخّرة» صفةٌ تُشتقّ من
                  تاريخ الرحلة، فمكانها بجانب الحالات لا بينها. */}
              {stats.stale>0&&(
                <button type="button" aria-pressed={onlyStale} onClick={()=>setOnlyStale(v=>!v)} className="ui-chip ui-chip--alert">
                  <AlertTriangle size={14}/>متأخّرة<span className="ui-chip-count">{stats.stale}</span>
                </button>
              )}
              {onlyStale&&stats.stale>0&&(
                <Button size="sm" variant="danger-soft" onClick={()=>setBulkOpen(true)}>إغلاق الكل بسببٍ واحد</Button>
              )}
              {/* رابطٌ قديم صفّى باسم الحالة: يُقال بأيّه صُفّي ويُزال بضغطة،
                  فلا يبقى جدولٌ منقوصٌ بلا شريحةٍ مضيئة تفسّره. */}
              {legacyStatus&&(
                <button type="button" onClick={clearLegacyStatus} title="إزالة مرشّح الحالة" className="ui-chip is-on">
                  الحالة: {statusLabel(legacyStatus,"booking")}<X size={13}/>
                </button>
              )}
              <span className="ms-auto text-sm" style={{color:B.muted}} aria-live="polite">
                {serverSearching?"جارٍ البحث…":activePg.total===bookings.length?`${bookings.length} طلب`:`${activePg.total} من ${bookings.length}`}
              </span>
            </div>
          </div>

          {/* Table on desktop / Cards on mobile */}
          <main className="flex-1 px-4 md:px-8 pt-4 pb-8">
            <EntityGate entity="bookings" label="الطلبات" cols={7}>
            {!serverSearching&&activePg.total===0 ? (
              <EmptyState
                icon={filteredOut?<SearchX size={22}/>:<BookOpen size={22}/>}
                title={filteredOut?"لا طلبات تطابق البحث":"لا طلبات بعد"}
                note={filteredOut?"جرّب كلمةً أخرى أو أزل المرشّح.":"طلبات العملاء من التطبيق تظهر هنا، ويمكنك إضافة طلبٍ يدوياً."}
                action={filteredOut
                  ? <Button variant="secondary" onClick={()=>{setSearch("");setOnlyStale(false);selectStage("all");}}>إزالة المرشّحات</Button>
                  : <Button variant="primary" icon={<Plus size={16}/>} onClick={()=>setShowNew(true)}>طلب جديد</Button>}/>
            ) : <>
            {/* Desktop table */}
            <div className="hidden md:block ui-table-wrap" style={{opacity:serverSearching?0.55:1,transition:"opacity .15s"}}>
              <div className="ui-table-scroll">
                <table className="ui-table" style={{minWidth:860}}>
                  <thead>
                    <tr>
                      {/* العمودان «تاريخ الطلب» و«تاريخ الرحلة» صارا سطراً ثانياً
                          تحت الرقم والباقة: المعلومة باقية، وعرض الجدول يتّسع
                          للاسم كاملاً بلا انكسار. */}
                      <th>الطلب</th>
                      <th>العميل</th>
                      <th>الباقة والرحلة</th>
                      <th style={{textAlign:"center"}}>المعتمرون</th>
                      <th>المبلغ</th>
                      <th>الموظف</th>
                      <th>الخطوة</th>
                      <th className="col-action"><span className="sr-only">إجراء</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {activePg.rows.map(b=>{
                      const rowTrip=trips.find(t=>t.id===b.tripId);
                      const pkg=packages.find(p=>p.id===rowTrip?.packageId);
                      const stale=isStale(b,rowTrip,today);
                      const pay=payments.find(p=>p.bookingId===b.id);
                      const tkt=tickets.find(t=>t.bookingId===b.id);
                      return (
                        <tr key={b.id} className="is-clickable" tabIndex={0} aria-label={`فتح الطلب ${b.id}`}
                          onClick={()=>setDetailId(b.id)}
                          onKeyDown={e=>{ if(e.key==="Enter"&&e.target===e.currentTarget) setDetailId(b.id); }}>
                          <td className="nowrap">
                            <div className="cell-main num" style={{textAlign:"start"}}>{b.id}</div>
                            <div className="cell-sub">{fmtDateShort(b.createdAt)}</div>
                          </td>
                          <td>
                            <div className="cell-main nowrap">{b.clientName}</div>
                            <div className="cell-sub num" style={{textAlign:"start"}}>{b.clientPhone}</div>
                          </td>
                          <td>
                            <div className="nowrap" style={{color:B.text3}}>{pkg?.name??"—"}</div>
                            <div className="cell-sub nowrap" style={stale?{color:"var(--k-danger)",fontWeight:600}:undefined}>
                              {rowTrip?fmtDateShort(rowTrip.departureDate):"بلا رحلة"}{stale&&" · مضت ولم يُغلق"}
                            </div>
                          </td>
                          <td style={{textAlign:"center",color:B.text3}}>{b.persons}</td>
                          <td className="nowrap cell-main">{sar(b.total)}</td>
                          <td className="nowrap" style={{color:B.text2,fontSize:13}}>
                            {b.staff||(b.source==="public"?"من التطبيق":"—")}
                          </td>
                          <td><StageBadge booking={b}/></td>
                          <td className="col-action" onClick={e=>e.stopPropagation()}>
                            <div className="row-actions">
                              {pay&&<IconButton size="sm" label="عرض الفاتورة" onClick={()=>setInvoiceView(pay)}><CreditCard size={15}/></IconButton>}
                              {tkt&&<IconButton size="sm" label="عرض التذكرة" onClick={()=>setTicketView(tkt)}><Ticket size={15}/></IconButton>}
                              <IconButton size="sm" label={`فتح الطلب ${b.id}`} onClick={()=>setDetailId(b.id)}><ChevronLeft size={16}/></IconButton>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden flex flex-col gap-2.5" style={{opacity:serverSearching?0.55:1}}>
              {activePg.rows.map(b=>{
                const rowTrip=trips.find(t=>t.id===b.tripId);
                const pkg=packages.find(p=>p.id===rowTrip?.packageId);
                const stale=isStale(b,rowTrip,today);
                const pay=payments.find(p=>p.bookingId===b.id);
                const tkt=tickets.find(t=>t.bookingId===b.id);
                return (
                  <div key={b.id} role="button" tabIndex={0} onClick={()=>setDetailId(b.id)}
                    onKeyDown={e=>{ if(e.key==="Enter"&&e.target===e.currentTarget) setDetailId(b.id); }}
                    className="ui-card ui-card--hover p-4" style={{cursor:"pointer"}}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-bold truncate" style={{color:B.black,fontSize:15}}>{b.clientName}</div>
                        <div className="text-xs mt-0.5" style={{color:B.muted}}>{b.id} · {fmtDateShort(b.createdAt)}</div>
                      </div>
                      <StageBadge booking={b}/>
                    </div>
                    <div className="text-sm mt-3" style={{color:B.text2}}>
                      {pkg?.name??"—"} · {b.persons} معتمر
                    </div>
                    <div className="text-xs mt-0.5" style={stale?{color:"var(--k-danger)",fontWeight:600}:{color:B.muted}}>
                      {rowTrip?`الرحلة ${fmtDateShort(rowTrip.departureDate)}`:"بلا رحلة"}{stale&&" · مضت ولم يُغلق"}
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3" style={{borderTop:`1px solid ${B.border}`}}>
                      <div className="font-bold" style={{color:B.black}}>{sar(b.total)}</div>
                      <div className="flex items-center gap-1" onClick={e=>e.stopPropagation()}>
                        {pay&&<IconButton size="sm" variant="outline" label="عرض الفاتورة" onClick={()=>setInvoiceView(pay)}><CreditCard size={15}/></IconButton>}
                        {tkt&&<IconButton size="sm" variant="outline" label="عرض التذكرة" onClick={()=>setTicketView(tkt)}><Ticket size={15}/></IconButton>}
                        <ChevronLeft size={18} style={{color:B.muted,marginInlineStart:4}} aria-hidden/>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            </>}
            </EntityGate>
            <Pager p={activePg} unit="طلب"/>
          </main>
        </>
      )}
      <AnimatePresence>
        {showNew&&<NewOrderModal packages={packages} trips={trips} transports={transports} onCreate={createInternalOrder} onClose={()=>setShowNew(false)}/>}
        {invoiceView&&<InvoiceModal pay={invoiceView} onClose={()=>setInvoiceView(null)}/>}
        {ticketView&&<TicketCard ticket={ticketView} onClose={()=>setTicketView(null)}/>}
      </AnimatePresence>
      <Modal open={bulkOpen} onClose={()=>{ if(!bulkBusy) setBulkOpen(false); }} width={460}
        title={`إغلاق ${stats.stale} طلباً متأخّراً`}
        sub="كلها انتهت رحلتها وما زالت مفتوحة. تُغلق «ملغاة» بسببٍ واحد يُكتب في سجلّ كل طلب باسمك، وتعود مقاعدها للبيع. لا شيء يُحذف."
        icon={<ModalIcon tone="warn"><AlertTriangle size={19}/></ModalIcon>}
        footer={<>
          <Button variant="danger" loading={bulkBusy} disabled={!bulkReason.trim()} onClick={runBulkClose}>
            {bulkBusy?"جارٍ الإغلاق…":`إغلاق ${stats.stale} طلباً`}
          </Button>
          <Button variant="secondary" disabled={bulkBusy} onClick={()=>setBulkOpen(false)}>تراجع</Button>
        </>}>
        <label className="ui-label" htmlFor="bulk-close-reason">سبب الإغلاق<span className="ui-req">*</span></label>
        <Textarea id="bulk-close-reason" value={bulkReason} onChange={e=>setBulkReason(e.target.value)} rows={2} style={{resize:"none"}}/>
      </Modal>
    </div>
  );
}
