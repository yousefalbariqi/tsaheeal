/* عناصر الجدول المشتركة: الحاوية، رأس العمود القابل للفرز، وخطّاف الفرز.

   الجداول الثمانية في اللوحة منسوخةٌ من أصلٍ واحد وانجرفت عنه، ولا واحد
   منها يُفرَز — من يبحث عن أعلى مبلغ أو أقدم طلب يقرأ الصفوف كلّها.
   `useSort` يضيف الفرز لأي قائمة بسطرين، و`SortTh` رأسُه القابل للضغط
   بـaria-sort الصحيح. */
import { useMemo, useState, type ReactNode, type ThHTMLAttributes } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

export function TableWrap({ children, minWidth, className }: { children: ReactNode; minWidth?: number; className?: string }) {
  return (
    <div className={`ui-table-wrap ${className ?? ""}`}>
      <div className="ui-table-scroll">
        <div style={minWidth ? { minWidth } : undefined}>{children}</div>
      </div>
    </div>
  );
}

export type SortDir = "asc" | "desc";
export interface SortState<K extends string> { key: K | null; dir: SortDir }

export interface Sorter<T, K extends string> {
  rows: T[];
  sort: SortState<K>;
  /** يبدّل: غير مفروز ← تصاعدي ← تنازلي ← غير مفروز. */
  toggle: (key: K) => void;
}

/** `get` يعيد قيمة الفرز لكل عمود: رقماً أو نصّاً. النصّ يُقارن بترتيبٍ عربي. */
export function useSort<T, K extends string>(
  all: T[], get: Record<K, (row: T) => string | number | null | undefined>, initial: SortState<K> = { key: null, dir: "asc" },
): Sorter<T, K> {
  const [sort, setSort] = useState<SortState<K>>(initial);
  const rows = useMemo(() => {
    if (!sort.key) return all;
    const pick = get[sort.key];
    const collator = new Intl.Collator("ar", { numeric: true, sensitivity: "base" });
    const sign = sort.dir === "asc" ? 1 : -1;
    return [...all].sort((a, b) => {
      const x = pick(a), y = pick(b);
      /* الفارغ في الآخر في الاتجاهين — «بلا موظف» لا يتصدّر القائمة. */
      if (x == null || x === "") return y == null || y === "" ? 0 : 1;
      if (y == null || y === "") return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * sign;
      return collator.compare(String(x), String(y)) * sign;
    });
    // get كائنٌ ثابت يُعرَّف خارج المكوّن — لا يدخل التبعيات.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, sort]);
  const toggle = (key: K) => setSort(s =>
    s.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : { key: null, dir: "asc" });
  return { rows, sort, toggle };
}

export function SortTh<K extends string>({ k, sorter, children, ...rest }: {
  k: K;
  sorter: Pick<Sorter<unknown, K>, "sort" | "toggle">;
  children: ReactNode;
} & ThHTMLAttributes<HTMLTableCellElement>) {
  const on = sorter.sort.key === k;
  const Icon = !on ? ChevronsUpDown : sorter.sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th aria-sort={on ? (sorter.sort.dir === "asc" ? "ascending" : "descending") : "none"} {...rest}>
      <button type="button" className="ui-th-sort" data-active={on} onClick={() => sorter.toggle(k)}>
        {children}<Icon size={12} />
      </button>
    </th>
  );
}
