/* محرّر نموذج بحالة حفظ صريحة — «هل تغيّر شيء؟» و«هل وصل الحفظ؟».

   قبله: زرّ «حفظ» في صفحة الباقة يُنادى فيغلق الصفحة فوراً، والكتابة
   تفاؤلية في الخلفية. الموظف لا يعرف هل وصلت، ولو فشلت جاءه التوست
   الأحمر على شاشةٍ أخرى. وزرّ الرجوع كان يبتلع تعديلاً لم يُحفظ بلا
   سؤال — أخطر ما في الصفحة، لأن الخسارة صامتة.

   الحلّ يستعمل ما في المخزن أصلاً: clearSyncError قبل الكتابة ثم
   flushSync ينتظر الكتابات الجارية ويعيد رسالة الفشل أو null. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clearSyncError, flushSync } from "@/store/useStore";

export type SaveState = "idle" | "saving" | "saved" | "error";

/** مدّة بقاء «تم الحفظ» قبل عودة الزرّ إلى «حفظ». */
const SAVED_MS = 2600;

export interface Editor<T> {
  form: T;
  setForm: React.Dispatch<React.SetStateAction<T>>;
  /** تعديل حقل واحد — نفس توقيع `set` المستعمل في صفحات اللوحة. */
  set: <K extends keyof T>(k: K, v: T[K]) => void;
  /** هل يختلف النموذج عن آخر نسخة محفوظة؟ */
  dirty: boolean;
  state: SaveState;
  /** رسالة الفشل العربية من طبقة المزامنة، أو null. */
  error: string | null;
  /** يكتب ثم ينتظر القاعدة. يعيد true عند النجاح.

      `commit` قد يُعيد القيمة التي كُتبت فعلاً — تصير هي خطّ الأساس
      الجديد. تحتاجه الحقول المشتقّة: صفحة الباقة تُثبّت السعر المحسوب
      في marketPrice عند الحفظ، ولو بقي الأساس على القيمة قبل الاشتقاق
      لظلّ الزرّ يقول «هناك تغيير» على فرقٍ صنعه الحفظ نفسه. */
  save: (commit: (value: T) => T | void) => Promise<boolean>;
  /** يرجع النموذج إلى آخر نسخة محفوظة. */
  reset: () => void;
  /** يعتمد قيمةً خارجية كخطّ أساس جديد (بعد حفظ تمّ في مكان آخر). */
  rebase: (value: T) => void;
}

/* المقارنة بـJSON.stringify لا بمقارنة عميقة مكتوبة يدوياً: هي نفسها
   التي يقرّر بها syncDiff في المخزن أن الصفّ تغيّر. لو اختلفت المقارنتان
   لظهر زرّ «حفظ» مفعّلاً على تغييرٍ لن تُرسله المزامنة أصلاً. */
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function useEditor<T>(initial: T): Editor<T> {
  const [baseline, setBaseline] = useState<T>(initial);
  const [form, setForm] = useState<T>(initial);
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);

  const dirty = useMemo(() => !same(form, baseline), [form, baseline]);

  const set = useCallback(<K extends keyof T>(k: K, v: T[K]) => {
    setForm(f => ({ ...f, [k]: v }));
  }, []);

  /* تحذير مغادرة الصفحة — تبويب يُغلق أو تحديث أو رابط خارجي.
     المتصفّح يعرض نصّه هو لا نصّنا؛ الشرط الوحيد لظهوره preventDefault. */
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const save = useCallback(async (commit: (value: T) => T | void): Promise<boolean> => {
    /* لا تغييرَ ⇒ نجاح صامت: الزرّ معطّل أصلاً، وهذا يغطّي النداء
       البرمجي (حفظ ثم رجوع) فلا يُظهر «جارٍ الحفظ» على لا شيء. */
    if (!dirty) return true;
    /* حرسٌ بمرجع لا بالحالة: ضغطتان متلاحقتان تقرآن نفس لقطة state
       فتمرّان معاً، والمرجع يتغيّر في نفس اللحظة. */
    if (busy.current) return false;
    busy.current = true;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    setState("saving"); setError(null);
    clearSyncError();
    const snapshot = form;
    try {
      const written = commit(snapshot);
      const err = await flushSync();
      if (err) { setState("error"); setError(err); return false; }
      setBaseline((written ?? snapshot) as T);
      setState("saved");
      timer.current = setTimeout(() => setState("idle"), SAVED_MS);
      return true;
    } finally { busy.current = false; }
  }, [dirty, form]);

  const reset = useCallback(() => { setForm(baseline); setState("idle"); setError(null); }, [baseline]);
  const rebase = useCallback((v: T) => { setBaseline(v); setForm(v); }, []);

  return { form, setForm, set, dirty, state, error, save, reset, rebase };
}
