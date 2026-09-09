/* عناصر واجهة المستفيد — نظام Airbnb مطبّقاً على تساهيل.
   كلها RTL-aware: تعتمد الخصائص المنطقية (insetInlineStart / textAlign:start)
   ولا تعكس إلا الأيقونات الاتجاهية عبر flipRTL. */
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, ChevronRight, ChevronDown, Check, Heart, Share, Star, X, Minus, Plus, Play, Images, Globe } from "lucide-react";
import { toast } from "sonner";
import { C, T, R, SPACE, SHADOW, CTA_GRADIENT, FONT, LTR, MOTION, flipRTL, money, prefersReducedMotion } from "./tokens";
import { useDialogA11y } from "@/lib/useDialogA11y";

/* ── اتجاه الصفحة ─────────────────────────────────────────────── */
const DirCtx = createContext<"rtl" | "ltr">("rtl");
export const DirProvider = DirCtx.Provider;
export const useDir = () => useContext(DirCtx);

/** سهم "رجوع"/"السابق": يشير يميناً في RTL ويساراً في LTR.
    يُطبَّق على ChevronRight، فيُعكس في LTR فقط. */
export const backArrow = (dir: "rtl" | "ltr") =>
  dir === "ltr" ? { transform: "scaleX(-1)" } : undefined;

/** هل العرض ديسكتوب؟ يُستعمل حيث لا يكفي CSS: عنصرٌ يجب ألّا يوجد في
    الشجرة أصلاً على الجوال — كمُدوِّر التقييمات ومؤقّته الذي يعمل كل
    أربع ثوانٍ. الإخفاء بالـCSS يُبقيه يعمل خلف الستار. */
export function useIsDesktop(min = 1024): boolean {
  const q = `(min-width:${min}px)`;
  const [is, setIs] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.(q).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia?.(q);
    if (!mq) return;
    const on = () => setIs(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [q]);
  return is;
}

/** يتابع تفضيل تقليل الحركة ويتحدّث إن غيّره المستخدم أثناء التصفّح. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** يمشّي نبضةً واحدة على عناصر شبكة بالتتابع: الأولى ثم الثانية ثم الثالثة…
    ثم يعاد. يُرجِع فهرس العنصر النابض حالياً، أو -1 فلا ينبض أحد.

    مؤقّت واحد للشبكة كلها لا مؤقّت لكل بطاقة: بعشرين باقة كانت تصير عشرين
    مؤقّتاً تعمل معاً (وهي العلّة التي أُسقط من أجلها النصّ المتناوب من هذه
    الشاشة). وما يُعاد رسمه عند كل خطوة هو سمة واحدة على بطاقتين — الخارجة
    والداخلة.

    وفي الدورة خانة زائدة عن عدد البطاقات تُرجِع -1: راحة قصيرة بعد آخر
    بطاقة قبل أن تبدأ الموجة من جديد. بلا هذه الراحة تلتفّ الموجة على
    نفسها بلا فاصل فلا يُدرَك أنها «تُعاد» من الأول. */
export function useSequencePulse(count: number, step = MOTION.sweep): number {
  const reduced = useReducedMotion();
  const slots = count + 1;
  const [i, setI] = useState(0);

  useEffect(() => {
    if (reduced || count < 1) return;
    const id = setInterval(() => setI(n => (n + 1) % slots), step);
    return () => clearInterval(id);
  }, [reduced, count, slots, step]);

  if (reduced || count < 1) return -1;
  const at = i % slots;
  return at < count ? at : -1;      // الخانة الأخيرة = راحة
}

/* أنماط عامة تُحقن مرة واحدة لا مع كل مكوّن. */
const GLOBAL_STYLE_ID = "ts-customer-style";
if (typeof document !== "undefined" && !document.getElementById(GLOBAL_STYLE_ID)) {
  const el = document.createElement("style");
  el.id = GLOBAL_STYLE_ID;
  el.textContent = `
.ts-hscroll::-webkit-scrollbar,.ts-hgallery::-webkit-scrollbar{display:none}
/* نبض حدود البطاقة — حدٌّ وهالة فقط بلا transform: تكبير البطاقة يزحزح
   جيرانها في الشبكة فيُقرأ اهتزازاً لا نبضاً، والحدّ وحده كافٍ للإيحاء
   بالحياة. وبانتقال CSS لا keyframes: الإضاءة تأتي من تبديل السمة
   data-pulse من الخارج، والتتابع يقرّره مؤقّت واحد للشبكة كلها. */
.ts-seq{
  /* حدّ السكون هنا لا في style السطر: النمط السطري يتقدّم على أي قاعدة في
     الورقة بلا !important، فكان الحدّ يبقى رمادياً ولا تنبض إلا الهالة.
     والصنف يملك الحالتين معاً فيُقرأ الانتقال بينهما في موضع واحد.
     وهالة السكون معلنة صفراً لا متروكة none: الانتقال من/إلى none غير
     معرَّف جيداً في كل المتصفّحات. */
  border: 1px solid ${C.border};
  box-shadow: 0 0 0 0 rgba(183,137,63,0);
  transition: border-color ${MOTION.pulseFade}ms ease-in-out,
              box-shadow   ${MOTION.pulseFade}ms ease-in-out;
}
.ts-seq[data-pulse="on"]{
  /* ذهبي مخفَّف لا ${C.green} صريحاً، وهالة 2px بشفافية .09:
     المطلوب إيحاء هادئ جداً — والحدّ الصريح يجعل البطاقة تبدو «مختارة». */
  border-color: rgba(183,137,63,.50);
  box-shadow: 0 0 0 2px rgba(183,137,63,.10);
}
.ts-card:active{ transform: scale(.985); }

/* ⚠️ TrustTicker وقواعد .ts-ticker أدناه لم تعد مستعملة بعد الموجة ٠:
   شاشة الاستكشاف تستعمل TrustRow الساكن (انظر تعليقه). أُبقيت لأن
   القرار كان «أوقف القص» لا «احذف الفكرة» — فإن عاد الزحف يوماً عاد
   بلا إعادة كتابة. ومن يحذفها يحذف كتلة CSS هذه معها.

   شريط زاحف بلا نهاية — المسار فيه نسختان من القائمة، والانتقال إلى
   -50% ينتهي بالضبط على بداية النسخة الثانية فلا تُرى نقطة الالتفاف.
   transform وحده: يعمل على المُركِّب بلا إعادة تخطيط ولا مؤقّت JS. */
@keyframes ts-marquee{ from{ transform: translateX(0) } to{ transform: translateX(-50%) } }
.ts-ticker{
  overflow: hidden;
  /* LTR على الحاوية نفسها لا على المسار وحده: في RTL يُسنِد المتصفّح حافّة
     المسار اليمنى إلى حافّة الحاوية اليمنى ويمدّه يساراً خارجها، فإزاحته
     -50% تخرجه من النافذة كلها ويظهر الشريط فارغاً. وبـLTR يبدأ المسار من
     الحافّة اليسرى فتبقى النافذة مغطّاة في كل لحظة من الدورة.
     نصوص العبارات لا تتأثر: كل عبارة تحمل dir الخاص بها. */
  direction: ltr;
  /* التلاشي عند الحافّتين — بدونه تُقطع الكلمة قطعاً حادّاً فيبدو الشريط معطوباً */
  -webkit-mask-image: linear-gradient(90deg,transparent,#000 28px,#000 calc(100% - 28px),transparent);
          mask-image: linear-gradient(90deg,transparent,#000 28px,#000 calc(100% - 28px),transparent);
}
.ts-ticker-track{
  display: flex; width: max-content; will-change: transform;
  animation: ts-marquee var(--ts-dur,40s) linear infinite;
}
/* في RTL يزحف مع اتجاه القراءة (يميناً) — عكس المسار نفسه لا مجموعة keyframes ثانية */
.ts-ticker[data-dir="rtl"] .ts-ticker-track{ animation-direction: reverse; }
/* من أراد قراءة عبارة يلمسها فتقف — هو ما يجعل الشريط بلا «جهد» */
.ts-ticker:hover .ts-ticker-track,
.ts-ticker:active .ts-ticker-track{ animation-play-state: paused; }

@media (prefers-reduced-motion: reduce){
  /* الهالة تُلغى بالسمة نفسها من الخطّاف، وهذا يمنع أي انتقال لو بقيت */
  .ts-seq{ transition: none; }
  .ts-card:active{ transform: none; }
  .ts-ticker-track{ animation: none; }
}`;
  document.head.appendChild(el);
}

/* ── نص متحرك ─────────────────────────────────────────────────── */
/** يبدّل بين سطور بانزلاق رأسي داخل ارتفاع ثابت، فلا تقفز الشبكة.
    `delay` يُزيح بداية كل بطاقة حتى لا تنقلب كلها في اللحظة نفسها. */
export function RotatingText({ items, delay = 0, style }: {
  items: ReactNode[]; delay?: number; style?: CSSProperties;
}) {
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);

  useEffect(() => {
    if (reduced || items.length < 2) return;
    let interval: ReturnType<typeof setInterval>;
    const start = setTimeout(() => {
      setI(n => (n + 1) % items.length);
      interval = setInterval(() => setI(n => (n + 1) % items.length), MOTION.rotate);
    }, MOTION.rotate + delay);
    return () => { clearTimeout(start); clearInterval(interval); };
  }, [reduced, items.length, delay]);

  // الارتفاع مقفول على سطر واحد — هو ما يمنع اهتزاز الشبكة أثناء التبديل
  const lineH = Math.round(T.meta.fontSize * T.meta.lineHeight);
  const safe = items.length ? items : [null];
  const idx = Math.min(i, safe.length - 1);

  return (
    <div style={{ height: lineH, overflow: "hidden", position: "relative", ...style }}>
      {reduced ? (
        <div className="truncate" style={{ height: lineH, lineHeight: `${lineH}px` }}>{safe[0]}</div>
      ) : (
        // بلا mode="wait": الخارج والداخل يتحركان معاً، وإلا بقي السطر فارغاً
        // طوال مدة الخروج فبدا كوميض.
        <AnimatePresence initial={false}>
          <motion.div key={idx}
            initial={{ y: lineH, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -lineH, opacity: 0 }}
            transition={{ duration: 0.42, ease: [0.4, 0, 0.2, 1] }}
            className="truncate"
            style={{ position: "absolute", insetInline: 0, top: 0, height: lineH, lineHeight: `${lineH}px` }}>
            {safe[idx]}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}

/* ── شريط الثقة الزاحف ────────────────────────────────────────── */
/** عبارات ثقة تزحف بلا نهاية كشريط الأخبار.

    لماذا زحف لا تبديل (RotatingText): التبديل يُمسك كل عبارة 3.2 ثانية،
    فأحد عشرة عبارة تحتاج 35 ثانية ولا يرى الواقف عشر ثوان إلا ثلاثاً.
    الزحف يعرضها متّصلةً بلا وقفات — أكثر كلمات في نفس الزمن — وبمؤقّت
    واحد في CSS لا مؤقّت JS لكل عبارة.

    والقياس هو بيت القصيد: المدة تُحسب من العرض لا تُثبَّت، وإلا صارت
    السرعة تابعة لطول النص فزحف التركي (عبارات أطول) أسرع من العربي. */
export function TrustTicker({ items, speed = 64, style }: {
  items: string[];
  /** بكسل في الثانية — 64 يُقرأ بمرور العين ولا يُتعب. */
  speed?: number;
  style?: CSSProperties;
}) {
  const dir = useDir();
  const reduced = useReducedMotion();
  const boxRef  = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);   // نسخة واحدة من القائمة
  const halfRef = useRef<HTMLDivElement>(null);   // نصف المسار = reps نسخة
  const [dur, setDur] = useState(0);
  /* تكرار القائمة داخل كل نصف: لو كانت نسخة واحدة أضيق من الشاشة لظهرت
     فجوة بيضاء تعبر الشريط في كل دورة. */
  const [reps, setReps] = useState(1);

  useLayoutEffect(() => {
    if (reduced) return;
    const box = boxRef.current, copy = copyRef.current, halfEl = halfRef.current;
    if (!box || !copy || !halfEl) return;

    const measure = () => {
      const copyW = copy.scrollWidth;
      if (!copyW) return;                        // الخط لم يُحمَّل بعد
      setReps(Math.max(1, Math.ceil(box.clientWidth / copyW)));
      // المدة من عرض النصف مقيساً لا محسوباً: النصف هو ما تقطعه ‎-50%‎
      setDur(halfEl.scrollWidth / speed);
    };
    measure();
    // إعادة القياس عند تغيّر اللغة أو تحميل الخط أو دوران الجهاز
    const ro = new ResizeObserver(measure);
    ro.observe(box); ro.observe(halfEl);
    return () => ro.disconnect();
  }, [items, speed, reduced]);

  /* في RTL يُقلب الترتيب. المسار LTR فعنصره الأول أقصى اليسار، والنافذة
     تتقدّم يساراً — فلولا القلب لمرّت العبارات بترتيب معكوس عن المكتوب في
     i18n. لا يُحسّ ذلك للقارئ (العبارات مستقلة لا جملة) لكنه يخدع من
     يحرّر القائمة لاحقاً: يرتّبها فتُعرض مقلوبة. */
  const seq = dir === "rtl" ? [...items].reverse() : items;

  /* المسافة كلها من الحاشية لا من gap: الـgap لا يفصل بين نصفَي المسار
     (هما ابنا flex متلاصقان) فكانت مسافة نقطة الالتفاف أضيق من غيرها.
     `dot` تُطفأ لأول عنصر في السطر الساكن وحده: النقطة فاصلة بين عبارتين،
     وفي حلقة لا نهاية لها كل عبارة مسبوقة بأخرى — أما سطر له بداية فنقطته
     الأولى تتدلّى وحدها. */
  const item = (x: string, dot = true) => (
    <span key={x} className="inline-flex items-center" style={{ gap: 10, paddingInlineEnd: 20 }}>
      {dot && <span aria-hidden style={{
        width: 5, height: 5, borderRadius: "50%", background: C.gold,
        display: "inline-block", flexShrink: 0,
      }} />}
      <span dir={dir} style={{ ...T.meta, color: C.ink2, whiteSpace: "nowrap" }}>{x}</span>
    </span>
  );

  /* عند تقليل الحركة: نفس الشريط بسطر واحد لكن يُمرَّر باليد — لا حركة
     ذاتية. ولا لفّ في أسطر: اثنتا عشرة عبارة ملفوفة تصير خمسة أسطر تدفع
     الباقات خارج الشاشة الأولى، فيُعاقب من أوقف الحركة بتخطيط أسوأ.
     وبترتيب items لا seq: هذا السطر يرث RTL من الصفحة فيبدأ من اليمين
     أصلاً، والقلب هنا كان سيعكسه مرتين. */
  if (reduced) {
    return (
      // الحاشية تعيد هامش الصفحة الذي ألغاه الهامش السالب في المُستدعي:
      // الشريط الزاحف يتلاشى عند الحافّة فلا يحتاجها، والساكن يلتصق بها.
      <div className="ts-hscroll flex items-center"
        style={{ overflowX: "auto", scrollbarWidth: "none", paddingInline: SPACE.page, ...style }}>
        {items.map((x, i) => item(x, i > 0))}
      </div>
    );
  }

  /* نصف واحد = reps نسخة. النسخة الأولى وحدها مقروءة؛ الباقي — وكل
     النصف الثاني — aria-hidden حتى لا يكرّرها قارئ الشاشة. */
  const half = (first: boolean) => (
    <div ref={first ? halfRef : undefined} className="flex items-center"
      aria-hidden={first ? undefined : true}>
      {Array.from({ length: reps }).map((_, r) => (
        <div key={r} className="flex items-center"
          ref={first && r === 0 ? copyRef : undefined}
          aria-hidden={first && r === 0 ? undefined : true}>
          {/* لا map(item) مباشرةً: map يمرّر الفهرس كوسيط ثانٍ فيصير `dot` رقماً */}
          {seq.map(x => item(x))}
        </div>
      ))}
    </div>
  );

  return (
    <div ref={boxRef} className="ts-ticker" data-dir={dir} style={style}>
      {/* المسار يرث LTR من .ts-ticker، فحساب translateX واحد في الاتجاهين
          واتجاه الزحف يتغيّر بـanimation-direction وحده — والقلب المنطقي
          يتولّاه seq أعلاه. */}
      <div className="ts-ticker-track" style={{
        ["--ts-dur" as string]: dur ? `${dur}s` : undefined,
        // قبل أول قياس: موقوف، وإلا زحف بمدة الافتراضي ثم وثب عند ضبطها
        animationPlayState: dur ? undefined : "paused",
      }}>
        {/* النصفان متطابقان — شرط انسيابية الالتفاف */}
        {half(true)}
        {half(false)}
      </div>
    </div>
  );
}

/* ── صفّ الثقة الساكن ──────────────────────────────────────────────
   بديل TrustTicker في شاشة الاستكشاف، بطلب الفريق: «النص المتحرك أعلى
   الصفحة مقصوص من الطرفين ويصعب قراءته».

   والقصّ ليس عيب تنفيذ يُرقَّع بتوسيع التلاشي — هو لازمُ الفكرة: شريطٌ
   أعرض من نافذته لا بدّ أن تُقطع أطرافه، وعبارةٌ تزحف لا يُدركها من
   بدأ القراءة في منتصفها. تعريض التلاشي يزيد المقصوص، وتضييقه يجعل
   القطع حادّاً — وكلاهما إصلاحٌ للعَرَض.

   فالحلّ ترك الزحف: ستّ عبارات ساكنة تُلَفّ في سطرين، كلّها مقروءة في
   اللحظة الأولى بلا انتظار دورة. وصار ممكناً بعد حذف الادعاءات الأربع
   من i18n — عشر عبارات كانت تصير خمسة أسطر تدفع الباقات خارج الشاشة،
   وهو ما دفع إلى الزحف أصلاً. حُذف السبب فسقط المسبَّب.

   ولا شيء يُقصّ ولا يتحرّك ولا يحتاج ResizeObserver ولا مؤقّتاً. */
export function TrustRow({ items, style }: { items: string[]; style?: CSSProperties }) {
  return (
    <ul className="flex flex-wrap items-center justify-center"
      style={{ gap: "6px 8px", margin: 0, padding: 0, listStyle: "none", ...style }}>
      {items.map(x => (
        <li key={x} className="inline-flex items-center" style={{
          gap: 6, height: 28, paddingInline: 10, borderRadius: R.pill,
          background: C.fill, border: `1px solid ${C.line}`,
        }}>
          <span aria-hidden style={{
            width: 5, height: 5, borderRadius: "50%", background: C.gold, flexShrink: 0,
          }} />
          <span style={{ ...T.meta, color: C.ink2, whiteSpace: "nowrap" }}>{x}</span>
        </li>
      ))}
    </ul>
  );
}

/* ── فواصل وأقسام ─────────────────────────────────────────────── */
export function Divider({ inset = false }: { inset?: boolean }) {
  return <div style={{ height: 1, background: C.line, marginInline: inset ? SPACE.page : 0 }} />;
}

export type Tone = "white" | "sand" | "action";
const TONE_BG: Record<Tone, string> = { white: C.white, sand: C.band, action: C.bandAction };

/** «ضربة الصبغة» — شريط أخضر قصير قبل العنوان يعلن بداية موضوع جديد. */
export function TitleAccent() {
  return <span aria-hidden style={{ width: 4, height: 20, borderRadius: 2, background: C.green, flexShrink: 0 }} />;
}

/** قسم بخلفية ملوّنة ممتدة لحافتي الشاشة. تغيّر اللون بين قسمين هو الفاصل،
    فالخط `1px` يُستخدم فقط حين يتجاور قسمان بنفس اللون.
    bleed: يزيل الحشوة الجانبية عن المحتوى (للـ HScroll الممتد) ويبقيها على العنوان. */
export function Section({ title, action, children, divider = false, bleed = false, tone = "white" }: {
  title?: string; action?: ReactNode; children: ReactNode;
  divider?: boolean; bleed?: boolean; tone?: Tone;
}) {
  return (
    <>
      <section style={{ background: TONE_BG[tone], paddingInline: bleed ? 0 : SPACE.page, paddingBlock: SPACE.section }}>
        {(title || action) && (
          <div className="flex items-center justify-between gap-3"
            style={{ marginBottom: 16, paddingInline: bleed ? SPACE.page : 0 }}>
            <div className="flex items-center gap-2.5 min-w-0">
              <TitleAccent />
              {title && <h2 className="truncate" style={{ ...T.h2, color: C.ink, margin: 0 }}>{title}</h2>}
            </div>
            {action}
          </div>
        )}
        {children}
      </section>
      {divider && <Divider />}
    </>
  );
}

/* ── خطوة مرقّمة داخل كتلة الحجز ─────────────────────────────── */
/** شارة رقم تتحول إلى ✓ عند الاكتمال — تعطي إحساس «٢ من ٤» بلا عدّاد منفصل. */
/** خطوة واحدة في مسار الحجز.
    - شريط الأرقام على يسار الشاشة في العربية (يمينها في الإنجليزية) — يُرسَم
      بعد المحتوى في RTL فيقع طبيعياً على اليسار بلا تحويلات.
    - أكورديون: المفتوحة وحدها تعرض محتواها، والمنتهية تُطوى إلى سطر واحد
      فيه ✓ وقيمة مختصرة، والضغط عليها يعيد فتحها. */
export function StepRow({ n, title, done, children, last, open = true, value, onOpen, locked }: {
  n: number; title: string; done?: boolean; children: ReactNode; last?: boolean;
  /** مفتوحة = تعرض المحتوى. */
  open?: boolean;
  /** قيمة مختصرة تظهر بجانب العنوان عند الطي — سطر واحد لا ملخّص. */
  value?: string;
  /** يُستدعى عند الضغط على ترويسة خطوة مطويّة. */
  onOpen?: () => void;
  /** خطوة لم يحن دورها — لا تُفتح بالضغط. */
  locked?: boolean;
}) {
  const dir = useDir();
  const clickable = !open && !locked && !!onOpen;

  const rail = (
    <div className="flex flex-col items-center" style={{ flexShrink: 0, width: 28 }}>
      <span style={{
        width: 28, height: 28, borderRadius: R.pill, flexShrink: 0,
        background: done ? C.green : C.white,
        border: done ? "none" : `1px solid ${C.border}`,
        color: done ? C.white : locked ? C.ink3 : C.ink2,
        display: "flex", alignItems: "center", justifyContent: "center",
        ...T.small, fontWeight: 600,
      }}>
        {done ? <Check size={15} /> : <span style={LTR}>{n}</span>}
      </span>
      {!last && <span style={{ flex: 1, width: 1, background: C.border, marginBlock: 6 }} />}
    </div>
  );

  const head = (
    <div className="flex items-center gap-2 min-w-0" style={{ marginBottom: open ? 12 : 0 }}>
      <span className="truncate" style={{ ...T.h3, color: locked && !done ? C.ink3 : C.ink }}>{title}</span>
      {!open && value && (
        <span className="truncate" style={{ ...T.meta, color: C.ink2, flexShrink: 1 }}>· {value}</span>
      )}
      {clickable && <ChevronDown size={16} style={{ color: C.ink2, marginInlineStart: "auto", flexShrink: 0 }} />}
    </div>
  );

  const body = (
    <div className="min-w-0" style={{ flex: 1, paddingBottom: last ? 0 : open ? 26 : 18 }}>
      {clickable
        ? <button onClick={onOpen} className="w-full" style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "start" }}>{head}</button>
        : head}
      {open && children}
    </div>
  );

  return (
    <div className="flex gap-3">
      {dir === "rtl" ? <>{body}{rail}</> : <>{rail}{body}</>}
    </div>
  );
}

/** صفّ «تمّ الاختيار» — يحلّ محلّ محرّرٍ انتهى عمله.

    العلّة: كان اختيار التاريخ يُطوى فيغيب عن الشاشة، ويبقى زرّ ذهبي كبير
    مكانه. فلا المستفيد يرى ما اختار، ولا يعرف أن الزرّ لخطوةٍ أخرى. الصفّ
    هنا فاتحٌ لا ذهبي: القرار وقع فلا يُنادى عليه، ويبقى «تعديل» في طرفه. */
export function DoneRow({ icon, label, value, editLabel, onEdit }: {
  icon?: ReactNode; label: string; value: string;
  editLabel: string; onEdit: () => void;
}) {
  return (
    <div className="ts-done-row">
      <span className="ts-done-check" aria-hidden><Check size={13} /></span>
      {icon && <span className="ts-done-icon" aria-hidden>{icon}</span>}
      <span className="ts-done-label">{label}</span>
      <b className="ts-done-value">{value}</b>
      <button type="button" onClick={onEdit} className="ts-done-edit">{editLabel}</button>
    </div>
  );
}

/* ── أزرار ────────────────────────────────────────────────────── */
export function CTAButton({ children, onClick, disabled, variant = "green", full, style }: {
  children: ReactNode; onClick?: () => void; disabled?: boolean;
  variant?: "green" | "dark"; full?: boolean; style?: CSSProperties;
}) {
  /* الحالة المعطّلة كانت مساحةً رماديةً صمّاء (C.ink3) بنصٍّ أبيض عليها،
     فتُقرأ «زرٌّ معطوب» لا «زرٌّ ينتظر خطوةً منك» — وهو ما وصفه الفريق
     بـ«رمادية جدًا». الآن سطحٌ فاتح بحدٍّ وكتابةٍ خافتة: شكل الحقل غير
     المفعَّل في بقيّة الواجهة، لا شكل العطل. واللون الأساسي محفوظ
     للمفعَّل وحده فيكسب التباين معنى — «صار جاهزاً» يُرى من طرف العين. */
  const off = !!disabled;
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        background: off ? C.fill : variant === "dark" ? C.greenDeep : CTA_GRADIENT,
        color: off ? C.ink3 : C.white,
        border: off ? `1px solid ${C.line}` : "none",
        borderRadius: R.pill, paddingInline: 28, height: 50, width: full ? "100%" : undefined,
        fontFamily: FONT.sans, fontSize: 16, fontWeight: 600,
        cursor: off ? "not-allowed" : "pointer", transition: "background .18s, color .18s",
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
        ...style,
      }}>
      {children}
    </button>
  );
}

export function GrayButton({ children, onClick, full, style }: {
  children: ReactNode; onClick?: () => void; full?: boolean; style?: CSSProperties;
}) {
  return (
    <button onClick={onClick}
      style={{
        background: C.fill, color: C.ink, border: "none", borderRadius: R.button,
        paddingInline: 20, height: 48, width: full ? "100%" : undefined,
        fontFamily: FONT.sans, fontSize: 15, fontWeight: 600, cursor: "pointer",
        ...style,
      }}>
      {children}
    </button>
  );
}

/** زر بحدود رفيعة — نمط "عرض كل التقييمات" ذي الإطار عندهم. */
export function OutlineButton({ children, onClick, full }: { children: ReactNode; onClick?: () => void; full?: boolean }) {
  return (
    <button onClick={onClick}
      style={{
        background: C.white, color: C.ink, border: `1px solid ${C.ink}`, borderRadius: R.button,
        paddingInline: 20, height: 48, width: full ? "100%" : undefined,
        fontFamily: FONT.sans, fontSize: 15, fontWeight: 600, cursor: "pointer",
      }}>
      {children}
    </button>
  );
}

/** الأزرار الدائرية العائمة فوق المعرض (رجوع، قلب، مشاركة). */
/** فقاعة أيقونة. `label` يخدم ثلاثة: قارئ الشاشة (aria-label)، وتلميح
    المرور (title) للمبصر الذي لا يعرف معنى الرمز، ووصفَ الحالة حين
    يكون الزرّ قابلاً للضغط والرفع (`pressed`). */
export function IconBubble({ children, onClick, label, pressed }: {
  children: ReactNode; onClick?: () => void; label?: string;
  /** لزرٍّ له حالتان — يُنشر aria-pressed فيُقرأ «مضغوط». */
  pressed?: boolean;
}) {
  return (
    <button onClick={onClick} aria-label={label} title={label}
      aria-pressed={pressed}
      style={{
        width: 34, height: 34, borderRadius: R.pill, border: "none",
        background: "rgba(255,255,255,.92)", color: C.ink, boxShadow: SHADOW.float,
        display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
      }}>
      {children}
    </button>
  );
}

/* ── مبدّل اللغة ──────────────────────────────────────────────── */
/** شريحة `ع | e` تبدّل مباشرة بين العربية والإنجليزية، وسهم يفتح باقي اللغات.
    الكرة الأرضية وحدها غامضة؛ والشريحة وحدها تُسقط الأردية والتركية — فالاثنان معاً. */
export function LangSwitch<L extends string>({ lang, setLang, langs, label, compact }: {
  lang: L;
  setLang: (l: L) => void;
  langs: { code: L; label: string }[];
  label: string;
  /** زرّ واحد بكرة أرضية + اللغة المقابلة، يفتح القائمة الكاملة عند النقر.
      الشريحة المقسومة تأكل عرضاً لا يستحقّه رأسٌ متمركز. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const primary = langs.filter(l => l.code === ("ar" as L) || l.code === ("en" as L));
  const rest = langs.filter(l => !primary.includes(l));
  const mark: Record<string, string> = { ar: "ع", en: "e" };
  /* يُعرض اسم اللغة التي سينتقل إليها — لا الحالية؛ فالصفحة نفسها تدلّ على الحالية. */
  const nextLabel = lang === ("ar" as L) ? "EN" : "ع";

  if (compact) {
    return (
      <div style={{ position: "relative", flexShrink: 0 }}>
        <button onClick={() => setOpen(v => !v)} aria-label={label}
          className="flex items-center"
          style={{
            gap: 8, height: 44, paddingInline: 16, borderRadius: R.pill,
            border: `1px solid ${C.border}`, background: C.white, cursor: "pointer",
            fontFamily: FONT.sans, fontSize: 15, fontWeight: 600, color: C.ink,
          }}>
          <Globe size={17} />{nextLabel}
        </button>
        {open && <LangMenu langs={langs} lang={lang} onPick={l => { setLang(l); setOpen(false); }} onClose={() => setOpen(false)} />}
      </div>
    );
  }

  const seg = (on: boolean): CSSProperties => ({
    minWidth: 30, height: 32, borderRadius: R.pill, border: "none", cursor: "pointer",
    background: on ? C.ink : "transparent", color: on ? C.white : C.ink2,
    fontFamily: FONT.sans, fontSize: 15, fontWeight: 600, lineHeight: 1,
    display: "flex", alignItems: "center", justifyContent: "center",
  });

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <div className="flex items-center" aria-label={label}
        style={{ height: 44, paddingInline: 5, gap: 2, borderRadius: R.pill, border: `1px solid ${C.border}`, background: C.white }}>
        {primary.map(l => (
          <button key={l.code} onClick={() => setLang(l.code)} aria-label={l.label} style={seg(lang === l.code)}>
            {mark[l.code] ?? l.label.slice(0, 2)}
          </button>
        ))}
        {rest.length > 0 && (
          <button onClick={() => setOpen(v => !v)} aria-label={label}
            style={{ ...seg(rest.some(l => l.code === lang)), minWidth: 22 }}>
            <ChevronDown size={15} />
          </button>
        )}
      </div>

      {open && <LangMenu langs={langs} lang={lang} onPick={l => { setLang(l); setOpen(false); }} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** قائمة اللغات المنسدلة — مشتركة بين الشكلين. */
function LangMenu<L extends string>({ langs, lang, onPick, onClose }: {
  langs: { code: L; label: string }[]; lang: L; onPick: (l: L) => void; onClose: () => void;
}) {
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 30 }} />
      <div style={{ position: "absolute", top: 50, insetInlineStart: 0, zIndex: 31, background: C.white, border: `1px solid ${C.border}`, borderRadius: R.card, overflow: "hidden", minWidth: 150, boxShadow: "0 10px 30px -8px rgba(0,0,0,.25)" }}>
        {langs.map(l => (
          <button key={l.code} onClick={() => onPick(l.code)}
            className="flex items-center justify-between gap-2 w-full"
            style={{ padding: "12px 14px", background: lang === l.code ? C.fill : C.white, border: "none", cursor: "pointer", textAlign: "start", ...T.meta, fontWeight: lang === l.code ? 600 : 400, color: C.ink }}>
            {l.label}{lang === l.code && <Check size={15} color={C.green} />}
          </button>
        ))}
      </div>
    </>
  );
}

/* ── شرائح ────────────────────────────────────────────────────── */
export function Chip({ children, tone = "line" }: { children: ReactNode; tone?: "line" | "fill" | "gold" }) {
  const s = tone === "fill" ? { background: C.fill, border: "none" }
    : tone === "gold" ? { background: C.goldTint, border: `1px solid ${C.gold}` }
    : { background: C.white, border: `1px solid ${C.border}` };
  return (
    <span className="inline-flex items-center gap-1.5"
      style={{ ...s, borderRadius: R.chip, paddingInline: 12, height: 32, ...T.small, color: C.ink, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

/** نجوم الفندق — بديلنا عن تقييم Airbnb الرقمي (لا يوجد حقل rating في البيانات).
    `compact` يعرض «4★» بنجمة واحدة: أربع نجوم تأكل ثلث عرض البطاقة الضيقة
    فتقصّ العنوان — وهو نفس ما تفعله Airbnb في بطاقاتها («4.92 ★»). */
export function Stars({ n, size = 13, compact }: { n: number; size?: number; compact?: boolean }) {
  if (compact) {
    return (
      <span className="inline-flex items-center" style={{ gap: 2, ...LTR, flexShrink: 0 }}>
        <span style={{ ...T.small, fontWeight: 600, color: C.ink }}>{n}</span>
        <Star size={size} fill={C.gold} color={C.gold} />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center" style={{ gap: 1, ...LTR }}>
      {Array.from({ length: n }, (_, i) => <Star key={i} size={size} fill={C.gold} color={C.gold} />)}
    </span>
  );
}

/* ── صفوف ─────────────────────────────────────────────────────── */
/** صف ميزة — أيقونة ونص، مع خط علوي عند عدم التوفر كما يفعلون. */
export function AmenityRow({ icon, text, unavailable }: { icon: ReactNode; text: string; unavailable?: boolean }) {
  return (
    <div className="flex items-center gap-4" style={{ paddingBlock: 12 }}>
      <span style={{ color: unavailable ? C.ink3 : C.ink, flexShrink: 0, display: "flex" }}>{icon}</span>
      <span style={{ ...T.body, color: unavailable ? C.ink3 : C.ink, textDecoration: unavailable ? "line-through" : "none" }}>{text}</span>
    </div>
  );
}

/** صف قابل للطي — نمط "أشياء يجب معرفتها". */
export function AccordionRow({ icon, title, children }: { icon?: ReactNode; title: string; children: ReactNode }) {
  const dir = useDir();
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: `1px solid ${C.line}` }}>
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-3 w-full"
        style={{ background: "none", border: "none", padding: "18px 0", cursor: "pointer", textAlign: "start" }}>
        {icon && <span style={{ color: C.ink, flexShrink: 0, display: "flex" }}>{icon}</span>}
        <span className="flex-1" style={{ ...T.h3, color: C.ink }}>{title}</span>
        <ChevronLeft size={18} color={C.ink2}
          style={{ flexShrink: 0, transition: "transform .2s", transform: `${dir === "rtl" ? "" : "scaleX(-1) "}${open ? "rotate(-90deg)" : ""}` }} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            style={{ overflow: "hidden" }}>
            <div style={{ ...T.meta, color: C.ink2, paddingBottom: 18, whiteSpace: "pre-line" }}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── تمرير أفقي ───────────────────────────────────────────────── */
/** يمتد حتى حافة الشاشة ويملك حشوته الجانبية بنفسه.
    الحاوية الأب يجب ألا تضيف paddingInline — استخدم <Section bleed>.
    (الهامش السالب مع scroll-snap يُسقط حشوة البداية في RTL.) */
export function HScroll({ children, gap = SPACE.gap }: { children: ReactNode; gap?: number }) {
  return (
    <div
      className="ts-hscroll flex overflow-x-auto"
      style={{
        gap, scrollSnapType: "x mandatory", scrollbarWidth: "none",
        paddingInline: SPACE.page,
        // بدونها يحاذي snap حافة البطاقة بحافة الـpadding-box فيبتلع الحشوة
        scrollPaddingInline: SPACE.page,
      }}>
      {children}
    </div>
  );
}

/* ── بطاقة الباقة في الاستكشاف ────────────────────────────────── */
/** حاوية محدودة (بخلاف بطاقات Airbnb العارية) — الحدّ والنبض يوضّحان منطقة اللمس.
    `facts` تدور تحت العنوان بارتفاع ثابت؛ إن غابت يُعرض `meta` ساكناً. */
export function ListingCard({
  image, title, meta, facts, factsDelay = 0, price, priceNote, badge, stars,
  onClick, disabled, width, pulse, imageAspect = "1 / 1",
}: {
  image: string; title: string; meta?: ReactNode; facts?: ReactNode[]; factsDelay?: number;
  price?: string; priceNote?: string; badge?: string; stars?: number;
  onClick?: () => void; disabled?: boolean; width?: number | string; pulse?: boolean;
  /** نسبة صورة البطاقة — بطاقات الشريط الأفقي أعرض فتُخفَّض لتبقى البطاقة قصيرة. */
  imageAspect?: string;
}) {
  const [liked, setLiked] = useState(false);
  const grid = width === "100%";
  const act = disabled ? undefined : onClick;

  return (
    <div
      className={`ts-card${pulse && !disabled ? " ts-pulse" : ""}`}
      style={{
        width: width ?? 200,
        flexShrink: grid ? undefined : 0,
        scrollSnapAlign: grid ? undefined : "start",
        opacity: disabled ? 0.55 : 1,
        border: `1px solid ${C.border}`, borderRadius: R.card,
        overflow: "hidden", background: C.white,
        transition: "transform .12s ease",
      }}>
      <div style={{ position: "relative" }}>
        <button onClick={act} disabled={disabled}
          style={{ display: "block", width: "100%", padding: 0, border: "none", background: "none", cursor: disabled ? "not-allowed" : "pointer" }}>
          <img src={image} alt="" loading="lazy"
            style={{ width: "100%", aspectRatio: imageAspect, objectFit: "cover", display: "block", background: C.fill }} />
        </button>
        {badge && (
          <span style={{
            position: "absolute", top: 10, insetInlineStart: 10, background: C.white, color: C.ink,
            borderRadius: R.pill, paddingInline: 10, height: 26, display: "inline-flex", alignItems: "center",
            ...T.small, boxShadow: SHADOW.float, maxWidth: "calc(100% - 52px)", whiteSpace: "nowrap",
            overflow: "hidden", textOverflow: "ellipsis",
          }}>{badge}</span>
        )}
        <button onClick={() => setLiked(v => !v)} aria-label="حفظ"
          style={{ position: "absolute", top: 8, insetInlineEnd: 8, background: "none", border: "none", cursor: "pointer", padding: 4, lineHeight: 0 }}>
          <Heart size={22} color="#fff" fill={liked ? C.gold : "rgba(0,0,0,.35)"} strokeWidth={2} />
        </button>
      </div>

      <button onClick={act} disabled={disabled}
        style={{ display: "block", width: "100%", padding: 12, border: "none", background: "none", textAlign: "start", cursor: disabled ? "not-allowed" : "pointer" }}>
        <div className="flex items-center gap-1.5">
          <span className="flex-1 truncate" style={{ ...T.body, fontSize: grid ? 15 : T.body.fontSize, fontWeight: 500, color: C.ink }}>{title}</span>
          {stars ? <Stars n={stars} size={12} compact={grid} /> : null}
        </div>

        {facts?.length
          ? <RotatingText items={facts} delay={factsDelay} style={{ ...T.meta, color: C.ink2, marginTop: 3 }} />
          : meta ? <div className="truncate" style={{ ...T.meta, color: C.ink2, marginTop: 3 }}>{meta}</div> : null}

        {price && (
          <div className="truncate" style={{ ...T.meta, color: C.ink, marginTop: 3 }}>
            <b style={{ fontWeight: 600 }}>{price}</b>
            {priceNote && <span style={{ color: C.ink2 }}> {priceNote}</span>}
          </div>
        )}
      </button>
    </div>
  );
}

/* ── معرض الصور العلوي ──────────────────────────────────────────

   ثلاثة تغييرات بطلب الفريق (٢٠٢٦-٠٩-٠٦):

   (١) «زرّا الحفظ والمشاركة أيقونات بلا نص». كان لهما aria-label عربيّ
       ثابت لا يتبع اللغة، ولا tooltip يراه المبصر، **وزرّ المشاركة بلا
       onClick إطلاقاً** — أيقونةٌ تُضغط فلا يقع شيء. الآن: اسمٌ مترجم،
       وتلميحٌ ظاهر، وفعلٌ حقيقي، وتوست يؤكّد النتيجة.

   (٢) «عدّاد 1/11 وحده لا يكفي». العدّاد يقول أين أنت ولا يقول كم بقي
       ولا ينقلك. أُضيفت نقاط تحتها: تُرى فيها الصور كلّها دفعةً،
       ومضغوطةٌ تنقل إليها — فهي مؤشّر وأداة تنقّل معاً. وفوق سبع صور
       تُختصر إلى نافذة منزلقة، لأن أحد عشرة نقطة تصير خيطاً لا يُعدّ.

   (٣) المشاركة تسقط إلى النسخ حين لا يدعم المتصفّح `navigator.share`
       (وهو الغالب على سطح المكتب): زرٌّ يعمل على الجوال ويصمت على
       الحاسوب أسوأ من زرٍّ واحد يعمل في الحالتين. */

/** أقصى عدد نقاط تُرسم كاملةً؛ فوقها نافذة منزلقة حول النشط. */
const DOTS_CAP = 7;

export function HeroGallery({ images, onBack, height = 300, t, shareTitle }: {
  images: string[];
  onBack?: () => void;
  height?: number;
  /** مترجم الشاشة. اختياري ليبقى المكوّن صالحاً بلا سياق لغة. */
  t?: (k: string) => string;
  /** عنوان ورقة المشاركة — اسم الباقة عادةً. */
  shareTitle?: string;
}) {
  const dir = useDir();
  const ref = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const [liked, setLiked] = useState(false);
  const reduced = useReducedMotion();

  /* fallback عربيّ حين لا يُمرَّر مترجم — لا مفاتيح عارية على الشاشة. */
  const AR: Record<string, string> = {
    savePkg: "حفظ الباقة", unsavePkg: "إزالة من المحفوظة", sharePkg: "مشاركة الباقة",
    savedToast: "حُفظت الباقة في قائمتك", unsavedToast: "أُزيلت من قائمتك",
    shareCopied: "نُسخ رابط الباقة", shareFailed: "تعذّرت المشاركة — انسخ الرابط من شريط العنوان",
    photoOf: "الصورة {i} من {n}", goToPhoto: "اذهب إلى الصورة {i}", back: "رجوع",
  };
  const tr = (k: string) => t?.(k) ?? AR[k] ?? k;
  const fill = (k: string, v: Record<string, string | number>) =>
    Object.entries(v).reduce((s, [a, b]) => s.replace(`{${a}}`, String(b)), tr(k));

  /** ينقل إلى صورة بعينها. `scrollTo` بالعرض لا بـscrollIntoView:
      الثاني يمرّر الصفحة كلّها إلى المعرض عند الضغط. */
  const goTo = useCallback((n: number) => {
    const el = ref.current; if (!el) return;
    const x = el.clientWidth * n;
    el.scrollTo({ left: dir === "rtl" ? -x : x, behavior: "smooth" });
    setI(n);
  }, [dir]);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    const onScroll = () => {
      // في RTL يكون scrollLeft سالباً في المتصفحات الحديثة — abs يغطّي الحالتين
      const idx = Math.round(Math.abs(el.scrollLeft) / el.clientWidth);
      setI(Math.min(images.length - 1, Math.max(0, idx)));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [images.length]);

  /* المعرض لا يبقى لقطةً ثابتة: ينقل صورة كل عدة ثوانٍ بتمريرٍ ناعم.
     المستخدم يظل حراً بالسحب أو بالنقاط، وتفضيل تقليل الحركة يوقف الدوران. */
  useEffect(() => {
    if (reduced || images.length < 2) return;
    const id = window.setInterval(() => {
      setI(current => {
        const next = (current + 1) % images.length;
        const el = ref.current;
        if (el) el.scrollTo({ left: (dir === "rtl" ? -1 : 1) * el.clientWidth * next, behavior: "smooth" });
        return next;
      });
    }, 4800);
    return () => window.clearInterval(id);
  }, [dir, images.length, reduced]);

  const toggleSave = () => {
    setLiked(v => {
      toast.success(tr(v ? "unsavedToast" : "savedToast"));
      return !v;
    });
  };

  const share = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const title = shareTitle || tr("sharePkg");
    try {
      if (navigator.share) { await navigator.share({ title, url }); return; }
      await navigator.clipboard.writeText(url);
      toast.success(tr("shareCopied"));
    } catch (e) {
      /* إلغاء المستخدم لورقة المشاركة ليس فشلاً — لا يُزعَج بتوست أحمر. */
      if ((e as { name?: string })?.name === "AbortError") return;
      console.error("[HeroGallery] تعذّرت المشاركة:", e);
      toast.error(tr("shareFailed"));
    }
  };

  /* نافذة النقاط: تتبع النشط وتبقى بطول DOTS_CAP، ولا تخرج عن الطرفين. */
  const from = images.length <= DOTS_CAP
    ? 0
    : Math.min(Math.max(0, i - (DOTS_CAP >> 1)), images.length - DOTS_CAP);
  const dots = Array.from({ length: Math.min(DOTS_CAP, images.length) }, (_, k) => from + k);

  return (
    <div style={{ position: "relative", background: C.fill, borderRadius: R.card, overflow: "hidden" }}>
      <div ref={ref} className="ts-hgallery flex overflow-x-auto"
        style={{ height, scrollSnapType: "x mandatory", scrollbarWidth: "none" }}>
        {images.map((src, n) => (
          <img key={n} src={src} alt="" loading={n === 0 ? "eager" : "lazy"}
            style={{ width: "100%", height, objectFit: "cover", flexShrink: 0, scrollSnapAlign: "center", display: "block" }} />
        ))}
      </div>

      <div className="flex items-center justify-between"
        style={{ position: "absolute", top: 14, insetInline: 14, pointerEvents: "none" }}>
        <div className="flex items-center gap-2" style={{ pointerEvents: "auto" }}>
          <IconBubble onClick={toggleSave} label={tr(liked ? "unsavePkg" : "savePkg")}
            pressed={liked}>
            <Heart size={17} fill={liked ? C.gold : "none"} color={liked ? C.gold : C.ink} />
          </IconBubble>
          <IconBubble onClick={share} label={tr("sharePkg")}><Share size={16} /></IconBubble>
        </div>
        {onBack && (
          <div style={{ pointerEvents: "auto" }}>
            <IconBubble onClick={onBack} label={tr("back")}>
              <ChevronRight size={19} style={backArrow(dir)} />
            </IconBubble>
          </div>
        )}
      </div>

      {images.length > 1 && (
        <>
          <span style={{
            position: "absolute", bottom: 46, insetInlineStart: 16,
            background: "rgba(0,0,0,.62)", color: "#fff", borderRadius: R.button,
            paddingInline: 9, height: 24, display: "inline-flex", alignItems: "center", ...T.small,
            /* بلا LTR يُقرأ «1 / 9» في سياق RTL كأنه «9 / 1» — أي الصورة التاسعة من واحدة */
            ...LTR,
          }}>{i + 1} / {images.length}</span>

          {/* النقاط فوق حافّة البطاقة البيضاء التي تعلو المعرض بـ-24px،
              فموضعها 34px لا 10px وإلا اختفت تحتها. */}
          <div className="flex items-center justify-center"
            role="tablist" aria-label={fill("photoOf", { i: i + 1, n: images.length })}
            style={{ position: "absolute", bottom: 34, insetInline: 0, gap: 6, pointerEvents: "none" }}>
            {dots.map(n => {
              const on = n === i;
              /* النقطة الطرفية تصغر حين وراءها المزيد — إشارةٌ إلى أن
                 النافذة مقتطعة، بلا رقم إضافي. */
              const edge = images.length > DOTS_CAP && (n === from || n === from + DOTS_CAP - 1);
              return (
                <button key={n} onClick={() => goTo(n)} role="tab" aria-selected={on}
                  aria-label={fill("goToPhoto", { i: n + 1 })}
                  style={{
                    pointerEvents: "auto", border: "none", padding: 0, cursor: "pointer",
                    width: on ? 18 : edge ? 4 : 6, height: edge && !on ? 4 : 6,
                    borderRadius: R.pill, transition: "width .18s, height .18s, background .18s",
                    background: on ? "#fff" : "rgba(255,255,255,.55)",
                    boxShadow: "0 1px 3px rgba(0,0,0,.35)",
                  }} />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ── معرض وسائط: رئيسية فوق + شريط مصغّرات ───────────────────── */
export interface GalleryItem { url: string; kind: "image" | "video"; poster?: string }

const THUMB = 62;

/** صورة رئيسية مع شريط مصغّرات. يتكيّف مع العدد:
    عنصر واحد → بلا شريط · ≤4 → شريط ساكن · أكثر → يتمرّر ويتبع النشط.
    التقدّم التلقائي يتوقف نهائياً عند أول تفاعل — وإلا قاوم المستخدمَ كلما تصفّح. */
export function MediaGallery({ items, height = 210, onOpen, layout = "default" }: {
  items: GalleryItem[]; height?: number; onOpen?: (i: number) => void;
  /** معرض موجز لسطح المكتب: ثلاث صور كحد أقصى بدل صورة عملاقة. */
  layout?: "default" | "triplet";
}) {
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);
  const [touched, setTouched] = useState(false);
  const [playing, setPlaying] = useState<number | null>(null);
  const strip = useRef<HTMLDivElement>(null);

  const auto = !reduced && !touched && items.length > 1 && playing === null;

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => setI(n => (n + 1) % items.length), 4000);
    return () => clearInterval(id);
  }, [auto, items.length]);

  /* الشريط يتبع المصغّرة النشطة — بتمرير الشريط وحده.
     ‏scrollIntoView ممنوع هنا: يمرّر كل الحاويات الأب بما فيها الصفحة،
     فكل معرض يسحب الصفحة إليه مع كل تقدّم تلقائي ويقاوم تمرير المستخدم.
     الإزاحة تُحسب من المواضع المرسومة فعلاً، فتصحّ في RTL و LTR معاً
     (‏scrollLeft سالب في RTL، وحسابه يدوياً مصدر أخطاء). */
  useEffect(() => {
    const wrap = strip.current;
    const el = wrap?.children[i] as HTMLElement | undefined;
    if (!wrap || !el) return;
    const w = wrap.getBoundingClientRect();
    const e = el.getBoundingClientRect();
    const delta = (e.left + e.width / 2) - (w.left + w.width / 2);
    if (Math.abs(delta) < 1) return;
    wrap.scrollBy({ left: delta, behavior: reduced ? "auto" : "smooth" });
  }, [i, reduced]);

  if (!items.length) return null;
  const cur = items[i];

  const take = (n: number) => { setTouched(true); setPlaying(null); setI(n); };

  if (layout === "triplet") {
    return (
      <div className="ts-media-triplet">
        {items.slice(0, 3).map((m, n) => (
          <button key={n} type="button" onClick={() => { setTouched(true); onOpen?.(n); }}
            aria-label={`عرض الصورة ${n + 1}`}>
            <img src={m.kind === "video" ? (m.poster ?? "") : m.url} alt="" loading="lazy" />
            {n === 2 && items.length > 3 && <span>+{items.length - 3}</span>}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div style={{ position: "relative", borderRadius: R.card, overflow: "hidden", background: C.fill, height }}>
        {cur.kind === "video" && playing === i ? (
          // يُحمَّل فقط بعد الضغط — الفيديو ثقيل والمستخدم غالباً على بيانات الجوال
          <video src={cur.url} poster={cur.poster} controls autoPlay playsInline
            style={{ width: "100%", height: "100%", objectFit: "cover", background: C.fill }} />
        ) : (
          <button
            onClick={() => { setTouched(true); cur.kind === "video" ? setPlaying(i) : onOpen?.(i); }}
            style={{ display: "block", width: "100%", height: "100%", padding: 0, border: "none", background: "none", cursor: "pointer" }}>
            <img src={cur.kind === "video" ? (cur.poster ?? "") : cur.url} alt="" loading="lazy"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            {cur.kind === "video" && (
              <span style={{
                position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(0,0,0,.28)",
              }}>
                <span style={{
                  width: 54, height: 54, borderRadius: R.pill, background: "rgba(255,255,255,.94)",
                  display: "flex", alignItems: "center", justifyContent: "center", boxShadow: SHADOW.float,
                }}>
                  <Play size={22} fill={C.ink} color={C.ink} style={{ marginInlineStart: 3 }} />
                </span>
              </span>
            )}
          </button>
        )}

        {items.length > 1 && (
          <span style={{
            position: "absolute", bottom: 10, insetInlineStart: 10,
            background: "rgba(0,0,0,.62)", color: "#fff", borderRadius: R.button,
            paddingInline: 9, height: 24, display: "inline-flex", alignItems: "center", ...T.small, ...LTR,
          }}>{i + 1} / {items.length}</span>
        )}
      </div>

      {items.length > 1 && (
        <div ref={strip} className="ts-hscroll flex overflow-x-auto"
          style={{ gap: 8, marginTop: 8, scrollbarWidth: "none", paddingBlock: 3 }}>
          {items.map((m, n) => (
            <button key={n} onClick={() => take(n)} aria-label={`${n + 1}`}
              style={{
                position: "relative", width: THUMB, height: THUMB, flexShrink: 0, padding: 0,
                borderRadius: R.button, overflow: "hidden", cursor: "pointer", background: C.fill,
                border: n === i ? `2px solid ${C.green}` : `1px solid ${C.border}`,
                opacity: n === i ? 1 : 0.72, transition: "opacity .15s",
              }}>
              <img src={m.kind === "video" ? (m.poster ?? "") : m.url} alt="" loading="lazy"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              {m.kind === "video" && (
                <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.3)" }}>
                  <Play size={16} fill="#fff" color="#fff" />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── الشريط الثابت السفلي ─────────────────────────────────────── */
export function StickyBar({ price, note, chip, cta, onCta, ctaDisabled, variant = "green" }: {
  price?: string; note?: string; chip?: ReactNode;
  cta: string; onCta?: () => void; ctaDisabled?: boolean; variant?: "green" | "dark";
}) {
  return (
    <div className="ts-sticky-bar" style={{
      position: "sticky", bottom: 0, zIndex: 30, background: C.white,
      borderTop: `1px solid ${C.line}`, boxShadow: SHADOW.sheet,
      paddingInline: SPACE.page, paddingBlock: 12,
      display: "flex", alignItems: "center", gap: 16,
      paddingBottom: `calc(12px + env(safe-area-inset-bottom, 0px))`,
    }}>
      {(price || note || chip) && (
        <div className="flex-1 min-w-0">
          {price && <div style={{ ...T.price, color: C.ink, textDecoration: "underline", textUnderlineOffset: 3 }}>{price}</div>}
          {note && <div className="truncate" style={{ ...T.small, fontWeight: 400, color: C.ink2, marginTop: 2 }}>{note}</div>}
          {chip && <div style={{ marginTop: 6 }}>{chip}</div>}
        </div>
      )}
      <CTAButton onClick={onCta} disabled={ctaDisabled} variant={variant} full={!price && !note && !chip}
        style={{ flexShrink: 0, minWidth: 150 }}>
        {cta}
      </CTAButton>
    </div>
  );
}

/* ── ورقة سفلية ───────────────────────────────────────────────── */
/* الورقة هي الحوار الأكثر استعمالاً في واجهة المستفيد (اختيار التاريخ،
   الغرف، المعرض، الشروط، بيانات المسافر). كانت div بلا دور ولا Escape
   ولا حصر تركيز: من يستعمل لوحة المفاتيح وحدها لا يستطيع إغلاقها، وقارئ
   الشاشة لا يعلن أن حواراً فُتح. الحرس كلّه في useDialogA11y فيسري على
   كل موضع استُعملت فيه بلا تعديل أي منها. */
export function Sheet({ open, onClose, title, children, footer }: {
  open: boolean; onClose: () => void; title?: string; children: ReactNode; footer?: ReactNode;
}) {
  const a11y = useDialogA11y({ open, onClose, title });

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "flex-end" }}>
          <motion.div
            ref={a11y.ref}
            {...a11y.panelProps}
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
            onClick={e => e.stopPropagation()}
            style={{
              width: "100%", maxHeight: "92vh", background: C.white,
              borderTopLeftRadius: R.sheet, borderTopRightRadius: R.sheet,
              display: "flex", flexDirection: "column", overflow: "hidden",
              /* الصندوق يقبل التركيز برمجياً (tabIndex=-1) فلا يُرسم له
                 إطار تركيز: الإطار على عنصرٍ ليس هدف تنقّلٍ يُشوّش. */
              outline: "none",
            }}>
            <div className="flex items-center gap-3" style={{ padding: `14px ${SPACE.page}px`, borderBottom: `1px solid ${C.line}`, flexShrink: 0 }}>
              <button onClick={onClose} aria-label="إغلاق"
                style={{ width: 34, height: 34, borderRadius: R.pill, border: "none", background: "none", color: C.ink, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <X size={19} />
              </button>
              {title && <span id={a11y.titleId} className="flex-1 text-center" style={{ ...T.h3, color: C.ink }}>{title}</span>}
              <span style={{ width: 34, flexShrink: 0 }} />
            </div>
            <div className="flex-1 overflow-y-auto" style={{ padding: SPACE.page }}>{children}</div>
            {footer && <div style={{ padding: SPACE.page, borderTop: `1px solid ${C.line}`, flexShrink: 0 }}>{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ── عدّاد ────────────────────────────────────────────────────── */
export function Counter({ value, min = 1, max = 99, onChange, label, note }: {
  value: number; min?: number; max?: number; onChange: (v: number) => void; label: string; note?: string;
}) {
  const btn = (on: boolean): CSSProperties => ({
    width: 34, height: 34, borderRadius: R.pill,
    border: `1px solid ${on ? C.ink2 : C.line}`, background: C.white,
    color: on ? C.ink : C.ink3, cursor: on ? "pointer" : "not-allowed",
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  });
  return (
    <div className="flex items-center gap-4" style={{ paddingBlock: 8 }}>
      <div className="flex-1">
        <div style={{ ...T.body, fontWeight: 500, color: C.ink }}>{label}</div>
        {note && <div style={{ ...T.meta, color: C.ink2 }}>{note}</div>}
      </div>
      <div className="flex items-center gap-3">
        <button onClick={() => value > min && onChange(value - 1)} disabled={value <= min} style={btn(value > min)} aria-label="إنقاص"><Minus size={15} /></button>
        <span style={{ ...T.body, fontWeight: 500, color: C.ink, minWidth: 20, textAlign: "center", ...LTR }}>{value}</span>
        <button onClick={() => value < max && onChange(value + 1)} disabled={value >= max} style={btn(value < max)} aria-label="زيادة"><Plus size={15} /></button>
      </div>
    </div>
  );
}

/* ── حقل إدخال ────────────────────────────────────────────────── */
export function Field({ value, onChange, placeholder, ltr, type = "text" }: {
  value: string; onChange: (v: string) => void; placeholder?: string; ltr?: boolean; type?: string;
}) {
  const dir = useDir();
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} type={type}
      style={{
        width: "100%", height: 54, paddingInline: 14, borderRadius: R.button,
        border: `1px solid ${C.border}`, background: C.white, color: C.ink,
        fontFamily: FONT.sans, fontSize: 16, outline: "none",
        ...(ltr ? { direction: "ltr" as const, textAlign: dir === "rtl" ? ("right" as const) : ("left" as const) } : null),
      }} />
  );
}

/* ── صف اختيار (نوع السكن) ────────────────────────────────────── */
/** صف اختيار. **الصف كله — بما فيه الصورة — يختار**، وعند تمرير `onDetails`
    يُضاف زر مفصول بخط رفيع في طرف الصف يفتح التفاصيل.
    الفصل مقصود: منطقتا لمس متداخلتان في صف واحد تُفاجئ المستخدم،
    والخط الرفيع هو ما يعلن أن هذا شيء آخر. زران شقيقان لا متداخلان —
    زر داخل زر HTML غير صحيح. */
export function SelectRow({ image, title, note, price, priceNote, selected, onClick, onDetails, detailsLabel, detailsCount }: {
  image?: string; title: string; note?: string; price?: string; priceNote?: string;
  selected?: boolean; onClick?: () => void;
  onDetails?: () => void; detailsLabel?: string; detailsCount?: number;
}) {
  return (
    <div className="flex items-stretch"
      style={{
        border: `${selected ? 2 : 1}px solid ${selected ? C.green : C.border}`,
        background: selected ? C.greenTint : C.white,
        borderRadius: R.card, padding: selected ? 11 : 12,
      }}>
      <button onClick={onClick}
        className="flex items-center gap-3 flex-1 min-w-0"
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "start" }}>
        {image && (
          <img src={image} alt="" loading="lazy"
            style={{ width: 60, height: 60, borderRadius: R.button, objectFit: "cover", display: "block", flexShrink: 0, background: C.fill }} />
        )}
        <div className="flex-1 min-w-0">
          <div className="truncate" style={{ ...T.body, fontWeight: 500, color: C.ink }}>{title}</div>
          {note && <div className="truncate" style={{ ...T.meta, color: C.ink2 }}>{note}</div>}
        </div>
        <div style={{ textAlign: "end", flexShrink: 0 }}>
          {price && <div style={{ ...T.body, fontWeight: 600, color: C.ink, ...LTR }}>{price}</div>}
          {priceNote && <div style={{ ...T.small, fontWeight: 400, color: C.ink2 }}>{priceNote}</div>}
        </div>
      </button>

      {onDetails && (
        <>
          <span aria-hidden style={{ width: 1, background: C.border, marginInline: 6, alignSelf: "stretch", flexShrink: 0 }} />
          <button onClick={onDetails} aria-label={detailsLabel}
            className="flex flex-col items-center justify-center"
            style={{ width: 38, flexShrink: 0, gap: 3, background: "none", border: "none", cursor: "pointer", color: C.green, padding: 0 }}>
            <Images size={18} />
            <span style={{ fontSize: 10, fontWeight: 600, lineHeight: 1, whiteSpace: "nowrap" }}>
              {detailsCount != null && <span style={LTR}>{detailsCount} </span>}{detailsLabel}
            </span>
          </button>
        </>
      )}
    </div>
  );
}

/* ── تقويم الرحلات ────────────────────────────────────────────── */
const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
/* تُكتب كاملة: الحرف الواحد («خ» مثلاً) يفرض على المستفيد تخمين اليوم.
   يبدأ الأسبوع بالأحد، وهو نفس ترتيب `Date#getDay()` فلا يحتاج حسابُ موضع
   أول الشهر إلى تحويلٍ إضافي. */
const AR_WEEK = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

/** تقويم شهري: المتاح أخضر محاط، المختار دائرة خضراء ممتلئة، المكتمل مشطوب،
    واليوم بلا رحلة باهت بلا حدّ.

    التمييز بين «مكتمل» و«لا رحلة» مقصود: كانا يُرسمان خليةً رمادية واحدة، فمن
    رأى يومه فارغاً لم يعرف أهو غير مطروح أصلاً أم فاته. والمكتمل يبقى ظاهراً
    لأن اختفاءه يوحي بأن الباقة لا تسير ذلك اليوم.

    `isFull` يأتي من المستدعي لا يُحسب هنا: قواعد الإتاحة (حالة الرحلة والمقاعد
    المتبقية ووضع التجربة) شأن طبقة البيانات، والتقويم يرسم ما يُقال له. */
export function TripCalendar<Tr extends { id: string; departureDate: string }>({
  trips, valueId, rangeEndDate, onPick, onClear, clearLabel, isFull, month, onMonthChange, legend,
}: {
  trips: Tr[]; valueId?: string; onPick: (t: Tr) => void; onClear?: () => void; clearLabel?: string;
  /** نهاية الإقامة المحسوبة من مدة الباقة. لا تُختار؛ تُرسم فقط لتوضيح المدى. */
  rangeEndDate?: string;
  /** اليوم موجود لكن لا يُحجز — يُرسم مشطوباً. */
  isFull?: (t: Tr) => boolean;
  /** الشهر المعروض — يُرفع للمستدعي كي لا يُفقد عند طيّ الخطوة وإعادة فتحها. */
  month?: { y: number; m: number };
  onMonthChange?: (ym: { y: number; m: number }) => void;
  /** أسماء الحالات في المفتاح أسفل الشبكة. بلا هذا لا يُقرأ الترميز اللوني. */
  legend?: { available: string; full: string };
}) {
  const dir = useDir();
  const byDate = new Map<string, Tr>();
  /* المتاح يغلب المكتمل على اليوم الواحد: يومٌ فيه رحلتان إحداهما مفتوحة قابل للحجز. */
  trips.forEach(t => {
    const cur = byDate.get(t.departureDate);
    if (!cur || (isFull?.(cur) && !isFull?.(t))) byDate.set(t.departureDate, t);
  });
  const selectedDepartureDate = valueId ? trips.find(t => t.id === valueId)?.departureDate : undefined;

  const first = trips.map(t => t.departureDate).sort()[0];
  const initial = first ? new Date(first + "T00:00:00") : new Date();
  const [ownYm, setOwnYm] = useState({ y: initial.getFullYear(), m: initial.getMonth() });
  const ym = month ?? ownYm;

  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const firstCol = new Date(ym.y, ym.m, 1).getDay();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstCol; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const pad = (n: number) => String(n).padStart(2, "0");
  const move = (delta: number) => {
    let m = ym.m + delta, y = ym.y;
    if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; }
    const next = { y, m };
    if (month) onMonthChange?.(next); else { setOwnYm(next); onMonthChange?.(next); }
  };

  const navBtn: CSSProperties = {
    width: 34, height: 34, borderRadius: R.pill, border: "none", background: "none",
    color: C.ink, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
  };

  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
        <button onClick={() => move(-1)} style={navBtn} aria-label="الشهر السابق">
          <ChevronRight size={20} style={backArrow(dir)} />
        </button>
        <div style={{ ...T.h3, color: C.ink }}>{AR_MONTHS[ym.m]} {ym.y}</div>
        <button onClick={() => move(1)} style={navBtn} aria-label="الشهر التالي">
          <ChevronLeft size={20} style={backArrow(dir)} />
        </button>
      </div>

      <div className="grid grid-cols-7" style={{ gap: 2 }}>
        {AR_WEEK.map((w, i) => (
          <div key={"w" + i} title={w}
            style={{ textAlign: "center", ...T.small, fontSize: "clamp(7px, 1vw, 12px)", lineHeight: 1.2, color: C.ink2, paddingBottom: 6 }}>
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={"e" + i} style={{ height: 46 }} />;
          const ds = `${ym.y}-${pad(ym.m + 1)}-${pad(d)}`;
          const trip = byDate.get(ds);
          const full = !!trip && !!isFull?.(trip);
          const open = !!trip && !full;
          const on = open && valueId === trip.id;
          const isRangeStart = !!on;
          const isRangeEnd = !!rangeEndDate && ds === rangeEndDate && ds !== selectedDepartureDate;
          const isBetween = !!rangeEndDate && !!selectedDepartureDate
            && ds > selectedDepartureDate && ds < rangeEndDate;
          const isRangeEdge = isRangeStart || isRangeEnd;
          const rangeLabel = isRangeStart ? "بداية الرحلة" : isRangeEnd ? "نهاية الرحلة" : isBetween ? "ضمن مدة الرحلة" : "";
          return (
            // البداية والنهاية ذهبيتان، وما بينهما تظليل هادئ: يختار
            // المستفيد يوم الانطلاق فقط لكنه يرى كامل مدة الإقامة فوراً.
            <button key={"d" + i} disabled={!open} onClick={() => open && onPick(trip)}
              aria-label={[String(d), full && legend ? legend.full : "", rangeLabel].filter(Boolean).join(" — ")}
              style={{
                height: 46, borderRadius: isBetween ? R.button : R.pill,
                background: isRangeEdge ? C.green : isBetween ? C.greenTint : open ? C.white : "none",
                border: isRangeEdge ? "none" : open ? `1px solid ${C.green}` : "none",
                color: isRangeEdge ? C.white : isBetween ? C.greenDeep : open ? C.green : C.ink3,
                textDecoration: full ? "line-through" : "none",
                cursor: open ? "pointer" : "default",
                fontFamily: FONT.sans, fontSize: 15, fontWeight: isRangeEdge || open ? 600 : 400,
                ...LTR,
              }}>
              {d}
            </button>
          );
        })}
      </div>

      {/* مفتاح الحالات — بدونه يبقى الترميز اللوني تخميناً */}
      {legend && (
        <div className="flex items-center flex-wrap" style={{ gap: 14, marginTop: 12 }}>
          <span className="inline-flex items-center" style={{ gap: 6, ...T.small, fontWeight: 400, color: C.ink2 }}>
            <span aria-hidden style={{ width: 14, height: 14, borderRadius: R.pill, background: C.white, border: `1px solid ${C.green}` }} />
            {legend.available}
          </span>
          <span className="inline-flex items-center" style={{ gap: 6, ...T.small, fontWeight: 400, color: C.ink2 }}>
            <span aria-hidden style={{ width: 14, height: 1, background: C.ink3 }} />
            {legend.full}
          </span>
        </div>
      )}

      {onClear && valueId && (
        <div style={{ textAlign: "start", marginTop: 10 }}>
          <button onClick={onClear}
            style={{ background: "none", border: "none", ...T.meta, fontWeight: 600, color: C.ink, textDecoration: "underline", cursor: "pointer", padding: 0 }}>
            {clearLabel ?? "محو التاريخ"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── مساعد عرض السعر ──────────────────────────────────────────── */
export const priceText = (n: number, currency: string) => `${money(n)} ${currency}`;
