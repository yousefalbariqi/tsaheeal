import { useEffect, useState, type ReactNode } from "react";
import { ArrowUp, Check, Lock, Mars, Venus } from "lucide-react";
import { B, TONE } from "@/lib/theme";
import { buildBusRows } from "@/lib/buses";

/* مخطط مقاعد الباص المشترك (كروكي) — يُستخدم في اختيار المقاعد بالإدارة وصفحة العميل.
   نفس منطق الصفوف: 2 + ممر + 2، وصف خلفي حتى 5 مقاعد. والهندسة في
   lib/buses لأن الكشف وحارس مقعد الخصوصية يقرآنها كذلك.

   ── أكثر من باص ──
   الرحلة بثلاثة باصات تُرسم باصاً باصاً بتبويبٍ لكلٍّ منها، لا حافلةً
   واحدة بـ١٤٧ مقعداً. والتبويب المفتوح أوّلاً هو باص أول مقعدٍ مختار، أو
   أول باصٍ فيه مكان — فالحجز يملأ الأول ثم ينتقل إلى الثاني. والأرقام
   المرسومة أرقام الباص (١…٤٩)، والمختار يُعاد بأرقام الرحلة كما هي. */

/* ألوان حالات المقعد — مصدرها الواحد هنا، ويقرؤها من يكتب مفتاحاً أو
   سطراً يشرح الكروكي (شاشة الطلب). الذكر من لون «المعلومة» في اللوحة،
   والمحجوز بلا توزيع من المحايد. والأنثى والخصوصية لا مقابل لهما في
   TONE فيُعرَّفان هنا بالدرجة نفسها من الهدوء: حشوةٌ باهتة وحدٌّ ونصّ.
   واللون ليس الخبر وحده: كل مقعدٍ يحمل أيقونة حاله، فيُقرأ بلا تمييز ألوان. */
export const SEAT_TONE = {
  male:    TONE.info,
  female:  { bg: "#FBEFF4", line: "#EBCBDA", fg: "#A3275F" },
  privacy: { bg: "#F3EEFA", line: "#DCCFF0", fg: "#6A3FA0" },
  taken:   TONE.neutral,
} as const;

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

const SEAT = 44;
/* الصنف يحمل ما لا يعرفه التنسيق المضمَّن: المرور والتركيز. والألوان
   متغيّراتٌ يضبطها كل مقعدٍ بحسب حاله، فالصنف واحدٌ للحالات كلّها. */
const SEAT_CLASS = "relative flex flex-col items-center justify-center gap-0.5 rounded-[10px] border p-0 "
  + "bg-[var(--seat-bg)] border-[color:var(--seat-bd)] text-[color:var(--seat-fg)] "
  + "transition-[border-color,box-shadow,background-color] duration-100 "
  + "enabled:cursor-pointer enabled:hover:border-[color:var(--k-text)] disabled:cursor-not-allowed "
  + "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--k-gold)]";

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
    let bg: string = B.surface, bd: string = B.borderStrong, fg: string = B.text3, ring = "none";
    let gender: "male" | "female" | null = null;
    let state = "متاح";
    if (occ) {
      gender = occGender?.(num) ?? null;
      const t = isPrivacy ? SEAT_TONE.privacy : gender ? SEAT_TONE[gender] : SEAT_TONE.taken;
      bg = t.bg; bd = t.line; fg = t.fg;
      state = isPrivacy ? "مفرّغ للخصوصية" : gender === "female" ? "محجوز · أنثى" : gender === "male" ? "محجوز · ذكر" : "محجوز";
    }
    if (isSel) {
      gender = selGender?.(num) ?? null;
      const t = isSelectedPrivacy ? SEAT_TONE.privacy : gender ? SEAT_TONE[gender] : TONE.gold;
      bg = t.bg; fg = t.fg; bd = B.gold;
      /* حلقة الاختيار ذهبيةٌ في كل حال — «هذا مقعدك» علامةٌ واحدة، ولون
         الحشوة تحتها يقول لمن هو. */
      ring = `0 0 0 2px ${B.gold}`;
      state = isSelectedPrivacy ? "مختار · مفرّغ للخصوصية" : gender === "female" ? "مختار · أنثى" : gender === "male" ? "مختار · ذكر" : "مختار";
    }
    const local = num - offset;
    const where = busCount > 1 ? `باص ${bus} · ` : "";
    const Glyph = isPrivacy || isSelectedPrivacy ? Lock : gender === "female" ? Venus : gender === "male" ? Mars : null;
    return (
      <button key={num} type="button" onClick={() => !occ && onToggle(num)} disabled={occ}
        aria-pressed={occ ? undefined : isSel} aria-label={`${where}مقعد ${local} — ${state}`}
        title={`${where}${isPrivacy ? `مقعد ${local} مفرّغ للخصوصية` : `مقعد ${local}`}`}
        className={SEAT_CLASS}
        style={{ width: SEAT, height: SEAT, boxShadow: ring, lineHeight: 1, ["--seat-bg" as string]: bg, ["--seat-bd" as string]: bd, ["--seat-fg" as string]: fg }}>
        <span style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{local}</span>
        {Glyph && <Glyph size={11} strokeWidth={2.4} aria-hidden />}
        {isSel && (
          <span aria-hidden className="absolute flex items-center justify-center rounded-full"
            style={{ top: -6, insetInlineStart: -6, width: 16, height: 16, background: B.gold, color: B.black, boxShadow: `0 0 0 2px ${B.surface}` }}>
            <Check size={10} strokeWidth={3} />
          </span>
        )}
      </button>
    );
  };
  const swatch = (t: { bg: string; line: string }, ring?: boolean) => (
    <span aria-hidden className="rounded" style={{ width: 14, height: 14, background: t.bg, border: `1px solid ${ring ? B.gold : t.line}`, boxShadow: ring ? `0 0 0 1.5px ${B.gold}` : "none" }} />
  );
  const legend: [string, ReactNode][] = [
    ["متاح", swatch({ bg: B.surface, line: B.borderStrong })],
    ["ذكر", swatch(SEAT_TONE.male)],
    ["أنثى", swatch(SEAT_TONE.female)],
    ["محجوز بلا توزيع", swatch(SEAT_TONE.taken)],
    ["مفرّغ للخصوصية", swatch(SEAT_TONE.privacy)],
    ["اختيارك", swatch(TONE.gold, true)],
  ];
  return (
    <div className="flex flex-col items-center gap-4">
      {busCount > 1 && (
        <div role="tablist" aria-label="باصات الرحلة" className="ui-seg flex-wrap justify-center" style={{ maxWidth: "100%" }}>
          {Array.from({ length: busCount }, (_, i) => i + 1).map(b => {
            const on = b === bus;
            const free = freeIn(b);
            const mine = selected.filter(n => busOf(n) === b).length;
            return (
              <button key={b} type="button" role="tab" aria-selected={on} onClick={() => setPicked(b)}
                className={`ui-seg-item${on ? " is-on" : ""}`}>
                باص {b}
                <span style={{ fontWeight: 500, color: free ? B.muted : TONE.danger.fg }}>{free ? `${free} متاح` : "ممتلئ"}</span>
                {mine > 0 && <span className="rounded-md px-1.5" style={{ background: TONE.gold.bg, color: TONE.gold.fg, fontSize: 12, lineHeight: "18px" }}>{mine} مختار</span>}
              </button>
            );
          })}
        </div>
      )}
      {/* جسم الحافلة: مقدّمةٌ مستديرة وحدٌّ هادئ — يُقرأ الاتجاه من الشكل
          قبل أن يُقرأ من النصّ. */}
      <div className="flex flex-col items-center" style={{ padding: "12px 16px 16px", background: B.bg, border: `1px solid ${B.border}`, borderRadius: "36px 36px 18px 18px", maxWidth: "100%" }}>
        <div className="inline-flex items-center gap-1.5 text-xs" style={{ color: B.muted, fontWeight: 500, paddingBottom: 10, marginBottom: 12, borderBottom: `1px dashed ${B.borderStrong}`, alignSelf: "stretch", justifyContent: "center" }}>
          <ArrowUp size={12} aria-hidden />مقدمة {busCount > 1 ? `الباص ${bus}` : "الحافلة"} · السائق
        </div>
        <div className="flex flex-col gap-2 items-center">
          {rows.map((row, ri) => (
            <div key={ri} className="flex gap-2 items-center justify-center">
              {row.length === 4
                ? <>{seatBtn(row[0])}{seatBtn(row[1])}<div aria-hidden style={{ width: 28 }} />{seatBtn(row[2])}{seatBtn(row[3])}</>
                : row.map(seatBtn)}
            </div>
          ))}
        </div>
      </div>
      {showLegend && (
        <div className="flex flex-wrap gap-x-4 gap-y-2 justify-center">
          {legend.map(([l, sw]) => (
            <span key={l} className="inline-flex items-center gap-1.5 text-xs" style={{ color: B.text2, fontWeight: 500 }}>{sw}{l}</span>
          ))}
        </div>
      )}
      <div className="text-xs self-stretch" style={{ color: B.muted }}>المختار: {selected.length} / {need}</div>
    </div>
  );
}
