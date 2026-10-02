import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { B } from "@/lib/theme";
import { parseYMD, ymd, todayYMD } from "@/lib/utils";
import { AR_MONTHS } from "@/lib/trip";

/* ════════ تقويم موعد الرحلة ════════

   تقويمٌ مرسومٌ هنا لا مكتبة: الخانة تحمل معنى الرحلة لا «يوماً مختاراً»
   فحسب — الذهاب والعودة والمدة بينهما، وفي الإطلاق المتعدد أسابيع الدفعة
   كلها والمستبعَد منها. مكتبة التقويم تعرف «مختاراً» واحداً، فكانت
   العودة تختفي حين يُختار الذهاب، وأسماء الأيام الكاملة تتراكب في
   أعمدتها الضيقة.

   والأسبوع يبدأ بالسبت كما في التقويم السابق، والأرقام لاتينية كما في
   بطاقتَي الذهاب والعودة فوقه — لا رقمان بخطَّين لتاريخٍ واحد. */

const WEEK = ["سبت", "أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة"];
/* getDay: الأحد ٠ … السبت ٦ ← عمود السبت أولاً. */
const col = (d: Date) => (d.getDay() + 1) % 7;
/* الصفحة RTL: الشهر التالي يدخل من اليسار والسابق من اليمين. */
const slide = {
  enter: (dir: number) => ({ opacity: 0, x: dir * -24 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir * 24 }),
};

export interface WeeklyMark { date: string; index: number; skipped: boolean; conflict: boolean; }

export function ScheduleCalendar({
  focus, departure, returnDate, min, weekly = [], onPick,
}: {
  /** التاريخ الذي يُختار الآن (الذهاب أو العودة) — يُفتح التقويم على شهره. */
  focus: string;
  departure: string;
  returnDate: string;
  /** أول يومٍ قابل للاختيار (YYYY-MM-DD). */
  min: string;
  /** تواريخ الدفعة بعد الأولى — تُعلَّم ولا تُختار من هنا. */
  weekly?: WeeklyMark[];
  onPick: (v: string) => void;
}) {
  const start = parseYMD(focus) ?? parseYMD(departure) ?? parseYMD(todayYMD())!;
  const [view, setView] = useState({ y: start.y, m: start.m });
  const [dir, setDir] = useState(1);
  /* تبديل الذهاب/العودة ينقل التقويم إلى شهر التاريخ المعني. */
  useEffect(() => {
    const p = parseYMD(focus);
    if (p) setView(v => (v.y === p.y && v.m === p.m ? v : { y: p.y, m: p.m }));
  }, [focus]);

  const today = todayYMD();
  const minP = parseYMD(min);
  const canPrev = !minP || view.y > minP.y || (view.y === minP.y && view.m > minP.m);
  const go = (delta: number) => {
    setDir(delta);
    setView(v => { const d = new Date(v.y, v.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  };
  const tp = parseYMD(today)!;
  const onTodayMonth = view.y === tp.y && view.m === tp.m;
  const jumpToday = () => { setDir(view.y * 12 + view.m > tp.y * 12 + tp.m ? -1 : 1); setView({ y: tp.y, m: tp.m }); };

  const first = new Date(view.y, view.m, 1);
  const lead = col(first);
  const count = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: count }, (_, i) => ymd(view.y, view.m, i + 1)),
  ];
  const marks = new Map(weekly.map(w => [w.date, w]));
  const hasRange = !!departure && !!returnDate && returnDate > departure;
  const band = "#F7EEDC";

  return (
    <div className="w-full rounded-2xl overflow-hidden select-none" style={{ border: `1px solid ${B.border}`, background: "#fff" }}>
      <div className="flex items-center justify-between px-3 py-2.5" style={{ background: B.primaryDeep }}>
        <button type="button" onClick={() => canPrev && go(-1)} disabled={!canPrev} aria-label="الشهر السابق"
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.14)", color: "#fff", opacity: canPrev ? 1 : .35, cursor: canPrev ? "pointer" : "not-allowed" }}>
          <ChevronRight size={15} />
        </button>
        <div className="flex items-baseline gap-2">
          <span className="font-extrabold text-white" style={{ fontSize: 15 }}>{AR_MONTHS[view.m]}</span>
          <span className="text-xs font-bold" style={{ color: B.gold2 }}>{view.y}</span>
          {!onTodayMonth && <button type="button" onClick={jumpToday} className="text-[10px] font-bold px-2 py-0.5 rounded-full cursor-pointer mr-1"
            style={{ background: "rgba(231,194,113,.14)", border: "1px solid rgba(231,194,113,.35)", color: B.gold2 }}>اليوم</button>}
        </div>
        <button type="button" onClick={() => go(1)} aria-label="الشهر التالي"
          className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer"
          style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.14)", color: "#fff" }}>
          <ChevronLeft size={15} />
        </button>
      </div>

      <div className="grid grid-cols-7 px-2 pt-2.5 pb-1" style={{ background: B.cream }}>
        {WEEK.map((w, i) => (
          <div key={w} className="text-center text-[11px] font-bold" style={{ color: i === 6 ? B.gold : B.muted }}>{w}</div>
        ))}
      </div>

      <div className="relative overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.div key={`${view.y}-${view.m}`} custom={dir} variants={slide}
            initial="enter" animate="center" exit="exit" transition={{ duration: .18 }}
            className="grid grid-cols-7 gap-y-1 px-2 pt-1.5 pb-2.5">
            {cells.map((d, i) => {
              if (!d) return <div key={`b${i}`} />;
              const disabled = d < min;
              const isDep = d === departure;
              const isRet = hasRange && d === returnDate;
              const inRange = hasRange && d > departure && d < returnDate;
              const mark = marks.get(d);
              const isToday = d === today;
              /* شريط المدة بين الذهاب والعودة: نصف خانة عند الطرفين كي
                 يتّصل الشريط بالدائرة لا يتجاوزها. الصفحة RTL فالأقدم يمين. */
              const bandBg = inRange ? band
                : isDep && hasRange ? `linear-gradient(to left, transparent 50%, ${band} 50%)`
                : isRet ? `linear-gradient(to right, transparent 50%, ${band} 50%)`
                : "transparent";
              let bg = "transparent", fg: string = B.black, border = "1px solid transparent", label = "";
              if (isDep) { bg = B.gold; label = weekly.length ? "رحلة 1" : "ذهاب"; }
              else if (isRet) { bg = B.primaryDeep; fg = "#fff"; label = "عودة"; }
              else if (mark) {
                label = mark.skipped ? "مستبعدة" : `رحلة ${mark.index}`;
                if (mark.skipped) { fg = B.muted; border = `1px dashed ${B.border}`; }
                else if (mark.conflict) { bg = "#FBE6E6"; fg = "#BE2626"; border = "1px solid #F3C9C9"; }
                else { bg = "#FFF4DE"; border = "1px solid #E6C77F"; }
              }
              if (disabled) fg = "#C9C1B6";
              return (
                <div key={d} className="flex justify-center" style={{ background: bandBg }}>
                  <button type="button" disabled={disabled} onClick={() => onPick(d)}
                    aria-label={d} aria-pressed={isDep || isRet}
                    className={`trip-cal-day relative w-full max-w-[46px] h-[44px] rounded-xl flex flex-col items-center justify-center ${disabled ? "" : "cursor-pointer"}`}
                    style={{ background: bg, color: fg, border, boxShadow: isDep ? "0 3px 10px rgba(192,134,44,.35)" : isRet ? "0 3px 10px rgba(21,76,72,.3)" : "none" }}>
                    <span className="text-[13px] leading-none" style={{ fontWeight: isDep || isRet || mark ? 800 : 600, textDecoration: mark?.skipped ? "line-through" : "none" }}>
                      {Number(d.slice(8))}
                    </span>
                    {label && <span className="text-[9px] font-bold leading-none mt-1" style={{ opacity: isDep || isRet ? .85 : 1 }}>{label}</span>}
                    {isToday && !label && <span className="absolute bottom-1.5 w-1 h-1 rounded-full" style={{ background: B.primary }} />}
                  </button>
                </div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
