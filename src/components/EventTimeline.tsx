/* سجلّ أحداث الكيان — يقرأ document_events ويعرضه خطّاً زمنياً.

   ملاحظة الفريق: «أضف Timeline يظهر كل انتقال حالة، الموظف، الوقت،
   الملاحظة، والدفع». الجدول واحدٌ للفاتورة والتذكرة والطلب والطلب
   المخصّص (ترحيل 20260909 ووسّعه 20260910)، فالمكوّن واحدٌ كذلك.

   يُلحَق ولا يُعدَّل: ما يُعرض هنا وقع فعلاً بتوقيته وصاحبه. والنتيجة
   (outcome) وحدها قابلة للتسجيل لاحقاً — «وصلت» أو «لم يردّ» — لأنها
   معلومةٌ لا تُعرف لحظة الحدث. */
import { useCallback, useEffect, useState } from "react";
import { Clock, RefreshCw } from "lucide-react";
import { B } from "@/lib/theme";
import type { DocEvent, DocEventKind } from "@/types";
import { fetchDocEvents, setEventOutcome, type DocType } from "@/features/docs/docEvents";
import { isSupabaseEnabled } from "@/supabase/client";

const KIND: Record<DocEventKind, { label: string; fg: string; bg: string }> = {
  whatsapp:       { label: "إرسال واتساب",   fg: "#128C4A", bg: "#E3F3E8" },
  print:          { label: "طباعة",          fg: "#5C554E", bg: "#EEECEA" },
  pdf:            { label: "تنزيل PDF",       fg: "#5C554E", bg: "#EEECEA" },
  scan:           { label: "مسح على الباب",  fg: "#0E7CA8", bg: "#E0F2FB" },
  cancel:         { label: "إلغاء",          fg: "#BE2626", bg: "#FBE6E6" },
  refund:         { label: "استرجاع",        fg: "#0E7CA8", bg: "#E0F2FB" },
  issue:          { label: "إصدار",          fg: "#1E7A44", bg: "#E3F3E8" },
  accept:         { label: "قبول",           fg: "#1E7A44", bg: "#E3F3E8" },
  reject:         { label: "رفض",            fg: "#BE2626", bg: "#FBE6E6" },
  assign:         { label: "تعيين",          fg: "#7226BE", bg: "#F1E9FA" },
  contact:        { label: "تواصل",          fg: "#128C4A", bg: "#E3F3E8" },
  close:          { label: "إغلاق",          fg: "#5C554E", bg: "#EEECEA" },
  bulk_close:     { label: "إغلاق جماعي",    fg: "#8A6A08", bg: "#FBF3D6" },
  discount:       { label: "خصم",            fg: "#8A6A08", bg: "#FBF3D6" },
  price_adjusted: { label: "تصحيح سعر",      fg: "#8A6A08", bg: "#FBF3D6" },
  status:         { label: "تغيير حالة",     fg: "#0E7CA8", bg: "#E0F2FB" },
  note:           { label: "ملاحظة",         fg: "#5C554E", bg: "#EEECEA" },
};

const when = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ar-SA-u-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });
};

export function EventTimeline({ docType, docId, title = "سجلّ الطلب", outcomes, reloadKey, emptyText }: {
  docType: DocType;
  docId: string;
  title?: string;
  /** نتائج يختارها الموظف لحدثٍ بلا نتيجة (إرسال أو تواصل). */
  outcomes?: readonly string[];
  /** أي تغيّرٍ فيه يعيد الجلب — مثلاً بعد إجراءٍ جديد. */
  reloadKey?: unknown;
  emptyText?: string;
}) {
  const [events, setEvents] = useState<DocEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(() => {
    if (!isSupabaseEnabled) return;
    setLoading(true);
    fetchDocEvents(docType, docId).then(setEvents).catch(() => {}).finally(() => setLoading(false));
  }, [docType, docId]);
  useEffect(reload, [reload, reloadKey]);

  if (!isSupabaseEnabled) return null;

  return (
    <div className="rounded-2xl p-5 mb-5" style={{ background: "#fff", border: `1px solid ${B.border}` }}>
      <div className="flex items-center justify-between mb-3">
        <div className="font-bold flex items-center gap-2" style={{ color: B.black, fontSize: 15 }}>
          <Clock size={15} style={{ color: B.gold }} />{title}
          <span className="text-xs font-semibold" style={{ color: B.muted }}>({events.length})</span>
        </div>
        <button onClick={reload} aria-label="تحديث السجلّ" title="تحديث السجلّ"
          className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer"
          style={{ background: B.fill, border: `1px solid ${B.border}`, color: B.text2 }}>
          <RefreshCw size={13} className={loading ? "animate-spin" : undefined} />
        </button>
      </div>
      {events.length === 0 ? (
        <div className="text-xs py-3" style={{ color: B.muted }}>
          {loading ? "جارٍ الجلب…" : (emptyText ?? "لا أحداث مسجَّلة بعد — تُسجَّل الانتقالات والإرسال والتعيين تلقائياً.")}
        </div>
      ) : (
        <ol className="m-0 p-0 flex flex-col" style={{ listStyle: "none" }}>
          {events.map((e, i) => {
            const k = KIND[e.event] ?? KIND.note;
            const askOutcome = !!outcomes?.length && !e.outcome && (e.event === "whatsapp" || e.event === "contact");
            return (
              <li key={e.id} className="flex gap-3 py-2.5" style={{ borderTop: i ? `1px solid ${B.border}` : "none" }}>
                <span className="flex-shrink-0 mt-0.5 px-2 py-0.5 rounded-md text-xs font-bold whitespace-nowrap"
                  style={{ background: k.bg, color: k.fg, minWidth: 74, textAlign: "center" }}>{k.label}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs" style={{ color: B.muted }}>
                    <span style={{ fontFamily: "var(--font-app)" }}>{when(e.createdAt)}</span>
                    {e.actorName ? <> · <b style={{ color: B.text2 }}>{e.actorName}</b></> : null}
                    {e.outcome && (
                      <span className="mr-2 px-2 py-0.5 rounded-full font-bold"
                        style={{ background: /وصلت|تم التواصل/.test(e.outcome) ? "#E3F3E8" : "#FBF3D6",
                                 color: /وصلت|تم التواصل/.test(e.outcome) ? "#1E7A44" : "#8A6A08" }}>{e.outcome}</span>
                    )}
                  </div>
                  {e.note && <div className="text-sm mt-1 whitespace-pre-line" style={{ color: B.text2 }}>{e.note}</div>}
                  {askOutcome && (
                    <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                      <span className="text-xs font-bold" style={{ color: B.text3 }}>النتيجة:</span>
                      {outcomes!.map(o => (
                        <button key={o} onClick={() => setEventOutcome(e.id, o).then(reload)}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer"
                          style={{ background: "#fff", border: `1px solid ${B.border}`, color: B.text2 }}>{o}</button>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
