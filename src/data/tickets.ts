import type { TicketEntry } from "@/types";

export const SEED_TICKETS: TicketEntry[] = [
  { ticketNo:"TKT-001", bookingId:"TSH-1002",
    clientName:"سارة عبدالله القحطاني", clientPhone:"0555550012",
    packageName:"عمرة مكة 3 أيام", roomType:"سكن مشترك",
    tripDate:"2025-07-10", tripTime:"22:00", departurePoint:"الرياض — محطة المسافرين",
    persons:1,
    pilgrims:[{name:"سارة عبدالله القحطاني",idNumber:"1098765432",nationality:"سعودية",gender:"female",birthDate:"1990-01-10",phone:"0555550012"}],
    total:150 },
  { ticketNo:"TKT-002", bookingId:"TSH-1006",
    clientName:"خالد عمر الشهري", clientPhone:"0561239988",
    packageName:"مكة والمدينة 5 أيام", roomType:"غرف خاصة",
    tripDate:"2025-07-13", tripTime:"21:00", departurePoint:"الرياض — محطة المسافرين",
    persons:2,
    pilgrims:[
      {name:"خالد عمر الشهري",   idNumber:"1077882299",nationality:"سعودي",  gender:"male",  birthDate:"1983-04-11",phone:"0561239988"},
      {name:"ريم خالد الشهري",   idNumber:"1077882300",nationality:"سعودية", gender:"female",birthDate:"2015-08-01", phone:""},
    ],
    total:700 },
];
