import { B } from "@/lib/theme";

export function TasaheelMark({size=42}:{size?:number}) {
  return (
    <div className="relative flex items-center justify-center flex-shrink-0"
      style={{width:size,height:size,background:B.primary,border:"1px solid #3a3128",borderRadius:size*0.25}}>
      <div className="absolute top-0 inset-x-0"
        style={{height:4,background:`linear-gradient(90deg,${B.gold},${B.gold2},${B.gold})`,borderRadius:`${size*0.25}px ${size*0.25}px 0 0`}}/>
      <span style={{fontFamily:"'Noto Kufi Arabic',serif",color:B.cream,fontSize:size*0.28,fontWeight:800,marginTop:3}}>تساهيل</span>
    </div>
  );
}
