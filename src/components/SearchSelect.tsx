import * as React from "react";
import * as RP from "@radix-ui/react-popover";
import { ChevronDown, Check, Search, X } from "lucide-react";
import { B } from "@/lib/theme";

/* قائمة منسدلة قابلة للبحث — Portal فلا تُقصّ داخل البطاقات، وتعمل RTL/LTR.
   تُستخدم للجنسية والسنة وأي قائمة طويلة. لوحة المفاتيح: ↑↓ تنقّل، Enter اختيار، Esc إغلاق. */

export interface SearchOption {
  value: string;
  label: string;
  sub?: string;      // سطر ثانوي صغير (اسم الدولة مثلاً)
  prefix?: string;   // رمز/علم يسبق الاسم
  keywords?: string; // كلمات إضافية للبحث
  group?: string;    // عنوان مجموعة — يظهر فقط قبل بدء البحث
}

const norm = (s: string) => s.toLowerCase().replace(/[ً-ْـ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ة/g, "ه").replace(/[ىي]/g, "ي").trim();

export function SearchSelect({
  value, onChange, options, placeholder = "اختر…", searchable = true, searchPlaceholder = "ابحث…",
  emptyText = "لا توجد نتائج", disabled, invalid, id, ariaLabel, dir = "rtl", filter, compact, subInTrigger = true,
}: {
  value: string;
  onChange: (v: string) => void;
  options: SearchOption[];
  placeholder?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  ariaLabel?: string;
  dir?: "rtl" | "ltr";
  /** ترتيب/تصفية مخصّصة للنتائج (البحث الافتراضي يطابق الاسم والسطر الثانوي والكلمات). */
  filter?: (query: string, options: SearchOption[]) => SearchOption[];
  compact?: boolean;
  /** إظهار السطر الثانوي داخل زر الحقل — يُطفأ حين يكرّر النص الإرشادي تحته. */
  subInTrigger?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [active, setActive] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const selected = options.find(o => o.value === value);

  const shown = React.useMemo(() => {
    if (!q.trim()) return options;
    if (filter) return filter(q, options);
    const n = norm(q);
    return options.filter(o => norm(`${o.label} ${o.sub ?? ""} ${o.keywords ?? ""}`).includes(n));
  }, [q, options, filter]);

  // عند الفتح: ابدأ من العنصر المختار
  React.useEffect(() => {
    if (!open) { setQ(""); return; }
    const i = options.findIndex(o => o.value === value);
    setActive(i >= 0 ? i : 0);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => { setActive(0); }, [q]);

  React.useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function pick(v: string) { onChange(v); setOpen(false); }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(i => Math.min(i + 1, shown.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(shown.length - 1); }
    else if (e.key === "Enter") { e.preventDefault(); const o = shown[active]; if (o) pick(o.value); }
  }

  const pad = compact ? "px-3 py-2" : "px-3.5 py-2.5";

  return (
    <RP.Root open={open} onOpenChange={o => !disabled && setOpen(o)}>
      <RP.Trigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-invalid={invalid || undefined}
          className={`w-full flex items-center justify-between gap-2 border rounded-xl ${pad} text-sm focus:outline-none`}
          style={{
            borderColor: invalid ? "#E1A3A3" : B.border,
            background: disabled ? B.bg : "#fff",
            color: selected ? B.black : B.muted,
            fontFamily: "inherit",
            cursor: disabled ? "not-allowed" : "pointer",
            textAlign: dir === "rtl" ? "right" : "left",
          }}
        >
          <span className="flex items-center gap-2 min-w-0">
            {selected?.prefix && <span style={{ fontSize: 17, lineHeight: 1 }}>{selected.prefix}</span>}
            <span className="truncate" style={{ fontWeight: selected ? 700 : 400 }}>{selected ? selected.label : placeholder}</span>
            {subInTrigger && selected?.sub && <span className="truncate text-xs" style={{ color: B.muted }}>· {selected.sub}</span>}
          </span>
          <ChevronDown size={16} style={{ color: B.muted, flexShrink: 0 }} />
        </button>
      </RP.Trigger>

      <RP.Portal>
        <RP.Content
          dir={dir}
          align="start"
          sideOffset={6}
          collisionPadding={12}
          onOpenAutoFocus={e => { if (!searchable) { e.preventDefault(); listRef.current?.focus(); } }}
          className="z-50 overflow-hidden rounded-2xl"
          style={{
            background: "#fff",
            border: `1px solid ${B.border}`,
            boxShadow: "0 18px 44px -14px rgba(21,76,72,.38)",
            width: "var(--radix-popover-trigger-width)",
            minWidth: 200,
            maxHeight: "min(340px, var(--radix-popover-content-available-height))",
            display: "flex",
            flexDirection: "column",
            fontFamily: "'IBM Plex Sans Arabic',system-ui,sans-serif",
          }}
        >
          {searchable && (
            <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: `1px solid ${B.border}`, background: "#fff" }}>
              <Search size={15} style={{ color: B.muted, flexShrink: 0 }} />
              <input
                ref={inputRef}
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={onKey}
                placeholder={searchPlaceholder}
                autoComplete="off"
                className="flex-1 min-w-0 text-sm focus:outline-none"
                style={{ border: "none", background: "transparent", color: B.black, fontFamily: "inherit", textAlign: dir === "rtl" ? "right" : "left" }}
              />
              {q && (
                <button type="button" onClick={() => { setQ(""); inputRef.current?.focus(); }} aria-label="مسح البحث"
                  className="flex items-center justify-center rounded-full cursor-pointer"
                  style={{ width: 20, height: 20, background: B.bg, border: "none", color: B.muted, flexShrink: 0 }}>
                  <X size={12} />
                </button>
              )}
            </div>
          )}

          <div
            ref={listRef}
            role="listbox"
            tabIndex={searchable ? -1 : 0}
            onKeyDown={searchable ? undefined : onKey}
            className="p-1 overflow-y-auto focus:outline-none"
            style={{ overscrollBehavior: "contain" }}
          >
            {shown.length === 0 && (
              <div className="px-3 py-6 text-center text-sm" style={{ color: B.muted }}>{emptyText}</div>
            )}
            {shown.map((o, i) => {
              const head = !q.trim() && o.group && o.group !== shown[i - 1]?.group ? o.group : null;
              const isSel = o.value === value;
              return (
                <React.Fragment key={o.value}>
                  {head && (
                    <div className="px-3 pt-2 pb-1 text-[11px] font-bold" style={{ color: B.muted }}>{head}</div>
                  )}
                  <div
                    data-idx={i}
                    role="option"
                    aria-selected={isSel}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(o.value)}
                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm cursor-pointer select-none"
                    style={{ background: i === active ? B.bg : "transparent", color: B.black }}
                  >
                    {o.prefix && <span style={{ fontSize: 17, lineHeight: 1 }}>{o.prefix}</span>}
                    <span className="truncate" style={{ fontWeight: isSel ? 700 : 500 }}>{o.label}</span>
                    {o.sub && <span className="truncate text-xs" style={{ color: B.muted }}>{o.sub}</span>}
                    {isSel && <Check size={15} style={{ color: B.primary, marginInlineStart: "auto", flexShrink: 0 }} />}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </RP.Content>
      </RP.Portal>
    </RP.Root>
  );
}
