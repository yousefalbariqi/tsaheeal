/* i18n خفيف لصفحة العميل — عربي (افتراضي) + إنجليزي.
   يبدّل نصوص الواجهة فقط؛ أسماء الباقات/الأسعار تأتي من البيانات كما هي.

   أُزيلت الأردية والتركية: خطّ التطبيق الوحيد (DG Shamael) لا يملك حروف
   الأردية الخاصة (ی ک ہ ے پ ٹ ھ ڈ گ چ ڑ) ولا لواحق التركية (ğ ş ı ç ö ü)،
   فكانت الأردية تُعرض مقطوعة الوصل والتركية بخطّين في الكلمة الواحدة.
   إعادتهما تستلزم ملفّ خطّ يغطّي محارفهما أولاً. */
export type Lang = "ar" | "en";

export const LANGS: { code: Lang; label: string; dir: "rtl" | "ltr" }[] = [
  { code: "ar", label: "العربية", dir: "rtl" },
  { code: "en", label: "English", dir: "ltr" },
];
export const dirOf = (l: Lang): "rtl" | "ltr" => LANGS.find(x => x.code === l)?.dir ?? "rtl";

/* ── عبارات الثقة في الشريط الزاحف ─────────────────────────────────
   مصفوفة لا مفاتيح نصّية في Dict: العدد متغيّر، وإضافة عبارة يجب أن
   تكون سطراً واحداً لا مفتاحاً جديداً في كل قاموس.

   الترتيب تناوب بين أربعة محاور — هوية، تشغيل، سعر، خدمة — فلا تمرّ
   عبارتان من محور واحد متلاصقتين: الشريط يُقرأ نافذةً بنافذة، ولو
   تجمّعت العبارات المتشابهة لبدت النافذة تكراراً.

   ── ما حُذف وسببه (٢٠٢٦-٠٩-٠٦، بطلب الفريق) ──
   أربع عبارات كانت تَعِد بما لا يسنده شيء في النظام:

   • «نقل مرخّص» و«خبرة أكثر من 25 سنة» — ادعاءان عن المنشأة لا يملك
     الكود التحقّق منهما، ولا اعتمدتهما الإدارة كتابةً. عبارةٌ كهذه
     تُقرأ التزاماً تعاقدياً لا تزييناً.
   • «دعم على مدار الساعة» — تناقضه الإعدادات نفسها: `openHour`
     و`closeHour` في app_settings نافذةٌ محدودة، ووعد الردّ يتوقّف
     خارجها ويستأنف صباحاً. الشاشة تقول ٢٤ ساعة والعدّاد يقول غير ذلك.
   • «إلغاء مجاني» — سياسة الإلغاء صارت تُقرأ من `pkg.policies` وحدها
     (انظر firstPolicy في Listing.tsx)، فباقةٌ بلا سياسة لا تَعِد بشيء.

   إعادة أيٍّ منها = سطرٌ واحد هنا، متى اعتمدتها الإدارة وربطتها بسياسة
   مكتوبة. ما بقي أدناه إمّا واقعٌ تشغيلي أو صياغةٌ لا تَعِد بقياس. */
export const TRUST: Record<Lang, string[]> = {
  ar: [
    "إدارة سعودية",
    "أسعار واضحة بلا رسوم خفية",
    "فنادق قريبة من الحرم",
    "رد سريع على واتساب",
    "مرشد مرافق",
    "الدفع بعد تأكيد الحجز",
  ],
  en: [
    "Saudi-run",
    "Clear prices, no hidden fees",
    "Hotels close to the Haram",
    "Fast WhatsApp replies",
    "Guide accompanies you",
    "Pay after booking is confirmed",
  ],
};

/** نفس سقوط makeT إلى العربية عند غياب اللغة. */
export const trustOf = (l: Lang): string[] => TRUST[l] ?? TRUST.ar;

/* ── أسماء المدن للعرض ─────────────────────────────────────────────
   القاعدة تخزّن «المدينة» مختصرةً في `destination` و`hotels.city`، وهي
   في شريحة فلترٍ بجانب «مكة» تُقرأ اسماً عامّاً — «أيّ مدينة؟» لا
   «المدينة المنوّرة». الاسم الكامل يرفع اللبس بلا لمس البيانات:
   المفتاح يبقى كما هو في القاعدة، والعرض وحده يتوسّع. */
const CITY_LABEL: Record<Lang, Record<string, string>> = {
  ar: { "مكة": "مكة المكرمة", "المدينة": "المدينة المنورة" },
  en: { "مكة": "Makkah", "المدينة": "Madinah" },
};

/** اسم المدينة كما يُعرض. المدينة غير المعروفة تُعرض كما جاءت. */
export const cityLabel = (city: string, l: Lang): string =>
  (CITY_LABEL[l] ?? CITY_LABEL.ar)[city] ?? city;

type Dict = Record<string, string>;
const D: Record<Lang, Dict> = {
  ar: {
    brand:"تساهيل العمرة", tagline:"احجز رحلة عمرتك بسهولة واطمئنان",
    choosePackage:"اختر باقتك", from:"يبدأ من", currency:"ر.س", days:"أيام", nights:"ليالٍ",
    chooseTrip:"اختر موعد السفر", remaining:"متبقٍ", seat:"مقعد", full:"مكتملة", soldOut:"لا مقاعد متاحة",
    people:"عدد المعتمرين", person:"معتمر", chooseRoom:"اختر نوع السكن",
    roomPrivate:"غرفة خاصة", roomShared:"غرفة مشتركة", perPerson:"للفرد", mostWanted:"الأكثر طلباً",
    total:"الإجمالي", passengers:"بيانات المعتمرين", addPassenger:"إضافة معتمر",
    name:"الاسم الكامل", phone:"رقم الجوال", idNumber:"رقم الهوية / الجواز", birthDate:"تاريخ الميلاد",
    nameErr:"اكتب الاسم كاملاً كما في الوثيقة (اسمان على الأقل)", optional:"اختياري", nameHint:"الاسم كما هو مكتوب في الوثيقة", namePh:"مثال: أحمد محمد سعيد العمري",
    phoneHint:"٩ أرقام تبدأ بـ5، أو ١٠ تبدأ بـ05", phonePh:"05XXXXXXXX",
    customPkg:"رحلة حسب الطلب", customLead:"نسّق رحلتك كما تريد وسنتولّى ترتيبها لك بالكامل", customCta:"اطلب تنسيقاً خاصاً",
    customEyebrow:"بديل الباقات الجاهزة", customPerkHotels:"حجز فنادق", customPerkFlights:"ترتيب طيران", customPerkPlan:"تنسيق كامل",
    gender:"الجنس", male:"ذكر", female:"أنثى", ageGroup:"الفئة العمرية", adult:"بالغ", child:"طفل", childNoPhone:"جوال ولي الأمر يكفي للطفل", assignSeats:"توزيع المقاعد", pickPilgrim:"اختر المعتمر ثم مقعده", seatFor:"مقعد", seatTaken:"المقعد محجوز", allSeatsSet:"تم توزيع كل المقاعد", changeSeat:"تغيير", docType:"نوع الوثيقة", docTypeHint:"اختر نوع الوثيقة أولاً ليظهر شكل الرقم المطلوب", docTypePh:"اختر نوع الوثيقة",
    nationality:"الجنسية", nationalityHint:"ابحث بالاسم أو الدولة", nationalityPh:"اختر الجنسية",
    birthDateHint:"اختر التقويم ثم السنة فالشهر فاليوم",
    pilgrimCardHint:"عبّئ بيانات كل معتمر كما هي في وثيقته الرسمية",
    fillFirst:"أكمل الحقول الناقصة للمتابعة", loadFailed:"تعذّر تحميل الباقات", loadFailedSub:"تحقّق من اتصالك بالإنترنت ثم أعد المحاولة", retryBtn:"إعادة المحاولة", sendFailed:"لم نتمكّن من إرسال طلبك. تحقّق من اتصالك وأعد المحاولة",
    review:"مراجعة الطلب", package:"الباقة", trip:"الرحلة", room:"السكن",
    agree:"أوافق على الشروط والأحكام", submit:"تأكيد الطلب", submitting:"جارٍ الإرسال…",
    next:"التالي", back:"رجوع", start:"ابدأ الحجز",
    successTitle:"تم استلام طلبك", successMsg:"سيتم مراجعة طلبك وإبلاغك بالخطوات التالية.", bookingNo:"رقم الطلب",
    track:"تتبّع الطلب", trackTitle:"تتبّع حالة الطلب", trackHint:"أدخل رقم الطلب ورقم الجوال",
    lookup:"استعلام", notFound:"لم يُعثر على طلب مطابق", ticket:"التذكرة", profile:"حسابي",
    ticketNo:"رقم التذكرة", departurePoint:"نقطة الانطلاق",
    showAtGate:"اعرض هذا الرمز عند الصعود",
    home:"الرئيسية", myBookings:"حجوزاتي", language:"اللغة",
    stepReview:"قيد المراجعة", stepAccepted:"تم القبول", stepAwaitPay:"بانتظار الدفع",
    stepPaid:"تم الدفع", stepTicket:"إصدار التذكرة",
    // ── وعد الردّ: عدّاد ساعتَي عمل ──
    contactWithin:"سيتم التواصل معك خلال ساعتين", slaLeft:"الوقت المتبقي للرد", slaSoon:"قريباً جداً",
    slaPaused:"خارج ساعات العمل", slaResumes:"يستأنف العدّ {time}",
    slaExpiredNote:"طلبك في مقدّمة القائمة وسنتواصل معك حالاً",
    workHours:"ساعات العمل {from} صباحاً – {to} مساءً", amShort:"ص", pmShort:"م",
    required:"هذا الحقل مطلوب", invalidPhone:"رقم جوال غير صحيح", noTrips:"لا توجد رحلات متاحة حالياً",
    seatsLeft:"المقاعد المتبقية", errSeats:"عذراً، لم تعد المقاعد كافية",
    chooseSeat:"اختر مقعدك", busFeatures:"مميزات الباص", pickSeatsHint:"اختر {n} مقعد",
    readTerms:"قراءة الشروط والأحكام", iAgreeRead:"لقد قرأت وأوافق على الشروط والأحكام", approve:"موافق",
    login:"تسجيل الدخول", loginHint:"أدخل رقم جوالك لاستلام رمز عبر واتساب", sendCode:"إرسال الرمز",
    enterCode:"أدخل الرمز المُرسل", verify:"تحقّق", resend:"إعادة إرسال الرمز", resendIn:"إعادة الإرسال خلال",
    loginToTrack:"سجّل الدخول لعرض طلباتك تلقائياً", logout:"تسجيل الخروج", noBookings:"لا توجد طلبات بعد",
    loading:"جارٍ التحميل…", second:"ثانية",
    // ── هوية المستفيد: الدخول بالجوال ثم إكمال الحساب ──
    loginOrSignup:"تسجيل الدخول أو إنشاء حساب", phoneLead:"سنرسل لك رمز تحقّق عبر واتساب",
    phoneLeadNoOtp:"أدخل رقم جوالك للمتابعة",
    continueBtn:"متابعة", confirmIdentity:"تأكيد هويتك", sentCodeTo:"أرسلنا رمزًا إلى",
    didntGet:"ألم يصلك الرمز؟", sendNewCode:"إرسال رمز جديد", tryAnotherWay:"تجربة طريقة أخرى",
    resendBySms:"إرسال الرمز برسالة نصية", sentWhatsapp:"أُرسل الرمز عبر واتساب", sentSms:"أُرسل الرمز برسالة نصية",
    completeAccount:"أكمل بيانات حسابك", accountHint:"نحتاجها لإصدار التذاكر — تأكد من مطابقتها لوثيقتك الرسمية",
    legalName:"الاسم الكريم", firstName:"الاسم الأول", lastName:"الاسم الأخير",
    email:"البريد الإلكتروني", emailOptional:"البريد الإلكتروني (اختياري)", saveAndContinue:"حفظ ومتابعة",
    loginToBook:"سجّل الدخول لإتمام الحجز", verifiedBadge:"مُوثَّق", myAccount:"بياناتي",
    claimedBookings:"وجدنا {n} طلباً سابقاً بهذا الرقم وأضفناه لحسابك",
    errOtpWrong:"الرمز غير صحيح — تأكد من الأرقام", errOtpExpired:"انتهت صلاحية الرمز، اطلب رمزًا جديدًا",
    errRateLimited:"محاولات كثيرة — أعد المحاولة بعد {n} ثانية",
    errSmsProvider:"تعذّر إرسال الرمز حالياً، حاول لاحقاً أو تواصل معنا",
    errLoginUnavailable:"تعذّر الدخول حالياً — تواصل معنا",
    errNetwork:"تحقّق من اتصالك بالإنترنت", errSignupDisabled:"التسجيل موقوف مؤقتاً",
    errUnknown:"حدث خطأ غير متوقع، حاول مرة أخرى", errLoginRequired:"سجّل الدخول أولاً لإرسال الطلب",
    stepLogin:"الدخول", stepData:"البيانات", stepSeats:"المقاعد", stepConfirm:"المراجعة",
    // ── واجهة Airbnb ──
    // ── إجراءات البطاقة والمعرض (الموجة ٠) ──
    noUpcoming:"بلا رحلات قادمة", noUpcomingShort:"لا رحلات",
    bookingSummary:"ملخص الحجز", editWord:"تعديل", doneWord:"تم", quickFacts:"معلومات الرحلة", showAllReviewsShort:"عرض جميع التقييمات",
    signup:"إنشاء حساب", viewGrid:"شبكة", viewList:"قائمة", viewTrip:"عرض الرحلة",
    tripsFound:"{n} رحلة متاحة", tripFound:"رحلة واحدة متاحة", pricesInSar:"الأسعار بالريال السعودي",
    vipNote:"نرتّب لك رحلةً على مقاسك — سكناً ونقلاً وبرنامجاً.",
    nextTrip:"أقرب رحلة", seatsLeftCard:"{n} مقعداً متبقياً", seatsLeftCardOne:"مقعد واحد متبقٍ", byBus:"بالحافلة", byFlight:"بالطيران", incl:"يشمل", inclHousing:"السكن", inclTransport:"النقل", moreTrips:"+{n} رحلات أخرى",
    priceBreakdown:"تفصيل السعر", perNightGroup:"سعر الليلة للمجموعة", nightsCount:"عدد الليالي", transportIncl:"النقل", inclTax:"شامل ضريبة القيمة المضافة", priceNote:"السعر نهائي — لا رسوم تُضاف عند الدفع.",
    seatHeldUntil:"مقاعدك محجوزة لك حتى {t}", seatHoldExpired:"انتهت مهلة حجز المقاعد — اختر من جديد", seatHeldByOther:"هذا المقعد يختاره معتمرٌ آخر الآن",
    savePkg:"حفظ الباقة", unsavePkg:"إزالة من المحفوظة", sharePkg:"مشاركة الباقة",
    savedToast:"حُفظت الباقة في قائمتك", unsavedToast:"أُزيلت من قائمتك",
    shareCopied:"نُسخ رابط الباقة", shareFailed:"تعذّرت المشاركة — انسخ الرابط من شريط العنوان",
    photoOf:"الصورة {i} من {n}", goToPhoto:"اذهب إلى الصورة {i}",
    bookYourTrip:"احجز رحلتك", viewPhotos:"الصور", photosLabel:"صور", guests:"أشخاص", selectThisRoom:"اختيار هذا السكن", confirmPeople:"تأكيد عدد المعتمرين", playVideo:"تشغيل الفيديو", all:"الكل", search:"ابحث عن باقتك", explore:"استكشاف", packagesIn:"باقات {city}",
    whatOffers:"ما تقدمه هذه الباقة", showAllAmenities:"عرض الميزات الـ {n}",
    program:"برنامج الرحلة", stay:"السكن", transport:"وسيلة النقل",
    guestReviews:"تقييمات المعتمرين", showAllReviews:"إظهار كل التقييمات", noReviews:"لا توجد تقييمات بعد",
    // ── صفحة حسابي ──
    sentTo:"أُرسل إلى", myDetails:"بياناتي", editDetails:"تعديل البيانات", travellers:"المسافرون",
    travellersHint:"المعتمرون الذين سافروا معك — تُستخدم بياناتهم لتسريع الحجز",
    // ── الدفتر داخل خطوة بيانات المعتمرين ──
    fromBook:"من دفتر المسافرين", fromBookHint:"اضغط اسماً لتعبئة بياناته",
    noTravellers:"لا يوجد مسافرون محفوظون بعد", noTravellersHint:"يُضافون تلقائياً بعد أول حجز، أو أضفهم يدوياً",
    addTraveller:"إضافة مسافر", editTraveller:"تعديل بيانات المسافر", deleteTraveller:"حذف المسافر",
    deleteTravellerAsk:"حذف {name} من قائمة المسافرين؟", deleteTravellerNote:"لا يؤثّر على حجوزاتك السابقة",
    save:"حفظ", cancel:"إلغاء", delete:"حذف",
    changePhone:"تغيير الرقم", newPhone:"رقم الجوال الجديد",
    phoneChangeHint:"سنرسل رمز تأكيد إلى الرقم الجديد قبل حفظه",
    phoneChanged:"تم تغيير رقم جوالك", errSamePhone:"هذا هو رقمك الحالي",
    verifyNewPhone:"تأكيد الرقم الجديد", accountSaved:"تم حفظ التعديلات",
    guestAccount:"لم تسجّل الدخول بعد", guestAccountHint:"سجّل الدخول لعرض بياناتك وحجوزاتك",
    settings:"الإعدادات", notSet:"غير محدّد",
    readMore:"اقرأ المزيد", outOfTen:"من 10",
    // تصريف العدد: 3–10 جمع تكسير، و11 فأكثر تمييز مفرد منصوب
    oneReview:"تقييم واحد", twoReviews:"تقييمان", fewReviews:"{n} تقييمات", manyReviews:"{n} تقييماً",
    // أوصاف الدرجة — سلّم تنازلي، أول عتبة تتحقق هي الوصف
    score9:"استثنائي", score85:"رائع", score8:"جيد جداً", score7:"جيد", score6:"مقبول", score0:"متوسط",
    thingsToKnow:"أشياء يجب معرفتها", cancelPolicy:"سياسة الإلغاء", termsTitle:"الشروط والأحكام",
    freeCancel:"إلغاء مجاني", clearDate:"محو التاريخ", change:"تغيير",
    /* لا سياسة مسجّلة ⇒ يُقال ذلك. عرض «إلغاء مجاني» افتراضياً كان وعداً
       تعاقدياً لم يكتبه أحد، ويُقرأ التزاماً عند أول طلب إلغاء. */
    noPolicy:"لم تُسجَّل سياسة إلغاء لهذه الباقة — تواصل معنا قبل الحجز لمعرفة شروط الإلغاء.",
    manualReview:"أُضيف يدوياً", manualReviewBy:"أضافه {name} من فريق تساهيل",
    previewTitle:"معاينة داخلية", previewNote:"هذه الباقة غير منشورة — العرض للمراجعة فقط ولا يمكن الحجز منها.",
    confirmDate:"تأكيد التاريخ", dayAvailable:"متاح", dayFull:"مكتمل", seatsLeftShort:"متبقٍ {n} مقعداً",
    // فوق العتبة يُعرض سقف لا العدد الحقيقي: الرقم الكبير لا يفيد المستفيد
    seatsPlenty:"+{n} متاح",
    // ── توزيع الغرف ──
    roomSplitTitle:"اختر نوع السكن", roomsUnit:"غرف", roomWord:"غرفة", perRoom:"لكل غرفة",
    fromPrice:"من", splitOptionsN:"{n} توزيعات",
    room1:"غرفة واحدة", room2:"غرفتان", roomsN:"{n} غرف",
    bed1:"سرير واحد", bed2:"سريران", bedsN:"{n} أسرّة", oneBedEach:"سرير لكل فرد",
    spot1:"مكان واحد", spot2:"مكانان", spotsN:"{n} أماكن", spotsUnit:"أماكن",
    perStay:"لكامل الإقامة", spareBeds:"سرير إضافي غير مستخدم", spareBedsN:"{n} أسرّة إضافية غير مستخدمة",
    noRoomFit:"لا يوجد توزيع غرف يناسب هذا العدد في هذه الباقة",
    noRoomFitHint:"جرّب عدداً آخر، أو اطلب تنسيقاً خاصاً ونرتّبه لك",
    fromHaram:"من الحرم", meters:"م", forNights:"مقابل {n} ليالٍ",
    openMap:"عرض على الخريطة", seatsCount:"مقعد", pickDateFirst:"اختر موعد السفر أولاً",
    perNight:"لليلة", noPackages:"لا توجد باقات متاحة حالياً",
  },
  en: {
    brand:"Tasaheel Al-Umrah", tagline:"Book your Umrah with ease and peace of mind",
    choosePackage:"Choose your package", from:"From", currency:"SAR", days:"days", nights:"nights",
    chooseTrip:"Choose travel date", remaining:"left", seat:"seat", full:"Full", soldOut:"No seats available",
    people:"Number of pilgrims", person:"pilgrim", chooseRoom:"Choose room type",
    roomPrivate:"Private room", roomShared:"Shared room", perPerson:"per person", mostWanted:"Most popular",
    total:"Total", passengers:"Pilgrim details", addPassenger:"Add pilgrim",
    name:"Full name", phone:"Mobile number", idNumber:"ID / Passport no.", birthDate:"Date of birth",
    nameErr:"Enter the full name as printed (at least two words)", optional:"optional", nameHint:"Exactly as printed on the document", namePh:"e.g. Ahmed Mohammed Saeed Al-Omari",
    phoneHint:"9 digits starting with 5, or 10 starting with 05", phonePh:"05XXXXXXXX",
    customPkg:"Tailor-made trip", customLead:"Plan your trip your way — we'll arrange every detail", customCta:"Request a custom trip",
    customEyebrow:"Beyond ready-made packages", customPerkHotels:"Hotels", customPerkFlights:"Flights", customPerkPlan:"Full planning",
    gender:"Gender", male:"Male", female:"Female", ageGroup:"Age group", adult:"Adult", child:"Child", childNoPhone:"The guardian's number is enough for a child", assignSeats:"Seat assignment", pickPilgrim:"Pick a pilgrim, then their seat", seatFor:"Seat", seatTaken:"Seat taken", allSeatsSet:"All seats assigned", changeSeat:"Change", docType:"Document type", docTypeHint:"Pick the document type to see the expected number format", docTypePh:"Select document type",
    nationality:"Nationality", nationalityHint:"Search by nationality or country", nationalityPh:"Select nationality",
    birthDateHint:"Pick the calendar, then year, month and day",
    pilgrimCardHint:"Enter each pilgrim's details exactly as on their official document",
    fillFirst:"Complete the missing fields to continue", loadFailed:"Couldn't load packages", loadFailedSub:"Check your connection and try again", retryBtn:"Try again", sendFailed:"We couldn't send your request. Check your connection and try again",
    review:"Review order", package:"Package", trip:"Trip", room:"Room",
    agree:"I agree to the terms & conditions", submit:"Confirm order", submitting:"Submitting…",
    next:"Next", back:"Back", start:"Start booking",
    successTitle:"Your request was received", successMsg:"We will review it and inform you of the next steps.", bookingNo:"Order no.",
    track:"Track order", trackTitle:"Track order status", trackHint:"Enter order number and mobile",
    lookup:"Look up", notFound:"No matching order found", ticket:"Ticket", profile:"Account",
    ticketNo:"Ticket no.", departurePoint:"Departure point",
    showAtGate:"Show this code when boarding",
    home:"Home", myBookings:"My bookings", language:"Language",
    stepReview:"Under review", stepAccepted:"Accepted", stepAwaitPay:"Awaiting payment",
    stepPaid:"Paid", stepTicket:"Ticket issued",
    // ── Response promise: two working-hour countdown ──
    contactWithin:"We'll contact you within two hours", slaLeft:"time left to reply", slaSoon:"very soon",
    slaPaused:"Outside working hours", slaResumes:"resumes {time}",
    slaExpiredNote:"Your request is at the top of the queue — we'll be in touch shortly",
    workHours:"Working hours {from}am – {to}pm", amShort:"AM", pmShort:"PM",
    required:"This field is required", invalidPhone:"Invalid mobile number", noTrips:"No trips available now",
    seatsLeft:"Seats left", errSeats:"Sorry, not enough seats remaining",
    chooseSeat:"Choose your seat", busFeatures:"Bus features", pickSeatsHint:"Pick {n} seat(s)",
    readTerms:"Read terms & conditions", iAgreeRead:"I have read and agree to the terms & conditions", approve:"Agree",
    login:"Login", loginHint:"Enter your mobile to receive a code via WhatsApp", sendCode:"Send code",
    enterCode:"Enter the code", verify:"Verify", resend:"Resend code", resendIn:"Resend in",
    loginToTrack:"Log in to see your orders automatically", logout:"Logout", noBookings:"No orders yet",
    loading:"Loading…", second:"s",
    loginOrSignup:"Log in or sign up", phoneLead:"We'll send you a verification code on WhatsApp",
    phoneLeadNoOtp:"Enter your mobile number to continue",
    continueBtn:"Continue", confirmIdentity:"Confirm your identity", sentCodeTo:"We sent a code to",
    didntGet:"Didn't get the code?", sendNewCode:"Send a new code", tryAnotherWay:"Try another way",
    resendBySms:"Send the code by SMS", sentWhatsapp:"Code sent on WhatsApp", sentSms:"Code sent by SMS",
    completeAccount:"Complete your account", accountHint:"We need this to issue tickets — make sure it matches your official document",
    legalName:"Legal name", firstName:"First name", lastName:"Last name",
    email:"Email", emailOptional:"Email (optional)", saveAndContinue:"Save and continue",
    loginToBook:"Log in to finish booking", verifiedBadge:"Verified", myAccount:"My details",
    claimedBookings:"We found {n} earlier request(s) on this number and added them to your account",
    errOtpWrong:"Incorrect code — check the digits", errOtpExpired:"The code expired, request a new one",
    errRateLimited:"Too many attempts — try again in {n}s",
    errSmsProvider:"Couldn't send the code right now, try later or contact us",
    errLoginUnavailable:"Sign-in is unavailable right now — contact us",
    errNetwork:"Check your internet connection", errSignupDisabled:"Sign-up is temporarily disabled",
    errUnknown:"Something went wrong, please try again", errLoginRequired:"Log in first to send the request",
    stepLogin:"Log in", stepData:"Details", stepSeats:"Seats", stepConfirm:"Review",
    // ── Airbnb-style UI ──
    noUpcoming:"No upcoming trips", noUpcomingShort:"No trips",
    bookingSummary:"Booking summary", editWord:"Edit", doneWord:"Done", quickFacts:"Trip at a glance", showAllReviewsShort:"See all reviews",
    signup:"Sign up", viewGrid:"Grid", viewList:"List", viewTrip:"View trip",
    tripsFound:"{n} trips available", tripFound:"1 trip available", pricesInSar:"Prices in Saudi riyals",
    vipNote:"We arrange the trip around you — stay, transport, and plan.",
    nextTrip:"Next trip", seatsLeftCard:"{n} seats left", seatsLeftCardOne:"1 seat left", byBus:"By bus", byFlight:"By flight", incl:"Includes", inclHousing:"housing", inclTransport:"transport", moreTrips:"+{n} more trips",
    priceBreakdown:"Price breakdown", perNightGroup:"Per night for the group", nightsCount:"Nights", transportIncl:"Transport", inclTax:"VAT included", priceNote:"Final price — nothing added at payment.",
    seatHeldUntil:"Your seats are held until {t}", seatHoldExpired:"Seat hold expired — pick again", seatHeldByOther:"Another pilgrim is choosing this seat right now",
    savePkg:"Save package", unsavePkg:"Remove from saved", sharePkg:"Share package",
    savedToast:"Package saved to your list", unsavedToast:"Removed from your list",
    shareCopied:"Package link copied", shareFailed:"Couldn't share — copy the link from the address bar",
    photoOf:"Photo {i} of {n}", goToPhoto:"Go to photo {i}",
    bookYourTrip:"Book your trip", viewPhotos:"Photos", photosLabel:"photos", guests:"guests", selectThisRoom:"Select this room", confirmPeople:"Confirm guests", playVideo:"Play video", all:"All", search:"Find your package", explore:"Explore", packagesIn:"Packages in {city}",
    whatOffers:"What this package offers", showAllAmenities:"Show all {n} features",
    program:"Trip programme", stay:"Stay", transport:"Transport",
    guestReviews:"Pilgrim reviews", showAllReviews:"Show all reviews", noReviews:"No reviews yet",
    sentTo:"Sent to", myDetails:"My details", editDetails:"Edit details", travellers:"Travellers",
    travellersHint:"People who travelled with you — used to speed up booking",
    fromBook:"From your travellers", fromBookHint:"Tap a name to fill their details",
    noTravellers:"No saved travellers yet", noTravellersHint:"They are added automatically after your first booking, or add them manually",
    addTraveller:"Add traveller", editTraveller:"Edit traveller", deleteTraveller:"Delete traveller",
    deleteTravellerAsk:"Remove {name} from your travellers?", deleteTravellerNote:"Your past bookings are not affected",
    save:"Save", cancel:"Cancel", delete:"Delete",
    changePhone:"Change number", newPhone:"New mobile number",
    phoneChangeHint:"We'll send a confirmation code to the new number before saving it",
    phoneChanged:"Your mobile number has been changed", errSamePhone:"That is already your number",
    verifyNewPhone:"Confirm new number", accountSaved:"Changes saved",
    guestAccount:"You're not signed in", guestAccountHint:"Sign in to see your details and bookings",
    settings:"Settings", notSet:"Not set",
    readMore:"Read more", outOfTen:"out of 10",
    oneReview:"1 review", twoReviews:"2 reviews", fewReviews:"{n} reviews", manyReviews:"{n} reviews",
    score9:"Exceptional", score85:"Fabulous", score8:"Very good", score7:"Good", score6:"Pleasant", score0:"Average",
    thingsToKnow:"Things to know", cancelPolicy:"Cancellation policy", termsTitle:"Terms & conditions",
    freeCancel:"Free cancellation", clearDate:"Clear date", change:"Change",
    noPolicy:"No cancellation policy is recorded for this package — contact us before booking.",
    manualReview:"Added by staff", manualReviewBy:"Added by {name}, Tasaheel team",
    previewTitle:"Internal preview", previewNote:"This package is not published — preview only, booking is disabled.",
    confirmDate:"Confirm date", dayAvailable:"Available", dayFull:"Full", seatsLeftShort:"{n} seats left",
    seatsPlenty:"{n}+ available",
    // ── Room distribution ──
    roomSplitTitle:"Choose accommodation", roomsUnit:"rooms", roomWord:"room", perRoom:"per room",
    fromPrice:"from", splitOptionsN:"{n} options",
    room1:"One room", room2:"Two rooms", roomsN:"{n} rooms",
    bed1:"1 bed", bed2:"2 beds", bedsN:"{n} beds", oneBedEach:"A bed each",
    spot1:"1 place", spot2:"2 places", spotsN:"{n} places", spotsUnit:"places",
    perStay:"for the whole stay", spareBeds:"1 spare bed", spareBedsN:"{n} spare beds",
    noRoomFit:"No room split fits this group size in this package",
    noRoomFitHint:"Try a different number, or request a custom trip and we'll arrange it",
    fromHaram:"from the Haram", meters:"m", forNights:"for {n} nights",
    openMap:"View on map", seatsCount:"seats", pickDateFirst:"Choose a travel date first",
    perNight:"per night", noPackages:"No packages available right now",
  },
};

export function makeT(lang: Lang) {
  return (k: string): string => D[lang]?.[k] ?? D.ar[k] ?? k;
}
