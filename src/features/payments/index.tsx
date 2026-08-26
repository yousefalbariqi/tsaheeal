import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CreditCard, Phone, Printer } from "lucide-react";
import { B } from "@/lib/theme";
import type { Payment } from "@/types";
import { openWhatsApp, invVerifyUrl } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { QRBlock } from "@/components/QRBlock";
import { useStore } from "@/store/useStore";
import { Pager, usePaged } from "@/components/Pager";
import { OrgCr } from "@/components/OrgLine";

const PAY_STATUS_MAP:{[k:string]:{label:string;bg:string;fg:string}} = {
  verified:{label:"مدفوعة",     bg:"#E3F3E8",fg:"#1E7A44"},
  sent:    {label:"رابط أُرسل", bg:"#F1E9FA",fg:"#7226BE"},
  failed:  {label:"فشل الدفع",  bg:"#FBE6E6",fg:"#BE2626"},
  none:    {label:"لم يُدفع",   bg:"#EEECEA",fg:"#5C554E"},
};

/* ─── Payment/invoice shared data + helpers ─── */
export const PAY_ACCOUNT = { org:"مؤسسة تساهيل للعمرة", bank:"مصرف الراجحي", iban:"SA44 8000 0000 6080 1000 0000" };
export const TASAHEEL_BRANCHES = [
  { name:"فرع الرياض — العليا", hours:"9 ص – 11 م", address:"طريق الملك فهد، حي العليا، الرياض" },
  { name:"فرع جدة — الحمراء",   hours:"9 ص – 11 م", address:"شارع الأمير سلطان، حي الحمراء، جدة" },
  { name:"فرع مكة — العزيزية",  hours:"24 ساعة",     address:"شارع العزيزية العام، مكة المكرمة" },
];
/* Deterministic QR-style pattern (visual placeholder, includes finder squares) */
export function InvoiceModal({pay,onClose}:{pay:Payment;onClose:()=>void}) {
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-auto"
      style={{background:"rgba(21,76,72,.65)"}} onClick={onClose}>
      <div className="w-full max-w-2xl flex flex-col gap-3 my-4" onClick={e=>e.stopPropagation()}>
        <style>{`@media print{ body *{visibility:hidden !important;} #invoice-sheet, #invoice-sheet *{visibility:visible !important;} #invoice-sheet{position:absolute !important;inset:0 !important;margin:0 !important;max-width:none !important;box-shadow:none !important;border-radius:0 !important;} }`}</style>
        {/* Actions bar */}
        <div className="flex gap-2 flex-wrap justify-end" data-print-hide>
          <button onClick={()=>window.print()} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold cursor-pointer" style={{background:B.primary,color:B.cream,border:"none"}}><Printer size={14}/>طباعة</button>
          <button onClick={()=>openWhatsApp(pay.clientPhone,`مرحباً ${pay.clientName}،\nفاتورة تساهيل العمرة رقم ${pay.id}\nالباقة: ${pay.packageName}\nالإجمالي: ${pay.total.toLocaleString("en-US")} ر.س\nرابط التحقق: ${invVerifyUrl(pay.id)}`)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold cursor-pointer" style={{background:"#25D366",color:"#fff",border:"none"}}><Phone size={14}/>إرسال واتساب</button>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-bold cursor-pointer" style={{background:B.bg,color:B.text2,border:"none"}}>إغلاق</button>
        </div>
        {/* Invoice document */}
        <div id="invoice-sheet" className="relative rounded-2xl overflow-hidden" style={{background:"#fff",boxShadow:"0 24px 64px -12px rgba(21,76,72,.45)"}}>
          {pay.payStatus!=="verified"&&(
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{zIndex:0}}>
              <span style={{fontSize:90,fontWeight:800,color:"rgba(180,83,12,.07)",transform:"rotate(-24deg)",whiteSpace:"nowrap",fontFamily:"var(--font-app)"}}>فاتورة أولية</span>
            </div>
          )}
          <div style={{position:"relative",zIndex:1}}>
          {/* Header band */}
          <div className="relative px-8 py-7" style={{background:B.primary}}>
            <div className="absolute top-0 inset-x-0 h-1.5" style={{background:`linear-gradient(90deg,${B.gold},${B.gold2},${B.gold})`}}/>
            <div className="flex items-start justify-between gap-6">
              <div>
                <div style={{fontFamily:"var(--font-app)",fontSize:22,fontWeight:800,color:"#fff",lineHeight:1.2}}>تساهيل العمرة</div>
                <div style={{fontSize:11,color:B.gold,letterSpacing:3,marginTop:4}}>TASAHEEL AL-UMRAH</div>
                <div className="mt-3 text-xs" style={{color:"#9DBAB6"}}><OrgCr suffix="الرياض"/></div>
              </div>
              <div className="text-left">
                <div className="text-xs font-bold mb-1" style={{color:"#9DBAB6"}}>فاتورة رقم</div>
                <div style={{fontFamily:"var(--font-app)",fontSize:20,fontWeight:700,color:B.gold}}>{pay.id}</div>
                <div className="text-xs mt-2" style={{color:"#9DBAB6"}}>تاريخ الإصدار: {pay.createdAt}</div>
                <div className="mt-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
                    style={{background:PAY_STATUS_MAP[pay.payStatus].bg,color:PAY_STATUS_MAP[pay.payStatus].fg}}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{background:PAY_STATUS_MAP[pay.payStatus].fg}}/>
                    {PAY_STATUS_MAP[pay.payStatus].label}
                  </span>
                </div>
              </div>
            </div>
          </div>
          {/* Client + Booking info */}
          <div className="grid grid-cols-2 gap-0" style={{borderBottom:`1px solid ${B.border}`}}>
            <div className="px-8 py-5" style={{borderLeft:`1px solid ${B.border}`}}>
              <div className="text-xs font-extrabold mb-3" style={{color:B.primary}}>بيانات العميل</div>
              <div className="font-extrabold text-base mb-0.5" style={{color:"#000"}}>{pay.clientName}</div>
              <div className="text-sm font-mono" style={{color:B.muted,direction:"ltr"}}>{pay.clientPhone}</div>
            </div>
            <div className="px-8 py-5">
              <div className="text-xs font-extrabold mb-3" style={{color:B.primary}}>تفاصيل الحجز</div>
              <div className="font-bold text-sm mb-0.5" style={{color:"#000"}}>{pay.packageName}</div>
              <div className="text-xs" style={{color:B.muted}}>رقم الطلب: <span style={{fontFamily:"var(--font-app)"}}>{pay.bookingId}</span></div>
              <div className="text-xs mt-0.5" style={{color:B.muted}}>تاريخ الرحلة: {pay.tripDate}</div>
              {pay.roomType&&<div className="text-xs mt-0.5" style={{color:B.muted}}>نوع السكن: {pay.roomType}</div>}
            </div>
          </div>
          {/* Items table */}
          <div className="px-8 py-5">
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
              <thead>
                <tr style={{borderBottom:`2px solid ${B.border}`,color:"#7a7168",fontSize:12,textAlign:"right"}}>
                  <th style={{padding:"8px 0",fontWeight:700}}>البند</th>
                  <th style={{padding:"8px 0",fontWeight:700,textAlign:"left"}}>المبلغ</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{borderBottom:`1px solid ${B.border}`}}>
                  <td style={{padding:"12px 0",color:B.text3}}>باقة العمرة — {pay.packageName}</td>
                  <td style={{padding:"12px 0",fontWeight:700,color:B.black,textAlign:"left",fontFamily:"var(--font-app)"}}>{pay.total.toLocaleString("en-US")} ر.س</td>
                </tr>
              </tbody>
            </table>
          </div>
          {/* Totals: grand / paid / remaining */}
          {(()=>{ const paid=pay.payStatus==="verified"?pay.total:0; const remaining=pay.total-paid; const settled=remaining<=0;
            return (
            <div className="mx-8 mb-5 flex justify-start">
              <div className="flex flex-col gap-2" style={{width:300}}>
                <div className="flex items-center justify-between text-sm"><span style={{color:"#000"}}>الإجمالي</span><span className="font-bold" style={{fontFamily:"var(--font-app)",color:"#000"}}>{pay.total.toLocaleString("en-US")} ر.س</span></div>
                <div className="flex items-center justify-between text-sm"><span style={{color:"#000"}}>المدفوع</span><span className="font-bold" style={{fontFamily:"var(--font-app)",color:"#1E7A44"}}>{paid.toLocaleString("en-US")} ر.س</span></div>
                <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{background:settled?"#EEECEA":"#FBE6E6",border:`1px solid ${settled?B.border:"#F3C9C9"}`}}>
                  <span className="font-bold text-sm" style={{color:settled?"#5C554E":"#BE2626"}}>المتبقّي</span>
                  <span style={{fontFamily:"var(--font-app)",fontSize:20,fontWeight:800,color:settled?"#5C554E":"#BE2626"}}>{remaining.toLocaleString("en-US")} ر.س</span>
                </div>
              </div>
            </div>
            );
          })()}
          {/* Payment info */}
          {pay.payStatus!=="none"&&(
            <div className="mx-8 mb-5 rounded-xl px-5 py-4 grid grid-cols-3 gap-4" style={{background:B.cream,border:`1px solid #EDE4CF`}}>
              <div><div className="text-xs font-semibold mb-0.5" style={{color:B.muted}}>طريقة الدفع</div><div className="font-bold text-sm" style={{color:B.black}}>{pay.payMethod||"—"}</div></div>
              <div><div className="text-xs font-semibold mb-0.5" style={{color:B.muted}}>رقم العملية</div><div className="font-bold text-sm font-mono" style={{color:B.black}}>{pay.txnNo||"—"}</div></div>
              <div><div className="text-xs font-semibold mb-0.5" style={{color:B.muted}}>تاريخ السداد</div><div className="font-bold text-sm" style={{color:B.black}}>{pay.payDate||"—"}</div></div>
            </div>
          )}
          {/* QR verify */}
          <div className="mx-8 mb-5 flex items-center gap-4 rounded-xl px-5 py-4" style={{background:"#FBFAF6",border:`1px dashed ${B.border}`}}>
            <QRBlock seed={pay.id} size={92}/>
            <div>
              <div className="text-xs font-bold mb-1" style={{color:B.black}}>امسح باركود التحقق</div>
              <div className="text-xs leading-relaxed" style={{color:B.muted,maxWidth:250}}>ينقلك إلى صفحة التحقق الرسمية لعرض معلومات الفاتورة والطلب.</div>
              <div className="text-xs font-bold mt-1.5" style={{color:B.gold,fontFamily:"var(--font-app)",direction:"ltr",textAlign:"right"}}>{invVerifyUrl(pay.id)}</div>
            </div>
          </div>
          {/* Footer */}
          <div className="px-8 py-4 text-center text-xs" style={{color:B.muted,borderTop:`1px solid ${B.border}`}}>
            شكراً لاختياركم تساهيل العمرة — نسأل الله أن يتقبّل منكم ويُيسّر أداء مناسككم
          </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function PaymentsPage({onMenuOpen}:{onMenuOpen?:()=>void}) {
  const payments=useStore(s=>s.payments);
  const [search,setSearch]=useState("");
  const [statusFilter,setStatusFilter]=useState<"all"|"verified"|"sent"|"failed"|"none">("all");
  const [invoiceId,setInvoiceId]=useState<string|null>(null);

  const curInvoice = invoiceId ? payments.find(p=>p.id===invoiceId) : null;

  const filtered = payments.filter(p=>
    (statusFilter==="all"||p.payStatus===statusFilter)&&
    (!search||(p.id+p.bookingId+p.clientName).toLowerCase().includes(search.toLowerCase()))
  );

  /* ترقيم الصفحات — الرسم على الصفحة الحالية وحدها. المفتاح يُعيد
     للصفحة الأولى عند تغيّر البحث أو المرشّح: من كان في الصفحة الخامسة
     ثم بحث عن اسم يجب أن يرى أول النتائج لا صفحتها الخامسة. */
  const pg = usePaged(filtered, `${search}|${statusFilter}`);

  const kpis = [
    {label:"إجمالي الفواتير",        value:payments.length,          sub:"كل الطلبات",        bg:"#fff",   br:B.border,    fg:B.black},
    {label:"مدفوعة",                  value:payments.filter(p=>p.payStatus==="verified").length, sub:"تم التحصيل",  bg:"#E3F3E8",br:"#C4E4CE", fg:"#1E7A44"},
    {label:"رابط أُرسل",             value:payments.filter(p=>p.payStatus==="sent").length,     sub:"بانتظار الدفع",bg:"#F1E9FA",br:"#D8BBFA",fg:"#7226BE"},
    {label:"فشل الدفع",              value:payments.filter(p=>p.payStatus==="failed").length,   sub:"يحتاج متابعة",bg:"#FBE6E6",br:"#F3C9C9",fg:"#BE2626"},
    {label:"الإيرادات المُحصّلة",    value:payments.filter(p=>p.payStatus==="verified").reduce((a,p)=>a+p.total,0).toLocaleString("en-US")+" ر.س", sub:"تم استلامها",bg:`linear-gradient(135deg,${B.primary},${B.primaryDeep})`,br:"rgba(192,134,44,.3)",fg:B.gold},
  ];

  const statusChips:[string,string][] = [
    ["all","الكل"],["verified","مدفوعة"],["sent","رابط أُرسل"],["failed","فشل الدفع"],["none","لم يُدفع"],
  ];
  const chipStyle=(v:string)=>({padding:"7px 16px",borderRadius:999,fontSize:13,fontWeight:700,cursor:"pointer" as const,border:`1px solid ${statusFilter===v?B.gold:B.border}`,background:statusFilter===v?B.primary:"#fff",color:statusFilter===v?B.gold:B.text2,whiteSpace:"nowrap" as const});

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{background:B.bg}}>
      <PageHeader title="الفواتير" crumb="إدارة الفواتير" search={search} onSearch={setSearch} onMenuOpen={onMenuOpen}/>
      {/* Stats */}
      <div className="px-4 md:px-8 pt-4 md:pt-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {kpis.map(k=>(
            <div key={k.label} className="rounded-2xl px-4 py-4 flex flex-col gap-1"
              style={{background:k.bg,border:`1px solid ${k.br}`,boxShadow:k.fg===B.gold?"0 8px 24px -8px rgba(192,134,44,0.25)":"none"}}>
              <div className="text-xs font-semibold" style={{color:k.fg===B.gold?B.muted:"#7a7168"}}>{k.label}</div>
              <div className="font-extrabold text-2xl leading-tight" style={{color:k.fg,fontFamily:"var(--font-app)"}}>{k.value}</div>
              <div className="text-xs" style={{color:k.fg===B.gold?"#9DBAB6":B.muted}}>{k.sub}</div>
            </div>
          ))}
        </div>
        {/* Filter chips */}
        <div className="flex items-center gap-2 mt-5 flex-wrap">
          {statusChips.map(([v,l])=>(
            <button key={v} style={chipStyle(v)} onClick={()=>setStatusFilter(v as typeof statusFilter)}>{l}</button>
          ))}
          <span className="mr-auto text-sm font-semibold" style={{color:B.muted}}>{filtered.length} / {payments.length}</span>
        </div>
        <div className="mt-4" style={{height:1,background:B.border}}/>
      </div>
      {/* Desktop table */}
      <main className="flex-1 px-4 md:px-8 py-6">
        <div className="hidden md:block rounded-2xl overflow-hidden" style={{background:"#fff",border:`1px solid ${B.border}`}}>
          <div className="overflow-x-auto">
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
              <thead>
                <tr style={{background:B.cream,color:"#7a7168",fontSize:12,textAlign:"right"}}>
                  {["الفاتورة","العميل","الطلب","الباقة","المبلغ","طريقة الدفع","حالة الدفع","إجراء"].map(h=>(
                    <th key={h} style={{padding:"13px 16px",fontWeight:700}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pg.rows.map((p,i)=>{
                  const ps=PAY_STATUS_MAP[p.payStatus];
                  return (
                    <tr key={p.id} style={{borderTop:`1px solid ${B.border}`,background:i%2===0?"#fff":"#FDFCFA"}}>
                      <td style={{padding:"14px 16px",fontWeight:700,fontFamily:"var(--font-app)",color:B.gold,fontSize:13}}>{p.id}</td>
                      <td style={{padding:"14px 16px"}}>
                        <div className="font-bold text-sm" style={{color:B.black}}>{p.clientName}</div>
                        <div className="text-xs font-mono" style={{color:B.muted,direction:"ltr"}}>{p.clientPhone}</div>
                      </td>
                      <td style={{padding:"14px 16px",fontFamily:"var(--font-app)",color:B.text2,fontSize:13}}>{p.bookingId}</td>
                      <td style={{padding:"14px 16px",color:B.text2,fontSize:13}}>{p.packageName}</td>
                      <td style={{padding:"14px 16px",fontWeight:700,color:B.black,fontFamily:"var(--font-app)"}}>{p.total.toLocaleString("en-US")} ر.س</td>
                      <td style={{padding:"14px 16px",color:B.text3}}>{p.payMethod||"—"}</td>
                      <td style={{padding:"14px 16px"}}>
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold" style={{background:ps.bg,color:ps.fg}}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{background:ps.fg}}/>
                          {ps.label}
                        </span>
                      </td>
                      <td style={{padding:"14px 16px"}}>
                        <button onClick={()=>setInvoiceId(p.id)} className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
                          style={{background:B.primary,color:B.cream,border:"none"}}>عرض الفاتورة</button>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length===0&&<tr><td colSpan={8} style={{padding:"48px 16px",textAlign:"center",color:B.muted,fontWeight:600}}>لا توجد فواتير مطابقة</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        {/* Mobile cards */}
        <div className="md:hidden flex flex-col gap-3">
          {pg.rows.map(p=>{
            const ps=PAY_STATUS_MAP[p.payStatus];
            return (
              <motion.div key={p.id} initial={{opacity:0,y:6}} animate={{opacity:1,y:0}}
                className="rounded-2xl p-4" style={{background:"#fff",border:`1px solid ${B.border}`}}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="font-extrabold text-sm" style={{color:B.gold,fontFamily:"var(--font-app)"}}>{p.id}</div>
                    <div className="text-xs" style={{color:B.muted,fontFamily:"var(--font-app)"}}>{p.bookingId}</div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold" style={{background:ps.bg,color:ps.fg}}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{background:ps.fg}}/>{ps.label}
                  </span>
                </div>
                <div className="font-bold text-sm mb-0.5" style={{color:B.black}}>{p.clientName}</div>
                <div className="text-xs mb-3" style={{color:B.muted}}>{p.packageName} · {p.payMethod||"—"}</div>
                <div className="flex items-center justify-between">
                  <div className="font-extrabold" style={{color:B.gold,fontFamily:"var(--font-app)"}}>{p.total.toLocaleString("en-US")} ر.س</div>
                  <button onClick={()=>setInvoiceId(p.id)} className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer" style={{background:B.primary,color:B.cream,border:"none"}}>عرض الفاتورة</button>
                </div>
              </motion.div>
            );
          })}
          {filtered.length===0&&<div className="flex flex-col items-center py-16 rounded-2xl" style={{border:`2px dashed ${B.border}`,color:B.muted}}><CreditCard size={28} style={{opacity:.3,marginBottom:8}}/><p className="text-sm">لا توجد فواتير مطابقة</p></div>}
        </div>
        <Pager p={pg} unit="فاتورة"/>
      </main>
      <AnimatePresence>
        {curInvoice&&<InvoiceModal pay={curInvoice} onClose={()=>setInvoiceId(null)}/>}
      </AnimatePresence>
    </div>
  );
}
