/* كشف إطلاقةٍ واحدة — الجدول والكروكي ووجهتهما إلى الورق.

   ── ليسا نظامين ──
   الجدول يُقرأ بالاسم والكروكي يُقرأ بالموضع، وكلاهما `Manifest` واحد
   بُني من الحجوزات. فنقلُ معتمرٍ من المقعد ١٢ إلى ١٨ ليس «تحديثاً
   للكشف» ثم «تحديثاً للكروكي»: هو تعديلٌ واحد في الحجز، وما على هذه
   الشاشة يُعاد اشتقاقه منه في الرسمة التالية.

   ── ولا تُعدَّل المقاعد من هنا ──
   التخصيص يمرّ بـ`accept_booking` في معاملةٍ واحدة تحرس السعة والازدواج
   (ترحيل 20260910)، وشاشة الطلب هي بابه. فزرّ المقعد هنا يفتح الطلب ولا
   يكتب مقعداً: بابان للكتابة يعنيان حارسَين، وأحدهما سيتخلّف.

   ── السائقون استثناءٌ مقصود ──
   هم الشيء الوحيد الذي يُكتب من الكشف، ومن هنا وحده: السائق بالتعاقد
   ويُعرف أيام الانطلاق لا يوم فتح الحجز، ومكانه الطبيعي بجوار ورقة
   الحافلة التي يُسلَّمها. نموذج الرحلة لم يعد يحمله، فالباب واحد. */
import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate, useSearchParams } from "react-router";
import {
  ArrowRight, ArrowUp, Printer, Bus, Users, AlertTriangle, ClipboardList,
  BedDouble, ExternalLink, IdCard, Plus, Trash2, Check, MoveHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { B, TONE } from "@/lib/theme";
import type { Booking, Branch, Pkg, Transport, Trip, TripDriver } from "@/types";
import { shortDate, tripBoardState, untilLabel } from "@/lib/trip";
import { fmtDayDate, fmtTime } from "@/lib/dates";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/States";
import { Field } from "@/components/Field";
import { TabStrip, TabPanel, type TabDef } from "@/components/Tabs";
import { Badge, Button, IconButton, Note, Segmented } from "@/components/ui";
import { firstTwo, uid } from "@/lib/utils";
import { useStore } from "@/store/useStore";
import { useRole } from "@/lib/useRole";
import { useUnsavedGuard, confirmLeave } from "@/lib/useUnsavedGuard";
import { arCount } from "@/features/customer/plural";
import {
  AR, busManifests, buildHousing, croquisRows, partyLabel, DOC_LABEL,
  type CroquisSeat, type HotelRef, type HousingManifest, type HousingStay, type Manifest, type ManifestRider,
} from "@/lib/manifest";
import { busCountOf, busesLabel, seatsLabel, seatsPerBus } from "@/lib/buses";
import { PrintFrame, TripPrintPages, HousingPrintPage, PRINT_CSS } from "./PrintSheet";

/* ألوان الجنس — نفس درجات شاشة اختيار المقاعد. المعنى واحدٌ في
   الشاشتين، فاختلاف الدرجة بينهما يجعل الموظف يتعلّم مفتاحين.
   الذكر من ألوان المعنى (info)؛ والأنثى ومقعد الخصوصية لا رمز لهما في
   اللوحة بعد، فدرجتاهما هنا في موضعٍ واحد. واللون ليس الدليل الوحيد:
   الجنس مكتوبٌ نصّاً بجانبه دائماً. */
const GENDER = {
  male:   { bg: TONE.info.bg, bd: TONE.info.line, fg: TONE.info.fg, label: "ذكر" },
  female: { bg: "#FBE9F1", bd: "#F3CADF", fg: "#B4266E", label: "أنثى" },
} as const;
const PRIVACY = { bg: "#F3EAFE", bd: "#D9C4F3", fg: "#6F3AA8" } as const;

function GenderBadge({ g }: { g: "male" | "female" }) {
  return <Badge style={{ background: GENDER[g].bg, color: GENDER[g].fg }}>{GENDER[g].label}</Badge>;
}

/* الورقة المفتوحة في المسار لا في الحالة: «أرسل لي كشف سكن رحلة
   الأربعاء» يصير رابطاً يُلصق، ويعود زرّ الرجوع ورقةً لا يخرج من الكشف. */
type Tab = "seats" | "croquis" | "drivers" | "housing";
const TABS_ORDER: Tab[] = ["seats", "croquis", "drivers", "housing"];
const tabOf = (v: string | null): Tab => (TABS_ORDER as string[]).includes(v ?? "") ? (v as Tab) : "seats";

/* ════════ معلومة في ترويسة الكشف ════════
   مفتاحٌ وقيمة فوق السطح الداكن — بلا مربّع أيقونةٍ لكل معلومة: تسعُ
   أيقوناتٍ ذهبية كانت تزاحم القيم التي جيء لقراءتها. */
function Fact({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="min-w-0">
      <div style={{ fontSize: 12, color: B.onInk2, lineHeight: 1.4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: B.onInk, lineHeight: 1.6, marginTop: 2, overflowWrap: "anywhere" }}>
        {ltr && value ? <span dir="ltr" style={{ unicodeBidi: "isolate" }}>{value}</span> : value || "—"}
      </div>
    </div>
  );
}

/* ════════ شريط العدّادات ════════
   أرقامٌ هادئة في شريطٍ واحد تفصلها خيوط: الرقم أسود ويُحمَّر وحده ما
   يستدعي عملاً (بلا مقعد). ونقطة اللون أمام «ذكور/إناث» مفتاحُ الكروكي. */
type TallyItem = { value: number | string; label: string; alert?: boolean; swatch?: string };
function Tallies({ items, cols }: { items: TallyItem[]; cols: string }) {
  return (
    <div className="ui-card overflow-hidden">
      <div className={`grid ${cols}`} style={{ gap: 1, background: B.border }}>
        {items.map(it => (
          <div key={it.label} style={{ background: B.surface, padding: "12px 16px" }}>
            <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2, color: it.alert ? TONE.danger.fg : B.black }}>{it.value}</div>
            <div className="flex items-center gap-1.5" style={{ fontSize: 12, color: B.muted, marginTop: 3 }}>
              {it.swatch && <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: it.swatch, flexShrink: 0 }} />}
              {it.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** تلميح التمرير الأفقي — يظهر على الجوال وحده (tbl-hint). */
function ScrollHint() {
  return (
    <div className="tbl-hint items-center gap-1.5 px-4 py-2" style={{ background: B.fill, borderBottom: `1px solid ${B.border}`, color: B.muted, fontSize: 12 }}>
      <MoveHorizontal size={14} />مرّر الجدول أفقياً لرؤية بقية الأعمدة
    </div>
  );
}

function OpenBooking({ id, onOpen }: { id: string; onOpen: (id: string) => void }) {
  return (
    <div className="row-actions">
      <IconButton size="sm" label={`فتح الطلب ${id}`} onClick={() => onOpen(id)}><ExternalLink size={15} /></IconButton>
    </div>
  );
}

/* ════════ الكروكي على الشاشة ════════
   نفس هندسة `buildBusRows` التي تُرسم بها شاشة اختيار المقاعد — شكلٌ
   واحد للحافلة في كل مكان. والفرق أن هذه تقرأ ولا تكتب: الضغط يفتح
   الطلب صاحب المقعد. */
function Swatch({ bg, bd, label, n }: { bg: string; bd: string; label: string; n?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5" style={{ fontSize: 12, color: B.text2 }}>
      <span aria-hidden style={{ width: 14, height: 14, borderRadius: 4, background: bg, border: `1px solid ${bd}`, flexShrink: 0 }} />
      {label}{n != null && <b style={{ color: B.black, fontWeight: 600 }}>{n}</b>}
    </span>
  );
}

function Croquis({ m, onOpenBooking }: { m: Manifest; onOpenBooking: (id: string) => void }) {
  const rows = croquisRows(m);
  return (
    <div className="ui-card overflow-hidden">
      <div className="ui-card-head flex-wrap">
        <div>
          <h3 className="ui-card-title">كروكي {m.bus != null ? `الباص ${m.bus}` : "الحافلة"}</h3>
          <div className="ui-card-sub">اضغط مقعداً مشغولاً لفتح طلبه.</div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <Swatch bg={GENDER.male.bg} bd={GENDER.male.bd} label={GENDER.male.label} n={m.summary.male} />
          <Swatch bg={GENDER.female.bg} bd={GENDER.female.bd} label={GENDER.female.label} n={m.summary.female} />
          <Swatch bg={B.surface} bd={B.borderStrong} label="شاغر" n={m.summary.free} />
          <Swatch bg={PRIVACY.bg} bd={PRIVACY.bd} label="مفرّغ للخصوصية" />
        </div>
      </div>
      <div className="p-4 md:p-6">
        <div className="ui-table-scroll">
          <div className="flex flex-col gap-2 items-center" style={{ minWidth: 520, paddingBottom: 4 }}>
            <span className="inline-flex items-center gap-1.5"
              style={{ height: 28, padding: "0 12px", borderRadius: 999, background: B.fill, border: `1px solid ${B.border}`, color: B.text2, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
              <ArrowUp size={14} />مقدمة {m.bus != null ? `الباص ${m.bus}` : "الحافلة"} · السائق
            </span>
            {rows.map((row, ri) => (
              <div key={ri} className="flex gap-2 items-stretch justify-center">
                {row.length === 4
                  ? <>
                      <Seat s={row[0]} onOpen={onOpenBooking} /><Seat s={row[1]} onOpen={onOpenBooking} />
                      <div className="flex items-center justify-center" style={{ width: 30 }}>
                        <span style={{ fontSize: 12, color: B.muted }}>{ri + 1}</span>
                      </div>
                      <Seat s={row[2]} onOpen={onOpenBooking} /><Seat s={row[3]} onOpen={onOpenBooking} />
                    </>
                  : row.map(s => <Seat key={s.num} s={s} onOpen={onOpenBooking} />)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Seat({ s, onOpen }: { s: CroquisSeat; onOpen: (id: string) => void }) {
  const r = s.rider;
  const tone = r ? GENDER[r.gender] : null;
  const body = (
    <>
      <span className="flex items-center justify-between gap-1 w-full" style={{ lineHeight: 1.3 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: tone?.fg ?? B.muted }}>{s.label}</span>
        {r && <span style={{ fontSize: 12, fontWeight: 600, color: tone!.fg }}>{tone!.label}</span>}
        {s.privacy && <span style={{ fontSize: 12, fontWeight: 600, color: PRIVACY.fg }}>خصوصية</span>}
      </span>
      {r && <>
        <span className="block w-full truncate" style={{ fontSize: 12, fontWeight: 600, color: B.black, marginTop: 3 }}>{firstTwo(r.name)}</span>
        <span dir="ltr" className="block w-full truncate" style={{ fontSize: 12, color: B.text2, textAlign: "end" }}>{r.phone || r.contactPhone || "—"}</span>
      </>}
    </>
  );
  const box: React.CSSProperties = {
    width: 92, minHeight: 64, padding: "6px 7px", borderRadius: 10, fontFamily: "var(--font-app)",
    border: `1px solid ${s.privacy ? PRIVACY.bd : tone?.bd ?? B.border}`, background: s.privacy ? PRIVACY.bg : tone?.bg ?? B.surface,
    display: "flex", flexDirection: "column", alignItems: "flex-start", textAlign: "start",
  };
  if (!r) return <span style={box}>{body}</span>;
  const what = `${r.name} · ${tone!.label} · مقعد ${s.label} · ${r.bookingId}`;
  return (
    <button type="button" onClick={() => onOpen(r.bookingId)} style={{ ...box, cursor: "pointer" }} title={what} aria-label={what}>
      {body}
    </button>
  );
}

/* ════════ جدول الكشف ════════ */
function RiderRow({ r, onOpen }: { r: ManifestRider; onOpen: (id: string) => void }) {
  const tone = GENDER[r.gender];
  return (
    <tr>
      <td>
        <span className="inline-flex items-center justify-center"
          style={{ minWidth: 36, height: 28, padding: "0 8px", borderRadius: 8, background: tone.bg, color: tone.fg, fontSize: 14, fontWeight: 700 }}>
          {r.busSeat ?? r.seat}
        </span>
      </td>
      <td style={{ minWidth: 190 }}>
        <div className="cell-main flex items-center gap-2 flex-wrap">{r.name || "—"}{r.ageGroup === "child" && <Badge tone="warn">طفل</Badge>}</div>
        <div className="cell-sub">{partyLabel(r) ? `${r.clientName} · ${partyLabel(r)}` : r.clientName}</div>
      </td>
      <td><GenderBadge g={r.gender} /></td>
      <td className="nowrap">
        <div><span className="num" style={{ color: B.text3 }}>{r.idNumber || "—"}</span></div>
        {r.docType && <div className="cell-sub">{DOC_LABEL[r.docType]}</div>}
      </td>
      <td className="nowrap" style={{ color: B.text2 }}>{r.nationality || "—"}</td>
      <td className="nowrap">
        <div><span className="num" style={{ color: B.text2 }}>{r.phone || r.contactPhone || "—"}</span></div>
        {!r.phone && r.contactPhone && <div className="cell-sub">جوال صاحب الحجز</div>}
      </td>
      <td className="nowrap"><span className="num" style={{ color: B.text3 }}>{r.bookingId}</span></td>
      <td><StatusBadge status={r.status} entity="booking" /></td>
      <td className="col-action"><OpenBooking id={r.bookingId} onOpen={onOpen} /></td>
    </tr>
  );
}

function SeatSheet({ m, onOpenBooking }: { m: Manifest; onOpenBooking: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-4">
      {m.riders.length === 0
        ? <EmptyState icon={<ClipboardList size={22} />}
            title={m.bus != null ? `لا مقاعد مخصَّصة في الباص ${m.bus} بعد` : "لا مقاعد مخصَّصة على هذه الإطلاقة بعد"}
            note="المقعد يُخصَّص من شاشة الطلب، ويظهر صاحبه هنا فور تخصيصه." />
        : (
          <div className="ui-table-wrap">
            <ScrollHint />
            <div className="ui-table-scroll">
              <table className="ui-table" style={{ minWidth: 920 }}>
                <thead>
                  <tr>
                    <th>المقعد</th><th>الاسم</th><th>الجنس</th><th>الوثيقة</th><th>الجنسية</th><th>الجوال</th><th>الحجز</th><th>حالة الحجز</th>
                    <th className="col-action"><span className="sr-only">الطلب</span></th>
                  </tr>
                </thead>
                <tbody>
                  {m.riders.map(r => <RiderRow key={`${r.bookingId}-${r.seat}`} r={r} onOpen={onOpenBooking} />)}
                </tbody>
              </table>
            </div>
          </div>
        )}

      {/* بانتظار التخصيص — داخل الكشف لا خارجه: هو عملٌ على هذه
          الإطلاقة، وإخفاؤه يجعل الكشف يبدو مكتملاً وفي الطلبات مَن ينتظر. */}
      {m.waiting.length > 0 && (
        <div className="ui-card overflow-hidden">
          <div className="ui-card-head flex-wrap">
            <div>
              <h3 className="ui-card-title flex items-center gap-2"><AlertTriangle size={16} style={{ color: TONE.warn.fg }} />بانتظار تخصيص مقعد</h3>
              {m.bus != null && <div className="ui-card-sub">على الرحلة كلها — لم يُعيَّن لهم باص بعد.</div>}
            </div>
            <Badge tone="warn">{arCount(m.waiting.length, AR.pilgrim)}</Badge>
          </div>
          <div className="flex flex-col">
            {m.waiting.map((r, i) => (
              <div key={`${r.bookingId}-${i}`} className="flex items-center gap-x-3 gap-y-2 px-5 py-3 flex-wrap" style={{ borderTop: i ? `1px solid ${B.border}` : "none" }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: B.black }}>{r.name || "—"}</span>
                <GenderBadge g={r.gender} />
                <span dir="ltr" style={{ fontSize: 13, color: B.muted }}>{r.idNumber || "—"}</span>
                <StatusBadge status={r.status} entity="booking" />
                {/* زرّ الصفّ ثانويّ: الذهبي لفعلٍ واحد في المشهد، وهذا يتكرّر بعدد المنتظرين. */}
                <Button size="sm" variant="secondary" className="ms-auto" icon={<ExternalLink size={14} />} onClick={() => onOpenBooking(r.bookingId)}>تخصيص من الطلب</Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* مقاعد متفرّقة — تنبيهٌ لا تعطيه الورقة المنسوخة: أربعةٌ في حجزٍ
          واحد على مقاعد ٣ و٧ و١٨ ليسوا جالسين معاً. */}
      {m.summary.scattered > 0 && (
        <Note tone="warn" icon={<Users size={16} />}>
          <div style={{ fontWeight: 600 }}>{arCount(m.summary.scattered, AR.stay)} {m.summary.scattered === 1 ? "مقاعده متفرّقة" : "مقاعدها متفرّقة"}</div>
          <div className="flex flex-wrap gap-2 mt-2">
            {m.parties.filter(p => !p.unseated && !p.contiguous).map(p => (
              <Button key={p.bookingId} size="sm" variant="secondary" onClick={() => onOpenBooking(p.bookingId)}>
                {p.clientName || p.bookingId}
                <span style={{ color: B.muted, fontWeight: 500 }}>{seatsLabel(m.trip, p.seats)}</span>
              </Button>
            ))}
          </div>
        </Note>
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

function RoomLines({ s }: { s: HousingStay }) {
  if (!s.rooms.length) {
    return <span style={{ color: B.muted, fontSize: 13 }}>{s.roomText || "لم يُحدَّد"}</span>;
  }
  return (
    <span className="flex flex-col gap-1.5 items-start">
      {s.rooms.map(r => (
        <span key={r.key} className="inline-flex items-center gap-2 flex-wrap">
          <Badge tone={r.kind === "shared" ? "info" : "neutral"}>
            <BedDouble size={12} />{r.label}{r.kind === "private" && r.count > 1 ? ` ×${r.count}` : ""}
          </Badge>
          {r.note && <span style={{ fontSize: 12, color: B.muted }}>{r.note}</span>}
        </span>
      ))}
    </span>
  );
}

function StayRow({ s, onOpen }: { s: HousingStay; onOpen: (id: string) => void }) {
  return (
    <tr>
      <td style={{ minWidth: 170 }}>
        <div className="cell-main">{s.lead}</div>
        {s.contactPhone && <div className="cell-sub num">{s.contactPhone}</div>}
      </td>
      <td style={{ textAlign: "center", fontWeight: 600 }}>{s.persons}</td>
      <td style={{ minWidth: 200 }}><RoomLines s={s} /></td>
      <td className="nowrap"><span className="num" style={{ color: B.text3 }}>{s.bookingId}</span></td>
      <td><StatusBadge status={s.status} entity="booking" /></td>
      <td className="col-action"><OpenBooking id={s.bookingId} onOpen={onOpen} /></td>
    </tr>
  );
}

function HousingSheet({ h, nights, onOpenBooking }: {
  h: HousingManifest; nights: number; onOpenBooking: (id: string) => void;
}) {
  if (h.groups.length === 0) {
    return (
      <EmptyState icon={<BedDouble size={22} />}
        title={nights <= 0 ? "باقة مواصلات فقط — لا سكن" : "لا نزلاء على هذه الإطلاقة بعد"}
        note={nights <= 0
          ? "هذه الباقة بلا ليالٍ، فلا فندق يُحجز ولا غرف تُوزَّع."
          : h.transportOnly.stays > 0
            ? `كل الحجوزات القائمة (${arCount(h.transportOnly.stays, AR.stay)}) مواصلاتٌ فقط.`
            : "يظهر الحاجزون هنا فور وصول أول حجزٍ بسكن."} />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <Tallies cols="grid-cols-2 sm:grid-cols-4" items={[
        { value: h.totals.persons, label: "نزلاء" },
        { value: h.totals.stays, label: "حجوزات" },
        { value: h.totals.privateRooms, label: "غرف خاصة" },
        { value: h.totals.sharedBeds, label: "أسرّة في سكن مشترك" },
      ]} />

      {h.groups.map(g => (
        <div key={g.hotelId} className="ui-table-wrap">
          {/* الملخّص فوق الفندق — يُقرأ قبل الأسماء: كم نزيلاً، كم حجزاً،
              وكم غرفةً من كل نوع. وهو ما يُبنى عليه التسكين. */}
          <div className="px-4 md:px-5 py-4 flex flex-col gap-3" style={{ borderBottom: `1px solid ${B.border}` }}>
            <div className="flex items-center gap-x-2.5 gap-y-1 flex-wrap">
              <BedDouble size={18} style={{ color: B.muted }} />
              <h3 className="ui-card-title">{g.hotelName || "—"}</h3>
              {g.city && <Badge tone="neutral">{g.city}</Badge>}
              <span className="ms-auto" style={{ fontSize: 13, color: B.muted }}>
                {arCount(g.persons, AR.person)} · {arCount(g.stays, AR.stay)}
              </span>
            </div>
            {(g.needs.length > 0 || g.undetailed > 0) && (
              <div className="flex items-center gap-2 flex-wrap">
                <span style={{ fontSize: 12, color: B.muted }}>الاحتياج</span>
                {g.needs.map(n => (
                  <Badge key={n.key} tone={n.kind === "shared" ? "info" : "neutral"} outline>
                    {n.label}{n.kind === "private" ? ` ×${n.count}` : ""}
                  </Badge>
                ))}
                {/* حجزٌ بلا توزيع غرفٍ مسجَّل لا يدخل العدّ — ذكرُه يمنع
                    قراءة الاحتياج ناقصاً على أنه كامل. */}
                {g.undetailed > 0 && <Badge tone="warn"><AlertTriangle size={12} />{g.undetailed} بلا توزيع غرف</Badge>}
              </div>
            )}
          </div>

          <ScrollHint />
          <div className="ui-table-scroll">
            <table className="ui-table" style={{ minWidth: 760 }}>
              <thead>
                <tr>
                  <th>اسم الحاجز</th><th style={{ textAlign: "center" }}>إجمالي الأشخاص</th><th>نوع السكن</th><th>الحجز</th><th>حالة الحجز</th>
                  <th className="col-action"><span className="sr-only">الطلب</span></th>
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
        <Note tone="neutral" icon={<Bus size={16} />}>
          <b style={{ color: B.black, fontWeight: 600 }}>{arCount(h.transportOnly.stays, AR.stay)}</b> ({arCount(h.transportOnly.persons, AR.person)}) مواصلاتٌ فقط — في الحافلة ولا سكن لهم.
        </Note>
      )}
    </div>
  );
}

/* ════════ السائقون ════════

   اختياريٌّ كلّه: لا حقلٌ مطلوب ولا صيغةُ جوالٍ مفروضة — بيانات المتعهّد
   لا تملكها تساهيل (قرار يوسف)، والمطلوب اسمٌ ورقمٌ يُتّصل به عند
   الحافلة. وسطرٌ فارغ لا يُحفظ سائقاً. */
const blankDriver = (): TripDriver => ({ id: uid(), name: "", phone: "" });
const keptDrivers = (ds: TripDriver[]): TripDriver[] =>
  ds.map(d => ({ ...d, name: (d.name || "").trim(), phone: (d.phone || "").trim() })).filter(d => d.name || d.phone);
/* المقارنة بالمضمون لا بالمعرّف: ما يعود من القاعدة بعد الحفظ قد يحمل
   معرّفاتٍ أخرى للسائقين أنفسهم، ولا يجعل ذلك المسوّدة «غير محفوظة». */
const driversKey = (ds: TripDriver[]) => JSON.stringify(keptDrivers(ds).map(d => [d.name, d.phone]));
const draftOf = (ds: TripDriver[]): TripDriver[] => ds.length ? ds.map(d => ({ ...d, name: d.name || "", phone: d.phone || "" })) : [blankDriver()];

function DriverIndex({ n }: { n: number }) {
  return (
    <span aria-hidden className="flex items-center justify-center flex-shrink-0"
      style={{ width: 28, height: 28, borderRadius: 999, background: B.fill, border: `1px solid ${B.border}`, color: B.text3, fontSize: 13, fontWeight: 600 }}>{n}</span>
  );
}

function DriversSheet({ draft, setDraft, saved, editable, dirty, onSave, onReset }: {
  draft: TripDriver[]; setDraft: (d: TripDriver[]) => void; saved: TripDriver[];
  editable: boolean; dirty: boolean; onSave: () => void; onReset: () => void;
}) {
  const upd = (id: string, field: "name" | "phone", v: string) => setDraft(draft.map(d => d.id === id ? { ...d, [field]: v } : d));
  const del = (id: string) => { const n = draft.filter(d => d.id !== id); setDraft(n.length ? n : [blankDriver()]); };

  if (!editable) {
    const list = keptDrivers(saved);
    return (
      <div className="ui-card overflow-hidden" style={{ maxWidth: 760 }}>
        <div className="ui-card-head">
          <div>
            <h3 className="ui-card-title">سائقو الإطلاقة</h3>
            <div className="ui-card-sub">للقراءة فقط.</div>
          </div>
        </div>
        {list.length === 0
          ? <EmptyState compact icon={<IdCard size={22} />} title="لم يُسجَّل سائقٌ لهذه الإطلاقة" />
          : list.map((d, i) => (
              <div key={d.id} className="flex items-center gap-3 px-5 py-3" style={{ borderTop: i ? `1px solid ${B.border}` : "none" }}>
                <DriverIndex n={i + 1} />
                <span className="flex-1 min-w-0" style={{ fontSize: 14, fontWeight: 600, color: B.black }}>{d.name || "—"}</span>
                <span dir="ltr" style={{ fontSize: 14, color: B.text2 }}>{d.phone || "—"}</span>
              </div>
            ))}
      </div>
    );
  }

  return (
    <div className="ui-card overflow-hidden" style={{ maxWidth: 760 }}>
      <div className="ui-card-head flex-wrap">
        <div>
          <h3 className="ui-card-title">سائقو الإطلاقة</h3>
          <div className="ui-card-sub">اختياري — السائق بالتعاقد، ويُكتب حين يُعرف.</div>
        </div>
        {dirty && <Badge tone="warn" dot>تغييرات لم تُحفظ</Badge>}
      </div>
      <div className="flex flex-col gap-4 p-4 md:p-5">
        {draft.map((d, i) => (
          <div key={d.id} className="flex items-end gap-3 flex-wrap">
            <div style={{ paddingBottom: 7 }}><DriverIndex n={i + 1} /></div>
            <div className="flex-1" style={{ minWidth: 180 }}>
              <Field label="اسم السائق">
                <input aria-label={`اسم السائق ${i + 1}`} className="ui-input"
                  value={d.name} placeholder="اسم السائق" onChange={e => upd(d.id, "name", e.target.value)} />
              </Field>
            </div>
            <div className="flex-1" style={{ minWidth: 160, maxWidth: 220 }}>
              <Field label="الجوال">
                <input aria-label={`جوال السائق ${i + 1}`} inputMode="tel" dir="ltr" className="ui-input"
                  value={d.phone} placeholder="+966 5x xxx xxxx" onChange={e => upd(d.id, "phone", e.target.value)} />
              </Field>
            </div>
            <div style={{ width: 36, paddingBottom: 3 }}>
              {(draft.length > 1 || d.name || d.phone) && (
                <IconButton variant="danger" label="حذف السائق" onClick={() => del(d.id)}><Trash2 size={16} /></IconButton>
              )}
            </div>
          </div>
        ))}
        <div>
          <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setDraft([...draft, blankDriver()])}>سائق آخر</Button>
        </div>
      </div>
      <div className="flex items-center gap-2.5 px-4 md:px-5 py-3.5 flex-wrap" style={{ borderTop: `1px solid ${B.border}`, background: B.bg }}>
        <Button variant="primary" icon={<Check size={16} />} disabled={!dirty} onClick={onSave}>حفظ السائقين</Button>
        {dirty && <Button variant="secondary" onClick={onReset}>تراجع</Button>}
        <span className="ms-auto" style={{ fontSize: 12, color: B.muted }}>يظهر في ترويسة الكشف وورقة الطباعة.</span>
      </div>
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
  /* الباص المفتوح في المسار كالورقة: «كشف باص ٢» رابطٌ يُرسل لمشرفه. */
  const buses = busCountOf(trip);
  const sheets = useMemo(() => busManifests(trip, bookings), [trip, bookings]);
  const busNo = Math.min(Math.max(1, Number(params.get("bus")) || 1), sheets.length);
  const setBus = (n: number) => {
    const next = new URLSearchParams(params);
    if (n === 1) next.delete("bus"); else next.set("bus", String(n));
    setParams(next, { replace: true });
  };
  const m = sheets[busNo - 1];
  /* طباعة كل الباصات: تُرسم أوراقها كلها قبل نداء الطباعة ثم تعود ورقة
     الباص المفتوح وحدها. */
  const [printAll, setPrintAll] = useState(false);
  const printEveryBus = () => {
    flushSync(() => setPrintAll(true));
    window.print();
    setPrintAll(false);
  };
  const housing = useMemo(() => buildHousing(trip, bookings, hotelFor), [trip, bookings, hotelFor]);
  const nights = pkg?.nights ?? 0;
  const s = m.summary;
  const openBooking = (id: string) => navigate(`/admin/bookings?open=${encodeURIComponent(id)}`);

  const pkgName = pkg?.name ?? "—";
  const city = trip.departureCity || branch?.city || "—";
  const busType = vehicle ? `${vehicle.name}${vehicle.plate && buses === 1 ? ` — ${vehicle.plate}` : ""}` : (trip.busPlate || "—");
  const bus = buses > 1 ? `${busType} · باص ${busNo} من ${buses}` : busType;
  const drivers = trip.drivers.filter(d => (d.name || "").trim());

  /* المسوّدة في الشاشة لا في التبويب: التنقّل بين الأوراق لا يمحو ما
     كُتب، والرجوع إلى كل الكشوفات يسأل قبل فقده. والرحلة التي انطلقت أو
     أُلغيت تُقرأ سائقوها ولا يُكتبون — كما في نافذة الرحلة. */
  const setTrips = useStore(st => st.setTrips);
  const { canWrite } = useRole();
  const boardState = tripBoardState(trip);
  const driversEditable = canWrite("trips") && boardState !== "ended" && boardState !== "cancelled" && boardState !== "archived";
  const [driverDraft, setDriverDraft] = useState<TripDriver[]>(() => draftOf(trip.drivers));
  const driversDirty = driversEditable && driversKey(driverDraft) !== driversKey(trip.drivers);
  useUnsavedGuard(driversDirty);
  function saveDrivers() {
    const next = keptDrivers(driverDraft);
    setTrips(p => p.map(t => t.id === trip.id ? { ...t, drivers: next } : t));
    setDriverDraft(draftOf(next));
    toast.success(next.length ? "حُفظ السائقون" : "أُزيل السائقون", { description: `${pkg?.name ?? trip.id} · ${shortDate(trip.departureDate)}` });
  }
  const savedDriverCount = keptDrivers(trip.drivers).length;
  const printedAt = new Date().toLocaleString("ar-SA-u-nu-latn", { dateStyle: "short", timeStyle: "short" });

  /* العدّ في نصّ التبويب: «السائقون · ٢». وعلامة المسوّدة غير المحفوظة
     شارةٌ تحت الشريط تبقى ظاهرةً من أي تبويب — المسوّدة في الشاشة لا فيه. */
  const TABS: TabDef<Tab>[] = [
    { id: "seats", label: "كشف المقاعد" },
    { id: "croquis", label: "كروكي الباص" },
    { id: "drivers", label: savedDriverCount > 0 ? `السائقون · ${savedDriverCount}` : "السائقون" },
    { id: "housing", label: housing.totals.stays > 0 ? `كشف السكن · ${housing.totals.stays}` : "كشف السكن" },
  ];
  const perBus = buses > 1 && tab !== "housing" && tab !== "drivers";
  /* على الجوال الشريط يُمرَّر: رابطٌ يفتح على «كشف السكن» كان يُظهر
     الشريط وتبويبه المحدَّد خلف الحافة. */
  useEffect(() => {
    document.getElementById(`manifest-tab-${tab}`)?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [tab]);
  const draftElsewhere = driversDirty && tab !== "drivers";
  /* الذهبي لفعلٍ واحد: الطباعة هي فعل هذه الشاشة، إلا في تبويب السائقين
     حيث الحفظ هو الفعل — فتهدأ الطباعة هناك. */
  const printPrimary = !(tab === "drivers" && driversEditable);

  return (
    <div className="flex-1 flex flex-col min-w-0" style={{ background: B.bg }}>
      <style>{PRINT_CSS}</style>

      <div className="px-4 md:px-8 pt-1 flex flex-col gap-4">
        {/* ترويسة الإطلاقة — هويّتها كاملةً في لوحٍ واحد، فلا يُسأل عنها
            في شاشةٍ أخرى وأنت واقفٌ عند الحافلة. سطحٌ أسود بخيطٍ ذهبيّ
            واحد، والرجوع والطباعة فيه. */}
        <div className="overflow-hidden" style={{ background: B.ink, borderRadius: 16 }}>
          <div aria-hidden style={{ height: 2, background: B.gold }} />
          <div className="px-4 md:px-6 pt-3 pb-5 flex flex-col gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              <button type="button" onClick={async () => { if (await confirmLeave(driversDirty)) onBack(); }}
                className="ui-iconbtn ui-iconbtn--on-ink"
                style={{ width: "auto", padding: "0 10px", gap: 6, marginInlineStart: -10, fontFamily: "var(--font-app)", fontSize: 13, fontWeight: 600 }}>
                <ArrowRight size={16} />كل الكشوفات
              </button>
              <span className="ms-auto flex items-center gap-2.5">
                <span style={{ fontSize: 13, color: B.onInk2 }}>{untilLabel(trip)}</span>
                <StatusBadge status={boardState} entity="trip" />
              </span>
            </div>

            <div className="flex items-end justify-between gap-x-6 gap-y-4 flex-wrap">
              <div className="min-w-0">
                <h2 className="m-0" style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.35, color: B.onInk }}>
                  {pkgName}{perBus ? ` – باص ${busNo}` : ""}
                </h2>
                <div dir="ltr" style={{ fontSize: 13, color: B.onInk2, textAlign: "end", marginTop: 2 }}>{trip.id}</div>
              </div>
              {/* ما يُطبع هو ورقة التبويب المفتوح: ورقة الحافلة للمشرف،
                  وورقة السكن للفندق. ولا زرٌّ يطبع الاثنتين معاً — فيه تسليمُ
                  الفندق هوياتِ الركّاب ومقاعدَهم بلا حاجة. */}
              <div className="flex gap-2 flex-wrap w-full sm:w-auto">
                {buses > 1 && tab !== "housing" && (
                  <Button variant="secondary" className="flex-1 sm:flex-none" icon={<Printer size={16} />} onClick={printEveryBus}
                    title={`ورقتان لكل باص: ${busesLabel(buses)}`}>طباعة كل الباصات</Button>
                )}
                <Button variant={printPrimary ? "primary" : "secondary"} className="flex-1 sm:flex-none" icon={<Printer size={16} />} onClick={() => window.print()}
                  title={tab === "housing" ? "ورقة للفندق: الحاجزون وغرفهم — بلا هويات ولا مقاعد" : "ورقتان: كشف المقاعد ثم كروكي الباص"}>
                  {tab === "housing" ? "طباعة كشف السكن" : buses > 1 ? `طباعة كشف الباص ${busNo}` : "طباعة الكشف والكروكي"}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-x-6 gap-y-4 pt-4" style={{ borderTop: `1px solid ${B.inkLine}` }}>
              <Fact label="التاريخ" value={fmtDayDate(trip.departureDate)} />
              <Fact label="وقت الانطلاق" value={fmtTime(trip.departureTime)} />
              <Fact label="مدينة الانطلاق" value={city} />
              <Fact label="نقطة الانطلاق" value={trip.departurePoint || branch?.name || "—"} />
              <Fact label="الباص" value={tab === "housing" || tab === "drivers" ? (buses > 1 ? `${busType} · ${busesLabel(buses)}` : busType) : bus} />
              <Fact label={drivers.length > 1 ? "السائقون" : "السائق"} value={drivers.map(d => d.name).join(" · ") || "—"} />
              <Fact label="جوال السائق" value={drivers.map(d => d.phone).filter(Boolean).join(" · ")} ltr />
              <Fact label="الفندق" value={hotelName || "—"} />
              <Fact label="الركّاب" value={`${s.seated} من ${s.capacity}`} />
            </div>
          </div>
        </div>

        <Tallies cols="grid-cols-3 lg:grid-cols-6" items={[
          { value: s.seated, label: "على مقاعدهم" },
          { value: s.male, label: "ذكور", swatch: GENDER.male.fg },
          { value: s.female, label: "إناث", swatch: GENDER.female.fg },
          { value: s.children, label: "أطفال" },
          { value: s.free, label: "مقاعد شاغرة" },
          { value: s.unseated, label: "بلا مقعد", alert: s.unseated > 0 },
        ]} />

        <TabStrip tabs={TABS} active={tab} onChange={setTab} tone="onLight" idPrefix="manifest" />
      </div>

      <main className="flex-1 px-4 md:px-8 pb-8 pt-4">
        {(perBus || draftElsewhere) && (
          <div className="flex items-center gap-x-3 gap-y-2 flex-wrap mb-4">
            {/* باصات الرحلة — لكل باصٍ كشفه وكروكيه. السكن والسائقون للرحلة كلها. */}
            {perBus && <>
              <div className="ui-table-scroll" style={{ maxWidth: "100%" }}>
                <Segmented label="باصات الرحلة" value={String(busNo)} onChange={v => setBus(Number(v))}
                  options={sheets.map(sh => ({
                    value: String(sh.bus),
                    label: <>باص {sh.bus}<span dir="ltr" style={{ color: B.muted, fontWeight: 500, fontSize: 12 }}>{sh.summary.seated + sh.privacySeats.size}/{sh.summary.capacity}</span></>,
                  }))} />
              </div>
              <span style={{ fontSize: 12, color: B.muted }}>{seatsPerBus(trip)} مقعداً لكل باص · الحجز يملأ الباص 1 ثم الذي بعده</span>
            </>}
            {draftElsewhere && <Badge tone="warn" dot className="ms-auto">السائقون: تغييرات لم تُحفظ</Badge>}
          </div>
        )}

        <TabPanel id="seats" idPrefix="manifest" active={tab === "seats"}><SeatSheet m={m} onOpenBooking={openBooking} /></TabPanel>
        <TabPanel id="croquis" idPrefix="manifest" active={tab === "croquis"}><Croquis m={m} onOpenBooking={openBooking} /></TabPanel>
        <TabPanel id="drivers" idPrefix="manifest" active={tab === "drivers"}>
          <DriversSheet draft={driverDraft} setDraft={setDriverDraft} saved={trip.drivers}
            editable={driversEditable} dirty={driversDirty} onSave={saveDrivers} onReset={() => setDriverDraft(draftOf(trip.drivers))} />
        </TabPanel>
        <TabPanel id="housing" idPrefix="manifest" active={tab === "housing"}><HousingSheet h={housing} nights={nights} onOpenBooking={openBooking} /></TabPanel>
      </main>

      <PrintFrame>
        {tab === "housing"
          ? <HousingPrintPage h={housing} trip={trip} pkgName={pkgName} nights={nights} printedAt={printedAt} />
          : (printAll ? sheets : [m]).map((sh, i) => (
              <div key={sh.bus ?? 0} className={i ? "pg-break" : undefined}>
                <TripPrintPages m={sh} pkgName={pkgName} vehicle={vehicle} branch={branch} printedAt={printedAt} />
              </div>
            ))}
      </PrintFrame>
    </div>
  );
}
