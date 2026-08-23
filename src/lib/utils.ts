import type { RoomType, Trip } from "@/types";

export function uid() { return Math.random().toString(36).slice(2,9); }
export function money(n:number) { return n.toLocaleString("en-US") + " ر.س"; }
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
export function tripDayColor(deps:Trip[]){ if(deps.some(t=>t.status==="open")) return "#1E7A44"; if(deps.some(t=>t.status==="full")) return "#BE2626"; return "#9a9186"; }

export function waNormalize(p:string){ let d=(p||"").replace(/\D/g,""); if(d.startsWith("966"))return d; if(d.startsWith("0"))return "966"+d.slice(1); if(d.startsWith("5"))return "966"+d; return d; }
export function openWhatsApp(phone:string,text:string){ window.open(`https://wa.me/${waNormalize(phone)}?text=${encodeURIComponent(text)}`,"_blank"); }
/** رابط الدفع — الرمز إلزامي فعلياً: بلا `t` تردّ الخادم بـ«رابط غير صالح»
    لأن التحقّق من الملكية يقوم عليه (الرابط يُفتح بلا جلسة). */
export function payLinkFor(bookingId:string,payToken?:string){
  const origin = typeof window!=="undefined" ? window.location.origin : "https://tasaheel.sa";
  return `${origin}/pay/${bookingId}${payToken?`?t=${payToken}`:""}`;
}
export function invVerifyUrl(invId:string){ return `tasaheel.sa/inv/${invId}/verify`; }
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
