/* كشف إطلاقةٍ واحدة — الجدول والكروكي ووجهتهما إلى الورق.

   ── ليسا نظامين ──
   الجدول يُقرأ بالاسم والكروكي يُقرأ بالموضع، وكلاهما `Manifest` واحد
   بُني من الحجوزات. فنقلُ معتمرٍ من المقعد ١٢ إلى ١٨ ليس «تحديثاً
   للكشف» ثم «تحديثاً للكروكي»: هو تعديلٌ واحد في الحجز، وما على هذه
   الشاشة يُعاد اشتقاقه منه في الرسمة التالية.

   ── ولا تُعدَّل المقاعد من هنا ──
   التخصيص يمرّ بـ`accept_booking` في معاملةٍ واحدة تحرس السعة والازدواج
   (ترحيل 20260910)، وشاشة الطلب هي بابه. فزرّ المقعد هنا يفتح الطلب ولا
   يكتب مقعداً: بابان للكتابة يعنيان حارسَين، وأحدهما سيتخلّف. */
import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  ArrowRight, Printer, MapPin, Clock, Bus, User, Users, AlertTriangle,
  ClipboardList, LayoutGrid, BedDouble, ExternalLink, CalendarDays, Phone,
} from "lucide-react";
import { B } from "@/lib/theme";
import type { Booking, Branch, Pkg, Transport, Trip } from "@/types";
import { dayName, shortDate, tripBoardState, untilLabel } from "@/lib/trip";
import { StatusBadge } from "@/components/StatusBadge";
import { firstTwo, genderGlyph } from "@/lib/utils";
import { arCount } from "@/features/customer/plural";
import {
  AR, buildManifest, buildHousing, croquisRows, partyLabel, DOC_LABEL,
  type HotelRef, type HousingManifest, type HousingStay, type Manifest, type ManifestRider,
} from "@/lib/manifest";
import { PrintFrame, TripPrintPages, HousingPrintPage, PRINT_CSS } from "./PrintSheet";

/* ألوان الجنس — نفس درجات شاشة اختيار المقاعد. المعنى واحدٌ في
   الشاشتين، فاختلاف الدرجة بينهما يجعل الموظف يتعلّم مفتاحين. */
const TONE = {
  male:   { bg: "#EAF1FE", bd: "#CBDBFB", fg: "#1E52C7", label: "ذكر" },
  female: { bg: "#FBE9F1", bd: "#F3CADF", fg: "#B4266E", label: "أنثى" },
} as const;

/* الورقة المفتوحة في المسار لا في الحالة: «أرسل لي كشف سكن رحلة
   الأربعاء» يصير رابطاً يُلصق، ويعود زرّ الرجوع ورقةً لا يخرج من الكشف. */
type Tab = "seats" | "croquis" | "housing";
const TABS_ORDER: Tab[] = ["seats", "croquis", "housing"];
const tabOf = (v: string | null): Tab => (TABS_ORDER as string[]).includes(v ?? "") ? (v as Tab) : "seats";

const TH: React.CSSProperties = { padding: "10px 12px", fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" };
const TD: React.CSSProperties = { padding: "10px 12px", whiteSpace: "nowrap" };

/* ════════ رقاقة معلومة في ترويسة الكشف ════════ */
function Fact({ Icon, label, value, ltr }: { Icon: typeof MapPin; label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <span className="flex items-center justify-center rounded-lg flex-shrink-0 mt-0.5"
        style={{ width: 26, height: 26, background: "rgba(192,134,44,0.14)", border: "1px solid rgba(192,134,44,0.26)" }}>
        <Icon size={13} style={{ color: B.gold2 }} />
      </span>
      <span className="min-w-0">
        <span className="block" style={{ fontSize: 10.5, color: "#9DBAB6" }}>{label}</span>
        <span className="block font-bold truncate" style={{ fontSize: 12.5, color: "#fff", direction: ltr ? "ltr" : undefined, textAlign: ltr ? "right" : undefined }}>{value || "—"}</span>
      </span>
    </div>
  );
}

/* ════════ عدّادٌ صغير ════════ */
function Tally({ value, label, fg = B.black, bg = "#fff", bd = B.border }: {
  value: number | string; label: string; fg?: string; bg?: string; bd?: string;
}) {
  return (
    <div className="rounded-xl px-3.5 py-2.5 flex flex-col gap-0.5" style={{ background: bg, border: `1px solid ${bd}` }}>
      <span className="font-extrabold tabular-nums" style={{ fontSize: 19, color: fg, fontFamily: "var(--font-app)", lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 10.5, color: B.muted, fontWeight: 600 }}>{label}</span>
    </div>
  );
}

/* ════════ الكروكي على الشاشة ════════
   نفس هندسة `buildBusRows` التي تُرسم بها شاشة اختيار المقاعد — شكلٌ
   واحد للحافلة في كل مكان. والفرق أن هذه تقرأ ولا تكتب: الضغط يفتح
   الطلب صاحب المقعد. */
function Croquis({ m, onOpenBooking }: { m: Manifest; onOpenBooking: (id: string) => void }) {
  const rows = croquisRows(m);
  return (
    <div className="rounded-2xl p-4 md:p-6 flex flex-col gap-4" style={{ background: "#fff", border: `1px solid ${B.border}` }}>
      <div className="flex items-center justify-center">
        <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold" style={{ background: B.gold, color: B.black }}>
          ⬆ مقدمة الحافلة · السائق
        </span>
      </div>
      <div className="tbl-scroll">
        <div className="flex flex-col gap-2 items-center" style={{ minWidth: 520 }}>
          {rows.map((row, ri) => (
            <div key={ri} className="flex gap-2 items-stretch justify-center">
              {row.length === 4
                ? <>
                    <Seat s={row[0]} onOpen={onOpenBooking} /><Seat s={row[1]} onOpen={onOpenBooking} />
                    <div className="flex items-center justify-center" style={{ width: 30 }}>
                      <span style={{ fontSize: 9.5, color: B.placeholder, fontWeight: 700 }}>{ri + 1}</span>
                    </div>
                    <Seat s={row[2]} onOpen={onOpenBooking} /><Seat s={row[3]} onOpen={onOpenBooking} />
                  </>
                : row.map(s => <Seat key={s.num} s={s} onOpen={onOpenBooking} />)}
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-4 justify-center pt-3.5" style={{ borderTop: `1px solid ${B.border}` }}>
        {([["male", m.summary.male], ["female", m.summary.female]] as const).map(([g, n]) => (
          <span key={g} className="inline-flex items-center gap-1.5 text-xs font-bold" style={{ color: B.text2 }}>
            <span className="rounded" style={{ width: 14, height: 14, background: TONE[g].bg, border: `1px solid ${TONE[g].bd}` }} />
            {TONE[g].label} <b style={{ color: TONE[g].fg }}>{n}</b>
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 text-xs font-bold" style={{ color: B.text2 }}>
          <span className="rounded" style={{ width: 14, height: 14, background: "#fff", border: `1px solid ${B.border}` }} />
          شاغر <b style={{ color: B.text3 }}>{m.summary.free}</b>
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs font-bold" style={{ color: B.text2 }}>
          <span className="rounded" style={{ width: 14, height: 14, background: "#F3EAFE", border: "1px solid #D9C4F3" }} />مفرّغ للخصوصية
        </span>
      </div>
    </div>
  );
}

function Seat({ s, onOpen }: { s: { num: number; rider: ManifestRider | null; privacy: boolean }; onOpen: (id: string) => void }) {
  const r = s.rider;
  const tone = r ? TONE[r.gender] : null;
  const body = (
    <>
      <span className="flex items-center justify-between w-full" style={{ lineHeight: 1 }}>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: tone?.fg ?? B.placeholder }}>{s.num}</span>
        {r && <span style={{ fontSize: 10, fontWeight: 800, color: tone!.fg }}>{genderGlyph(r.gender)}</span>}
        {s.privacy && <span style={{ fontSize: 9, fontWeight: 800, color: "#6F3AA8" }}>خصوصية</span>}
      </span>
      {r && <>
        <span className="block w-full truncate" style={{ fontSize: 10, fontWeight: 700, color: B.black, marginTop: 3 }}>{firstTwo(r.name)}</span>
        <span className="block w-full truncate" style={{ fontSize: 9, color: B.muted, direction: "ltr", textAlign: "right" }}>{r.phone || r.contactPhone || "—"}</span>
      </>}
    </>
  );
  const box: React.CSSProperties = {
    width: 92, minHeight: 54, padding: "5px 6px", borderRadius: 10,
    border: `1px solid ${s.privacy ? "#D9C4F3" : tone?.bd ?? B.border}`, background: s.privacy ? "#F3EAFE" : tone?.bg ?? "#fff",
    display: "flex", flexDirection: "column", alignItems: "flex-start", textAlign: "right",
  };
  if (!r) return <span style={{ ...box, background: s.privacy ? "#F3EAFE" : "#FCFBF8" }}>{body}</span>;
  return (
    <button onClick={() => onOpen(r.bookingId)} style={{ ...box, cursor: "pointer" }}
      title={`${r.name} · ${TONE[r.gender].label} · مقعد ${s.num} · ${r.bookingId}`}>
      {body}
    </button>
  );
}

/* ════════ جدول الكشف ════════ */
const COLS = ["المقعد", "الاسم", "الجنس", "الوثيقة", "الجنسية", "الجوال", "الحجز", "الطلب"];

function RiderRow({ r, onOpen }: { r: ManifestRider; onOpen: (id: string) => void }) {
  const tone = TONE[r.gender];
  return (
    <tr className="trip-row" style={{ borderTop: `1px solid ${B.border}` }}>
      <td style={{ ...TD, borderInlineStart: `3px solid ${tone.fg}` }}>
        <span className="inline-flex items-center justify-center rounded-lg font-extrabold tabular-nums"
          style={{ minWidth: 34, height: 28, padding: "0 7px", background: tone.bg, border: `1px solid ${tone.bd}`, color: tone.fg, fontSize: 13 }}>
          {r.seat}
        </span>
      </td>
      <td style={{ ...TD, whiteSpace: "normal", minWidth: 180 }}>
        <span className="font-bold" style={{ color: B.black }}>{r.name || "—"}</span>
        <span className="block" style={{ fontSize: 10.5, color: B.muted }}>
          {r.ageGroup === "child" && <b style={{ color: "#8A6A08" }}>طفل · </b>}
          {partyLabel(r) ? `${r.clientName} · ${partyLabel(r)}` : r.clientName}
        </span>
      </td>
      <td style={TD}>
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg font-bold"
          style={{ background: tone.bg, color: tone.fg, fontSize: 11 }}>
          <span style={{ fontSize: 12 }}>{genderGlyph(r.gender)}</span>{tone.label}
        </span>
      </td>
      <td style={{ ...TD, color: B.text2 }}>
        <span className="tabular-nums" style={{ direction: "ltr", display: "inline-block", fontWeight: 700 }}>{r.idNumber || "—"}</span>
        {r.docType && <span className="block" style={{ fontSize: 10.5, color: B.muted }}>{DOC_LABEL[r.docType]}</span>}
      </td>
      <td style={{ ...TD, color: B.text2, fontWeight: 600 }}>{r.nationality || "—"}</td>
      <td style={{ ...TD, color: B.text2, fontWeight: 600 }}>
        <span style={{ direction: "ltr", display: "inline-block" }}>{r.phone || r.contactPhone || "—"}</span>
        {!r.phone && r.contactPhone && <span className="block" style={{ fontSize: 10, color: B.muted }}>جوال صاحب الحجز</span>}
      </td>
      <td style={{ ...TD }}>
        <span className="block font-bold" style={{ color: B.text3, fontSize: 11.5, direction: "ltr", textAlign: "right" }}>{r.bookingId}</span>
        <StatusBadge status={r.status} entity="booking" />
      </td>
      <td style={{ ...TD, paddingBlock: 7 }} className="col-action">
        <button onClick={() => onOpen(r.bookingId)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold cursor-pointer whitespace-nowrap"
          style={{ background: B.fill, border: `1px solid ${B.border}`, color: B.text3, fontSize: 11.5 }}>
          <ExternalLink size={11} />فتح
        </button>
      </td>
    </tr>
  );
}

function SeatSheet({ m, onOpenBooking }: { m: Manifest; onOpenBooking: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: `1px solid ${B.border}` }}>
        <div className="tbl-hint items-center gap-1.5 px-4 py-2" style={{ background: B.fill, borderBottom: `1px solid ${B.border}`, color: B.muted, fontSize: 11 }}>
          <ArrowRight size={11} />مرّر الجدول أفقياً لرؤية بقية الأعمدة
        </div>
        <div className="tbl-scroll">
          <table style={{ width: "100%", minWidth: 880, borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: B.cream, color: "#7a7168", fontSize: 12 }}>
                {COLS.map(h => <th key={h} style={TH} className={h === "الطلب" ? "col-action" : undefined}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {m.riders.map(r => <RiderRow key={`${r.bookingId}-${r.seat}`} r={r} onOpen={onOpenBooking} />)}
              {m.riders.length === 0 && (
                <tr><td colSpan={COLS.length} style={{ padding: 40, textAlign: "center", color: B.muted, fontSize: 13 }}>
                  لا مقاعد مخصَّصة على هذه الإطلاقة بعد.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* بانتظار التخصيص — داخل الكشف لا خارجه: هو عملٌ على هذه
          الإطلاقة، وإخفاؤه يجعل الكشف يبدو مكتملاً وفي الطلبات مَن ينتظر. */}
      {m.waiting.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: "1px solid #F0E3AE" }}>
          <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: "#FBF3D6", color: "#8A6A08", fontSize: 12, fontWeight: 700 }}>
            <AlertTriangle size={13} />بانتظار تخصيص مقعد — {arCount(m.waiting.length, AR.pilgrim)}
          </div>
          <div className="flex flex-col">
            {m.waiting.map((r, i) => (
              <div key={`${r.bookingId}-${i}`} className="flex items-center gap-3 px-4 py-2.5 flex-wrap" style={{ borderTop: i ? `1px solid ${B.border}` : "none" }}>
                <span className="flex items-center justify-center rounded-md flex-shrink-0"
                  style={{ width: 22, height: 22, background: TONE[r.gender].bg, color: TONE[r.gender].fg, fontSize: 12, fontWeight: 800 }}>
                  {genderGlyph(r.gender)}
                </span>
                <span className="font-bold text-sm" style={{ color: B.black }}>{r.name || "—"}</span>
                <span style={{ fontSize: 11.5, color: B.muted, direction: "ltr" }}>{r.idNumber || "—"}</span>
                <StatusBadge status={r.status} entity="booking" />
                <button onClick={() => onOpenBooking(r.bookingId)}
                  className="ms-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold cursor-pointer"
                  style={{ background: B.gold, color: B.black, border: "none", fontSize: 11.5 }}>
                  <ExternalLink size={11} />تخصيص من الطلب
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* مقاعد متفرّقة — تنبيهٌ لا تعطيه الورقة المنسوخة: أربعةٌ في حجزٍ
          واحد على مقاعد ٣ و٧ و١٨ ليسوا جالسين معاً. */}
      {m.summary.scattered > 0 && (
        <div className="rounded-2xl px-4 py-3 flex flex-col gap-2" style={{ background: "#FEF6EF", border: "1px solid #F5D9BE" }}>
          <div className="flex items-center gap-2 font-bold" style={{ color: "#B4530C", fontSize: 12.5 }}>
            <Users size={13} />{arCount(m.summary.scattered, AR.stay)} {m.summary.scattered === 1 ? "مقاعده متفرّقة" : "مقاعدها متفرّقة"}
          </div>
          <div className="flex flex-wrap gap-2">
            {m.parties.filter(p => !p.unseated && !p.contiguous).map(p => (
              <button key={p.bookingId} onClick={() => onOpenBooking(p.bookingId)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl font-bold cursor-pointer"
                style={{ background: "#fff", border: `1px solid ${B.border}`, color: B.text3, fontSize: 11.5 }}>
                {p.clientName || p.bookingId}
                <span className="tabular-nums" style={{ color: B.muted, direction: "ltr" }}>{p.seats.join(" · ")}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════ كشف السكن ════════

   وحدته الحجز لا الشخص: الغرفة تُسلَّم لمجموعة، وصاحب الحجز هو مَن يقف
   عند الاستقبال ومعه أهله. تفريقُهم خمسةَ أسطر كان يجعل موظف الفندق
   يجمعهم بيده ليعرف كم غرفةً يسلّم.

   والفندق عنوانُ القسم لا عمودٌ يتكرّر في كل سطر: اسمه في الترويسة مع
   عدد نزلائه وحجوزاته واحتياجه من الغرف — وهو ما يُقرأ أولاً قبل
   الأسماء. وكتابته ثمانيَ مرّاتٍ في عمودٍ جانبي ضجيجٌ لا معلومة. */

const STAY_COLS = ["اسم الحاجز", "إجمالي الأشخاص", "نوع السكن", "الحجز", "الطلب"];

function RoomLines({ s }: { s: HousingStay }) {
  if (!s.rooms.length) {
    return <span style={{ color: B.muted, fontSize: 12.5 }}>{s.roomText || "لم يُحدَّد"}</span>;
  }
  return (
    <span className="flex flex-col gap-1">
      {s.rooms.map(r => (
        <span key={r.key} className="inline-flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg font-bold"
            style={{
              background: r.kind === "shared" ? "#F1F9FD" : B.goldTint,
              border: `1px solid ${r.kind === "shared" ? "#CFE7F2" : "#EDE0C2"}`,
              color: r.kind === "shared" ? "#0E7CA8" : "#8A6A08", fontSize: 11.5,
            }}>
            <BedDouble size={11} />{r.label}{r.kind === "private" && r.count > 1 ? ` ×${r.count}` : ""}
          </span>
          {r.note && <span style={{ fontSize: 10.5, color: B.muted }}>{r.note}</span>}
        </span>
      ))}
    </span>
  );
}

function StayRow({ s, onOpen }: { s: HousingStay; onOpen: (id: string) => void }) {
  return (
    <tr className="trip-row" style={{ borderTop: `1px solid ${B.border}` }}>
      <td style={{ ...TD, whiteSpace: "normal", minWidth: 170 }}>
        <span className="font-bold" style={{ color: B.black, fontSize: 13.5 }}>{s.lead}</span>
        {s.contactPhone && <span className="block mt-0.5" style={{ color: B.muted, fontSize: 11.5, direction: "ltr", textAlign: "right" }}>{s.contactPhone}</span>}
      </td>
      <td style={{ ...TD, textAlign: "center" }}>
        <span className="inline-flex items-center justify-center rounded-lg font-extrabold tabular-nums"
          style={{ minWidth: 30, height: 27, padding: "0 7px", background: B.fill, border: `1px solid ${B.border}`, color: B.black, fontSize: 13 }}>
          {s.persons}
        </span>
      </td>
      <td style={{ ...TD, whiteSpace: "normal", minWidth: 200 }}><RoomLines s={s} /></td>
      <td style={TD}>
        <span className="block font-bold" style={{ color: B.text3, fontSize: 11.5, direction: "ltr", textAlign: "right" }}>{s.bookingId}</span>
        <StatusBadge status={s.status} entity="booking" />
      </td>
      <td style={{ ...TD, paddingBlock: 7 }} className="col-action">
        <button onClick={() => onOpen(s.bookingId)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold cursor-pointer whitespace-nowrap"
          style={{ background: B.fill, border: `1px solid ${B.border}`, color: B.text3, fontSize: 11.5 }}>
          <ExternalLink size={11} />فتح
        </button>
      </td>
    </tr>
  );
}

function HousingSheet({ h, nights, onOpenBooking }: {
  h: HousingManifest; nights: number; onOpenBooking: (id: string) => void;
}) {
  if (h.groups.length === 0) {
    return (
      <div className="rounded-2xl px-6 py-14 flex flex-col items-center text-center gap-3" style={{ background: "#fff", border: `1px solid ${B.border}` }}>
        <span className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: B.fill, border: `1px solid ${B.border}` }}>
          <BedDouble size={24} style={{ color: B.muted }} />
        </span>
        <strong className="text-sm font-bold" style={{ color: B.text3 }}>
          {nights <= 0 ? "باقة مواصلات فقط — لا سكن" : "لا نزلاء على هذه الإطلاقة بعد"}
        </strong>
        <span className="text-xs leading-relaxed" style={{ color: B.muted, maxWidth: 420 }}>
          {nights <= 0
            ? "هذه الباقة بلا ليالٍ، فلا فندق يُحجز ولا غرف تُوزَّع."
            : h.transportOnly.stays > 0
              ? `كل الحجوزات القائمة (${arCount(h.transportOnly.stays, AR.stay)}) مواصلاتٌ فقط.`
              : "يظهر الحاجزون هنا فور وصول أول حجزٍ بسكن."}
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Tally value={h.totals.persons} label="نزلاء" fg={B.gold} />
        <Tally value={h.totals.stays} label="حجوزات" />
        <Tally value={h.totals.privateRooms} label="غرف خاصة" />
        <Tally value={h.totals.sharedBeds} label="أسرّة في سكن مشترك" />
      </div>

      {h.groups.map(g => (
        <div key={g.hotelId} className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: `1px solid ${B.border}` }}>
          {/* الملخّص فوق الفندق — يُقرأ قبل الأسماء: كم نزيلاً، كم حجزاً،
              وكم غرفةً من كل نوع. وهو ما يُبنى عليه التسكين. */}
          <div className="px-4 py-3 flex flex-col gap-2" style={{ background: B.cream, borderBottom: `1px solid ${B.border}` }}>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="inline-flex items-center gap-1.5 font-extrabold" style={{ color: B.black, fontSize: 14 }}>
                <BedDouble size={14} style={{ color: B.gold }} />{g.hotelName || "—"}
              </span>
              {g.city && <span className="px-2 py-0.5 rounded-lg font-bold" style={{ background: "#fff", border: `1px solid ${B.border}`, color: B.text2, fontSize: 11 }}>{g.city}</span>}
              <span className="font-bold" style={{ color: B.text2, fontSize: 12.5 }}>
                {arCount(g.persons, AR.person)} · {arCount(g.stays, AR.stay)}
              </span>
            </div>
            {(g.needs.length > 0 || g.undetailed > 0) && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {g.needs.map(n => (
                  <span key={n.key} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg font-bold"
                    style={{
                      background: "#fff",
                      border: `1px solid ${n.kind === "shared" ? "#CFE7F2" : "#EDE0C2"}`,
                      color: n.kind === "shared" ? "#0E7CA8" : "#8A6A08", fontSize: 11,
                    }}>
                    {n.label}{n.kind === "private" ? ` ×${n.count}` : ""}
                  </span>
                ))}
                {/* حجزٌ بلا توزيع غرفٍ مسجَّل لا يدخل العدّ — ذكرُه يمنع
                    قراءة الاحتياج ناقصاً على أنه كامل. */}
                {g.undetailed > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg font-bold"
                    style={{ background: "#FEF6EF", border: "1px solid #F5D9BE", color: "#B4530C", fontSize: 11 }}>
                    <AlertTriangle size={10} />{g.undetailed} بلا توزيع غرف
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="tbl-hint items-center gap-1.5 px-4 py-2" style={{ background: B.fill, borderBottom: `1px solid ${B.border}`, color: B.muted, fontSize: 11 }}>
            <ArrowRight size={11} />مرّر الجدول أفقياً لرؤية بقية الأعمدة
          </div>
          <div className="tbl-scroll">
            <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#fff", color: "#7a7168", fontSize: 12, borderBottom: `1px solid ${B.border}` }}>
                  {STAY_COLS.map(c => <th key={c} style={{ ...TH, textAlign: c === "إجمالي الأشخاص" ? "center" : "right" }}
                    className={c === "الطلب" ? "col-action" : undefined}>{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {g.rows.map(s => <StayRow key={s.bookingId} s={s} onOpen={onOpenBooking} />)}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {h.transportOnly.stays > 0 && (
        <div className="rounded-2xl px-4 py-3 flex items-center gap-2 flex-wrap" style={{ background: B.fill, border: `1px dashed ${B.border}` }}>
          <Bus size={13} style={{ color: B.muted }} />
          <span style={{ fontSize: 12.5, color: B.text2 }}>
            <b style={{ color: B.black }}>{arCount(h.transportOnly.stays, AR.stay)}</b> ({arCount(h.transportOnly.persons, AR.person)}) مواصلاتٌ فقط — في الحافلة ولا سكن لهم.
          </span>
        </div>
      )}
    </div>
  );
}

/* ════════ الشاشة ════════ */
export function SeatManifest({ trip, pkg, vehicle, branch, hotelName, hotelFor, bookings, onBack }: {
  trip: Trip; pkg?: Pkg; vehicle?: Transport; branch?: Branch; hotelName: string;
  /** فندق كل حجز — يُمرَّر لأن الأسماء في المخزن والاشتقاق لا يقرؤه. */
  hotelFor: (b: Booking) => HotelRef;
  bookings: Booking[]; onBack: () => void;
}) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = tabOf(params.get("sheet"));
  const setTab = (t: Tab) => {
    const next = new URLSearchParams(params);
    if (t === "seats") next.delete("sheet"); else next.set("sheet", t);
    setParams(next, { replace: true });
  };
  /* الاشتقاق مربوطٌ بالحجوزات وحدها: أي تغيّر في مقعدٍ أو غرفةٍ أو إلغاءٍ
     يعيد بناء الكشفين وورقتَي الطباعة معاً في الرسمة نفسها. */
  const m = useMemo(() => buildManifest(trip, bookings), [trip, bookings]);
  const housing = useMemo(() => buildHousing(trip, bookings, hotelFor), [trip, bookings, hotelFor]);
  const nights = pkg?.nights ?? 0;
  const s = m.summary;
  const openBooking = (id: string) => navigate(`/admin/bookings?open=${encodeURIComponent(id)}`);

  const pkgName = pkg?.name ?? "—";
  const city = trip.departureCity || branch?.city || "—";
  const bus = vehicle ? `${vehicle.name}${vehicle.plate ? ` — ${vehicle.plate}` : ""}` : (trip.busPlate || "—");
  const drivers = trip.drivers.filter(d => (d.name || "").trim());
  const printedAt = new Date().toLocaleString("ar-SA-u-nu-latn", { dateStyle: "short", timeStyle: "short" });

  const TABS: [Tab, string, typeof ClipboardList][] = [
    ["seats", "كشف المقاعد", ClipboardList],
    ["croquis", "كروكي الباص", LayoutGrid],
    ["housing", "كشف السكن", BedDouble],
  ];

  return (
    <div className="flex-1 flex flex-col min-w-0" style={{ background: B.bg }}>
      <style>{PRINT_CSS}</style>

      <div className="px-4 md:px-8 pt-5 flex flex-col gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={onBack} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold cursor-pointer"
            style={{ background: "#fff", border: `1px solid ${B.border}`, color: B.text3, fontSize: 12.5 }}>
            <ArrowRight size={13} />كل الكشوفات
          </button>
          <StatusBadge status={tripBoardState(trip)} entity="trip" />
          <span style={{ fontSize: 12, color: B.muted }}>{untilLabel(trip)}</span>
          {/* ما يُطبع هو ورقة التبويب المفتوح: ورقة الحافلة للمشرف،
              وورقة السكن للفندق. ولا زرٌّ يطبع الاثنتين معاً — فيه تسليمُ
              الفندق هوياتِ الركّاب ومقاعدَهم بلا حاجة. */}
          <button onClick={() => window.print()} className="ms-auto inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold cursor-pointer"
            title={tab === "housing" ? "ورقة للفندق: الحاجزون وغرفهم — بلا هويات ولا مقاعد" : "ورقتان: كشف المقاعد ثم كروكي الباص"}
            style={{ background: B.gold, color: B.black, border: "none", fontSize: 13, boxShadow: "0 4px 12px rgba(192,134,44,0.35)" }}>
            <Printer size={15} />{tab === "housing" ? "طباعة كشف السكن" : "طباعة الكشف والكروكي"}
          </button>
        </div>

        {/* ترويسة الإطلاقة — هويّتها كاملةً في لوحٍ واحد، فلا يُسأل عنها
            في شاشةٍ أخرى وأنت واقفٌ عند الحافلة. */}
        <div className="rounded-2xl overflow-hidden" style={{ background: B.primaryDeep }}>
          <div style={{ height: 3, background: `linear-gradient(90deg,${B.gold},${B.gold2},${B.gold})` }} />
          <div className="px-5 py-4 flex flex-col gap-4">
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <h2 className="font-extrabold text-white m-0" style={{ fontSize: 18, fontFamily: "var(--font-app)" }}>{pkgName}</h2>
              <span style={{ fontSize: 11.5, color: "#9DBAB6", direction: "ltr" }}>{trip.id}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-x-5 gap-y-3.5">
              <Fact Icon={CalendarDays} label="التاريخ" value={`${dayName(trip.departureDate)} ${shortDate(trip.departureDate)}`} />
              <Fact Icon={Clock} label="وقت الانطلاق" value={trip.departureTime || "—"} ltr />
              <Fact Icon={MapPin} label="مدينة الانطلاق" value={city} />
              <Fact Icon={Bus} label="الباص" value={bus} />
              <Fact Icon={MapPin} label="نقطة الانطلاق" value={trip.departurePoint || branch?.name || "—"} />
              <Fact Icon={User} label={drivers.length > 1 ? "السائقون" : "السائق"} value={drivers.map(d => d.name).join(" · ") || "—"} />
              <Fact Icon={Phone} label="جوال السائق" value={drivers.map(d => d.phone).filter(Boolean).join(" · ") || "—"} ltr />
              <Fact Icon={BedDouble} label="الفندق" value={hotelName || "—"} />
              <Fact Icon={Users} label="الركّاب" value={`${s.seated} من ${s.capacity}`} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
          <Tally value={s.seated} label="على مقاعدهم" fg={B.gold} />
          <Tally value={s.male} label="ذكور" fg={TONE.male.fg} bg={TONE.male.bg} bd={TONE.male.bd} />
          <Tally value={s.female} label="إناث" fg={TONE.female.fg} bg={TONE.female.bg} bd={TONE.female.bd} />
          <Tally value={s.children} label="أطفال" fg="#8A6A08" />
          <Tally value={s.free} label="مقاعد شاغرة" fg={s.free > 0 ? "#1E7A44" : "#BE2626"} />
          <Tally value={s.unseated} label="بلا مقعد" fg={s.unseated > 0 ? "#B4530C" : B.text3}
            bg={s.unseated > 0 ? "#FEF6EF" : "#fff"} bd={s.unseated > 0 ? "#F5D9BE" : B.border} />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {TABS.map(([k, label, Icon]) => {
            const on = tab === k;
            return (
              <button key={k} onClick={() => setTab(k)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold cursor-pointer"
                style={{
                  background: on ? B.gold : "#fff", color: on ? B.black : B.text2,
                  border: `1px solid ${on ? B.gold : B.border}`, fontSize: 12.5,
                }}>
                <Icon size={13} />{label}
                {k === "housing" && housing.totals.stays > 0 && (
                  <span className="px-1.5 rounded-md" style={{ background: on ? "rgba(27,23,18,.12)" : B.fill, color: on ? B.black : B.muted, fontSize: 10 }}>
                    {housing.totals.stays}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <main className="flex-1 px-4 md:px-8 pb-12 pt-4">
        {tab === "seats" && <SeatSheet m={m} onOpenBooking={openBooking} />}
        {tab === "croquis" && <Croquis m={m} onOpenBooking={openBooking} />}
        {tab === "housing" && <HousingSheet h={housing} nights={nights} onOpenBooking={openBooking} />}
      </main>

      <PrintFrame>
        {tab === "housing"
          ? <HousingPrintPage h={housing} trip={trip} pkgName={pkgName} nights={nights} printedAt={printedAt} />
          : <TripPrintPages m={m} pkgName={pkgName} vehicle={vehicle} branch={branch} printedAt={printedAt} />}
      </PrintFrame>
    </div>
  );
}
