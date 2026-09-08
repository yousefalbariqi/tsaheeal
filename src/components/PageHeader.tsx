import { Search, ChevronRight, Menu } from "lucide-react";
import { B } from "@/lib/theme";
import { NotificationsMenu } from "@/components/NotificationsMenu";

const SEARCH_HINTS: Record<string, string> = {
  "الطلبات": "ابحث برقم الطلب أو اسم العميل أو الجوال",
  "المستفيدون": "ابحث بالاسم أو الجوال أو رقم الهوية",
  "الفواتير": "ابحث برقم الفاتورة أو اسم العميل أو الجوال",
  "التذاكر": "ابحث برقم التذكرة أو اسم العميل أو الجوال",
  "الرحلات": "ابحث برقم الرحلة أو الباقة أو التاريخ",
  "الفنادق": "ابحث باسم الفندق أو المدينة",
  "المواصلات": "ابحث بالاسم أو اللوحة أو المشرف",
  "المستخدمون": "ابحث بالاسم أو البريد الإلكتروني",
  "الفروع": "ابحث باسم الفرع أو المدينة أو الجوال",
};

export function PageHeader({title,crumb,search,onSearch,searchPlaceholder,onMenuOpen}:{title:string;crumb:string;search:string;onSearch:(v:string)=>void;searchPlaceholder?:string;onMenuOpen?:()=>void}) {
  const placeholder = searchPlaceholder ?? SEARCH_HINTS[title] ?? `ابحث في ${title}`;
  return (
    <div className="sticky top-0 z-20 px-4 md:px-8 pt-4 md:pt-6 pb-0" style={{background:B.bg}}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-shrink-0">
          {onMenuOpen&&<button onClick={onMenuOpen} aria-label="فتح القائمة" title="فتح القائمة" className="md:hidden p-2 rounded-xl cursor-pointer flex-shrink-0" style={{background:"#fff",border:`1px solid ${B.border}`}}><Menu size={16} style={{color:B.black}}/></button>}
          <div>
            <div className="flex items-center gap-2 text-xs mb-1" style={{color:B.muted}}>
              <span className="hidden sm:inline">تساهيل العمرة</span>
              <ChevronRight size={12} className="hidden sm:inline"/>
              <span style={{color:B.text2,fontWeight:600}}>{crumb}</span>
            </div>
            <h1 style={{fontFamily:"var(--font-app)",fontSize:22,fontWeight:800,color:B.black,margin:0}}>{title}</h1>
          </div>
        </div>
        <div className="hidden sm:flex flex-1 justify-center px-2">
          <div className="relative w-full" style={{maxWidth:480}}>
            <Search size={15} className="absolute top-1/2 right-3.5 -translate-y-1/2 pointer-events-none" style={{color:B.muted}}/>
            <input value={search} onChange={e=>onSearch(e.target.value)} placeholder={placeholder} aria-label={placeholder}
              className="w-full pr-10 pl-4 py-2.5 rounded-xl text-sm border focus:outline-none"
              style={{borderColor:B.border,background:"#fff",color:B.black,fontFamily:"inherit"}}/>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
          <NotificationsMenu />
        </div>
      </div>
    </div>
  );
}
