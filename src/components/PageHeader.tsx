import { BellRing, Search, ChevronRight, Menu } from "lucide-react";
import { B } from "@/lib/theme";

export function PageHeader({title,crumb,search,onSearch,notification=3,onMenuOpen}:{title:string;crumb:string;search:string;onSearch:(v:string)=>void;notification?:number;onMenuOpen?:()=>void}) {
  return (
    <div className="sticky top-0 z-20 px-4 md:px-8 pt-4 md:pt-6 pb-0" style={{background:B.bg}}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-shrink-0">
          {onMenuOpen&&<button onClick={onMenuOpen} className="md:hidden p-2 rounded-xl cursor-pointer flex-shrink-0" style={{background:"#fff",border:`1px solid ${B.border}`}}><Menu size={16} style={{color:B.black}}/></button>}
          <div>
            <div className="flex items-center gap-2 text-xs mb-1" style={{color:B.muted}}>
              <span className="hidden sm:inline">تساهيل العمرة</span>
              <ChevronRight size={12} className="hidden sm:inline"/>
              <span style={{color:B.text2,fontWeight:600}}>{crumb}</span>
            </div>
            <h1 style={{fontFamily:"'Noto Kufi Arabic',serif",fontSize:22,fontWeight:800,color:B.black,margin:0}}>{title}</h1>
          </div>
        </div>
        <div className="hidden sm:flex flex-1 justify-center px-2">
          <div className="relative w-full" style={{maxWidth:480}}>
            <Search size={15} className="absolute top-1/2 right-3.5 -translate-y-1/2 pointer-events-none" style={{color:B.muted}}/>
            <input value={search} onChange={e=>onSearch(e.target.value)} placeholder="بحث..."
              className="w-full pr-10 pl-4 py-2.5 rounded-xl text-sm border focus:outline-none"
              style={{borderColor:B.border,background:"#fff",color:B.black,fontFamily:"inherit"}}/>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
          <div className="relative w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer"
            style={{background:B.primary}}>
            <BellRing size={15} style={{color:B.gold}}/>
            {notification>0 && <span className="absolute -top-1 -left-1 w-4 h-4 rounded-full flex items-center justify-center font-bold"
              style={{background:B.gold,color:B.black,fontSize:9}}>{notification}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
