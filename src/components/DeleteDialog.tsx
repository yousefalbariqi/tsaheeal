import { motion } from "motion/react";
import { Trash2 } from "lucide-react";
import { B } from "@/lib/theme";

export function DeleteDialog({onConfirm,onCancel}:{onConfirm:()=>void;onCancel:()=>void}) {
  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{background:"rgba(14,12,11,0.78)",backdropFilter:"blur(4px)"}} onClick={onCancel}>
      <motion.div initial={{scale:0.9,opacity:0}} animate={{scale:1,opacity:1}} exit={{scale:0.9,opacity:0}}
        className="rounded-2xl p-7 w-full" style={{maxWidth:360,background:"#fff"}} onClick={e=>e.stopPropagation()}>
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{background:"#FBE6E6"}}>
          <Trash2 size={20} style={{color:"#BE2626"}}/>
        </div>
        <h3 className="text-base font-bold mb-1" style={{color:B.black}}>تأكيد الحذف</h3>
        <p className="text-sm leading-relaxed mb-6" style={{color:B.text2}}>هذا الإجراء نهائي ولا يمكن التراجع عنه.</p>
        <div className="flex gap-2">
          <button onClick={onConfirm} className="flex-1 py-3 rounded-xl text-sm font-bold cursor-pointer"
            style={{background:"#BE2626",color:"#fff",border:"none"}}>نعم، احذف</button>
          <button onClick={onCancel} className="flex-1 py-3 rounded-xl text-sm font-bold cursor-pointer"
            style={{background:B.bg,color:B.text2,border:"none"}}>إلغاء</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
