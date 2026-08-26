/* مراحل الطلب — من «قيد المراجعة» إلى «التذكرة».

   كان مُعرَّفاً داخل جسم CustomerApp، فيُفكّ ويُركّب مع كل رسم للشاشة:
   انظر التعليق في chrome.tsx. وهو يُعرض داخل قائمة الطلبات، فكل طلب
   نسخة — وكل حرف في أي حقل كان يعيد تركيبها كلها. */
import { memo } from "react";
import { Check } from "lucide-react";
import { C, R, T } from "./tokens";

const TRACK_STEPS = ["stepReview","stepAccepted","stepAwaitPay","stepPaid","stepTicket"];

/* حالات القاعدة تُطوى إلى خمس مراحل مرئية: `new` و`reviewing` مرحلة
   واحدة عند العميل، وكذلك `confirmed` و`verified`. المجهول يعود إلى صفر
   لا إلى -1 حتى لا تظهر كل المراحل غير منجزة لحالة أُضيفت لاحقاً. */
const statusToStep=(s:string):number=>({reviewing:0,new:0,accepted:1,awaiting_payment:2,paid:3,confirmed:4,verified:4}[s] ?? 0);

export const Timeline = memo(function Timeline({ status, t }: {
  status: string;
  t: (k: string) => string;
}) {
  const step=statusToStep(status);
  return (
    <div className="flex flex-col" style={{gap:2}}>
      {TRACK_STEPS.map((s,i)=>{ const done=i<=step, last=i===TRACK_STEPS.length-1; return (
        <div key={s} className="flex" style={{gap:12}}>
          <div className="flex flex-col items-center flex-shrink-0">
            <div className="flex items-center justify-center flex-shrink-0"
              style={{width:26,height:26,borderRadius:R.pill,...T.small,
                background:done?C.green:C.white,border:done?"none":`1px solid ${C.border}`,color:done?C.white:C.ink3}}>
              {done?<Check size={13}/>:i+1}
            </div>
            {/* خط واصل يوضّح أنها مراحل متسلسلة لا قائمة */}
            {!last&&<div style={{width:1,flex:1,minHeight:14,background:i<step?C.green:C.line}}/>}
          </div>
          <span style={{...T.body,paddingBottom:last?0:10,
            color:done?C.ink:C.ink2,fontWeight:i===step?600:400}}>{t(s)}</span>
        </div>
      ); })}
    </div>
  );
});
