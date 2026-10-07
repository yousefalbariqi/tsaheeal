/* قشرة خطوات المسار — بنمط لقطات Airbnb (موبايل 390px):
   رأس بلا لون: ✕ لإغلاق المسار وسهم للرجوع، ثم سطر التقدّم وعنوان كبير
   وسطر رمادي، وأسفل الشاشة زر عريض ثابت.

   في RTL: الرجوع في inline-start (يمين الشاشة) والسهم يُقلَب فيشير ←
   للخلف، والـ✕ في inline-end (يسار الشاشة) — كما في اللقطات بالضبط.
   لا يُعاد استخدام Sheet من kit.tsx هنا: الـ✕ فيه أول ابن flex فيظهر
   في الجهة المقابلة. */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X, ArrowLeft, AlertCircle, Eye, EyeOff } from "lucide-react";
import { TONE } from "@/lib/theme";
import { C, T, SPACE, R, FONT, STICKY_H, flipRTL } from "./tokens";
import { useDir, CTAButton } from "./kit";
import { Spinner } from "@/components/Spinner";
import { makeT } from "../i18n";

/** خطوات المسار كما يراها العميل: اختار رحلته (صفحة التفاصيل)، ثم
    بياناته، ثم المراجعة. لا خطوة دخول — مسار الحجز بلا تسجيل. */
export const FLOW_STEPS = ["stepTrip", "stepYou", "stepConfirm"] as const;
export type FlowStep = 1 | 2 | 3;

/* لغة القشرة من اتجاهها: لا سياق لغةٍ في الشجرة، والاتجاه يكفي ما دامت
   اللغتان عربيةً وإنجليزية. يُستعمل لأسماء الأزرار وسطر التقدّم وحدها. */
const useShellT = () => {
  const dir = useDir();
  return makeT(dir === "rtl" ? "ar" : "en");
};

/** ٠-٩ و۰-۹ إلى 0-9. لوحة المفاتيح العربية تكتب الأرقام هندية، والحقول
    الرقمية كانت تحذفها بصمت فيكتب العميل ولا يظهر شيء. تطبيعُ إدخالٍ
    لا تغييرُ قاعدة تحقّق. */
export const toLatinDigits = (v: string) => v
  .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
  .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));

/** ينقل الشاشة إلى أول حقلٍ خاطئ ويضع المؤشّر فيه. يُنادى بعد محاولة
    متابعةٍ فاشلة — القفز إلى أعلى الصفحة كان يترك العميل يبحث عن الخطأ. */
export function focusFirstInvalid(root: ParentNode = document) {
  /* مهلةٌ قصيرة: علامات الخطأ تُرسم بعد تحديث الحالة الذي سبق النداء. */
  window.setTimeout(() => {
    const el = root.querySelector<HTMLElement>('.ts-flow-body [aria-invalid="true"]');
    if (!el) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    try { el.focus({ preventScroll: true }); } catch { /* عنصر لا يقبل التركيز */ }
  }, 60);
}

export function FlowScreen({
  onBack, onClose, title, subtitle, align = "start", step, hero,
  cta, ctaLabel, ctaDisabled, ctaBusy, secondary, error, children, variant,
}: {
  onBack?: () => void;
  onClose?: () => void;
  title: string;
  subtitle?: ReactNode;
  align?: "start" | "center";
  step?: FlowStep;
  /** ما يعلو العنوان — علامة النجاح مثلاً. */
  hero?: ReactNode;
  cta?: () => void;
  ctaLabel?: string;
  ctaDisabled?: boolean;
  ctaBusy?: boolean;
  /** يظهر تحت الزر الأساسي — «تجربة طريقة أخرى» مثلاً. */
  secondary?: ReactNode;
  error?: string;
  children?: ReactNode;
  variant?: "auth" | "account";
}) {
  const dir = useDir();
  const t = useShellT();
  const [scrolled, setScrolled] = useState(false);
  const topRef = useRef<HTMLDivElement | null>(null);

  /* حدّ الرأس يظهر عند التمرير فقط — كما عندهم؛ ورأس بحدّ دائم يبدو
     ثقيلاً على شاشة قصيرة كشاشة الرمز. */
  useEffect(() => {
    const el = topRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setScrolled(!e.isIntersecting), { threshold: 1 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const hasBar = !!cta || !!secondary;
  const centered = align === "center";

  return (
    <div className={`ts-flow-screen${variant === "auth" ? " ts-flow-auth" : ""}${variant === "account" ? " ts-flow-account" : ""} flex flex-col flex-1`} style={{ background: C.white, minHeight: "100%" }}>
      {/* ═══ الرأس ═══ */}
      <div className="ts-flow-header tsf-header sticky top-0 z-30 flex items-center"
        style={{
          background: C.white, paddingInline: SPACE.page - 10, gap: 8,
          borderBottom: `1px solid ${scrolled ? C.line : "transparent"}`,
          transition: "border-color .18s",
        }}>
        {onBack && (
          <button type="button" onClick={onBack} aria-label={t("back")} className="tsf-icon-btn">
            <ArrowLeft size={22} style={flipRTL(dir)} />
          </button>
        )}
        {onClose && (
          <button type="button" onClick={onClose} aria-label={t("close")} className="tsf-icon-btn" style={{ marginInlineStart: "auto" }}>
            <X size={22} />
          </button>
        )}
      </div>
      <div ref={topRef} style={{ height: 1, flexShrink: 0 }} />

      {/* ═══ الجسم ═══ */}
      <div className="ts-flow-body flex-1 flex flex-col"
        style={{ paddingInline: SPACE.page, paddingTop: 8, paddingBottom: hasBar ? STICKY_H + (secondary ? 56 : 0) : 24 }}>
        {step && <ProgressSegments step={step} />}
        {hero && <div className="flex justify-center" style={{ marginBottom: 20 }}>{hero}</div>}
        <h1 style={{ ...T.h1, fontSize: 28, color: C.ink, margin: 0, textAlign: centered ? "center" : "start" }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ ...T.body, fontSize: 15, color: C.ink2, margin: "10px 0 0", textAlign: centered ? "center" : "start" }}>
            {subtitle}
          </p>
        )}
        <div className="flex flex-col" style={{ gap: 16, marginTop: 24 }}>{children}</div>

        {error && <ErrorBox>{error}</ErrorBox>}
      </div>

      {/* ═══ الشريط السفلي ═══ */}
      {hasBar && (
        <div className="ts-flow-footer tsf-footer sticky bottom-0 z-30 flex flex-col"
          style={{
            background: C.white, borderTop: `1px solid ${C.line}`,
            paddingInline: SPACE.page, paddingTop: 12, gap: 8,
            paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
          }}>
          {cta && (
            <CTAButton full onClick={cta} disabled={ctaDisabled || ctaBusy}>
              {/* الدوّار بلون الحبر: الزرّ المعطّل أثناء الإرسال سطحه فاتح،
                  والأبيض عليه لا يُرى. */}
              {ctaBusy && <Spinner size={15} track="rgba(27,23,18,.18)" color={C.ink} />}
              {ctaLabel}
            </CTAButton>
          )}
          {secondary}
        </div>
      )}
    </div>
  );
}

/** صندوق الخطأ — أحمر المعنى من TONE، بأيقونة، ويُعلَن لقارئ الشاشة. */
export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="flex items-start" style={{
      marginTop: 16, gap: 10, borderRadius: R.chip, padding: "12px 14px", ...T.meta,
      background: TONE.danger.bg, border: `1px solid ${TONE.danger.line}`, color: TONE.danger.fg,
    }}>
      <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{children}</span>
    </div>
  );
}

/** سطر التقدّم: «الخطوة 2 من 3 · بياناتك» فوق ثلاث شرائح. المنجزة سوداء
    والحالية ذهبية والقادمة باهتة — فالخطوة الثانية لا تبدو «ثلثين
    مكتملين» كما كانت حين لُوّنت الحالية بلون المنجزة. */
export function ProgressSegments({ step }: { step: FlowStep }) {
  const t = useShellT();
  const total = FLOW_STEPS.length;
  const label = t("stepOfN").replace("{n}", String(step)).replace("{m}", String(total));
  return (
    <div style={{ marginBottom: 18 }}
      role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step}
      aria-valuetext={`${label} · ${t(FLOW_STEPS[step - 1])}`}>
      <div className="flex items-center" style={{ gap: 6, ...T.meta, fontSize: 13, color: C.ink2 }}>
        <span>{label}</span>
        <span aria-hidden>·</span>
        <span style={{ color: C.ink, fontWeight: 600 }}>{t(FLOW_STEPS[step - 1])}</span>
      </div>
      {/* flex يتبع اتجاه الصفحة، فالشريحة الأولى في جهة بداية القراءة بلا عكسٍ يدوي. */}
      <div className="flex" style={{ gap: 5, marginTop: 8 }} aria-hidden>
        {FLOW_STEPS.map((_, i) => (
          <div key={i} style={{
            flex: 1, height: 4, borderRadius: 2,
            background: i + 1 < step ? C.ink : i + 1 === step ? C.gold : C.line,
          }} />
        ))}
      </div>
    </div>
  );
}

/* ── حقول بنمطهم ──────────────────────────────────────────────── */

/* حلقة التركيز على الصندوق لا على الحقل الداخلي: الحقل بلا حدّ، والقاعدة
   العامة للحقول ترسم هالتها عليه فتظهر حلقةٌ داخل الصندوق. لذلك تُطفأ
   على الداخل (boxShadow:none) وتُرسم هنا بالقيم نفسها. */
const FOCUS_RING = "0 0 0 3px rgba(192,134,44,.28)";

/** مجموعة حقول ملتصقة بإطار واحد وفاصل بينها — «البريد / كلمة المرور». */
export function InputStack({ children }: { children: ReactNode }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: R.chip, background: C.white }}>
      {children}
    </div>
  );
}

/** صف داخل InputStack: عنوان صغير فوق القيمة داخل نفس الصندوق.
    حقل كلمة المرور يحمل زرّ إظهار/إخفاء — من يكتب على الجوال لا يرى ما كتب. */
export function StackField({
  label, value, onChange, placeholder, error, last, ltr, type = "text", inputMode, maxLength, readOnly, badge,
  autoComplete, enterKeyHint, name, onEnter,
}: {
  label: string; value: string; onChange?: (v: string) => void;
  placeholder?: string; error?: string; last?: boolean; ltr?: boolean;
  type?: string; inputMode?: "text" | "tel" | "numeric" | "email";
  maxLength?: number; readOnly?: boolean; badge?: ReactNode;
  autoComplete?: string; name?: string;
  enterKeyHint?: "next" | "done" | "go" | "send";
  onEnter?: () => void;
}) {
  const dir = useDir();
  const t = useShellT();
  const [focus, setFocus] = useState(false);
  const [shown, setShown] = useState(false);
  const isPassword = type === "password";
  /* العنوان كان نصّاً مجاوراً: النقر عليه لا يضع المؤشّر في الحقل،
     وقارئ الشاشة يقرأ الحقل بلا اسم — في نموذج الاسم القانوني
     والبريد، حيث الحقلان متجاوران بلا فارق ظاهر لمن لا يرى. */
  const uid = useId();
  const fieldId = `${uid}-f`, errId = `${uid}-e`;
  /* البريد وكلمة المرور لاتينيّان دائماً: يُكتبان من اليسار ويُحاذيان لبداية السطر. */
  const latin = ltr || isPassword || type === "email";
  return (
    <div style={{
      position: "relative", padding: "10px 14px 9px", minHeight: 60,
      borderBottom: last ? "none" : `1px solid ${C.border}`,
      background: readOnly ? C.fill : "transparent",
      boxShadow: focus ? `inset 0 0 0 1.5px ${C.gold}, ${FOCUS_RING}` : error ? `inset 0 0 0 1.5px ${C.danger}` : undefined,
      borderRadius: R.chip - 1,
      zIndex: focus ? 1 : undefined,
    }}>
      <div className="flex items-center justify-between" style={{ gap: 8 }}>
        <label htmlFor={fieldId} style={{ ...T.small, fontSize: 13, color: C.ink2, fontWeight: 400 }}>{label}</label>
        {badge}
      </div>
      <div className="flex items-center" style={{ gap: 8 }}>
        <input
          id={fieldId} name={name}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId : undefined}
          value={value} onChange={e => onChange?.(e.target.value)} placeholder={placeholder}
          type={isPassword && shown ? "text" : type} inputMode={inputMode} maxLength={maxLength} readOnly={readOnly}
          autoComplete={autoComplete} enterKeyHint={enterKeyHint}
          autoCapitalize={latin ? "none" : undefined} spellCheck={latin ? false : undefined}
          onKeyDown={e => { if (e.key === "Enter") onEnter?.(); }}
          onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          style={{
            flex: 1, minWidth: 0, border: "none", outline: "none", boxShadow: "none", background: "transparent",
            fontFamily: FONT.sans, fontSize: 16, color: C.ink, padding: 0, marginTop: 2, height: 26,
            ...(latin ? { direction: "ltr" as const, textAlign: dir === "rtl" ? ("right" as const) : ("left" as const) } : {}),
          }}
        />
        {isPassword && (
          <button type="button" onClick={() => setShown(v => !v)}
            aria-label={t(shown ? "hidePassword" : "showPassword")} aria-pressed={shown}
            className="tsf-icon-btn" style={{ marginBlock: -14, marginInlineEnd: -10, color: C.ink2 }}>
            {shown ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        )}
      </div>
      {/* رسالة الخطأ إن كانت نصّاً — بعض النداءات تمرّر مسافة كعلامة
          خطأ بصرية فقط، فلا يُعلَن للقارئ نصٌّ فارغ. */}
      {error && error.trim() &&
        <div id={errId} style={{ ...T.small, color: C.danger, marginTop: 4 }}>{error}</div>}
    </div>
  );
}

/** حقل الجوال بلاصقة الدولة الثابتة — كما في نموذج الدخول عندهم.
    لا يوجد أي حقل مماثل في المشروع، وكل الأرقام تُقرأ LTR داخل RTL. */
export function PhoneField({ value, onChange, error, placeholder = "5X XXX XXXX", onEnter }: {
  value: string; onChange: (v: string) => void; error?: string; placeholder?: string; onEnter?: () => void;
}) {
  const t = useShellT();
  const [focus, setFocus] = useState(false);
  const uid = useId();
  const errId = `${uid}-e`;
  return (
    <div>
      <div className="flex items-stretch" dir="ltr"
        style={{
          border: `1px solid ${error ? C.danger : focus ? C.gold : C.border}`, borderRadius: R.chip,
          boxShadow: focus ? FOCUS_RING : undefined, overflow: "hidden", background: C.white,
          transition: "border-color .15s, box-shadow .15s",
        }}>
        <div className="flex items-center flex-shrink-0"
          style={{ paddingInline: 14, borderInlineEnd: `1px solid ${C.border}`, background: C.fill, gap: 6, ...T.body, color: C.ink }}>
          <span aria-hidden style={{ fontSize: 17 }}>🇸🇦</span>
          <span style={{ fontFamily: FONT.mono }}>+966</span>
        </div>
        <input
          aria-label={t("phone")} name="tel"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId : undefined}
          value={value} type="tel" inputMode="tel" maxLength={12} placeholder={placeholder}
          autoComplete="tel-national" enterKeyHint="go"
          /* الأرقام الهندية تُحوَّل قبل الحذف: كانت تُحذف مع غير الأرقام فلا يظهر ما يُكتب. */
          onChange={e => onChange(toLatinDigits(e.target.value).replace(/[^\d ]/g, ""))}
          onKeyDown={e => { if (e.key === "Enter") onEnter?.(); }}
          onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          style={{
            flex: 1, minWidth: 0, border: "none", outline: "none", boxShadow: "none", background: "transparent",
            fontFamily: FONT.sans, fontSize: 17, color: C.ink, height: 56, paddingInline: 14,
            direction: "ltr", textAlign: "left",
          }}
        />
      </div>
      {error && <div id={errId} style={{ ...T.small, fontSize: 13, color: C.danger, marginTop: 6, textAlign: "start" }}>{error}</div>}
    </div>
  );
}

/** عنوان قسم فوق حقل (أو مجموعة) ونص إرشادي تحته يتحوّل إلى خطأ. */
export function Labeled({ label, hint, bad, children }: {
  label: string; hint?: string; bad?: boolean; children: ReactNode;
}) {
  /* عنوان مجموعة لا عنوان حقل: أبناؤه صندوق حقول (InputStack) أو ثلاث
     قوائم تاريخ. group + aria-labelledby يجعل قارئ الشاشة يعلن «الاسم
     القانوني، مجموعة» قبل حقلَي الأول والأخير، بدل حقلين بلا نسبة.
     htmlFor هنا لا يربط شيئاً — لا عنصر واحداً يشير إليه. */
  const uid = useId();
  const labelId = `${uid}-l`, hintId = `${uid}-h`;
  return (
    <div className="flex flex-col" style={{ gap: 8 }}>
      <div id={labelId} style={{ ...T.h3, fontSize: 15, color: C.ink }}>{label}</div>
      <div role="group" aria-labelledby={labelId} aria-describedby={hint ? hintId : undefined}
        className="flex flex-col" style={{ gap: 8 }}>
        {children}
      </div>
      {hint && <div id={hintId} style={{ ...T.small, fontSize: 13, fontWeight: 400, color: bad ? C.danger : C.ink2 }}>{hint}</div>}
    </div>
  );
}

/** رابط نصّي بخط سفلي — «إرسال رمز جديد» و«قراءة الشروط».
    مساحة اللمس 44px والنصّ يبقى في مكانه: الحشوة تُعوَّض بهامش سالب. */
export function TextLink({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      style={{
        background: "none", border: "none", minHeight: 44, paddingInline: 6, marginInline: -6,
        cursor: disabled ? "default" : "pointer",
        fontFamily: FONT.sans, fontSize: 15, fontWeight: 600,
        color: disabled ? C.ink3 : C.ink, textDecoration: disabled ? "none" : "underline", textUnderlineOffset: 3,
      }}>
      {children}
    </button>
  );
}
