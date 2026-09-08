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
import { motion } from "motion/react";
import { Pencil, Archive, Trash2, EyeOff, Eye, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { B } from "@/lib/theme";
import { DeleteDialog } from "@/components/DeleteDialog";
import { Spinner } from "@/components/Spinner";

/* ═══ حوار الحذف النهائي ═══════════════════════════════════════════
   منفصلٌ عن حوار الأرشفة قصداً: لونه ونصّه وإقرارُه يجب أن يقولا «هذا
   مختلف». وبلا إقرارٍ صريح يصير الحذف النهائي ضغطتين كالأرشفة تماماً. */
function PermanentDeleteDialog({ name, label, blockers, busy, onConfirm, onCancel }: {
  name: string;
  /** اسم الكيان في الجملة: «الفندق» · «الطلب المخصّص». */
  label: string;
  blockers: string[];
  busy: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const [understood, setUnderstood] = useState(false);
  const blocked = blockers.length > 0;
  const ready = !blocked && !!reason.trim() && understood && !busy;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(14,12,11,0.82)", backdropFilter: "blur(4px)" }} onClick={onCancel}>
      <motion.div initial={{ scale: 0.94, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.94, opacity: 0 }}
        role="dialog" aria-modal="true" aria-label={`حذف ${label} نهائياً`}
        className="rounded-2xl p-7 w-full" style={{ maxWidth: 400, background: "#fff" }} onClick={e => e.stopPropagation()}>
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ background: "#FBE6E6" }}>
          <AlertTriangle size={20} style={{ color: "#BE2626" }} />
        </div>
        <h3 className="text-base font-bold mb-1" style={{ color: B.black }}>حذف {label} نهائياً</h3>
        <p className="text-sm leading-relaxed mb-4" style={{ color: B.text2 }}>
          <b style={{ color: B.black }}>{name}</b> سيُمحى من قاعدة البيانات ولا يمكن استرجاعه.
          إن أردتَ إخفاءه مع الاحتفاظ به فاستخدم الأرشفة.
        </p>

        {blocked ? (
          <div className="rounded-xl px-4 py-3 mb-5" style={{ background: "#FBF3D6", border: "1px solid #EBD9A0" }}>
            <div className="text-xs font-bold mb-1.5" style={{ color: "#8A6A08" }}>لا يمكن الحذف — السجل مرتبط بغيره</div>
            <ul className="text-xs leading-relaxed m-0 ps-4" style={{ color: "#6b5a2a" }}>
              {blockers.map(b => <li key={b}>{b}</li>)}
            </ul>
            <div className="text-xs mt-2" style={{ color: "#8A6A08" }}>الأرشفة متاحة دائماً بدلاً منه.</div>
          </div>
        ) : (
          <>
            <label className="block text-xs font-bold mb-1.5" style={{ color: B.text3 }}>
              سبب الحذف النهائي <span style={{ color: "#BE2626" }}>*</span>
            </label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
              placeholder="مثال: سجل تجريبي أُدخل بالخطأ"
              className="w-full rounded-xl border px-3 py-2 text-sm mb-3 resize-none focus:outline-none"
              style={{ borderColor: B.border, fontFamily: "inherit", color: B.black }} />
            <button onClick={() => setUnderstood(v => !v)}
              className="flex items-start gap-2.5 w-full text-start mb-5 cursor-pointer"
              style={{ background: "none", border: "none", padding: 0 }} aria-pressed={understood}>
              <span className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ background: understood ? "#BE2626" : "#fff", border: `1.5px solid ${understood ? "#BE2626" : B.border}`, color: "#fff", fontSize: 12, fontWeight: 800 }}>
                {understood ? "✓" : ""}
              </span>
              <span className="text-xs leading-relaxed" style={{ color: B.text2 }}>
                أفهم أن الحذف نهائي ولا يمكن استرجاع السجل.
              </span>
            </button>
          </>
        )}

        <div className="flex gap-2">
          {!blocked && (
            <button onClick={() => ready && onConfirm(reason.trim())} disabled={!ready}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold"
              style={{ background: "#BE2626", color: "#fff", border: "none", opacity: ready ? 1 : 0.45, cursor: ready ? "pointer" : "not-allowed" }}>
              {busy && <Spinner size={13} color="#fff" track="rgba(255,255,255,0.3)" />}
              {busy ? "جارٍ الحذف…" : "حذف نهائي"}
            </button>
          )}
          <button onClick={onCancel}
            className="flex-1 py-3 rounded-xl text-sm font-bold cursor-pointer"
            style={{ background: B.bg, color: B.text2, border: "none" }}>
            {blocked ? "إغلاق" : "إلغاء"}
          </button>
        </div>
      </motion.div>
    </motion.div>
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
  onArchive: (reason: string) => void;
  /** الحذف النهائي. يُحذف الزرّ إن لم يُمرَّر. */
  onPermanentDelete?: (reason: string) => Promise<void> | void;
  /** أسبابٌ تمنع الحذف النهائي — تُعرض في الحوار بنصّها. */
  deleteBlockers?: string[];
  /** true فيصير زرّ التعديل عريضاً في أسفل بطاقة. */
  primaryEdit?: boolean;
}

export function EntityActions({
  name, label, canWrite, isAdmin, onEdit,
  active, onToggleActive, disableLabel = "إيقاف مؤقت",
  onArchive, onPermanentDelete, deleteBlockers = [], primaryEdit = true,
}: EntityActionsProps) {
  const [dialog, setDialog] = useState<null | "archive" | "delete">(null);
  const [busy, setBusy] = useState(false);

  /* بلا صلاحية كتابة لا تُعرض إلا القراءة: زرٌّ مرئيّ يعد بعملٍ ترفضه
     القاعدة جهدٌ ضائع ورسالةُ خطأ بدل زرٍّ لم يكن ينبغي أن يظهر. */
  if (!canWrite) return null;

  const iconBtn = (tone: "neutral" | "gold" | "danger"): React.CSSProperties => ({
    width: 38, height: 38, borderRadius: 12, display: "flex", alignItems: "center",
    justifyContent: "center", cursor: "pointer", flexShrink: 0,
    ...(tone === "neutral" ? { background: "#fff", border: `1px solid ${B.border}`, color: B.text3 }
      : tone === "gold" ? { background: "#FBF3D6", border: "1px solid #EBD9A0", color: "#8A6A08" }
      : { background: "#FBE6E6", border: "1px solid #F3C9C9", color: "#BE2626" }),
  });

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
      <div className="flex gap-2 items-center">
        {onEdit && (
          <button onClick={onEdit}
            className={`${primaryEdit ? "flex-1" : ""} flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-bold cursor-pointer`}
            style={{ background: B.primary, color: B.cream, border: "none", height: 38 }}>
            <Pencil size={13} />تعديل
          </button>
        )}

        {onToggleActive && (
          <button onClick={() => onToggleActive(!active)} style={iconBtn(active ? "neutral" : "gold")}
            title={active ? disableLabel : "تنشيط"} aria-label={active ? disableLabel : "تنشيط"}>
            {active ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        )}

        <button onClick={() => setDialog("archive")} style={iconBtn("gold")}
          title="أرشفة" aria-label={`أرشفة ${label}`}>
          <Archive size={15} />
        </button>

        {onPermanentDelete && isAdmin && (
          <button onClick={() => setDialog("delete")} style={iconBtn("danger")}
            title={deleteBlockers.length ? "الحذف غير متاح — السجل مرتبط بغيره" : "حذف نهائي"}
            aria-label={`حذف ${label} نهائياً`}>
            <Trash2 size={15} />
          </button>
        )}
      </div>

      {dialog === "archive" && (
        <DeleteDialog onCancel={() => setDialog(null)}
          onConfirm={reason => { onArchive(reason); setDialog(null); }} />
      )}
      {dialog === "delete" && (
        <PermanentDeleteDialog name={name} label={label} blockers={deleteBlockers} busy={busy}
          onConfirm={runDelete} onCancel={() => !busy && setDialog(null)} />
      )}
    </>
  );
}
