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
export function tripDayColor(deps:Trip[]){ if(deps.some(t=>t.status==="open")) return "#1E7A44"; if(deps.some(t=>t.status==="full")) return "#BE2626"; return "#9a9186"; }

export function waNormalize(p:string){ let d=(p||"").replace(/\D/g,""); if(d.startsWith("966"))return d; if(d.startsWith("0"))return "966"+d.slice(1); if(d.startsWith("5"))return "966"+d; return d; }
export function openWhatsApp(phone:string,text:string){ window.open(`https://wa.me/${waNormalize(phone)}?text=${encodeURIComponent(text)}`,"_blank"); }
export function payLinkFor(bookingId:string){ const origin = typeof window!=="undefined" ? window.location.origin : "https://tasaheel.sa"; return `${origin}/pay/${bookingId}`; }
export function invVerifyUrl(invId:string){ return `tasaheel.sa/inv/${invId}/verify`; }
export function copyText(t:string){ try{ navigator.clipboard?.writeText(t); }catch{} }

export function firstTwo(name:string){ const p=name.trim().split(/\s+/).filter(Boolean); return p.slice(0,2).join(" ")||"—"; }
export const genderGlyph=(g:"male"|"female")=>g==="female"?"♀":"♂";
