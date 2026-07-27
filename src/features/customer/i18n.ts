/* i18n خفيف لصفحة العميل — عربي (افتراضي) + إنجليزي + أردو + تركي.
   يبدّل نصوص الواجهة فقط؛ أسماء الباقات/الأسعار تأتي من البيانات كما هي. */
export type Lang = "ar" | "en" | "ur" | "tr";

export const LANGS: { code: Lang; label: string; dir: "rtl" | "ltr" }[] = [
  { code: "ar", label: "العربية", dir: "rtl" },
  { code: "en", label: "English", dir: "ltr" },
  { code: "ur", label: "اردو", dir: "rtl" },
  { code: "tr", label: "Türkçe", dir: "ltr" },
];
export const dirOf = (l: Lang): "rtl" | "ltr" => LANGS.find(x => x.code === l)?.dir ?? "rtl";

type Dict = Record<string, string>;
const D: Record<Lang, Dict> = {
  ar: {
    brand:"تساهيل العمرة", tagline:"احجز عمرتك بسهولة وطمأنينة",
    choosePackage:"اختر باقتك", from:"يبدأ من", currency:"ر.س", days:"أيام", nights:"ليالٍ",
    chooseTrip:"اختر موعد السفر", remaining:"متبقٍ", seat:"مقعد", full:"مكتملة", soldOut:"لا مقاعد متاحة",
    people:"عدد المعتمرين", person:"معتمر", chooseRoom:"اختر نوع السكن",
    roomPrivate:"غرفة خاصة", roomShared:"غرفة مشتركة", perPerson:"للفرد", mostWanted:"الأكثر طلباً",
    total:"الإجمالي", passengers:"بيانات المعتمرين", addPassenger:"إضافة معتمر",
    name:"الاسم الكامل", phone:"رقم الجوال", idNumber:"رقم الهوية / الجواز", birthDate:"تاريخ الميلاد",
    review:"مراجعة الطلب", package:"الباقة", trip:"الرحلة", room:"السكن",
    agree:"أوافق على الشروط والأحكام", submit:"تأكيد الطلب", submitting:"جارٍ الإرسال…",
    next:"التالي", back:"رجوع", start:"ابدأ الحجز",
    successTitle:"تم استلام طلبك", successMsg:"سيتم مراجعة طلبك وإبلاغك بالخطوات التالية.", bookingNo:"رقم الطلب",
    track:"تتبّع الطلب", trackTitle:"تتبّع حالة الطلب", trackHint:"أدخل رقم الطلب ورقم الجوال",
    lookup:"استعلام", notFound:"لم يُعثر على طلب مطابق", ticket:"التذكرة", profile:"حسابي",
    home:"الرئيسية", myBookings:"حجوزاتي", language:"اللغة",
    stepReview:"قيد المراجعة", stepAccepted:"تم القبول", stepAwaitPay:"بانتظار الدفع",
    stepPaid:"تم الدفع", stepConfirmed:"مؤكد", stepTicket:"إصدار التذكرة",
    required:"هذا الحقل مطلوب", invalidPhone:"رقم جوال غير صحيح", noTrips:"لا توجد رحلات متاحة حالياً",
    seatsLeft:"المقاعد المتبقية", errSeats:"عذراً، لم تعد المقاعد كافية",
  },
  en: {
    brand:"Tasaheel Al-Umrah", tagline:"Book your Umrah with ease and peace of mind",
    choosePackage:"Choose your package", from:"From", currency:"SAR", days:"days", nights:"nights",
    chooseTrip:"Choose travel date", remaining:"left", seat:"seat", full:"Full", soldOut:"No seats available",
    people:"Number of pilgrims", person:"pilgrim", chooseRoom:"Choose room type",
    roomPrivate:"Private room", roomShared:"Shared room", perPerson:"per person", mostWanted:"Most popular",
    total:"Total", passengers:"Pilgrim details", addPassenger:"Add pilgrim",
    name:"Full name", phone:"Mobile number", idNumber:"ID / Passport no.", birthDate:"Date of birth",
    review:"Review order", package:"Package", trip:"Trip", room:"Room",
    agree:"I agree to the terms & conditions", submit:"Confirm order", submitting:"Submitting…",
    next:"Next", back:"Back", start:"Start booking",
    successTitle:"Your request was received", successMsg:"We will review it and inform you of the next steps.", bookingNo:"Order no.",
    track:"Track order", trackTitle:"Track order status", trackHint:"Enter order number and mobile",
    lookup:"Look up", notFound:"No matching order found", ticket:"Ticket", profile:"Account",
    home:"Home", myBookings:"My bookings", language:"Language",
    stepReview:"Under review", stepAccepted:"Accepted", stepAwaitPay:"Awaiting payment",
    stepPaid:"Paid", stepConfirmed:"Confirmed", stepTicket:"Ticket issued",
    required:"This field is required", invalidPhone:"Invalid mobile number", noTrips:"No trips available now",
    seatsLeft:"Seats left", errSeats:"Sorry, not enough seats remaining",
  },
  ur: {
    brand:"تساہیل العمرہ", tagline:"اپنا عمرہ آسانی اور اطمینان سے بُک کریں",
    choosePackage:"اپنا پیکج منتخب کریں", from:"شروع", currency:"ر.س", days:"دن", nights:"راتیں",
    chooseTrip:"سفر کی تاریخ منتخب کریں", remaining:"باقی", seat:"نشست", full:"مکمل", soldOut:"کوئی نشست دستیاب نہیں",
    people:"معتمرین کی تعداد", person:"معتمر", chooseRoom:"کمرے کی قسم منتخب کریں",
    roomPrivate:"نجی کمرہ", roomShared:"مشترکہ کمرہ", perPerson:"فی فرد", mostWanted:"سب سے مقبول",
    total:"کل", passengers:"معتمرین کی تفصیلات", addPassenger:"معتمر شامل کریں",
    name:"پورا نام", phone:"موبائل نمبر", idNumber:"شناختی / پاسپورٹ نمبر", birthDate:"تاریخ پیدائش",
    review:"آرڈر کا جائزہ", package:"پیکج", trip:"سفر", room:"کمرہ",
    agree:"میں شرائط و ضوابط سے متفق ہوں", submit:"آرڈر کی تصدیق", submitting:"بھیجا جا رہا ہے…",
    next:"اگلا", back:"واپس", start:"بکنگ شروع کریں",
    successTitle:"آپ کی درخواست موصول ہو گئی", successMsg:"ہم جائزہ لے کر اگلے مراحل سے آگاہ کریں گے۔", bookingNo:"آرڈر نمبر",
    track:"آرڈر ٹریک کریں", trackTitle:"آرڈر کی حالت دیکھیں", trackHint:"آرڈر نمبر اور موبائل درج کریں",
    lookup:"تلاش", notFound:"کوئی مماثل آرڈر نہیں ملا", ticket:"ٹکٹ", profile:"اکاؤنٹ",
    home:"ہوم", myBookings:"میری بکنگ", language:"زبان",
    stepReview:"زیر جائزہ", stepAccepted:"منظور", stepAwaitPay:"ادائیگی کا انتظار",
    stepPaid:"ادا شدہ", stepConfirmed:"تصدیق شدہ", stepTicket:"ٹکٹ جاری",
    required:"یہ خانہ ضروری ہے", invalidPhone:"غلط موبائل نمبر", noTrips:"فی الحال کوئی سفر دستیاب نہیں",
    seatsLeft:"باقی نشستیں", errSeats:"معذرت، کافی نشستیں باقی نہیں",
  },
  tr: {
    brand:"Tasaheel Al-Umrah", tagline:"Umrenizi kolayca ve gönül rahatlığıyla rezerve edin",
    choosePackage:"Paketinizi seçin", from:"Başlangıç", currency:"SAR", days:"gün", nights:"gece",
    chooseTrip:"Seyahat tarihini seçin", remaining:"kaldı", seat:"koltuk", full:"Dolu", soldOut:"Koltuk yok",
    people:"Hacı sayısı", person:"hacı", chooseRoom:"Oda tipini seçin",
    roomPrivate:"Özel oda", roomShared:"Paylaşımlı oda", perPerson:"kişi başı", mostWanted:"En popüler",
    total:"Toplam", passengers:"Hacı bilgileri", addPassenger:"Hacı ekle",
    name:"Ad soyad", phone:"Cep numarası", idNumber:"Kimlik / Pasaport no.", birthDate:"Doğum tarihi",
    review:"Siparişi gözden geçir", package:"Paket", trip:"Sefer", room:"Oda",
    agree:"Şartları ve koşulları kabul ediyorum", submit:"Siparişi onayla", submitting:"Gönderiliyor…",
    next:"İleri", back:"Geri", start:"Rezervasyona başla",
    successTitle:"Talebiniz alındı", successMsg:"İnceleyip sonraki adımları bildireceğiz.", bookingNo:"Sipariş no.",
    track:"Siparişi takip et", trackTitle:"Sipariş durumunu takip et", trackHint:"Sipariş no. ve cep girin",
    lookup:"Sorgula", notFound:"Eşleşen sipariş bulunamadı", ticket:"Bilet", profile:"Hesap",
    home:"Ana sayfa", myBookings:"Rezervasyonlarım", language:"Dil",
    stepReview:"İnceleniyor", stepAccepted:"Kabul edildi", stepAwaitPay:"Ödeme bekleniyor",
    stepPaid:"Ödendi", stepConfirmed:"Onaylandı", stepTicket:"Bilet düzenlendi",
    required:"Bu alan zorunludur", invalidPhone:"Geçersiz numara", noTrips:"Şu an sefer yok",
    seatsLeft:"Kalan koltuk", errSeats:"Üzgünüz, yeterli koltuk kalmadı",
  },
};

export function makeT(lang: Lang) {
  return (k: string): string => D[lang]?.[k] ?? D.ar[k] ?? k;
}
