import { useEffect, useState, lazy, Suspense } from "react";
import { Routes, Route, Navigate, useParams, useSearchParams } from "react-router";
import { motion } from "motion/react";
import { X, Check, ShieldCheck, AlertTriangle, Building2, Copy, MessageCircle } from "lucide-react";
import { B } from "@/lib/theme";
import { sar } from "@/lib/money";
import { hideBootSplash } from "@/lib/bootSplash";
import { fetchBookingForPay, verifyDoc, VerifyUnavailableError,
         type PayView, type VerifyResult } from "@/features/customer/data";
import { OrgLine } from "@/components/OrgLine";
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
  const [method,setMethod]=useState<string>("");
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

  if(loading) return null;

  return (
    <div dir="rtl" lang="ar" className="min-h-screen flex items-start justify-center p-4"
      style={{fontFamily:"var(--font-app)",background:"linear-gradient(160deg, #8C6423 0%, #B7893F 56%, #E8D4A8 100%)"}}>
      <div className="w-full my-6" style={{maxWidth:440}}>
        <div className="text-center mb-5">
          <div style={{fontFamily:"var(--font-app)",fontSize:22,fontWeight:800,color:"#fff"}}>تساهيل العمرة</div>
          <div style={{fontSize:10,color:B.gold,letterSpacing:3,marginTop:2}}>TASAHEEL AL-UMRAH · BANK TRANSFER</div>
        </div>
        {pay && pay.payOpen === false ? (
          /* ── رابط مغلق ──
             كان يُعرض نموذج الدفع لأي رابطٍ صحيح مهما تقادم: رحلةٌ راحت،
             أو طلبٌ أُلغي، أو مهلةٌ انقضت — والعميل يدفع ثمن مقعدٍ في
             حافلةٍ وصلت. والسبب يُقال صريحاً: «رابط غير صالح» يجعله
             يتّصل ليسأل. */
          <div className="rounded-2xl p-8 text-center" style={{background:"#fff"}}>
            <AlertTriangle size={40} style={{color:"#8A6A08",margin:"0 auto 12px"}}/>
            <div className="font-extrabold text-lg" style={{color:B.black}}>
              {pay.paymentStatus==="verified" ? "سُدّد هذا الطلب" : "رابط الدفع مغلق"}
            </div>
            <div className="text-sm mt-1" style={{color:B.muted}}>{pay.closedReason ?? "انتهت صلاحية هذا الرابط."}</div>
            <div className="w-full rounded-xl mt-5 p-4 flex flex-col gap-2 text-sm" style={{background:B.fill,border:`1px solid ${B.border}`}}>
              {[["رقم الطلب",pay.id],["الباقة",pay.packageName]].map(([l,v])=>(
                <div key={l} className="flex items-center justify-between gap-2">
                  <span style={{color:B.muted}}>{l}</span>
                  <span className="font-bold" style={{color:B.black,fontFamily:"var(--font-app)"}}>{v}</span>
                </div>
              ))}
            </div>
            <div className="text-xs mt-4 leading-relaxed" style={{color:B.muted}}>
              للاستفسار تواصل معنا وسنساعدك.
            </div>
          </div>
        ) : !pay ? (
          <div className="rounded-2xl p-8 text-center" style={{background:"#fff"}}>
            <X size={40} style={{color:"#BE2626",margin:"0 auto 12px"}}/>
            <div className="font-extrabold text-lg" style={{color:B.black}}>رابط غير صالح</div>
            <div className="text-sm mt-1" style={{color:B.muted}}>لم يُعثر على طلب بهذا الرقم ({bookingId})، أو أن الرابط منتهي.</div>
          </div>
        ) : stage==="success" ? (
          <motion.div initial={{opacity:0,scale:0.96}} animate={{opacity:1,scale:1}} className="rounded-2xl overflow-hidden" style={{background:"#fff"}}>
            <div className="flex flex-col items-center text-center px-6 py-9">
              <motion.div initial={{scale:0}} animate={{scale:1}} transition={{type:"spring",damping:14}} className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{background:"#EAF1FE"}}>
                <MessageCircle size={34} style={{color:"#2457A6"}}/>
              </motion.div>
              <div className="font-extrabold text-xl" style={{color:B.black}}>أرسل إيصال التحويل للفريق</div>
              <div className="text-sm mt-1.5" style={{color:B.text2}}>لم يتغير وضع السداد. يؤكده الموظف بعد مراجعة التحويل.</div>
              <div className="w-full rounded-xl mt-5 p-4 flex flex-col gap-2 text-sm" style={{background:B.fill,border:`1px solid ${B.border}`}}>
                {[["رقم الطلب",pay.id],["الباقة",pay.packageName],["طريقة السداد","تحويل بنكي"],["المبلغ المطلوب",amount]].map(([l,v])=>(
                  <div key={l} className="flex items-center justify-between gap-2">
                    <span style={{color:B.muted}}>{l}</span>
                    <span className="font-bold" style={{color:B.black,fontFamily:"var(--font-app)"}}>{v}</span>
                  </div>
                ))}
              </div>
              <div className="text-xs mt-4 leading-relaxed" style={{color:B.muted}}>احتفظ برقم التحويل أو صورة الإيصال. ستصلك رسالة بعد اعتماد الموظف له.</div>
            </div>
            <div className="px-6 py-4 text-center text-xs font-bold" style={{borderTop:`1px solid ${B.border}`,color:B.text2}}><OrgLine/></div>
          </motion.div>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{background:"#fff"}}>
            <div className="px-6 py-5" style={{borderBottom:`1px solid ${B.border}`}}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold" style={{color:B.muted}}>طلب رقم <span style={{fontFamily:"var(--font-app)",color:B.text2}}>{pay.id}</span></div>
                  <div className="font-extrabold text-base mt-0.5" style={{color:B.black}}>{pay.packageName}</div>
                </div>
                <div className="text-left">
                  <div className="text-xs" style={{color:B.muted}}>المبلغ المطلوب</div>
                  <div style={{fontFamily:"var(--font-app)",fontSize:22,fontWeight:800,color:B.gold}}>{amount}</div>
                </div>
              </div>
            </div>
            <div className="px-6 py-5">
              <div className="text-sm font-extrabold mb-3" style={{color:B.black}}>طريقة السداد</div>
              <div className="grid grid-cols-2 gap-2.5">
                {PAY_METHODS.map(m=>{
                  const on=method===m.id;
                  return (
                    <button key={m.id} onClick={()=>setMethod(m.id)}
                      className="flex items-center justify-center gap-1.5 py-3 rounded-xl text-sm font-bold cursor-pointer"
                      style={{background:on?"rgba(192,134,44,0.1)":"#fff",border:`1.5px solid ${on?B.gold:B.border}`,color:on?"#8a6a08":B.text2}}>
                      {m.emoji&&<span>{m.emoji}</span>}{m.label}
                    </button>
                  );
                })}
              </div>
              {method === "bank_transfer" && (
                <div className="mt-4 rounded-xl p-4 text-sm" style={{background:B.fill,border:`1px solid ${B.border}`}}>
                  {settings?.bankTransfer.bankName && settings.bankTransfer.accountName && settings.bankTransfer.iban ? <>
                    <div className="flex items-center gap-2 font-extrabold mb-3" style={{color:B.black}}><Building2 size={16} style={{color:B.gold}}/>بيانات التحويل</div>
                    <div className="flex flex-col gap-2"><div><span style={{color:B.muted}}>البنك: </span>{settings.bankTransfer.bankName}</div><div><span style={{color:B.muted}}>صاحب الحساب: </span>{settings.bankTransfer.accountName}</div><div className="flex items-start justify-between gap-2"><span style={{color:B.muted}}>الآيبان: </span><button onClick={()=>copyText(settings.bankTransfer.iban)} className="font-bold text-left break-all cursor-pointer" style={{background:"none",border:"none",padding:0,color:"#2457A6",direction:"ltr",fontFamily:"var(--font-app)"}} title="نسخ الآيبان">{settings.bankTransfer.iban} <Copy size={12} className="inline"/></button></div>{settings.bankTransfer.instructions&&<div className="text-xs mt-1" style={{color:B.text2}}>{settings.bankTransfer.instructions}</div>}</div>
                  </> : <div style={{color:B.text2}}>بيانات الحساب لم تُضبط بعد. اضغط «إرسال الإيصال» لطلبها من خدمة العملاء.</div>}
                  <div className="text-xs mt-3" style={{color:B.text2}}>اكتب رقم الطلب <b style={{fontFamily:"var(--font-app)"}}>{pay.id}</b> في مرجع التحويل. لا يُعتبر الحجز مدفوعاً إلا بعد مراجعة الموظف.</div>
                </div>
              )}
            </div>
            <div className="px-6 pb-6">
              {payErr&&(
                <div className="rounded-xl px-4 py-3 text-sm font-bold mb-3"
                  style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626"}}>{payErr}</div>
              )}
              <button onClick={doPay} disabled={!canPay}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-extrabold text-sm"
                style={{background:canPay?B.gold:"#EEECEA",color:canPay?B.black:B.muted,border:"none",cursor:canPay?"pointer":"not-allowed"}}>
                <MessageCircle size={15}/>أرسل إيصال التحويل
              </button>
              <div className="flex items-center justify-center gap-1.5 mt-3 text-xs" style={{color:B.muted}}>
                <ShieldCheck size={12}/>لا تُدخل أي بيانات بطاقة في هذا الرابط
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
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

  if(state==="loading") return null;

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
  const tone = valid ? {bg:"#E3F3E8",fg:"#1E7A44",bd:"#C4E4CE"} : {bg:"#FBE6E6",fg:"#BE2626",bd:"#F3C9C9"};

  return (
    <div dir="rtl" lang="ar" className="min-h-screen flex items-start justify-center p-4"
      style={{fontFamily:"var(--font-app)",background:"linear-gradient(160deg, #8C6423 0%, #B7893F 56%, #E8D4A8 100%)"}}>
      <div className="w-full my-6" style={{maxWidth:420}}>
        <div className="text-center mb-5">
          <div style={{fontFamily:"var(--font-app)",fontSize:22,fontWeight:800,color:"#fff"}}>تساهيل العمرة</div>
          <div style={{fontSize:10,color:B.gold,letterSpacing:3,marginTop:2}}>TICKET VERIFICATION</div>
        </div>

        <div className="rounded-2xl overflow-hidden" style={{background:"#fff"}}>
          {state==="ok"&&res ? <>
            <div className="flex flex-col items-center text-center px-6 py-7" style={{background:tone.bg,borderBottom:`1px solid ${tone.bd}`}}>
              <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3" style={{background:"#fff"}}>
                {valid?<Check size={30} style={{color:tone.fg}}/>:<AlertTriangle size={28} style={{color:tone.fg}}/>}
              </div>
              <div className="font-extrabold text-lg" style={{color:tone.fg}}>
                {valid?"تذكرة صالحة":`غير صالحة — ${phaseLabel}`}
              </div>
              {res.ticketNo&&<div className="text-sm mt-1" style={{color:B.text2,fontFamily:"var(--font-app)",direction:"ltr"}}>{res.ticketNo}</div>}
            </div>
            <div className="px-6 py-5 flex flex-col gap-2.5">
              {([
                ["الاسم",res.clientName],
                ["الباقة",res.packageName],
                ["تاريخ الرحلة",`${res.tripDate}${res.tripTime&&res.tripTime!=="—"?` · ${res.tripTime}`:""}`],
                ["نقطة الانطلاق",res.departurePoint],
                ["عدد المعتمرين",`${res.persons}`],
                ["رقم الطلب",res.bookingId],
              ] as [string,string][])
                .filter(([,v])=>!!v&&v!=="—")
                .map(([l,v])=>(
                  <div key={l} className="flex items-center justify-between gap-3">
                    <span className="text-sm" style={{color:B.muted}}>{l}</span>
                    <span className="text-sm font-bold truncate" style={{color:B.black,textAlign:"end"}}>{v}</span>
                  </div>
                ))}
            </div>
            {/* الاسم مقصوص في القاعدة عمداً — يُقال هنا حتى لا يُقرأ نقصاً. */}
            <div className="px-6 pb-5 text-xs leading-relaxed" style={{color:B.muted}}>
              الاسم مختصر لحماية الخصوصية. طابِق الوثيقة الرسمية للمعتمر مع كشف الرحلة عند الصعود.
            </div>
          </> : (
            <div className="px-6 py-10 text-center">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{background:"#FBE6E6"}}>
                <X size={28} style={{color:"#BE2626"}}/>
              </div>
              <div className="font-extrabold text-lg" style={{color:B.black}}>
                {state==="none"?"لا يوجد مستند بهذا الرقم":"تعذّر التحقّق الآن"}
              </div>
              <div className="text-sm mt-2 leading-relaxed" style={{color:B.muted}}>
                {state==="none"
                  ? "تأكّد من الرمز، أو راجع موظف الرحلة."
                  : "الرقم المقروء من الرمز صحيح، لكن خدمة التحقّق غير متاحة الآن — راجع موظف الرحلة."}
              </div>
              <div className="inline-block mt-4 px-4 py-2 rounded-xl text-sm font-bold"
                style={{background:B.fill,border:`1px solid ${B.border}`,color:B.text2,fontFamily:"var(--font-app)",direction:"ltr"}}>
                {docId}
              </div>
            </div>
          )}
          <div className="px-6 py-4 text-center text-xs font-bold" style={{borderTop:`1px solid ${B.border}`,color:B.text2}}><OrgLine/></div>
        </div>
      </div>
    </div>
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
  /* fallback={null} مقصود: شاشة البدء في index.html ما زالت على الشاشة
     ولا تُزال إلا عند جهوز بيانات الشاشة (hideBootSplash)، فأي مؤشّر
     تحميل هنا يعني شاشة تحميل ثانية فوق الأولى — وهي التي أُزيلت أصلاً.
     تعذّر جلب الشفرة يرفع استثناءً يلتقطه ErrorBoundary. */
  return (
    <Suspense fallback={null}>
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
