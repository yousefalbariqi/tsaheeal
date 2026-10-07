import { cloneElement, isValidElement, useCallback, useEffect, useId, useMemo, useRef, useState,
  type ReactElement, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { motion } from "motion/react";
import { Check, Users, X, Search, Clock, Eye, MapPin, CalendarDays, Ticket, Copy, PhoneCall, Armchair, ShieldCheck,
  CreditCard, MailCheck, Link2Off, CloudOff, WifiOff } from "lucide-react";
import { B, TONE, type ToneName } from "@/lib/theme";
import { fmtDayDate, fmtTime } from "@/lib/dates";
import { sar } from "@/lib/money";
import type { Pkg, Trip, TravellerType } from "@/types";
import { packagePrice, packageStartingPrice, type RoomSplit, splitSummary } from "./roomSplit";
import { Spinner } from "@/components/Spinner";
import { Toaster, toast } from "sonner";
import { hideBootSplash } from "@/lib/bootSplash";
import { todayYMD } from "@/lib/utils";
import { QRBlock } from "@/components/QRBlock";
import { NationalitySelect } from "@/components/NationalitySelect";
import { BirthDateInput } from "@/components/BirthDateInput";
import { SearchSelect, searchNorm } from "@/components/SearchSelect";
import { DOC_TYPES, docTypeDef, docText, type DocType } from "@/data/docTypes";
import { WhatsAppFab } from "@/components/WhatsAppFab";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/app/components/ui/input-otp";
import { LANGS, dirOf, makeT, type Lang } from "./i18n";
import { SlaCountdown } from "./ui/SlaCountdown";
import { fetchCatalog, submitBooking, myBookings, SeatsError, AuthRequiredError, availSeats, type Catalog, type TrackResult } from "./data";
import { isSellable, tripState } from "@/lib/trip";
import {
  sendOtp, verifyOtp, signInNoOtp, customerAccountExists, signInWithCustomerPassword, signUpCustomer, SKIP_OTP, loadSession, clearSession, onAuthChange, saveProfile,
  cachedPhoneLocal, isWhatsappEnabled, authErrorMessage, isFail,
  sendCustomerRecovery, consumeRecoveryCode, setCustomerPassword,
  type CustomerSession,
} from "./customerAuth";
import { DirProvider, GrayButton, CTAButton, Sheet, useReducedMotion } from "./ui/kit";
import { FlowScreen, InputStack, StackField, PhoneField, TextLink, toLatinDigits, focusFirstInvalid } from "./ui/FlowScreen";
import { C, T, R, G, LTR, SPACE, SHADOW, formatDate } from "./ui/tokens";
import { AppBar, BottomBar, DesktopNav } from "./ui/chrome";
import { Timeline, BookingStatusBadge } from "./ui/Timeline";
import { pkgCover } from "./gallery";
import { countLabel } from "./plural";
import { Explore, matchesDestination } from "./screens/Explore";
import { CustomRequestScreen } from "./screens/CustomRequest";
import { FocusConfigure, FocusDetails, needsTravellerTypeForAccommodation } from "./screens/FocusBooking";
import { Account } from "./screens/Account";
import { parseRoute, pathOf, NEEDS_PACKAGE, HOME, type Screen } from "./routing";
import { publicSettings } from "@/data/settings";
import { configureSla } from "./sla";
import { readDraft, writeDraft, clearDraft, draftHasInput, emptyPax, emptyTravellerCounts, travellerCountTotal, travellerTypeForCounts, type Pax, type TravellerCounts } from "./draft";
import { fetchTravellers, saveTraveller } from "./travellers";

/* الشاشة تُقرأ من المسار (routing.ts) وPax ومسوّدتها في draft.ts. */
const money=(n:number)=>Math.round(n).toLocaleString("en-US");
const validPhone=(p:string)=>/^(0?5\d{8}|(\+?966)5\d{8})$/.test(p.replace(/\s/g,""));
const validName=(s:string)=>s.trim().split(/\s+/).filter(Boolean).length>=2&&s.trim().length>=5;
/** ملف الحساب يحفظ الاسم الأول والأخير، بينما نموذج الحجز يطلب الاسم
    كاملاً كما في الوثيقة. نفصل آخر كلمة للاسم الأخير بعد تحقق الاسم. */
const profileName=(full:string)=>{
  const words=full.trim().split(/\s+/).filter(Boolean);
  return { firstName:words[0]??"", lastName:words.slice(1).join(" ") };
};

/* تحقق حقول المعتمر — رسالة لكل حقل تظهر تحته مباشرة.
   جوال المعتمر الأول إلزامي (هو جوال التواصل والتتبّع)، وبقية المرافقين اختياري. */
type PaxField="name"|"phone"|"docType"|"idNumber"|"nationality"|"birthDate"|"gender"|"ageGroup";
function paxErrors(p:Pax,t:(k:string)=>string,lang:Lang="ar"):Partial<Record<PaxField,string>>{
  const e:Partial<Record<PaxField,string>>={};
  if(!p.name.trim()) e.name=t("required"); else if(!validName(p.name)) e.name=t("nameErr");
  /* جوال التواصل يأتي من الجلسة الموثّقة ويُرسل عند الحفظ؛ لا يظهر في
     نموذج المعتمر، لذلك لا نمنع الحجز بحقلٍ لا يستطيع العميل تعبئته. */
  if(p.phone.trim()&&!validPhone(p.phone)) e.phone=t("invalidPhone");
  if(!p.docType) e.docType=t("required");
  else { const d=docTypeDef(p.docType);
    if(!p.idNumber.trim()) e.idNumber=t("required");
    else if(!d.test(p.idNumber.trim())) e.idNumber=docText(d.error,lang); }
  if(!p.nationality) e.nationality=t("required");
  if(!p.birthDate) e.birthDate=t("required");
  return e;
}

/* حقل معنون: عنوان فوق المربع + نص إرشادي تحته يتحوّل إلى رسالة خطأ عند الحاجة.
   مُعرَّف خارج المكوّن الرئيسي حتى لا يفقد الإدخال التركيز عند إعادة الرسم.

   العنوان مربوط بحقله (htmlFor↔id) ومعرّفه من useId: هذه البطاقة تُرسم
   مرّةً لكل معتمر، فمعرّف ثابت يجعل «رقم الهوية» في البطاقة الثالثة
   يشير إلى حقل البطاقة الأولى. والرسالة الخطأ مربوطة بـaria-describedby
   حتى يقرأها قارئ الشاشة مع الحقل لا كنصّ سابح بعده.

   وaria-invalid على الحقل: اللون الأحمر وحده لا يصل لمن لا يراه. */
function LField({label,hint,error,optional,group,children}:{label:string;hint?:string;error?:string;optional?:string;
  /** الحقل مجموعةُ عناصر لا عنصراً واحداً (شريط خيارين، ثلاث قوائم تاريخ):
      htmlFor يُشير إلى عنصر واحد قابل للعنونة، فالمجموعة تُسمّى
      بـaria-labelledby على حاويتها. الفرق ليس تجميلياً: htmlFor نحو
      حاوية لا يربط شيئاً إطلاقاً. */
  group?:boolean;children:ReactNode}){
  const uid=useId();
  const fieldId=`${uid}-f`, labelId=`${uid}-l`, noteId=`${uid}-n`;
  const own=isValidElement(children)?(children.props as {id?:string}).id:undefined;
  const forId=own??fieldId;
  const describedBy=(error||hint)?noteId:undefined;
  const child=isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string,unknown>>,{
        ...(group
          ? {role:"group","aria-labelledby":labelId}
          : own?{}:{id:forId}),
        ...(describedBy?{"aria-describedby":describedBy}:{}),
        ...(error?{"aria-invalid":true}:{}),
      })
    : children;
  const inner=<>
    {label}
    {optional
      ? <span style={{fontWeight:400,color:C.ink2}}>({optional})</span>
      : <span aria-hidden style={{color:C.danger}}>*</span>}
  </>;
  return (
    <div className="flex flex-col gap-1.5">
      {group
        ? <span id={labelId} className="flex items-center gap-1" style={{...T.meta,fontWeight:600,color:C.ink}}>{inner}</span>
        : <label htmlFor={forId} className="flex items-center gap-1" style={{...T.meta,fontWeight:600,color:C.ink}}>{inner}</label>}
      {child}
      {error
        ? <span id={noteId} className="tsf-field-error" style={{...T.small,fontSize:13,fontWeight:400,color:C.danger}}>{error}</span>
        : hint ? <span id={noteId} style={{...T.small,fontSize:13,fontWeight:400,color:C.ink2}}>{hint}</span> : null}
    </div>
  );
}

/** العدد في الحجز ليس قائمةَ أشخاصٍ تُملأ الآن. نوضح أين ومتى تُستكمل
    بيانات المرافقين بدلاً من خلق بطاقات فارغة لا يملكها صاحب الحجز. */
function CompanionNotice({t}:{t:(k:string)=>string}){
  return <Note tone="gold" icon={<Users size={18}/>} title={t("otherPilgrimsTitle")}>{t("otherPilgrimsNotice")}</Note>;
}

/* ── قطع العرض المشتركة بين المراجعة والنجاح والحجوزات ──────────────
   خارج المكوّن الرئيسي: تعريفها داخله يجعلها نوعاً جديداً في كل رسم
   فتُفكّ وتُركَّب مع كل حرف (انظر تعليق chrome.tsx). */

/** ملاحظة بلون المعنى من TONE — أيقونة lucide لا رمزٌ تعبيري. */
function Note({tone,icon,title,children}:{tone:ToneName;icon?:ReactNode;title?:string;children:ReactNode}){
  const c=TONE[tone];
  return <div className="flex items-start" style={{gap:10,padding:"12px 14px",borderRadius:R.chip,background:c.bg,border:`1px solid ${c.line}`}}>
    {icon&&<span aria-hidden style={{color:c.fg,flexShrink:0,marginTop:2,display:"flex"}}>{icon}</span>}
    <div className="flex flex-col min-w-0" style={{gap:2}}>
      {title&&<strong style={{...T.body,fontSize:15,fontWeight:600,color:C.ink}}>{title}</strong>}
      <span style={{...T.meta,color:C.ink2,lineHeight:1.7}}>{children}</span>
    </div>
  </div>;
}

const cardBox={display:"flex",flexDirection:"column",padding:"8px 16px",border:`1px solid ${C.line}`,borderRadius:R.card,background:C.white} as const;

/** صفّ عنوان/قيمة داخل بطاقة ملخّص. `plain` للقيم غير المشدَّدة (بنود السعر). */
function SummaryRow({label,value,sub,plain}:{label:string;value:ReactNode;sub?:ReactNode;plain?:boolean}){
  return <div className="flex items-start justify-between" style={{gap:16,paddingBlock:8}}>
    <span style={{...T.meta,fontSize:15,color:C.ink2,flexShrink:0,maxWidth:"55%"}}>{label}</span>
    <span className="flex flex-col min-w-0" style={{gap:2,textAlign:"end",alignItems:"flex-end"}}>
      <span style={{...T.meta,fontSize:15,color:C.ink,fontWeight:plain?400:600}}>{value}</span>
      {sub&&<span style={{...T.small,fontSize:13,fontWeight:400,color:C.ink2}}>{sub}</span>}
    </span>
  </div>;
}

/* التاريخ والوقت بلغة الواجهة: العربية من lib/dates («الخميس 7 أغسطس»
   و«10:30 ص»)، والإنجليزية بصياغتها — لا نصّ تخزينٍ خام في الحالتين. */
const dayDate=(iso:string,lang:Lang)=>lang==="ar"?fmtDayDate(iso):formatDate(iso,lang,true);
const clock=(v:string|undefined|null,lang:Lang)=>{
  if(!v) return "";
  if(lang==="ar") return fmtTime(v,"");
  const m=/^(\d{1,2}):(\d{2})/.exec(v.trim());
  if(!m) return v;
  const h=+m[1];
  return `${h%12||12}:${m[2]} ${h<12?"AM":"PM"}`;
};

/** بطاقة الرحلة: صورة الباقة واسمها، ثم الانطلاق والعودة. تُعرض في
    المراجعة وتُعاد في النجاح — العميل يرى ما حجزه بالصورة التي اختاره بها. */
function TripRecap({pkg,trip,depCity,lang,t}:{pkg:Pkg;trip:Trip;depCity?:string;lang:Lang;t:(k:string)=>string}){
  const time=clock(trip.departureTime,lang);
  return <div style={{border:`1px solid ${C.line}`,borderRadius:R.card,background:C.white,overflow:"hidden"}}>
    <div className="flex items-center" style={{gap:12,padding:12,background:C.fill,borderBottom:`1px solid ${C.line}`}}>
      <img src={pkgCover(pkg)} alt="" style={{width:64,height:64,borderRadius:10,objectFit:"cover",flexShrink:0,background:C.line}}/>
      <div className="flex flex-col min-w-0" style={{gap:2}}>
        <span style={{...T.small,fontSize:13,fontWeight:400,color:C.ink2}}>{t("yourTrip")}</span>
        <strong style={{...T.h3,color:C.ink}}>{pkg.name}</strong>
      </div>
    </div>
    <div style={{padding:"4px 16px"}}>
      <SummaryRow label={t("departsAt")} value={dayDate(trip.departureDate,lang)} sub={time||undefined}/>
      {trip.returnDate&&<SummaryRow label={t("returnsAt")} value={dayDate(trip.returnDate,lang)}/>}
      {depCity&&<SummaryRow label={t("departureCity")} value={depCity}/>}
    </div>
  </div>;
}

/** مربّع الموافقة: صفّ لمسٍ 48px ومربّع مرسوم، والحقل الأصلي باقٍ تحته
    للوحة المفاتيح وقارئ الشاشة. */
function AgreeCheck({checked,onChange,label}:{checked:boolean;onChange:(v:boolean)=>void;label:string}){
  return <label className="tsf-check">
    <input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/>
    <span className="tsf-check-box" aria-hidden>{checked&&<Check size={16} strokeWidth={3}/>}</span>
    <span style={{...T.body,fontSize:15,color:C.ink}}>{label}</span>
  </label>;
}

/** قرصٌ بأيقونة يعلو عنوان شاشةٍ بلا نموذج (بريدٌ أُرسل، رابطٌ انتهى…). */
function IconDisc({children,tone="gold"}:{children:ReactNode;tone?:ToneName}){
  const c=TONE[tone];
  return <div className="flex items-center justify-center" style={{width:68,height:68,borderRadius:R.pill,background:c.bg,border:`1px solid ${c.line}`,color:c.fg}}>{children}</div>;
}

/** حالةٌ فارغة مصمَّمة: أيقونة وعنوان وسطر وفعل. */
function EmptyState({icon,title,sub,action}:{icon:ReactNode;title:string;sub:string;action?:ReactNode}){
  return <div className="flex flex-col items-center text-center" style={{gap:10,padding:"36px 20px",border:`1px solid ${C.line}`,borderRadius:R.card,background:C.fill}}>
    <IconDisc>{icon}</IconDisc>
    <strong style={{...T.h3,fontSize:18,color:C.ink,marginTop:6}}>{title}</strong>
    <span style={{...T.meta,fontSize:15,color:C.ink2,maxWidth:300}}>{sub}</span>
    {action&&<div style={{marginTop:10}}>{action}</div>}
  </div>;
}

/** هياكل بطاقات الحجوزات أثناء التحميل — بشكل البطاقة التي ستأتي. */
function OrdersSkeleton({label}:{label:string}){
  return <div className="flex flex-col" style={{gap:16}} role="status" aria-label={label}>
    {[0,1].map(i=>(
      <div key={i} className="flex flex-col" style={{gap:14,padding:16,border:`1px solid ${C.line}`,borderRadius:R.card}}>
        <div className="flex items-start justify-between" style={{gap:10}}>
          <div className="flex flex-col" style={{gap:8,flex:1}}>
            <span className="tsf-skel" style={{height:18,width:"62%"}}/>
            <span className="tsf-skel" style={{height:12,width:"34%"}}/>
          </div>
          <span className="tsf-skel" style={{height:28,width:86,borderRadius:999}}/>
        </div>
        <span className="tsf-skel" style={{height:14,width:"70%"}}/>
        <span className="tsf-skel" style={{height:14,width:"48%"}}/>
        <span className="tsf-skel" style={{height:72,width:"100%",borderRadius:12}}/>
      </div>
    ))}
  </div>;
}

/* رسائل الدخول تمرّ من هنا قبل العرض: customerAuth يردّ على `setup_required`
   بجملةٍ للمطوِّر («طبّق ترحيل قاعدة البيانات…») وعلى `email_invalid` بنصٍّ
   عربيّ ثابت. العميل يقرأ جملةً بلغته، والتفصيل يبقى في الطرفية. */
function authMsg(f:Parameters<typeof authErrorMessage>[0],t:(k:string)=>string):string{
  if(f.kind==="setup_required"){ console.error("[auth] setup_required:",f.raw??""); return t("errLoginUnavailable"); }
  if(f.kind==="email_invalid") return t("errEmailInvalid");
  return authErrorMessage(f,t);
}

const AR_MONTHS=["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const AR_WEEK=["س","ح","ن","ث","ر","خ","ج"];
/* بلا مرحلة «مؤكد»: كانت تفصل بين الدفع والتذكرة بخطوة لا يرى المستفيد
   فيها شيئاً يحدث — إجراءٌ داخلي عُرض كأنه انتظار إضافي. الدفع يفضي
   إلى التذكرة مباشرة. وحالة confirmed في القاعدة باقية كما هي: هي
   الحالة التي تُصدر التذكرة، فتُطابَق على خطوتها لا على خطوة مستقلة. */

/* العنوان بلا «نموذج مبدئي يُعدّل لاحقاً»: علامة مسودّةٍ داخلية لا تُعرض
   لعميلٍ يُطلب منه أن يوافق على النصّ. */
const TERMS_TITLE_AR = "شروط وأحكام حجز العمرة — تساهيل العمرة";
const TERMS_BODY_AR = `1) الحجز والتأكيد:
- يُعدّ الطلب مبدئياً «قيد المراجعة» حتى يعتمده الموظف المختص.
- يلتزم المستفيد بتقديم بيانات صحيحة (الاسم، الهوية/الجواز، الجوال) وتحمّل مسؤولية صحتها.

2) الدفع:
- يُرسَل رابط الدفع بعد قبول الطلب، ويجب سداده خلال المهلة المحددة وإلا يُلغى الحجز تلقائياً.
- الأسعار تشمل ما هو موضّح في الباقة فقط.

3) الإلغاء والاسترداد:
- الإلغاء المجاني متاح قبل موعد الرحلة وفق سياسة الباقة المعروضة.
- لا يُسترد المبلغ بعد إصدار التذكرة أو انطلاق الرحلة.

4) المقاعد والسكن:
- يُنظّم فريق تساهيل المقعد المناسب للمستفيد بعد مراجعة الطلب.
- نوع السكن حسب الباقة والفندق المرتبط بها.

5) المسؤولية:
- تلتزم المؤسسة ببذل العناية المعتادة، ولا تتحمل مسؤولية الظروف الخارجة عن إرادتها (الطقس، الزحام، القرارات الرسمية).

6) الخصوصية:
- تُستخدم بيانات المستفيد لأغراض الحجز والتواصل فقط ولا تُشارك مع طرف ثالث دون موجب نظامي.

باستمرارك تُقرّ بأنك اطلعت على هذه الشروط ووافقت عليها.`;


/* النصّ الإنجليزي ترجمةٌ للعربي بنداً بنداً — كان الوضع الإنجليزي يطلب
   الموافقة على شروطٍ لا يقرؤها صاحبه. العربي هو المرجع عند الاختلاف. */
const TERMS_TITLE_EN = "Umrah Booking Terms & Conditions — Tasaheel Al-Umrah";
const TERMS_BODY_EN = `1) Booking and confirmation:
- A request stays provisional ("Under review") until a staff member approves it.
- The customer must provide accurate details (name, ID/passport, mobile) and is responsible for their accuracy.

2) Payment:
- The payment link is sent after the request is accepted and must be paid within the stated period, otherwise the booking is cancelled automatically.
- Prices cover only what is stated in the package.

3) Cancellation and refunds:
- Free cancellation is available before the trip date according to the policy shown for the package.
- No refund is made after the ticket is issued or the trip has departed.

4) Seats and accommodation:
- The Tasaheel team assigns a suitable seat after reviewing the request.
- Accommodation type follows the package and its linked hotel.

5) Liability:
- The establishment exercises reasonable care and is not liable for circumstances beyond its control (weather, congestion, official decisions).

6) Privacy:
- Customer data is used for booking and communication only and is not shared with third parties without a legal requirement.

By continuing you confirm that you have read and agreed to these terms.

The Arabic text is the reference version.`;

/* شاشات المسار — قاعدتها بيضاء وشريطها السفلي ثابت، فلا خلفية مزخرفة
   ولا فراغ سفلي ولا زر واتساب عائم يغطّي زر الإجراء. */
const FLOW_SCREENS:Screen[]=["login","otp","account","passengers","review","success","recover"];
/* شاشات لها شريط تنقّل سفلي — الزر العائم يرتفع فوقه. */
const TABBED_SCREENS:Screen[]=["track","profile"];
const BOOKING_RESUME_KEY="tsaheel.booking.resume";

/* الحملة لا تعتمد على ساعة جهاز المستفيد: تاريخ الرياض هو المرجع، حتى لا
   تظهر الزينة باكراً أو تتأخر لمن يفتح الموقع من بلدٍ آخر. نتركها لثلاثة
   يومين (22–23 سبتمبر) لتشمل ليلة الاحتفال ويوم الوطن، ثم تعود الواجهة
   تلقائياً إلى مظهرها المعتاد من دون إجراءٍ يدوي. */
function isSaudiNationalDayCampaign(now=new Date()){
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Riyadh",month:"numeric",day:"numeric"}).formatToParts(now);
  const part=(type:"month"|"day")=>Number(parts.find(p=>p.type===type)?.value);
  return part("month")===9&&part("day")>=22&&part("day")<=23;
}

export function CustomerApp(){
  /* اللغة تُحفظ: «زر EN يجب أن يحفظ اختيار المستخدم». المتصفّح وحده
     يعرفها — لا تُرسل لأحد. */
  const [lang,setLangState]=useState<Lang>(()=>{ try{ const v=localStorage.getItem("ts.lang"); return (v==="en"||v==="ar")?v:"ar"; }catch{ return "ar"; } });
  const setLang=(l:Lang)=>{ setLangState(l); try{ localStorage.setItem("ts.lang",l); }catch{} };
  const t=useMemo(()=>makeT(lang),[lang]);
  const dir=dirOf(lang);
  /* ── الشاشة من المسار ──
     المسار هو مصدر الحقيقة، لا حالةٌ موازية تُزامَن معه: نسختان
     تتفارقان عند أول حالة لم تُحسب (زر رجوع المتصفّح، رابط مُلصق،
     إعادة تحميل). وبهذا صار رابط الباقة قابلاً للإرسال في واتساب. */
  const location=useLocation();
  const navigate=useNavigate();
  const route=useMemo(()=>parseRoute(location.pathname),[location.pathname]);
  const screen=route.screen;
  const [cat,setCat]=useState<Catalog>({packages:[],trips:[],hotels:[],transports:[]});
  const [loading,setLoading]=useState(true);

  // booking state
  const [pkg,setPkg]=useState<Pkg|null>(null);
  const [trip,setTrip]=useState<Trip|null>(null);
  const [persons,setPersons]=useState(0);
  const [travellerCounts,setTravellerCounts]=useState<TravellerCounts>(emptyTravellerCounts);
  const [split,setSplit]=useState<RoomSplit|null>(null);
  /* العميل يختار المدينة فقط؛ نقطة الانطلاق ووقتها مثبتتان في الرحلة من الإدارة. */
  const [departureCity,setDepartureCity]=useState("");
  const [departureCitySheet,setDepartureCitySheet]=useState(false);
  /* نصّ البحث في ورقة المدن. يُفرَّغ عند كل فتح: ورقةٌ تُفتح على بحثٍ
     سابق تُخفي مدناً موجودة ويبدو أنها اختفت. */
  const [depQuery,setDepQuery]=useState("");
  const [travellerType,setTravellerType]=useState<TravellerType|"">("");
  const [pax,setPax]=useState<Pax[]>([emptyPax()]);
  const [paxTouched,setPaxTouched]=useState<Record<string,boolean>>({});
  const [paxTried,setPaxTried]=useState(false);
  const [contactPhone,setContactPhone]=useState("");
  const [contactTried,setContactTried]=useState(false);
  const [termsOpen,setTermsOpen]=useState(false);
  const [agreed,setAgreed]=useState(false);
  const [submitting,setSubmitting]=useState(false);
  const [bookingNo,setBookingNo]=useState("");
  /** لحظة إرسال الطلب — يبدأ منها عدّاد وعد الردّ في شاشة النجاح. */
  const [submittedAt,setSubmittedAt]=useState<number|null>(null);
  const [errMsg,setErrMsg]=useState("");

  /* مرآة pkg في مرجع — حتى لا تُعاد صناعة setScreen مع كل تغيّر باقة
     فتُبطل كل مُعالِج مبنيّ عليها. مرآةٌ لحالة، فالكتابة أثناء الرسم
     لا تُنشئ حقيقةً ثانية. */
  const pkgRef=useRef<Pkg|null>(null);
  pkgRef.current=pkg;

  /* الانتقال بين الشاشات = تغيير المسار. الباقة تُمرَّر صراحةً حين
     تُختار في نفس المُعالِج (setPkg ثم setScreen): حالة React لم تكن
     قد تحدّثت بعد، فقراءة pkg هنا تعطي الباقة السابقة. */
  const setScreen=useCallback((s:Screen,pkgId?:string)=>{
    navigate(pathOf(s,pkgId??pkgRef.current?.id??route.packageId));
  },[navigate,route.packageId]);
  /* الاستبدال لا الإضافة: إعادة توجيه من مسار ناقص لا تُترك في تاريخ
     المتصفّح، وإلا أعاد زر الرجوع المستفيد إليه فوراً في حلقة. */
  const replaceScreen=useCallback((s:Screen,pkgId?:string)=>{
    navigate(pathOf(s,pkgId??pkgRef.current?.id??route.packageId),{replace:true});
  },[navigate,route.packageId]);

  /* الدخول ليس نهاية مسار الحجز. نحفظ وجهته قبل نقل العنوان إلى /login
     لأن مسار الدخول لا يحمل معرّف الباقة؛ بهذا تعود الجلسة الجديدة إلى
     الباقة والخطوة نفسيهما، حتى لو أعاد المتصفح تحميل صفحة الدخول. */
  const rememberBookingResume=useCallback((requested?:Screen)=>{
    const id=pkgRef.current?.id??route.packageId;
    if(!id) return;
    /* ما عدا خطوتَي الحجز يُحفظ بوصفه «بيانات المعتمر»: الرجوع بعد
       الدخول إلى صفحة تفاصيلٍ لا يُكمل مساراً بدأه العميل. */
    const candidate=requested??screen;
    const target=(candidate==="passengers"||candidate==="review")
      ? candidate : "passengers";
    try{ sessionStorage.setItem(BOOKING_RESUME_KEY,pathOf(target,id)); }catch{}
  },[route.packageId,screen]);

  /* ── الجلسة والهوية ──
     الجلسة الحقيقية تُقرأ بوعد (قد تُجدّد رمزاً عبر الشبكة)، فنبدأ
     بالرقم المحفوظ محلياً للرسم الأول فقط ولا نبني عليه أي تصريح. */
  const [session,setSession]=useState<CustomerSession|null>(null);
  const [sessionReady,setSessionReady]=useState(false);
  const cachedPhone=useRef<string|null>(cachedPhoneLocal());
  const [loginPhone,setLoginPhone]=useState("");
  const [loginStage,setLoginStage]=useState<"phone"|"password"|"signup"|"forgot"|"sent">("phone");
  const [loginPassword,setLoginPassword]=useState("");
  const [loginEmail,setLoginEmail]=useState("");
  /* استعادة كلمة المرور. البريد يُكتب ولا يُستنتج من الرقم: ردّ الخادم
     واحدٌ سواء كان للبريد حساب أم لا، فلو استنتجناه من الرقم لصار
     الحقل أداةً تُخرج بريد صاحب أي رقمٍ جوال. */
  const [forgotEmail,setForgotEmail]=useState("");
  const [recoverPw,setRecoverPw]=useState("");
  const [recoverPw2,setRecoverPw2]=useState("");
  const [recoverErr,setRecoverErr]=useState("");
  const [recoverBusy,setRecoverBusy]=useState(false);
  const [recoverState,setRecoverState]=useState<"checking"|"ready"|"invalid"|"done">("checking");
  const [otpCode,setOtpCode]=useState("");
  const [otpErr,setOtpErr]=useState("");
  const [sentVia,setSentVia]=useState<"sms"|"whatsapp">("sms");
  const [sending,setSending]=useState(false);
  const [resendIn,setResendIn]=useState(0);
  const resendTimer=useRef<ReturnType<typeof setInterval>|null>(null);
  /* بعد الدخول: يعود للمسار إن جاء منه، أو لصفحة الطلبات إن جاء من التبويب. */
  const [intent,setIntent]=useState<"flow"|"track">("flow");
  /* الوجهة المختارة («» = الكل). ترتفع إلى هنا لأن رأس الديسكتوب يعرضها
     تنقّلاً أوّل: الضغط على «مكة» من شاشة الحجوزات يعيد إلى الرحلات
     مصفّاةً، وذلك لا يصحّ لو كانت الحالة داخل شاشة الاستكشاف. */
  const [city,setCity]=useState("");
  const [myOrders,setMyOrders]=useState<TrackResult[]|null>(null);
  const [ordersLoading,setOrdersLoading]=useState(false);
  /* فشل الجلب حالةٌ ثالثة غير «جارٍ» و«فارغ»، و`ordersTry` يعيد المحاولة. */
  const [ordersFailed,setOrdersFailed]=useState(false);
  const [ordersTry,setOrdersTry]=useState(0);
  const [catErr,setCatErr]=useState(false);
  /* صفحة اختيار الوجهة ثابتة ولا تحتاج الكتالوج. كشفها مباشرةً يجعل أول
     انطباعٍ هو المنتج نفسه، لا شعار انتظارٍ يحجب واجهةً جاهزة. */
  const canRenderLandingWhileLoading=screen==="focus"&&!city;
  // شاشة الحساب
  const [acEmail,setAcEmail]=useState("");
  const [acSaving,setAcSaving]=useState(false);
  const [acErr,setAcErr]=useState("");

  /* بلا catch كان الفشل يترك loading=true إلى الأبد، و`if(loading) return null`
     يعيد لا شيء، وhideBootSplash لا يُنادى — فشاشة البدء تدور بلا نهاية.
     أي انقطاع شبكة لحظي = صفحة ميتة بلا زر ولا رسالة. */
  const loadCatalog=useCallback(()=>{
    setCatErr(false); setLoading(true);
    fetchCatalog()
      .then(c=>{setCat(c);setLoading(false);})
      .catch(e=>{ console.error("[fetchCatalog]",e); setCatErr(true); setLoading(false); });
  },[]);
  useEffect(()=>{ loadCatalog(); },[loadCatalog]);
  /* نافذة العمل ووعد الردّ من الإعدادات — يستعملهما عدّاد شاشة النجاح
     وشاشة التتبّع. قبل وصولها تعمل الحسابات على الافتراضات القائمة
     نفسها، فلا رقم خطأ يُعرض في الأثناء. */
  useEffect(()=>{ publicSettings().then(cfg=>configureSla(cfg)).catch(()=>{}); },[]);
  /* إزالة شاشة البدء بعد رسم الصفحة الجاهزة لا قبله. الصفحة الرئيسية ثابتة
     فتُكشف فوراً، أما المسارات التي تعتمد على بياناتٍ بعينها فتنتظرها. */
  useEffect(()=>{ if(!loading||canRenderLandingWhileLoading) hideBootSplash(); },[loading,canRenderLandingWhileLoading]);
  /* خلفية الـbody بيج عامة (لوحة الموظف)؛ صفحة المستفيد بيضاء — نوحّدها هنا
     حتى لا يظهر شريط بيج فوق الرأس في iOS Safari (منطقة شريط الحالة والسحب الزائد). */
  useEffect(()=>{ const prev=document.body.style.background; document.body.style.background="#fff";
    return ()=>{ document.body.style.background=prev; }; },[]);
  /* عدد المقاعد محفوظ في الطلب، لكنه لا يخلق نماذج بيانات للمرافقين.
     نموذج واحد فقط هو صاحب الحساب/الحجز؛ بيانات الآخرين تُستكمل لاحقاً. */
  useEffect(()=>{ setPax(prev=>[prev[0]??emptyPax()]); },[persons]);
  /** العددان هما مدخل العدد الوحيد في تجربة Focus. نشتق منهما
      الإجمالي والنوع الملائم للسكن في لحظة واحدة كي لا تتعارض الحالات. */
  const setTravellerBreakdown=useCallback((counts: TravellerCounts)=>{
    const safe: TravellerCounts = {
      men: Math.max(0, Math.trunc(counts.men) || 0),
      women: Math.max(0, Math.trunc(counts.women) || 0),
    };
    setTravellerCounts(safe);
    setPersons(travellerCountTotal(safe));
    setTravellerType(travellerTypeForCounts(safe));
  },[]);
  useEffect(()=>()=>{ if(resendTimer.current) clearInterval(resendTimer.current); },[]);

  /* معاينة الموظف: /focus/p/PKG-3?preview=1

     صفحة الباقة قبل النشر لا تُبنى نسخةً ثانية داخل اللوحة: نسخةٌ ثانية
     تتفارق عن الأصل عند أول تعديل، فتُطمئن الموظف على شكلٍ لا يراه أحد.
     تُفتح الصفحة الحقيقية نفسها ويُرفع عنها شرط «نشطة» وحده.

     لا تفتح باباً جديداً: سياسة القراءة العامة تُتيح صفوف الباقات
     للجميع أصلاً، ومن يعرف المعرّف يقرؤها بأو بلا هذه الراية. وما
     تضيفه أنها تمنع الحجز صراحةً وتضع شريطاً يقول ما هذه الصفحة. */
  const preview=useMemo(()=>new URLSearchParams(location.search).get("preview")==="1",[location.search]);
  /* الرايةُ ترفع الشرط عن باقةِ المسار وحدها لا عن الكتالوج كلّه:
     /?preview=1 كان سيملأ شاشة الاستكشاف بالمسودّات، وهي صفحةٌ يشارك
     رابطها الناس. المعاينة قصدُها باقةٌ بعينها يُراجعها من يملك معرّفها. */
  const activePkgs=useMemo(()=>{
    /* الفندق المسودة أو المتوقّف يحجب باقته.

       الفندق صار له ثلاث حالات (مسودة · نشط · متوقف)، والمسودة تعني
       «مُدخَلٌ ولم يُعتمد» — لا سعر ولا صورة ولا غرفة. وباقةٌ نشطة مرتبطةٌ
       به كانت تعرض سكنها للعميل رغم ذلك، فيرى غرفةً بلا ثمن. والباقة بلا
       ليالٍ لا سكن فيها فلا يُشترط لها فندق. */
    const hotelOk=(p:typeof cat.packages[number])=>{
      if(!p.hotelId||(p.nights??0)<=0) return true;
      const h=cat.hotels.find(x=>x.id===p.hotelId);
      return !!h&&h.status==="active";
    };
    const published=cat.packages.filter(p=>p.status==="active" && (p.settings?.allowOnlineBooking!==false) && hotelOk(p));
    if(!preview||!route.packageId) return published;
    const one=cat.packages.find(p=>p.id===route.packageId);
    return one&&!published.some(p=>p.id===one.id) ? [...published,one] : published;
  },[cat.packages,preview,route.packageId]);
  /* أول خطوة في الحجز لها وجهتان واضحتان فقط. المفاتيح مختصرة لتطابق
     بيانات الباقات («مكة» و«المدينة»)؛ العرض يوسّعها في cityLabel.
     لا نشتقها من الباقات حتى يظل خيار مكة والمدينة ظاهراً عند غياب
     باقته مؤقتاً، ولا تتحول الشاشة الأولى إلى نتيجة فارغة. */
  const cities=useMemo(()=>["مكة", "مكة والمدينة"],[/* خيارات رحلة ثابتة */]);

  /* الرحلة الفائتة لا تُعرض ولو بقيت "open" في القاعدة: تاريخ المغادرة
     هو الحدّ، لا الحالة. بدونه يظهر ٣٠ يوليو حجزاً متاحاً في ٢٣ أغسطس. */
  const today=todayYMD();
  /* isSellable يجمع الشروط الثلاثة في واحد ويضيف ما كان ناقصاً: رحلةٌ
     تنطلق اليوم ٢٢:٠٠ تبقى معروضةً حتى تنطلق، ورحلةٌ عادت أمس تختفي —
     والمقارنة النصّية وحدها كانت تُبقيها يوماً كاملاً. */
  const pkgTrips=(p:Pkg)=>cat.trips.filter(x=>x.packageId===p.id && isSellable(x) && availSeats(x)>0).sort((a,b)=>a.departureDate.localeCompare(b.departureDate));
  /* المدن ليست قائمةً في الكود: تُجمع من مدن الرحلات نفسها، وهي تُحدَّد
     في لوحة الإدارة عند إنشاء الرحلة (مدينة + نقطة + وقت). فمدينةٌ بلا
     رحلةٍ قادمة لا تظهر أصلاً — ولا يقع العميل على خيارٍ مآله فراغ.
     قبل اختيار الباقة يُقرأ المصدر من كل باقات الوجهة، وبعده من الباقة
     وحدها: في الحالتين ما يُعرض هو ما يمكن حجزه فعلاً. */
  const departureCities=useMemo(()=>{
    const source=screen==="focus"
      ? (city?activePkgs.filter(p=>matchesDestination(p,city)):[])
      : (pkg?[pkg]:[]);
    return [...new Set(source.flatMap(p=>pkgTrips(p)).flatMap(x =>
      x.departureStops?.length ? x.departureStops.map(s => s.city.trim()) : [x.departureCity?.trim() ?? ""]
    ).filter((x):x is string=>!!x))].sort((a,b)=>a.localeCompare(b,"ar"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[screen,city,activePkgs,pkg,cat.trips,today]);
  /* ── متى تُسأل مدينة الانطلاق؟ ──
     في الرئيسية: حين تكون للوجهة المختارة مدنُ انطلاقٍ مسجّلة — لا حين
     تكون الوجهة «مكة والمدينة» وحدها. ذلك الربط قاعدةُ الصفحة القديمة،
     ونقلُه كما هو أسقط الخطوة عن رحلات مكة وهي اليوم كلُّ ما يُسيَّر:
     الشرط يتحقّق لوجهةٍ بلا باقة، ولا يتحقّق للوجهة التي فيها الرحلات.
     المصدر هو الرحلات نفسها: إن سجّلت لها الإدارة مدناً، سُئل العميل.
     وفي الصفحة القديمة تبقى القاعدة كما كانت — لا تُمسّ. */
  const needsDepartureCity=screen==="focus"
    ? departureCities.length>0
    : (!!pkg&&pkg.destination.trim()==="مكة والمدينة");
  /* نتائج البحث في ورقة المدن — بالتطبيع العربي نفسه الذي يستعمله بقية
     البحث في الواجهة، فلا يجد حقلٌ ما لا يجده آخر. */
  const depMatches=useMemo(()=>{
    const q=searchNorm(depQuery);
    return q?departureCities.filter(c=>searchNorm(c).includes(q)):departureCities;
  },[departureCities,depQuery]);
  const pickDepartureCity=useCallback((dep:string)=>{
    /* تغيير المدينة يُبطل الرحلة المختارة: هي رحلة المدينة السابقة.
       وفي الرئيسية لا رحلة بعد، فلا شيء يُفقد. */
    setDepartureCity(dep); setTrip(null); setTravellerType(""); setDepartureCitySheet(false);
  },[]);
  /* الرحلة التي تُبنى عليها صفحتا Focus: المختارة، وإلا أقرب رحلةٍ
     قابلة للحجز. تُحسب هنا مرّةً فيقرؤها الرسمُ وحارسُ المسار من مصدرٍ
     واحد — وإلا حَرَسَ الحارسُ شرطاً غير الذي يرسم به الشرطُ الآخر. */
  /* رحلة الباقة السابقة لا يجوز أن تستمر بعد تغيير الرابط؛ وإلا اختلطت
     صورتها وفندقها وموعدها مع الباقة الجديدة في الجلسة نفسها. */
  const selectedTrip=trip?.packageId===pkg?.id ? trip : null;
  const focusTrip=useMemo(()=>selectedTrip??(pkg?pkgTrips(pkg)[0]??null:null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedTrip,pkg,cat.trips]);
  /* وسيلة النقل: الرحلة المختارة أولاً، وإلا افتراضي الباقة —
     وإلا اختفى قسم النقل كلياً حتى يختار المستفيد تاريخاً، وهو يحتاجه ليقرر. */
  const transport=cat.transports.find(x=>x.id===(focusTrip?.transportId||pkg?.transportId));
  const hotel=pkg?cat.hotels.find(h=>h.id===(focusTrip?.hotelId||pkg.hotelId)):undefined;
  /* نوع المسافر ليس معلومةً مطلوبة للحجز العام؛ لا نطلبه إلا إذا كانت
     بيانات السكن المقيدة تحتاجه لإظهار الخيارات الصحيحة. */
  const needsTravellerType=!!pkg&&needsTravellerTypeForAccommodation(pkg);
  const rooms=pkg?.roomPrices??[];
  /* الأنثى المنفردة تدفع مقعدها ومقعد الخصوصية المجاور؛ الحجز المختلط
     لا يتغير. القاعدة تعيد الحساب نفسه ولا تثق بهذه اللقطة وحدها. */
  const needsPrivacySeat = persons === 1 && travellerCounts.men === 0 && travellerCounts.women === 1;
  const transportUnits = persons + (needsPrivacySeat ? 1 : 0);
  const fullPrice=split ? packagePrice(split,persons,pkg?.seatCostOverride ?? transport?.seatCost ?? 0,pkg?.nights ?? 1,transportUnits) : null;
  const total=fullPrice?.total ?? (pkg?.marketPrice??0)*persons + (needsPrivacySeat ? (pkg?.seatCostOverride ?? transport?.seatCost ?? 0) : 0);

  /* ── مزامنة الباقة مع المسار ──
     المسار قد يتغيّر بلا نقرة: زر الرجوع، رابط مُلصق، إعادة تحميل.
     البحث في activePkgs لا في cat.packages: رابط مُسرَّب لباقة مسودة
     أو موقوفة أو مُقفلة عن الحجز الإلكتروني لا يفتحها لأحد. */
  useEffect(()=>{
    if(loading) return;
    const pid=route.packageId;
    if(!pid) return;
    const found=activePkgs.find(p=>p.id===pid);
    if(!found) return;
    /* لا نحتفظ بلقطة الباقة القديمة إذا وصل الكتالوج المحدّث أثناء
       الجلسة؛ الصورة والسعر والنص يجب أن تتحرك مع الصف نفسه. */
    if(found!==pkg) setPkg(found);
    setTrip(current=>current?.packageId===found.id ? current : null);
  },[loading,route.packageId,activePkgs,pkg]);

  /* الاختيار يُمسح إن لم تعد الباقة تنطلق منه — لا عند كل تغيّر باقة.
     في المسار الجديد تُختار المدينة قبل الباقة (خطوةٌ بعد الوجهة)،
     فالمسح الشامل كان يُلغي اختيار العميل في اللحظة التي يفتح فيها
     الرحلة التي اختارها بنفسه من تلك المدينة. */
  useEffect(()=>{
    /* بلا باقة لا شيء يُقاس عليه — والمدينة هنا اختيارُ خطوة الوجهة في
       الرئيسية، يسبق الباقة ولا يُمحى بها. */
    if(!pkg) return;
    /* الرحلة قد تمر بمدينة العميل بعد محطة البداية؛ لا نمسح اختياره
       لمجرد أن المدينة المخزنة في الحقول القديمة هي المحطة الأولى. */
    setDepartureCity(c=>c&&pkgTrips(pkg).some(x=>
      x.departureStops?.length
        ? x.departureStops.some(stop=>stop.city.trim()===c)
        : x.departureCity?.trim()===c
    )?c:"");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[pkg?.id,cat.trips]);
  /* الورقة تُفتح من تلقائها بعد اختيار الوجهة في الرئيسية حيث تكون
     المدينة مطلوبةً ولم تُختر: خطوةٌ واحدة تأتي إلى العميل، لا حقلٌ
     يبحث عنه في الصفحة. */
  useEffect(()=>{
    const atChoice=screen==="focus"&&!!city;
    /* ورقةٌ بلا خيارات لا تُفتح من تلقائها: لو لم تُسجَّل مدن الانطلاق
       بعد، تبقى الرحلات معروضةً بلا تصفية بدل نافذةٍ فارغة تستقبل
       الزائر على الصفحة الرئيسية. الرسالة تبقى في متناوله من الشريط. */
    if(atChoice&&needsDepartureCity&&!departureCity&&departureCities.length>0) setDepartureCitySheet(true);
  },[screen,city,needsDepartureCity,departureCity,departureCities.length]);
  /* البحث يُفرَّغ عند كل فتح: ورقةٌ تُفتح على بحثٍ سابق تُخفي مدناً
     موجودة، فيبدو للعميل أنها اختفت من الخدمة. */
  useEffect(()=>{ if(departureCitySheet) setDepQuery(""); },[departureCitySheet]);
  /* في صفحتي Focus تُقرأ المدينة من الرحلة المعروضة إن غابت — بعد إعادة
     تحميل في منتصف المسار مثلاً. الرحلة تحمل مدينتها من الإدارة، فلا
     يُسأل العميل عمّا أجاب عنه ضمناً حين اختار الرحلة. */
  useEffect(()=>{
    if((screen==="focusListing"||screen==="focusConfigure")&&!departureCity&&focusTrip?.departureCity)
      setDepartureCity(focusTrip.departureCity.trim());
  },[screen,departureCity,focusTrip]);

  /* ── استعادة المسوّدة ──
     مرّة واحدة عند أول جهوز للكتالوج: بعدها الحالة في الذاكرة أحدث من
     المسوّدة، فإعادة تطبيقها تُرجع المستفيد خطوةً إلى الوراء. */
  const restoreOnce=useRef(false);
  const [routeReady,setRouteReady]=useState(false);
  useEffect(()=>{
    if(loading||restoreOnce.current) return;
    restoreOnce.current=true;
    const pid=route.packageId;
    const d=pid?readDraft():null;
    if(d&&d.packageId===pid){
      const tr=d.tripId?cat.trips.find(x=>x.id===d.tripId)??null:null;
      setTrip(tr); setPersons(d.persons); setTravellerCounts(d.travellerCounts); setSplit(d.split);
      setPax([d.pax[0]??emptyPax()]); setAgreed(d.agreed); setTravellerType(travellerTypeForCounts(d.travellerCounts));
    }
    setRouteReady(true);
  },[loading,route.packageId,cat.trips]);

  /* ── حفظ المسوّدة ──
     بعد الإرسال لا تُحفظ: رقم الطلب صار في القاعدة، ومسوّدةٌ باقية
     تعيد المستفيد إلى نموذج مملوء لطلبٍ أرسله فعلاً. */
  useEffect(()=>{
    if(!routeReady||!pkg||bookingNo) return;
    if(!draftHasInput(pax,trip?.id??null,split)) return;
    writeDraft({packageId:pkg.id,tripId:trip?.id??null,persons,travellerCounts,split,travellerType,pax,agreed});
  },[routeReady,pkg?.id,trip?.id,persons,travellerCounts,split,travellerType,pax,agreed,bookingNo]);

  /* ── العناوين القديمة ──
     /focus صارت هي «/». تُرسَم الصفحة نفسها ثم يُصحَّح العنوان استبدالاً:
     رابطٌ أُرسل أيام التجربة يصل إلى الرئيسية، ولا يبقى عنوانان لصفحةٍ
     واحدة. أثرٌ مستقل عن الحرّاس لأنه لا يتوقّف على وصول الكتالوج. */
  useEffect(()=>{
    if(route.legacyPath) navigate(pathOf(route.screen,route.packageId),{replace:true});
  },[route.legacyPath,route.screen,route.packageId,navigate]);

  /* ── حرّاس المسار ──
     مسار لا يمكن رسمه كان يُعيد لا شيء: صفحة بيضاء صامتة. الآن
     يُستبدل بأقرب مسار صالح — استبدالاً لا إضافةً حتى لا يعيده زر
     الرجوع في حلقة. */
  useEffect(()=>{
    if(loading||!routeReady) return;
    /* الكتالوج لم يصل: كل الباقات «غير موجودة» فيبدو رابط الباقة تالفاً
       ويُمحى من شريط العنوان. شاشة الخطأ بزرّ الإعادة معروضة أصلاً،
       والمسار يجب أن يبقى حتى تنجح الإعادة. */
    if(catErr) return;
    /* مسار مجهول: يُصحَّح العنوان إلى «/» بدل إبقاء رابط تالف في
       شريط العنوان يُشارَك ويُحفظ كأنه صحيح. */
    if(route.unknown){ replaceScreen(HOME,""); return; }
    const pid=route.packageId;
    if(pid&&!activePkgs.some(p=>p.id===pid)){ replaceScreen(HOME,""); return; }
    if(NEEDS_PACKAGE.includes(screen)&&!pkg){ replaceScreen(HOME,""); return; }
    /* صفحتا Focus تُبنيان على رحلةٍ بعينها: بلا رحلةٍ قابلة للحجز كان
       شرط الرسم يُرجع لا شيء — صفحة بيضاء صامتة لرابطٍ مُشارَك انتهت
       مواعيد باقته. الآن يعود الزائر إلى الرئيسية ليختار من المتاح. */
    if((screen==="focusListing"||screen==="focusConfigure")&&!focusTrip){ replaceScreen(HOME,""); return; }
    if(screen==="review"&&!trip){ replaceScreen("focusListing"); return; }
    /* شاشة النجاح بلا رقم طلب: تحديثٌ بعد الإرسال. الطلب محفوظ فعلاً،
       فالوجهة «طلباتي» لا نموذج فارغ. */
    if(screen==="success"&&!bookingNo){ replaceScreen(session?"track":HOME,""); return; }
    if(screen==="otp"&&!validPhone(loginPhone)){ replaceScreen("login"); return; }
    /* الجلسة تُقرأ بوعد — قبل جهوزها لا يُطرد أحد من مسار محمي. */
    if(!sessionReady) return;
    if(!session&&screen==="account"){ replaceScreen("login"); return; }
  },[loading,routeReady,catErr,screen,route.unknown,route.packageId,activePkgs,pkg,trip,focusTrip,bookingNo,loginPhone,session,sessionReady,replaceScreen]);

  function reset(){ clearDraft();setPkg(null);setTrip(null);setPersons(0);setTravellerCounts(emptyTravellerCounts());setSplit(null);setDepartureCity("");setTravellerType("");setPax([emptyPax()]);setPaxTouched({});setPaxTried(false);setContactPhone("");setContactTried(false);setAgreed(false);setBookingNo("");setSubmittedAt(null);setErrMsg(""); }

  // ── تحقق نموذج صاحب الحجز ──
  const paxErrs=useMemo(()=>pax.map(p=>paxErrors(p,t,lang)),[pax,t,lang]);
  const paxValid=paxErrs.every(e=>Object.keys(e).length===0);
  const setPaxField=(i:number,k:keyof Pax,v:string)=>setPax(a=>a.map((x,j)=>j===i?{...x,[k]:v}:x));
  const touch=(i:number,f:PaxField)=>setPaxTouched(s=>({...s,[`${i}.${f}`]:true}));
  const errOf=(i:number,f:PaxField)=>(paxTried||paxTouched[`${i}.${f}`])?paxErrs[i]?.[f]:undefined;
  function goReview(){
    setPaxTried(true);
    setContactTried(true);
    /* إلى أول حقلٍ خاطئ لا إلى أعلى الصفحة: الخطأ قد يكون في آخر النموذج. */
    if(!paxValid||!validPhone(contactPhone)){ focusFirstInvalid(); return; }
    window.scrollTo({top:0});
    setScreen("review");
  }

  /** يغذّي الدفتر من الحجز. المطابقة برقم الوثيقة — الاسم يُكتب بصيغ
      مختلفة في كل مرة، فالمطابقة به تُنشئ نسخاً للشخص نفسه. */
  const rememberTravellers=useCallback(async(list:Pax[])=>{
    if(!session) return;
    try{
      const known=new Map((await fetchTravellers())
        .filter(x=>x.idNumber.trim())
        .map(x=>[x.idNumber.trim(),x]));
      for(const p of list){
        const idn=p.idNumber.trim();
        if(!idn) continue;
        const previous=known.get(idn);
        /* نفس رقم الوثيقة يعني الشخص نفسه، لكن بياناته قد عُدّلت؛ نحفظ
           النسخة الأحدث بدل إبقاء أول نسخة في الدفتر إلى الأبد. */
        const saved=await saveTraveller({id:previous?.id??"",name:p.name.trim(),docType:p.docType||undefined,idNumber:idn,
          nationality:p.nationality,gender:p.gender,ageGroup:p.ageGroup,
          birthDate:p.birthDate,phone:p.phone.replace(/\s/g,"")});
        known.set(idn,saved);
      }
    }catch(e){
      /* فشل الدفتر لا يُبلَّغ للمستفيد: الحجز نجح، وهذا تحسينٌ لحجزه القادم. */
      console.error("[travellers] تعذّر تحديث الدفتر:",e);
    }
  },[session?.userId]);

  async function doSubmit(){
    if(submitting||!trip||!pkg||persons < 1) return;
    setErrMsg("");
    if(travellerCountTotal(travellerCounts)!==persons){
      setErrMsg(t("errCountsMismatch"));
      setScreen("focusConfigure",pkg.id);
      return;
    }
    /* قد يصل العميل إلى الملخص من زر الرجوع أو بعد تحديث الصفحة، بينما
       رقم التواصل حالة محلية لا يجوز أن تتحول إلى 400 غامض من الخادم. */
    if(!validPhone(contactPhone)){
      setContactTried(true);
      setErrMsg(t("errContactPhone"));
      setScreen("passengers");
      return;
    }
    if(!agreed){ setErrMsg(t("iAgreeRead")); return; }
    if(needsTravellerType&&!travellerType){
      setErrMsg(t("travellerTypeRequired"));
      setScreen("focusListing",pkg.id);
      return;
    }
    if(!paxValid){ setErrMsg(t("required")); setPaxTried(true); setScreen("passengers"); return; }
    setSubmitting(true);
    try{
      const id=await submitBooking({
        tripId:trip.id, packageId:pkg.id, clientName:pax[0].name, clientPhone:contactPhone.replace(/\s/g,""),
        /* النصّ يُبنى بالعربية دائماً لا بلغة الواجهة: لوحة الموظف والتذاكر
           وصفحة الدفع تعرضه كما هو، فحجز بالإنجليزية كان يكتب فيها سطراً
           إنجليزياً وسط جدول عربي. والغرف تُحفظ مفصّلة بجواره. */
        roomType:split?`${splitSummary(split,makeT("ar"))}${split.roomCount && split.roomCount > 1 ? ` · ${split.roomCount} غرف` : ""}`:"", persons, travellerType:travellerType||undefined,
        /* قاعدة البيانات تحفظ ثلاثة أصناف؛ تجربة الحجز الحالية فيها
           رجال ونساء فقط، لذلك نرسل الأطفال صراحةً بصفر لا كمفتاح غائب. */
        travellerCounts:{...travellerCounts,children:0}, pricing:fullPrice ? { seatPrice:fullPrice.seatPrice, transportTotal:fullPrice.transport, accommodationNightly:split?.perNight ?? 0, roomCount:fullPrice.roomCount, nights:fullPrice.nights, accommodationTotal:fullPrice.accommodation } : undefined, total,
        rooms:split?.rooms.flatMap(r=>Array.from({length:split.roomCount ?? 1},()=>({tierId:r.id,type:r.type,persons:r.persons,perNight:r.perNight}))),
        /* لا تُنشأ سجلات وهمية للمرافقين: سجلّ صاحب الحجز وحده الآن. */
        pilgrims:[pax[0]].map(p=>({name:p.name.trim(),docType:p.docType||undefined,idNumber:p.idNumber.trim(),
          nationality:p.nationality,gender:p.gender,ageGroup:p.ageGroup,birthDate:p.birthDate,
          phone:(p.phone||contactPhone).replace(/\s/g,"")})),
      });
      /* المسوّدة تُمحى قبل الانتقال: الطلب صار في القاعدة، وبقاؤها
         يعيد المستفيد إلى نموذج مملوء لطلب أرسله. */
      clearDraft();
      setBookingNo(id); setSubmittedAt(Date.now()); setScreen("success");
      /* دفتر المسافرين يتغذّى من كل حجز — لا يُنتظر ولا يُعطّل النجاح. */
      void rememberTravellers([pax[0]]);
    }catch(e){
      /* أي خطأ آخر كان يُعرض كـ«لم تعد المقاعد كافية» فيضيّع سببه الحقيقي
         (رحلة محذوفة، صلاحية، شبكة). السبب يُسجَّل بنصّه في الطرفية، والعميل
         يقرأ جملةً مفهومة: نصّ الخادم («violates row-level security…») ليس له. */
      console.error("[booking] فشل إنشاء الحجز:",e);
      if(e instanceof SeatsError) setErrMsg(`${t("errSeats")} (${t("seatsLeft")}: ${e.available})`);
      else if(e instanceof AuthRequiredError) setErrMsg(t("errSubmitGeneric"));
      else setErrMsg(t("sendFailed"));
    }finally{ setSubmitting(false); }
  }

  /* ── الهوية: قراءة الجلسة ومتابعة تغيّرها ── */
  useEffect(()=>{
    let alive=true;
    loadSession().then(s=>{ if(alive){ setSession(s); setSessionReady(true); } })
                 .catch(()=>{ if(alive) setSessionReady(true); });
    return onAuthChange(s=>{ if(alive) setSession(s); });
  },[]);

  /* ── رابط استعادة كلمة المرور ──
     العميل هنا بـ?code من رسالة البريد. يُبدَّل مرّةً واحدة بجلسةٍ
     يكتب فيها كلمته الجديدة. بلا رمزٍ في العنوان فالصفحة فُتحت مباشرةً
     لا من الرسالة — ويُقال ذلك بدل نموذجٍ لا يحفظ شيئاً. */
  useEffect(()=>{
    if(screen!=="recover"||recoverState!=="checking") return;
    let alive=true;
    consumeRecoveryCode().then(r=>{
      if(!alive) return;
      /* الرمز مُسح من شريط العنوان داخل الدالة؛ وهذا يُبلّغ الموجّه
         بالمسح كي لا تبقى نسخته من العنوان حاملةً رمزاً محروقاً. */
      replaceScreen("recover");
      if(r===null){ setRecoverErr(t("recoverOpenFromEmail")); setRecoverState("invalid"); return; }
      if(isFail(r)){ setRecoverErr(authMsg(r,t)); setRecoverState("invalid"); return; }
      setSession(r.session); setRecoverState("ready");
    }).catch(e=>{
      console.error("[recover] تعذّر تبديل رمز الاستعادة:",e);
      if(alive){ setRecoverErr(t("errUnknown")); setRecoverState("invalid"); }
    });
    return ()=>{ alive=false; };
  },[screen,recoverState,t,replaceScreen]);

  // OTP helpers
  function startResendCountdown(sec:number){ setResendIn(sec); if(resendTimer.current) clearInterval(resendTimer.current);
    resendTimer.current=setInterval(()=>setResendIn(s=>{ if(s<=1){ if(resendTimer.current) clearInterval(resendTimer.current); return 0; } return s-1; }),1000); }

  /** بعد الدخول/حفظ الملف يعود العميل لآخر خطوة من الحجز، لا للواجهة. */
  function continueAfterAuth(){
    if(intent==="track"){ setScreen("track"); return; }
    let saved="";
    try{ saved=sessionStorage.getItem(BOOKING_RESUME_KEY)??""; sessionStorage.removeItem(BOOKING_RESUME_KEY); }catch{}
    const savedRoute=saved?parseRoute(saved):null;
    if(savedRoute?.packageId&&(savedRoute.screen==="passengers"||savedRoute.screen==="review")){
      navigate(saved);
      return;
    }
    setScreen("passengers");
  }

  /** بعد التحقق: من ملفه ناقص يُكمل حسابه، وإلا يعود لِما جاء منه. */
  function afterAuth(s:CustomerSession){
    if(!s.profile?.complete){
      /* الصفحة التالية هي نموذج صاحب الحجز الكامل، لا ملفاً مختصراً ثم
         نموذج «معتمر 1» مكرراً. */
      setAcEmail(s.profile?.email??""); setAcErr(""); setScreen("account"); return;
    }
    continueAfterAuth();
  }

  async function beginLogin(){
    if(!validPhone(loginPhone)){ setOtpErr(t("invalidPhone")); return; }
    setOtpErr(""); setSending(true);
    const known=await customerAccountExists(loginPhone);
    setSending(false);
    if(isFail(known)){ setOtpErr(authMsg(known,t)); return; }
    setLoginStage(known.exists?"password":"signup");
  }
  async function submitPasswordLogin(){
    if(sending||!loginPassword) return;
    setOtpErr(""); setSending(true);
    const r=await signInWithCustomerPassword(loginPhone,loginPassword);
    setSending(false);
    if(isFail(r)){ setOtpErr(t("errWrongPassword")); return; }
    setSession(r.session); afterAuth(r.session);
  }
  /* ── استعادة كلمة المرور ──
     الرسالة تُطلَب بالبريد، والردّ واحد سواء وُجد الحساب أم لا: كشفُ
     «لا حساب بهذا البريد» يجعل النموذج أداةَ جردٍ لمن عندنا حساب. */
  async function submitForgot(){
    if(sending) return;
    const email=forgotEmail.trim();
    if(!email.includes("@")) return;
    setOtpErr(""); setSending(true);
    const r=await sendCustomerRecovery(email);
    setSending(false);
    if(isFail(r)){ setOtpErr(authMsg(r,t)); return; }
    setLoginStage("sent");
  }
  /** يضبط الكلمة الجديدة داخل جلسة الاستعادة التي فتحها الرابط. */
  async function submitNewPassword(){
    if(recoverBusy) return;
    if(recoverPw.length<6){ setRecoverErr(t("errPwShort")); return; }
    if(recoverPw!==recoverPw2){ setRecoverErr(t("errPwMismatch")); return; }
    setRecoverErr(""); setRecoverBusy(true);
    const r=await setCustomerPassword(recoverPw);
    setRecoverBusy(false);
    if(isFail(r)){ setRecoverErr(authMsg(r,t)); return; }
    /* الجلسة تُقرأ من جديد: تبديل الكلمة يُصدر رموزاً جديدة، والملف
       يُجلب معها فتعرف الشاشة التالية أمكتملٌ الحساب أم لا. */
    const fresh=await loadSession();
    if(fresh) setSession(fresh);
    setRecoverState("done");
  }

  async function submitSignup(){
    if(sending||!loginEmail.includes("@")||loginPassword.length<6) return;
    setOtpErr(""); setSending(true);
    const r=await signUpCustomer(loginPhone,loginEmail,loginPassword);
    setSending(false);
    if(isFail(r)){ setOtpErr(authMsg(r,t)); return; }
    /* لا يوقف التسجيل — البريد المكرَّر شائع في الأسرة الواحدة. لكنه
       يُقال الآن بدل أن يُكتشف يوم يُطلب رابط استعادة لا يأتي. */
    if(r.recoveryWarning) toast.warning(r.recoveryWarning,{duration:10000});
    setSession(r.session); afterAuth(r.session);
  }
  /* مسار الرمز القديم يبقى للروابط/الجلسات القائمة فقط. */
  async function beginOtpLogin(){
    if(!validPhone(loginPhone)){ setOtpErr(t("invalidPhone")); return; }
    setOtpErr(""); setSending(true);
    /* راية التجربة: لا رمز ولا شاشة تأكيد — الجلسة تُفتح بالرقم وحده
       ثم يمضي المستخدم إلى حيث كان ذاهباً. الجلسة حقيقية بـJWT، فما
       بعدها من حجزٍ وتتبّع يعمل كما لو دخل بالرمز. */
    if(SKIP_OTP){
      const r=await signInNoOtp(loginPhone);
      setSending(false);
      if(isFail(r)){ setOtpErr(authMsg(r,t)); return; }
      setSession(r.session); afterAuth(r.session);
      return;
    }
    const r=await sendOtp(loginPhone,"sms");
    setSending(false);
    if(isFail(r)){ setOtpErr(authMsg(r,t)); return; }
    setSentVia(r.channel); setOtpCode(""); startResendCountdown(r.cooldownSec); setScreen("otp");
  }
  /** الإرسال الأول رسالة نصية دائماً؛ وهذه تجرّب واتساب إن كان مفعّلاً. */
  async function resendCode(channel:"sms"|"whatsapp"="sms"){
    if(resendIn>0||sending) return;
    setOtpErr(""); setSending(true);
    const r=await sendOtp(loginPhone,channel);
    setSending(false);
    if(isFail(r)){ setOtpErr(authMsg(r,t)); if(r.kind==="rate_limited") startResendCountdown(r.retryAfterSec??60); return; }
    setSentVia(r.channel); setOtpCode(""); startResendCountdown(r.cooldownSec);
  }
  async function confirmOtp(){
    if(sending) return;
    setOtpErr(""); setSending(true);
    const r=await verifyOtp(loginPhone,otpCode);
    setSending(false);
    if(isFail(r)){ setOtpErr(authMsg(r,t)); setOtpCode(""); return; }
    setSession(r.session); afterAuth(r.session);
  }
  async function submitAccount(){
    setPaxTried(true); setAcErr("");
    const owner=pax[0]??emptyPax();
    if(Object.keys(paxErrors(owner,t,lang)).length){ focusFirstInvalid(); return; }
    const {firstName,lastName}=profileName(owner.name);
    setAcSaving(true);
    const r=await saveProfile({firstName,lastName,birthDate:owner.birthDate,email:acEmail||session?.profile?.email||""});
    setAcSaving(false);
    if(isFail(r)){ setAcErr(authMsg(r,t)); return; }
    setSession(s=>s?{...s,profile:r.profile}:s);
    /* بيانات الحساب هي بيانات المعتمر الأساسي؛ لا نفتح له نموذجاً ثانياً. */
    void rememberTravellers([owner]);
    setScreen("review");
  }
  async function logout(){ await clearSession(); setSession(null); setMyOrders(null); setScreen(HOME); }

  /** بوابة الدخول بين صفحة التفاصيل وبيانات المعتمرين. */
  function goAfterDetails(){
    /* المعاينة تعرض ولا تحجز: باقةٌ مسودة قد تكون بلا أسعار ولا رحلات،
       والمضيّ فيها يُنتج طلباً على منتجٍ لم يُنشر بعد. */
    if(preview){ toast.info(t("previewNote")); return; }
    setScreen("passengers");
  }

  function openLogin(from:"flow"|"track"){
    if(from==="flow") rememberBookingResume();
    else try{ sessionStorage.removeItem(BOOKING_RESUME_KEY); }catch{}
    setIntent(from); setLoginPhone(cachedPhone.current??""); setLoginStage("phone"); setLoginPassword(""); setLoginEmail(""); setOtpErr(""); setScreen("login");
  }

  /* صفحة الرحلة تُفتح من أعلاها. الانتقال يبدّل المحتوى ولا يحرّك التمرير،
     فمن ضغط بطاقةً بعد أن نزل في القائمة كان يرى وسط الصفحة لا صورتها وعنوانها.
     مقصورٌ على الدخول إلى الصفحة: الرجوع إلى القائمة يبقى للمتصفّح. */
  useEffect(()=>{ if(screen==="focusListing") window.scrollTo(0,0); },[screen]);

  // تحميل الطلبات عند فتح التتبّع/الحساب بجلسة قائمة
  useEffect(()=>{ if((screen==="track"||screen==="profile") && session){ setOrdersLoading(true); setOrdersFailed(false);
    /* بلا catch يبقى المؤشّر دائراً على «طلباتي» بلا نهاية ولا رسالة. */
    myBookings(session.phoneLocal).then(o=>{setMyOrders(o);setOrdersLoading(false);})
      .catch(e=>{ console.error("[myBookings]",e); setOrdersLoading(false); setOrdersFailed(true); }); } },[screen,session?.userId,ordersTry]);

  const reducedMotion=useReducedMotion();
  /** المبلغ بعملته: العربية من lib/money، والإنجليزية برمزها من القاموس. */
  const amt=(n:number)=>lang==="ar"?sar(n):`${money(n)} ${t("currency")}`;
  const copyBookingNo=async()=>{
    try{ await navigator.clipboard.writeText(bookingNo); toast.success(t("copiedNo")); }
    catch{ toast.error(t("copyFailed")); }
  };
  /* حقلٌ لاتينيّ داخل صفحة عربية: يُكتب من اليسار ويُحاذى لبداية السطر. */
  const ltrInput={direction:"ltr",textAlign:(dir==="rtl"?"right":"left")} as const;
  /** حقول صاحب الحجز — نموذجٌ واحد تعرضه شاشتا «بياناتك» و«إكمال الحساب».
      دالّةٌ تُرجع عناصر لا مكوّن: مكوّنٌ يُعرَّف هنا يُركَّب من جديد مع كل
      حرف فيفقد الحقل تركيزه. `setDocType` يبقى لكل شاشة كما كان عندها. */
  const ownerFields=(i:number,setDocType:(v:DocType)=>void)=>{
    const p=pax[i]??emptyPax();
    const doc=p.docType?docTypeDef(p.docType):null;
    return <>
      {/* الاسم */}
      <LField label={t("name")} hint={t("nameHint")} error={errOf(i,"name")}>
        <input value={p.name} onChange={e=>setPaxField(i,"name",e.target.value)} onBlur={()=>touch(i,"name")}
          name="name" autoComplete="name" enterKeyHint="next"
          placeholder={t("namePh")} className="tsf-input"/>
      </LField>

      {/* نوع الوثيقة — يحدّد شكل الرقم المطلوب */}
      <LField label={t("docType")} hint={t("docTypeHint")} error={errOf(i,"docType")}>
        <SearchSelect
          dir={dir} searchable={false} subInTrigger={false} value={p.docType} invalid={!!errOf(i,"docType")}
          onChange={v=>{ setDocType(v as DocType); touch(i,"docType"); }}
          options={DOC_TYPES.map(d=>({value:d.value,label:docText(d.label,lang),prefix:d.icon,sub:docText(d.hint,lang)}))}
          placeholder={t("docTypePh")}/>
      </LField>

      {/* رقم الوثيقة — عنوانه ونصّه الإرشادي يتغيّران حسب النوع.
          الأرقام الهندية تُحوَّل قبل حذف غير الأرقام، وإلا حُذفت معها. */}
      <LField label={doc?docText(doc.numberLabel,lang):t("idNumber")}
        hint={doc?docText(doc.hint,lang):t("docTypeHint")} error={errOf(i,"idNumber")}>
        <input value={p.idNumber} disabled={!p.docType} onBlur={()=>touch(i,"idNumber")}
          onChange={e=>{ const raw=toLatinDigits(e.target.value); const v=doc?.numeric?raw.replace(/\D/g,""):raw.replace(/\s/g,""); setPaxField(i,"idNumber",v.slice(0,doc?.maxLength??20)); }}
          inputMode={doc?.numeric?"numeric":"text"} maxLength={doc?.maxLength??20}
          autoComplete="off" autoCapitalize="characters" enterKeyHint="next"
          placeholder={doc?doc.placeholder:"—"} className="tsf-input" style={ltrInput}/>
      </LField>

      {/* الجنسية — قائمة ببحث */}
      <LField label={t("nationality")} hint={t("nationalityHint")} error={errOf(i,"nationality")}>
        <NationalitySelect lang={lang} dir={dir} value={p.nationality} invalid={!!errOf(i,"nationality")}
          placeholder={t("nationalityPh")}
          onChange={v=>{ setPaxField(i,"nationality",v); touch(i,"nationality"); }}/>
      </LField>

      {/* تاريخ الميلاد — يوم / شهر / سنة بلوحة أرقام */}
      {/* الحاوية tsf-birth: حين يقول الحقل نفسه «تاريخ غير صحيح» تُخفى
          «هذا الحقل مطلوب» تحته (في customer-flow.css) — رسالةٌ واحدة تكفي،
          والثانية تناقض من ملأ الخانات الثلاث. */}
      <div className="tsf-birth">
      <LField group label={t("birthDate")} hint={p.birthDate?undefined:t("birthDateHint")} error={errOf(i,"birthDate")}>
        <BirthDateInput lang={lang} value={p.birthDate} invalid={!!errOf(i,"birthDate")}
          onChange={v=>{ setPaxField(i,"birthDate",v); touch(i,"birthDate"); }}/>
      </LField>
      </div>
    </>;
  };

  const isFlow=FLOW_SCREENS.includes(screen);
  const nationalDayCampaign=isSaudiNationalDayCampaign();
  /* الاحتفال واجهة ترحيب فقط: ما إن يختار المستفيد وجهته، تعود شاشات
     الرحلات والحجز إلى ألوانها المعتادة التي تخدم القراءة والمقارنة. */
  const nationalDayHome=nationalDayCampaign&&screen==="focus";
  /* وجهة ✕ و«رجوع» من شاشات المسار: صفحة تفاصيل الباقة. ثابتٌ واحد لا
     اسمُ شاشةٍ مكتوبٌ في خمسة مواضع — كان المكتوب "listing"، فمن ضغط ✕
     على تسجيل الدخول يُقذف إلى التصميم القديم بلا أن يطلبه. */
  const detailScreen:Screen = "focusListing";
  /* الحساب والحجوزات جزءٌ من الواجهة الجديدة كذلك؛ لا تعود لهما خلفية
     الحرم القديمة أو لون قاعدة مختلف حين ينتقل العميل بين التبويبات. */
  const whiteBase=isFlow||screen==="focus"||screen==="focusListing"||screen==="focusConfigure"||screen==="track"||screen==="profile"||screen==="custom";
  /* Safari قد يكشف لون body عند شريط الحالة أو أسفل الـviewport المتغيّر.
     لا نتركه أبيض في Focus: لون السطح يجب أن يمتد بلا نهاية حول الصفحة. */
  const pageBase=screen==="focus" ? "#fffaf2" : (screen==="focusListing"||screen==="focusConfigure" ? "#fffaf4" : (whiteBase ? "#fff" : G.bg));
  useEffect(()=>{
    const browserBase=nationalDayHome ? "#004127" : pageBase;
    document.documentElement.style.backgroundColor=browserBase;
    document.body.style.backgroundColor=browserBase;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content",browserBase);
  },[pageBase,nationalDayHome]);

  /* بلا شاشة تحميل ثانية: شاشة البدء في index.html ما زالت فوق الصفحة
     ويُزيلها الأثر أعلاه فور جهوز الكتالوج. */
  /* لا نحجب صفحة اختيار الوجهة بسبب جلب الرحلات: الكتالوج يصل في الخلفية.
     أما الروابط المباشرة إلى رحلة أو حجز فتظل محجوبة حتى تتوفر بياناتها. */
  if(loading&&!canRenderLandingWhileLoading) return null;

  /* الكتالوج لم يصل: شاشة صريحة بزرّ إعادة بدل صفحة فارغة تبدو «لا باقات». */
  if(catErr&&!cat.packages.length&&city) return (
    <div dir={dir} lang={lang} className="ts-customer-app" style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"#fff",fontFamily:"var(--font-app)"}}>
      <div style={{maxWidth:380,width:"100%",textAlign:"center"}}>
        <div style={{display:"grid",placeItems:"center",marginBottom:18}}><IconDisc tone="danger"><CloudOff size={28}/></IconDisc></div>
        <h1 style={{...T.h1,fontSize:24,color:C.ink,margin:"0 0 8px"}}>{t("loadFailed")}</h1>
        <p style={{...T.body,color:C.ink2,margin:"0 0 22px"}}>{t("loadFailedSub")}</p>
        <CTAButton full onClick={loadCatalog}>{t("retryBtn")}</CTAButton>
      </div>
    </div>
  );

  return (
    <DirProvider value={dir}>
    <div dir={dir} lang={lang} className={`ts-customer-app min-h-screen flex flex-col relative${nationalDayHome?" ts-national-day":""}`}
      style={{background:nationalDayHome?"transparent":pageBase,fontFamily:"var(--font-app)"}}>
      {nationalDayHome&&<div aria-hidden className="ts-national-day-backdrop"/>}
      {/* R1: خلفية خفيفة — تُخفى في الشاشات المعاد بناؤها لأن قاعدتها بيضاء */}
      {!whiteBase&&
        <div aria-hidden style={{position:"fixed",inset:0,backgroundImage:"url(/bg-haram.jpg)",backgroundSize:"cover",backgroundPosition:"center",opacity:0.06,pointerEvents:"none",zIndex:0}}/>}
      {/* شريط المعاينة — ثابت فوق الصفحة كلها فلا تُلتقط لقطة شاشة منها
          وتُرسَل للعميل على أنها الصفحة المنشورة. */}
      {preview&&(
        <div style={{position:"sticky",top:0,zIndex:60,background:"#8A6A08",color:"#fff",
          padding:"8px 16px",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",
          fontFamily:"var(--font-app)",fontSize:12,fontWeight:700}}>
          <Eye size={14}/>
          <span>{t("previewTitle")}</span>
          <span style={{fontWeight:400,opacity:0.9}}>— {t("previewNote")}</span>
        </div>
      )}
      <div className="relative flex flex-col flex-1" style={{zIndex:1}}>
      {!isFlow && (screen === "track" || screen === "profile" || screen === "custom") &&
        <DesktopNav screen={screen} home={HOME} onNav={setScreen} lang={lang} setLang={setLang} t={t}
          cities={cities} city={city} setCity={setCity}
          signedIn={!!session} onLogin={()=>openLogin("track")} onSignup={()=>openLogin("track")}/>
      }

      {/* ═══ الرئيسية — تجربة Focus على «/» ═══
          الوجهة أولاً ثم الرحلات. كانت هذه الكتلة وكتلةُ الاستكشاف
          القديم تتشاركان مكوّن Explore بخاصيّة destinationFirst؛ حُذفت
          القديمة في ٢٠٢٦-٠٩-١٦ فلم تبق إلا هذه. */}
      {screen==="focus"&&<>
        <Explore
          packages={activePkgs}
          priceOf={p=>packageStartingPrice(p,cat.transports.find(t=>t.id===p.transportId)?.seatCost ?? 0)}
          city={city} setCity={nextCity=>{
            setCity(nextCity);
            /* الوجهة تغيّرت ⇒ مدينة انطلاقٍ اختيرت لوجهةٍ أخرى لا تُحمل
               معها: قد لا تُسيّر هذه الوجهة رحلةً منها أصلاً. */
            setDepartureCity("");
            if(!nextCity){ setPkg(null); setTrip(null); setScreen("focus"); }
          }}
          tripsOf={pkgTrips}
          departureCity={departureCity} departureRequired={needsDepartureCity}
          onPickDepartureCity={()=>setDepartureCitySheet(true)}
          /* مدينة الانطلاق لا تُمسح هنا: اختارها العميل قبل الرحلة،
             والرحلة المفتوحة تنطلق منها. مسحُها كان يعني سؤاله مرّتين. */
          onOpen={(p,chosenTrip)=>{clearDraft();setPkg(p);setTrip(chosenTrip??pkgTrips(p)[0]??null);setPersons(0);setTravellerCounts(emptyTravellerCounts());setSplit(null);setTravellerType("");setPax([emptyPax()]);setPaxTouched({});setPaxTried(false);setAgreed(false);setScreen("focusListing",p.id);}}
          onCustom={()=>setScreen("custom")}
          signedIn={!!session}
          onAccount={()=>session ? setScreen("profile") : openLogin("track")}
          t={t} lang={lang} setLang={setLang} loadingTrips={loading}
        />
      </>}

      {/* صفحات التفاصيل والتخصيص الخاصة بتجربة Focus فقط. */}
      {screen==="focusListing"&&pkg&&focusTrip&&
        <FocusDetails pkg={pkg} trip={focusTrip} hotel={hotel} transport={transport} departureCity={departureCity} lang={lang}
          persons={persons} travellerCounts={travellerCounts} setTravellerCounts={setTravellerBreakdown} split={split} setSplit={setSplit}
          travellerType={travellerType}
          onBack={()=>setScreen("focus")} onContinue={goAfterDetails}/>
      }
      {screen==="focusConfigure"&&pkg&&focusTrip&&
        <FocusConfigure pkg={pkg} trip={focusTrip} hotel={hotel} transport={transport}
          persons={persons} travellerCounts={travellerCounts} setTravellerCounts={setTravellerBreakdown} split={split} setSplit={setSplit} lang={lang}
          travellerType={travellerType}
          onBack={()=>setScreen("focusListing")} onContinue={goAfterDetails}/>
      }

      {/* ── مدينة الانطلاق ──
          مرحلةٌ في المسار: ورقةٌ تُفتح وحدها بعد الوجهة، فيها بحثٌ يعمل
          على التطبيع العربي («دمام» تجد «الدمام»)، والقائمة تُبنى من مدن
          الرحلات المنشورة — مدينةٌ جديدة تُطلق منها رحلة تظهر هنا بلا
          تعديل كود. */}
      <Sheet open={departureCitySheet} onClose={()=>setDepartureCitySheet(false)} title={t("chooseDepartureCity")} tall>
        <div className="flex flex-col" style={{gap:8}}>
          <p style={{...T.body,fontSize:15,color:C.ink2,margin:"0 0 2px"}}>{t("departureCityHint")}</p>
          <div className="ts-dep-search-bar">
            <div className="ts-dep-search">
              <Search size={17}/>
              <input value={depQuery} onChange={e=>setDepQuery(e.target.value)}
                placeholder={t("searchCity")} inputMode="search" autoComplete="off"
                aria-label={t("searchCity")}
                /* Enter على نتيجةٍ واحدة يختارها: البحث الذي يُضيّق إلى
                   خيارٍ وحيد ثم يطلب ضغطةً ثانية يعمل ضدّ من استعمله. */
                onKeyDown={e=>{ if(e.key==="Enter"&&depMatches.length===1){ pickDepartureCity(depMatches[0]); } }}/>
              {depQuery&&<button type="button" onClick={()=>setDepQuery("")} aria-label={t("clearSearch")}><X size={15}/></button>}
            </div>
          </div>
          {/* الاسم `dep` لا `city`: الأخير هو الوجهة في هذا الملف، وتظليله
              هنا كان يجعل السطر يبدو كأنه يكتب الوجهة لا مدينة الانطلاق. */}
          {depMatches.map(dep=>{
            const selected=dep===departureCity;
            return <button key={dep} type="button" onClick={()=>pickDepartureCity(dep)}
              aria-pressed={selected}
              className="flex items-center gap-3 text-start" style={{minHeight:60,padding:"10px 14px",borderRadius:R.card,cursor:"pointer",fontFamily:"inherit",
                background:selected?C.greenTint:C.white,border:`1px solid ${selected?C.gold:C.line}`,color:C.ink,transition:"border-color .15s, background .15s"}}>
              {/* الأيقونة على الذهبي سوداء لا بيضاء: الأبيض عليه ٣٫١:١. */}
              <span className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{background:selected?C.gold:C.fill,color:selected?C.ink:C.ink2}}><MapPin size={18}/></span>
              <span style={{...T.body,fontWeight:selected?600:400,flex:1}}>{dep}</span>
              {selected&&<Check size={18} style={{color:C.greenDeep}}/>}
            </button>;
          })}
          {!departureCities.length&&<Note tone="neutral" icon={<MapPin size={18}/>}>{t("noDepartureCities")}</Note>}
          {!!departureCities.length&&!depMatches.length&&
            <Note tone="neutral" icon={<Search size={18}/>}>{t("noCityMatch")}</Note>}
        </div>
      </Sheet>

      {/* ═══ CUSTOM — رحلة حسب الطلب: طلب لا حجز ═══ */}
      {screen==="custom"&&<>
        <CustomRequestScreen lang={lang} dir={dir} onBack={()=>setScreen("focus")} onDone={()=>setScreen(HOME)}/>
      </>}

      {/* ═══ OWNER — نموذج واحد لصاحب الحجز فقط ═══ */}
      {screen==="passengers"&&
        <FlowScreen
          variant="auth"
          title={t("ownerDetails")} subtitle={t("ownerDetailsHint")} step={2}
          onBack={()=>setScreen(detailScreen)} onClose={()=>setScreen(detailScreen)}
          cta={goReview} ctaLabel={t("next")}
          error={paxTried&&!paxValid?t("fillFirst"):undefined}>
          <div className="tsf-form flex flex-col" style={{gap:18}}>
            {ownerFields(0,v=>setPax(a=>a.map((x,j)=>j===0?{...x,docType:v,idNumber:""}:x)))}

            {/* بيانات التواصل — قسمٌ بعنوانه لا بطاقةٌ داخل بطاقة */}
            <div className="flex flex-col" style={{gap:4,paddingTop:18,borderTop:`1px solid ${C.line}`}}>
              <strong style={{...T.h3,color:C.ink}}>{t("contactTitle")}</strong>
              <span style={{...T.meta,color:C.ink2}}>{t("contactLead")}</span>
            </div>
            <LField label={t("phone")} hint={t("contactPhoneHint")} error={contactTried&&!validPhone(contactPhone)?t("invalidPhone"):undefined}>
              {/* الأرقام الهندية تُحوَّل إلى لاتينية: القاعدة تقبل اللاتينية وحدها،
                  فكان رقمٌ صحيح مكتوب بلوحة عربية يُرفض «غير صحيح». */}
              <input value={contactPhone} onChange={e=>setContactPhone(toLatinDigits(e.target.value))}
                type="tel" inputMode="tel" name="tel" autoComplete="tel" enterKeyHint="done"
                placeholder={t("phonePh")} className="tsf-input" style={ltrInput}/>
            </LField>
            <CompanionNotice t={t}/>
          </div>
        </FlowScreen>}

      {/* ═══ REVIEW ═══ */}
      {screen==="review"&&pkg&&trip&&
        <FlowScreen
          variant="auth"
          title={t("review")} step={3}
          onBack={()=>setScreen("passengers")} onClose={()=>setScreen(detailScreen)}
          cta={doSubmit} ctaLabel={submitting?t("submitting"):t("submit")}
          ctaBusy={submitting} ctaDisabled={!agreed} error={errMsg}>
        <div className="flex flex-col" style={{gap:16}}>
          {/* الرحلة أولاً: ما الذي أحجزه ومتى — ثم مَن، ثم بكم. */}
          <TripRecap pkg={pkg} trip={trip} depCity={needsDepartureCity?departureCity:undefined} lang={lang} t={t}/>

          <div style={cardBox}>
            <SummaryRow label={t("people")} value={countLabel(persons,"person",lang)}/>
            <SummaryRow label={t("travellerMixLabel")}
              value={t("travellerMix").replace("{m}",String(travellerCounts.men)).replace("{w}",String(travellerCounts.women))}/>
            <SummaryRow label={t("room")} value={split?splitSummary(split,t):"—"}/>
          </div>

          {/* صاحب الحجز وجوال التواصل — ما سيُتَّصل به عليه */}
          <div style={cardBox}>
            {pax.map((p,i)=>(
              <SummaryRow key={i} label={t("bookingOwner")} value={p.name||"—"}
                sub={<>{p.nationality&&<span>{p.nationality}</span>}{p.nationality&&p.idNumber&&" · "}<span style={LTR}>{p.idNumber}</span></>}/>
            ))}
            <SummaryRow label={t("contactPhone")} value={<span style={LTR}>{contactPhone}</span>}/>
          </div>

          <Note tone="warn" icon={<PhoneCall size={18}/>}>{t("prelimNotice")}</Note>
          <Note tone="info" icon={<Armchair size={18}/>}>{t("seatArrangedByUs")}</Note>
          {needsPrivacySeat&&<Note tone="gold" icon={<ShieldCheck size={18}/>}>{t("privacySeatNote")}</Note>}

          {/* تفصيل السعر قبل الإرسال — «اعرض تفصيل السعر قبل المتابعة: النقل،
              السكن، عدد الليالي، عدد المعتمرين، الإضافات، الضريبة والإجمالي».
              الضريبة متضمَّنة لا مضافة (قرار ٢٠٢٦-٠٩-٠٦) فيُقال ذلك سطراً. */}
          <div style={cardBox}>
            <strong style={{...T.h3,fontSize:16,color:C.ink,paddingBlock:6}}>{t("priceBreakdown")}</strong>
            {split&&fullPrice&&
              <SummaryRow label={t(needsPrivacySeat?"transportTotalPrivacy":"transportTotal")} value={amt(fullPrice.transport)} plain/>}
            {split&&fullPrice&&
              <SummaryRow label={t("accommodationTotal")} value={amt(fullPrice.accommodation)} plain/>}
            {transport&&
              <SummaryRow label={`${t("transportIncl")} · ${transport.vehicleType}`} value={<span style={{color:C.ink2}}>{t("incl")}</span>} plain/>}
            {/* الإجمالي أقوى ما في البطاقة: هو الرقم الذي يوافق عليه العميل */}
            <div className="flex items-end justify-between" style={{gap:12,marginTop:8,paddingTop:14,borderTop:`1px solid ${C.line}`}}>
              <div className="flex flex-col" style={{gap:2}}>
                <span style={{...T.h3,color:C.ink}}>{t("total")}</span>
                <span style={{...T.small,fontWeight:400,color:C.ink2}}>{t("inclTax")}</span>
              </div>
              <span style={{fontSize:26,fontWeight:700,lineHeight:1.1,color:C.ink}}>
                <span style={LTR}>{money(total)}</span> <span style={{fontSize:15,fontWeight:400,color:C.ink2}}>{t("currency")}</span>
              </span>
            </div>
            <span style={{...T.small,fontWeight:400,color:C.ink2,paddingTop:8}}>{t("priceNote")}</span>
          </div>

          {/* الشروط: مربع اختيار مباشر — والقراءة اختيارية عبر الرابط */}
          <div className="flex flex-col" style={{padding:"4px 14px",background:C.white,borderRadius:R.card,
            border:`1px solid ${agreed?C.gold:C.border}`,transition:"border-color .18s"}}>
            <AgreeCheck checked={agreed} label={t("iAgreeRead")}
              onChange={v=>{setAgreed(v); if(v) setErrMsg("");}}/>
            <div style={{marginInlineStart:36,marginTop:-6}}>
              <TextLink onClick={()=>setTermsOpen(true)}>{t("readTerms")}</TextLink>
            </div>
          </div>
        </div>
        </FlowScreen>}

      {/* ═══ SUCCESS ═══
          ذروة المسار لا نهايته: تأكيدٌ واثق، رقم الحجز يُنسخ، ملخّص ما
          حُجز، ثم «ماذا بعد» — والزرّ الأساسي يأخذ إلى الحجوزات لا إلى
          الرئيسية، فلا يقف العميل عند بابٍ مغلق. */}
      {screen==="success"&&
        <FlowScreen
          variant="auth"
          title={t("successTitle")} subtitle={t("successMsg")} align="center"
          hero={
            <motion.div initial={reducedMotion?false:{scale:.6,opacity:0}} animate={{scale:1,opacity:1}}
              transition={{duration:.24,ease:"easeOut"}}
              className="flex items-center justify-center"
              style={{width:76,height:76,borderRadius:R.pill,background:G.deep,boxShadow:`0 0 0 8px ${C.goldTint}`}}>
              <Check size={38} strokeWidth={2.4} style={{color:B.gold2}}/>
            </motion.div>}
          /* التصفير يبقى على الزرّين: رقم الحجز الباقي في الحالة يوقف
             حفظ مسوّدة الحجز التالي (انظر أثر حفظ المسوّدة). */
          cta={()=>{setScreen("track");reset();}} ctaLabel={t("followBooking")}
          secondary={<button type="button" className="tsf-ghost-btn" onClick={()=>{reset();setScreen(HOME);}}>{t("home")}</button>}>
          <div className="flex flex-col" style={{gap:16}}>
            {/* رقم الحجز — يُنسخ بضغطة: هو ما يُسأل عنه في كل اتصال */}
            <div className="flex items-center justify-between" style={{gap:12,paddingBlock:12,paddingInlineStart:16,paddingInlineEnd:10,
              border:`1px solid ${TONE.gold.line}`,borderRadius:R.card,background:C.goldTint}}>
              <div className="flex flex-col min-w-0" style={{gap:2}}>
                <span style={{...T.small,fontSize:13,fontWeight:400,color:C.ink2}}>{t("bookingNo")}</span>
                <span className="truncate" style={{fontSize:24,fontWeight:700,lineHeight:1.2,color:C.ink,...LTR,textAlign:dir==="rtl"?"right":"left"}}>{bookingNo}</span>
              </div>
              <button type="button" onClick={copyBookingNo} aria-label={t("copyNo")} title={t("copyNo")}
                className="tsf-icon-btn" style={{background:C.white,border:`1px solid ${TONE.gold.line}`,flexShrink:0}}>
                <Copy size={19}/>
              </button>
            </div>

            {pkg&&trip&&<>
              <TripRecap pkg={pkg} trip={trip} depCity={needsDepartureCity?departureCity:undefined} lang={lang} t={t}/>
              <div style={cardBox}>
                <SummaryRow label={t("people")} value={countLabel(persons,"person",lang)}/>
                <SummaryRow label={t("total")} value={<strong style={{fontWeight:700}}>{amt(total)}</strong>}
                  sub={t("inclTax")}/>
              </div>
            </>}

            <h2 style={{...T.h2,fontSize:20,color:C.ink,margin:"8px 0 0"}}>{t("whatNext")}</h2>
            {/* لحظة الإرسال هنا معروفة يقيناً — الطلب أُرسل قبل قليل. */}
            <div style={{padding:16,border:`1px solid ${TONE.gold.line}`,borderRadius:R.card,background:C.bandAction}}>
              <SlaCountdown submittedAt={submittedAt??Date.now()} t={t}/>
            </div>
            <div style={{padding:16,border:`1px solid ${C.line}`,borderRadius:R.card}}>
              <Timeline status="reviewing" t={t}/>
            </div>
          </div>
        </FlowScreen>}

      {/* ═══ TRACK (auto for logged-in) ═══ */}
      {screen==="track"&&<>
        <div className="ts-track-shell flex-1 flex flex-col" style={{background:C.white,paddingInline:SPACE.page,
          paddingTop:"calc(24px + env(safe-area-inset-top, 0px))",gap:16}}>
          <h1 style={{...T.h1,fontSize:28,color:C.ink,margin:"0 0 4px"}}>{t("myBookings")}</h1>
          {!session
            ? sessionReady
              ? <EmptyState icon={<Ticket size={28}/>} title={t("loginToTrackTitle")} sub={t("loginToTrack")}
                  action={<CTAButton onClick={()=>openLogin("track")}>{t("login")}</CTAButton>}/>
              /* الجلسة تُقرأ بوعد — بلا هذا الانتظار تلمع دعوة الدخول
                 لمن هو مسجَّل أصلاً في كل مرة يفتح التبويب. */
              : <OrdersSkeleton label={t("loading")}/>
            : ordersLoading ? <OrdersSkeleton label={t("loading")}/>
            : ordersFailed
              ? <EmptyState icon={<WifiOff size={28}/>} title={t("ordersLoadFailed")} sub={t("loadFailedSub")}
                  action={<CTAButton onClick={()=>setOrdersTry(n=>n+1)}>{t("retryBtn")}</CTAButton>}/>
            : (myOrders&&myOrders.length>0)
              ? myOrders.map(o=>{
                  const when=[o.tripDate&&dayDate(o.tripDate,lang),clock(o.tripTime,lang)].filter(Boolean).join(" · ");
                  return (
                  <article key={o.id} className="flex flex-col" style={{gap:14,padding:16,border:`1px solid ${C.line}`,borderRadius:R.card,background:C.white,boxShadow:SHADOW.card}}>
                    <div className="flex items-start justify-between" style={{gap:10}}>
                      <div className="flex flex-col min-w-0" style={{gap:3}}>
                        <strong className="truncate" style={{...T.h3,color:C.ink}}>{o.packageName||t("trip")}</strong>
                        <span style={{...T.small,fontSize:13,fontWeight:400,color:C.ink2}}>{t("bookingNo")} <span style={LTR}>{o.id}</span></span>
                      </div>
                      <BookingStatusBadge status={o.status} t={t}/>
                    </div>
                    <div className="flex flex-col" style={{gap:8,...T.meta,color:C.ink}}>
                      {when&&<span className="flex items-center" style={{gap:8}}><CalendarDays size={17} style={{color:C.ink2,flexShrink:0}}/>{when}</span>}
                      <span className="flex items-center" style={{gap:8}}><Users size={17} style={{color:C.ink2,flexShrink:0}}/>
                        {countLabel(o.persons,"person",lang)}<span aria-hidden style={{color:C.ink3}}>·</span>{amt(o.total)}</span>
                    </div>
                    {/* العدّاد في مرحلة المراجعة وحدها: بعدها صار للطلب
                        إجراء ظاهر (دفع أو تذكرة) فلا يحتاج طمأنة الانتظار.
                        وبلا لحظة إرسال محفوظة يبقى الوعد نصّاً بلا حلقة —
                        عدّادٌ من تاريخ بلا ساعة يخترع دقّةً لا نملكها. */}
                    {(o.status==="reviewing"||o.status==="new")&&(
                      o.submittedAt
                        ? <div style={{padding:16,border:`1px solid ${TONE.gold.line}`,borderRadius:R.chip,background:C.bandAction}}>
                            <SlaCountdown submittedAt={Date.parse(o.submittedAt)} t={t}/>
                          </div>
                        : <Note tone="gold" icon={<Clock size={18}/>}>{t("contactWithin")}</Note>
                    )}
                    {/* بانتظار الدفع: لا رابط دفعٍ في بيانات هذه الشاشة
                        (my_public_bookings لا تُرجع رمزه)، فلا زرّ «أكمل
                        الدفع» يُخترع له رابط — يُقال من أين يأتي الرابط. */}
                    {o.status==="awaiting_payment"&&
                      <Note tone="warn" icon={<CreditCard size={18}/>} title={t("stepAwaitPay")}>{t("payGuidance")}</Note>}
                    <div style={{paddingTop:14,borderTop:`1px solid ${C.line}`}}>
                      <Timeline status={o.status} t={t}/>
                    </div>
                    {/* التذكرة بعد التأكيد — كان هنا مربّع رمزٍ وحده بلا
                        رقم ولا موعد ولا مكان. آخر خطوة في رحلة العميل،
                        وهي التي يفتحها صباح السفر وهو واقف يبحث عن نقطة
                        الانطلاق، فكانت تعطيه صورة ولا تعطيه خبراً.

                        الرمز يُبذر برقم التذكرة لا برقم الطلب حين يتوفّر:
                        رقم الطلب أربعة أرقام يخمّنها العادّ، ورقم التذكرة
                        ستّة عشرية مشتقّة من md5. وقبل ترحيل الموجة ٤ يعود
                        ticketNo فارغاً فيبقى السلوك السابق حرفياً. */}
                    {(o.status==="confirmed"||o.status==="verified")&&
                      <div className="flex flex-col" style={{gap:14,padding:16,borderRadius:R.chip,background:C.fill,border:`1px dashed ${C.border}`}}>
                        <div className="flex items-center justify-between" style={{gap:10}}>
                          <span className="flex items-center" style={{gap:8,...T.h3,fontSize:16,color:C.ink}}><Ticket size={18} style={{color:C.greenDeep}}/>{t("ticket")}</span>
                          {o.ticketNo&&<span style={{...T.body,fontWeight:700,color:C.ink,...LTR}}>{o.ticketNo}</span>}
                        </div>
                        <div className="flex flex-col" style={{gap:8}}>
                          {([
                            [t("trip"), when],
                            [t("departurePoint"), o.departurePoint],
                            [t("people"), countLabel(o.persons,"person",lang)],
                          ] as [string,string|undefined][])
                            /* الحقل الغائب يُحذف لا يُعرض «—»: نقطة انطلاق
                               فارغة على تذكرة أسوأ من سطرٍ غير موجود. */
                            .filter(([,v])=>!!v&&v!=="—")
                            .map(([l,v])=>(
                              <div key={l} className="flex items-start justify-between" style={{gap:12}}>
                                <span style={{...T.meta,color:C.ink2,flexShrink:0}}>{l}</span>
                                <span style={{...T.meta,fontWeight:600,color:C.ink,textAlign:"end"}}>{v}</span>
                              </div>
                            ))}
                        </div>
                        <div className="flex flex-col items-center" style={{gap:8,paddingTop:14,borderTop:`1px dashed ${C.border}`}}>
                          <div style={{padding:10,borderRadius:R.chip,background:C.white,border:`1px solid ${C.line}`}}>
                            <QRBlock seed={o.ticketNo||o.id} size={132}/>
                          </div>
                          <div style={{...T.meta,color:C.ink2}}>{t("showAtGate")}</div>
                        </div>
                      </div>}
                  </article>
                ); })
              : <EmptyState icon={<Ticket size={28}/>} title={t("noBookingsTitle")} sub={t("noBookingsSub")}
                  action={<CTAButton onClick={()=>setScreen(HOME)}>{t("browseTrips")}</CTAButton>}/>}
          <div style={{height:16}}/>
        </div>
        <BottomBar screen={screen} home={HOME} onNav={setScreen} t={t}/>
      </>}

      {/* ═══ LOGIN — الجوال، ثم كلمة المرور، ومنها الاستعادة ═══ */}
      {screen==="login"&&(()=>{
        /* خمس مراحل في شاشة واحدة. ثلاثيةٌ متداخلة لكل خاصية صارت أطول
           من أن تُقرأ، فجدولُ مرحلةٍ واحد بدلها. */
        const stages={
          phone:   {title:t("loginOrSignup"), subtitle:t("phoneLeadNoOtp"),
                    cta:beginLogin, label:t("continueBtn"), off:!validPhone(loginPhone)},
          password:{title:t("loginPwTitle"), subtitle:t("loginPwSub"),
                    cta:submitPasswordLogin, label:t("login"), off:!loginPassword},
          signup:  {title:t("signupTitle"), subtitle:t("signupSub"),
                    cta:submitSignup, label:t("signupBtn"), off:!loginEmail.includes("@")||loginPassword.length<6},
          forgot:  {title:t("forgotTitle"), subtitle:t("forgotSub"),
                    cta:submitForgot, label:t("forgotBtn"), off:!forgotEmail.includes("@")},
          /* «إن كان مرتبطاً بحساب» لا «أُرسل إلى بريدك»: الردّ واحد في
             الحالتين عمداً، فلا يصير النموذج جرداً لمن عندنا حساب. */
          sent:    {title:t("sentTitle"), subtitle:t("sentSub"),
                    cta:()=>{setLoginStage("password");setOtpErr("");}, label:t("backToLogin"), off:false},
        };
        const st=stages[loginStage];
        const backTo=loginStage==="forgot"||loginStage==="sent"?"password":"phone";
        return <FlowScreen
          variant="auth" title={st.title} subtitle={st.subtitle}
          align={loginStage==="sent"?"center":"start"}
          hero={loginStage==="sent"?<IconDisc><MailCheck size={30}/></IconDisc>:undefined}
          onBack={loginStage==="phone"?undefined:()=>{setLoginStage(backTo);setOtpErr("");}}
          onClose={()=>setScreen(intent==="track"?"track":detailScreen)}
          cta={st.cta} ctaLabel={st.label} ctaBusy={sending} ctaDisabled={st.off} error={otpErr}>
          {/* الزر معطّل حتى يصحّ الرقم؛ والتلميح يظهر بعد أول إدخال
              حتى لا يبقى المستخدم أمام زر لا يعمل بلا سبب معروض. */}
          {loginStage==="phone" ? <PhoneField value={loginPhone} onChange={setLoginPhone} onEnter={beginLogin}
            error={loginPhone.trim().length>=4&&!validPhone(loginPhone)?t("phoneHint"):undefined}/>
          : loginStage==="forgot" ? <InputStack>
              <StackField label={t("email")} value={forgotEmail} onChange={setForgotEmail}
                placeholder="name@example.com" type="email" inputMode="email" name="email" autoComplete="email"
                enterKeyHint="send" onEnter={submitForgot} last/>
            </InputStack>
          : loginStage==="sent" ? null
          : <>
              {/* اسم المستخدم لمدير كلمات المرور: الحساب هويّتُه الجوال،
                  وبلا هذا الحقل تُحفظ الكلمة بلا صاحب. لا يُرى ولا يُركَّز. */}
              <input type="text" name="username" autoComplete="username" value={loginPhone} readOnly tabIndex={-1} aria-hidden
                style={{position:"absolute",width:1,height:1,opacity:0,pointerEvents:"none"}}/>
              <InputStack>
                {loginStage==="signup"&&<StackField label={t("email")} value={loginEmail} onChange={setLoginEmail}
                  placeholder="name@example.com" type="email" inputMode="email" name="email" autoComplete="email" enterKeyHint="next"/>}
                <StackField label={t("password")} value={loginPassword} onChange={setLoginPassword}
                  placeholder={loginStage==="signup"?t("passwordPh"):undefined} type="password" name="password"
                  autoComplete={loginStage==="signup"?"new-password":"current-password"}
                  enterKeyHint="go" onEnter={st.cta} last />
              </InputStack>
              {/* تحت الحقل مباشرة: هناك يقف نظر من فشلت كلمته، لا أسفل
                  الشاشة بعد الزر. */}
              {loginStage==="password"&&
                <div style={{textAlign:"start",marginTop:-8}}>
                  <TextLink onClick={()=>{setLoginStage("forgot");setOtpErr("");setForgotEmail(session?.profile?.email??"");}}>{t("forgotLink")}</TextLink>
                </div>}
            </>}
        </FlowScreen>;
      })()}

      {/* ═══ RECOVER — كلمة مرور جديدة بعد رابط البريد ═══ */}
      {screen==="recover"&&(()=>{
        if(recoverState==="checking") return <FlowScreen variant="auth" align="center"
          title={t("recoverChecking")} subtitle={t("recoverCheckingSub")}
          hero={<IconDisc><Spinner size={26} track="rgba(27,23,18,.14)" color={C.greenDeep}/></IconDisc>}/>;
        if(recoverState==="invalid") return <FlowScreen variant="auth" align="center"
          title={t("recoverInvalid")}
          subtitle={recoverErr||t("recoverInvalidSub")}
          hero={<IconDisc tone="danger"><Link2Off size={28}/></IconDisc>}
          onClose={()=>setScreen(HOME)}
          cta={()=>{setOtpErr("");setLoginStage("forgot");setScreen("login");}} ctaLabel={t("recoverNewLink")}/>;
        if(recoverState==="done") return <FlowScreen variant="auth" align="center"
          title={t("recoverDone")} subtitle={t("recoverDoneSub")}
          hero={<IconDisc><Check size={30}/></IconDisc>}
          cta={()=>setScreen(session?.profile?.complete?"track":"account")}
          ctaLabel={session?.profile?.complete?t("viewMyBookings"):t("completeAccount")}/>;
        return <FlowScreen variant="auth"
          title={t("recoverTitle")} subtitle={t("recoverSub")}
          onClose={()=>setScreen(HOME)}
          cta={submitNewPassword} ctaLabel={t("saveAndLogin")} ctaBusy={recoverBusy}
          ctaDisabled={recoverPw.length<6||recoverPw!==recoverPw2} error={recoverErr}>
          <InputStack>
            <StackField label={t("newPassword")} value={recoverPw} onChange={setRecoverPw}
              placeholder={t("passwordPh")} type="password" name="new-password" autoComplete="new-password" enterKeyHint="next"/>
            <StackField label={t("confirmPassword")} value={recoverPw2} onChange={setRecoverPw2}
              placeholder={t("confirmPasswordPh")} type="password" name="confirm-password" autoComplete="new-password"
              enterKeyHint="done" onEnter={submitNewPassword} last
              error={recoverPw2&&recoverPw!==recoverPw2?t("errPwMismatch"):undefined}/>
          </InputStack>
        </FlowScreen>;
      })()}

      {/* ═══ OTP — تأكيد الهوية ═══
          شاشةٌ لا يبلغها المسار الحالي (الدخول بكلمة المرور)؛ باقيةٌ
          عاملةً لمن يعيد تفعيل الرمز. بلا سطر تقدّم: ليست من خطوات الحجز. */}
      {screen==="otp"&&
        <FlowScreen
          variant="auth"
          title={t("confirmIdentity")} align="center"
          onBack={()=>{setScreen("login");setOtpErr("");}}
          onClose={()=>setScreen(intent==="track"?"track":detailScreen)}
          cta={confirmOtp} ctaLabel={t("verify")} ctaBusy={sending} ctaDisabled={otpCode.length<6}
          error={otpErr}
          subtitle={<>
            {t("sentCodeTo")} <b style={{...LTR,fontWeight:600,color:C.ink}}>+966 {loginPhone.replace(/^0/,"")}</b>
            <br/><span style={{...T.small,fontSize:13,fontWeight:400,color:C.ink2}}>{sentVia==="sms"?t("sentSms"):t("sentWhatsapp")}</span>
          </>}
          secondary={isWhatsappEnabled&&
            <GrayButton full onClick={()=>resendCode("whatsapp")}>{t("tryAnotherWay")}</GrayButton>}>
          <div className="flex flex-col items-center" style={{gap:18}}>
            {/* dir="ltr" لازم: الخانات تُعبَّأ من اليسار لليمين داخل صفحة RTL */}
            <div dir="ltr"><InputOTP maxLength={6} value={otpCode} onChange={setOtpCode} autoFocus>
              <InputOTPGroup className="gap-2">
                {/* الخانة الافتراضية 36px ومُلتصقة بالمجموعة؛ نُكبّرها ونفصلها.
                    الحدود والاستدارة عبر style لأن أصناف shadcn تضبط
                    first:rounded-l/border-y وحدها فلا يكفي تجاوزها بصنف. */}
                {[0,1,2,3,4,5].map(i=>(
                  <InputOTPSlot key={i} index={i} className="h-14 w-11 text-2xl"
                    style={{border:`1px solid ${C.border}`,borderRadius:R.chip,background:C.white,color:C.ink,fontFamily:"var(--font-app)"}}/>
                ))}
              </InputOTPGroup>
            </InputOTP></div>
            <div className="flex items-center justify-center flex-wrap" style={{...T.meta,color:C.ink2,textAlign:"center",gap:6,minHeight:44}}>
              {t("didntGet")}
              {resendIn>0
                ? <span style={{color:C.ink2}}>{t("resendIn")} <span style={LTR}>{resendIn}</span> {t("second")}</span>
                : <TextLink onClick={()=>resendCode("sms")} disabled={sending}>{t("sendNewCode")}</TextLink>}
            </div>
          </div>
        </FlowScreen>}

      {/* ═══ ACCOUNT — بيانات صاحب الحساب = المعتمر الأساسي ═══
          سطر التقدّم يظهر حين تكون الشاشة جزءاً من حجزٍ قائم (باقةٌ
          مختارة)، وموضعها فيه «بياناتك»؛ ومن جاء من تبويب الحساب لا
          يُعرض له تقدّمُ حجزٍ لم يبدأه. */}
      {screen==="account"&&
        <FlowScreen
          variant="auth"
          title={t("ownerDetails")} subtitle={t("ownerDetailsHint")} step={pkg?2:undefined}
          onClose={()=>setScreen(intent==="track"?"track":detailScreen)}
          cta={submitAccount} ctaLabel={t("saveAndContinue")} ctaBusy={acSaving} error={acErr}>
          <div className="tsf-form flex flex-col" style={{gap:18}}>
            {ownerFields(0,v=>setPax(a=>[{...(a[0]??emptyPax()),docType:v,idNumber:""}]))}
            <CompanionNotice t={t}/>
          </div>
        </FlowScreen>}

      {/* ═══ PROFILE ═══ */}
      {screen==="profile"&&<>
        <AppBar title={t("profile")} dir={dir} lang={lang} onLang={setLang} t={t}/>
        <Account
          session={session} onSession={setSession}
          lang={lang} setLang={setLang} t={t}
          onLogin={()=>openLogin("track")}
          onLogout={logout}
          onBookings={()=>setScreen("track")}
        />
        <BottomBar screen={screen} home={HOME} onNav={setScreen} t={t}/>
      </>}

      </div>

      {/* الشروط — ورقة العدّة نفسها (Sheet): تقفل تمرير الصفحة وتحبس
          التركيز وتُغلق بـEscape، وكانت نافذةً مبنيّة باليد بلا شيء من ذلك. */}
      <Sheet open={termsOpen} onClose={()=>setTermsOpen(false)} title={t("termsTitle")} tall
        footer={
          <div className="flex flex-col" style={{gap:8}}>
            <AgreeCheck checked={agreed} label={t("iAgreeRead")} onChange={()=>setAgreed(a=>!a)}/>
            <CTAButton full disabled={!agreed} onClick={()=>setTermsOpen(false)}>{t("approve")}</CTAButton>
          </div>}>
        <div className="flex flex-col" style={{gap:14}}>
          <strong style={{...T.h3,color:C.ink}}>{lang==="en"?TERMS_TITLE_EN:TERMS_TITLE_AR}</strong>
          <div style={{...T.body,fontSize:15,lineHeight:1.85,color:C.ink2,whiteSpace:"pre-line"}}>{lang==="en"?TERMS_BODY_EN:TERMS_BODY_AR}</div>
        </div>
      </Sheet>

      {/* فراغ أسفل الشاشات بلا شريط سفلي حتى لا يغطّي زر الواتساب آخر عنصر */}
      {!TABBED_SCREENS.includes(screen)&&screen!=="focus"&&screen!=="focusListing"&&screen!=="focusConfigure"&&screen!=="custom"&&!isFlow&&<div style={{height:76,flexShrink:0}}/>}

      {/* زر واتساب — ثابت في كل الشاشات، ويرتفع فوق الشريط السفلي حيث يظهر.
          ويغيب عن صفحتَي Focus: هناك شريط إجراء ثابت أصلاً، وكان الزر
          العائم فوقه يحجب آخر سطر من «مراجعة السعر». بديله أيقونةٌ داخل
          الشريط نفسه (WhatsAppInlineButton). */}
      {!isFlow&&screen!=="focusListing"&&screen!=="focusConfigure"&&screen!=="custom"&&<WhatsAppFab bottom={TABBED_SCREENS.includes(screen)?100:24}/>}

      {/* كان مركّباً في AdminApp وحده، فكل toast من طبقة البيانات كان
          يُطلَق في لا مكان: العميل يرى «تم استلام طلبك» ثم لا شيء. dir
          متغيّر لا "rtl" ثابت — هذه الواجهة تعمل بالإنجليزية أيضاً. */}
      <Toaster position="bottom-center" dir={dir} richColors closeButton
        toastOptions={{style:{fontFamily:"var(--font-app)"}}}/>
    </div>
    </DirProvider>
  );
}
