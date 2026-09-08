import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const WEEK_DAYS = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];
const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parseIso = (iso: string) => {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month: month - 1, day };
};

/** نفس تقويم اختيار رحلات الباقات، لكن بنطاق واحد: النقر الأول للذهاب
    والثاني للعودة. لا نافذة عائمة ولا حقل يقود إلى تقويم مختلف. */
export function ArabicDateRangePicker({
  departDate, returnDate, onChange, invalid,
}: {
  departDate: string;
  returnDate: string;
  onChange: (range: { departDate: string; returnDate: string }) => void;
  invalid?: boolean;
}) {
  const today = isoOf(new Date());
  const initial = departDate ? parseIso(departDate) : parseIso(today);
  const [month, setMonth] = useState({ year: initial.year, month: initial.month });

  useEffect(() => {
    if (!departDate) return;
    const next = parseIso(departDate);
    setMonth(current => current.year === next.year && current.month === next.month ? current : { year: next.year, month: next.month });
  }, [departDate]);

  const days = new Date(month.year, month.month + 1, 0).getDate();
  const firstCell = (new Date(month.year, month.month, 1).getDay() + 1) % 7;
  const cells: Array<number | null> = [
    ...Array.from({ length: firstCell }, () => null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);

  const moveMonth = (delta: number) => setMonth(current => {
    const date = new Date(current.year, current.month + delta, 1);
    return { year: date.getFullYear(), month: date.getMonth() };
  });

  const choose = (date: string) => {
    // بعد إكمال النطاق، يبدأ النقر التالي اختياراً جديداً واضحاً.
    if (!departDate || returnDate || date < departDate) {
      onChange({ departDate: date, returnDate: "" });
      return;
    }
    onChange({ departDate, returnDate: date });
  };

  return (
    <section className={`ts-trip-range-calendar${invalid ? " is-invalid" : ""}`} aria-label="اختيار موعد السفر">
      <div className="ts-trip-range-heading">
        <span>اختر تاريخ الانطلاق أولاً، ثم تاريخ الرجعة</span>
        <span className="ts-trip-range-value">
          {departDate ? `${departDate}${returnDate ? ` ← ${returnDate}` : ""}` : ""}
        </span>
      </div>

      <div className="ts-trip-range-month">
        <button type="button" onClick={() => moveMonth(-1)} aria-label="الشهر السابق"><ChevronRight size={20} /></button>
        <strong>{MONTHS[month.month]} {month.year}</strong>
        <button type="button" onClick={() => moveMonth(1)} aria-label="الشهر التالي"><ChevronLeft size={20} /></button>
      </div>

      <div className="ts-trip-range-grid">
        {WEEK_DAYS.map(day => <div className="ts-trip-range-weekday" key={day}>{day}</div>)}
        {cells.map((day, index) => {
          if (day == null) return <span className="ts-trip-range-empty" key={`empty-${index}`} />;
          const date = `${month.year}-${pad(month.month + 1)}-${pad(day)}`;
          const disabled = date < today;
          const edge = date === departDate || date === returnDate;
          const inRange = !!departDate && !!returnDate && date > departDate && date < returnDate;
          return (
            <button key={date} type="button" disabled={disabled} onClick={() => choose(date)}
              className={`ts-trip-range-day${edge ? " is-edge" : ""}${inRange ? " is-between" : ""}`}>
              {day}
            </button>
          );
        })}
      </div>
    </section>
  );
}
