/* النافذة — واحدةٌ لكل اللوحة.

   كانت سبعاً وعشرين نافذةً مبنيّة باليد: لونا خلفية (أخضر وأسود) بعشر
   درجات عتامة، وثلاثة مواضع، وتسع حركات دخول، وسلّم z-index مرتجل؛ ولا
   واحدة منها تحصر التركيز أو تقفل تمرير الصفحة تحتها، وثمانٍ فقط تعلن
   role="dialog".

   هنا: خلفيةٌ واحدة، دخولٌ واحد، رأسٌ أبيض بعنوانٍ وزرّ إغلاق، جسمٌ يمرّر،
   وذيلٌ ثابت للأفعال. وعلى الجوال تصير ورقةً سفلية بعرض الشاشة.

   الإغلاق: بزرّ × أو بزرّ الذيل فقط. Escape والنقر خارجها لا يُغلقان — قرارٌ
   سابق مقصود (lib/useDialogA11y): نافذةٌ فيها مسوّدة لا تُفقَد بضغطةٍ طائشة.
   `dismissible` يفتح الاثنين لنافذةٍ للقراءة وحدها. */
import { useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useDialogA11y } from "@/lib/useDialogA11y";
import { DUR, EASE } from "@/lib/theme";
import { IconButton } from "./Button";

/* قفل تمرير الصفحة — بعدّادٍ لا براية: نافذةٌ فوق نافذة، وإغلاق العليا لا
   يجوز أن يفكّ القفل والسفلى ما زالت مفتوحة. */
let locks = 0;
function lockScroll() {
  if (locks++ === 0) document.documentElement.style.overflow = "hidden";
  return () => { if (--locks === 0) document.documentElement.style.overflow = ""; };
}

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** سطرٌ توضيحي تحت العنوان. */
  sub?: ReactNode;
  /** مربّع أيقونةٍ قبل العنوان — لحوارات التأكيد. */
  icon?: ReactNode;
  /** أزرار الذيل. الأساسي أوّلاً (يمين في العربية). */
  footer?: ReactNode;
  /** أقصى عرض بالبكسل. 440 حوار · 560 نموذج · 760 نموذج عريض · 980 تفاصيل. */
  width?: number;
  /** Escape والنقر خارج النافذة يُغلقان — للنوافذ التي لا مسوّدة فيها. */
  dismissible?: boolean;
  /** يُخفي زرّ × (حوارٌ لا مخرج منه إلا بقرار). */
  hideClose?: boolean;
  /** بلا حشوةٍ للجسم — لمن يريد جدولاً أو تبويبات ملتصقة بالحواف. */
  flush?: boolean;
  /** شريطٌ بين الرأس والجسم — تبويبات النموذج. */
  toolbar?: ReactNode;
  /** طبقة النافذة. الافتراضي 60؛ حوار التأكيد يعلو كل نافذةٍ فتحته. */
  zIndex?: number;
  children?: ReactNode;
}

export function Modal(props: ModalProps) {
  return <AnimatePresence>{props.open && <ModalInner {...props} />}</AnimatePresence>;
}

function ModalInner({ onClose, title, sub, icon, footer, width = 560, dismissible = false, hideClose, flush, toolbar, zIndex, children }: ModalProps) {
  const a11y = useDialogA11y({ open: true, onClose, title: typeof title === "string" ? title : "حوار", focus: "field" });
  /* القفل ما دامت النافذة معروضةً لا ما دامت مركّبة: شاشات التحرير تبقى
     مركّبةً مخفيّة عند التنقّل، ونافذةٌ مفتوحة فيها كانت ستقفل تمرير كل
     شاشةٍ بعدها. ResizeObserver يُبلَّغ حين يصير حجمها صفراً (display:none). */
  const scrim = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrim.current;
    if (!el) return;
    let release: (() => void) | null = null;
    const sync = () => {
      const shown = el.offsetWidth > 0;
      if (shown && !release) release = lockScroll();
      else if (!shown && release) { release(); release = null; }
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => { ro.disconnect(); release?.(); };
  }, []);
  useEffect(() => {
    if (!dismissible) return;
    /* على window في مرحلة الالتقاط: حارس الحوار يبتلع Escape على document،
       و window تسبقه في المسار — فتصل الضغطة هنا أوّلاً. */
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [dismissible, onClose]);

  return (
    <motion.div ref={scrim} className="ui-scrim ts-admin" dir="rtl" style={zIndex ? { zIndex } : undefined}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: DUR.fast }}
      onMouseDown={e => { if (dismissible && e.target === e.currentTarget) onClose(); }}>
      <motion.div ref={a11y.ref} {...a11y.panelProps} className="ui-modal" style={{ maxWidth: width }}
        initial={{ opacity: 0, y: 14, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.99 }} transition={{ duration: DUR.base, ease: EASE }}>
        <header className="ui-modal-head">
          {icon}
          <div className="min-w-0 flex-1">
            <h2 id={a11y.titleId} className="ui-modal-title">{title}</h2>
            {sub && <div className="ui-modal-sub">{sub}</div>}
          </div>
          {!hideClose && <IconButton label="إغلاق" onClick={onClose} style={{ marginInlineEnd: -8, marginTop: -4 }}><X size={18} /></IconButton>}
        </header>
        {toolbar}
        <div className="ui-modal-body" style={flush ? { padding: 0 } : undefined}>{children}</div>
        {footer && <footer className="ui-modal-foot">{footer}</footer>}
      </motion.div>
    </motion.div>
  );
}

/** مربّع الأيقونة في رأس حوار التأكيد. */
export function ModalIcon({ tone = "neutral", children }: { tone?: "neutral" | "warn" | "danger" | "success" | "gold"; children: ReactNode }) {
  const c = {
    neutral: ["var(--k-fill)", "var(--k-text-2)"],
    warn: ["var(--k-warn-bg)", "var(--k-warn)"],
    danger: ["var(--k-danger-bg)", "var(--k-danger)"],
    success: ["var(--k-success-bg)", "var(--k-success)"],
    gold: ["var(--k-gold-tint)", "var(--k-gold-deep)"],
  }[tone];
  return (
    <span aria-hidden className="flex items-center justify-center flex-shrink-0"
      style={{ width: 40, height: 40, borderRadius: 12, background: c[0], color: c[1] }}>{children}</span>
  );
}
