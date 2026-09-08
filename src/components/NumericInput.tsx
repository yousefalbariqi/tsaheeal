import { useId, useState, type ChangeEvent, type ComponentPropsWithoutRef, type FocusEvent } from "react";

type NativeInputProps = Omit<ComponentPropsWithoutRef<"input">, "type" | "value" | "onChange" | "inputMode">;

export interface NumericInputProps extends NativeInputProps {
  /** القيمة تُحفظ بالأرقام الإنجليزية فقط، سواءً كانت صحيحة أو عشرية. */
  value: number | string;
  onValueChange: (value: string) => void;
  /** يفتح لوحةً تدعم الفاصلة العشرية على الجوال. */
  decimal?: boolean;
  /** حالات نادرة تقبل الأرقام العربية/الهندية وتحوّلها إلى الإنجليزية فوراً. */
  normalizeArabicDigits?: boolean;
}

const ARABIC_DIGITS = /[٠-٩۰-۹]/;

/**
 * حقل رقمي بلا `type="number"`: لا تظهر معه أسهُم المتصفح، وتبقى لوحة
 * الأرقام على الجوال عبر inputMode. نحتفظ مؤقتاً بالقيمة غير المقبولة كي
 * يراها الموظف مع الرسالة بدلاً من أن تختفي كتابته بلا تفسير.
 *
 * ولماذا لا `type="number"` أصلاً: أسهُمه تُغيّر الرقم بضغطةٍ عارضة أو
 * بعجلة الفأرة فوق الحقل — سعرُ ليلةٍ يصير ١٥١ بلا أن يلاحظ أحد. وإخفاء
 * الأسهُم بالـCSS لا يمنع العجلة ولا أسهُم لوحة المفاتيح، فالحقل نصّيٌّ
 * بلوحة أرقام: لا زيادة ولا نقصان إلا بما يُكتب.
 */
const toEnglishDigits = (value:string) => value.replace(/[٠-٩۰-۹]/g, digit => {
  const code=digit.charCodeAt(0);
  return String(code >= 0x06f0 ? code-0x06f0 : code-0x0660);
});

export function NumericInput({ value, onValueChange, decimal = false, normalizeArabicDigits = false, id, onBlur, ...props }: NumericInputProps) {
  const autoErrorId = useId();
  const errorId = `${id ?? autoErrorId}-numeric-error`;
  const [invalidValue, setInvalidValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* نصّ الكتابة الجاري. لازمٌ لأن الأب يحفظ رقماً: من يكتب «1.» يعيده
     Number إلى «1» فتُمحى النقطة تحت إصبعه ولا يستطيع كتابة كسرٍ أبداً.
     يُعرض ما دام يُقرأ نفس القيمة المحفوظة، ويسقط عند أول تغييرٍ من
     الخارج (تفريغ نموذج، أو حسابٌ يكتب الحقل). */
  const [draft, setDraft] = useState<string | null>(null);
  const allowed = decimal ? /^\d*(?:[.,]\d*)?$/ : /^\d*$/;

  /* «» تُقرأ صفراً، فتبقى ظاهرةً فارغةً لمن محا الحقل ليكتب من جديد —
     بدلاً من أن يقفز «0» تحت إصبعه فيصير ما يكتبه «05». والخروج من
     الحقل يُظهر المحفوظ. */
  const sameAsSaved = draft !== null
    && (draft === String(value) || Number(draft.replace(",", ".")) === Number(value));
  if (draft !== null && !sameAsSaved) setDraft(null);

  const displayedValue = invalidValue ?? (sameAsSaved ? draft! : String(value));

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    const next = normalizeArabicDigits ? toEnglishDigits(raw) : raw;
    if (ARABIC_DIGITS.test(next)) {
      setInvalidValue(next);
      setError("استخدم الأرقام الإنجليزية (0–9) فقط؛ الأرقام العربية أو الهندية غير مدعومة.");
      return;
    }
    if (!allowed.test(next)) {
      setInvalidValue(next);
      setError(decimal
        ? "أدخل أرقاماً إنجليزية فقط، ويمكن استخدام فاصلة عشرية واحدة."
        : "أدخل أرقاماً إنجليزية (0–9) فقط.");
      return;
    }

    setInvalidValue(null);
    setError(null);
    setDraft(next);
    /* الفاصلة تُقلب نقطةً قبل الحفظ: لوحة الأرقام العربية على الجوال
       تُخرج «,» و Number("1,5") = NaN — فيصير رقمٌ كُتب صحيحاً فراغاً
       أو صفراً عند أول حساب. */
    onValueChange(decimal ? next.replace(",", ".") : next);
  };

  /* الخروج من الحقل يُظهر القيمة المحفوظة كما هي: «0012» تصير «12»
     و«1.» تصير «1»، فلا يبقى على الشاشة شكلٌ لا يُطابق ما حُفظ. */
  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    setDraft(null);
    onBlur?.(event);
  };

  return (
    <div>
      <input
        {...props}
        id={id}
        type="text"
        inputMode={decimal ? "decimal" : "numeric"}
        value={displayedValue}
        onChange={handleChange}
        onBlur={handleBlur}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : props["aria-describedby"]}
      />
      {error && <p id={errorId} role="alert" className="text-xs font-bold mt-1" style={{ color: "#BE2626" }}>{error}</p>}
    </div>
  );
}
