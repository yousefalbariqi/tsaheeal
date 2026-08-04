/* قائمة الجنسيات — مصدر واحد لكل حقول «الجنسية» في التطبيق (صفحة المستفيد + لوحة الموظف).
   القيمة المخزَّنة هي الاسم العربي للجنسية (مثل "سعودي") حفاظاً على توافق البيانات السابقة
   التي كانت تُدخَل كنص حر ثم تُعرض كما هي في شاشة الحجز. */

export interface Nationality {
  code: string;        // ISO 3166-1 alpha-2 — يُشتق منه العلم
  ar: string;          // الجنسية بالعربية — القيمة المخزَّنة
  arCountry: string;   // اسم الدولة بالعربية — للبحث والسطر الثانوي
  en: string;          // الجنسية بالإنجليزية
  enCountry: string;   // اسم الدولة بالإنجليزية
}

type Row = [code: string, ar: string, arCountry: string, en: string, enCountry: string];

const ROWS: Row[] = [
  // ── الخليج والعالم العربي ──
  ["SA", "سعودي", "السعودية", "Saudi", "Saudi Arabia"],
  ["AE", "إماراتي", "الإمارات العربية المتحدة", "Emirati", "United Arab Emirates"],
  ["KW", "كويتي", "الكويت", "Kuwaiti", "Kuwait"],
  ["QA", "قطري", "قطر", "Qatari", "Qatar"],
  ["BH", "بحريني", "البحرين", "Bahraini", "Bahrain"],
  ["OM", "عماني", "سلطنة عُمان", "Omani", "Oman"],
  ["YE", "يمني", "اليمن", "Yemeni", "Yemen"],
  ["JO", "أردني", "الأردن", "Jordanian", "Jordan"],
  ["PS", "فلسطيني", "فلسطين", "Palestinian", "Palestine"],
  ["SY", "سوري", "سوريا", "Syrian", "Syria"],
  ["LB", "لبناني", "لبنان", "Lebanese", "Lebanon"],
  ["IQ", "عراقي", "العراق", "Iraqi", "Iraq"],
  ["EG", "مصري", "مصر", "Egyptian", "Egypt"],
  ["SD", "سوداني", "السودان", "Sudanese", "Sudan"],
  ["LY", "ليبي", "ليبيا", "Libyan", "Libya"],
  ["TN", "تونسي", "تونس", "Tunisian", "Tunisia"],
  ["DZ", "جزائري", "الجزائر", "Algerian", "Algeria"],
  ["MA", "مغربي", "المغرب", "Moroccan", "Morocco"],
  ["MR", "موريتاني", "موريتانيا", "Mauritanian", "Mauritania"],
  ["SO", "صومالي", "الصومال", "Somali", "Somalia"],
  ["DJ", "جيبوتي", "جيبوتي", "Djiboutian", "Djibouti"],
  ["KM", "قمري", "جزر القمر", "Comorian", "Comoros"],

  // ── آسيا ──
  ["PK", "باكستاني", "باكستان", "Pakistani", "Pakistan"],
  ["IN", "هندي", "الهند", "Indian", "India"],
  ["BD", "بنغلاديشي", "بنغلاديش", "Bangladeshi", "Bangladesh"],
  ["ID", "إندونيسي", "إندونيسيا", "Indonesian", "Indonesia"],
  ["MY", "ماليزي", "ماليزيا", "Malaysian", "Malaysia"],
  ["TR", "تركي", "تركيا", "Turkish", "Türkiye"],
  ["IR", "إيراني", "إيران", "Iranian", "Iran"],
  ["AF", "أفغاني", "أفغانستان", "Afghan", "Afghanistan"],
  ["LK", "سريلانكي", "سريلانكا", "Sri Lankan", "Sri Lanka"],
  ["NP", "نيبالي", "نيبال", "Nepali", "Nepal"],
  ["PH", "فلبيني", "الفلبين", "Filipino", "Philippines"],
  ["TH", "تايلندي", "تايلاند", "Thai", "Thailand"],
  ["VN", "فيتنامي", "فيتنام", "Vietnamese", "Vietnam"],
  ["CN", "صيني", "الصين", "Chinese", "China"],
  ["JP", "ياباني", "اليابان", "Japanese", "Japan"],
  ["KR", "كوري جنوبي", "كوريا الجنوبية", "South Korean", "South Korea"],
  ["KP", "كوري شمالي", "كوريا الشمالية", "North Korean", "North Korea"],
  ["SG", "سنغافوري", "سنغافورة", "Singaporean", "Singapore"],
  ["BN", "بروني", "بروناي", "Bruneian", "Brunei"],
  ["MM", "ميانماري", "ميانمار (بورما)", "Burmese", "Myanmar"],
  ["KH", "كمبودي", "كمبوديا", "Cambodian", "Cambodia"],
  ["LA", "لاوسي", "لاوس", "Lao", "Laos"],
  ["MV", "مالديفي", "المالديف", "Maldivian", "Maldives"],
  ["BT", "بوتاني", "بوتان", "Bhutanese", "Bhutan"],
  ["MN", "منغولي", "منغوليا", "Mongolian", "Mongolia"],
  ["TL", "تيموري", "تيمور الشرقية", "Timorese", "Timor-Leste"],
  ["KZ", "كازاخي", "كازاخستان", "Kazakh", "Kazakhstan"],
  ["UZ", "أوزبكي", "أوزبكستان", "Uzbek", "Uzbekistan"],
  ["TM", "تركماني", "تركمانستان", "Turkmen", "Turkmenistan"],
  ["TJ", "طاجيكي", "طاجيكستان", "Tajik", "Tajikistan"],
  ["KG", "قيرغيزي", "قيرغيزستان", "Kyrgyz", "Kyrgyzstan"],
  ["AZ", "أذربيجاني", "أذربيجان", "Azerbaijani", "Azerbaijan"],
  ["AM", "أرميني", "أرمينيا", "Armenian", "Armenia"],
  ["GE", "جورجي", "جورجيا", "Georgian", "Georgia"],
  ["CY", "قبرصي", "قبرص", "Cypriot", "Cyprus"],

  // ── أوروبا ──
  ["GB", "بريطاني", "المملكة المتحدة", "British", "United Kingdom"],
  ["FR", "فرنسي", "فرنسا", "French", "France"],
  ["DE", "ألماني", "ألمانيا", "German", "Germany"],
  ["IT", "إيطالي", "إيطاليا", "Italian", "Italy"],
  ["ES", "إسباني", "إسبانيا", "Spanish", "Spain"],
  ["PT", "برتغالي", "البرتغال", "Portuguese", "Portugal"],
  ["NL", "هولندي", "هولندا", "Dutch", "Netherlands"],
  ["BE", "بلجيكي", "بلجيكا", "Belgian", "Belgium"],
  ["LU", "لوكسمبورغي", "لوكسمبورغ", "Luxembourgish", "Luxembourg"],
  ["IE", "أيرلندي", "أيرلندا", "Irish", "Ireland"],
  ["CH", "سويسري", "سويسرا", "Swiss", "Switzerland"],
  ["AT", "نمساوي", "النمسا", "Austrian", "Austria"],
  ["SE", "سويدي", "السويد", "Swedish", "Sweden"],
  ["NO", "نرويجي", "النرويج", "Norwegian", "Norway"],
  ["DK", "دنماركي", "الدنمارك", "Danish", "Denmark"],
  ["FI", "فنلندي", "فنلندا", "Finnish", "Finland"],
  ["IS", "آيسلندي", "آيسلندا", "Icelandic", "Iceland"],
  ["PL", "بولندي", "بولندا", "Polish", "Poland"],
  ["CZ", "تشيكي", "التشيك", "Czech", "Czechia"],
  ["SK", "سلوفاكي", "سلوفاكيا", "Slovak", "Slovakia"],
  ["HU", "مجري", "المجر", "Hungarian", "Hungary"],
  ["RO", "روماني", "رومانيا", "Romanian", "Romania"],
  ["BG", "بلغاري", "بلغاريا", "Bulgarian", "Bulgaria"],
  ["GR", "يوناني", "اليونان", "Greek", "Greece"],
  ["HR", "كرواتي", "كرواتيا", "Croatian", "Croatia"],
  ["SI", "سلوفيني", "سلوفينيا", "Slovenian", "Slovenia"],
  ["RS", "صربي", "صربيا", "Serbian", "Serbia"],
  ["BA", "بوسني", "البوسنة والهرسك", "Bosnian", "Bosnia and Herzegovina"],
  ["ME", "مونتينيغري", "الجبل الأسود", "Montenegrin", "Montenegro"],
  ["MK", "مقدوني", "مقدونيا الشمالية", "Macedonian", "North Macedonia"],
  ["AL", "ألباني", "ألبانيا", "Albanian", "Albania"],
  ["XK", "كوسوفي", "كوسوفو", "Kosovar", "Kosovo"],
  ["RU", "روسي", "روسيا", "Russian", "Russia"],
  ["UA", "أوكراني", "أوكرانيا", "Ukrainian", "Ukraine"],
  ["BY", "بيلاروسي", "بيلاروسيا", "Belarusian", "Belarus"],
  ["MD", "مولدوفي", "مولدوفا", "Moldovan", "Moldova"],
  ["LT", "ليتواني", "ليتوانيا", "Lithuanian", "Lithuania"],
  ["LV", "لاتفي", "لاتفيا", "Latvian", "Latvia"],
  ["EE", "إستوني", "إستونيا", "Estonian", "Estonia"],
  ["MT", "مالطي", "مالطا", "Maltese", "Malta"],
  ["AD", "أندوري", "أندورا", "Andorran", "Andorra"],
  ["MC", "موناكي", "موناكو", "Monegasque", "Monaco"],
  ["SM", "سان ماريني", "سان مارينو", "Sammarinese", "San Marino"],
  ["LI", "ليختنشتايني", "ليختنشتاين", "Liechtensteiner", "Liechtenstein"],
  ["VA", "فاتيكاني", "الفاتيكان", "Vatican", "Vatican City"],

  // ── أفريقيا ──
  ["NG", "نيجيري", "نيجيريا", "Nigerian", "Nigeria"],
  ["GH", "غاني", "غانا", "Ghanaian", "Ghana"],
  ["SN", "سنغالي", "السنغال", "Senegalese", "Senegal"],
  ["ML", "مالي", "مالي", "Malian", "Mali"],
  ["NE", "نيجري", "النيجر", "Nigerien", "Niger"],
  ["BF", "بوركيني", "بوركينا فاسو", "Burkinabé", "Burkina Faso"],
  ["CI", "إيفواري", "ساحل العاج", "Ivorian", "Côte d'Ivoire"],
  ["GN", "غيني", "غينيا", "Guinean", "Guinea"],
  ["GW", "غيني بيساوي", "غينيا بيساو", "Bissau-Guinean", "Guinea-Bissau"],
  ["GM", "غامبي", "غامبيا", "Gambian", "Gambia"],
  ["SL", "سيراليوني", "سيراليون", "Sierra Leonean", "Sierra Leone"],
  ["LR", "ليبيري", "ليبيريا", "Liberian", "Liberia"],
  ["TG", "توغولي", "توغو", "Togolese", "Togo"],
  ["BJ", "بنيني", "بنين", "Beninese", "Benin"],
  ["CV", "كابو فيردي", "الرأس الأخضر", "Cabo Verdean", "Cabo Verde"],
  ["CM", "كاميروني", "الكاميرون", "Cameroonian", "Cameroon"],
  ["TD", "تشادي", "تشاد", "Chadian", "Chad"],
  ["CF", "أفريقي وسطي", "جمهورية أفريقيا الوسطى", "Central African", "Central African Republic"],
  ["GA", "غابوني", "الغابون", "Gabonese", "Gabon"],
  ["CG", "كونغولي", "الكونغو", "Congolese", "Congo"],
  ["CD", "كونغولي (الديمقراطية)", "جمهورية الكونغو الديمقراطية", "Congolese (DRC)", "DR Congo"],
  ["GQ", "غيني استوائي", "غينيا الاستوائية", "Equatorial Guinean", "Equatorial Guinea"],
  ["ST", "ساو تومي", "ساو تومي وبرينسيبي", "São Toméan", "São Tomé and Príncipe"],
  ["AO", "أنغولي", "أنغولا", "Angolan", "Angola"],
  ["ZM", "زامبي", "زامبيا", "Zambian", "Zambia"],
  ["ZW", "زيمبابوي", "زيمبابوي", "Zimbabwean", "Zimbabwe"],
  ["MW", "ملاوي", "ملاوي", "Malawian", "Malawi"],
  ["MZ", "موزمبيقي", "موزمبيق", "Mozambican", "Mozambique"],
  ["BW", "بتسواني", "بوتسوانا", "Motswana", "Botswana"],
  ["NA", "ناميبي", "ناميبيا", "Namibian", "Namibia"],
  ["ZA", "جنوب أفريقي", "جنوب أفريقيا", "South African", "South Africa"],
  ["LS", "ليسوتي", "ليسوتو", "Mosotho", "Lesotho"],
  ["SZ", "إسواتيني", "إسواتيني", "Swazi", "Eswatini"],
  ["MG", "مدغشقري", "مدغشقر", "Malagasy", "Madagascar"],
  ["MU", "موريشي", "موريشيوس", "Mauritian", "Mauritius"],
  ["SC", "سيشلي", "سيشل", "Seychellois", "Seychelles"],
  ["KE", "كيني", "كينيا", "Kenyan", "Kenya"],
  ["TZ", "تنزاني", "تنزانيا", "Tanzanian", "Tanzania"],
  ["UG", "أوغندي", "أوغندا", "Ugandan", "Uganda"],
  ["RW", "رواندي", "رواندا", "Rwandan", "Rwanda"],
  ["BI", "بوروندي", "بوروندي", "Burundian", "Burundi"],
  ["ET", "إثيوبي", "إثيوبيا", "Ethiopian", "Ethiopia"],
  ["ER", "إريتري", "إريتريا", "Eritrean", "Eritrea"],
  ["SS", "جنوب سوداني", "جنوب السودان", "South Sudanese", "South Sudan"],

  // ── الأمريكتان ──
  ["US", "أمريكي", "الولايات المتحدة", "American", "United States"],
  ["CA", "كندي", "كندا", "Canadian", "Canada"],
  ["MX", "مكسيكي", "المكسيك", "Mexican", "Mexico"],
  ["BR", "برازيلي", "البرازيل", "Brazilian", "Brazil"],
  ["AR", "أرجنتيني", "الأرجنتين", "Argentine", "Argentina"],
  ["CL", "تشيلي", "تشيلي", "Chilean", "Chile"],
  ["CO", "كولومبي", "كولومبيا", "Colombian", "Colombia"],
  ["PE", "بيروفي", "بيرو", "Peruvian", "Peru"],
  ["VE", "فنزويلي", "فنزويلا", "Venezuelan", "Venezuela"],
  ["EC", "إكوادوري", "الإكوادور", "Ecuadorian", "Ecuador"],
  ["BO", "بوليفي", "بوليفيا", "Bolivian", "Bolivia"],
  ["PY", "باراغواياني", "باراغواي", "Paraguayan", "Paraguay"],
  ["UY", "أوروغواياني", "أوروغواي", "Uruguayan", "Uruguay"],
  ["GY", "غياني", "غيانا", "Guyanese", "Guyana"],
  ["SR", "سورينامي", "سورينام", "Surinamese", "Suriname"],
  ["PA", "بنمي", "بنما", "Panamanian", "Panama"],
  ["CR", "كوستاريكي", "كوستاريكا", "Costa Rican", "Costa Rica"],
  ["NI", "نيكاراغوي", "نيكاراغوا", "Nicaraguan", "Nicaragua"],
  ["HN", "هندوراسي", "هندوراس", "Honduran", "Honduras"],
  ["SV", "سلفادوري", "السلفادور", "Salvadoran", "El Salvador"],
  ["GT", "غواتيمالي", "غواتيمالا", "Guatemalan", "Guatemala"],
  ["BZ", "بليزي", "بليز", "Belizean", "Belize"],
  ["CU", "كوبي", "كوبا", "Cuban", "Cuba"],
  ["DO", "دومينيكاني", "جمهورية الدومينيكان", "Dominican", "Dominican Republic"],
  ["HT", "هايتي", "هايتي", "Haitian", "Haiti"],
  ["JM", "جامايكي", "جامايكا", "Jamaican", "Jamaica"],
  ["TT", "ترينيدادي", "ترينيداد وتوباغو", "Trinidadian", "Trinidad and Tobago"],
  ["BS", "باهامي", "الباهاما", "Bahamian", "Bahamas"],
  ["BB", "بربادوسي", "بربادوس", "Barbadian", "Barbados"],

  // ── أوقيانوسيا ──
  ["AU", "أسترالي", "أستراليا", "Australian", "Australia"],
  ["NZ", "نيوزيلندي", "نيوزيلندا", "New Zealander", "New Zealand"],
  ["FJ", "فيجي", "فيجي", "Fijian", "Fiji"],
  ["PG", "بابوي", "بابوا غينيا الجديدة", "Papua New Guinean", "Papua New Guinea"],
  ["SB", "سليماني", "جزر سليمان", "Solomon Islander", "Solomon Islands"],
  ["VU", "فانواتي", "فانواتو", "Ni-Vanuatu", "Vanuatu"],
  ["WS", "ساموي", "ساموا", "Samoan", "Samoa"],
  ["TO", "تونغي", "تونغا", "Tongan", "Tonga"],
  ["KI", "كيريباتي", "كيريباتي", "I-Kiribati", "Kiribati"],
  ["TV", "توفالي", "توفالو", "Tuvaluan", "Tuvalu"],
  ["NR", "ناوري", "ناورو", "Nauruan", "Nauru"],
  ["FM", "ميكرونيزي", "ميكرونيزيا", "Micronesian", "Micronesia"],
  ["MH", "مارشالي", "جزر مارشال", "Marshallese", "Marshall Islands"],
  ["PW", "بالاوي", "بالاو", "Palauan", "Palau"],
];

export const NATIONALITIES: Nationality[] = ROWS.map(([code, ar, arCountry, en, enCountry]) => ({
  code, ar, arCountry, en, enCountry,
}));

/** الجنسيات الأكثر تكراراً لدى المعتمرين — تُعرض أولاً قبل بدء البحث. */
export const POPULAR_CODES = ["SA", "EG", "PK", "IN", "ID", "YE", "SD", "JO", "SY", "BD", "TR", "MY"];

/** علم الدولة من رمز ISO — أحرف المؤشِّر الإقليمي. */
export function flagEmoji(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return "🏳️";
  return String.fromCodePoint(...code.toUpperCase().split("").map(c => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** تطبيع نص البحث: تجاهل التشكيل والتطويل وتوحيد الهمزات/التاء المربوطة/الألف المقصورة. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[ىي]/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

const HAYSTACK = new Map<string, string>(
  NATIONALITIES.map(n => [n.code, normalize(`${n.ar} ${n.arCountry} ${n.en} ${n.enCountry} ${n.code}`)]),
);

/** بحث بكل الحقول (عربي/إنجليزي/رمز الدولة) — يقدّم المطابقات التي تبدأ بالكلمة. */
export function searchNationalities(query: string): Nationality[] {
  const q = normalize(query);
  if (!q) return NATIONALITIES;
  const starts: Nationality[] = [];
  const contains: Nationality[] = [];
  for (const n of NATIONALITIES) {
    const hay = HAYSTACK.get(n.code)!;
    if (hay.startsWith(q) || hay.includes(` ${q}`)) starts.push(n);
    else if (hay.includes(q)) contains.push(n);
  }
  return [...starts, ...contains];
}

/** إيجاد الجنسية من قيمة مخزَّنة (اسم عربي أو إنجليزي أو رمز) — يدعم البيانات القديمة،
    بما فيها صيغة المؤنث ("سعودية") واسم الدولة بأداة التعريف ("السعودية"). */
const bare = (s: string) => normalize(s).replace(/^ال/, "");
export function findNationality(value: string): Nationality | undefined {
  if (!value) return undefined;
  const v = bare(value);
  return NATIONALITIES.find(n =>
    [n.ar, `${n.ar}ة`, n.arCountry, n.en, n.enCountry, n.code].some(x => bare(x) === v));
}

/** الاسم المعروض حسب لغة الواجهة — العربية للعربية/الأردية، والإنجليزية لما عداهما. */
export function natLabel(n: Nationality, lang = "ar"): string {
  return lang === "en" || lang === "tr" ? n.en : n.ar;
}
export function natCountry(n: Nationality, lang = "ar"): string {
  return lang === "en" || lang === "tr" ? n.enCountry : n.arCountry;
}
