/* قراءة الإعدادات العامة داخل مكوّن.

   تبدأ بالافتراضات ثم تُستبدل بالمقروء: الافتراضات هي القيم العاملة
   اليوم، فالرسم الأول صحيح ولا يلمع فراغ ثم يظهر رقم. */
import { useEffect, useState } from "react";
import { DEFAULT_SETTINGS, publicSettings, fetchSettings, type AppSettings, type PublicSettings } from "./settings";

export function usePublicSettings(): PublicSettings {
  const [s, setS] = useState<PublicSettings>(DEFAULT_SETTINGS.pub);
  useEffect(() => {
    let alive = true;
    publicSettings().then(v => { if (alive) setS(v); });
    return () => { alive = false; };
  }, []);
  return s;
}

/* الإعدادات الداخلية داخل مكوّن — للوحة الموظف وحدها.

   سببها: باقة جديدة كانت تولد بمهلة دفع ٢٤ ساعة مكتوبة في شفرة صفحة
   الباقات، لا بالقيمة التي ضبطها المدير في الإعدادات. فتغيير الإعداد
   لا يظهر أثره في أي باقة تُنشأ بعده، والمدير يظنّه سرى.

   لا تُخزَّن في ذاكرة وسيطة كـpublicSettings: تُقرأ مرّة عند فتح نموذج
   الإضافة، وقيمتها لحظة الإنشاء هي ما يُنسخ في الباقة. */
export function useInternalSettings(): AppSettings["internal"] {
  const [s, setS] = useState<AppSettings["internal"]>(DEFAULT_SETTINGS.internal);
  useEffect(() => {
    let alive = true;
    fetchSettings()
      .then(v => { if (alive) setS(v.internal); })
      /* الافتراضات هي السلوك القائم — الفشل يبقي النموذج عاملاً. */
      .catch(e => console.error("[settings] تعذّر جلب الإعدادات الداخلية:", e));
    return () => { alive = false; };
  }, []);
  return s;
}
