/* الشارة — وسمٌ قصير بلون المعنى. الألوان من TONE في lib/theme، لا أرقامٌ
   تُكتب في موضع العرض. شارة الحالة (StatusBadge) تبني عليها. */
import type { CSSProperties, ReactNode } from "react";
import { TONE, type ToneName } from "@/lib/theme";

export function Badge({ tone = "neutral", dot = false, size = "md", outline = false, children, style, className }: {
  tone?: ToneName;
  /** نقطةٌ قبل النصّ — للحالات، حيث اللون نفسه هو الخبر. */
  dot?: boolean;
  size?: "sm" | "md";
  outline?: boolean;
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <span className={["ui-badge", size === "sm" && "ui-badge--sm", className].filter(Boolean).join(" ")}
      style={{ background: t.bg, color: t.fg, ...(outline ? { boxShadow: `inset 0 0 0 1px ${t.line}` } : null), ...style }}>
      {dot && <span aria-hidden className="ui-badge-dot" />}
      {children}
    </span>
  );
}

/** تنبيهٌ مضمَّن داخل نموذج أو بطاقة. */
export function Note({ tone = "neutral", icon, children, className }: {
  tone?: "warn" | "danger" | "success" | "info" | "neutral";
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div role={tone === "danger" ? "alert" : undefined}
      className={["ui-note", `ui-note--${tone}`, className].filter(Boolean).join(" ")}>
      {icon}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
