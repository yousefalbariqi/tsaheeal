/* عمليات الطلب التي تُنفَّذ في القاعدة — لا في المتصفّح.

   قبل ترحيل 20260910 كانت الواجهة تكتب الحالة مباشرةً عبر upsert_booking:
   القبول نداءان (المقاعد ثم الحالة) قد ينجح أوّلهما ويفشل ثانيهما،
   والرفض بلا سبب، والإلغاء بلا أثرٍ مكتوب. الدوالّ هنا تنادي دوالّ
   القاعدة الذرّية وتترجم أخطاءها إلى عربيةٍ مفهومة.

   ── التدهور الرشيق ──
   قاعدةٌ لم يُشغَّل عليها الترحيل تردّ «الدالّة غير موجودة» (PGRST202).
   عندها تعيد كل دالّةٍ `unsupported: true` فتسلك الشاشة مسارها القديم
   (الكتابة المباشرة) — تعمل قبل الترحيل وتزداد بعده. */
import { supabase, isSupabaseEnabled } from "@/supabase/client";

export interface OpResult {
  /** رسالة خطأ عربية، أو null عند النجاح. */
  error: string | null;
  /** القاعدة لا تعرف الدالّة بعد — اسلك المسار القديم. */
  unsupported?: boolean;
}

const OK: OpResult = { error: null };

const isMissingFn = (e: any): boolean =>
  String(e?.code ?? "") === "PGRST202" || /Could not find the function|function .* does not exist/i.test(String(e?.message ?? ""));

/** ترجمة أخطاء القاعدة — كل دالّةٍ تكتب رمزاً ثم نقطتين ثم شرحاً عربياً. */
function arabic(e: any): string {
  const m = String(e?.message ?? e ?? "");
  const tail = m.split(/:\s(.+)/)[1];
  if (/forbidden/i.test(m)) return "لا تملك صلاحية هذا الإجراء.";
  if (/seats_unavailable/.test(m)) return m.replace(/^.*seats_unavailable:/, "");
  if (/seat_taken|seats_count|seats_dup|seat_range|bad_state|reason_required|message_required|not_found|trip_required|bad_user|bad_percent|already_paid|close_reason_required|bad_close_reason/.test(m) && tail) return tail.trim();
  if (/JWT|not authenticated/i.test(m)) return "انتهت جلستك — سجّل الدخول من جديد.";
  if (/Failed to fetch|NetworkError/i.test(m)) return "تعذّر الوصول للخادم — تحقّق من الاتصال.";
  return m || "خطأ غير معروف.";
}

async function call(fn: string, args: Record<string, unknown>): Promise<OpResult & { data?: unknown }> {
  if (!isSupabaseEnabled || !supabase) return { error: null, unsupported: true };
  const { data, error } = await supabase.rpc(fn, args);
  if (!error) return { error: null, data };
  if (isMissingFn(error)) return { error: null, unsupported: true };
  return { error: arabic(error) };
}

/** قبول الطلب وقفل المقاعد في معاملة واحدة. */
export const acceptBooking = (id: string, seats: number[]) =>
  call("accept_booking", { p_id: id, p_seats: seats });

/** رفض بسببٍ داخلي ورسالةٍ للعميل — إلزاميان. */
export const rejectBooking = (id: string, reason: string, message: string) =>
  call("reject_booking", { p_id: id, p_reason: reason, p_message: message });

/** إلغاء بسبب. المستندات والمقاعد تتبعه بحرّاس القاعدة. */
export const cancelBooking = (id: string, reason: string) =>
  call("cancel_booking", { p_id: id, p_reason: reason });

/** تعيين الطلب لموظف (null يلغي التعيين). */
export const assignBooking = (id: string, userId: string | null) =>
  call("assign_booking", { p_id: id, p_user: userId });

/** تعيين الطلب المخصّص وموعد الردّ الأقصى. */
export const assignCustomRequest = (id: string, userId: string | null, dueAt: string | null) =>
  call("assign_custom_request", { p_id: id, p_user: userId, p_due_at: dueAt });

/** إغلاق جماعي للطلبات التي انتهت رحلتها. يعيد العدد المُغلق. */
export async function closeStaleBookings(ids: string[], reason: string): Promise<OpResult & { closed?: number }> {
  const r = await call("close_stale_bookings", { p_ids: ids, p_reason: reason });
  return { ...r, closed: typeof r.data === "number" ? r.data : undefined };
}

/** خصمٌ موثَّق — للمدير. يعيد الإجمالي الجديد. */
export async function applyDiscount(id: string, percent: number, reason: string): Promise<OpResult & { total?: number }> {
  const r = await call("apply_booking_discount", { p_id: id, p_percent: percent, p_reason: reason });
  return { ...r, total: typeof r.data === "number" ? r.data : r.data != null ? Number(r.data) : undefined };
}

export interface CustomerHit {
  source: "beneficiary" | "booking";
  refId: string;
  name: string;
  phone: string;
  idNumber?: string;
  bookingsCount: number;
  lastBooking?: string;
}

/** البحث عن عميلٍ قائم بالاسم أو الجوال أو الهوية. */
export async function searchCustomers(q: string): Promise<{ hits: CustomerHit[]; unsupported?: boolean }> {
  if (q.trim().length < 2) return { hits: [] };
  const r = await call("search_customers", { q });
  if (r.unsupported) return { hits: [], unsupported: true };
  if (r.error || !Array.isArray(r.data)) return { hits: [] };
  return {
    hits: (r.data as any[]).map(x => ({
      source: x.source, refId: x.ref_id, name: x.name ?? "", phone: x.phone ?? "",
      idNumber: x.id_number ?? undefined, bookingsCount: Number(x.bookings_count ?? 0),
      lastBooking: x.last_booking ?? undefined,
    })),
  };
}
