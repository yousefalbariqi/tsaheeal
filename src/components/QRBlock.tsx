/* رمز QR حقيقي — كان نمطاً عشوائياً مولَّداً من هاش النص: يشبه رمز QR
   للعين، ولا يقرؤه أي ماسح. العميل يوجّه كاميرته على تذكرته فلا يحدث
   شيء، والموظف على الباب لا يملك طريقة تحقّق.

   القيمة المرمَّزة رابط تحقّق مطلق لا معرّف مجرَّد: الماسح يفتح صفحة،
   والمعرّف وحده يعرض نصّاً لا معنى له. مسار /inv/:id/verify من الموجة ٣
   — حتى يوجد، الرابط يفتح الصفحة الأولى (قاعدة rewrite في vercel.json)
   وهو أفضل من رمز لا يُقرأ.

   التوليد غير متزامن (canvas داخلي في المكتبة) فيمرّ بحالة انتظار. */
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { B } from "@/lib/theme";

/** يبني رابط التحقّق المطلق. window غائب في أي تصيير خارج المتصفح. */
export function verifyUrl(id: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/inv/${encodeURIComponent(id)}/verify`;
}

export function QRBlock({ seed, size = 96, value }: { seed: string; size?: number; value?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const payload = value ?? verifyUrl(seed);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    QRCode.toDataURL(payload, {
      errorCorrectionLevel: "M",
      margin: 1,
      /* ×3 ثم تصغير بالـCSS: الشاشات عالية الكثافة تعرض صورة بحجم
         العنصر بالبكسل المنطقي فتخرج ضبابية، والماسح يفشل عليها. */
      width: size * 3,
      color: { dark: B.black, light: "#FFFFFF" },
    })
      .then((url) => { if (alive) setSrc(url); })
      .catch((e) => { console.error("[QRBlock] تعذّر توليد الرمز:", e); if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [payload, size]);

  const box: React.CSSProperties = {
    width: size, height: size, background: "#fff", padding: 4,
    border: `1px solid ${B.border}`, borderRadius: 10,
    display: "grid", placeItems: "center", overflow: "hidden",
  };

  /* الفشل يُقال ولا يُخفى خلف مربّع فارغ: تذكرةٌ بلا رمز قابل للمسح
     يجب أن يعرفها حاملها قبل أن يقف بها أمام الباب. */
  if (failed) return <div style={{ ...box, fontSize: 10, color: B.text3, textAlign: "center", padding: 6 }}>تعذّر توليد الرمز</div>;
  if (!src) return <div style={box} aria-busy="true" />;

  return (
    <div style={box}>
      <img src={src} alt={`رمز التحقّق ${seed}`} width={size - 8} height={size - 8} style={{ display: "block" }} />
    </div>
  );
}
