/* حوار إجراءٍ يحتاج سبباً — الإلغاء والاسترجاع.

   السبب إلزاميٌّ لا اختياري، وهذا هو الفرق بين «أُلغيت» و«أُلغيت
   لماذا». فاتورةٌ ملغاة بلا سبب تُثير السؤال نفسه بعد شهر ولا تُجيبه،
   ومن ألغاها لن يتذكّر.

   والتنفيذ يُنتظر ويُبلَّغ عن فشله في مكانه: الحوار يبقى مفتوحاً
   والرسالة تحته، فلا يُغلق على المستخدم وهو يظنّ أن الإجراء تمّ. */
import { useState } from "react";
import { Ban, RotateCcw } from "lucide-react";
import { Field } from "@/components/Field";
import { NumericInput } from "@/components/NumericInput";
import { Button, Input, Modal, ModalIcon, Note, Textarea } from "@/components/ui";
import { sar } from "@/lib/money";
import { useConfirmDiscard } from "@/lib/useUnsavedGuard";

const MIN_REASON = 5;

export interface DocReasonDialogProps {
  title: string;
  confirmLabel: string;
  note?: string;
  tone?: "danger" | "info";
  /** يطلب مبلغاً مع السبب — للاسترجاع. */
  amount?: { max: number; initial?: number };
  /** يطلب مرجع العملية — رقم حوالة الاسترجاع. */
  withRef?: boolean;
  /** يعيد رسالة خطأ عربية، أو null عند النجاح. */
  onConfirm: (reason: string, amount?: number, ref?: string) => Promise<string | null>;
  onCancel: () => void;
}

export function DocReasonDialog(p: DocReasonDialogProps) {
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState(p.amount?.initial ?? p.amount?.max ?? 0);
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const requestClose = useConfirmDiscard({ reason, amount, ref }, p.onCancel);

  const danger = p.tone !== "info";

  const shortReason = reason.trim().length < MIN_REASON;
  const badAmount = !!p.amount && (!(amount > 0) || amount > p.amount.max);
  const blocked = shortReason || badAmount || busy;

  async function submit() {
    if (blocked) return;
    setBusy(true); setErr("");
    const msg = await p.onConfirm(reason.trim(), p.amount ? amount : undefined, ref.trim());
    if (msg) { setErr(msg); setBusy(false); return; }
    /* لا setBusy(false) عند النجاح: المكوّن يُفكَّك، وضبط الحالة بعده
       تحذيرٌ في الطرفية بلا فائدة. */
    p.onCancel();
  }

  /* زرّ التنفيذ أحمر في الحالين: الإلغاء والاسترجاع كلاهما لا يُرجَع عنه —
     مالٌ يخرج أو مستندٌ يسقط. `tone` يميّز الأيقونة وحدها. */
  return (
    <Modal open onClose={requestClose} width={440} title={p.title} sub={p.note}
      icon={<ModalIcon tone={danger ? "danger" : "warn"}>{danger ? <Ban size={19} /> : <RotateCcw size={19} />}</ModalIcon>}
      footer={<>
        <Button variant="danger" loading={busy} disabled={blocked} onClick={submit}>
          {busy ? "جارٍ التنفيذ…" : p.confirmLabel}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={requestClose}>رجوع</Button>
      </>}>
      <div className="flex flex-col gap-4">
        {p.amount && (
          <div>
            <Field label={<>المبلغ<span className="ui-req">*</span></>}
              error={badAmount ? `مبلغ بين 1 و ${sar(p.amount.max)}` : undefined}>
              <NumericInput decimal value={amount}
                onValueChange={v => setAmount(Number(v.replace(",", ".")) || 0)}
                className={`ui-input${badAmount ? " is-invalid" : ""}`}
                style={{ direction: "ltr", textAlign: "end" }} />
            </Field>
          </div>
        )}

        {p.withRef && (
          <div>
            <Field label="مرجع العملية" hint="رقم الحوالة أو مرجع الاسترجاع من البنك — اختياري">
              <Input value={ref} onChange={e => setRef(e.target.value)}
                style={{ direction: "ltr", textAlign: "start" }} />
            </Field>
          </div>
        )}

        <div>
          <Field label={<>السبب<span className="ui-req">*</span></>}
            error={reason && shortReason ? "اكتب سبباً مفهوماً" : undefined}>
            <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
              placeholder="يُطبع على المستند ويبقى في السجلّ"
              invalid={!!reason && shortReason} style={{ resize: "none" }} />
          </Field>
        </div>

        {err && <Note tone="danger">{err}</Note>}
      </div>
    </Modal>
  );
}
