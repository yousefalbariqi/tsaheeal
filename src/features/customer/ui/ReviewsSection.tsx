/* قسم تقييمات المعتمرين في صفحة الباقة.

   تعليق واحد في كل مرة لا شريط بطاقات: البطاقات المتجاورة تُقرأ كصفٍّ
   يُتخطّى، والتعليق المفرد يُقرأ فعلاً. ولأن المفرد يُوهم أن الرأي واحد،
   يبيّن العدد في الرأس والنقاط تحته أن هناك غيره.

   الدرجة العامة متوسط درجات الآراء نفسها (rating في PkgReview)، فلا
   يمكن أن يتناقض الرقم مع ما تحته. الآراء بلا درجة تُعرض ولا تُحتسب. */
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { PkgReview } from "@/types";
import { C, T, R, SPACE } from "./tokens";
import { useDir, useReducedMotion } from "./kit";

/** مدة بقاء التعليق قبل الانتقال — تكفي لقراءة سطرين بتمهّل. */
const ROTATE_MS = 4000;
/** فوقه تُستبدل النقاط بعدّاد: صفٌّ طويل من النقاط يصير زخرفة لا دلالة. */
const MAX_DOTS = 7;

/** أول عتبة تتحقق هي الوصف — السلّم تنازلي. */
const SCORE_STEPS: [number, string][] = [
  [9, "score9"], [8.5, "score85"], [8, "score8"], [7, "score7"], [6, "score6"], [0, "score0"],
];
const scoreKey = (v: number) => SCORE_STEPS.find(([min]) => v >= min)![1];

/** العربية تصرّف المعدود: مفرد، مثنى، جمع (3–10)، ثم تمييز منصوب (11+). */
const countKey = (n: number) =>
  n === 1 ? "oneReview" : n === 2 ? "twoReviews" : n <= 10 ? "fewReviews" : "manyReviews";

export interface ReviewsSectionProps {
  reviews: PkgReview[];
  t: (k: string) => string;
  onReadMore: () => void;
}

export function ReviewsSection({ reviews, t, onReadMore }: ReviewsSectionProps) {
  const dir = useDir();
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [clamped, setClamped] = useState(false);
  const [textEl, setTextEl] = useState<HTMLDivElement | null>(null);
  /* يتجاهل null: العنصر الخارج يُنظّف ref بعد دخول الداخل، فلولا هذا
     الشرط لمُسح القياس بعد كل تبديل. */
  const onTextRef = useCallback((el: HTMLDivElement | null) => { if (el) setTextEl(el); }, []);

  const n = reviews.length;
  const rated = reviews.filter(r => typeof r.rating === "number");
  const avg = rated.length
    ? Math.round((rated.reduce((s, r) => s + (r.rating as number), 0) / rated.length) * 10) / 10
    : null;

  /* الفهرس قد يتجاوز المصفوفة لو قلّت الآراء بين رسمتين. */
  const idx = n ? Math.min(i, n - 1) : 0;
  const rv = reviews[idx];

  useEffect(() => {
    if (reduced || paused || n < 2) return;
    const id = setInterval(() => setI(x => (x + 1) % n), ROTATE_MS);
    return () => clearInterval(id);
  }, [reduced, paused, n]);

  /* «اقرأ المزيد» يظهر عند القطع فعلاً لا دائماً — رأيٌ من خمس كلمات
     لا يحتاجه. يُقاس بعد كل تبديل لأن الطول يختلف بين رأي وآخر. */
  useLayoutEffect(() => {
    if (!textEl) return;
    setClamped(textEl.scrollHeight - textEl.clientHeight > 1);
  }, [textEl, rv?.text]);

  if (!n) {
    return (
      <div className="flex items-center gap-2" style={{ ...T.body, color: C.ink2 }}>
        {t("noReviews")}
      </div>
    );
  }

  const countLabel = t(countKey(n)).replace("{n}", String(n));

  return (
    <div style={{ paddingInline: SPACE.page }}>
      {/* ── التقييم العام ── */}
      {avg !== null && (
        <div className="flex items-center gap-3" style={{ marginBottom: 16 }}>
          <div style={{
            background: C.green, color: C.white, borderRadius: R.button,
            padding: "8px 12px", ...T.h3, fontWeight: 600, lineHeight: 1,
            display: "flex", alignItems: "baseline", gap: 3, flexShrink: 0,
          }}>
            {/* الرقم دائماً LTR: «8.8» تنعكس إلى «8.8» خطأً في سياق RTL */}
            <span style={{ direction: "ltr" }}>{avg.toFixed(1)}</span>
          </div>
          <div className="min-w-0">
            <div style={{ ...T.h3, color: C.ink }}>{t(scoreKey(avg))}</div>
            <div style={{ ...T.meta, color: C.ink2 }}>
              <span style={{ direction: "ltr", unicodeBidi: "isolate" }}>{avg.toFixed(1)}</span> {t("outOfTen")} · {countLabel}
            </div>
          </div>
        </div>
      )}

      {/* ── تعليق واحد يتبدّل ── */}
      <div
        onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
        style={{
          border: `1px solid ${C.border}`, borderRadius: R.card,
          background: C.white,
          /* ارتفاع ثابت: بدونه تقفز الصفحة كلما تبدّل تعليق أقصر أو أطول */
          minHeight: 148, position: "relative", overflow: "hidden",
        }}>
        {/* بلا mode="wait": الخارج والداخل يتراكبان ويتحركان معاً. مع
            mode="wait" تبقى البطاقة فارغة طوال مدة الخروج فتبدو كوميض —
            وهي نفس العلّة المعالَجة في RotatingText داخل kit.tsx. */}
        <AnimatePresence initial={false}>
          <motion.div key={rv.id ?? idx}
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
            style={{ position: "absolute", inset: 0, padding: 16 }}>
            <div className="flex items-center gap-2.5">
              <span style={{
                width: 36, height: 36, borderRadius: R.pill, background: C.greenTint, color: C.green,
                display: "flex", alignItems: "center", justifyContent: "center",
                ...T.body, fontWeight: 600, flexShrink: 0,
              }}>
                {rv.name.trim().charAt(0)}
              </span>
              {/* الاسم وحده — بلا دولة ولا علم */}
              <span className="truncate" style={{ ...T.body, fontWeight: 500, color: C.ink }}>{rv.name}</span>
              {typeof rv.rating === "number" && (
                <span style={{
                  marginInlineStart: "auto", ...T.small, fontWeight: 600,
                  color: C.green, background: C.greenTint, borderRadius: R.button,
                  padding: "3px 7px", direction: "ltr", flexShrink: 0,
                }}>
                  {rv.rating.toFixed(1)}
                </span>
              )}
            </div>

            <div ref={onTextRef} style={{
              ...T.meta, color: C.ink, marginTop: 10,
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
            }}>
              {rv.text}
            </div>

            {clamped && (
              <button type="button" onClick={onReadMore}
                style={{
                  marginTop: 6, background: "none", border: "none", padding: 0, cursor: "pointer",
                  ...T.meta, fontWeight: 600, color: C.ink, textDecoration: "underline", fontFamily: "inherit",
                }}>
                {t("readMore")}
              </button>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── دليل التعدد ── */}
      {n > 1 && (
        <div className="flex items-center justify-center gap-1.5" style={{ marginTop: 12, direction: dir }}>
          {n <= MAX_DOTS ? (
            reviews.map((r, k) => (
              <button key={r.id ?? k} type="button" onClick={() => { setI(k); setPaused(true); }}
                aria-label={`${k + 1} / ${n}`}
                style={{
                  width: k === idx ? 18 : 6, height: 6, borderRadius: R.pill, border: "none", padding: 0,
                  background: k === idx ? C.green : C.border, cursor: "pointer",
                  transition: "width .28s ease, background .28s ease",
                }}/>
            ))
          ) : (
            <span style={{ ...T.small, color: C.ink2, direction: "ltr" }}>{idx + 1} / {n}</span>
          )}
        </div>
      )}
    </div>
  );
}
