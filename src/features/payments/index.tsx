import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CreditCard, Eye, SearchX } from "lucide-react";
import { B, ELEV, SCRIM, type ToneName } from "@/lib/theme";
import { useDebounced } from "@/lib/useDebounced";
import { useDialogA11y } from "@/lib/useDialogA11y";
import type { Payment, InvoicePhase } from "@/types";
import { invVerifyUrl } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { QRBlock } from "@/components/QRBlock";
import { useStore } from "@/store/useStore";
import { Pager, usePaged, type Paged } from "@/components/Pager";
import { useServerPagedSearch } from "@/lib/useServerSearch";
import { EntityGate, EmptyState } from "@/components/States";
import { OrgCr, OrgVat, OrgAddressLine } from "@/components/OrgLine";
import { zatcaQrPayload, issuedAtIso } from "@/lib/zatca";
import { sar } from "@/lib/money";
import { fmtDateShort } from "@/lib/dates";
import { useRole } from "@/lib/useRole";
import { usePublicSettings } from "@/data/useSettings";
import { DocActions } from "@/features/docs/DocActions";
import { cancelInvoice, refundInvoice } from "@/features/docs/docEvents";
import {
  invoicePhase, INVOICE_PHASE_LABEL, INVOICE_PHASE_TONE,
  vatOf, netOf, docFileName,
} from "@/lib/docPhase";
import { DocReasonDialog } from "@/features/docs/DocReasonDialog";
import { payStatusChips, payStatusLabel } from "@/lib/status";
import { Badge, Button, FilterChips, IconButton, SortTh, useSort, type ChipOption } from "@/components/ui";

/* الصياغة من معجم الحالات — كانت مكتوبةً هنا وحدها فتقول الشريحة
   «لم يُدفع» والبطاقة «لم تُدفع» عن الفاتورة نفسها. واللون من ألوان
   المعنى في اللوحة (TONE) عبر <Badge>، لا أرقاماً تُكتب عند العرض. */
type PayStatus = Payment["payStatus"];
const PAY_TONE: Record<PayStatus, ToneName> = { verified:"success", sent:"info", failed:"danger", none:"neutral" };
const PayBadge = ({status}:{status:PayStatus}) => <Badge dot tone={PAY_TONE[status]}>{payStatusLabel(status)}</Badge>;

/* الطور المشتقّ الذي لا تقوله حالة الدفع: فاتورةٌ «لم تُدفع» قد تكون ملغاةً
   أو مضت رحلتها. يُكتب سطراً ثانياً تحت الشارة — المرشّح يبقى على حالة
   الدفع، والقائمة لا تُخفي أن المستند خرج من الخدمة. */
const DERIVED: ReadonlySet<InvoicePhase> = new Set<InvoicePhase>(["cancelled","refunded","expired","overdue"]);
const derivedPhase = (p:Payment):string|null => {
  const ph = invoicePhase(p);
  return DERIVED.has(ph) ? INVOICE_PHASE_LABEL[ph] : null;
};

/* مفاتيح الفرز — للقائمة المحلية وحدها؛ بحث القاعدة يرتّب صفحته بنفسه. */
type SortKey = "id"|"client"|"pkg"|"total"|"method"|"status"|"issuer";

/** اسم مصدر ثابت من لقطة الإصدار، لا من المستخدم الحالي ولا من صاحب الطلب. */
const invoiceIssuer = (pay: Payment): string => {
  if (!pay.issuedByName) return "سجل سابق — غير موثّق";
  const role = pay.issuedByRole === "موظف" ? "موظف الاستقبال" : (pay.issuedByRole || "الحساب");
  return `${role} – ${pay.issuedByName}`;
};

const SORT_GET: Record<SortKey,(p:Payment)=>string|number|null|undefined> = {
  id: p=>p.id, client: p=>p.clientName, pkg: p=>p.packageName, total: p=>p.total,
  method: p=>p.payMethod, status: p=>payStatusLabel(p.payStatus), issuer: p=>p.issuedByName,
};

/* ─── Payment/invoice shared data + helpers ─── */
export const PAY_ACCOUNT = { org:"مؤسسة تساهيل للعمرة", bank:"مصرف الراجحي", iban:"SA44 8000 0000 6080 1000 0000" };
/* حُذفت TASAHEEL_BRANCHES: كانت ثلاثة فروع مكتوبة في الشفرة (الرياض
   وجدة ومكة) بينما جدول `branches` في القاعدة هو مصدر الفروع الحقيقي،
   ويُدار من شاشة الفروع. مصفوفةٌ ثابتة بجانب جدولٍ حيّ تعني أن مستنداً
   قد يحمل فرعاً لم يعد قائماً، أو يُغفل فرعاً أُضيف. */
/* Deterministic QR-style pattern (visual placeholder, includes finder squares) */
export function InvoiceModal({pay,autoPrint,onClose}:{pay:Payment;autoPrint?:boolean;onClose:()=>void}) {
  const { isAdmin } = useRole();
  const [dialog,setDialog] = useState<"cancel"|"refund"|null>(null);
  /* الطور لا الحالة الخام: «منتهية» و«انتهى الاستحقاق» مشتقّان من
     التاريخ ولا يُخزَّنان (انظر lib/docPhase). */
  const phase = invoicePhase(pay);
  const tone  = INVOICE_PHASE_TONE[phase];
  const vat   = vatOf(pay.total);
  const settings = usePublicSettings();
  /* بيانات الفاتورة لقطة من الحجز؛ نأخذ صاحب الحجز/أول معتمر منها لا من
     ملف حسابٍ حيّ قد تتبدل هويته بعد إصدار المستند. */
  const clientPilgrim = pay.pilgrims?.[0];
  const identityLabel = clientPilgrim?.docType === "iqama" ? "رقم الإقامة"
    : clientPilgrim?.docType === "passport" ? "رقم الجواز"
    : "رقم الهوية";
  /* «فاتورة ضريبية» لا تُكتب إلا إذا كانت المنشأة مسجّلة فعلاً. بلا رقم
     ضريبي هي فاتورة أوّلية — وقولُ غير ذلك مخالفة. */
  const isTaxInvoice = !!settings.vatNumber;
  /* رمز الفاتورة الضريبية بصيغة TLV (المرحلة الأولى من الفوترة
     الإلكترونية) — تقرؤه تطبيقات الهيئة مباشرةً. الفاتورة الأوّلية
     تبقى برمز رابط التحقق كما كانت. */
  const qrValue = isTaxInvoice
    ? zatcaQrPayload({ sellerName: settings.orgName, vatNumber: settings.vatNumber, issuedAt: issuedAtIso(pay.createdAt), grossTotal: pay.total })
    : undefined;

  /* ── لماذا ليست <Modal> المشتركة ──
     قاعدة الطباعة أدناه تُخفي كل شيء وتُثبّت الورقة `position:absolute;
     inset:0` — أي على أقرب سلفٍ متموضع. هنا هو هذه الخلفية الثابتة بعرض
     الصفحة، فتُطبع الورقة بعرضها الكامل. داخل `.ui-modal` (متموضعة،
     `overflow:hidden`، أقصى عرضٍ وارتفاع) كانت ستُحشر في صندوق النافذة
     وتُقصّ عند ارتفاع الشاشة. فالبنية باقية: خلفية ← حاوية ← ورقة، ويُوحَّد
     مظهرها مع النوافذ (لون الخلفية، الظلّ، الزوايا) والحارس نفسه للوحة
     المفاتيح. وبلا `backdrop-filter`: هو يجعل الخلفية مرجعاً لكل `fixed`
     تحتها، وحوار السبب يُركَّب داخلها. */
  const a11y = useDialogA11y({ open:true, onClose });

  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="ts-admin fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-4 overflow-auto" dir="rtl"
      style={{background:SCRIM}}>
      <div ref={a11y.ref} {...a11y.panelProps} aria-label={`فاتورة ${pay.id}`}
        className="w-full max-w-2xl flex flex-col gap-3 my-2 sm:my-4" style={{outline:"none"}} onClick={e=>e.stopPropagation()}>
        <style>{`@media print{ body *{visibility:hidden !important;} #invoice-sheet, #invoice-sheet *{visibility:visible !important;} #invoice-sheet{position:absolute !important;inset:0 !important;margin:0 !important;max-width:none !important;box-shadow:none !important;border-radius:0 !important;} }`}</style>
        {/* شريط الإجراءات — مشترك مع التذكرة (features/docs/DocActions) */}
        <DocActions
          docType="invoice" docId={pay.id} autoPrint={autoPrint}
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
        <div id="invoice-sheet" className="relative overflow-hidden" style={{background:"#fff",borderRadius:20,boxShadow:ELEV[4]}}>
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
          <div className="relative px-8 py-7" style={{background:B.primaryDeep}}>
            <div className="absolute top-0 inset-x-0 h-1.5" style={{background:`linear-gradient(90deg,${B.gold},${B.gold2},${B.gold})`}}/>
            <div className="flex items-start justify-between gap-6">
              <div>
                <div style={{fontFamily:"var(--font-app)",fontSize:22,fontWeight:800,color:"#fff",lineHeight:1.2}}>تساهيل العمرة</div>
                <div style={{fontSize:11,color:B.gold,letterSpacing:3,marginTop:4}}>TASAHEEL AL-UMRAH</div>
                <div className="mt-3 text-xs" style={{color:"#B3A998"}}><OrgCr/></div>
                {settings.vatNumber && (
                  <div className="text-xs" style={{color:"#B3A998"}}><OrgVat/></div>
                )}
                <div className="text-xs" style={{color:"#B3A998"}}><OrgAddressLine/></div>
                <div className="text-xs mt-1.5 font-bold" style={{color:B.gold}}>
                  {isTaxInvoice ? "فاتورة ضريبية مبسّطة" : "فاتورة أولية — غير ضريبية"}
                </div>
              </div>
              <div className="text-left">
                <div className="text-xs font-bold mb-1" style={{color:"#B3A998"}}>فاتورة رقم</div>
                <div style={{fontFamily:"var(--font-app)",fontSize:20,fontWeight:700,color:B.gold}}>{pay.id}</div>
                {/* الرقم التسلسلي المتّصل — شرطٌ في الفاتورة الضريبية. يُعطى في
                    القاعدة عند الإصدار (20260916) ولا يُحسب عند العرض. */}
                {isTaxInvoice&&(
                  <div className="text-xs mt-0.5" style={{color:"#B3A998"}}>
                    الرقم التسلسلي: <span style={{fontFamily:"var(--font-app)",color:"#fff"}}>{pay.serialNo!=null?String(pay.serialNo).padStart(6,"0"):"—"}</span>
                  </div>
                )}
                <div className="text-xs mt-2" style={{color:"#B3A998"}}>تاريخ الإصدار: {pay.createdAt}</div>
                {/* الاستحقاق: «أضف تاريخ ووقت انتهاء رابط الدفع». */}
                {pay.dueAt && phase!=="paid" && (
                  <div className="text-xs mt-0.5" style={{color: phase==="overdue"?"#F0C674":"#B3A998"}}>
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
              {clientPilgrim?.idNumber&&<div className="text-xs mt-1.5" style={{color:B.muted}}>{identityLabel}: <span style={{fontFamily:"var(--font-app)",direction:"ltr",unicodeBidi:"embed"}}>{clientPilgrim.idNumber}</span></div>}
            </div>
            <div className="px-8 py-5">
              <div className="text-xs font-extrabold mb-3" style={{color:B.primary}}>تفاصيل الحجز</div>
              <div className="font-bold text-sm mb-0.5" style={{color:"#000"}}>{pay.packageName}</div>
              <div className="text-xs" style={{color:B.muted}}>رقم الطلب: <span style={{fontFamily:"var(--font-app)"}}>{pay.bookingId}</span></div>
              <div className="text-xs mt-0.5" style={{color:B.muted}}>تاريخ الرحلة: {pay.tripDate}</div>
              {pay.roomType&&<div className="text-xs mt-0.5" style={{color:B.muted}}>نوع السكن: {pay.roomType}</div>}
              <div className="text-xs mt-1.5 font-semibold" style={{color:B.text2}}>مصدر الفاتورة: {invoiceIssuer(pay)}</div>
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
            <div className="mx-8 mb-4 rounded-xl px-4 py-3 grid grid-cols-3 gap-4" style={{background:B.cream,border:`1px solid #EDE4CF`}}>
              <div><div className="text-xs font-semibold mb-0.5" style={{color:B.muted}}>طريقة الدفع</div><div className="font-bold text-sm" style={{color:B.black}}>{pay.payMethod||"—"}</div></div>
              <div><div className="text-xs font-semibold mb-0.5" style={{color:B.muted}}>رقم العملية</div><div className="font-bold text-sm font-mono" style={{color:B.black}}>{pay.txnNo||"—"}</div></div>
              <div><div className="text-xs font-semibold mb-0.5" style={{color:B.muted}}>تاريخ السداد</div><div className="font-bold text-sm" style={{color:B.black}}>{pay.payDate||"—"}</div></div>
            </div>
          )}
          {/* QR: ضريبي (TLV) حين تكون المنشأة مسجّلة، وإلا رابط التحقق. */}
          <div className="mx-8 mb-4 flex items-center gap-3 rounded-xl px-4 py-3" style={{background:"#FBFAF6",border:`1px dashed ${B.border}`}}>
            <QRBlock seed={pay.id} size={68} value={qrValue}/>
            <div>
              {isTaxInvoice ? (
                <>
                  <div className="text-xs font-bold" style={{color:B.black}}>بيانات التحقق الضريبي</div>
                  <div className="text-[11px] leading-relaxed" style={{color:B.muted,maxWidth:360}}>رمز TLV قابل للقراءة بتطبيق الهيئة للتحقق من بيانات الفاتورة.</div>
                  <div className="text-[11px] font-bold mt-1" style={{color:B.gold,fontFamily:"var(--font-app)",direction:"ltr",textAlign:"right"}}>{invVerifyUrl(pay.id)}</div>
                </>
              ) : (
                <>
                  <div className="text-xs font-bold" style={{color:B.black}}>باركود التحقق</div>
                  <div className="text-[11px] leading-relaxed" style={{color:B.muted,maxWidth:360}}>امسحه لعرض معلومات الفاتورة والطلب والتحقق منها.</div>
                  <div className="text-[11px] font-bold mt-1" style={{color:B.gold,fontFamily:"var(--font-app)",direction:"ltr",textAlign:"right"}}>{invVerifyUrl(pay.id)}</div>
                </>
              )}
            </div>
          </div>
          <section className="mx-8 mb-4 rounded-xl px-4 py-3" style={{background:"#FBFAF6",border:`1px solid ${B.border}`}}>
            <h3 className="text-xs font-extrabold mb-2" style={{color:B.primary}}>تنبيهات وسياسات الرحلة</h3>
            <ol className="grid gap-1 pr-4 text-[11px] leading-relaxed" style={{color:B.text2}}>
              <li>لاسترداد قيمة التذكرة أو الاعتذار أو التعديل، يجب تقديم الطلب قبل الرحلة بـ 48 ساعة، ويُخصم 20٪.</li>
              <li>يجب الحضور قبل موعد الرحلة بنصف ساعة في الذهاب والإياب.</li>
              <li>المؤسسة غير مسؤولة عن أغراض المعتمرين المفقودة في الحافلة.</li>
              <li>يُمنع التدخين داخل الحافلة.</li>
              <li>يُمنع النقاش مع السائق، ويلزم التواصل مع المؤسسة عند الحاجة.</li>
            </ol>
          </section>
          {/* Footer */}
          <div className="px-8 py-4 text-center text-xs" style={{color:B.muted,borderTop:`1px solid ${B.border}`}}>
            شكراً لاختياركم تساهيل العمرة — نتمنى لكم رحلة ميسّرة ومباركة
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

  /* الفرز قبل القصّ على صفحات: «أعلى مبلغ» يُبحث عنه في القائمة كلّها لا
     في صفحتها الأولى. */
  const sorter = useSort<Payment,SortKey>(filtered, SORT_GET);

  /* ترقيم الصفحات — الرسم على الصفحة الحالية وحدها. المفتاح يُعيد
     للصفحة الأولى عند تغيّر البحث أو المرشّح: من كان في الصفحة الخامسة
     ثم بحث عن اسم يجب أن يرى أول النتائج لا صفحتها الخامسة. */
  const pg = usePaged(sorter.rows, `${query}|${statusFilter}`);

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

  /* أربع بطاقاتٍ بشكلٍ واحد (StatCard) لا خمسٌ مبنيّة باليد: كانت الأرقام
     ذهبيةً كلّها وبطاقة الإيراد بهالةٍ وحافّة، فلا يبرز منها شيء. عدّ «رابط
     أُرسل» انتقل إلى شريحته تحت — الرقم نفسه لا يُكتب مرّتين — وكل بطاقة
     عدٍّ تُرشِّح القائمة بما تعدّه. */
  const countOf = (k:PayStatus) => payments.filter(p=>p.payStatus===k).length;
  const stats = {
    total: payments.length,
    verified: countOf("verified"),
    failed: countOf("failed"),
    revenue: payments.filter(p=>p.payStatus==="verified").reduce((a,p)=>a+p.total,0),
  };

  const statusChips: ChipOption<typeof statusFilter>[] = payStatusChips(["verified","sent","failed","none"]).map(([v,l])=>({
    value: v as typeof statusFilter, label: l,
    count: v==="all" ? payments.length : countOf(v as PayStatus),
  }));

  const open = (id:string) => setInvoiceId(id);
  const filteredOut = payments.length>0;
  /* رأس العمود يُفرِز القائمة المحلية وحدها: صفحةٌ آتية من القاعدة مرتّبةٌ
     هناك، وفرزُ خمسةٍ وعشرين صفّاً منها يوهم بأنه فرزُ السجلّ كلّه. */
  const Th = ({k,children}:{k:SortKey;children:React.ReactNode}) =>
    srv.supported ? <th>{children}</th> : <SortTh k={k} sorter={sorter}>{children}</SortTh>;

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{background: B.bg}}>
      <PageHeader title="الفواتير" crumb="إدارة الفواتير" search={search} onSearch={setSearch} onMenuOpen={onMenuOpen}/>
      <div className="px-4 md:px-8 pt-1">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="كل الفواتير" value={stats.total} sub="فاتورةٌ لكل طلب" accent onClick={()=>setStatusFilter("all")}/>
          <StatCard label="مدفوعة" value={stats.verified} sub="تم التحصيل" onClick={()=>setStatusFilter("verified")}/>
          <StatCard label="الإيرادات المحصّلة" value={sar(stats.revenue)} sub="من الفواتير المدفوعة"/>
          <StatCard label="فشل الدفع" value={stats.failed} alert sub={stats.failed?"يحتاج متابعة":"لا شيء متعثّر"} onClick={()=>setStatusFilter("failed")}/>
        </div>
        <div className="ts-toolbar">
          <FilterChips label="حالة الدفع" options={statusChips} value={statusFilter} onChange={v=>setStatusFilter(v)}/>
          <span className="ts-toolbar-end ts-count" aria-live="polite">
            {serverSearching?"جارٍ البحث…":activePg.total===payments.length?`${payments.length} فاتورة`:`${activePg.total} من ${payments.length}`}
          </span>
        </div>
      </div>
      <main className="flex-1 px-4 md:px-8 pb-8">
        <EntityGate entity="payments" label="الفواتير" cols={8}>
        {!serverSearching&&activePg.total===0 ? (
          <EmptyState
            icon={filteredOut?<SearchX size={22}/>:<CreditCard size={22}/>}
            title={filteredOut?"لا فواتير تطابق البحث":"لا فواتير بعد"}
            note={filteredOut?"جرّب كلمةً أخرى أو أزل المرشّح.":"تصدر الفاتورة مع الطلب وتظهر هنا."}
            action={filteredOut&&<Button variant="secondary" onClick={()=>{setSearch("");setStatusFilter("all");}}>إزالة المرشّحات</Button>}/>
        ) : <>
        {/* Desktop table */}
        <div className="hidden md:block ui-table-wrap" style={{opacity:serverSearching?0.55:1,transition:"opacity .15s"}}>
          <div className="ui-table-scroll">
            <table className="ui-table" style={{minWidth:900}}>
              <thead>
                <tr>
                  {/* «الطلب» صار سطراً ثانياً تحت الباقة، و«طريقة الدفع» تحت
                      المبلغ: المعلومة باقية، والجدول سبعة أعمدة لا تسعة. */}
                  <Th k="id">الفاتورة</Th>
                  <Th k="client">العميل</Th>
                  <Th k="pkg">الباقة والطلب</Th>
                  <Th k="total">المبلغ</Th>
                  <Th k="status">حالة الدفع</Th>
                  <Th k="issuer">أصدرها</Th>
                  <th className="col-action"><span className="sr-only">إجراء</span></th>
                </tr>
              </thead>
              <tbody>
                {activePg.rows.map(p=>{
                  const derived=derivedPhase(p);
                  return (
                    <tr key={p.id} className="is-clickable" tabIndex={0} aria-label={`عرض الفاتورة ${p.id}`}
                      onClick={()=>open(p.id)}
                      onKeyDown={e=>{ if(e.key==="Enter"&&e.target===e.currentTarget) open(p.id); }}>
                      <td className="nowrap">
                        <div className="cell-main num">{p.id}</div>
                        <div className="cell-sub">{fmtDateShort(p.createdAt)}</div>
                      </td>
                      <td>
                        <div className="cell-main nowrap">{p.clientName}</div>
                        <div className="cell-sub num">{p.clientPhone}</div>
                      </td>
                      <td>
                        <div className="nowrap" style={{color:B.text3}}>{p.packageName}</div>
                        <div className="cell-sub nowrap">الطلب <span className="num">{p.bookingId}</span></div>
                      </td>
                      <td className="nowrap">
                        <div className="cell-main">{sar(p.total)}</div>
                        <div className="cell-sub">{p.payMethod||"—"}</div>
                      </td>
                      <td className="nowrap">
                        <PayBadge status={p.payStatus}/>
                        {derived&&<div className="cell-sub">{derived}</div>}
                      </td>
                      <td className="nowrap" style={{color:B.text2,fontSize:13}}>{invoiceIssuer(p)}</td>
                      <td className="col-action" onClick={e=>e.stopPropagation()}>
                        <div className="row-actions">
                          <IconButton size="sm" label={`عرض الفاتورة ${p.id}`} onClick={()=>open(p.id)}><Eye size={15}/></IconButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {serverSearching&&activePg.rows.length===0&&<tr><td colSpan={7} style={{padding:"48px 16px",textAlign:"center",color:B.muted}}>جارٍ البحث في السجلّ…</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        {/* Mobile cards */}
        <div className="md:hidden flex flex-col gap-2.5" style={{opacity:serverSearching?0.55:1}}>
          {activePg.rows.map(p=>{
            const derived=derivedPhase(p);
            return (
              <div key={p.id} role="button" tabIndex={0} aria-label={`عرض الفاتورة ${p.id}`} onClick={()=>open(p.id)}
                onKeyDown={e=>{ if(e.key==="Enter"&&e.target===e.currentTarget) open(p.id); }}
                className="ui-card ui-card--hover p-4" style={{cursor:"pointer"}}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold truncate" style={{color:B.black,fontSize:15}}>{p.clientName}</div>
                    <div className="text-xs mt-0.5" style={{color:B.muted}}>{p.id} · {fmtDateShort(p.createdAt)}</div>
                  </div>
                  <PayBadge status={p.payStatus}/>
                </div>
                <div className="text-sm mt-3" style={{color:B.text2}}>{p.packageName} · الطلب {p.bookingId}</div>
                <div className="text-xs mt-0.5" style={{color:B.muted}}>
                  أصدرها: {invoiceIssuer(p)}{derived&&` · ${derived}`}
                </div>
                <div className="flex items-center justify-between mt-3 pt-3" style={{borderTop:`1px solid ${B.border}`}}>
                  <div>
                    <span className="font-bold" style={{color:B.black}}>{sar(p.total)}</span>
                    {p.payMethod&&<span className="text-xs ms-2" style={{color:B.muted}}>{p.payMethod}</span>}
                  </div>
                  <span onClick={e=>e.stopPropagation()}>
                    <IconButton size="sm" variant="outline" label={`عرض الفاتورة ${p.id}`} onClick={()=>open(p.id)}><Eye size={15}/></IconButton>
                  </span>
                </div>
              </div>
            );
          })}
          {serverSearching&&activePg.rows.length===0&&<div className="ui-card ui-card--flat text-sm text-center py-12" style={{color:B.muted}}>جارٍ البحث في السجلّ…</div>}
        </div>
        </>}
        </EntityGate>
        <Pager p={activePg} unit="فاتورة"/>
      </main>
      <AnimatePresence>
        {curInvoice&&<InvoiceModal pay={curInvoice} onClose={()=>setInvoiceId(null)}/>}
      </AnimatePresence>
    </div>
  );
}
