/* شرائح الترشيح والمقطّع.

   كانت شريحة المرشّح تُبنى في كل شاشة بدالّة تنسيقٍ محلية (`fb` في أربع
   ملفات) بثلاث لهجات: حبّاتٌ مفردة، وحبّاتٌ داخل صينية، وقوائم منسدلة.
   هنا لهجتان بمعنيين:

   FilterChips  ترشيح قائمةٍ بحالةٍ من عدّة — حبّاتٌ مفردة، والعدّ بجانب كلٍّ.
   Segmented    تبديل عرضٍ بين خيارين إلى أربعة — صينيةٌ واحدة.

   والمحدَّد فيهما ليس ذهبياً: الترشيح ليس فعلاً. */
import type { ReactNode } from "react";

export interface ChipOption<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
  /** عدٌّ يستدعي الانتباه (متأخّرات) — يُلوَّن أحمر ما دام أكبر من صفر. */
  alert?: boolean;
}

export function FilterChips<T extends string>({ options, value, onChange, label, className }: {
  options: readonly ChipOption<T>[];
  value: T;
  onChange: (v: T) => void;
  /** اسم المجموعة لقارئ الشاشة. */
  label: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={`ui-chips ${className ?? ""}`}>
      {options.map(o => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}
          className={`ui-chip${o.alert && o.count ? " ui-chip--alert" : ""}`}>
          {o.label}
          {o.count != null && <span className="ui-chip-count">{o.count.toLocaleString("en-US")}</span>}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label, className }: {
  options: readonly { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={`ui-seg ${className ?? ""}`}>
      {options.map(o => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}
          className="ui-seg-item">{o.label}</button>
      ))}
    </div>
  );
}

/** مفتاح تشغيل/إيقاف — role="switch" فيُعلَن بحالته، والتسمية إلزامية. */
export function Switch({ checked, onChange, label, disabled }: {
  checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean;
}) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      onClick={() => onChange(!checked)} className="ui-switch" />
  );
}
