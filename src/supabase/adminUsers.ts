/* إنشاء حساب مصادقة جديد دون التأثير على جلسة المدير الحالي —
   عبر عميل ثانوي لا يحفظ الجلسة. لا يتطلب مفتاح service_role. */
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/supabase/client";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** ينشئ حساب Auth + صف profiles بالدور. يُرجع { id } أو { error }. */
export async function createAuthUser(
  email: string, password: string, name: string, role: string
): Promise<{ id?: string; error?: string }> {
  if (!url || !anonKey || !supabase) return { error: "Supabase غير مفعّل" };
  const tmp = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await tmp.auth.signUp({ email, password });
  if (error) return { error: error.message };
  const id = data.user?.id;
  if (!id) return { error: "تعذّر إنشاء الحساب" };
  // صف الدور (المدير الحالي يملك صلاحية الإدراج عبر RLS)
  const { error: pErr } = await supabase.from("profiles").upsert({ id, name, role });
  if (pErr) return { id, error: `أُنشئ الحساب لكن تعذّر حفظ الدور: ${pErr.message}` };
  return { id };
}

/** تحديث اسم/دور مستخدم في profiles */
export async function updateProfile(id: string, name: string, role: string) {
  if (!supabase) return;
  await supabase.from("profiles").update({ name, role }).eq("id", id);
}

/** حذف صف profiles (حساب Auth نفسه يُحذف من لوحة Supabase — يحتاج صلاحية إدارية) */
export async function deleteProfile(id: string) {
  if (!supabase) return;
  await supabase.from("profiles").delete().eq("id", id);
}
