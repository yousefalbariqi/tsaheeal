import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Globe, ChevronLeft, Check, Users, X, Search, Heart, UserRound, ArrowLeft, Clock} from "lucide-react";
import { B } from "@/lib/theme";
import type { Pkg, Trip } from "@/types";
import { type RoomSplit, splitTotal, splitSummary } from "./roomSplit";
import { TasaheelMark } from "@/components/TasaheelMark";
import { Spinner } from "@/components/Spinner";
import { Toaster, toast } from "sonner";
import { hideBootSplash } from "@/lib/bootSplash";
import { todayYMD } from "@/lib/utils";
import { QRBlock } from "@/components/QRBlock";
import { NationalitySelect } from "@/components/NationalitySelect";
import { BirthDateSelect } from "@/components/BirthDateSelect";
import { SearchSelect } from "@/components/SearchSelect";
import { DOC_TYPES, docTypeDef, docText, type DocType } from "@/data/docTypes";
import { BusSeatGrid } from "@/components/BusSeatGrid";
import { WhatsAppFab } from "@/components/WhatsAppFab";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/app/components/ui/input-otp";
import { LANGS, dirOf, makeT, type Lang } from "./i18n";
import { SlaCountdown } from "./ui/SlaCountdown";
import { fetchCatalog, submitBooking, fetchTakenSeats, myBookings, SeatsError, AuthRequiredError, SKIP_SEAT_CHECK, availSeats, type Catalog, type TrackResult } from "./data";
import {
  sendOtp, verifyOtp, loadSession, clearSession, onAuthChange, saveProfile,
  cachedPhoneLocal, isWhatsappEnabled, authErrorMessage, isFail,
  type CustomerSession,
} from "./customerAuth";
import { DirProvider, GrayButton, CTAButton } from "./ui/kit";
import { FlowScreen, InputStack, StackField, PhoneField, TextLink, Labeled } from "./ui/FlowScreen";
import { C, T, R, LTR, SPACE, formatDate } from "./ui/tokens";
import { Explore } from "./screens/Explore";
import { Listing } from "./screens/Listing";
import { CustomRequestScreen } from "./screens/CustomRequest";
import { Account } from "./screens/Account";

const G = { deep:"#0B5A41", dark:"#073A2B", green:B.primary, gold:B.gold, bg:"#F5F3EE" };
/* "listing" هي الصفحة trip + seat + room. */
type Screen = "packages"|"listing"|"custom"|"passengers"|"seats"|"review"|"success"|"track"|"profile"|"login"|"otp"|"account";
interface Pax { name:string; phone:string; docType:DocType|""; idNumber:string; nationality:string;
  birthDate:string; gender:"male"|"female"; ageGroup:"adult"|"child"; seat:number|null; }
const emptyPax=():Pax=>({name:"",phone:"",docType:"",idNumber:"",nationality:"",birthDate:"",gender:"male",ageGroup:"adult",seat:null});
const money=(n:number)=>Math.round(n).toLocaleString("en-US");
const validPhone=(p:string)=>/^(0?5\d{8}|(\+?966)5\d{8})$/.test(p.replace(/\s/g,""));
const validName=(s:string)=>s.trim().split(/\s+/).filter(Boolean).length>=2&&s.trim().length>=5;

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

/* اختيار من خيارين بشكل شريط مقسوم — أسرع من قائمة منسدلة لخيارين. */
function SegPick({value,onChange,options,dir}:{value:string;onChange:(v:string)=>void;options:{value:string;label:string}[];dir:"rtl"|"ltr"}){
  return (
    <div className="flex gap-1 p-1" style={{background:C.fill,border:`1px solid ${C.border}`,borderRadius:R.chip,direction:dir}}>
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
   مُعرَّف خارج المكوّن الرئيسي حتى لا يفقد الإدخال التركيز عند إعادة الرسم. */
function LField({label,hint,error,optional,children}:{label:string;hint?:string;error?:string;optional?:string;children:ReactNode}){
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center gap-1" style={{...T.small,fontWeight:500,color:C.ink}}>
        {label}
        {optional
          ? <span style={{fontWeight:400,color:C.ink2}}>({optional})</span>
          : <span style={{color:C.danger}}>*</span>}
      </label>
      {children}
      {error
        ? <span style={{...T.small,fontWeight:500,color:C.danger}}>{error}</span>
        : hint ? <span style={{...T.small,fontWeight:400,color:C.ink2}}>{hint}</span> : null}
    </div>
  );
}

const AR_MONTHS=["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const AR_WEEK=["س","ح","ن","ث","ر","خ","ج"];
/* بلا مرحلة «مؤكد»: كانت تفصل بين الدفع والتذكرة بخطوة لا يرى المستفيد
   فيها شيئاً يحدث — إجراءٌ داخلي عُرض كأنه انتظار إضافي. الدفع يفضي
   إلى التذكرة مباشرة. وحالة confirmed في القاعدة باقية كما هي: هي
   الحالة التي تُصدر التذكرة، فتُطابَق على خطوتها لا على خطوة مستقلة. */
const TRACK_STEPS=["stepReview","stepAccepted","stepAwaitPay","stepPaid","stepTicket"];
const statusToStep=(s:string):number=>({reviewing:0,new:0,accepted:1,awaiting_payment:2,paid:3,confirmed:4,verified:4}[s] ?? 0);

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
- يُخصّص المقعد المختار للمستفيد، وقد تُجرى تعديلات تشغيلية طارئة عند الضرورة.
- نوع السكن حسب الباقة والفندق المرتبط بها.

5) المسؤولية:
- تلتزم المؤسسة ببذل العناية المعتادة، ولا تتحمل مسؤولية الظروف الخارجة عن إرادتها (الطقس، الزحام، القرارات الرسمية).

6) الخصوصية:
- تُستخدم بيانات المستفيد لأغراض الحجز والتواصل فقط ولا تُشارك مع طرف ثالث دون موجب نظامي.

باستمرارك تُقرّ بأنك اطلعت على هذه الشروط ووافقت عليها.`;


/* شاشات المسار — قاعدتها بيضاء وشريطها السفلي ثابت، فلا خلفية مزخرفة
   ولا فراغ سفلي ولا زر واتساب عائم يغطّي زر الإجراء. */
const FLOW_SCREENS:Screen[]=["login","otp","account","passengers","seats","review","success"];
/* شاشات لها شريط تنقّل سفلي — الزر العائم يرتفع فوقه. */
const TABBED_SCREENS:Screen[]=["packages","track","profile"];

export function CustomerApp(){
  const [lang,setLang]=useState<Lang>("ar");
  const t=useMemo(()=>makeT(lang),[lang]);
  const dir=dirOf(lang);
  const [screen,setScreen]=useState<Screen>("packages");
  const [cat,setCat]=useState<Catalog>({packages:[],trips:[],hotels:[],transports:[]});
  const [loading,setLoading]=useState(true);
  const [langOpen,setLangOpen]=useState(false);

  // booking state
  const [pkg,setPkg]=useState<Pkg|null>(null);
  const [trip,setTrip]=useState<Trip|null>(null);
  const [persons,setPersons]=useState(1);
  const [split,setSplit]=useState<RoomSplit|null>(null);
  const [takenSeats,setTakenSeats]=useState<number[]>([]);
  const [pax,setPax]=useState<Pax[]>([emptyPax()]);
  const [paxTouched,setPaxTouched]=useState<Record<string,boolean>>({});
  const [paxTried,setPaxTried]=useState(false);
  const [activePax,setActivePax]=useState(0);
  const [termsOpen,setTermsOpen]=useState(false);
  const [agreed,setAgreed]=useState(false);
  const [submitting,setSubmitting]=useState(false);
  const [bookingNo,setBookingNo]=useState("");
  /** لحظة إرسال الطلب — يبدأ منها عدّاد وعد الردّ في شاشة النجاح. */
  const [submittedAt,setSubmittedAt]=useState<number|null>(null);
  const [errMsg,setErrMsg]=useState("");

  /* ── الجلسة والهوية ──
     الجلسة الحقيقية تُقرأ بوعد (قد تُجدّد رمزاً عبر الشبكة)، فنبدأ
     بالرقم المحفوظ محلياً للرسم الأول فقط ولا نبني عليه أي تصريح. */
  const [session,setSession]=useState<CustomerSession|null>(null);
  const [sessionReady,setSessionReady]=useState(false);
  const cachedPhone=useRef<string|null>(cachedPhoneLocal());
  const [loginPhone,setLoginPhone]=useState("");
  const [otpCode,setOtpCode]=useState("");
  const [otpErr,setOtpErr]=useState("");
  const [sentVia,setSentVia]=useState<"sms"|"whatsapp">("sms");
  const [sending,setSending]=useState(false);
  const [resendIn,setResendIn]=useState(0);
  const resendTimer=useRef<ReturnType<typeof setInterval>|null>(null);
  /* بعد الدخول: يعود للمسار إن جاء منه، أو لصفحة الطلبات إن جاء من التبويب. */
  const [intent,setIntent]=useState<"flow"|"track">("flow");
  const [myOrders,setMyOrders]=useState<TrackResult[]|null>(null);
  const [ordersLoading,setOrdersLoading]=useState(false);
  const [catErr,setCatErr]=useState(false);
  // شاشة الحساب
  const [acFirst,setAcFirst]=useState(""); const [acLast,setAcLast]=useState("");
  const [acBirth,setAcBirth]=useState(""); const [acEmail,setAcEmail]=useState("");
  const [acTried,setAcTried]=useState(false); const [acSaving,setAcSaving]=useState(false);
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
  /* إزالة شاشة البدء بعد رسم الصفحة الجاهزة لا قبله — التسلسل: شعار
     متحرك ← الموقع، بلا شاشة وسيطة. */
  useEffect(()=>{ if(!loading) hideBootSplash(); },[loading]);
  /* خلفية الـbody بيج عامة (لوحة الموظف)؛ صفحة المستفيد بيضاء — نوحّدها هنا
     حتى لا يظهر شريط بيج فوق الرأس في iOS Safari (منطقة شريط الحالة والسحب الزائد). */
  useEffect(()=>{ const prev=document.body.style.background; document.body.style.background="#fff";
    return ()=>{ document.body.style.background=prev; }; },[]);
  useEffect(()=>{ setPax(prev=>{ const a=[...prev]; while(a.length<persons) a.push(emptyPax()); return a.slice(0,persons); }); },[persons]);
  /* التوزيع مربوط بالعدد: تغيّره بعده يُبطله. حارس واحد هنا بدل إبطاله عند
     كل موضع يغيّر العدد (العدّاد، وقصّ المقاعد عند تبديل الرحلة، والتصفير) —
     وإلا نجا توزيع قديم إلى المراجعة بسعر لا يطابق عدد المعتمرين. */
  useEffect(()=>{ setSplit(s=>(s&&s.capacity>=persons&&s.rooms.length<=persons?s:null)); },[persons]);
  /* المقاعد المحجوزة: الفشل يعني كروكياً بلا حجوزات — أفضل من شاشة معطّلة،
     والقاعدة ترفض المقعد المأخوذ في آخر خطوة على أي حال. */
  useEffect(()=>{ if(trip){ setPax(a=>a.map(x=>({...x,seat:null}))); fetchTakenSeats(trip.id).then(setTakenSeats).catch(e=>{ console.error("[fetchTakenSeats]",e); setTakenSeats([]); }); } },[trip?.id]);
  useEffect(()=>()=>{ if(resendTimer.current) clearInterval(resendTimer.current); },[]);

  const activePkgs=cat.packages.filter(p=>p.status==="active" && (p.settings?.allowOnlineBooking!==false));
  /* الرحلة الفائتة لا تُعرض ولو بقيت "open" في القاعدة: تاريخ المغادرة
     هو الحدّ، لا الحالة. بدونه يظهر ٣٠ يوليو حجزاً متاحاً في ٢٣ أغسطس. */
  const today=todayYMD();
  const pkgTrips=(p:Pkg)=>cat.trips.filter(x=>x.packageId===p.id && x.status==="open" && x.departureDate>=today && availSeats(x)>0).sort((a,b)=>a.departureDate.localeCompare(b.departureDate));
  /* رحلات التقويم — القابل للحجز والمكتمل معاً، فالمكتمل يُرسم مشطوباً بدل أن
     يختفي: اختفاؤه يجعل يوماً فاتت مقاعده يبدو يوماً لا تسير فيه الباقة أصلاً.
     الملغاة والمؤرشفة تبقى مستبعدة — عرضها ضجيج لا معلومة. */
  const pkgTripsShown=(p:Pkg)=>cat.trips.filter(x=>x.packageId===p.id && (x.status==="open"||x.status==="full") && x.departureDate>=today).sort((a,b)=>a.departureDate.localeCompare(b.departureDate));
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
  const total=split?splitTotal(split,nights):(trip?.price??0)*persons;
  const takenSet=useMemo(()=>new Set(takenSeats),[takenSeats]);

  function reset(){ setPkg(null);setTrip(null);setPersons(1);setSplit(null);setPax([emptyPax()]);setPaxTouched({});setPaxTried(false);setActivePax(0);setAgreed(false);setBookingNo("");setSubmittedAt(null);setErrMsg(""); }

  // ── تحقق خطوة بيانات المعتمرين ──
  const paxErrs=useMemo(()=>pax.map((p,i)=>paxErrors(p,i===0,t,lang)),[pax,t,lang]);
  const paxValid=paxErrs.every(e=>Object.keys(e).length===0);
  const setPaxField=(i:number,k:keyof Pax,v:string)=>setPax(a=>a.map((x,j)=>j===i?{...x,[k]:v}:x));
  const touch=(i:number,f:PaxField)=>setPaxTouched(s=>({...s,[`${i}.${f}`]:true}));
  const errOf=(i:number,f:PaxField)=>(paxTried||paxTouched[`${i}.${f}`])?paxErrs[i]?.[f]:undefined;
  function goSeats(){
    setPaxTried(true);
    if(!paxValid){ window.scrollTo({top:0,behavior:"smooth"}); return; }
    setActivePax(pax.findIndex(x=>x.seat==null)>=0?pax.findIndex(x=>x.seat==null):0);
    window.scrollTo({top:0});
    setScreen("seats");
  }

  /* ── توزيع المقاعد بالاسم: يختار المستفيد المعتمر ثم مقعده، فينتقل تلقائياً للتالي.
        المقعد مرتبط بالشخص لا بالحجز، فلا يلتبس على الموظف من يجلس أين. ── */
  const seats=useMemo(()=>pax.map(x=>x.seat).filter((n):n is number=>n!=null),[pax]);
  const seatsDone=pax.length>0&&pax.every(x=>x.seat!=null);
  function assignSeat(n:number){
    if(takenSet.has(n)) return;
    setPax(a=>{
      const owner=a.findIndex(x=>x.seat===n);
      const next=a.map((x,j)=>{
        if(j===activePax) return {...x,seat:x.seat===n?null:n};      // النقر على نفس المقعد يلغيه
        if(owner===j) return {...x,seat:null};                        // مقعد مأخوذ من مرافق يُنقل
        return x;
      });
      const after=next.findIndex((x,j)=>j>activePax&&x.seat==null);
      const any=next.findIndex(x=>x.seat==null);
      setActivePax(after>=0?after:any>=0?any:activePax);
      return next;
    });
  }

  async function doSubmit(){
    if(submitting||!trip||!pkg) return;
    setErrMsg("");
    /* الطلب يُنشأ بجوال موثّق — الجلسة قد تنتهي بين الخطوات. */
    if(!session){ setErrMsg(t("errLoginRequired")); openLogin("flow"); return; }
    if(!agreed){ setErrMsg(t("iAgreeRead")); return; }
    if(!paxValid){ setErrMsg(t("required")); setPaxTried(true); setScreen("passengers"); return; }
    if(!seatsDone){ setErrMsg(t("pickSeatsHint").replace("{n}",String(persons))); setScreen("seats"); return; }
    setSubmitting(true);
    try{
      const id=await submitBooking({
        tripId:trip.id, packageId:pkg.id, clientName:pax[0].name, clientPhone:pax[0].phone.replace(/\s/g,""),
        /* النصّ يُبنى بالعربية دائماً لا بلغة الواجهة: لوحة الموظف والتذاكر
           وصفحة الدفع تعرضه كما هو، فحجز بالإنجليزية كان يكتب فيها سطراً
           إنجليزياً وسط جدول عربي. والغرف تُحفظ مفصّلة بجواره. */
        roomType:split?splitSummary(split,makeT("ar")):"", persons, total, seats,
        rooms:split?.rooms.map(r=>({tierId:r.id,type:r.type,persons:r.persons,perNight:r.perNight})),
        pilgrims:pax.map(p=>({name:p.name.trim(),docType:p.docType||undefined,idNumber:p.idNumber.trim(),
          nationality:p.nationality,gender:p.gender,ageGroup:p.ageGroup,birthDate:p.birthDate,
          phone:p.phone.replace(/\s/g,""),seat:p.seat??undefined})),
      });
      setBookingNo(id); setSubmittedAt(Date.now()); setScreen("success");
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
      return [next,...a.slice(1)];
    });
  },[session?.userId,session?.profile?.firstName,session?.profile?.lastName,session?.profile?.birthDate,session?.phoneLocal]);

  // OTP helpers
  function startResendCountdown(sec:number){ setResendIn(sec); if(resendTimer.current) clearInterval(resendTimer.current);
    resendTimer.current=setInterval(()=>setResendIn(s=>{ if(s<=1){ if(resendTimer.current) clearInterval(resendTimer.current); return 0; } return s-1; }),1000); }

  /** بعد التحقق: من ملفه ناقص يُكمل حسابه، وإلا يعود لِما جاء منه. */
  function afterAuth(s:CustomerSession){
    if(!s.profile?.complete){
      setAcFirst(s.profile?.firstName??""); setAcLast(s.profile?.lastName??"");
      setAcBirth(s.profile?.birthDate??""); setAcEmail(s.profile?.email??"");
      setAcTried(false); setAcErr(""); setScreen("account"); return;
    }
    setScreen(intent==="track"?"track":"passengers");
  }

  async function beginLogin(){
    if(!validPhone(loginPhone)){ setOtpErr(t("invalidPhone")); return; }
    setOtpErr(""); setSending(true);
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
    setAcTried(true); setAcErr("");
    if(!acFirst.trim()||!acLast.trim()||!acBirth) return;
    setAcSaving(true);
    const r=await saveProfile({firstName:acFirst,lastName:acLast,birthDate:acBirth,email:acEmail});
    setAcSaving(false);
    if(isFail(r)){ setAcErr(authErrorMessage(r,t)); return; }
    setSession(s=>s?{...s,profile:r.profile}:s);
    setScreen(intent==="track"?"track":"passengers");
  }
  async function logout(){ await clearSession(); setSession(null); setMyOrders(null); setScreen("packages"); }

  /** بوابة الدخول بين صفحة التفاصيل وبيانات المعتمرين. */
  function goAfterListing(){
    if(!session){ setIntent("flow"); setLoginPhone(cachedPhone.current??""); setOtpErr(""); setScreen("login"); return; }
    if(!session.profile?.complete){ setIntent("flow"); afterAuth(session); return; }
    setScreen("passengers");
  }
  function openLogin(from:"flow"|"track"){ setIntent(from); setLoginPhone(cachedPhone.current??""); setOtpErr(""); setScreen("login"); }

  // تحميل الطلبات عند فتح التتبّع/الحساب بجلسة قائمة
  useEffect(()=>{ if((screen==="track"||screen==="profile") && session){ setOrdersLoading(true);
    /* بلا catch يبقى المؤشّر دائراً على «طلباتي» بلا نهاية ولا رسالة. */
    myBookings(session.phoneLocal).then(o=>{setMyOrders(o);setOrdersLoading(false);})
      .catch(e=>{ console.error("[myBookings]",e); setOrdersLoading(false); toast.error(t("loadFailedSub")); }); } },[screen,session?.userId]);

  const primaryBtn=(on=true)=>({background:on?G.gold:"#d6cfc6",color:on?B.black:"#a09688",border:"none",cursor:on?"pointer":"not-allowed"} as const);

  const isFlow=FLOW_SCREENS.includes(screen);
  const whiteBase=isFlow||screen==="packages"||screen==="listing";

  const AppBar=({title,onBack}:{title?:string;onBack?:()=>void})=>(
    <div className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3" style={{background:G.deep,color:"#fff"}}>
      {onBack
        ? <button onClick={onBack} className="p-1.5 rounded-lg cursor-pointer" style={{background:"rgba(255,255,255,.1)",border:"none",color:"#fff"}}><ChevronLeft size={18} style={{transform:dir==="rtl"?"scaleX(-1)":"none"}}/></button>
        : <TasaheelMark size={40}/>}
      <div className="flex-1 font-extrabold" style={{fontFamily:"var(--font-app)",fontSize:15}}>{title||t("brand")}</div>
      <div className="relative">
        <button onClick={()=>setLangOpen(v=>!v)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg cursor-pointer text-xs font-bold" style={{background:"rgba(255,255,255,.12)",border:"none",color:"#fff"}}><Globe size={14}/>{LANGS.find(l=>l.code===lang)?.label}</button>
        <AnimatePresence>
          {langOpen&&(
            <motion.div initial={{opacity:0,y:-6}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-6}}
              className="absolute left-0 mt-1 rounded-xl overflow-hidden z-40" style={{background:"#fff",border:`1px solid ${B.border}`,minWidth:130,boxShadow:"0 12px 30px -8px rgba(0,0,0,.3)"}}>
              {LANGS.map(l=>(
                <button key={l.code} onClick={()=>{setLang(l.code);setLangOpen(false);}} className="flex items-center justify-between gap-2 w-full px-3 py-2.5 text-sm cursor-pointer text-right"
                  style={{background:lang===l.code?B.bg:"#fff",border:"none",color:B.black,fontWeight:lang===l.code?700:500}}>{l.label}{lang===l.code&&<Check size={14} style={{color:G.green}}/>}</button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  /* الشريط السفلي — بنمطهم: أيقونة خطية فوق نص صغير، والنشط ملوّن ومعبّأ. */
  const BottomBar=()=>(
    <div className="sticky bottom-0 z-30 grid grid-cols-3"
      style={{background:C.white,borderTop:`1px solid ${C.line}`,paddingBlock:8,
              paddingBottom:"calc(8px + env(safe-area-inset-bottom, 0px))"}}>
      {([["packages",Search,t("explore")],["track",Heart,t("myBookings")],["profile",UserRound,t("profile")]] as const).map(([sc,Icon,lbl])=>{
        const on=screen===sc;
        return (
          <button key={sc} onClick={()=>setScreen(sc as Screen)}
            className="flex flex-col items-center gap-1 cursor-pointer"
            style={{background:"none",border:"none",paddingBlock:4,color:on?C.green:C.ink2}}>
            <Icon size={21} strokeWidth={on?2.2:1.7} fill={on&&sc==="track"?C.green:"none"}/>
            <span style={{fontSize:11,fontWeight:on?600:400}}>{lbl}</span>
          </button>
        );
      })}
    </div>
  );

  const Timeline=({status}:{status:string})=>{ const step=statusToStep(status); return (
    <div className="flex flex-col" style={{gap:2}}>
      {TRACK_STEPS.map((s,i)=>{ const done=i<=step, last=i===TRACK_STEPS.length-1; return (
        <div key={s} className="flex" style={{gap:12}}>
          <div className="flex flex-col items-center flex-shrink-0">
            <div className="flex items-center justify-center flex-shrink-0"
              style={{width:26,height:26,borderRadius:R.pill,...T.small,
                background:done?C.green:C.white,border:done?"none":`1px solid ${C.border}`,color:done?C.white:C.ink3}}>
              {done?<Check size={13}/>:i+1}
            </div>
            {/* خط واصل يوضّح أنها مراحل متسلسلة لا قائمة */}
            {!last&&<div style={{width:1,flex:1,minHeight:14,background:i<step?C.green:C.line}}/>}
          </div>
          <span style={{...T.body,paddingBottom:last?0:10,
            color:done?C.ink:C.ink2,fontWeight:i===step?600:400}}>{t(s)}</span>
        </div>
      ); })}
    </div>
  ); };

  /* بلا شاشة تحميل ثانية: شاشة البدء في index.html ما زالت فوق الصفحة
     ويُزيلها الأثر أعلاه فور جهوز الكتالوج. */
  if(loading) return null;

  /* الكتالوج لم يصل: شاشة صريحة بزرّ إعادة بدل صفحة فارغة تبدو «لا باقات». */
  if(catErr&&!cat.packages.length) return (
    <div dir={dir} lang={lang} style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"#fff",fontFamily:"var(--font-app)"}}>
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
    <div dir={dir} lang={lang} className="min-h-screen flex flex-col relative" style={{background:whiteBase?"#fff":G.bg,fontFamily:"var(--font-app)"}}>
      {/* R1: خلفية خفيفة — تُخفى في الشاشات المعاد بناؤها لأن قاعدتها بيضاء */}
      {!whiteBase&&
        <div aria-hidden style={{position:"fixed",inset:0,backgroundImage:"url(/bg-haram.jpg)",backgroundSize:"cover",backgroundPosition:"center",opacity:0.06,pointerEvents:"none",zIndex:0}}/>}
      <div className="relative flex flex-col flex-1" style={{zIndex:1}}>

      {/* ═══ EXPLORE (الاستكشاف) ═══ */}
      {screen==="packages"&&<>
        <Explore
          packages={activePkgs}
          hotels={cat.hotels}
          tripsOf={pkgTrips}
          onOpen={p=>{setPkg(p);setTrip(null);setPersons(1);setSplit(null);setPax([emptyPax()]);setScreen("listing");}}
          onCustom={()=>setScreen("custom")}
          t={t} lang={lang} setLang={setLang}
        />
        <BottomBar/>
      </>}

      {/* ═══ LISTING — الصفحة الواحدة (تحل محل trip + seat + room) ═══ */}
      {screen==="listing"&&pkg&&
        <Listing
          pkg={pkg}
          trips={pkgTrips(pkg)}
          calendarTrips={pkgTripsShown(pkg)}
          hotel={hotel}
          transport={transport}
          trip={trip}
          setTrip={tr=>{ setTrip(tr); if(tr) setPersons(n=>Math.min(Math.max(1,n),availSeats(tr))); }}
          persons={persons} setPersons={setPersons}
          split={split} setSplit={setSplit}
          total={total}
          onBack={()=>setScreen("packages")}
          onNext={goAfterListing}
          terms={TERMS_AR}
          t={t} lang={lang}
        />}

      {/* ═══ CUSTOM — رحلة حسب الطلب: طلب لا حجز ═══ */}
      {screen==="custom"&&<>
        <AppBar title={t("customPkg")} onBack={()=>setScreen("packages")}/>
        <CustomRequestScreen lang={lang} dir={dir} onDone={()=>setScreen("packages")}/>
      </>}

      {/* ═══ PASSENGERS — بطاقة لكل معتمر؛ الأول مُعبَّأ من الحساب ═══ */}
      {screen==="passengers"&&
        <FlowScreen
          title={t("passengers")} subtitle={t("pilgrimCardHint")} step={2}
          onBack={()=>setScreen("listing")} onClose={()=>setScreen("listing")}
          cta={goSeats} ctaLabel={t("next")}
          error={paxTried&&!paxValid?t("fillFirst"):undefined}>
          <div className="flex flex-col gap-4">
          {pax.map((p,i)=>{
            const doc=p.docType?docTypeDef(p.docType):null;
            const inp="w-full border px-3.5 focus:outline-none";
            const ist=(bad?:string)=>({borderColor:bad?C.danger:C.border,borderRadius:R.chip,height:52,
              fontSize:16,fontFamily:"inherit",background:C.white,color:C.ink} as const);
            const ltr={direction:"ltr",textAlign:(dir==="rtl"?"right":"left")} as const;
            return (
              <div key={i} className="p-4 flex flex-col gap-4" style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:R.card}}>
                <div className="flex items-center justify-between" style={{...T.h3,color:C.ink}}>
                  {t("person")} {i+1}
                  {p.ageGroup==="child"&&<span style={{...T.small,background:C.fill,color:C.ink2,border:`1px solid ${C.border}`,borderRadius:R.pill,padding:"2px 10px"}}>{t("child")}</span>}
                </div>

                {/* الاسم */}
                <LField label={t("name")} hint={t("nameHint")} error={errOf(i,"name")}>
                  <input value={p.name} onChange={e=>setPaxField(i,"name",e.target.value)} onBlur={()=>touch(i,"name")}
                    placeholder={t("namePh")} className={inp} style={ist(errOf(i,"name"))}/>
                </LField>

                {/* الفئة العمرية والجنس — صفّان متجاوران */}
                <div className="grid grid-cols-2 gap-3">
                  <LField label={t("ageGroup")}>
                    <SegPick dir={dir} value={p.ageGroup}
                      onChange={v=>setPax(a=>a.map((x,j)=>j===i?{...x,ageGroup:v as Pax["ageGroup"],phone:v==="child"?"":x.phone}:x))}
                      options={[{value:"adult",label:t("adult")},{value:"child",label:t("child")}]}/>
                  </LField>
                  <LField label={t("gender")}>
                    <SegPick dir={dir} value={p.gender}
                      onChange={v=>setPaxField(i,"gender",v)}
                      options={[{value:"male",label:t("male")},{value:"female",label:t("female")}]}/>
                  </LField>
                </div>

                {/* الجوال — يختفي للطفل، ويكفي جوال ولي الأمر.
                    جوال المعتمر الأول هو الرقم الموثّق: يُعرض ولا يُعدَّل،
                    فلا ينفصل الطلب عن الحساب الذي سيتتبّعه. */}
                {p.ageGroup==="child"
                  ? <div style={{...T.small,fontWeight:400,background:C.fill,color:C.ink2,borderRadius:R.chip,padding:"10px 12px"}}>{t("childNoPhone")}</div>
                  : i===0&&session
                    ? (
                      <LField label={t("phone")} hint={undefined}>
                        <div className="flex items-center justify-between px-3.5"
                          style={{background:C.fill,border:`1px solid ${C.border}`,borderRadius:R.chip,height:52}}>
                          <span style={{...LTR,fontSize:16,fontFamily:"var(--font-app)",color:C.ink}}>{session.phoneLocal}</span>
                          <span style={{...T.small,background:C.greenTint,color:C.green,borderRadius:R.pill,padding:"3px 10px"}}>✓ {t("verifiedBadge")}</span>
                        </div>
                      </LField>
                    )
                    : (
                      <LField label={t("phone")} hint={t("phoneHint")} error={errOf(i,"phone")} optional={i>0?t("optional"):undefined}>
                        <input value={p.phone} onChange={e=>setPaxField(i,"phone",e.target.value.replace(/[^\d+ ]/g,""))} onBlur={()=>touch(i,"phone")}
                          inputMode="tel" maxLength={14} placeholder={t("phonePh")} className={inp} style={{...ist(errOf(i,"phone")),...ltr}}/>
                      </LField>
                    )}

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
                <LField label={t("birthDate")} hint={p.birthDate?undefined:t("birthDateHint")} error={errOf(i,"birthDate")}>
                  <BirthDateSelect lang={lang} dir={dir} value={p.birthDate} invalid={!!errOf(i,"birthDate")}
                    onChange={v=>{ setPaxField(i,"birthDate",v); touch(i,"birthDate"); }}/>
                </LField>
              </div>
            );
          })}
          </div>
        </FlowScreen>}

      {/* ═══ SEATS — مقعد لكل معتمر بالاسم، بعد إدخال بياناتهم ═══ */}
      {screen==="seats"&&trip&&
        <FlowScreen
          title={t("assignSeats")} subtitle={t("pickPilgrim")} step={3}
          onBack={()=>setScreen("passengers")} onClose={()=>setScreen("listing")}
          cta={()=>{ if(seatsDone) setScreen("review"); }} ctaLabel={t("next")} ctaDisabled={!seatsDone}>
        <div className="flex flex-col gap-4">
          {/* قائمة المعتمرين — النشط مميّز، ومقعده يظهر بجانب اسمه */}
          <div className="rounded-2xl overflow-hidden" style={{background:"#fff",border:`1px solid ${B.border}`}}>
            {pax.map((x,i)=>{
              const on=i===activePax;
              return (
                <button key={i} onClick={()=>setActivePax(i)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-start cursor-pointer"
                  style={{background:on?"#EAF5F0":"#fff",border:"none",borderTop:i?`1px solid ${B.border}`:"none"}}>
                  <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{background:x.gender==="female"?"#F1E9FA":"#EAF1FE",color:x.gender==="female"?"#7226BE":"#1E52C7"}}>{i+1}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate text-sm font-bold" style={{color:B.black}}>{x.name||`${t("person")} ${i+1}`}</span>
                    {x.ageGroup==="child"&&<span className="text-[11px]" style={{color:B.muted}}>{t("child")}</span>}
                  </span>
                  {x.seat!=null
                    ? <span className="px-2.5 py-1 rounded-lg text-xs font-extrabold flex-shrink-0" style={{background:"#FFF7EA",color:"#8a6a08",border:`1px solid ${B.gold}`,fontFamily:"var(--font-app)"}}>{t("seatFor")} {x.seat}</span>
                    : <span className="text-xs flex-shrink-0" style={{color:on?G.green:B.muted,fontWeight:on?700:500}}>{on?t("chooseSeat"):"—"}</span>}
                </button>
              );
            })}
          </div>

          {/* كروكي الباص — النقر يخصّص المقعد للمعتمر النشط ثم ينتقل للتالي */}
          <div className="rounded-2xl p-4" style={{background:"#fff",border:`1px solid ${B.border}`}}>
            <BusSeatGrid
              capacity={trip.seats} occupied={takenSet}
              selected={seats} need={pax.length} onToggle={assignSeat}
            />
          </div>

          {seatsDone
            ? <div className="rounded-xl px-4 py-3 text-sm font-bold" style={{background:"#E3F3E8",border:"1px solid #C4E4CE",color:"#1E7A44"}}>✓ {t("allSeatsSet")}</div>
            : <div className="rounded-xl px-4 py-3 text-sm" style={{background:B.bg,color:B.muted}}>{t("pickSeatsHint").replace("{n}",String(pax.filter(x=>x.seat==null).length))}</div>}
        </div>
        </FlowScreen>}

      {/* ═══ REVIEW ═══ */}
      {screen==="review"&&pkg&&trip&&
        <FlowScreen
          title={t("review")} step={4}
          onBack={()=>setScreen("seats")} onClose={()=>setScreen("listing")}
          cta={doSubmit} ctaLabel={submitting?t("submitting"):t("submit")}
          ctaBusy={submitting} ctaDisabled={!agreed} error={errMsg}>
        <div className="flex flex-col" style={{gap:20}}>
          {/* ملخّص الطلب — صفوف عنوان/قيمة بلا بطاقة، كما يعرضونها */}
          <div className="flex flex-col" style={{gap:10}}>
            {[[t("package"),pkg.name],
              [t("trip"),`${formatDate(trip.departureDate,lang)} · ${trip.departureTime}`],
              [t("room"),split?splitSummary(split,t):"—"],
              [t("people"),`${persons}`],
              [t("seat"),seats.join("، ")||"—"]].map(([l,v])=>(
              <div key={l} className="flex items-start justify-between" style={{gap:16,...T.body}}>
                <span style={{color:C.ink2,flexShrink:0}}>{l}</span>
                <span style={{color:C.ink,fontWeight:500,textAlign:"end"}}>{v}</span>
              </div>
            ))}
          </div>

          {/* المعتمرون */}
          <div style={{border:`1px solid ${C.border}`,borderRadius:R.card,overflow:"hidden"}}>
            {pax.map((p,i)=>(
              <div key={i} className="flex items-center justify-between px-4"
                style={{gap:10,paddingBlock:12,borderTop:i?`1px solid ${C.line}`:"none"}}>
                <span className="truncate" style={{...T.body,fontWeight:500,color:C.ink}}>{p.name||"—"}</span>
                <span className="flex items-center flex-shrink-0" style={{gap:8,...T.small,fontWeight:400,color:C.ink2}}>
                  {p.nationality&&<span>{p.nationality}</span>}
                  {p.seat!=null&&<span style={{background:C.greenTint,color:C.green,borderRadius:R.pill,padding:"2px 8px",fontWeight:500}}>{t("seatFor")} {p.seat}</span>}
                  <span style={{...LTR,fontFamily:"var(--font-app)"}}>{p.idNumber}</span>
                </span>
              </div>
            ))}
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
          title={t("successTitle")} subtitle={t("successMsg")} align="center"
          cta={()=>{reset();setScreen("packages");}} ctaLabel={t("home")}>
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
              <Timeline status="reviewing"/>
            </div>
          </div>
        </FlowScreen>}

      {/* ═══ TRACK (auto for logged-in) ═══ */}
      {screen==="track"&&<>
        <div className="flex-1 flex flex-col" style={{background:C.white,paddingInline:SPACE.page,paddingTop:20,gap:16}}>
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
                    <Timeline status={o.status}/>
                    {(o.status==="confirmed"||o.status==="verified")&&
                      <div className="flex flex-col items-center pt-4" style={{gap:8,borderTop:`1px solid ${C.line}`}}>
                        <QRBlock seed={o.id} size={110}/>
                        <div style={{...T.small,color:C.ink2}}>{t("ticket")}</div>
                      </div>}
                  </div>
                ))
              : <div className="text-center py-10" style={{...T.body,color:C.ink2}}>{t("noBookings")}</div>}
          <div style={{height:8}}/>
        </div>
        <BottomBar/>
      </>}

      {/* ═══ LOGIN — الجوال ═══ */}
      {screen==="login"&&
        <FlowScreen
          title={t("loginOrSignup")} subtitle={t("phoneLead")} step={1}
          onClose={()=>setScreen(intent==="track"?"track":"listing")}
          cta={beginLogin} ctaLabel={t("continueBtn")} ctaBusy={sending}
          ctaDisabled={!validPhone(loginPhone)} error={otpErr}>
          {/* الزر معطّل حتى يصحّ الرقم؛ والتلميح يظهر بعد أول إدخال
              حتى لا يبقى المستخدم أمام زر لا يعمل بلا سبب معروض. */}
          <PhoneField value={loginPhone} onChange={setLoginPhone} onEnter={beginLogin}
            error={loginPhone.trim().length>=4&&!validPhone(loginPhone)?t("phoneHint"):undefined}/>
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

      {/* ═══ ACCOUNT — إكمال بيانات الحساب (أول مرة فقط) ═══ */}
      {screen==="account"&&
        <FlowScreen
          title={t("completeAccount")} subtitle={t("accountHint")} step={1}
          onClose={()=>setScreen(intent==="track"?"track":"listing")}
          cta={submitAccount} ctaLabel={t("saveAndContinue")} ctaBusy={acSaving}
          ctaDisabled={!acFirst.trim()||!acLast.trim()||!acBirth} error={acErr}>
          <Labeled label={t("legalName")}>
            <InputStack>
              <StackField label={t("firstName")} value={acFirst} onChange={setAcFirst}
                error={acTried&&!acFirst.trim()?" ":undefined}/>
              <StackField label={t("lastName")} value={acLast} onChange={setAcLast} last
                error={acTried&&!acLast.trim()?" ":undefined}/>
            </InputStack>
          </Labeled>
          <Labeled label={t("birthDate")} hint={acTried&&!acBirth?t("required"):t("birthDateHint")} bad={acTried&&!acBirth}>
            <BirthDateSelect lang={lang} dir={dir} value={acBirth} invalid={acTried&&!acBirth}
              onChange={setAcBirth}/>
          </Labeled>
          <Labeled label={t("emailOptional")}>
            <InputStack>
              <StackField label={t("email")} value={acEmail} onChange={setAcEmail} last ltr
                type="email" inputMode="email" placeholder="name@example.com"/>
            </InputStack>
          </Labeled>
          {session&&
            <div className="flex items-center justify-between" style={{...T.meta,color:C.ink2,marginTop:4}}>
              <span>{t("phone")}</span>
              <span className="flex items-center" style={{gap:8}}>
                <span style={{...LTR,fontFamily:"var(--font-app)",color:C.ink}}>{session.phoneLocal}</span>
                <span style={{...T.small,background:C.greenTint,color:C.green,borderRadius:R.pill,padding:"2px 8px"}}>✓ {t("verifiedBadge")}</span>
              </span>
            </div>}
        </FlowScreen>}

      {/* ═══ PROFILE ═══ */}
      {screen==="profile"&&<>
        <AppBar title={t("profile")}/>
        <Account
          session={session} onSession={setSession}
          lang={lang} setLang={setLang} t={t}
          onLogin={()=>openLogin("track")}
          onLogout={logout}
          onBookings={()=>setScreen("track")}
        />
        <BottomBar/>
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
      {!TABBED_SCREENS.includes(screen)&&screen!=="listing"&&!isFlow&&<div style={{height:76,flexShrink:0}}/>}

      {/* زر واتساب — ثابت في كل الشاشات، ويرتفع فوق الشريط السفلي حيث يظهر */}
      {/* الزر العائم يختفي في شاشات المسار: زر الإجراء الثابت أهم منه،
          وكان يغطّيه. ويرتفع فوق شريط التنقّل حيث يظهر. */}
      {!isFlow&&<WhatsAppFab bottom={TABBED_SCREENS.includes(screen)||screen==="listing"?100:24}/>}

      {/* كان مركّباً في AdminApp وحده، فكل toast من طبقة البيانات كان
          يُطلَق في لا مكان: العميل يرى «تم استلام طلبك» ثم لا شيء. dir
          متغيّر لا "rtl" ثابت — هذه الواجهة تعمل بالإنجليزية أيضاً. */}
      <Toaster position="bottom-center" dir={dir} richColors closeButton
        toastOptions={{style:{fontFamily:"var(--font-app)"}}}/>
    </div>
    </DirProvider>
  );
}
