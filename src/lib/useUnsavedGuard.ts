/* حارس التغييرات غير المحفوظة.

   العلّة: شاشة الإعدادات تحمل مسوّدةً في الذاكرة لا تُكتب إلا بالضغط على
   «حفظ» — وهو قرارٌ صحيح (رقم سجلٍّ تجاريّ نصفَ مكتوب لا يُحفظ). لكن
   ثمنه أن مغادرة الصفحة تمحو العمل بصمت: تحديثٌ بالغلط، أو ضغطة على
   بند آخر في القائمة الجانبية، فيذهب كل ما كُتب بلا سؤال.

   المتصفّح يملك طرفاً واحداً من الحلّ: `beforeunload` يعترض التحديث
   والإغلاق والخروج إلى موقع آخر. ولا يعترض تنقّل React Router — فهو لا
   يغادر الصفحة أصلاً، إنما يستبدل ما فيها. لذلك حارسان لا واحد.

   ورسالة `beforeunload` لا تُخصَّص: المتصفّحات الحديثة تعرض نصّها
   الموحَّد وتتجاهل ما يُعاد. المطلوب منها استدعاء `preventDefault` فقط —
   ووجود `returnValue` لأجل متصفّحات أقدم. */
import { useEffect } from "react";

/* راية على مستوى الوحدة لا في سياق React: من يسأل عنها هو `nav()` في
   AdminApp — وهو خارج شجرة الشاشة التي تحمل المسوّدة، فلا يصله سياقها.
   وهي راية واحدة لأن شاشةً واحدة تُعرض في كل لحظة. */
let dirtyFlag = false;

/** هل في الشاشة المعروضة تغييرات لم تُحفظ؟ */
export const hasUnsaved = (): boolean => dirtyFlag;

/** يمنع مغادرة الصفحة (تحديث/إغلاق/رابط خارجي) ما دام `dirty`،
    ويرفع الراية ليعترض عليها تنقّل التطبيق الداخلي. */
export function useUnsavedGuard(dirty: boolean): void {
  useEffect(() => {
    dirtyFlag = dirty;
    /* الإنزال عند التفكيك شرط: شاشةٌ غادرت ورايتها مرفوعة تجعل كل تنقّل
       لاحق يسأل عن مسوّدة لم تعد موجودة. */
    return () => { dirtyFlag = false; };
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      /* مهجورة في المعيار وما زالت لازمةً لبعض المتصفّحات — والقيمة
         نفسها لا تظهر لأحد. */
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
}

/** نصّ التأكيد عند التنقّل داخل التطبيق. موحَّد كي لا تتفرّق الصياغة. */
export const LEAVE_PROMPT = "لديك تغييرات لم تُحفظ. المغادرة الآن تفقدها — هل تريد المتابعة؟";

/** يسأل قبل إجراءٍ يُغادر الشاشة. يعيد true إن جاز المضيّ.
    دالّة لا خطّاف: تُنادى داخل معالج الضغط لا أثناء الرسم. */
export function confirmLeave(dirty: boolean): boolean {
  return !dirty || window.confirm(LEAVE_PROMPT);
}
