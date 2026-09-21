/* أوراق الطباعة — ما يخرج من الشاشة إلى يدٍ أخرى.

   ── ورقتان لا واحدة، لأن القارئ اثنان ──
   ورقةُ الحافلة تُسلَّم للمشرف والسائق: أسماءٌ وهوياتٌ ومقاعد. وورقةُ
   السكن تُسلَّم لموظف الفندق: مَن الحاجز، وكم معه، وأي غرفة. وما يحتاجه
   الأول لا يحتاجه الثاني — وتسليمُ الفندق أرقامَ هوياتِ الركّاب ومقاعدَهم
   نشرُ بياناتٍ لطرفٍ ثالثٍ بلا سبب. فالزرّ يطبع ورقة التبويب المفتوح
   وحدها، ولا وجود لزرٍّ يطبع كل شيء.

   ── ولماذا صفحتان في ورقة الحافلة ──
   الأولى جدولٌ يُقرأ بالاسم (مَن معنا؟)، والثانية كروكيٌّ يُقرأ بالموضع
   (مَن في هذا المقعد؟). المشرف يحتاج الأولى عند العدّ والثانية عند
   الصعود، فطبعُ إحداهما دون الأخرى يُرجع اليد إلى النسخ اليدوي.

   ── الطباعة ──
   الصفحة مخفيّة على الشاشة (`display:none`) وتظهر عند الطباعة وحدها،
   ويُخفى ما عداها بـ`visibility`. الترتيب بينهما مقصود: إخفاء الأب
   بـ`display` يُسقط الأبناء مهما كانت `visibility`، فتُقلب `display`
   أولاً ثم تُعاد الرؤية لهذه الشجرة وحدها. */
import { B } from "@/lib/theme";
import type { Branch, Transport, Trip } from "@/types";
import { dayName, shortDate } from "@/lib/trip";
import { AR, croquisRows, partyLabel, type HousingManifest, type HousingStay, type Manifest, type ManifestRider } from "@/lib/manifest";
import { arCount } from "@/features/customer/plural";
import { genderGlyph } from "@/lib/utils";

export const PRINT_ID = "manifest-print";

/* ألوان الجنس هي ألوان الشاشة نفسها. و`print-color-adjust` شرطُ خروجها
   على الورق: المتصفّحات تُسقط خلفيات العناصر افتراضياً عند الطباعة،
   والكشف بلا تمييزٍ للجنس يفقد نصف فائدته. */
const TONE = {
  male:   { bg: "#EAF1FE", bd: "#9FBDF6", fg: "#1E52C7" },
  female: { bg: "#FBE9F1", bd: "#EFAECF", fg: "#B4266E" },
} as const;

export const PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 9mm; }
  body * { visibility: hidden !important; }
  #${PRINT_ID} { display: block !important; }
  #${PRINT_ID}, #${PRINT_ID} * { visibility: visible !important; }
  #${PRINT_ID} {
    position: absolute !important; inset: 0 !important; width: 100% !important;
    margin: 0 !important; padding: 0 !important; background: #fff !important;
  }
  #${PRINT_ID} .pg-break { break-before: page; page-break-before: always; }
  #${PRINT_ID} tr, #${PRINT_ID} .seat-cell { break-inside: avoid; page-break-inside: avoid; }
  #${PRINT_ID} thead { display: table-header-group; }
}
#${PRINT_ID} { display: none; }
#${PRINT_ID} * {
  -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
  font-family: var(--font-app), "Segoe UI", Tahoma, sans-serif;
}
`;

const cell: React.CSSProperties = { border: "1px solid #B9B2A6", padding: "3px 6px", fontSize: 9.5, textAlign: "right" };
const head: React.CSSProperties = { ...cell, background: "#EFEAE0", fontWeight: 800, fontSize: 9 };

function InfoTable({ rows }: { rows: [string, string][] }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 6 }}>
      <tbody>
        <tr>{rows.map(([k]) => <th key={k} style={{ ...head, textAlign: "center" }}>{k}</th>)}</tr>
        <tr>{rows.map(([k, v]) => <td key={k} style={{ ...cell, textAlign: "center", fontWeight: 700, fontSize: 10.5 }}>{v || "—"}</td>)}</tr>
      </tbody>
    </table>
  );
}

function SheetHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ textAlign: "center", border: "1px solid #B9B2A6", padding: "6px 8px", marginBottom: 6 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "#000" }}>مؤسسة تساهيل العمرة</div>
      <div style={{ fontSize: 11.5, fontWeight: 800, color: "#000", textDecoration: "underline", marginTop: 1 }}>{title}</div>
      <div style={{ fontSize: 8.5, color: "#444", marginTop: 2 }}>{sub}</div>
    </div>
  );
}

/** الوعاء الوحيد الذي يظهر عند الطباعة — ومحتواه ورقةٌ واحدة لا أكثر. */
export function PrintFrame({ children }: { children: React.ReactNode }) {
  return <div id={PRINT_ID} dir="rtl" lang="ar" style={{ color: "#000", background: "#fff" }}>{children}</div>;
}

export function TripPrintPages({ m, pkgName, vehicle, branch, printedAt }: {
  m: Manifest; pkgName: string; vehicle?: Transport; branch?: Branch; printedAt: string;
}) {
  const t = m.trip;
  const city = t.departureCity || branch?.city || "—";
  const bus = vehicle ? `${vehicle.name}${vehicle.plate ? ` — ${vehicle.plate}` : ""}` : (t.busPlate || "—");
  const drivers = t.drivers.filter(d => (d.name || "").trim());
  const rows = croquisRows(m);

  /* سطرُ الحاشية يُعيد الكشف إلى لحظته: ورقةٌ بلا وقتِ طباعةٍ لا يُعرف
     أهي كشفُ اليوم أم نسخةٌ في الدرج من الأسبوع الماضي. */
  const footer = `${t.id} · طُبع ${printedAt} · الكشف يُشتقّ من الحجوزات لحظة الطباعة`;

  return (
    <>
      {/* ══ الصفحة الأولى — كشف المقاعد ══ */}
      <SheetHead title="كشف المقاعد" sub={`${pkgName} · ${t.id}`} />
      <InfoTable rows={[
        ["الباقة", pkgName], ["اليوم", dayName(t.departureDate)],
        ["التاريخ", t.departureDate || "—"], ["وقت الانطلاق", t.departureTime || "—"],
        ["مدينة الانطلاق", city], ["الباص", bus],
      ]} />
      <InfoTable rows={[
        ["نقطة الانطلاق", t.departurePoint || branch?.name || "—"],
        ["هاتف الفرع", branch?.phone || "—"],
        ["السائق / السائقون", drivers.map(d => d.name).join(" · ") || "—"],
        ["جوال السائق", drivers.map(d => d.phone).filter(Boolean).join(" · ") || "—"],
        ["الركّاب", `${m.summary.seated} من ${m.summary.capacity}`],
      ]} />

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["م", "المقعد", "الاسم", "الجنس", "رقم الهوية/الإقامة", "الجنسية", "الجوال", "رقم الطلب", "التوقيع"].map(h =>
              <th key={h} style={head}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {m.riders.map((r, i) => {
            const tone = TONE[r.gender];
            return (
              <tr key={`${r.bookingId}-${r.seat}`}>
                <td style={{ ...cell, textAlign: "center", color: "#666" }}>{i + 1}</td>
                <td style={{ ...cell, textAlign: "center", fontWeight: 800, background: tone.bg, color: tone.fg, border: `1px solid ${tone.bd}` }}>{r.seat}</td>
                <td style={{ ...cell, fontWeight: 700 }}>
                  {r.name}
                  {r.ageGroup === "child" && <span style={{ color: "#8A6A08", fontWeight: 700 }}> (طفل)</span>}
                  {partyLabel(r) && <span style={{ color: "#777" }}> · {partyLabel(r)}</span>}
                </td>
                <td style={{ ...cell, textAlign: "center", fontWeight: 800, color: tone.fg }}>{r.gender === "female" ? "أنثى" : "ذكر"}</td>
                <td style={{ ...cell, textAlign: "center", direction: "ltr" }}>{r.idNumber || "—"}</td>
                <td style={{ ...cell, textAlign: "center" }}>{r.nationality || "—"}</td>
                <td style={{ ...cell, textAlign: "center", direction: "ltr" }}>{r.phone || r.contactPhone || "—"}</td>
                <td style={{ ...cell, textAlign: "center", direction: "ltr", color: "#555" }}>{r.bookingId}</td>
                <td style={{ ...cell, width: 64 }} />
              </tr>
            );
          })}
          {m.riders.length === 0 && (
            <tr><td colSpan={9} style={{ ...cell, textAlign: "center", padding: 14 }}>لا ركّاب مخصَّصة لهم مقاعد بعد.</td></tr>
          )}
        </tbody>
      </table>

      {/* ما لم يُخصَّص بعد يُطبع تحت الكشف لا خارجه: الورقة تقول كل ما
          على الرحلة، وإسقاطُه يجعلها تبدو مكتملة وفي الطلبات مَن ينتظر. */}
      {m.waiting.length > 0 && (
        <>
          <div style={{ fontSize: 10, fontWeight: 800, margin: "8px 0 3px" }}>
            بانتظار تخصيص مقعد — {arCount(m.waiting.length, AR.pilgrim)}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {m.waiting.map((r, i) => (
                <tr key={`${r.bookingId}-w${i}`}>
                  <td style={{ ...cell, width: 24, textAlign: "center", color: "#666" }}>{i + 1}</td>
                  <td style={{ ...cell, fontWeight: 700 }}>{r.name}</td>
                  <td style={{ ...cell, textAlign: "center" }}>{r.gender === "female" ? "أنثى" : "ذكر"}</td>
                  <td style={{ ...cell, textAlign: "center", direction: "ltr" }}>{r.idNumber || "—"}</td>
                  <td style={{ ...cell, textAlign: "center", direction: "ltr", color: "#555" }}>{r.bookingId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <div style={{ fontSize: 8, color: "#666", marginTop: 6 }}>{footer}</div>

      {/* ══ الصفحة الثانية — كروكي الباص ══ */}
      <div className="pg-break" style={{ paddingTop: 2 }}>
        <SheetHead title="كروكي الباص" sub={`${pkgName} · ${dayName(t.departureDate)} ${shortDate(t.departureDate)} · ${city}`} />
        <InfoTable rows={[
          ["الباص", bus], ["اليوم", dayName(t.departureDate)], ["التاريخ", t.departureDate || "—"],
          ["الانطلاق", t.departureTime || "—"], ["السائق", drivers.map(d => d.name).join(" · ") || "—"],
        ]} />
        <div style={{ textAlign: "center", fontSize: 9, fontWeight: 800, border: "1px solid #B9B2A6", background: "#EFEAE0", padding: "2px 0", marginBottom: 4 }}>
          ⬆ مقدمة الحافلة · السائق
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((s, si) => (
                  <PrintSeat key={s.num} seat={s.num} rider={s.rider}
                    gap={row.length === 4 && si === 1} wide={row.length === 5} />
                ))}
                {/* صفوف الأربعة تُملأ إلى خمسة أعمدة حتى تستقيم الشبكة
                    مع الصفّ الخلفي ذي المقاعد الخمسة. */}
                {row.length === 4 && <td style={{ border: "none", width: "2%" }} />}
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 6, fontSize: 9, fontWeight: 700 }}>
          <span><span style={{ display: "inline-block", width: 9, height: 9, background: TONE.male.bg, border: `1px solid ${TONE.male.bd}` }} /> ذكر</span>
          <span><span style={{ display: "inline-block", width: 9, height: 9, background: TONE.female.bg, border: `1px solid ${TONE.female.bd}` }} /> أنثى</span>
          <span><span style={{ display: "inline-block", width: 9, height: 9, background: "#fff", border: "1px solid #B9B2A6" }} /> شاغر ({m.summary.free})</span>
        </div>
        <div style={{ fontSize: 8, color: "#666", marginTop: 6 }}>{footer}</div>
      </div>
    </>
  );
}

function PrintSeat({ seat, rider, gap, wide }: { seat: number; rider: ManifestRider | null; gap: boolean; wide: boolean }) {
  const tone = rider ? TONE[rider.gender] : null;
  return (
    <td className="seat-cell" style={{
      border: `1px solid ${tone?.bd ?? "#B9B2A6"}`,
      background: tone?.bg ?? "#fff",
      padding: "2px 4px", height: 46, verticalAlign: "top",
      width: wide ? "19.6%" : "24%",
      borderInlineEnd: gap ? "3px double #8A8175" : undefined,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: tone?.fg ?? "#999" }}>{seat}</span>
        {rider && <span style={{ fontSize: 9, fontWeight: 800, color: tone!.fg }}>{genderGlyph(rider.gender)}</span>}
      </div>
      {rider && (
        <div style={{ lineHeight: 1.25 }}>
          <div style={{ fontSize: 8.5, fontWeight: 700, color: "#000", wordBreak: "break-word" }}>{rider.name}</div>
          <div style={{ fontSize: 7.5, color: "#444", direction: "ltr", textAlign: "right" }}>{rider.phone || rider.contactPhone || "—"}</div>
        </div>
      )}
    </td>
  );
}

/* ════════ ورقة السكن — ما يُسلَّم للفندق ════════

   وحدتها الحجز لا الشخص، وأعمدتها خمسة لا تزيد: مَن الحاجز، وكم هم
   جميعاً، وأي غرفة، ورقم الحجز ليُراجَعنا فيه. ولا هوية ولا مقعد
   ولا مبلغ — الفندق لا يحتاجها، وورقةٌ تحملها تخرج من يدنا ولا تعود. */
export function HousingPrintPage({ h, trip, pkgName, nights, printedAt }: {
  h: HousingManifest; trip: Trip; pkgName: string; nights: number; printedAt: string;
}) {
  const footer = `${trip.id} · طُبع ${printedAt} · الكشف يُشتقّ من الحجوزات لحظة الطباعة`;
  return (
    <>
      <SheetHead title="كشف السكن" sub={`${pkgName} · ${trip.id}`} />
      <InfoTable rows={[
        ["الباقة", pkgName],
        ["الوصول", `${dayName(trip.departureDate)} ${trip.departureDate || "—"}`],
        ["المغادرة", trip.returnDate ? `${dayName(trip.returnDate)} ${trip.returnDate}` : "—"],
        ["الليالي", nights > 0 ? String(nights) : "—"],
        ["النزلاء", String(h.totals.persons)],
        ["الحجوزات", String(h.totals.stays)],
      ]} />

      {h.groups.map(g => (
        <div key={g.hotelId} style={{ marginBottom: 10 }}>
          <div style={{ ...head, display: "block", fontSize: 10.5, padding: "5px 8px", border: "1px solid #B9B2A6" }}>
            {g.hotelName || "—"}{g.city ? ` · ${g.city}` : ""} — {arCount(g.persons, AR.person)} — {arCount(g.stays, AR.stay)}
            {g.needs.length > 0 && (
              <span style={{ fontWeight: 600, color: "#333" }}>
                {" — "}{g.needs.map(n => n.kind === "private" ? `${n.label} ×${n.count}` : n.label).join(" · ")}
              </span>
            )}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>{["م", "اسم الحاجز", "إجمالي الأشخاص", "نوع السكن", "رقم الحجز"].map(c =>
                <th key={c} style={head}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {g.rows.map((s, i) => <HousingPrintRow key={s.bookingId} s={s} i={i} />)}
            </tbody>
          </table>
        </div>
      ))}

      {h.groups.length === 0 && (
        <div style={{ ...cell, textAlign: "center", padding: 16 }}>لا نزلاء على هذه الإطلاقة.</div>
      )}

      {/* «مواصلات فقط» يُذكر ولا يُدرج: الفندق يقرأ فرقاً بين عدد ركّاب
          الحافلة وعدد نزلائه، وسطرٌ واحد يفسّره خيرٌ من سؤالٍ بالهاتف. */}
      {h.transportOnly.stays > 0 && (
        <div style={{ fontSize: 9, color: "#444", marginTop: 4 }}>
          ملاحظة: {arCount(h.transportOnly.stays, AR.stay)} ({arCount(h.transportOnly.persons, AR.person)}) مواصلاتٌ فقط — لا سكن لهم في هذه الإطلاقة.
        </div>
      )}
      <div style={{ fontSize: 8, color: "#666", marginTop: 6 }}>{footer}</div>
    </>
  );
}

function HousingPrintRow({ s, i }: { s: HousingStay; i: number }) {
  return (
    <tr>
      <td style={{ ...cell, textAlign: "center", color: "#666", width: 22 }}>{i + 1}</td>
      <td style={{ ...cell, fontWeight: 700 }}>{s.lead}{s.contactPhone && <span style={{ display: "block", marginTop: 2, fontSize: 7.5, color: "#555", direction: "ltr", textAlign: "right" }}>{s.contactPhone}</span>}</td>
      <td style={{ ...cell, textAlign: "center", fontWeight: 800 }}>{s.persons}</td>
      <td style={{ ...cell }}>
        {s.rooms.length > 0
          ? s.rooms.map(r => (
              <span key={r.key} style={{ display: "block" }}>
                {r.label}{r.kind === "private" && r.count > 1 ? ` ×${r.count}` : ""}
                {r.note && <span style={{ color: "#666" }}> ({r.note})</span>}
              </span>
            ))
          : <span style={{ color: "#666" }}>{s.roomText || "لم يُحدَّد"}</span>}
      </td>
      <td style={{ ...cell, textAlign: "center", direction: "ltr", color: "#555" }}>{s.bookingId}</td>
    </tr>
  );
}
