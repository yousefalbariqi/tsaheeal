import { useEffect, useState } from "react";
import { openWhatsApp } from "@/lib/utils";
import { DEFAULT_SETTINGS } from "@/data/settings";
import { usePublicSettings } from "@/data/useSettings";

/* زر واتساب عائم — ثابت أسفل يمين الشاشة في صفحات المستفيد التي لا شريط
   إجراء فيها.

   على الجوال دائرةٌ بالأيقونة وحدها دائماً: الحبّة العريضة كانت تقف على
   النص وبطاقات الآراء فتحجبها. وعلى الشاشة الواسعة يبدأ حبّةً باسمها
   «تواصل معنا» ثم ينكمش دائرةً عند أول تمرير، أو حيث يوجد شريطٌ ثابت. وبلا نبضٍ دائم — هالةٌ خضراء تنبض بلا
   توقف تسحب العين عن الزرّ الذهبي الذي نريدها عليه. والسطح أبيض
   والأخضر في شعار واتساب وحده، كزرّه داخل شريط الإجراء.

   الرقم من الإعدادات لا ثابتاً في الشفرة: تغييره كان يستلزم تعديل
   هذا السطر وإعادة نشر الموقع. الافتراضي هو الرقم القائم نفسه، فمن
   لم ينفّذ ترحيل الإعدادات يرى السلوك السابق حرفياً. */

/** الافتراضي — يُستعمل قبل وصول الإعدادات وفي وضع التجربة. */
export const SUPPORT_PHONE = DEFAULT_SETTINGS.pub.supportPhone;

const STYLE_ID = "ts-wa-fab-style";
const CSS = `
.ts-wa-fab{
  position:fixed; inset-inline-end:16px; z-index:60;
  display:flex; align-items:center; justify-content:center;
  height:56px; min-width:56px; padding:0 13px;
  color:#1FAF54; border:1px solid #E8E2D6; border-radius:999px; background:#fff; cursor:pointer;
  box-shadow:0 8px 22px -8px rgba(20,17,14,.4), 0 1px 2px rgba(20,17,14,.08);
  transition:transform .12s ease-out;
}
.ts-wa-fab:active{ transform:scale(.94); }
.ts-wa-fab-label{
  overflow:hidden; max-width:110px; padding-inline:8px 4px;
  color:#1B1712; font-family:var(--font-app); font-size:15px; font-weight:600; white-space:nowrap;
  transition:max-width .2s ease-out, padding .2s ease-out, opacity .15s ease-out;
}
.ts-wa-fab.is-compact .ts-wa-fab-label{ max-width:0; padding-inline:0; opacity:0; }
@media (max-width: 639px){ .ts-wa-fab-label{ display:none; } }
@media (prefers-reduced-motion: reduce){ .ts-wa-fab,.ts-wa-fab-label{ transition:none; } }
`;

function ensureStyle() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

/** أشرطة الإجراء الثابتة في تطبيق العميل؛ بوجود أحدها يبقى الزرّ دائرة. */
const STICKY_BARS = ".ts-sticky-bar, .ts-flow-footer, .ts-focus-configure-cta";
/** بعد هذا القدر من التمرير تنكمش الحبّة. */
const COMPACT_AFTER = 24;

/* أيقونة واتساب الرسمية — مضمّنة كـSVG فلا طلب شبكة ولا اعتماد على خط. */
export function WhatsAppGlyph({ size = 30 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} fill="currentColor" aria-hidden>
      <path d="M16.004 3.2c-7.06 0-12.8 5.74-12.8 12.8 0 2.26.6 4.47 1.73 6.41L3.2 28.8l6.56-1.7a12.75 12.75 0 0 0 6.24 1.62h.01c7.06 0 12.8-5.74 12.8-12.8 0-3.42-1.33-6.63-3.75-9.05a12.71 12.71 0 0 0-9.05-3.67Zm0 23.06h-.01a10.6 10.6 0 0 1-5.4-1.48l-.39-.23-4.01 1.04 1.07-3.9-.25-.4a10.57 10.57 0 0 1-1.62-5.65c0-5.87 4.78-10.64 10.65-10.64 2.84 0 5.51 1.11 7.52 3.12a10.56 10.56 0 0 1 3.11 7.53c0 5.87-4.78 10.61-10.67 10.61Zm5.84-7.96c-.32-.16-1.89-.93-2.18-1.04-.29-.11-.5-.16-.71.16-.21.32-.82 1.04-1 1.25-.19.21-.37.24-.69.08-.32-.16-1.35-.5-2.57-1.59-.95-.85-1.59-1.89-1.78-2.21-.19-.32-.02-.5.14-.66.14-.14.32-.37.48-.56.16-.19.21-.32.32-.53.11-.21.05-.4-.03-.56-.08-.16-.71-1.72-.98-2.35-.26-.62-.52-.53-.71-.54l-.61-.01c-.21 0-.56.08-.85.4-.29.32-1.11 1.09-1.11 2.65s1.14 3.08 1.3 3.29c.16.21 2.25 3.43 5.44 4.81.76.33 1.35.52 1.82.67.76.24 1.46.21 2.01.13.61-.09 1.89-.77 2.16-1.52.27-.75.27-1.38.19-1.52-.08-.13-.29-.21-.61-.37Z" />
    </svg>
  );
}

export function WhatsAppFab({
  phone,
  message = "السلام عليكم، عندي استفسار عن العمرة",
  bottom = 96,
  label = "تواصل معنا",
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
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    /* القراءة عند التمرير فقط: لا مراقب دائم ولا حساب في كل رسم. */
    const update = () => setCompact(window.scrollY > COMPACT_AFTER || !!document.querySelector(STICKY_BARS));
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  return (
    <button
      type="button"
      onClick={() => openWhatsApp(to, message)}
      aria-label={label}
      title={label}
      className={`ts-wa-fab${compact ? " is-compact" : ""}`}
      style={{ bottom: `calc(${bottom}px + env(safe-area-inset-bottom, 0px))` }}  // عند نهاية السطر (يسار الشاشة في العربية) — قرار يوسف 2026-10-07: على اليمين كان يغطّي السعر في بطاقة الرحلة
    >
      <WhatsAppGlyph/>
      <span className="ts-wa-fab-label" aria-hidden="true">{label}</span>
    </button>
  );
}

/* نسخة داخل شريط الإجراء السفلي. حيث يوجد شريطٌ ثابت أصلاً لا نطفو زراً
   ثانياً فوقه: الزر العائم كان يقف على آخر سطر في «مراجعة السعر» فيحجب
   تفصيل السكن عن الحاجز قبل الدفع مباشرة. هنا يبقى ظاهراً بلا حجب. */
export function WhatsAppInlineButton({
  phone,
  message = "السلام عليكم، عندي استفسار عن العمرة",
  label = "تواصل معنا عبر واتساب",
}: { phone?: string; message?: string; label?: string }) {
  const cfg = usePublicSettings();
  const to = phone || cfg.supportPhone || SUPPORT_PHONE;
  return (
    <button type="button" className="ts-wa-inline" onClick={() => openWhatsApp(to, message)} aria-label={label} title={label}>
      <WhatsAppGlyph size={24}/>
    </button>
  );
}
