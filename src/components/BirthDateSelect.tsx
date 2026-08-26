import * as React from "react";
import { DateObject } from "react-multi-date-picker";
import gregorian from "react-date-object/calendars/gregorian";
import arabic from "react-date-object/calendars/arabic";
import gregorian_en from "react-date-object/locales/gregorian_en";
import { ChevronDown } from "lucide-react";
import { B } from "@/lib/theme";

/* تاريخ الميلاد بالقوائم — بلا تقويم.
   يختار المستخدم: ميلادي | هجري، ثم السنة ثم الشهر ثم اليوم — كلها قوائم منسدلة.
   القيمة المخزَّنة تبقى ميلادية "YYYY-MM-DD" مهما كان تقويم الإدخال. */

type Cal = "greg" | "hijri";

const MONTHS_GREG_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const MONTHS_GREG_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_HIJRI_AR = ["محرم", "صفر", "ربيع الأول", "ربيع الآخر", "جمادى الأولى", "جمادى الآخرة", "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة"];
const MONTHS_HIJRI_EN = ["Muharram", "Safar", "Rabi' I", "Rabi' II", "Jumada I", "Jumada II", "Rajab", "Sha'ban", "Ramadan", "Shawwal", "Dhu al-Qi'dah", "Dhu al-Hijjah"];

const TXT = {
  ar: { greg: "ميلادي", hijri: "هجري", year: "السنة", month: "الشهر", day: "اليوم", pickYear: "السنة", pickMonth: "الشهر", pickDay: "اليوم", search: "ابحث…", empty: "لا نتائج" },
  en: { greg: "Gregorian", hijri: "Hijri", year: "Year", month: "Month", day: "Day", pickYear: "Year", pickMonth: "Month", pickDay: "Day", search: "Search…", empty: "No results" },
} as const;

const calOf = (c: Cal) => (c === "hijri" ? arabic : gregorian);

/** عدد أيام شهر معيّن في التقويم المطلوب. */
function daysInMonth(cal: Cal, year: number, month1: number): number {
  try {
    return new DateObject({ calendar: calOf(cal), year, month: month1, day: 1 }).month.length;
  } catch {
    return cal === "hijri" ? 30 : 31;
  }
}

/** تحويل (سنة/شهر/يوم) في التقويم المختار إلى "YYYY-MM-DD" ميلادية. */
function toGregISO(cal: Cal, y: number, m: number, d: number): string {
  return new DateObject({ calendar: calOf(cal), year: y, month: m, day: d })
    .convert(gregorian, gregorian_en).format("YYYY-MM-DD");
}

/** تفكيك "YYYY-MM-DD" ميلادية إلى أجزاء في التقويم المختار. */
function fromGregISO(cal: Cal, iso: string): { y: number; m: number; d: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  try {
    const g = new DateObject({ date: iso, format: "YYYY-MM-DD", calendar: gregorian, locale: gregorian_en });
    const o = cal === "hijri" ? g.convert(arabic) : g;
    return { y: o.year, m: o.month.number, d: o.day };
  } catch { return null; }
}

/* قائمة اختيار أصلية: على الجوال تفتح عجلة النظام مباشرة — بلا مربع بحث
   ولا لوحة مفاتيح ولا إزاحة للصفحة. مُنسَّقة لتطابق بقية الحقول.
   مُعرَّفة خارج المكوّن حتى لا تُعاد تهيئتها مع كل رسم فتُغلق القائمة المفتوحة. */
function NativeSelect({ label, value, onChange, options, placeholder, disabled, invalid, dir }: {
  label: string; value: string; onChange: (s: string) => void;
  options: { value: string; label: string }[]; placeholder: string;
  disabled?: boolean; invalid?: boolean; dir: "rtl" | "ltr";
}) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-[11px] font-bold" style={{ color: B.muted }}>{label}</span>
      <div style={{ position: "relative" }}>
        <select
          value={value} onChange={e => onChange(e.target.value)} disabled={disabled} aria-label={label}
          className="w-full border rounded-xl text-sm focus:outline-none"
          style={{
            borderColor: invalid ? "#E1A3A3" : B.border,
            background: disabled ? B.bg : "#fff",
            color: value ? B.black : B.placeholder,
            fontFamily: "inherit", fontWeight: value ? 700 : 400,
            padding: "9px 10px", paddingInlineEnd: 26, height: 40,
            cursor: disabled ? "not-allowed" : "pointer",
            appearance: "none", WebkitAppearance: "none", MozAppearance: "none",
            textAlign: dir === "rtl" ? "right" : "left",
          }}
        >
          <option value="" disabled>{placeholder}</option>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown size={15} style={{
          position: "absolute", insetInlineEnd: 8, top: "50%", transform: "translateY(-50%)",
          color: B.muted, pointerEvents: "none",
        }} />
      </div>
    </div>
  );
}

export function BirthDateSelect({
  value, onChange, lang = "ar", dir = "rtl", disabled, invalid, maxYearsBack = 110, future = false, yearsAhead = 2,
  ...aria
}: {
  value: string;                     // "YYYY-MM-DD" ميلادية أو ""
  onChange: (v: string) => void;
  lang?: string;
  dir?: "rtl" | "ltr";
  disabled?: boolean;
  invalid?: boolean;
  maxYearsBack?: number;
  /** تواريخ قادمة (سفر) بدل ماضية (ميلاد): السنوات تصعد من اليوم ولا يُقبل ما قبله. */
  future?: boolean;
  yearsAhead?: number;
  /* ثلاث قوائم لا حقل واحد، فلا id يُربط بـhtmlFor. خصائص التسمية
     تُمرَّر إلى الحاوية لتُقرأ مجموعةً باسمها («تاريخ الميلاد») بدل
     ثلاث قوائم مجهولة النسبة. */
} & React.AriaAttributes & { role?: string }) {
  const txt = (TXT as any)[lang] ?? TXT.ar;
  const en = lang === "en";

  const [cal, setCal] = React.useState<Cal>("greg");
  const [y, setY] = React.useState<number | null>(null);
  const [m, setM] = React.useState<number | null>(null);
  const [d, setD] = React.useState<number | null>(null);

  // مزامنة من الخارج (تعبئة مسبقة أو إعادة تعيين النموذج)
  React.useEffect(() => {
    if (!value) { if (y || m || d) { setY(null); setM(null); setD(null); } return; }
    if (y && m && d && toGregISO(cal, y, m, d) === value) return;
    const p = fromGregISO(cal, value);
    if (p) { setY(p.y); setM(p.m); setD(p.d); }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  // أقصى تاريخ = اليوم (لا ميلاد في المستقبل)
  const today = React.useMemo(() => {
    const g = new DateObject({ calendar: gregorian, locale: gregorian_en });
    const o = cal === "hijri" ? g.convert(arabic) : g;
    return { y: o.year, m: o.month.number, d: o.day };
  }, [cal]);

  const years = React.useMemo(() => {
    const out: { value: string; label: string }[] = [];
    if (future) for (let v = today.y; v <= today.y + yearsAhead; v++) out.push({ value: String(v), label: String(v) });
    else for (let v = today.y; v >= today.y - maxYearsBack; v--) out.push({ value: String(v), label: String(v) });
    return out;
  }, [today.y, maxYearsBack, future, yearsAhead]);

  const monthNames = cal === "hijri" ? (en ? MONTHS_HIJRI_EN : MONTHS_HIJRI_AR) : (en ? MONTHS_GREG_EN : MONTHS_GREG_AR);
  /* حدود الشهر واليوم: في وضع الميلاد لا يتجاوز اليوم، وفي وضع السفر لا يسبقه. */
  const minMonth = future && y === today.y ? today.m : 1;
  const maxMonth = !future && y === today.y ? today.m : 12;
  const months = React.useMemo<{ value: string; label: string }[]>(
    () => monthNames.map((n, i) => ({ value: String(i + 1), label: n })).slice(minMonth - 1, maxMonth),
    [monthNames, minMonth, maxMonth],
  );

  const inCurMonth = !!y && !!m && y === today.y && m === today.m;
  const minDay = future && inCurMonth ? today.d : 1;
  const maxDay = y && m ? (!future && inCurMonth ? today.d : daysInMonth(cal, y, m)) : 31;
  const days = React.useMemo<{ value: string; label: string }[]>(
    () => Array.from({ length: Math.max(0, maxDay - minDay + 1) }, (_, i) => ({ value: String(minDay + i), label: String(minDay + i) })),
    [minDay, maxDay],
  );

  function emit(ny: number | null, nm: number | null, nd: number | null) {
    if (ny && nm && nd) onChange(toGregISO(cal, ny, nm, nd));
    else if (value) onChange("");
  }

  /** يتحقق أن (سنة/شهر/يوم) داخل الحدود المسموحة في الاتجاه الحالي. */
  const dayOk = (yy: number, mm: number, dd: number) => {
    if (dd > daysInMonth(cal, yy, mm)) return false;
    if (yy !== today.y || mm !== today.m) return true;
    return future ? dd >= today.d : dd <= today.d;
  };
  const monthOk = (yy: number, mm: number) =>
    yy !== today.y ? true : future ? mm >= today.m : mm <= today.m;

  function setYear(v: string) {
    const ny = Number(v);
    let nm = m, nd = d;
    if (nm && !monthOk(ny, nm)) { nm = null; nd = null; }
    if (nm && nd && !dayOk(ny, nm, nd)) nd = null;
    setY(ny); setM(nm); setD(nd); emit(ny, nm, nd);
  }
  function setMonth(v: string) {
    const nm = Number(v);
    let nd = d;
    if (y && nd && !dayOk(y, nm, nd)) nd = null;
    setM(nm); setD(nd); emit(y, nm, nd);
  }
  function setDay(v: string) { const nd = Number(v); setD(nd); emit(y, m, nd); }

  /** تبديل التقويم مع الحفاظ على نفس اليوم إن كان مكتملاً. */
  function switchCal(next: Cal) {
    if (next === cal) return;
    if (value) {
      const p = fromGregISO(next, value);
      setCal(next);
      if (p) { setY(p.y); setM(p.m); setD(p.d); return; }
    } else {
      setCal(next);
    }
    setY(null); setM(null); setD(null);
  }

  const pillBase: React.CSSProperties = {
    flex: 1, padding: "7px 10px", borderRadius: 10, fontSize: 13, fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer", border: "none", fontFamily: "inherit", transition: "all .15s",
  };

  return (
    <div {...aria} className="flex flex-col gap-2">
      {/* ميلادي | هجري */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: B.bg, border: `1px solid ${B.border}` }}>
        {(["greg", "hijri"] as Cal[]).map(c => (
          <button
            key={c} type="button" disabled={disabled} onClick={() => switchCal(c)}
            aria-pressed={cal === c}
            style={{
              ...pillBase,
              background: cal === c ? "#fff" : "transparent",
              color: cal === c ? B.primary : B.muted,
              boxShadow: cal === c ? "0 1px 3px rgba(0,0,0,.08)" : "none",
            }}
          >
            {c === "greg" ? txt.greg : txt.hijri}
          </button>
        ))}
      </div>

      {/* السنة ← الشهر ← اليوم — قوائم أصلية بلا بحث */}
      <div className="grid grid-cols-3 gap-2">
        <NativeSelect label={txt.year} placeholder={txt.pickYear} options={years}
          value={y ? String(y) : ""} onChange={setYear} dir={dir}
          disabled={disabled} invalid={invalid && !y} />
        <NativeSelect label={txt.month} placeholder={txt.pickMonth} options={months}
          value={m ? String(m) : ""} onChange={setMonth} dir={dir}
          disabled={disabled || !y} invalid={invalid && !!y && !m} />
        <NativeSelect label={txt.day} placeholder={txt.pickDay} options={days}
          value={d ? String(d) : ""} onChange={setDay} dir={dir}
          disabled={disabled || !m} invalid={invalid && !!m && !d} />
      </div>

      {/* معاينة التاريخ المختار بالتقويمين */}
      {value && (
        <div className="text-xs" style={{ color: B.muted }}>
          {(() => {
            const g = fromGregISO("greg", value); const h = fromGregISO("hijri", value);
            if (!g || !h) return null;
            const gs = `${g.d} ${(en ? MONTHS_GREG_EN : MONTHS_GREG_AR)[g.m - 1]} ${g.y} ${en ? "" : "م"}`;
            const hs = `${h.d} ${(en ? MONTHS_HIJRI_EN : MONTHS_HIJRI_AR)[h.m - 1]} ${h.y} ${en ? "AH" : "هـ"}`;
            return `${gs} — ${hs}`;
          })()}
        </div>
      )}
    </div>
  );
}
