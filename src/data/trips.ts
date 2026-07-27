import type { Trip, TripSettings } from "@/types";

export const DEFAULT_TRIP_SETTINGS:TripSettings={allowOnlineBooking:true,manualConfirm:true,waitlistEnabled:false,requirePaymentFirst:true,showTicketAfterConfirm:true,paymentDeadlineHours:24,maxPilgrims:10};

export const SEED_TRIPS: Trip[] = [
  { id:"TRP-001", packageId:"PKG-001", transportId:"TRN-001", hotelId:"HTL-001",
    branchId:"BR-001", busPlate:"أ ب ج 1234", busCode:"1",
    departureDate:"2025-08-07", returnDate:"2025-08-10", departureTime:"22:00",
    departurePoint:"أمام مكتب تساهيل — حي العزيزية، الرياض", departureMapUrl:"",
    seats:49, bookedSeats:32, waitingSeats:0, status:"open", price:300,
    drivers:[{id:"d1",name:"خالد العتيبي",phone:"+966 55 123 4567"}],
    settings:{...DEFAULT_TRIP_SETTINGS} },
  { id:"TRP-002", packageId:"PKG-001", transportId:"TRN-001", hotelId:"HTL-001",
    branchId:"BR-001", busPlate:"أ ب ج 1234", busCode:"1",
    departureDate:"2025-08-14", returnDate:"2025-08-17", departureTime:"22:00",
    departurePoint:"أمام مكتب تساهيل — حي العزيزية، الرياض", departureMapUrl:"",
    seats:49, bookedSeats:49, waitingSeats:3, status:"full", price:300,
    drivers:[{id:"d1",name:"خالد العتيبي",phone:"+966 55 123 4567"},{id:"d2",name:"فيصل المطيري",phone:"+966 55 987 6543"}],
    settings:{...DEFAULT_TRIP_SETTINGS,waitlistEnabled:true} },
  { id:"TRP-003", packageId:"PKG-003", transportId:"TRN-002", hotelId:"HTL-002",
    branchId:"BR-001", busPlate:"د هـ و 5678", busCode:"2",
    departureDate:"2025-08-13", returnDate:"2025-08-18", departureTime:"21:00",
    departurePoint:"ساحة النهضة — الرياض", departureMapUrl:"",
    seats:49, bookedSeats:18, waitingSeats:0, status:"open", price:700,
    drivers:[{id:"d1",name:"سعد القرني",phone:"+966 55 345 6789"}],
    settings:{...DEFAULT_TRIP_SETTINGS} },
  { id:"TRP-004", packageId:"PKG-004", transportId:"TRN-003", hotelId:"HTL-003",
    branchId:"BR-001", busPlate:"ز ح ط 9012", busCode:"3",
    departureDate:"2025-08-20", returnDate:"2025-08-24", departureTime:"20:00",
    departurePoint:"مجمع الملك عبدالله — طريق الملك فهد", departureMapUrl:"",
    seats:30, bookedSeats:11, waitingSeats:0, status:"open", price:1100,
    drivers:[{id:"d1",name:"فهد الشمري",phone:"+966 55 456 7890"}],
    settings:{...DEFAULT_TRIP_SETTINGS,maxPilgrims:6} },
];
