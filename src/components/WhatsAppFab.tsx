import { openWhatsApp } from "@/lib/utils";
import { DEFAULT_SETTINGS } from "@/data/settings";
import { usePublicSettings } from "@/data/useSettings";

/* زر واتساب عائم — ثابت أسفل يمين الشاشة في كل صفحات المستفيد.
   النبض يتوقف مع تفضيل «تقليل الحركة» في النظام.

   الرقم من الإعدادات لا ثابتاً في الشفرة: تغييره كان يستلزم تعديل
   هذا السطر وإعادة نشر الموقع. الافتراضي هو الرقم القائم نفسه، فمن
   لم ينفّذ ترحيل الإعدادات يرى السلوك السابق حرفياً. */

/** الافتراضي — يُستعمل قبل وصول الإعدادات وفي وضع التجربة. */
export const SUPPORT_PHONE = DEFAULT_SETTINGS.pub.supportPhone;

const STYLE_ID = "ts-wa-fab-style";
const CSS = `
@keyframes ts-wa-pulse{
  0%   { box-shadow: 0 0 0 0 rgba(37,211,102,.45); }
  70%  { box-shadow: 0 0 0 14px rgba(37,211,102,0); }
  100% { box-shadow: 0 0 0 0 rgba(37,211,102,0); }
}
.ts-wa-fab{ animation: ts-wa-pulse 2.4s ease-out infinite; }
.ts-wa-fab:active{ transform: scale(.94); }
@media (prefers-reduced-motion: reduce){ .ts-wa-fab{ animation: none; } }
`;

function ensureStyle() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

export function WhatsAppFab({
  phone,
  message = "السلام عليكم، عندي استفسار عن العمرة",
  bottom = 96,
  label = "تواصل معنا عبر واتساب",
}: {
  /** يُمرَّر لتجاوز رقم الإعدادات؛ وبلا تمرير يُقرأ منها. */
  phone?: string;
  message?: string;
  /** ارتفاعه عن أسفل الشاشة — يُرفع فوق الشريط السفلي حيث يوجد. */
  bottom?: number;
  label?: string;
}) {
  ensureStyle();
  const cfg = usePublicSettings();
  const to = phone || cfg.supportPhone || SUPPORT_PHONE;
  return (
    <button
      onClick={() => openWhatsApp(to, message)}
      aria-label={label}
      title={label}
      className="ts-wa-fab flex items-center justify-center"
      style={{
        position: "fixed",
        right: 16,   // يمين الشاشة فعلياً في كل الاتجاهات — لا يتبع RTL
        bottom: `calc(${bottom}px + env(safe-area-inset-bottom, 0px))`,
        width: 54, height: 54, borderRadius: "50%",
        background: "#25D366", border: "none", cursor: "pointer",
        zIndex: 60, padding: 0, transition: "transform .12s ease",
      }}
    >
      {/* أيقونة واتساب الرسمية — مضمّنة كـSVG فلا طلب شبكة ولا اعتماد على خط */}
      <svg viewBox="0 0 32 32" width={30} height={30} fill="#fff" aria-hidden>
        <path d="M16.004 3.2c-7.06 0-12.8 5.74-12.8 12.8 0 2.26.6 4.47 1.73 6.41L3.2 28.8l6.56-1.7a12.75 12.75 0 0 0 6.24 1.62h.01c7.06 0 12.8-5.74 12.8-12.8 0-3.42-1.33-6.63-3.75-9.05a12.71 12.71 0 0 0-9.05-3.67Zm0 23.06h-.01a10.6 10.6 0 0 1-5.4-1.48l-.39-.23-4.01 1.04 1.07-3.9-.25-.4a10.57 10.57 0 0 1-1.62-5.65c0-5.87 4.78-10.64 10.65-10.64 2.84 0 5.51 1.11 7.52 3.12a10.56 10.56 0 0 1 3.11 7.53c0 5.87-4.78 10.61-10.67 10.61Zm5.84-7.96c-.32-.16-1.89-.93-2.18-1.04-.29-.11-.5-.16-.71.16-.21.32-.82 1.04-1 1.25-.19.21-.37.24-.69.08-.32-.16-1.35-.5-2.57-1.59-.95-.85-1.59-1.89-1.78-2.21-.19-.32-.02-.5.14-.66.14-.14.32-.37.48-.56.16-.19.21-.32.32-.53.11-.21.05-.4-.03-.56-.08-.16-.71-1.72-.98-2.35-.26-.62-.52-.53-.71-.54l-.61-.01c-.21 0-.56.08-.85.4-.29.32-1.11 1.09-1.11 2.65s1.14 3.08 1.3 3.29c.16.21 2.25 3.43 5.44 4.81.76.33 1.35.52 1.82.67.76.24 1.46.21 2.01.13.61-.09 1.89-.77 2.16-1.52.27-.75.27-1.38.19-1.52-.08-.13-.29-.21-.61-.37Z" />
      </svg>
    </button>
  );
}
