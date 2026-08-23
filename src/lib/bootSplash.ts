/* التحكّم بشاشة البدء المُدرَجة في index.html.

   الشاشة لا تُزال عند تركيب React بل عند جهوز بيانات الصفحة (الكتالوج
   للمستفيد، الجلسة والبيانات للوحة الإدارة). قبل ذلك كانت تُزال مبكراً
   فتظهر بعدها شاشة تحميل ثانية — شعار ثم «جارٍ التحميل» ثم الموقع.

   بلا حدّ أدنى للعرض: القياس أظهر أن الصفحة تجهز عند ~380 مللي ثانية،
   فحدّ 1.2 ثانية كان يحبس المستخدم 1.4 ثانية على صفحة جاهزة — انتظارٌ
   على حركة لا على عمل. النتيجة أن الشعار قد يخرج وهو نصف مرسوم على
   الأجهزة السريعة، والتلاشي وحده هو ما يليّن الخروج.

   الشاشات التي كانت تعرض شاشة تحميل ثانية تُعيد الآن null. */

/** يطابق transition في #tsh-splash داخل index.html.
    يخدم غرضين: تليين الخروج، وضمان أن الصفحة تحته رُسمت قبل الكشف عنها. */
const FADE_MS = 250;
/** شبكة أمان: طلب معلّق بلا نجاح ولا فشل يجب ألا يحبس المستخدم للأبد. */
const MAX_MS = 15000;

let dismissed = false;

export function hideBootSplash(): void {
  if (dismissed) return;
  dismissed = true;
  const el = document.getElementById("tsh-splash");
  if (!el) return;
  el.classList.add("tsh-out");
  setTimeout(() => el.remove(), FADE_MS);
}

/** يُستدعى مرة من main.tsx. */
export function armBootSplashFallback(): void {
  setTimeout(hideBootSplash, MAX_MS);
}
