import { useEffect, useState } from "react";
import { B } from "@/lib/theme";
import { genderGlyph } from "@/lib/utils";
import { buildBusRows } from "@/lib/buses";

/* مخطط مقاعد الباص المشترك (كروكي) — يُستخدم في اختيار المقاعد بالإدارة وصفحة العميل.
   نفس منطق الصفوف: 2 + ممر + 2، وصف خلفي حتى 5 مقاعد. والهندسة في
   lib/buses لأن الكشف وحارس مقعد الخصوصية يقرآنها كذلك.

   ── أكثر من باص ──
   الرحلة بثلاثة باصات تُرسم باصاً باصاً بتبويبٍ لكلٍّ منها، لا حافلةً
   واحدة بـ١٤٧ مقعداً. والتبويب المفتوح أوّلاً هو باص أول مقعدٍ مختار، أو
   أول باصٍ فيه مكان — فالحجز يملأ الأول ثم ينتقل إلى الثاني. والأرقام
   المرسومة أرقام الباص (١…٤٩)، والمختار يُعاد بأرقام الرحلة كما هي. */

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
  capacity, buses = 1, occupied, selected, need, onToggle, occGender, selGender, privacySeats, selectedPrivacySeats, showLegend = true,
}: {
  /** سعة الرحلة كلها — مجموع مقاعد باصاتها. */
  capacity: number;
  /** عدد باصات الرحلة؛ المقاعد مقسومةٌ عليها بالتساوي. */
  buses?: number;
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
  const busCount = Math.max(1, Math.floor(buses) || 1);
  const perBus = Math.floor(capacity / busCount);
  const busOf = (n: number) => Math.min(busCount, Math.max(1, Math.ceil(n / Math.max(perBus, 1))));
  const freeIn = (bus: number) => Array.from({ length: perBus }, (_, i) => (bus - 1) * perBus + i + 1).filter(n => !occupied.has(n)).length;
  const autoBus = selected.length ? busOf(selected[0])
    : (Array.from({ length: busCount }, (_, i) => i + 1).find(bus => freeIn(bus) > 0) ?? 1);
  const [picked, setPicked] = useState<number | null>(null);
  /* رحلةٌ أخرى بالسعة نفسها أو بغيرها: يُعاد الاختيار التلقائي. */
  useEffect(() => { setPicked(null); }, [capacity, busCount]);
  const bus = picked != null && picked <= busCount ? picked : autoBus;
  const offset = (bus - 1) * perBus;
  const rows = buildBusRows(perBus).map(row => row.map(n => n + offset));
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
      <button key={num} onClick={() => !occ && onToggle(num)} disabled={occ} title={`${busCount > 1 ? `باص ${bus} · ` : ""}${isPrivacy ? `مقعد ${num - offset} مفرّغ للخصوصية` : `مقعد ${num - offset}`}`}
        className="relative flex flex-col items-center justify-center rounded-[10px]"
        style={{ width: 42, height: 42, border: `1px solid ${bd}`, background: bg, color: fg, boxShadow: ring, cursor, padding: 0, lineHeight: 1.02 }}>
        <span style={{ fontSize: 13, fontWeight: 800 }}>{num - offset}</span>
        {isPrivacy || isSelectedPrivacy
          ? <span style={{ fontSize: 9, fontWeight: 800, lineHeight: 1 }}>خصوصية</span>
          : gender && <span style={{ fontSize: 11, fontWeight: 800, lineHeight: 1 }}>{genderGlyph(gender)}</span>}
        {isSel && <span className="absolute flex items-center justify-center rounded-full" style={{ top: -6, insetInlineStart: -6, width: 16, height: 16, background: B.gold, color: B.black, fontSize: 10, fontWeight: 800 }}>×</span>}
      </button>
    );
  };
  return (
    <div className="flex flex-col gap-3">
      {busCount > 1 && (
        <div role="tablist" aria-label="باصات الرحلة" className="flex flex-wrap gap-1.5 justify-center">
          {Array.from({ length: busCount }, (_, i) => i + 1).map(b => {
            const on = b === bus;
            const free = freeIn(b);
            const mine = selected.filter(n => busOf(n) === b).length;
            return (
              <button key={b} role="tab" aria-selected={on} onClick={() => setPicked(b)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer"
                style={{ background: on ? B.gold : "#fff", color: on ? B.black : B.text2, border: `1px solid ${on ? B.gold : B.border}` }}>
                باص {b}
                <span style={{ fontWeight: 600, color: on ? B.black : free ? B.muted : "#BE2626" }}>{free ? `${free} متاح` : "ممتلئ"}</span>
                {mine > 0 && <span className="px-1.5 rounded-md" style={{ background: on ? "#fff" : B.goldTint, color: on ? B.black : "#8a6a08" }}>{mine} مختار</span>}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex items-center justify-center">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold" style={{ background: B.gold, color: B.black }}>⬆ مقدمة {busCount > 1 ? `الباص ${bus}` : "الحافلة"} · السائق</span>
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
