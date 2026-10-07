/* حالات الشاشة الثلاث: تحميل، خطأ، فراغ.

   كانت الشاشة تعرف حالتين فقط — فيها بيانات، أو لا شيء. فإذا تعذّر
   الجلب ظهر الفراغ نفسه الذي يظهر حين لا توجد سجلات: الموظف يقرأ «لا
   طلبات» وفي القاعدة أربعمئة طلب لم تصل. وإذا كان الجلب جارياً ظهر
   الفراغ كذلك، أو دوّارةٌ لا تنتهي بلا مخرج منها.

   الثلاثة تُبنى هنا مرّة: الهيكل يحاكي شكل الجدول القادم فلا تقفز
   الصفحة عند وصوله، والخطأ يحمل زرّ إعادة المحاولة دائماً — رسالة خطأ
   بلا مخرجٍ منها تُغلق الشاشة على الموظف. */
import { useState } from "react";
import { AlertTriangle, Inbox, RotateCw } from "lucide-react";
import { B } from "@/lib/theme";
import { Button } from "@/components/ui/Button";
import { useStore } from "@/store/useStore";
import { isSupabaseEnabled } from "@/supabase/client";

/** هيكل صفوف بوزن الجدول الحقيقي — لا وميض مكان المحتوى. */
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div role="status" aria-label="جارٍ تحميل البيانات"
      className="ui-table-wrap">
      <div className="flex items-center gap-4 px-4 md:px-5 py-3.5" style={{ background: "#FAF8F3", borderBottom: `1px solid ${B.border}` }}>
        {Array.from({ length: cols }, (_, i) => (
          <span key={i} className="sk-bar" style={{ height: 10, flex: i === 1 ? 2 : 1, opacity: 0.5 }} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 md:px-5 py-4"
          style={{ borderTop: r ? "1px solid #F1ECE2" : undefined }}>
          {Array.from({ length: cols }, (_, i) => (
            <span key={i} className="sk-bar" style={{ height: 12, flex: i === 1 ? 2 : 1 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** هيكل بطاقات — لشبكات الباقات والفنادق والرحلات. */
export function CardsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div role="status" aria-label="جارٍ تحميل البيانات"
      className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: `1px solid ${B.border}` }}>
          <span className="sk-bar block" style={{ height: 132, borderRadius: 0 }} />
          <div className="p-4 flex flex-col gap-2.5">
            <span className="sk-bar" style={{ height: 13, width: "62%" }} />
            <span className="sk-bar" style={{ height: 11, width: "40%" }} />
            <span className="sk-bar" style={{ height: 11, width: "78%" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** تعذّر الجلب — الرسالة وزر الإعادة معاً، لا أحدهما. */
export function ErrorState({ title = "تعذّر جلب البيانات", message, onRetry }: {
  title?: string; message?: string; onRetry: () => void | Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const retry = async () => { setBusy(true); try { await onRetry(); } finally { setBusy(false); } };
  return (
    <div role="alert" className="rounded-2xl px-6 py-10 flex flex-col items-center text-center gap-4"
      style={{ background: "#fff", border: `1px solid ${B.border}` }}>
      <span className="w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{ background: "#FBE6E6", border: "1px solid #F3C9C9" }}>
        <AlertTriangle size={24} style={{ color: "#BE2626" }} />
      </span>
      <span style={{ maxWidth: 420 }}>
        <strong className="block text-sm font-bold mb-1" style={{ color: B.text3 }}>{title}</strong>
        <span className="block text-xs leading-relaxed" style={{ color: B.muted }}>
          {message || "تحقّق من الاتصال ثم أعد المحاولة. لم يُفقد شيء من البيانات."}
        </span>
      </span>
      <Button variant="primary" loading={busy} icon={<RotateCw size={15} />} onClick={retry}>
        {busy ? "جارٍ إعادة المحاولة…" : "إعادة المحاولة"}
      </Button>
    </div>
  );
}

/** لا سجلات — ويُفرَّق بين «لا شيء بعد» و«لا شيء يطابق البحث».
    `icon` أيقونة الكيان (حقيبة للطلبات، طائرة للرحلات)؛ و`action` الزرّ
    الذي يُخرج من الفراغ: «إضافة» للأول و«إزالة المرشّحات» للثاني. */
export function EmptyState({ title, note, action, icon, compact = false }: {
  title: string; note?: string; action?: React.ReactNode; icon?: React.ReactNode;
  /** داخل بطاقةٍ قائمة — بلا إطارٍ ثانٍ وبحشوةٍ أقلّ. */
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? "px-4 py-8" : "ui-card ui-card--flat px-6 py-14"}`}>
      <span aria-hidden className="flex items-center justify-center"
        style={{ width: 48, height: 48, borderRadius: 14, background: B.fill, color: B.muted, marginBottom: 14 }}>
        {icon ?? <Inbox size={22} />}
      </span>
      <strong style={{ fontSize: 15, fontWeight: 600, color: B.black, lineHeight: 1.5 }}>{title}</strong>
      {note && <span style={{ fontSize: 13, color: B.muted, lineHeight: 1.7, maxWidth: 380, marginTop: 4 }}>{note}</span>}
      {action && <div className="flex items-center gap-2 flex-wrap justify-center" style={{ marginTop: 18 }}>{action}</div>}
    </div>
  );
}

/* ── بوّابة الكيان ──
   الشاشة تسأل عن كيانها الواحد بدل أن تتفحّص حالة اللوحة كلها: تعذّر
   جلب «الفواتير» يُعرض في شاشة الفواتير خطأً وزرّ إعادة، ولا يُسكِت
   بقية الشاشات ولا يُقرأ فيها فراغاً. سطرٌ واحد يلفّ الجدول. */
export function EntityGate({ entity, children, skeleton = "table", cols = 6, rows = 6, label }: {
  entity: string;
  children: React.ReactNode;
  skeleton?: "table" | "cards" | "none";
  cols?: number;
  rows?: number;
  /** اسم الكيان في رسالة الخطأ — «تعذّر جلب الفواتير». */
  label?: string;
}) {
  const failed = useStore(s => s.failedEntities.includes(entity));
  const loading = useStore(s => s.loadingEntities.includes(entity));
  const loaded = useStore(s => s.loaded);
  const retry = useStore(s => s.retryEntity);

  if (failed) return <ErrorState title={label ? `تعذّر جلب ${label}` : "تعذّر جلب البيانات"} onRetry={() => retry(entity)} />;
  if (loading || (!loaded && isSupabaseEnabled)) {
    if (skeleton === "none") return null;
    return skeleton === "cards" ? <CardsSkeleton /> : <TableSkeleton cols={cols} rows={rows} />;
  }
  return <>{children}</>;
}
