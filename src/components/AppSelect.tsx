import * as React from "react";
import * as RS from "@radix-ui/react-select";
import { ChevronDown, Check } from "lucide-react";
import { B } from "@/lib/theme";

/* قائمة اختيار موحّدة (Radix) — RTL، سهم واضح، Portal لا يُحجب خلف الـSidebar.
   للاستخدام في كل حقول الاختيار أحادية القيمة (الحالة/الباقة/الرحلة/الفرع/المسؤول/طريقة الدفع…). */

export interface AppSelectOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
}

/* Radix يرفض عنصراً قيمته "" (فهي عنده «لا اختيار» تُظهر الـplaceholder)، ونحن
   نستخدم "" في كل النداءات بمعنى «بلا مسؤول/كل الفروع». فنُبدّلها داخلياً
   ببديلٍ غير فارغ ونعيدها "" في onChange — يبقى عقد المُستخدِم كما هو. */
const EMPTY = "__app_select_empty__";

export function AppSelect({
  value, onChange, options, placeholder = "اختر…", disabled, invalid, id, ariaLabel, className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: AppSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const hasEmptyOption = options.some((o) => o.value === "");
  // "" بلا عنصرٍ يقابلها = لا اختيار (placeholder)؛ ومعه = اختيارٌ صريح يُعرض عنوانه.
  const inner = value === "" ? (hasEmptyOption ? EMPTY : undefined) : value;

  return (
    <RS.Root
      dir="rtl"
      value={inner}
      onValueChange={(v) => onChange(v === EMPTY ? "" : v)}
      disabled={disabled}
    >
      <RS.Trigger
        id={id}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        className={`w-full flex items-center justify-between gap-2 border rounded-xl px-3.5 py-2.5 text-sm text-right focus:outline-none ${className ?? ""}`}
        style={{
          borderColor: invalid ? "#E1A3A3" : B.border,
          background: disabled ? B.fill : "#fff",
          color: inner ? B.black : B.placeholder,
          fontFamily: "inherit",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <RS.Value placeholder={placeholder} />
        <RS.Icon>
          <ChevronDown size={16} style={{ color: B.muted, flexShrink: 0 }} />
        </RS.Icon>
      </RS.Trigger>
      <RS.Portal>
        <RS.Content
          position="popper"
          sideOffset={4}
          dir="rtl"
          className="z-50 overflow-hidden rounded-xl"
          style={{
            background: "#fff",
            border: `1px solid ${B.border}`,
            boxShadow: "0 16px 40px -12px rgba(21,76,72,.35)",
            minWidth: "var(--radix-select-trigger-width)",
            maxHeight: "min(320px, var(--radix-select-content-available-height))",
            fontFamily: "var(--font-app)",
          }}
        >
          <RS.ScrollUpButton className="flex items-center justify-center py-1" style={{ color: B.muted }}>
            <ChevronDown size={14} style={{ transform: "rotate(180deg)" }} />
          </RS.ScrollUpButton>
          <RS.Viewport className="p-1">
            {options.map((o) => (
              <RS.Item
                key={o.value}
                value={o.value === "" ? EMPTY : o.value}
                disabled={o.disabled}
                className="relative flex items-center justify-between gap-2 rounded-lg py-2 pr-3 pl-8 text-sm text-right outline-none cursor-pointer select-none data-[disabled]:opacity-40 data-[disabled]:cursor-not-allowed data-[highlighted]:bg-[color:var(--sel-hl)]"
                style={{ color: B.black, ["--sel-hl" as any]: B.fill }}
              >
                <RS.ItemText>{o.label}</RS.ItemText>
                <RS.ItemIndicator className="absolute left-2 inline-flex items-center">
                  <Check size={15} style={{ color: B.primary }} />
                </RS.ItemIndicator>
              </RS.Item>
            ))}
          </RS.Viewport>
          <RS.ScrollDownButton className="flex items-center justify-center py-1" style={{ color: B.muted }}>
            <ChevronDown size={14} />
          </RS.ScrollDownButton>
        </RS.Content>
      </RS.Portal>
    </RS.Root>
  );
}
