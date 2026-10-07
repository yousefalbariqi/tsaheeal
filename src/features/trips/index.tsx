import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { sar, sarNumber, SAR } from "@/lib/money";
import { motion, AnimatePresence } from "motion/react";
import { Plus, Minus, X, Plane, MapPin, AlertTriangle, CalendarDays, ChevronDown, ChevronRight, ChevronLeft, ArrowRight, Settings2, Pencil, Bus, MessageCircle, Copy, Check, ClipboardList, Repeat, RotateCcw, SearchX, UserRound, Ban, CirclePause, CirclePlay, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { B, TONE, DUR, EASE } from "@/lib/theme";
import { fmtDate, fmtDateShort, fmtDayDate, fmtTime, fmtWeekday } from "@/lib/dates";
import { statusLabel, statusTone } from "@/lib/status";
import { useDebounced } from "@/lib/useDebounced";
import { useRole } from "@/lib/useRole";
import { EntityGate, EmptyState } from "@/components/States";
import type { Hotel, Transport, Pkg, Trip, Branch, Booking, TripDepartureStop } from "@/types";
import { uid, parseYMD, ymd, newId, openWhatsApp, copyText, todayYMD } from "@/lib/utils";
import {
  tripState, tripBoardState, occupancy, nextTrip, calendarAnchor,
  seatsOf, shortDate, untilLabel, tripDeparture,
  splitByHorizon, groupByWeek, AR_MONTHS, LOW_SEATS_RATIO,
  type TripBoardState, type TripGroup, type Horizon,
  defaultReturnDate, returnBeforeDeparture, findVehicleConflict, busesInUse,
  cancelImpact, tripCancelWhatsApp, type CancelImpact,
} from "@/lib/trip";
import { busCountOf, busesLabel, highestUsedBus, seatsPerBus } from "@/lib/buses";
import { supportsTripBusCount } from "@/data/repository";
import { DEFAULT_TRIP_SETTINGS } from "@/data/trips";
import { StatusBadge } from "@/components/StatusBadge";
import { StatCard } from "@/components/StatCard";
import { PageHeader } from "@/components/PageHeader";
import { AppSelect } from "@/components/AppSelect";
import { SearchSelect, type SearchOption } from "@/components/SearchSelect";
import { TabStrip, TabPanel, type TabDef } from "@/components/Tabs";
import { Button, IconButton, Badge, Note, Segmented, Modal, ModalIcon, Textarea, confirmDialog } from "@/components/ui";
import { useStore, flushSync, clearSyncError } from "@/store/useStore";
import { ScheduleCalendar, type WeeklyMark } from "./ScheduleCalendar";
import { Field } from "@/components/Field";
import { isOperational } from "@/features/transport/readiness";
import { useUnsavedGuard } from "@/lib/useUnsavedGuard";

const todayStart = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const tripLabel = (t:Trip, pkgName:string) => pkgName && pkgName!=="—" ? pkgName : (t.departurePoint || t.id);
const addDays=(s:string,n:number)=>{ const p=parseYMD(s); if(!p) return ""; const d=new Date(p.y,p.m,p.d+n); return ymd(d.getFullYear(),d.getMonth(),d.getDate()); };
const daysBetween=(a:string,b:string)=>{ const x=parseYMD(a),y=parseYMD(b); return x&&y?Math.round((new Date(y.y,y.m,y.d).getTime()-new Date(x.y,x.m,x.d).getTime())/86_400_000):0; };
/** «رحلة» · «رحلتان» · «٣ رحلات» — العدد كما يُقال لا كما يُحسب. */
const tripsCount=(n:number)=>n===1?"رحلة واحدة":n===2?"رحلتان":n<=10?`${n} رحلات`:`${n} رحلة`;

/* ── الإطلاق المتعدد ──
   تكرارٌ لعملية الإنشاء لا مفهومٌ جديد للرحلة: يختار الموظف أول تاريخ،
   فتُقترح الأسابيع التالية في اليوم نفسه، ويستبعد منها ما لا يريد. وعند
   الإطلاق تُنشأ كل واحدةٍ رحلةً مستقلة تماماً — رقمها ومقاعدها وحجوزاتها
   وحالتها — ولا يبقى بينها رابط. فلا «سلسلة» تُعدَّل أو تُلغى جملة، ولا
   منطق في النظام يحتاج أن يعرف أنها أُطلقت معاً.
   والمدى محدود عمداً بأربعة أسابيع (شهرٌ تقريباً): تكرارٌ مفتوح يُطلق
   رحلاتٍ لم يُقرَّر لها باصٌ ولا طلبٌ بعد. */
const WEEKLY_COUNT=4;

/* ════════ نموذج الرحلة — إطلاقٌ أو تعديلٌ محدود ════════

   نموذجٌ واحد بوضعَين لا نموذجان: ما يُملأ عند الإطلاق هو ما يُعدَّل بعده،
   والفرق نطاقُ التعديل لا شكلُ الحقول.

   ── ما يُشتقّ ولا يُكتب ──
   السعر والفندق والإعدادات من الباقة؛ وسعة الباص من نوعه المختار. كانت
   اللوحة والرقم يُكتبان يدوياً في كل رحلة، فتُطلق رحلةٌ على حافلةٍ «أ ب ج
   ١٢٣٤» لا وجود لها في سجل النقل. الاختيار من السجل يربط الرحلة بنوعٍ
   حقيقي فيصير التعارض قابلاً للفحص — هنا وفي القاعدة.

   ── نوع الباص وعدده ──
   الموظف لا يختار مركبةً بعينها من ست مركبات: يختار النوع («باص تساهيل
   2027 · 49 مقعداً») وعدد باصاته لهذه الرحلة، فتُنشأ «باص ١، باص ٢،
   باص ٣» تلقائياً وسعة الرحلة مجموعها. والعدد رقمٌ داخل الرحلة لا حالةٌ
   على المركبة (lib/buses): لا شيء يُصفَّر حين تنتهي. وربط «باص ١» بلوحةٍ
   بعينها مرحلةٌ ثانية إن احتيجت.

   ── وضع التعديل ──
   يُتاح: نوع الباص وعدد الباصات (بفحص التعارض)، وقت الانطلاق، تاريخ ووقت
   العودة، نقطة الانطلاق. ولا تُتاح: الباقة والسعر وسعة الباص الواحد وتاريخ
   الذهاب — هذه وعودٌ بيعت على أساسها مقاعد. وعدد الباصات وحده يتغيّر:
   باصٌ رابع حين يمتلئ الثالث لا يمسّ مقعداً بيع، وإنقاصه لا ينزل تحت
   آخر باصٍ فيه مقعدٌ مخصَّص.

   ── والسائقون ليسوا هنا ──
   السائق بالتعاقد ويُعرف قبل الانطلاق لا عند فتح الحجز، فبابه تبويب
   «السائقون» في الكشف لا هذا النموذج. والتعديل يحفظ ما سُجّل هناك كما
   هو: `common` لا يحمل السائقين، فيبقى ما في الرحلة. */
type TripForm = Pick<Trip,"packageId"|"branchId"|"transportId"|"busPlate"|"busCode"|"departureDate"|"returnDate"|"departureTime"|"departurePoint"|"departureMapUrl">
  & { departureCity:string; busCount:number }
  & { returnTime:string; departureAddress:string; departureStops:TripDepartureStop[] };

const emptyForm = ():TripForm => ({
  packageId:"",branchId:"",transportId:"",busPlate:"",busCode:"",busCount:1,
  departureDate:"",returnDate:"",departureTime:"22:00",returnTime:"",
  departureCity:"",departurePoint:"",departureMapUrl:"",departureAddress:"",departureStops:[{id:uid(),branchId:"",city:"",point:"",time:""}],
});

/** اللوحة والرقم التعريفي من سجل المركبة. الطيران بلا لوحة فرقمُ رحلته،
    وبلا رقمٍ تسلسلي فمعرّف السجل — حقلان إلزاميان لا يُتركان فارغَين. */
const vehicleIds = (v:Transport) => ({
  busPlate: (v.plate||"").trim() || (v.flightNo||"").trim() || "",
  busCode:  (v.serialNo||"").trim() || v.id,
});

const vehicleOption = (v:Transport):SearchOption => ({
  value:v.id, label:v.name||v.id,
  sub:v.mode==="flight"
    ? `رحلة ${v.flightNo||"—"}`
    : `${Math.max(1,v.fleetCount??1)} ${Math.max(1,v.fleetCount??1)===1?"باص":"باصات"} · ${v.seats} مقعد لكل باص`,
  keywords:[v.plate,v.serialNo,v.flightNo,v.model].filter(Boolean).join(" "),
});

const legacyStop = (trip: Pick<Trip,"id"|"branchId"|"departureCity"|"departurePoint"|"departureMapUrl"|"departureAddress"|"departureTime">): TripDepartureStop => ({
  id: `stop-${trip.id}`, branchId: trip.branchId || "", city: trip.departureCity || "", point: trip.departurePoint || "",
  time: trip.departureTime || "", mapUrl: trip.departureMapUrl || undefined, address: trip.departureAddress || undefined,
});

/* فلتر التاريخ نافذة حقيقية لا Popover على حافة الشاشة: اختيار اليوم
   يبقى في موضعه البصري مهما كان عرض الجدول أو اتجاه الصفحة.

   وشبكته شبكة تقويم اللوحة نفسها (MonthGrid) لا تقويم المكتبة: كان يكتب
   الأيام بأرقامٍ هندية في لوحةٍ أرقامها لاتينية، وأسماء الأيام الكاملة
   تتراكب في أعمدته. والشبكة المشتركة تزيد ما لا تعرفه المكتبة: نقطةٌ على
   كل يومٍ فيه رحلات، فلا يُختار يومٌ يُفرغ الجدول على التخمين. */
function TripDateFilterModal({ value, trips, horizon, onChoose, onClear, onClose }: {
  value: string; trips: Trip[]; horizon: Horizon; onChoose: (v: string) => void; onClear: () => void; onClose: () => void;
}) {
  const [cur,setCur]=useState(()=>{
    const p=parseYMD(value);
    if(p) return {y:p.y,m:p.m};
    if(horizon==="upcoming") return calendarAnchor(trips);
    const last=parseYMD(trips.map(t=>t.departureDate).filter(Boolean).sort().pop()??"")??parseYMD(todayYMD())!;
    return {y:last.y,m:last.m};
  });
  const depMap=new Map<string,Trip[]>();
  trips.forEach(t=>{ if(parseYMD(t.departureDate)) depMap.set(t.departureDate,[...(depMap.get(t.departureDate)??[]),t]); });
  const monthCount=[...depMap.entries()].filter(([ds])=>{const p=parseYMD(ds);return p&&p.y===cur.y&&p.m===cur.m;}).reduce((a,[,l])=>a+l.length,0);
  /* لا مسوّدة هنا تُفقد: الاختيار يُطبَّق ويُغلق بضغطة اليوم نفسها، فتُغلق
     النافذة بـEscape والنقر خارجها كأيّ قائمة. */
  return (
    <Modal open onClose={onClose} dismissible width={400} title="تصفية حسب التاريخ" sub="اختر يوم انطلاق واحداً"
      footer={<>
        <Button variant="secondary" onClick={()=>{onClear();onClose();}}>كل التواريخ</Button>
        <Button variant="ghost" onClick={onClose}>إغلاق</Button>
      </>}>
      <MonthNav y={cur.y} m={cur.m} count={monthCount} onShift={d=>setCur(c=>shiftMonth(c,d))}/>
      <MonthGrid y={cur.y} m={cur.m} depMap={depMap} spanSet={NO_SPAN} selected={value||null}
        onPick={ds=>{ onChoose(ds); onClose(); }}/>
      <div className="mt-3" style={{fontSize:12,color:B.muted}}>النقطة تحت اليوم رحلةٌ تنطلق فيه، بلون حالتها.</div>
    </Modal>
  );
}
const NO_SPAN:Set<string>=new Set();

type FormTab="basics"|"stops"|"schedule";
const FORM_TABS:readonly TabDef<FormTab>[]=[{id:"basics",label:"الأساسيات"},{id:"stops",label:"محطات الانطلاق"},{id:"schedule",label:"موعد الرحلة"}];

function TripFormModal({
  mode,initial,packages,branches,prefillPkgId,prefillDate,baseTrip,onSave,onClose
}:{
  mode:"launch"|"edit";initial?:Trip;packages:Pkg[];branches:Branch[];
  prefillPkgId?:string;
  /** يومٌ اختير من التقويم — يُملأ تاريخ الذهاب وحده. */
  prefillDate?:string;
  /** رحلةٌ قائمة تُتّخذ قاعدةً لرحلةٍ إضافية في اليوم نفسه. */
  baseTrip?:Trip;
  /** رحلةٌ واحدة عند التعديل، ورحلةٌ أو أكثر عند الإطلاق. `false` يُبقي
      النموذج مفتوحاً بما كُتب فيه — لم تُحفظ أي رحلة. */
  onSave:(trips:Trip[])=>Promise<boolean>|void;onClose:()=>void;
}) {
  /* المركبات والرحلات من المخزن مباشرةً: فحص التعارض يقرأ كل الرحلات
     القائمة لا ما مرّرته الصفحة لبطاقةٍ واحدة. */
  const transports=useStore(s=>s.transports);
  const liveTrips=useStore(s=>s.trips);
  const bookings=useStore(s=>s.bookings);
  /* قاعدةٌ بلا عمود الباصات تحفظ الرحلة باصاً واحداً بسعة الجميع — فلا
     يُتاح أكثر من باص قبل الترحيل (repository › supportsTripBusCount). */
  const [busSupport,setBusSupport]=useState(true);
  useEffect(()=>{ let on=true; void supportsTripBusCount().then(v=>{ if(on) setBusSupport(v); }); return ()=>{ on=false; }; },[]);
  /* أثناء الإطلاق تُكتب رحلات الدفعة في المخزن واحدةً واحدة، فلو قرأ
     الفحصُ المخزنَ الحيّ لعلّم كلَّ تاريخٍ «مشغولاً» برحلته هو. */
  const [frozenTrips,setFrozenTrips]=useState<Trip[]|null>(null);
  const trips=frozenTrips??liveTrips;
  const isEdit=mode==="edit"&&!!initial;
  const activeBranches=branches.filter(b=>b.isActive);

  /** المركبات الصالحة لهذه الباقة: نشطةٌ ومن وسيلة مواصلة الباقة نفسها
      (حافلة/طيران). باقةٌ بلا مواصلة تقبل أي مركبةٍ نشطة. */
  function vehiclesFor(pkgId:string):Transport[]{
    const pkg=packages.find(p=>p.id===pkgId);
    const pkgMode=transports.find(t=>t.id===pkg?.transportId)?.mode;
    const list=transports.filter(t=>isOperational(t.status)&&(!pkgMode||t.mode===pkgMode));
    /* عند التعديل تبقى مركبة الرحلة في القائمة ولو أُوقفت بعد الإطلاق:
       حجبُها يُظهر الحقل فارغاً ويُوهم أن الرحلة بلا مركبة. */
    if(initial?.transportId&&!list.some(v=>v.id===initial.transportId)){
      const cur=transports.find(t=>t.id===initial.transportId); if(cur) list.push(cur);
    }
    return list.sort((a,b)=>(a.name||"").localeCompare(b.name||"","ar"));
  }

  const [form,setForm]=useState<TripForm>(()=>{
    if(isEdit&&initial) return {
      packageId:initial.packageId,branchId:initial.branchId,transportId:initial.transportId,
      busPlate:initial.busPlate,busCode:initial.busCode,busCount:busCountOf(initial),
      departureDate:initial.departureDate,returnDate:initial.returnDate??"",departureTime:initial.departureTime,
      returnTime:initial.returnTime??"",departureCity:initial.departureCity??branches.find(b=>b.id===initial.branchId)?.city??"",departurePoint:initial.departurePoint,departureMapUrl:initial.departureMapUrl,
      departureAddress:initial.departureAddress??"",
      departureStops:initial.departureStops?.length ? initial.departureStops.map(s=>({...s})) : [legacyStop(initial)],
    };
    const f=emptyForm();
    /* رحلةٌ إضافية: كل ما يجمعها بالأولى منسوخٌ — الباقة واليوم والمدينة
       ونقطة الانطلاق والوقت. ونوع الباص وحده يُترك فارغاً عمداً: باصات
       النوع قد تكون كلها في الرحلة الأولى، فنسخُه يُنتج تعارضاً يمنع
       الحفظ. اختيار النوع وعدده هو القرار الوحيد الباقي. */
    if(baseTrip){
      Object.assign(f,{
        packageId:baseTrip.packageId, branchId:baseTrip.branchId,
        departureCity:baseTrip.departureCity??branches.find(b=>b.id===baseTrip.branchId)?.city??"",
        departurePoint:baseTrip.departurePoint, departureMapUrl:baseTrip.departureMapUrl,
        departureAddress:baseTrip.departureAddress??"",
        departureStops:baseTrip.departureStops?.length ? baseTrip.departureStops.map(s=>({...s,id:uid()})) : [legacyStop(baseTrip)],
        departureDate:baseTrip.departureDate, returnDate:baseTrip.returnDate??"",
        departureTime:baseTrip.departureTime, returnTime:baseTrip.returnTime??"",
      });
      return f;
    }
    f.packageId=prefillPkgId??"";
    if(prefillDate) f.departureDate=prefillDate;
    /* الباقة المُمرَّرة تجرّ مركبتها إن كانت نشطة: أقلّ ضغطة، وهو ما كان
       يحدث ضمنياً حين كانت السعة تُشتقّ من مواصلة الباقة. */
    const pkg=packages.find(p=>p.id===f.packageId);
    const v=pkg?vehiclesFor(pkg.id).find(x=>x.id===pkg.transportId):undefined;
    if(v) Object.assign(f,{transportId:v.id,...vehicleIds(v)});
    if(pkg&&f.departureDate) f.returnDate=defaultReturnDate(f.departureDate,pkg.days);
    return f;
  });
  /* تاريخ العودة يُقترح من أيام الباقة ما لم يمسّه الموظف؛ وما مسّه لا
     يُدهَس بتغيير الباقة أو الذهاب بعده. */
  const [returnTouched,setReturnTouched]=useState(isEdit||!!baseTrip);
  /* لا نستخدم confirm المتصفح عند ضغط إلغاء: السؤال حوار التأكيد المشترك
     (confirmDialog) بصياغة الرحلة — كان نافذةً مبنيّة هنا تكرّره حرفاً.
     يبقى beforeunload في useUnsavedGuard لحماية التحديث أو إغلاق
     التبويب، حيث لا يسمح المتصفح بحوار مخصص. */
  const [initialForm] = useState(() => JSON.stringify(form));
  const dirty = initialForm !== JSON.stringify(form);
  useUnsavedGuard(dirty);
  const requestClose=async()=>{
    if(!dirty){ onClose(); return; }
    const discard=await confirmDialog({
      title:"إلغاء التعديلات؟",
      message:"ستُحذف كل التعديلات غير المحفوظة على بيانات الرحلة. لا يمكن التراجع عن هذا الإجراء.",
      confirmLabel:"إلغاء التعديلات", cancelLabel:"متابعة التعديل", tone:"danger",
    });
    if(discard) onClose();
  };
  const [busy,setBusy]=useState(false);
  const [launchTab,setLaunchTab]=useState<FormTab>("basics");
  const [scheduleTarget,setScheduleTarget]=useState<"departure"|"return">("departure");
  const [launchMode,setLaunchMode]=useState<"single"|"weekly">("single");
  /* التواريخ المستبعدة من الدفعة — تبقى ظاهرةً بزرّ إرجاع لا تختفي. */
  const [skipped,setSkipped]=useState<string[]>([]);
  const set=<K extends keyof TripForm>(k:K,v:TripForm[K])=>setForm(f=>({...f,[k]:v}));
  const req=<span className="ui-req">*</span>;

  const selPkg=packages.find(p=>p.id===form.packageId);
  const pkgTransport=transports.find(t=>t.id===selPkg?.transportId);
  const vehicles=vehiclesFor(form.packageId);
  /* لا مركبة نشطة مطابقة: إدخالٌ يدوي معلَنٌ لا حجبٌ للإطلاق. الرحلة
     عندئذٍ تُربط بمواصلة الباقة كما كان قبل هذه الموجة. */
  const manual=vehicles.length===0;
  const selVehicle=transports.find(t=>t.id===form.transportId);
  const effectiveTransportId=manual?(isEdit?initial!.transportId:(selPkg?.transportId??"")):form.transportId;
  /* سعة الباص الواحد: عند الإطلاق من النوع المختار (أو من مواصلة الباقة
     يدوياً)؛ وعند التعديل تبقى كما أُطلقت — تغييرها يمسّ مقاعداً بيعت.
     وسعة الرحلة = سعة الباص × عدد الباصات. */
  const perBus=isEdit?seatsPerBus(initial!):(manual?(pkgTransport?.seats??0):(selVehicle?.seats??0));
  const fleetCount=Math.max(1,selVehicle?.fleetCount??1);
  /* العدد للحافلات وحدها: الطيران رحلةٌ واحدة، والإدخال اليدوي بلا نوعٍ
     يُعرف عدد باصاته. */
  const flightMode=(selVehicle?.mode??pkgTransport?.mode)==="flight";
  const multiAllowed=!manual&&!!selVehicle&&selVehicle.mode!=="flight";
  const busCount=multiAllowed?Math.max(1,form.busCount):1;
  const seats=perBus*busCount;
  /* لا تنزل باصات الرحلة القائمة تحت آخر باصٍ فيه مقعدٌ مخصَّص، ولا
     تنزل سعتها تحت المحجوز. */
  const minBuses=isEdit&&perBus>0?Math.max(1,
    highestUsedBus(initial!,bookings.filter(b=>b.tripId===initial!.id&&b.status!=="cancelled"&&b.status!=="rejected").flatMap(b=>[...b.seats,...(b.privacySeats??[])])),
    Math.ceil((initial!.bookedSeats||0)/perBus)):1;
  const maxBuses=busSupport?fleetCount:Math.max(1,isEdit?busCountOf(initial!):1);
  /* الباصات المشغولة من هذا النوع في تواريخ الرحلة — لتقول اللوحة كم
     بقي قبل أن يرفض الحفظ. */
  const inUse=busesInUse(trips,{transportId:effectiveTransportId,departureDate:form.departureDate,returnDate:form.returnDate},initial?.id);
  const weekly=!isEdit&&launchMode==="weekly";
  /* كل رحلةٍ في الدفعة تعود بعد المدة نفسها التي ضُبطت للأولى. */
  const returnOffset=Math.max(0,daysBetween(form.departureDate,form.returnDate));
  const occurrences=weekly&&form.departureDate?Array.from({length:WEEKLY_COUNT},(_,k)=>addDays(form.departureDate,7*k)):[];
  /* التعارض لكل تاريخٍ في الدفعة على حدة، والمختار قبله يُحسب عليه:
     باقةٌ مدتها أسبوعٌ أو أكثر تجعل رحلات الدفعة نفسها تتداخل على
     الحافلة ذاتها، والقاعدة سترفض الثانية ولو لم تتعارض مع القائم. */
  const occConflicts=new Map<string,Trip>();
  if(weekly){
    let pool=trips;
    for(const d of occurrences){
      if(skipped.includes(d)) continue;
      const probe={transportId:effectiveTransportId,departureDate:d,returnDate:addDays(d,returnOffset),busCount};
      const c=findVehicleConflict(pool,probe,undefined,fleetCount);
      if(c) occConflicts.set(d,c);
      else pool=[...pool,{...probe,id:`batch:${d}`,status:"open"} as Trip];
    }
  }
  const plan=weekly?occurrences.filter(d=>!skipped.includes(d)):[form.departureDate];
  const conflict=weekly?undefined:findVehicleConflict(trips,{transportId:effectiveTransportId,departureDate:form.departureDate,returnDate:form.returnDate,busCount},initial?.id,fleetCount);
  const conflictName=conflict?(packages.find(p=>p.id===conflict.packageId)?.name??conflict.id):"";
  const conflictLabel=(c:Trip)=>c.id.startsWith("batch:")?`رحلة ${shortDate(c.departureDate)} من هذه الدفعة`:(packages.find(p=>p.id===c.packageId)?.name??c.id);
  const toggleSkip=(d:string)=>setSkipped(s=>s.includes(d)?s.filter(x=>x!==d):[...s,d]);
  const returnInvalid=returnBeforeDeparture(form);
  const tooSmall=isEdit&&!!selVehicle&&selVehicle.seats*busCount<(initial!.bookedSeats||0);
  const busCountOk=busCount>=minBuses&&busCount<=Math.max(maxBuses,1);

  function pickPackage(id:string){
    const pkg=packages.find(p=>p.id===id);
    const list=vehiclesFor(id);
    setForm(f=>{
      const n={...f,packageId:id};
      /* المركبة المختارة قد لا تناسب وسيلة الباقة الجديدة (حافلة ← طيران). */
      if(n.transportId&&!list.some(v=>v.id===n.transportId)){ n.transportId="";n.busPlate="";n.busCode="";n.busCount=1; }
      if(!n.transportId&&pkg){ const v=list.find(x=>x.id===pkg.transportId); if(v) Object.assign(n,{transportId:v.id,...vehicleIds(v)}); }
      if(!returnTouched&&pkg&&n.departureDate) n.returnDate=defaultReturnDate(n.departureDate,pkg.days);
      return n;
    });
  }
  function pickVehicle(id:string){
    const v=transports.find(t=>t.id===id); if(!v) return;
    /* نوعٌ آخر قد يملك باصاتٍ أقل: يُقصّ العدد إلى ما يملكه. */
    setForm(f=>({...f,transportId:v.id,...vehicleIds(v),busCount:v.mode==="flight"?1:Math.min(Math.max(1,f.busCount),Math.max(1,v.fleetCount??1))}));
  }
  function setDeparture(v:string){
    setSkipped([]);
    setForm(f=>({...f,departureDate:v,returnDate:(!returnTouched&&selPkg&&v)?defaultReturnDate(v,selPkg.days):f.returnDate}));
  }
  function setReturn(v:string){ setReturnTouched(true); set("returnDate",v); }
  /* كل محطة لقطة من الفرع وقت إطلاق الرحلة؛ تعديل الفرع لاحقاً لا يبدل
     ما بيع للعميل. أول محطة هي الانطلاق الرسمي المتوافق مع السجلات القديمة. */
  function pickStop(stopId:string, branchId:string){
    const branch=activeBranches.find(b=>b.id===branchId);
    if(!branch) return;
    setForm(f=>({...f,departureStops:f.departureStops.map(s=>s.id===stopId?{
      ...s,branchId:branch.id,city:branch.city,point:branch.name,mapUrl:branch.gmapUrl||undefined,address:branch.address||undefined,
    }:s)}));
  }
  const addStop=()=>set("departureStops",[...form.departureStops,{id:uid(),branchId:"",city:"",point:"",time:""}]);
  const removeStop=(id:string)=>set("departureStops",form.departureStops.filter(s=>s.id!==id));
  const setStopTime=(id:string,time:string)=>set("departureStops",form.departureStops.map(s=>s.id===id?{...s,time}:s));

  const depOk = form.departureStops.length>0 && form.departureStops.every(s=>!!s.branchId&&!!s.city&&!!s.point&&!!s.time);
  /* اللوحة والرقم التعريفي للإدخال اليدوي وحده: الرحلة على نوعٍ من السجل
     لا تُربط بلوحة باصٍ بعينه (مرحلةٌ لاحقة). */
  const baseOk = (manual ? (!!form.busPlate.trim() && !!form.busCode.trim()) : !!form.transportId)
    && depOk && !!form.departureDate && !!form.returnDate && !!form.returnTime;
  /* سعة صفر تُطلق رحلة لا تقبل حجزاً — تُمنع عند المصدر لا عند أول معتمر. */
  const canSave = (isEdit ? baseOk : (baseOk && !!form.packageId && seats>0)) && !conflict && !returnInvalid && !tooSmall
    && busCountOk && plan.length>0 && occConflicts.size===0;

  async function handleSave(){
    if(!canSave||busy) return;
    setBusy(true);
    const stops=form.departureStops;
    const first=stops[0];
    const common={
      transportId:effectiveTransportId,busPlate:form.busPlate.trim(),busCode:form.busCode.trim(),
      departureTime:first.time,returnDate:form.returnDate,returnTime:form.returnTime,
      departureCity:first.city, branchId:first.branchId,
      departurePoint:first.point,departureMapUrl:first.mapUrl||"",
      departureAddress:first.address||undefined, departureStops:stops,
    };
    if(isEdit&&initial){ onSave([{...initial,...common,...(multiAllowed?{busCount,seats}:{})}]); return; }
    /* كل تاريخٍ رحلةٌ كاملة بنسختها من المحطات والإعدادات — لا مرجعٌ
       مشترك يُعدَّل في واحدةٍ فيتغيّر في أخواتها. */
    const list:Trip[]=plan.map(d=>({...common,
      returnDate:weekly?addDays(d,returnOffset):form.returnDate,
      departureStops:stops.map(s=>({...s})),
      drivers:[],id:newId("TRP"),packageId:form.packageId,hotelId:selPkg?.hotelId??"",
      departureDate:d,seats,busCount,price:selPkg?.marketPrice??0,status:"open",
      settings:selPkg?.settings?{...selPkg.settings}:{...DEFAULT_TRIP_SETTINGS},
      bookedSeats:0,waitingSeats:0}));
    setFrozenTrips(liveTrips);
    const ok=await onSave(list);
    if(ok===false){ setFrozenTrips(null); setBusy(false); }
  }

  const title=isEdit?`تعديل الرحلة — ${initial!.id}`:baseTrip?"إطلاق رحلة إضافية":"إطلاق رحلة جديدة";
  const saveLabel=busy?(isEdit?"جارٍ الحفظ…":"جارٍ الإطلاق…"):(isEdit?"حفظ التعديلات":weekly&&plan.length===2?"إطلاق الرحلتين":weekly&&plan.length>2?`إطلاق ${tripsCount(plan.length)}`:"إطلاق الرحلة");
  const warnIcon=<AlertTriangle size={15}/>;
  /* بطاقة اختيار «أيّ التاريخَين يُضبط الآن» — المحدَّدة بإطارٍ أسود لا
     بحشوةٍ ذهبية: هي موضعٌ لا فعل. */
  const targetCard=(on:boolean):React.CSSProperties=>({
    background:on?B.surface:B.fill, border:"none", borderRadius:12, padding:"10px 14px",
    boxShadow:on?`inset 0 0 0 1.5px ${B.black}`:`inset 0 0 0 1px ${B.border}`, fontFamily:"inherit",
  });

  return (
    <Modal open onClose={requestClose} width={560} title={title}
      sub={isEdit
        ? "يُعدَّل هنا: نوع الباص وعدد الباصات، وقت الانطلاق، العودة، نقطة الانطلاق. الباقة والسعر وسعة الباص وتاريخ الذهاب ثابتة، والسائقون من الكشف."
        : baseTrip
          ? <>بُنيت على الرحلة <b style={{color:B.text3}}>{baseTrip.id}</b> — الباقة والتاريخ والوقت ونقطة الانطلاق منسوخة. اختر نوع الباص وعدده: المتاح يُحسب بعد باصات الرحلات المتداخلة.</>
          : undefined}
      toolbar={<div className="px-2 sm:px-3 flex-shrink-0">
        <TabStrip tone="onLight" idPrefix="trip-form" tabs={FORM_TABS} active={launchTab} onChange={id=>setLaunchTab(id)}/>
      </div>}
      footer={<>
        <Button variant="primary" loading={busy} disabled={!canSave} onClick={handleSave}
          icon={isEdit?<Check size={16}/>:<Plane size={16}/>}>{saveLabel}</Button>
        <Button variant="secondary" onClick={requestClose}>إلغاء</Button>
      </>}>
      <div className="flex flex-col gap-4">
        <TabPanel id="basics" idPrefix="trip-form" active={launchTab==="basics"}>
          {/* 1) الباقة */}
          <div>
            <Field label={<>الباقة {req}</>}
              hint={form.packageId&&!isEdit?`السعر (${sar(selPkg?.marketPrice??0)}) والفندق والإعدادات من الباقة · ${selPkg?.days??"—"} أيام.`:undefined}>
              <AppSelect value={form.packageId} placeholder="اختر الباقة" onChange={pickPackage} disabled={isEdit}
                options={packages.map(p=>({value:p.id,label:p.name}))}/>
            </Field>
          </div>
          {/* 2) نوع الباص وعدده */}
          <div>
            {manual
              ? <>
                  <div className="ui-label">{flightMode?"المركبة":"نوع الباص"} {req}</div>
                  <Note tone="warn" icon={warnIcon}>
                    <b>لا مركبات نشطة{pkgTransport?` من نوع «${pkgTransport.mode==="flight"?"طيران":"حافلة"}»`:""} في سجل النقل — إدخالٌ يدوي مؤقّت.</b>
                    <span className="block">فعِّل مركبةً من صفحة النقل ليُربط بها ويُفحص تعارضها.</span>
                  </Note>
                </>
              : <Field label={<>{flightMode?"المركبة":"نوع الباص"} {req}</>}>
                  <SearchSelect value={form.transportId} onChange={pickVehicle} placeholder={flightMode?"اختر مركبة نشطة":"اختر نوع باص نشط"}
                    searchPlaceholder="ابحث بالاسم أو الموديل…" emptyText="لا نوع مطابق"
                    options={vehicles.map(vehicleOption)}/>
                </Field>}
            {manual&&(
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <div><Field label={<>رقم لوحة الباص {req}</>}>
                       <input className="ui-input" value={form.busPlate} placeholder="أ ب ج 1234" onChange={e=>set("busPlate",e.target.value)}/>
                     </Field></div>
                <div><Field label={<>الرقم التعريفي للباص {req}</>}>
                       <input className="ui-input" style={{direction:"ltr",textAlign:"right"}} value={form.busCode} placeholder="1" onChange={e=>set("busCode",e.target.value)}/>
                     </Field></div>
              </div>)}
            {multiAllowed&&(
              <div className="mt-3" style={{background:B.fill,border:`1px solid ${B.border}`,borderRadius:14,padding:16}}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="ui-label" style={{marginBottom:2}}>عدد الباصات لهذه الرحلة {req}</div>
                    <div style={{fontSize:12,color:B.muted,lineHeight:1.5}}>
                      {busesLabel(fleetCount)} من هذا النوع
                      {form.departureDate&&<> · المتاح في تواريخ الرحلة <b style={{color:B.black}}>{Math.max(0,fleetCount-inUse.used)}</b></>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5" role="group" aria-label="عدد الباصات">
                    <IconButton variant="outline" label="باص أقل" disabled={busCount<=minBuses} onClick={()=>set("busCount",busCount-1)}><Minus size={16}/></IconButton>
                    <span className="text-center" aria-live="polite" style={{width:40,fontSize:20,fontWeight:700,color:B.black}}>{busCount}</span>
                    <IconButton variant="outline" label="باص إضافي" disabled={busCount>=maxBuses} onClick={()=>set("busCount",busCount+1)}><Plus size={16}/></IconButton>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {Array.from({length:busCount},(_,i)=><span key={i} className="inline-flex items-center gap-1.5"
                    style={{height:28,padding:"0 10px",borderRadius:8,background:B.surface,border:`1px solid ${B.border}`,fontSize:12,fontWeight:600,color:B.text3}}>
                    <Bus size={14} style={{color:B.muted}}/>باص {i+1}<span style={{color:B.muted,fontWeight:500}}>· {perBus} مقعد</span></span>)}
                </div>
                <p style={{fontSize:13,color:B.text2,lineHeight:1.7,margin:"10px 0 0"}}>
                  سعة الرحلة <b style={{color:B.black}}>{seats}</b> مقعداً{busCount>1?<> ({perBus} لكل باص)</>:null}. تُنشأ الباصات تلقائياً مع الرحلة، والحجز يبدأ في باص 1 وإذا امتلأ ينتقل إلى الذي بعده.
                </p>
                {isEdit&&minBuses>1&&<p className="ui-hint">لا ينزل العدد تحت {minBuses}: فيها مقاعد مخصَّصة أو محجوزة.</p>}
                {!busSupport&&<p className="ui-hint" style={{color:TONE.warn.fg,fontWeight:600}}>أكثر من باص غير متاح حتى تُحدَّث قاعدة البيانات — الرحلة الآن باصٌ واحد.</p>}
              </div>)}
            {!manual&&selVehicle&&flightMode&&(
              <div className="ui-hint flex items-center gap-2 flex-wrap">
                <Plane size={14}/>
                <span>رقم الرحلة <b style={{color:B.black}}>{form.busPlate||"—"}</b></span>·
                <span>السعة <b style={{color:B.black}}>{seats}</b> مقعد</span>
              </div>)}
            {isEdit&&selVehicle&&selVehicle.seats!==perBus&&!tooSmall&&(
              <Note tone="warn" icon={warnIcon} className="mt-3">
                سعة الباص في النوع الجديد {selVehicle.seats} وسعة الباص في الرحلة تبقى {perBus} — السعة لا تُعدَّل من هنا.
              </Note>)}
            {tooSmall&&(
              <Note tone="danger" icon={warnIcon} className="mt-3">
                النوع أصغر من المحجوز: {selVehicle!.seats*busCount} مقعداً لـ{initial!.bookedSeats} محجوز. اختر نوعاً يتّسع لهم أو زد الباصات.
              </Note>)}
            {!isEdit&&(manual?!!form.packageId:!!form.transportId)&&seats===0&&(
              <Note tone="danger" icon={warnIcon} className="mt-3">
                السعة صفر — {manual?(selPkg?.transportId?"مواصلة الباقة غير موجودة أو سعتها صفر":"الباقة غير مرتبطة بمواصلة"):"هذا النوع بلا مقاعد مسجَّلة"}. رحلةٌ بلا مقاعد لا تقبل حجزاً.
              </Note>)}
            {occConflicts.size>0&&(
              <Note tone="danger" icon={warnIcon} className="mt-3">
                لا يتّسع هذا النوع لـ{busesLabel(busCount)} في {occConflicts.size===1?"تاريخٍ":`${occConflicts.size} تواريخ`} من الدفعة — راجعها في «موعد الرحلة».
              </Note>)}
            {conflict&&(
              <Note tone="danger" icon={warnIcon} className="mt-3">
                هذا النوع فيه {busesLabel(fleetCount)}، و{inUse.used} منها في رحلاتٍ متداخلة، منها <b>{conflictName}</b> <bdi className="whitespace-nowrap">({conflict.id})</bdi>. المتاح {Math.max(0,fleetCount-inUse.used)} وطلبت {busCount} — قلّل العدد أو زد الباصات في سجل النوع أو غيّر التاريخ.
              </Note>)}
          </div>
        </TabPanel>
        <TabPanel id="stops" idPrefix="trip-form" active={launchTab==="stops"}>
          {/* محطات الصعود: رحلة ومقاعد واحدة، والباص يمر بالفروع بالترتيب. */}
          <div>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <div className="ui-label" style={{marginBottom:2}}>محطات الانطلاق {req}</div>
                <p style={{fontSize:12,color:B.muted,lineHeight:1.6,margin:0}}>أضف الفروع التي يمر عليها الباص، وحدد وقت الصعود في كل فرع. المحطة الأولى هي الانطلاق الرسمي.</p>
              </div>
              <Button size="sm" variant="secondary" icon={<Plus size={14}/>} onClick={addStop} className="flex-shrink-0">محطة</Button>
            </div>
            <div className="flex flex-col gap-2.5">
              {form.departureStops.map((stop,index)=><div key={stop.id}
                className="grid items-center gap-2 grid-cols-[28px_minmax(0,1fr)_32px] sm:grid-cols-[28px_minmax(0,1fr)_128px_32px]">
                {/* الأولى سوداء: هي التي تُكتب وقتاً ومدينةً على الرحلة. */}
                <span className="order-1 flex items-center justify-center" aria-hidden
                  style={{width:28,height:28,borderRadius:8,fontSize:13,fontWeight:700,background:index===0?B.ink:B.fill,color:index===0?B.onInk:B.text2,border:`1px solid ${index===0?B.ink:B.border}`}}>{index+1}</span>
                <div className="order-2 min-w-0">
                  <AppSelect value={stop.branchId} placeholder="اختر الفرع" ariaLabel={`فرع محطة ${index+1}`} onChange={id=>pickStop(stop.id,id)} options={activeBranches.map(b=>({value:b.id,label:`${b.city} · ${b.name}`}))}/>
                </div>
                <input type="time" aria-label={`وقت محطة ${index+1}`} className="ui-input order-4 col-start-2 sm:order-3 sm:col-start-auto" style={{direction:"ltr",textAlign:"right"}} value={stop.time} onChange={e=>setStopTime(stop.id,e.target.value)}/>
                <IconButton size="sm" variant="danger" label="حذف المحطة" className="order-3 sm:order-4" disabled={form.departureStops.length===1} onClick={()=>removeStop(stop.id)}><Trash2 size={15}/></IconButton>
              </div>)}
            </div>
          </div>
        </TabPanel>
        <TabPanel id="schedule" idPrefix="trip-form" active={launchTab==="schedule"}>
          {/* الموعد تبويب كامل وتقويم ثابت؛ لا نافذةٌ تقفز فوق النموذج. */}
          {!isEdit&&<Segmented label="نوع الإطلاق" value={launchMode} className="self-start"
            onChange={id=>{setLaunchMode(id);setSkipped([]);setScheduleTarget("departure");}}
            options={[
              {value:"single",label:<><CalendarDays size={14}/>رحلة واحدة</>},
              {value:"weekly",label:<><Repeat size={14}/>إطلاق متعدد</>},
            ]}/>}
          {weekly&&<Note tone="neutral">
            اختر تاريخ <b style={{color:B.black}}>أول رحلة</b>، وتُقترح الأسابيع الثلاثة التالية في اليوم نفسه. كل تاريخ يُطلق <b style={{color:B.black}}>رحلةً مستقلة</b> بمقاعدها وحجوزاتها وحالتها.
          </Note>}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={isEdit} aria-pressed={scheduleTarget==="departure"} onClick={()=>setScheduleTarget("departure")}
              className="text-start cursor-pointer" style={{...targetCard(scheduleTarget==="departure"),opacity:isEdit?.6:1}}>
              <span className="block" style={{fontSize:12,fontWeight:600,color:B.muted}}>{weekly?"تاريخ أول رحلة":"تاريخ الذهاب"} {req}</span>
              <span className="block" style={{fontSize:14,fontWeight:700,color:B.black,marginTop:2}}>{form.departureDate?fmtDayDate(form.departureDate):"اختر التاريخ"}</span>
              <span className="block" style={{fontSize:12,color:B.text2,marginTop:2}}>وقت الانطلاق: {fmtTime(form.departureStops[0]?.time)}</span>
            </button>
            <button type="button" aria-pressed={scheduleTarget==="return"} onClick={()=>setScheduleTarget("return")}
              className="text-start cursor-pointer" style={targetCard(scheduleTarget==="return")}>
              <span className="block" style={{fontSize:12,fontWeight:600,color:B.muted}}>{weekly?"عودة أول رحلة":"تاريخ العودة"} {req}</span>
              <span className="block" style={{fontSize:14,fontWeight:700,color:B.black,marginTop:2}}>{form.returnDate?fmtDayDate(form.returnDate):"اختر التاريخ"}</span>
              <span className="block" style={{fontSize:12,color:B.text2,marginTop:2}}>{weekly&&form.returnDate?`وكل رحلة تعود ${returnOffset===0?"في يومها":returnOffset===1?"بعد يوم":returnOffset===2?"بعد يومين":`بعد ${returnOffset} أيام`}`:`وقت العودة: ${form.returnTime?fmtTime(form.returnTime):"اختر الوقت"}`}</span>
            </button>
          </div>
          <ScheduleCalendar
            focus={scheduleTarget==="departure"?form.departureDate:form.returnDate}
            departure={form.departureDate} returnDate={form.returnDate}
            min={scheduleTarget==="return"&&form.departureDate?form.departureDate:todayYMD()}
            weekly={occurrences.slice(1).map((d,i):WeeklyMark=>({date:d,index:i+2,skipped:skipped.includes(d),conflict:occConflicts.has(d)}))}
            onPick={v=>{ if(scheduleTarget==="departure") setDeparture(v); else setReturn(v); }}/>
          {weekly&&occurrences.length>0&&<div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="ui-label" style={{margin:0}}>رحلات الدفعة</div>
              <div style={{fontSize:12,fontWeight:600,color:plan.length?B.text2:TONE.danger.fg}}>{plan.length?`ستُطلق ${tripsCount(plan.length)}`:"استُبعدت كل التواريخ"}</div>
            </div>
            <div style={{border:`1px solid ${B.border}`,borderRadius:14,overflow:"hidden"}}>
              {occurrences.map((d,i)=>{
                const off=skipped.includes(d); const c=occConflicts.get(d); const back=addDays(d,returnOffset);
                return <div key={d} className="flex items-center gap-3"
                  style={{padding:"10px 14px",background:c&&!off?TONE.danger.bg:B.surface,borderTop:i?`1px solid ${B.border}`:undefined}}>
                  <span className="flex items-center justify-center flex-shrink-0" aria-hidden
                    style={{width:26,height:26,borderRadius:8,fontSize:13,fontWeight:700,background:off?"transparent":B.fill,color:off?B.muted:B.text3,border:`1px ${off?"dashed":"solid"} ${off?B.borderStrong:B.border}`}}>{i+1}</span>
                  <div className="flex-1 min-w-0">
                    <div style={{fontSize:14,fontWeight:600,color:off?B.muted:B.black,textDecoration:off?"line-through":"none"}}>{fmtDayDate(d)}</div>
                    <div style={{fontSize:12,color:c&&!off?TONE.danger.fg:B.muted,marginTop:1}}>
                      {off?"مستبعدة — لن تُطلق":c?<>المركبة مشغولة: {conflictLabel(c)}</>:<>العودة {fmtDayDate(back)}</>}
                    </div>
                  </div>
                  {off
                    ? <Button size="sm" variant="ghost" icon={<RotateCcw size={14}/>} onClick={()=>toggleSkip(d)}>إرجاع</Button>
                    : <IconButton size="sm" label={`استبعاد ${fmtDateShort(d)}`} onClick={()=>toggleSkip(d)}><X size={15}/></IconButton>}
                </div>;
              })}
            </div>
            {occConflicts.size>0&&<Note tone="danger" icon={warnIcon} className="mt-3">
              {occConflicts.size===1?"تاريخٌ في الدفعة بلا باصٍ متاح":`${occConflicts.size} تواريخ في الدفعة بلا باصٍ متاح`} ({fleetCount} {fleetCount===1?"باص":"باصات"} من هذا النوع). استبعدها أو غيّر المركبة.
            </Note>}
          </div>}
          <div style={{maxWidth:220}}>
            <Field label={<>وقت العودة المتوقع {req}</>}><input type="time" value={form.returnTime} onChange={e=>set("returnTime",e.target.value)} className="ui-input" style={{direction:"ltr",textAlign:"right"}} /></Field>
          </div>
        </TabPanel>
        {returnInvalid&&<div role="alert" className="ui-error" style={{marginTop:0}}>
          {form.returnDate===form.departureDate?"وقت العودة يسبق وقت الانطلاق في اليوم نفسه":"تاريخ العودة لا يسبق الذهاب"}
        </div>}
        {!canSave&&!conflict&&!returnInvalid&&!tooSmall&&busCountOk&&occConflicts.size===0&&!(weekly&&form.departureDate&&plan.length===0)&&<Note tone="warn" icon={warnIcon}>
          أكمل: {isEdit?"":"الباقة، "}{flightMode?"المركبة":"نوع الباص"}{manual?" (اللوحة ورقمها التعريفي)":" (بسعة أكبر من صفر)"}، مدينة ونقطة الانطلاق، تاريخ ووقت الذهاب، وتاريخ ووقت العودة.
        </Note>}
      </div>
    </Modal>
  );
}

/* ════════ تأكيد إلغاء الرحلة (حماية) ════════

   السبب إلزامي لا تحسيناً: الرحلة الملغاة تُعرض للموظف وللمستفيد بعد
   الإلغاء، و«ملغاة» بلا سببٍ تُنتج سؤالاً لا يجد جواباً في السجل.

   والأثر يُعرض قبل التأكيد بأرقامه: «سيؤثر على الحجوزات المرتبطة» جملةٌ
   لا تُعين على قرار؛ «٧ حجوزات، ٣ منها بتذاكر، و٢١٠٠ ر.س مدفوعة» تُعين.
   ما تفعله القاعدة تلقائياً (trg_cancel_docs_for_trip) يُقال هنا كي لا
   يبحث الموظف عن زرّ «إلغاء التذاكر» بعدها. */
/* شريط أرقامٍ داخل نافذة — خاناتٌ متجاورة بفاصلٍ شعريّ والرقم أسود. كانت
   كل خانةٍ صندوقاً ملوّناً (أزرق وأخضر وأصفر في التفاصيل، وثلاثةٌ حمراء في
   الإلغاء)، فيُقرأ اللون قبل الرقم ولا يعني شيئاً. اللون هنا للرقم الذي
   عليه قرار وحده، ويُمرَّر `fg`. */
function FigureStrip({cells}:{cells:{l:string;v:React.ReactNode;sub?:string;fg?:string}[]}) {
  return (
    <div className="grid" style={{gridTemplateColumns:`repeat(${cells.length},minmax(0,1fr))`,border:`1px solid ${B.border}`,borderRadius:14,background:B.surface}}>
      {cells.map((c,i)=>(
        <div key={c.l} style={{padding:"12px 14px",minWidth:0,borderInlineStart:i?`1px solid ${B.border}`:undefined}}>
          <div className="truncate" style={{fontSize:12,color:B.muted,lineHeight:1.5}}>{c.l}</div>
          <div className="truncate" style={{fontSize:22,fontWeight:700,color:c.fg??B.black,lineHeight:1.35}}>{c.v}</div>
          {c.sub&&<div className="truncate" style={{fontSize:12,color:B.muted,lineHeight:1.5}}>{c.sub}</div>}
        </div>
      ))}
    </div>
  );
}

function CancelTripConfirm({trip,pkgName,impact,onConfirm,onCancel}:{trip:Trip;pkgName:string;impact:CancelImpact;onConfirm:(reason:string)=>void;onCancel:()=>void}) {
  const [reason,setReason]=useState("");
  const ready=reason.trim().length>=3;
  const n=impact.bookings.length;
  return (
    <Modal open onClose={onCancel} width={480} zIndex={70} title="تأكيد إلغاء الرحلة"
      icon={<ModalIcon tone="danger"><AlertTriangle size={19}/></ModalIcon>}
      sub={<>أنت على وشك إلغاء رحلة <b style={{color:B.text3}}>{tripLabel(trip,pkgName)}</b> بتاريخ <b style={{color:B.text3}}>{fmtDate(trip.departureDate)}</b>.</>}
      footer={<>
        <Button variant="danger" disabled={!ready} onClick={()=>ready&&onConfirm(reason.trim())}>تأكيد إلغاء الرحلة</Button>
        <Button variant="secondary" onClick={onCancel}>تراجع</Button>
      </>}>
      <div className="flex flex-col gap-4">
        <FigureStrip cells={[
          {l:"حجوزات قائمة",v:n,sub:`${impact.persons} مقعد يُحرَّر`},
          {l:"بتذاكر صادرة",v:impact.withTickets,sub:"تُلغى تلقائياً"},
          {l:"مدفوع فعلاً",v:<>{sarNumber(impact.paidTotal)}<span style={{fontSize:13,fontWeight:600,color:B.muted,marginInlineStart:4}}>{SAR}</span></>,sub:`${impact.paidCount} حجز`},
        ]}/>
        {n===0
          ? <Note tone="neutral">لا حجوزات قائمة على هذه الرحلة — لا أحد يتأثّر بإلغائها.</Note>
          : <Note tone="danger" icon={<AlertTriangle size={15}/>}>
              عند التأكيد تُلغي القاعدة <b>تذاكر</b> هذه الحجوزات تلقائياً وتُحرَّر <b>مقاعدها</b>. الفواتير المدفوعة تبقى محفوظة حتى يُقرَّر استرجاعها. لا تُرسَل أي رسالة تلقائياً — بعد التأكيد تظهر قائمة العملاء للتواصل معهم.
            </Note>}
        <div>
          <Field label={<>سبب الإلغاء <span className="ui-req">*</span></>}
            hint="يُعرض على بطاقة الرحلة مع تاريخ الإلغاء، ويُضمَّن في رسالة العملاء.">
            <Textarea value={reason} onChange={e=>setReason(e.target.value)} rows={2}
              placeholder="مثال: عطل في الحافلة · لم يكتمل العدد الأدنى"/>
          </Field>
        </div>
      </div>
    </Modal>
  );
}

/* ════════ بعد الإلغاء: مَن يُبلَّغ ════════

   لا إرسالٌ تلقائي. الاعتذار يقوله موظفٌ لا نظام، ورسالةٌ جماعية تخرج
   بلا يدٍ بشرية تصل لعميلٍ دفع وتصل لآخر لم يدفع بنفس النبرة. الزرّ يفتح
   واتساب بنصٍّ معدّ، والموظف يقرأ ويعدّل ويرسل. */
function CancelFollowUp({trip,pkgName,reason,impact,onClose}:{trip:Trip;pkgName:string;reason:string;impact:CancelImpact;onClose:()=>void}) {
  const [done,setDone]=useState<Set<string>>(new Set());
  const phones=Array.from(new Set(impact.bookings.map(b=>(b.clientPhone||"").trim()).filter(Boolean)));
  const label=tripLabel(trip,pkgName);
  const msgFor=(b:Booking)=>tripCancelWhatsApp({clientName:b.clientName,tripLabel:label,departureDate:trip.departureDate,departureTime:trip.departureTime,reason,paid:b.paymentStatus==="verified"});
  const copyAll=()=>{ copyText(phones.join("\n")); toast.success(`نُسخ ${phones.length} رقم`); };
  const send=(b:Booking)=>{ openWhatsApp(b.clientPhone,msgFor(b)); setDone(s=>new Set(s).add(b.id)); };
  return (
    <Modal open onClose={onClose} width={600} title="أُلغيت الرحلة — إبلاغ العملاء"
      sub={<>{label} · {fmtDateShort(trip.departureDate)} · السبب: {reason}</>}
      footer={<Button variant="secondary" onClick={onClose}>إغلاق</Button>}>
      <div className="flex flex-col gap-4">
        <Note tone="success" icon={<Check size={15}/>}>
          أُلغيت تذاكر الرحلة وحُرِّرت مقاعدها في القاعدة. بقي التواصل: كل زرٍّ يفتح واتساب برسالةٍ معدّة تُراجعها قبل الإرسال — لا يُرسَل شيء تلقائياً.
        </Note>
        {impact.bookings.length===0
          ? <EmptyState compact icon={<MessageCircle size={22}/>} title="لا أحد يُبلَّغ" note="لا حجوزات قائمة على هذه الرحلة."/>
          : <>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span style={{fontSize:13,color:B.text2}}>
                  <b style={{color:B.black}}>{impact.bookings.length}</b> حجز · تمّ التواصل مع <b style={{color:B.black}}>{done.size}</b>
                </span>
                <Button size="sm" variant="secondary" icon={<Copy size={14}/>} onClick={copyAll}>نسخ كل الأرقام ({phones.length})</Button>
              </div>
              <div style={{border:`1px solid ${B.border}`,borderRadius:14,overflow:"hidden"}}>
                {impact.bookings.map((b,i)=>{
                  const sent=done.has(b.id);
                  return (
                    <div key={b.id} className="flex items-center gap-3 flex-wrap" style={{padding:"12px 14px",background:B.surface,borderTop:i?`1px solid ${B.border}`:undefined}}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="truncate" style={{fontSize:14,fontWeight:600,color:B.black}}>{b.clientName||"—"}</span>
                          {b.paymentStatus==="verified"&&<Badge tone="success">مدفوع {sar(b.total)}</Badge>}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap" style={{fontSize:12,color:B.muted,marginTop:2}}>
                          <span>{b.id}</span>·<span style={{direction:"ltr",unicodeBidi:"isolate"}}>{b.clientPhone||"—"}</span>·<span>{b.persons} أشخاص</span>
                        </div>
                      </div>
                      {/* بعد الفتح يهدأ الزرّ ويبقى صالحاً: الموظف قد يغلق واتساب
                          قبل الإرسال ويعود. */}
                      <Button size="sm" variant={sent?"ghost":"secondary"} disabled={!b.clientPhone} onClick={()=>send(b)} className="flex-shrink-0"
                        icon={sent?<Check size={14}/>:<MessageCircle size={14}/>}>{sent?"فُتح واتساب":"واتساب"}</Button>
                    </div>
                  );
                })}
              </div>
            </>}
      </div>
    </Modal>
  );
}

/* ════════ نافذة تفاصيل الرحلة ════════ */
function TripDetailsModal({trip,pkgName,hotelName,transportName,branch,impact,canEdit,onEdit,onExtra,onToggleStatus,onCancel,onClose}:{
  trip:Trip;pkgName:string;hotelName:string;transportName:string;branch?:Branch;impact:CancelImpact;canEdit:boolean;
  onEdit:()=>void;onExtra:()=>void;onToggleStatus:()=>void;onCancel:(reason:string)=>void;onClose:()=>void;
}) {
  const navigate=useNavigate();
  const [confirmCancel,setConfirmCancel]=useState(false);
  const state=tripState(trip);
  const board=tripBoardState(trip);
  const {capacity,booked,available}=seatsOf(trip);
  const isCancelled=state==="cancelled"||state==="archived";
  const isEnded=state==="ended";
  const isFull=state==="full";
  const mapUrl=trip.departureMapUrl||branch?.gmapUrl||"";
  /* نقطة الانطلاق تُقرأ من لقطة الرحلة لا من الفرع الحيّ: تعديل اسم
     الفرع أو نقله لاحقاً يجب ألّا يغيّر ما وُعد به ركّاب رحلةٍ مضت.
     اسم الفرع يُعرض بجانبها للسياق لا بدلاً عنها. */
  const departure = trip.departurePoint
    || (branch ? `${branch.name} — ${branch.city}` : "—");
  const when=(d?:string,t?:string)=>d?<>{fmtWeekday(d)} {fmtDate(d)}{t&&<span style={{color:B.muted,fontWeight:500}}> · {fmtTime(t)}</span>}</>:(t?fmtTime(t):"—");
  /* الباقة ورقم الرحلة وحالتها في رأس النافذة — لا تُكرَّر صفوفاً تحته.
     والتاريخ ووقته خانةٌ واحدة: «الأربعاء 7 أكتوبر 2026 · 1:00 م». */
  const rows:[string,React.ReactNode][]=[
    ["الذهاب",when(trip.departureDate,trip.departureTime)],
    ["العودة",when(trip.returnDate,trip.returnTime)],
    ["المركبة",transportName||"—"],
    /* الرحلة متعدّدة الباصات لا لوحة لها: «باص ٢» رقمٌ داخلها لا مركبةٌ
       بعينها، ولوحة سجل النوع ليست لوحة أيٍّ منها. */
    ...(busCountOf(trip)>1
      ? [["عدد الباصات",`${busesLabel(busCountOf(trip))} · ${seatsPerBus(trip)} مقعداً لكل باص`] as [string,React.ReactNode]]
      : [["رقم لوحة الباص",trip.busPlate||"—"],["الرقم التعريفي للباص",trip.busCode||"—"]] as [string,React.ReactNode][]),
    ["نقطة الانطلاق",departure],
    /* العنوان من لقطة الرحلة وحدها — لا يُستكمل من الفرع الحيّ. */
    ...(trip.departureAddress?[["عنوان الانطلاق",trip.departureAddress] as [string,React.ReactNode]]:[]),
    ["الفندق",hotelName||"—"],
  ];
  const sectionLabel:React.CSSProperties={fontSize:12,fontWeight:600,color:B.muted,marginBottom:8};
  return (
    <>
    <Modal open onClose={onClose} width={600} title={tripLabel(trip,pkgName)}
      sub={<span className="flex items-center gap-2 flex-wrap" style={{marginTop:4}}>
        <span>رحلة {trip.id}</span><StatusBadge status={board} entity="trip"/>
        {!isCancelled&&trip.waitingSeats>0&&<Badge tone="warn">{trip.waitingSeats} في الانتظار</Badge>}
      </span>}
      footer={<>
        {/* رحلةٌ راحت لا يُوقَف حجزها ولا يُلغى ولا تُعدَّل: كلها وعودٌ بأثرٍ
            على المستقبل، ولا مستقبل لها. */}
        {!isCancelled&&!isEnded&&canEdit&&<Button variant="primary" icon={<Pencil size={15}/>} onClick={onEdit}>تعديل</Button>}
        {/* الكشف والكروكي ليسا إجراءً على الرحلة بل قراءةٌ لها، فيبقيان
            متاحَين بعد انتهائها وبعد إلغائها — تُراجَع ولا تُعدَّل. */}
        <Button variant="secondary" icon={<ClipboardList size={15}/>} onClick={()=>navigate(`/admin/manifests?trip=${encodeURIComponent(trip.id)}`)}>
          <span>كشف المقاعد<span className="hidden sm:inline"> والكروكي</span></span></Button>
        <Button variant="ghost" onClick={onClose} className="ms-auto">إغلاق</Button>
      </>}>
      <div className="flex flex-col gap-5">
        {/* لوح الإلغاء يسبق كل رقم: رحلةٌ ألغيت لا يُقرأ فيها «متبقٍ». */}
        {isCancelled&&(
          <Note tone="neutral" icon={<Ban size={15}/>}>
            <b style={{color:B.black}}>هذه الرحلة ملغاة</b>
            <span className="block">
              {trip.cancelReason||"لم يُسجَّل سبب — أُلغيت قبل تفعيل تسجيل الأسباب."}
              {trip.cancelledAt&&<> · بتاريخ <b style={{color:B.black}}>{fmtDate(trip.cancelledAt.slice(0,10))}</b></>}
            </span>
          </Note>
        )}
        {/* المنتهية تُقرأ بحصيلتها، والملغاة لا تُقرأ بها أصلاً. */}
        {!isCancelled&&(
          <div className="flex flex-col gap-3">
            <FigureStrip cells={isEnded
              ? [{l:"سعة الرحلة",v:capacity},{l:"سافروا",v:booked},{l:"لم تُبَع",v:available}]
              : [{l:"إجمالي المقاعد",v:capacity},{l:"المحجوزة",v:booked},{l:"المتبقية",v:available,fg:remainColor(board,available)}]}/>
            <OccupancyBar pct={occupancy(trip)} quiet={isEnded} width="100%" suffix="إشغال"/>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          {rows.map(([l,v])=>(
            <div key={l} className="ts-kv"><span className="ts-kv-k">{l}</span><span className="ts-kv-v">{v}</span></div>
          ))}
        </div>
        {mapUrl&&<a href={mapUrl} target="_blank" rel="noreferrer" className="ui-btn ui-btn--link self-start" style={{fontSize:13}}><MapPin size={15}/>فتح موقع الانطلاق على الخريطة</a>}
        {trip.drivers.length>0&&(
          <div>
            <div style={sectionLabel}>السائقون</div>
            <div style={{border:`1px solid ${B.border}`,borderRadius:14,overflow:"hidden"}}>
              {trip.drivers.map((d,i)=>(
                <div key={d.id} className="flex items-center gap-3" style={{padding:"10px 14px",borderTop:i?`1px solid ${B.border}`:undefined}}>
                  <UserRound size={16} style={{color:B.muted,flexShrink:0}}/>
                  <span className="flex-1 min-w-0 truncate" style={{fontSize:14,fontWeight:600,color:B.black}}>{d.name||"—"}</span>
                  <span style={{fontSize:13,color:B.muted,direction:"ltr",unicodeBidi:"isolate"}}>{d.phone||"—"}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* الإجراءات التشغيلية في جسم النافذة لا ذيلها: خمسة أزرارٍ في ذيلٍ
            واحد كانت تنكسر سطرين وتُساوي «إلغاء الرحلة» بـ«تعديل». الذيل
            للفعل الأساسي والقراءة، وهنا ما يغيّر مصير الرحلة. */}
        {!isCancelled&&!isEnded&&(
          <div style={{borderTop:`1px solid ${B.border}`,paddingTop:16}}>
            <div style={sectionLabel}>إجراءات تشغيلية</div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* الرحلة الممتلئة تُفتح لسؤالٍ واحد: هل أُطلق غيرها اليوم نفسه؟
                  فالإجابة إجراءٌ هنا لا رحلةٌ تُنشأ من الصفر في شاشةٍ أخرى. */}
              {canEdit&&isFull&&<Button variant="secondary" icon={<Plus size={15}/>} onClick={onExtra}>إطلاق رحلة إضافية</Button>}
              <Button variant="secondary" icon={isFull?<CirclePlay size={15}/>:<CirclePause size={15}/>} onClick={onToggleStatus}>
                {isFull?"استئناف الحجز":"إيقاف الحجز مؤقتاً"}</Button>
              <Button variant="danger-soft" icon={<Ban size={15}/>} onClick={()=>setConfirmCancel(true)}>إلغاء الرحلة</Button>
            </div>
          </div>
        )}
        {isEnded&&<Note tone="neutral">انتهت هذه الرحلة — لا إجراءات تشغيلية عليها.</Note>}
      </div>
    </Modal>
    {confirmCancel&&<CancelTripConfirm trip={trip} pkgName={pkgName} impact={impact} onConfirm={r=>{setConfirmCancel(false);onCancel(r);onClose();}} onCancel={()=>setConfirmCancel(false)}/>}
    </>
  );
}

/* ════════ لوحة التشغيل ════════

   الشاشة جدولٌ واحد لا بطاقةً لكل باقة. السبب تشغيليّ لا جماليّ: السؤال
   الأول كل صباح «ما الذي يتحرّك هذا الأسبوع؟» لا «ماذا في هذه الباقة؟»،
   والبطاقات تجيب عن الثاني وتُخفي الأول — عشرون رحلةً في ستّ باقات تصير
   ستّ لوحاتٍ متفرّقة، وأقربُ رحلةٍ تنطلق غداً قد تكون في آخر الصفحة.

   الجدول يرتّب بالزمن ويجمع بالأسبوع، فيُقرأ الترتيب نفسه مهما زاد
   العدد: ثلاثون رحلةً تبقى ثلاثين صفّاً في أربعة أقسام. */

/* لون الحالة يُقرأ من المعجم (lib/status › statusTone) — وهو ما يلوّن
   شارتها. كانت هنا خريطةٌ محلية ثانية بدرجاتٍ قريبة لا مطابقة، فيُقرأ
   «متبقٍ قليل» برتقالياً على حافة الصفّ وكهرمانياً في شارته. */
const stateFg=(s:TripBoardState)=>statusTone(s).fg;
const isDead=(s:TripBoardState)=>s==="cancelled"||s==="archived";
/* الخيط الملوّن عند حافة الصفّ لِما يستدعي نظرةً وحده: قاربت، امتلأت، أو
   تسير الآن. خيطٌ على كل صفّ — وأغلبها «مفتوحة» — عمودٌ أخضر لا يقول
   شيئاً؛ وعلى ثلاثةٍ من عشرين يُلمح قبل أن يُقرأ. */
const flagged=(s:TripBoardState)=>s==="few"||s==="full"||s==="running";
/* المتبقي هو الرقم الذي يُتّخذ عليه القرار، فيُلوَّن حين يستدعيه وحده:
   كهرمانيٌّ قارب، وأحمرُ صفر. المتّسع أسودُ كبقية الأرقام، وما لا قرار
   عليه — ملغاةٌ أو منتهية — رماديٌّ كي لا يَعِد بمقاعدَ لا تُباع. */
const remainColor=(s:TripBoardState,available:number)=>
  isDead(s)?B.muted:s==="ended"?B.text2:available<=0?TONE.danger.fg:s==="few"?TONE.warn.fg:B.black;

function EdgeThread({state}:{state:TripBoardState}) {
  if(!flagged(state)) return null;
  return <span aria-hidden style={{position:"absolute",insetInlineStart:0,top:10,bottom:10,width:3,borderRadius:3,background:stateFg(state)}}/>;
}

/* شريط الإشغال — الرقم والشكل معاً: النسبة وحدها تُقرأ ولا تُلمح، والشريط
   وحده يُلمح ولا يُقرأ، والمسح السريع يحتاج الاثنين. لونه بالعتبة نفسها
   التي تصنع «متبقٍ قليل» (lib/trip › LOW_SEATS_RATIO): أخضرُ متّسع،
   كهرمانيٌّ قارب، أحمرُ امتلأ — والنسبة نفسها سوداء. */
const WARN_PCT=Math.round((1-LOW_SEATS_RATIO)*100);
function OccupancyBar({pct,quiet=false,width=64,suffix}:{pct:number;quiet?:boolean;width?:number|"100%";suffix?:string}) {
  const fill=quiet?B.muted:pct>=100?TONE.danger.fg:pct>=WARN_PCT?TONE.warn.fg:TONE.success.fg;
  return (
    <div className="flex items-center gap-2.5" role="img" aria-label={`نسبة الإشغال ${pct}%`}>
      <div className="ui-meter" style={width==="100%"?{flex:1}:{width,flexShrink:0}}><span style={{width:`${pct}%`,background:fill}}/></div>
      <span className="whitespace-nowrap" style={{fontSize:13,fontWeight:600,color:quiet?B.muted:B.text2,minWidth:suffix?undefined:38}}>{pct}%{suffix?` ${suffix}`:""}</span>
    </div>
  );
}

/* زرّا الصفّ. «إدارة» في كل صفٍّ فهادئةٌ بلا حدّ — والصفّ كلّه يفتح
   التفاصيل أصلاً. و«رحلة إضافية» تظهر حيث يُتّخذ القرار: على صفّ الرحلة
   الممتلئة نفسها، لا في نموذجٍ فارغ يُملأ من الصفر — فتأخذ الحدّ لأنها
   النادرة التي يُراد أن تُرى. ولا ذهبيّ في الصفوف. */
function RowActions({onOpen,onExtra,inTable=false}:{onOpen:()=>void;onExtra?:()=>void;inTable?:boolean}) {
  return (
    <div className="inline-flex items-center gap-1.5">
      {/* في الجدول على الجوال تبقى علامة + وحدها: العمود مثبّتٌ عند الحافة،
          وزرٌّ بنصّه يأكل ثلث الشاشة من الأعمدة التي يُمرَّر لقراءتها. */}
      {onExtra&&<Button size="sm" variant="secondary" icon={<Plus size={14}/>} title="إطلاق رحلة إضافية بنفس بيانات هذه الرحلة" aria-label="إطلاق رحلة إضافية"
        onClick={e=>{e.stopPropagation();onExtra();}}><span className={inTable?"max-md:hidden":undefined}>رحلة إضافية</span></Button>}
      <Button size="sm" variant="ghost" icon={<Settings2 size={14}/>} onClick={e=>{e.stopPropagation();onOpen();}}>إدارة</Button>
    </div>
  );
}

/* الصفّ يُفتح بالضغط وبـEnter حين يكون التركيز عليه هو — لا على زرٍّ داخله،
   وإلا فتح Enter على «رحلة إضافية» النموذجَ والتفاصيلَ معاً. */
const rowKey=(open:()=>void)=>(e:React.KeyboardEvent)=>{ if(e.key==="Enter"&&e.target===e.currentTarget){ e.preventDefault(); open(); } };

const COLS = ["التاريخ","اليوم","الباقة","مدينة الانطلاق","السعة","المحجوز","المتبقي","نسبة الإشغال","الحالة","إدارة الرحلة"];

function TripRow({trip,pkgName,city,onOpen,onExtra}:{
  trip:Trip;pkgName:string;city:string;onOpen:()=>void;onExtra?:()=>void;
}) {
  const state=tripBoardState(trip);
  const {capacity,booked,available}=seatsOf(trip);
  const dead=isDead(state);
  const quiet=dead||state==="ended";
  return (
    <tr onClick={onOpen} tabIndex={0} onKeyDown={rowKey(onOpen)} className="trip-row is-clickable">
      <td className="nowrap" style={{position:"relative"}}>
        <EdgeThread state={state}/>
        <div className="cell-main" style={dead?{color:B.muted}:undefined}>{fmtDateShort(trip.departureDate)}</div>
        {trip.departureTime&&<div className="cell-sub">{fmtTime(trip.departureTime)}</div>}
      </td>
      <td className="nowrap" style={{color:B.text2}}>{fmtWeekday(trip.departureDate)||"—"}</td>
      <td style={{minWidth:170}}>
        <div className="cell-main" style={dead?{color:B.text2}:undefined}>{pkgName||"—"}</div>
        <div className="cell-sub">{trip.id}</div>
      </td>
      <td className="nowrap" style={{color:B.text2}}>{city||"—"}</td>
      <td className="nowrap" style={{color:B.text2}}>
        {capacity}
        {busCountOf(trip)>1&&<div className="cell-sub">{busesLabel(busCountOf(trip))}</div>}
      </td>
      <td className="nowrap" style={{fontWeight:600,color:dead?B.muted:B.black}}>{booked}</td>
      <td className="nowrap" style={{fontWeight:600,color:remainColor(state,available)}}>{dead?"—":available}</td>
      <td><OccupancyBar pct={occupancy(trip)} quiet={quiet}/></td>
      <td className="nowrap">
        <StatusBadge status={state} entity="trip"/>
        {/* قائمة الانتظار ليست عموداً — هي تفسيرٌ للحالة: ثلاثةٌ ينتظرون
            على رحلةٍ ممتلئة هي أقوى إشارةٍ إلى إطلاق رحلةٍ أخرى. */}
        {!dead&&trip.waitingSeats>0&&(
          <div className="cell-sub" style={{color:TONE.warn.fg,fontWeight:600}}>{trip.waitingSeats} في الانتظار</div>
        )}
      </td>
      <td className="col-action max-xl:shadow-[6px_0_10px_-8px_rgba(27,23,18,.28)]">
        <RowActions onOpen={onOpen} onExtra={onExtra} inTable/>
      </td>
    </tr>
  );
}

/* ════════ الجدول ════════
   رأسٌ واحد وأقسامٌ داخله: الأعمدة تبقى على استقامةٍ واحدة عبر الأسابيع،
   وجدولٌ لكل أسبوع كان يكسرها ويكرّر الرأس أربع مرّات. */
function TripsTable({groups,pkgName,cityOf,onOpen,onExtra,mayWrite}:{
  groups:TripGroup[];pkgName:(id:string)=>string;cityOf:(t:Trip)=>string;
  onOpen:(t:Trip)=>void;onExtra:(t:Trip)=>void;mayWrite:boolean;
}) {
  return (
    <div className="ui-table-wrap">
      {/* على الجوال: عمودٌ مثبّت للإجراء وتلميحٌ بأن وراء الحافة بقية. */}
      <div className="tbl-hint items-center gap-1.5 px-4 py-2" style={{background:B.fill,borderBottom:`1px solid ${B.border}`,color:B.muted,fontSize:12}}>
        <ArrowRight size={14}/>مرّر الجدول أفقياً لرؤية بقية الأعمدة
      </div>
      <div className="ui-table-scroll">
        {/* عشرة أعمدة: حشوة الخانة ١٢ بدل ١٦ كي يتّسع الجدول في شاشة العمل
            بلا تمرير — كثافةٌ على الجدول كلّه لا تنسيقٌ على خانةٍ بعينها. */}
        <table className="ui-table [&_td]:px-3! [&_th]:px-3!" style={{minWidth:920}}>
          <thead>
            <tr>
              {COLS.map((h,i)=>i===COLS.length-1
                ? <th key={h} className="col-action"><span className="sr-only">{h}</span></th>
                : <th key={h}>{h}</th>)}
            </tr>
          </thead>
          {groups.map((g,gi)=>{
            const live=g.trips.filter(t=>t.status!=="cancelled"&&t.status!=="archived");
            const cap=live.reduce((a,t)=>a+seatsOf(t).capacity,0);
            const bk=live.reduce((a,t)=>a+seatsOf(t).booked,0);
            const av=live.reduce((a,t)=>a+seatsOf(t).available,0);
            const fullCount=g.trips.filter(t=>tripBoardState(t)==="full").length;
            return (
              <tbody key={g.key}>
                {/* عنوان الأسبوع صفٌّ في الجدول لا بطاقةً فوقه: القسم يفصل
                    ولا يقطع، فتبقى الأعمدة مقروءةً من أعلى الصفحة إلى أسفلها.
                    ومحتواه لاصقٌ بحافة البداية: عند التمرير الأفقي على الجوال
                    يبقى اسم الأسبوع ظاهراً ولا ينسحب مع الأعمدة. */}
                <tr>
                  <th colSpan={COLS.length} scope="rowgroup" style={{background:B.fill,padding:"9px 16px",textAlign:"start",fontWeight:400,borderBottom:`1px solid ${B.border}`,borderTop:gi?`1px solid ${B.border}`:undefined}}>
                    <div className="flex items-center gap-x-3 gap-y-1 flex-wrap" style={{position:"sticky",insetInlineStart:12,width:"fit-content",maxWidth:"calc(100vw - 64px)"}}>
                      <span style={{fontSize:14,fontWeight:700,color:B.black}}>{g.label}</span>
                      <span style={{fontSize:13,color:B.text2}}>{tripsCount(g.trips.length)}</span>
                      {cap>0&&<span style={{fontSize:13,color:B.muted}}>محجوز <b style={{color:B.text3,fontWeight:600}}>{bk}</b> من {cap} · متبقٍّ <b style={{color:av>0?B.text3:TONE.danger.fg,fontWeight:600}}>{av}</b></span>}
                      {fullCount>0&&<Badge tone="danger"><AlertTriangle size={12}/>{fullCount} {statusLabel("full","trip")}</Badge>}
                    </div>
                  </th>
                </tr>
                {g.trips.map(t=>{
                  const canExtra = mayWrite && tripBoardState(t)==="full";
                  return <TripRow key={t.id} trip={t} pkgName={pkgName(t.packageId)} city={cityOf(t)}
                    onOpen={()=>onOpen(t)} onExtra={canExtra?()=>onExtra(t):undefined}/>;
                })}
              </tbody>
            );
          })}
        </table>
      </div>
    </div>
  );
}

/* ════════ التقويم ════════
   أداةٌ بجانب الجدول لا أساس الصفحة: شهرٌ واحد يُتنقَّل فيه، وضغطُ يومٍ
   يكشف رحلاته كاملةً بجانبه — لا يفتح نافذةً ولا يُغيّر الجدول. */
const AR_WEEK = ["سبت","أحد","اثنين","ثلاثاء","أربعاء","خميس","جمعة"];
type YM={y:number;m:number};
const shiftMonth=(c:YM,d:number):YM=>{ let m=c.m+d,y=c.y; while(m>11){m-=12;y++;} while(m<0){m+=12;y--;} return {y,m}; };

/** رأس الشهر: السابق عن يمين الاسم والتالي عن يساره، كما يُقرأ التقويم العربي. */
function MonthNav({y,m,count,onShift}:YM&{count:number;onShift:(d:number)=>void}) {
  return (
    <div className="flex items-center justify-between gap-2 mb-3">
      <IconButton size="sm" variant="outline" label="الشهر السابق" onClick={()=>onShift(-1)}><ChevronRight size={16}/></IconButton>
      <div className="text-center">
        <div style={{fontSize:15,fontWeight:700,color:B.black,lineHeight:1.4}}>{AR_MONTHS[m]} {y}</div>
        <div style={{fontSize:12,color:B.muted}}>{count?tripsCount(count):"لا رحلات"}</div>
      </div>
      <IconButton size="sm" variant="outline" label="الشهر التالي" onClick={()=>onShift(1)}><ChevronLeft size={16}/></IconButton>
    </div>
  );
}

/* خانة اليوم هادئة: الرقم، وتحته نقطةٌ لكل رحلةٍ تنطلق فيه بلون حالتها —
   أخضرُ يقبل، كهرمانيٌّ قارب، أحمرُ امتلأ. كانت الخانة كلّها مربّعاً أخضر
   أو أحمر مشبعاً وفيه «17 مقعد» بخطٍّ لا يُقرأ، وأيام السير حشوةً بيج تملأ
   نصف الشهر — فيصير اليوم العاديّ هو الاستثناء. الآن: شَرطةٌ رمادية ليومٍ
   فيه رحلةٌ على الطريق، وحلقةٌ ذهبية لليوم الحالي، وأسودُ ممتلئ للمختار؛
   وعدد المقاعد في تلميح الخانة وفي لوح اليوم بجانبها. */
function MonthGrid({y,m,depMap,spanSet,selected,onPick}:{
  y:number;m:number;depMap:Map<string,Trip[]>;spanSet:Set<string>;selected:string|null;onPick:(ds:string)=>void;
}) {
  const firstCol=(new Date(y,m,1).getDay()+1)%7;
  const daysInMonth=new Date(y,m+1,0).getDate();
  const todayStr=(()=>{const n=new Date();return ymd(n.getFullYear(),n.getMonth(),n.getDate());})();
  const cells:(number|null)[]=[];
  for(let i=0;i<firstCol;i++) cells.push(null);
  for(let d=1;d<=daysInMonth;d++) cells.push(d);
  return (
    <div className="grid grid-cols-7 gap-1">
      {AR_WEEK.map(w=><div key={w} className="text-center" style={{fontSize:12,fontWeight:600,color:B.muted,paddingBottom:6}}>{w}</div>)}
      {cells.map((d,i)=>{
        if(d===null) return <div key={"e"+i} style={{height:44}}/>;
        const ds=ymd(y,m,d);
        const deps=depMap.get(ds)??[];
        const isSel=selected===ds;
        const isToday=ds===todayStr;
        const inSpan=!deps.length&&spanSet.has(ds);
        const states=deps.map(t=>tripBoardState(t));
        const sellable=states.some(s=>s==="open"||s==="few");
        const remaining=deps.reduce((a,t)=>{const s=tripBoardState(t);return a+(s==="open"||s==="few"?seatsOf(t).available:0);},0);
        const say=`${fmtDayDate(ds)} — ${deps.length
          ? `${tripsCount(deps.length)} · ${sellable?`${remaining} مقعداً متاحاً`:states.map(s=>statusLabel(s,"trip")).filter((s,k,a)=>a.indexOf(s)===k).join("، ")}`
          : inSpan?"رحلةٌ على الطريق":"لا رحلات"}`;
        return (
          <button key={"d"+i} type="button" onClick={()=>onPick(ds)} aria-pressed={isSel} aria-label={say} title={say}
            className="trip-cal-day flex flex-col items-center justify-center gap-1 cursor-pointer"
            style={{height:44,borderRadius:10,border:"none",fontFamily:"inherit",
              background:isSel?B.ink:"transparent",color:isSel?B.onInk:deps.length?B.black:B.text2,
              boxShadow:isToday&&!isSel?`inset 0 0 0 1.5px ${B.gold}`:"none"}}>
            <span className="leading-none" style={{fontSize:14,fontWeight:deps.length?700:500}}>{d}</span>
            <span aria-hidden className="flex items-center justify-center gap-0.5" style={{height:6}}>
              {/* على الخانة السوداء تُفتَّح النقطة إلى درجة الحدّ من اللون نفسه. */}
              {states.slice(0,3).map((s,k)=><span key={k} style={{width:6,height:6,borderRadius:999,background:isSel?dotOnInk(s):stateFg(s)}}/>)}
              {inSpan&&<span style={{width:10,height:2,borderRadius:2,background:isSel?B.onInk3:B.borderStrong}}/>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const dotOnInk=(s:TripBoardState)=>s==="open"?TONE.success.line:s==="few"?TONE.warn.line:s==="full"?TONE.danger.line:s==="running"?TONE.info.line:B.onInk2;

function LegendDot({color,label,bar=false}:{color:string;label:string;bar?:boolean}) {
  return <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
    <span aria-hidden style={bar?{width:10,height:2,borderRadius:2,background:color}:{width:6,height:6,borderRadius:999,background:color}}/>{label}</span>;
}

/* صفّ اليوم — ما يحتاجه القرار على سطرٍ واحد: متى، أيّ باقة ومن أين،
   كم بقي، وما الحالة. بلغة صفّ الجدول نفسها: سطرٌ أساسي وتحته ثانوي،
   فاصلٌ شعريّ، وخيط الحافة لِما يستدعي نظرة. */
function DayTripRow({trip,pkgName,city,first,onOpen,onExtra}:{
  trip:Trip;pkgName:string;city:string;first:boolean;onOpen:()=>void;onExtra?:()=>void;
}) {
  const state=tripBoardState(trip);
  const {capacity,available}=seatsOf(trip);
  const dead=isDead(state);
  return (
    <div onClick={onOpen} role="button" tabIndex={0} onKeyDown={rowKey(onOpen)}
      className="day-row flex items-center gap-x-4 gap-y-2 flex-wrap cursor-pointer"
      style={{position:"relative",padding:"12px 14px",borderTop:first?undefined:`1px solid ${B.border}`}}>
      <EdgeThread state={state}/>
      <span className="whitespace-nowrap" style={{fontSize:14,fontWeight:600,color:dead?B.muted:B.black,minWidth:66}}>{fmtTime(trip.departureTime)}</span>
      <span className="flex-1" style={{minWidth:130}}>
        <span className="block" style={{fontSize:14,fontWeight:600,color:dead?B.text2:B.black}}>{pkgName||trip.id}</span>
        <span className="block" style={{fontSize:12,color:B.muted,marginTop:2}}>{city||"—"} · {trip.id}</span>
      </span>
      <span className="whitespace-nowrap" style={{fontSize:13,color:B.muted}}>
        متبقٍّ <b style={{fontWeight:600,color:remainColor(state,available)}}>{dead?"—":available}</b> من {capacity}
      </span>
      <OccupancyBar pct={occupancy(trip)} quiet={dead||state==="ended"} width={56}/>
      <StatusBadge status={state} entity="trip"/>
      <span className="ms-auto"><RowActions onOpen={onOpen} onExtra={onExtra}/></span>
    </div>
  );
}
function TripCalendar({trips,horizon,pkgName,cityOf,selected,onSelect,onOpen,onExtra,onLaunchOn,mayWrite}:{
  trips:Trip[];horizon:Horizon;pkgName:(id:string)=>string;cityOf:(t:Trip)=>string;
  selected:string|null;onSelect:(ds:string|null)=>void;onOpen:(t:Trip)=>void;onExtra:(t:Trip)=>void;
  onLaunchOn:(ds:string)=>void;mayWrite:boolean;
}) {
  const [open,setOpen]=useState(true);
  /* المرساة تتبع الفترة: القادمة تفتح على شهر أقرب رحلة، والماضية على
     شهر آخر رحلةٍ انتهت. تقويمٌ يفتح على شهرٍ لا رحلات فيه لا يُقرأ. */
  const anchor=(()=>{
    if(horizon==="upcoming") return calendarAnchor(trips);
    const last=[...trips].map(t=>tripDeparture(t)).filter(Boolean).sort((a,b)=>b!.getTime()-a!.getTime())[0];
    const n=new Date();
    return last?{y:last.getFullYear(),m:last.getMonth()}:{y:n.getFullYear(),m:n.getMonth()};
  })();
  const [cur,setCur]=useState(anchor);
  const shift=(d:number)=>setCur(c=>shiftMonth(c,d));
  /* اختيارٌ من خارج الشهر المعروض — من مرشّح التاريخ غالباً — يجرّ الشهر
     إليه: يومٌ محدَّدٌ في لوحٍ وشبكةٌ تعرض شهراً آخر قراءتان متناقضتان. */
  useEffect(()=>{
    if(!selected) return;
    const p=parseYMD(selected);
    if(p&&(p.y!==cur.y||p.m!==cur.m)) setCur({y:p.y,m:p.m});
  },[selected]);

  const depMap=new Map<string,Trip[]>();
  const spanSet=new Set<string>();
  trips.forEach(t=>{
    const dp=parseYMD(t.departureDate); if(!dp) return;
    const arr=depMap.get(t.departureDate)||[]; arr.push(t); depMap.set(t.departureDate,arr);
    const rt=parseYMD(t.returnDate);
    const start=new Date(dp.y,dp.m,dp.d);
    const end=rt?new Date(rt.y,rt.m,rt.d):start;
    for(let c=new Date(start);c<=end;c.setDate(c.getDate()+1)) spanSet.add(ymd(c.getFullYear(),c.getMonth(),c.getDate()));
  });
  depMap.forEach(list=>list.sort((a,b)=>(a.departureTime||"").localeCompare(b.departureTime||"")));

  /* لوحٌ فارغٌ ينتظر ضغطةً هدرٌ لمساحةٍ ووقت. بلا اختيارٍ صريح يفتح على
     أقرب يومٍ فيه رحلات — أوّل ما يُسأل عنه عند الدخول أصلاً. والاختيار
     الصريح يعلوه، وتفريغُه يعيد الافتراض لا الفراغ. */
  const inCurMonth=(ds:string)=>{ const p=parseYMD(ds); return !!p&&p.y===cur.y&&p.m===cur.m; };
  const autoDay=(()=>{
    const days=[...depMap.keys()].filter(inCurMonth).sort();
    return horizon==="past" ? days[days.length-1] ?? null : days[0] ?? null;
  })();
  /* اليوم المعروض يبقى داخل الشهر المعروض دائماً: تصفّحُ شهرٍ آخر يُظهر
     أقرب يومٍ فيه، لا رحلاتِ شهرٍ غادرناه. */
  const sel = selected && inCurMonth(selected) ? selected : autoDay;
  const dayTrips=sel?(depMap.get(sel)??[]):[];
  /* الإطلاق على يومٍ مضى لا معنى له — والتقويم يعرض أوائل الشهر الحالي
     وهي أيامٌ مضت. الشرط على السلسلة مباشرةً: YYYY-MM-DD تُقارن معجمياً. */
  const todayStr=(()=>{const n=new Date();return ymd(n.getFullYear(),n.getMonth(),n.getDate());})();
  const canLaunchOn = mayWrite && horizon==="upcoming" && !!sel && sel>=todayStr;
  const monthCount=[...depMap.entries()].filter(([ds])=>{const p=parseYMD(ds);return p&&p.y===cur.y&&p.m===cur.m;}).reduce((a,[,l])=>a+l.length,0);

  const monthLabel=`${AR_MONTHS[cur.m]} ${cur.y}`;

  return (
    <section className="ui-card overflow-hidden" aria-label="تقويم الرحلات">
      <button type="button" onClick={()=>setOpen(v=>!v)} aria-expanded={open}
        className="w-full flex items-center gap-3 cursor-pointer text-start"
        style={{padding:"14px 20px",background:"transparent",border:"none",fontFamily:"inherit",borderBottom:`1px solid ${open?B.border:"transparent"}`}}>
        <CalendarDays size={18} style={{color:B.muted,flexShrink:0}}/>
        <span className="ui-card-title">التقويم</span>
        <span className="ui-card-sub hidden sm:inline">{open?"اضغط أيّ يوم لعرض رحلاته":`${monthLabel} · ${monthCount?tripsCount(monthCount):"لا رحلات"}`}</span>
        <ChevronDown size={18} className="ms-auto flex-shrink-0" style={{color:B.muted,transform:open?"rotate(180deg)":"none",transition:`transform ${DUR.base}s`}}/>
      </button>
      <AnimatePresence initial={false}>{open&&(
        <motion.div initial={{height:0,opacity:0}} animate={{height:"auto",opacity:1}} exit={{height:0,opacity:0}}
          transition={{duration:DUR.base,ease:EASE}} className="overflow-hidden">
          <div className="grid gap-5 p-4 md:p-5 lg:grid-cols-[320px_minmax(0,1fr)]">
              {/* الشبكة */}
              <div>
                <MonthNav y={cur.y} m={cur.m} count={monthCount} onShift={shift}/>
                <MonthGrid y={cur.y} m={cur.m} depMap={depMap} spanSet={spanSet} selected={sel} onPick={onSelect}/>
                <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-3" style={{fontSize:12,color:B.muted}}>
                  {horizon==="upcoming"
                    ? (["open","few","full"] as const).map(s=><LegendDot key={s} color={stateFg(s)} label={statusLabel(s,"trip")}/>)
                    : <LegendDot color={stateFg("ended")} label="منتهية أو ملغاة"/>}
                  <LegendDot bar color={B.borderStrong} label="على الطريق"/>
                </div>
              </div>
              {/* لوح اليوم — بجانب الشبكة مباشرةً */}
              <div className="flex flex-col gap-3 min-w-0">
                {!sel
                  ? <div className="flex-1 flex items-center justify-center" style={{background:B.bg,border:`1px solid ${B.border}`,borderRadius:14}}>
                      <EmptyState compact icon={<CalendarDays size={22}/>} title={`لا رحلات في ${AR_MONTHS[cur.m]}`} note="اضغط أيّ يوم في التقويم لعرض رحلاته."/>
                    </div>
                  : <>
                      <div className="flex items-center gap-2 flex-wrap" style={{minHeight:30}}>
                        <h3 className="ts-section-title">رحلات {fmtDayDate(sel)}</h3>
                        <Badge tone="neutral">{dayTrips.length}</Badge>
                        {!selected&&<span style={{fontSize:12,color:B.muted}}>أقرب يومٍ فيه رحلات</span>}
                      </div>
                      {dayTrips.length===0
                        ? <div className="flex-1 flex items-center justify-center" style={{background:B.bg,border:`1px solid ${B.border}`,borderRadius:14}}>
                            <EmptyState compact icon={<CalendarDays size={22}/>} title="لا رحلات في هذا اليوم"
                              action={canLaunchOn?<Button variant="secondary" icon={<Plus size={16}/>} onClick={()=>onLaunchOn(sel)}>إطلاق رحلة في هذا اليوم</Button>:undefined}/>
                          </div>
                        : <>
                            <div style={{border:`1px solid ${B.border}`,borderRadius:14,overflow:"hidden"}}>
                              {dayTrips.map((t,i)=>(
                                <DayTripRow key={t.id} trip={t} first={i===0} pkgName={pkgName(t.packageId)} city={cityOf(t)}
                                  onOpen={()=>onOpen(t)}
                                  onExtra={mayWrite&&tripBoardState(t)==="full"?()=>onExtra(t):undefined}/>
                              ))}
                            </div>
                            {/* اليوم الذي امتلأت رحلاته كلها هو اليوم الذي يُطلق فيه غيرها. */}
                            {canLaunchOn&&dayTrips.every(t=>{const s=tripBoardState(t);return s==="full"||s==="closed";})&&(
                              <Button variant="secondary" size="sm" icon={<Plus size={14}/>} className="self-start" onClick={()=>onLaunchOn(sel)}>إطلاق رحلة أخرى في هذا اليوم</Button>
                            )}
                          </>}
                    </>}
              </div>
          </div>
        </motion.div>
      )}</AnimatePresence>
    </section>
  );
}

/* ─── Trips Page ─── */
export function TripsPage({packages,transports,hotels,onMenuOpen}:{packages:Pkg[];transports:Transport[];hotels:Hotel[];onMenuOpen?:()=>void}) {
  const trips=useStore(s=>s.trips); const setTrips=useStore(s=>s.setTrips);
  const branches=useStore(s=>s.branches);
  const bookings=useStore(s=>s.bookings);
  const tickets=useStore(s=>s.tickets);
  const {canWrite}=useRole();
  const mayWrite=canWrite("trips");
  const [search,setSearch]=useState("");
  /* التصفية على القيمة الساكنة لا على كل ضغطة مفتاح. */
  const query = useDebounced(search);
  /* الفترة محورُ الصفحة كلها: الجدول والتقويم والإحصاءات تتبعها معاً.
     كان الماضي يُعرض مطويّاً أسفل القادم، فيختلط الزمنان في شاشةٍ واحدة. */
  const [horizon,setHorizon]=useState<Horizon>("upcoming");
  const [stateFilter,setStateFilter]=useState<"all"|TripBoardState>("all");
  const [pkgFilter,setPkgFilter]=useState("all");
  const [cityFilter,setCityFilter]=useState("all");
  const [dateFilter,setDateFilter]=useState("");
  const [dateFilterOpen,setDateFilterOpen]=useState(false);
  const [picked,setPicked]=useState<string|null>(null);
  const [showLaunch,setShowLaunch]=useState(false);
  const [launchPkgId,setLaunchPkgId]=useState<string|undefined>(undefined);
  const [launchDate,setLaunchDate]=useState<string|undefined>(undefined);
  const [baseTrip,setBaseTrip]=useState<Trip|undefined>(undefined);
  const [detailId,setDetailId]=useState<string|null>(null);
  const [editId,setEditId]=useState<string|null>(null);
  /* لوح المتابعة بعد الإلغاء: يحمل الأثر كما حُسب لحظة الإلغاء — الحجوزات
     لا تتغيّر بإلغاء الرحلة، والتذاكر تُلغى في القاعدة فلا يُعاد حسابها. */
  const [followUp,setFollowUp]=useState<{trip:Trip;reason:string;impact:CancelImpact}|null>(null);

  const pkgName=(id:string)=>packages.find(p=>p.id===id)?.name??"—";
  const hotelName=(id:string)=>hotels.find(h=>h.id===id)?.name??"";
  const transportName=(id:string)=>{ const t=transports.find(x=>x.id===id); return t?`${t.name}${t.plate?` — ${t.plate}`:""}`:""; };
  const branchOf=(id:string)=>branches.find(b=>b.id===id);
  /* المدينة من لقطة الرحلة، وتُستكمل من الفرع للرحلات التي سبقت العمود. */
  const cityOf=(t:Trip)=>t.departureCity||branchOf(t.branchId)?.city||"";
  /* رحلة المحطات المتعددة تظهر تحت كل مدينة يمر عليها الباص، لا تحت
     أول محطة فقط. عنوان الجدول يبقى مدينة البداية (cityOf). */
  const citiesOf=(t:Trip)=>t.departureStops?.length
    ? [...new Set(t.departureStops.map(s=>s.city.trim()).filter(Boolean))]
    : [cityOf(t)].filter(Boolean);

  function toggleStatus(id:string){ setTrips(p=>p.map(t=>t.id===id?{...t,status:t.status==="full"?"open":"full"}:t)); }
  function cancelTrip(trip:Trip,reason:string){
    const impact=cancelImpact(trip,bookings,tickets);
    const at=new Date().toISOString();
    setTrips(p=>p.map(t=>t.id===trip.id?{...t,status:"cancelled",cancelReason:reason,cancelledAt:at}:t));
    setFollowUp({trip:{...trip,status:"cancelled",cancelReason:reason,cancelledAt:at},reason,impact});
  }
  /* الدفعة تُكتب رحلةً رحلة وتُنتظر كلٌّ منها: الفشل يُرجع الجدول إلى ما
     قبل الكتابة، فلو كُتبت معاً لمحا فشلُ واحدةٍ أخواتِها من الشاشة وهي
     محفوظة في القاعدة، ثم يُعيد الموظف الإطلاق فيكرّرها. واحدةً واحدة
     يُرجع الفشلُ الفاشلةَ وحدها، ويُقال للموظف أيّ تاريخ لم يُطلق. */
  async function handleSaveNew(ts:Trip[]):Promise<boolean>{
    const failed:Trip[]=[]; let reason="";
    for(const t of ts){
      clearSyncError();
      setTrips(p=>[t,...p]);
      const err=await flushSync();
      if(err){ failed.push(t); reason=err; }
    }
    const done=ts.filter(t=>!failed.includes(t));
    if(!done.length){ toast.error(ts.length===1?"تعذّر إطلاق الرحلة":"تعذّر إطلاق الرحلات",{description:reason}); return false; }
    closeLaunch();
    const dates=done.map(t=>shortDate(t.departureDate)).join(" · ");
    toast.success(done.length===1?"أُطلقت الرحلة":`أُطلقت ${tripsCount(done.length)}`,{description:`${pkgName(done[0].packageId)} · ${dates}`});
    if(failed.length) toast.error(`لم تُطلق: ${failed.map(t=>shortDate(t.departureDate)).join(" · ")}`,{description:reason,duration:12000});
    return true;
  }
  function handleSaveEdit([t]:Trip[]){ setTrips(p=>p.map(x=>x.id===t.id?t:x)); setEditId(null); toast.success("حُفظت تعديلات الرحلة"); }

  function closeLaunch(){ setShowLaunch(false); setLaunchPkgId(undefined); setLaunchDate(undefined); setBaseTrip(undefined); }
  /* مرشّح الباقة يسبق النموذج: مَن رشّح «عمرة ٣ أيام» ثم ضغط «إطلاق
     رحلة» يريدها لتلك الباقة — لا لقائمةٍ يعيد الاختيار منها. */
  function launchBlank(){ closeLaunch(); setLaunchPkgId(pkgFilter!=="all"?pkgFilter:undefined); setShowLaunch(true); }
  function launchOn(ds:string){ closeLaunch(); setLaunchDate(ds); setShowLaunch(true); }
  /* الرحلة الإضافية تُبنى على رحلةٍ قائمة: نفس الباقة واليوم والمدينة
     ونقطة الانطلاق والوقت. المركبة وحدها تُترك فارغة — حافلةٌ واحدة لا
     تكون في رحلتَين في اليوم نفسه، واختيارُ غيرها هو القرار الوحيد
     الباقي على الموظف. */
  function launchExtra(t:Trip){ closeLaunch(); setBaseTrip(t); setShowLaunch(true); }

  const {upcoming,past}=splitByHorizon(trips);
  const periodTrips = horizon==="past" ? past : upcoming;

  const cities=[...new Set(trips.flatMap(citiesOf))].sort((a,b)=>a.localeCompare(b,"ar"));

  /* المرشّحات على الحالة المعروضة لا المخزّنة: «ممتلئة» لا تُرجع رحلةً
     أُوقف حجزها وفيها مقاعد، و«مفتوحة» لا تُرجع رحلةً انطلقت أمس. */
  const matches=(t:Trip)=>
    (stateFilter==="all"||tripBoardState(t)===stateFilter)&&
    (pkgFilter==="all"||t.packageId===pkgFilter)&&
    (cityFilter==="all"||citiesOf(t).includes(cityFilter))&&
    (!query||t.id.toLowerCase().includes(query.toLowerCase())||pkgName(t.packageId).includes(query)||citiesOf(t).some(city=>city.includes(query))||t.departurePoint.includes(query)||(t.busPlate||"").includes(query));

  /* التقويم يقرأ كل ما بقي بعد المرشّحات عدا التاريخ: تحديدُ يومٍ يضيّق
     الجدول ولا يُفرغ الشهر الذي يُقرأ منه التوزيع. */
  const calendarTrips=periodTrips.filter(matches);
  const filtered=calendarTrips.filter(t=>!dateFilter||t.departureDate===dateFilter);
  const groups=groupByWeek(filtered,horizon);

  const totals=(()=>{
    const live=periodTrips.filter(t=>t.status!=="cancelled"&&t.status!=="archived");
    const capacity=live.reduce((a,t)=>a+seatsOf(t).capacity,0);
    const booked=live.reduce((a,t)=>a+seatsOf(t).booked,0);
    const available=live.reduce((a,t)=>a+seatsOf(t).available,0);
    const by=(s:TripBoardState)=>periodTrips.filter(t=>tripBoardState(t)===s).length;
    /* العدّ على القائم لا على السجل: رحلةٌ ألغيت ليست «قادمة» ولا
       «منتهية» — لها بطاقتها في الفترة الماضية ولا تُحشر في غيرها. */
    return {count:live.length,capacity,booked,available,
      pct:capacity>0?Math.round((booked/capacity)*100):0,
      open:by("open"),few:by("few"),full:by("full"),closed:by("closed"),cancelled:by("cancelled")+by("archived")};
  })();
  const soon=nextTrip(periodTrips);

  const filtersOn = stateFilter!=="all"||pkgFilter!=="all"||cityFilter!=="all"||!!dateFilter||!!query;
  function clearFilters(){ setStateFilter("all"); setPkgFilter("all"); setCityFilter("all"); setDateFilter(""); setSearch(""); }
  /* تبديل الفترة يُفرِّغ ما لا معنى له فيها: يومٌ اختير من شهرٍ آخر،
     وحالةٌ لا تُعرض هنا أصلاً — «ممتلئة» في الماضي مرشّحٌ لا يُرجع شيئاً
     ويبدو الجدول فارغاً بلا سبب. */
  function switchHorizon(h:Horizon){ setHorizon(h); setPicked(null); setDateFilter(""); setStateFilter("all"); }

  const detailTrip = detailId ? trips.find(t=>t.id===detailId) : undefined;
  const editTrip = editId ? trips.find(t=>t.id===editId) : undefined;

  /* نصّ كل حالةٍ من المعجم — ما تقوله القائمة هو ما تقوله الشارة في الصفّ. */
  const STATE_KEYS:TripBoardState[] = horizon==="past" ? ["ended","cancelled"] : ["open","few","full","closed","running","cancelled"];
  const STATE_OPTS:{value:string;label:string}[] = [{value:"all",label:"كل الحالات"},...STATE_KEYS.map(s=>({value:s,label:statusLabel(s,"trip")}))];
  const sellable=totals.open+totals.few;
  const horizonLabel=(text:string,n:number)=><>{text}<span style={{color:B.muted,fontWeight:500}}>{n}</span></>;

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{background: B.bg}}>
      <PageHeader title="الرحلات" crumb={horizon==="past"?"الرحلات الماضية":"جدول التشغيل"} search={search} onSearch={setSearch} onMenuOpen={onMenuOpen}
        actions={mayWrite&&horizon==="upcoming"&&<Button variant="primary" icon={<Plus size={16}/>} onClick={launchBlank}>إطلاق رحلة</Button>}/>
      <div className="px-4 md:px-8 pt-1">
        {/* أربع بطاقاتٍ لا خمس. القادمة: كم رحلة، كم مقعداً يُباع، كم بيع، وكم
            رحلةً امتلأت وتنتظر أختها — و«تقبل الحجز» سطرٌ تحت المقاعد لا بطاقةٌ
            خامسة. الماضية: «ملغاة» سطرٌ تحت المنتهية. والممتلئة تُرشِّح الجدول. */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {horizon==="past" ? <>
            <StatCard label="رحلات منتهية" value={totals.count} sub={totals.cancelled?`${totals.cancelled} ملغاة لا تُحتسب في الإشغال`:"خرجت من التشغيل"} accent/>
            <StatCard label="مسافرون" value={totals.booked} sub={`من سعة ${totals.capacity}`}/>
            <StatCard label="نسبة الإشغال" value={`${totals.pct}%`} sub="على الفترة كلها"/>
            <StatCard label="مقاعد لم تُبَع" value={totals.available} sub="فرصٌ فائتة"/>
          </> : <>
            <StatCard label="رحلات قادمة" value={totals.count} sub={soon?`أقرب رحلة ${fmtDateShort(soon.departureDate)} · ${untilLabel(soon)}`:"لا رحلات قادمة"} accent/>
            <StatCard label="مقاعد متاحة" value={totals.available} sub={sellable?`في ${tripsCount(sellable)} تقبل الحجز`:"لا رحلة تقبل الحجز"}/>
            <StatCard label="نسبة الإشغال" value={`${totals.pct}%`} sub={`محجوز ${totals.booked} من ${totals.capacity} مقعداً`}/>
            <StatCard label={statusLabel("full","trip")} value={totals.full} alert
              sub={[totals.full?"تحتاج رحلةً إضافية":"لا رحلة مكتملة",totals.few?`${totals.few} قاربت الامتلاء`:""].filter(Boolean).join(" · ")}
              onClick={()=>setStateFilter(f=>f==="full"?"all":"full")}/>
          </>}
        </div>
        {/* شريط الفترة والمرشّحات. الفترة انتقالٌ مستقل لا قسمٌ مطويّ داخل
            الصفحة: مقطّعٌ بخيارَين يقول أين أنت ويعيدك بضغطة — كان زرّاً في
            القادمة وشريطاً منقّطاً في الماضية. والمرشّحات أربعةٌ بلا عناوين
            فوقها: «كل الباقات» تسمّي نفسها، والاسم لقارئ الشاشة في aria-label. */}
        <div className="ts-toolbar">
          <Segmented label="الفترة" value={horizon} onChange={h=>{ if(h!==horizon) switchHorizon(h); }}
            options={[{value:"upcoming",label:horizonLabel("القادمة",upcoming.length)},{value:"past",label:horizonLabel("الماضية",past.length)}]}/>
          <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0 basis-full max-sm:order-3 sm:basis-[320px]">
            <div style={{flex:"1 1 150px",minWidth:140,maxWidth:220}}>
              <AppSelect value={pkgFilter} onChange={setPkgFilter} ariaLabel="تصفية بالباقة"
                options={[{value:"all",label:"كل الباقات"},...packages.map(p=>({value:p.id,label:p.name}))]}/>
            </div>
            <div style={{flex:"1 1 140px",minWidth:130,maxWidth:190}}>
              <AppSelect value={cityFilter} onChange={setCityFilter} ariaLabel="تصفية بمدينة الانطلاق"
                options={[{value:"all",label:"كل المدن"},...cities.map(c=>({value:c,label:c}))]}/>
            </div>
            <div style={{flex:"1 1 140px",minWidth:130,maxWidth:190}}>
              <AppSelect value={stateFilter} onChange={v=>setStateFilter(v as "all"|TripBoardState)} ariaLabel="تصفية بالحالة" options={STATE_OPTS}/>
            </div>
            <div style={{flex:"1 1 150px",minWidth:140,maxWidth:200}}>
              <button type="button" onClick={()=>setDateFilterOpen(true)} aria-label="تصفية بالتاريخ" aria-haspopup="dialog"
                className="ui-input flex items-center justify-between gap-2 cursor-pointer">
                <span className="truncate">{dateFilter ? fmtDayDate(dateFilter) : "كل التواريخ"}</span><CalendarDays size={16} style={{color:B.muted,flexShrink:0}}/>
              </button>
            </div>
            {filtersOn&&<Button variant="ghost" size="sm" icon={<X size={14}/>} onClick={clearFilters}>مسح المرشّحات</Button>}
          </div>
          <span className="ts-toolbar-end ts-count max-sm:order-2" aria-live="polite">
            {periodTrips.length===0?"لا رحلات":filtered.length===periodTrips.length?tripsCount(periodTrips.length):`${filtered.length} من ${periodTrips.length}`}
          </span>
        </div>
      </div>
      <main className="flex-1 px-4 md:px-8 pb-10 flex flex-col gap-4">
        <EntityGate entity="trips" label="الرحلات" skeleton="table" cols={10} rows={8}>
          <TripCalendar key={horizon} trips={calendarTrips} horizon={horizon} pkgName={pkgName} cityOf={cityOf}
            selected={picked} onSelect={setPicked} onOpen={t=>setDetailId(t.id)} onExtra={launchExtra}
            onLaunchOn={launchOn} mayWrite={mayWrite}/>
          {groups.length>0
            ? <TripsTable groups={groups} pkgName={pkgName} cityOf={cityOf}
                onOpen={t=>setDetailId(t.id)} onExtra={launchExtra} mayWrite={mayWrite}/>
            : <EmptyState
                icon={filtersOn?<SearchX size={22}/>:<Plane size={22}/>}
                title={filtersOn?"لا رحلات مطابقة للمرشّحات":horizon==="past"?"لا رحلات ماضية في السجل":"لا رحلات قادمة"}
                note={filtersOn?"جرّب مرشّحاً آخر أو أزل المرشّحات.":horizon==="past"?"الرحلات التي انتهى موعدها تنتقل إلى هنا.":"أطلق رحلةً على إحدى الباقات لتظهر في جدول التشغيل."}
                action={filtersOn
                  ? <Button variant="secondary" onClick={clearFilters}>إزالة المرشّحات</Button>
                  : mayWrite&&horizon==="upcoming" ? <Button variant="primary" icon={<Plus size={16}/>} onClick={launchBlank}>إطلاق رحلة</Button> : undefined}/>}
        </EntityGate>
      </main>
      {dateFilterOpen&&<TripDateFilterModal value={dateFilter} trips={calendarTrips} horizon={horizon} onChoose={v=>{setDateFilter(v);setPicked(v);}} onClear={()=>{setDateFilter("");setPicked(null);}} onClose={()=>setDateFilterOpen(false)}/>}
      {detailTrip&&(
        <TripDetailsModal trip={detailTrip} pkgName={pkgName(detailTrip.packageId)} hotelName={hotelName(detailTrip.hotelId)}
          transportName={transportName(detailTrip.transportId)} branch={branchOf(detailTrip.branchId)}
          impact={cancelImpact(detailTrip,bookings,tickets)} canEdit={mayWrite}
          onEdit={()=>{setDetailId(null);setEditId(detailTrip.id);}}
          onExtra={()=>{setDetailId(null);launchExtra(detailTrip);}}
          onToggleStatus={()=>toggleStatus(detailTrip.id)} onCancel={r=>cancelTrip(detailTrip,r)} onClose={()=>setDetailId(null)}/>
      )}
      {showLaunch&&(
        <TripFormModal key={baseTrip?.id??launchDate??launchPkgId??"blank"}
          mode="launch" packages={packages} branches={branches}
          prefillPkgId={launchPkgId} prefillDate={launchDate} baseTrip={baseTrip}
          onSave={handleSaveNew} onClose={closeLaunch}/>
      )}
      {editTrip&&(
        <TripFormModal mode="edit" initial={editTrip} packages={packages} branches={branches}
          onSave={handleSaveEdit} onClose={()=>setEditId(null)}/>
      )}
      {followUp&&(
        <CancelFollowUp trip={followUp.trip} pkgName={pkgName(followUp.trip.packageId)} reason={followUp.reason} impact={followUp.impact} onClose={()=>setFollowUp(null)}/>
      )}
    </div>
  );
}
