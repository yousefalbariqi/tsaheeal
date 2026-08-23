/* صلاحيات الأدوار في الواجهة — مرآةٌ لحرس قاعدة البيانات لا بديل عنه.

   الحماية الحقيقية في القاعدة: كل دالة upsert_* تبدأ بـcan_write_staff()
   أو can_write_admin()، وترحيل 20260812 يفصل الكتابة على مستوى الجداول.
   ما ينقص هو الواجهة: اليوم يرى الموظف زرّ «إضافة فندق» كاملاً، يملأ
   النموذج، يضغط حفظ — فترفضه القاعدة. جهدٌ ضائع ورسالة خطأ بدل زرٍّ
   لم يكن ينبغي أن يظهر.

   القوائم أدناه منسوخة من الحرس نفسه (schema.sql) حرفياً. أي تغيير هناك
   يلزمه تغيير هنا، وإلا عاد الزرّ الكاذب. */
import { useStore } from "@/store/useStore";

/** الأدوار التي تجتاز is_admin() في القاعدة. */
export const ADMIN_ROLES = ["مدير عام", "مدير النظام"] as const;

/** كياناتٌ كتابتها محروسة بـcan_write_admin() — المدير وحده. */
export const ADMIN_WRITE_VIEWS = [
  "hotels", "transport", "packages", "branches",
  "beneficiaries", "payments", "tickets", "users",
] as const;

/** كياناتٌ كتابتها محروسة بـcan_write_staff() — أي موظف. */
export const STAFF_WRITE_VIEWS = ["trips", "bookings", "support", "customRequests"] as const;

/* الإخفاء من القائمة يقتصر على شاشتَي الإدارة البحتة. الفنادق والباقات
   تبقى مرئيةً للموظف لأنه يحتاج قراءتها ليحجز — يُخفى زرّ الكتابة لا
   الشاشة. إخفاء الشاشة كان سيقطع عمله اليومي بحجّة الصلاحيات. */
export const ADMIN_ONLY_VIEWS = ["users", "settings"] as const;

export interface Role {
  /** الدور كما هو في profiles، أو null قبل وصوله. */
  role: string | null;
  isAdmin: boolean;
  /** هل تظهر هذه الشاشة في القائمة الجانبية؟ */
  canView: (view: string) => boolean;
  /** هل تظهر أزرار الإضافة والتعديل والحذف في هذه الشاشة؟ */
  canWrite: (view: string) => boolean;
}

export function useRole(): Role {
  const role = useStore(s => s.currentUser?.role ?? null);
  /* الافتراضي أدنى صلاحية: role فارغ يعني «لم يصل بعد»، وترجمته إلى
     مدير تجعل الواجهة تفشل مفتوحةً في اللحظة التي تسبق وصول الملف. */
  const isAdmin = !!role && (ADMIN_ROLES as readonly string[]).includes(role);
  return {
    role,
    isAdmin,
    canView: (view) => isAdmin || !(ADMIN_ONLY_VIEWS as readonly string[]).includes(view),
    canWrite: (view) => isAdmin || !(ADMIN_WRITE_VIEWS as readonly string[]).includes(view),
  };
}
