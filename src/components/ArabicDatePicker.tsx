import DatePicker, { DateObject } from "react-multi-date-picker";
import InputIcon from "react-multi-date-picker/components/input_icon";
import SettingsPlugin from "react-multi-date-picker/plugins/settings";
import gregorian from "react-date-object/calendars/gregorian";
import gregorian_ar from "react-date-object/locales/gregorian_ar";
import gregorian_en from "react-date-object/locales/gregorian_en";
import "react-multi-date-picker/styles/colors/teal.css";
import { B } from "@/lib/theme";

// الـSettings plugin يقبل أسماء التقويم/اللغة كسلاسل مع خريطة أسماء كاملة؛ نتجاوز التقييد الصارم.
const Settings = SettingsPlugin as any;

/* منتقي تاريخ عربي موحّد — react-multi-date-picker.
   - تبديل هجري | ميلادي داخل النافذة (Settings plugin).
   - أشهر/أيام عربية، أسبوع يبدأ السبت، قوائم سنة/شهر بالنقر على الترويسة، إدخال يدوي DD/MM/YYYY.
   - القيمة المخزّنة تبقى ميلادية "YYYY-MM-DD" مهما كان تقويم العرض. نفس واجهة النسخة السابقة. */

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
      format="DD/MM/YYYY"
      weekStartDayIndex={6}
      minDate={minDate}
      disabled={disabled}
      editable
      className="teal rmdp-mobile"
      arrow={false}
      inputClass="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none"
      containerStyle={{ width: "100%" }}
      style={{ width: "100%", boxSizing: "border-box", borderColor: invalid ? "#E1A3A3" : B.border, background: disabled ? B.bg : "#fff", color: B.black, fontFamily: "inherit", height: 42 }}
      placeholder={placeholder}
      /* المعرّف يُمرَّر عبر عنصر الإدخال لا كخاصّية على DatePicker:
         المكتبة لا تنقل id إلى الحقل، فكان عنوان «تاريخ الذهاب»
         مربوطاً بمعرّف لا وجود له — عنوانٌ لا يربط شيئاً أسوأ من
         عنوانٍ بلا ربط، لأنه يبدو مربوطاً في الفحص الآلي.
         InputIcon ينشر خصائصه الزائدة على <input> فيصل المعرّف. */
      render={<InputIcon id={id} />}
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
