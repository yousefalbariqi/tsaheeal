import type { Beneficiary } from "@/types";

export const SEED_BENEFICIARIES: Beneficiary[] = [
  { id:"BEN-001", name:"أحمد محمد العمري",      phone:"0501234567", idNumber:"1234567890", nationality:"سعودي",   gender:"male",   birthDate:"1985-03-15", rating:4, notes:"يفضل السكن الخاص بالدور الأول — لا ينام مبكراً", suspended:false, bookingIds:["TSH-1001"] },
  { id:"BEN-002", name:"سارة عبدالله القحطاني", phone:"0555550012", idNumber:"1098765432", nationality:"سعودية",  gender:"female", birthDate:"1990-01-10", rating:5, notes:"",    suspended:false, bookingIds:["TSH-1002","TSH-1005"] },
  { id:"BEN-003", name:"عبدالله سعد المطيري",   phone:"0533221100", idNumber:"1122334455", nationality:"سعودي",   gender:"male",   birthDate:"1979-11-02", rating:3, notes:"حساس للأصوات — يُفضّل غرفة هادئة", suspended:false, bookingIds:["TSH-1003"] },
  { id:"BEN-004", name:"نورة خالد الدوسري",     phone:"0566778899", idNumber:"2211334455", nationality:"سعودية",  gender:"female", birthDate:"1986-09-30", rating:0, notes:"",    suspended:false, bookingIds:["TSH-1004"] },
  { id:"BEN-005", name:"محمد سعيد الغامدي",     phone:"0599001122", idNumber:"3322114455", nationality:"سعودي",   gender:"male",   birthDate:"1975-02-14", rating:4, notes:"",    suspended:false, bookingIds:["TSH-1005"] },
  { id:"BEN-006", name:"خالد عمر الشهري",       phone:"0561239988", idNumber:"1077882299", nationality:"سعودي",   gender:"male",   birthDate:"1983-04-11", rating:5, notes:"عميل مميز — يحجز سنوياً منذ 2022", suspended:false, bookingIds:["TSH-1006","TSH-1001"] },
  { id:"BEN-007", name:"ماجد فيصل العتيبي",     phone:"0501119977", idNumber:"1055667788", nationality:"سعودي",   gender:"male",   birthDate:"1991-12-05", rating:2, notes:"تأخر في السداد مرتين", suspended:true,  bookingIds:["TSH-1007"] },
];
