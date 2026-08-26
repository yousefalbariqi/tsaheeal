import { useState } from "react";
import { motion } from "motion/react";
import { ShieldCheck, LogIn } from "lucide-react";
import { B } from "@/lib/theme";
import { TasaheelMark } from "@/components/TasaheelMark";
import { Spinner } from "@/components/Spinner";
import { useStore } from "@/store/useStore";
import { Field } from "@/components/Field";

export function LoginPage() {
  const signIn = useStore((s) => s.signIn);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password || busy) return;
    setBusy(true); setError("");
    const { error } = await signIn(email.trim(), password);
    if (error) { setError(error === "Invalid login credentials" ? "بيانات الدخول غير صحيحة" : error); setBusy(false); }
    // عند النجاح يتحدّث المخزن عبر onAuthStateChange وتُعرض الواجهة تلقائياً
  };

  return (
    <div dir="rtl" lang="ar" className="min-h-screen flex items-center justify-center p-4"
      style={{ fontFamily: "var(--font-app)", background: `linear-gradient(160deg,${B.primaryDeep} 0%,${B.primary} 55%,${B.black} 100%)` }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full" style={{ maxWidth: 400 }}>
        <div className="flex flex-col items-center mb-6">
          <TasaheelMark size={76} />
          <div className="mt-3" style={{ fontFamily: "var(--font-app)", fontSize: 22, fontWeight: 800, color: "#fff" }}>تساهيل العمرة</div>
          <div style={{ fontSize: 10, color: B.gold, letterSpacing: 3, marginTop: 2 }}>ADMIN PANEL · SECURE LOGIN</div>
        </div>

        <div className="rounded-2xl p-6 flex flex-col gap-4" style={{ background: "#fff" }}>
          <div>
            <div className="font-extrabold text-lg" style={{ color: B.black, fontFamily: "var(--font-app)" }}>تسجيل الدخول</div>
            <div className="text-xs mt-0.5" style={{ color: B.muted }}>أدخل بريدك وكلمة المرور للوصول إلى لوحة التحكم.</div>
          </div>

          <div>
            <Field label="البريد الإلكتروني" labelStyle={{ color: B.text3, textAlign: "right", direction: "rtl" }}>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="you@example.com" autoFocus
                className="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none"
                style={{ borderColor: B.border, color: B.black, direction: "ltr", textAlign: "right", fontFamily: "var(--font-app)" }} />
            </Field>
          </div>
          <div>
            <label className="block text-xs font-bold mb-1.5" style={{ color: B.text3, textAlign: "right", direction: "rtl" }}>كلمة المرور</label>
            {/* لا نقاط توضيحية: في حقل كلمة المرور تُرسَم النقاط نفسها للقيمة
                الحقيقية، فثماني نقاط تبدو كلمة مرور مكتوبة سلفاً — وهي أشدّ
                حالات إيهام النصّ التوضيحي بأنه بيانات. */}
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="أدخل كلمة المرور"
              className="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none"
              style={{ borderColor: B.border, color: B.black, direction: "rtl", textAlign: "right" }} />
          </div>

          {error && <div className="text-xs font-bold rounded-lg px-3 py-2" style={{ background: "#FBE6E6", color: "#BE2626", border: "1px solid #F3C9C9" }}>{error}</div>}

          <button onClick={submit} disabled={busy || !email.trim() || !password}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-extrabold text-sm"
            style={{ background: busy || !email.trim() || !password ? "#EEECEA" : B.primary, color: busy || !email.trim() || !password ? B.muted : B.cream, border: "none", cursor: busy || !email.trim() || !password ? "not-allowed" : "pointer" }}>
            {busy
              ? <><Spinner size={15} track="rgba(255,255,255,0.4)" color="#fff" />جارٍ الدخول…</>
              : <><LogIn size={16} />دخول</>}
          </button>
          <div className="flex items-center justify-center gap-1.5 text-xs" style={{ color: B.muted }}>
            <ShieldCheck size={12} />اتصال آمن ومشفّر عبر Supabase
          </div>
        </div>
      </motion.div>
    </div>
  );
}
