/* حقل معنون — يربط العنوان بحقله (label htmlFor ↔ input id).

   قبل هذا كانت عناوين النماذج نصّاً مجاوراً لا عنواناً مربوطاً: النقر
   على «رقم الهوية» لا يضع المؤشّر في حقله، وقارئ الشاشة يقرأ الحقل
   «حقل نصّ» بلا اسم — فمن يعتمد عليه يملأ نموذج مستفيد على التخمين.

   المعرّف من useId لا ثابتاً في الشفرة: النموذج نفسه قد يُرسم أكثر من
   مرّة في الصفحة (صفوف متكرّرة، بطاقات في حلقة)، ومعرّفٌ ثابت يجعل
   عنوان الصف الثاني يشير إلى حقل الصف الأول.

   يعيد شِقّاً (fragment) لا صندوقاً: النداءات القائمة داخل <div> يحمل
   تنسيق الشبكة، وإضافة صندوق ثانٍ تكسر التخطيط. */
import { cloneElement, isValidElement, useId, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { B } from "@/lib/theme";

export interface FieldProps {
  label: ReactNode;
  /** نصّ إرشادي تحت الحقل. */
  hint?: ReactNode;
  /** رسالة خطأ — تحلّ محلّ النصّ الإرشادي. */
  error?: string;
  labelClass?: string;
  labelStyle?: CSSProperties;
  children: ReactNode;
}

const DEFAULT_LABEL_CLASS = "block text-xs font-bold mb-1.5";

export function Field({ label, hint, error, labelClass, labelStyle, children }: FieldProps) {
  const auto = useId();
  /* الحقل الذي يحمل معرّفاً أصلاً يُحترم معرّفه: العنوان يشير إليه بدل
     أن يُفرض معرّف ثانٍ فينكسر ما كان مربوطاً. */
  const own = isValidElement(children) ? (children.props as { id?: string }).id : undefined;
  const forId = own ?? auto;
  const child = isValidElement(children) && !own
    ? cloneElement(children as ReactElement<{ id?: string }>, { id: forId })
    : children;

  return (
    <>
      <label htmlFor={forId}
        className={labelClass ?? DEFAULT_LABEL_CLASS}
        style={labelStyle ?? { color: B.text3 }}>{label}</label>
      {child}
      {error
        ? <div className="text-xs font-bold mt-1" style={{ color: "#BE2626" }}>{error}</div>
        : hint ? <div className="text-xs mt-1" style={{ color: B.muted }}>{hint}</div> : null}
    </>
  );
}
