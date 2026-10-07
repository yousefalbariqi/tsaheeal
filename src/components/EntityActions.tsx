/* إجراءات السجل — تعديل · تعطيل · أرشفة · حذف، في مكوّنٍ واحد.

   ما رآه الفريق: «بطاقة الفندق فيها تعديل فقط»، و«الطلب التجريبي يكتب
   صراحةً يرجى الحذف ولا توجد أداة حذف أو أرشفة». والعلّة ليست في القاعدة:
   دالّتا archive_entity و permanently_delete_entity موجودتان منذ ترحيل
   ٢٠٢٦٠٩٠٦ بحرّاسهما وسببهما الإلزامي — الناقص واجهةٌ تناديهما.

   ثلاثة إجراءاتٍ لا واحد، لأنها ثلاثة معانٍ مختلفة:

   • **تعطيل** — قرارٌ تشغيلي مؤقّت: الفندق تحت الصيانة، والعقد مُعلَّق.
     السجل باقٍ في القوائم، محجوبٌ عن العميل، ويُعاد تنشيطه بضغطة.
   • **أرشفة** — «لم يعد يُستعمل»: يُخفى من العمل اليومي ويبقى في التدقيق
     وفي الطلبات القديمة المرتبطة به. هذا هو الحذف الآمن، وسببه إلزامي.
   • **حذف نهائي** — يُمحى الصفّ. للمدير وحده، وبسببٍ صريح، ولا يُتاح
     إن كان السجل مرتبطاً بشيء: حذف فندقٍ تحمله باقةٌ منشورة يترك مرجعاً
     معلَّقاً يظهر للعميل «سكن غير متوفّر». المانع يُعرض بنصّه لا يُخفى.

   المكوّن مكتفٍ بنفسه: لا يعتمد إلا على النسق والحوار — فلا يسقط إن
   تغيّرت مكوّناتٌ مشتركة أخرى تحت يد أحد. */
import { useState } from "react";
import { Pencil, Archive, Trash2, EyeOff, Eye, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { B } from "@/lib/theme";
import { DeleteDialog } from "@/components/DeleteDialog";
import { Button, IconButton, Modal, ModalIcon, Note, Textarea } from "@/components/ui";

/* ═══ حوار الحذف النهائي ═══════════════════════════════════════════
   منفصلٌ عن حوار الأرشفة قصداً: لونه ونصّه وإقرارُه يجب أن يقولا «هذا
   مختلف». وبلا إقرارٍ صريح يصير الحذف النهائي ضغطتين كالأرشفة تماماً. */
export function PermanentDeleteDialog({ name, label, blockers, busy, onConfirm, onCancel, safeAlternative = "الأرشفة" }: {
  name: string;
  /** اسم الكيان في الجملة: «الفندق» · «الطلب المخصّص». */
  label: string;
  blockers: string[];
  busy: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  /** الإجراء الآمن البديل للكيانات التي لا تستخدم الأرشفة. */
  safeAlternative?: string;
}) {
  const [reason, setReason] = useState("");
  const [understood, setUnderstood] = useState(false);
  const blocked = blockers.length > 0;
  const ready = !blocked && !!reason.trim() && understood && !busy;

  return (
    <Modal open onClose={() => { if (!busy) onCancel(); }} width={460} zIndex={80}
      title={`حذف ${label} نهائياً`}
      icon={<ModalIcon tone="danger"><AlertTriangle size={19} /></ModalIcon>}
      footer={<>
        {!blocked && (
          <Button variant="danger" disabled={!ready} loading={busy} onClick={() => ready && onConfirm(reason.trim())}>
            {busy ? "جارٍ الحذف…" : "حذف نهائي"}
          </Button>
        )}
        <Button variant="secondary" onClick={onCancel} disabled={busy}>{blocked ? "إغلاق" : "إلغاء"}</Button>
      </>}>
      <p className="text-sm" style={{ color: B.text2, lineHeight: 1.8, margin: "0 0 16px" }}>
        <b style={{ color: B.black }}>{name}</b> سيُمحى من قاعدة البيانات ولا يمكن استرجاعه.
        إن أردتَ إخفاءه مع الاحتفاظ به فاستخدم {safeAlternative}.
      </p>

      {blocked ? (
        <Note tone="warn">
          <div style={{ fontWeight: 600, marginBottom: 4 }}>لا يمكن الحذف — السجل مرتبط بغيره</div>
          <ul className="m-0 ps-4" style={{ listStyle: "disc" }}>
            {blockers.map(b => <li key={b}>{b}</li>)}
          </ul>
          <div style={{ marginTop: 6 }}>{safeAlternative} متاح دائماً بدلاً منه.</div>
        </Note>
      ) : (
        <>
          <label className="ui-label" htmlFor="perm-delete-reason">سبب الحذف النهائي<span className="ui-req">*</span></label>
          <Textarea id="perm-delete-reason" value={reason} onChange={e => setReason(e.target.value)} rows={2}
            placeholder="مثال: سجل تجريبي أُدخل بالخطأ" style={{ resize: "none" }} />
          <label className="flex items-start gap-2.5 mt-4 cursor-pointer">
            <input type="checkbox" checked={understood} onChange={e => setUnderstood(e.target.checked)}
              className="mt-1 flex-shrink-0" style={{ width: 16, height: 16, accentColor: "#BE2626" }} />
            <span className="text-sm" style={{ color: B.text2, lineHeight: 1.7 }}>
              أفهم أن الحذف نهائي ولا يمكن استرجاع السجل.
            </span>
          </label>
        </>
      )}
    </Modal>
  );
}

/* ═══ صفّ الإجراءات ════════════════════════════════════════════════ */

export interface EntityActionsProps {
  /** اسم السجل كما يُعرض في الحوارات. */
  name: string;
  /** اسم الكيان في الجملة: «الفندق» · «الطلب المخصّص». */
  label: string;
  /** هل يملك المستخدم كتابة هذه الشاشة؟ */
  canWrite: boolean;
  /** هل هو مدير؟ الحذف النهائي له وحده — مرآةً لحرس الدالّة في القاعدة. */
  isAdmin: boolean;
  /** يُحذف زرّ التعديل إن لم يُمرَّر — شاشةٌ تُحرَّر في مكانها لا تحتاجه. */
  onEdit?: () => void;
  /** التعطيل والتنشيط. يُحذف الزرّ إن لم يُمرَّر (كيانٌ بلا حالة). */
  active?: boolean;
  onToggleActive?: (next: boolean) => void;
  /** نصّ التعطيل — يختلف بحسب الكيان: «إيقاف مؤقت» للفندق. */
  disableLabel?: string;
  /** الأرشفة بسببها. المكوّن يفتح الحوار ويستدعيها بالسبب. */
  onArchive?: (reason: string) => void;
  /** الحذف النهائي. يُحذف الزرّ إن لم يُمرَّر. */
  onPermanentDelete?: (reason: string) => Promise<void> | void;
  /** أسبابٌ تمنع الحذف النهائي — تُعرض في الحوار بنصّها. */
  deleteBlockers?: string[];
  /** true فيصير زرّ التعديل عريضاً في أسفل بطاقة. */
  primaryEdit?: boolean;
  /** في المواصلات يكون الإجراء لفظياً بدلاً من رمز العين. */
  toggleAsLabel?: boolean;
  /** البديل الآمن للحذف النهائي؛ الإيقاف للمواصلات. */
  safeAlternative?: string;
}

export function EntityActions({
  name, label, canWrite, isAdmin, onEdit,
  active, onToggleActive, disableLabel = "إيقاف مؤقت",
  onArchive, onPermanentDelete, deleteBlockers = [], primaryEdit = true,
  toggleAsLabel = false, safeAlternative,
}: EntityActionsProps) {
  const [dialog, setDialog] = useState<null | "archive" | "delete">(null);
  const [busy, setBusy] = useState(false);

  /* بلا صلاحية كتابة لا تُعرض إلا القراءة: زرٌّ مرئيّ يعد بعملٍ ترفضه
     القاعدة جهدٌ ضائع ورسالةُ خطأ بدل زرٍّ لم يكن ينبغي أن يظهر. */
  if (!canWrite) return null;

  const runDelete = async (reason: string) => {
    if (!onPermanentDelete) return;
    setBusy(true);
    try {
      await onPermanentDelete(reason);
      setDialog(null);
      toast.success(`تم حذف ${label} نهائياً`);
    } catch (e) {
      toast.error(`تعذّر حذف ${label}`, { description: (e as Error)?.message ?? String(e), duration: 9000 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="relative z-10 flex gap-2 items-center min-w-0" style={{ isolation: "isolate" }}>
        {onEdit && (
          <Button variant="secondary" onClick={onEdit} icon={<Pencil size={14} />}
            className={primaryEdit ? "flex-1" : undefined}>تعديل</Button>
        )}

        {onToggleActive && !toggleAsLabel && (
          <IconButton variant="outline" label={active ? disableLabel : "تنشيط"} onClick={() => onToggleActive(!active)}
            style={active ? undefined : { background: "var(--k-warn-bg)", borderColor: "var(--k-warn-line)", color: "var(--k-warn)" }}>
            {active ? <EyeOff size={16} /> : <Eye size={16} />}
          </IconButton>
        )}

        {onToggleActive && toggleAsLabel && (
          <Button variant={active ? "secondary" : "dark"} onClick={() => onToggleActive(!active)}>
            {active ? "إيقاف" : "تفعيل"}
          </Button>
        )}

        {onArchive && (
          <IconButton variant="outline" label={`أرشفة ${label}`} onClick={() => setDialog("archive")}>
            <Archive size={16} />
          </IconButton>
        )}

        {onPermanentDelete && isAdmin && (
          <IconButton variant="outline" className="ui-iconbtn--danger" onClick={() => setDialog("delete")}
            label={deleteBlockers.length ? "الحذف غير متاح — السجل مرتبط بغيره" : `حذف ${label} نهائياً`}>
            <Trash2 size={16} />
          </IconButton>
        )}
      </div>

      {dialog === "archive" && onArchive && (
        <DeleteDialog onCancel={() => setDialog(null)}
          onConfirm={reason => { onArchive(reason); setDialog(null); }} />
      )}
      {dialog === "delete" && (
        <PermanentDeleteDialog name={name} label={label} blockers={deleteBlockers} busy={busy}
          onConfirm={runDelete} onCancel={() => !busy && setDialog(null)} safeAlternative={safeAlternative} />
      )}
    </>
  );
}
