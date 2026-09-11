/* ضبط كلمة المرور بعد رابط الدعوة أو الاستعادة.

   «لا تجعل المدير يكتب كلمة مرور المستخدم؛ أرسل دعوة آمنة ليعيّنها
   بنفسه». الدعوة تفتح هذه الصفحة بجلسةٍ من نوع استعادة (PASSWORD_RECOVERY)
   والمستخدم يكتب كلمته هنا وحده — المدير لا يعرفها ولا تمرّ عليه.

   السياسة من lib/password (١٢ محرفاً، لا شائعة، لا الاسم ولا البريد)
   والحكم يظهر أثناء الكتابة. */
import { useState } from "react";
import { motion } from "motion/react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { B } from "@/lib/theme";
import { TasaheelMark } from "@/components/TasaheelMark";
import { Spinner } from "@/components/Spinner";
import { useStore } from "@/store/useStore";
import { Field } from "@/components/Field";
import { checkPassword, PASSWORD_HINT } from "@/lib/password";

export function SetPasswordPage() {
  const setPassword = useStore((s) => s.setPassword);
  const email = useStore((s) => s.session?.user?.email ?? "");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const check = checkPassword(pw, [email]);
  const mismatch = !!pw2 && pw !== pw2;
  const ready = check.ok && !mismatch && !!pw2 && !busy;

  const submit = async () => {
    if (!ready) return;
    setBusy(true); setError("");
    const { error } = await setPassword(pw);
    if (error) { setError(error); setBusy(false); }
  };

  return (
    <div dir="rtl" lang="ar" className="min-h-screen flex items-center justify-center p-4"
      style={{ fontFamily: "var(--font-app)", background: `linear-gradient(160deg,${B.primaryDeep} 0%,${B.primary} 55%,${B.black} 100%)` }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full" style={{ maxWidth: 420 }}>
        <div className="flex flex-col items-center mb-6">
          <TasaheelMark size={76} />
          <div className="mt-3" style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>تساهيل العمرة</div>
          <div style={{ fontSize: 10, color: B.gold, letterSpacing: 1, marginTop: 2 }}>لوحة الإدارة · تعيين كلمة المرور</div>
        </div>
        <div className="rounded-2xl p-6 flex flex-col gap-4" style={{ background: "#fff" }}>
          <div>
            <div className="font-extrabold text-lg flex items-center gap-2" style={{ color: B.black }}><KeyRound size={18} style={{ color: B.gold }} />اختر كلمة مرورك</div>
            <div className="text-xs mt-0.5" style={{ color: B.muted }}>
              {email ? <>لحساب <b style={{ direction: "ltr", unicodeBidi: "embed" }}>{email}</b>. </> : null}
              لا يعرفها أحدٌ غيرك — ولا مدير النظام.
            </div>
          </div>
          <div>
            <Field label="كلمة المرور الجديدة" error={pw && !check.ok ? check.error : undefined}
              labelStyle={{ color: B.text3, textAlign: "right", direction: "rtl" }}>
              <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder={PASSWORD_HINT} autoFocus
                aria-invalid={!!pw && !check.ok}
                className="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none"
                style={{ borderColor: pw && !check.ok ? "#BE2626" : B.border, color: B.black, direction: "ltr", textAlign: "left" }} />
            </Field>
            {pw && check.ok && <p className="text-xs mt-1 font-bold" style={{ color: "#1E7A44" }}>كلمة مرور مقبولة</p>}
          </div>
          <div>
            <Field label="تأكيد كلمة المرور" error={mismatch ? "الكلمتان غير متطابقتين" : undefined}
              labelStyle={{ color: B.text3, textAlign: "right", direction: "rtl" }}>
              <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="أعد كتابتها"
                className="w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none"
                style={{ borderColor: mismatch ? "#BE2626" : B.border, color: B.black, direction: "ltr", textAlign: "left" }} />
            </Field>
          </div>
          {error && <div className="text-xs font-bold rounded-lg px-3 py-2" style={{ background: "#FBE6E6", color: "#BE2626", border: "1px solid #F3C9C9" }}>{error}</div>}
          <button onClick={submit} disabled={!ready}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-extrabold text-sm"
            style={{ background: ready ? B.gold : "#EEECEA", color: ready ? B.black : B.muted, border: "none", cursor: ready ? "pointer" : "not-allowed" }}>
            {busy ? <><Spinner size={15} track="rgba(27,23,18,0.15)" color={B.muted} />جارٍ الحفظ…</> : <><ShieldCheck size={16} />حفظ والدخول</>}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
