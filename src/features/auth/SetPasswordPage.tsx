/* ضبط كلمة المرور بعد رابط الدعوة أو الاستعادة.

   «لا تجعل المدير يكتب كلمة مرور المستخدم؛ أرسل دعوة آمنة ليعيّنها
   بنفسه». الدعوة تفتح هذه الصفحة بجلسةٍ من نوع استعادة (PASSWORD_RECOVERY)
   والمستخدم يكتب كلمته هنا وحده — المدير لا يعرفها ولا تمرّ عليه.

   السياسة من lib/password (١٢ محرفاً، لا شائعة، لا الاسم ولا البريد)
   والحكم يظهر أثناء الكتابة. */
import { useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, ShieldCheck } from "lucide-react";
import { useStore } from "@/store/useStore";
import { Field } from "@/components/Field";
import { Button, Note } from "@/components/ui";
import { checkPassword, PASSWORD_HINT } from "@/lib/password";
import { AuthShell, PasswordInput } from "./AuthShell";

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

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!ready) return;
    setBusy(true); setError("");
    const { error } = await setPassword(pw);
    if (error) { setError(error); setBusy(false); }
  };

  return (
    <AuthShell title="اختر كلمة مرورك"
      sub={<>{email ? <>لحساب <b dir="ltr" style={{ unicodeBidi: "isolate", color: "var(--k-text-3)" }}>{email}</b>. </> : null}لا يعرفها أحدٌ غيرك — ولا مدير النظام.</>}>
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <div>
          <Field label="كلمة المرور الجديدة" hint={PASSWORD_HINT} error={pw && !check.ok ? check.error : undefined}>
            <PasswordInput name="new-password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus
              invalid={!!pw && !check.ok} />
          </Field>
          {pw && check.ok && <p className="flex items-center gap-1.5" style={{ fontSize: 12, fontWeight: 600, color: "var(--k-success)", marginTop: 6 }}><CheckCircle2 size={13} />كلمة مرور مقبولة</p>}
        </div>
        <div>
          <Field label="تأكيد كلمة المرور" error={mismatch ? "الكلمتان غير متطابقتين" : undefined}>
            <PasswordInput name="confirm-password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} invalid={mismatch} />
          </Field>
        </div>
        {error && <Note tone="danger" icon={<AlertCircle size={16} />}>{error}</Note>}
        <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={!ready && !busy} icon={<ShieldCheck size={17} />}>
          {busy ? "جارٍ الحفظ…" : "حفظ والدخول"}
        </Button>
      </form>
    </AuthShell>
  );
}
