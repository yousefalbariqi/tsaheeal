/* قشرة خطوات المسار — بنمط لقطات Airbnb (موبايل 390px):
   رأس بلا لون: ✕ لإغلاق المسار وسهم للرجوع، ثم عنوان كبير وسطر رمادي،
   وأسفل الشاشة شرائح تقدّم فوق زر عريض ثابت.

   في RTL: الرجوع في inline-start (يمين الشاشة) والسهم يُقلَب فيشير ←
   للخلف، والـ✕ في inline-end (يسار الشاشة) — كما في اللقطات بالضبط.
   لا يُعاد استخدام Sheet من kit.tsx هنا: الـ✕ فيه أول ابن flex فيظهر
   في الجهة المقابلة. */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X, ArrowLeft } from "lucide-react";
import { C, T, SPACE, R, FONT, SHADOW, STICKY_H, flipRTL } from "./tokens";
import { useDir, CTAButton } from "./kit";
import { Spinner } from "@/components/Spinner";

/** خطوات المسار بعد صفحة التفاصيل — تُعرض كشرائح لا كأرقام. */
export const FLOW_STEPS = ["stepLogin", "stepData", "stepSeats", "stepConfirm"] as const;
export type FlowStep = 1 | 2 | 3 | 4;

export function FlowScreen({
  onBack, onClose, title, subtitle, align = "start", step,
  cta, ctaLabel, ctaDisabled, ctaBusy, secondary, error, children,
}: {
  onBack?: () => void;
  onClose?: () => void;
  title: string;
  subtitle?: ReactNode;
  align?: "start" | "center";
  step?: FlowStep;
  cta?: () => void;
  ctaLabel?: string;
  ctaDisabled?: boolean;
  ctaBusy?: boolean;
  /** يظهر تحت الزر الأساسي — «تجربة طريقة أخرى» مثلاً. */
  secondary?: ReactNode;
  error?: string;
  children?: ReactNode;
}) {
  const dir = useDir();
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

  const hasBar = !!cta || !!secondary || !!step;

  return (
    <div className="flex flex-col flex-1" style={{ background: C.white, minHeight: "100%" }}>
      {/* ═══ الرأس ═══ */}
      <div className="sticky top-0 z-30 flex items-center"
        style={{
          background: C.white, paddingInline: SPACE.page, height: 60, gap: 8,
          borderBottom: `1px solid ${scrolled ? C.line : "transparent"}`,
          transition: "border-color .18s",
        }}>
        {onBack && (
          <button onClick={onBack} aria-label="رجوع"
            style={{ background: "none", border: "none", padding: 6, marginInlineStart: -6, cursor: "pointer", color: C.ink, display: "flex" }}>
            <ArrowLeft size={22} style={flipRTL(dir)} />
          </button>
        )}
        {onClose && (
          <button onClick={onClose} aria-label="إغلاق"
            style={{ background: "none", border: "none", padding: 6, marginInlineStart: "auto", marginInlineEnd: -6, cursor: "pointer", color: C.ink, display: "flex" }}>
            <X size={22} />
          </button>
        )}
      </div>
      <div ref={topRef} style={{ height: 1, flexShrink: 0 }} />

      {/* ═══ الجسم ═══ */}
      <div className="flex-1 flex flex-col"
        style={{ paddingInline: SPACE.page, paddingTop: 12, paddingBottom: hasBar ? STICKY_H : 24 }}>
        <h1 style={{ ...T.h1, fontSize: 28, color: C.ink, margin: 0, textAlign: align === "center" ? "center" : "start" }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ ...T.meta, color: C.ink2, margin: "10px 0 0", textAlign: align === "center" ? "center" : "start" }}>
            {subtitle}
          </p>
        )}
        <div className="flex flex-col" style={{ gap: 16, marginTop: 24 }}>{children}</div>

        {error && (
          <div style={{
            marginTop: 16, borderRadius: R.button, padding: "12px 14px", ...T.meta, fontWeight: 500,
            background: C.dangerTint, border: `1px solid ${C.danger}33`, color: C.danger,
          }}>{error}</div>
        )}
      </div>

      {/* ═══ الشريط السفلي ═══ */}
      {hasBar && (
        <div className="sticky bottom-0 z-30 flex flex-col"
          style={{
            background: C.white, borderTop: `1px solid ${C.line}`, boxShadow: SHADOW.sheet,
            paddingInline: SPACE.page, paddingTop: step ? 0 : 12, gap: 10,
            paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
          }}>
          {step && <ProgressSegments step={step} />}
          {cta && (
            <CTAButton full onClick={cta} disabled={ctaDisabled || ctaBusy}>
              {ctaBusy && (
                <Spinner size={15} track="rgba(255,255,255,.35)" color={C.white} />
              )}
              {ctaLabel}
            </CTAButton>
          )}
          {secondary}
        </div>
      )}
    </div>
  );
}

/** أربع شرائح رفيعة أعلى الشريط السفلي — تقدّم بلا أرقام ولا نص. */
export function ProgressSegments({ step }: { step: FlowStep }) {
  const dir = useDir();
  /* الترتيب بعكس DOM في RTL لا بـtransform — الأخير يعكس ظلال العناصر
     وحدودها أيضاً، وهي نفس حيلة StepRow في kit.tsx. */
  const bars = FLOW_STEPS.map((_, i) => (
    <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i < step ? C.ink : C.line }} />
  ));
  return (
    <div className="flex" style={{ gap: 6, paddingBlock: 12 }} aria-hidden>
      {dir === "rtl" ? bars.reverse() : bars}
    </div>
  );
}

/* ── حقول بنمطهم ──────────────────────────────────────────────── */

/** مجموعة حقول ملتصقة بإطار واحد وفاصل بينها — «الاسم الأول / اسم
    العائلة» في اللقطة الثانية. الحقل المُركَّز يرتفع بإطار داكن. */
export function InputStack({ children }: { children: ReactNode }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: R.chip, overflow: "hidden" }}>
      {children}
    </div>
  );
}

/** صف داخل InputStack: عنوان صغير فوق القيمة داخل نفس الصندوق. */
export function StackField({
  label, value, onChange, placeholder, error, last, ltr, type = "text", inputMode, maxLength, readOnly, badge,
}: {
  label: string; value: string; onChange?: (v: string) => void;
  placeholder?: string; error?: string; last?: boolean; ltr?: boolean;
  type?: string; inputMode?: "text" | "tel" | "numeric" | "email";
  maxLength?: number; readOnly?: boolean; badge?: ReactNode;
}) {
  const dir = useDir();
  const [focus, setFocus] = useState(false);
  /* العنوان كان نصّاً مجاوراً: النقر عليه لا يضع المؤشّر في الحقل،
     وقارئ الشاشة يقرأ الحقل بلا اسم — في نموذج الاسم القانوني
     والبريد، حيث الحقلان متجاوران بلا فارق ظاهر لمن لا يرى. */
  const uid = useId();
  const fieldId = `${uid}-f`, errId = `${uid}-e`;
  return (
    <div style={{
      position: "relative", padding: "10px 14px 8px",
      borderBottom: last ? "none" : `1px solid ${C.border}`,
      background: readOnly ? C.fill : C.white,
      boxShadow: focus ? `inset 0 0 0 2px ${C.ink}` : error ? `inset 0 0 0 1.5px ${C.danger}` : undefined,
      borderRadius: focus || error ? R.chip : undefined,
    }}>
      <div className="flex items-center justify-between" style={{ gap: 8 }}>
        <label htmlFor={fieldId} style={{ ...T.small, color: C.ink2, fontWeight: 400 }}>{label}</label>
        {badge}
      </div>
      <input
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errId : undefined}
        value={value} onChange={e => onChange?.(e.target.value)} placeholder={placeholder}
        type={type} inputMode={inputMode} maxLength={maxLength} readOnly={readOnly}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{
          width: "100%", border: "none", outline: "none", background: "transparent",
          fontFamily: FONT.sans, fontSize: 16, color: C.ink, padding: 0, marginTop: 2,
          ...(ltr ? { direction: "ltr" as const, textAlign: dir === "rtl" ? ("right" as const) : ("left" as const) } : {}),
        }}
      />
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
  const dir = useDir();
  const [focus, setFocus] = useState(false);
  const ring = focus ? `0 0 0 2px ${C.ink}` : undefined;
  const uid = useId();
  const errId = `${uid}-e`;
  return (
    <div>
      <div className="flex items-stretch" dir="ltr"
        style={{
          border: `1px solid ${error ? C.danger : C.border}`, borderRadius: R.chip,
          boxShadow: ring, overflow: "hidden", background: C.white,
        }}>
        <div className="flex items-center flex-shrink-0"
          style={{ paddingInline: 14, borderInlineEnd: `1px solid ${C.border}`, background: C.fill, gap: 6, ...T.body, color: C.ink }}>
          <span aria-hidden style={{ fontSize: 17 }}>🇸🇦</span>
          <span style={{ fontFamily: FONT.mono, fontWeight: 600 }}>+966</span>
        </div>
        <input
          aria-label="رقم الجوال"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId : undefined}
          value={value} inputMode="tel" maxLength={12} placeholder={placeholder}
          onChange={e => onChange(e.target.value.replace(/[^\d ]/g, ""))}
          onKeyDown={e => { if (e.key === "Enter") onEnter?.(); }}
          onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          style={{
            flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent",
            fontFamily: FONT.sans, fontSize: 17, color: C.ink, height: 56, paddingInline: 14,
            direction: "ltr", textAlign: "left",
          }}
        />
      </div>
      {error && <div id={errId} style={{ ...T.small, color: C.danger, marginTop: 6, textAlign: dir === "rtl" ? "start" : "start" }}>{error}</div>}
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
      {hint && <div id={hintId} style={{ ...T.small, fontWeight: 400, color: bad ? C.danger : C.ink2 }}>{hint}</div>}
    </div>
  );
}

/** رابط نصّي بخط سفلي — «إرسال رمز جديد» و«قراءة الشروط». */
export function TextLink({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        background: "none", border: "none", padding: 0, cursor: disabled ? "default" : "pointer",
        fontFamily: FONT.sans, fontSize: 14, fontWeight: 600,
        color: disabled ? C.ink3 : C.ink, textDecoration: disabled ? "none" : "underline",
      }}>
      {children}
    </button>
  );
}
