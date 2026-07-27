import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { CalendarDays } from "lucide-react";
import { format, parse, isValid } from "date-fns";
import { arSA } from "date-fns/locale";
import { Calendar } from "@/app/components/ui/calendar";
import { B } from "@/lib/theme";

/* منتقي تاريخ عربي موحّد — react-day-picker + date-fns (ar-SA).
   كامل الحقل قابل للضغط، أسبوع يبدأ السبت، أشهر/أيام عربية،
   لون الهوية الأخضر للتحديد، RTL ومتجاوب. القيمة سلسلة "YYYY-MM-DD". */

const toDate = (v: string): Date | undefined => {
  if (!v) return undefined;
  const d = parse(v, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : undefined;
};

export function ArabicDatePicker({
  value, onChange, minDate, placeholder = "اختر التاريخ", disabled, invalid, id,
}: {
  value: string;
  onChange: (v: string) => void;
  minDate?: Date;            // منع اختيار ما قبله (الإنشاء)؛ اتركه فارغاً في البحث/التقارير
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = toDate(value);
  const label = selected ? format(selected, "EEEE d MMMM yyyy", { locale: arSA }) : "";

  return (
    <Popover.Root open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
      <Popover.Trigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          className="w-full flex items-center gap-2 border rounded-xl px-3.5 py-2.5 text-sm text-right focus:outline-none"
          style={{
            borderColor: invalid ? "#E1A3A3" : B.border,
            background: disabled ? B.bg : "#fff",
            color: selected ? B.black : B.muted,
            cursor: disabled ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}
        >
          <CalendarDays size={16} style={{ color: B.primary, flexShrink: 0 }} />
          <span className="flex-1">{label || placeholder}</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          dir="rtl"
          className="z-50 rounded-2xl"
          style={{ background: "#fff", border: `1px solid ${B.border}`, boxShadow: "0 16px 40px -12px rgba(21,76,72,.35)" }}
        >
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected ?? minDate}
            onSelect={(d?: Date) => { onChange(d ? format(d, "yyyy-MM-dd") : ""); setOpen(false); }}
            locale={arSA}
            weekStartsOn={6}
            disabled={minDate ? { before: minDate } : undefined}
            classNames={{
              day_selected: "bg-[#1F6F6B] text-white hover:bg-[#1F6F6B] hover:text-white focus:bg-[#1F6F6B] focus:text-white",
              day_today: "text-[#1F6F6B] font-bold",
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
