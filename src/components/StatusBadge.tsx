/* شارة الحالة — العرض وحده؛ الصياغة واللون من المعجم في lib/status.

   كانت الخريطة هنا وتحمل صياغةً واحدة لكل حالة، فيُقرأ «رحلة مؤكد».
   entity هو ما يحسم التذكير والتأنيث، ويُمرَّر من موضع العرض لأنه
   وحده يعرف ما يوصف. */
import { statusLabel, statusTone, type StatusEntity } from "@/lib/status";

export function StatusBadge({ status, entity = "booking" }: { status: string; entity?: StatusEntity }) {
  const { bg, fg } = statusTone(status);
  const label = statusLabel(status, entity);
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap"
      style={{ background: bg, color: fg }}>
      <span aria-hidden className="w-1.5 h-1.5 rounded-full" style={{ background: fg }} />
      {label}
    </span>
  );
}
