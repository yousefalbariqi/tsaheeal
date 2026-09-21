/* الطلبات المخصّصة — الباقة التي يصمّمها العميل ويجهّزها الفريق يدوياً.
   ليست حجزاً: لا مقاعد ولا غرف. الشاشة تعرض الطلب كاملاً وتتيح نقل حالته
   والتواصل عبر واتساب مباشرة برسالة تحمل تفاصيل طلبه. */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { Sparkles, Phone, ArrowRight, CalendarDays, Users, Building2, MapPin } from "lucide-react";
import { B } from "@/lib/theme";
import { useDebounced } from "@/lib/useDebounced";
import { EntityGate } from "@/components/States";
import { CUSTOM_CLOSE_REASONS, type CustomRequest, type CustomReqStatus, type CustomCloseReason } from "@/types";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { AppSelect } from "@/components/AppSelect";
import { openWhatsApp } from "@/lib/utils";
import { useRole } from "@/lib/useRole";
import { EntityActions } from "@/components/EntityActions";
import { setArchiveReason, permanentlyDelete } from "@/data/repository";
import { writeLocalOnly } from "@/store/useStore";
import { toast } from "sonner";
import { useStore } from "@/store/useStore";
import { Pager, usePaged } from "@/components/Pager";

const STATUS: { value: CustomReqStatus; label: string; bg: string; fg: string }[] = [
  { value: "new",       label: "جديد",          bg: "#EAF1FE", fg: "#1E52C7" },
  { value: "contacted", label: "تم التواصل",     bg: "#FBF3D6", fg: "#8A6A08" },
  { value: "quoted",    label: "أُرسل العرض",    bg: "#F1E9FA", fg: "#7226BE" },
  { value: "converted", label: "تحوّل إلى حجز",  bg: "#E3F3E8", fg: "#1E7A44" },
  { value: "executing", label: "منفّذ",          bg: "#FFF0D8", fg: "#A45F00" },
  { value: "completed", label: "منجز",           bg: "#E3F3E8", fg: "#167541" },
  { value: "closed",    label: "مغلق",          bg: "#F0EAE0", fg: "#6b6259" },
];
const stat = (s: string) => STATUS.find(x => x.value === s) ?? STATUS[0];

function Badge({ s }: { s: string }) {
  const c = stat(s);
  return <span className="px-2.5 py-1 rounded-full text-xs font-bold" style={{ background: c.bg, color: c.fg }}>{c.label}</span>;
}

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

  const row = (icon: React.ReactNode, l: string, v: string) => (
    <div key={l} className="flex items-start gap-2 py-2" style={{ borderBottom: `1px solid ${B.border}` }}>
      <span style={{ color: B.muted, marginTop: 2 }}>{icon}</span>
      <span className="text-xs font-semibold" style={{ color: B.muted, minWidth: 96 }}>{l}</span>
      <span className="text-sm font-bold flex-1" style={{ color: B.black }}>{v || "—"}</span>
    </div>
  );

  return (
    <div className="p-6 max-w-3xl">
      <button onClick={onBack} className="flex items-center gap-1.5 mb-4 text-sm font-bold cursor-pointer"
        style={{ background: "none", border: "none", color: B.primary }}>
        <ArrowRight size={15} />رجوع للطلبات المخصّصة
      </button>

      <div className="rounded-2xl p-5 mb-5" style={{ background: "#fff", border: `1px solid ${B.border}` }}>
        <div className="flex items-center flex-wrap gap-3 mb-4">
          <Sparkles size={18} style={{ color: B.gold }} />
          <span className="font-extrabold" style={{ color: B.black, fontSize: 16 }}>{req.name}</span>
          <span className="text-sm" style={{ color: B.muted, fontFamily: "var(--font-app)", direction: "ltr" }}>{req.phone}</span>
          <Badge s={req.status} />
          <span className="text-xs mr-auto" style={{ color: B.muted }}>{req.createdAt}</span>
        </div>

        {row(<CalendarDays size={14} />, "تاريخ الذهاب", req.departDate)}
        {row(<CalendarDays size={14} />, "تاريخ العودة", req.returnDate)}
        {row(<Users size={14} />, "عدد المعتمرين", String(req.persons))}
        {row(<MapPin size={14} />, "الوجهة", req.destination)}
        {row(<Building2 size={14} />, "نوع السكن", req.roomType)}
        {row(<Building2 size={14} />, "مستوى الفندق", req.hotelLevel)}
        {row(<MapPin size={14} />, "مدينة العميل", req.city)}
        {req.tripNotes && row(<Sparkles size={14} />, "ملاحظات الرحلة", req.tripNotes)}
        {req.notes && row(<Sparkles size={14} />, "ملاحظات إضافية", req.notes)}

        {/* الطلب التجريبي الذي يكتب «يرجى الحذف» كان بلا أداة حذف ولا
            أرشفة — والدالّتان في القاعدة منذ ترحيل ٢٠٢٦٠٩٠٦. */}
        <div className="mt-5">
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

        <div className="grid sm:grid-cols-2 gap-3 mt-5">
          <div>
            <div className="text-xs font-semibold mb-1" style={{ color: B.muted }}>حالة الطلب</div>
            <AppSelect value={closing ? "closed" : req.status} onChange={v => changeStatus(v as CustomReqStatus)}
              options={STATUS.map(s => ({ value: s.value, label: s.label }))} />
            {req.status === "closed" && req.closeReason && !closing && (
              <div className="text-xs mt-1.5" style={{ color: B.muted }}>سبب الإغلاق: <b style={{ color: B.text2 }}>{req.closeReason}</b></div>
            )}
          </div>
          <div className="flex items-end">
            <button onClick={() => openWhatsApp(req.phone, waMessage(req))}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm cursor-pointer"
              style={{ background: "#25D366", color: "#fff", border: "none" }}>
              <Phone size={15} />واتساب
            </button>
          </div>
        </div>

        {/* «مغلق» يحتاج سبباً — القائمة الأربعة نصّاً من الملاحظة. */}
        {closing && (
          <div className="rounded-xl p-4 mt-3 flex flex-col gap-3" style={{ background: "#FBF3D6", border: "1px solid #EBD9A0" }}>
            <div className="text-xs font-bold" style={{ color: "#8A6A08" }}>سبب الإغلاق <span style={{ color: "#BE2626" }}>*</span></div>
            <div className="flex flex-wrap gap-2">
              {CUSTOM_CLOSE_REASONS.map(r => (
                <button key={r} onClick={() => setCloseReason(r)} className="px-3.5 py-1.5 rounded-full text-xs font-bold cursor-pointer"
                  style={{ background: closeReason === r ? B.gold : "#fff", color: closeReason === r ? B.black : B.text2, border: `1px solid ${closeReason === r ? B.gold : B.border}` }}>{r}</button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={confirmClose} disabled={!closeReason} className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
                style={{ background: "#BE2626", color: "#fff", border: "none", opacity: closeReason ? 1 : 0.5 }}>إغلاق الطلب</button>
              <button onClick={() => setClosing(false)} className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer" style={{ background: "#fff", color: B.text2, border: `1px solid ${B.border}` }}>تراجع</button>
            </div>
          </div>
        )}

      </div>
    </div>
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
  const [filter, setFilter] = useState<string>("all");
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
  if (open) return (
    <>
      <PageHeader title="الطلبات المخصّصة" crumb="طلبات تصميم رحلة" search={q} onSearch={setQ} onMenuOpen={onMenuOpen} />
      <Detail req={open} onBack={closeDetail} />
    </>
  );

  return (
    <>
      <PageHeader title="الطلبات المخصّصة" crumb="طلبات تصميم رحلة" search={q} onSearch={setQ} onMenuOpen={onMenuOpen} />
      <div className="p-6">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <StatCard label="إجمالي الطلبات" value={requests.length} sub="طلب مخصّص" />
          <StatCard label="جديدة" value={requests.filter(r => r.status === "new").length} sub="بانتظار التواصل" />
          <StatCard label="أُرسل لها عرض" value={requests.filter(r => r.status === "quoted").length} sub="بانتظار الرد" />
          <StatCard label="منفّذة" value={requests.filter(r => r.status === "executing").length} sub="المجموعة في الرحلة" />
          <StatCard label="منجزة" value={requests.filter(r => r.status === "completed").length} sub="اكتملت الرحلة" />
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {[{ value: "all", label: "الكل" }, ...STATUS].map(s => (
            <button key={s.value} onClick={() => setFilter(s.value)}
              className="px-3.5 py-1.5 rounded-full text-xs font-bold cursor-pointer"
              style={{
                background: filter === s.value ? B.gold : "#fff",
                color: filter === s.value ? B.black : B.text2,
                border: `1px solid ${filter === s.value ? B.gold : B.border}`,
              }}>{s.label}</button>
          ))}
        </div>

        <EntityGate entity="customRequests" label="الطلبات المخصّصة" cols={4}>
        {shown.length === 0 ? (
          <div className="rounded-2xl p-12 text-center" style={{ background: "#fff", border: `1px solid ${B.border}` }}>
            <Sparkles size={28} style={{ color: B.muted, margin: "0 auto 10px" }} />
            <div className="font-bold text-sm" style={{ color: B.text2 }}>لا توجد طلبات مخصّصة بعد</div>
            <div className="text-xs mt-1" style={{ color: B.muted }}>تصل هنا تلقائياً عندما يرسلها العميل من التطبيق.</div>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: `1px solid ${B.border}` }}>
            {pg.rows.map((r, i) => (
              <button key={r.id} onClick={() => setOpenId(r.id)}
                className="w-full flex items-center gap-3 px-5 py-4 text-start cursor-pointer"
                style={{ background: i % 2 ? "#FDFCFA" : "#fff", border: "none", borderTop: i ? `1px solid ${B.border}` : "none" }}>
                <span className="font-mono text-xs flex-shrink-0" style={{ color: B.muted, direction: "ltr" }}>{r.id}</span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate font-bold text-sm" style={{ color: B.black }}>{r.name}</span>
                  <span className="block truncate text-xs" style={{ color: B.muted }}>
                    {r.destination} · {r.persons} معتمر · {r.departDate}
                  </span>
                </span>
                <Badge s={r.status} />
              </button>
            ))}
          </div>
        )}
        </EntityGate>
        <Pager p={pg} unit="طلب"/>
      </div>
    </>
  );
}
