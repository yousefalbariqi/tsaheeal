/* حوار التأكيد بالنداء — بديل window.confirm.

   نافذة المتصفّح الرمادية كانت تظهر عند إغلاق ثمانية نماذج وعند التنقّل
   بمسوّدةٍ غير محفوظة: بخطّ النظام، وبعنوان «127.0.0.1 يقول»، وزرّاها
   «OK / Cancel» بالإنجليزية في لوحةٍ عربية.

   `confirmDialog()` يعيد وعداً بالقرار، فيُنادى من معالج ضغطٍ كما كانت
   تُنادى window.confirm — مع await. و<ConfirmHost/> يُركَّب مرّةً في جذر
   اللوحة ويرسم الحوار القائم. بلا مضيفٍ مركَّب يرجع إلى نافذة المتصفّح:
   سؤالٌ قبيح خيرٌ من مسوّدةٍ تُمحى بلا سؤال. */
import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, HelpCircle } from "lucide-react";
import { Button } from "./Button";
import { Modal, ModalIcon } from "./Modal";

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger يلوّن زرّ التأكيد أحمر — للحذف والإلغاء وفقد المسوّدة. */
  tone?: "default" | "danger";
}

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

let push: ((p: Pending) => void) | null = null;

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  if (!push) {
    const text = typeof options.message === "string" ? `${options.title}\n\n${options.message}` : options.title;
    return Promise.resolve(window.confirm(text));
  }
  return new Promise(resolve => push!({ ...options, resolve }));
}

/** السؤال الموحَّد قبل فقد تغييراتٍ غير محفوظة. */
export const confirmDiscard = () => confirmDialog({
  title: "تجاهل التغييرات؟",
  message: "لديك تغييرات لم تُحفظ. المغادرة الآن تفقدها.",
  confirmLabel: "تجاهل التغييرات",
  cancelLabel: "متابعة التعديل",
  tone: "danger",
});

export function ConfirmHost() {
  const [queue, setQueue] = useState<Pending[]>([]);
  useEffect(() => {
    push = p => setQueue(q => [...q, p]);
    return () => { push = null; };
  }, []);

  const current = queue[0];
  const settle = (ok: boolean) => {
    current?.resolve(ok);
    setQueue(q => q.slice(1));
  };
  const danger = current?.tone === "danger";

  return (
    <Modal open={!!current} onClose={() => settle(false)} width={420} hideClose zIndex={95}
      title={current?.title ?? ""}
      icon={<ModalIcon tone={danger ? "danger" : "gold"}>{danger ? <AlertTriangle size={19} /> : <HelpCircle size={19} />}</ModalIcon>}
      footer={<>
        <Button variant={danger ? "danger" : "primary"} onClick={() => settle(true)}>{current?.confirmLabel ?? "تأكيد"}</Button>
        <Button variant="secondary" onClick={() => settle(false)}>{current?.cancelLabel ?? "إلغاء"}</Button>
      </>}>
      {current?.message && <p className="text-sm" style={{ color: "var(--k-text-2)", lineHeight: 1.8, margin: 0 }}>{current.message}</p>}
    </Modal>
  );
}
