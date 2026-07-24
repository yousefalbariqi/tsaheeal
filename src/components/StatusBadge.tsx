type StatusEntry = { label: string; bg: string; fg: string };
export const STATUS_MAP: Record<string, StatusEntry> = {
  new:{label:"طلب جديد",bg:"#EAF1FE",fg:"#1E52C7"}, reviewing:{label:"قيد المراجعة",bg:"#FBF3D6",fg:"#8A6A08"},
  needs_edit:{label:"يحتاج تعديل",bg:"#FCEBDD",fg:"#B4530C"}, rejected:{label:"مرفوض",bg:"#FBE6E6",fg:"#BE2626"},
  accepted:{label:"مقبول",bg:"#E0F2FB",fg:"#0E7CA8"}, awaiting_payment:{label:"بانتظار الدفع",bg:"#F1E9FA",fg:"#7226BE"},
  awaiting_trip:{label:"بانتظار رحلة",bg:"#FCEBDD",fg:"#B4530C"}, paid:{label:"تم الدفع",bg:"#DDF3F0",fg:"#0C766B"},
  verifying:{label:"قيد التحقق",bg:"#FCEBDD",fg:"#B4530C"}, verified:{label:"تم التحقق",bg:"#E3F3E8",fg:"#1E7A44"},
  confirmed:{label:"مؤكد",bg:"#E3F3E8",fg:"#1E7A44"}, cancelled:{label:"ملغى",bg:"#EEECEA",fg:"#5C554E"},
  active:{label:"نشط",bg:"#E3F3E8",fg:"#1E7A44"}, inactive:{label:"متوقف",bg:"#EEECEA",fg:"#5C554E"},
  draft:{label:"مسودة",bg:"#FBF3D6",fg:"#8A6A08"}, hidden:{label:"مخفية",bg:"#EEECEA",fg:"#5C554E"},
  suspended:{label:"موقوفة",bg:"#FBE6E6",fg:"#BE2626"}, open:{label:"مفتوحة",bg:"#E3F3E8",fg:"#1E7A44"},
  full:{label:"مكتملة",bg:"#FBE6E6",fg:"#BE2626"}, sent:{label:"تم الإرسال",bg:"#F1E9FA",fg:"#7226BE"},
  archived:{label:"مؤرشفة",bg:"#EEECEA",fg:"#5C554E"}, none:{label:"لا يوجد",bg:"#EEECEA",fg:"#5C554E"},
};

export function StatusBadge({status}:{status:string}) {
  const s = STATUS_MAP[status] ?? STATUS_MAP.inactive;
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap"
      style={{background:s.bg,color:s.fg}}>
      <span className="w-1.5 h-1.5 rounded-full" style={{background:s.fg}}/>
      {s.label}
    </span>
  );
}
