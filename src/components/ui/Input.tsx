/* الحقل النصّي ومنطقة النصّ — الصنف .ui-input يحمل الحدّ وإطار التركيز
   وحالتَي الخطأ والتعطيل. `invalid` يُترجَم إلى aria-invalid، وهو نفسه ما
   يقرؤه التنسيق: الحالة البصرية وحالة قارئ الشاشة لا تفترقان. */
import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  invalid?: boolean;
  size?: "sm" | "md";
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, size = "md", className, ...rest }, ref,
) {
  return (
    <input ref={ref} aria-invalid={invalid || undefined}
      className={["ui-input", size === "sm" && "ui-input--sm", className].filter(Boolean).join(" ")} {...rest} />
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, className, rows = 3, ...rest }, ref,
) {
  return (
    <textarea ref={ref} rows={rows} aria-invalid={invalid || undefined}
      className={["ui-input", className].filter(Boolean).join(" ")} {...rest} />
  );
});

/** الصنف وحده — لحقلٍ قائمٍ يُراد توحيده بلا استبدال العنصر. */
export const inputClass = "ui-input";
