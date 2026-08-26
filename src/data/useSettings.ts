/* قراءة الإعدادات العامة داخل مكوّن.

   تبدأ بالافتراضات ثم تُستبدل بالمقروء: الافتراضات هي القيم العاملة
   اليوم، فالرسم الأول صحيح ولا يلمع فراغ ثم يظهر رقم. */
import { useEffect, useState } from "react";
import { DEFAULT_SETTINGS, publicSettings, type PublicSettings } from "./settings";

export function usePublicSettings(): PublicSettings {
  const [s, setS] = useState<PublicSettings>(DEFAULT_SETTINGS.pub);
  useEffect(() => {
    let alive = true;
    publicSettings().then(v => { if (alive) setS(v); });
    return () => { alive = false; };
  }, []);
  return s;
}
