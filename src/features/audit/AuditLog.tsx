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
import { ArrowLeft, ChevronDown, History, RotateCw, ShieldCheck } from "lucide-react";
import { B, type ToneName } from "@/lib/theme";
import { fmtDateTime } from "@/lib/dates";
import { Badge, Button, Note } from "@/components/ui";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/States";
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

const OP_AR: Record<AuditRow["operation"], { text: string; tone: ToneName }> = {
  create: { text: "إنشاء", tone: "success" },
  update: { text: "تعديل", tone: "warn" },
  delete: { text: "حذف",  tone: "danger" },
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

function Entry({ row, actorName }: { row: AuditRow; actorName: string }) {
  const [open, setOpen] = useState(false);
  const op = OP_AR[row.operation];
  const diff = changes(row.before_value, row.after_value);
  const summary = row.operation === "update"
    ? (diff.length ? `${diff.length} حقلاً تغيّر` : "لا تغيّر ظاهر")
    : row.operation === "create" ? "سجل جديد" : "حُذف السجل";

  return (
    <div style={{ borderTop: "1px solid #F1ECE2" }}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        aria-label={`تفاصيل ${op.text} ${ENTITY_AR[row.entity_type] ?? row.entity_type} ${row.entity_id}`}
        className="ts-action-row" style={{ borderRadius: 0, padding: "12px 20px" }}>
        <span className="flex-shrink-0" style={{ minWidth: 62 }}><Badge tone={op.tone} size="sm">{op.text}</Badge></span>
        <span className="flex-1 min-w-0">
          <span className="block truncate" style={{ fontSize: 14, fontWeight: 600, color: B.black }}>
            {ENTITY_AR[row.entity_type] ?? row.entity_type}
            <bdi className="ms-1.5" style={{ fontWeight: 400, color: B.muted }}>{row.entity_id}</bdi>
          </span>
          <span className="block truncate" style={{ fontSize: 12, color: B.muted, marginTop: 1 }}>
            {actorName} · {summary}
          </span>
        </span>
        <span className="hidden sm:block flex-shrink-0" style={{ fontSize: 12, color: B.muted }}>{fmtDateTime(row.occurred_at)}</span>
        <ChevronDown size={15} aria-hidden style={{ color: B.placeholder, flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>
      {open && (
        <div className="px-5 pb-4 flex flex-col gap-1.5">
          <span className="sm:hidden" style={{ fontSize: 12, color: B.muted }}>{fmtDateTime(row.occurred_at)}</span>
          {diff.length === 0
            ? <p style={{ fontSize: 13, color: B.muted, margin: 0 }}>لا تفاصيل حقول لهذه العملية.</p>
            : diff.map(c => (
              <div key={c.key} className="flex items-center gap-2 flex-wrap px-3 py-2"
                style={{ fontSize: 13, borderRadius: 10, background: B.fill }}>
                <strong style={{ color: B.text3, fontWeight: 600, minWidth: 110 }}>{fieldName(c.key)}</strong>
                <span style={{ color: B.muted, textDecoration: "line-through" }}>{show(c.from)}</span>
                <ArrowLeft size={13} aria-hidden style={{ color: B.placeholder }} />
                <span style={{ color: B.black, fontWeight: 600 }}>{show(c.to)}</span>
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

  if (!isAdmin) return <Note tone="warn" icon={<ShieldCheck size={16} />}>سجلّ التدقيق يُقرأ من حساب مدير النظام.</Note>;

  if (state === "error") return <ErrorState title="تعذّر جلب سجلّ التدقيق" onRetry={() => load(0)} />;
  if (state === "loading" && rows.length === 0) return <TableSkeleton rows={5} cols={4} />;

  return (
    <section className="ui-card overflow-hidden">
      <header className="ui-card-head" style={{ borderBottom: rows.length ? "none" : undefined }}>
        <h3 className="ui-card-title flex items-center gap-2" style={{ fontSize: 16 }}><History size={16} style={{ color: B.muted }} />سجلّ التدقيق</h3>
        <Button size="sm" variant="secondary" icon={<RotateCw size={13} />} onClick={() => { setPage(0); void load(0); }}
          aria-label="تحديث سجلّ التدقيق">تحديث</Button>
      </header>
      {rows.length === 0
        ? <EmptyState compact icon={<History size={20} />} title="لا عمليات مسجّلة بعد" note="يبدأ السجلّ من تشغيل ترحيل التدقيق." />
        : rows.map(r => <Entry key={r.id} row={r} actorName={r.actor_id ? (actors[r.actor_id] ?? "مستخدم محذوف") : "النظام"} />)}
      {more && (
        <div className="px-5 py-3" style={{ borderTop: "1px solid #F1ECE2" }}>
          <Button variant="secondary" block loading={state === "loading"} onClick={() => { const n = page + 1; setPage(n); void load(n); }}>
            {state === "loading" ? "جارٍ الجلب…" : "عرض عمليات أقدم"}
          </Button>
        </div>
      )}
    </section>
  );
}
