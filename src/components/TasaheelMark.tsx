/* الشعار الرسمي — علامة الكعبة بالخط الكوفي.

   العلامة سوداء، والتطبيق فيه أسطح خضراء داكنة (شريط التطبيق، شاشات
   التحميل، القائمة الجانبية) وأخرى بيضاء (الاستكشاف). فبدل نسختين
   بلونين، تُوضع العلامة دائماً في مربّع أبيض — فتُقرأ على أي خلفية
   ولا يتغيّر شكل الشعار من موضع لآخر.

   الملف /tasaheel-logo.svg مقصوص viewBox‑اً على حدّ العلامة تماماً (المصدر
   في img/ فيه هامش فارغ واسع يجعلها تبدو أصغر من مربّعها بكثير). متجهٌ لا
   نقطية: النسخة القديمة /logo.png كانت 512px تُطلب منها 276px×3 في رأس
   الاستكشاف فتظهر حوافّها مهشّرة. */

export function TasaheelMark({ size = 42, plain = false }: {
  size?: number;
  /** بلا مربّع أبيض — للأسطح البيضاء أصلاً حيث يكفي الشعار وحده. */
  plain?: boolean;
}) {
  const img = (
    <img
      src="/tasaheel-logo.svg" alt="تساهيل العمرة" width={size} height={size}
      style={{
        width: plain ? size : size * 0.74,
        height: plain ? size : size * 0.74,
        objectFit: "contain", display: "block",
      }}
    />
  );
  if (plain) return <div className="flex-shrink-0">{img}</div>;
  return (
    <div className="flex items-center justify-center flex-shrink-0"
      style={{
        width: size, height: size, background: "#FFFFFF",
        borderRadius: size * 0.22,
        // حدّ شعري حتى لا يذوب المربّع الأبيض في سطح أبيض
        border: "1px solid rgba(0,0,0,.07)",
      }}>
      {img}
    </div>
  );
}
