/* لوحة الأرشيف — ما أُخرج من العمل اليومي، وطريقُ رجوعه أو نهايته.

   الأرشفة حلّت محلّ الحذف اليومي (ترحيل 20260906): الزرّ في كل شاشة
   يطلب سبباً ويضع archived_at، وقوائم العمل تقرأ النشط وحده. لكن ذلك
   ترك السجلّ المؤرشف بلا بابٍ يُفتح: لا يظهر في شاشته، ولا يُستعاد إن
   أُرشف خطأً، ولا يُحذف نهائياً إن كان يجب أن يزول. أرشفةٌ بلا هذه
   اللوحة حذفٌ باسمٍ ألطف.

   والحذف النهائي هنا لا في الشاشات: هو الإجراء الوحيد الذي لا رجعة
   فيه، ومكانه الصحيح خلف خطوتين — الأرشفة أولاً، ثم قرارٌ ثانٍ بسببٍ
   مكتوب من مدير النظام. القاعدة تحرسه كذلك (permanently_delete_entity
   تبدأ بـis_admin وترفض السبب الفارغ)، فالواجهة مرآةٌ لا بديل. */
import { useCallback, useEffect, useState } from "react";
import { Archive, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { B } from "@/lib/theme";
import { Spinner } from "@/components/Spinner";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/States";
import { isSupabaseEnabled, supabase } from "@/supabase/client";
import { useRole } from "@/lib/useRole";
import { useStore } from "@/store/useStore";

type ArchivedRow = {
  entity_id: string; label: string; archived_at: string;
  archived_by_name: string | null; archive_reason: string | null; total_count: number;
};

/* اسم الجدول في القاعدة ← اسمه العربي ومفتاحه في المخزن، ليُعاد جلبه
   بعد الاستعادة فيظهر السجلّ في شاشته فوراً بلا تحديث الصفحة. */
const ENTITIES: { key: string; label: string; storeKey?: string }[] = [
  { key: "bookings",        label: "الطلبات",          storeKey: "bookings" },
  { key: "payments",        label: "الفواتير",         storeKey: "payments" },
  { key: "trips",           label: "الرحلات",          storeKey: "trips" },
  { key: "packages",        label: "الباقات",          storeKey: "packages" },
  { key: "hotels",          label: "الفنادق",          storeKey: "hotels" },
  { key: "transports",      label: "المواصلات",        storeKey: "transports" },
  { key: "branches",        label: "الفروع",           storeKey: "branches" },
  { key: "beneficiaries",   label: "المستفيدون",       storeKey: "beneficiaries" },
  { key: "custom_requests", label: "الطلبات المخصّصة", storeKey: "customRequests" },
  { key: "support",         label: "الدعم الفني",      storeKey: "support" },
  { key: "users",           label: "المستخدمون",       storeKey: "users" },
];

const when = (iso: string) => {
  const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/* الحذف النهائي يطلب السبب واسم السجلّ معاً: كتابة الاسم ليست تعقيداً
   بل الفاصل بين ضغطةٍ بالخطأ وقرارٍ مقصود. */
function PermanentDeleteDialog({ row, entityLabel, onConfirm, onCancel }: {
  row: ArchivedRow; entityLabel: string;
  onConfirm: (reason: string) => Promise<void>; onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = reason.trim().length >= 5 && typed.trim() === row.entity_id;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(14,12,11,0.78)", backdropFilter: "blur(4px)" }} onClick={onCancel}>
      <div role="dialog" aria-modal="true" aria-label="حذف نهائي" onClick={e => e.stopPropagation()}
        className="rounded-2xl p-7 w-full" style={{ maxWidth: 420, background: "#fff" }}>
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ background: "#FBE6E6" }}>
          <Trash2 size={20} style={{ color: "#BE2626" }} />
        </div>
        <h3 className="text-base font-bold mb-1" style={{ color: B.black }}>حذف نهائي — لا رجعة فيه</h3>
        <p className="text-sm leading-relaxed mb-4" style={{ color: B.text2 }}>
          سيُمحى {entityLabel} «{row.label}» من القاعدة نهائياً. سجلّ التدقيق يبقى، والسجلّ نفسه لا يُستعاد.
        </p>

        <label className="block text-xs font-bold mb-1.5" htmlFor="perm-reason" style={{ color: B.text3 }}>
          سبب الحذف النهائي <span style={{ color: "#BE2626" }}>*</span>
        </label>
        <textarea id="perm-reason" value={reason} onChange={e => setReason(e.target.value)} rows={2}
          placeholder="مثال: بيانات اختبار أُدخلت بالخطأ" className="w-full rounded-xl border px-3 py-2 text-sm mb-4 resize-none focus:outline-none"
          style={{ borderColor: B.border, fontFamily: "inherit", color: B.black }} />

        <label className="block text-xs font-bold mb-1.5" htmlFor="perm-confirm" style={{ color: B.text3 }}>
          اكتب المعرّف <span style={{ fontFamily: "var(--font-app)", color: B.gold }}>{row.entity_id}</span> للتأكيد
        </label>
        <input id="perm-confirm" value={typed} onChange={e => setTyped(e.target.value)}
          className="w-full rounded-xl border px-3 py-2 text-sm mb-5 focus:outline-none"
          style={{ borderColor: B.border, fontFamily: "var(--font-app)", direction: "ltr", textAlign: "left", color: B.black }} />

        <div className="flex gap-2">
          <button onClick={async () => { setBusy(true); try { await onConfirm(reason.trim()); } finally { setBusy(false); } }}
            disabled={!ready || busy} className="flex-1 py-3 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-2"
            style={{ background: "#BE2626", color: "#fff", border: "none", opacity: ready && !busy ? 1 : 0.45, cursor: ready && !busy ? "pointer" : "not-allowed" }}>
            {busy && <Spinner size={13} color="#fff" track="rgba(255,255,255,.3)" />}حذف نهائي
          </button>
          <button onClick={onCancel} className="flex-1 py-3 rounded-xl text-sm font-bold cursor-pointer"
            style={{ background: B.bg, color: B.text2, border: "none" }}>إلغاء</button>
        </div>
      </div>
    </div>
  );
}

export function ArchivePanel() {
  const { isAdmin } = useRole();
  const retryEntity = useStore(s => s.retryEntity);
  const [entity, setEntity] = useState(ENTITIES[0].key);
  const [rows, setRows] = useState<ArchivedRow[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "error" | "unsupported">("loading");
  const [target, setTarget] = useState<ArchivedRow | null>(null);

  const current = ENTITIES.find(e => e.key === entity)!;

  const load = useCallback(async (key: string) => {
    if (!isSupabaseEnabled || !supabase || !isAdmin) { setState("unsupported"); return; }
    setState("loading");
    const { data, error } = await supabase.rpc("list_archived", { entity_type: key, page_no: 1, page_size: 50 });
    if (error) {
      /* الترحيل لم يُشغَّل بعد: تُقال الحال صريحةً بدل خطأٍ غامض. */
      console.error("[archive]", error);
      setState(error.code === "PGRST202" ? "unsupported" : "error");
      return;
    }
    setRows((data ?? []) as ArchivedRow[]);
    setState("idle");
  }, [isAdmin]);

  useEffect(() => { void load(entity); }, [entity, load]);

  const restore = async (row: ArchivedRow) => {
    if (!supabase) return;
    const { error } = await supabase.rpc("restore_entity", { entity_type: entity, entity_id: row.entity_id });
    if (error) { toast.error("تعذّرت الاستعادة", { description: error.message }); return; }
    toast.success(`أُعيد «${row.label}» إلى ${current.label}`);
    setRows(prev => prev.filter(r => r.entity_id !== row.entity_id));
    if (current.storeKey) void retryEntity(current.storeKey);
  };

  const destroy = async (row: ArchivedRow, reason: string) => {
    if (!supabase) return;
    const { error } = await supabase.rpc("permanently_delete_entity", { entity_type: entity, entity_id: row.entity_id, reason });
    if (error) { toast.error("تعذّر الحذف النهائي", { description: error.message }); return; }
    toast.success(`حُذف «${row.label}» نهائياً`);
    setRows(prev => prev.filter(r => r.entity_id !== row.entity_id));
    setTarget(null);
  };

  if (!isAdmin) return null;

  return (
    <section className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: `1px solid ${B.border}` }}>
      <header className="flex items-center gap-2 px-4 md:px-5 py-4">
        <Archive size={16} style={{ color: B.gold }} />
        <h3 className="font-extrabold text-base flex-1" style={{ color: B.black, margin: 0 }}>الأرشيف</h3>
        <span className="text-xs" style={{ color: B.muted }}>الاستعادة والحذف النهائي لمدير النظام</span>
      </header>

      <div className="px-4 md:px-5 pb-3 flex gap-2 flex-wrap">
        {ENTITIES.map(e => (
          <button key={e.key} onClick={() => setEntity(e.key)} aria-pressed={e.key === entity}
            className="px-3.5 py-1.5 rounded-full text-xs font-bold cursor-pointer"
            style={{
              background: e.key === entity ? B.primary : "#fff",
              color: e.key === entity ? B.cream : B.text2,
              border: `1px solid ${e.key === entity ? B.primary : B.border}`,
            }}>{e.label}</button>
        ))}
      </div>

      <div className="px-4 md:px-5 pb-5">
        {state === "unsupported" && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ background: "#EAF1FE", border: "1px solid #C9DBFB", color: "#1E52C7" }}>
            <ShieldCheck size={16} style={{ flexShrink: 0 }} />
            <span className="text-sm">لوحة الأرشيف تحتاج ترحيل <span style={{ fontFamily: "var(--font-app)" }}>20260907_archive_console</span> على قاعدة البيانات.</span>
          </div>
        )}
        {state === "error" && <ErrorState title={`تعذّر جلب أرشيف ${current.label}`} onRetry={() => load(entity)} />}
        {state === "loading" && <TableSkeleton rows={3} cols={4} />}
        {state === "idle" && rows.length === 0 && (
          <EmptyState title={`لا سجلات مؤرشفة في ${current.label}`}
            note="ما يُؤرشف من الشاشات يظهر هنا مع سببه ومن أرشفه." />
        )}
        {state === "idle" && rows.length > 0 && (
          <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${B.border}` }}>
            {rows.map((r, i) => (
              <div key={r.entity_id} className="flex items-center gap-3 px-4 py-3 flex-wrap"
                style={{ borderTop: i ? `1px solid ${B.border}` : "none" }}>
                <span className="flex-1 min-w-0" style={{ minWidth: 180 }}>
                  <span className="block truncate text-sm font-bold" style={{ color: B.black }}>{r.label}</span>
                  <span className="block truncate text-xs mt-0.5" style={{ color: B.muted }}>
                    <span style={{ fontFamily: "var(--font-app)" }}>{r.entity_id}</span>
                    {" · "}{when(r.archived_at)}{" · "}{r.archived_by_name ?? "غير معروف"}
                  </span>
                  {r.archive_reason && (
                    <span className="block text-xs mt-1 rounded-lg px-2.5 py-1" style={{ background: B.bg, color: B.text2 }}>
                      السبب: {r.archive_reason}
                    </span>
                  )}
                </span>
                <button onClick={() => restore(r)} aria-label={`استعادة ${r.label}`} title="استعادة إلى العمل اليومي"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer flex-shrink-0"
                  style={{ background: "#E3F3E8", color: "#1E7A44", border: "1px solid #C4E4CE" }}>
                  <RotateCcw size={12} />استعادة
                </button>
                <button onClick={() => setTarget(r)} aria-label={`حذف ${r.label} نهائياً`} title="حذف نهائي — لا رجعة فيه"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer flex-shrink-0"
                  style={{ background: "#FBE6E6", color: "#BE2626", border: "1px solid #F3C9C9" }}>
                  <Trash2 size={12} />حذف نهائي
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {target && <PermanentDeleteDialog row={target} entityLabel={current.label}
        onConfirm={reason => destroy(target, reason)} onCancel={() => setTarget(null)} />}
    </section>
  );
}
