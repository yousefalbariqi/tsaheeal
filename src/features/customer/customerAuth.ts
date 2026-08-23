/* هوية المستفيد — Supabase Phone Auth بجلسة JWT حقيقية.

   لا يوجد رمز تجريبي ولا مسار محلي: كل رمز يُرسَل عبر Twilio Verify
   وكل تحقّق يجري على خادم Supabase. حُذف مسار DEV_CODE (رمز ثابت
   123456 وجلسة نصّية في localStorage) لأنه كان يسمح بانتحال أي رقم
   بتعديل مفتاح واحد في المتصفح، ولأن جلسته بلا JWT فكانت كتابات
   العميل تُرفض بـ401 أو تذهب لذاكرة الصفحة فلا تصل اللوحة أبداً.

   ⚠️ الواجهة لا تنادي Twilio ولا تعرف مفاتيحه. مفاتيح Twilio تُلصَق
   في Supabase ← Authentication ← Providers ← Phone، والخادم هو من
   ينادي Verify. أي مفتاح بادئته VITE_ يصل إلى حزمة المتصفح، ووضع
   TWILIO_AUTH_TOKEN هناك يعني أن كل زائر يقدر يرسل رسائل على حسابك.

   القناة الأساسية: الرسائل النصية عبر Twilio Verify — لا تحتاج قالباً
   معتمَداً. واتساب يبقى خلف راية حتى يُعتمد قالب رسالة الرمز. */
import type { Session } from "@supabase/supabase-js";
import { customerSupabase, isCustomerAuthEnabled, CUSTOMER_STORAGE_KEY } from "@/supabase/customerClient";
import { waNormalize } from "@/lib/utils";

export type OtpChannel = "sms" | "whatsapp";

/** لكل حالة رسالة عربية مختلفة — «فشل» واحدة لا تُرشد المستخدم لشيء. */
export type AuthErrorKind =
  | "invalid_phone" | "rate_limited" | "wrong_code" | "expired"
  | "provider_disabled" | "signups_disabled" | "network" | "same_phone" | "unknown";

export interface AuthFail { ok: false; kind: AuthErrorKind; retryAfterSec?: number; raw?: string }
export interface SendOk   { ok: true; channel: OtpChannel; cooldownSec: number }

/* المشروع يعمل بـ strict:false، وفيه لا يُضيّق TS الاتحادات على
   `!r.ok` وحده — فحارس نوع صريح هو الطريقة الموثوقة للتفريق. */
export const isFail = (r: { ok: boolean }): r is AuthFail => !r.ok;

export interface CustomerProfile {
  firstName: string; lastName: string; birthDate: string;
  email: string; phone: string; complete: boolean;
}
export interface CustomerSession {
  userId: string;
  phone: string;       // 966501234567 — مطابق لمُطالبة phone في الـJWT
  phoneLocal: string;  // 0501234567 — للعرض والتعبئة المسبقة
  profile: CustomerProfile | null;
  claimed?: number;    // حجوزات سابقة بنفس الرقم ضُمّت للحساب
}

const num = (v: unknown, d: number) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };

/** حدّ GoTrue الافتراضي بين إرسالين — 30 ثانية كانت تُرفض من الخادم. */
const RESEND_COOLDOWN = num(import.meta.env.VITE_OTP_RESEND_SEC, 60);
const OTP_TTL_SEC = num(import.meta.env.VITE_OTP_TTL_SEC, 300);

/** القناة الافتراضية. الرسائل النصية تعمل عبر Verify بلا قالب. */
export const DEFAULT_CHANNEL: OtpChannel = "sms";

/** واتساب بديلٌ اختياري — يتطلّب قالب رسالة معتمَداً في Twilio.
    مطفأ افتراضياً: تفعيله بلا قالب يُرجع sms_send_failed من المزوّد. */
export const isWhatsappEnabled = import.meta.env.VITE_OTP_WHATSAPP_ENABLED === "true";

/* مفاتيح الجلسة التجريبية القديمة. تُمسح مرّة واحدة عند الإقلاع حتى لا
   يبقى جهاز جرّب النسخة السابقة حاملاً هوية وهمية باسم رقم ليس له. */
const STALE_KEYS = ["tasaheel_customer_session", "tasaheel_customer_phone"];
try { STALE_KEYS.forEach(k => localStorage.removeItem(k)); } catch { /* تخزين محظور */ }

export const localPhone = (p: string) => {
  const d = waNormalize(p);
  return d.length === 12 && d.startsWith("966") ? "0" + d.slice(3) : d;
};
const e164 = (p: string) => "+" + waNormalize(p);
const isSaudiMobile = (p: string) => /^9665\d{8}$/.test(waNormalize(p));

/** مفاتيح Supabase غائبة = لا هوية إطلاقاً. نعيد خطأ المزوّد بدل أن
    ننهار على `customerSupabase!`، فتظهر رسالة عربية لا شاشة بيضاء. */
const notReady = (): AuthFail => {
  console.error("[auth] مفاتيح Supabase غير مضبوطة — لا يمكن إرسال رمز تحقّق");
  return { ok: false, kind: "provider_disabled", raw: "supabase_not_configured" };
};

/* ═══════════════ تصنيف الأخطاء ═══════════════ */
/** لحظة آخر إرسال — بها نفرّق الرمز الخاطئ من المنتهي، لأن GoTrue
    يعيد otp_expired للحالتين. */
let lastSentAt = 0;

function mapAuthError(e: unknown): AuthFail {
  if (!e) return { ok: false, kind: "unknown" };
  const err = e as { code?: string; status?: number; message?: string; name?: string };
  const msg = err.message ?? "";
  const code = err.code ?? "";

  if (err.name === "TypeError" || /fetch|network/i.test(msg)) return { ok: false, kind: "network", raw: msg };

  const after = /after (\d+) seconds?/i.exec(msg);
  if (code === "over_sms_send_rate_limit" || code === "over_request_rate_limit" || err.status === 429)
    return { ok: false, kind: "rate_limited", retryAfterSec: after ? Number(after[1]) : RESEND_COOLDOWN, raw: msg };

  if (code === "otp_expired") {
    const elapsed = (Date.now() - lastSentAt) / 1000;
    return { ok: false, kind: lastSentAt && elapsed > OTP_TTL_SEC ? "expired" : "wrong_code", raw: msg };
  }
  if (code === "invalid_credentials") return { ok: false, kind: "wrong_code", raw: msg };
  /* Twilio Verify يعيد 20404 للرمز المستهلَك أو المنتهي — يصل عبر
     GoTrue كـsms_send_failed أحياناً، وهو خطأ رمز لا خطأ مزوّد. */
  if (/20404|verification.*(not found|expired)/i.test(msg)) return { ok: false, kind: "wrong_code", raw: msg };
  if (code === "phone_provider_disabled" || code === "sms_send_failed" || code === "otp_disabled") {
    /* رسالة Twilio الأصلية (60200 رقم غير صالح، 60238 قناة غير مفعّلة،
       21408 الوجهة محظورة جغرافياً) لا تُعرض للمستخدم لكنها تُسجَّل —
       بدونها كل أعطال المزوّد تبدو واحدة عند التشخيص. */
    console.error("[auth] المزوّد رفض الإرسال:", code, msg);
    return { ok: false, kind: "provider_disabled", raw: msg };
  }
  if (code === "signup_disabled") return { ok: false, kind: "signups_disabled", raw: msg };
  if (code === "validation_failed" || /invalid phone/i.test(msg)) return { ok: false, kind: "invalid_phone", raw: msg };
  return { ok: false, kind: "unknown", raw: msg || code };
}

export function authErrorMessage(f: AuthFail, t: (k: string) => string): string {
  switch (f.kind) {
    case "invalid_phone":     return t("invalidPhone");
    case "wrong_code":        return t("errOtpWrong");
    case "expired":           return t("errOtpExpired");
    case "rate_limited":      return t("errRateLimited").replace("{n}", String(f.retryAfterSec ?? RESEND_COOLDOWN));
    case "provider_disabled": return t("errSmsProvider");
    case "signups_disabled":  return t("errSignupDisabled");
    case "network":           return t("errNetwork");
    case "same_phone":        return t("errSamePhone");
    default:                  return t("errUnknown");
  }
}

/* ═══════════════ إرسال الرمز والتحقق ═══════════════ */
export async function sendOtp(phone: string, channel: OtpChannel = DEFAULT_CHANNEL): Promise<SendOk | AuthFail> {
  if (!isSaudiMobile(phone)) return { ok: false, kind: "invalid_phone" };
  if (!isCustomerAuthEnabled) return notReady();
  /* واتساب بلا قالب معتمَد يفشل عند المزوّد لا عندنا — نردّه للرسائل
     النصية قبل الإرسال بدل أن نُري المستخدم عطلاً لا حيلة له فيه. */
  const ch: OtpChannel = channel === "whatsapp" && !isWhatsappEnabled ? "sms" : channel;
  const { error } = await customerSupabase!.auth.signInWithOtp({
    phone: e164(phone),
    options: { channel: ch, shouldCreateUser: true },
  });
  if (error) return mapAuthError(error);
  lastSentAt = Date.now();
  return { ok: true, channel: ch, cooldownSec: RESEND_COOLDOWN };
}

export async function verifyOtp(phone: string, code: string): Promise<{ ok: true; session: CustomerSession } | AuthFail> {
  if (!isCustomerAuthEnabled) return notReady();
  // النوع "sms" صحيح حتى لو وصل الرمز عبر واتساب — القناة تخص التوصيل فقط
  const { data, error } = await customerSupabase!.auth.verifyOtp({
    phone: e164(phone), token: code.trim(), type: "sms",
  });
  if (error || !data.session) return mapAuthError(error);
  return { ok: true, session: await bootstrapSession(data.session) };
}

/* ═══════════════ قراءة الجلسة ═══════════════ */
const mapProfile = (r: Record<string, unknown> | null): CustomerProfile | null => r ? {
  firstName: (r.first_name ?? r.firstName ?? "") as string,
  lastName:  (r.last_name  ?? r.lastName  ?? "") as string,
  birthDate: ((r.birth_date ?? r.birthDate) ?? "") as string,
  email:     (r.email ?? "") as string,
  phone:     (r.phone ?? "") as string,
  complete:  Boolean(r.profile_complete ?? r.complete),
} : null;

/** يُنشئ صف الحساب عند أول دخول ويضمّ الحجوزات السابقة بنفس الرقم. */
async function bootstrapSession(sess: Session): Promise<CustomerSession> {
  const phone = waNormalize(sess.user.phone ?? "");
  const base: CustomerSession = { userId: sess.user.id, phone, phoneLocal: localPhone(phone), profile: null };
  const { data, error } = await customerSupabase!.rpc("customer_bootstrap");
  if (error) { console.error("[auth] تعذّر تهيئة الحساب:", error); return base; }
  const row = data as Record<string, unknown> | null;
  return { ...base, profile: mapProfile(row), claimed: Number(row?.claimed ?? 0) || undefined };
}

export async function loadSession(): Promise<CustomerSession | null> {
  if (!isCustomerAuthEnabled) return null;
  const { data } = await customerSupabase!.auth.getSession();
  if (!data.session) return null;
  const sess = data.session;
  const phone = waNormalize(sess.user.phone ?? "");
  /* قراءة الصف مباشرة أخفّ من bootstrap في كل تحميل؛ ولا نُهيّئ
     إلا إن كان الصف غائباً (حساب أُنشئ قبل هذا الجدول). */
  const { data: row } = await customerSupabase!
    .from("customer_profiles").select("*").eq("id", sess.user.id).maybeSingle();
  if (!row) return bootstrapSession(sess);
  return { userId: sess.user.id, phone, phoneLocal: localPhone(phone), profile: mapProfile(row) };
}

/** للرسم الأول فقط — لا يُبنى عليه أي تصريح.
    يقرأ جلسة Supabase المخزّنة مباشرةً: getSession غير متزامنة، وانتظارها
    يُظهر حقل الجوال فارغاً للحظة عند كل تحميل. */
export function cachedPhoneLocal(): string | null {
  try {
    const raw = localStorage.getItem(CUSTOMER_STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Record<string, any>;
    const phone = o?.user?.phone ?? o?.currentSession?.user?.phone;
    return phone ? localPhone(String(phone)) : null;
  } catch { return null; }
}

export async function clearSession(): Promise<void> {
  if (isCustomerAuthEnabled) await customerSupabase!.auth.signOut();
}

export function onAuthChange(cb: (s: CustomerSession | null) => void): () => void {
  if (!isCustomerAuthEnabled) return () => {};
  const { data } = customerSupabase!.auth.onAuthStateChange((event, sess) => {
    /* لا تُنادِ Supabase داخل هذا الرد مباشرة — قد يتعارض على القفل
       الداخلي؛ نؤجّله خارج الدورة الحالية. */
    setTimeout(() => {
      if (!sess) { if (event === "SIGNED_OUT") cb(null); return; }
      if (event === "SIGNED_IN" || event === "USER_UPDATED") loadSession().then(cb).catch(() => {});
    }, 0);
  });
  return () => data.subscription.unsubscribe();
}

/* ═══════════════ تغيير رقم الجوال ═══════════════
   الرقم هوية لا حقل بيانات: هو مفتاح الدخول ومرجع ضمّ الحجوزات، ولذلك
   عمود phone في customer_profiles ممنوع على المستفيد بصلاحية العمود.
   فالتغيير لا يُحفظ إلا بعد توثيق الرقم الجديد برمز يصله عليه.

   المرحلتان: updateUser يرسل الرمز إلى الرقم الجديد، ثم verifyOtp بنوع
   phone_change يبدّله في auth.users. وبعدهما sync_my_phone تُحدّث المرآة
   في customer_profiles من الـJWT — لا من وسيط ترسله الواجهة. */

/** يرسل رمزاً إلى الرقم الجديد. لا يغيّر شيئاً بعد. */
export async function requestPhoneChange(newPhone: string): Promise<SendOk | AuthFail> {
  if (!isSaudiMobile(newPhone)) return { ok: false, kind: "invalid_phone" };
  if (!isCustomerAuthEnabled) return notReady();
  const { data: sess } = await customerSupabase!.auth.getSession();
  if (waNormalize(sess.session?.user.phone ?? "") === waNormalize(newPhone))
    return { ok: false, kind: "same_phone" };
  const { error } = await customerSupabase!.auth.updateUser({ phone: e164(newPhone) });
  if (error) return mapAuthError(error);
  lastSentAt = Date.now();
  return { ok: true, channel: DEFAULT_CHANNEL, cooldownSec: RESEND_COOLDOWN };
}

/** يؤكّد الرمز فيصير الرقم الجديد هو الموثّق. يعيد الجلسة المحدَّثة. */
export async function confirmPhoneChange(newPhone: string, code: string):
  Promise<{ ok: true; session: CustomerSession } | AuthFail> {
  if (!isCustomerAuthEnabled) return notReady();
  const { error } = await customerSupabase!.auth.verifyOtp({
    phone: e164(newPhone), token: code.trim(), type: "phone_change",
  });
  if (error) return mapAuthError(error);
  /* المرآة في customer_profiles لا تتحدّث تلقائياً — الصلاحية تمنع
     الكتابة المباشرة، والدالة تقرأ الرقم من الـJWT بعد تبديله. */
  const { error: syncErr } = await customerSupabase!.rpc("sync_my_phone");
  if (syncErr) console.error("[auth] تعذّرت مزامنة الجوال في الملف:", syncErr);
  const fresh = await loadSession();
  return fresh ? { ok: true, session: fresh } : { ok: false, kind: "unknown" };
}

/* ═══════════════ حفظ بيانات الحساب ═══════════════ */
export async function saveProfile(p: { firstName: string; lastName: string; birthDate: string; email: string }):
  Promise<{ ok: true; profile: CustomerProfile } | AuthFail> {
  if (!isCustomerAuthEnabled) return notReady();
  const { data: sess } = await customerSupabase!.auth.getSession();
  const uid = sess.session?.user.id;
  if (!uid) return { ok: false, kind: "unknown" };
  /* تحديث مباشر عبر RLS + صلاحيات الأعمدة — أضيق صلاحية ممكنة،
     ولا حاجة لدالة: الصف موجود سلفاً من customer_bootstrap. */
  const { data, error } = await customerSupabase!
    .from("customer_profiles")
    .update({ first_name: p.firstName.trim(), last_name: p.lastName.trim(), birth_date: p.birthDate || null, email: p.email.trim() || null })
    .eq("id", uid).select("*").single();
  if (error) return mapAuthError(error);
  return { ok: true, profile: mapProfile(data as Record<string, unknown>)! };
}
