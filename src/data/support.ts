import type { SupportReq } from "@/types";

export const SEED_SUPPORT: SupportReq[] = [
  { id:"SUP-003", category:"تقني — أخطاء في النظام",  title:"لا تظهر التذاكر بعد تأكيد الحجز", desc:"", priority:"عاجل",  status:"resolved",  date:"2025-06-28" },
  { id:"SUP-002", category:"مالي — فواتير وتحصيل",    title:"مشكلة في ربط بوابة تمارا",         desc:"", priority:"متوسط", status:"reviewing", date:"2025-07-01" },
  { id:"SUP-001", category:"محتوى — تعديل النصوص",    title:"تعديل وصف الباقة VIP",              desc:"", priority:"منخفض", status:"sent",       date:"2025-07-03" },
];
