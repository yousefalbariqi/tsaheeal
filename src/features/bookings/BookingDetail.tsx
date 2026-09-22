/* شاشة الطلب — أفهمه بنظرة، وأرى مقاعده بنظرة، وأُنجزه بثلاث ضغطات.

   ثلاث طبقاتٍ لا رابع:

     ١ ملخّصٌ شبكيّ   — من ومع من وإلى أين وبكم، في عشر خاناتٍ مرتّبة.
                        الباقة والفندق ونوع السكن متجاورةٌ عمداً: الموظف
                        يقرأ «الرحلة» كتلةً واحدة لا مبعثرةً في الصفحة.
     ٢ صفّان من الأزرار — التعامل مع العميل، ثم العمل نفسه.
     ٣ كروكي المقاعد  — في الصفحة لا في نافذة.

   وما عدا ذلك تحت «تفاصيل أكثر»: الهويات والمواليد والجنسيات ونقطة
   الانطلاق وتوزيع الغرف والفاتورة والسجل.

   ── الكروكي في الصفحة لا في نافذة ──
   كان اختيار المقعد يفتح نافذةً فوق الصفحة: الموظف يفقد الملخّص خلفها،
   ولا يرى سعة الرحلة إلا بعد أن يقرّر أن يختار. صار الكروكي جزءاً من
   الورقة — يُقرأ دائماً، ويصير قابلاً للنقر حين يضغط «اختيار المقاعد».
   فسقطت نافذةٌ كاملة ومعها ضغطتا فتحٍ وإغلاق.

   ── والتبويبات فوقه ──
   الطلب على رحلةٍ واحدة، فلا تبويب. لكن للباقة رحلاتٌ أخرى قادمة،
   والموظف الذي مضت رحلة طلبه يحتاج أن يرى أين يوجد مكان. فتظهر
   تبويباتٌ صغيرة حين توجد رحلةٌ ثانية فعلاً، والكروكي المعروض واحدٌ
   دائماً — لا جدارٌ من الكروكيات. ورحلةٌ غير رحلة الطلب تُعرض للقراءة:
   نقلُ الطلب إلى رحلةٍ أخرى يغيّر السعر والسعة، وله مسارُه لا نقرةُ
   مقعد. */
import { useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Armchair, ArrowRight, Check, FileText, Mail, MoreHorizontal,
  Pencil, Phone, Printer, Wallet,
} from "lucide-react";
import { B } from "@/lib/theme";
import type { Booking, BookingStatus, BookingTravellerCounts, Payment, Pilgrim, Pkg, TicketEntry, Trip } from "@/types";
import { copyText, invVerifyUrl, openWhatsApp, payLinkFor, todayYMD } from "@/lib/utils";
import { sar, sarNumber } from "@/lib/money";
import { isSellable, seatsOf } from "@/lib/trip";
import { AppSelect } from "@/components/AppSelect";
import { NationalitySelect } from "@/components/NationalitySelect";
import { DOC_TYPES, docTypeDef, guessDocType, numberLabelOf } from "@/data/docTypes";
import { BusSeatGrid, privacySeatPartner } from "@/components/BusSeatGrid";
import { Field } from "@/components/Field";
import { NumericInput } from "@/components/NumericInput";
import { Spinner } from "@/components/Spinner";
import { EventTimeline } from "@/components/EventTimeline";
import { useStore, flushSync, clearSyncError } from "@/store/useStore";
import { useRole } from "@/lib/useRole";
import { InvoiceModal } from "@/features/payments";
import { TicketCard } from "@/features/tickets";
import { logDocEvent, SEND_OUTCOMES } from "@/features/docs/docEvents";
import { blockingGaps, isStale, payDeadlineHours, staleDays, type FlowCtx, type Transition } from "./flow";
import { closeActions, closedAs } from "./stages";
import { afterEdit, allVerified as everyVerified, markVerified, verifyState } from "./verification";
import { ConfirmTransition, type TransitionSubmit } from "./ConfirmTransition";
import { acceptBooking, applyDiscount, cancelBooking, rejectBooking } from "./ops";
import { toast } from "sonner";

const validPhone = (p: string) => /^(05\d{8}|(\+?966)5\d{8})$/.test(p.replace(/\s/g, ""));
const PAY_METHODS = ["تحويل بنكي", "كاش في الفرع", "بطاقة مدى", "Apple Pay", "تابي", "تمارا"];

type WorkState = "ready" | "done" | "blocked";
const card = { background: "#fff", border: `1px solid ${B.border}` } as const;
const SHEET = 1080;

/** ترتيب المقاعد المختارة يحمل توزيع الحجز: يختار الموظف الذكور أولاً
    ثم الإناث، فيبقى اللون أداة ترتيب حقيقية لا تخميناً من الهوية. */
function bookedSeatGender(booking: Booking, index: number): "male" | "female" | null {
  const counts = booking.travellerCounts;
  const total = counts ? Number(counts.men ?? 0) + Number(counts.women ?? 0) + Number(counts.children ?? 0) : 0;
  if (counts && total === Math.max(1, booking.persons || 1)) {
    if (index < Number(counts.men ?? 0)) return "male";
    if (index < Number(counts.men ?? 0) + Number(counts.women ?? 0)) return "female";
    return null;
  }
  return index === 0 ? booking.pilgrims[0]?.gender ?? null : null;
}

/** الخصوصية تخص الأنثى التي لا مرافق معها في هذا الحجز فقط. */
function isSoloFemale(booking: Booking): boolean {
  if (Math.max(1, booking.persons || 1) !== 1) return false;
  const c = booking.travellerCounts;
  if (c) return Number(c.men ?? 0) === 0 && Number(c.women ?? 0) === 1 && Number(c.children ?? 0) === 0;
  return booking.pilgrims[0]?.gender === "female";
}

/** للحجوزات التي أُنشئت قبل أن يطلب نموذج الموظف التوزيع. لا نخمن
    الجنس من الاسم أو من المقعد؛ الموظف يثبته مرة واحدة فيختفي الرمادي. */
function TravellerDistributionFix({ booking, onSave }: { booking: Booking; onSave: (counts: BookingTravellerCounts) => void }) {
  const people = Math.max(1, booking.persons || 1);
  const initial = booking.travellerCounts;
  const [men, setMen] = useState(initial?.men ?? booking.pilgrims.filter(p => p.gender === "male").length);
  const [women, setWomen] = useState(initial?.women ?? booking.pilgrims.filter(p => p.gender === "female").length);
  const total = men + women;
  const save = () => {
    if (total !== people) {
      toast.error(`وزّع ${people} معتمرين بالضبط بين المعتمرين والمعتمرات.`);
      return;
    }
    onSave({ men, women, children: 0 });
    toast.success("حُفظ توزيع المعتمرين في الكروكي.");
  };
  const input = { width: 62, padding: "7px 8px", textAlign: "center" as const, direction: "ltr" as const, borderColor: B.border, background: "#fff", color: B.black };
  return (
    <div className="mx-5 mt-3 rounded-xl px-3.5 py-3 flex flex-wrap items-end gap-3" style={{ background: "#FFF9EF", border: "1px solid #E9D7B5" }}>
      <div className="text-xs font-bold" style={{ color: B.text2 }}>حدّد توزيع هذا الحجز لتلوين المقاعد</div>
      <label className="text-xs font-bold" style={{ color: "#1E52C7" }}>المعتمرون<NumericInput min={0} max={people - women} value={men} onValueChange={v => setMen(Math.min(Math.max(0, Number(v) || 0), people - women))} className="block mt-1 rounded-lg border" style={input}/></label>
      <label className="text-xs font-bold" style={{ color: "#B4266E" }}>المعتمرات<NumericInput min={0} max={people - men} value={women} onValueChange={v => setWomen(Math.min(Math.max(0, Number(v) || 0), people - men))} className="block mt-1 rounded-lg border" style={input}/></label>
      <button type="button" onClick={save} className="rounded-lg px-3 py-2 text-xs font-bold cursor-pointer" style={{ background: B.gold, color: B.black, border: "none" }}>حفظ التوزيع</button>
      <span className="text-xs" style={{ color: total === people ? "#1E7A44" : "#B4530C" }}>{total} / {people}</span>
    </div>
  );
}

/* ════════ قِطَعٌ صغيرة ════════════════════════════════════════════ */

/** خانةٌ في شبكة الملخّص — عنوانٌ صغير فوق قيمةٍ سميكة.

    الخطوط حدودٌ على الخليّة نفسها لا فجواتٌ تكشف خلفيةَ الحاوية: الشبكة
    تلتفّ بعدد أعمدةٍ يختلف بالمقاس، وصفٌّ أخيرٌ ناقص كان يترك شريطاً
    رمادياً مكان الخلايا الغائبة. والحاوية تقصّ حدَّ العمود الأول بإزاحة
    بكسلٍ واحد، فلا يظهر خطٌّ طائشٌ عند حافّة البطاقة. */
function Cell({ label, value, mono, tone, wrap }: { label: string; value: string; mono?: boolean; tone?: string; wrap?: boolean }) {
  return (
    <div className="min-w-0 px-4 py-3"
      style={{ borderTop: `1px solid ${B.border}`, borderInlineStart: `1px solid ${B.border}` }}>
      <div className="text-xs font-semibold mb-1" style={{ color: B.muted }}>{label}</div>
      <div className={`font-bold text-sm ${wrap ? "whitespace-normal leading-6" : "truncate"}`} title={value}
        style={{ color: tone ?? B.black, fontFamily: mono ? "var(--font-app)" : "inherit", direction: mono ? "ltr" : undefined, textAlign: mono ? "right" : undefined }}>
        {value}
      </div>
    </div>
  );
}

/** زرّ عملٍ واحد: مضيءٌ إن كان دوره، ✓ إن تمّ، مطفأٌ إن لم يحن. */
function WorkButton({ state, label, doneLabel, icon: Icon, busy, onClick }: {
  state: WorkState; label: string; doneLabel: string;
  icon: typeof Check; busy?: boolean; onClick: () => void;
}) {
  const done = state === "done";
  const ready = state === "ready";
  return (
    <button onClick={() => { if (ready && !busy) onClick(); }} disabled={!ready || busy}
      title={done ? doneLabel : label}
      className="inline-flex items-center justify-center gap-2 rounded-xl font-extrabold"
      style={{
        padding: "13px 22px", fontSize: 15, border: done ? "1px solid #C4E4CE" : "none",
        background: done ? "#E3F3E8" : ready ? B.gold : "#F1EFEB",
        color: done ? "#1E7A44" : ready ? B.black : "#A69D91",
        cursor: ready && !busy ? "pointer" : "default",
      }}>
      {busy ? <Spinner size={14} color={B.black} track="rgba(27,23,18,0.25)" />
        : done ? <Check size={16} /> : <Icon size={16} />}
      {done ? doneLabel : label}
    </button>
  );
}

/** زرٌّ صغيرٌ في صفّ التعامل مع العميل. */
function SmallButton({ icon: Icon, label, onClick, color, bg, href }: {
  icon: typeof Check; label: string; onClick?: () => void; color?: string; bg?: string; href?: string;
}) {
  const style: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 10,
    fontSize: 13, fontWeight: 700, textDecoration: "none", cursor: "pointer",
    background: bg ?? "#fff", color: color ?? B.text2, border: `1px solid ${bg ? "transparent" : B.border}`,
  };
  return href
    ? <a href={href} style={style}><Icon size={13} />{label}</a>
    : <button onClick={onClick} style={style}><Icon size={13} />{label}</button>;
}

/** قائمة «⋯» — الرفض والإلغاء والخصم: موجودةٌ ولا تُزاحم. */
function MoreMenu({ items }: { items: { label: string; danger?: boolean; onClick: () => void }[] }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-haspopup="menu" aria-expanded={open} aria-label="إجراءات أخرى" title="إجراءات أخرى"
        className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer flex-shrink-0"
        style={{ background: "#fff", border: `1px solid ${B.border}`, color: B.text2 }}>
        <MoreHorizontal size={15} />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 mt-1 rounded-xl overflow-hidden z-20"
          style={{ background: "#fff", border: `1px solid ${B.border}`, boxShadow: "0 8px 24px rgba(27,23,18,0.12)", minWidth: 180 }}>
          {items.map((it, i) => (
            <button key={it.label} role="menuitem" onMouseDown={e => e.preventDefault()}
              onClick={() => { setOpen(false); it.onClick(); }}
              className="w-full text-right px-4 py-2.5 text-xs font-bold cursor-pointer"
              style={{ background: "none", border: "none", borderTop: i ? `1px solid ${B.border}` : "none", color: it.danger ? "#BE2626" : B.text2 }}>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ════════ الخصم الموثَّق — للمدير ════════ */
function DiscountPanel({ booking, onClose, onDone }: { booking: Booking; onClose: () => void; onDone: () => Promise<void> }) {
  const [pct, setPct] = useState(String(booking.discountPercent ?? ""));
  const [reason, setReason] = useState(booking.discountReason ?? "");
  const [busy, setBusy] = useState(false);
  const inp = "w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none";
  const ist = { borderColor: B.border, background: "#fff", color: B.black, fontFamily: "inherit" } as const;
  async function save() {
    const p = Number(pct);
    if (Number.isNaN(p) || p < 0 || p > 100) { toast.error("النسبة بين 0 و100"); return; }
    if (p > 0 && !reason.trim()) { toast.error("سبب الخصم إلزامي"); return; }
    setBusy(true);
    const r = await applyDiscount(booking.id, p, reason.trim());
    setBusy(false);
    if (r.unsupported) { toast.info("الخصم الموثَّق يحتاج ترحيل 20260910 على القاعدة."); return; }
    if (r.error) { toast.error(r.error); return; }
    toast.success(p > 0 ? `اعتُمد خصم ${p}% — الإجمالي ${sar(r.total ?? 0)}` : "أُلغي الخصم");
    onClose(); await onDone();
  }
  return (
    <div className="rounded-xl p-4 flex flex-col gap-3 mt-3" style={{ background: "#FFFBF0", border: "1px solid #EBD9A0" }}>
      <div className="text-xs" style={{ color: B.text2 }}>يُسجَّل باسمك ووقته وسببه ويظهر سطراً في الفاتورة. يُحسب من السعر الأصلي لا من الإجمالي الحالي.</div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div><Field label="النسبة %"><NumericInput min={0} max={100} className={inp} style={{ ...ist, direction: "ltr" }} value={pct} onValueChange={setPct} /></Field></div>
        <div className="sm:col-span-2"><Field label="السبب"><input className={inp} style={ist} value={reason} placeholder="عميل متكرر · مجموعة · تعويض" onChange={e => setReason(e.target.value)} /></Field></div>
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={busy} className="px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer" style={{ background: B.gold, color: B.black, border: "none" }}>{busy ? "جارٍ الحفظ…" : "اعتماد"}</button>
        <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm font-bold cursor-pointer" style={{ background: B.fill, color: B.text2, border: "none" }}>إغلاق</button>
      </div>
    </div>
  );
}

/* ════════ التصحيح السريع ══════════════════════════════════════════
   فورمٌ واحد يُفتح في مكانه: العميل وصفٌّ لكل معتمر. لا نافذة تُفتح ولا
   شاشة يُنتقل إليها — الموظف يرى الخطأ فيصحّحه ويحفظ.

   والتعديل بعد التحقق لا يعيد الطلب إلى الوراء ولا يعطّل زرّاً: يُوسَم
   المعتمر «عُدِّلت بعد التحقق» في التفاصيل ويُقرأ، لا أكثر (afterEdit). */
function QuickEdit({ booking, onSave, onCancel }: {
  booking: Booking;
  onSave: (client: { clientName: string; clientPhone: string } | null, pilgrims: Pilgrim[] | null) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(booking.clientName);
  const [phone, setPhone] = useState(booking.clientPhone);
  const [rows, setRows] = useState<Pilgrim[]>(() => booking.pilgrims.map(p => ({ ...p })));
  const [err, setErr] = useState<string | null>(null);
  const set = (i: number, k: keyof Pilgrim, v: unknown) =>
    setRows(rs => rs.map((r, idx) => idx === i ? { ...r, [k]: v } : r));

  const inp = "w-full border rounded-lg px-2.5 py-2 text-sm focus:outline-none";
  const ist = { borderColor: B.gold, background: "#fff", color: B.black, fontFamily: "inherit" } as const;
  const pilgrimsChanged = useMemo(
    () => JSON.stringify(rows) !== JSON.stringify(booking.pilgrims), [rows, booking.pilgrims]);

  const save = () => {
    const n = name.trim(), p = phone.trim();
    if (n.length < 3) { setErr("اكتب اسم العميل كاملاً."); return; }
    /* الرقم المخزَّن لا يُعاد التحقق منه: طلبٌ قديمٌ بصيغةٍ أخرى كان
       يمنع تصحيح الاسم وحده. الجديد وحده يُفحص. */
    if (p !== booking.clientPhone && !validPhone(p)) { setErr("رقم جوال غير صحيح — 05xxxxxxxx."); return; }
    const clientChanged = n !== booking.clientName || p !== booking.clientPhone;
    if (!clientChanged && !pilgrimsChanged) { onCancel(); return; }
    onSave(
      clientChanged ? { clientName: n, clientPhone: p } : null,
      pilgrimsChanged ? rows.map((r, i) => booking.pilgrims[i] ? afterEdit(booking.pilgrims[i], r) : r) : null,
    );
  };

  return (
    <div className="rounded-xl p-4 mt-3 flex flex-col gap-3.5" style={{ background: B.cream, border: "1px solid #EDE4CF" }}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" style={{ maxWidth: 520 }}>
        <div>
          <div className="text-xs font-semibold mb-1" style={{ color: B.muted }}>اسم العميل</div>
          <input className={inp} style={ist} value={name} onChange={e => { setName(e.target.value); setErr(null); }} />
        </div>
        <div>
          <div className="text-xs font-semibold mb-1" style={{ color: B.muted }}>الجوال</div>
          <input className={inp} style={{ ...ist, direction: "ltr" }} value={phone} placeholder="05xxxxxxxx"
            onChange={e => { setPhone(e.target.value); setErr(null); }} />
        </div>
      </div>

      {rows.map((p, i) => (
        <div key={i} className="grid grid-cols-2 lg:grid-cols-6 gap-2.5 items-end">
          <div className="col-span-2">
            <div className="text-xs font-semibold mb-1" style={{ color: B.muted }}>معتمر {i + 1}</div>
            <input className={inp} style={ist} value={p.name ?? ""} placeholder="الاسم الكامل" onChange={e => set(i, "name", e.target.value)} />
          </div>
          <div>
            <div className="text-xs font-semibold mb-1" style={{ color: B.muted }}>الوثيقة</div>
            <AppSelect value={p.docType ?? guessDocType(p.idNumber)} onChange={v => set(i, "docType", v)}
              options={DOC_TYPES.map(d => ({ value: d.value, label: `${d.icon} ${d.label.ar}` }))} />
          </div>
          <div>
            <div className="text-xs font-semibold mb-1" style={{ color: B.muted }}>{numberLabelOf(p.docType, p.idNumber)}</div>
            <input className={inp} style={{ ...ist, direction: "ltr" }} value={p.idNumber ?? ""}
              placeholder={docTypeDef(p.docType).placeholder} onChange={e => set(i, "idNumber", e.target.value)} />
          </div>
          <div>
            <div className="text-xs font-semibold mb-1" style={{ color: B.muted }}>الجنسية</div>
            <NationalitySelect value={p.nationality} onChange={v => set(i, "nationality", v)} subInTrigger={false} compact />
          </div>
          <div>
            <div className="text-xs font-semibold mb-1" style={{ color: B.muted }}>الميلاد</div>
            <input type="date" className={inp} style={{ ...ist, direction: "ltr" }} value={p.birthDate ?? ""} onChange={e => set(i, "birthDate", e.target.value)} />
          </div>
        </div>
      ))}

      {err && <div className="text-xs font-bold" style={{ color: "#BE2626" }}>{err}</div>}
      <div className="flex gap-2.5 flex-wrap">
        <button onClick={save} className="px-6 py-2.5 rounded-xl font-bold text-sm cursor-pointer"
          style={{ background: B.gold, color: B.black, border: "none" }}>حفظ</button>
        <button onClick={onCancel} className="px-4 py-2.5 rounded-xl font-bold text-sm cursor-pointer"
          style={{ background: "#fff", color: B.text2, border: `1px solid ${B.border}` }}>إلغاء</button>
        <span className="text-xs self-center" style={{ color: B.muted }}>الباقة والرحلة وعدد المعتمرين لا تُصحَّح هنا — تغييرها يغيّر السعر والمقاعد.</span>
      </div>
    </div>
  );
}

/* ════════ الصفحة ════════════════════════════════════════════════ */

export function BookingDetail({ booking, trips, packages, allBookings, onBack, onStatusChange, onPilgrimsChange, onClientChange, onTravellerCountsChange, onSeatsChange, onRefresh }: {
  booking: Booking; trips: Trip[]; packages: Pkg[]; allBookings: Booking[];
  onBack: () => void;
  onStatusChange: (id: string, s: BookingStatus, patch?: Partial<Booking>) => void;
  onPilgrimsChange: (id: string, pilgrims: Pilgrim[]) => void;
  onClientChange: (id: string, patch: { clientName: string; clientPhone: string }) => void;
  onTravellerCountsChange: (id: string, counts: BookingTravellerCounts) => void;
  onSeatsChange: (id: string, seats: number[]) => void;
  onRefresh: () => Promise<void>;
}) {
  const trip = trips.find(t => t.id === booking.tripId);
  const pkg = packages.find(p => p.id === (trip?.packageId ?? booking.packageId));
  const { isAdmin } = useRole();
  const today = todayYMD();

  const payments = useStore(s => s.payments);
  const tickets = useStore(s => s.tickets);
  const hotels = useStore(s => s.hotels);
  const beneficiaries = useStore(s => s.beneficiaries);
  const staffName = useStore(s => s.currentUser?.name) ?? booking.staff ?? "";

  const [busy, setBusy] = useState<null | "seats" | "pay" | "close">(null);
  const [evKey, setEvKey] = useState(0);
  const bump = () => setEvKey(k => k + 1);
  const [editing, setEditing] = useState(false);
  const [details, setDetails] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [pending, setPending] = useState<Transition | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [printDoc, setPrintDoc] = useState<"invoice" | "ticket" | null>(null);
  const [openedInvoice, setOpenedInvoice] = useState<Payment | null>(null);
  const [openedTicket, setOpenedTicket] = useState<TicketEntry | null>(null);
  const [loadingDocument, setLoadingDocument] = useState<"invoice" | "ticket" | null>(null);
  const [payMethod, setPayMethod] = useState(booking.payMethod && booking.payMethod !== "—" ? booking.payMethod : PAY_METHODS[0]);
  const payOptions = PAY_METHODS.includes(payMethod) ? PAY_METHODS : [payMethod, ...PAY_METHODS];

  const invoice = payments.find(x => x.bookingId === booking.id);
  const ticket = tickets.find(x => x.bookingId === booking.id);
  const hotel = hotels.find(h => h.id === trip?.hotelId);
  const email = (booking.customer?.email ?? "").trim();
  const activeInvoice = openedInvoice ?? invoice;
  const activeTicket = openedTicket ?? ticket;
  const openDocument = async (d: "invoice" | "ticket", print = false) => {
    if (d === "invoice" && invoice) {
      setOpenedInvoice(invoice); setInvoiceOpen(true);
      setPrintDoc(print ? d : null);
      return;
    }
    if (d === "ticket" && ticket) {
      setOpenedTicket(ticket); setTicketOpen(true);
      setPrintDoc(print ? d : null);
      return;
    }
    setLoadingDocument(d);
    await onRefresh();
    /* حارس التأكيد ينشئ المستندين داخل القاعدة. نقرأ المخزن بعد التحديث
       مباشرة كي يفتح المستند من الضغطة الأولى لا من ضغطة ثانية. */
    const refreshed = d === "invoice"
      ? useStore.getState().payments.find(x => x.bookingId === booking.id)
      : useStore.getState().tickets.find(x => x.bookingId === booking.id);
    setLoadingDocument(null);
    if (!refreshed) {
      toast.error(d === "invoice" ? "لم تُنشأ الفاتورة بعد — حدّث الصفحة أو راجع حارس المستندات" : "لم تُنشأ التذكرة بعد — حدّث الصفحة أو راجع حارس المستندات");
      return;
    }
    if (d === "invoice") { setOpenedInvoice(refreshed as Payment); setInvoiceOpen(true); }
    else { setOpenedTicket(refreshed as TicketEntry); setTicketOpen(true); }
    setPrintDoc(print ? d : null);
  };
  const openPrint = (d: "invoice" | "ticket") => { void openDocument(d, true); };
  const closeDoc = () => { setPrintDoc(null); setInvoiceOpen(false); setTicketOpen(false); setOpenedInvoice(null); setOpenedTicket(null); };

  const flowCtx: FlowCtx = {
    booking, trip, pkg, today,
    hasInvoice: !!invoice, hasTicket: !!ticket,
    beneficiaryLinked: beneficiaries.some(x => x.bookingIds.includes(booking.id)),
  };
  const closed = closedAs(booking.status);
  const need = Math.max(1, booking.persons || 1);
  const needsPrivacySeat = isSoloFemale(booking);
  const seatsNeeded = need + (needsPrivacySeat ? 1 : 0);
  const savedPrivacySeats = booking.privacySeats ?? [];
  const savedCounts = booking.travellerCounts;
  const savedCountTotal = savedCounts
    ? Number(savedCounts.men ?? 0) + Number(savedCounts.women ?? 0) + Number(savedCounts.children ?? 0)
    : 0;
  /* لقطة التوزيع وحدها هي مرجع هذا الحقل. لا نستنتج جنس مقاعد بلا
     بيانات، ولا نعرض لقطة قديمة لا يساوي مجموعها عدد الأشخاص. */
  const travellerSummary = savedCounts && savedCountTotal === need
    ? `${booking.travellerCounts.men} ذكور · ${booking.travellerCounts.women} إناث${booking.travellerCounts.children ? ` · ${booking.travellerCounts.children} أطفال` : ""}`
    : "توزيع غير مسجّل";

  /* ── حال الأفعال الثلاثة ──
     لا شريطَ مراحل ولا حالةٌ تُقرأ: ثلاثة أزرارٍ يقول شكلُها كلَّ شيء —
     واحدٌ مضيءٌ هو الدور، وما قبله ✓، وما بعده مطفأ. */
  const verified = everyVerified(booking.pilgrims);
  /* المقعد مقفولٌ فعلاً لا مجرّد مختار: القفل يمرّ بـaccept_booking
     فينقل الحالة، والحالة وحدها دليلُ أنه لم يعد يُباع لغيره. */
  const seatsLocked = !["new", "reviewing", "needs_edit", "awaiting_trip"].includes(booking.status)
    && booking.seats.length === need
    && savedPrivacySeats.length === (needsPrivacySeat ? 1 : 0);
  const paid = booking.status === "confirmed" || booking.paymentStatus === "verified";

  const gaps = blockingGaps(flowCtx).filter(g => !["seats", "verify", "pay"].includes(g.key));
  const blockLine = gaps.length
    ? `${gaps[0].label}${gaps.length > 1 ? ` و${gaps.length - 1} غيره` : ""} — صحّحه من «تعديل البيانات»`
    : null;

  const verifyStep: WorkState = closed ? "blocked" : verified ? "done" : gaps.length ? "blocked" : "ready";
  const seatStep: WorkState = closed ? "blocked" : seatsLocked ? "done" : verified && !gaps.length ? "ready" : "blocked";
  const payStep: WorkState = closed ? "blocked" : paid ? "done" : seatsLocked ? "ready" : "blocked";

  const nextLine = closed
    ? (closed === "rejected" ? "الطلب مرفوض — المقاعد محرَّرة" : "الطلب ملغى — المقاعد محرَّرة")
    : paid ? "مؤكد — صدرت الفاتورة والتذكرة، وبقي تسليمها للعميل"
    : blockLine ? blockLine
    : !verified ? "راجع البيانات ثم اضغط «تم التحقق»"
    : !seatsLocked ? "اختر المقاعد من الكروكي أسفل الصفحة لتُقفل باسم العميل"
    : "بانتظار سداد العميل — سجّل المبلغ حين يصل";

  /* ── الكروكي ──
     رحلة الطلب أولاً، ثم رحلات الباقة الأخرى المفتوحة للبيع: الموظف
     الذي مضت رحلة طلبه يسأل «وين فيه مكان؟» فيجيبه التبويب. */
  const croquisTrips = useMemo(() => {
    if (!trip) return [];
    const siblings = trips
      .filter(t => t.id !== trip.id && t.packageId === trip.packageId && isSellable(t))
      .sort((a, b) => a.departureDate.localeCompare(b.departureDate))
      .slice(0, 4);
    return [trip, ...siblings];
  }, [trips, trip]);
  const [tabId, setTabId] = useState<string | null>(null);
  const shownTrip = croquisTrips.find(t => t.id === tabId) ?? trip;
  const isOwnTrip = !!shownTrip && shownTrip.id === trip?.id;

  const [picking, setPicking] = useState(false);
  const [sel, setSel] = useState<number[]>([]);
  const croquisRef = useRef<HTMLDivElement>(null);

  /* مقاعد الآخرين على الرحلة المعروضة — ومعها جنسُ شاغلها ليُقرأ الكروكي
     بلمحة (ذكر أزرق · أنثى ورديّ) كما يُقرأ في كشف الإطلاقة. */
  const occupancy = useMemo(() => {
    const seats = new Set<number>();
    const genders = new Map<number, "male" | "female">();
    const privacy = new Set<number>();
    if (!shownTrip) return { seats, genders, privacy };
    allBookings.forEach(b => {
      if (b.tripId !== shownTrip.id || b.status === "cancelled" || b.status === "rejected") return;
      if (b.id === booking.id) return;
      b.seats.forEach((sn, i) => {
        seats.add(sn);
        const gender = bookedSeatGender(b, i);
        if (gender) genders.set(sn, gender);
      });
      (b.privacySeats ?? []).forEach(sn => { seats.add(sn); privacy.add(sn); });
    });
    return { seats, genders, privacy };
  }, [allBookings, shownTrip, booking.id]);

  const seatStats = useMemo(() => {
    if (!shownTrip) return null;
    const { capacity, booked, available } = seatsOf(shownTrip);
    let m = 0, f = 0, children = 0, known = 0;
    allBookings.forEach(b => {
      if (b.tripId !== shownTrip.id || b.status === "cancelled" || b.status === "rejected") return;
      const counts = b.travellerCounts;
      const total = counts ? Number(counts.men ?? 0) + Number(counts.women ?? 0) + Number(counts.children ?? 0) : 0;
      /* اختيار الرجال والنساء عند الحجز هو توزيع المجموعة. بيانات صاحب
         الطلب لا تُعادِل توزيع مقاعده بالترتيب، بل تؤكّد أنه واحد من
         الفئة التي اختارها. */
      if (counts && total === Math.max(1, b.persons || 1)) {
        m += Number(counts.men ?? 0);
        f += Number(counts.women ?? 0);
        children += Number(counts.children ?? 0);
        known += total;
      } else {
        const owner = b.pilgrims[0]?.gender;
        if (owner === "male") { m++; known++; }
        if (owner === "female") { f++; known++; }
      }
      /* مقعد الخصوصية محسوب في booked_seats لكنه ليس راكباً مجهول
         التوزيع؛ وإلا ظهر تحذير «بلا توزيع» لكل معتمرة منفردة. */
      known += (b.privacySeats ?? []).length;
    });
    return { capacity, booked, available, m, f, children, known, unknown: Math.max(0, booked - known) };
  }, [allBookings, shownTrip]);

  const startPicking = () => {
    setTabId(trip?.id ?? null);
    setSel([...booking.seats, ...savedPrivacySeats].filter(s => !occupancy.seats.has(s)));
    setPicking(true);
    setTimeout(() => croquisRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };
  const toggleSeat = (n: number) => {
    if (occupancy.seats.has(n)) return;
    /* الكروكي معروضٌ دائماً، فأوّل نقرةٍ على مقعدٍ متاح تبدأ الاختيار —
       لا يصعد الموظف إلى الزرّ ليأذن لنفسه بما هو تحت يده. والشرط نفسه
       شرطُ الزرّ: لا اختيار قبل التحقق، ولا على رحلةٍ غير رحلة الطلب. */
    if (!picking) {
      if (seatStep !== "ready" || !isOwnTrip) return;
      if (needsPrivacySeat && !privacySeatPartner(shownTrip?.seats ?? 0, n)) {
        toast.error("اختر مقعداً ضمن زوج متجاور؛ الصف الخلفي لا يصلح لمقعد الخصوصية.");
        return;
      }
      setSel([n]); setPicking(true);
      return;
    }
    if (needsPrivacySeat) {
      setSel(prev => {
        if (prev.includes(n)) return prev.filter(x => x !== n);
        if (prev.length === 0) return [n];
        if (prev.length >= 2) return prev;
        if (privacySeatPartner(shownTrip?.seats ?? 0, prev[0]) !== n) {
          toast.error("المقعد الثاني يجب أن يكون المجاور لمقعد المعتمرة.");
          return prev;
        }
        return [...prev, n];
      });
      return;
    }
    setSel(prev => prev.includes(n) ? prev.filter(x => x !== n) : (prev.length >= seatsNeeded ? prev : [...prev, n]));
  };

  /* ── الأفعال ── */

  const runVerify = () => {
    if (busy) return;
    onPilgrimsChange(booking.id, booking.pilgrims.map(p => markVerified(p, staffName)));
    /* «جديد» صار مقروءاً: تُنقل حالته لتقول للجدول ما تقوله الشاشة. */
    if (booking.status === "new") onStatusChange(booking.id, "reviewing");
    void logDocEvent("booking", booking.id, "note",
      { note: "تم التحقق من بيانات صاحب الطلب" }).then(bump);
    toast.success("✓ متحقق — التالي: اختيار المقاعد");
  };

  /** القفل والقبول في معاملةٍ واحدة (accept_booking). */
  const lockSeats = async () => {
    if (busy || sel.length !== seatsNeeded) return;
    setBusy("seats");
    /* إعادة التخصيص تمرّ بالحارس نفسه؛ الكتابة المباشرة قد تبيع مقعد
       الخصوصية أو تحوّله إلى راكبٍ وهمي. */
    if (seatsLocked) {
      const r = await acceptBooking(booking.id, sel);
      setBusy(null);
      if (!r.unsupported) {
        if (r.error) { toast.error(r.error); return; }
        setPicking(false); await onRefresh(); bump();
        toast.success(needsPrivacySeat
          ? `نُقل مقعد المعتمرة إلى ${sel[0]} وفُرّغ ${sel[1]} للخصوصية.`
          : `حُفظت المقاعد ${sel.join("، ")}`);
        return;
      }
      onSeatsChange(booking.id, sel);
      setPicking(false);
      return;
    }
    const r = await acceptBooking(booking.id, sel);
    if (!r.unsupported) {
      setBusy(null);
      if (r.error) { toast.error(r.error); return; }
      setPicking(false); await onRefresh(); bump();
      toast.success(needsPrivacySeat
        ? `قُفل المقعد ${sel[0]} وفُرّغ المقعد المجاور ${sel[1]} للخصوصية.`
        : `قُفلت المقاعد ${sel.join("، ")}`);
      return;
    }
    /* قاعدةٌ بلا ترحيل 20260910 — الكتابة المباشرة كما كانت. */
    clearSyncError();
    onSeatsChange(booking.id, sel);
    onStatusChange(booking.id, "accepted");
    void logDocEvent("booking", booking.id, "accept", { note: `المقاعد: ${sel.join("، ")}` }).then(bump);
    setBusy(null); setPicking(false);
    toast.success(`قُفلت المقاعد ${sel.join("، ")}`);
  };

  const recordPayment = async () => {
    if (busy) return;
    setBusy("pay");
    clearSyncError();
    onStatusChange(booking.id, "confirmed", { paymentStatus: "verified", payMethod, payDate: today });
    void logDocEvent("booking", booking.id, "status", { note: `→ مؤكد — استُلم ${sar(booking.total)} · ${payMethod}` });
    /* التأكيد يُصدر الفاتورة والتذكرة في القاعدة (trg_booking_confirm_docs)،
       فتُنتظر الكتابة ثم يُعاد الجلب — وإلا قالت الشاشة «لم تصدر تذكرة»
       وهي صادرة. */
    const err = await flushSync();
    if (err) { toast.error(err); setBusy(null); return; }
    await onRefresh();
    setBusy(null); bump();
    toast.success("تم تأكيد الحجز والدفع");
  };

  const runClose = async (t: Transition, v: TransitionSubmit) => {
    if (busy) return;
    setBusy("close");
    let handled = false;
    if (t.to === "rejected") {
      const r = await rejectBooking(booking.id, v.internalReason, v.customerMessage);
      if (!r.unsupported) { handled = true; if (r.error) { toast.error(r.error); setBusy(null); return; } }
    } else {
      const r = await cancelBooking(booking.id, v.internalReason);
      if (!r.unsupported) { handled = true; if (r.error) { toast.error(r.error); setBusy(null); return; } }
    }
    if (handled) await onRefresh();
    else {
      clearSyncError();
      onStatusChange(booking.id, t.to);
      void logDocEvent("booking", booking.id, t.to === "rejected" ? "reject" : "cancel",
        { note: `→ ${t.label}${v.internalReason ? ` — ${v.internalReason}` : ""}` });
    }
    if (v.notify && v.customerMessage) {
      openWhatsApp(booking.clientPhone, v.customerMessage);
      void logDocEvent("booking", booking.id, "whatsapp", { note: `قالب: ${t.to === "rejected" ? "رفض" : "إلغاء"}` });
    }
    setBusy(null); setPending(null); bump();
  };

  /* ── واتساب: زرٌّ واحد ورسالةٌ تناسب حال الطلب ──
     قبل الدفع يحمل الرابط والمبلغ، وبعد التأكيد يحمل التذكرة. */
  const waMessage = (): string => {
    if (paid && ticket) {
      return `مرحباً ${ticket.clientName}،\nتذكرة تساهيل العمرة رقم ${ticket.ticketNo}\nالرحلة: ${ticket.tripDate} · ${ticket.tripTime}\nنقطة الانطلاق: ${ticket.departurePoint}\nرابط التحقق: ${invVerifyUrl(ticket.ticketNo)}`;
    }
    if (!paid && booking.payToken) {
      return `مرحباً ${booking.clientName}،\nرابط دفع باقة (${pkg?.name ?? "العمرة"}):\n${payLinkFor(booking.id, booking.payToken)}\nالمبلغ المطلوب: ${sar(booking.total)}\nالرابط صالح لمدة ${payDeadlineHours(flowCtx)} ساعة.`;
    }
    return `مرحباً ${booking.clientName}، بخصوص طلبكم ${booking.id}`;
  };
  const sendWhatsApp = () => {
    openWhatsApp(booking.clientPhone, waMessage());
    void logDocEvent("booking", booking.id, "whatsapp",
      { note: paid ? "قالب: التذكرة" : booking.payToken ? "قالب: رابط الدفع" : "محادثة" }).then(bump);
  };
  /* البريد يفتح برنامج الموظف لا يرسل من الخادم — لا واجهة برمجية،
     فادّعاء الإرسال كذب. */
  const sendEmail = () => {
    if (!ticket || !email) return;
    window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`تذكرة تساهيل العمرة — ${ticket.ticketNo}`)}&body=${encodeURIComponent(waMessage())}`;
    void logDocEvent("ticket", ticket.ticketNo, "contact", { note: `بريد إلكتروني: ${email}` }).then(bump);
  };

  const menuItems = [
    ...(seatsLocked && booking.status === "accepted" ? [{ label: "تغيير المقاعد", onClick: startPicking }] : []),
    ...(booking.payToken && !paid
      ? [{ label: "نسخ رابط الدفع", onClick: () => { copyText(payLinkFor(booking.id, booking.payToken)); toast.success("نُسخ رابط الدفع"); } }]
      : []),
    ...closeActions(flowCtx).map(t => ({ label: t.label, danger: true, onClick: () => setPending(t) })),
  ];

  /* ── شبكة الملخّص ──
     الباقة والفندق ونوع السكن متجاورة: ثلاثتها «الرحلة» عند الموظف،
     وتفريقها يجعله يبحث عنها في ثلاثة مواضع. */
  const summary: { l: string; v: string; mono?: boolean; tone?: string; wrap?: boolean }[] = [
    { l: "اسم العميل", v: booking.clientName },
    { l: "الجوال", v: booking.clientPhone, mono: true },
    { l: "الباقة", v: pkg?.name ?? "—" },
    { l: "الفندق", v: hotel?.name ?? "—" },
    { l: "نوع السكن", v: booking.roomType || "—", wrap: true },
    { l: "عدد الأشخاص", v: String(need) },
    { l: "توزيع المسافرين", v: travellerSummary, wrap: true },
    { l: "المغادرة", v: `${trip?.departureDate ?? "—"}${trip?.departureTime ? ` · ${trip.departureTime}` : ""}`, mono: true },
    { l: "العودة", v: trip?.returnDate ?? "—", mono: true },
    { l: "المبلغ", v: `${sarNumber(booking.total)} ر.س`, mono: true, tone: B.gold },
    ...(seatsLocked ? [{ l: "المقاعد", v: needsPrivacySeat
      ? `${booking.seats[0] ?? "—"} · خصوصية ${savedPrivacySeats[0] ?? "—"}`
      : booking.seats.join("، "), mono: true }] : []),
    ...(booking.discountPercent ? [{ l: "خصم معتمد", v: `${booking.discountPercent}%`, tone: "#8A6A08" }] : []),
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex-1 w-full min-w-0 px-4 md:px-8 pb-12 pt-5">
      <button onClick={onBack} className="flex items-center gap-2 text-sm font-bold mb-4 cursor-pointer" style={{ background: "none", border: "none", color: B.text2 }}>
        <ArrowRight size={14} />عودة للطلبات
      </button>

      {/* ══ ١ · الملخّص ══ */}
      <div className="rounded-2xl overflow-hidden" style={{ ...card, maxWidth: SHEET }}>
        <div className="flex items-center justify-between gap-3 px-5 py-3" style={{ background: B.cream, borderBottom: "1px solid #EDE4CF" }}>
          <div className="flex items-baseline gap-2.5 flex-wrap min-w-0">
            <span className="font-extrabold" style={{ fontFamily: "var(--font-app)", fontSize: 16, color: B.black }}>{booking.id}</span>
            <span className="text-xs" style={{ color: B.muted }}>أُنشئ {booking.createdAt}</span>
            {isStale(booking, trip, today) && !closed && (
              <span className="text-xs font-bold" style={{ color: "#B4530C" }}>· مضت رحلته قبل {staleDays(trip, today)} يوماً</span>
            )}
            {closed && (
              <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-full" style={{ background: "#FBE6E6", color: "#BE2626" }}>
                {closed === "rejected" ? "مرفوض" : "ملغى"}
              </span>
            )}
          </div>
          <MoreMenu items={menuItems} />
        </div>

        {/* الشبكة */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 overflow-hidden" style={{ marginInlineStart: -1 }}>
          {summary.map(f => <Cell key={f.l} label={f.l} value={f.v} mono={f.mono} tone={f.tone} wrap={f.wrap} />)}
        </div>

        {booking.pricing && (
          <div className="px-5 py-4" style={{ borderTop: `1px solid ${B.border}`, background: "#FDFCFA" }}>
            <div className="text-xs font-bold mb-2.5" style={{ color: B.text2 }}>ملخص السعر المعتمد عند الحجز</div>
            <div className="flex flex-col" style={{ gap: 7, maxWidth: 520 }}>
              <div className="flex items-center justify-between gap-4 text-sm" style={{ color: B.text2 }}>
                <span>إجمالي المواصلات</span>
                <b style={{ color: B.black, fontFamily: "var(--font-app)" }}>{sar(booking.pricing.transportTotal)}</b>
              </div>
              <div className="flex items-center justify-between gap-4 text-sm" style={{ color: B.text2 }}>
                <span>إجمالي السكن</span>
                <b style={{ color: B.black, fontFamily: "var(--font-app)" }}>{sar(booking.pricing.accommodationTotal)}</b>
              </div>
              <div className="flex items-center justify-between gap-4 pt-2 text-sm font-extrabold" style={{ borderTop: `1px solid ${B.border}`, color: B.black }}>
                <span>الإجمالي</span>
                <span style={{ color: B.gold, fontFamily: "var(--font-app)", fontSize: 17 }}>{sar(booking.total)}</span>
              </div>
            </div>
          </div>
        )}

        {/* ══ ٢ · صفّ التعامل مع العميل ══ */}
        <div className="flex items-center gap-2 flex-wrap px-5 py-3.5" style={{ borderTop: `1px solid ${B.border}` }}>
          <SmallButton icon={Pencil} label={editing ? "إغلاق التعديل" : "تعديل البيانات"} onClick={() => setEditing(v => !v)} color="#8a6a08" />
          <SmallButton icon={Phone} label="اتصال" href={`tel:${booking.clientPhone}`} />
          <SmallButton icon={Phone} label="واتساب" onClick={sendWhatsApp} bg="#25D366" color="#fff" />
          <SmallButton icon={FileText} label={details ? "إخفاء التفاصيل" : "تفاصيل أكثر"} onClick={() => setDetails(v => !v)} />
          {booking.payToken && !paid && <SmallButton icon={Wallet} label="إرسال رابط الدفع" onClick={sendWhatsApp} bg="#EAF1FE" color="#2457A6" />}
          {isAdmin && !paid && !closed && <SmallButton icon={Wallet} label={booking.discountPercent ? "تعديل الخصم الموثق" : "خصم موثق"} onClick={() => setDiscountOpen(v => !v)} bg="#FFF4DE" color="#8A6200" />}
          {paid && <SmallButton icon={Printer} label={loadingDocument === "invoice" ? "جارٍ فتح الفاتورة…" : "الفاتورة"} onClick={() => void openDocument("invoice")} />}
          {paid && <SmallButton icon={Printer} label={loadingDocument === "ticket" ? "جارٍ فتح التذكرة…" : "التذكرة"} onClick={() => void openDocument("ticket")} />}
          {paid && ticket && !!email && <SmallButton icon={Mail} label="بريد" onClick={sendEmail} />}
        </div>

        {(discountOpen || editing) && (
          <div className="px-5 pb-1">
            {discountOpen && <DiscountPanel booking={booking} onClose={() => setDiscountOpen(false)} onDone={async () => { await onRefresh(); bump(); }} />}
            {editing && (
              <QuickEdit booking={booking} onCancel={() => setEditing(false)}
                onSave={(client, pilgrims) => {
                  if (client) onClientChange(booking.id, client);
                  if (pilgrims) onPilgrimsChange(booking.id, pilgrims);
                  void logDocEvent("booking", booking.id, "note", { note: "تصحيح بيانات الطلب" }).then(bump);
                  setEditing(false);
                  toast.success("حُفظت التعديلات");
                }} />
            )}
          </div>
        )}

        {/* ══ ٣ · إجراءات الطلب ══ */}
        <div className="px-5 py-4" style={{ borderTop: `1px solid ${B.border}`, background: "#FDFCFA" }}>
          <div className="flex items-center gap-2.5 flex-wrap">
            <WorkButton state={verifyStep} icon={Check} label="تم التحقق" doneLabel="متحقق" onClick={runVerify} />
            <WorkButton state={seatStep} icon={Armchair} busy={busy === "seats"}
              label={needsPrivacySeat ? "اختيار مقعدي الخصوصية" : "اختيار المقاعد"}
              doneLabel={needsPrivacySeat
                ? `مقعدها ${booking.seats[0] ?? "—"} · خصوصية ${savedPrivacySeats[0] ?? "—"}`
                : `المقاعد ${booking.seats.join("، ")}`}
              onClick={startPicking} />
            {payStep === "ready" && (
              <div style={{ width: 150 }}>
                <AppSelect value={payMethod} onChange={setPayMethod} options={payOptions.map(m => ({ value: m, label: m }))} />
              </div>
            )}
            <WorkButton state={payStep} icon={Wallet} busy={busy === "pay"}
              label={`تم استلام ${sarNumber(booking.total)} ر.س`} doneLabel="مدفوع" onClick={recordPayment} />
          </div>
          <div className="text-xs mt-2.5" style={{ color: blockLine ? "#B4530C" : B.muted, fontWeight: blockLine ? 700 : 500 }}>{nextLine}</div>
        </div>
      </div>

      {/* ══ ٤ · كروكي المقاعد ══ */}
      <div ref={croquisRef} className="rounded-2xl overflow-hidden mt-3" style={{ ...card, maxWidth: SHEET }}>
        <div className="flex items-center justify-between gap-3 px-5 py-3 flex-wrap" style={{ borderBottom: `1px solid ${B.border}` }}>
          <div className="font-bold text-sm flex items-center gap-2" style={{ color: B.black }}>
            <Armchair size={15} style={{ color: B.gold }} />كروكي المقاعد
          </div>
          {/* تبويبات الرحلات — لا تظهر إلا إن وُجدت رحلةٌ ثانية فعلاً */}
          {croquisTrips.length > 1 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {croquisTrips.map(t => {
                const on = t.id === shownTrip?.id;
                return (
                  <button key={t.id} onClick={() => { if (!picking) setTabId(t.id); }} disabled={picking}
                    title={picking ? "أنهِ اختيار المقاعد أولاً" : `رحلة ${t.departureDate}`}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold"
                    style={{
                      background: on ? B.gold : "#fff", color: on ? B.black : B.text2,
                      border: `1px solid ${on ? B.gold : B.border}`, fontFamily: "var(--font-app)",
                      cursor: picking ? "not-allowed" : "pointer", opacity: picking && !on ? 0.5 : 1,
                    }}>
                    {t.departureDate}{t.id === trip?.id ? " ★" : ""}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {!shownTrip || !seatStats ? (
          <div className="px-5 py-10 text-center text-sm" style={{ color: B.muted }}>الطلب بلا رحلة — لا كروكي.</div>
        ) : (
          <>
            {/* ملخّص السعة */}
            <div className="grid grid-cols-2 sm:grid-cols-4 overflow-hidden"
              style={{ marginInlineStart: -1, borderBottom: `1px solid ${B.border}` }}>
              {[
                { l: "إجمالي المقاعد", v: String(seatStats.capacity), tone: B.black },
                { l: "المحجوز", v: String(seatStats.booked), tone: "#8A6A08" },
                { l: "المتبقي", v: String(seatStats.available), tone: seatStats.available > 0 ? "#1E7A44" : "#BE2626" },
                { l: "توزيع الحجوزات", v: `${seatStats.m} ذكور · ${seatStats.f} إناث${seatStats.children ? ` · ${seatStats.children} أطفال` : ""}`, tone: B.text2 },
              ].map(s => (
                <div key={s.l} className="px-4 py-3" style={{ borderInlineStart: `1px solid ${B.border}` }}>
                  <div className="text-xs font-semibold mb-1" style={{ color: B.muted }}>{s.l}</div>
                  <div className="font-extrabold" style={{ color: s.tone, fontSize: 18, fontFamily: "var(--font-app)" }}>{s.v}</div>
                </div>
              ))}
            </div>
            {/* قد يأتي حجزٌ قديم، أو طلب داخلي قبل حفظ التوزيع. لا نخمن
                جنس المقعد من ترتيب المقاعد أو من جنس صاحب الطلب. */}
            {seatStats.unknown > 0 && (
              <div className="px-5 pt-3 text-xs" style={{ color: "#B4530C" }}>
                {seatStats.unknown} مقعد محجوز بحاجة إلى تحديد نوع المسافر؛ يظهر رمادياً حتى يُحدَّث التوزيع.
              </div>
            )}
            {isOwnTrip && seatStats.unknown > 0 && <TravellerDistributionFix booking={booking} onSave={counts => onTravellerCountsChange(booking.id, counts)} />}

            <div className="p-5">
              {isOwnTrip && needsPrivacySeat && (
                <div className="mb-4 rounded-xl px-3.5 py-3 text-xs font-bold" style={{ background: "#F3EAFE", border: "1px solid #D9C4F3", color: "#6F3AA8" }}>
                  هذه معتمرة منفردة: اختر مقعدين متجاورين. الأول لها، والثاني يُفرّغ للخصوصية ولا يُباع لراكب آخر.
                </div>
              )}
              {isOwnTrip && savedCounts && savedCountTotal === need && (
                <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold" style={{ color: B.text2 }}>
                  <span>رتّب المقاعد بالترتيب: <b style={{ color: "#1E52C7" }}>{savedCounts.men} ذكور</b> أولاً، ثم <b style={{ color: "#B4266E" }}>{savedCounts.women} إناث</b>.</span>
                  <span style={{ color: B.muted }}>الأزرق ذكر · الوردي أنثى</span>
                </div>
              )}
              <BusSeatGrid
                capacity={seatStats.capacity}
                occupied={occupancy.seats}
                /* الطلب الملغى حُرِّرت مقاعده فعلاً: إبرازها ذهبيةً يقول
                   إنها محجوزةٌ له وهي معروضةٌ للبيع. */
                selected={picking ? sel : (isOwnTrip && !closed ? [...booking.seats, ...savedPrivacySeats] : [])}
                need={seatsNeeded}
                onToggle={toggleSeat}
                occGender={n => occupancy.genders.get(n) ?? null}
                privacySeats={occupancy.privacy}
                selectedPrivacySeats={needsPrivacySeat
                  ? new Set([picking ? sel[1] : savedPrivacySeats[0]].filter((s): s is number => s != null))
                  : undefined}
                selGender={n => {
                  const list = picking ? sel : booking.seats;
                  return bookedSeatGender(booking, list.indexOf(n));
                }}
              />
            </div>

            {/* شريط الاختيار — يظهر وقت الاختيار وحده */}
            {picking && (
              <div className="flex items-center gap-3 flex-wrap px-5 py-3.5" style={{ borderTop: `1px solid ${B.border}`, background: B.cream }}>
                <span className="text-sm font-bold" style={{ color: B.black }}>
                  {sel.length ? `المقاعد ${sel.join("، ")}` : "اضغط على مقعدٍ متاح"}
                </span>
                <span className="px-2.5 py-1 rounded-full text-xs font-bold"
                  style={{ background: sel.length === seatsNeeded ? "#E3F3E8" : "#fff", color: sel.length === seatsNeeded ? "#1E7A44" : B.muted, border: `1px solid ${sel.length === seatsNeeded ? "#C4E4CE" : B.border}` }}>
                  {sel.length} / {seatsNeeded}
                </span>
                <div className="flex items-center gap-2 mr-auto">
                  <button onClick={() => { setPicking(false); setSel([]); }}
                    className="px-4 py-2.5 rounded-xl text-sm font-bold cursor-pointer"
                    style={{ background: "#fff", color: B.text2, border: `1px solid ${B.border}` }}>إلغاء</button>
                  <button onClick={() => void lockSeats()} disabled={sel.length !== seatsNeeded || !!busy}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-extrabold"
                    style={{
                      background: sel.length === seatsNeeded ? B.gold : "#EEECEA", color: sel.length === seatsNeeded ? B.black : B.muted,
                      border: "none", cursor: sel.length === seatsNeeded && !busy ? "pointer" : "not-allowed",
                    }}>
                    {busy === "seats" ? <Spinner size={13} color={B.black} track="rgba(27,23,18,0.25)" /> : <Check size={14} />}
                    {seatsLocked ? "حفظ المقاعد" : "قفل المقاعد"}
                  </button>
                </div>
              </div>
            )}
            {!picking && !isOwnTrip && (
              <div className="px-5 pb-4 text-xs" style={{ color: B.muted }}>
                عرضٌ للسعة فقط — مقاعد هذا الطلب على رحلة <b style={{ fontFamily: "var(--font-app)", color: B.text2 }}>{trip?.departureDate}</b>.
              </div>
            )}
          </>
        )}
      </div>

      {/* ══ ٥ · تفاصيل أكثر ══ */}
      {details && (
        <div className="rounded-2xl p-5 mt-3 flex flex-col gap-5" style={{ ...card, maxWidth: SHEET }}>
          <div>
            <div className="text-xs font-bold mb-2.5" style={{ color: B.text2 }}>بيانات صاحب الطلب</div>
            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${B.border}` }}>
              {booking.pilgrims.map((pg, i) => (
                <div key={i} className="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2.5"
                  style={{ borderTop: i ? `1px solid ${B.border}` : "none", background: i % 2 ? "#FDFCFA" : "#fff" }}>
                  <span className="font-bold text-sm" style={{ color: B.black, minWidth: 150 }}>{pg.name || `معتمر ${i + 1}`}</span>
                  <span className="text-xs" style={{ color: B.text2, fontFamily: "var(--font-app)" }}>
                    {numberLabelOf(pg.docType, pg.idNumber)}: {pg.idNumber || "—"}
                  </span>
                  <span className="text-xs" style={{ color: B.text2 }}>{pg.nationality || "—"}</span>
                  <span className="text-xs" style={{ color: B.text2, fontFamily: "var(--font-app)" }}>{pg.birthDate || "—"}</span>
                  <span className="text-xs" style={{ color: B.text2 }}>{pg.gender === "female" ? "أنثى" : "ذكر"}</span>
                  {booking.seats[i] != null && <span className="text-xs font-bold" style={{ color: "#8a6a08" }}>مقعد {booking.seats[i]}</span>}
                  {verifyState(pg) === "stale" && <span className="text-xs font-bold" style={{ color: "#B4530C" }}>عُدِّلت بعد التحقق</span>}
                </div>
              ))}
              {!booking.pilgrims.length && <div className="px-4 py-3 text-sm" style={{ color: B.muted }}>لا بيانات معتمرين في هذا الطلب.</div>}
            </div>
          </div>

          <div>
            <div className="text-xs font-bold mb-2.5" style={{ color: B.text2 }}>نقطة الانطلاق والغرف</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { l: "نقطة الانطلاق", v: trip?.departurePoint || "—" },
                { l: "مدينة الانطلاق", v: trip?.departureCity || "—" },
                { l: "الباص", v: [trip?.busCode, trip?.busPlate].filter(Boolean).join(" · ") || "—" },
                { l: "مصدر الطلب", v: booking.source === "internal" ? `داخلي · ${booking.staff || "—"}` : "من التطبيق" },
              ].map(f => (
                <div key={f.l} className="min-w-0">
                  <div className="text-xs font-semibold mb-0.5" style={{ color: B.muted }}>{f.l}</div>
                  <div className="font-bold text-sm truncate" style={{ color: B.black }}>{f.v}</div>
                </div>
              ))}
            </div>
            {!!booking.rooms?.length && (
              <div className="flex flex-wrap gap-2 mt-3">
                {booking.rooms.map((r, i) => (
                  <span key={i} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: B.fill, border: `1px solid ${B.border}`, color: B.text2 }}>
                    غرفة {i + 1} · {r.type} · سعة {r.persons} · <b style={{ fontFamily: "var(--font-app)", color: B.black }}>{sar(r.perNight)}</b> لليلة
                  </span>
                ))}
              </div>
            )}
          </div>

          {invoice && (
            <div className="flex flex-wrap items-center gap-4 rounded-xl px-4 py-3" style={{ background: B.fill, border: `1px solid ${B.border}` }}>
              <span className="text-xs font-bold" style={{ color: B.text2 }}>الفاتورة <span style={{ fontFamily: "var(--font-app)", color: B.black }}>{invoice.id}</span></span>
              <span className="text-xs" style={{ color: B.text2 }}>الإجمالي <b style={{ fontFamily: "var(--font-app)", color: B.black }}>{sar(invoice.total)}</b></span>
              {booking.payMethod && <span className="text-xs" style={{ color: B.text2 }}>{booking.payMethod}{booking.payDate ? ` · ${booking.payDate}` : ""}</span>}
              <button onClick={() => setInvoiceOpen(true)} className="text-xs font-bold cursor-pointer mr-auto"
                style={{ background: "none", border: "none", color: B.text2, textDecoration: "underline" }}>فتح الفاتورة</button>
            </div>
          )}

          <div>
            <div className="text-xs font-bold mb-2.5" style={{ color: B.text2 }}>سجلّ الطلب</div>
            <EventTimeline docType="booking" docId={booking.id} title="" flat outcomes={SEND_OUTCOMES} reloadKey={evKey} />
          </div>
        </div>
      )}

      <AnimatePresence>
        {pending && (
          <ConfirmTransition t={pending} booking={{ id: booking.id, clientName: booking.clientName }} busy={busy === "close"}
            onCancel={() => setPending(null)} onConfirm={v => { void runClose(pending, v); }} />
        )}
        {invoiceOpen && activeInvoice && <InvoiceModal pay={activeInvoice} autoPrint={printDoc === "invoice"} onClose={closeDoc} />}
        {ticketOpen && activeTicket && <TicketCard ticket={activeTicket} autoPrint={printDoc === "ticket"} onClose={closeDoc} />}
      </AnimatePresence>
    </motion.div>
  );
}
