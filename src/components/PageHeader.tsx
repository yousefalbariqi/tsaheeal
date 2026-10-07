import type { ReactNode } from "react";
import { Search, Menu, X } from "lucide-react";
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

/* رأس الصفحة — العنوان، البحث، والفعل الأساسي في سطرٍ واحد.

   `actions` موضع الزرّ الأساسي للشاشة («إضافة طلب»): كان ينزل تحت بطاقات
   الأرقام فيختفي عند أول تمرير، والرأس اللاصق فوقه فارغٌ إلا من الجرس.
   `hideSearch` للشاشات التي لا قائمة فيها تُبحث (الرئيسية، الإعدادات) —
   كان حقلها يظهر ولا يفعل شيئاً. والبحث ينزل سطراً على الجوال بدل أن
   يُخفى: الجوال أحوج الشاشات إليه. */
export function PageHeader({title,crumb,search,onSearch,searchPlaceholder,onMenuOpen,actions,hideSearch}:{title:string;crumb:string;search:string;onSearch:(v:string)=>void;searchPlaceholder?:string;onMenuOpen?:()=>void;actions?:ReactNode;hideSearch?:boolean}) {
  const placeholder = searchPlaceholder ?? SEARCH_HINTS[title] ?? `ابحث في ${title}`;
  const field = (
    <div className="ts-search">
      <Search size={16}/>
      <input type="search" value={search} onChange={e=>onSearch(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        className="ui-input" style={{height:40}} enterKeyHint="search"/>
      {search&&<button type="button" onClick={()=>onSearch("")} aria-label="مسح البحث" title="مسح البحث"
        className="ui-iconbtn ui-iconbtn--sm absolute top-1/2 -translate-y-1/2" style={{insetInlineEnd:5}}><X size={14}/></button>}
    </div>
  );
  return (
    <div className="ts-page-head px-4 md:px-8 pt-4 md:pt-5 pb-3 md:pb-4">
      <div className="flex items-center gap-3 md:gap-4">
        {onMenuOpen&&<button onClick={onMenuOpen} aria-label="فتح القائمة" title="فتح القائمة" className="ui-iconbtn ui-iconbtn--outline md:hidden"><Menu size={18}/></button>}
        <div className="min-w-0 flex-shrink-0">
          <div className="hidden sm:block truncate" style={{fontSize:12,color:"var(--k-muted)",lineHeight:1.4,marginBottom:1}}>{crumb}</div>
          <h1 className="ts-page-title truncate">{title}</h1>
        </div>
        <div className="flex-1 min-w-0 flex items-center justify-end gap-2 md:gap-3">
          {!hideSearch&&<div className="hidden sm:block flex-1" style={{maxWidth:380}}>{field}</div>}
          {actions}
          <NotificationsMenu />
        </div>
      </div>
      {!hideSearch&&<div className="sm:hidden mt-3">{field}</div>}
    </div>
  );
}
