import * as React from "react";
import { B, TONE } from "@/lib/theme";

/* تاريخ ميلادي سريع: ثلاثة حقول رقمية، لا تمرير عبر قوائم سنوات طويلة.
   تبقى القيمة المتعاقد عليها مع القاعدة YYYY-MM-DD، بينما يكتب العميل
   اليوم ثم الشهر ثم السنة بصيغة مألوفة DD / MM / YYYY. */

const digits = (value: string) => value
  .replace(/[٠-٩]/g, char => String("٠١٢٣٤٥٦٧٨٩".indexOf(char)))
  .replace(/[۰-۹]/g, char => String("۰۱۲۳۴۵۶۷۸۹".indexOf(char)))
  .replace(/\D/g, "");

const dateParts = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? { year: match[1], month: match[2], day: match[3] } : { year: "", month: "", day: "" };
};

const validISO = (yearText: string, monthText: string, dayText: string, maxYearsBack: number) => {
  if (yearText.length !== 4 || monthText.length !== 2 || dayText.length !== 2) return "";
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const today = new Date();
  const currentYear = today.getFullYear();
  if (year < currentYear - maxYearsBack || year > currentYear || month < 1 || month > 12) return "";
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return "";
  const todayUTC = Date.UTC(currentYear, today.getMonth(), today.getDate());
  if (parsed.getTime() > todayUTC) return "";
  return `${yearText}-${monthText}-${dayText}`;
};

export function BirthDateInput({
  value, onChange, lang = "ar", disabled, invalid, maxYearsBack = 110,
}: {
  value: string;
  onChange: (value: string) => void;
  lang?: string;
  disabled?: boolean;
  invalid?: boolean;
  maxYearsBack?: number;
}) {
  const initial = dateParts(value);
  const [year, setYear] = React.useState(initial.year);
  const [month, setMonth] = React.useState(initial.month);
  const [day, setDay] = React.useState(initial.day);
  /* أيّ الخانات فيها المؤشّر — للعرض وحده: حلقة التركيز تُرسم من هنا
     فتظهر في اللوحة وفي تطبيق العميل معاً بلا اعتمادٍ على ورقة أنماط. */
  const [focused, setFocused] = React.useState<"day" | "month" | "year" | null>(null);
  const emitted = React.useRef(value);
  const dayRef = React.useRef<HTMLInputElement>(null);
  const monthRef = React.useRef<HTMLInputElement>(null);
  const yearRef = React.useRef<HTMLInputElement>(null);
  const noteId = React.useId();
  const text = lang === "en"
    ? { day: "Day", month: "Month", year: "Year", group: "Date of birth", bad: "That date isn't valid — check the day, month and year" }
    : { day: "اليوم", month: "الشهر", year: "السنة", group: "تاريخ الميلاد", bad: "تاريخ غير صحيح — راجع اليوم والشهر والسنة" };

  /* التحديث الخارجي (مسودة محفوظة أو تعبئة بيانات العميل) لا يقطع كتابة
     العميل في منتصف الحقل؛ نزامنه فقط إن لم يكن نحن من أصدر القيمة. */
  React.useEffect(() => {
    if (value === emitted.current) return;
    const next = dateParts(value);
    setYear(next.year); setMonth(next.month); setDay(next.day);
    emitted.current = value;
  }, [value]);

  const commit = (nextYear: string, nextMonth: string, nextDay: string) => {
    const iso = validISO(nextYear, nextMonth, nextDay, maxYearsBack);
    emitted.current = iso;
    onChange(iso);
  };

  const update = (part: "day" | "month" | "year", raw: string) => {
    const next = digits(raw).slice(0, part === "year" ? 4 : 2);
    const nextYear = part === "year" ? next : year;
    const nextMonth = part === "month" ? next : month;
    const nextDay = part === "day" ? next : day;
    if (part === "year") setYear(next);
    if (part === "month") setMonth(next);
    if (part === "day") setDay(next);
    commit(nextYear, nextMonth, nextDay);
    if (next.length === (part === "year" ? 4 : 2)) {
      if (part === "day") monthRef.current?.focus();
      if (part === "month") yearRef.current?.focus();
    }
  };

  const onKeyDown = (part: "day" | "month" | "year", current: string, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Backspace" || current) return;
    if (part === "year") monthRef.current?.focus();
    if (part === "month") dayRef.current?.focus();
  };

  const onPaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const parts = digits(event.clipboardData.getData("text")).match(/^(\d{2})(\d{2})(\d{4})$/);
    if (!parts) return;
    event.preventDefault();
    const [, nextDay, nextMonth, nextYear] = parts;
    setDay(nextDay); setMonth(nextMonth); setYear(nextYear);
    commit(nextYear, nextMonth, nextDay);
    yearRef.current?.focus();
  };

  /* مكتملٌ وغير صحيح: الخانات الثلاث ممتلئة والتاريخ لا يُقبل (31 فبراير،
     تاريخٌ في المستقبل…). كانت القيمة تُصدَر فارغةً بصمت فيُقال «الحقل
     مطلوب» لمن ملأه. يُشتقّ من الحالة القائمة ولا يغيّر ما يُصدَر. */
  const complete = year.length === 4 && month.length === 2 && day.length === 2;
  const impossible = complete && !validISO(year, month, day, maxYearsBack);
  const bad = !!invalid || impossible;

  const input = (part: "day" | "month" | "year", label: string, current: string, ref: React.RefObject<HTMLInputElement | null>) => {
    const on = focused === part;
    return (
      <label className="min-w-0 text-center" style={{ flex: part === "year" ? 1.5 : 1 }}>
        <span className="block" style={{ fontSize: 12, lineHeight: 1.4, marginBottom: 4, color: B.muted }}>{label}</span>
        <input ref={ref} value={current} disabled={disabled} inputMode="numeric"
          autoComplete={part === "day" ? "bday-day" : part === "month" ? "bday-month" : "bday-year"}
          enterKeyHint={part === "year" ? "done" : "next"}
          aria-label={label} aria-invalid={bad || undefined}
          aria-describedby={impossible ? noteId : undefined}
          placeholder={part === "year" ? "YYYY" : part === "month" ? "MM" : "DD"}
          onChange={event => update(part, event.target.value)} onKeyDown={event => onKeyDown(part, current, event)}
          onFocus={() => setFocused(part)} onBlur={() => setFocused(f => (f === part ? null : f))}
          onPaste={onPaste} className="w-full text-center"
          style={{
            height: 52, fontSize: 16, fontWeight: 400, fontFamily: "inherit", direction: "ltr",
            borderWidth: 1, borderStyle: "solid", borderRadius: 12, outline: "none",
            borderColor: on ? B.gold : bad ? TONE.danger.fg : B.borderStrong,
            boxShadow: on ? "0 0 0 3px rgba(192,134,44,.28)" : "none",
            background: disabled ? B.fill : "#fff", color: B.black,
            transition: "border-color .15s, box-shadow .15s",
          }} />
      </label>
    );
  };

  const slash = <span aria-hidden style={{ height: 52, display: "flex", alignItems: "center", color: B.placeholder, fontSize: 18 }}>/</span>;

  return (
    <div>
      <div className="flex items-end gap-2" dir="ltr" role="group" aria-label={text.group}>
        {input("day", text.day, day, dayRef)}
        {slash}
        {input("month", text.month, month, monthRef)}
        {slash}
        {input("year", text.year, year, yearRef)}
      </div>
      {impossible && (
        <div id={noteId} role="alert" style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5, color: TONE.danger.fg }}>{text.bad}</div>
      )}
    </div>
  );
}
