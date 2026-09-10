/* شاشة الإعدادات — كانت «قيد البناء» وظاهرة في القائمة الجانبية.

   ما تضبطه: القيم التي كانت ثوابت مبثوثة في الشفرة (data/settings.ts).
   الكتابة للمدير وحده — نفس حرس القاعدة (can_write_admin)، فلا زرّ
   يَعِد بعملٍ ترفضه القاعدة.

   نموذج بمسوّدة وزرّ حفظ لا حفظٌ تلقائي مع كل حرف: هذه قيم تسري على
   كل الفواتير والتذاكر ورقم الدعم — «١٠١٠٥٣٧٣٩» نصف مكتوبٍ لا يُحفظ. */
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { AlertTriangle, Check, RotateCcw, Save, ShieldCheck, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { B } from "@/lib/theme";
import { PageHeader } from "@/components/PageHeader";
import { Field } from "@/components/Field";
import { NumericInput } from "@/components/NumericInput";
import { Spinner } from "@/components/Spinner";
import { useRole } from "@/lib/useRole";
import { isSupabaseEnabled } from "@/supabase/client";
import {
  DEFAULT_SETTINGS, fetchSettings, saveSettings, invalidatePublicSettings,
  HOTEL_FEATURE_ICON_KEYS, HOTEL_FEATURE_ICON_LABELS,
  type AppSettings, type HotelFeatureIconKey, type HotelFeatureOption,
} from "@/data/settings";
import { configureSla } from "@/features/customer/sla";
import { useUnsavedGuard } from "@/lib/useUnsavedGuard";
import { isSaudiMobile, phoneError, toE164 } from "@/lib/phone";
import { checkMapUrl } from "@/lib/maps";
import { slaDueAt, type SlaConfig } from "@/features/customer/sla";
import { AuditLog } from "@/features/audit/AuditLog";
import { ArchivePanel } from "@/features/audit/ArchivePanel";

/* ترتيب أيام الأسبوع باصطلاح JS: 0 الأحد … 6 السبت — هو نفسه اصطلاح
   sla.ts، فالفهرس هنا هو القيمة المخزَّنة بلا ترجمة بينهما. */
const WEEK = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

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
    <NumericInput id={id} value={value}
      onValueChange={raw => {
        const n = Number(raw);
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
  const addr = <K extends keyof AppSettings["pub"]["address"]>(k: K) => (v: string) =>
    setForm(f => ({ ...f, pub: { ...f.pub, address: { ...f.pub.address, [k]: v } } }));
  const setHotelFeatureOptions = (options: HotelFeatureOption[]) => inte("hotelFeatureOptions")(options);
  const updateHotelFeatureOption = (index:number, patch:Partial<HotelFeatureOption>) =>
    setHotelFeatureOptions(form.internal.hotelFeatureOptions.map((option,i)=>i===index?{...option,...patch}:option));
  const removeHotelFeatureOption = (id:HotelFeatureIconKey) =>
    setHotelFeatureOptions(form.internal.hotelFeatureOptions.filter(option=>option.id!==id));
  const addHotelFeatureOption = () => {
    const key=HOTEL_FEATURE_ICON_KEYS.find(id=>!form.internal.hotelFeatureOptions.some(option=>option.id===id));
    if(key) setHotelFeatureOptions([...form.internal.hotelFeatureOptions,{id:key,label:HOTEL_FEATURE_ICON_LABELS[key]}]);
  };

  /* الإجازات تُحرَّر نصّاً وتُحفظ مصفوفة: حقلٌ واحد أسهل من قائمةٍ
     بأزرار إضافة وحذف لبضعة تواريخ في السنة. النصّ يُشتقّ من المحفوظ
     عند أول تحميل ثم يملكه المستخدم — ولا يُعاد اشتقاقه مع كل رسم،
     وإلا مُحيت الفاصلة التي يكتبها قبل أن يُكمل التاريخ التالي. */
  const [holidayText, setHolidayText] = useState("");
  const [holidaysReady, setHolidaysReady] = useState(false);
  useEffect(() => {
    if (holidaysReady || loading) return;
    setHolidayText(saved.pub.holidays.join("، "));
    setHolidaysReady(true);
  }, [loading, saved.pub.holidays, holidaysReady]);

  /* يقبل الفاصلة العربية واللاتينية والمسافات والأسطر. */
  const holidayList = useMemo(
    () => holidayText.split(/[,،\s]+/).map(x => x.trim()).filter(Boolean),
    [holidayText]);
  const badHolidays = holidayList.some(x => !/^\d{4}-\d{2}-\d{2}$/.test(x) || Number.isNaN(Date.parse(x)));

  /* النصّ هو المصدر، فيُزامَن إلى النموذج — بدونه يبقى `form.pub.holidays`
     على المحفوظ ولا يُحسّ المستخدم أن تحريره لم يصل. */
  useEffect(() => {
    if (!holidaysReady || badHolidays) return;
    setForm(f => (
      f.pub.holidays.join("|") === holidayList.join("|")
        ? f
        : { ...f, pub: { ...f.pub, holidays: holidayList } }));
  }, [holidayList, badHolidays, holidaysReady]);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(saved), [form, saved]);
  /* نافذة مقلوبة (الإغلاق قبل الفتح) تجعل وعد الردّ لا يمشي أبداً — يُمنع
     الحفظ لا يُصحَّح صامتاً: التصحيح التلقائي يخفي أن الإدخال كان خطأ. */
  const badWindow = form.pub.closeHour <= form.pub.openHour;
  /* التحقّق من lib/phone لا نمطٌ محلّي: نفس القاعدة التي تحكم كل رقم
     في النظام، فلا يُقبل هنا ما يُرفض هناك. */
  const phoneOk = isSaudiMobile(form.pub.supportPhone);
  const badPhone = !phoneOk;
  const badEmail = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.internal.supportEmail);
  /* النطاق: حروف وأرقام وشرطات ونقاط، ولاحقةٌ من حرفين فأكثر. يُقبل
     مكتوباً بلا بروتوكول أو معه — publicOrigin ينزعه على أي حال. */
  const badDomain = !/^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}\/?$/i.test(form.pub.domain.trim());
  /* الرقم الضريبي السعودي: ١٥ رقماً يبدأ بـ3 وينتهي بـ3. الفراغ مقبول
     ويعني «غير مسجّلة» — الفاتورة حينها أوّلية لا ضريبية. */
  const vat = form.pub.vatNumber.trim();
  const badVat = vat !== "" && !/^3\d{13}3$/.test(vat);
  const mapVerdict = checkMapUrl(form.pub.address.mapUrl);
  const badMap = !!form.pub.address.mapUrl.trim() && !mapVerdict.ok;
  const noWorkDays = form.pub.workDays.length === 0;
  const blocked = badWindow || badPhone || badEmail || badDomain || badVat || badMap || noWorkDays || badHolidays;
  /* يعترض التحديث والإغلاق، ويرفع الراية التي يسأل عنها تنقّل اللوحة. */
  useUnsavedGuard(dirty);

  async function submit() {
    if (!dirty || blocked) return;
    setBusy(true);
    try {
      /* التطبيع عند الحفظ لا عند العرض: ما يصل القاعدة صيغةٌ واحدة،
         فمن يقرؤه لاحقاً (رابط واتساب، قالب رسالة) لا يطبّع من جديد. */
      const clean: AppSettings = {
        ...form,
        pub: {
          ...form.pub,
          supportPhone: toE164(form.pub.supportPhone) ?? form.pub.supportPhone,
          domain: form.pub.domain.replace(/^https?:\/\//i, "").replace(/\/+$/, "").trim(),
          vatNumber: form.pub.vatNumber.trim(),
          holidays: [...new Set(holidayList)].sort(),
        },
      };
      await saveSettings(clean);
      setSaved(clean);
      setForm(clean);
      /* المخزون يُبطل بعد الحفظ: بدونه يبقى الزرّ العائم وترويسات
         المستندات على القيمة القديمة حتى إعادة تحميل الصفحة. */
      invalidatePublicSettings(clean.pub);
      configureSla(clean.pub);
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

  /* ── معاينة وعد الردّ ──
     تُحسب بـ businessElapsed نفسها التي يراها العميل، لا بشرحٍ نصّي:
     شرحٌ مكتوب يمكن أن يكذب على الإعداد، والحساب لا يكذب.

     الحالات الثلاث هي ما سأل عنه الفريق: طلبٌ داخل الدوام، وطلبٌ بعد
     الإغلاق، وطلبٌ في يوم إجازة. والأمثلة من الأسبوع القادم لا من
     تواريخ ثابتة، فتبقى المعاينة ذات معنى مهما مرّ الوقت. */
  const slaPreview = useMemo(() => {
    if (blocked) return [];
    const RIYADH = 3 * 3_600_000, DAY = 86_400_000;
    /* الإعداد من النموذج لا من الوحدة: هذا هو بيت القصيد — المعاينة
       تُظهر أثر ما يكتبه المدير الآن، لا أثر ما حُفظ قبل ساعة. */
    const cfg: SlaConfig = {
      openHour: form.pub.openHour, closeHour: form.pub.closeHour,
      slaHours: form.pub.slaHours, workDays: form.pub.workDays,
      holidays: form.pub.holidays,
    };
    /* لحظة UTC ليومٍ وساعةٍ بتوقيت الرياض. */
    const mk = (dayOffset: number, hour: number, min = 0) => {
      const day = Math.floor((Date.now() + RIYADH) / DAY) + dayOffset;
      return day * DAY + hour * 3_600_000 + min * 60_000 - RIYADH;
    };
    const DAYS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
    const fmt = (utc: number) => {
      const d = new Date(utc + RIYADH);
      const wd = DAYS_AR[(((Math.floor((utc + RIYADH) / DAY) + 4) % 7) + 7) % 7];
      return `${wd} ${d.toISOString().slice(0, 10)} · ${d.toISOString().slice(11, 16)}`;
    };

    /* ثلاث حالاتٍ هي ما سأل عنه الفريق: داخل الدوام، وبعد الإغلاق،
       وفي يوم إجازة. الأخيرة تُبنى على أوّل يوم غير عاملٍ قادم. */
    const openAt = mk(1, Math.min(form.pub.openHour + 1, form.pub.closeHour - 1));
    const afterClose = mk(1, Math.min(23, form.pub.closeHour), 30);
    let offDay = 1;
    for (let i = 0; i < 14; i++) {
      const wd = (((Math.floor((mk(offDay, 12) + RIYADH) / DAY) + 4) % 7) + 7) % 7;
      if (!form.pub.workDays.includes(wd)) break;
      offDay++;
    }

    const cases = [
      { label: "طلب داخل الدوام", at: openAt },
      { label: "طلب بعد الإغلاق", at: afterClose },
      { label: "طلب في يوم إجازة", at: mk(offDay, 12) },
    ];
    return cases.map(c => {
      const due = slaDueAt(cfg, c.at);
      return {
        label: `${c.label} — ${fmt(c.at)}`,
        due: due === null ? "لا ينقضي" : fmt(due),
        /* «متأخّر» = الردّ يقع في يومٍ بعد يوم الطلب. */
        late: due !== null && Math.floor((due + RIYADH) / DAY) > Math.floor((c.at + RIYADH) / DAY),
      };
    });
  }, [form.pub.slaHours, form.pub.openHour, form.pub.closeHour, form.pub.workDays, form.pub.holidays, blocked]);

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
                <NumericInput value={form.pub.crNumber}
                  onValueChange={v => pub("crNumber")(v.slice(0, 12))}
                  className={inp} style={{ ...ist, ...ltr }} />
              </Field>
              <Field label="النطاق"
                error={badDomain ? "نطاق غير صحيح — مثال: tasaheel.sa" : undefined}>
                <input value={form.pub.domain} onChange={e => pub("domain")(e.target.value.trim())}
                  className={inp} style={{ ...ist, ...ltr, borderColor: badDomain ? "#BE2626" : B.border }} />
              </Field>
              <Field label="الرقم الضريبي"
                hint={form.pub.vatNumber ? undefined : "اتركه فارغاً إن لم تكن المنشأة مسجّلة — تُصدَر الفاتورة أوّلية غير ضريبية"}
                error={badVat ? "الرقم الضريبي ١٥ رقماً يبدأ وينتهي بـ3" : undefined}>
                <NumericInput value={form.pub.vatNumber} placeholder="3XXXXXXXXXXXX3"
                  onValueChange={v => pub("vatNumber")(v.slice(0, 15))}
                  className={inp} style={{ ...ist, ...ltr, borderColor: badVat ? "#BE2626" : B.border }} />
              </Field>
            </div>

            {/* العنوان: مصدر المدينة على كل مستند. كانت «الرياض» مكتوبةً
                في ترويسة الفاتورة والفرع في الدمّام. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <Field label="المدينة"
                hint="تُطبع على الفاتورة والتذكرة">
                <input value={form.pub.address.city} placeholder="الدمام"
                  onChange={e => addr("city")(e.target.value)}
                  className={inp} style={ist} />
              </Field>
              <Field label="العنوان">
                <input value={form.pub.address.line} placeholder="طريق الملك فهد، حي الشاطئ"
                  onChange={e => addr("line")(e.target.value)}
                  className={inp} style={ist} />
              </Field>
              <Field label="رابط الموقع على الخرائط"
                error={badMap ? mapVerdict.reason : undefined}>
                <input value={form.pub.address.mapUrl} placeholder="https://maps.app.goo.gl/…"
                  onChange={e => addr("mapUrl")(e.target.value.trim())}
                  className={inp} style={{ ...ist, ...ltr, borderColor: badMap ? "#BE2626" : B.border }} />
              </Field>
            </div>
          </Card>

          <Card title="التواصل"
            note="رقم الواتساب هو ما يفتحه الزرّ العائم في كل شاشات المستفيد.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* يُخزَّن E.164 لا كما كُتب: الرقم مفتاحُ رابط واتساب وقوالب
                  الرسائل، و«0501234567» و«+966501234567» و«966501234567»
                  ثلاث صيغ لرقمٍ واحد. التطبيع عند الحفظ لا عند العرض. */}
              <Field label="واتساب خدمة العملاء"
                hint={phoneOk ? `يُحفظ ${toE164(form.pub.supportPhone)}` : undefined}
                error={badPhone ? (phoneError(form.pub.supportPhone, { required: true, mobileOnly: true }) ?? undefined) : undefined}>
                <input value={form.pub.supportPhone} inputMode="tel" placeholder="05xxxxxxxx"
                  onChange={e => pub("supportPhone")(e.target.value.replace(/[^\d+ ]/g, "").slice(0, 18))}
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

            {/* أيام العمل — نافذةُ ساعاتٍ بلا أيام كانت تجعل العدّاد يمشي
                يوم الجمعة والمكتب مغلق. */}
            <div className="mt-4">
              <label className="block text-xs font-bold mb-2" style={{ color: B.text3 }}>أيام العمل</label>
              <div className="flex flex-wrap gap-2">
                {WEEK.map((d, i) => {
                  const on = form.pub.workDays.includes(i);
                  return (
                    <button key={i} type="button" aria-pressed={on}
                      onClick={() => pub("workDays")(
                        on ? form.pub.workDays.filter(x => x !== i)
                           : [...form.pub.workDays, i].sort((a, b) => a - b))}
                      className="px-3 py-2 rounded-xl text-sm font-bold"
                      style={{
                        border: `1px solid ${on ? B.gold : B.border}`,
                        background: on ? B.primary : "#fff",
                        color: on ? B.gold : B.text2,
                        cursor: isAdmin ? "pointer" : "not-allowed",
                      }}>{d}</button>
                  );
                })}
              </div>
              {noWorkDays && (
                <p className="text-xs font-bold mt-1" style={{ color: "#BE2626" }}>
                  اختر يوم عمل واحداً على الأقل — وإلا لا يمشي وعد الردّ أبداً.
                </p>
              )}
            </div>

            {/* الإجازات والاستثناءات */}
            <div className="mt-4">
              <Field label="الإجازات الرسمية والاستثناءات"
                hint="تواريخ بصيغة YYYY-MM-DD مفصولة بفاصلة — لا يُحتسب فيها وعد الردّ"
                error={badHolidays ? "تاريخ غير صحيح — الصيغة YYYY-MM-DD" : undefined}>
                <input value={holidayText} placeholder="2026-09-23, 2026-04-10"
                  onChange={e => setHolidayText(e.target.value)}
                  className={inp} style={{ ...ist, ...ltr, borderColor: badHolidays ? "#BE2626" : B.border }} />
              </Field>
            </div>

            {/* ── معاينة وعد الردّ ──
                الإعداد رقمٌ مجرّد حتى يُرى أثره. المعاينة تُجيب السؤال
                الذي طرحه الفريق: «متى ينتهي الوعد لطلبٍ يصل قبل الإغلاق
                وبعده؟» — بالحساب نفسه الذي يراه العميل لا بشرحٍ نصّي. */}
            <div className="mt-4 rounded-xl px-4 py-3" style={{ background: B.cream, border: "1px solid #EDE4CF" }}>
              <div className="text-xs font-extrabold mb-2" style={{ color: B.black }}>معاينة: متى ينتهي الوعد؟</div>
              <div className="flex flex-col gap-1.5">
                {slaPreview.map(r => (
                  <div key={r.label} className="flex items-baseline justify-between gap-3 text-xs">
                    <span style={{ color: B.text2 }}>{r.label}</span>
                    <span className="font-bold" style={{ color: r.late ? "#8A6A08" : B.black, fontFamily: "var(--font-app)" }}>{r.due}</span>
                  </div>
                ))}
              </div>
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

          <Card title="مكتبة مرافق الفندق"
            note="هذه القائمة هي المصدر الوحيد لرموز المرافق في نموذج الفندق. اختر اسماً واضحاً مثل «مطعم»؛ لا يحتاج الموظف إلى لصق رموز Emoji قد تختلف بين الأجهزة.">
            <div className="flex flex-col gap-2.5">
              {form.internal.hotelFeatureOptions.map((option,index)=>(
                <div key={option.id} className="flex items-center gap-2">
                  <select value={option.id} onChange={e=>{
                    const next=e.target.value as HotelFeatureIconKey;
                    /* منع تكرار الرمز: كل اسم مرتبط برمز عرض واحد واضح. */
                    if(form.internal.hotelFeatureOptions.some((row,i)=>i!==index&&row.id===next)) return;
                    updateHotelFeatureOption(index,{id:next,label:option.label||HOTEL_FEATURE_ICON_LABELS[next]});
                  }} className={inp} style={{...ist,width:170,cursor:"pointer"}}>
                    {HOTEL_FEATURE_ICON_KEYS.map(key=><option key={key} value={key}>{HOTEL_FEATURE_ICON_LABELS[key]}</option>)}
                  </select>
                  <input value={option.label} onChange={e=>updateHotelFeatureOption(index,{label:e.target.value})}
                    placeholder="الاسم الظاهر" className={inp} style={ist}/>
                  <button type="button" aria-label={`حذف ${option.label}`} title="حذف من مكتبة المرافق"
                    disabled={form.internal.hotelFeatureOptions.length===1} onClick={()=>removeHotelFeatureOption(option.id)}
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{background:"#FBE6E6",border:"1px solid #F3C9C9",color:"#BE2626",opacity:form.internal.hotelFeatureOptions.length===1?.45:1,cursor:form.internal.hotelFeatureOptions.length===1?"not-allowed":"pointer"}}><X size={15}/></button>
                </div>
              ))}
              <button type="button" onClick={addHotelFeatureOption} disabled={form.internal.hotelFeatureOptions.length>=HOTEL_FEATURE_ICON_KEYS.length}
                className="self-start flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold"
                style={{background:B.bg,border:`1px solid ${B.border}`,color:"#8a6a08",cursor:form.internal.hotelFeatureOptions.length>=HOTEL_FEATURE_ICON_KEYS.length?"not-allowed":"pointer",opacity:form.internal.hotelFeatureOptions.length>=HOTEL_FEATURE_ICON_KEYS.length?.55:1}}><Plus size={13}/>إضافة مرفق معتمد</button>
            </div>
          </Card>
        </fieldset>

        {/* السجلّ والأرشيف للقراءة والإجراء المباشر، فهما خارج fieldset الكتابة. */}
        <ArchivePanel />
        <AuditLog />
      </main>

      {/* ── شريط الحفظ ──
          كان لا يظهر إلا بعد أول تعديل، فالفريق فتح الصفحة ولم يجد زرّ
          حفظ أصلاً («لا يظهر فيها زر حفظ ضمن الجزء الظاهر»). الغياب
          يُقرأ «هذه شاشة عرض» لا «لا تغييرات بعد».

          الآن مثبَّت دائماً لمدير النظام، ويقول حالته: «كل التغييرات
          محفوظة» ساكناً، أو «لديك تغييرات لم تُحفظ» بارزاً. والزرّ يُعطَّل
          حين لا شيء يُحفَظ — حاضرٌ ليُعرَف مكانه، لا ليُضغط بلا أثر. */}
      {isAdmin && (
        <div
          className="fixed bottom-0 inset-x-0 md:right-64 z-40 flex items-center justify-between gap-3 px-4 md:px-8 py-3"
          style={{
            background: "#fff",
            borderTop: `1px solid ${dirty ? (blocked ? "#F3C9C9" : B.gold) : B.border}`,
            boxShadow: dirty ? "0 -6px 24px -12px rgba(0,0,0,.2)" : "none",
          }}>
          <span className="text-sm font-bold flex items-center gap-2"
            style={{ color: blocked ? "#BE2626" : dirty ? B.text2 : B.muted }}>
            {!dirty && <Check size={14} style={{ color: "#1E7A44" }} />}
            {blocked ? "صحّح الحقول المعلَّمة قبل الحفظ"
              : dirty ? "لديك تغييرات لم تُحفظ"
              : "كل التغييرات محفوظة"}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => setForm(saved)} disabled={busy || !dirty}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold"
              style={{
                background: "#fff", border: `1px solid ${B.border}`,
                color: dirty ? B.text2 : B.muted,
                cursor: dirty && !busy ? "pointer" : "not-allowed",
              }}>
              <RotateCcw size={14} />تراجع
            </button>
            <button onClick={submit} disabled={busy || blocked || !dirty}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold"
              style={{
                background: dirty && !blocked ? B.gold : "#EEECEA",
                color: dirty && !blocked ? B.black : B.muted,
                border: "none",
                cursor: dirty && !blocked && !busy ? "pointer" : "not-allowed",
              }}>
              {busy ? <Spinner size={14} color={B.black} /> : <Save size={14} />}حفظ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
