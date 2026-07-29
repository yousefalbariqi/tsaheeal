/* مزوّد OTP قابل للربط — تنفيذ تجريبي الآن.
   الإنتاج: استبدل الجسم بنداء Supabase Edge Function يرسل الرمز عبر
   WhatsApp Cloud API (channel="whatsapp") ثم SMS كخطة بديلة (channel="sms"). */
export type OtpChannel = "whatsapp" | "sms";

const DEV_CODE = "123456";
export const DEV_OTP_HINT = DEV_CODE; // يُعرض في التطوير فقط كتلميح

export async function sendOtp(phone: string, channel: OtpChannel): Promise<{ ok: boolean }> {
  // TODO(production): call the OTP Edge Function here, e.g.
  //   await supabase.functions.invoke("send-otp", { body: { phone, channel } })
  console.info(`[otp] (تجريبي) إرسال رمز إلى ${phone} عبر ${channel}. الرمز التجريبي: ${DEV_CODE}`);
  return { ok: true };
}

export async function verifyOtp(_phone: string, code: string): Promise<{ ok: boolean }> {
  // TODO(production): verify against the Edge Function / provider.
  return { ok: code.trim() === DEV_CODE };
}

const KEY = "tasaheel_customer_phone";
export const loadSession = (): string | null => { try { return localStorage.getItem(KEY); } catch { return null; } };
export const saveSession = (phone: string) => { try { localStorage.setItem(KEY, phone); } catch { /* ignore */ } };
export const clearSession = () => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } };
