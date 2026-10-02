/* الرئيسية — كانت «قيد البناء» وهي أول ما يفتحه الموظف.

   قصدها سؤال واحد: ما الذي يحتاج عملاً الآن؟ لا لوحة أرقامٍ للزينة.
   لذلك ترتيبها: صفّ الأرقام، ثم «يحتاج إجراءً» (وكلّ بندٍ فيه ينقل إلى
   شاشته)، ثم رحلات الأسبوع، ثم آخر الطلبات.

   البند الأول في «يحتاج إجراءً» هو تجاوز وعد الردّ: الطلب الذي مضى على
   إرساله أكثر من الوعد. هذا ما يخسر عميلاً، وكان لا يظهر في أي شاشة —
   الموظف يعرفه إن فتح شاشة الطلبات وقرأ التواريخ صفّاً صفّاً.

   كل الأرقام مشتقّة من المخزن لحظةَ الرسم — لا حالة ثانية تتفارق معه. */
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { useNavigate } from "react-router";
import {
  AlertTriangle, ArrowLeft, BookOpen, CalendarClock, ChevronLeft, ChevronRight, CreditCard,
  RefreshCw, Sparkles, TrendingUp, Users, Armchair, X, BedDouble, Check, Minus, Plus,
} from "lucide-react";
import { B } from "@/lib/theme";
import { tripState, isSellable } from "@/lib/trip";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { useStore } from "@/store/useStore";
import { todayYMD } from "@/lib/utils";
import { sar } from "@/lib/money";
import { businessElapsed, configureSla, SLA_MS } from "@/features/customer/sla";
import { fetchSettings } from "@/data/settings";
import { isSupabaseEnabled, supabase } from "@/supabase/client";
import type { Booking, Trip } from "@/types";
import type { BookingTravellerCounts, Pilgrim, Pkg } from "@/types";
import { BusSeatGrid } from "@/components/BusSeatGrid";
import { busCountOf } from "@/lib/buses";
import { bookingRoomChoices, isPrivateAccommodation, packagePrice, roomCountOf, roomSplits, splitSummary, type RoomSplit } from "@/features/customer/roomSplit";
import { ALL_AUDIENCE, audienceOf, tierLabel, tiersForTraveller } from "@/data/housing";
import { newId } from "@/lib/utils";
import { flushSync, clearSyncError } from "@/store/useStore";
import { toast } from "sonner";

type ServerMetrics = { monthRevenue: number; todayBookings: number; pendingBookings: number; unlinkedBookings: number };

/* كانت هنا دالّة money محليّة تلصق «ر.س» بعدها في الرسم — الصياغة الآن
   من lib/money وحدها كي لا تتفرّق بين الشاشات. */

/** يوم بإزاحة — لنافذة «الأسبوع القادم» بلا مكتبة تواريخ. */
function ymdPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** لحظة إرسال الطلب. submittedAt طابع كامل، وcreatedAt تاريخ بلا ساعة —
    فالثاني يُقرأ بداية يومه: تقديرٌ متحفّظ لا يزعم دقّةً لا نملكها. */
function sentAt(b: Booking): number | null {
  if (b.submittedAt) { const t = Date.parse(b.submittedAt); if (!Number.isNaN(t)) return t; }
  if (b.createdAt) { const t = Date.parse(b.createdAt.replace(" ", "T")); if (!Number.isNaN(t)) return t; }
  return null;
}

/** كم انتظر أقدم بند، ومن يتولّاه. */
type Oldest = { at: number | null; staff?: string } | null;

/** مدّة الانتظار بأكبر وحدة تُقرأ: يومان أوضح من «٥١ ساعة». */
function waited(at: number): string {
  const h = Math.floor((Date.now() - at) / 3_600_000);
  if (h < 1) return "أقل من ساعة";
  if (h < 24) return `${h} ساعة`;
  const d = Math.floor(h / 24);
  return d === 1 ? "يوماً" : d === 2 ? "يومين" : `${d} أيام`;
}

/* سطر «الأقدم والمسؤول» لكل بند لا للمتأخّر وحده: العدد يقول كم بقي،
   ولا يقول ما إن كان أقدمها ينتظر ساعةً أو ثلاثة أيام، ولا من يتولّاه.
   والرقمان معاً هما ما يحدّد أيّها يُفتح أولاً. */
function oldestNote(o: Oldest): string | null {
  if (!o || o.at === null) return null;
  return `الأقدم منذ ${waited(o.at)} · المسؤول: ${o.staff?.trim() || "غير معيّن"}`;
}

/** بطاقة «يحتاج إجراءً» — الرقم، وأقدم انتظار، والنقل إلى شاشته. */
function ActionRow({ icon: Icon, label, count, note, tone, onGo, oldest }: {
  icon: typeof BookOpen; label: string; count: number; note: string;
  tone: { fg: string }; onGo: () => void; oldest?: Oldest;
}) {
  if (!count) return null;
  const wait = oldestNote(oldest ?? null);
  return (
    <button onClick={onGo}
      className="relative overflow-hidden w-full flex items-center gap-3 px-4 py-3.5 text-start cursor-pointer rounded-xl"
      style={{ background: B.surface, border: `1px solid ${B.border}` }}>
      {/* شريطٌ على الحافة يحمل لون الحالة. كانت الحالة تصبغ خلفية الصفّ
          كلَّه، فتصطفّ أربعةُ أسطحٍ ملوّنة في قائمةٍ واحدة داخل بطاقةٍ
          بيضاء. اللون باقٍ لأنه يفرّق «متأخّر» عن «قيد المراجعة»، لكنه
          انتقل إلى ٣ بكسل وأيقونة — إشارةٌ لا سطح. */}
      <span aria-hidden className="absolute inset-y-0" style={{ insetInlineStart: 0, width: 3, background: tone.fg }} />
      <Icon size={17} style={{ color: tone.fg, flexShrink: 0 }} />
      <span className="flex-1 min-w-0">
        <span className="block font-bold text-sm" style={{ color: B.black }}>
          {label} · <span style={{ fontFamily: "var(--font-app)", color: B.gold }}>{count}</span>
        </span>
        <span className="block text-xs mt-0.5" style={{ color: B.muted }}>{note}</span>
        {wait && <span className="block text-xs mt-1 font-bold" style={{ color: tone.fg }}>{wait}</span>}
      </span>
      <ArrowLeft size={15} style={{ color: B.muted, flexShrink: 0 }} />
    </button>
  );
}

const TONE = {
  red: { fg: "#BE2626" },
  amber: { fg: "#8A6A08" },
  violet: { fg: "#7226BE" },
  blue: { fg: "#1E52C7" },
};

const shortDay = (iso: string) => new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { weekday:"short", day:"numeric", month:"short" }).format(new Date(`${iso}T12:00:00`));
const totalPeople = (c: BookingTravellerCounts) => c.men + c.women + (c.children ?? 0);
const validPhone = (value: string) => /^(05\d{8}|(\+?966)5\d{8})$/.test(value.replace(/\s/g,""));
const arSplit = (s: RoomSplit) => splitSummary(s, k => ({guests:"أفراد",spotsUnit:"أماكن",roomsUnit:"غرف"})[k] ?? k);

/** محطة الموظف داخل الرئيسية: اختيار رحلة ثم مقاعد ثم طلب واحد يمر في
    سجل الحجوزات نفسه. لا توجد هنا نسخة ثانية من الطلب أو من الكروكي. */
function OperationsCenter({ trips, packages }: { trips: Trip[]; packages: Pkg[] }) {
  const bookings=useStore(s=>s.bookings); const transports=useStore(s=>s.transports);
  const currentUser=useStore(s=>s.currentUser); const setBookings=useStore(s=>s.setBookings);
  const refreshTrips=useStore(s=>s.refreshTrips);
  const [from,setFrom]=useState(todayYMD()); const [selectedId,setSelectedId]=useState<string|null>(null);
  const [counts,setCounts]=useState<BookingTravellerCounts>({men:1,women:0,children:0});
  const [seats,setSeats]=useState<number[]>([]); const [split,setSplit]=useState<RoomSplit|null>(null);
  const [name,setName]=useState(""); const [phone,setPhone]=useState(""); const [email,setEmail]=useState("");
  const [docType,setDocType]=useState("national_id"); const [idNumber,setIdNumber]=useState(""); const [nationality,setNationality]=useState("سعودي"); const [birthDate,setBirthDate]=useState("");
  const [discount,setDiscount]=useState(0); const [saving,setSaving]=useState(false);
  const until=ymdPlus(20);
  const visible=useMemo(()=>trips.filter(t=>isSellable(t)&&t.departureDate>=from&&t.departureDate<=until).sort((a,b)=>`${a.departureDate}${a.departureTime}`.localeCompare(`${b.departureDate}${b.departureTime}`)),[trips,from,until]);
  const selected=visible.find(t=>t.id===selectedId) ?? visible[0] ?? null;
  const pkg=packages.find(p=>p.id===selected?.packageId);
  const transport=transports.find(t=>t.id===(selected?.transportId||pkg?.transportId));
  const people=totalPeople(counts);
  const occupied=useMemo(()=>new Set(bookings.filter(b=>b.tripId===selected?.id&&!["cancelled","rejected"].includes(b.status)).flatMap(b=>[...b.seats,...(b.privacySeats??[])])),[bookings,selected?.id]);
  const genderAt=(seat:number)=>{ const b=bookings.find(x=>x.tripId===selected?.id&&x.seats.includes(seat)); return b?.travellerCounts?.women&&b.seats.indexOf(seat)>=b.travellerCounts.men?"female" as const:"male" as const; };
  const housing=!!pkg&&(pkg.nights??0)>0&&pkg.roomPrices.length>0;
  const options=useMemo(()=>pkg&&housing?roomSplits(pkg.roomPrices,people):[],[pkg,housing,people]);
  useEffect(()=>{setSeats([]);},[selected?.id]);
  useEffect(()=>setSplit(old=>old&&options.some(x=>x.key===old.key)?old:(options[0]??null)),[options]);
  const price=split&&pkg?packagePrice(split,people,pkg.seatCostOverride??transport?.seatCost??0,pkg.nights):null;
  const base=price?.total??((selected?.price??pkg?.marketPrice??0)*people); const final=Math.max(0,base-discount);
  const change=(key:"men"|"women",n:number)=>{const other=key==="men"?counts.women:counts.men; const max=Math.max(0,(selected?.seats??0)-occupied.size-other);setCounts(c=>({...c,[key]:Math.max(0,Math.min(max,n))}));};
  const toggle=(seat:number)=>setSeats(old=>old.includes(seat)?old.filter(x=>x!==seat):(old.length<people?[...old,seat]:old));
  async function save(){
    if(!selected||!pkg||people<1||seats.length!==people||!name.trim()||!validPhone(phone)||!idNumber.trim()||!nationality.trim()||!birthDate||(housing&&!split)){toast.error("أكمل بيانات صاحب الحجز، السكن والمقاعد قبل الحفظ.");return;}
    setSaving(true); clearSyncError(); const id=newId("TSH"); const pilgrim:Pilgrim={name:name.trim(),docType:docType as Pilgrim["docType"],idNumber:idNumber.trim(),nationality,gender:counts.women&&!counts.men?"female":"male",birthDate,phone:phone.replace(/\s/g,"")};
    setBookings(rows=>[{id,tripId:selected.id,packageId:pkg.id,clientName:name.trim(),clientPhone:phone.replace(/\s/g,""),roomType:split?arSplit(split):"",rooms:split?.rooms.map(r=>({tierId:r.id,type:r.type,persons:r.persons,perNight:r.perNight})),persons:people,travellerCounts:counts,total:final,status:"awaiting_payment",paymentStatus:"none",payMethod:"آجل للموظف",seats:[...seats].sort((a,b)=>a-b),createdAt:todayYMD(),staff:currentUser?.name??"—",createdBy:currentUser?.id,branchId:currentUser?.branch,source:"internal",sentDate:"",pilgrims:[pilgrim]},...rows]);
    const err=await flushSync(); setSaving(false); if(err){toast.error(err);return;} toast.success("أُنشئ الطلب بانتظار الدفع.",{description:`${id} · المتبقي ${sar(final)}`}); setName("");setPhone("");setEmail("");setIdNumber("");setBirthDate("");setSeats([]);setDiscount(0);void refreshTrips();
  }
  return <section className="rounded-2xl overflow-hidden" style={{background:"#fff",border:`1px solid ${B.border}`,boxShadow:"0 10px 28px rgba(40,28,10,.04)"}}>
    <div className="px-5 py-4 flex flex-wrap items-center gap-3" style={{borderBottom:`1px solid ${B.border}`}}><div className="flex-1"><span className="text-xs font-bold" style={{color:B.gold}}>مركز عمليات الرحلات</span><h2 className="text-xl font-extrabold mt-1" style={{color:B.primaryDeep}}>احجز للعميل من شاشة واحدة</h2></div><div className="flex gap-2"><button onClick={()=>setFrom(ymdPlus(-7))} className="p-2 rounded-lg cursor-pointer" style={{background:B.fill,border:`1px solid ${B.border}`}}><ChevronRight size={17}/></button><button onClick={()=>setFrom(todayYMD())} className="px-3 rounded-lg text-xs font-bold cursor-pointer" style={{background:B.cream,border:`1px solid #E4C889`,color:"#8A6A08"}}>اليوم</button><button onClick={()=>setFrom(ymdPlus(7))} className="p-2 rounded-lg cursor-pointer" style={{background:B.fill,border:`1px solid ${B.border}`}}><ChevronLeft size={17}/></button></div></div>
    <div className="grid grid-cols-1 xl:grid-cols-[330px_minmax(0,1fr)_340px]">
      <aside style={{borderInlineEnd:`1px solid ${B.border}`}}><div className="px-4 py-3 text-xs font-bold" style={{color:B.muted}}>من {shortDay(from)} · الرحلات خلال ٢٠ يوماً</div>{visible.length?visible.map(t=>{const p=packages.find(x=>x.id===t.packageId);const active=t.id===selected?.id;return <button key={t.id} onClick={()=>setSelectedId(t.id)} className="w-full text-right px-4 py-3.5 cursor-pointer" style={{background:active?B.cream:"#fff",border:"none",borderTop:`1px solid ${B.border}`,boxShadow:active?`inset -3px 0 ${B.gold}`:"none"}}><strong className="block text-sm truncate" style={{color:B.black}}>{p?.name??"رحلة"}</strong><span className="block text-xs mt-1" style={{color:B.muted}}>{shortDay(t.departureDate)} · {t.departureTime}</span><b className="block text-sm mt-1" style={{color:"#8A6A08"}}>{Math.max(0,t.seats-t.bookedSeats)} مقعد متاح</b></button>;}):<div className="p-8 text-center text-sm" style={{color:B.muted}}>لا رحلات متاحة في هذه الفترة</div>}</aside>
      <div className="p-5">{selected&&pkg?<><div className="flex flex-wrap justify-between gap-3 mb-4"><div><span className="text-xs font-bold" style={{color:B.gold}}>الرحلة المحددة</span><h3 className="text-2xl font-extrabold mt-1" style={{color:B.primaryDeep}}>{pkg.name}</h3><p className="text-xs mt-2" style={{color:B.muted}}>{shortDay(selected.departureDate)} · {selected.departureTime} · {selected.departurePoint}</p></div><div className="rounded-xl px-4 py-2 text-center" style={{background:B.cream,border:"1px solid #E4C889"}}><small style={{color:B.muted}}>المقاعد المتبقية</small><b className="block text-2xl" style={{color:"#8A6A08"}}>{selected.seats-occupied.size}</b></div></div><BusSeatGrid key={selected.id} capacity={selected.seats} buses={busCountOf(selected)} occupied={occupied} selected={seats} need={people} onToggle={toggle} occGender={genderAt} selGender={(n)=>seats.indexOf(n)<counts.men?"male":"female"}/></>:<div className="py-16 text-center" style={{color:B.muted}}>اختر رحلة لبدء الحجز</div>}</div>
      <aside className="p-5" style={{background:"#FDFCFA",borderInlineStart:`1px solid ${B.border}`}}><h3 className="font-extrabold" style={{color:B.primaryDeep}}>بيانات الحجز</h3><div className="grid gap-3 mt-4"><label className="text-xs font-bold" style={{color:B.text2}}>اسم صاحب الحجز *<input value={name} onChange={e=>setName(e.target.value)} className="w-full mt-1 p-2.5 rounded-xl" style={{border:`1px solid ${B.border}`}}/></label><label className="text-xs font-bold" style={{color:B.text2}}>الجوال *<input value={phone} onChange={e=>setPhone(e.target.value)} className="w-full mt-1 p-2.5 rounded-xl" style={{border:`1px solid ${B.border}`,direction:"ltr"}}/></label><label className="text-xs font-bold" style={{color:B.text2}}>البريد الإلكتروني <span style={{color:B.muted,fontWeight:400}}>(اختياري)</span><input value={email} onChange={e=>setEmail(e.target.value)} className="w-full mt-1 p-2.5 rounded-xl" style={{border:`1px solid ${B.border}`,direction:"ltr"}}/></label><div className="grid grid-cols-2 gap-2"><label className="text-xs font-bold" style={{color:"#1E52C7"}}>رجال<input type="number" min="0" value={counts.men} onChange={e=>change("men",Number(e.target.value))} className="w-full mt-1 p-2.5 rounded-xl" style={{border:"1px solid #CBDBFB"}}/></label><label className="text-xs font-bold" style={{color:"#B4266E"}}>نساء<input type="number" min="0" value={counts.women} onChange={e=>change("women",Number(e.target.value))} className="w-full mt-1 p-2.5 rounded-xl" style={{border:"1px solid #F3CADF"}}/></label></div><div className="grid grid-cols-2 gap-2"><label className="text-xs font-bold" style={{color:B.text2}}>نوع الوثيقة<select value={docType} onChange={e=>setDocType(e.target.value)} className="w-full mt-1 p-2.5 rounded-xl" style={{border:`1px solid ${B.border}`}}><option value="national_id">هوية وطنية</option><option value="iqama">إقامة</option><option value="passport">جواز سفر</option></select></label><label className="text-xs font-bold" style={{color:B.text2}}>رقم الوثيقة *<input value={idNumber} onChange={e=>setIdNumber(e.target.value)} className="w-full mt-1 p-2.5 rounded-xl" style={{border:`1px solid ${B.border}`}}/></label></div><div className="grid grid-cols-2 gap-2"><label className="text-xs font-bold" style={{color:B.text2}}>الجنسية *<input value={nationality} onChange={e=>setNationality(e.target.value)} className="w-full mt-1 p-2.5 rounded-xl" style={{border:`1px solid ${B.border}`}}/></label><label className="text-xs font-bold" style={{color:B.text2}}>تاريخ الميلاد *<input type="date" value={birthDate} onChange={e=>setBirthDate(e.target.value)} className="w-full mt-1 p-2.5 rounded-xl" style={{border:`1px solid ${B.border}`}}/></label></div>{housing&&<div><span className="text-xs font-bold" style={{color:B.text2}}>السكن *</span><div className="flex flex-wrap gap-2 mt-1">{options.map(o=><button key={o.key} onClick={()=>setSplit(o)} className="px-2 py-2 rounded-lg text-xs font-bold cursor-pointer" style={{background:split?.key===o.key?B.gold:"#fff",border:`1px solid ${split?.key===o.key?B.gold:B.border}`}}>{arSplit(o)}</button>)}</div></div>}<label className="text-xs font-bold" style={{color:B.text2}}>خصم متفق عليه (ر.س)<input type="number" min="0" value={discount||""} onChange={e=>setDiscount(Number(e.target.value)||0)} className="w-full mt-1 p-2.5 rounded-xl" style={{border:`1px solid ${B.border}`}}/></label><div className="rounded-xl p-3" style={{background:B.cream,border:"1px solid #EDE4CF"}}><span className="text-xs" style={{color:B.muted}}>الإجمالي المستحق</span><b className="block text-xl mt-1" style={{color:B.primaryDeep}}>{sar(final)}</b>{discount>0&&<small style={{color:"#1E7A44"}}>يشمل خصماً {sar(discount)}</small>}</div><button onClick={save} disabled={saving||!selected} className="py-3 rounded-xl font-extrabold cursor-pointer" style={{background:saving?"#D6CFC6":B.gold,border:"none",color:B.black}}>{saving?"جارٍ إنشاء الطلب…":"إنشاء الطلب · بانتظار الدفع"}</button></div></aside>
    </div></section>;
}

/** محطة الاستقبال تتبع نفس كتالوج العميل: لا أسعار غرف أو خيارات سكن
    محلية هنا. الاختلاف الوحيد هو أن الموظف يختار المقاعد بنفسه. */
function ReceptionOperationsCenter({ trips, packages }: { trips: Trip[]; packages: Pkg[] }) {
  const bookings = useStore(s => s.bookings);
  const transports = useStore(s => s.transports);
  const hotels = useStore(s => s.hotels);
  const currentUser = useStore(s => s.currentUser);
  const setBookings = useStore(s => s.setBookings);
  const refreshTrips = useStore(s => s.refreshTrips);
  const [rangeStart, setRangeStart] = useState(todayYMD());
  const [selectedDate, setSelectedDate] = useState(todayYMD());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [counts, setCounts] = useState<BookingTravellerCounts>({ men: 0, women: 0, children: 0 });
  const [seats, setSeats] = useState<number[]>([]);
  const [split, setSplit] = useState<RoomSplit | null>(null);
  const [paidAtBranch, setPaidAtBranch] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [email, setEmail] = useState("");
  const [docType, setDocType] = useState("national_id"); const [idNumber, setIdNumber] = useState(""); const [nationality, setNationality] = useState("سعودي"); const [birthDate, setBirthDate] = useState(""); const [discount, setDiscount] = useState(0);

  const dates = useMemo(() => Array.from({ length: 10 }, (_, index) => {
    const value = new Date(`${rangeStart}T12:00:00`);
    value.setDate(value.getDate() + index);
    return value.toISOString().slice(0, 10);
  }), [rangeStart]);
  const availableTrips = useMemo(() => trips.filter(trip => isSellable(trip)).sort((a, b) => `${a.departureDate}${a.departureTime}`.localeCompare(`${b.departureDate}${b.departureTime}`)), [trips]);
  const dayTrips = useMemo(() => availableTrips.filter(t => t.departureDate === selectedDate), [availableTrips, selectedDate]);
  const selected = dayTrips.find(t => t.id === selectedId) ?? null;
  const pkg = packages.find(p => p.id === selected?.packageId);
  const transport = transports.find(t => t.id === (selected?.transportId || pkg?.transportId));
  const hotel = hotels.find(h => h.id === (selected?.hotelId || pkg?.hotelId));
  const people = totalPeople(counts);
  const occupied = useMemo(() => new Set(bookings.filter(b => b.tripId === selected?.id && !["cancelled", "rejected"].includes(b.status)).flatMap(b => [...b.seats, ...(b.privacySeats ?? [])])), [bookings, selected?.id]);
  const seatsLeft = Math.max(0, (selected?.seats ?? 0) - occupied.size);
  const housing = !!pkg && pkg.nights > 0 && pkg.roomPrices.length > 0;
  const audienceType: "male_solo" | "female_solo" | "family" = counts.men && counts.women ? "family" : counts.women ? "female_solo" : "male_solo";
  const audienceRestricted = !!pkg && pkg.roomPrices.some(room => {
    const audience = audienceOf(room);
    return audience.length !== ALL_AUDIENCE.length || !ALL_AUDIENCE.every(type => audience.includes(type));
  });
  const roomTiers = !pkg ? [] : audienceRestricted ? (people ? tiersForTraveller(pkg.roomPrices, audienceType) : []) : pkg.roomPrices;
  const roomOptions = useMemo(() => bookingRoomChoices(roomTiers, people), [roomTiers, people]);
  const price = split && pkg ? packagePrice(split, people, pkg.seatCostOverride ?? transport?.seatCost ?? 0, pkg.nights) : null;
  const total = Math.max(0, (price?.total ?? (selected?.price ?? pkg?.marketPrice ?? 0) * people) - discount);
  const seatsPicked = people > 0 && seats.length === people;

  useEffect(() => { setSeats([]); setCounts({ men: 0, women: 0, children: 0 }); }, [selected?.id]);
  useEffect(() => { setSeats(current => current.slice(0, people)); }, [people]);
  useEffect(() => { setSplit(current => current && roomOptions.some(option => option.key === current.key) ? current : (roomOptions[0] ?? null)); }, [roomOptions]);

  const selectDate = (date: string) => { setSelectedDate(date); setSelectedId(null); };
  const shiftDates = (days: number) => { const next = new Date(`${rangeStart}T12:00:00`); next.setDate(next.getDate() + days); const iso = next.toISOString().slice(0, 10); setRangeStart(iso); selectDate(iso); };
  const changeCount = (key: "men" | "women", delta: number) => {
    if (!selected) return;
    setCounts(current => {
      const other = key === "men" ? current.women : current.men;
      const max = Math.max(0, seatsLeft - other);
      return { ...current, [key]: Math.max(0, Math.min(max, current[key] + delta)) };
    });
  };
  const toggleSeat = (seat: number) => setSeats(current => current.includes(seat) ? current.filter(value => value !== seat) : current.length < people ? [...current, seat] : current);
  const genderAt = (seat: number) => { const booking = bookings.find(item => item.tripId === selected?.id && item.seats.includes(seat)); return booking?.travellerCounts?.women && booking.seats.indexOf(seat) >= booking.travellerCounts.men ? "female" as const : "male" as const; };

  async function save() {
    if (!seatsPicked) { toast.error("اختر مقاعد جميع المعتمرين قبل الانتقال إلى الدفع أو إنشاء الطلب."); return; }
    if (!selected || !pkg || !name.trim() || !validPhone(phone) || !idNumber.trim() || !nationality.trim() || !birthDate || (housing && !split)) { toast.error("أكمل بيانات صاحب الحجز والسكن قبل الحفظ."); return; }
    const id = newId("TSH"); const paid = paidAtBranch;
    const pilgrim: Pilgrim = { name: name.trim(), docType: docType as Pilgrim["docType"], idNumber: idNumber.trim(), nationality, gender: counts.women && !counts.men ? "female" : "male", birthDate, phone: phone.replace(/\s/g, "") };
    setSaving(true); clearSyncError();
    setBookings(rows => [{ id, tripId: selected.id, packageId: pkg.id, clientName: name.trim(), clientPhone: phone.replace(/\s/g, ""), roomType: split ? arSplit(split) : "", rooms: split?.rooms.map(room => ({ tierId: room.id, type: room.type, persons: room.persons, perNight: room.perNight })), persons: people, travellerCounts: counts, pricing: price ? { seatPrice: price.seatPrice, transportTotal: price.transport, accommodationNightly: split?.perNight ?? 0, roomCount: price.roomCount, nights: price.nights, accommodationTotal: price.accommodation } : undefined, total, status: paid ? "paid" : "awaiting_payment", paymentStatus: paid ? "verified" : "none", payMethod: paid ? "دفع في الفرع · شبكة" : "آجل للموظف", payDate: paid ? todayYMD() : undefined, seats: [...seats].sort((a, b) => a - b), createdAt: todayYMD(), staff: currentUser?.name ?? "—", createdBy: currentUser?.id, branchId: currentUser?.branch, source: "internal", sentDate: "", pilgrims: [pilgrim] }, ...rows]);
    const error = await flushSync(); setSaving(false); if (error) { toast.error(error); return; }
    toast.success(paid ? "أُنشئ الحجز كمدفوع في الفرع." : "أُنشئ الطلب بانتظار الدفع.", { description: `${id} · ${sar(total)}` });
    setName(""); setPhone(""); setEmail(""); setIdNumber(""); setBirthDate(""); setSeats([]); setDiscount(0); setPaidAtBranch(false); void refreshTrips();
  }
  const Counter = ({ label, value, tone, tint, onChange }: { label: string; value: number; tone: string; tint: string; onChange: (delta: number) => void }) => <div className="rounded-xl p-3" style={{ background: tint, border: `1px solid ${tone}33` }}><span className="block text-xs font-bold mb-2" style={{ color: tone }}>{label}</span><div className="flex items-center justify-between"><button type="button" disabled={!selected || value === 0} onClick={() => onChange(-1)} className="w-8 h-8 flex items-center justify-center rounded-lg cursor-pointer" style={{ background: "#fff", border: `1px solid ${tone}66`, color: tone }}><Minus size={15}/></button><b style={{ color: B.black }}>{value}</b><button type="button" disabled={!selected || people >= seatsLeft} onClick={() => onChange(1)} className="w-8 h-8 flex items-center justify-center rounded-lg cursor-pointer" style={{ background: "#fff", border: `1px solid ${tone}66`, color: tone }}><Plus size={15}/></button></div></div>;
  const inputStyle = { border: `1px solid ${B.border}` };

  return <section className={`reception-booking ${seatsPicked ? "is-seat-ready" : "is-seat-pending"} rounded-2xl overflow-hidden`} style={{ background: "#fff", border: `1px solid ${B.border}`, boxShadow: "0 10px 28px rgba(40,28,10,.04)" }}>
    <header className="px-5 py-4 flex flex-wrap items-center gap-3" style={{ borderBottom: `1px solid ${B.border}` }}><div className="flex-1"><span className="text-xs font-bold" style={{ color: B.gold }}>مركز عمليات الرحلات</span><h2 className="text-xl font-extrabold mt-1" style={{ color: B.primaryDeep }}>حجز استقبال سريع</h2><p className="text-xs mt-1" style={{ color: B.muted }}>اليوم ← الرحلة ← المعتمرون ← المقاعد ← السكن ← الدفع</p></div><div className="flex gap-2"><button type="button" onClick={() => shiftDates(-7)} aria-label="الأسبوع السابق" className="p-2 rounded-lg cursor-pointer" style={{ background: B.fill, border: `1px solid ${B.border}` }}><ChevronRight size={17}/></button><button type="button" onClick={() => { setRangeStart(todayYMD()); selectDate(todayYMD()); }} className="px-3 rounded-lg text-xs font-bold cursor-pointer" style={{ background: B.cream, border: "1px solid #E4C889", color: "#8A6A08" }}>اليوم</button><button type="button" onClick={() => shiftDates(7)} aria-label="الأسبوع التالي" className="p-2 rounded-lg cursor-pointer" style={{ background: B.fill, border: `1px solid ${B.border}` }}><ChevronLeft size={17}/></button></div></header>
    <div className="p-4 overflow-x-auto" style={{ background: "#FDFCFA", borderBottom: `1px solid ${B.border}` }}><div className="grid gap-2 min-w-[800px]" style={{ gridTemplateColumns: "repeat(10, minmax(76px, 1fr))" }}>{dates.map(date => { const count = availableTrips.filter(trip => trip.departureDate === date).length; const active = selectedDate === date; const value = new Date(`${date}T12:00:00`); return <button key={date} type="button" onClick={() => selectDate(date)} className="rounded-xl py-2.5 text-center cursor-pointer" style={{ background: active ? B.gold : count ? "#fff" : "#F1F0EE", border: `1px solid ${active ? B.gold : count ? B.border : "#E6E3DF"}`, color: count || active ? B.black : "#AAA49B" }}><span className="block text-[11px] font-bold">{new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { weekday: "short" }).format(value)}</span><strong className="block text-lg leading-tight">{value.getDate()}</strong><small className="block mt-1 text-[10px]">{count ? `${count} رحلة` : "لا رحلات"}</small></button>; })}</div></div>
    <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
      <aside style={{ borderInlineEnd: `1px solid ${B.border}` }}><div className="px-4 py-3 text-xs font-bold" style={{ color: B.muted }}>رحلات {shortDay(selectedDate)}</div>{dayTrips.length ? dayTrips.map(trip => { const active = trip.id === selected?.id; const packageName = packages.find(item => item.id === trip.packageId)?.name ?? "رحلة"; return <button key={trip.id} type="button" onClick={() => setSelectedId(trip.id)} className="w-full text-right px-4 py-3.5 cursor-pointer" style={{ background: active ? B.cream : "#fff", border: "none", borderTop: `1px solid ${B.border}`, boxShadow: active ? `inset -3px 0 ${B.gold}` : "none" }}><b className="block text-sm truncate" style={{ color: B.black }}>{packageName}</b><span className="block text-xs mt-1" style={{ color: B.muted }}>{trip.departureTime} · {trip.departurePoint}</span><strong className="block text-sm mt-1" style={{ color: "#8A6A08" }}>{Math.max(0, trip.seats - trip.bookedSeats)} مقعد متاح</strong></button>; }) : <div className="p-8 text-center text-sm" style={{ color: B.muted }}>لا توجد رحلات متاحة في هذا اليوم</div>}</aside>
      <main className="p-5">{selected && pkg ? <><div className="flex flex-wrap justify-between gap-3 mb-4"><div><span className="text-xs font-bold" style={{ color: B.gold }}>الرحلة المحددة</span><h3 className="text-2xl font-extrabold mt-1" style={{ color: B.primaryDeep }}>{pkg.name}</h3><p className="text-xs mt-2" style={{ color: B.muted }}>{selected.departureTime} · {selected.departurePoint}</p></div><div className="rounded-xl px-4 py-2 text-center" style={{ background: B.cream, border: "1px solid #E4C889" }}><small style={{ color: B.muted }}>المقاعد المتبقية</small><b className="block text-2xl" style={{ color: "#8A6A08" }}>{seatsLeft}</b></div></div>{people ? <BusSeatGrid key={selected.id} capacity={selected.seats} buses={busCountOf(selected)} occupied={occupied} selected={seats} need={people} onToggle={toggleSeat} occGender={genderAt} selGender={seat => seats.indexOf(seat) < counts.men ? "male" : "female"}/> : <div className="py-16 rounded-2xl text-center" style={{ background: B.fill, border: `1px dashed ${B.border}`, color: B.muted }}><Users className="mx-auto mb-3" size={26}/><b className="block" style={{ color: B.text2 }}>حدّد عدد الرجال والنساء أولاً</b><span className="text-xs block mt-2">لن يفتح كروكي المقاعد إلا بعد تحديد العدد.</span></div>}</> : <div className="py-16 text-center" style={{ color: B.muted }}>اختر رحلة لبدء الحجز</div>}</main>
      <aside className="p-5" style={{ background: "#FDFCFA", borderInlineStart: `1px solid ${B.border}` }}><h3 className="font-extrabold" style={{ color: B.primaryDeep }}>بيانات الحجز</h3><div className="grid gap-3 mt-4"><div><span className="text-xs font-bold" style={{ color: B.text2 }}>عدد المعتمرين</span><div className="grid grid-cols-2 gap-2 mt-1"><Counter label="المعتمرون الرجال" value={counts.men} tone="#1E52C7" tint="#EAF2FD" onChange={delta => changeCount("men", delta)}/><Counter label="المعتمرات النساء" value={counts.women} tone="#B4266E" tint="#FDEBF3" onChange={delta => changeCount("women", delta)}/></div><div className="mt-2 px-3 py-2 rounded-lg flex justify-between text-xs font-bold" style={{ background: "#FFF8EB", border: "1px solid #EBD9B9", color: B.text2 }}><span>إجمالي المقاعد المطلوبة</span><b style={{ color: B.black }}>{people} {people === 1 ? "مقعد" : "مقاعد"}</b></div></div><label className="text-xs font-bold" style={{ color: B.text2 }}>اسم صاحب الحجز *<input value={name} onChange={event => setName(event.target.value)} className="w-full mt-1 p-2.5 rounded-xl" style={inputStyle}/></label><label className="text-xs font-bold" style={{ color: B.text2 }}>الجوال *<input value={phone} onChange={event => setPhone(event.target.value)} className="w-full mt-1 p-2.5 rounded-xl" style={{ ...inputStyle, direction: "ltr" }}/></label><label className="text-xs font-bold" style={{ color: B.text2 }}>البريد الإلكتروني <span style={{ color: B.muted, fontWeight: 400 }}>(اختياري)</span><input value={email} onChange={event => setEmail(event.target.value)} className="w-full mt-1 p-2.5 rounded-xl" style={{ ...inputStyle, direction: "ltr" }}/></label><div className="grid grid-cols-2 gap-2"><label className="text-xs font-bold" style={{ color: B.text2 }}>نوع الوثيقة<select value={docType} onChange={event => setDocType(event.target.value)} className="w-full mt-1 p-2.5 rounded-xl" style={inputStyle}><option value="national_id">هوية وطنية</option><option value="iqama">إقامة</option><option value="passport">جواز سفر</option></select></label><label className="text-xs font-bold" style={{ color: B.text2 }}>رقم الوثيقة *<input value={idNumber} onChange={event => setIdNumber(event.target.value)} className="w-full mt-1 p-2.5 rounded-xl" style={inputStyle}/></label></div><div className="grid grid-cols-2 gap-2"><label className="text-xs font-bold" style={{ color: B.text2 }}>الجنسية *<input value={nationality} onChange={event => setNationality(event.target.value)} className="w-full mt-1 p-2.5 rounded-xl" style={inputStyle}/></label><label className="text-xs font-bold" style={{ color: B.text2 }}>تاريخ الميلاد *<input type="date" value={birthDate} onChange={event => setBirthDate(event.target.value)} className="w-full mt-1 p-2.5 rounded-xl" style={inputStyle}/></label></div>{housing && <AccommodationChoices people={people} options={roomOptions} split={split} setSplit={setSplit} hotelName={hotel?.name}/>}<label className="text-xs font-bold" style={{ color: B.text2 }}>خصم متفق عليه (ر.س)<input type="number" min="0" value={discount || ""} onChange={event => setDiscount(Number(event.target.value) || 0)} className="w-full mt-1 p-2.5 rounded-xl" style={inputStyle}/></label><div className="rounded-xl p-3" style={{ background: B.cream, border: "1px solid #EDE4CF" }}><span className="text-xs" style={{ color: B.muted }}>الإجمالي المستحق</span><b className="block text-xl mt-1" style={{ color: B.primaryDeep }}>{sar(total)}</b>{price && <small style={{ color: B.muted }}>المقاعد {sar(price.transport)} · السكن {sar(price.accommodation)}</small>}</div><div><span className="text-xs font-bold" style={{ color: B.text2 }}>حالة الدفع عند إنشاء الحجز</span><div className="grid grid-cols-2 gap-2 mt-1"><button type="button" onClick={() => setPaidAtBranch(false)} className="rounded-xl p-2 text-xs font-bold cursor-pointer" style={{ background: !paidAtBranch ? "#FFF8E8" : "#fff", border: `1px solid ${!paidAtBranch ? B.gold : B.border}` }}>بانتظار الدفع</button><button type="button" onClick={() => setPaidAtBranch(true)} className="rounded-xl p-2 text-xs font-bold cursor-pointer" style={{ background: paidAtBranch ? "#EAF7EF" : "#fff", border: `1px solid ${paidAtBranch ? "#2D8A57" : B.border}` }}>تم الدفع في الفرع</button></div></div><button type="button" onClick={save} disabled={saving || !selected} className="py-3 rounded-xl font-extrabold cursor-pointer" style={{ background: saving ? "#D6CFC6" : B.gold, border: "none", color: B.black }}>{saving ? "جارٍ إنشاء الحجز…" : paidAtBranch ? "إنشاء الحجز · مدفوع في الفرع" : "إنشاء الطلب · بانتظار الدفع"}</button></div></aside>
    </div>
  </section>;
}

function AccommodationChoices({ people, options, split, setSplit, hotelName }: { people: number; options: RoomSplit[]; split: RoomSplit | null; setSplit: (value: RoomSplit | null) => void; hotelName?: string }) {
  if (!people) return <div><span className="text-xs font-bold" style={{ color: B.text2 }}>السكن المتاح</span><p className="text-xs mt-2" style={{ color: B.muted }}>حدّد عدد المعتمرين أولاً لإظهار خيارات السكن المتاحة للعميل.</p></div>;
  return <div><div className="flex justify-between gap-2"><span className="text-xs font-bold" style={{ color: B.text2 }}>السكن المتاح *</span>{hotelName && <span className="text-[11px]" style={{ color: B.muted }}>{hotelName}</span>}</div><div className="grid gap-2 mt-2">{options.map(option => { const active = split?.key === option.key; const privateRoom = isPrivateAccommodation(option); const roomCount = active ? roomCountOf(split!) : 1; return <div key={option.key} className="rounded-xl p-2" style={{ background: active ? "#FFF8E8" : "#fff", border: `1px solid ${active ? B.gold : B.border}` }}><button type="button" onClick={() => setSplit({ ...option, roomCount: 1 })} className="w-full flex items-center gap-2 text-right cursor-pointer" style={{ background: "none", border: "none", padding: 0 }}><span className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: active ? B.gold : "#fff", border: `1px solid ${active ? B.gold : B.border}` }}>{active && <Check size={13}/>}</span><span className="flex-1"><b className="block text-xs" style={{ color: B.black }}>{tierLabel(option.type, option.rooms[0].persons)}</b><small style={{ color: B.muted }}>تكلفة الليلة: {sar(option.perNight)}</small></span><BedDouble size={17} style={{ color: B.gold }}/></button>{active && privateRoom && <div className="flex items-center justify-between mt-2 pt-2 text-xs" style={{ borderTop: `1px solid ${B.border}`, color: B.text2 }}><span>عدد الغرف المطلوبة</span><span className="flex items-center gap-2"><button type="button" disabled={roomCount <= 1} onClick={() => setSplit({ ...split!, roomCount: Math.max(1, roomCount - 1) })} className="p-1 rounded cursor-pointer" style={{ background: "#fff", border: `1px solid ${B.border}` }}><Minus size={13}/></button><b>{roomCount}</b><button type="button" onClick={() => setSplit({ ...split!, roomCount: roomCount + 1 })} className="p-1 rounded cursor-pointer" style={{ background: "#fff", border: `1px solid ${B.border}` }}><Plus size={13}/></button></span></div>}</div>; })}{!options.length && <p className="text-xs" style={{ color: B.muted }}>لا توجد خيارات سكن مناسبة لهذا التكوين.</p>}</div></div>;
}

export function DashboardPage({ onMenuOpen, onNav }: { onMenuOpen?: () => void; onNav: (v: string) => void }) {
  const navigate = useNavigate();
  const bookings = useStore(s => s.bookings);
  const trips = useStore(s => s.trips);
  const packages = useStore(s => s.packages);
  const payments = useStore(s => s.payments);
  const customRequests = useStore(s => s.customRequests);
  const beneficiaries = useStore(s => s.beneficiaries);
  const [serverMetrics, setServerMetrics] = useState<ServerMetrics | null>(null);
  const [slaReady, setSlaReady] = useState(false);

  const today = todayYMD();
  const weekEnd = useMemo(() => ymdPlus(7), []);
  const monthPrefix = today.slice(0, 7);

  useEffect(() => {
    let active = true;
    void fetchSettings().then(settings => {
      configureSla(settings.pub);
      if (active) setSlaReady(true);
    });
    if (isSupabaseEnabled && supabase) {
      void supabase.rpc("admin_dashboard_metrics").then(({ data, error }) => {
        if (!active || error || !data) return;
        setServerMetrics(data as ServerMetrics);
      });
    }
    return () => { active = false; };
  }, []);

  const pkgName = useMemo(() => {
    const m = new Map(packages.map(p => [p.id, p.name]));
    return (id?: string) => (id ? m.get(id) ?? "—" : "—");
  }, [packages]);
  const tripOf = useMemo(() => {
    const m = new Map(trips.map(t => [t.id, t]));
    return (id: string) => m.get(id);
  }, [trips]);

  const m = useMemo(() => {
    const pending = bookings.filter(b => b.status === "new" || b.status === "reviewing");
    /* نفس ساعات العمل ووعد الرد اللذين يراهما المستفيد، مع استثناء
       الحالات الملغاة والمنتهية لأن pending محصور في القابلة للمعالجة. */
    const late = pending.filter(b => { const t = sentAt(b); return t !== null && businessElapsed(t, Date.now(), SLA_MS()) >= SLA_MS(); });
    const awaitingPay = bookings.filter(b => b.status === "awaiting_payment");
    const failedPay = payments.filter(p => p.payStatus === "failed");
    const newRequests = customRequests.filter(r => r.status === "new");

    const monthRevenue = payments
      .filter(p => p.payStatus === "verified" && p.payDate?.startsWith(monthPrefix))
      .reduce((a, p) => a + p.total, 0);

    /* «القادمة هذا الأسبوع» من الحالة المشتقّة: الملغاة كانت تدخلها
       لأن عمودها ما زال open أو full حتى لحظة الإلغاء وبعدها. */
    const upcoming = trips
      .filter(t => { const s = tripState(t); return s === "open" || s === "full"; })
      .filter(t => t.departureDate >= today && t.departureDate <= weekEnd)
      .sort((a, b) => a.departureDate.localeCompare(b.departureDate));

    const todayBookings = bookings.filter(b => b.createdAt?.startsWith(today));

    const recent = [...bookings]
      .sort((a, b) => (sentAt(b) ?? 0) - (sentAt(a) ?? 0))
      .slice(0, 8);

    /* الأقدم في كل مجموعة — لا في المتأخّرة وحدها. */
    const oldestOf = <T,>(rows: T[], at: (r: T) => number | null, staff: (r: T) => string | undefined) => {
      const sorted = [...rows].sort((a, b) => (at(a) ?? Infinity) - (at(b) ?? Infinity));
      const first = sorted[0];
      return first ? { at: at(first), staff: staff(first) } : null;
    };
    const inWindow = pending.filter(b => !late.includes(b));
    /* تاريخ الفاتورة تاريخُ يومٍ بلا ساعة، فيُقرأ بداية يومه — تقديرٌ
       متحفّظ لا يزعم دقّةً لا نملكها، كما في sentAt. */
    const dayStart = (d?: string) => { if (!d) return null; const t = Date.parse(d.replace(" ", "T")); return Number.isNaN(t) ? null : t; };

    return {
      pending, late, awaitingPay, failedPay, newRequests, monthRevenue, upcoming, todayBookings, recent,
      oldestLate:    oldestOf(late,        sentAt,                    b => b.staff),
      oldestPending: oldestOf(inWindow,    sentAt,                    b => b.staff),
      oldestAwait:   oldestOf(awaitingPay, sentAt,                    b => b.staff),
      oldestFailed:  oldestOf(failedPay,   p => dayStart(p.createdAt), () => undefined),
      oldestRequest: oldestOf(newRequests, r => dayStart(r.createdAt), r => r.staff),
      pendingInWindow: inWindow.length,
    };
  }, [bookings, trips, payments, customRequests, today, weekEnd, monthPrefix, slaReady]);

  const metrics = {
    monthRevenue: serverMetrics?.monthRevenue ?? m.monthRevenue,
    todayBookings: serverMetrics?.todayBookings ?? m.todayBookings.length,
    pendingBookings: serverMetrics?.pendingBookings ?? m.pending.length,
    unlinkedBookings: serverMetrics?.unlinkedBookings ?? bookings.filter(b => !beneficiaries.some(x => x.bookingIds.includes(b.id))).length,
  };
  const goBookings = (params: Record<string,string>) => navigate(`/admin/bookings?${new URLSearchParams(params).toString()}`);

  const seatBar = (t: Trip) => {
    const pct = t.seats > 0 ? Math.min(100, Math.round((t.bookedSeats / t.seats) * 100)) : 0;
    /* اللون على الامتلاء: الرحلة القريبة نصف فارغة تحتاج بيعاً، والممتلئة
       تحتاج انتباهاً لقائمة الانتظار. */
    const fg = pct >= 95 ? "#BE2626" : pct >= 60 ? "#1E7A44" : "#8A6A08";
    return { pct, fg };
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{ background: B.bg }}>
      <PageHeader title="الرئيسية" crumb="نظرة عامة" search="" onSearch={() => {}} onMenuOpen={onMenuOpen} />

      <main className="flex-1 px-4 md:px-8 pb-12 pt-5 flex flex-col gap-5">
        {/* ── الأرقام ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <button onClick={()=>navigate(`/admin/payments?collected_month=${monthPrefix}`)} aria-label="افتح الفواتير المحصّلة هذا الشهر" title="افتح الفواتير المحصّلة هذا الشهر" className="text-right cursor-pointer" style={{background:"none",border:"none",padding:0}}><StatCard label="إيراد هذا الشهر" value={sar(metrics.monthRevenue)} sub="دفعات ناجحة بتاريخ التحصيل" accent /></button>
          <button onClick={()=>goBookings({created_on:today})} aria-label="افتح الطلبات المُنشأة اليوم" title="افتح الطلبات المُنشأة اليوم" className="text-right cursor-pointer" style={{background:"none",border:"none",padding:0}}><StatCard label="طلبات اليوم" value={metrics.todayBookings} sub="أُنشئت اليوم" /></button>
          <button onClick={()=>goBookings({status:"reviewing"})} aria-label="افتح الطلبات قيد المراجعة" title="افتح الطلبات قيد المراجعة" className="text-right cursor-pointer" style={{background:"none",border:"none",padding:0}}><StatCard label="قيد المراجعة" value={metrics.pendingBookings} sub="بانتظار قرار موظف" /></button>
          <StatCard label="رحلات الأسبوع" value={m.upcoming.length} sub="تنطلق خلال ٧ أيام" />
        </div>

        <ReceptionOperationsCenter trips={trips} packages={packages} />

        {/* ── يحتاج إجراءً ── */}
        <section className="rounded-2xl p-5" style={{ background: "#fff", border: `1px solid ${B.border}` }}>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="font-extrabold text-base" style={{ color: B.primaryDeep, margin: 0 }}>يحتاج إجراءً</h2>
            <span className="text-xs" style={{ color: B.muted }}>اضغط البند لتفتح شاشته</span>
          </div>
          <div className="flex flex-col gap-2.5">
            <ActionRow icon={AlertTriangle} tone={TONE.red}
              label="طلبات تجاوزت وعد الردّ" count={m.late.length} oldest={m.oldestLate}
              note="مضى على إرسالها خارج ساعات الإغلاق ولم يُتّخذ قرار"
              onGo={() => goBookings({status:"reviewing", sla:"late"})} />
            <ActionRow icon={BookOpen} tone={TONE.amber}
              label="طلبات قيد المراجعة" count={m.pendingInWindow} oldest={m.oldestPending}
              note="داخل الوعد — تُراجَع وتُقبل أو تُرفض"
              onGo={() => goBookings({status:"reviewing"})} />
            <ActionRow icon={CreditCard} tone={TONE.violet}
              label="بانتظار الدفع" count={m.awaitingPay.length} oldest={m.oldestAwait}
              note="أُرسل رابط الدفع ولم يُسدَّد بعد"
              onGo={() => onNav("payments")} />
            <ActionRow icon={AlertTriangle} tone={TONE.red}
              label="عمليات دفع فاشلة" count={m.failedPay.length} oldest={m.oldestFailed}
              note="تحتاج تواصلاً مع العميل أو إعادة إرسال الرابط"
              onGo={() => onNav("payments")} />
            <ActionRow icon={Sparkles} tone={TONE.blue}
              label="طلبات مخصّصة جديدة" count={m.newRequests.length} oldest={m.oldestRequest}
              note="رحلات حسب الطلب بانتظار عرض سعر"
              onGo={() => onNav("customRequests")} />
            {/* لا شيء معلّق: يُقال صريحاً بدل قسمٍ فارغ يُقرأ عطلاً. */}
            {!m.late.length && m.pending.length === 0 && !m.awaitingPay.length
              && !m.failedPay.length && !m.newRequests.length && (
              <div className="relative overflow-hidden flex items-center gap-2.5 px-4 py-4 rounded-xl"
                style={{ background: B.surface, border: `1px solid ${B.border}`, color: B.black }}>
                <span aria-hidden className="absolute inset-y-0" style={{ insetInlineStart: 0, width: 3, background: "#1E7A44" }} />
                <TrendingUp size={16} style={{ color: "#1E7A44" }} />
                <span className="text-sm font-bold">لا شيء معلّق — كل الطلبات متابَعة.</span>
              </div>
            )}
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* ── رحلات الأسبوع ── */}
          <section className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: `1px solid ${B.border}` }}>
            <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: `1px solid ${B.border}` }}>
              <CalendarClock size={16} style={{ color: B.gold }} />
              <h2 className="font-extrabold text-base flex-1" style={{ color: B.primaryDeep, margin: 0 }}>رحلات الأسبوع</h2>
              <button onClick={() => onNav("trips")} className="text-xs font-bold cursor-pointer"
                style={{ background: "none", border: "none", color: B.text2 }}>كل الرحلات</button>
            </div>
            {m.upcoming.length === 0
              ? <div className="px-5 py-10 text-center text-sm" style={{ color: B.muted }}>لا رحلات تنطلق خلال سبعة أيام</div>
              : m.upcoming.map((t, i) => {
                  const { pct, fg } = seatBar(t);
                  return (
                    <div key={t.id} className="px-5 py-3.5" style={{ borderTop: i ? `1px solid ${B.border}` : "none" }}>
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <span className="font-bold text-sm truncate" style={{ color: B.black }}>{pkgName(t.packageId)}</span>
                        <span className="text-xs flex-shrink-0" style={{ color: B.muted, fontFamily: "var(--font-app)" }}>
                          {t.departureDate} · {t.departureTime}
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "#EEECEA" }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: fg }} />
                        </div>
                        <span className="text-xs font-bold flex-shrink-0" style={{ color: fg, fontFamily: "var(--font-app)" }}>
                          {t.bookedSeats}/{t.seats}
                        </span>
                      </div>
                    </div>
                  );
                })}
          </section>

          {/* ── آخر الطلبات ── */}
          <section className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: `1px solid ${B.border}` }}>
            <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: `1px solid ${B.border}` }}>
              <BookOpen size={16} style={{ color: B.gold }} />
              <h2 className="font-extrabold text-base flex-1" style={{ color: B.primaryDeep, margin: 0 }}>آخر الطلبات</h2>
              <button onClick={() => onNav("bookings")} className="text-xs font-bold cursor-pointer"
                style={{ background: "none", border: "none", color: B.text2 }}>كل الطلبات</button>
            </div>
            {m.recent.length === 0
              ? <div className="px-5 py-10 text-center text-sm" style={{ color: B.muted }}>لا طلبات بعد</div>
              : m.recent.map((b, i) => (
                  <div key={b.id} className="flex items-center gap-3 px-5 py-3"
                    style={{ borderTop: i ? `1px solid ${B.border}` : "none" }}>
                    <span className="flex-1 min-w-0">
                      <span className="block truncate font-bold text-sm" style={{ color: B.black }}>{b.clientName}</span>
                      <span className="block truncate text-xs" style={{ color: B.muted }}>
                        {pkgName(b.packageId ?? tripOf(b.tripId)?.packageId)} · {b.persons} معتمر
                      </span>
                      <span className="block text-xs mt-0.5" style={{ color: B.muted, fontFamily: "var(--font-app)" }}>
                        {b.id} · {b.createdAt || "—"}
                      </span>
                    </span>
                    <span className="text-xs font-bold flex-shrink-0" style={{ color: B.gold, fontFamily: "var(--font-app)" }}>
                      {sar(b.total)}
                    </span>
                    <StatusBadge status={b.status} entity="booking" />
                  </div>
                ))}
          </section>
        </div>

        {metrics.unlinkedBookings > 0 && <button onClick={()=>goBookings({beneficiary:"unlinked"})}
          className="relative overflow-hidden flex items-center gap-3 px-4 py-3.5 rounded-xl text-right cursor-pointer" style={{background:B.surface,border:`1px solid ${B.border}`}}>
          <span aria-hidden className="absolute inset-y-0" style={{insetInlineStart:0,width:3,background:"#BE2626"}}/>
          <AlertTriangle size={18} style={{color:"#BE2626"}}/><span><strong className="text-sm" style={{color:B.black}}><span style={{color:B.gold,fontFamily:"var(--font-app)"}}>{metrics.unlinkedBookings}</span> طلبات غير مربوطة بمستفيد</strong><span className="block text-xs mt-0.5" style={{color:B.muted}}>تحتاج ربطًا قبل المتابعة.</span></span>
        </button>}

        {/* ── سطر ختامي: أرقام السجل ── */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {([
            ["إجمالي الطلبات", bookings.length, "منذ البداية", "bookings"],
            ["الباقات النشطة", packages.filter(p => p.status === "active").length, "معروضة للحجز", "packages"],
            ["المستفيدون", beneficiaries.length, "في السجل", "beneficiaries"],
            ["الرحلات المفتوحة", trips.filter(t => isSellable(t)).length, "قابلة للحجز", "trips"],
          ] as const).map(([label, value, sub, view]) => (
            <button key={label} onClick={() => onNav(view)}
              className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-start cursor-pointer"
              style={{ background: "#fff", border: `1px solid ${B.border}` }}>
              <Users size={15} style={{ color: B.muted, flexShrink: 0 }} />
              <span className="flex-1 min-w-0">
                <span className="block text-xs" style={{ color: B.muted }}>{label}</span>
                <span className="block font-extrabold" style={{ color: B.gold, fontFamily: "var(--font-app)" }}>
                  {value} <span className="text-xs font-normal" style={{ color: B.muted }}>{sub}</span>
                </span>
              </span>
            </button>
          ))}
        </motion.div>
      </main>
    </div>
  );
}
