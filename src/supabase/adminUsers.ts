/* إنشاء حساب مصادقة جديد دون التأثير على جلسة المدير الحالي —
   عبر عميل ثانوي لا يحفظ الجلسة. لا يتطلب مفتاح service_role. */
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/supabase/client";
import { publicOrigin } from "@/lib/utils";

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

/* ── الدعوة بدل كلمة مرورٍ يكتبها المدير ──
   «لا تجعل المدير يكتب كلمة مرور المستخدم؛ أرسل دعوة آمنة ليعيّنها
   بنفسه». الحساب يُنشأ بكلمةٍ عشوائية طويلة لا تُعرض لأحد ولا تُحفظ،
   ثم يُرسَل للبريد رابطُ استعادةٍ يفتح صفحة «اختر كلمة مرورك» في اللوحة
   (PASSWORD_RECOVERY → SetPasswordPage). لا يحتاج مفتاح service_role. */
function randomSecret(len = 32): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*";
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, n => chars[n % chars.length]).join("");
}

export async function inviteUser(
  email: string, name: string, role: string, branchId?: string,
): Promise<{ id?: string; error?: string; inviteSent: boolean }> {
  if (!url || !anonKey || !supabase) return { error: "Supabase غير مفعّل", inviteSent: false };
  const tmp = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await tmp.auth.signUp({ email, password: randomSecret() });
  if (error) {
    if (/already registered|already exists|User already/i.test(error.message)) return { error: "هذا البريد مسجَّل أصلاً — أعد إرسال الدعوة من صفّه بدل إنشائه.", inviteSent: false };
    return { error: error.message, inviteSent: false };
  }
  const id = data.user?.id;
  if (!id) return { error: "تعذّر إنشاء الحساب", inviteSent: false };
  const { error: pErr } = await supabase.from("profiles").upsert({ id, name, role, branch_id: branchId || null });
  const invite = await tmp.auth.resetPasswordForEmail(email, { redirectTo: `${publicOrigin()}/admin/` });
  const inviteSent = !invite.error;
  if (pErr) return { id, error: `أُنشئ الحساب لكن تعذّر حفظ الدور: ${pErr.message}`, inviteSent };
  if (invite.error) return { id, error: `أُنشئ الحساب لكن تعذّر إرسال الدعوة: ${invite.error.message} — أعد الإرسال من صفّه.`, inviteSent };
  return { id, inviteSent };
}

/** إعادة إرسال رابط تعيين كلمة المرور لمستخدمٍ قائم. */
export async function resendInvite(email: string): Promise<string | undefined> {
  if (!url || !anonKey) return "Supabase غير مفعّل";
  const tmp = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await tmp.auth.resetPasswordForEmail(email, { redirectTo: `${publicOrigin()}/admin/` });
  return error?.message;
}

/** تحديث اسم/دور/فرع مستخدم في profiles. الفرع هو ما تقرأه سياسات
    النطاق (20260915) — تغييره هنا يغيّر ما يراه الموظف فوراً. */
export async function updateProfile(id: string, name: string, role: string, branchId?: string | null): Promise<string | undefined> {
  if (!supabase) return;
  const patch: Record<string, unknown> = { name, role };
  if (branchId !== undefined) patch.branch_id = branchId || null;
  const { error } = await supabase.from("profiles").update(patch).eq("id", id);
  return error?.message;
}

/* إيقاف/تفعيل حساب. الحالة تُكتب في profiles لا في users وحده: is_staff()
   في القاعدة تُبنى على profiles، وجدول users سجلٌّ إداري لا تقرأه أي
   سياسة RLS. الزر كان يكتب users فقط، فالموقوف يواصل الدخول والكتابة.

   يُرجع رسالة خطأ أو undefined. الحارس trg_profiles_guard يرفض إيقاف
   آخر مدير نشط، ويرفض تغيير غير المدير لحالة أحد — بما فيها حالته. */
export async function setProfileStatus(id: string, status: "active" | "inactive"): Promise<string | undefined> {
  if (!supabase) return;
  const { error } = await supabase.from("profiles").update({ status }).eq("id", id);
  if (!error) return;
  if (/last_admin/.test(error.message)) return "لا يمكن إيقاف آخر مدير نشط في النظام.";
  if (/forbidden/.test(error.message)) return "لا تملك صلاحية إيقاف الحسابات — المدير وحده.";
  return error.message;
}

/** حذف صف profiles (حساب Auth نفسه يُحذف من لوحة Supabase — يحتاج صلاحية إدارية) */
export async function deleteProfile(id: string) {
  if (!supabase) return;
  await supabase.from("profiles").delete().eq("id", id);
}
