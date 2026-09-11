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

export function transportChecks(t: Transport): Check[] {
  const list: Check[] = [
    { key: "name",  label: "اسم المركبة",            ok: !!(t.name ?? "").trim(),  tab: "info", blocking: true },
  ];

  /* الطيران هنا مجرد خيار نقل يُعرض ضمن الباقة؛ لا ندير مقاعده أو سعره
     أو تشغيله التفصيلي من تساهيل. الحافلة وحدها تدخل حساب سعة الباقات. */
  if (t.mode === "bus") {
    list.push(
      { key: "seats", label: "عدد مقاعد أكبر من صفر",  ok: (t.seats ?? 0) > 0,       tab: "info", blocking: true },
      { key: "cost",  label: "تكلفة المقعد أكبر من صفر", ok: (t.seatCost ?? 0) > 0,   tab: "info", blocking: true },
    );
  }

  list.push(
    { key: "cover",      label: "صورة أساسية",           ok: !!transportCover(t),                tab: "media",    blocking: false },
    { key: "features",   label: "ميزة واحدة على الأقل",   ok: (t.features ?? []).length > 0,      tab: "features", blocking: false },
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
    expiring: [],
  };
}

/** عدد نواقص كل تبويب — الرقم داخل اسم التبويب لا بجانبه في مكانٍ آخر. */
export function gapsByTab(t: Transport): Record<TrTab, number> {
  const out: Record<TrTab, number> = { info: 0, features: 0, media: 0, reviews: 0 };
  for (const c of transportChecks(t)) if (!c.ok) out[c.tab]++;
  return out;
}

/** الحالة التي تعني «تعمل فعلاً». المتوقفة محجوبة عن العميل حتى تُفعّل. */
export const isOperational = (s: VehicleStatus): boolean => s === "active";

/** مركبات تصلح للربط بباقة — يقرؤها نموذج الباقة ونموذج إطلاق الرحلة.
    بلا هذه الدالّة يبقى الخلل قائماً: الباقة تُربط بمواصلة متوقفة فتُطلق رحلةً
    بسعةِ مركبةٍ لم تُعتمد. */
export const linkableTransports = (rows: Transport[]): Transport[] => rows.filter(t => isOperational(t.status));
