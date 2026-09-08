/* جاهزية المواصلة — مصدر حقيقةٍ واحد لسؤال «هل تصلح هذه المركبة للتشغيل؟».

   أربع ملاحظاتٍ من الفريق جذرها واحد: المركبة الجديدة تبدأ «نشطة ومتاحة»
   قبل إدخال بياناتها، وتكلفة المقعد تبدأ صفراً ولا شيء يمنع الحفظ، وبيانات
   الحافلة النظامية غير موجودة أصلاً، وحقول الطيران هي حقول الحافلة نفسها.
   أربعتها سؤالٌ واحد لم يكن أحدٌ يسأله.

   بُنيت على نمط features/hotels/readiness.ts حرفاً بحرف — نفس أنواع Check
   و Readiness ونفس معنى blocking — وهي الكيان الثالث الذي وعدت به تلك:
   «إضافة الكيان الثالث (النقل) نسخاً لا تفكيراً من جديد».

   ── لماذا تختلف الشروط بحسب الوسيلة ──

   الحافلة والطيران ليسا نوعين من شيءٍ واحد: لوحةُ الحافلة ورخصةُ النقل
   والفحصُ الدوري لا معنى لها في مقعد طيران، ورقمُ الرحلة والمطارُ لا معنى
   لهما في حافلة. فالقائمة تتفرّع من `mode` لا تُجمَع ثم تُخفى — شرطٌ
   مخفيٌّ يمنع التفعيل بلا سببٍ ظاهر أسوأ من شرطٍ غائب. */
import type { Transport, VehicleStatus } from "@/types";
import { isValidPhone } from "@/lib/phone";

/** التبويب الذي يُصلَح فيه النقص — قائمة النواقص تقفز إليه. */
export type TrTab = "info" | "features" | "media" | "reviews";

export interface Check {
  key: string;
  /** ما ينقص، بصيغة ما يفعله الموظف لا بصيغة الخطأ. */
  label: string;
  ok: boolean;
  tab: TrTab;
  /** يمنع التفعيل — لا مجرّد نقصٍ في النسبة. */
  blocking: boolean;
}

/** صورة الغلاف: أوّل صورةٍ موسومة أساسيةً، وإلّا أوّل صورة. */
export function transportCover(t: Pick<Transport, "media">): string | undefined {
  const media = (t.media ?? []).filter(m => m.kind === "image" && !!m.url);
  return (media.find(m => m.primary) ?? media[0])?.url;
}

/** هل التاريخ في المستقبل؟ الوثيقة المنتهية كالوثيقة الغائبة. */
export const notExpired = (ymd?: string): boolean => {
  const v = (ymd ?? "").trim();
  if (!v) return false;
  const n = new Date(); n.setHours(0, 0, 0, 0);
  const [y, m, d] = v.split("-").map(Number);
  return !!y && !!m && !!d && new Date(y, m - 1, d) >= n;
};

/** وثائق تنتهي خلال ٣٠ يوماً — تحذيرٌ قبل أن تصير مانعاً. */
export function expiringSoon(t: Transport): { label: string; date: string }[] {
  const soon = new Date(); soon.setHours(0, 0, 0, 0); soon.setDate(soon.getDate() + 30);
  const rows: [string, string | undefined][] = [
    ["التأمين", t.insuranceExpiry], ["الفحص الدوري", t.inspectionExpiry],
    ["الاستمارة", t.registrationExpiry], ["رخصة النقل", t.transportLicenseExpiry],
  ];
  return rows.flatMap(([label, v]) => {
    if (!notExpired(v)) return [];
    const [y, m, d] = v!.split("-").map(Number);
    return new Date(y, m - 1, d) <= soon ? [{ label, date: v! }] : [];
  });
}

export function transportChecks(t: Transport): Check[] {
  const bus = t.mode === "bus";
  const list: Check[] = [
    { key: "name",  label: "اسم المركبة",            ok: !!(t.name ?? "").trim(),  tab: "info", blocking: true },
    { key: "seats", label: "عدد مقاعد أكبر من صفر",  ok: (t.seats ?? 0) > 0,       tab: "info", blocking: true },
    /* تكلفة المقعد صفراً ليست «مجّاناً» بل صفٌّ لم يُملأ. وهي أساس تسعير
       الباقة، فمركبةٌ بصفر تُنتج ربحاً وهمياً في كل حسابٍ تدخله. */
    { key: "cost",  label: "تكلفة المقعد أكبر من صفر", ok: (t.seatCost ?? 0) > 0,   tab: "info", blocking: true },
  ];

  if (bus) {
    list.push(
      { key: "plate",    label: "رقم اللوحة",                 ok: !!(t.plate ?? "").trim(),      tab: "info", blocking: true },
      { key: "serial",   label: "الرقم التسلسلي / التعريفي",  ok: !!(t.serialNo ?? "").trim(),   tab: "info", blocking: true },
      { key: "operator", label: "شركة التشغيل",               ok: !!(t.operator ?? "").trim(),   tab: "info", blocking: true },
      /* الأربع النظامية تمنع التفعيل لا التعبئة: تشغيل حافلةٍ بتأمينٍ
         منتهٍ أو فحصٍ منتهٍ مخالفةٌ نظامية قبل أن يكون خطأ بيانات. */
      { key: "insurance",  label: "تأمين ساري",        ok: notExpired(t.insuranceExpiry),         tab: "info", blocking: true },
      { key: "inspection", label: "فحص دوري ساري",     ok: notExpired(t.inspectionExpiry),        tab: "info", blocking: true },
      { key: "form",       label: "استمارة سارية",     ok: notExpired(t.registrationExpiry),      tab: "info", blocking: true },
      { key: "license",    label: "رخصة نقل سارية",    ok: notExpired(t.transportLicenseExpiry),  tab: "info", blocking: true },
      { key: "model",      label: "الشركة / الموديل",  ok: !!(t.model ?? "").trim(),              tab: "info", blocking: false },
      { key: "year",       label: "سنة التصنيع",       ok: !!(t.year ?? "").trim(),               tab: "info", blocking: false },
    );
  } else {
    list.push(
      { key: "carrier", label: "الناقل الجوّي",          ok: !!(t.model ?? "").trim(),         tab: "info", blocking: true },
      { key: "flightNo",label: "رقم الرحلة",             ok: !!(t.flightNo ?? "").trim(),      tab: "info", blocking: true },
      { key: "from",    label: "مطار المغادرة",          ok: !!(t.fromAirport ?? "").trim(),   tab: "info", blocking: true },
      { key: "to",      label: "مطار الوصول",            ok: !!(t.toAirport ?? "").trim(),     tab: "info", blocking: true },
      { key: "times",   label: "موعدا الإقلاع والوصول",  ok: !!(t.departTime ?? "").trim() && !!(t.arriveTime ?? "").trim(), tab: "info", blocking: true },
      { key: "cabin",   label: "درجة المقصورة",          ok: !!(t.cabinClass ?? "").trim(),    tab: "info", blocking: false },
      { key: "baggage", label: "حدّ الأمتعة",            ok: !!(t.baggage ?? "").trim(),       tab: "info", blocking: false },
    );
  }

  list.push(
    { key: "cover",      label: "صورة أساسية",           ok: !!transportCover(t),                tab: "media",    blocking: false },
    { key: "features",   label: "ميزة واحدة على الأقل",   ok: (t.features ?? []).length > 0,      tab: "features", blocking: false },
    { key: "supervisor", label: "المشرف",                ok: !!(t.supervisor ?? "").trim(),      tab: "info",     blocking: false },
    { key: "phone",      label: "رقم تواصل المشغّل",      ok: isValidPhone(t.operatorPhone ?? ""), tab: "info",    blocking: false },
  );
  return list;
}

export interface Readiness {
  checks: Check[];
  blockers: Check[];
  warnings: Check[];
  /** 0..100 — نسبة الشروط المستوفاة. */
  percent: number;
  canActivate: boolean;
  cover?: string;
  expiring: { label: string; date: string }[];
}

export function transportReadiness(t: Transport): Readiness {
  const checks = transportChecks(t);
  const done = checks.filter(c => c.ok).length;
  const blockers = checks.filter(c => !c.ok && c.blocking);
  return {
    checks, blockers,
    warnings: checks.filter(c => !c.ok && !c.blocking),
    percent: checks.length ? Math.round((done / checks.length) * 100) : 0,
    canActivate: blockers.length === 0,
    cover: transportCover(t),
    expiring: expiringSoon(t),
  };
}

/** عدد نواقص كل تبويب — الرقم داخل اسم التبويب لا بجانبه في مكانٍ آخر. */
export function gapsByTab(t: Transport): Record<TrTab, number> {
  const out: Record<TrTab, number> = { info: 0, features: 0, media: 0, reviews: 0 };
  for (const c of transportChecks(t)) if (!c.ok) out[c.tab]++;
  return out;
}

/** الحالة التي تعني «تعمل فعلاً». المسودة والمتوقفة محجوبتان، والفرق
    بينهما نيّةٌ لا أثر: المسودة لم تُعتمد بعد، والمتوقفة اعتُمدت ثم أُوقفت. */
export const isOperational = (s: VehicleStatus): boolean => s === "active";

/** مركبات تصلح للربط بباقة — يقرؤها نموذج الباقة ونموذج إطلاق الرحلة.
    بلا هذه الدالّة يبقى الخلل قائماً: الباقة تُربط بمسودةٍ فتُطلق رحلةً
    بسعةِ مركبةٍ لم تُعتمد. */
export const linkableTransports = (rows: Transport[]): Transport[] => rows.filter(t => isOperational(t.status));
