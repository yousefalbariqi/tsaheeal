export type VehicleMode   = "bus" | "flight";
export type VehicleStatus = "active" | "inactive";
export type RoomKind      = "private" | "shared";
export type MediaKind     = "image" | "video";

export interface HotelFeature { id: string; icon: string; text: string; }
export interface HotelReview  { id: string; name: string; text: string; consent: boolean; image?: string; }
export interface HotelMedia   { id: string; kind: MediaKind; url: string; primary: boolean; category: string; }
export interface RoomType     { id: string; kind: RoomKind; beds: number; pricePerNight: number; photos?: HotelMedia[]; }
export interface Hotel {
  id: string; name: string; city: "مكة" | "المدينة";
  stars: 2 | 3 | 4 | 5; distanceM: number; district: string;
  phone: string; mapUrl: string; status: "active" | "inactive"; notes: string;
  features: HotelFeature[]; roomTypes: RoomType[];
  tasaheelNote: string; reviews: HotelReview[]; media?: HotelMedia[];
}

export interface TransportFeature { id: string; text: string; icon?: string; }
export interface TransportReview  { id: string; name: string; text: string; consent: boolean; image?: string; }
export interface Transport {
  id: string; name: string; mode: VehicleMode;
  vehicleType: string;   // حافلة عادية / حافلة VIP / طيران
  seats: number; seatCost: number;
  model: string; year: string; plate: string;
  driver: string; supervisor: string;
  status: VehicleStatus; notes: string;
  features: TransportFeature[];
  reviews: TransportReview[];
  media?: HotelMedia[];
}

export type PkgStatus = "active" | "draft" | "hidden" | "suspended";
export type PkgDest   = "مكة" | "مكة والمدينة";
export interface ProgramStage { id:string; order:number; icon:string; day:string; time:string; title:string; desc:string; archived?:boolean; }
export interface RoomPrice    { id:string; type:string; persons:number; perNight:number; seatCost?:number; }
export interface PkgReview    { id:string; name:string; text:string; consent:boolean; image?:string; }
export interface PkgFeature   { id:string; icon:string; text:string; }
export interface Pkg {
  id:string; name:string; order:number;
  productType:string; destination:PkgDest; audience:string;
  days:number; nights:number; status:PkgStatus;
  marketPrice:number; seatCostOverride?:number;
  coverImage?:string; gallery?:string[];
  recurring:boolean; recurDay:string; startDate:string;
  transportId:string; hotelId:string;
  features:PkgFeature[]; program:ProgramStage[];
  roomPrices:RoomPrice[]; reviews:PkgReview[]; notes:string;
  policies:string[]; settings?:TripSettings;
}

export interface TripDriver { id:string; name:string; phone:string; }
export type TripStatus = "open"|"full"|"cancelled"|"archived";
export interface TripSettings {
  allowOnlineBooking:boolean;
  manualConfirm:boolean;
  waitlistEnabled:boolean;
  requirePaymentFirst:boolean;
  showTicketAfterConfirm:boolean;
  paymentDeadlineHours:number;
  maxPilgrims:number;
}
export interface Trip {
  id:string; packageId:string; transportId:string; hotelId:string;
  branchId:string;                       // نقطة الانطلاق من الفروع (اختياري القيمة)
  busPlate:string; busCode:string;       // رقم لوحة الباص + الرقم التعريفي الداخلي
  departureDate:string; returnDate:string; departureTime:string;
  departurePoint:string; departureMapUrl:string;
  seats:number; bookedSeats:number; waitingSeats:number;
  status:TripStatus; price:number;
  drivers:TripDriver[];
  settings:TripSettings;
}

export interface Branch {
  id:string; name:string; city:string; address:string;
  gmapUrl:string; phone:string; managerId:string;
  isActive:boolean; createdAt?:string; updatedAt?:string;
}

export interface Beneficiary {
  id:string; name:string; phone:string;
  idNumber:string; nationality:string;
  gender:"male"|"female"; birthDate:string;
  rating:number; notes:string; suspended:boolean;
  bookingIds:string[];
}

export interface Payment {
  id:string; bookingId:string; clientName:string; clientPhone:string;
  packageName:string; tripDate:string;
  total:number; payMethod:string;
  payStatus:"verified"|"sent"|"failed"|"none";
  txnNo:string; payDate:string; createdAt:string;
  pilgrims?:Pilgrim[];
  roomType?:string;
}

export interface Pilgrim { name:string; idNumber:string; nationality:string; gender:"male"|"female"; birthDate:string; phone:string; }
export type BookingStatus = "new"|"reviewing"|"needs_edit"|"rejected"|"accepted"|"awaiting_payment"|"awaiting_trip"|"paid"|"verifying"|"verified"|"confirmed"|"cancelled";
export type PaymentStatus = "none"|"sent"|"failed"|"verified";
export interface Booking {
  id:string; tripId:string; packageId?:string;
  clientName:string; clientPhone:string;
  roomType:string; persons:number;
  total:number; status:BookingStatus;
  paymentStatus:PaymentStatus;
  payMethod?:string; txnNo?:string; payDate?:string;
  seats:number[];
  createdAt:string; staff:string; sentDate:string;
  createdBy?:string;              // id المستخدم المنشئ (حجز داخلي)
  branchId?:string;               // فرع الطلب
  source?:string;                 // public | internal
  pilgrims:Pilgrim[];
}

export interface TicketEntry {
  ticketNo:string; bookingId:string;
  clientName:string; clientPhone:string;
  packageName:string; roomType:string;
  tripDate:string; tripTime:string; departurePoint:string;
  persons:number; pilgrims:Pilgrim[];
  total:number;
}

export type UserRole = "مدير عام"|"مدير النظام"|"موظف";
export interface SystemUser {
  id:string; name:string; email:string;
  role:UserRole; status:"active"|"inactive"; lastLogin:string;
}

export type SupportPriority = "عاجل"|"متوسط"|"منخفض";
export type SupportStatus   = "sent"|"reviewing"|"resolved"|"closed";
export interface SupportReq {
  id:string; category:string; title:string; desc:string;
  priority:SupportPriority; status:SupportStatus; date:string;
}
