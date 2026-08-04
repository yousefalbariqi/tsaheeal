import * as React from "react";
import { SearchSelect, type SearchOption } from "@/components/SearchSelect";
import {
  NATIONALITIES, POPULAR_CODES, flagEmoji, searchNationalities, findNationality, natLabel, natCountry,
} from "@/data/nationalities";

/* حقل الجنسية — قائمة منسدلة ببحث فوري (عربي/إنجليزي/رمز الدولة).
   القيمة المخزَّنة هي اسم الجنسية بالعربية ليبقى العرض في لوحة الموظف كما هو. */

const TXT = {
  ar: { placeholder: "اختر الجنسية", search: "ابحث عن الجنسية أو الدولة…", empty: "لا توجد نتائج مطابقة", popular: "الأكثر شيوعاً", all: "كل الجنسيات" },
  en: { placeholder: "Select nationality", search: "Search nationality or country…", empty: "No matching results", popular: "Most common", all: "All nationalities" },
  ur: { placeholder: "قومیت منتخب کریں", search: "قومیت یا ملک تلاش کریں…", empty: "کوئی نتیجہ نہیں", popular: "سب سے عام", all: "تمام قومیتیں" },
  tr: { placeholder: "Uyruk seçin", search: "Uyruk veya ülke ara…", empty: "Sonuç bulunamadı", popular: "En yaygın", all: "Tüm uyruklar" },
} as const;

export function NationalitySelect({
  value, onChange, lang = "ar", dir = "rtl", disabled, invalid, id, placeholder, compact, subInTrigger = true,
}: {
  value: string;
  onChange: (v: string) => void;
  lang?: string;
  dir?: "rtl" | "ltr";
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  placeholder?: string;
  compact?: boolean;
  subInTrigger?: boolean;
}) {
  const txt = (TXT as any)[lang] ?? TXT.ar;

  const options = React.useMemo<SearchOption[]>(() => {
    const opt = (code: string, group: string): SearchOption | null => {
      const n = NATIONALITIES.find(x => x.code === code);
      if (!n) return null;
      return {
        value: n.ar,
        label: natLabel(n, lang),
        sub: natCountry(n, lang),
        prefix: flagEmoji(n.code),
        keywords: `${n.ar} ${n.arCountry} ${n.en} ${n.enCountry} ${n.code}`,
        group,
      };
    };
    const popular = POPULAR_CODES.map(c => opt(c, txt.popular)).filter(Boolean) as SearchOption[];
    const rest = NATIONALITIES.filter(n => !POPULAR_CODES.includes(n.code)).map(n => opt(n.code, txt.all)!).filter(Boolean);
    return [...popular, ...rest];
  }, [lang, txt.popular, txt.all]);

  // القيمة قد تكون قديمة (نص حر) — نطابقها تقريبياً حتى لا يظهر الحقل فارغاً
  const resolved = React.useMemo(() => {
    if (!value) return "";
    if (options.some(o => o.value === value)) return value;
    return findNationality(value)?.ar ?? "";
  }, [value, options]);

  const filter = React.useCallback((q: string) => {
    const codes = searchNationalities(q).map(n => n.ar);
    const byValue = new Map(options.map(o => [o.value, o]));
    return codes.map(v => byValue.get(v)).filter(Boolean) as SearchOption[];
  }, [options]);

  return (
    <SearchSelect
      id={id}
      value={resolved}
      onChange={onChange}
      options={options}
      placeholder={placeholder ?? txt.placeholder}
      searchPlaceholder={txt.search}
      emptyText={txt.empty}
      disabled={disabled}
      invalid={invalid}
      dir={dir}
      filter={filter}
      compact={compact}
      subInTrigger={subInTrigger}
      ariaLabel={txt.placeholder}
    />
  );
}
