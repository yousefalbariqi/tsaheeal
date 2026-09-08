/* حوار إجراءٍ يحتاج سبباً — الإلغاء والاسترجاع.

   السبب إلزاميٌّ لا اختياري، وهذا هو الفرق بين «أُلغيت» و«أُلغيت
   لماذا». فاتورةٌ ملغاة بلا سبب تُثير السؤال نفسه بعد شهر ولا تُجيبه،
   ومن ألغاها لن يتذكّر.

   والتنفيذ يُنتظر ويُبلَّغ عن فشله في مكانه: الحوار يبقى مفتوحاً
   والرسالة تحته، فلا يُغلق على المستخدم وهو يظنّ أن الإجراء تمّ. */
import { useState } from "react";
import { motion } from "motion/react";
import { X } from "lucide-react";
import { B } from "@/lib/theme";
import { Spinner } from "@/components/Spinner";
import { Field } from "@/components/Field";
import { NumericInput } from "@/components/NumericInput";
import { sar } from "@/lib/money";

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

  const danger = p.tone !== "info";
  const accent = danger ? "#BE2626" : "#0E7CA8";

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

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(21,76,72,.6)" }}
      onClick={e => { e.stopPropagation(); p.onCancel(); }}>
      <motion.div initial={{ scale: .96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: "#fff" }} onClick={e => e.stopPropagation()}>

        <div className="relative px-6 py-5" style={{ background: B.primary }}>
          <div className="absolute top-0 inset-x-0 h-1" style={{ background: accent }} />
          <h3 className="font-extrabold text-base" style={{ color: "#fff", margin: 0 }}>{p.title}</h3>
          <button onClick={p.onCancel} aria-label="إغلاق"
            className="absolute top-4 left-4 p-1 cursor-pointer"
            style={{ background: "none", border: "none", color: "#9DBAB6" }}><X size={16} /></button>
        </div>

        <div className="p-6 flex flex-col gap-4">
          {p.note && <p className="text-xs leading-relaxed m-0" style={{ color: B.muted }}>{p.note}</p>}

          {p.amount && (
            <Field label="المبلغ"
              error={badAmount ? `مبلغ بين 1 و ${sar(p.amount.max)}` : undefined}>
              <NumericInput decimal value={amount}
                onValueChange={v => setAmount(Number(v.replace(",", ".")) || 0)}
                className="w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none"
                style={{ borderColor: badAmount ? "#BE2626" : B.border, direction: "ltr", textAlign: "right" }} />
            </Field>
          )}

          {p.withRef && (
            <Field label="مرجع العملية" hint="رقم الحوالة أو مرجع الاسترجاع من البنك — اختياري">
              <input value={ref} onChange={e => setRef(e.target.value)}
                className="w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none"
                style={{ borderColor: B.border, direction: "ltr", textAlign: "left" }} />
            </Field>
          )}

          <Field label="السبب" error={reason && shortReason ? "اكتب سبباً مفهوماً" : undefined}>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
              placeholder="يُطبع على المستند ويبقى في السجلّ"
              className="w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none resize-none"
              style={{ borderColor: reason && shortReason ? "#BE2626" : B.border, fontFamily: "inherit" }} />
          </Field>

          {err && (
            <div className="text-xs font-bold rounded-lg px-3 py-2"
              style={{ background: "#FBE6E6", color: "#BE2626", border: "1px solid #F3C9C9" }}>{err}</div>
          )}

          <div className="flex gap-3">
            <button onClick={submit} disabled={blocked}
              className="px-5 py-2.5 rounded-xl font-extrabold text-sm inline-flex items-center gap-2"
              style={{
                background: blocked ? "#EEECEA" : accent, color: blocked ? B.muted : "#fff",
                border: "none", cursor: blocked ? "not-allowed" : "pointer",
              }}>
              {busy && <Spinner size={14} color="#fff" />}
              {busy ? "جارٍ التنفيذ…" : p.confirmLabel}
            </button>
            <button onClick={p.onCancel} disabled={busy}
              className="px-5 py-2.5 rounded-xl font-bold text-sm cursor-pointer"
              style={{ background: B.bg, color: B.text2, border: "none" }}>رجوع</button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
