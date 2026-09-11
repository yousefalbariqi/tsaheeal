/* نافذة تأكيد نقلة الحالة — الأثر قبل الضغطة لا بعدها.

   نصّ الملاحظة: «زر الإلغاء يجب أن يعرض أثر الإلغاء على المقعد والفاتورة
   والدفع والتذكرة قبل التأكيد»، و«زر رفض الطلب يجب أن يطلب سببًا داخليًا
   ورسالة للعميل». وما كان قبلها `window.confirm` بسطرٍ واحد لا يذكر
   المقعد ولا الفاتورة، والرفض بلا سببٍ ولا رسالة إطلاقاً.

   الأثر لا يُكتب هنا: يأتي محسوباً من flow.ts بحسب حال الطلب — طلبٌ بلا
   فاتورة لا يُقال له «تُلغى الفاتورة»، وطلبٌ مدفوع يُقال له صريحاً إن
   المبلغ يحتاج استرداداً يدوياً. النافذة تعرض ما حُسِب لا ما خُمِّن. */
import { useState } from "react";
import { motion } from "motion/react";
import { AlertTriangle, ArrowLeftRight, Check, Phone } from "lucide-react";
import { B } from "@/lib/theme";
import { Spinner } from "@/components/Spinner";
import type { Transition } from "./flow";

export interface TransitionSubmit {
  /** سببٌ داخلي — لا يراه العميل. */
  internalReason: string;
  /** الرسالة المُرسلة للعميل، إن طُلبت. */
  customerMessage: string;
  /** هل يفتح واتساب برسالة العميل بعد التنفيذ؟ */
  notify: boolean;
}

export function ConfirmTransition({ t, booking, busy, onConfirm, onCancel }: {
  t: Transition;
  booking: { id: string; clientName: string };
  busy?: boolean;
  onConfirm: (v: TransitionSubmit) => void;
  onCancel: () => void;
}) {
  const wantsReason = !!t.reason;
  const wantsMessage = t.reason === "reject" || t.reason === "cancel";

  const [internalReason, setInternalReason] = useState("");
  const [customerMessage, setCustomerMessage] = useState(
    t.reason === "reject"
      ? `عزيزنا ${booking.clientName}، نعتذر — لم نتمكن من إتمام طلبكم ${booking.id}.`
      : t.reason === "cancel"
      ? `عزيزنا ${booking.clientName}، تم إلغاء طلبكم ${booking.id}.`
      : "",
  );
  const [notify, setNotify] = useState(true);

  const risky = t.tone === "risk" || t.to === "cancelled" || t.to === "rejected";
  const ready = !busy && (!wantsReason || !!internalReason.trim());

  const accent = risky ? "#BE2626" : t.tone === "ok" ? "#1E7A44" : B.primary;
  const accentBg = risky ? "#FBE6E6" : t.tone === "ok" ? "#E3F3E8" : "#E0F2FB";

  const inp = "w-full rounded-xl border px-3 py-2.5 text-sm resize-none focus:outline-none";
  const ist = { borderColor: B.border, fontFamily: "inherit", color: B.black } as const;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-auto"
      style={{ background: "rgba(14,12,11,0.8)", backdropFilter: "blur(4px)" }} onClick={() => !busy && onCancel()}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        role="dialog" aria-modal="true" aria-label={t.label}
        className="w-full rounded-2xl overflow-hidden my-6" style={{ maxWidth: 460, background: "#fff" }}
        onClick={e => e.stopPropagation()}>

        <div className="px-6 pt-6 pb-4 flex items-start gap-3">
          <span className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: accentBg }}>
            {risky ? <AlertTriangle size={19} style={{ color: accent }} /> : <ArrowLeftRight size={19} style={{ color: accent }} />}
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-bold" style={{ color: B.black, margin: 0 }}>{t.label}</h3>
            <p className="text-xs mt-1" style={{ color: B.muted, margin: 0 }}>
              الطلب <b style={{ color: B.text3, fontFamily: "var(--font-app)" }}>{booking.id}</b> · {booking.clientName}
            </p>
          </div>
        </div>

        {/* الأثر — أهمّ ما في النافذة، فهو أوّل ما يُقرأ */}
        <div className="mx-6 mb-4 rounded-xl px-4 py-3" style={{ background: B.fill, border: `1px solid ${B.border}` }}>
          <div className="text-xs font-bold mb-2" style={{ color: B.text3 }}>ما سيحدث</div>
          <ul className="m-0 ps-4 flex flex-col gap-1.5">
            {t.effects.map(e => (
              <li key={e} className="text-xs leading-relaxed" style={{ color: B.text2 }}>{e}</li>
            ))}
          </ul>
        </div>

        {wantsReason && (
          <div className="px-6 pb-2 flex flex-col gap-3">
            <div>
              <label className="block text-xs font-bold mb-1.5" style={{ color: B.text3 }}>
                السبب الداخلي <span style={{ color: "#BE2626" }}>*</span>
                <span className="font-normal" style={{ color: B.muted }}> — لا يراه العميل</span>
              </label>
              <textarea value={internalReason} onChange={e => setInternalReason(e.target.value)} rows={2}
                placeholder="مثال: تكرار طلب · بيانات هوية غير صحيحة · طلب العميل التأجيل"
                className={inp} style={ist} />
            </div>

            {wantsMessage && (
              <div>
                <label className="block text-xs font-bold mb-1.5" style={{ color: B.text3 }}>
                  رسالة العميل
                  <span className="font-normal" style={{ color: B.muted }}> — تُفتح في واتساب بعد التنفيذ</span>
                </label>
                <textarea value={customerMessage} onChange={e => setCustomerMessage(e.target.value)} rows={3}
                  className={inp} style={ist} />
                <button onClick={() => setNotify(v => !v)} aria-pressed={notify}
                  className="flex items-center gap-2.5 mt-2.5 cursor-pointer" style={{ background: "none", border: "none", padding: 0 }}>
                  <span className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                    style={{ background: notify ? "#25D366" : "#fff", border: `1.5px solid ${notify ? "#25D366" : B.border}`, color: "#fff" }}>
                    {notify && <Check size={13} />}
                  </span>
                  <span className="text-xs font-bold flex items-center gap-1.5" style={{ color: B.text2 }}>
                    <Phone size={12} style={{ color: "#25D366" }} />إبلاغ العميل عبر واتساب
                  </span>
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3 px-6 py-5">
          <button onClick={() => ready && onConfirm({ internalReason: internalReason.trim(), customerMessage: customerMessage.trim(), notify })}
            disabled={!ready}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold"
            style={{ background: risky ? "#BE2626" : B.gold, color: risky ? "#fff" : B.black, border: "none", opacity: ready ? 1 : 0.45, cursor: ready ? "pointer" : "not-allowed" }}>
            {busy && <Spinner size={13} color={risky ? "#fff" : B.black} track={risky ? "rgba(255,255,255,0.3)" : "rgba(27,23,18,0.25)"} />}
            {busy ? "جارٍ التنفيذ…" : t.label}
          </button>
          <button onClick={() => !busy && onCancel()}
            className="px-5 py-3 rounded-xl text-sm font-bold cursor-pointer"
            style={{ background: B.fill, color: B.text2, border: "none" }}>تراجع</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
