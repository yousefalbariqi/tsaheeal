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

/** الاسم والسجل وحدهما — ترويسة الفاتورة تعرض المدينة بدل النطاق.

    `suffix` كان يُمرَّر نصّاً من موضع الاستدعاء، وكان في الفاتورة
    «الرياض» مكتوبةً بينما الفرع في الدمّام. صار افتراضُه مدينةَ
    الإعدادات، ولا يُمرَّر إلا حين يكون للمستند مصدرٌ أخصّ (فرع الرحلة).
    وحين لا مدينة مضبوطة لا يُطبع فاصلٌ معلّق بلا ما بعده. */
export function OrgCr({ suffix }: { suffix?: string }) {
  const s = usePublicSettings();
  const tail = (suffix ?? s.address.city).trim();
  return <>السجل التجاري: {s.crNumber}{tail ? ` · ${tail}` : ""}</>;
}

/** الرقم الضريبي — لا يُطبع سطرُه إن لم تكن المنشأة مسجّلة. */
export function OrgVat() {
  const s = usePublicSettings();
  return s.vatNumber ? <>الرقم الضريبي: {s.vatNumber}</> : null;
}

/** عنوان المُصدِر سطراً واحداً: العنوان ثم المدينة. */
export function OrgAddressLine() {
  const s = usePublicSettings();
  const parts = [s.address.line, s.address.city].map(x => x.trim()).filter(Boolean);
  return parts.length ? <>{parts.join("، ")}</> : null;
}
