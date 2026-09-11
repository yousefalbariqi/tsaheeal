import { B } from "@/lib/theme";

/* بطاقة رقمٍ في أعلى الشاشة.

   كانت `accent` تصبغ البطاقة الأولى بتدرّجٍ أخضر وتترك جاراتها بيضاء،
   فيُقرأ الصفّ صفَّ بطاقاتٍ من نظامين لا صفّاً واحداً. والسطح الملوّن
   كان يسحب العين إلى الخلفية بدل الرقم الذي فيها.

   الآن السطح أبيضُ في كل الحالات والرقمُ ذهبيّ، و`accent` تُبرز بالذهبي
   وحده: حافةٌ علوية وحدٌّ أوضح وهالةٌ خفيفة — تمييزٌ بلا لونِ خلفيةٍ ثانٍ. */
export function StatCard({label,value,sub,accent=false}:{label:string;value:string|number;sub?:string;accent?:boolean}) {
  return (
    <div className="relative flex flex-col gap-1 rounded-2xl px-5 py-4 overflow-hidden"
      style={{
        background:B.surface,
        border:`1px solid ${accent?"rgba(192,134,44,0.45)":B.border}`,
        boxShadow:accent?"0 8px 24px -12px rgba(192,134,44,0.45)":"0 1px 4px rgba(27,23,18,0.05)",
      }}>
      {accent&&<span aria-hidden className="absolute top-0 inset-x-0"
        style={{height:3,background:`linear-gradient(90deg,${B.gold},${B.gold2},${B.gold})`}}/>}
      <div className="text-xs font-semibold" style={{color:B.muted}}>{label}</div>
      <div className="text-3xl font-extrabold" style={{color:B.gold,fontFamily:"var(--font-app)",lineHeight:1}}>{value}</div>
      {sub && <div className="text-xs" style={{color:B.muted}}>{sub}</div>}
    </div>
  );
}
