/* الطلبات المخصّصة — الباقة التي يصمّمها العميل ويجهّزها الفريق يدوياً.
   ليست حجزاً: لا مقاعد ولا غرف. الشاشة تعرض الطلب كاملاً وتتيح نقل حالته
   والتواصل عبر واتساب مباشرة برسالة تحمل تفاصيل طلبه. */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { Sparkles, ArrowRight, ChevronLeft, SearchX } from "lucide-react";
import { B } from "@/lib/theme";
import { useDebounced } from "@/lib/useDebounced";
import { EntityGate, EmptyState } from "@/components/States";
import { CUSTOM_CLOSE_REASONS, type CustomRequest, type CustomReqStatus, type CustomCloseReason } from "@/types";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { AppSelect } from "@/components/AppSelect";
import { openWhatsApp } from "@/lib/utils";
import { statusLabel } from "@/lib/status";
import { fmtDate, fmtDateShort } from "@/lib/dates";
import { useRole } from "@/lib/useRole";
import { EntityActions } from "@/components/EntityActions";
import { WhatsAppGlyph } from "@/components/WhatsAppFab";
import { setArchiveReason, permanentlyDelete } from "@/data/repository";
import { writeLocalOnly } from "@/store/useStore";
import { toast } from "sonner";
import { useStore } from "@/store/useStore";
import { Pager, usePaged } from "@/components/Pager";
import { Button, FilterChips, Note, type ChipOption } from "@/components/ui";

/* ترتيب الحالات في المسار. الصياغة واللون من المعجم (lib/status) — كانت هنا
   خريطةٌ محلية تقول «تحوّل إلى حجز» والمعجم يقول «محوّل إلى طلب». */
const STATUSES: CustomReqStatus[] = ["new", "contacted", "quoted", "converted", "executing", "completed", "closed"];
const label = (s: CustomReqStatus) => statusLabel(s, "request");

function waMessage(r: CustomRequest) {
  return [
    `مرحباً ${r.name}،`,
    `بخصوص طلبك للباقة المخصّصة رقم ${r.id}:`,
    `• الذهاب: ${r.departDate} — العودة: ${r.returnDate}`,
    `• عدد المعتمرين: ${r.persons}`,
    `• الوجهة: ${r.destination}`,
    `• السكن: ${r.roomType} — ${r.hotelLevel}`,
    "",
    "نودّ تأكيد التفاصيل لتجهيز العرض المناسب.",
  ].join("\n");
}

/* ════════ تفاصيل طلب واحد ════════ */
function Detail({ req, onBack }: { req: CustomRequest; onBack: () => void }) {
  const setRequests = useStore(s => s.setCustomRequests);
  const { canWrite, isAdmin } = useRole();
  const patch = (p: Partial<CustomRequest>) =>
    setRequests(prev => prev.map(x => (x.id === req.id ? { ...x, ...p } : x)));
  const drop = () => { onBack(); setRequests(prev => prev.filter(x => x.id !== req.id)); };

  /* الإغلاق يحتاج سبباً من القائمة الأربعة — يُختار قبل أن تُكتب الحالة. */
  const [closing, setClosing] = useState(false);
  const [closeReason, setCloseReason] = useState<CustomCloseReason | "">(req.closeReason ?? "");

  function changeStatus(v: CustomReqStatus) {
    if (v === "closed") { setClosing(true); return; }
    setClosing(false);
    patch({ status: v, closeReason: undefined });
  }
  function confirmClose() {
    if (!closeReason) { toast.error("اختر سبب الإغلاق"); return; }
    patch({ status: "closed", closeReason });
    setClosing(false);
  }

  const kv = (l: string, v?: string | number | null, wide = false) => (
    <div key={l} className={`ts-kv${wide ? " sm:col-span-2 lg:col-span-3" : ""}`}>
      <span className="ts-kv-k">{l}</span>
      <span className="ts-kv-v" style={wide ? { fontWeight: 400, lineHeight: 1.8 } : undefined}>{v || "—"}</span>
    </div>
  );

  return (
    <main className="flex-1 px-4 md:px-8 pb-10 pt-1" style={{ maxWidth: 980 }}>
      <button type="button" onClick={onBack} className="ui-btn ui-btn--ghost ui-btn--sm mb-3" style={{ marginInlineStart: -8 }}>
        <ArrowRight size={15} />الطلبات المخصّصة
      </button>

      {/* رأس السجل: من هو، وأين يقف طلبه، والفعل التالي. */}
      <section className="ui-card p-5">
        <div className="flex items-start flex-wrap gap-x-4 gap-y-3">
          <div className="flex-1 min-w-0" style={{ minWidth: 220 }}>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: B.black, lineHeight: 1.4 }}>{req.name}</h2>
              <StatusBadge status={req.status} entity="request" />
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-1" style={{ fontSize: 13, color: B.muted }}>
              <bdi dir="ltr">{req.phone}</bdi><span aria-hidden>·</span><bdi>{req.id}</bdi><span aria-hidden>·</span><span>أُرسل {fmtDate(req.createdAt)}</span>
            </div>
          </div>
          <Button variant="secondary" icon={<span style={{ color: "#25D366", display: "inline-flex" }}><WhatsAppGlyph size={17} /></span>}
            onClick={() => openWhatsApp(req.phone, waMessage(req))}>واتساب</Button>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mt-5 pt-5" style={{ borderTop: `1px solid ${B.border}` }}>
          <div>
            <span className="ui-label">حالة الطلب</span>
            <AppSelect ariaLabel="حالة الطلب" value={closing ? "closed" : req.status} onChange={v => changeStatus(v as CustomReqStatus)}
              options={STATUSES.map(s => ({ value: s, label: label(s) }))} />
            {req.status === "closed" && req.closeReason && !closing && (
              <div className="ui-hint">سبب الإغلاق: <b style={{ color: B.text2 }}>{req.closeReason}</b></div>
            )}
          </div>
        </div>

        {/* «مغلق» يحتاج سبباً — القائمة الأربعة نصّاً من الملاحظة. */}
        {closing && (
          <Note tone="warn" className="mt-4">
            <div style={{ fontWeight: 600, marginBottom: 8 }}>سبب الإغلاق<span className="ui-req">*</span></div>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="سبب الإغلاق">
              {CUSTOM_CLOSE_REASONS.map(r => (
                <button key={r} type="button" role="radio" aria-checked={closeReason === r} aria-pressed={closeReason === r}
                  onClick={() => setCloseReason(r)} className="ui-chip">{r}</button>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" variant="danger" disabled={!closeReason} onClick={confirmClose}>إغلاق الطلب</Button>
              <Button size="sm" variant="secondary" onClick={() => setClosing(false)}>تراجع</Button>
            </div>
          </Note>
        )}
      </section>

      <section className="ui-card mt-4">
        <div className="ui-card-head"><h3 className="ui-card-title">تفاصيل الرحلة المطلوبة</h3></div>
        <div className="p-5 grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5">
          {kv("تاريخ الذهاب", fmtDate(req.departDate))}
          {req.journeyKind === "round_trip" && kv("تاريخ العودة", fmtDate(req.returnDate))}
          {req.journeyKind && kv("شكل الرحلة", req.journeyKind === "round_trip" ? "ذهاب وعودة" : "اتجاه واحد")}
          {req.travelMode && kv("وسيلة السفر", req.travelMode === "bus" ? "باص" : "طيران — طلب تسعير")}
          {req.outboundTripId && kv("رحلة الذهاب المطلوبة", req.outboundTripId)}
          {req.returnTripId && kv("رحلة العودة المطلوبة", req.returnTripId)}
          {kv("عدد المعتمرين", req.persons)}
          {kv("الوجهة", req.destination)}
          {kv("مدينة العميل", req.city)}
          {kv("نوع السكن", req.roomType)}
          {kv("مستوى الفندق", req.hotelLevel)}
          {req.hotelRequested && kv("طلب السكن", `${req.hotelNights ?? 1} ليالٍ${req.hotelNearHaram ? " · القرب من الحرم مهم" : ""}`)}
          {req.tripNotes && kv("ملاحظات الرحلة", req.tripNotes, true)}
          {req.notes && kv("ملاحظات إضافية", req.notes, true)}
        </div>
      </section>

      {/* الطلب التجريبي الذي يكتب «يرجى الحذف» كان بلا أداة حذف ولا
          أرشفة — والدالّتان في القاعدة منذ ترحيل ٢٠٢٦٠٩٠٦. */}
      <div className="flex items-center justify-between gap-3 flex-wrap mt-4 px-1">
        <span style={{ fontSize: 13, color: B.muted }}>أرشفة الطلب تُخفيه من القائمة وتُبقيه في سجل التدقيق.</span>
        <EntityActions
          name={`طلب ${req.name}`} label="الطلب المخصّص"
          canWrite={canWrite("customRequests")} isAdmin={isAdmin}
          primaryEdit={false}
          onArchive={reason => { setArchiveReason(reason); drop(); toast.success("أُرشف الطلب المخصّص"); }}
          onPermanentDelete={async reason => {
            await permanentlyDelete("custom_requests", req.id, reason);
            onBack();
            writeLocalOnly(() => setRequests(prev => prev.filter(x => x.id !== req.id)));
          }}
        />
      </div>
    </main>
  );
}

/* ════════ القائمة ════════ */
export function CustomRequestsPage({ onMenuOpen }: { onMenuOpen?: () => void }) {
  const requests = useStore(s => s.customRequests);
  const [openId, setOpenId] = useState<string | null>(null);
  /* رابط التنبيه «أُسند إليك طلب مخصّص» يفتح الطلب نفسه. */
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => { const o = searchParams.get("open"); if (o) setOpenId(o); }, [searchParams]);
  const closeDetail = () => { setOpenId(null); if (searchParams.get("open")) { const n = new URLSearchParams(searchParams); n.delete("open"); setSearchParams(n, { replace: true }); } };
  const [filter, setFilter] = useState<CustomReqStatus | "all">("all");
  const [q, setQ] = useState("");
  /* التصفية على القيمة الساكنة لا على كل ضغطة مفتاح. */
  const query = useDebounced(q);

  const shown = useMemo(() => {
    const k = query.trim();
    return requests
      .filter(r => filter === "all" || r.status === filter)
      .filter(r => !k || r.name.includes(k) || r.phone.includes(k) || r.id.includes(k));
  }, [requests, filter, query]);
  /* ترقيم الصفحات — الرسم على الصفحة الحالية وحدها. المفتاح يُعيد
     للصفحة الأولى عند تغيّر البحث أو المرشّح: من كان في الصفحة الخامسة
     ثم بحث عن اسم يجب أن يرى أول النتائج لا صفحتها الخامسة. */
  const pg = usePaged(shown, `${query}|${filter}`);
  const open = requests.find(r => r.id === openId);
  const header = <PageHeader title="الطلبات المخصّصة" crumb="طلبات تصميم رحلة" search={q} onSearch={setQ} onMenuOpen={onMenuOpen}
    searchPlaceholder="ابحث بالاسم أو الجوال أو رقم الطلب" hideSearch={!!open} />;
  if (open) return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{ background: B.bg }}>
      {header}
      <Detail req={open} onBack={closeDetail} />
    </div>
  );

  const count = (s: CustomReqStatus) => requests.filter(r => r.status === s).length;
  const chips: ChipOption<CustomReqStatus | "all">[] = [
    { value: "all", label: "الكل", count: requests.length },
    ...STATUSES.map(s => ({ value: s, label: label(s), count: count(s) })),
  ];
  const filteredOut = shown.length === 0 && requests.length > 0;

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{ background: B.bg }}>
      {header}
      <div className="px-4 md:px-8 pt-1">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="إجمالي الطلبات" value={requests.length} sub="طلب مخصّص" accent onClick={() => setFilter("all")} />
          <StatCard label="جديدة" value={count("new")} sub="بانتظار التواصل" onClick={() => setFilter("new")} />
          <StatCard label="أُرسل لها عرض" value={count("quoted")} sub="بانتظار ردّ العميل" onClick={() => setFilter("quoted")} />
          <StatCard label="قيد التنفيذ" value={count("executing")} sub={`${count("completed")} منجزة`} onClick={() => setFilter("executing")} />
        </div>
        <div className="ts-toolbar">
          <FilterChips label="حالة الطلب" options={chips} value={filter} onChange={v => setFilter(v)} />
          <span className="ts-toolbar-end ts-count" aria-live="polite">{shown.length === requests.length ? `${requests.length} طلب` : `${shown.length} من ${requests.length}`}</span>
        </div>
      </div>

      <main className="flex-1 px-4 md:px-8 pb-8">
        <EntityGate entity="customRequests" label="الطلبات المخصّصة" cols={4}>
        {shown.length === 0 ? (
          <EmptyState icon={filteredOut ? <SearchX size={22} /> : <Sparkles size={22} />}
            title={filteredOut ? "لا طلبات تطابق البحث" : "لا طلبات مخصّصة بعد"}
            note={filteredOut ? "جرّب كلمةً أخرى أو أزل المرشّح." : "تصل هنا تلقائياً عندما يرسلها العميل من التطبيق."}
            action={filteredOut ? <Button variant="secondary" onClick={() => { setQ(""); setFilter("all"); }}>إزالة المرشّحات</Button> : undefined} />
        ) : <>
          <div className="hidden md:block ui-table-wrap">
            <div className="ui-table-scroll">
              <table className="ui-table" style={{ minWidth: 720 }}>
                <thead>
                  <tr>
                    <th>الطلب</th>
                    <th>العميل</th>
                    <th>الرحلة المطلوبة</th>
                    <th style={{ textAlign: "center" }}>المعتمرون</th>
                    <th>الحالة</th>
                    <th className="col-action"><span className="sr-only">فتح</span></th>
                  </tr>
                </thead>
                <tbody>
                  {pg.rows.map(r => (
                    <tr key={r.id} className="is-clickable" tabIndex={0} aria-label={`فتح طلب ${r.name}`}
                      onClick={() => setOpenId(r.id)}
                      onKeyDown={e => { if (e.key === "Enter" && e.target === e.currentTarget) setOpenId(r.id); }}>
                      <td className="nowrap">
                        <div className="cell-main num">{r.id}</div>
                        <div className="cell-sub">{fmtDateShort(r.createdAt)}</div>
                      </td>
                      <td>
                        <div className="cell-main nowrap">{r.name}</div>
                        <div className="cell-sub num">{r.phone}</div>
                      </td>
                      <td>
                        <div className="nowrap" style={{ color: B.text3 }}>{r.destination || "—"}</div>
                        <div className="cell-sub nowrap">الذهاب {fmtDateShort(r.departDate)}</div>
                      </td>
                      <td style={{ textAlign: "center", color: B.text3 }}>{r.persons}</td>
                      <td><StatusBadge status={r.status} entity="request" /></td>
                      <td className="col-action"><ChevronLeft size={16} style={{ color: B.placeholder }} aria-hidden /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="md:hidden flex flex-col gap-2.5">
            {pg.rows.map(r => (
              <button key={r.id} type="button" onClick={() => setOpenId(r.id)} className="ui-card ui-card--hover p-4 text-start cursor-pointer w-full">
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block font-bold truncate" style={{ color: B.black, fontSize: 15 }}>{r.name}</span>
                    <span className="block text-xs mt-0.5" style={{ color: B.muted }}><bdi>{r.id}</bdi> · {fmtDateShort(r.createdAt)}</span>
                  </span>
                  <StatusBadge status={r.status} entity="request" />
                </span>
                <span className="block text-sm mt-3" style={{ color: B.text2 }}>{r.destination || "—"} · {r.persons} معتمر</span>
                <span className="block text-xs mt-0.5" style={{ color: B.muted }}>الذهاب {fmtDateShort(r.departDate)}</span>
              </button>
            ))}
          </div>
        </>}
        </EntityGate>
        <Pager p={pg} unit="طلب"/>
      </main>
    </div>
  );
}
