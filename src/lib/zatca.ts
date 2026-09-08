/* رمز الفاتورة الضريبية المبسّطة — صيغة TLV التي تعتمدها هيئة الزكاة
   والضريبة والجمارك للمرحلة الأولى من الفوترة الإلكترونية.

   خمس وسومٍ متتالية، كلٌّ منها: رقم الوسم (بايت) · طول القيمة (بايت) ·
   القيمة بترميز UTF-8، ثم الكلّ Base64:
     1 اسم البائع · 2 الرقم الضريبي · 3 طابع الوقت (ISO 8601)
     4 الإجمالي شامل الضريبة · 5 مبلغ الضريبة
   تطبيقات المسح الرسمية تقرأ هذا الرمز مباشرةً.

   الضريبة **مستخرَجة** من الإجمالي لا مضافة (قرار ٢٠٢٦-٠٩-٠٦: الأسعار
   شاملة) — انظر lib/docPhase vatOf. */
import { vatOf } from "@/lib/docPhase";

export interface TlvInvoice {
  sellerName: string;
  vatNumber: string;
  /** لحظة الإصدار — ISO 8601. */
  issuedAt: string;
  /** الإجمالي شامل الضريبة. */
  grossTotal: number;
}

const enc = new TextEncoder();

function tlv(tag: number, value: string): Uint8Array {
  const v = enc.encode(value);
  if (v.length > 255) throw new Error(`TLV: القيمة أطول من ٢٥٥ بايت للوسم ${tag}`);
  const out = new Uint8Array(2 + v.length);
  out[0] = tag; out[1] = v.length; out.set(v, 2);
  return out;
}

const money2 = (n: number): string => (Math.round(n * 100) / 100).toFixed(2);

/** يبني حمولة الرمز Base64 — تُمرَّر إلى QRBlock بوسيط value. */
export function zatcaQrPayload(inv: TlvInvoice): string {
  const parts = [
    tlv(1, inv.sellerName.trim() || "—"),
    tlv(2, inv.vatNumber.replace(/\D/g, "")),
    tlv(3, inv.issuedAt),
    tlv(4, money2(inv.grossTotal)),
    tlv(5, money2(vatOf(inv.grossTotal))),
  ];
  const len = parts.reduce((a, p) => a + p.length, 0);
  const buf = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { buf.set(p, o); o += p.length; }
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return btoa(bin);
}

/** الرقم الضريبي السعودي: ١٥ رقماً يبدأ وينتهي بـ3. */
export const isValidVatNumber = (v: string): boolean => /^3\d{13}3$/.test(v.replace(/\D/g, ""));

/** تاريخ إصدارٍ مخزَّن نصّاً (YYYY-MM-DD أو كامل) → ISO 8601 لوسم الوقت. */
export function issuedAtIso(createdAt: string): string {
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(createdAt) ? `${createdAt}T12:00:00+03:00` : createdAt);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}
