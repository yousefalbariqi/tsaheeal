import type { ReactNode } from "react";
import { SAR } from "@/lib/money";

/* بطاقة رقمٍ في أعلى الشاشة.

   الرقم أسودُ لا ذهبي: كانت كل أرقام اللوحة ذهبيةً، وكذلك أزرارها وشرائحها
   المحدّدة — فلم يبقَ للذهبي ما يميّزه. الرقم يُقرأ بحجمه لا بلونه.
   `accent` خيطٌ ذهبيّ عند الحافة للبطاقة التي تلخّص الصفّ، و`alert` يحمّر
   الرقم حين يكون الخبر سيّئاً (متأخّرات) وأكبر من صفر.

   والوحدة «ر.س» تُصغَّر بجانب الرقم: كانت بحجمه فتُقرأ «850 ر.س» كتلةً
   واحدة أعرض من بطاقتها. و`onClick` يجعل البطاقة زرّاً — تُرشِّح القائمة
   تحتها بما تعدّه. */
export function StatCard({label,value,sub,accent=false,alert=false,icon,onClick}:{label:string;value:string|number;sub?:string;accent?:boolean;alert?:boolean;icon?:ReactNode;onClick?:()=>void}) {
  const text = typeof value === "number" ? value.toLocaleString("en-US") : value;
  const hasUnit = text.endsWith(` ${SAR}`);
  const num = hasUnit ? text.slice(0, -SAR.length - 1) : text;
  const isAlert = alert && num !== "0";
  const cls = `ts-stat${accent?" is-accent":""}${isAlert?" is-alert":""}`;
  const body = (
    <>
      <div className="ts-stat-label">{icon}<span className="truncate">{label}</span></div>
      <div className="ts-stat-value">{num}{hasUnit&&<span className="ts-stat-unit">{SAR}</span>}</div>
      {sub && <div className="ts-stat-sub">{sub}</div>}
    </>
  );
  return onClick
    ? <button type="button" onClick={onClick} className={cls}>{body}</button>
    : <div className={cls}>{body}</div>;
}
