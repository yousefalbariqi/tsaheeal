import { useEffect, useRef, useState, lazy, Suspense, type ReactNode } from "react";
import { Routes, Route, Navigate, useParams, useSearchParams } from "react-router";
import { Check, ShieldCheck, ShieldX, AlertTriangle, Building2, Copy, Link2Off, SearchX,
         CircleCheck, Lock, CloudOff, ChevronRight } from "lucide-react";
import { TONE, type ToneName } from "@/lib/theme";
import { sarNumber, SAR, sar } from "@/lib/money";
import { fmtDate, fmtTime } from "@/lib/dates";
import { hideBootSplash } from "@/lib/bootSplash";
import { fetchBookingForPay, verifyDoc, VerifyUnavailableError,
         type PayView, type VerifyResult } from "@/features/customer/data";
import { OrgLine } from "@/components/OrgLine";
import { TasaheelMark } from "@/components/TasaheelMark";
import { WhatsAppGlyph } from "@/components/WhatsAppFab";
import { publicSettings, type PublicSettings } from "@/data/settings";
import { copyText, openWhatsApp } from "@/lib/utils";

/* ════════════════════════════════════════════════════════════
   تقسيم الحزمة عند الجذر — الاستيراد الساكن للوحتين كان يجعل البناء
   حزمةً واحدة: كل زائر للصفحة العامة ينزّل لوحة الإدارة كاملة (١٢
   صفحة إدارية) قبل أن يرى الكتالوج، وكل موظف ينزّل واجهة المستفيد
   كاملة. `lazy` يجعل كل مسار يجلب شفرته وحده عند دخوله.

   CustomerApp تصدير مُسمّى لا افتراضي، فيُلفّ هنا ليعطي React الشكل
   الذي يتوقّعه lazy — بلا تعديل ملف الشاشة نفسه.
════════════════════════════════════════════════════════════ */
const AdminApp = lazy(() => import("./AdminApp"));
const CustomerApp = lazy(() =>
  import("@/features/customer/CustomerApp").then(m => ({ default: m.CustomerApp }))
);
const PublicDashboard = lazy(() => import("@/features/public-dashboard/PublicDashboard"));

/* ════════════════════════════════════════════════════════════
   قشرة الصفحات العامة — الدفع والتحقّق (/pay · /inv/…/verify)
   صفحتان تُفتحان من رابطٍ في واتساب أو من رمز QR، بلا جلسة وبلا تطبيق
   حولهما. كانتا خلفيةً ذهبيةً متدرّجة بعنوانٍ لاتيني؛ الآن لوحة «الكسوة»:
   صفحةٌ عاجية، شريطٌ أسود فيه العلامة وتحته خيطٌ ذهبي، وبطاقةٌ بيضاء.
   الأنماط في styles/customer-misc.css تحت `kp-`.
════════════════════════════════════════════════════════════ */
function PubShell({kicker,children}:{kicker:string;children:ReactNode}) {
  return (
    <div dir="rtl" lang="ar" className="kp-page">
      <header className="kp-head">
        <TasaheelMark size={44}/>
        <div>
          <b>تساهيل العمرة</b>
          <span>{kicker}</span>
        </div>
      </header>
      <main className="kp-main">{children}</main>
      <footer className="kp-foot"><OrgLine/></footer>
    </div>
  );
}

/** كتلة الحكم — أيقونة في دائرة بلون المعنى، عنوان، وسطر. واحدةٌ لكل
    الحالات (رابط غير صالح، مغلق، مسدَّد، تذكرة صالحة…) فتُقرأ بالشكل نفسه. */
function Verdict({tone,icon,title,children,band}:{
  tone:ToneName; icon:ReactNode; title:string; children?:ReactNode;
  /** شريطٌ ملوّن بعرض البطاقة — لحكمٍ يُقرأ من بُعد (باب الحافلة). */
  band?:boolean;
}) {
  const c=TONE[tone];
  return (
    <div className="kp-verdict" data-band={band?"":undefined} role="status"
      style={band?{background:c.bg,borderBottom:`1px solid ${c.line}`}:undefined}>
      <span className="kp-verdict-icon" aria-hidden
        style={{background:band?"#fff":c.bg,color:c.fg,boxShadow:band?`0 0 0 1px ${c.line}`:undefined}}>{icon}</span>
      <h1 style={band?{color:c.fg}:undefined}>{title}</h1>
      {children&&<p>{children}</p>}
    </div>
  );
}

/** صفوف «تسمية ← قيمة». القيم الفارغة و«—» تُسقط. */
function Facts({rows}:{rows:[string,ReactNode][]}) {
  const shown=rows.filter(([,v])=>v!==""&&v!=null&&v!=="—");
  if(!shown.length) return null;
  return (
    <dl className="kp-facts">
      {shown.map(([l,v])=>(<div key={l}><dt>{l}</dt><dd>{v}</dd></div>))}
    </dl>
  );
}

/** صفٌّ قابل للنسخ: القيمة وزرٌّ يتحوّل إلى «تم النسخ» ثانيتين. */
function CopyRow({label,value,display,ltr}:{label:string;value:string;display?:string;ltr?:boolean}) {
  const [done,setDone]=useState(false);
  const timer=useRef<number|undefined>(undefined);
  useEffect(()=>()=>window.clearTimeout(timer.current),[]);
  const copy=()=>{
    copyText(value); setDone(true);
    window.clearTimeout(timer.current);
    timer.current=window.setTimeout(()=>setDone(false),2000);
  };
  return (
    <div className="kp-copy">
      <div>
        <span>{label}</span>
        <b dir={ltr?"ltr":undefined}>{display??value}</b>
      </div>
      <button type="button" onClick={copy} data-done={done?"":undefined}
        aria-label={`نسخ ${label}`}>
        {done?<Check size={16}/>:<Copy size={16}/>}
        <span aria-live="polite">{done?"تم النسخ":"نسخ"}</span>
      </button>
    </div>
  );
}

/** هيكل الانتظار. لا يُرى في الفتح الأول (شاشة البدء فوقه حتى تصل
    البيانات)، ويبقى لمن تأخّر عنه الجواب بعد زوالها. */
function PubSkeleton() {
  return (
    <div className="kp-card" aria-busy="true" style={{padding:24,display:"grid",gap:14}}>
      <div className="kp-skel" style={{width:"40%",height:14}}/>
      <div className="kp-skel" style={{width:"62%",height:38}}/>
      <div className="kp-skel" style={{height:56,marginTop:8}}/>
      <div className="kp-skel" style={{height:56}}/>
      <div className="kp-skel" style={{height:50,borderRadius:999,marginTop:8}}/>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   PUBLIC BANK TRANSFER — صفحة التحويل للعميل (/pay/:id)
════════════════════════════════════════════════════════════ */
const PAY_METHODS = [
  {id:"bank_transfer",label:"تحويل بنكي",emoji:""},
];
/* الرابط يُفتح من واتساب على جهاز بلا جلسة، فالتحقّق برمز الطلب في
   الرابط (pay_token). كانت الصفحة تقرأ من مخزن الموظف — وهو لا يُملأ
   إلا بعد دخول موظف، فكانت تُظهر «رابط غير صالح» لكل عميل حقيقي. */
function PayCheckoutPage({bookingId,token}:{bookingId:string;token:string}) {
  const [pay,setPay]=useState<PayView|null>(null);
  const [loading,setLoading]=useState(true);
  /* طريقةٌ واحدة = مختارةٌ سلفاً: كان العميل يضغط «تحويل بنكي» — الخيار
     الوحيد — ليرى بيانات الحساب ويُفعَّل زرّ الإيصال. متى أُضيفت طريقةٌ
     ثانية عاد الاختيار فارغاً وظهرت الشرائح. */
  const [method,setMethod]=useState<string>(PAY_METHODS.length===1?PAY_METHODS[0].id:"");
  const [stage,setStage]=useState<"form"|"success">("form");
  const [payErr,setPayErr]=useState("");
  const [settings,setSettings]=useState<PublicSettings|null>(null);
  const amount = pay ? sar(pay.total) : "";
  const canPay = !!method;

  useEffect(()=>{ let alive=true;
    fetchBookingForPay(bookingId,token)
      .then(p=>{ if(alive){ setPay(p); setLoading(false); } })
      .catch(()=>{ if(alive) setLoading(false); });
    return ()=>{ alive=false; };
  },[bookingId,token]);
  /* شاشة البدء تبقى حتى تصل تفاصيل الطلب — بلا شاشة تحميل وسيطة. */
  useEffect(()=>{ if(!loading) hideBootSplash(); },[loading]);
  useEffect(()=>{ let alive=true;
    void publicSettings().then(s=>{ if(alive) setSettings(s); });
    return ()=>{ alive=false; };
  },[]);

  const doPay=async()=>{
    if(!canPay) return;
    const phone = settings?.supportPhone;
    if (!phone) { setPayErr("تعذّر تحميل رقم خدمة العملاء. أعد المحاولة."); return; }
    /* لا نكتب في قاعدة البيانات هنا: العميل يرسل إيصال التحويل فقط،
       والموظف يؤكد السداد بعد مراجعته من لوحة الإدارة. */
    openWhatsApp(phone, `مرحباً، تم تحويل مبلغ ${amount} لطلب ${bookingId}.\nمرجع التحويل: `);
    setStage("success");
  };

  const KICKER="السداد بالتحويل البنكي";
  if(loading) return <PubShell kicker={KICKER}><PubSkeleton/></PubShell>;

  const bank=settings?.bankTransfer;
  const bankReady=!!(bank?.bankName&&bank.accountName&&bank.iban);
  /* الآيبان يُعرض مجموعاتٍ رباعية ليُراجَع بالعين، ويُنسخ متّصلاً. */
  const ibanShown=(bank?.iban??"").replace(/\s/g,"").replace(/(.{4})/g,"$1 ").trim();

  return (
    <PubShell kicker={KICKER}>
      {pay && pay.payOpen === false ? (
        /* ── رابط مغلق ──
           كان يُعرض نموذج الدفع لأي رابطٍ صحيح مهما تقادم: رحلةٌ راحت،
           أو طلبٌ أُلغي، أو مهلةٌ انقضت — والعميل يدفع ثمن مقعدٍ في
           حافلةٍ وصلت. والسبب يُقال صريحاً: «رابط غير صالح» يجعله
           يتّصل ليسأل. */
        <div className="kp-card">
          {pay.paymentStatus==="verified"
            ? <Verdict tone="success" icon={<CircleCheck size={30}/>} title="سُدّد هذا الطلب">
                {pay.closedReason ?? "انتهت صلاحية هذا الرابط."}
              </Verdict>
            : <Verdict tone="warn" icon={<Lock size={28}/>} title="رابط الدفع مغلق">
                {pay.closedReason ?? "انتهت صلاحية هذا الرابط."}
              </Verdict>}
          <div className="kp-body">
            <Facts rows={[["رقم الطلب",<bdi dir="ltr">{pay.id}</bdi>],["الباقة",pay.packageName]]}/>
            <p className="kp-note">للاستفسار تواصل معنا وسنساعدك.</p>
          </div>
        </div>
      ) : !pay ? (
        <div className="kp-card">
          <Verdict tone="danger" icon={<Link2Off size={28}/>} title="رابط غير صالح">
            لم يُعثر على طلب بهذا الرقم (<bdi dir="ltr">{bookingId}</bdi>)، أو أن الرابط منتهي.
          </Verdict>
          <div className="kp-body">
            <p className="kp-note">افتح الرابط من آخر رسالة وصلتك منا، أو تواصل معنا لنرسل لك رابطاً جديداً.</p>
          </div>
        </div>
      ) : stage==="success" ? (
        <div className="kp-card">
          <Verdict tone="gold" icon={<WhatsAppGlyph size={30}/>} title="أرسل إيصال التحويل للفريق">
            لم يتغير وضع السداد. يؤكده الموظف بعد مراجعة التحويل.
          </Verdict>
          <div className="kp-body">
            <Facts rows={[
              ["رقم الطلب",<bdi dir="ltr">{pay.id}</bdi>],["الباقة",pay.packageName],
              ["طريقة السداد","تحويل بنكي"],["المبلغ المطلوب",amount],
            ]}/>
            <p className="kp-note">احتفظ برقم التحويل أو صورة الإيصال. ستصلك رسالة بعد اعتماد الموظف له.</p>
            <button type="button" className="kp-secondary" onClick={()=>setStage("form")}>
              <ChevronRight size={18}/>العودة إلى بيانات التحويل
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* ── المبلغ ── أكبر ما في الصفحة: هو ما سيكتبه العميل في تطبيق بنكه */}
          <div className="kp-card kp-amount">
            <span>المبلغ المطلوب</span>
            <strong><bdi dir="ltr">{sarNumber(pay.total)}</bdi> <small>{SAR}</small></strong>
            <div>
              <b>{pay.packageName}</b>
              <span>طلب رقم <bdi dir="ltr">{pay.id}</bdi></span>
            </div>
          </div>

          {PAY_METHODS.length>1&&(
            <div className="kp-methods" role="radiogroup" aria-label="طريقة السداد">
              {PAY_METHODS.map(m=>{
                const on=method===m.id;
                return (
                  <button key={m.id} type="button" role="radio" aria-checked={on}
                    data-on={on?"":undefined} onClick={()=>setMethod(m.id)}>
                    {m.emoji&&<span>{m.emoji}</span>}{m.label}
                  </button>
                );
              })}
            </div>
          )}

          {method === "bank_transfer" && (
            <>
              <section className="kp-card">
                <h2 className="kp-title"><Building2 size={18}/>بيانات التحويل</h2>
                {bankReady&&bank ? (
                  <div className="kp-rows">
                    <CopyRow label="الآيبان" value={bank.iban} display={ibanShown} ltr/>
                    <CopyRow label="صاحب الحساب" value={bank.accountName}/>
                    <div className="kp-copy"><div><span>البنك</span><b>{bank.bankName}</b></div></div>
                    <CopyRow label="مرجع التحويل (رقم الطلب)" value={pay.id} ltr/>
                  </div>
                ) : (
                  <p className="kp-note" style={{padding:"0 20px 20px",margin:0}}>
                    بيانات الحساب لم تُضبط بعد. اضغط «أرسل الإيصال» لطلبها من خدمة العملاء.
                  </p>
                )}
              </section>

              <section className="kp-card">
                <h2 className="kp-title">خطوات السداد</h2>
                <ol className="kp-steps">
                  <li><span>1</span><p>حوّل <b>{amount}</b> {bankReady?"إلى الحساب أعلاه من تطبيق بنكك.":"إلى حساب تساهيل بعد أن تصلك بياناته."}</p></li>
                  <li><span>2</span><p>اكتب رقم الطلب <b><bdi dir="ltr">{pay.id}</bdi></b> في مرجع التحويل.</p></li>
                  <li><span>3</span><p>أرسل لنا الإيصال عبر واتساب. لا يُعتبر الحجز مدفوعاً إلا بعد مراجعة الموظف.</p></li>
                </ol>
                {bankReady&&bank?.instructions&&<p className="kp-instructions">{bank.instructions}</p>}
              </section>
            </>
          )}

          {payErr&&(
            <div className="kp-alert" role="alert"><AlertTriangle size={18}/><span>{payErr}</span></div>
          )}
          <div className="kp-cta-bar">
            <button type="button" onClick={doPay} disabled={!canPay} className="kp-cta">
              <WhatsAppGlyph size={22}/>أرسل الإيصال عبر واتساب
            </button>
            <p className="kp-safe"><ShieldCheck size={15}/>لا تُدخل أي بيانات بطاقة في هذا الرابط</p>
          </div>
        </>
      )}
    </PubShell>
  );
}

/* ════════════════════════════════════════════════════════════
   TICKET VERIFY — صفحة التحقّق من رمز QR (/inv/:id/verify)
   يفتحها الماسح: موظّف على باب الحافلة، أو حاملُ التذكرة نفسه. بلا
   جلسة — الكاميرا لا تسجّل دخولاً. كانت هذه الصفحة غير موجودة، وقاعدة
   rewrite في vercel.json تبتلع المسار وتفتح الاستكشاف: يمسح الموظف
   الرمز فيحصل على قائمة باقات.
════════════════════════════════════════════════════════════ */
/* حالات الحجز التي تجعل التذكرة صالحة للصعود. ما عداها يُقال صراحةً:
   تذكرةٌ لحجزٍ أُلغي يجب أن تُقرأ «ملغى» على الباب لا «صالحة». */
const VALID_STATUSES = ["confirmed", "verified"];
const STATUS_AR: Record<string, string> = {
  new: "جديد", reviewing: "قيد المراجعة", needs_edit: "يحتاج تعديلاً",
  rejected: "مرفوض", accepted: "مقبول", awaiting_payment: "بانتظار الدفع",
  awaiting_trip: "بانتظار الرحلة", paid: "تم الدفع", verifying: "قيد التحقق",
  verified: "تم التحقق", confirmed: "مؤكد", cancelled: "ملغى",
};

function VerifyPage({docId}:{docId:string}) {
  const [res,setRes]=useState<VerifyResult|null>(null);
  const [state,setState]=useState<"loading"|"ok"|"none"|"unavailable"|"error">("loading");

  useEffect(()=>{ let alive=true;
    verifyDoc(docId)
      .then(r=>{ if(!alive) return; setRes(r); setState(r?"ok":"none"); })
      .catch(e=>{ if(!alive) return;
        if(e instanceof VerifyUnavailableError) setState("unavailable");
        else { console.error("verify_doc",e); setState("error"); } });
    return ()=>{ alive=false; };
  },[docId]);
  useEffect(()=>{ if(state!=="loading") hideBootSplash(); },[state]);

  const KICKER="التحقّق من المستند";
  if(state==="loading") return <PubShell kicker={KICKER}><PubSkeleton/></PubShell>;

  /* ── الحكم على المستند لا على حجزه ──
     كان `VALID_STATUSES.includes(res.status)` — حالة **الحجز**. فتذكرةٌ
     أُلغيت وحدها (لتغيير موعد مثلاً) وحجزها ما زال مؤكداً تُقرأ على
     الباب «صالحة»، وتذكرةُ رحلةٍ راحت كذلك. الآن الحكم من `doc_phase`
     الذي تحسبه القاعدة للمستند نفسه، ويسقط إلى الحالة القديمة على
     قاعدةٍ لم تُرحَّل بعد. */
  const phase = res?.docPhase;
  const valid = phase
    ? (phase === "valid" || phase === "paid")
    : (!!res && VALID_STATUSES.includes(res.status));
  const PHASE_AR: Record<string,string> = {
    valid:"صالحة", used:"مستخدمة", cancelled:"ملغاة", expired:"منتهية",
    paid:"مدفوعة", overdue:"انتهى الاستحقاق", refunded:"مُستردّة",
    none:"لم تُدفع", sent:"رابط أُرسل", failed:"فشل الدفع",
  };
  const phaseLabel = phase ? (PHASE_AR[phase] ?? phase) : (res ? (STATUS_AR[res.status] ?? res.status) : "");

  return (
    <PubShell kicker={KICKER}>
      <div className="kp-card">
        {state==="ok"&&res ? <>
          {/* الحكم شريطٌ بعرض البطاقة بلون المعنى: يُقرأ من ذراعٍ ممدودة
              على باب الحافلة قبل أيّ سطرٍ تحته. */}
          <Verdict band tone={valid?"success":"danger"}
            icon={valid?<ShieldCheck size={32}/>:<ShieldX size={32}/>}
            title={valid?"تذكرة صالحة":`غير صالحة — ${phaseLabel}`}>
            {res.ticketNo&&<bdi dir="ltr" className="kp-docno">{res.ticketNo}</bdi>}
          </Verdict>
          <div className="kp-body">
            <Facts rows={[
              ["الاسم",res.clientName],
              ["الباقة",res.packageName],
              ["تاريخ الرحلة",res.tripDate&&res.tripDate!=="—"
                ? `${fmtDate(res.tripDate)}${res.tripTime&&res.tripTime!=="—"?` · ${fmtTime(res.tripTime)}`:""}`
                : ""],
              ["نقطة الانطلاق",res.departurePoint],
              ["عدد المعتمرين",`${res.persons}`],
              ["رقم الطلب",res.bookingId?<bdi dir="ltr">{res.bookingId}</bdi>:""],
            ]}/>
            {/* الاسم مقصوص في القاعدة عمداً — يُقال هنا حتى لا يُقرأ نقصاً. */}
            <p className="kp-note">
              الاسم مختصر لحماية الخصوصية. طابِق الوثيقة الرسمية للمعتمر مع كشف الرحلة عند الصعود.
            </p>
          </div>
        </> : <>
          {state==="none"
            ? <Verdict tone="neutral" icon={<SearchX size={28}/>} title="لا يوجد مستند بهذا الرقم">
                تأكّد من الرمز، أو راجع موظف الرحلة.
              </Verdict>
            : <Verdict tone="warn" icon={<CloudOff size={28}/>} title="تعذّر التحقّق الآن">
                الرقم المقروء من الرمز صحيح، لكن خدمة التحقّق غير متاحة الآن — راجع موظف الرحلة.
              </Verdict>}
          <div className="kp-body" style={{textAlign:"center"}}>
            <bdi dir="ltr" className="kp-code">{docId}</bdi>
          </div>
        </>}
      </div>
    </PubShell>
  );
}

function VerifyRoute() {
  const { id } = useParams();
  return <VerifyPage docId={decodeURIComponent(id ?? "")}/>;
}

function PayRoute() {
  const { id } = useParams();
  const [params] = useSearchParams();
  return <PayCheckoutPage bookingId={decodeURIComponent(id ?? "")} token={params.get("t") ?? ""} />;
}

/* مسار جامع لواجهة المستفيد لا مسار لكل شاشة: مسارٌ منفصل لكل شاشة
   يُركّب CustomerApp من جديد عند كل انتقال، فتُفقد الباقة والرحلة وبيانات
   المعتمرين بين الخطوتين. الشاشة تُقرأ من المسار داخله (routing.ts).
   الترتيب لا يهمّ — react-router يرجّح المسار الأخصّ، فـ/admin و/pay
   يسبقان الجامع. */
export default function App() {
  /* البديل صفحةٌ عاجية فارغة لا مؤشّر تحميل: في الفتح الأول شاشة البدء
     (index.html) فوقها ولا تُزال إلا عند جهوز بيانات الشاشة
     (hideBootSplash)، فأي مؤشّر هنا شاشة تحميل ثانية تحت الأولى. وكانت
     null — فمن انتقل بين مسارين بعد زوال شاشة البدء رأى وميضاً أبيض
     صريحاً؛ الآن يرى لون الصفحة نفسه. تعذّر جلب الشفرة يرفع استثناءً
     يلتقطه ErrorBoundary. */
  return (
    <Suspense fallback={<div className="kp-fallback" aria-busy="true"/>}>
      <Routes>
        <Route path="/admin/*" element={<AdminApp/>}/>
        <Route path="/dashboard" element={<PublicDashboard/>}/>
        <Route path="/pay/:id" element={<PayRoute/>}/>
        <Route path="/pay" element={<Navigate to="/" replace/>}/>
        <Route path="/inv/:id/verify" element={<VerifyRoute/>}/>
        <Route path="/*" element={<CustomerApp/>}/>
      </Routes>
    </Suspense>
  );
}
