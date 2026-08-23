/* الدوّارة الحلقية — مؤشر الانتظار داخل الأزرار والمساحات الضيقة.

   كانت هذي الكتلة مكرّرة حرفياً في عشرة مواضع بنفس القيم
   (rotate:360 · duration:0.9 · linear). الشعار المتحرك لا يصلح هنا: رسم
   الخط الكوفي بحجم 15 بكسل يصير لطخة غير مقروءة، ودورته 1.4 ثانية أبطأ
   من أن تُقرأ كـ«جارٍ العمل» داخل زر. */
import { motion } from "motion/react";

export function Spinner({ size = 15, color, track, border = 2 }: {
  size?: number;
  /** لون القوس المتحرك — افتراضياً أسود شبه معتم يصلح على الذهبي. */
  color?: string;
  /** لون الحلقة الخلفية. */
  track?: string;
  border?: number;
}) {
  return (
    <motion.span
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
      style={{
        width: size, height: size,
        border: `${border}px solid ${track ?? "rgba(0,0,0,0.3)"}`,
        borderTopColor: color ?? "#1B1712",
        borderRadius: "50%",
        display: "inline-block",
        flexShrink: 0,
      }}
    />
  );
}
