/* شاشة الإعدادات — كانت «قيد البناء» وظاهرة في القائمة الجانبية.

   ما تضبطه: القيم التي كانت ثوابت مبثوثة في الشفرة (data/settings.ts).
   الكتابة للمدير وحده — نفس حرس القاعدة (can_write_admin)، فلا زرّ
   يَعِد بعملٍ ترفضه القاعدة.

   نموذج بمسوّدة وزرّ حفظ لا حفظٌ تلقائي مع كل حرف: هذه قيم تسري على
   كل الفواتير والتذاكر ورقم الدعم — «١٠١٠٥٣٧٣٩» نصف مكتوبٍ لا يُحفظ. */
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { AlertTriangle, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { B } from "@/lib/theme";
import { PageHeader } from "@/components/PageHeader";
import { Field } from "@/components/Field";
import { Spinner } from "@/components/Spinner";
import { useRole } from "@/lib/useRole";
import { isSupabaseEnabled } from "@/supabase/client";
import {
  DEFAULT_SETTINGS, fetchSettings, saveSettings, invalidatePublicSettings,
  type AppSettings,
} from "@/data/settings";
import { configureSla } from "@/features/customer/sla";

const inp = "w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none";
const ist = { borderColor: B.border, fontFamily: "inherit", color: B.black } as const;
const ltr = { direction: "ltr" as const, textAlign: "right" as const };

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl p-5 md:p-6" style={{ background: "#fff", border: `1px solid ${B.border}` }}>
      <h2 className="font-extrabold text-base" style={{ color: B.black, margin: 0 }}>{title}</h2>
      {note && <p className="text-xs mt-1 mb-4 leading-relaxed" style={{ color: B.muted }}>{note}</p>}
      <div className={note ? "" : "mt-4"}>{children}</div>
    </section>
  );
}

/** ساعة يُختار منها 0–23 — النافذة أوقاتٌ صحيحة لا نصّ حرّ. */
function HourSelect({ value, onChange, id }: { value: number; onChange: (n: number) => void; id?: string }) {
  return (
    <select id={id} value={value} onChange={e => onChange(Number(e.target.value))}
      className={inp} style={{ ...ist, cursor: "pointer" }}>
      {Array.from({ length: 24 }, (_, h) => (
        <option key={h} value={h}>{`${String(h).padStart(2, "0")}:00`}</option>
      ))}
    </select>
  );
}

/** رقم موجب داخل حدّ — الحقل النصّي كان يقبل «-3» و«abc». */
function NumField({ value, onChange, min = 1, max = 999, id }: {
  value: number; onChange: (n: number) => void; min?: number; max?: number; id?: string;
}) {
  return (
    <input id={id} inputMode="numeric" value={String(value)}
      onChange={e => {
        const n = Number(e.target.value.replace(/\D/g, ""));
        onChange(Number.isFinite(n) ? Math.min(max, Math.max(min, n || min)) : min);
      }}
      className={inp} style={{ ...ist, ...ltr }} />
  );
}

export function SettingsPage({ onMenuOpen }: { onMenuOpen?: () => void }) {
  const { isAdmin } = useRole();
  const [search, setSearch] = useState("");
  const [saved, setSaved] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [form, setForm] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchSettings()
      .then(s => { if (alive) { setSaved(s); setForm(s); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const pub = <K extends keyof AppSettings["pub"]>(k: K) => (v: AppSettings["pub"][K]) =>
    setForm(f => ({ ...f, pub: { ...f.pub, [k]: v } }));
  const inte = <K extends keyof AppSettings["internal"]>(k: K) => (v: AppSettings["internal"][K]) =>
    setForm(f => ({ ...f, internal: { ...f.internal, [k]: v } }));

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(saved), [form, saved]);
  /* نافذة مقلوبة (الإغلاق قبل الفتح) تجعل وعد الردّ لا يمشي أبداً — يُمنع
     الحفظ لا يُصحَّح صامتاً: التصحيح التلقائي يخفي أن الإدخال كان خطأ. */
  const badWindow = form.pub.closeHour <= form.pub.openHour;
  const badPhone = !/^0?5\d{8}$/.test(form.pub.supportPhone.replace(/\s/g, ""));
  const badEmail = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.internal.supportEmail);
  const blocked = badWindow || badPhone || badEmail;

  async function submit() {
    if (!dirty || blocked) return;
    setBusy(true);
    try {
      await saveSettings(form);
      setSaved(form);
      /* المخزون يُبطل بعد الحفظ: بدونه يبقى الزرّ العائم وترويسات
         المستندات على القيمة القديمة حتى إعادة تحميل الصفحة. */
      invalidatePublicSettings();
      configureSla(form.pub);
      toast.success("حُفظت الإعدادات", {
        description: isSupabaseEnabled ? undefined : "وضع التجربة — بلا قاعدة بيانات، لن تبقى بعد التحديث.",
      });
    } catch (e) {
      console.error("[settings] فشل الحفظ:", e);
      const m = String((e as { message?: string })?.message ?? e);
      toast.error("تعذّر حفظ الإعدادات", {
        description: /forbidden/i.test(m) ? "الحفظ لمدير النظام وحده." : m,
        duration: 9000,
      });
    } finally { setBusy(false); }
  }

  if (loading) return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{ background: B.bg }}>
      <PageHeader title="الإعدادات" crumb="إعدادات النظام" search={search} onSearch={setSearch} onMenuOpen={onMenuOpen} />
      <div className="flex-1 flex items-center justify-center"><Spinner size={22} /></div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{ background: B.bg }}>
      <PageHeader title="الإعدادات" crumb="إعدادات النظام" search={search} onSearch={setSearch} onMenuOpen={onMenuOpen} />

      <main className="flex-1 px-4 md:px-8 pb-32 pt-5 flex flex-col gap-4" style={{ maxWidth: 900 }}>
        {/* القراءة للجميع والكتابة للمدير — يُقال صريحاً بدل حقولٍ
            تُملأ ثم يردّها الخادم. */}
        {!isAdmin && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ background: "#FBF3D6", border: "1px solid #E8D9A8", color: "#6b5306" }}>
            <ShieldCheck size={16} style={{ flexShrink: 0, color: "#8A6A08" }} />
            <span className="text-sm">هذه الإعدادات للعرض — تعديلها لمدير النظام.</span>
          </div>
        )}
        {!isSupabaseEnabled && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ background: "#EAF1FE", border: "1px solid #C9DBFB", color: "#1E52C7" }}>
            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
            <span className="text-sm">وضع التجربة: بلا قاعدة بيانات — التعديل لا يُحفظ بعد تحديث الصفحة.</span>
          </div>
        )}

        <fieldset disabled={!isAdmin} style={{ border: "none", padding: 0, margin: 0 }} className="flex flex-col gap-4">
          <Card title="بيانات المؤسسة"
            note="تظهر في الفاتورة والتذكرة وصفحة الدفع وإشعار الإلغاء — أربعة مواضع كانت تحمل نسخاً منفصلة من نفس الرقم.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="اسم المؤسسة">
                <input value={form.pub.orgName} onChange={e => pub("orgName")(e.target.value)}
                  className={inp} style={ist} />
              </Field>
              <Field label="السجل التجاري">
                <input value={form.pub.crNumber} inputMode="numeric"
                  onChange={e => pub("crNumber")(e.target.value.replace(/\D/g, "").slice(0, 12))}
                  className={inp} style={{ ...ist, ...ltr }} />
              </Field>
              <Field label="النطاق">
                <input value={form.pub.domain} onChange={e => pub("domain")(e.target.value.trim())}
                  className={inp} style={{ ...ist, ...ltr }} />
              </Field>
            </div>
          </Card>

          <Card title="التواصل"
            note="رقم الواتساب هو ما يفتحه الزرّ العائم في كل شاشات المستفيد.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="واتساب خدمة العملاء"
                error={badPhone ? "رقم جوال سعودي: 05 ثم ثمانية أرقام." : undefined}>
                <input value={form.pub.supportPhone} inputMode="tel" placeholder="05xxxxxxxx"
                  onChange={e => pub("supportPhone")(e.target.value.replace(/[^\d+ ]/g, "").slice(0, 14))}
                  className={inp} style={{ ...ist, ...ltr, borderColor: badPhone ? "#BE2626" : B.border }} />
              </Field>
              <Field label="بريد الدعم الفني"
                error={badEmail ? "بريد غير صحيح." : undefined}>
                <input value={form.internal.supportEmail} type="email" inputMode="email"
                  onChange={e => inte("supportEmail")(e.target.value.trim())}
                  className={inp} style={{ ...ist, ...ltr, borderColor: badEmail ? "#BE2626" : B.border }} />
              </Field>
            </div>
          </Card>

          <Card title="ساعات العمل ووعد الردّ"
            note="وعد الردّ يُحسب بساعات العمل لا بالساعة الجدارية: طلبٌ يصل بعد الإغلاق يبدأ عدّاده من فتح اليوم التالي. التوقيت توقيت الرياض.">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="الفتح">
                <HourSelect value={form.pub.openHour} onChange={pub("openHour")} />
              </Field>
              <Field label="الإغلاق"
                error={badWindow ? "الإغلاق يجب أن يكون بعد الفتح." : undefined}>
                <HourSelect value={form.pub.closeHour} onChange={pub("closeHour")} />
              </Field>
              <Field label="وعد الردّ (ساعات عمل)">
                <NumField value={form.pub.slaHours} onChange={pub("slaHours")} min={1} max={72} />
              </Field>
            </div>
          </Card>

          <Card title="افتراضات الحجز"
            note="تُطبَّق على الرحلات الجديدة؛ الرحلة القائمة تحتفظ بإعداداتها الخاصة.">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="مهلة سداد رابط الدفع (ساعة)">
                <NumField value={form.internal.paymentDeadlineHours} onChange={inte("paymentDeadlineHours")} min={1} max={168} />
              </Field>
              <Field label="أقصى معتمرين في الطلب">
                <NumField value={form.internal.maxPilgrimsPerBooking} onChange={inte("maxPilgrimsPerBooking")} min={1} max={60} />
              </Field>
              <Field label="تنبيه قبل الانطلاق (ساعة)">
                <NumField value={form.internal.departureAlertHours} onChange={inte("departureAlertHours")} min={1} max={168} />
              </Field>
            </div>
          </Card>
        </fieldset>
      </main>

      {/* شريط الحفظ يظهر عند وجود تغيير — الزرّ الدائم يجعل «هل حفظت؟»
          سؤالاً قائماً دائماً. */}
      {isAdmin && dirty && (
        <motion.div initial={{ y: 60 }} animate={{ y: 0 }}
          className="fixed bottom-0 inset-x-0 md:right-64 z-40 flex items-center justify-between gap-3 px-4 md:px-8 py-3"
          style={{ background: "#fff", borderTop: `1px solid ${B.border}`, boxShadow: "0 -6px 24px -12px rgba(0,0,0,.2)" }}>
          <span className="text-sm font-bold" style={{ color: blocked ? "#BE2626" : B.text2 }}>
            {blocked ? "صحّح الحقول المعلَّمة قبل الحفظ" : "لديك تغييرات لم تُحفظ"}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => setForm(saved)} disabled={busy}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold cursor-pointer"
              style={{ background: "#fff", border: `1px solid ${B.border}`, color: B.text2 }}>
              <RotateCcw size={14} />تراجع
            </button>
            <button onClick={submit} disabled={busy || blocked}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold"
              style={{
                background: blocked ? "#EEECEA" : B.gold, color: blocked ? B.muted : B.black,
                border: "none", cursor: blocked || busy ? "not-allowed" : "pointer",
              }}>
              {busy ? <Spinner size={14} color={B.black} /> : <Save size={14} />}حفظ
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
