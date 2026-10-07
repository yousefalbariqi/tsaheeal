/* الزرّ — خمسة أنواع وثلاثة أحجام، ولا سادس.

   primary    الفعل الأساسي في المشهد. واحدٌ في الشاشة أو النافذة.
   secondary  كل فعلٍ آخر: أزرار الصفوف، الإلغاء، التصدير.
   ghost      فعلٌ هادئ بجوار غيره — «مسح المرشّحات»، روابط الرأس.
   dark       فعلٌ بنيويّ على سطحٍ فاتح حين يكون الذهبي مستعملاً قربه.
   danger     ما لا يُرجَع عنه. danger-soft لِما يُفتح به حوار التأكيد.

   التنسيق كلّه في src/styles/ui.css (.ui-btn) — هنا الخصائص فقط. */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Spinner } from "@/components/Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "dark" | "danger" | "danger-soft" | "link";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** أيقونة قبل النصّ (في اتجاه القراءة). */
  icon?: ReactNode;
  /** أيقونة بعد النصّ — سهم «التالي» مثلاً. */
  iconEnd?: ReactNode;
  /** يعطّل الزرّ ويضع دوّارةً مكان الأيقونة — النصّ يبقى فلا يقفز العرض. */
  loading?: boolean;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, iconEnd, loading, block, className, children, disabled, type, ...rest }, ref,
) {
  const cls = [
    "ui-btn", `ui-btn--${variant}`,
    size !== "md" && `ui-btn--${size}`,
    block && "ui-btn--block",
    className,
  ].filter(Boolean).join(" ");
  const onDark = variant === "dark" || variant === "danger";
  return (
    <button ref={ref} type={type ?? "button"} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading
        ? <Spinner size={size === "sm" ? 12 : 14} color={onDark ? "#fff" : "#1B1712"} track={onDark ? "rgba(255,255,255,.3)" : "rgba(27,23,18,.2)"} />
        : icon}
      {children}
      {!loading && iconEnd}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** إلزامي: زرٌّ بلا نصّ لا يُسمّى لقارئ الشاشة إلا به، وهو نفسه تلميح المرور. */
  label: string;
  size?: "sm" | "md";
  variant?: "ghost" | "outline" | "on-ink" | "danger";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = "md", variant = "ghost", className, children, type, ...rest }, ref,
) {
  const cls = [
    "ui-iconbtn",
    size === "sm" && "ui-iconbtn--sm",
    variant !== "ghost" && `ui-iconbtn--${variant}`,
    className,
  ].filter(Boolean).join(" ");
  return (
    <button ref={ref} type={type ?? "button"} className={cls} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
});
