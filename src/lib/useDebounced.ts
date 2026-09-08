/* تأخير القيمة — خانة البحث تكتب حرفاً فيُعاد الرسم أو يُطلق طلبٌ لكل
   حرف. «محمد» وحدها خمسة استعلامات، أربعة منها لا أحد ينتظر نتيجتها.

   القيمة المؤخّرة تُقرأ بعد سكون الكتابة، والقيمة الفورية تبقى في الحقل
   كما هي — لا يُحبس الحرف عن الشاشة انتظاراً للشبكة. */
import { useEffect, useRef, useState } from "react";

export function useDebounced<T>(value: T, delay = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return settled;
}

/** هل ما زال المكتوب ينتظر سكونه؟ — لإظهار «جارِ البحث…» بصدق. */
export function useSearchState(raw: string, delay = 300): { query: string; settling: boolean } {
  const query = useDebounced(raw, delay);
  const first = useRef(true);
  useEffect(() => { first.current = false; }, []);
  return { query, settling: !first.current && query !== raw };
}
