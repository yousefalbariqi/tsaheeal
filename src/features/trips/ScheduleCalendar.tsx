import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { B, TONE } from "@/lib/theme";
import { fmtDayDate } from "@/lib/dates";
import { Button, IconButton } from "@/components/ui";
import { parseYMD, ymd, todayYMD } from "@/lib/utils";
import { AR_MONTHS } from "@/lib/trip";

/* ════════ تقويم موعد الرحلة ════════

   تقويمٌ مرسومٌ هنا لا مكتبة: الخانة تحمل معنى الرحلة لا «يوماً مختاراً»
   فحسب — الذهاب والعودة والمدة بينهما، وفي الإطلاق المتعدد أسابيع الدفعة
   كلها والمستبعَد منها. مكتبة التقويم تعرف «مختاراً» واحداً، فكانت
   العودة تختفي حين يُختار الذهاب، وأسماء الأيام الكاملة تتراكب في
   أعمدتها الضيقة.

   والأسبوع يبدأ بالسبت كما في التقويم السابق، والأرقام لاتينية كما في
   بطاقتَي الذهاب والعودة فوقه — لا رقمان بخطَّين لتاريخٍ واحد.

   والألوان من لوحة الكسوة: الذهاب أسودُ ممتلئ والعودة أسودُ بإطار — لا
   ذهبي. الذهبي في هذه النافذة لزرّ الإطلاق وحده، وخانةٌ ذهبية بجواره
   كانت تُقرأ زرّاً ثانياً. واليوم الحالي حلقةٌ ذهبية رفيعة: علامة «أنت
   هنا» لا اختيار. */

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
  const band = B.fill;

  return (
    <div className="w-full select-none" style={{ border: `1px solid ${B.border}`, borderRadius: 14, background: B.surface, overflow: "hidden" }}>
      <div className="flex items-center justify-between gap-2 px-3 py-2.5" style={{ borderBottom: `1px solid ${B.border}` }}>
        <IconButton size="sm" variant="outline" label="الشهر السابق" disabled={!canPrev} onClick={() => canPrev && go(-1)}><ChevronRight size={16} /></IconButton>
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-extrabold" style={{ fontSize: 15, color: B.black }}>{AR_MONTHS[view.m]}</span>
          <span style={{ fontSize: 13, color: B.muted }}>{view.y}</span>
          {!onTodayMonth && <Button size="sm" variant="ghost" onClick={jumpToday} style={{ height: 26, padding: "0 8px", fontSize: 12 }}>اليوم</Button>}
        </div>
        <IconButton size="sm" variant="outline" label="الشهر التالي" onClick={() => go(1)}><ChevronLeft size={16} /></IconButton>
      </div>

      <div className="grid grid-cols-7 px-2 pt-2.5 pb-1">
        {WEEK.map(w => (
          <div key={w} className="text-center" style={{ fontSize: 12, fontWeight: 600, color: B.muted }}>{w}</div>
        ))}
      </div>

      <div className="relative overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.div key={`${view.y}-${view.m}`} custom={dir} variants={slide}
            initial="enter" animate="center" exit="exit" transition={{ duration: .18 }}
            className="grid grid-cols-7 gap-y-1 px-2 pt-1 pb-2.5">
            {cells.map((d, i) => {
              if (!d) return <div key={`b${i}`} />;
              const disabled = d < min;
              const isDep = d === departure;
              const isRet = hasRange && d === returnDate;
              const inRange = hasRange && d > departure && d < returnDate;
              const mark = marks.get(d);
              const isToday = d === today;
              /* شريط المدة بين الذهاب والعودة: نصف خانة عند الطرفين كي
                 يتّصل الشريط بالخانة لا يتجاوزها. الصفحة RTL فالأقدم يمين. */
              const bandBg = inRange ? band
                : isDep && hasRange ? `linear-gradient(to left, transparent 50%, ${band} 50%)`
                : isRet ? `linear-gradient(to right, transparent 50%, ${band} 50%)`
                : "transparent";
              let bg = "transparent", fg: string = B.black, border = "1px solid transparent", label = "";
              if (isDep) { bg = B.ink; fg = B.onInk; label = weekly.length ? "رحلة 1" : "ذهاب"; }
              else if (isRet) { bg = B.surface; border = `1.5px solid ${B.black}`; label = "عودة"; }
              else if (mark) {
                /* المستبعدة تبقى برقمها مشطوباً: «رحلة ٣» التي لن تُطلق، لا خانةً
                   فارغة يُظنّ أنها لم تُقترح أصلاً. */
                label = `رحلة ${mark.index}`;
                if (mark.skipped) { fg = B.muted; border = `1px dashed ${B.borderStrong}`; }
                else if (mark.conflict) { bg = TONE.danger.bg; fg = TONE.danger.fg; border = `1px solid ${TONE.danger.line}`; }
                else { bg = B.surface; border = `1px solid ${B.borderStrong}`; }
              }
              if (disabled) fg = B.placeholder;
              const strike = mark?.skipped ? "line-through" : "none";
              const say = `${fmtDayDate(d)}${label ? ` — ${mark?.skipped ? "مستبعدة" : mark?.conflict ? `${label}، المركبة مشغولة` : label}` : ""}`;
              return (
                <div key={d} className="flex justify-center" style={{ background: bandBg }}>
                  <button type="button" disabled={disabled} onClick={() => onPick(d)}
                    aria-label={say} title={say} aria-pressed={isDep || isRet}
                    className={`trip-cal-day relative w-full max-w-[60px] h-[48px] rounded-xl flex flex-col items-center justify-center ${disabled ? "" : "cursor-pointer"}`}
                    style={{ background: bg, color: fg, border, boxShadow: isToday && !isDep ? `inset 0 0 0 1.5px ${B.gold}` : "none" }}>
                    <span className="leading-none" style={{ fontSize: 14, fontWeight: isDep || isRet || mark ? 700 : 500, textDecoration: strike }}>
                      {Number(d.slice(8))}
                    </span>
                    {label && <span className="leading-none" style={{ fontSize: 12, fontWeight: 600, marginTop: 4, textDecoration: strike, opacity: isDep ? .8 : 1 }}>{label}</span>}
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
