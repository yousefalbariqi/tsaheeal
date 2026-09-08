/* قسم تقييمات المعتمرين في صفحة الباقة.

   تعليق واحد في كل مرة لا شريط بطاقات: البطاقات المتجاورة تُقرأ كصفٍّ
   يُتخطّى، والتعليق المفرد يُقرأ فعلاً. ولأن المفرد يُوهم أن الرأي واحد،
   يبيّن العدد في الرأس والنقاط تحته أن هناك غيره.

   الرأي بسيط: اسم وتقييم من خمس ونص وصورة اختيارية. */
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { PkgReview } from "@/types";
import { C, T, R, SPACE } from "./tokens";
import { useDir, useReducedMotion } from "./kit";

/** مدة بقاء التعليق قبل الانتقال — تكفي لقراءة سطرين بتمهّل. */
const ROTATE_MS = 4000;
/** فوقه تُستبدل النقاط بعدّاد: صفٌّ طويل من النقاط يصير زخرفة لا دلالة. */
const MAX_DOTS = 7;

const ratingOutOfFive = (rating?:number) => {
  if(typeof rating!=="number") return null;
  /* تحفظ الآراء القديمة من 10 كما كانت، وتظهر بجانب الجديدة من 5 بلا كسر العرض. */
  return Math.min(5, Math.max(1, rating>5 ? rating/2 : rating));
};

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

  return (
    <div style={{ paddingInline: SPACE.page }}>
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
              {ratingOutOfFive(rv.rating)!==null && (
                <span style={{
                  marginInlineStart: "auto", ...T.small, fontWeight: 600,
                  color: C.green, background: C.greenTint, borderRadius: R.button,
                  padding: "3px 7px", direction: "ltr", flexShrink: 0,
                }}>
                  ⭐ {ratingOutOfFive(rv.rating)!.toFixed(1).replace(/\.0$/,"")}/5
                </span>
              )}
            </div>

            <div ref={onTextRef} style={{
              ...T.meta, color: C.ink, marginTop: 10,
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
            }}>
              {rv.text}
            </div>

            {rv.image && <img src={rv.image} alt={`صورة مرفقة مع رأي ${rv.name}`} style={{width:"100%",height:76,objectFit:"cover",borderRadius:R.button,marginTop:10}}/>}

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
