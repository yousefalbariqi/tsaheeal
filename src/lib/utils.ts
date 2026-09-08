import type { RoomType } from "@/types";
import { currentPublicSettings } from "@/data/settings";

export function uid() { return Math.random().toString(36).slice(2,9); }
/* كانت هنا دالّة money ثالثة تلصق الوحدة بنفسها ولا يستوردها أحد —
   الاسم يبقى تصديراً لنفس الصياغة الموحَّدة في lib/money. */
export { sar as money } from "@/lib/money";
export function formatKmValue(distanceM:number) {
  const km = distanceM / 1000;
  return km.toFixed(2).replace(/\.0+$/,"").replace(/(\.\d*[1-9])0+$/,"$1");
}
export function parseKmToMeters(value:string) {
  const normalized = value.replace(/,/g,".").trim();
  if (!normalized) return null;
  const km = Number(normalized);
  if (!Number.isFinite(km) || km < 0) return null;
  return Math.round(km * 1000);
}
export function distanceLabel(distanceM:number) { return `${formatKmValue(distanceM)} كم من الحرم`; }
export function minPrice(rooms:RoomType[]) { return rooms.length ? Math.min(...rooms.map(r=>r.pricePerNight)) : null; }

export function parseYMD(s:string){ if(!s) return null; const [y,m,d]=s.split("-").map(Number); if(!y||!m||!d) return null; return {y,m:m-1,d}; }
export function ymd(y:number,m:number,d:number){ return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }
/* تاريخ اليوم بالتوقيت المحلي بصيغة departureDate نفسها (YYYY-MM-DD).
   لا toISOString: هي UTC، فتُقدّم اليوم أو تُأخّره ثلاث ساعات عن الرياض. */
export function todayYMD(){ const n=new Date(); return ymd(n.getFullYear(),n.getMonth(),n.getDate()); }

export function waNormalize(p:string){ let d=(p||"").replace(/\D/g,""); if(d.startsWith("966"))return d; if(d.startsWith("0"))return "966"+d.slice(1); if(d.startsWith("5"))return "966"+d; return d; }
export function openWhatsApp(phone:string,text:string){ window.open(`https://wa.me/${waNormalize(phone)}?text=${encodeURIComponent(text)}`,"_blank"); }

/* ── أصل الروابط العامّة ───────────────────────────────────────────
   كان في النظام ثلاثة نطاقات في ثلاثة ملفّات:

     • الإعدادات        → tasaaheel.sa   (بألفين)
     • invVerifyUrl     → tasaheel.sa    (بألف — مثبَّت في الشفرة)
     • QRBlock.verifyUrl→ window.location.origin

   فالفاتورة تطبع تحت الرمز نطاقاً، والرمز نفسه يرمّز نطاقاً آخر. من
   يمسحه لا يصل حيث يقرأ — وهي ملاحظة الفريق حرفياً. والثلاثة الآن من
   هنا وحدها، فالمطبوع والمرمَّز والمُرسَل واحد أياً كانت القيمة.

   ── لماذا أصل الصفحة أوّلاً لا نطاق الإعدادات ──

   يبدو للوهلة الأولى أن النطاق المضبوط أولى، فهو ما يملك المدير
   تغييره. لكن قيمته الافتراضية اليوم `tasaaheel.sa` بألفين، والفاتورة
   كانت تطبع `tasaheel.sa` بألف — وأيّهما الصحيح لا يعرفه الكود. تقديمُ
   الإعدادات يعني أن رابط دفعٍ يُرسَل لعميلٍ قد يشير إلى نطاقٍ لا وجود
   له، وهو عطبٌ أسوأ من التناقض الذي جئنا نصلحه: التناقض يُربك، والرابط
   الميّت يمنع الدفع.

   وأصل الصفحة لا يكون خاطئاً أبداً لمن ولّده: هو النطاق الذي يعمل عليه
   النظام فعلاً في تلك اللحظة. فيُقدَّم، ويبقى نطاق الإعدادات احتياطاً
   لِما لا متصفّح فيه.

   يبقى وجهُ نقصٍ واحد: موظّفٌ يفتح اللوحة من رابط معاينة (Vercel
   preview) يولّد روابط على نطاق المعاينة. علاجه ليس هنا بل في الموجة ٢
   — الرابط الأساسي يُثبَّت في المستند لحظة إصداره لا لحظة عرضه.
   وحتى تُنفَّذ، أكّد قيمة «النطاق» في الإعدادات فهي ما يُطبع نصّاً. */
export function publicOrigin(): string {
  const here = typeof window !== "undefined" ? window.location : null;
  if (here?.origin) return here.origin;

  /* لقطة متزامنة لا وعد: هذه الدالّة تُنادى داخل JSX وداخل نصّ رسالة
     واتساب — مواضع لا تنتظر. واللقطة تبدأ بالافتراضات فلا تكون فارغة. */
  const domain = currentPublicSettings().domain?.trim();
  if (domain) {
    const bare = domain.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
    if (bare) return `https://${bare}`;
  }
  return "";
}

/** رابط الدفع — الرمز إلزامي فعلياً: بلا `t` تردّ الخادم بـ«رابط غير صالح»
    لأن التحقّق من الملكية يقوم عليه (الرابط يُفتح بلا جلسة). */
export function payLinkFor(bookingId:string,payToken?:string){
  return `${publicOrigin()}/pay/${encodeURIComponent(bookingId)}${payToken?`?t=${encodeURIComponent(payToken)}`:""}`;
}

/** رابط التحقّق من مستند — هو نفسه ما يرمّزه QRBlock، لا نصّاً يشبهه. */
export function invVerifyUrl(invId:string){
  return `${publicOrigin()}/inv/${encodeURIComponent(invId)}/verify`;
}
export function copyText(t:string){ try{ navigator.clipboard?.writeText(t); }catch{} }

export function firstTwo(name:string){ const p=name.trim().split(/\s+/).filter(Boolean); return p.slice(0,2).join(" ")||"—"; }
export const genderGlyph=(g:"male"|"female")=>g==="female"?"♀":"♂";

/* معرّف السجلات الجديدة.

   كان `Date.now()).slice(-4)` في ستة ملفات و`array.length+1` في ثلاثة.
   الأول مداه ١٠٬٠٠٠ قيمة تتكرّر كل عشر ثوانٍ، والثاني يعيد رقماً مستعملاً
   بعد أول حذف. ودوال upsert_* تستخدم `on conflict do update`، فالتصادم
   لا يفشل بل **يدهس سجلاً قائماً بصمت**.

   ٨ محارف من مجال ٣٦ حرفاً ≈ 2.8×10¹² احتمالاً — بلا تصادم عملي. */
export function newId(prefix: string): string {
  const rand = () => Math.random().toString(36).slice(2).toUpperCase();
  let s = "";
  while (s.length < 8) s += rand().replace(/[^0-9A-Z]/g, "");
  return `${prefix}-${s.slice(0, 8)}`;
}
