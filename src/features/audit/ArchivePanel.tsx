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
import { fmtDateShort } from "@/lib/dates";
import { Button, FilterChips, IconButton, Input, Modal, ModalIcon, Note, Textarea } from "@/components/ui";
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
    <Modal open onClose={() => { if (!busy) onCancel(); }} width={460}
      title="حذف نهائي — لا رجعة فيه"
      sub={<>سيُمحى {entityLabel} «{row.label}» من القاعدة نهائياً. سجلّ التدقيق يبقى، والسجلّ نفسه لا يُستعاد.</>}
      icon={<ModalIcon tone="danger"><Trash2 size={19} /></ModalIcon>}
      footer={<>
        <Button variant="danger" disabled={!ready} loading={busy}
          onClick={async () => { setBusy(true); try { await onConfirm(reason.trim()); } finally { setBusy(false); } }}>حذف نهائي</Button>
        <Button variant="secondary" disabled={busy} onClick={onCancel}>إلغاء</Button>
      </>}>
      <label className="ui-label" htmlFor="perm-reason">سبب الحذف النهائي<span className="ui-req">*</span></label>
      <Textarea id="perm-reason" value={reason} onChange={e => setReason(e.target.value)} rows={2}
        placeholder="مثال: بيانات اختبار أُدخلت بالخطأ" style={{ resize: "none" }} />

      <label className="ui-label" htmlFor="perm-confirm" style={{ marginTop: 16 }}>
        اكتب المعرّف <bdi style={{ color: B.black, fontWeight: 700 }}>{row.entity_id}</bdi> للتأكيد
      </label>
      <Input id="perm-confirm" value={typed} onChange={e => setTyped(e.target.value)} dir="ltr" style={{ textAlign: "left" }} autoComplete="off" />
    </Modal>
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
    <section className="ui-card overflow-hidden">
      <header className="ui-card-head">
        <h3 className="ui-card-title flex items-center gap-2" style={{ fontSize: 16 }}><Archive size={16} style={{ color: B.muted }} />الأرشيف</h3>
        <span className="ui-card-sub">الاستعادة والحذف النهائي لمدير النظام</span>
      </header>

      <div className="px-4 md:px-5 pt-4 pb-3">
        <FilterChips label="نوع السجل" value={entity} onChange={v => setEntity(v)}
          options={ENTITIES.map(e => ({ value: e.key, label: e.label }))} />
      </div>

      <div className="px-4 md:px-5 pb-5">
        {state === "unsupported" && (
          <Note tone="info" icon={<ShieldCheck size={16} />}>
            لوحة الأرشيف تحتاج ترحيل <bdi>20260907_archive_console</bdi> على قاعدة البيانات.
          </Note>
        )}
        {state === "error" && <ErrorState title={`تعذّر جلب أرشيف ${current.label}`} onRetry={() => load(entity)} />}
        {state === "loading" && <TableSkeleton rows={3} cols={4} />}
        {state === "idle" && rows.length === 0 && (
          <EmptyState compact icon={<Archive size={20} />} title={`لا سجلات مؤرشفة في ${current.label}`}
            note="ما يُؤرشف من الشاشات يظهر هنا مع سببه ومن أرشفه." />
        )}
        {state === "idle" && rows.length > 0 && (
          <div className="overflow-hidden" style={{ borderRadius: 12, border: `1px solid ${B.border}` }}>
            {rows.map((r, i) => (
              <div key={r.entity_id} className="flex items-center gap-3 px-4 py-3 flex-wrap"
                style={{ borderTop: i ? "1px solid #F1ECE2" : "none" }}>
                <span className="flex-1 min-w-0" style={{ minWidth: 180 }}>
                  <span className="block truncate" style={{ fontSize: 14, fontWeight: 600, color: B.black }}>{r.label}</span>
                  <span className="block truncate" style={{ fontSize: 12, color: B.muted, marginTop: 2 }}>
                    <bdi>{r.entity_id}</bdi>{" · "}{fmtDateShort(r.archived_at)}{" · "}{r.archived_by_name ?? "غير معروف"}
                  </span>
                  {r.archive_reason && (
                    <span className="block" style={{ fontSize: 12, color: B.text2, marginTop: 4 }}>السبب: {r.archive_reason}</span>
                  )}
                </span>
                <Button size="sm" variant="secondary" icon={<RotateCcw size={13} />} onClick={() => restore(r)}
                  aria-label={`استعادة ${r.label}`} title="استعادة إلى العمل اليومي">استعادة</Button>
                <IconButton size="sm" variant="outline" className="ui-iconbtn--danger" label={`حذف ${r.label} نهائياً — لا رجعة فيه`}
                  onClick={() => setTarget(r)}><Trash2 size={15} /></IconButton>
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
