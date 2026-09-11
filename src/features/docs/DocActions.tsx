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
import { Printer, Download, Phone, X, Ban, RotateCcw, Check } from "lucide-react";
import { toast } from "sonner";
import { B } from "@/lib/theme";
import { openWhatsApp } from "@/lib/utils";
import { Spinner } from "@/components/Spinner";
import type { DocEvent } from "@/types";
import {
  fetchDocEvents, logDocEvent, setEventOutcome, SEND_OUTCOMES,
  type DocType,
} from "./docEvents";

/** آخر إرسالٍ خلال هذه المدّة يُعدّ «للتوّ» فيُطلب تأكيدٌ قبل التكرار. */
const RECENT_SEND_MS = 10 * 60_000;

const btn = (bg: string, fg: string, disabled = false): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "8px 16px", borderRadius: 12, fontSize: 13, fontWeight: 700,
  background: bg, color: fg, border: "none",
  cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.55 : 1,
});

const fmtWhen = (iso: string): string => {
  const d = new Date(iso);
  const mins = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `قبل ${mins} د`;
  if (mins < 1440) return `قبل ${Math.floor(mins / 60)} س`;
  return d.toISOString().slice(0, 16).replace("T", " · ");
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
      if (!window.confirm(`أُرسلت هذه الرسالة ${when} بواسطة ${lastSend!.actorName ?? "موظف"}.\nهل تريد إرسالها مرّة أخرى؟`)) return;
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
    <div className="flex flex-col gap-2" data-print-hide>
      <div className="flex gap-2 flex-wrap justify-end">
        <button onClick={print} style={btn(B.gold, B.black)}>
          <Printer size={14} />طباعة
        </button>
        <button onClick={download} style={btn("#fff", B.text2)}
          className="border" >
          <Download size={14} />تنزيل PDF
        </button>
        {p.whatsapp && (
          <button onClick={send} disabled={busy} style={btn("#25D366", "#fff", busy)}>
            {busy ? <Spinner size={13} color="#fff" /> : <Phone size={14} />}
            {lastSend ? "إعادة الإرسال" : "إرسال واتساب"}
          </button>
        )}
        {p.onRefund && (
          <button onClick={p.onRefund} style={btn("#E0F2FB", "#0E7CA8")}>
            <RotateCcw size={14} />استرجاع
          </button>
        )}
        {p.onCancelDoc && (
          <button onClick={p.onCancelDoc} style={btn("#FBE6E6", "#BE2626")}>
            <Ban size={14} />إلغاء
          </button>
        )}
        <button onClick={p.onClose} style={btn(B.fill, B.text2)}>
          <X size={14} />إغلاق
        </button>
      </div>

      {/* ── سؤال النتيجة ──
          يظهر بعد الإرسال مباشرةً ويختفي بالإجابة. لا يُلحّ: تجاهله
          يترك الحدث مسجّلاً بلا نتيجة، وذاك أصدق من نتيجةٍ مفترضة. */}
      {pending !== null && (
        <div className="flex items-center gap-2 flex-wrap justify-end px-3 py-2 rounded-xl"
          style={{ background: "#E3F3E8", border: "1px solid #C4E4CE" }}>
          <span className="text-xs font-bold" style={{ color: "#1E7A44" }}>هل وصلت الرسالة؟</span>
          {SEND_OUTCOMES.map(o => (
            <button key={o} onClick={() => saveOutcome(o)}
              className="px-3 py-1 rounded-lg text-xs font-bold cursor-pointer"
              style={{ background: "#fff", border: "1px solid #C4E4CE", color: "#1E7A44" }}>{o}</button>
          ))}
          <button onClick={() => setPending(null)}
            className="px-2 py-1 rounded-lg text-xs cursor-pointer"
            style={{ background: "none", border: "none", color: "#5C554E" }}>لاحقاً</button>
        </div>
      )}

      {/* ── آخر إرسال ──
          سطرٌ واحد يجيب «هل أُرسلت؟» بلا فتح سجلّ. */}
      {lastSend && pending === null && (
        <div className="flex items-center gap-2 flex-wrap justify-end text-xs" style={{ color: B.muted }}>
          <Check size={12} style={{ color: "#1E7A44" }} />
          <span>
            آخر إرسال {fmtWhen(lastSend.createdAt)}
            {lastSend.actorName ? ` — ${lastSend.actorName}` : ""}
          </span>
          {lastSend.outcome && (
            <span className="px-2 py-0.5 rounded-full font-bold"
              style={{ background: lastSend.outcome === "وصلت" ? "#E3F3E8" : "#FBF3D6",
                       color: lastSend.outcome === "وصلت" ? "#1E7A44" : "#8A6A08" }}>
              {lastSend.outcome}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
