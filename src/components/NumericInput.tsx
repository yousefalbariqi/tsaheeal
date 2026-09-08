import { useId, useState, type ChangeEvent, type ComponentPropsWithoutRef } from "react";

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

const ARABIC_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/;

/**
 * حقل رقمي بلا `type="number"`: لا تظهر معه أسهُم المتصفح، وتبقى لوحة
 * الأرقام على الجوال عبر inputMode. نحتفظ مؤقتاً بالقيمة غير المقبولة كي
 * يراها الموظف مع الرسالة بدلاً من أن تختفي كتابته بلا تفسير.
 */
const toEnglishDigits = (value:string) => value.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, digit => {
  const code=digit.charCodeAt(0);
  return String(code >= 0x06f0 ? code-0x06f0 : code-0x0660);
});

export function NumericInput({ value, onValueChange, decimal = false, normalizeArabicDigits = false, id, onBlur, ...props }: NumericInputProps) {
  const autoErrorId = useId();
  const errorId = `${id ?? autoErrorId}-numeric-error`;
  const [invalidValue, setInvalidValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const allowed = decimal ? /^\d*(?:[.,]\d*)?$/ : /^\d*$/;
  const displayedValue = invalidValue ?? String(value);

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
    onValueChange(next);
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
        onBlur={onBlur}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : props["aria-describedby"]}
      />
      {error && <p id={errorId} role="alert" className="text-xs font-bold mt-1" style={{ color: "#BE2626" }}>{error}</p>}
    </div>
  );
}
