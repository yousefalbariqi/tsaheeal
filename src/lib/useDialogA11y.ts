/* وصول لوحة المفاتيح للحوارات — الورقة السفلية والنوافذ المنبثقة.

   ما كان ينقص: الورقة المفتوحة كانت div بلا دور، فقارئ الشاشة لا يعلن
   أن حواراً فُتح ولا يحصر القراءة فيه؛ وEscape لا يُغلق؛ والـTab يخرج
   من الورقة إلى صفحةٍ خلفها لا يراها المستخدم — يتنقّل في عناصر مخفيّة
   بصرياً بينما تركيزه «داخل» حوار. من لا يستعمل الفأرة (لوحة مفاتيح
   وحدها، أو التنقّل بالتبديل) لم يكن يستطيع إغلاق الورقة إطلاقاً.

   مكدَّس لا حارس واحد: حوارٌ فوق حوار وارد (ورقة تفتح ورقة)، وEscape
   يجب أن يُغلق الأعلى وحده لا كلَّ ما فُتح.

   هذا حرسٌ للوحة المفاتيح لا لالتقاط التركيز الكامل: لا يخفي بقيّة
   الصفحة عن قارئ الشاشة (aria-hidden على الجذر). الحصر على Tab يغطّي
   الاستعمال الفعلي؛ وaria-modal يعلن القصد. */
import { useCallback, useEffect, useId, useRef } from "react";

const FOCUSABLE = [
  "a[href]", "button:not([disabled])", 'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])", "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])', '[contenteditable="true"]',
].join(",");

/** المرئي وحده يقبل التركيز — عنصر داخل قسم مطويّ لا يُدرَج في الحلقة. */
const visible = (el: HTMLElement) =>
  !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);

const focusables = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(visible);

/* مكدَّس الحوارات المفتوحة — الأعلى وحده يستجيب للوحة المفاتيح. */
const stack: string[] = [];

export interface DialogA11y {
  /** يُركَّب على الصندوق الحاوي للحوار. */
  ref: (el: HTMLDivElement | null) => void;
  /** خصائص تُنشر على الصندوق نفسه. */
  panelProps: {
    role: "dialog";
    "aria-modal": true;
    "aria-labelledby"?: string;
    "aria-label"?: string;
    tabIndex: -1;
  };
  /** id يُركَّب على عنوان الحوار — يربطه بـaria-labelledby. */
  titleId: string;
}

export function useDialogA11y(
  { open, onClose, title }: { open: boolean; onClose: () => void; title?: string },
): DialogA11y {
  const titleId = useId();
  const node = useRef<HTMLDivElement | null>(null);
  const restore = useRef<HTMLElement | null>(null);
  const setNode = useCallback((el: HTMLDivElement | null) => { node.current = el; }, []);

  /* حفظ التركيز واستعادته — الإغلاق يعيد المستخدم إلى الزرّ الذي فتح
     الحوار لا إلى أوّل الصفحة. */
  useEffect(() => {
    if (!open) return;
    restore.current = document.activeElement as HTMLElement | null;
    /* التركيز بعد رسم الحوار: الحركة (motion) تُركّبه في نفس اللقطة،
       فالبحث عنه قبلها لا يجد شيئاً. */
    const id = requestAnimationFrame(() => {
      const panel = node.current;
      if (!panel) return;
      /* أول عنصر قابل للتركيز، وإلا الصندوق نفسه (tabIndex=-1) — حتى
         يبدأ الـTab من داخل الحوار لا من أول الصفحة. */
      (focusables(panel)[0] ?? panel).focus();
    });
    return () => {
      cancelAnimationFrame(id);
      const back = restore.current;
      /* العنصر قد يكون أُزيل من الصفحة أثناء فتح الحوار. */
      if (back && document.contains(back)) back.focus();
    };
  }, [open]);

  /* Escape + حصر الـTab. مرحلة الالتقاط: بعض الحقول توقف انتشار
     المفاتيح، فالإصغاء في مرحلة الفقاعات يفوّت Escape داخلها. */
  useEffect(() => {
    if (!open) return;
    const me = titleId;
    stack.push(me);
    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== me) return;   // ليس الحوار الأعلى
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); return; }
      if (e.key !== "Tab") return;
      const panel = node.current;
      if (!panel) return;
      const items = focusables(panel);
      const active = document.activeElement;
      if (!items.length) { e.preventDefault(); panel.focus(); return; }
      const first = items[0], last = items[items.length - 1];
      const outside = !active || !panel.contains(active);
      if (e.shiftKey ? (outside || active === first || active === panel) : (outside || active === last)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      const i = stack.lastIndexOf(me);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [open, onClose, titleId]);

  return {
    ref: setNode,
    titleId,
    panelProps: {
      role: "dialog",
      "aria-modal": true,
      /* عنوانٌ مكتوب يُربط؛ وبلا عنوان يُسمّى الحوار حتى لا يُعلَن مجهولاً. */
      ...(title ? { "aria-labelledby": titleId } : { "aria-label": "حوار" }),
      tabIndex: -1 as const,
    },
  };
}
