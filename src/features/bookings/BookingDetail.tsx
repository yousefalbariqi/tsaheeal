/* شاشة الطلب — أفهمه بنظرة، وأرى مقاعده بنظرة، وأُنجزه بثلاث ضغطات.

   ثلاث طبقاتٍ لا رابع:

     ١ رأس الطلب      — من هو وأين يقف وبكم في السطر الأول، وتحته من
                        ومع من وإلى أين أزواجاً «معلومة: قيمة».
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
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  AlertTriangle, Armchair, ArrowRight, Ban, Check, ChevronDown, CircleX, Copy, FileText, Info, Lock, Mail,
  MessageCircle, MoreHorizontal, Pencil, Percent, Phone, Send, Star, Ticket, UserRound, Wallet,
} from "lucide-react";
import { B, DUR, EASE, ELEV, TONE } from "@/lib/theme";
import type { Booking, BookingStatus, BookingTravellerCounts, Payment, Pilgrim, Pkg, TicketEntry, Trip } from "@/types";
import { copyText, invVerifyUrl, openWhatsApp, payLinkFor, todayYMD } from "@/lib/utils";
import { sar } from "@/lib/money";
import { fmtDate, fmtDateShort, fmtDateTime, fmtDayDate, fmtTime } from "@/lib/dates";
import { isSellable, seatsOf } from "@/lib/trip";
import { AppSelect } from "@/components/AppSelect";
import { NationalitySelect } from "@/components/NationalitySelect";
import { ArabicDatePicker } from "@/components/ArabicDatePicker";
import { DOC_TYPES, docTypeDef, guessDocType, numberLabelOf } from "@/data/docTypes";
import { BusSeatGrid, SEAT_TONE } from "@/components/BusSeatGrid";
import { busCountOf, privacyPairLabel, seatLabel, seatsLabel, tripPrivacyPartner } from "@/lib/buses";
import { Field } from "@/components/Field";
import { NumericInput } from "@/components/NumericInput";
import { Spinner } from "@/components/Spinner";
import { EventTimeline } from "@/components/EventTimeline";
import { Badge, Button, IconButton, Input, Note } from "@/components/ui";
import { useStore, flushSync, clearSyncError } from "@/store/useStore";
import { useRole } from "@/lib/useRole";
import { InvoiceModal } from "@/features/payments";
import { TicketCard } from "@/features/tickets";
import { logDocEvent, SEND_OUTCOMES } from "@/features/docs/docEvents";
import { blockingGaps, isStale, staleDays, type FlowCtx, type Transition } from "./flow";
import { closeActions, closedAs, stageLabel, stageOf } from "./stages";
import { afterEdit, allVerified as everyVerified, markVerified, verifyState } from "./verification";
import { ConfirmTransition, type TransitionSubmit } from "./ConfirmTransition";
import { acceptBooking, applyDiscount, cancelBooking, rejectBooking } from "./ops";
import { toast } from "sonner";

const validPhone = (p: string) => /^(05\d{8}|(\+?966)5\d{8})$/.test(p.replace(/\s/g, ""));

/* الإطلاق التجريبي: لا تُثبت اللوحة إلا تحويلاتٍ راجعها الموظف. */
const PAY_METHODS = ["تحويل بنكي"];

type WorkState = "ready" | "done" | "blocked";
const SHEET = 1080;
/* الرقم اللاتيني داخل سطرٍ عربي: يُعزل اتجاهه ويُحاذى إلى بداية السطر. */
const LTR = { direction: "ltr", unicodeBidi: "isolate", textAlign: "end" } as const;

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

/** نقطةٌ بلون الجنس في الكروكي — تربط الحقل بمفتاح الألوان تحته. */
function GenderDot({ g }: { g: "male" | "female" }) {
  return <span aria-hidden className="inline-block rounded-full align-middle" style={{ width: 8, height: 8, marginInlineEnd: 6, background: SEAT_TONE[g].fg }} />;
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
  const num = { textAlign: "center", direction: "ltr" } as const;
  return (
    <div className="rounded-xl p-4" style={{ background: B.fill, border: `1px solid ${B.border}` }}>
      <div className="text-sm font-bold" style={{ color: B.black }}>توزيع هذا الحجز</div>
      <div className="ui-hint" style={{ marginTop: 2 }}>حدّده مرّةً واحدة لتُلوَّن مقاعده في الكروكي.</div>
      <div className="flex flex-wrap items-end gap-3 mt-3">
        <div style={{ width: 104 }}>
          <Field label={<><GenderDot g="male" />المعتمرون</>}>
            <NumericInput min={0} max={people - women} value={men} onValueChange={v => setMen(Math.min(Math.max(0, Number(v) || 0), people - women))} className="ui-input" style={num} />
          </Field>
        </div>
        <div style={{ width: 104 }}>
          <Field label={<><GenderDot g="female" />المعتمرات</>}>
            <NumericInput min={0} max={people - men} value={women} onValueChange={v => setWomen(Math.min(Math.max(0, Number(v) || 0), people - men))} className="ui-input" style={num} />
          </Field>
        </div>
        <Button variant="dark" onClick={save}>حفظ التوزيع</Button>
        <Badge tone={total === people ? "success" : "warn"}>{total} / {people}</Badge>
      </div>
    </div>
  );
}

/* ════════ قِطَعٌ صغيرة ════════════════════════════════════════════ */

/** «معلومة: قيمة» في رأس الطلب — تسميةٌ خافتة فوق قيمةٍ تُقرأ.

    كانت خاناتٍ بحدودٍ على كل خليّة؛ عشرة مربّعاتٍ بوزنٍ واحد لا يُعرف
    أيّها يُقرأ أولاً. صارت أزواجاً بلا حدود: الفراغ يفصل، والاسم
    والمبلغ والخطوة يصعدون إلى الرأس. */
function Fact({ label, children, sub, ltr, className }: { label: string; children: ReactNode; sub?: ReactNode; ltr?: boolean; className?: string }) {
  return (
    <div className={`ts-kv ${className ?? ""}`}>
      <span className="ts-kv-k">{label}</span>
      <span className="ts-kv-v" style={ltr ? LTR : undefined}>{children}</span>
      {sub && <span className="text-xs" style={{ color: B.muted, lineHeight: 1.5 }}>{sub}</span>}
    </div>
  );
}

/** شارة الخطوة — نفس صياغة وألوان عمود «الخطوة» في جدول الطلبات
    (StageBadge هناك): من فتح الطلب من الجدول يقرأ هنا ما قرأه هناك. */
function StageTag({ booking }: { booking: Booking }) {
  const closed = closedAs(booking.status);
  if (closed) return <Badge tone={closed === "rejected" ? "danger" : "neutral"} dot>{closed === "rejected" ? "مرفوض" : "ملغى"}</Badge>;
  const stage = stageOf(booking);
  const tone = booking.status === "confirmed" || stage === "done" ? "success" : stage === "verify" ? "warn" : stage === "seats" ? "info" : "gold";
  return <Badge tone={tone} dot>{stageLabel(stage)}</Badge>;
}

/** زرّ عملٍ واحد: مضيءٌ إن كان دوره، علامة تمامٍ إن تمّ، مقفلٌ إن لم يحن.

    سطران في كل زرّ: الفعل، وتحته سببُ حاله — «بعد التحقق من البيانات»
    تحت زرٍّ مقفل تُغني عن التخمين لماذا لا يُضغط. والذهبي للزرّ الذي
    عليه الدور وحده (`primary`)؛ زرٌّ جاهزٌ وليس دوره يبقى أبيض. */
function WorkButton({ state, primary, label, doneLabel, hint, icon: Icon, busy, onClick }: {
  state: WorkState; primary?: boolean; label: string; doneLabel: string; hint: string;
  icon: typeof Check; busy?: boolean; onClick: () => void;
}) {
  const done = state === "done";
  const ready = state === "ready";
  const box = { width: "100%", height: 60, padding: "0 16px", borderRadius: 14, gap: 12, justifyContent: "flex-start", lineHeight: 1.3 } as const;
  const inner = (
    <>
      <span className="flex items-center justify-center flex-shrink-0" style={{ width: 20 }}>
        {busy ? <Spinner size={15} color={B.black} track="rgba(27,23,18,0.25)" />
          : done ? <Check size={18} /> : ready ? <Icon size={18} /> : <Lock size={16} />}
      </span>
      <span className="flex flex-col items-start min-w-0 text-start" style={{ gap: 2 }}>
        <span className="truncate max-w-full" style={{ fontSize: 15, fontWeight: 600 }}>{done ? doneLabel : label}</span>
        <span className="truncate max-w-full" style={{ fontSize: 12, fontWeight: 400, opacity: ready && primary ? 0.82 : 1 }}>{hint}</span>
      </span>
    </>
  );
  if (done) {
    return (
      <div className="flex items-center" title={`${doneLabel} — ${hint}`}
        style={{ ...box, background: TONE.success.bg, border: `1px solid ${TONE.success.line}`, color: TONE.success.fg }}>{inner}</div>
    );
  }
  if (!ready) {
    return (
      <button type="button" disabled title={`${label} — ${hint}`} className="flex items-center"
        style={{ ...box, background: B.fill, border: `1px solid ${B.border}`, color: B.text2, fontFamily: "inherit" }}>{inner}</button>
    );
  }
  return (
    <button type="button" onClick={() => { if (!busy) onClick(); }} disabled={busy} aria-busy={busy || undefined} title={label}
      className={`ui-btn ui-btn--${primary ? "primary" : "secondary"}`} style={box}>{inner}</button>
  );
}

type MenuItem = { label: string; icon?: typeof Check; danger?: boolean; onClick: () => void };

/** قائمة «⋯» — الرفض والإلغاء والخصم: موجودةٌ ولا تُزاحم.

    تُغلق بالنقر خارجها وبخروج التركيز منها وبـEscape. كانت تُغلق عند
    خروج التركيز من زرّها وحده — فمن ينتقل بلوحة المفاتيح إلى بندٍ
    تُغلق القائمة تحته قبل أن يضغطه. */
function MoreMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  if (!items.length) return null;

  const move = (dir: 1 | -1) => {
    const els = Array.from(wrap.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    if (!els.length) return;
    const at = els.indexOf(document.activeElement as HTMLButtonElement);
    els[at < 0 ? (dir === 1 ? 0 : els.length - 1) : (at + dir + els.length) % els.length].focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" && open) { e.stopPropagation(); setOpen(false); trigger.current?.focus(); }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const dir = e.key === "ArrowDown" ? 1 : -1;
      if (open) move(dir); else { setOpen(true); setTimeout(() => move(dir)); }
    }
  };
  const firstDanger = items.findIndex(it => it.danger);
  return (
    <div ref={wrap} className="relative flex-shrink-0" onKeyDown={onKeyDown}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false); }}>
      <IconButton ref={trigger} label="إجراءات أخرى" variant="outline" onClick={() => setOpen(o => !o)}
        aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}>
        <MoreHorizontal size={18} />
      </IconButton>
      {open && (
        <div id={menuId} role="menu" aria-label="إجراءات أخرى" className="absolute z-30 flex flex-col"
          style={{ top: "calc(100% + 6px)", insetInlineEnd: 0, minWidth: 216, padding: 4, borderRadius: 12, background: B.surface, border: `1px solid ${B.border}`, boxShadow: ELEV[3] }}>
          {items.map((it, i) => (
            <div key={it.label} role="none">
              {i === firstDanger && i > 0 && <div role="separator" style={{ height: 1, margin: "4px 8px", background: B.border }} />}
              <button type="button" role="menuitem" onMouseDown={e => e.preventDefault()}
                onClick={() => { setOpen(false); it.onClick(); }}
                className={`w-full flex items-center gap-2.5 rounded-lg px-3 text-start text-sm cursor-pointer whitespace-nowrap ${it.danger
                  ? "hover:bg-[var(--k-danger-bg)] focus-visible:bg-[var(--k-danger-bg)]"
                  : "hover:bg-[var(--k-fill)] focus-visible:bg-[var(--k-fill)]"}`}
                style={{ height: 38, fontWeight: 500, fontFamily: "inherit", color: it.danger ? TONE.danger.fg : B.text3, filter: "none", outlineOffset: -2 }}>
                {it.icon && <it.icon size={16} aria-hidden style={{ flexShrink: 0 }} />}
                {it.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** لوحةٌ تُفتح في مكانها داخل بطاقة الرأس — التعديل والخصم. */
function InlinePanel({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl p-4 flex flex-col gap-4" style={{ background: B.bg, border: `1px solid ${B.border}` }}>
      <div>
        <div className="text-sm font-bold" style={{ color: B.black }}>{title}</div>
        {note && <div className="ui-hint" style={{ marginTop: 2 }}>{note}</div>}
      </div>
      {children}
    </div>
  );
}

/* ════════ الخصم الموثَّق — للمدير ════════ */
function DiscountPanel({ booking, onClose, onDone }: { booking: Booking; onClose: () => void; onDone: () => Promise<void> }) {
  const [pct, setPct] = useState(String(booking.discountPercent ?? ""));
  const [reason, setReason] = useState(booking.discountReason ?? "");
  const [busy, setBusy] = useState(false);
  /* خطأ الإدخال تحت حقله لا في إشعارٍ يزول؛ وردُّ القاعدة يبقى إشعاراً. */
  const [err, setErr] = useState<{ pct?: string; reason?: string }>({});
  async function save() {
    const p = Number(pct);
    if (Number.isNaN(p) || p < 0 || p > 100) { setErr({ pct: "النسبة بين 0 و100" }); return; }
    if (p > 0 && !reason.trim()) { setErr({ reason: "سبب الخصم إلزامي" }); return; }
    setErr({});
    setBusy(true);
    const r = await applyDiscount(booking.id, p, reason.trim());
    setBusy(false);
    if (r.unsupported) { toast.info("الخصم الموثَّق يحتاج ترحيل 20260910 على القاعدة."); return; }
    if (r.error) { toast.error(r.error); return; }
    toast.success(p > 0 ? `اعتُمد خصم ${p}% — الإجمالي ${sar(r.total ?? 0)}` : "أُلغي الخصم");
    onClose(); await onDone();
  }
  return (
    <InlinePanel title="خصم موثَّق"
      note="يُسجَّل باسمك ووقته وسببه ويظهر سطراً في الفاتورة. يُحسب من السعر الأصلي لا من الإجمالي الحالي.">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div>
          <Field label="النسبة %" error={err.pct}>
            <NumericInput min={0} max={100} className="ui-input" style={{ direction: "ltr", textAlign: "end" }} value={pct}
              onValueChange={v => { setPct(v); setErr({}); }} />
          </Field>
        </div>
        <div className="sm:col-span-3">
          <Field label="السبب" error={err.reason}>
            <Input value={reason} invalid={!!err.reason} placeholder="عميل متكرر · مجموعة · تعويض" onChange={e => { setReason(e.target.value); setErr({}); }} />
          </Field>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="dark" loading={busy} onClick={save}>{busy ? "جارٍ الحفظ…" : "اعتماد"}</Button>
        <Button variant="ghost" disabled={busy} onClick={onClose}>إغلاق</Button>
      </div>
    </InlinePanel>
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
  /* الحجوزات الداخلية القديمة كانت تُنشأ بلا صف صاحب الطلب. نبدأ لها
     صفاً جاهزاً باسم وجوال الحجز كي يصبح إدخال الهوية تصحيحاً بسيطاً لا
     شاشةً فارغة لا يمكن العمل فيها. */
  const [rows, setRows] = useState<Pilgrim[]>(() => booking.pilgrims.length
    ? booking.pilgrims.map(p => ({ ...p }))
    : [{
      name: booking.clientName, docType: "national_id", idNumber: "", nationality: "سعودي",
      gender: booking.travellerCounts?.women && !booking.travellerCounts?.men ? "female" : "male",
      birthDate: "", phone: booking.clientPhone,
    }]);
  const [err, setErr] = useState<string | null>(null);
  const set = (i: number, k: keyof Pilgrim, v: unknown) =>
    setRows(rs => rs.map((r, idx) => idx === i ? { ...r, [k]: v } : r));

  const pilgrimsChanged = useMemo(
    () => JSON.stringify(rows) !== JSON.stringify(booking.pilgrims), [rows, booking.pilgrims]);

  const save = () => {
    const n = name.trim(), p = phone.trim();
    if (n.length < 3) { setErr("اكتب اسم العميل كاملاً."); return; }
    /* الرقم المخزَّن لا يُعاد التحقق منه: طلبٌ قديمٌ بصيغةٍ أخرى كان
       يمنع تصحيح الاسم وحده. الجديد وحده يُفحص. */
    if (p !== booking.clientPhone && !validPhone(p)) { setErr("رقم جوال غير صحيح — 05xxxxxxxx."); return; }
    if (rows.some(row => !(row.name ?? "").trim() || !(row.idNumber ?? "").trim())) {
      setErr("أكمل اسم صاحب الطلب ورقم هويته أو جوازه قبل الحفظ."); return;
    }
    const clientChanged = n !== booking.clientName || p !== booking.clientPhone;
    if (!clientChanged && !pilgrimsChanged) { onCancel(); return; }
    onSave(
      clientChanged ? { clientName: n, clientPhone: p } : null,
      pilgrimsChanged ? rows.map((r, i) => booking.pilgrims[i] ? afterEdit(booking.pilgrims[i], r) : r) : null,
    );
  };

  return (
    <InlinePanel title="تعديل البيانات"
      note="الباقة والرحلة وعدد المعتمرين لا تُصحَّح هنا — تغييرها يغيّر السعر والمقاعد.">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" style={{ maxWidth: 560 }}>
        <div>
          <Field label="اسم العميل">
            <Input value={name} onChange={e => { setName(e.target.value); setErr(null); }} />
          </Field>
        </div>
        <div>
          <Field label="الجوال">
            <Input style={{ direction: "ltr", textAlign: "end" }} value={phone} placeholder="05xxxxxxxx" inputMode="tel"
              onChange={e => { setPhone(e.target.value); setErr(null); }} />
          </Field>
        </div>
      </div>

      {rows.map((p, i) => (
        <fieldset key={i} className="grid grid-cols-2 lg:grid-cols-12 gap-3 m-0 p-0 min-w-0 pt-4"
          style={{ border: 0, borderTop: `1px solid ${B.border}` }}>
          <legend className="sr-only">معتمر {i + 1}</legend>
          <div className="col-span-2 lg:col-span-3">
            <Field label={`معتمر ${i + 1}`}>
              <Input value={p.name ?? ""} placeholder="الاسم الكامل" onChange={e => set(i, "name", e.target.value)} />
            </Field>
          </div>
          <div className="col-span-2 sm:col-span-1 lg:col-span-2">
            <Field label="الوثيقة">
              <AppSelect value={p.docType ?? guessDocType(p.idNumber)} onChange={v => set(i, "docType", v)}
                options={DOC_TYPES.map(d => ({ value: d.value, label: d.label.ar }))} />
            </Field>
          </div>
          <div className="col-span-2 sm:col-span-1 lg:col-span-2">
            <Field label={numberLabelOf(p.docType, p.idNumber)}>
              <Input style={{ direction: "ltr", textAlign: "end" }} value={p.idNumber ?? ""}
                placeholder={docTypeDef(p.docType).placeholder} onChange={e => set(i, "idNumber", e.target.value)} />
            </Field>
          </div>
          <div className="col-span-2 sm:col-span-1 lg:col-span-3">
            <Field label="الجنسية">
              <NationalitySelect value={p.nationality} onChange={v => set(i, "nationality", v)} subInTrigger={false} compact />
            </Field>
          </div>
          <div className="col-span-2 sm:col-span-1 lg:col-span-2">
            <Field label="الميلاد">
              <ArabicDatePicker value={p.birthDate ?? ""} onChange={v => set(i, "birthDate", v)} placeholder="يوم/شهر/سنة" />
            </Field>
          </div>
        </fieldset>
      ))}

      {err && <div role="alert" className="ui-error" style={{ marginTop: 0 }}>{err}</div>}
      <div className="flex gap-2 flex-wrap">
        <Button variant="dark" onClick={save}>حفظ</Button>
        <Button variant="secondary" onClick={onCancel}>إلغاء</Button>
      </div>
    </InlinePanel>
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
  const navigate = useNavigate();
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
  const [transferRef, setTransferRef] = useState(booking.txnNo && booking.txnNo !== "—" ? booking.txnNo : "");

  const linkedBeneficiaries = beneficiaries.filter(x => x.bookingIds.includes(booking.id));
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
    beneficiaryLinked: linkedBeneficiaries.length > 0,
  };
  const closed = closedAs(booking.status);
  /* المقعد كما يُقرأ: «باص ٢ · ٣» حين تتعدّد باصات الرحلة، والرقم وحده
     في الباص الواحد. والمخزَّن رقم الرحلة كما هو. */
  const multiBus = !!trip && busCountOf(trip) > 1;
  const seatText = (list: number[]) => trip ? seatsLabel(trip, list) : list.join("، ");
  const oneSeat = (n?: number) => n == null ? "—" : trip ? seatLabel(trip, n) : String(n);
  const pairText = (seat?: number, privacy?: number) => trip ? privacyPairLabel(trip, seat, privacy) : `${seat ?? "—"} · خصوصية ${privacy ?? "—"}`;
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
     واحدٌ مضيءٌ هو الدور، وما قبله بعلامة التمام، وما بعده مقفل. */
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
      if (needsPrivacySeat && (!shownTrip || !tripPrivacyPartner(shownTrip, n))) {
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
        if (!shownTrip || tripPrivacyPartner(shownTrip, prev[0]) !== n) {
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
    toast.success("متحقق — التالي: اختيار المقاعد");
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
          ? `نُقل مقعد المعتمرة إلى ${oneSeat(sel[0])} وفُرّغ ${oneSeat(sel[1])} للخصوصية.`
          : `حُفظت المقاعد ${seatText(sel)}`);
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
        ? `قُفل المقعد ${oneSeat(sel[0])} وفُرّغ المقعد المجاور ${oneSeat(sel[1])} للخصوصية.`
        : `قُفلت المقاعد ${seatText(sel)}`);
      return;
    }
    /* قاعدةٌ بلا ترحيل 20260910 — الكتابة المباشرة كما كانت. */
    clearSyncError();
    onSeatsChange(booking.id, sel);
    onStatusChange(booking.id, "accepted");
    void logDocEvent("booking", booking.id, "accept", { note: `المقاعد: ${seatText(sel)}` }).then(bump);
    setBusy(null); setPicking(false);
    toast.success(`قُفلت المقاعد ${seatText(sel)}`);
  };

  const recordPayment = async () => {
    if (busy) return;
    if (!transferRef.trim()) {
      toast.error("اكتب مرجع التحويل أو رقم الإيصال بعد مراجعته.");
      return;
    }
    setBusy("pay");
    clearSyncError();
    onStatusChange(booking.id, "confirmed", { paymentStatus: "verified", payMethod: "تحويل بنكي", txnNo: transferRef.trim(), payDate: today });
    void logDocEvent("booking", booking.id, "status", { note: `→ مؤكد — استُلم ${sar(booking.total)} · تحويل بنكي · مرجع ${transferRef.trim()}` });
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
      return `مرحباً ${booking.clientName}،\nتعليمات تحويل باقة (${pkg?.name ?? "العمرة"}):\n${payLinkFor(booking.id, booking.payToken)}\nالمبلغ المطلوب: ${sar(booking.total)}\nبعد التحويل أرسل الإيصال للفريق. لا يُؤكّد السداد إلا بعد مراجعته.`;
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

  const menuItems: MenuItem[] = [
    ...(seatsLocked && booking.status === "accepted" ? [{ label: "تغيير المقاعد", icon: Armchair, onClick: startPicking }] : []),
    ...(booking.payToken && !paid
      ? [{ label: "نسخ رابط التحويل", icon: Copy, onClick: () => { copyText(payLinkFor(booking.id, booking.payToken)); toast.success("نُسخ رابط التحويل"); } }]
      : []),
    ...closeActions(flowCtx).map(t => ({ label: t.label, icon: t.to === "rejected" ? Ban : CircleX, danger: true, onClick: () => setPending(t) })),
  ];

  /* ── الذهبي لزرٍّ واحد ──
     زرّ الدور هو أوّل جاهزٍ في الصفّ. وحين يُفتح اختيار المقاعد ينتقل
     الذهبي إلى «قفل المقاعد» في شريط الكروكي، وبعد الدفع لا دور لأحد —
     فلا يبقى في الصفحة زرّان يتنازعان العين. */
  const primaryStep = picking || paid || closed ? null
    : verifyStep === "ready" ? "verify" : seatStep === "ready" ? "seats" : payStep === "ready" ? "pay" : null;
  const closedHint = "الطلب مغلق";
  const gapHint = "أكمل البيانات الناقصة أولاً";
  const verifyHint = verifyStep === "done" ? "روجعت بيانات صاحب الطلب"
    : verifyStep === "ready" ? "راجع الهويات ثم ثبّت المراجعة"
    : closed ? closedHint : gapHint;
  const seatHint = seatStep === "done" ? (needsPrivacySeat ? pairText(booking.seats[0], savedPrivacySeats[0]) : seatText(booking.seats))
    : seatStep === "ready" ? "من الكروكي أسفل الصفحة"
    : closed ? closedHint : !verified ? "بعد التحقق من البيانات" : gapHint;
  const payHint = payStep === "done"
      ? ([booking.payMethod, booking.payDate && booking.payDate !== "—" ? fmtDateShort(booking.payDate) : ""].filter(Boolean).join(" · ") || "استُلم المبلغ")
    : payStep === "ready" ? "يؤكّد الحجز ويُصدر الفاتورة والتذكرة"
    : closed ? closedHint : "بعد قفل المقاعد";

  const stale = isStale(booking, trip, today) && !closed;
  const detailsId = useId();
  const transferId = useId();
  const detailsRef = useRef<HTMLElement>(null);
  /* «تفاصيل أكثر» في صفّ الأزرار تفتح القسم وتنزل إليه: القسم تحت
     الكروكي، ومن يفتحه من أعلى الصفحة لا يرى شيئاً تغيّر. */
  const toggleDetails = (scroll: boolean) => {
    const next = !details;
    setDetails(next);
    if (next && scroll) setTimeout(() => detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };
  const picked = sel.length === seatsNeeded;
  const sectionTitle = { fontSize: 14, marginBottom: 10 } as const;

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: DUR.base, ease: EASE }}
      className="flex-1 w-full min-w-0 px-4 md:px-8 pb-12 pt-1">
      <div className="flex flex-col gap-4" style={{ maxWidth: SHEET }}>
        <div>
          <Button variant="ghost" size="sm" icon={<ArrowRight size={15} />} onClick={onBack} style={{ marginInlineStart: -8 }}>عودة للطلبات</Button>
        </div>

        {/* ══ ١ · رأس الطلب ══ */}
        <section className="ui-card" aria-label={`الطلب ${booking.id}`}>
          <div className="flex items-start gap-4 px-5 pt-5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-x-2 gap-y-1 flex-wrap text-xs" style={{ color: B.muted }}>
                <span className="font-bold" style={{ color: B.text2, direction: "ltr", unicodeBidi: "isolate" }}>{booking.id}</span>
                <span aria-hidden>·</span>
                <span>أُنشئ {fmtDateTime(booking.createdAt)}</span>
              </div>
              <div className="flex items-center gap-x-3 gap-y-2 flex-wrap mt-1.5">
                <h2 className="font-extrabold" style={{ margin: 0, fontSize: 20, lineHeight: 1.4, color: B.black }}>{booking.clientName}</h2>
                <StageTag booking={booking} />
                {stale && <Badge tone="danger">مضت رحلته قبل {staleDays(trip, today)} يوماً</Badge>}
              </div>
            </div>
            <div className="hidden sm:block text-end flex-shrink-0">
              <div className="ts-kv-k">الإجمالي</div>
              <div className="font-extrabold" style={{ fontSize: 22, lineHeight: 1.3, color: B.black, whiteSpace: "nowrap" }}>{sar(booking.total)}</div>
            </div>
            <MoreMenu items={menuItems} />
          </div>

          {/* الباقة والفندق ونوع السكن متجاورة: ثلاثتها «الرحلة» عند الموظف،
              وتفريقها يجعله يبحث عنها في ثلاثة مواضع. */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4 px-5 pt-5 pb-5">
            <Fact className="sm:hidden" label="الإجمالي">{sar(booking.total)}</Fact>
            <Fact label="الجوال" ltr>{booking.clientPhone}</Fact>
            <Fact label="الباقة">{pkg?.name ?? "—"}</Fact>
            <Fact label="الفندق">{hotel?.name ?? "—"}</Fact>
            <Fact label="نوع السكن">{booking.roomType || "—"}</Fact>
            <Fact label="عدد الأشخاص" sub={travellerSummary}>{need}</Fact>
            <Fact label="المغادرة" sub={trip?.departureTime ? fmtTime(trip.departureTime) : undefined}>{fmtDayDate(trip?.departureDate)}</Fact>
            <Fact label="العودة">{fmtDayDate(trip?.returnDate)}</Fact>
            {seatsLocked && (
              <Fact label="المقاعد">{needsPrivacySeat ? pairText(booking.seats[0], savedPrivacySeats[0]) : seatText(booking.seats)}</Fact>
            )}
            {!!booking.discountPercent && (
              <Fact label="خصم معتمد"><span style={{ color: TONE.warn.fg }}>{booking.discountPercent}%</span></Fact>
            )}
          </div>

          {booking.pricing && (
            <div className="flex items-center gap-x-6 gap-y-1.5 flex-wrap px-5 py-3 text-sm" style={{ borderTop: `1px solid ${B.border}`, background: B.bg, color: B.text2 }}>
              <span className="text-xs font-bold" style={{ color: B.muted }}>السعر المعتمد عند الحجز</span>
              <span>إجمالي المواصلات <b style={{ color: B.black }}>{sar(booking.pricing.transportTotal)}</b></span>
              <span>إجمالي السكن <b style={{ color: B.black }}>{sar(booking.pricing.accommodationTotal)}</b></span>
              <span>الإجمالي <b style={{ color: B.black }}>{sar(booking.total)}</b></span>
            </div>
          )}

          {/* ══ ٢ · صفّ التعامل مع العميل ══ */}
          <div className="flex items-center gap-2 flex-wrap px-5 py-3" style={{ borderTop: `1px solid ${B.border}` }}>
            <Button size="sm" icon={<Pencil size={14} />} aria-expanded={editing} onClick={() => setEditing(v => !v)}>{editing ? "إغلاق التعديل" : "تعديل البيانات"}</Button>
            <a href={`tel:${booking.clientPhone}`} className="ui-btn ui-btn--secondary ui-btn--sm"><Phone size={14} />اتصال</a>
            <Button size="sm" icon={<MessageCircle size={14} />} onClick={sendWhatsApp}>واتساب</Button>
            {booking.payToken && !paid && <Button size="sm" icon={<Send size={14} />} onClick={sendWhatsApp}>إرسال تعليمات التحويل</Button>}
            {isAdmin && !paid && !closed && (
              <Button size="sm" icon={<Percent size={14} />} aria-expanded={discountOpen} onClick={() => setDiscountOpen(v => !v)}>
                {booking.discountPercent ? "تعديل الخصم الموثق" : "خصم موثق"}
              </Button>
            )}
            {paid && <Button size="sm" icon={<FileText size={14} />} loading={loadingDocument === "invoice"} onClick={() => void openDocument("invoice")}>{loadingDocument === "invoice" ? "جارٍ فتح الفاتورة…" : "الفاتورة"}</Button>}
            {paid && <Button size="sm" icon={<Ticket size={14} />} loading={loadingDocument === "ticket"} onClick={() => void openDocument("ticket")}>{loadingDocument === "ticket" ? "جارٍ فتح التذكرة…" : "التذكرة"}</Button>}
            {paid && ticket && !!email && <Button size="sm" icon={<Mail size={14} />} onClick={sendEmail}>بريد</Button>}
            {linkedBeneficiaries.map(beneficiary => (
              <Button key={beneficiary.id} size="sm" icon={<UserRound size={14} />}
                onClick={() => navigate(`/admin/beneficiaries?beneficiary=${encodeURIComponent(beneficiary.id)}`)}>
                ملف المستفيد: {beneficiary.name}
              </Button>
            ))}
            <Button size="sm" variant="ghost" className="sm:ms-auto" aria-expanded={details} aria-controls={detailsId}
              iconEnd={<ChevronDown size={14} style={{ transform: details ? "rotate(180deg)" : undefined }} />}
              onClick={() => toggleDetails(true)}>{details ? "إخفاء التفاصيل" : "تفاصيل أكثر"}</Button>
          </div>

          {(discountOpen || editing) && (
            <div className="px-5 pb-5 flex flex-col gap-3">
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
        </section>

        {/* ══ ٣ · إجراءات الطلب ══
            ثلاثة أزرارٍ في صفٍّ واحد لا شريطُ مراحل (قرارٌ سابق): الموظف
            يسأل «وش أسوي الآن؟» وجوابه الزرّ الذهبي الوحيد. */}
        <section className="ui-card @container" aria-label="إجراءات الطلب">
          {/* شبكةٌ واحدة تحمل السطر الإرشادي والأزرار وحقل المرجع: الحقل فوق
              زرّ الدفع في عموده، والإرشاد يملأ ما فوق الزرّين الآخرين — فلا
              فراغَ معلّق. وعلى الشاشة الضيقة يصير عموداً واحداً والحقل قبل
              زرّه مباشرة (order). */}
          <div className="grid grid-cols-1 @[680px]:grid-cols-3 gap-3 items-end p-5">
            <div className={`order-1 self-start flex items-start gap-2.5 ${payStep === "ready" ? "@[680px]:col-span-2" : "@[680px]:col-span-3"}`}>
              {blockLine
                ? <AlertTriangle size={16} aria-hidden style={{ color: TONE.warn.fg, flexShrink: 0, marginTop: 3 }} />
                : <Info size={16} aria-hidden style={{ color: B.muted, flexShrink: 0, marginTop: 3 }} />}
              <p className="text-sm" style={{ margin: 0, lineHeight: 1.6, color: blockLine ? TONE.warn.fg : B.text3, fontWeight: blockLine ? 600 : 500 }}>{nextLine}</p>
            </div>
            {payStep === "ready" && (
              <div className="order-4 @[680px]:order-2 min-w-0">
                <label className="ui-label" htmlFor={transferId}>مرجع التحويل أو رقم الإيصال<span className="ui-req">*</span></label>
                <Input id={transferId} value={transferRef} onChange={e => setTransferRef(e.target.value)} placeholder="TRF-000000"
                  style={{ direction: "ltr", textAlign: "end" }} />
              </div>
            )}
            <div className="order-2 @[680px]:order-3 min-w-0">
              <WorkButton state={verifyStep} primary={primaryStep === "verify"} icon={Check} label="تم التحقق" doneLabel="متحقق" hint={verifyHint} onClick={runVerify} />
            </div>
            <div className="order-3 @[680px]:order-4 min-w-0">
              <WorkButton state={seatStep} primary={primaryStep === "seats"} icon={Armchair} busy={busy === "seats"}
                label={needsPrivacySeat ? "اختيار مقعدي الخصوصية" : "اختيار المقاعد"}
                doneLabel={needsPrivacySeat ? "مقعدها مقفول" : "المقاعد مقفولة"} hint={seatHint}
                onClick={startPicking} />
            </div>
            <div className="order-5 min-w-0">
              <WorkButton state={payStep} primary={primaryStep === "pay"} icon={Wallet} busy={busy === "pay"}
                label={`تم استلام ${sar(booking.total)}`} doneLabel="مدفوع" hint={payHint} onClick={recordPayment} />
            </div>
          </div>
        </section>

        {/* ══ ٤ · كروكي المقاعد ══ */}
        <section ref={croquisRef} className="ui-card" aria-label="كروكي المقاعد" style={{ scrollMarginTop: 132 }}>
          <div className="ui-card-head flex-wrap">
            <h3 className="ui-card-title flex items-center gap-2"><Armchair size={16} aria-hidden style={{ color: B.muted }} />كروكي المقاعد</h3>
            {/* تبويبات الرحلات — لا تظهر إلا إن وُجدت رحلةٌ ثانية فعلاً */}
            {croquisTrips.length > 1 && (
              <div role="group" aria-label="رحلات الباقة" className="ui-seg flex-wrap" style={{ maxWidth: "100%" }}>
                {croquisTrips.map(t => {
                  const on = t.id === shownTrip?.id;
                  return (
                    <button key={t.id} type="button" aria-pressed={on} onClick={() => { if (!picking) setTabId(t.id); }} disabled={picking}
                      title={picking ? "أنهِ اختيار المقاعد أولاً" : `رحلة ${fmtDate(t.departureDate)}${t.id === trip?.id ? " — رحلة هذا الطلب" : ""}`}
                      className="ui-seg-item" style={{ opacity: picking && !on ? 0.5 : 1 }}>
                      {t.id === trip?.id && <Star size={12} aria-label="رحلة الطلب" fill="currentColor" style={{ color: B.gold }} />}
                      {fmtDateShort(t.departureDate)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {!shownTrip || !seatStats ? (
            <div className="px-5 py-12 text-center text-sm" style={{ color: B.muted }}>الطلب بلا رحلة — لا كروكي.</div>
          ) : (
            <>
              {/* ملخّص السعة */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 px-5 py-4" style={{ borderBottom: `1px solid ${B.border}` }}>
                {[
                  { l: "إجمالي المقاعد", v: String(seatStats.capacity) },
                  { l: "المحجوز", v: String(seatStats.booked) },
                  { l: "المتبقي", v: String(seatStats.available), tone: seatStats.available > 0 ? undefined : TONE.danger.fg },
                ].map(s => (
                  <div key={s.l} className="ts-kv">
                    <span className="ts-kv-k">{s.l}</span>
                    <span className="font-extrabold" style={{ fontSize: 20, lineHeight: 1.3, color: s.tone ?? B.black }}>{s.v}</span>
                  </div>
                ))}
                <div className="ts-kv">
                  <span className="ts-kv-k">توزيع الحجوزات</span>
                  <span className="ts-kv-v" style={{ lineHeight: "26px" }}>{seatStats.m} ذكور · {seatStats.f} إناث{seatStats.children ? ` · ${seatStats.children} أطفال` : ""}</span>
                </div>
              </div>

              <div className="p-5 flex flex-col gap-4">
                {/* قد يأتي حجزٌ قديم، أو طلب داخلي قبل حفظ التوزيع. لا نخمن
                    جنس المقعد من ترتيب المقاعد أو من جنس صاحب الطلب. */}
                {seatStats.unknown > 0 && (
                  <Note tone="warn" icon={<AlertTriangle size={15} />}>
                    {seatStats.unknown} مقعد محجوز بحاجة إلى تحديد نوع المسافر؛ يظهر رمادياً حتى يُحدَّث التوزيع.
                  </Note>
                )}
                {isOwnTrip && seatStats.unknown > 0 && <TravellerDistributionFix booking={booking} onSave={counts => onTravellerCountsChange(booking.id, counts)} />}
                {isOwnTrip && needsPrivacySeat && (
                  <div className="ui-note" style={{ background: SEAT_TONE.privacy.bg, borderColor: SEAT_TONE.privacy.line, color: SEAT_TONE.privacy.fg }}>
                    <Lock size={15} aria-hidden />
                    <div className="min-w-0 flex-1">هذه معتمرة منفردة: اختر مقعدين متجاورين. الأول لها، والثاني يُفرّغ للخصوصية ولا يُباع لراكب آخر.</div>
                  </div>
                )}
                {isOwnTrip && savedCounts && savedCountTotal === need && (
                  <div className="text-sm" style={{ color: B.text2 }}>
                    رتّب المقاعد بالترتيب: <b style={{ color: SEAT_TONE.male.fg }}>{savedCounts.men} ذكور</b> أولاً، ثم <b style={{ color: SEAT_TONE.female.fg }}>{savedCounts.women} إناث</b>.
                  </div>
                )}
                <BusSeatGrid key={shownTrip?.id}
                  capacity={seatStats.capacity}
                  buses={shownTrip ? busCountOf(shownTrip) : 1}
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
                {!picking && !isOwnTrip && (
                  <div className="text-xs" style={{ color: B.muted }}>
                    عرضٌ للسعة فقط — مقاعد هذا الطلب على رحلة <b style={{ color: B.text2 }}>{fmtDate(trip?.departureDate)}</b>.
                  </div>
                )}
              </div>

              {/* شريط الاختيار — يظهر وقت الاختيار وحده، ويلتصق بأسفل الشاشة:
                  الكروكي أطول من الشاشة، ومن يختار من الصفوف الأولى لا ينزل
                  ليبحث عن زرّ القفل. */}
              {picking && (
                <div className="flex items-center gap-3 flex-wrap" role="group" aria-label="اختيار المقاعد"
                  style={{ position: "sticky", bottom: 12, zIndex: 5, margin: "0 12px 12px", padding: "10px 14px", borderRadius: 14, background: B.surface, border: `1px solid ${B.borderStrong}`, boxShadow: ELEV[3] }}>
                  <span className="text-sm font-bold" style={{ color: B.black }}>
                    {sel.length ? `المقاعد ${seatText(sel)}` : "اضغط على مقعدٍ متاح"}
                  </span>
                  <Badge tone={picked ? "success" : "neutral"}>{sel.length} / {seatsNeeded}</Badge>
                  <div className="flex items-center gap-2 ms-auto">
                    <Button variant="secondary" onClick={() => { setPicking(false); setSel([]); }}>إلغاء</Button>
                    <Button variant="primary" icon={<Check size={16} />} loading={busy === "seats"} disabled={!picked || !!busy} onClick={() => void lockSeats()}>
                      {seatsLocked ? "حفظ المقاعد" : "قفل المقاعد"}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {/* ══ ٥ · تفاصيل أكثر ══ */}
        <section ref={detailsRef} className="ui-card" style={{ scrollMarginTop: 132 }}>
          <button type="button" onClick={() => toggleDetails(false)} aria-expanded={details} aria-controls={detailsId}
            className="w-full flex items-center justify-between gap-3 px-5 py-4 text-start cursor-pointer hover:bg-[var(--k-cream)]"
            style={{ borderRadius: details ? "16px 16px 0 0" : 16, fontFamily: "inherit", filter: "none" }}>
            <span className="min-w-0">
              <span className="ui-card-title block">تفاصيل الطلب</span>
              <span className="ui-card-sub block">الهويات والمواليد والجنسيات · نقطة الانطلاق والغرف · الفاتورة · سجلّ الطلب</span>
            </span>
            <ChevronDown size={18} aria-hidden style={{ color: B.muted, flexShrink: 0, transform: details ? "rotate(180deg)" : undefined, transition: `transform ${DUR.base}s ease` }} />
          </button>
          {details && (
            <div id={detailsId} className="p-5 flex flex-col gap-6" style={{ borderTop: `1px solid ${B.border}` }}>
              <div>
                <h4 className="ts-section-title" style={sectionTitle}>معلومات الحجز</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4">
                  <Fact label="رقم الحجز" ltr>{booking.id}</Fact>
                  <Fact label="تاريخ الإنشاء">{fmtDate(booking.createdAt)}</Fact>
                  <Fact label="الحالة"><StageTag booking={booking} /></Fact>
                  <Fact label="الإجمالي">{sar(booking.total)}</Fact>
                </div>
              </div>
              <div>
                <h4 className="ts-section-title" style={sectionTitle}>بيانات صاحب الطلب</h4>
                {!booking.pilgrims.length ? (
                  <div className="rounded-xl px-4 py-5 text-sm text-center" style={{ border: `1px dashed ${B.borderStrong}`, color: B.muted }}>
                    <div>لا توجد هوية محفوظة لصاحب هذا الطلب.</div>
                    <Button size="sm" variant="secondary" className="mt-3" onClick={() => setEditing(true)}>إضافة رقم الهوية والبيانات</Button>
                  </div>
                ) : (
                  <>
                    <div className="hidden md:block ui-table-wrap" style={{ boxShadow: "none", borderRadius: 12 }}>
                      <div className="ui-table-scroll">
                        <table className="ui-table" style={{ minWidth: 640 }}>
                          <thead>
                            <tr><th>الاسم</th><th>الوثيقة</th><th>الجنسية</th><th>الميلاد</th><th>الجنس</th><th>المقعد</th></tr>
                          </thead>
                          <tbody>
                            {booking.pilgrims.map((pg, i) => (
                              <tr key={i}>
                                <td>
                                  <div className="cell-main nowrap">{pg.name || `معتمر ${i + 1}`}</div>
                                  {verifyState(pg) === "stale" && <div className="cell-sub" style={{ color: TONE.warn.fg, fontWeight: 600 }}>عُدِّلت بعد التحقق</div>}
                                </td>
                                <td className="nowrap">
                                  <div style={{ direction: "ltr", unicodeBidi: "isolate", textAlign: "end" }}>{pg.idNumber || "—"}</div>
                                  <div className="cell-sub">{numberLabelOf(pg.docType, pg.idNumber)}</div>
                                </td>
                                <td className="nowrap" style={{ color: B.text3 }}>{pg.nationality || "—"}</td>
                                <td className="nowrap" style={{ color: B.text3 }}>{fmtDate(pg.birthDate)}</td>
                                <td className="nowrap" style={{ color: B.text3 }}>{pg.gender === "female" ? "أنثى" : "ذكر"}</td>
                                <td className="nowrap">{booking.seats[i] != null ? oneSeat(booking.seats[i]) : "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div className="md:hidden flex flex-col gap-2.5">
                      {booking.pilgrims.map((pg, i) => (
                        <div key={i} className="rounded-xl p-4" style={{ border: `1px solid ${B.border}` }}>
                          <div className="font-bold" style={{ color: B.black, fontSize: 15 }}>{pg.name || `معتمر ${i + 1}`}</div>
                          {verifyState(pg) === "stale" && <div className="text-xs font-bold mt-0.5" style={{ color: TONE.warn.fg }}>عُدِّلت بعد التحقق</div>}
                          <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-3">
                            <Fact label={numberLabelOf(pg.docType, pg.idNumber)} ltr>{pg.idNumber || "—"}</Fact>
                            <Fact label="الجنسية">{pg.nationality || "—"}</Fact>
                            <Fact label="الميلاد">{fmtDate(pg.birthDate)}</Fact>
                            <Fact label="الجنس">{pg.gender === "female" ? "أنثى" : "ذكر"}</Fact>
                            {booking.seats[i] != null && <Fact label="المقعد">{oneSeat(booking.seats[i])}</Fact>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div>
                <h4 className="ts-section-title" style={sectionTitle}>نقطة الانطلاق والغرف</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4">
                  <Fact label="نقطة الانطلاق">{trip?.departurePoint || "—"}</Fact>
                  <Fact label="مدينة الانطلاق">{trip?.departureCity || "—"}</Fact>
                  {/* رقم الباص واللوحة قد يجمعان لاتينيةً وعربيةً وأرقاماً.
                      عزلهما LTR يمنع قلب اللوحة إلى «0000أأأ» داخل السطر العربي. */}
                  <Fact label="الباص" ltr>{[trip?.busCode, trip?.busPlate].filter(Boolean).join(" · ") || "—"}</Fact>
                  <Fact label="مصدر الطلب">{booking.source === "internal" ? `داخلي · ${booking.staff || "—"}` : "من التطبيق"}</Fact>
                </div>
                {!!booking.rooms?.length && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    {booking.rooms.map((r, i) => (
                      <span key={i} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: B.fill, border: `1px solid ${B.border}`, color: B.text2 }}>
                        غرفة {i + 1} · {r.type} · سعة {r.persons} · <b style={{ color: B.black }}>{sar(r.perNight)}</b> لليلة
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {invoice && (
                <div>
                  <h4 className="ts-section-title" style={sectionTitle}>الفاتورة</h4>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl px-4 py-3" style={{ background: B.fill, border: `1px solid ${B.border}` }}>
                    <Fact label="رقم الفاتورة" ltr>{invoice.id}</Fact>
                    <Fact label="الإجمالي">{sar(invoice.total)}</Fact>
                    {booking.payMethod && (
                      <Fact label="طريقة الدفع">{booking.payMethod}{booking.payDate && booking.payDate !== "—" ? ` · ${fmtDate(booking.payDate)}` : ""}</Fact>
                    )}
                    <Button size="sm" className="ms-auto" icon={<FileText size={14} />} onClick={() => setInvoiceOpen(true)}>فتح الفاتورة</Button>
                  </div>
                </div>
              )}

              <div>
                <h4 className="ts-section-title" style={sectionTitle}>سجلّ الطلب</h4>
                <EventTimeline docType="booking" docId={booking.id} title="" flat outcomes={SEND_OUTCOMES} reloadKey={evKey} />
              </div>
            </div>
          )}
        </section>
      </div>

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
