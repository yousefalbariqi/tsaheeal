/* شارة الحالة — العرض وحده؛ الصياغة واللون من المعجم في lib/status.

   كانت الخريطة هنا وتحمل صياغةً واحدة لكل حالة، فيُقرأ «رحلة مؤكد».
   entity هو ما يحسم التذكير والتأنيث، ويُمرَّر من موضع العرض لأنه
   وحده يعرف ما يوصف. */
import { statusLabel, statusTone, type StatusEntity } from "@/lib/status";

export function StatusBadge({ status, entity = "booking", size = "md" }: { status: string; entity?: StatusEntity; size?: "sm" | "md" }) {
  const { bg, fg } = statusTone(status);
  const label = statusLabel(status, entity);
  return (
    <span className={`ui-badge${size === "sm" ? " ui-badge--sm" : ""}`} style={{ background: bg, color: fg }}>
      <span aria-hidden className="ui-badge-dot" />
      {label}
    </span>
  );
}
