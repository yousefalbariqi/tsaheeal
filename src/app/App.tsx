import { useState } from "react";
import { Routes, Route, Navigate, useParams } from "react-router";
import { motion } from "motion/react";
import { X, Check, ShieldCheck } from "lucide-react";
import { B } from "@/lib/theme";
import { useStore } from "@/store/useStore";
import { isSupabaseEnabled, supabase } from "@/supabase/client";
import AdminApp from "./AdminApp";
import { CustomerApp } from "@/features/customer/CustomerApp";

/* ════════════════════════════════════════════════════════════
   PUBLIC PAYMENT CHECKOUT — صفحة الدفع للعميل (/pay/:id)
════════════════════════════════════════════════════════════ */
const PAY_METHODS = [
  {id:"mada",label:"مدى",emoji:"💳",card:true},
  {id:"applepay",label:"Apple Pay",emoji:"",card:false},
  {id:"visa",label:"Visa / Mastercard",emoji:"💳",card:true},
  {id:"stcpay",label:"STC Pay",emoji:"📱",card:false},
];
function PayCheckoutPage({bookingId}:{bookingId:string}) {
  const pay = useStore(s=>s.payments).find(p=>p.bookingId===bookingId);
  const [method,setMethod]=useState<string>("");
  const [stage,setStage]=useState<"form"|"processing"|"success">("form");
  const [card,setCard]=useState({num:"",exp:"",cvv:""});
  const sel = PAY_METHODS.find(m=>m.id===method);
  const amount = pay ? pay.total.toLocaleString("en-US")+" ر.س" : "";
  const canPay = !!method && (!sel?.card || (card.num.replace(/\s/g,"").length>=12 && card.exp.length>=4 && card.cvv.length>=3));
  const doPay=async()=>{ if(!canPay) return; setStage("processing");
    if(isSupabaseEnabled && supabase){ try{ await supabase.rpc("confirm_payment",{p_booking_id:bookingId}); }catch(e){ console.error("confirm_payment",e); } }
    setTimeout(()=>setStage("success"),1600); };

  return (
    <div dir="rtl" lang="ar" className="min-h-screen flex items-start justify-center p-4"
      style={{fontFamily:"'IBM Plex Sans Arabic',system-ui,sans-serif",background:`linear-gradient(160deg,${B.primaryDeep} 0%,${B.primary} 55%,${B.black} 100%)`}}>
      <div className="w-full my-6" style={{maxWidth:440}}>
        <div className="text-center mb-5">
          <div style={{fontFamily:"'Noto Kufi Arabic',serif",fontSize:22,fontWeight:800,color:"#fff"}}>تساهيل العمرة</div>
          <div style={{fontSize:10,color:B.gold,letterSpacing:3,marginTop:2}}>TASAHEEL AL-UMRAH · SECURE PAYMENT</div>
        </div>
        {!pay ? (
          <div className="rounded-2xl p-8 text-center" style={{background:"#fff"}}>
            <X size={40} style={{color:"#BE2626",margin:"0 auto 12px"}}/>
            <div className="font-extrabold text-lg" style={{color:"#000"}}>رابط غير صالح</div>
            <div className="text-sm mt-1" style={{color:B.muted}}>لم يُعثر على طلب بهذا الرقم ({bookingId}).</div>
          </div>
        ) : stage==="success" ? (
          <motion.div initial={{opacity:0,scale:0.96}} animate={{opacity:1,scale:1}} className="rounded-2xl overflow-hidden" style={{background:"#fff"}}>
            <div className="flex flex-col items-center text-center px-6 py-9">
              <motion.div initial={{scale:0}} animate={{scale:1}} transition={{type:"spring",damping:14}} className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{background:"#E3F3E8"}}>
                <Check size={34} style={{color:"#1E7A44"}}/>
              </motion.div>
              <div className="font-extrabold text-xl" style={{color:"#000"}}>تم الدفع بنجاح</div>
              <div className="text-sm mt-1.5" style={{color:B.text2}}>شكراً لك، {pay.clientName}. تم استلام دفعتك.</div>
              <div className="w-full rounded-xl mt-5 p-4 flex flex-col gap-2 text-sm" style={{background:B.bg,border:`1px solid ${B.border}`}}>
                {[["رقم الطلب",pay.bookingId],["الباقة",pay.packageName],["طريقة الدفع",sel?.label??"—"],["المبلغ المدفوع",amount]].map(([l,v])=>(
                  <div key={l} className="flex items-center justify-between gap-2">
                    <span style={{color:B.muted}}>{l}</span>
                    <span className="font-bold" style={{color:"#000",fontFamily:"'IBM Plex Mono',monospace"}}>{v}</span>
                  </div>
                ))}
              </div>
              <div className="text-xs mt-4 leading-relaxed" style={{color:B.muted}}>سيصلك إشعار تأكيد عبر الرسائل، وستتحوّل حالة طلبك تلقائياً إلى «مكتمل».</div>
            </div>
            <div className="px-6 py-4 text-center text-xs font-bold" style={{borderTop:`1px solid ${B.border}`,color:B.text2}}>تساهيل العمرة · السجل التجاري: 1010537391 · tasaaheel.sa</div>
          </motion.div>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{background:"#fff"}}>
            <div className="px-6 py-5" style={{borderBottom:`1px solid ${B.border}`}}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold" style={{color:B.muted}}>طلب رقم <span style={{fontFamily:"'IBM Plex Mono',monospace",color:B.text2}}>{pay.bookingId}</span></div>
                  <div className="font-extrabold text-base mt-0.5" style={{color:"#000"}}>{pay.packageName}</div>
                </div>
                <div className="text-left">
                  <div className="text-xs" style={{color:B.muted}}>المبلغ المطلوب</div>
                  <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:22,fontWeight:800,color:B.primary}}>{amount}</div>
                </div>
              </div>
            </div>
            <div className="px-6 py-5">
              <div className="text-sm font-extrabold mb-3" style={{color:"#000"}}>اختر طريقة الدفع</div>
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
              {sel?.card&&(
                <div className="mt-4 flex flex-col gap-2.5">
                  <div>
                    <label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>رقم البطاقة</label>
                    <input inputMode="numeric" value={card.num} onChange={e=>setCard(c=>({...c,num:e.target.value.replace(/[^0-9 ]/g,"").slice(0,19)}))}
                      placeholder="0000 0000 0000 0000" className="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none"
                      style={{borderColor:B.border,color:"#000",direction:"ltr",textAlign:"left",fontFamily:"'IBM Plex Mono',monospace"}}/>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div><label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>تاريخ الانتهاء</label>
                      <input inputMode="numeric" value={card.exp} onChange={e=>setCard(c=>({...c,exp:e.target.value.replace(/[^0-9/]/g,"").slice(0,5)}))}
                        placeholder="MM/YY" className="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none" style={{borderColor:B.border,color:"#000",direction:"ltr",textAlign:"left",fontFamily:"'IBM Plex Mono',monospace"}}/></div>
                    <div><label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>CVV</label>
                      <input inputMode="numeric" value={card.cvv} onChange={e=>setCard(c=>({...c,cvv:e.target.value.replace(/[^0-9]/g,"").slice(0,4)}))}
                        placeholder="123" className="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none" style={{borderColor:B.border,color:"#000",direction:"ltr",textAlign:"left",fontFamily:"'IBM Plex Mono',monospace"}}/></div>
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 pb-6">
              <button onClick={doPay} disabled={!canPay||stage==="processing"}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-extrabold text-sm"
                style={{background:canPay?B.gold:"#EEECEA",color:canPay?B.black:B.muted,border:"none",cursor:canPay?"pointer":"not-allowed"}}>
                {stage==="processing"
                  ? <><motion.span animate={{rotate:360}} transition={{repeat:Infinity,duration:0.9,ease:"linear"}} style={{width:15,height:15,border:"2px solid rgba(0,0,0,0.3)",borderTopColor:B.black,borderRadius:"50%",display:"inline-block"}}/>جارٍ المعالجة…</>
                  : <><ShieldCheck size={15}/>ادفع {amount}</>}
              </button>
              <div className="flex items-center justify-center gap-1.5 mt-3 text-xs" style={{color:B.muted}}>
                <ShieldCheck size={12}/>دفع آمن ومشفّر · الرابط صالح لمدة 24 ساعة
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PayRoute() {
  const { id } = useParams();
  return <PayCheckoutPage bookingId={decodeURIComponent(id ?? "")} />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<CustomerApp/>}/>
      <Route path="/admin/*" element={<AdminApp/>}/>
      <Route path="/pay/:id" element={<PayRoute/>}/>
      <Route path="*" element={<Navigate to="/" replace/>}/>
    </Routes>
  );
}
