import { B } from "@/lib/theme";

export function TasaheelMark({size=42}:{size?:number}) {
  return (
    <div className="relative flex items-center justify-center flex-shrink-0"
      style={{width:size,height:size,background:B.primary,border:"1px solid #3a3128",borderRadius:size*0.25,overflow:"hidden"}}>
      <div className="absolute top-0 inset-x-0"
        style={{height:Math.max(3,size*0.075),background:`linear-gradient(90deg,${B.gold},${B.gold2},${B.gold})`}}/>
      {/* النسبة 0.22: كلمة «تساهيل» بخط الكوفي أعرض من مربّعها عند 0.28 فكانت تُقصّ */}
      <span style={{fontFamily:"'Noto Kufi Arabic',serif",color:B.cream,fontSize:size*0.22,fontWeight:800,marginTop:size*0.07,whiteSpace:"nowrap"}}>تساهيل</span>
    </div>
  );
}
