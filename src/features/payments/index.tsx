import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CreditCard, Phone, Printer } from "lucide-react";
import { B } from "@/lib/theme";
import { useDebounced } from "@/lib/useDebounced";
import type { Payment } from "@/types";
import { openWhatsApp, invVerifyUrl } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { QRBlock } from "@/components/QRBlock";
import { useStore } from "@/store/useStore";
import { Pager, usePaged, type Paged } from "@/components/Pager";
import { useServerPagedSearch } from "@/lib/useServerSearch";
import { EntityGate } from "@/components/States";
import { OrgCr, OrgVat, OrgAddressLine } from "@/components/OrgLine";
import { zatcaQrPayload, issuedAtIso } from "@/lib/zatca";
import { sar } from "@/lib/money";
import { useRole } from "@/lib/useRole";
import { usePublicSettings } from "@/data/useSettings";
import { DocActions } from "@/features/docs/DocActions";
import { cancelInvoice, refundInvoice } from "@/features/docs/docEvents";
import {
  invoicePhase, INVOICE_PHASE_LABEL, INVOICE_PHASE_TONE,
  vatOf, netOf, docFileName,
} from "@/lib/docPhase";
import { DocReasonDialog } from "@/features/docs/DocReasonDialog";
import { payStatusChips, payStatusLabel, payStatusTone } from "@/lib/status";

/* الصياغة واللون من معجم الحالات — كانت مكتوبةً هنا وحدها فتقول
   الشريحة «لم يُدفع» والبطاقة «لم تُدفع» عن الفاتورة نفسها. */
const payChip = (k:string) => ({ label: payStatusLabel(k), ...payStatusTone(k) });

/* ─── Payment/invoice shared data + helpers ─── */
export const PAY_ACCOUNT = { org:"مؤسسة تساهيل للعمرة", bank:"مصرف الراجحي", iban:"SA44 8000 0000 6080 1000 0000" };
/* حُذفت TASAHEEL_BRANCHES: كانت ثلاثة فروع مكتوبة في الشفرة (الرياض
   وجدة ومكة) بينما جدول `branches` في القاعدة هو مصدر الفروع الحقيقي،
   ويُدار من شاشة الفروع. مصفوفةٌ ثابتة بجانب جدولٍ حيّ تعني أن مستنداً
   قد يحمل فرعاً لم يعد قائماً، أو يُغفل فرعاً أُضيف. */
/* Deterministic QR-style pattern (visual placeholder, includes finder squares) */
export function InvoiceModal({pay,onClose}:{pay:Payment;onClose:()=>void}) {
  const { isAdmin } = useRole();
  const [dialog,setDialog] = useState<"cancel"|"refund"|null>(null);
  /* الطور لا الحالة الخام: «منتهية» و«انتهى الاستحقاق» مشتقّان من
     التاريخ ولا يُخزَّنان (انظر lib/docPhase). */
  const phase = invoicePhase(pay);
  const tone  = INVOICE_PHASE_TONE[phase];
  const vat   = vatOf(pay.total);
  const settings = usePublicSettings();
  /* «فاتورة ضريبية» لا تُكتب إلا إذا كانت المنشأة مسجّلة فعلاً. بلا رقم
     ضريبي هي فاتورة أوّلية — وقولُ غير ذلك مخالفة. */
  const isTaxInvoice = !!settings.vatNumber;
  /* رمز الفاتورة الضريبية بصيغة TLV (المرحلة الأولى من الفوترة
     الإلكترونية) — تقرؤه تطبيقات الهيئة مباشرةً. الفاتورة الأوّلية
     تبقى برمز رابط التحقق كما كانت. */
  const qrValue = isTaxInvoice
    ? zatcaQrPayload({ sellerName: settings.orgName, vatNumber: settings.vatNumber, issuedAt: issuedAtIso(pay.createdAt), grossTotal: pay.total })
    : undefined;

  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-auto"
      style={{background:"rgba(21,76,72,.65)"}} onClick={onClose}>
      <div className="w-full max-w-2xl flex flex-col gap-3 my-4" onClick={e=>e.stopPropagation()}>
        <style>{`@media print{ body *{visibility:hidden !important;} #invoice-sheet, #invoice-sheet *{visibility:visible !important;} #invoice-sheet{position:absolute !important;inset:0 !important;margin:0 !important;max-width:none !important;box-shadow:none !important;border-radius:0 !important;} }`}</style>
        {/* شريط الإجراءات — مشترك مع التذكرة (features/docs/DocActions) */}
        <DocActions
          docType="invoice" docId={pay.id}
          fileName={docFileName("invoice", pay.id, pay.clientName)}
          whatsapp={{
            phone: pay.clientPhone,
            text: `مرحباً ${pay.clientName}،\nفاتورة تساهيل العمرة رقم ${pay.id}\nالباقة: ${pay.packageName}\nالإجمالي: ${sar(pay.total)}\nرابط التحقق: ${invVerifyUrl(pay.id)}`,
          }}
          /* الإلغاء والاسترجاع للمدير وحده، ولمستندٍ يقبلهما:
             لا تُلغى فاتورةٌ أُلغيت، ولا يُستردّ ما لم يُدفع. */
          onCancelDoc={isAdmin && pay.state === "issued" ? () => setDialog("cancel") : undefined}
          onRefund={isAdmin && pay.state === "issued" && pay.payStatus === "verified" ? () => setDialog("refund") : undefined}
          onClose={onClose}
        />
        {/* Invoice document */}
        <div id="invoice-sheet" className="relative rounded-2xl overflow-hidden" style={{background:"#fff",boxShadow:"0 24px 64px -12px rgba(21,76,72,.45)"}}>
          {/* الختم يتبع الطور: «ملغاة» و«مُستردّة» أولى بالإعلان من
              «أولية»، وفاتورةٌ ملغاة تُطبع بلا ختمٍ يقول إنها قيد السداد. */}
          {phase!=="paid"&&(
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{zIndex:0}}>
              <span style={{fontSize:78,fontWeight:800,
                color: phase==="cancelled"||phase==="refunded" ? "rgba(190,38,38,.09)" : "rgba(180,83,12,.07)",
                transform:"rotate(-24deg)",whiteSpace:"nowrap",fontFamily:"var(--font-app)"}}>
                {phase==="cancelled" ? "ملغاة" : phase==="refunded" ? "مُستردّة"
                  : phase==="expired" ? "منتهية" : isTaxInvoice ? "غير مسدّدة" : "فاتورة أولية"}
              </span>
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
                <div className="mt-3 text-xs" style={{color:"#9DBAB6"}}><OrgCr/></div>
                {settings.vatNumber && (
                  <div className="text-xs" style={{color:"#9DBAB6"}}><OrgVat/></div>
                )}
                <div className="text-xs" style={{color:"#9DBAB6"}}><OrgAddressLine/></div>
                <div className="text-xs mt-1.5 font-bold" style={{color:B.gold}}>
                  {isTaxInvoice ? "فاتورة ضريبية مبسّطة" : "فاتورة أولية — غير ضريبية"}
                </div>
              </div>
              <div className="text-left">
                <div className="text-xs font-bold mb-1" style={{color:"#9DBAB6"}}>فاتورة رقم</div>
                <div style={{fontFamily:"var(--font-app)",fontSize:20,fontWeight:700,color:B.gold}}>{pay.id}</div>
                {/* الرقم التسلسلي المتّصل — شرطٌ في الفاتورة الضريبية. يُعطى في
                    القاعدة عند الإصدار (20260916) ولا يُحسب عند العرض. */}
                {isTaxInvoice&&(
                  <div className="text-xs mt-0.5" style={{color:"#9DBAB6"}}>
                    الرقم التسلسلي: <span style={{fontFamily:"var(--font-app)",color:"#fff"}}>{pay.serialNo!=null?String(pay.serialNo).padStart(6,"0"):"—"}</span>
                  </div>
                )}
                <div className="text-xs mt-2" style={{color:"#9DBAB6"}}>تاريخ الإصدار: {pay.createdAt}</div>
                {/* الاستحقاق: «أضف تاريخ ووقت انتهاء رابط الدفع». */}
                {pay.dueAt && phase!=="paid" && (
                  <div className="text-xs mt-0.5" style={{color: phase==="overdue"?"#F0C674":"#9DBAB6"}}>
                    {phase==="overdue" ? "انتهى الاستحقاق: " : "يستحق حتى: "}
                    {new Date(pay.dueAt).toISOString().slice(0,16).replace("T"," · ")}
                  </div>
                )}
                <div className="mt-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
                    style={{background:tone.bg,color:tone.fg}}>
                    <span aria-hidden className="w-1.5 h-1.5 rounded-full" style={{background:tone.fg}}/>
                    {INVOICE_PHASE_LABEL[phase]}
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
                {/* ── البنود ──
                    «اعرض بنود السكن والنقل والإضافات والخصم والضريبة بدل
                    بند واحد عام». البنود تأتي من `payment_items` وتُجمع
                    فتساوي الإجمالي بالضبط — القاعدة تضمن ذلك بسطر تسويةٍ
                    ظاهر عند اللزوم. وفاتورةٌ قديمة بلا بنود تعرض سطرها
                    العامّ كما كان، لا فراغاً. */}
                {(pay.items?.length ? pay.items : [{kind:"accommodation" as const,label:`باقة العمرة — ${pay.packageName}`,amount:pay.total}]).map((it,i)=>(
                  <tr key={i} style={{borderBottom:`1px solid ${B.border}`}}>
                    <td style={{padding:"12px 0",color:it.kind==="discount"?"#1E7A44":B.text3}}>
                      {it.label}
                      {it.unitPrice!=null&&it.qty!=null&&(
                        <span style={{color:B.muted,fontSize:12}}>
                          {" "}({sar(it.unitPrice)} × <span style={{fontFamily:"var(--font-app)"}}>{it.qty}</span>)
                        </span>
                      )}
                    </td>
                    <td style={{padding:"12px 0",fontWeight:700,textAlign:"left",fontFamily:"var(--font-app)",
                      color:it.kind==="discount"?"#1E7A44":B.black}}>{sar(it.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Totals: grand / paid / remaining */}
          {(()=>{
            const paid=pay.payStatus==="verified"?pay.total:0;
            const refunded=pay.refundAmount??0;
            const remaining=Math.max(0,pay.total-paid);
            const settled=remaining<=0;
            return (
            <div className="mx-8 mb-5 flex justify-start">
              <div className="flex flex-col gap-2" style={{width:320}}>
                {/* ── الضريبة متضمَّنة لا مضافة ──
                    أسعار تساهيل نهائية شاملة الضريبة (قرار ٢٠٢٦-٠٩-٠٦)،
                    فالسطر يقول «منها» لا «+». والصافي والضريبة يُستخرجان
                    من الإجمالي (×١٥÷١١٥) فيبقى المطلوب من العميل هو
                    الرقم نفسه الذي رآه عند الحجز. */}
                {isTaxInvoice && (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span style={{color:B.text2}}>الإجمالي قبل الضريبة</span>
                      <span style={{fontFamily:"var(--font-app)",color:B.text2}}>{sar(netOf(pay.total))}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span style={{color:B.text2}}>ضريبة القيمة المضافة ١٥٪ (متضمَّنة)</span>
                      <span style={{fontFamily:"var(--font-app)",color:B.text2}}>{sar(vat)}</span>
                    </div>
                    <div style={{height:1,background:B.border}}/>
                  </>
                )}
                <div className="flex items-center justify-between text-sm"><span style={{color:"#000"}}>الإجمالي</span><span className="font-bold" style={{fontFamily:"var(--font-app)",color:"#000"}}>{sar(pay.total)}</span></div>
                <div className="flex items-center justify-between text-sm"><span style={{color:"#000"}}>المدفوع</span><span className="font-bold" style={{fontFamily:"var(--font-app)",color:"#1E7A44"}}>{sar(paid)}</span></div>
                {refunded>0&&(
                  <div className="flex items-center justify-between text-sm">
                    <span style={{color:"#0E7CA8"}}>المُستردّ{pay.refundStatus==="partial"?" (جزئي)":""}</span>
                    <span className="font-bold" style={{fontFamily:"var(--font-app)",color:"#0E7CA8"}}>{sar(refunded)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{background:settled?"#EEECEA":"#FBE6E6",border:`1px solid ${settled?B.border:"#F3C9C9"}`}}>
                  <span className="font-bold text-sm" style={{color:settled?"#5C554E":"#BE2626"}}>المتبقّي</span>
                  <span style={{fontFamily:"var(--font-app)",fontSize:20,fontWeight:800,color:settled?"#5C554E":"#BE2626"}}>{sar(remaining)}</span>
                </div>
              </div>
            </div>
            );
          })()}

          {/* ── الإلغاء والاسترجاع: سببهما مطبوعٌ على الورقة ──
              «لا تحذفها بعد إصدارها» — فالمُلغاة تبقى وتحمل سببها ومتى،
              وإلا صار الإلغاء حذفاً بخطوةٍ إضافية. */}
          {(pay.state==="cancelled"||pay.state==="refunded")&&(
            <div className="mx-8 mb-5 rounded-xl px-5 py-4" style={{background:"#FBE6E6",border:"1px solid #F3C9C9"}}>
              <div className="text-xs font-extrabold mb-1" style={{color:"#BE2626"}}>
                {pay.state==="cancelled"?"فاتورة ملغاة":"فاتورة مُستردّة"}
              </div>
              {pay.cancelReason&&<div className="text-sm" style={{color:B.black}}>{pay.cancelReason}</div>}
              <div className="text-xs mt-1" style={{color:B.muted}}>
                {pay.cancelledAt&&<>بتاريخ {new Date(pay.cancelledAt).toISOString().slice(0,16).replace("T"," · ")}</>}
                {pay.refundAt&&<>استُردّ في {new Date(pay.refundAt).toISOString().slice(0,16).replace("T"," · ")}</>}
                {pay.refundRef&&<> · المرجع: <span style={{fontFamily:"var(--font-app)"}}>{pay.refundRef}</span></>}
              </div>
            </div>
          )}
          {/* Payment info */}
          {pay.payStatus!=="none"&&(
            <div className="mx-8 mb-5 rounded-xl px-5 py-4 grid grid-cols-3 gap-4" style={{background:B.cream,border:`1px solid #EDE4CF`}}>
              <div><div className="text-xs font-semibold mb-0.5" style={{color:B.muted}}>طريقة الدفع</div><div className="font-bold text-sm" style={{color:B.black}}>{pay.payMethod||"—"}</div></div>
              <div><div className="text-xs font-semibold mb-0.5" style={{color:B.muted}}>رقم العملية</div><div className="font-bold text-sm font-mono" style={{color:B.black}}>{pay.txnNo||"—"}</div></div>
              <div><div className="text-xs font-semibold mb-0.5" style={{color:B.muted}}>تاريخ السداد</div><div className="font-bold text-sm" style={{color:B.black}}>{pay.payDate||"—"}</div></div>
            </div>
          )}
          {/* QR: ضريبي (TLV) حين تكون المنشأة مسجّلة، وإلا رابط التحقق. */}
          <div className="mx-8 mb-5 flex items-center gap-4 rounded-xl px-5 py-4" style={{background:"#FBFAF6",border:`1px dashed ${B.border}`}}>
            <QRBlock seed={pay.id} size={92} value={qrValue}/>
            <div>
              {isTaxInvoice ? (
                <>
                  <div className="text-xs font-bold mb-1" style={{color:B.black}}>رمز الفاتورة الضريبية</div>
                  <div className="text-xs leading-relaxed" style={{color:B.muted,maxWidth:260}}>
                    بصيغة الهيئة (TLV): اسم البائع، الرقم الضريبي، وقت الإصدار، الإجمالي، والضريبة. يُقرأ بتطبيق الهيئة.
                  </div>
                  <div className="text-xs font-bold mt-1.5" style={{color:B.gold,fontFamily:"var(--font-app)",direction:"ltr",textAlign:"right"}}>{invVerifyUrl(pay.id)}</div>
                </>
              ) : (
                <>
                  <div className="text-xs font-bold mb-1" style={{color:B.black}}>امسح باركود التحقق</div>
                  <div className="text-xs leading-relaxed" style={{color:B.muted,maxWidth:250}}>ينقلك إلى صفحة التحقق الرسمية لعرض معلومات الفاتورة والطلب.</div>
                  <div className="text-xs font-bold mt-1.5" style={{color:B.gold,fontFamily:"var(--font-app)",direction:"ltr",textAlign:"right"}}>{invVerifyUrl(pay.id)}</div>
                </>
              )}
            </div>
          </div>
          {/* Footer */}
          <div className="px-8 py-4 text-center text-xs" style={{color:B.muted,borderTop:`1px solid ${B.border}`}}>
            شكراً لاختياركم تساهيل العمرة — نسأل الله أن يتقبّل منكم ويُيسّر أداء مناسككم
          </div>
          </div>
        </div>
      </div>

      {dialog==="cancel"&&(
        <DocReasonDialog
          title="إلغاء الفاتورة" confirmLabel="إلغاء الفاتورة" tone="danger"
          note={`الفاتورة ${pay.id} تبقى في السجلّ ولا تُحذف — يُسجَّل عليها سبب الإلغاء ووقته.`}
          onCancel={()=>setDialog(null)}
          onConfirm={reason=>cancelInvoice(pay.id,reason)}
        />
      )}
      {dialog==="refund"&&(
        <DocReasonDialog
          title="استرجاع مبلغ" confirmLabel="تسجيل الاسترجاع" tone="info"
          note={`إجمالي الفاتورة ${sar(pay.total)}. لا يتجاوز الاسترجاع هذا المبلغ.`}
          amount={{ max: pay.total, initial: pay.total }}
          withRef
          onCancel={()=>setDialog(null)}
          onConfirm={(reason,amount,ref)=>refundInvoice(pay.id,amount??0,ref??"",reason)}
        />
      )}
    </motion.div>
  );
}

export function PaymentsPage({onMenuOpen}:{onMenuOpen?:()=>void}) {
  const payments=useStore(s=>s.payments);
  const [search,setSearch]=useState("");
  /* التصفية على القيمة الساكنة لا على كل ضغطة مفتاح. */
  const query = useDebounced(search);
  const [statusFilter,setStatusFilter]=useState<"all"|"verified"|"sent"|"failed"|"none">("all");
  const [invoiceId,setInvoiceId]=useState<string|null>(null);

  const curInvoice = invoiceId ? payments.find(p=>p.id===invoiceId) : null;

  const filtered = payments.filter(p=>
    (statusFilter==="all"||p.payStatus===statusFilter)&&
    (!query||(p.id+p.bookingId+p.clientName+p.clientPhone).toLowerCase().includes(query.toLowerCase()))
  );

  /* ترقيم الصفحات — الرسم على الصفحة الحالية وحدها. المفتاح يُعيد
     للصفحة الأولى عند تغيّر البحث أو المرشّح: من كان في الصفحة الخامسة
     ثم بحث عن اسم يجب أن يرى أول النتائج لا صفحتها الخامسة. */
  const pg = usePaged(filtered, `${query}|${statusFilter}`);

  /* في Supabase لا نبحث في العناصر المحمّلة: admin_search_payments تفلتر
     وتُرقّم في PostgreSQL — الاسم والجوال ورقم الفاتورة/الطلب والباقة —
     ومرشّح الحالة يُمرَّر إليها. وإن غاب الإجراء (ترحيلٌ لم يُشغَّل)
     تُطفئ الدالة نفسها وتبقى التصفية المحلية أعلاه. */
  const srv = useServerPagedSearch<Payment>({
    fn: "admin_search_payments",
    args: { q: search, status_filter: statusFilter === "all" ? null : statusFilter },
    resetKey: `${search}|${statusFilter}`,
    all: payments, idOf: p => p.id, idField: "payment_id",
  });
  const serverSearching = srv.searching;
  const activePg: Paged<Payment> = srv.supported ? srv.paged : pg;

  const kpis = [
    {label:"إجمالي الفواتير",        value:payments.length,          sub:"كل الطلبات",        bg:"#fff",   br:B.border,    fg:B.black},
    {label:"مدفوعة",                  value:payments.filter(p=>p.payStatus==="verified").length, sub:"تم التحصيل",  bg:"#E3F3E8",br:"#C4E4CE", fg:"#1E7A44"},
    {label:"رابط أُرسل",             value:payments.filter(p=>p.payStatus==="sent").length,     sub:"بانتظار الدفع",bg:"#F1E9FA",br:"#D8BBFA",fg:"#7226BE"},
    {label:"فشل الدفع",              value:payments.filter(p=>p.payStatus==="failed").length,   sub:"يحتاج متابعة",bg:"#FBE6E6",br:"#F3C9C9",fg:"#BE2626"},
    {label:"الإيرادات المُحصّلة",    value:sar(payments.filter(p=>p.payStatus==="verified").reduce((a,p)=>a+p.total,0)), sub:"تم استلامها",bg:`linear-gradient(135deg,${B.primary},${B.primaryDeep})`,br:"rgba(192,134,44,.3)",fg:B.gold},
  ];

  const statusChips = payStatusChips(["verified","sent","failed","none"]);
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
          <span className="mr-auto text-sm font-semibold" style={{color:B.muted}}>{serverSearching?"جارِ البحث…":`${activePg.total} / ${payments.length}`}</span>
        </div>
        <div className="mt-4" style={{height:1,background:B.border}}/>
      </div>
      {/* Desktop table */}
      <main className="flex-1 px-4 md:px-8 py-6">
        <EntityGate entity="payments" label="الفواتير" cols={8}>
        <div className="hidden md:block rounded-2xl overflow-hidden" style={{background:"#fff",border:`1px solid ${B.border}`}}>
          <div className="tbl-scroll tbl-wide">
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
              <thead>
                <tr style={{background:B.cream,color:"#7a7168",fontSize:12,textAlign:"right"}}>
                  {["الفاتورة","العميل","الطلب","الباقة","المبلغ","طريقة الدفع","حالة الدفع","إجراء"].map(h=>(
                    <th key={h} className={h==="إجراء"||h==="إجراءات"?"col-action":undefined} style={{padding:"13px 16px",fontWeight:700}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activePg.rows.map((p,i)=>{
                  const ps=payChip(p.payStatus);
                  return (
                    <tr key={p.id} style={{borderTop:`1px solid ${B.border}`,background:i%2===0?"#fff":"#FDFCFA"}}>
                      <td style={{padding:"14px 16px",fontWeight:700,fontFamily:"var(--font-app)",color:B.gold,fontSize:13}}>{p.id}</td>
                      <td style={{padding:"14px 16px"}}>
                        <div className="font-bold text-sm" style={{color:B.black}}>{p.clientName}</div>
                        <div className="text-xs font-mono" style={{color:B.muted,direction:"ltr"}}>{p.clientPhone}</div>
                      </td>
                      <td style={{padding:"14px 16px",fontFamily:"var(--font-app)",color:B.text2,fontSize:13}}>{p.bookingId}</td>
                      <td style={{padding:"14px 16px",color:B.text2,fontSize:13}}>{p.packageName}</td>
                      <td style={{padding:"14px 16px",fontWeight:700,color:B.black,fontFamily:"var(--font-app)"}}>{sar(p.total)}</td>
                      <td style={{padding:"14px 16px",color:B.text3}}>{p.payMethod||"—"}</td>
                      <td style={{padding:"14px 16px"}}>
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold" style={{background:ps.bg,color:ps.fg}}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{background:ps.fg}}/>
                          {ps.label}
                        </span>
                      </td>
                      <td className="col-action" style={{padding:"14px 16px"}}>
                        <button onClick={()=>setInvoiceId(p.id)} className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
                          style={{background:B.primary,color:B.cream,border:"none"}}>عرض الفاتورة</button>
                      </td>
                    </tr>
                  );
                })}
                {serverSearching&&<tr><td colSpan={8} style={{padding:"48px 16px",textAlign:"center",color:B.muted,fontWeight:600}}>جارِ البحث في السجل…</td></tr>}
                {!serverSearching&&activePg.total===0&&<tr><td colSpan={8} style={{padding:"48px 16px",textAlign:"center",color:B.muted,fontWeight:600}}>لا توجد فواتير مطابقة</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        {/* Mobile cards */}
        <div className="md:hidden flex flex-col gap-3">
          {activePg.rows.map(p=>{
            const ps=payChip(p.payStatus);
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
                  <div className="font-extrabold" style={{color:B.gold,fontFamily:"var(--font-app)"}}>{sar(p.total)}</div>
                  <button onClick={()=>setInvoiceId(p.id)} className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer" style={{background:B.primary,color:B.cream,border:"none"}}>عرض الفاتورة</button>
                </div>
              </motion.div>
            );
          })}
          {serverSearching&&<div className="flex flex-col items-center py-16 rounded-2xl" style={{border:`2px dashed ${B.border}`,color:B.muted}}><span className="text-sm font-medium">جارِ البحث في السجل…</span></div>}
          {!serverSearching&&activePg.total===0&&<div className="flex flex-col items-center py-16 rounded-2xl" style={{border:`2px dashed ${B.border}`,color:B.muted}}><CreditCard size={28} style={{opacity:.3,marginBottom:8}}/><p className="text-sm">لا توجد فواتير مطابقة</p></div>}
        </div>
        </EntityGate>
        <Pager p={activePg} unit="فاتورة"/>
      </main>
      <AnimatePresence>
        {curInvoice&&<InvoiceModal pay={curInvoice} onClose={()=>setInvoiceId(null)}/>}
      </AnimatePresence>
    </div>
  );
}
