import { useState } from "react";
import { motion } from "motion/react";
import { Archive } from "lucide-react";
import { B } from "@/lib/theme";

/** الأرشفة هي الإجراء التشغيلي الآمن؛ الحذف النهائي محصور في إجراء الخادم للمدير. */
export function DeleteDialog({onConfirm,onCancel}:{onConfirm:(reason:string)=>void;onCancel:()=>void}) {
  const [reason,setReason] = useState("");
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{background:"rgba(14,12,11,0.78)",backdropFilter:"blur(4px)"}} onClick={onCancel}>
      <motion.div initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.9,opacity:0}}
        className="rounded-2xl p-7 w-full" style={{maxWidth:360,background:"#fff"}} onClick={e=>e.stopPropagation()}>
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{background:"#FBF3D6"}}>
          <Archive size={20} style={{color:"#8A6A08"}}/>
        </div>
        <h3 className="text-base font-bold mb-1" style={{color:B.black}}>أرشفة السجل</h3>
        <p className="text-sm leading-relaxed mb-4" style={{color:B.text2}}>سيُخفى السجل من العمل اليومي ويظل محفوظًا في سجل التدقيق.</p>
        <label className="block text-xs font-bold mb-1.5" style={{color:B.text3}}>سبب الأرشفة <span style={{color:"#BE2626"}}>*</span></label>
        <textarea value={reason} onChange={e=>setReason(e.target.value)} rows={2} placeholder="مثال: سجل مكرر أو لم يعد مستخدمًا"
          className="w-full rounded-xl border px-3 py-2 text-sm mb-5 resize-none focus:outline-none" style={{borderColor:B.border,fontFamily:"inherit",color:B.black}} />
        <div className="flex gap-2">
          <button onClick={()=>onConfirm(reason.trim())} disabled={!reason.trim()} className="flex-1 py-3 rounded-xl text-sm font-bold cursor-pointer"
            style={{background:"#8A6A08",color:"#fff",border:"none",opacity:reason.trim()?1:.45,cursor:reason.trim()?"pointer":"not-allowed"}}>أرشفة</button>
          <button onClick={onCancel} className="flex-1 py-3 rounded-xl text-sm font-bold cursor-pointer"
            style={{background:B.bg,color:B.text2,border:"none"}}>إلغاء</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
