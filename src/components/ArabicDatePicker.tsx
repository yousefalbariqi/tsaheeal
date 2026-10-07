import type * as React from "react";
import DatePicker, { DateObject } from "react-multi-date-picker";
import SettingsPlugin from "react-multi-date-picker/plugins/settings";
import gregorian from "react-date-object/calendars/gregorian";
import gregorian_ar from "react-date-object/locales/gregorian_ar";
import gregorian_en from "react-date-object/locales/gregorian_en";
import "react-multi-date-picker/styles/colors/teal.css";
import { CalendarDays } from "lucide-react";
import { B } from "@/lib/theme";

// الـSettings plugin يقبل أسماء التقويم/اللغة كسلاسل مع خريطة أسماء كاملة؛ نتجاوز التقييد الصارم.
const Settings = SettingsPlugin as any;

/* منتقي تاريخ عربي موحّد — react-multi-date-picker.
   - تبديل هجري | ميلادي داخل النافذة (Settings plugin).
   - أشهر/أيام عربية، أسبوع يبدأ السبت، قوائم سنة/شهر بالنقر على الترويسة، إدخال يدوي DD/MM/YYYY.
   - القيمة المخزّنة تبقى ميلادية "YYYY-MM-DD" مهما كان تقويم العرض. نفس واجهة النسخة السابقة.
   - الحقل نفسه `ui-input`: حدّه وإطار تركيزه وحالتا الخطأ والتعطيل من الصنف
     المشترك، و`invalid` يصل aria-invalid فيقرؤه التنسيق وقارئ الشاشة معاً. */

/* المكتبة تلوّن بمتغيّرات لوحتها «teal» الخضراء. تُعاد هنا إلى الكسوة:
   المختار أسود، واليوم ذهبيٌّ عميق (نصُّ المكتبة فوقه أبيض فلا تصلح له
   حشوةٌ باهتة)، والمرور رماديٌّ دافئ — فلا يظهر أخضرُ النظام القديم داخل
   نافذةٍ عاجية. تُكتب على حاوية المنتقي فترثها نافذته المنبثقة، ولا تمسّ
   ملفّ الأنماط. */
const LATIN_DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const RMDP_KISWA = {
  "--rmdp-primary-teal": B.ink, "--rmdp-secondary-teal": B.border, "--rmdp-shadow-teal": "transparent",
  "--rmdp-today-teal": B.goldDeep, "--rmdp-hover-teal": B.text2, "--rmdp-deselect-teal": B.black,
} as React.CSSProperties;

/** حقل المنتقي — `ui-input` وأيقونة تقويم عند حافة النهاية تفتح النافذة.
    الخصائص بعد الأربع الأولى تحقنها المكتبة عند النسخ (القيمة ومعالِجاتها). */
function PickerInput({ id, placeholder, disabled, invalid, value = "", openCalendar, onFocus, onChange }: {
  id?: string; placeholder?: string; disabled?: boolean; invalid?: boolean;
  value?: string; openCalendar?: () => void;
  onFocus?: React.FocusEventHandler<HTMLInputElement>; onChange?: React.ChangeEventHandler<HTMLInputElement>;
}) {
  return (
    <div style={{ position: "relative" }}>
      <input id={id} type="text" autoComplete="off" className="ui-input" dir="ltr"
        value={value} placeholder={placeholder} disabled={disabled} aria-invalid={invalid || undefined}
        onFocus={onFocus} onChange={onChange} style={{ textAlign: "right", paddingInlineStart: 40 }} />
      <CalendarDays size={16} aria-hidden onClick={disabled ? undefined : openCalendar}
        style={{ position: "absolute", top: "50%", left: 13, transform: "translateY(-50%)", color: B.muted, cursor: disabled ? "not-allowed" : "pointer" }} />
    </div>
  );
}

export function ArabicDatePicker({
  value, onChange, minDate, placeholder = "اختر التاريخ", disabled, invalid, id,
}: {
  value: string;
  onChange: (v: string) => void;
  minDate?: Date;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
}) {
  const shown = value ? new DateObject({ date: value, format: "YYYY-MM-DD", calendar: gregorian, locale: gregorian_ar }) : "";
  return (
    <DatePicker
      value={shown}
      onChange={(d: DateObject | null) => onChange(d ? d.convert(gregorian, gregorian_en).format("YYYY-MM-DD") : "")}
      calendar={gregorian}
      locale={gregorian_ar}
      /* أرقامٌ لاتينية كبقية اللوحة — لغة التقويم عربية وأرقامه لا تُبدَّل
         هندية داخل حقلٍ واحد من نموذجٍ كلّه لاتينيّ الأرقام. */
      digits={LATIN_DIGITS}
      format="DD/MM/YYYY"
      weekStartDayIndex={6}
      minDate={minDate}
      disabled={disabled}
      editable
      className="teal rmdp-mobile"
      arrow={false}
      containerStyle={{ width: "100%", ...RMDP_KISWA }}
      placeholder={placeholder}
      /* الحقل يُرسم هنا لا بـInputIcon المكتبة: المكتبة لا تنقل إلى عنصرٍ
         مخصَّص إلا القيمة ومعالِجاتها — لا المعرّف ولا النصّ الإرشادي ولا
         التعطيل ولا الصنف. فكان عنوان «تاريخ الذهاب» مربوطاً بمعرّف لا وجود
         له، والحقل المعطَّل يُكتب فيه. تُمرَّر كلها صراحةً. */
      render={<PickerInput id={id} placeholder={placeholder} disabled={disabled} invalid={invalid} />}
      plugins={[
        <Settings
          key="settings"
          position="bottom"
          calendars={["gregorian", "arabic"]}
          locales={["ar"]}
          disabledList={["locale"]}
          names={{ gregorian: "ميلادي", arabic: "هجري", ar: "عربي" }}
        />,
      ]}
    />
  );
}
