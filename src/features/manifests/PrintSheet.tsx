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
import { AR, croquisRows, partyLabel, type CroquisSeat, type HousingManifest, type HousingStay, type Manifest } from "@/lib/manifest";
import { arCount } from "@/features/customer/plural";
import { genderGlyph } from "@/lib/utils";
import { busCountOf } from "@/lib/buses";

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
  #${PRINT_ID} tr, #${PRINT_ID} .bus-row { break-inside: avoid; page-break-inside: avoid; }
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
      <div style={{ fontSize: 11.5, fontWeight: 800, color: "#000", textDecoration: "underline", textUnderlineOffset: 3, marginTop: 1 }}>{title}</div>
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
  const busType = vehicle ? `${vehicle.name}${vehicle.plate && m.bus == null ? ` — ${vehicle.plate}` : ""}` : (t.busPlate || "—");
  /* ورقة كل باصٍ تحمل رقمه في العنوان: المشرف يتسلّم «باص ٢» لا «الرحلة». */
  const bus = m.bus != null ? `${busType} · باص ${m.bus} من ${busCountOf(t)}` : busType;
  const busTitle = m.bus != null ? ` — باص ${m.bus}` : "";
  /* من ينتظر تخصيصاً لا باص له بعد: يُطبع مرّةً مع الباص الأول لا مع كل باص. */
  const showWaiting = m.waiting.length > 0 && (m.bus == null || m.bus === 1);
  const drivers = t.drivers.filter(d => (d.name || "").trim());
  const rows = croquisRows(m);

  /* سطرُ الحاشية يُعيد الكشف إلى لحظته: ورقةٌ بلا وقتِ طباعةٍ لا يُعرف
     أهي كشفُ اليوم أم نسخةٌ في الدرج من الأسبوع الماضي. */
  const footer = `${t.id} · طُبع ${printedAt} · الكشف يُشتقّ من الحجوزات لحظة الطباعة`;

  return (
    <>
      {/* ══ الصفحة الأولى — كشف المقاعد ══ */}
      <SheetHead title={`كشف المقاعد${busTitle}`} sub={`${pkgName}${busTitle} · ${t.id}`} />
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
                <td style={{ ...cell, textAlign: "center", fontWeight: 800, background: tone.bg, color: tone.fg, border: `1px solid ${tone.bd}` }}>{r.busSeat ?? r.seat}</td>
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
      {showWaiting && (
        <>
          <div style={{ fontSize: 10, fontWeight: 800, margin: "8px 0 3px" }}>
            بانتظار تخصيص مقعد — {arCount(m.waiting.length, AR.pilgrim)}{m.bus != null ? " (على الرحلة كلها، بلا باص بعد)" : ""}
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
        <SheetHead title={`كروكي الباص${busTitle}`} sub={`${pkgName} · ${dayName(t.departureDate)} ${shortDate(t.departureDate)} · ${city}`} />
        <InfoTable rows={[
          ["الباص", bus], ["اليوم", dayName(t.departureDate)], ["التاريخ", t.departureDate || "—"],
          ["الانطلاق", t.departureTime || "—"], ["السائق", drivers.map(d => d.name).join(" · ") || "—"],
        ]} />
        <BusPlan rows={rows} />
        <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 8, fontSize: 9, fontWeight: 700 }}>
          <span><Swatch bg={TONE.male.bg} bd={TONE.male.bd} /> ذكر <b style={{ color: TONE.male.fg }}>{m.summary.male}</b></span>
          <span><Swatch bg={TONE.female.bg} bd={TONE.female.bd} /> أنثى <b style={{ color: TONE.female.fg }}>{m.summary.female}</b></span>
          <span><Swatch bg="#fff" bd={SEAT_BD} /> شاغر <b>{m.summary.free}</b></span>
          <span><Swatch bg="#F3EAFE" bd="#D9C4F3" /> مفرّغ للخصوصية</span>
        </div>
        <div style={{ fontSize: 8, color: "#666", marginTop: 6 }}>{footer}</div>
      </div>
    </>
  );
}

/* ════════ الكروكي على الورق ════════
   الورقة ترسم الحافلة كما تُرى من فوق، لا جدولاً: مقدّمةٌ مستديرة،
   والسائق على اليسار والباب على اليمين كما في حافلاتنا، وفي الممر رقم
   الصفّ كما على الشاشة، والصفّ الخلفي يمتدّ فوق الممر. والترقيم من
   `buildBusRows` نفسها، فالمقعد ٥ في الورقة في موضعه على الشاشة.

   وكان جدولاً من قبل، وهذا ما أفسده: `table-layout: fixed` يأخذ عرض
   الأعمدة من الصفّ الأول، والعمود الخامس فيه حشوةٌ عرضها ٢٪، فيُعصر
   المقعد ٤٩ في الصفّ الخلفي حتى لا يبقى منه إلا رقمه.

   وارتفاع المقعد يُحسب من عدد الصفوف بدل أن يكون ثابتاً، لتبقى حافلة
   ٤٩ مقعداً (١٢ صفاً) وحافلة ٦٠ مقعداً (١٥ صفاً) في صفحةٍ واحدة. */
const SEAT_GAP = 5;
const AISLE = 26;
const SEAT_BD = "#B9B2A6";
const BODY = "#8A8175";
/** عرض مقعد الصفّ الخلفي: خمسةٌ تملأ عرض الهيكل كله. */
const BACK_SEAT = `calc((100% - ${4 * SEAT_GAP}px) / 5)`;

function BusPlan({ rows }: { rows: CroquisSeat[][] }) {
  const seatH = Math.max(38, Math.min(56, Math.floor(740 / Math.max(rows.length, 1)) - SEAT_GAP));
  return (
    <div style={{ position: "relative", width: "86%", margin: "2px auto 0" }}>
      <Wheel side="left" style={{ top: 58 }} /><Wheel side="right" style={{ top: 58 }} />
      <Wheel side="left" style={{ bottom: "16%" }} /><Wheel side="right" style={{ bottom: "16%" }} />
      <div style={{ position: "relative", border: `2px solid ${BODY}`, borderRadius: "36px 36px 14px 14px", background: "#fff", padding: "0 10px 10px" }}>
        <div style={{
          margin: "0 -10px", height: 20, borderRadius: "34px 34px 0 0", background: "#EFEAE0",
          borderBottom: `1px solid ${SEAT_BD}`, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 9, fontWeight: 800, color: "#3D372F",
        }}>⬆ مقدمة الحافلة</div>
        {/* المقصورة — في RTL أول عنصرٍ على اليمين: الباب، ثم السائق يساراً. */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "stretch", padding: "6px 0", marginBottom: 7, borderBottom: `1px dashed ${SEAT_BD}` }}>
          <div style={{
            width: `calc((100% - ${AISLE + 4 * SEAT_GAP}px) / 4)`, height: 28, boxSizing: "border-box",
            border: `1.5px dashed ${BODY}`, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 8.5, fontWeight: 800, color: "#5E574D",
          }}>الباب</div>
          <div style={{
            width: `calc((100% - ${AISLE + 4 * SEAT_GAP}px) / 4)`, height: 28, boxSizing: "border-box",
            border: `1px solid ${SEAT_BD}`, borderBottomWidth: 3, borderRadius: 6, background: "#EFEAE0",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
            fontSize: 8.5, fontWeight: 800, color: "#3D372F",
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3D372F" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2.4" />
              <path d="M12 14.4V21M9.7 11.3 3.4 9.6M14.3 11.3l6.3-1.7" />
            </svg>
            السائق
          </div>
        </div>
        {rows.map((row, ri) => (
          <div key={ri} className="bus-row" style={{ display: "flex", justifyContent: "center", gap: SEAT_GAP, marginTop: ri ? SEAT_GAP : 0 }}>
            {row.length === 4
              ? <>
                  <PrintSeat s={row[0]} h={seatH} /><PrintSeat s={row[1]} h={seatH} />
                  <div style={{ flex: `0 0 ${AISLE}px`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8.5, fontWeight: 700, color: "#A39B8F" }}>{ri + 1}</div>
                  <PrintSeat s={row[2]} h={seatH} /><PrintSeat s={row[3]} h={seatH} />
                </>
              : row.map(s => <PrintSeat key={s.num} s={s} h={seatH} back />)}
          </div>
        ))}
      </div>
    </div>
  );
}

function Wheel({ side, style }: { side: "left" | "right"; style: React.CSSProperties }) {
  return <div aria-hidden style={{ position: "absolute", [side]: -8, width: 7, height: 38, borderRadius: 3, background: "#5E574D", ...style }} />;
}

function Swatch({ bg, bd }: { bg: string; bd: string }) {
  return <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, verticalAlign: "-1px", background: bg, border: `1px solid ${bd}` }} />;
}

/* الحافة السفلى أعرض من باقي الحواف لأنها ظهر المقعد: الراكب يجلس
   ووجهه إلى المقدّمة، فظهر الكرسي جهة المؤخرة، وبه يُقرأ الصندوق مقعداً. */
function PrintSeat({ s, h, back }: { s: CroquisSeat; h: number; back?: boolean }) {
  const r = s.rider;
  const tone = r ? TONE[r.gender] : null;
  return (
    <div style={{
      ...(back ? { flex: "none", width: BACK_SEAT } : { flex: "1 1 0" }),
      minWidth: 0, minHeight: h, boxSizing: "border-box", padding: "3px 5px",
      border: `1px solid ${s.privacy ? "#D9C4F3" : tone?.bd ?? SEAT_BD}`, borderBottomWidth: 3, borderRadius: 7,
      background: s.privacy ? "#F3EAFE" : tone?.bg ?? "#fff",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: tone?.fg ?? "#999" }}>{s.label}</span>
        {r && <span style={{ fontSize: 9, fontWeight: 800, color: tone!.fg }}>{genderGlyph(r.gender)}</span>}
        {s.privacy && <span style={{ fontSize: 7.5, fontWeight: 800, color: "#6F3AA8" }}>خصوصية</span>}
      </div>
      {r && (
        <div style={{ lineHeight: 1.25, marginTop: 1 }}>
          <div style={{ fontSize: 8.5, fontWeight: 700, color: "#000", wordBreak: "break-word" }}>{r.name}</div>
          <div style={{ fontSize: 7.5, color: "#444", direction: "ltr", textAlign: "right" }}>{r.phone || r.contactPhone || "—"}</div>
        </div>
      )}
    </div>
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
