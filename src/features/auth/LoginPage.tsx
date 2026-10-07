import { useState, type FormEvent } from "react";
import { AlertCircle, LogIn } from "lucide-react";
import { useStore } from "@/store/useStore";
import { Field } from "@/components/Field";
import { Button, Note } from "@/components/ui";
import { AuthShell, PasswordInput } from "./AuthShell";

export function LoginPage() {
  const signIn = useStore((s) => s.signIn);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!email.trim() || !password || busy) return;
    setBusy(true); setError("");
    const { error } = await signIn(email.trim(), password);
    /* رسالة المزوّد لا تُعرض كما هي: «Invalid login credentials» تُترجم، وما
       عداها (شبكة، حدّ محاولات) يُقال بلغة الموظف مع ما يفعله بعدها. */
    if (error) {
      setError(error === "Invalid login credentials"
        ? "البريد أو كلمة المرور غير صحيحة."
        : /rate|too many/i.test(error) ? "محاولات كثيرة. انتظر دقيقة ثم أعد المحاولة."
        : "تعذّر الدخول. تحقّق من الاتصال ثم أعد المحاولة.");
      setBusy(false);
    }
    // عند النجاح يتحدّث المخزن عبر onAuthStateChange وتُعرض الواجهة تلقائياً
  };

  return (
    <AuthShell title="تسجيل الدخول" sub="أدخل بريدك وكلمة المرور للوصول إلى لوحة الإدارة.">
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <div>
          <Field label="البريد الإلكتروني">
            <input type="email" name="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com" autoFocus dir="ltr"
              className="ui-input" style={{ height: 46, textAlign: "left" }} />
          </Field>
        </div>
        <div>
          <Field label="كلمة المرور">
            {/* لا نقاط توضيحية: في حقل كلمة المرور تُرسَم النقاط نفسها للقيمة
                الحقيقية، فثماني نقاط تبدو كلمة مرور مكتوبة سلفاً. */}
            <PasswordInput name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        </div>

        {error && <Note tone="danger" icon={<AlertCircle size={16} />}>{error}</Note>}

        <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={!email.trim() || !password}
          icon={<LogIn size={17} />}>
          {busy ? "جارٍ الدخول…" : "دخول"}
        </Button>
      </form>
    </AuthShell>
  );
}
