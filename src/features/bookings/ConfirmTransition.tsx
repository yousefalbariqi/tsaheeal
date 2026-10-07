/* نافذة تأكيد نقلة الحالة — الأثر قبل الضغطة لا بعدها.

   نصّ الملاحظة: «زر الإلغاء يجب أن يعرض أثر الإلغاء على المقعد والفاتورة
   والدفع والتذكرة قبل التأكيد»، و«زر رفض الطلب يجب أن يطلب سببًا داخليًا
   ورسالة للعميل». وما كان قبلها `window.confirm` بسطرٍ واحد لا يذكر
   المقعد ولا الفاتورة، والرفض بلا سببٍ ولا رسالة إطلاقاً.

   الأثر لا يُكتب هنا: يأتي محسوباً من flow.ts بحسب حال الطلب — طلبٌ بلا
   فاتورة لا يُقال له «تُلغى الفاتورة»، وطلبٌ مدفوع يُقال له صريحاً إن
   المبلغ يحتاج استرداداً يدوياً. النافذة تعرض ما حُسِب لا ما خُمِّن. */
import { useId, useState } from "react";
import { AlertTriangle, ArrowLeftRight } from "lucide-react";
import { B } from "@/lib/theme";
import { Button, Modal, ModalIcon, Textarea } from "@/components/ui";
import type { Transition } from "./flow";
import { useConfirmDiscard } from "@/lib/useUnsavedGuard";

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
  const requestClose = useConfirmDiscard({ internalReason, customerMessage, notify }, onCancel);

  const risky = t.tone === "risk" || t.to === "cancelled" || t.to === "rejected";
  const ready = !busy && (!wantsReason || !!internalReason.trim());

  const reasonId = useId();
  const messageId = useId();
  const muted = { color: B.muted, fontWeight: 400 } as const;

  return (
    <Modal open onClose={() => { if (!busy) requestClose(); }} width={480}
      title={t.label}
      sub={<>الطلب <b style={{ color: B.text3, direction: "ltr", unicodeBidi: "isolate" }}>{booking.id}</b> · {booking.clientName}</>}
      icon={<ModalIcon tone={risky ? "danger" : t.tone === "ok" ? "success" : "neutral"}>
        {risky ? <AlertTriangle size={19} /> : <ArrowLeftRight size={19} />}
      </ModalIcon>}
      footer={<>
        <Button variant={risky ? "danger" : "primary"} loading={busy} disabled={!ready}
          onClick={() => ready && onConfirm({ internalReason: internalReason.trim(), customerMessage: customerMessage.trim(), notify })}>
          {busy ? "جارٍ التنفيذ…" : t.label}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={requestClose}>تراجع</Button>
      </>}>
      <div className="flex flex-col gap-4">
        {/* الأثر — أهمّ ما في النافذة، فهو أوّل ما يُقرأ */}
        <div className="rounded-xl px-4 py-3" style={{ background: B.fill, border: `1px solid ${B.border}` }}>
          <div className="text-xs font-bold mb-2" style={{ color: B.text3 }}>ما سيحدث</div>
          <ul className="m-0 p-0 flex flex-col gap-1.5" style={{ listStyle: "none" }}>
            {t.effects.map(e => (
              <li key={e} className="flex items-start gap-2.5 text-sm" style={{ color: B.text2, lineHeight: 1.7 }}>
                <span aria-hidden className="rounded-full flex-shrink-0" style={{ width: 5, height: 5, marginTop: 10, background: B.muted }} />
                <span className="min-w-0">{e}</span>
              </li>
            ))}
          </ul>
        </div>

        {wantsReason && (
          <div>
            <label className="ui-label" htmlFor={reasonId}>
              السبب الداخلي<span className="ui-req">*</span>
              <span style={muted}> — لا يراه العميل</span>
            </label>
            <Textarea id={reasonId} value={internalReason} onChange={e => setInternalReason(e.target.value)} rows={2}
              placeholder="مثال: تكرار طلب · بيانات هوية غير صحيحة · طلب العميل التأجيل" style={{ resize: "none", minHeight: 0 }} />
          </div>
        )}

        {wantsReason && wantsMessage && (
          <div>
            <label className="ui-label" htmlFor={messageId}>
              رسالة العميل
              <span style={muted}> — تُفتح في واتساب بعد التنفيذ</span>
            </label>
            <Textarea id={messageId} value={customerMessage} onChange={e => setCustomerMessage(e.target.value)} rows={3}
              style={{ resize: "none" }} />
            <label className="flex items-center gap-2.5 mt-3 text-sm cursor-pointer" style={{ color: B.text3, fontWeight: 500, width: "fit-content" }}>
              <input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} />
              إبلاغ العميل عبر واتساب
            </label>
          </div>
        )}
      </div>
    </Modal>
  );
}
