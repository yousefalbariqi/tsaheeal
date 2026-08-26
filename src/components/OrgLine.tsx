/* سطر بيانات المؤسسة — الاسم والسجل التجاري والنطاق.

   كان مكتوباً حرفياً في أربعة مواضع: الفاتورة، التذكرة، صفحة الدفع،
   وإشعار الإلغاء. تغيير السجل التجاري كان يعني تعديل أربعة ملفّات،
   ونسيان واحدٍ منها يُصدر مستنداً برقمٍ مخالف — وهي مستندات رسمية.

   يقرأ من الإعدادات ويسقط على الافتراضات القائمة نفسها. */
import { usePublicSettings } from "@/data/useSettings";

export function OrgLine({ style, className }: { style?: React.CSSProperties; className?: string }) {
  const s = usePublicSettings();
  return (
    <span style={style} className={className}>
      {s.orgName} · السجل التجاري: {s.crNumber} · {s.domain}
    </span>
  );
}

/** الاسم والسجل وحدهما — ترويسة الفاتورة تعرض المدينة بدل النطاق. */
export function OrgCr({ suffix }: { suffix?: string }) {
  const s = usePublicSettings();
  return <>السجل التجاري: {s.crNumber}{suffix ? ` · ${suffix}` : ""}</>;
}
