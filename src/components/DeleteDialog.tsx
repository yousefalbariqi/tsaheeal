import { useState } from "react";
import { Archive } from "lucide-react";
import { Button, Modal, ModalIcon, Textarea } from "@/components/ui";

/** الأرشفة هي الإجراء التشغيلي الآمن؛ الحذف النهائي محصور في إجراء الخادم للمدير. */
export function DeleteDialog({onConfirm,onCancel}:{onConfirm:(reason:string)=>void;onCancel:()=>void}) {
  const [reason,setReason] = useState("");
  const ok = !!reason.trim();
  return (
    <Modal open onClose={onCancel} width={440} zIndex={80}
      title="أرشفة السجل"
      sub="سيُخفى السجل من العمل اليومي ويظل محفوظاً في سجل التدقيق."
      icon={<ModalIcon tone="warn"><Archive size={19}/></ModalIcon>}
      footer={<>
        <Button variant="dark" disabled={!ok} onClick={()=>onConfirm(reason.trim())}>أرشفة</Button>
        <Button variant="secondary" onClick={onCancel}>إلغاء</Button>
      </>}>
      <label className="ui-label" htmlFor="archive-reason">سبب الأرشفة<span className="ui-req">*</span></label>
      <Textarea id="archive-reason" value={reason} onChange={e=>setReason(e.target.value)} rows={2}
        placeholder="مثال: سجل مكرر أو لم يعد مستخدماً" style={{resize:"none"}}/>
    </Modal>
  );
}
