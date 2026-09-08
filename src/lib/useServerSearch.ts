/* بحثٌ وترقيمٌ في القاعدة لا في المتصفّح.

   التصفية في الواجهة تعمل على ما وُصِّل فقط: الشاشة تجلب الصفوف كلها ثم
   تقصّ منها ما يطابق. فما لم يصل لا يُبحث فيه، وما وصل جُلب كاملاً في
   كل فتحة شاشة. مع نموّ الجدول تصير خانة البحث كاذبة وبطيئة معاً.

   الدالة هنا تنادي إجراءً في القاعدة يُعيد معرّفات صفحةٍ واحدة وعددها
   الكلي، وتردّها في شكل Paged نفسه الذي يفهمه <Pager> — فتتبادل الشاشة
   بين المصدرين بلا فرقٍ في الرسم.

   وإن كان الإجراء غير موجود بعد (ترحيلٌ لم يُشغَّل) تُطفئ نفسها وتترك
   الشاشة على تصفيتها المحلية: نشرٌ سابقٌ للترحيل لا يجب أن يكسر الشاشة. */
import { useEffect, useState } from "react";
import { PER_PAGE, type Paged } from "@/components/Pager";
import { isSupabaseEnabled, supabase } from "@/supabase/client";

const DEBOUNCE_MS = 350;

export function useServerPagedSearch<T>({
  fn, args, resetKey, all, idOf, idField,
}: {
  /** اسم الإجراء في القاعدة. */
  fn: string;
  /** وسائط الإجراء عدا page_no/page_size. */
  args: Record<string, unknown>;
  /** يُعيد الترقيم إلى الصفحة الأولى عند تغيّره — البحث والمرشّحات. */
  resetKey: string;
  /** الصفوف المحمّلة، لمطابقة المعرّفات العائدة بكائناتها. */
  all: T[];
  idOf: (row: T) => string;
  /** اسم عمود المعرّف في ما يُعيده الإجراء. */
  idField: string;
}): { supported: boolean; searching: boolean; paged: Paged<T> } {
  const [page, setPage] = useState(1);
  const [ids, setIds] = useState<string[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const [supported, setSupported] = useState(isSupabaseEnabled);

  useEffect(() => { setPage(1); }, [resetKey]);

  useEffect(() => {
    if (!isSupabaseEnabled || !supabase || !supported) return;
    let alive = true;
    setIds(null); setTotal(null); setSearching(true);
    const timer = setTimeout(() => {
      void supabase!.rpc(fn, { ...args, page_no: page, page_size: PER_PAGE })
        .then(({ data, error }) => {
          if (!alive) return;
          /* الإجراء غير موجود أو ممنوع: تُطفأ مرّةً ولا تُعاد المحاولة
             كل ضغطة مفتاح، والشاشة تكمل على تصفيتها المحلية. */
          if (error) { setSupported(false); setSearching(false); return; }
          const out = (data ?? []) as Array<Record<string, unknown>>;
          setIds(out.map(r => String(r[idField])));
          setTotal(out.length ? Number(out[0].total_count) : 0);
          setSearching(false);
        });
    }, DEBOUNCE_MS);
    return () => { alive = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fn, idField, resetKey, page, supported]);

  const pages = Math.max(1, Math.ceil((total ?? 0) / PER_PAGE));
  useEffect(() => { setPage(p => Math.min(p, pages)); }, [pages]);

  const byId = new Map(all.map(r => [idOf(r), r]));
  const rows = ids?.map(id => byId.get(id)).filter((r): r is T => !!r) ?? [];

  return {
    supported, searching,
    paged: {
      page, setPage, pages, total: total ?? 0, rows,
      from: total ? (page - 1) * PER_PAGE + 1 : 0,
      to: total ? Math.min(page * PER_PAGE, total) : 0,
    },
  };
}
