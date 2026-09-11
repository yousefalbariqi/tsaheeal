/* شريط التبويبات ولوحته.

   العلّة التي يصلحها: التبويبات كانت تُلفّ بـ AnimatePresence mode="wait"،
   ومعناها الحرفي «انتظر خروج القديم قبل إدخال الجديد». فالضغط على
   «الغرف» يُبقي «المعلومات» معروضةً طوال مدة الخروج — الموظف ضغط
   واستقرّت الشاشة على المحتوى السابق لحظةً، فيضغط ثانيةً ظنّاً أن ضغطته
   لم تصل. تبديلُ تبويبٍ ليس انتقال صفحة: المحتوى موجود، والانتظار
   مُصطنَع بالكامل.

   هنا يُستبدل بالتلاشي الداخل وحده: القديم يُنزع فوراً والجديد يظهر في
   ١٢٠ مللي ثانية. ومعه ما كان ناقصاً: role وaria-selected وaria-controls،
   وتنقّلٌ بالأسهم — شريطٌ من أزرارٍ بلا هذه ليس تبويبات لقارئ الشاشة. */
import { useRef, type ReactNode } from "react";
import { motion } from "motion/react";
import { B } from "@/lib/theme";

export type TabDef<T extends string> = { id: T; label: string };

export function TabStrip<T extends string>({
  tabs, active, onChange, tone = "onDark", idPrefix,
}: {
  tabs: readonly TabDef<T>[];
  active: T;
  onChange: (id: T) => void;
  /** onDark فوق رأسٍ ملوّن، onLight فوق سطحٍ أبيض. */
  tone?: "onDark" | "onLight";
  /** بادئة المعرّفات لربط كل تبويب بلوحته. */
  idPrefix: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dark = tone === "onDark";

  /* الأسهم تتبع اتجاه القراءة: في RTL اليسار يتقدّم واليمين يرجع. */
  const onKey = (e: React.KeyboardEvent) => {
    const dir = e.key === "ArrowLeft" ? 1 : e.key === "ArrowRight" ? -1 : e.key === "Home" ? -Infinity : e.key === "End" ? Infinity : 0;
    if (!dir) return;
    e.preventDefault();
    const i = tabs.findIndex(t => t.id === active);
    const next = dir === -Infinity ? 0 : dir === Infinity ? tabs.length - 1
      : (i + dir + tabs.length) % tabs.length;
    onChange(tabs[next].id);
    ref.current?.querySelectorAll<HTMLButtonElement>("[role='tab']")[next]?.focus();
  };

  return (
    <div ref={ref} role="tablist" aria-orientation="horizontal" onKeyDown={onKey}
      className={`flex gap-1 overflow-x-auto ${dark ? "" : "pt-3"}`} style={{ scrollbarWidth: "none" }}>
      {tabs.map(t => {
        const on = t.id === active;
        return (
          <button key={t.id} role="tab" id={`${idPrefix}-tab-${t.id}`}
            aria-selected={on} aria-controls={`${idPrefix}-panel-${t.id}`}
            tabIndex={on ? 0 : -1} onClick={() => onChange(t.id)}
            className={`relative px-4 py-2.5 font-bold cursor-pointer transition-all whitespace-nowrap ${dark ? "text-xs rounded-t-lg" : "text-sm rounded-t-xl"}`}
            style={{
              background: "transparent",
              color: on ? B.black : dark ? "#CFC5B6" : B.text2,
              border: "none",
            }}>
            {/* الكتلة الذهبية هي المحدِّد، لا خطٌّ تحته: التبويب المحدّد
                يُملأ بالذهبي القوي ونصُّه أسود (٥٫٧:١). وهي نفسها العنصر
                المتحرّك — layoutId يُزلقها بين التبويبات، فحلّت محلّ الخطّ
                الذي كان يتحرّك وحده فوق سطحٍ أبيض. */}
            {on && <motion.span layoutId={`${idPrefix}-ink`} aria-hidden
              className={`absolute inset-0 ${dark ? "rounded-t-lg" : "rounded-t-xl"}`}
              style={{ background: B.gold }} />}
            <span className="relative">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** لوحة تبويب — تظهر فوراً ولا تنتظر خروج سابقتها. */
export function TabPanel({ id, idPrefix, active, children }: {
  id: string; idPrefix: string; active: boolean; children: ReactNode;
}) {
  if (!active) return null;
  return (
    <motion.div role="tabpanel" id={`${idPrefix}-panel-${id}`} aria-labelledby={`${idPrefix}-tab-${id}`}
      key={id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.12 }}
      className="flex flex-col gap-4">
      {children}
    </motion.div>
  );
}
