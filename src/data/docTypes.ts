/* أنواع وثيقة الهوية — تحدّد شكل الرقم المطلوب ونصّه الإرشادي والتحقق منه. */

export type DocType = "national_id" | "iqama" | "passport";

export interface DocTypeDef {
  value: DocType;
  icon: string;
  label: Record<string, string>;       // اسم الوثيقة
  numberLabel: Record<string, string>; // عنوان حقل الرقم
  hint: Record<string, string>;        // شرح تنسيق الرقم
  error: Record<string, string>;       // رسالة الخطأ
  placeholder: string;
  test: (v: string) => boolean;
  numeric: boolean;
  maxLength: number;
}

export const DOC_TYPES: DocTypeDef[] = [
  {
    value: "national_id",
    icon: "🪪",
    label:       { ar: "هوية وطنية", en: "National ID" },
    numberLabel: { ar: "رقم الهوية الوطنية", en: "National ID number" },
    hint:        { ar: "١٠ أرقام تبدأ بالرقم 1", en: "10 digits starting with 1" },
    error:       { ar: "رقم الهوية الوطنية يجب أن يكون 10 أرقام ويبدأ بالرقم 1", en: "National ID must be 10 digits starting with 1" },
    placeholder: "1XXXXXXXXX",
    test: v => /^1\d{9}$/.test(v),
    numeric: true,
    maxLength: 10,
  },
  {
    value: "iqama",
    icon: "🆔",
    label:       { ar: "إقامة", en: "Iqama (residency)" },
    numberLabel: { ar: "رقم الإقامة", en: "Iqama number" },
    hint:        { ar: "١٠ أرقام تبدأ بالرقم 2", en: "10 digits starting with 2" },
    error:       { ar: "رقم الإقامة يجب أن يكون 10 أرقام ويبدأ بالرقم 2", en: "Iqama number must be 10 digits starting with 2" },
    placeholder: "2XXXXXXXXX",
    test: v => /^2\d{9}$/.test(v),
    numeric: true,
    maxLength: 10,
  },
  {
    value: "passport",
    icon: "🛂",
    label:       { ar: "جواز سفر", en: "Passport" },
    numberLabel: { ar: "رقم الجواز", en: "Passport number" },
    hint:        { ar: "أحرف وأرقام كما في الجواز (٥–١٥ خانة)", en: "Letters and digits as printed (5–15)" },
    error:       { ar: "رقم الجواز غير صحيح — أحرف وأرقام من 5 إلى 15 خانة", en: "Invalid passport number — 5 to 15 letters/digits" },
    placeholder: "A1234567",
    test: v => /^[A-Za-z0-9]{5,15}$/.test(v),
    numeric: false,
    maxLength: 15,
  },
];

export const docTypeDef = (v: string | undefined): DocTypeDef =>
  DOC_TYPES.find(d => d.value === v) ?? DOC_TYPES[0];

export const docText = (m: Record<string, string>, lang = "ar") => m[lang] ?? m.ar;

/** عنوان حقل الرقم — يعتمد على النوع، ويرجع لعنوان عام إن كان النوع مجهولاً. */
export function numberLabelOf(docType: string | undefined, idNumber = "", lang = "ar"): string {
  const t = docType || guessDocType(idNumber);
  if (t) return docText(docTypeDef(t).numberLabel, lang);
  return lang === "en" ? "ID / Passport no." : "رقم الهوية / الجواز";
}

/** تخمين نوع الوثيقة من رقم مخزَّن سابقاً (بيانات قديمة بلا نوع). */
export function guessDocType(idNumber: string): DocType | "" {
  if (/^1\d{9}$/.test(idNumber)) return "national_id";
  if (/^2\d{9}$/.test(idNumber)) return "iqama";
  if (idNumber && /[A-Za-z]/.test(idNumber)) return "passport";
  return "";
}
