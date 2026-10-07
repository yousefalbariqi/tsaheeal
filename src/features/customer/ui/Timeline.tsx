/* مراحل الحجز — من «قيد المراجعة» إلى «التذكرة».

   كان مُعرَّفاً داخل جسم CustomerApp، فيُفكّ ويُركّب مع كل رسم للشاشة:
   انظر التعليق في chrome.tsx. وهو يُعرض داخل قائمة الحجوزات، فكل حجز
   نسخة — وكل حرف في أي حقل كان يعيد تركيبها كلها. */
import { memo } from "react";
import { Check, PencilLine, XCircle, Ban, type LucideIcon } from "lucide-react";
import { TONE, type ToneName } from "@/lib/theme";
import { C, R, T, LTR } from "./tokens";

const TRACK_STEPS = ["stepReview","stepAccepted","stepAwaitPay","stepPaid","stepTicket"];

/* حالات القاعدة تُطوى إلى خمس مراحل مرئية: `new` و`reviewing` مرحلة
   واحدة عند العميل، وكذلك `confirmed` و`verified`. `verifying` دفعٌ وصل
   ويُتحقّق منه، فمرحلته «تم الدفع». المجهول يعود إلى صفر لا إلى -1 حتى
   لا تظهر كل المراحل غير منجزة لحالة أُضيفت لاحقاً. */
const statusToStep=(s:string):number=>({reviewing:0,new:0,accepted:1,awaiting_payment:2,paid:3,verifying:3,confirmed:4,verified:4}[s] ?? 0);

/* ثلاث حالات ليست مراحل في الطريق بل خروجٌ عنه: الحجز الملغى أو المرفوض
   أو الموقوف على تعديل كان يُعرض «قيد المراجعة» (المجهول = صفر)، فينتظر
   صاحبه ردّاً لن يأتي. لكلٍّ منها عرضٌ خاص: شارة وسطر يقول ما العمل. */
const OFF_TRACK: Record<string,{title:string;sub:string;tone:ToneName;Icon:LucideIcon}> = {
  needs_edit:{title:"stNeedsEdit", sub:"stNeedsEditSub", tone:"warn",    Icon:PencilLine},
  rejected:  {title:"stRejected",  sub:"stRejectedSub",  tone:"danger",  Icon:XCircle},
  cancelled: {title:"stCancelled", sub:"stCancelledSub", tone:"neutral", Icon:Ban},
};

/** هل الحالة خارج المسار (ملغى / مرفوض / يحتاج تعديلاً)؟ */
export const isOffTrack=(status:string)=>status in OFF_TRACK;

/** نصّ شارة الحالة ولونها — مصدرٌ واحد للشارة وللخطّ الزمني. */
export function bookingStatusMeta(status:string):{labelKey:string;tone:ToneName}{
  const off=OFF_TRACK[status];
  if(off) return {labelKey:off.title,tone:off.tone};
  const step=statusToStep(status);
  /* المؤكَّد شارةٌ سوداء لا خضراء: اللوحة بلا أخضر، والأسود أقوى ما فيها. */
  if(step===4) return {labelKey:"stConfirmed",tone:"neutral"};
  return {labelKey:TRACK_STEPS[step],tone:step===2?"warn":step===0?"gold":"info"};
}

/** شارة حالة الحجز. */
export function BookingStatusBadge({ status, t }: { status: string; t: (k: string) => string }) {
  const m=bookingStatusMeta(status);
  const tone=m.labelKey==="stConfirmed"?{bg:C.ink,line:C.ink,fg:"#F4EFE4"}:TONE[m.tone];
  return (
    <span className="inline-flex items-center flex-shrink-0"
      style={{height:28,paddingInline:10,borderRadius:R.pill,...T.small,fontSize:13,whiteSpace:"nowrap",
        background:tone.bg,border:`1px solid ${tone.line}`,color:tone.fg}}>
      {t(m.labelKey)}
    </span>
  );
}

export const Timeline = memo(function Timeline({ status, t }: {
  status: string;
  t: (k: string) => string;
}) {
  const off=OFF_TRACK[status];
  if(off){
    const tone=TONE[off.tone];
    return (
      <div className="flex items-start" role="status"
        style={{gap:12,padding:14,borderRadius:R.chip,background:tone.bg,border:`1px solid ${tone.line}`}}>
        <off.Icon size={20} style={{color:tone.fg,flexShrink:0,marginTop:2}}/>
        <div className="flex flex-col" style={{gap:2}}>
          <strong style={{...T.body,fontWeight:600,color:C.ink}}>{t(off.title)}</strong>
          <span style={{...T.meta,color:C.ink2}}>{t(off.sub)}</span>
        </div>
      </div>
    );
  }
  const step=statusToStep(status);
  const lastIdx=TRACK_STEPS.length-1;
  return (
    <ol className="flex flex-col" style={{gap:0,margin:0,padding:0,listStyle:"none"}}>
      {TRACK_STEPS.map((s,i)=>{
        /* المنجزة غير الحالية: «قيد المراجعة» كانت تُعلَّم ✓ وهي جارية.
           الأخيرة وحدها تكتمل بوصولها — التذكرة صدرت. */
        const done=i<step||(i===step&&step===lastIdx);
        const current=i===step&&!done;
        const last=i===lastIdx;
        return (
        <li key={s} className="flex" style={{gap:12}} aria-current={current?"step":undefined}>
          <div className="flex flex-col items-center flex-shrink-0">
            <div className="flex items-center justify-center flex-shrink-0"
              style={{width:26,height:26,borderRadius:R.pill,...T.small,
                background:done?C.ink:current?C.goldTint:C.white,
                border:done?"none":`1.5px solid ${current?C.gold:C.border}`,
                color:done?C.white:current?C.greenDeep:C.ink3}}>
              {done?<Check size={14}/>:current
                ?<span aria-hidden style={{width:8,height:8,borderRadius:"50%",background:C.gold}}/>
                :<span style={LTR}>{i+1}</span>}
            </div>
            {/* خط واصل يوضّح أنها مراحل متسلسلة لا قائمة */}
            {!last&&<div style={{width:1.5,flex:1,minHeight:16,background:i<step?C.ink:C.line}}/>}
          </div>
          <span style={{...T.body,fontSize:15,paddingTop:1,paddingBottom:last?0:12,
            color:done||current?C.ink:C.ink2,fontWeight:current?600:400}}>{t(s)}</span>
        </li>
      ); })}
    </ol>
  );
});
