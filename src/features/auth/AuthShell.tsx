/* إطار شاشتَي الدخول وتعيين كلمة المرور.

   الشاشة الأولى التي يراها الموظف كل صباح: نصفٌ للنموذج على العاجي، ونصفٌ
   للحرم ليلاً — سماؤه سوداء وأضواؤه ذهبية، وهما لونا اللوحة نفسها. على
   الجوال يبقى النموذج وحده تحت شعارٍ صغير؛ الصورة لا تُحمَّل هناك أصلاً. */
import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { motion } from "motion/react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { B, DUR, EASE } from "@/lib/theme";
import { TasaheelMark } from "@/components/TasaheelMark";

export function AuthShell({ title, sub, children }: { title: string; sub: ReactNode; children: ReactNode }) {
  return (
    <div dir="rtl" lang="ar" className="ts-admin min-h-screen flex" style={{ fontFamily: "var(--font-app)", background: B.bg }}>
      <main className="flex-1 flex flex-col items-center justify-center px-5 py-10">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: DUR.slow, ease: EASE }}
          className="w-full" style={{ maxWidth: 380 }}>
          <div className="flex items-center gap-3 mb-10">
            <TasaheelMark size={44} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: B.black, lineHeight: 1.35 }}>تساهيل العمرة</div>
              <div style={{ fontSize: 12, color: B.muted }}>لوحة الإدارة</div>
            </div>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: B.black, lineHeight: 1.35, margin: 0 }}>{title}</h1>
          <p style={{ fontSize: 14, color: B.muted, lineHeight: 1.8, margin: "6px 0 28px" }}>{sub}</p>
          {children}
          <div className="flex items-center gap-1.5 mt-8" style={{ fontSize: 12, color: B.muted }}>
            <Lock size={12} />اتصال آمن ومشفّر
          </div>
        </motion.div>
      </main>

      <aside aria-hidden className="hidden lg:block relative flex-1 overflow-hidden" style={{ background: B.ink, maxWidth: 720 }}>
        <img src="/bg-haram.jpg" alt="" className="absolute inset-0 w-full h-full" style={{ objectFit: "cover", objectPosition: "center 88%" }} />
        <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${B.ink} 0%, rgba(20,17,14,.72) 30%, rgba(20,17,14,0) 62%, rgba(20,17,14,.55) 100%)` }} />
        <div className="absolute inset-x-0 top-0" style={{ height: 2, background: `linear-gradient(90deg,transparent,${B.gold} 20%,${B.gold2} 50%,${B.gold} 80%,transparent)` }} />
        <div className="absolute inset-x-0 top-0 px-12 pt-16">
          <div style={{ fontSize: 13, fontWeight: 600, color: B.gold2 }}>تساهيل العمرة</div>
          <div style={{ fontSize: 34, fontWeight: 700, color: B.onInk, lineHeight: 1.45, marginTop: 10, maxWidth: 420 }}>
            نسهّل الرحلة، ليتفرّغ ضيف الرحمن لما جاء من أجله.
          </div>
        </div>
      </aside>
    </div>
  );
}

/** حقل كلمة المرور بزرّ إظهار — من يكتب اثني عشر محرفاً لا يراها يُخطئ في واحد. */
export function PasswordInput({ invalid, ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input {...rest} type={show ? "text" : "password"} aria-invalid={invalid || undefined}
        className="ui-input" dir="ltr" style={{ height: 46, textAlign: "left", paddingInlineEnd: 14, paddingInlineStart: 46 }} />
      <button type="button" onClick={() => setShow(v => !v)} aria-label={show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"} aria-pressed={show}
        className="ui-iconbtn ui-iconbtn--sm absolute top-1/2 -translate-y-1/2" style={{ left: 8 }}>
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}
