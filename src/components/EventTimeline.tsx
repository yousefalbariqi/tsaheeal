/* سجلّ أحداث الكيان — يقرأ document_events ويعرضه خطّاً زمنياً.

   ملاحظة الفريق: «أضف Timeline يظهر كل انتقال حالة، الموظف، الوقت،
   الملاحظة، والدفع». الجدول واحدٌ للفاتورة والتذكرة والطلب والطلب
   المخصّص (ترحيل 20260909 ووسّعه 20260910)، فالمكوّن واحدٌ كذلك.

   يُلحَق ولا يُعدَّل: ما يُعرض هنا وقع فعلاً بتوقيته وصاحبه. والنتيجة
   (outcome) وحدها قابلة للتسجيل لاحقاً — «وصلت» أو «لم يردّ» — لأنها
   معلومةٌ لا تُعرف لحظة الحدث. */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeftRight, Ban, Check, Clock, Download, FileCheck, Lock, MessageCircle, MessageSquare,
  Phone, Printer, RefreshCw, RotateCcw, ScanLine, Tag, UserCheck, X,
} from "lucide-react";
import { B, TONE, type ToneName } from "@/lib/theme";
import { fmtDateTime } from "@/lib/dates";
import { Badge, Button, IconButton } from "@/components/ui";
import type { DocEvent, DocEventKind } from "@/types";
import { fetchDocEvents, setEventOutcome, type DocType } from "@/features/docs/docEvents";
import { isSupabaseEnabled } from "@/supabase/client";

/* لكل حدثٍ اسمٌ ولونُ معنى وأيقونة. اللون من TONE في اللوحة — كانت هنا
   خريطةٌ بأرقام الألوان، وفيها بنفسجيٌّ وسماويٌّ لا مقابل لهما في النظام. */
const KIND: Record<DocEventKind, { label: string; tone: ToneName; icon: ReactNode }> = {
  whatsapp:       { label: "إرسال واتساب",  tone: "success", icon: <MessageCircle size={13} /> },
  print:          { label: "طباعة",         tone: "neutral", icon: <Printer size={13} /> },
  pdf:            { label: "تنزيل PDF",      tone: "neutral", icon: <Download size={13} /> },
  scan:           { label: "مسح على الباب", tone: "info",    icon: <ScanLine size={13} /> },
  cancel:         { label: "إلغاء",         tone: "danger",  icon: <Ban size={13} /> },
  refund:         { label: "استرجاع",       tone: "warn",    icon: <RotateCcw size={13} /> },
  issue:          { label: "إصدار",         tone: "success", icon: <FileCheck size={13} /> },
  accept:         { label: "قبول",          tone: "success", icon: <Check size={13} /> },
  reject:         { label: "رفض",           tone: "danger",  icon: <X size={13} /> },
  assign:         { label: "تعيين",         tone: "neutral", icon: <UserCheck size={13} /> },
  contact:        { label: "تواصل",         tone: "success", icon: <Phone size={13} /> },
  close:          { label: "إغلاق",         tone: "neutral", icon: <Lock size={13} /> },
  bulk_close:     { label: "إغلاق جماعي",   tone: "warn",    icon: <Lock size={13} /> },
  discount:       { label: "خصم",           tone: "warn",    icon: <Tag size={13} /> },
  price_adjusted: { label: "تصحيح سعر",     tone: "warn",    icon: <Tag size={13} /> },
  status:         { label: "تغيير حالة",    tone: "info",    icon: <ArrowLeftRight size={13} /> },
  note:           { label: "ملاحظة",        tone: "neutral", icon: <MessageSquare size={13} /> },
};

/* lib/dates يقرأ نصّ التخزين كما كُتب (بلا منطقة زمنية)، وطابع الحدث لحظةٌ
   بتوقيت UTC — فيُحوَّل أوّلاً إلى ساعة الرياض ثم يُنسَّق. */
const when = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return fmtDateTime(new Date(d.getTime() + 3 * 3_600_000).toISOString().slice(0, 16).replace("T", " "));
};

const countLabel = (n: number): string =>
  n === 0 ? "لا أحداث" : n === 1 ? "حدث واحد" : n === 2 ? "حدثان" : n <= 10 ? `${n} أحداث` : `${n} حدثاً`;

export function EventTimeline({ docType, docId, title = "سجلّ الطلب", outcomes, reloadKey, emptyText, flat }: {
  docType: DocType;
  docId: string;
  title?: string;
  /** بلا إطار البطاقة: حين يكون السجلّ داخل قسمٍ مطويّ يحمل عنوانه أصلاً
      — إطارٌ داخل إطارٍ يُثقل الصفحة ويكرّر العنوان. */
  flat?: boolean;
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
    <div className={flat ? undefined : "ui-card p-5 mb-5"}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          {title ? <><Clock size={15} style={{ color: B.muted, flexShrink: 0 }} /><span className="ts-section-title truncate">{title}</span></> : null}
          <span className="ts-count">{countLabel(events.length)}</span>
        </div>
        <IconButton size="sm" variant="outline" label="تحديث السجلّ" onClick={reload}>
          <RefreshCw size={14} className={loading ? "animate-spin" : undefined} />
        </IconButton>
      </div>
      {events.length === 0 ? (
        <div className="text-sm py-2" style={{ color: B.muted, lineHeight: 1.7 }}>
          {loading ? "جارٍ التحميل…" : (emptyText ?? "لا أحداث مسجَّلة بعد — تُسجَّل الانتقالات والإرسال والتعيين تلقائياً.")}
        </div>
      ) : (
        /* خطٌّ زمنيّ: نقطةٌ بلون المعنى لكل حدث، وخيطٌ يصلها بما بعدها.
           السطر: من · ماذا · متى — ثم الملاحظة تحته. */
        <ol className="m-0 p-0 flex flex-col" style={{ listStyle: "none" }}>
          {events.map((e, i) => {
            const k = KIND[e.event] ?? KIND.note;
            const t = TONE[k.tone];
            const last = i === events.length - 1;
            const askOutcome = !!outcomes?.length && !e.outcome && (e.event === "whatsapp" || e.event === "contact");
            return (
              <li key={e.id} className="relative flex gap-3" style={{ paddingBottom: last ? 0 : 16 }}>
                {!last && <span aria-hidden className="absolute" style={{ insetInlineStart: 12, top: 28, bottom: 2, width: 1, background: B.border }} />}
                <span aria-hidden className="flex items-center justify-center flex-shrink-0"
                  style={{ width: 26, height: 26, borderRadius: 999, background: t.bg, color: t.fg, boxShadow: `inset 0 0 0 1px ${t.line}` }}>{k.icon}</span>
                <div className="flex-1 min-w-0" style={{ paddingTop: 2 }}>
                  <div className="flex items-center gap-x-1.5 gap-y-1 flex-wrap" style={{ fontSize: 13, lineHeight: 1.6 }}>
                    {e.actorName && <><b style={{ fontWeight: 600, color: B.black }}>{e.actorName}</b><span aria-hidden style={{ color: B.placeholder }}>·</span></>}
                    <span style={{ fontWeight: e.actorName ? 400 : 600, color: e.actorName ? B.text2 : B.black }}>{k.label}</span>
                    <span aria-hidden style={{ color: B.placeholder }}>·</span>
                    <time dateTime={e.createdAt} className="text-xs" style={{ color: B.muted }}>{when(e.createdAt)}</time>
                    {e.outcome && <Badge tone={/وصلت|تم التواصل/.test(e.outcome) ? "success" : "warn"}>{e.outcome}</Badge>}
                  </div>
                  {e.note && <div className="text-sm mt-1 whitespace-pre-line" style={{ color: B.text2, lineHeight: 1.7 }}>{e.note}</div>}
                  {askOutcome && (
                    <div className="flex items-center gap-1.5 flex-wrap mt-2">
                      <span className="text-xs font-bold" style={{ color: B.text3 }}>النتيجة:</span>
                      {outcomes!.map(o => (
                        <Button key={o} size="sm" variant="secondary" onClick={() => setEventOutcome(e.id, o).then(reload)}>{o}</Button>
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
