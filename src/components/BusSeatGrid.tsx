import { B } from "@/lib/theme";
import { genderGlyph } from "@/lib/utils";

/* مخطط مقاعد الباص المشترك (كروكي) — يُستخدم في اختيار المقاعد بالإدارة وصفحة العميل.
   نفس منطق الصفوف: 2 + ممر + 2، وصف خلفي حتى 5 مقاعد. */

export function buildBusRows(capacity: number): number[][] {
  const rows: number[][] = []; let n = 1;
  while (n <= capacity) {
    const rem = capacity - n + 1;
    if (rem <= 5) { rows.push(Array.from({ length: rem }, (_, i) => n + i)); n += rem; }
    else { rows.push([n, n + 1, n + 2, n + 3]); n += 4; }
  }
  return rows;
}

/** المقعد الملاصق ضمن الزوج نفسه في صف ٢ + ممر + ٢. */
export function privacySeatPartner(capacity: number, seat: number): number | null {
  const row = buildBusRows(capacity).find(r => r.includes(seat));
  if (!row || row.length !== 4) return null;
  const i = row.indexOf(seat);
  return row[i % 2 === 0 ? i + 1 : i - 1] ?? null;
}

/** ملاحظة موضع المقعد (شباك/ممر/أمامي). */
export function seatNote(num: number, capacity: number): string {
  const rows = buildBusRows(capacity);
  const ri = rows.findIndex(r => r.includes(num));
  const row = rows[ri] ?? [];
  const idx = row.indexOf(num);
  const parts: string[] = [];
  if (ri === 0) parts.push("أمامي");
  if (row.length === 4) { if (idx === 0 || idx === 3) parts.push("جانب الشباك"); else parts.push("جانب الممر"); }
  else if (idx === 0 || idx === row.length - 1) parts.push("جانب الشباك");
  return parts.join(" · ");
}

export function BusSeatGrid({
  capacity, occupied, selected, need, onToggle, occGender, selGender, privacySeats, selectedPrivacySeats, showLegend = true,
}: {
  capacity: number;
  occupied: Set<number>;
  selected: number[];
  need: number;
  onToggle: (n: number) => void;
  occGender?: (n: number) => "male" | "female" | null;
  selGender?: (n: number) => "male" | "female" | null;
  privacySeats?: Set<number>;
  selectedPrivacySeats?: Set<number>;
  showLegend?: boolean;
}) {
  const rows = buildBusRows(capacity);
  const seatBtn = (num: number) => {
    const occ = occupied.has(num);
    const isSel = selected.includes(num);
    const isPrivacy = privacySeats?.has(num) ?? false;
    const isSelectedPrivacy = selectedPrivacySeats?.has(num) ?? false;
    let bg = "#fff", bd = B.border, fg = B.text2, ring = "none", cursor = "pointer";
    let gender: "male" | "female" | null = null;
    if (occ) {
      cursor = "not-allowed"; gender = occGender?.(num) ?? null;
      if (isPrivacy) { bg = "#F3EAFE"; bd = "#D9C4F3"; fg = "#6F3AA8"; }
      else if (gender === "female") { bg = "#FBE9F1"; bd = "#F3CADF"; fg = "#B4266E"; }
      else if (gender === "male") { bg = "#EAF1FE"; bd = "#CBDBFB"; fg = "#1E52C7"; }
      else { bg = "#EEECEA"; bd = "#D6CFC6"; fg = "#9a9186"; } // رمادي = محجوز (عميل)
    }
    if (isSel) {
      gender = selGender?.(num) ?? null;
      bg = isSelectedPrivacy ? "#F3EAFE" : gender === "female" ? "#FBE9F1" : gender === "male" ? "#EAF1FE" : "#FFF7EA";
      fg = isSelectedPrivacy ? "#6F3AA8" : gender === "female" ? "#B4266E" : gender === "male" ? "#1E52C7" : "#8a6a08";
      bd = isSelectedPrivacy ? "#A876D1" : B.gold; ring = `0 0 0 2px ${isSelectedPrivacy ? "#A876D1" : B.gold}`;
    }
    return (
      <button key={num} onClick={() => !occ && onToggle(num)} disabled={occ} title={isPrivacy ? `مقعد ${num} مفرّغ للخصوصية` : `مقعد ${num}`}
        className="relative flex flex-col items-center justify-center rounded-[10px]"
        style={{ width: 42, height: 42, border: `1px solid ${bd}`, background: bg, color: fg, boxShadow: ring, cursor, padding: 0, lineHeight: 1.02 }}>
        <span style={{ fontSize: 13, fontWeight: 800 }}>{num}</span>
        {isPrivacy || isSelectedPrivacy
          ? <span style={{ fontSize: 9, fontWeight: 800, lineHeight: 1 }}>خصوصية</span>
          : gender && <span style={{ fontSize: 11, fontWeight: 800, lineHeight: 1 }}>{genderGlyph(gender)}</span>}
        {isSel && <span className="absolute flex items-center justify-center rounded-full" style={{ top: -6, insetInlineStart: -6, width: 16, height: 16, background: B.gold, color: B.black, fontSize: 10, fontWeight: 800 }}>×</span>}
      </button>
    );
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-center">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold" style={{ background: B.gold, color: B.black }}>⬆ مقدمة الحافلة · السائق</span>
      </div>
      <div className="flex flex-col gap-2 items-center">
        {rows.map((row, ri) => (
          <div key={ri} className="flex gap-2 items-center justify-center">
            {row.length === 4
              ? <>{seatBtn(row[0])}{seatBtn(row[1])}<div style={{ width: 26 }} />{seatBtn(row[2])}{seatBtn(row[3])}</>
              : row.map(seatBtn)}
          </div>
        ))}
      </div>
      {showLegend && (
        <div className="flex flex-wrap gap-3 justify-center pt-3" style={{ borderTop: `1px solid ${B.border}` }}>
          {[["#fff", B.border, "متاح"], ["#EAF1FE", "#CBDBFB", "ذكر"], ["#FBE9F1", "#F3CADF", "أنثى"], ["#EEECEA", "#D6CFC6", "محجوز بلا توزيع"]].map(([bg, bd, l]) => (
            <span key={l} className="inline-flex items-center gap-1.5 text-xs font-bold" style={{ color: B.text2 }}>
              <span className="rounded" style={{ width: 14, height: 14, background: bg as string, border: `1px solid ${bd}` }} />{l}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5 text-xs font-bold" style={{ color: B.text2 }}>
            <span className="rounded" style={{ width: 14, height: 14, background: "#F3EAFE", border: "1px solid #D9C4F3" }} />مفرّغ للخصوصية
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-bold" style={{ color: B.text2 }}>
            <span className="rounded" style={{ width: 14, height: 14, background: "#FFF7EA", border: `1px solid ${B.gold}`, boxShadow: `0 0 0 2px ${B.gold}` }} />اختيارك
          </span>
        </div>
      )}
      <div className="text-xs" style={{ color: B.muted }}>المختار: {selected.length} / {need}</div>
    </div>
  );
}
