import { cloneElement, isValidElement, useCallback, useEffect, useId, useMemo, useRef, useState,
  type ReactElement, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { Check, Users, X, Search, ArrowLeft, Clock, Eye, MapPin} from "lucide-react";
import { B } from "@/lib/theme";
import type { Pkg, Trip, TravellerType } from "@/types";
import { type RoomSplit, splitTotal, splitSummary } from "./roomSplit";
import { Spinner } from "@/components/Spinner";
import { Toaster, toast } from "sonner";
import { hideBootSplash } from "@/lib/bootSplash";
import { todayYMD } from "@/lib/utils";
import { QRBlock } from "@/components/QRBlock";
import { NationalitySelect } from "@/components/NationalitySelect";
import { BirthDateSelect } from "@/components/BirthDateSelect";
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
  type CustomerSession,
} from "./customerAuth";
import { DirProvider, GrayButton, CTAButton, Sheet } from "./ui/kit";
import { TravellerTypeGrid } from "./ui/TravellerType";
import { FlowScreen, InputStack, StackField, PhoneField, TextLink } from "./ui/FlowScreen";
import { C, T, R, G, LTR, SPACE, formatDate } from "./ui/tokens";
import { AppBar, BottomBar, DesktopNav } from "./ui/chrome";
import { Timeline } from "./ui/Timeline";
import { Explore, matchesDestination } from "./screens/Explore";
import { Listing } from "./screens/Listing";
import { CustomRequestScreen } from "./screens/CustomRequest";
import { FocusConfigure, FocusDetails } from "./screens/FocusBooking";
import { Account } from "./screens/Account";
import { parseRoute, pathOf, NEEDS_PACKAGE, HOME, type Screen } from "./routing";
import { publicSettings } from "@/data/settings";
import { configureSla } from "./sla";
import { readDraft, writeDraft, clearDraft, draftHasInput, emptyPax, type Pax } from "./draft";
import { fetchTravellers, saveTraveller } from "./travellers";

/* "listing" هي صفحة الباقة والحجوزات. الشاشة تُقرأ من المسار
   (routing.ts) وPax ومسوّدتها في draft.ts. */
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
/** الطفل لا يُطلب جواله إطلاقاً؛ والبالغ الأول جواله إلزامي لأنه جوال التواصل. */
const phoneRequired=(p:Pax,first:boolean)=>p.ageGroup!=="child"&&first;
function paxErrors(p:Pax,first:boolean,t:(k:string)=>string,lang:string):Partial<Record<PaxField,string>>{
  const e:Partial<Record<PaxField,string>>={};
  if(!p.name.trim()) e.name=t("required"); else if(!validName(p.name)) e.name=t("nameErr");
  if(phoneRequired(p,first)){ if(!p.phone.trim()) e.phone=t("required"); else if(!validPhone(p.phone)) e.phone=t("invalidPhone"); }
  else if(p.phone.trim()&&!validPhone(p.phone)) e.phone=t("invalidPhone");
  if(!p.docType) e.docType=t("required");
  else { const d=docTypeDef(p.docType);
    if(!p.idNumber.trim()) e.idNumber=t("required");
    else if(!d.test(p.idNumber.trim())) e.idNumber=docText(d.error,lang); }
  if(!p.nationality) e.nationality=t("required");
  if(!p.birthDate) e.birthDate=t("required");
  return e;
}

/* اختيار من خيارين بشكل شريط مقسوم — أسرع من قائمة منسدلة لخيارين.
   يقبل خصائص التسمية (role/aria-*) ليمرّرها LField إلى حاويته: مجموعةٌ
   بلا اسم تُقرأ «زرّ ذكر، زرّ أنثى» بلا ذكر أنها حقل «الجنس». */
function SegPick({value,onChange,options,dir,...aria}:{value:string;onChange:(v:string)=>void;options:{value:string;label:string}[];dir:"rtl"|"ltr"}
  &React.AriaAttributes&{role?:string}){
  return (
    <div {...aria} className="flex gap-1 p-1" style={{background:C.fill,border:`1px solid ${C.border}`,borderRadius:R.chip,direction:dir}}>
      {options.map(o=>{
        const on=value===o.value;
        return (
          <button key={o.value} type="button" onClick={()=>onChange(o.value)} aria-pressed={on}
            style={{flex:1,padding:"8px 6px",borderRadius:9,fontSize:14,fontWeight:on?600:400,border:"none",fontFamily:"inherit",
              cursor:"pointer",background:on?C.white:"transparent",color:on?C.ink:C.ink2,
              boxShadow:on?"0 1px 3px rgba(0,0,0,.08)":"none"}}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
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
      : <span style={{color:C.danger}}>*</span>}
  </>;
  return (
    <div className="flex flex-col gap-1.5">
      {group
        ? <span id={labelId} className="flex items-center gap-1" style={{...T.small,fontWeight:500,color:C.ink}}>{inner}</span>
        : <label htmlFor={forId} className="flex items-center gap-1" style={{...T.small,fontWeight:500,color:C.ink}}>{inner}</label>}
      {child}
      {error
        ? <span id={noteId} style={{...T.small,fontWeight:500,color:C.danger}}>{error}</span>
        : hint ? <span id={noteId} style={{...T.small,fontWeight:400,color:C.ink2}}>{hint}</span> : null}
    </div>
  );
}

/** العدد في الحجز ليس قائمةَ أشخاصٍ تُملأ الآن. نوضح أين ومتى تُستكمل
    بيانات المرافقين بدلاً من خلق بطاقات فارغة لا يملكها صاحب الحجز. */
function CompanionNotice({t}:{t:(k:string)=>string}){
  return <div className="flex flex-col gap-1.5" style={{padding:"14px",borderRadius:R.card,background:"#FFF8E8",border:"1px solid #ECD9A4"}}>
    <strong style={{...T.body,color:C.ink}}>{t("otherPilgrimsTitle")}</strong>
    <span style={{...T.small,color:C.ink2,lineHeight:1.75}}>{t("otherPilgrimsNotice")}</span>
  </div>;
}

const AR_MONTHS=["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const AR_WEEK=["س","ح","ن","ث","ر","خ","ج"];
/* بلا مرحلة «مؤكد»: كانت تفصل بين الدفع والتذكرة بخطوة لا يرى المستفيد
   فيها شيئاً يحدث — إجراءٌ داخلي عُرض كأنه انتظار إضافي. الدفع يفضي
   إلى التذكرة مباشرة. وحالة confirmed في القاعدة باقية كما هي: هي
   الحالة التي تُصدر التذكرة، فتُطابَق على خطوتها لا على خطوة مستقلة. */

const TERMS_AR = `شروط وأحكام حجز العمرة — تساهيل العمرة (نموذج مبدئي يُعدّل لاحقاً)

1) الحجز والتأكيد:
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


/* شاشات المسار — قاعدتها بيضاء وشريطها السفلي ثابت، فلا خلفية مزخرفة
   ولا فراغ سفلي ولا زر واتساب عائم يغطّي زر الإجراء. */
const FLOW_SCREENS:Screen[]=["login","otp","account","passengers","review","success"];
/* شاشات لها شريط تنقّل سفلي — الزر العائم يرتفع فوقه. */
const TABBED_SCREENS:Screen[]=["packages","track","profile"];
const BOOKING_RESUME_KEY="tsaheel.booking.resume";
/* من أي تجربةٍ دخل المستفيد مسار الحجز. كان في الذاكرة وحدها فيضيع عند
   إعادة التحميل: من يُحدّث صفحة بيانات المعتمرين ثم يضغط «رجوع» كان
   يهبط في صفحة التفاصيل القديمة — تجربتان تختلطان في مسارٍ واحد. */
const BOOKING_ORIGIN_KEY="tsaheel.booking.origin";
/* الافتراضي «focus»: هي الرئيسية ومسار الحجز الأساسي، فجلسةٌ بلا سجلّ
   (رابط /book/:id مُلصق) تنتمي إليها لا إلى التجربة المحفوظة. */
const readBookingOrigin=():"standard"|"focus"=>{
  try{ return sessionStorage.getItem(BOOKING_ORIGIN_KEY)==="standard"?"standard":"focus"; }catch{ return "focus"; }
};

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
  const [persons,setPersons]=useState(1);
  const [split,setSplit]=useState<RoomSplit|null>(null);
  const [bookingMode,setBookingMode]=useState<"full"|"transport">("full");
  /* العميل يختار المدينة فقط؛ نقطة الانطلاق ووقتها مثبتتان في الرحلة من الإدارة. */
  const [departureCity,setDepartureCity]=useState("");
  const [departureCitySheet,setDepartureCitySheet]=useState(false);
  /* نصّ البحث في ورقة المدن. يُفرَّغ عند كل فتح: ورقةٌ تُفتح على بحثٍ
     سابق تُخفي مدناً موجودة ويبدو أنها اختفت. */
  const [depQuery,setDepQuery]=useState("");
  const [travellerType,setTravellerType]=useState<TravellerType|"">("");
  const [travellerTypeSheet,setTravellerTypeSheet]=useState(false);
  /* مسار Focus يبقى داخل تجربته عند الرجوع من بيانات المعتمرين؛ لا يعيده
     إلى صفحة التفاصيل القديمة. ويُكتب في الجلسة لا في الذاكرة وحدها حتى
     يصمد أمام إعادة التحميل في منتصف المسار. */
  const [bookingOrigin,setBookingOriginState]=useState<"standard"|"focus">(readBookingOrigin);
  const setBookingOrigin=useCallback((o:"standard"|"focus")=>{
    setBookingOriginState(o);
    try{ sessionStorage.setItem(BOOKING_ORIGIN_KEY,o); }catch{}
  },[]);
  const [pax,setPax]=useState<Pax[]>([emptyPax()]);
  const [paxTouched,setPaxTouched]=useState<Record<string,boolean>>({});
  const [paxTried,setPaxTried]=useState(false);
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
    const candidate=requested??(screen==="listing"?"passengers":screen);
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
  const [loginStage,setLoginStage]=useState<"phone"|"password"|"signup">("phone");
  const [loginPassword,setLoginPassword]=useState("");
  const [loginEmail,setLoginEmail]=useState("");
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
  const [catErr,setCatErr]=useState(false);
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
  /* إزالة شاشة البدء بعد رسم الصفحة الجاهزة لا قبله — التسلسل: شعار
     متحرك ← الموقع، بلا شاشة وسيطة. */
  useEffect(()=>{ if(!loading) hideBootSplash(); },[loading]);
  /* خلفية الـbody بيج عامة (لوحة الموظف)؛ صفحة المستفيد بيضاء — نوحّدها هنا
     حتى لا يظهر شريط بيج فوق الرأس في iOS Safari (منطقة شريط الحالة والسحب الزائد). */
  useEffect(()=>{ const prev=document.body.style.background; document.body.style.background="#fff";
    return ()=>{ document.body.style.background=prev; }; },[]);
  /* عدد المقاعد محفوظ في الطلب، لكنه لا يخلق نماذج بيانات للمرافقين.
     نموذج واحد فقط هو صاحب الحساب/الحجز؛ بيانات الآخرين تُستكمل لاحقاً. */
  useEffect(()=>{ setPax(prev=>[prev[0]??emptyPax()]); },[persons]);
  /* فئة السكن مستقلة عن عدد معتمري الطلب. تبقى المختارة عند تغيير العدد،
     ويعاد فقط ضرب سعر الفرد في العدد الجديد. */
  useEffect(()=>{ setSplit(s=>s ? ({ ...s, perNight: s.rooms.reduce((sum, r) => sum + r.perNight, 0) * persons }) : null); },[persons]);
  useEffect(()=>()=>{ if(resendTimer.current) clearInterval(resendTimer.current); },[]);

  /* معاينة الموظف: /p/PKG-3?preview=1

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
  /* رحلات التقويم — القابل للحجز والمكتمل معاً، فالمكتمل يُرسم مشطوباً بدل أن
     يختفي: اختفاؤه يجعل يوماً فاتت مقاعده يبدو يوماً لا تسير فيه الباقة أصلاً.
     الملغاة والمؤرشفة تبقى مستبعدة — عرضها ضجيج لا معلومة. */
  const pkgTripsShown=(p:Pkg)=>cat.trips.filter(x=>{const st=tripState(x);return x.packageId===p.id && (st==="open"||st==="full") && x.departureDate>=today;}).sort((a,b)=>a.departureDate.localeCompare(b.departureDate));
  /* المدن ليست قائمةً في الكود: تُجمع من مدن الرحلات نفسها، وهي تُحدَّد
     في لوحة الإدارة عند إنشاء الرحلة (مدينة + نقطة + وقت). فمدينةٌ بلا
     رحلةٍ قادمة لا تظهر أصلاً — ولا يقع العميل على خيارٍ مآله فراغ.
     قبل اختيار الباقة يُقرأ المصدر من كل باقات الوجهة، وبعده من الباقة
     وحدها: في الحالتين ما يُعرض هو ما يمكن حجزه فعلاً. */
  const departureCities=useMemo(()=>{
    const source=screen==="focus"
      ? (city?activePkgs.filter(p=>matchesDestination(p,city)):[])
      : (pkg?[pkg]:[]);
    return [...new Set(source.flatMap(p=>pkgTrips(p)).map(x=>x.departureCity?.trim())
      .filter((x):x is string=>!!x))].sort((a,b)=>a.localeCompare(b,"ar"));
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
  const tripsForDepartureCity=(list:Trip[])=>needsDepartureCity
    ? list.filter(x=>x.departureCity===departureCity)
    : list;
  /* الرحلة التي تُبنى عليها صفحتا Focus: المختارة، وإلا أقرب رحلةٍ
     قابلة للحجز. تُحسب هنا مرّةً فيقرؤها الرسمُ وحارسُ المسار من مصدرٍ
     واحد — وإلا حَرَسَ الحارسُ شرطاً غير الذي يرسم به الشرطُ الآخر. */
  const focusTrip=useMemo(()=>trip??(pkg?pkgTrips(pkg)[0]??null:null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trip,pkg,cat.trips]);
  /* وسيلة النقل: الرحلة المختارة أولاً، وإلا افتراضي الباقة —
     وإلا اختفى قسم النقل كلياً حتى يختار المستفيد تاريخاً، وهو يحتاجه ليقرر. */
  const transport=cat.transports.find(x=>x.id===(trip?.transportId||pkg?.transportId));
  const hotel=pkg?cat.hotels.find(h=>h.id===pkg.hotelId):undefined;
  const rooms=pkg?.roomPrices??[];
  const nights=pkg?.nights||1;
  /* الإجمالي من التوزيع: مجموع (سعر الفرد × سعة الغرفة) لكل غرفة، × الليالي.
     مطابق للحساب القديم تماماً في التوزيعات المتساوية — أربعة في غرفتين
     سعة اثنين: (150×2 + 150×2) × ليلتين = 1200، وهو (150×2)×4 نفسه.
     ويختلف عمداً حين تفوق السعة العدد: الغرفة الأكبر بثمنها كاملاً. */
  const total=bookingMode==="transport"
    ? persons * (pkg?.transportOnlyPrice ?? 0)
    : split?splitTotal(split,nights):(trip?.price??0)*persons;

  /* ── مزامنة الباقة مع المسار ──
     المسار قد يتغيّر بلا نقرة: زر الرجوع، رابط مُلصق، إعادة تحميل.
     البحث في activePkgs لا في cat.packages: رابط مُسرَّب لباقة مسودة
     أو موقوفة أو مُقفلة عن الحجز الإلكتروني لا يفتحها لأحد. */
  useEffect(()=>{
    if(loading) return;
    const pid=route.packageId;
    if(!pid||pkg?.id===pid) return;
    const found=activePkgs.find(p=>p.id===pid);
    if(found) setPkg(found);
  },[loading,route.packageId,activePkgs,pkg?.id]);

  /* الاختيار يُمسح إن لم تعد الباقة تنطلق منه — لا عند كل تغيّر باقة.
     في المسار الجديد تُختار المدينة قبل الباقة (خطوةٌ بعد الوجهة)،
     فالمسح الشامل كان يُلغي اختيار العميل في اللحظة التي يفتح فيها
     الرحلة التي اختارها بنفسه من تلك المدينة. */
  useEffect(()=>{
    /* بلا باقة لا شيء يُقاس عليه — والمدينة هنا اختيارُ خطوة الوجهة في
       الرئيسية، يسبق الباقة ولا يُمحى بها. */
    if(!pkg) return;
    setDepartureCity(c=>c&&pkgTrips(pkg).some(x=>x.departureCity?.trim()===c)?c:"");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[pkg?.id,cat.trips]);
  /* الورقة تُفتح من تلقائها حيث تكون المدينة مطلوبةً ولم تُختر: بعد
     اختيار الوجهة في الرئيسية، وفي صفحة الباقة القديمة. خطوةٌ واحدة
     تأتي إلى العميل، لا حقلٌ يبحث عنه في الصفحة. */
  useEffect(()=>{
    const atChoice=(screen==="focus"&&!!city)||screen==="listing";
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
      setTrip(tr); setPersons(d.persons); setSplit(d.split); setBookingMode(d.bookingMode ?? "full");
      setPax([d.pax[0]??emptyPax()]); setAgreed(d.agreed); setTravellerType(d.travellerType);
    }
    setRouteReady(true);
  },[loading,route.packageId,cat.trips]);

  /* ── حفظ المسوّدة ──
     بعد الإرسال لا تُحفظ: رقم الطلب صار في القاعدة، ومسوّدةٌ باقية
     تعيد المستفيد إلى نموذج مملوء لطلبٍ أرسله فعلاً. */
  useEffect(()=>{
    if(!routeReady||!pkg||bookingNo) return;
    if(!draftHasInput(pax,trip?.id??null,split)) return;
    writeDraft({packageId:pkg.id,tripId:trip?.id??null,persons,split,bookingMode,travellerType,pax,agreed});
  },[routeReady,pkg?.id,trip?.id,persons,split,bookingMode,travellerType,pax,agreed,bookingNo]);

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
    if(screen==="review"&&!trip){ replaceScreen(bookingOrigin==="focus"?"focusListing":"listing"); return; }
    /* شاشة النجاح بلا رقم طلب: تحديثٌ بعد الإرسال. الطلب محفوظ فعلاً،
       فالوجهة «طلباتي» لا نموذج فارغ. */
    if(screen==="success"&&!bookingNo){ replaceScreen(session?"track":HOME,""); return; }
    if(screen==="otp"&&!validPhone(loginPhone)){ replaceScreen("login"); return; }
    /* الجلسة تُقرأ بوعد — قبل جهوزها لا يُطرد أحد من مسار محمي. */
    if(!sessionReady) return;
    if(!session&&(screen==="passengers"||screen==="review")){
      rememberBookingResume(screen); setIntent("flow"); replaceScreen("login"); return;
    }
    if(!session&&screen==="account"){ replaceScreen("login"); return; }
  },[loading,routeReady,catErr,screen,route.unknown,route.packageId,activePkgs,pkg,trip,focusTrip,bookingOrigin,bookingNo,loginPhone,session,sessionReady,replaceScreen,rememberBookingResume]);

  /* النافذة الإجباريّة حالةٌ محسوبة لا حدثٌ يُطلق.

     كانت تُفتح بنداءٍ في لحظة اختيار الرحلة، ثم حارسٌ يُغلقها إن لم
     تكن الشاشة شاشةَ حجز. والاثنان يتسابقان: `setScreen` يُحدّث المسار،
     و`screen` يُقرأ من المسار، فتأتي رايةُ الفتح في رسمةٍ والشاشةُ
     الجديدة في التي بعدها — فيرى الحارس شاشةً قديمة ويُغلق ما فُتح للتوّ.

     المحسوب لا يتسابق: «أنت في شاشة حجز، ومعك رحلة، ولم تختر بعد» ⇒
     النافذة مفتوحة. ومغادرةُ الشاشة تُبطل الشرط فتُغلق وحدها — فلا
     تبقى نافذةٌ لا تُغلق معلّقةً فوق الرئيسية بعد زرّ الرجوع. */
  const travellerScreen=screen==="listing"||screen==="focusListing"||screen==="focusConfigure";
  /* شاشات Focus تعمل على `focusTrip` (يرجع لأول رحلة عند فتح رابطٍ
     مباشر)، والشاشة القديمة على `trip` المختار في تقويمها. */
  const travellerTrip=(screen==="focusListing"||screen==="focusConfigure")?focusTrip:trip;
  const mustPickTraveller=travellerScreen&&!!pkg&&!!travellerTrip&&!travellerType;
  const travellerSheetOpen=mustPickTraveller||travellerTypeSheet;

  function reset(){ clearDraft();setPkg(null);setTrip(null);setPersons(1);setSplit(null);setBookingMode("full");setDepartureCity("");setTravellerType("");setPax([emptyPax()]);setPaxTouched({});setPaxTried(false);setAgreed(false);setBookingNo("");setSubmittedAt(null);setErrMsg(""); }

  // ── تحقق نموذج صاحب الحجز ──
  const paxErrs=useMemo(()=>pax.map((p,i)=>paxErrors(p,i===0,t,lang)),[pax,t,lang]);
  const paxValid=paxErrs.every(e=>Object.keys(e).length===0);
  const setPaxField=(i:number,k:keyof Pax,v:string)=>setPax(a=>a.map((x,j)=>j===i?{...x,[k]:v}:x));
  const touch=(i:number,f:PaxField)=>setPaxTouched(s=>({...s,[`${i}.${f}`]:true}));
  const errOf=(i:number,f:PaxField)=>(paxTried||paxTouched[`${i}.${f}`])?paxErrs[i]?.[f]:undefined;
  function goReview(){
    setPaxTried(true);
    if(!paxValid){ window.scrollTo({top:0,behavior:"smooth"}); return; }
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
    if(submitting||!trip||!pkg) return;
    setErrMsg("");
    /* الطلب يُنشأ بجوال موثّق — الجلسة قد تنتهي بين الخطوات. */
    if(!session){ setErrMsg(t("errLoginRequired")); openLogin("flow"); return; }
    if(!agreed){ setErrMsg(t("iAgreeRead")); return; }
    /* الرجوع يتبع المسار الذي جاء منه: قذفُ من دخل من الرئيسية (Focus)
       إلى شاشة `listing` القديمة كان ينقله بين تصميمين في منتصف حجزه. */
    if(!travellerType){
      setErrMsg(t("travellerTypeRequired"));
      setScreen(bookingOrigin==="focus"?"focusListing":"listing",pkg.id);
      return;
    }
    if(!paxValid){ setErrMsg(t("required")); setPaxTried(true); setScreen("passengers"); return; }
    setSubmitting(true);
    try{
      const id=await submitBooking({
        tripId:trip.id, packageId:pkg.id, clientName:pax[0].name, clientPhone:session.phoneLocal.replace(/\s/g,""),
        /* النصّ يُبنى بالعربية دائماً لا بلغة الواجهة: لوحة الموظف والتذاكر
           وصفحة الدفع تعرضه كما هو، فحجز بالإنجليزية كان يكتب فيها سطراً
           إنجليزياً وسط جدول عربي. والغرف تُحفظ مفصّلة بجواره. */
        roomType:bookingMode==="transport"?"مواصلات فقط":split?splitSummary(split,makeT("ar")):"", persons, travellerType, total,
        bookingMode: bookingMode === "transport" ? "transport_only" : "full_package",
        rooms:bookingMode==="transport"?undefined:split?.rooms.map(r=>({tierId:r.id,type:r.type,persons,perNight:r.perNight})),
        /* لا تُنشأ سجلات وهمية للمرافقين: سجلّ صاحب الحجز وحده الآن. */
        pilgrims:[pax[0]].map(p=>({name:p.name.trim(),docType:p.docType||undefined,idNumber:p.idNumber.trim(),
          nationality:p.nationality,gender:p.gender,ageGroup:p.ageGroup,birthDate:p.birthDate,
          phone:(p.phone||session.phoneLocal).replace(/\s/g,"")})),
      });
      /* المسوّدة تُمحى قبل الانتقال: الطلب صار في القاعدة، وبقاؤها
         يعيد المستفيد إلى نموذج مملوء لطلب أرسله. */
      clearDraft();
      setBookingNo(id); setSubmittedAt(Date.now()); setScreen("success");
      /* دفتر المسافرين يتغذّى من كل حجز — لا يُنتظر ولا يُعطّل النجاح. */
      void rememberTravellers([pax[0]]);
    }catch(e){
      /* أي خطأ آخر كان يُعرض كـ«لم تعد المقاعد كافية» فيضيّع سببه الحقيقي
         (رحلة محذوفة، صلاحية، شبكة). نعرض نصّه كما هو ونسجّله. */
      console.error("[booking] فشل إنشاء الحجز:",e);
      if(e instanceof SeatsError) setErrMsg(`${t("errSeats")} (${t("seatsLeft")}: ${e.available})`);
      else if(e instanceof AuthRequiredError){ setErrMsg(t("errLoginRequired")); openLogin("flow"); }
      else setErrMsg((e as {message?:string})?.message||t("errUnknown"));
    }finally{ setSubmitting(false); }
  }

  /* ── الهوية: قراءة الجلسة ومتابعة تغيّرها ── */
  useEffect(()=>{
    let alive=true;
    loadSession().then(s=>{ if(alive){ setSession(s); setSessionReady(true); } })
                 .catch(()=>{ if(alive) setSessionReady(true); });
    return onAuthChange(s=>{ if(alive) setSession(s); });
  },[]);

  /* المعتمر الأول = صاحب الحساب: اسمه وتاريخ ميلاده وجواله الموثّق
     تُعبَّأ تلقائياً فلا يكتب بياناته مرتين ولا يغلط في رقم التتبّع. */
  useEffect(()=>{
    if(!session) return;
    setPax(a=>{ if(!a.length) return a;
      const p=a[0], full=[session.profile?.firstName,session.profile?.lastName].filter(Boolean).join(" ");
      const next={...p,
        name: p.name.trim()?p.name:full,
        birthDate: p.birthDate||session.profile?.birthDate||"",
        phone: session.phoneLocal };
      /* يبقى رقم الجوال في Form State للحفظ والتحقق فقط؛ لا نعرضه ثانية
         داخل نموذج صاحب الحجز بعد أن أُدخل في خطوة الدخول. */
      if(next.name===p.name&&next.birthDate===p.birthDate&&next.phone===p.phone) return a;
      return [next,...a.slice(1)];
    });
  },[session?.userId,session?.profile?.firstName,session?.profile?.lastName,session?.profile?.birthDate,session?.phoneLocal,
    pax[0]?.name,pax[0]?.birthDate,pax[0]?.phone]);

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
    if(isFail(known)){ setOtpErr(authErrorMessage(known,t)); return; }
    setLoginStage(known.exists?"password":"signup");
  }
  async function submitPasswordLogin(){
    if(sending||!loginPassword) return;
    setOtpErr(""); setSending(true);
    const r=await signInWithCustomerPassword(loginPhone,loginPassword);
    setSending(false);
    if(isFail(r)){ setOtpErr("كلمة المرور غير صحيحة"); return; }
    setSession(r.session); afterAuth(r.session);
  }
  async function submitSignup(){
    if(sending||!loginEmail.includes("@")||loginPassword.length<6) return;
    setOtpErr(""); setSending(true);
    const r=await signUpCustomer(loginPhone,loginEmail,loginPassword);
    setSending(false);
    if(isFail(r)){ setOtpErr(authErrorMessage(r,t)); return; }
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
      if(isFail(r)){ setOtpErr(authErrorMessage(r,t)); return; }
      setSession(r.session); afterAuth(r.session);
      return;
    }
    const r=await sendOtp(loginPhone,"sms");
    setSending(false);
    if(isFail(r)){ setOtpErr(authErrorMessage(r,t)); return; }
    setSentVia(r.channel); setOtpCode(""); startResendCountdown(r.cooldownSec); setScreen("otp");
  }
  /** الإرسال الأول رسالة نصية دائماً؛ وهذه تجرّب واتساب إن كان مفعّلاً. */
  async function resendCode(channel:"sms"|"whatsapp"="sms"){
    if(resendIn>0||sending) return;
    setOtpErr(""); setSending(true);
    const r=await sendOtp(loginPhone,channel);
    setSending(false);
    if(isFail(r)){ setOtpErr(authErrorMessage(r,t)); if(r.kind==="rate_limited") startResendCountdown(r.retryAfterSec??60); return; }
    setSentVia(r.channel); setOtpCode(""); startResendCountdown(r.cooldownSec);
  }
  async function confirmOtp(){
    if(sending) return;
    setOtpErr(""); setSending(true);
    const r=await verifyOtp(loginPhone,otpCode);
    setSending(false);
    if(isFail(r)){ setOtpErr(authErrorMessage(r,t)); setOtpCode(""); return; }
    setSession(r.session); afterAuth(r.session);
  }
  async function submitAccount(){
    setPaxTried(true); setAcErr("");
    const owner=pax[0]??emptyPax();
    if(Object.keys(paxErrors(owner,true,t,lang)).length) return;
    const {firstName,lastName}=profileName(owner.name);
    setAcSaving(true);
    const r=await saveProfile({firstName,lastName,birthDate:owner.birthDate,email:acEmail||session?.profile?.email||""});
    setAcSaving(false);
    if(isFail(r)){ setAcErr(authErrorMessage(r,t)); return; }
    setSession(s=>s?{...s,profile:r.profile}:s);
    /* بيانات الحساب هي بيانات المعتمر الأساسي؛ لا نفتح له نموذجاً ثانياً. */
    void rememberTravellers([owner]);
    setScreen("review");
  }
  async function logout(){ await clearSession(); setSession(null); setMyOrders(null); setScreen(HOME); }

  /** بوابة الدخول بين صفحة التفاصيل وبيانات المعتمرين. */
  function goAfterListing(){
    /* المعاينة تعرض ولا تحجز: باقةٌ مسودة قد تكون بلا أسعار ولا رحلات،
       والمضيّ فيها يُنتج طلباً على منتجٍ لم يُنشر بعد. */
    if(preview){ toast.info(t("previewNote")); return; }
    if(!session){ openLogin("flow"); return; }
    if(!session.profile?.complete){ setIntent("flow"); afterAuth(session); return; }
    setScreen("passengers");
  }
  function openLogin(from:"flow"|"track"){
    if(from==="flow") rememberBookingResume();
    else try{ sessionStorage.removeItem(BOOKING_RESUME_KEY); }catch{}
    setIntent(from); setLoginPhone(cachedPhone.current??""); setLoginStage("phone"); setLoginPassword(""); setLoginEmail(""); setOtpErr(""); setScreen("login");
  }

  // تحميل الطلبات عند فتح التتبّع/الحساب بجلسة قائمة
  useEffect(()=>{ if((screen==="track"||screen==="profile") && session){ setOrdersLoading(true);
    /* بلا catch يبقى المؤشّر دائراً على «طلباتي» بلا نهاية ولا رسالة. */
    myBookings(session.phoneLocal).then(o=>{setMyOrders(o);setOrdersLoading(false);})
      .catch(e=>{ console.error("[myBookings]",e); setOrdersLoading(false); toast.error(t("loadFailedSub")); }); } },[screen,session?.userId]);

  const primaryBtn=(on=true)=>({background:on?G.gold:"#d6cfc6",color:on?B.black:"#a09688",border:"none",cursor:on?"pointer":"not-allowed"} as const);

  const isFlow=FLOW_SCREENS.includes(screen);
  /* رئيسيةُ الشاشة الحالية. للموقع رئيسيتان ما دام القديم محفوظاً: من
     فتح الاستكشاف القديم على مساره الداخلي يبقى فيه حين يضغط الشعار أو
     تبويب «استكشاف»، وما عداه — والطلبات والحساب مشتركة بين التجربتين —
     يعود إلى الرئيسية الجديدة. بلا هذا كان تبويب «استكشاف» من «طلباتي»
     يقذف زائر Focus إلى التصميم القديم. */
  const homeScreen:Screen = (screen==="packages"||screen==="listing") ? "packages" : HOME;
  /* الحساب والحجوزات جزءٌ من الواجهة الجديدة كذلك؛ لا تعود لهما خلفية
     الحرم القديمة أو لون قاعدة مختلف حين ينتقل العميل بين التبويبات. */
  const whiteBase=isFlow||screen==="packages"||screen==="focus"||screen==="focusListing"||screen==="focusConfigure"||screen==="listing"||screen==="track"||screen==="profile"||screen==="custom";
  /* Safari قد يكشف لون body عند شريط الحالة أو أسفل الـviewport المتغيّر.
     لا نتركه أبيض في Focus: لون السطح يجب أن يمتد بلا نهاية حول الصفحة. */
  const pageBase=screen==="focus" ? "#fffaf2" : (screen==="focusListing"||screen==="focusConfigure" ? "#fffaf4" : (whiteBase ? "#fff" : G.bg));
  useEffect(()=>{
    document.documentElement.style.backgroundColor=pageBase;
    document.body.style.backgroundColor=pageBase;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content",pageBase);
  },[pageBase]);

  /* بلا شاشة تحميل ثانية: شاشة البدء في index.html ما زالت فوق الصفحة
     ويُزيلها الأثر أعلاه فور جهوز الكتالوج. */
  if(loading) return null;

  /* الكتالوج لم يصل: شاشة صريحة بزرّ إعادة بدل صفحة فارغة تبدو «لا باقات». */
  if(catErr&&!cat.packages.length) return (
    <div dir={dir} lang={lang} className="ts-customer-app" style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"#fff",fontFamily:"var(--font-app)"}}>
      <div style={{maxWidth:380,width:"100%",textAlign:"center"}}>
        <div style={{width:52,height:52,borderRadius:"50%",background:C.dangerTint,color:C.danger,display:"grid",placeItems:"center",margin:"0 auto 18px",fontSize:26}}>!</div>
        <h1 style={{...T.h2,color:C.ink,margin:"0 0 8px"}}>{t("loadFailed")}</h1>
        <p style={{...T.body,color:C.ink2,margin:"0 0 22px"}}>{t("loadFailedSub")}</p>
        <CTAButton full onClick={loadCatalog}>{t("retryBtn")}</CTAButton>
      </div>
    </div>
  );

  return (
    <DirProvider value={dir}>
    <div dir={dir} lang={lang} className="ts-customer-app min-h-screen flex flex-col relative" style={{background:pageBase,fontFamily:"var(--font-app)"}}>
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
      {!isFlow && (screen === "packages" || screen === "listing" || screen === "track" || screen === "profile" || screen === "custom") &&
        <DesktopNav screen={screen} home={homeScreen} onNav={setScreen} lang={lang} setLang={setLang} t={t}
          cities={cities} city={city} setCity={setCity}
          signedIn={!!session} onLogin={()=>openLogin("track")} onSignup={()=>openLogin("track")}/>
      }

      {/* ═══ EXPLORE (الاستكشاف) ═══ */}
      {screen==="packages"&&<>
        <Explore
          packages={activePkgs}
          hotels={cat.hotels}
          transports={cat.transports}
          cities={cities} city={city} setCity={setCity}
          tripsOf={pkgTrips}
          /* باقة جديدة تُبطل مسوّدة الباقة السابقة — وإلا عادت رحلتها
             وتوزيع غرفها إلى نموذج باقة أخرى. */
          onOpen={p=>{setBookingOrigin("standard");clearDraft();setPkg(p);setTrip(null);setPersons(1);setSplit(null);setBookingMode("full");setDepartureCity("");setTravellerType("");setPax([emptyPax()]);setPaxTouched({});setPaxTried(false);setAgreed(false);setScreen("listing",p.id);}}
          onCustom={()=>setScreen("custom")}
          signedIn={!!session}
          onAccount={()=>session ? setScreen("profile") : openLogin("track")}
          t={t} lang={lang} setLang={setLang}
        />
        <BottomBar screen={screen} home={homeScreen} onNav={setScreen} t={t}/>
      </>}

      {/* ═══ الرئيسية — تجربة Focus على «/» ═══
          نفس مكوّن الاستكشاف بخاصيّة destinationFirst: الوجهة أولاً ثم
          الرحلات. لم تُمسّ كتلة الاستكشاف القديم أعلاه ولا خُلطت عناصرها
          هنا؛ هي محفوظة كما هي على /classic حتى يُتأكّد من استقرار هذه. */}
      {screen==="focus"&&<>
        <Explore
          packages={activePkgs}
          hotels={cat.hotels}
          transports={cat.transports}
          cities={cities} city={city} setCity={nextCity=>{
            setCity(nextCity);
            /* الوجهة تغيّرت ⇒ مدينة انطلاقٍ اختيرت لوجهةٍ أخرى لا تُحمل
               معها: قد لا تُسيّر هذه الوجهة رحلةً منها أصلاً. */
            setDepartureCity("");
            if(!nextCity){ setPkg(null); setTrip(null); setScreen("focus"); }
          }}
          tripsOf={pkgTrips}
          destinationFirst
          departureCity={departureCity} departureRequired={needsDepartureCity}
          onPickDepartureCity={()=>setDepartureCitySheet(true)}
          /* مدينة الانطلاق لا تُمسح هنا: اختارها العميل قبل الرحلة،
             والرحلة المفتوحة تنطلق منها. مسحُها كان يعني سؤاله مرّتين. */
          onOpen={(p,chosenTrip)=>{setBookingOrigin("focus");clearDraft();setPkg(p);setTrip(chosenTrip??pkgTrips(p)[0]??null);setPersons(1);setSplit(null);setBookingMode("full");setTravellerType("");setPax([emptyPax()]);setPaxTouched({});setPaxTried(false);setAgreed(false);setScreen("focusListing",p.id);}}
          onCustom={()=>setScreen("custom")}
          signedIn={!!session}
          onAccount={()=>session ? setScreen("profile") : openLogin("track")}
          t={t} lang={lang} setLang={setLang}
        />
      </>}

      {/* صفحات التفاصيل والتخصيص الخاصة بتجربة Focus فقط. */}
      {screen==="focusListing"&&pkg&&focusTrip&&
        <FocusDetails pkg={pkg} trip={focusTrip} hotel={hotel} transport={transport} lang={lang}
          persons={persons} setPersons={setPersons} split={split} setSplit={setSplit}
          travellerType={travellerType} setTravellerType={setTravellerType}
          onBack={()=>setScreen("focus")} onContinue={()=>{setBookingOrigin("focus"); session ? setScreen("passengers") : openLogin("flow");}}/>
      }
      {screen==="focusConfigure"&&pkg&&focusTrip&&
        <FocusConfigure pkg={pkg} trip={focusTrip} hotel={hotel} transport={transport}
          persons={persons} setPersons={setPersons} split={split} setSplit={setSplit} lang={lang}
          travellerType={travellerType} setTravellerType={setTravellerType}
          onBack={()=>setScreen("focusListing")} onContinue={()=>{setBookingOrigin("focus"); session ? setScreen("passengers") : openLogin("flow");}}/>
      }

      {/* ═══ LISTING — الصفحة الواحدة (تحل محل trip + seat + room) ═══ */}
      {screen==="listing"&&pkg&&
        <Listing
          pkg={pkg}
          trips={tripsForDepartureCity(pkgTrips(pkg))}
          calendarTrips={tripsForDepartureCity(pkgTripsShown(pkg))}
          hotel={hotel}
          transport={transport}
          trip={trip}
          setTrip={tr=>{ setTrip(tr); if(tr){ setPersons(n=>Math.min(Math.max(1,n),availSeats(tr))); setTravellerType(""); } }}
          persons={persons} setPersons={setPersons}
          bookingMode={bookingMode} setBookingMode={mode=>{setBookingMode(mode); if(mode==="transport") setSplit(null);}}
          split={split} setSplit={setSplit}
          total={total}
          /* الرجوع يبقى في التجربة القديمة (/classic) لا يقفز إلى الرئيسية
             الجديدة: من فتح هذه الصفحة فتحها بمسارها، فلا يُنقل بين
             تصميمين في ضغطة رجوع واحدة. */
          onBack={()=>setScreen("packages")}
          onNext={goAfterListing}
          departureCityRequired={needsDepartureCity} departureCity={departureCity}
          onDepartureCityClick={()=>setDepartureCitySheet(true)}
          travellerType={travellerType} onTravellerTypeClick={()=>setTravellerTypeSheet(true)}
          terms={TERMS_AR}
          t={t} lang={lang}
        />}

      {/* ── مدينة الانطلاق ──
          مرحلةٌ في المسار: ورقةٌ تُفتح وحدها بعد الوجهة، فيها بحثٌ يعمل
          على التطبيع العربي («دمام» تجد «الدمام»)، والقائمة تُبنى من مدن
          الرحلات المنشورة — مدينةٌ جديدة تُطلق منها رحلة تظهر هنا بلا
          تعديل كود. */}
      <Sheet open={departureCitySheet} onClose={()=>setDepartureCitySheet(false)} title={t("chooseDepartureCity")} tall>
        <div className="flex flex-col" style={{gap:8}}>
          <p style={{...T.body,color:C.ink2,margin:"0 0 2px"}}>{t("departureCityHint")}</p>
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
              className="flex items-center gap-3 text-start" style={{padding:"15px 14px",borderRadius:R.card,cursor:"pointer",fontFamily:"inherit",
                background:selected?C.greenTint:C.white,border:`1px solid ${selected?C.green:C.border}`,color:C.ink}}>
              <span className="w-9 h-9 rounded-full flex items-center justify-center" style={{background:selected?C.green:C.fill,color:selected?C.white:C.ink2}}><MapPin size={18}/></span>
              <span style={{...T.body,fontWeight:600,flex:1}}>{dep}</span>
              {selected&&<Check size={17} style={{color:C.green}}/>}
            </button>;
          })}
          {!departureCities.length&&<div style={{...T.body,color:C.ink2,background:C.fill,padding:14,borderRadius:R.card}}>{t("noDepartureCities")}</div>}
          {!!departureCities.length&&!depMatches.length&&
            <div style={{...T.body,color:C.ink2,background:C.fill,padding:14,borderRadius:R.card}}>{t("noCityMatch")}</div>}
        </div>
      </Sheet>

      <Sheet open={travellerSheetOpen} onClose={()=>setTravellerTypeSheet(false)} title={t("whoTravels")} center
        dismissible={!!travellerType}>
        {/* الاختيار يُغلق الورقة فوراً بلا زر تأكيد: خيارٌ واحدٌ من ثلاثة
            بلا حقولٍ بعده، وزرُّ تأكيدٍ عليه نقرةٌ ثانية بلا معنى. */}
        <TravellerTypeGrid value={travellerType} t={t}
          onPick={v=>{ setTravellerType(v); setTravellerTypeSheet(false); }}/>
      </Sheet>

      {/* ═══ CUSTOM — رحلة حسب الطلب: طلب لا حجز ═══ */}
      {screen==="custom"&&<>
        <CustomRequestScreen lang={lang} dir={dir} onBack={()=>setScreen(HOME)} onDone={()=>setScreen(HOME)}/>
      </>}

      {/* ═══ OWNER — نموذج واحد لصاحب الحجز فقط ═══ */}
      {screen==="passengers"&&
        <FlowScreen
          variant="auth"
          title={t("ownerDetails")} subtitle={t("ownerDetailsHint")} step={2}
          onBack={()=>setScreen(bookingOrigin==="focus"?"focusListing":"listing")} onClose={()=>setScreen(bookingOrigin==="focus"?"focusListing":"listing")}
          cta={goReview} ctaLabel={t("next")}
          error={paxTried&&!paxValid?t("fillFirst"):undefined}>
          <div className="flex flex-col gap-4">
          {pax.slice(0,1).map((p,i)=>{
            const doc=p.docType?docTypeDef(p.docType):null;
            const inp="w-full border px-3.5 focus:outline-none";
            const ist=(bad?:string)=>({borderColor:bad?C.danger:C.border,borderRadius:R.chip,height:52,
              fontSize:16,fontFamily:"inherit",background:C.white,color:C.ink} as const);
            const ltr={direction:"ltr",textAlign:(dir==="rtl"?"right":"left")} as const;
            return (
              <div key={i} className="p-4 flex flex-col gap-4" style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:R.card}}>

                {/* الاسم */}
                <LField label={t("name")} hint={t("nameHint")} error={errOf(i,"name")}>
                  <input value={p.name} onChange={e=>setPaxField(i,"name",e.target.value)} onBlur={()=>touch(i,"name")}
                    placeholder={t("namePh")} className={inp} style={ist(errOf(i,"name"))}/>
                </LField>

                {/* الفئة العمرية والجنس — صفّان متجاوران */}
                <div className="grid grid-cols-2 gap-3">
                  <LField group label={t("ageGroup")}>
                    <SegPick dir={dir} value={p.ageGroup}
                      onChange={v=>setPax(a=>a.map((x,j)=>j===i?{...x,ageGroup:v as Pax["ageGroup"],phone:v==="child"?"":x.phone}:x))}
                      options={[{value:"adult",label:t("adult")},{value:"child",label:t("child")}]}/>
                  </LField>
                  <LField group label={t("gender")}>
                    <SegPick dir={dir} value={p.gender}
                      onChange={v=>setPaxField(i,"gender",v)}
                      options={[{value:"male",label:t("male")},{value:"female",label:t("female")}]}/>
                  </LField>
                </div>

                {/* نوع الوثيقة — يحدّد شكل الرقم المطلوب */}
                <LField label={t("docType")} hint={t("docTypeHint")} error={errOf(i,"docType")}>
                  <SearchSelect
                    dir={dir} searchable={false} subInTrigger={false} value={p.docType} invalid={!!errOf(i,"docType")}
                    onChange={v=>{ setPax(a=>a.map((x,j)=>j===i?{...x,docType:v as DocType,idNumber:""}:x)); touch(i,"docType"); }}
                    options={DOC_TYPES.map(d=>({value:d.value,label:docText(d.label,lang),prefix:d.icon,sub:docText(d.hint,lang)}))}
                    placeholder={t("docTypePh")}/>
                </LField>

                {/* رقم الوثيقة — عنوانه ونصّه الإرشادي يتغيّران حسب النوع */}
                <LField label={doc?docText(doc.numberLabel,lang):t("idNumber")}
                  hint={doc?docText(doc.hint,lang):t("docTypeHint")} error={errOf(i,"idNumber")}>
                  <input value={p.idNumber} disabled={!p.docType} onBlur={()=>touch(i,"idNumber")}
                    onChange={e=>{ const raw=e.target.value; const v=doc?.numeric?raw.replace(/\D/g,""):raw.replace(/\s/g,""); setPaxField(i,"idNumber",v.slice(0,doc?.maxLength??20)); }}
                    inputMode={doc?.numeric?"numeric":"text"} maxLength={doc?.maxLength??20}
                    placeholder={doc?doc.placeholder:"—"} className={inp}
                    style={{...ist(errOf(i,"idNumber")),...ltr,background:p.docType?C.white:C.fill,cursor:p.docType?"text":"not-allowed"}}/>
                </LField>

                {/* الجنسية — قائمة ببحث */}
                <LField label={t("nationality")} hint={t("nationalityHint")} error={errOf(i,"nationality")}>
                  <NationalitySelect lang={lang} dir={dir} value={p.nationality} invalid={!!errOf(i,"nationality")}
                    placeholder={t("nationalityPh")}
                    onChange={v=>{ setPaxField(i,"nationality",v); touch(i,"nationality"); }}/>
                </LField>

                {/* تاريخ الميلاد — قوائم لا تقويم */}
                <LField group label={t("birthDate")} hint={p.birthDate?undefined:t("birthDateHint")} error={errOf(i,"birthDate")}>
                  <BirthDateSelect lang={lang} dir={dir} value={p.birthDate} invalid={!!errOf(i,"birthDate")}
                    onChange={v=>{ setPaxField(i,"birthDate",v); touch(i,"birthDate"); }}/>
                </LField>
              </div>
            );
          })}
          <CompanionNotice t={t}/>
          </div>
        </FlowScreen>}

      {/* ═══ REVIEW ═══ */}
      {screen==="review"&&pkg&&trip&&
        <FlowScreen
          variant="auth"
          title={t("review")} step={3}
          onBack={()=>setScreen("passengers")} onClose={()=>setScreen("listing")}
          cta={doSubmit} ctaLabel={submitting?t("submitting"):t("submit")}
          ctaBusy={submitting} ctaDisabled={!agreed} error={errMsg}>
        <div className="flex flex-col" style={{gap:20}}>
          {/* ملخّص الطلب — صفوف عنوان/قيمة بلا بطاقة، كما يعرضونها */}
          <div className="flex flex-col" style={{gap:10}}>
            {[[t("package"),pkg.name],
              [t("trip"),`${formatDate(trip.departureDate,lang)} · ${trip.departureTime}`],
              ...(needsDepartureCity ? [[t("departureCity"),departureCity]] : []),
              [t("whoTravels"),t(travellerType)],
              ...(bookingMode==="transport" ? [["نوع الحجز","🚌 مواصلات فقط"]] : [[t("room"),split?splitSummary(split,t):"—"]]),
              [t("people"),`${persons}`]].map(([l,v])=>(
              <div key={l} className="flex items-start justify-between" style={{gap:16,...T.body}}>
                <span style={{color:C.ink2,flexShrink:0}}>{l}</span>
                <span style={{color:C.ink,fontWeight:500,textAlign:"end"}}>{v}</span>
              </div>
            ))}
          </div>

          <div className="rounded-xl px-4 py-3 text-sm" style={{background:"#EAF1FE",border:"1px solid #CBDBFB",color:"#1E52C7"}}>
            {t("seatArrangedByUs")}
          </div>

          {/* المعتمرون */}
          <div style={{border:`1px solid ${C.border}`,borderRadius:R.card,overflow:"hidden"}}>
            {pax.map((p,i)=>(
              <div key={i} className="flex items-center justify-between px-4"
                style={{gap:10,paddingBlock:12,borderTop:i?`1px solid ${C.line}`:"none"}}>
                <span className="truncate" style={{...T.body,fontWeight:500,color:C.ink}}>{p.name||"—"}</span>
                <span className="flex items-center flex-shrink-0" style={{gap:8,...T.small,fontWeight:400,color:C.ink2}}>
                  {p.nationality&&<span>{p.nationality}</span>}
                  <span style={{...LTR,fontFamily:"var(--font-app)"}}>{p.idNumber}</span>
                </span>
              </div>
            ))}
          </div>

          {/* تفصيل السعر قبل الإرسال — «اعرض تفصيل السعر قبل المتابعة: النقل،
              السكن، عدد الليالي، عدد المعتمرين، الإضافات، الضريبة والإجمالي».
              الضريبة متضمَّنة لا مضافة (قرار ٢٠٢٦-٠٩-٠٦) فيُقال ذلك سطراً. */}
          <div className="flex flex-col" style={{gap:8,paddingTop:16,borderTop:`1px solid ${C.line}`}}>
            <span style={{...T.small,fontWeight:600,color:C.ink2}}>{t("priceBreakdown")}</span>
            {split&&(
              <div className="flex items-center justify-between" style={{...T.body}}>
                <span style={{color:C.ink2}}>{t("perNightGroup")} · {splitSummary(split,t)}</span>
                <span style={{fontFamily:"var(--font-app)",color:C.ink}}>{money(split.perNight)}</span>
              </div>
            )}
            {bookingMode==="transport"&&(
              <div className="flex items-center justify-between" style={{...T.body}}>
                <span style={{color:C.ink2}}>المواصلات للفرد</span>
                <span style={{fontFamily:"var(--font-app)",color:C.ink}}>{money(pkg.transportOnlyPrice??0)} {t("currency")}</span>
              </div>
            )}
            {split&&(
              <div className="flex items-center justify-between" style={{...T.body}}>
                <span style={{color:C.ink2}}>{t("nightsCount")}</span>
                <span style={{fontFamily:"var(--font-app)",color:C.ink}}>× {nights}</span>
              </div>
            )}
            <div className="flex items-center justify-between" style={{...T.body}}>
              <span style={{color:C.ink2}}>{t("people")}</span>
              <span style={{fontFamily:"var(--font-app)",color:C.ink}}>{persons}</span>
            </div>
            {transport&&(
              <div className="flex items-center justify-between" style={{...T.body}}>
                <span style={{color:C.ink2}}>{t("transportIncl")} · {transport.vehicleType}</span>
                <span style={{color:C.ink2}}>{t("incl")}</span>
              </div>
            )}
            <span style={{...T.small,color:C.ink3}}>{t("priceNote")} {t("inclTax")}.</span>
          </div>

          {/* الإجمالي — سطر بحدّ علوي، لا كتلة ملوّنة */}
          <div className="flex items-center justify-between" style={{paddingTop:16,borderTop:`1px solid ${C.line}`}}>
            <span style={{...T.h3,color:C.ink}}>{t("total")}</span>
            {/* الرقم بالخط الأحادي والعملة بخط النص — الأحادي يوسّع الحروف العربية */}
            <span style={{...T.h2,color:C.ink}}>
              <span style={{fontFamily:"var(--font-app)"}}>{money(total)}</span> {t("currency")}
            </span>
          </div>

          {/* الشروط: مربع اختيار مباشر — والقراءة اختيارية عبر الرابط */}
          <div className="flex flex-col p-4" style={{gap:8,background:C.white,borderRadius:R.card,
            border:`1px solid ${agreed?C.green:C.border}`}}>
            <label className="flex items-center cursor-pointer" style={{gap:12}}>
              <input type="checkbox" checked={agreed} onChange={e=>{setAgreed(e.target.checked); if(e.target.checked) setErrMsg("");}}
                style={{width:20,height:20,accentColor:C.green,flexShrink:0,cursor:"pointer"}}/>
              <span style={{...T.body,fontWeight:500,color:C.ink}}>{t("iAgreeRead")}</span>
            </label>
            <button onClick={()=>setTermsOpen(true)} className="text-start"
              style={{background:"none",border:"none",padding:0,marginInlineStart:32,cursor:"pointer",
                ...T.small,fontWeight:600,color:C.ink,textDecoration:"underline"}}>{t("readTerms")}</button>
          </div>
        </div>
        </FlowScreen>}

      {/* ═══ SUCCESS (R8: timeline directly) ═══ */}
      {screen==="success"&&
        <FlowScreen
          variant="auth"
          title={t("successTitle")} subtitle={t("successMsg")} align="center"
          cta={()=>{reset();setScreen(HOME);}} ctaLabel={t("home")}>
          <div className="flex flex-col items-center" style={{gap:20}}>
            <motion.div initial={{scale:0}} animate={{scale:1}} transition={{type:"spring",damping:14}}
              className="flex items-center justify-center"
              style={{width:64,height:64,borderRadius:R.pill,background:C.greenTint}}>
              <Check size={32} style={{color:C.green}}/>
            </motion.div>
            <div className="flex flex-col items-center px-6 py-3" style={{gap:2,border:`1px solid ${C.border}`,borderRadius:R.card}}>
              <span style={{...T.small,fontWeight:400,color:C.ink2}}>{t("bookingNo")}</span>
              <span style={{...T.h3,color:C.ink,...LTR,fontFamily:"var(--font-app)"}}>{bookingNo}</span>
            </div>
            {/* لحظة الإرسال هنا معروفة يقيناً — الطلب أُرسل قبل قليل. */}
            <div className="w-full p-4" style={{border:`1px solid ${C.border}`,borderRadius:R.card,background:C.bandAction}}>
              <SlaCountdown submittedAt={submittedAt??Date.now()} t={t}/>
            </div>
            <div className="w-full p-4" style={{border:`1px solid ${C.border}`,borderRadius:R.card}}>
              <Timeline status="reviewing" t={t}/>
            </div>
          </div>
        </FlowScreen>}

      {/* ═══ TRACK (auto for logged-in) ═══ */}
      {screen==="track"&&<>
        <div className="ts-track-shell flex-1 flex flex-col" style={{background:C.white,paddingInline:SPACE.page,paddingTop:20,gap:16}}>
          <h1 style={{...T.h1,color:C.ink,margin:0}}>{t("trackTitle")}</h1>
          {!session
            ? sessionReady
              ? <div className="flex flex-col items-center text-center p-6" style={{gap:14,border:`1px solid ${C.border}`,borderRadius:R.card}}>
                  <Search size={28} style={{color:C.green,opacity:.6}}/>
                  <div style={{...T.body,color:C.ink2}}>{t("loginToTrack")}</div>
                  <CTAButton onClick={()=>openLogin("track")}>{t("login")}</CTAButton>
                </div>
              /* الجلسة تُقرأ بوعد — بلا هذا الانتظار تلمع دعوة الدخول
                 لمن هو مسجَّل أصلاً في كل مرة يفتح التبويب. */
              : <div className="text-center py-10" style={{...T.body,color:C.ink2}}>{t("loading")}</div>
            : ordersLoading ? <div className="text-center py-10" style={{...T.body,color:C.ink2}}>{t("loading")}</div>
            : (myOrders&&myOrders.length>0)
              ? myOrders.map(o=>(
                  <div key={o.id} className="flex flex-col p-4" style={{gap:14,border:`1px solid ${C.border}`,borderRadius:R.card}}>
                    <div className="flex items-center justify-between" style={{gap:10}}>
                      <span style={{...T.h3,color:C.ink,...LTR,fontFamily:"var(--font-app)"}}>{o.id}</span>
                      <span className="truncate" style={{...T.meta,color:C.ink2}}>{o.packageName}</span>
                    </div>
                    {/* العدّاد في مرحلة المراجعة وحدها: بعدها صار للطلب
                        إجراء ظاهر (دفع أو تذكرة) فلا يحتاج طمأنة الانتظار.
                        وبلا لحظة إرسال محفوظة يبقى الوعد نصّاً بلا حلقة —
                        عدّادٌ من تاريخ بلا ساعة يخترع دقّةً لا نملكها. */}
                    {(o.status==="reviewing"||o.status==="new")&&(
                      o.submittedAt
                        ? <div className="p-4" style={{border:`1px solid ${C.border}`,borderRadius:R.card,background:C.bandAction}}>
                            <SlaCountdown submittedAt={Date.parse(o.submittedAt)} t={t}/>
                          </div>
                        : <div className="flex items-center" style={{gap:8,padding:12,borderRadius:R.card,background:C.bandAction}}>
                            <Clock size={16} style={{color:C.green,flexShrink:0}}/>
                            <span style={{...T.meta,color:C.ink}}>{t("contactWithin")}</span>
                          </div>
                    )}
                    <Timeline status={o.status} t={t}/>
                    {/* التذكرة بعد التأكيد — كان هنا مربّع رمزٍ وحده بلا
                        رقم ولا موعد ولا مكان. آخر خطوة في رحلة العميل،
                        وهي التي يفتحها صباح السفر وهو واقف يبحث عن نقطة
                        الانطلاق، فكانت تعطيه صورة ولا تعطيه خبراً.

                        الرمز يُبذر برقم التذكرة لا برقم الطلب حين يتوفّر:
                        رقم الطلب أربعة أرقام يخمّنها العادّ، ورقم التذكرة
                        ستّة عشرية مشتقّة من md5. وقبل ترحيل الموجة ٤ يعود
                        ticketNo فارغاً فيبقى السلوك السابق حرفياً. */}
                    {(o.status==="confirmed"||o.status==="verified")&&
                      <div className="flex flex-col pt-4" style={{gap:12,borderTop:`1px solid ${C.line}`}}>
                        <div className="flex items-center justify-between" style={{gap:10}}>
                          <span style={{...T.small,fontWeight:600,color:C.ink2}}>{t("ticket")}</span>
                          {o.ticketNo&&<span style={{...T.body,fontWeight:700,color:C.ink,...LTR,fontFamily:"var(--font-app)"}}>{o.ticketNo}</span>}
                        </div>
                        <div className="flex flex-col" style={{gap:6}}>
                          {([
                            [t("trip"), `${o.tripDate}${o.tripTime?` · ${o.tripTime}`:""}`],
                            [t("departurePoint"), o.departurePoint],
                            [t("people"), `${o.persons} ${t("person")}`],
                          ] as [string,string|undefined][])
                            /* الحقل الغائب يُحذف لا يُعرض «—»: نقطة انطلاق
                               فارغة على تذكرة أسوأ من سطرٍ غير موجود. */
                            .filter(([,v])=>!!v&&v!=="—")
                            .map(([l,v])=>(
                              <div key={l} className="flex items-center justify-between" style={{gap:10}}>
                                <span style={{...T.small,color:C.ink2}}>{l}</span>
                                <span className="truncate" style={{...T.small,fontWeight:600,color:C.ink,textAlign:"end"}}>{v}</span>
                              </div>
                            ))}
                        </div>
                        <div className="flex flex-col items-center" style={{gap:6}}>
                          <QRBlock seed={o.ticketNo||o.id} size={110}/>
                          <div style={{...T.small,color:C.ink2}}>{t("showAtGate")}</div>
                        </div>
                      </div>}
                  </div>
                ))
              : <div className="text-center py-10" style={{...T.body,color:C.ink2}}>{t("noBookings")}</div>}
          <div style={{height:8}}/>
        </div>
        <BottomBar screen={screen} home={homeScreen} onNav={setScreen} t={t}/>
      </>}

      {/* ═══ LOGIN — الجوال ═══ */}
      {screen==="login"&&
        <FlowScreen
          variant="auth"
          title={loginStage==="phone"?t("loginOrSignup"):loginStage==="password"?"مرحبًا بعودتك":"إنشاء حساب جديد"}
          subtitle={loginStage==="phone"?"أدخل رقم جوالك للمتابعة":loginStage==="password"?"أدخل كلمة المرور للدخول إلى حسابك":"أدخل بريدك الإلكتروني وكلمة المرور لإنشاء حسابك"}
          onBack={loginStage!=="phone"?()=>{setLoginStage("phone");setOtpErr("");}:undefined}
          onClose={()=>setScreen(intent==="track"?"track":"listing")}
          cta={loginStage==="phone"?beginLogin:loginStage==="password"?submitPasswordLogin:submitSignup}
          ctaLabel={loginStage==="phone"?"متابعة":loginStage==="password"?"تسجيل الدخول":"إنشاء الحساب"} ctaBusy={sending}
          ctaDisabled={loginStage==="phone"?!validPhone(loginPhone):loginStage==="password"?!loginPassword:!loginEmail.includes("@")||loginPassword.length<6} error={otpErr}>
          {/* الزر معطّل حتى يصحّ الرقم؛ والتلميح يظهر بعد أول إدخال
              حتى لا يبقى المستخدم أمام زر لا يعمل بلا سبب معروض. */}
          {loginStage==="phone" ? <PhoneField value={loginPhone} onChange={setLoginPhone} onEnter={beginLogin}
            error={loginPhone.trim().length>=4&&!validPhone(loginPhone)?t("phoneHint"):undefined}/>
          : <InputStack>
              {loginStage==="signup"&&<StackField label="البريد الإلكتروني" value={loginEmail} onChange={setLoginEmail} placeholder="name@example.com" type="email" inputMode="email" />}
              <StackField label="كلمة المرور" value={loginPassword} onChange={setLoginPassword} placeholder="6 أحرف على الأقل" type="password" last />
            </InputStack>}
        </FlowScreen>}

      {/* ═══ OTP — تأكيد الهوية ═══ */}
      {screen==="otp"&&
        <FlowScreen
          title={t("confirmIdentity")} align="center" step={1}
          onBack={()=>{setScreen("login");setOtpErr("");}}
          onClose={()=>setScreen(intent==="track"?"track":"listing")}
          cta={confirmOtp} ctaLabel={t("verify")} ctaBusy={sending} ctaDisabled={otpCode.length<6}
          error={otpErr}
          subtitle={<>
            {t("sentCodeTo")} <b style={{...LTR,fontWeight:600,color:C.ink}}>+966 {loginPhone.replace(/^0/,"")}</b>
            <br/><span style={{...T.small,color:C.ink3}}>{sentVia==="sms"?t("sentSms"):t("sentWhatsapp")}</span>
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
                    style={{border:`1px solid ${C.border}`,borderRadius:R.chip,background:C.white,fontFamily:"var(--font-app)"}}/>
                ))}
              </InputOTPGroup>
            </InputOTP></div>
            <div style={{...T.meta,color:C.ink2,textAlign:"center"}}>
              {t("didntGet")}{" "}
              {resendIn>0
                ? <span style={{color:C.ink3}}>{t("resendIn")} {resendIn} {t("second")}</span>
                : <TextLink onClick={()=>resendCode("sms")} disabled={sending}>{t("sendNewCode")}</TextLink>}
            </div>
          </div>
        </FlowScreen>}

      {/* ═══ ACCOUNT — بيانات صاحب الحساب = المعتمر الأساسي ═══ */}
      {screen==="account"&&(()=>{
        const p=pax[0]??emptyPax();
        const doc=p.docType?docTypeDef(p.docType):null;
        const inp="w-full border px-3.5 focus:outline-none";
        const ist=(bad?:string)=>({borderColor:bad?C.danger:C.border,borderRadius:R.chip,height:52,
          fontSize:16,fontFamily:"inherit",background:C.white,color:C.ink} as const);
        const ltr={direction:"ltr",textAlign:(dir==="rtl"?"right":"left")} as const;
        return <FlowScreen
          variant="auth"
          title={t("ownerDetails")} subtitle={t("ownerDetailsHint")} step={1}
          onClose={()=>setScreen(intent==="track"?"track":"listing")}
          cta={submitAccount} ctaLabel={t("saveAndContinue")} ctaBusy={acSaving} error={acErr}>
          <div className="flex flex-col gap-4">
            <LField label={t("name")} hint={t("nameHint")} error={errOf(0,"name")}>
              <input value={p.name} onChange={e=>setPaxField(0,"name",e.target.value)} onBlur={()=>touch(0,"name")}
                placeholder={t("namePh")} className={inp} style={ist(errOf(0,"name"))}/>
            </LField>
            <div className="grid grid-cols-2 gap-3">
              <LField group label={t("ageGroup")}>
                <SegPick dir={dir} value={p.ageGroup}
                  onChange={v=>setPax(a=>[{...(a[0]??emptyPax()),ageGroup:v as Pax["ageGroup"],phone:v==="child"?"":(a[0]?.phone??"")}])}
                  options={[{value:"adult",label:t("adult")},{value:"child",label:t("child")} ]}/>
              </LField>
              <LField group label={t("gender")}>
                <SegPick dir={dir} value={p.gender} onChange={v=>setPaxField(0,"gender",v)}
                  options={[{value:"male",label:t("male")},{value:"female",label:t("female")} ]}/>
              </LField>
            </div>
            <LField label={t("docType")} hint={t("docTypeHint")} error={errOf(0,"docType")}>
              <SearchSelect dir={dir} searchable={false} subInTrigger={false} value={p.docType} invalid={!!errOf(0,"docType")}
                onChange={v=>{setPax(a=>[{...(a[0]??emptyPax()),docType:v as DocType,idNumber:""}]);touch(0,"docType");}}
                options={DOC_TYPES.map(d=>({value:d.value,label:docText(d.label,lang),prefix:d.icon,sub:docText(d.hint,lang)}))}
                placeholder={t("docTypePh")}/>
            </LField>
            <LField label={doc?docText(doc.numberLabel,lang):t("idNumber")} hint={doc?docText(doc.hint,lang):t("docTypeHint")} error={errOf(0,"idNumber")}>
              <input value={p.idNumber} disabled={!p.docType} onBlur={()=>touch(0,"idNumber")}
                onChange={e=>{const raw=e.target.value;const v=doc?.numeric?raw.replace(/\D/g,""):raw.replace(/\s/g,"");setPaxField(0,"idNumber",v.slice(0,doc?.maxLength??20));}}
                inputMode={doc?.numeric?"numeric":"text"} maxLength={doc?.maxLength??20} placeholder={doc?doc.placeholder:"—"}
                className={inp} style={{...ist(errOf(0,"idNumber")),...ltr,background:p.docType?C.white:C.fill,cursor:p.docType?"text":"not-allowed"}}/>
            </LField>
            <LField label={t("nationality")} hint={t("nationalityHint")} error={errOf(0,"nationality")}>
              <NationalitySelect lang={lang} dir={dir} value={p.nationality} invalid={!!errOf(0,"nationality")} placeholder={t("nationalityPh")}
                onChange={v=>{setPaxField(0,"nationality",v);touch(0,"nationality");}}/>
            </LField>
            <LField group label={t("birthDate")} hint={p.birthDate?undefined:t("birthDateHint")} error={errOf(0,"birthDate")}>
              <BirthDateSelect lang={lang} dir={dir} value={p.birthDate} invalid={!!errOf(0,"birthDate")}
                onChange={v=>{setPaxField(0,"birthDate",v);touch(0,"birthDate");}}/>
            </LField>
            <CompanionNotice t={t}/>
          </div>
        </FlowScreen>;
      })()}

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
        <BottomBar screen={screen} home={homeScreen} onNav={setScreen} t={t}/>
      </>}

      </div>

      {/* R7: Terms modal */}
      <AnimatePresence>
        {termsOpen&&(
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{background:"rgba(11,90,65,.6)",zIndex:50}} onClick={()=>setTermsOpen(false)}>
            <motion.div initial={{y:40,opacity:0}} animate={{y:0,opacity:1}} exit={{y:40,opacity:0}} className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col" style={{background:"#fff",maxHeight:"85vh"}} onClick={e=>e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4" style={{background:G.deep,color:"#fff"}}>
                <span className="font-extrabold" style={{fontFamily:"var(--font-app)"}}>{t("readTerms")}</span>
                <button onClick={()=>setTermsOpen(false)} className="w-8 h-8 rounded-xl flex items-center justify-center cursor-pointer" style={{background:"rgba(255,255,255,.12)",border:"none",color:"#fff"}}><X size={15}/></button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4 text-sm leading-relaxed whitespace-pre-line" style={{color:B.text3}}>{TERMS_AR}</div>
              <div className="px-5 py-4 flex flex-col gap-3" style={{borderTop:`1px solid ${B.border}`}}>
                <button onClick={()=>setAgreed(a=>!a)} className="flex items-center gap-2.5 cursor-pointer text-right" style={{background:"none",border:"none",padding:0}}>
                  <span className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0" style={{background:agreed?G.green:"#fff",border:`1.5px solid ${agreed?G.green:B.border}`}}>{agreed&&<Check size={14} style={{color:"#fff"}}/>}</span>
                  <span className="text-sm font-bold" style={{color:B.black}}>{t("iAgreeRead")}</span>
                </button>
                <button disabled={!agreed} onClick={()=>setTermsOpen(false)} className="w-full py-3 rounded-xl font-extrabold text-sm" style={primaryBtn(agreed)}>{t("approve")}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* فراغ أسفل الشاشات بلا شريط سفلي حتى لا يغطّي زر الواتساب آخر عنصر */}
      {!TABBED_SCREENS.includes(screen)&&screen!=="listing"&&screen!=="focus"&&screen!=="focusListing"&&screen!=="focusConfigure"&&!isFlow&&<div style={{height:76,flexShrink:0}}/>}

      {/* زر واتساب — ثابت في كل الشاشات، ويرتفع فوق الشريط السفلي حيث يظهر */}
      {/* يظهر في تجربة Focus طوال التصفح؛ وفي صفحة تفاصيل الحجز يرتفع كي
          لا يغطي زر الإكمال. صفحة الحجز الرئيسية القديمة تبقيه مخفياً. */}
      {!isFlow&&screen!=="listing"&&<WhatsAppFab bottom={TABBED_SCREENS.includes(screen)?100:(screen==="focusListing"||screen==="focusConfigure"?88:24)}/>}

      {/* كان مركّباً في AdminApp وحده، فكل toast من طبقة البيانات كان
          يُطلَق في لا مكان: العميل يرى «تم استلام طلبك» ثم لا شيء. dir
          متغيّر لا "rtl" ثابت — هذه الواجهة تعمل بالإنجليزية أيضاً. */}
      <Toaster position="bottom-center" dir={dir} richColors closeButton
        toastOptions={{style:{fontFamily:"var(--font-app)"}}}/>
    </div>
    </DirProvider>
  );
}
