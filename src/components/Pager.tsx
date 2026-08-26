/* ترقيم الصفحات لجداول اللوحة.

   قبله: كل شاشة ترسم كل صفوفها. مع ٤٠٠ حجز يعني ٤٠٠ صفّاً في DOM
   وأربع بطاقات مستندات لكلٍّ — الشاشة تتجمّد عند كل حرف يُكتب في البحث
   لأن كل ضغطة تعيد رسم القائمة كاملة. والموظف لا يقرأ الصفّ الثلاثمئة
   أبداً؛ يبحث.

   ملاحظة: هذا ترقيم في الواجهة — الصفوف كلّها تُجلب ثم تُقصّ. يحلّ
   كلفة الرسم لا كلفة الجلب. الترقيم في القاعدة (range) هو الخطوة
   التالية حين تكبر الجداول فوق آلاف الصفوف، ويستلزم تغيير طبقة
   البيانات وحقول الفرز معها.

   ولا يُستعمل app/components/ui/pagination.tsx: مُولَّد بروابط <a>
   وتسميات إنجليزية وأسهم LTR — لوحةٌ عربية بأزرار حالة لا تتفق معه. */
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { B } from "@/lib/theme";

/** عدد الصفوف في الصفحة — يكفي شاشة مكتب بلا تمرير طويل. */
export const PER_PAGE = 25;

export interface Paged<T> {
  page: number;
  setPage: (p: number) => void;
  pages: number;
  total: number;
  /** صفوف الصفحة الحالية. */
  rows: T[];
  /** رقم أول صفّ معروض (١-مبنيّ) — للعدّاد. */
  from: number;
  to: number;
}

/** يقصّ الصفوف على صفحات. `resetKey` يُعيد للصفحة الأولى عند تغيّره —
    مرّره نصّ البحث والمرشّحات: من كان في الصفحة الخامسة ثم بحث عن اسم
    يجب أن يرى أول النتائج لا صفحتها الخامسة. */
export function usePaged<T>(all: T[], resetKey: unknown = "", perPage = PER_PAGE): Paged<T> {
  const [page, setPage] = useState(1);
  const total = all.length;
  const pages = Math.max(1, Math.ceil(total / perPage));

  useEffect(() => { setPage(1); }, [resetKey]);
  /* الحصر داخل المدى: حذف صفوف قد يجعل الصفحة الحالية خارجه، وصفحةٌ
     فارغة تُقرأ «لا نتائج» وهي في الحقيقة صفحةٌ زائدة. */
  useEffect(() => { setPage(p => (p > pages ? pages : p)); }, [pages]);

  const safe = Math.min(page, pages);
  const rows = useMemo(() => all.slice((safe - 1) * perPage, safe * perPage), [all, safe, perPage]);

  return {
    page: safe, setPage, pages, total, rows,
    from: total === 0 ? 0 : (safe - 1) * perPage + 1,
    to: Math.min(safe * perPage, total),
  };
}

/** أرقام الصفحات المعروضة مع «…» — الأولى والأخيرة والحالية وجارتاها.
    القائمة الكاملة مع ٥٠ صفحة تصير شريطاً لا يُقرأ. */
function windowOf(page: number, pages: number): (number | "gap")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: (number | "gap")[] = [1];
  const lo = Math.max(2, page - 1), hi = Math.min(pages - 1, page + 1);
  if (lo > 2) out.push("gap");
  for (let i = lo; i <= hi; i++) out.push(i);
  if (hi < pages - 1) out.push("gap");
  out.push(pages);
  return out;
}

/** شريط الترقيم. يُخفى نفسه إذا كانت صفحة واحدة — شريطٌ بزرّ واحد
    معطَّل ضجيجٌ لا معلومة. */
export function Pager({ p, unit = "صف" }: { p: Paged<unknown>; unit?: string }) {
  if (p.pages <= 1) return null;
  const num = (n: number) => n.toLocaleString("en-US");

  const btn = (on: boolean, active = false) => ({
    minWidth: 34, height: 34, padding: "0 9px", borderRadius: 10,
    fontSize: 13, fontWeight: 700, fontFamily: "var(--font-app)",
    cursor: on ? ("pointer" as const) : ("not-allowed" as const),
    background: active ? B.primary : "#fff",
    border: `1px solid ${active ? B.primary : B.border}`,
    color: active ? B.gold : on ? B.text2 : B.muted,
    display: "flex", alignItems: "center", justifyContent: "center",
    opacity: on ? 1 : 0.55,
  });

  return (
    /* شريط قائم بنفسه لا ذيلٌ للجدول: الجدول يظهر على المكتب والبطاقات
       على الجوال، وشريطٌ واحد بعدهما يخدم الاثنين بلا تكرار. */
    <nav aria-label="ترقيم الصفحات"
      className="flex flex-wrap items-center justify-between gap-3 px-4 md:px-5 py-3 mt-3"
      style={{ background: "#fff", border: `1px solid ${B.border}`, borderRadius: 16 }}>
      <div className="text-xs" style={{ color: B.muted }}>
        <span style={{ fontFamily: "var(--font-app)", color: B.text2, fontWeight: 700 }}>
          {num(p.from)}–{num(p.to)}
        </span>
        {" من "}
        <span style={{ fontFamily: "var(--font-app)", color: B.text2, fontWeight: 700 }}>{num(p.total)}</span>
        {` ${unit}`}
      </div>
      <div className="flex items-center gap-1.5">
        {/* في RTL «السابق» يشير يميناً — السهم يتبع اتجاه القراءة. */}
        <button onClick={() => p.setPage(p.page - 1)} disabled={p.page <= 1}
          aria-label="الصفحة السابقة" style={btn(p.page > 1)}>
          <ChevronRight size={15} />
        </button>
        {windowOf(p.page, p.pages).map((x, i) =>
          x === "gap"
            ? <span key={`g${i}`} aria-hidden style={{ color: B.muted, padding: "0 2px" }}>…</span>
            : <button key={x} onClick={() => p.setPage(x)}
                aria-label={`الصفحة ${num(x)}`} aria-current={x === p.page ? "page" : undefined}
                style={btn(true, x === p.page)}>{num(x)}</button>,
        )}
        <button onClick={() => p.setPage(p.page + 1)} disabled={p.page >= p.pages}
          aria-label="الصفحة التالية" style={btn(p.page < p.pages)}>
          <ChevronLeft size={15} />
        </button>
      </div>
    </nav>
  );
}
