/* عمليات ملف المستفيد التي تُنفَّذ في القاعدة (ترحيل 20260914).

   ── الاحتياجات الخاصة ──
   جدولٌ منفصل يقرؤه المدير وحده (RLS). الموظف لا يرى الحقل أصلاً، فلا
   يُسأل عن صلاحيةٍ ليست له.

   ── الدمج ──
   قرارٌ صريح للمدير: يُبقي ملفاً وينقل حجوزات الآخر ويؤرشفه بسببٍ يسمّي
   الباقي. لا دمج آلي: تشابه الجوال قد يكون أباً وابنه.

   ── التدهور الرشيق ──
   قاعدةٌ بلا الترحيل تردّ «الدالّة غير موجودة» فتعيد كل دالّةٍ
   unsupported ليسلك المستدعي مساره المحلي أو يقول إن الميزة تنتظر. */
import { supabase, isSupabaseEnabled } from "@/supabase/client";

export interface BenPrivate { mobility: string; health: string; updatedAt?: string }
export interface DupPair { a: string; b: string; reason: "phone" | "doc" }

const isMissingFn = (e: any): boolean =>
  String(e?.code ?? "") === "PGRST202" || /Could not find the function|function .* does not exist|relation .* does not exist|schema cache/i.test(String(e?.message ?? ""));

const arabic = (e: any): string => {
  const m = String(e?.message ?? e ?? "");
  const tail = m.split(/:\s(.+)/)[1];
  if (/forbidden/i.test(m)) return "هذا الإجراء لمدير النظام وحده.";
  if (tail && /not_found|same_record/.test(m)) return tail.trim();
  return m || "خطأ غير معروف.";
};

/** الاحتياجات الخاصة — null إن لم يُشغَّل الترحيل أو لا صلاحية. */
export async function fetchPrivate(id: string): Promise<{ data: BenPrivate | null; unsupported?: boolean; forbidden?: boolean }> {
  if (!isSupabaseEnabled || !supabase) return { data: null, unsupported: true };
  const { data, error } = await supabase.from("beneficiary_private").select("mobility_needs,health_notes,updated_at").eq("beneficiary_id", id).maybeSingle();
  if (error) {
    if (isMissingFn(error)) return { data: null, unsupported: true };
    if (/permission|forbidden|policy/i.test(String(error.message))) return { data: null, forbidden: true };
    return { data: null };
  }
  return { data: data ? { mobility: data.mobility_needs ?? "", health: data.health_notes ?? "", updatedAt: data.updated_at ?? undefined } : { mobility: "", health: "" } };
}

export async function savePrivate(id: string, mobility: string, health: string): Promise<{ error: string | null; unsupported?: boolean }> {
  if (!isSupabaseEnabled || !supabase) return { error: null, unsupported: true };
  const { error } = await supabase.rpc("set_beneficiary_private", { p_id: id, p_mobility: mobility, p_health: health });
  if (!error) return { error: null };
  if (isMissingFn(error)) return { error: null, unsupported: true };
  return { error: arabic(error) };
}

export async function mergeBeneficiaries(keep: string, drop: string): Promise<{ error: string | null; unsupported?: boolean }> {
  if (!isSupabaseEnabled || !supabase) return { error: null, unsupported: true };
  const { error } = await supabase.rpc("merge_beneficiaries", { p_keep: keep, p_drop: drop });
  if (!error) return { error: null };
  if (isMissingFn(error)) return { error: null, unsupported: true };
  return { error: arabic(error) };
}

/** الإنشاء التلقائي لحجزٍ بعينه — لتعبئة حجزٍ أُكِّد قبل الترحيل. */
export async function ensureBookingBeneficiaries(bookingId: string): Promise<{ made: number; error: string | null; unsupported?: boolean }> {
  if (!isSupabaseEnabled || !supabase) return { made: 0, error: null, unsupported: true };
  const { data, error } = await supabase.rpc("ensure_booking_beneficiaries", { p_booking_id: bookingId });
  if (!error) return { made: Number(data ?? 0), error: null };
  if (isMissingFn(error)) return { made: 0, error: null, unsupported: true };
  return { made: 0, error: arabic(error) };
}
