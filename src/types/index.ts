export type VehicleMode   = "bus" | "flight";
/* المواصلة إمّا متاحة للحجز أو متوقفة مع الاحتفاظ بسجلّها. */
export type VehicleStatus = "active" | "inactive";
export type RoomKind      = "private" | "shared";
export type MediaKind     = "image" | "video";

/* الفندق إمّا متاح للحجز أو متوقف مع الاحتفاظ بسجلّه. */
export type HotelStatus = "active" | "inactive";

export interface HotelFeature { id: string; icon: string; text: string; }
export interface HotelReview  { id: string; name: string; text: string; consent: boolean; image?: string; }
export interface HotelMedia   { id: string; kind: MediaKind; url: string; primary: boolean; category: string; }
export interface RoomType     { id: string; kind: RoomKind; beds: number; pricePerNight: number; photos?: HotelMedia[]; }
export interface Hotel {
  id: string; name: string; city: "مكة" | "المدينة";
  stars: 2 | 3 | 4 | 5; distanceM: number; district: string;
  phone: string; mapUrl: string; status: HotelStatus; notes: string;
  features: HotelFeature[]; roomTypes: RoomType[];
  tasaheelNote: string; reviews: HotelReview[]; media?: HotelMedia[];
  /* ── بيانات العقد (إدارية، لا يراها العميل) ──
     «أضف بيانات جهة الاتصال، رقم العقد، فترة العقد، وسياسة الإلغاء
     الداخلية». اختيارية كلّها: الفنادق القائمة بلا عقدٍ مسجَّل لا تُكسر. */
  contactPerson?: string; contactPhone?: string;
  contractNo?: string; contractFrom?: string; contractTo?: string;
  cancelPolicyInternal?: string;
}

export interface TransportFeature { id: string; text: string; icon?: string; }
export interface TransportReview  { id: string; name: string; text: string; consent: boolean; image?: string; rating?: number; }
export interface Transport {
  id: string; name: string; mode: VehicleMode;
  vehicleType: string;   // حافلة عادية / حافلة VIP / طيران
  seats: number; seatCost: number;
  /** في الحافلة: الشركة/الموديل. في الطيران: الناقل الجوّي. */
  model: string; year: string; plate: string;
  driver: string; supervisor: string;
  status: VehicleStatus; notes: string;

  /* ── بيانات الحافلة النظامية (mode === "bus") ──
     كان الصفّ يحمل اللوحة وحدها، والباقي يُسأل عنه بالهاتف يوم الرحلة.
     التواريخ الأربعة تمنع التفعيل عند انتهائها: تشغيل حافلةٍ بتأمينٍ
     منتهٍ مخالفةٌ نظامية قبل أن يكون خطأ بيانات. كلها اختيارية في النوع
     ليبقى الصفّ القديم صالحاً، والإلزام في readiness لا في المُصرِّف. */
  serialNo?: string;            // الرقم التسلسلي/التعريفي
  operator?: string;            // شركة التشغيل
  operatorPhone?: string;       // رقم تواصل المشغّل
  insuranceExpiry?: string;     // انتهاء التأمين        YYYY-MM-DD
  inspectionExpiry?: string;    // انتهاء الفحص الدوري
  registrationExpiry?: string;  // انتهاء الاستمارة
  transportLicenseExpiry?: string; // انتهاء رخصة النقل

  /* ── بيانات الطيران (mode === "flight") ──
     حقول الحافلة كانت تُعرض للطيران فيُكتب رقم الرحلة في خانة اللوحة
     واسم الكابتن في خانة السائق. الحقول تتبع الوسيلة لا تُقحَم عليها. */
  flightNo?: string;            // رقم الرحلة
  fromAirport?: string;         // مطار المغادرة
  toAirport?: string;           // مطار الوصول
  departTime?: string;          // موعد الإقلاع  HH:mm
  arriveTime?: string;          // موعد الوصول   HH:mm
  cabinClass?: string;          // الدرجة
  baggage?: string;             // حدّ الأمتعة

  features: TransportFeature[];
  reviews: TransportReview[];
  media?: HotelMedia[];
}

export type PkgStatus = "active" | "draft" | "hidden" | "suspended";
export type PkgDest   = "مكة" | "مكة والمدينة";
export interface ProgramStage { id:string; order:number; icon:string; day:string; time:string; title:string; desc:string; archived?:boolean; }
export interface RoomPrice    { id:string; type:string; persons:number; perNight:number; seatCost?:number; }
/** رأي الباقة: اسم وتقييم من خمس ونص وصورة اختيارية.
    consent/addedBy/bookingId حقول قديمة للقراءة فقط حتى تمرّ البيانات السابقة. */
export interface PkgReview    { id:string; name:string; text:string; consent:boolean; image?:string; rating?:number; addedBy?:string; bookingId?:string; }
export interface PkgFeature   { id:string; icon:string; text:string; }
export interface Pkg {
  id:string; name:string; order:number;
  productType:string; destination:PkgDest; audience:string;
  days:number; nights:number; status:PkgStatus;
  marketPrice:number; seatCostOverride?:number;
  /** خيار بيع مستقل: لا يشمل السكن، وسعره للفرد هو سعر البيع لا تكلفة المقعد. */
  transportOnlyEnabled?:boolean; transportOnlyPrice?:number;
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
  /** سبب الإلغاء وتاريخه — يُطلبان عند الإلغاء ويُعرضان مكان «المتبقي ٠».
      اختياريان: الرحلات الملغاة قبل هذا التغيير بلا سبب مسجَّل، ولا
      تُنسب إليها أسباب لم تُكتب. أعمدة القاعدة تنزل في ترحيل الموجة ١،
      وحتى ذلك يتجاهلهما upsert_trip بلا خطأ. */
  cancelReason?:string; cancelledAt?:string;
  /** وقت العودة HH:mm — اختياري: الرحلات القديمة بلا وقتٍ تُقرأ منتهيةً
      بآخر يوم العودة (lib/trip.ts › tripEnd). عموده return_time ينزل في
      ترحيل الموجة ٢ (20260912)، وقبله يتجاهله upsert_trip بلا خطأ. */
  returnTime?:string;
  /** عنوان نقطة الانطلاق لحظة الإطلاق — لقطةٌ من الفرع لا مرجعٌ إليه:
      تعديل عنوان الفرع لاحقاً لا يغيّر ما وُعد به ركّاب رحلةٍ مضت.
      عموده departure_address في الترحيل نفسه. */
  departureAddress?:string;
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
  /* ── الهوية (ترحيل 20260914) ──
     نوع الوثيقة يفكّ افتراض «كل هوية تبدأ بـ١٠»: الزائر يحمل جوازاً.
     contactPhone جوال مسؤول الحجز حين يختلف عن جوال المعتمر نفسه. */
  docType?:"national_id"|"iqama"|"passport";
  docExpiry?:string;            // YYYY-MM-DD
  docImage?:string;             // يبقى فارغاً حتى يُنشأ دلوٌ خاص (قرار ٤)
  contactPhone?:string;
  /** manual من اللوحة · auto أُنشئ عند تأكيد حجز. */
  source?:"manual"|"auto";
  createdFrom?:string;          // رقم الحجز الذي أُنشئ منه
}

/* ── دورة حياة المستند ──
   `state` قرارٌ مخزَّن، و«منتهية» طورٌ مشتقّ من تاريخ الرحلة لا يُخزَّن:
   تخزينه يحتاج وظيفةً مجدولة تقلب ما فات كل ليلة، وانقطاعُها يترك
   مستندات رحلاتٍ راحت معروضةً صالحة. انظر lib/docPhase.ts. */
export type PaymentState = "issued"|"cancelled"|"refunded";
export type TicketState  = "valid"|"used"|"cancelled";
/** الطور المعروض — يجمع الحالة المخزَّنة والمشتقّة. */
export type InvoicePhase = "paid"|"cancelled"|"refunded"|"expired"|"overdue"|"sent"|"failed"|"none";
export type TicketPhase  = "valid"|"used"|"cancelled"|"expired";

/** بند في الفاتورة. مجموع البنود = الإجمالي دائماً — يفرضه
    `rebuild_payment_items` في القاعدة بسطر تسويةٍ ظاهر عند اللزوم. */
export interface PaymentItem {
  kind:"accommodation"|"transport"|"addon"|"discount"|"adjustment";
  label:string; qty?:number; unitPrice?:number; amount:number;
}

export interface Payment {
  id:string; bookingId:string; clientName:string; clientPhone:string;
  packageName:string; tripDate:string;
  total:number; payMethod:string;
  payStatus:"verified"|"sent"|"failed"|"none";
  txnNo:string; payDate:string; createdAt:string;
  pilgrims?:Pilgrim[];
  roomType?:string;
  state:PaymentState;
  /** انتهاء رابط الدفع. */
  dueAt?:string;
  cancelReason?:string; cancelledAt?:string;
  refundAmount?:number; refundStatus?:string; refundRef?:string; refundAt?:string;
  items?:PaymentItem[];
  /** الرقم التسلسلي المتّصل (ترحيل 20260916) — يظهر على الفاتورة الضريبية. */
  serialNo?:number;
}

/** حدث على مستند — إرسال أو طباعة أو تنزيل أو مسح. */
export type DocEventType = "invoice"|"ticket"|"booking"|"custom_request"|"support";
export type DocEventKind =
  | "whatsapp"|"print"|"pdf"|"scan"|"cancel"|"refund"|"issue"
  | "accept"|"reject"|"assign"|"contact"|"close"|"bulk_close"|"discount"|"price_adjusted"|"status"|"note";
export interface DocEvent {
  id:number; docType:DocEventType; docId:string;
  event:DocEventKind;
  actorName?:string; outcome?:string; note?:string; createdAt:string;
}

export interface Pilgrim {
  name:string; docType?:"national_id"|"iqama"|"passport"; idNumber:string; nationality:string;
  gender:"male"|"female"; ageGroup?:"adult"|"child"; birthDate:string; phone:string; seat?:number;
  /* تحقّق الموظف — صفةُ المعتمر لا صفةُ الجلسة ولا صفةُ مرحلة الطلب، فلا
     يُعاد سؤال الموظف عمّا أجابه. غيابه «بانتظار التحقق»، و«stale» تعني
     أن البيانات عُدِّلت بعد التحقق فيلزم تحقّقٌ جديد. الشرح في
     features/bookings/verification.ts. */
  verify?:"verified"|"error"|"stale";
  verifiedAt?:string;
  verifiedBy?:string;
}
export type BookingStatus = "new"|"reviewing"|"needs_edit"|"rejected"|"accepted"|"awaiting_payment"|"awaiting_trip"|"paid"|"verifying"|"verified"|"confirmed"|"cancelled";
export type PaymentStatus = "none"|"sent"|"failed"|"verified";
/** غرفة واحدة في توزيع سكن حجز. السعر مثبَّت وقت الحجز لا مقروء من الباقة:
    تعديل الموظف لأسعارها لاحقاً يجب ألّا يجعل الإجمالي المحفوظ غير مفسَّر. */
export interface BookingRoom { tierId?:string; type:string; persons:number; perNight:number; }
export interface Booking {
  id:string; tripId:string; packageId?:string;
  clientName:string; clientPhone:string;
  roomType:string; persons:number;
  /** توزيع السكن مفصّلاً. اختياري: الحجوزات الداخلية والقديمة بلا توزيع. */
  rooms?:BookingRoom[];
  total:number; status:BookingStatus;
  paymentStatus:PaymentStatus;
  payMethod?:string; txnNo?:string; payDate?:string;
  seats:number[];
  createdAt:string;                // تاريخ بلا ساعة — للعرض والفرز
  submittedAt?:string;            // طابع زمني كامل للطلبات العامة — منه يبدأ وعد الردّ
  staff:string; sentDate:string;
  createdBy?:string;              // id المستخدم المنشئ (حجز داخلي)
  branchId?:string;               // فرع الطلب
  source?:string;                 // public | internal
  customerId?:string;             // حساب المستفيد (جلسة الجوال) إن وُجد
  payToken?:string;               // رمز رابط الدفع — يُفتح من واتساب بلا جلسة
  customer?:CustomerAccount;      // ملف الحساب (قراءة فقط في لوحة الموظف)
  /** عمودان متروكان: لا تعيين للطلب — أي موظف استقبال يتعامل معه
      مباشرةً (قرار ٢٠٢٦-٠٩-١١). لا تكتب فيهما الواجهة شيئاً. */
  assignedTo?:string; assignedAt?:string;
  /** سبب الرفض أو الإلغاء أو الإغلاق الجماعي. */
  closedReason?:string;
  /** الخصم المعتمد من المدير — نسبةٌ وسببٌ ومعتمِد ووقت. */
  discountPercent?:number; discountReason?:string; discountBy?:string; discountAt?:string;
  pilgrims:Pilgrim[];
}

/** ملف حساب المستفيد كما تقرأه لوحة الموظف مع الحجز. */
export interface CustomerAccount {
  firstName:string; lastName:string; birthDate?:string; email?:string; phone?:string;
}

export interface TicketEntry {
  ticketNo:string; bookingId:string;
  clientName:string; clientPhone:string;
  packageName:string; roomType:string;
  tripDate:string; tripTime:string; departurePoint:string;
  persons:number; pilgrims:Pilgrim[];
  total:number;
  state:TicketState;
  usedAt?:string; scanCount?:number;
  cancelReason?:string; cancelledAt?:string;
  /** متى صدرت ومن أصدرها — شرط كتابة «معتمدة» عليها. */
  issuedAt?:string; issuedBy?:string;
}

/* طلب باقة مخصّصة — لا حجز مباشر: يجمع رغبة العميل ويصله الفريق لتجهيز العرض. */
export type CustomReqStatus = "new"|"contacted"|"quoted"|"converted"|"closed";
export interface CustomRequest {
  id:string;
  departDate:string; returnDate:string; persons:number;
  destination:string;            // مكة | مكة والمدينة
  roomType:string;               // نوع السكن المطلوب
  hotelLevel:string;             // مستوى الفندق (نجوم)
  tripNotes:string;
  name:string; phone:string; city:string; notes:string;
  status:CustomReqStatus; createdAt:string; staff?:string;
  /** المسؤول وموعد الردّ الأقصى — بـassign_custom_request. */
  assignedTo?:string; assignedAt?:string; dueAt?:string;
  /** سبب الإغلاق من القائمة الأربعة — إلزامي عند «مغلق». */
  closeReason?:CustomCloseReason;
}
export const CUSTOM_CLOSE_REASONS = ["لم يردّ","السعر غير مناسب","غير قابل للتنفيذ","أُلغي من العميل"] as const;
export type CustomCloseReason = typeof CUSTOM_CLOSE_REASONS[number];

export type UserRole = "مدير عام"|"مدير النظام"|"موظف";
export interface SystemUser {
  id:string; name:string; email:string;
  role:UserRole; status:"active"|"inactive"; lastLogin:string;
  /** الفرع الذي يقصّ نطاق ما يراه الموظف (RLS 20260915). فارغٌ = كل الفروع. */
  branchId?:string;
}

export type SupportPriority = "عاجل"|"متوسط"|"منخفض";
export type SupportStatus   = "sent"|"reviewing"|"resolved"|"closed";
export interface SupportReq {
  id:string; category:string; title:string; desc:string;
  priority:SupportPriority; status:SupportStatus; date:string;
  /* ── مكتب الدعم (ترحيل 20260913) ──
     اختيارية كلّها: الصفّ القديم بلا هذه الأعمدة يبقى صالحاً، والواجهة
     تعمل قبل الترحيل. `createdAt` لحظةٌ لا يوم — وعد الردّ يُحسب بساعات
     العمل ويحتاجها؛ `date` يبقى للتوافق مع القراءات القديمة. */
  createdAt?:string; createdBy?:string;
  attachments?:string[];
  assignedTo?:string; assignedAt?:string;
  resolvedAt?:string; closedAt?:string;
  /** نصّ الحلّ — إلزامي عند «تم الحل» و«مغلق». */
  resolution?:string;
}
