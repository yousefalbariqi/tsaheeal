/* شريط إجراءات المستند — للفاتورة والتذكرة معاً.

   كان في الفاتورة شريطٌ فيه طباعة وواتساب وإغلاق، وفي التذكرة زرّ
   «إغلاق» وحده — لا طباعة ولا تنزيل ولا إرسال، وهي ملاحظة الفريق
   حرفياً. ولو نُسخ شريط الفاتورة إلى التذكرة لصار الإصلاح التالي
   مضاعفاً. فمكوّنٌ واحد يخدم الاثنين.

   ── ما يفعله زيادةً على السابق ──
   • **سجلّ إرسال**: كل إرسال يُكتب في `document_events` بمن أرسل ومتى،
     ويُعرض آخره تحت الشريط. ومنعُ النقر المتكرّر مبنيٌّ على السجلّ لا
     على حالة المكوّن — تبويبان مفتوحان يتجاوزان الحالة ولا يتجاوزان
     القاعدة.
   • **نتيجة يدوية**: بعد الإرسال يُسأل الموظف «وصلت؟» فيسجّلها. لا
     واجهة برمجية لواتساب (قرار ٢٠٢٦-٠٩-٠٦)، فادّعاء معرفة المصير كذب.
   • **تنزيل PDF منفصل عن الطباعة**: زرّ الطباعة يفتح حوار الطابعة،
     ومن أراد ملفاً كان عليه أن يعرف «اطبع ← احفظ كـPDF». الزرّ الآن
     صريح، واسم الملفّ يحمل رقم المستند واسم صاحبه.

   ── لماذا PDF عبر حوار الطباعة لا مكتبة ──
   إخراج PDF عربيّ من jsPDF يحتاج تضمين خطٍّ عربي (نحو ٤٠٠ كيلوبايت)
   وتشكيل الحروف ووصلها يدوياً — والنتيجة أضعف ممّا يرسمه المتصفّح
   أصلاً على الشاشة. فالتنزيل يستعمل محرّك طباعة المتصفّح نفسه، ويُسمّي
   المستند بـ`document.title` فيقترحه اسماً للملف. */
import { useCallback, useEffect, useState } from "react";
import { Printer, Download, X, Ban, RotateCcw, Check } from "lucide-react";
import { toast } from "sonner";
import { B, ELEV, TONE } from "@/lib/theme";
import { openWhatsApp } from "@/lib/utils";
import { fmtDateTime } from "@/lib/dates";
import { Badge, Button, IconButton, confirmDialog } from "@/components/ui";
import { WhatsAppGlyph } from "@/components/WhatsAppFab";
import type { DocEvent } from "@/types";
import {
  fetchDocEvents, logDocEvent, setEventOutcome, SEND_OUTCOMES,
  type DocType,
} from "./docEvents";

/** آخر إرسالٍ خلال هذه المدّة يُعدّ «للتوّ» فيُطلب تأكيدٌ قبل التكرار. */
const RECENT_SEND_MS = 10 * 60_000;

/* اسم المستند في رأس الشريط — يقول ما المفتوح قبل أن تُقرأ الورقة. */
const DOC_NAME: Partial<Record<DocType, string>> = { invoice: "فاتورة", ticket: "تذكرة" };

/* أخضر واتساب — لون علامةٍ لا لون معنى، فلا مقابل له في اللوحة. يلوّن
   الأيقونة وحدها؛ الزرّ نفسه ثانويّ كجيرانه. */
const WHATSAPP_GREEN = "#25D366";

/* lib/dates يقرأ نصّ التخزين كما كُتب (بلا منطقة زمنية)، وطابع الحدث لحظةٌ
   بتوقيت UTC — فيُحوَّل أوّلاً إلى ساعة الرياض ثم يُنسَّق. */
const riyadhStamp = (ms: number): string =>
  new Date(ms + 3 * 3_600_000).toISOString().slice(0, 16).replace("T", " ");

const fmtWhen = (iso: string): string => {
  const d = new Date(iso);
  const mins = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `قبل ${mins} د`;
  if (mins < 1440) return `قبل ${Math.floor(mins / 60)} س`;
  return fmtDateTime(riyadhStamp(d.getTime()));
};

export interface DocActionsProps {
  docType: DocType;
  docId: string;
  /** اسم الملفّ عند التنزيل — بلا لاحقة. */
  fileName: string;
  /** جوال المستلم ونصّ الرسالة. غيابه يُخفي زرّ الإرسال. */
  whatsapp?: { phone: string; text: string };
  /** إجراء الإلغاء — يُعرض للمدير فقط ولمستندٍ قابلٍ للإلغاء. */
  onCancelDoc?: () => void;
  /** إجراء الاسترجاع. */
  onRefund?: () => void;
  /** يفتح حوار الطباعة فور ظهور المستند — لمن ضغط «طباعة الفاتورة» من
      شاشة الطلب: المستند يُعرض والحوار يُفتح، بلا ضغطةٍ ثانية. */
  autoPrint?: boolean;
  onClose: () => void;
}

export function DocActions(p: DocActionsProps) {
  const [events, setEvents] = useState<DocEvent[]>([]);
  const [busy, setBusy] = useState(false);
  /** الحدث الذي ننتظر أن يسجّل الموظف نتيجته. */
  const [pending, setPending] = useState<number | null>(null);

  const reload = useCallback(() => {
    fetchDocEvents(p.docType, p.docId).then(setEvents).catch(() => {});
  }, [p.docType, p.docId]);
  useEffect(reload, [reload]);

  const lastSend = events.find(e => e.event === "whatsapp");
  const sentRecently = !!lastSend && Date.now() - Date.parse(lastSend.createdAt) < RECENT_SEND_MS;

  async function send() {
    if (!p.whatsapp || busy) return;
    /* التأكيد لا المنع: قد يكون الإرسال الأول لم يصل فعلاً، ومنعُ
       الموظف من إعادته يجعله ينسخ الرابط يدوياً — فيخرج من السجلّ. */
    if (sentRecently) {
      const when = fmtWhen(lastSend!.createdAt);
      const again = await confirmDialog({
        title: "إرسال الرسالة مرّة أخرى؟",
        message: `أُرسلت هذه الرسالة ${when} بواسطة ${lastSend!.actorName ?? "موظف"}.`,
        confirmLabel: "إرسال مرّة أخرى",
      });
      if (!again) return;
    }
    setBusy(true);
    try {
      openWhatsApp(p.whatsapp.phone, p.whatsapp.text);
      const id = await logDocEvent(p.docType, p.docId, "whatsapp");
      if (id) setPending(id);
      reload();
    } finally { setBusy(false); }
  }

  function print() {
    logDocEvent(p.docType, p.docId, "print").then(reload);
    window.print();
  }

  /* الطباعة التلقائية بعد رسمة كاملة: window.print يلتقط ما رُسم فعلاً،
     ونداؤها في نفس دورة التركيب يطبع صفحةً قبل ظهور المستند. */
  const auto = p.autoPrint;
  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => {
      logDocEvent(p.docType, p.docId, "print").then(reload);
      window.print();
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  /* التنزيل يستعمل نفس حوار الطباعة، لكنه يُسمّي المستند أولاً:
     المتصفّح يقترح `document.title` اسماً للملفّ عند «حفظ كـPDF»،
     فيخرج «فاتورة-INV-991B6C-أحمد العمري.pdf» لا «تساهيل.pdf». */
  function download() {
    const prev = document.title;
    document.title = p.fileName;
    logDocEvent(p.docType, p.docId, "pdf").then(reload);
    toast.info("اختر «حفظ كـ PDF» من وجهة الطباعة", { duration: 6000 });
    /* الإعادة بعد إغلاق الحوار: `print` متزامنة في أغلب المتصفّحات
       لكن سفاري يؤجّلها، فالاستعادة في مؤقّت لا بعد النداء مباشرة. */
    window.print();
    setTimeout(() => { document.title = prev; }, 1500);
  }

  async function saveOutcome(outcome: string) {
    if (pending === null) return;
    await setEventOutcome(pending, outcome);
    setPending(null);
    reload();
  }

  return (
    /* شريطٌ واحد أبيض فوق الورقة: اسم المستند، ثم الأفعال، ثم الإغلاق.
       الذهبي للطباعة وحدها — هي ما فُتح المستند لأجله — وما عداها ثانويّ.
       على الجوال ينزل صفّ الأفعال تحت العنوان ويلتفّ بأزرارٍ متساوية. */
    <div data-print-hide style={{ background: B.surface, borderRadius: 16, boxShadow: ELEV[3], padding: "10px 12px" }}>
      <div className="flex items-center gap-x-3 gap-y-2.5 flex-wrap">
        <div className="order-1 flex-1 min-w-0 ps-1.5">
          <div style={{ fontSize: 12, color: B.muted, lineHeight: 1.4 }}>{DOC_NAME[p.docType] ?? "مستند"}</div>
          <div className="truncate" dir="ltr" style={{ fontSize: 15, fontWeight: 700, color: B.black, lineHeight: 1.4, textAlign: "end" }}>{p.docId}</div>
        </div>
        <div className="order-3 sm:order-2 w-full sm:w-auto flex items-center gap-2 flex-wrap">
          <Button variant="primary" icon={<Printer size={16} />} onClick={print} className="flex-1 sm:flex-none">طباعة</Button>
          <Button variant="secondary" icon={<Download size={16} />} onClick={download} className="flex-1 sm:flex-none">تنزيل PDF</Button>
          {p.whatsapp && (
            <Button variant="secondary" loading={busy} onClick={send} className="flex-1 sm:flex-none"
              icon={<span style={{ color: WHATSAPP_GREEN, display: "inline-flex" }}><WhatsAppGlyph size={17} /></span>}>
              {lastSend ? "إعادة الإرسال" : "إرسال واتساب"}
            </Button>
          )}
          {p.onRefund && (
            <Button variant="danger-soft" icon={<RotateCcw size={15} />} onClick={p.onRefund} className="flex-1 sm:flex-none">استرجاع</Button>
          )}
          {p.onCancelDoc && (
            <Button variant="danger-soft" icon={<Ban size={15} />} onClick={p.onCancelDoc} className="flex-1 sm:flex-none">إلغاء</Button>
          )}
        </div>
        <div className="order-2 sm:order-3 flex items-center gap-2">
          <span aria-hidden className="hidden sm:block" style={{ width: 1, height: 24, background: B.border }} />
          <IconButton label="إغلاق" onClick={p.onClose}><X size={18} /></IconButton>
        </div>
      </div>

      {/* ── سؤال النتيجة ──
          يظهر بعد الإرسال مباشرةً ويختفي بالإجابة. لا يُلحّ: تجاهله
          يترك الحدث مسجّلاً بلا نتيجة، وذاك أصدق من نتيجةٍ مفترضة. */}
      {pending !== null && (
        <div className="flex items-center gap-2 flex-wrap mt-2.5 px-3 py-2 rounded-xl"
          style={{ background: TONE.success.bg, border: `1px solid ${TONE.success.line}` }}>
          <span className="text-sm font-bold me-auto" style={{ color: TONE.success.fg }}>هل وصلت الرسالة؟</span>
          {SEND_OUTCOMES.map(o => (
            <Button key={o} size="sm" variant="secondary" onClick={() => saveOutcome(o)}>{o}</Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setPending(null)}>لاحقاً</Button>
        </div>
      )}

      {/* ── آخر إرسال ──
          سطرٌ واحد يجيب «هل أُرسلت؟» بلا فتح سجلّ. */}
      {lastSend && pending === null && (
        <div className="flex items-center gap-2 flex-wrap mt-2.5 pt-2.5 px-1.5 text-xs"
          style={{ color: B.muted, borderTop: `1px solid ${B.border}` }}>
          <Check size={14} style={{ color: TONE.success.fg }} />
          <span>
            آخر إرسال {fmtWhen(lastSend.createdAt)}
            {lastSend.actorName ? ` — ${lastSend.actorName}` : ""}
          </span>
          {lastSend.outcome && (
            <Badge tone={lastSend.outcome === "وصلت" ? "success" : "warn"}>{lastSend.outcome}</Badge>
          )}
        </div>
      )}
    </div>
  );
}
