/* عارض سجلّ التدقيق.

   السجلّ نفسه تكتبه triggers في القاعدة (ترحيل 20260906): كل إنشاء
   وتعديل وحذف على أحد عشر جدولاً، بالفاعل والوقت والصفّ قبلَه وبعدَه.
   لكن سجلّاً لا يفتحه أحد لا يُدقَّق به: السؤال الذي يُطرح فعلاً — «من
   غيّر سعر هذه الباقة؟» و«متى صار الطلب ملغى ومن ألغاه؟» — كان جوابه
   في القاعدة ولا طريق إليه من اللوحة.

   ما يُعرض ليس الصفّ كاملاً بل ما تغيّر منه: صفٌّ فيه أربعون حقلاً
   وتغيّر حقلٌ واحد يُقرأ سطراً واحداً «السعر: ١٢٠٠ ← ١٤٥٠». والحقول
   التقنية (الطوابع والمعرّفات الداخلية) تُستبعد لأنها تتغيّر مع كل
   كتابة فتُغرق التغيير الحقيقي.

   القراءة للمدير وحده — سياسة audit_logs في القاعدة تقول ذلك، والواجهة
   تقوله كذلك فلا يظهر قسمٌ يعود فارغاً بلا سبب مفهوم. */
import { useCallback, useEffect, useState } from "react";
import { ChevronDown, History, RotateCw, ShieldCheck } from "lucide-react";
import { B } from "@/lib/theme";
import { Spinner } from "@/components/Spinner";
import { ErrorState, TableSkeleton } from "@/components/States";
import { isSupabaseEnabled, supabase } from "@/supabase/client";
import { useRole } from "@/lib/useRole";

type AuditRow = {
  id: number;
  actor_id: string | null;
  entity_type: string;
  entity_id: string;
  operation: "create" | "update" | "delete";
  before_value: Record<string, unknown> | null;
  after_value: Record<string, unknown> | null;
  occurred_at: string;
};

const PAGE = 20;

/* أسماء الجداول كما هي في القاعدة — العربية هي ما يقرأه الموظف. */
const ENTITY_AR: Record<string, string> = {
  bookings: "طلب", payments: "فاتورة", trips: "رحلة", packages: "باقة",
  hotels: "فندق", transports: "وسيلة نقل", branches: "فرع",
  beneficiaries: "مستفيد", custom_requests: "طلب مخصّص",
  support: "طلب دعم", users: "مستخدم",
};

const OP_AR: Record<AuditRow["operation"], { text: string; bg: string; fg: string }> = {
  create: { text: "إنشاء", bg: "#E3F3E8", fg: "#1E7A44" },
  update: { text: "تعديل", bg: "#FBF3D6", fg: "#8A6A08" },
  delete: { text: "حذف",  bg: "#FBE6E6", fg: "#BE2626" },
};

/* أسماء الحقول التي يسأل عنها الموظف؛ ما عداها يظهر باسمه البرمجي. */
const FIELD_AR: Record<string, string> = {
  status: "الحالة", price: "السعر", total: "المبلغ", market_price: "السعر المعروض",
  seats: "المقاعد", booked_seats: "المقاعد المحجوزة", pay_status: "حالة الدفع",
  payment_status: "حالة الدفع", pay_date: "تاريخ التحصيل", pay_method: "طريقة الدفع",
  client_name: "اسم العميل", client_phone: "جوال العميل", staff: "الموظف",
  departure_date: "تاريخ الانطلاق", departure_time: "وقت الانطلاق",
  archived_at: "الأرشفة", archive_reason: "سبب الأرشفة", name: "الاسم",
  persons: "عدد المعتمرين", trip_id: "الرحلة", package_id: "الباقة",
};

/* حقولٌ تتغيّر مع كل كتابة بلا معنى للمدقّق. */
const NOISE = new Set(["updated_at", "created_at", "search_vector", "id"]);

const fieldName = (k: string) => FIELD_AR[k] ?? k;

const show = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "نعم" : "لا";
  if (typeof v === "object") return Array.isArray(v) ? `${v.length} عنصراً` : "قيمة مركّبة";
  return String(v);
};

/** ما تغيّر فعلاً بين الصفّين. */
function changes(before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  if (!before || !after) return [];
  return Object.keys(after)
    .filter(k => !NOISE.has(k))
    .filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .map(k => ({ key: k, from: before[k], to: after[k] }));
}

function when(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} · ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function Entry({ row, actorName }: { row: AuditRow; actorName: string }) {
  const [open, setOpen] = useState(false);
  const op = OP_AR[row.operation];
  const diff = changes(row.before_value, row.after_value);
  const summary = row.operation === "update"
    ? (diff.length ? `${diff.length} حقلاً تغيّر` : "لا تغيّر ظاهر")
    : row.operation === "create" ? "سجل جديد" : "حُذف السجل";

  return (
    <div style={{ borderTop: `1px solid ${B.border}` }}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open}
        aria-label={`تفاصيل ${op.text} ${ENTITY_AR[row.entity_type] ?? row.entity_type} ${row.entity_id}`}
        className="w-full flex items-center gap-3 px-4 md:px-5 py-3.5 text-start cursor-pointer"
        style={{ background: "transparent", border: "none" }}>
        <span className="px-2.5 py-1 rounded-full text-xs font-bold flex-shrink-0"
          style={{ background: op.bg, color: op.fg }}>{op.text}</span>
        <span className="flex-1 min-w-0">
          <span className="block truncate text-sm font-bold" style={{ color: B.black }}>
            {ENTITY_AR[row.entity_type] ?? row.entity_type}
            <span className="mr-1.5 font-normal" style={{ color: B.muted, fontFamily: "var(--font-app)" }}>{row.entity_id}</span>
          </span>
          <span className="block truncate text-xs mt-0.5" style={{ color: B.muted }}>
            {actorName} · {summary}
          </span>
        </span>
        <span className="text-xs flex-shrink-0" style={{ color: B.muted, fontFamily: "var(--font-app)" }}>{when(row.occurred_at)}</span>
        <ChevronDown size={14} aria-hidden style={{ color: B.muted, flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>
      {open && (
        <div className="px-4 md:px-5 pb-4 flex flex-col gap-1.5">
          {diff.length === 0
            ? <p className="text-xs" style={{ color: B.muted }}>لا تفاصيل حقول لهذه العملية.</p>
            : diff.map(c => (
              <div key={c.key} className="flex items-center gap-2 flex-wrap text-xs rounded-xl px-3 py-2"
                style={{ background: B.fill, border: `1px solid ${B.border}` }}>
                <strong style={{ color: B.text3 }}>{fieldName(c.key)}</strong>
                <span style={{ color: "#BE2626", textDecoration: "line-through" }}>{show(c.from)}</span>
                <span aria-hidden style={{ color: B.muted }}>←</span>
                <span style={{ color: "#1E7A44", fontWeight: 700 }}>{show(c.to)}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

export function AuditLog() {
  const { isAdmin } = useRole();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [actors, setActors] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "loading" | "error">("loading");
  const [more, setMore] = useState(false);
  const [page, setPage] = useState(0);

  const load = useCallback(async (pageNo: number) => {
    if (!isSupabaseEnabled || !supabase || !isAdmin) { setState("idle"); return; }
    setState("loading");
    const { data, error } = await supabase
      .from("audit_logs")
      .select("id,actor_id,entity_type,entity_id,operation,before_value,after_value,occurred_at")
      .order("occurred_at", { ascending: false })
      .range(pageNo * PAGE, pageNo * PAGE + PAGE);   /* عنصرٌ زائد ليُعرف: هل بعده مزيد؟ */
    if (error) { console.error("[audit]", error); setState("error"); return; }
    const batch = (data ?? []) as AuditRow[];
    setMore(batch.length > PAGE);
    const slice = batch.slice(0, PAGE);
    setRows(prev => (pageNo === 0 ? slice : [...prev, ...slice]));

    /* أسماء الفاعلين دفعةً واحدة — لا استعلامٌ لكل سطر. */
    const ids = [...new Set(slice.map(r => r.actor_id).filter((x): x is string => !!x))];
    if (ids.length) {
      const { data: profiles } = await supabase.from("profiles").select("id,name").in("id", ids);
      if (profiles) setActors(prev => ({ ...prev, ...Object.fromEntries(profiles.map((p: any) => [p.id, p.name])) }));
    }
    setState("idle");
  }, [isAdmin]);

  useEffect(() => { void load(0); }, [load]);

  if (!isAdmin) return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
      style={{ background: "#FBF3D6", border: "1px solid #E8D9A8", color: "#6b5306" }}>
      <ShieldCheck size={16} style={{ flexShrink: 0, color: "#8A6A08" }} />
      <span className="text-sm">سجلّ التدقيق يُقرأ من حساب مدير النظام.</span>
    </div>
  );

  if (state === "error") return <ErrorState title="تعذّر جلب سجلّ التدقيق" onRetry={() => load(0)} />;
  if (state === "loading" && rows.length === 0) return <TableSkeleton rows={5} cols={4} />;

  return (
    <section className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: `1px solid ${B.border}` }}>
      <header className="flex items-center gap-2 px-4 md:px-5 py-4">
        <History size={16} style={{ color: B.gold }} />
        <h3 className="font-extrabold text-base flex-1" style={{ color: B.black, margin: 0 }}>سجلّ التدقيق</h3>
        <button onClick={() => { setPage(0); void load(0); }} aria-label="تحديث سجلّ التدقيق" title="تحديث"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
          style={{ background: "#fff", border: `1px solid ${B.border}`, color: B.text2 }}>
          <RotateCw size={12} />تحديث
        </button>
      </header>
      {rows.length === 0
        ? <p className="px-5 pb-6 text-sm" style={{ color: B.muted }}>لا عمليات مسجّلة بعد. يبدأ السجلّ من تشغيل ترحيل التدقيق.</p>
        : rows.map(r => <Entry key={r.id} row={r} actorName={r.actor_id ? (actors[r.actor_id] ?? "مستخدم محذوف") : "النظام"} />)}
      {more && (
        <div className="px-4 md:px-5 py-3" style={{ borderTop: `1px solid ${B.border}` }}>
          <button onClick={() => { const n = page + 1; setPage(n); void load(n); }} disabled={state === "loading"}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold cursor-pointer"
            style={{ background: B.fill, border: `1px solid ${B.border}`, color: B.text2 }}>
            {state === "loading" ? <Spinner size={13} /> : null}
            {state === "loading" ? "جارٍ الجلب…" : "عرض عمليات أقدم"}
          </button>
        </div>
      )}
    </section>
  );
}
