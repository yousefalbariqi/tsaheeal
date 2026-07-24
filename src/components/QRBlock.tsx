import { B } from "@/lib/theme";

export function QRBlock({seed,size=96}:{seed:string;size?:number}){
  const n=21;
  let h=2166136261>>>0;
  for(let i=0;i<seed.length;i++){ h^=seed.charCodeAt(i); h=Math.imul(h,16777619)>>>0; }
  const next=()=>{ h=(Math.imul(h,1103515245)+12345)>>>0; return ((h>>>17)&1)===1; };
  const finderPix=(R:number,C:number)=> (R===0||R===6||C===0||C===6)||(R>=2&&R<=4&&C>=2&&C<=4);
  const cells:boolean[]=[];
  for(let r=0;r<n;r++) for(let c=0;c<n;c++){
    let on:boolean;
    if(r<7&&c<7) on=finderPix(r,c);
    else if(r<7&&c>=n-7) on=finderPix(r,c-(n-7));
    else if(r>=n-7&&c<7) on=finderPix(r-(n-7),c);
    else on=next();
    cells.push(on);
  }
  return (
    <div style={{width:size,height:size,display:"grid",gridTemplateColumns:`repeat(${n},1fr)`,background:"#fff",padding:4,border:`1px solid ${B.border}`,borderRadius:10}}>
      {cells.map((v,i)=><span key={i} style={{background:v?B.black:"transparent"}}/>)}
    </div>
  );
}
