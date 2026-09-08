/* جاهزية الباقة — مصدر حقيقة واحد لكل سؤال «هل تصلح هذه الباقة للنشر؟».

   قبلها كان كل شرط يعيش في مكانه: صفحة المستفيد تحسب «يبدأ من» بطريقة،
   ولوحة الإدارة تعرض رقماً آخر، ولا أحد يمنع باقةً نشطة بلا فندق ولا
   برنامج ولا سعر. النتيجة التي رآها الفريق: «رحلة الحرمين» نشطة تعرض
   «يبدأ من 0 ر.س»، وباقة نشطة بلا مراحل، وأخرى بلا غرف.

   وحدة نقيّة بلا React: تُستدعى من نموذج الإضافة ومن صفحة التفاصيل ومن
   جدول الباقات ومن شاشة المستفيد على السواء، فلا يتفرّق الشرط نسختين. */
import type { Pkg } from "@/types";

/** التبويب الذي يُصلَح فيه النقص — الرابط في قائمة النواقص يقفز إليه. */
export type PkgTab = "info" | "program" | "rooms" | "features" | "policies" | "reviews" | "settings";

/* ═══ السعر ═══════════════════════════════════════════════════════ */

/** فئة صالحة للبيع: نوع مسمّى، وسعة موجبة، وسعر ليلة موجب.
    صفٌّ بسعر صفر ليس «مجّاناً» بل صفٌّ لم يُملأ بعد — ولو دخل الحساب
    لأنتج «يبدأ من 0» وهو ما اشتكى منه الفريق حرفياً. */
export const isSellableTier = (r: { type?: string; persons?: number; perNight?: number }): boolean =>
  !!(r?.type ?? "").trim() && (r?.persons ?? 0) > 0 && (r?.perNight ?? 0) > 0;

/** السعر الظاهر «يبدأ من» قرارٌ يدوي لصاحب الباقة، مستقل عن الغرف والنقل. */
export function startingPrice(p: Pick<Pkg, "marketPrice">): number {
  return Math.max(0, p.marketPrice || 0);
}

/* ═══ قواعد الجاهزية ═══════════════════════════════════════════════ */

/** هل تشمل الباقة سكناً؟ يُشتقّ من الليالي لا من علمٍ منفصل:
    الليالي هي ما يضرب سعر السكن في الحساب، فباقة بصفر ليالٍ لا سكن
    فيها بحكم المعادلة نفسها — ولا حاجة لعمودٍ جديد يتعارض معها. */
export const includesHousing = (p: Pick<Pkg, "nights">): boolean => (p.nights ?? 0) > 0;

/** مراحل البرنامج الظاهرة للمستفيد — المؤرشفة لا تُعدّ. */
export const liveStages = (p: Pick<Pkg, "program">) => (p.program ?? []).filter(s => !s.archived);

export interface Check {
  key: string;
  /** ما ينقص، بصيغة ما يفعله الموظف لا بصيغة الخطأ. */
  label: string;
  ok: boolean;
  tab: PkgTab;
  /** يمنع الحالة «نشطة» — لا مجرّد نقص في النسبة. */
  blocking: boolean;
}

/** كل شروط الباقة مرتّبة كما تُملأ: الأساسي ثم التسعير ثم المحتوى. */
export function packageChecks(p: Pkg): Check[] {
  const housing = includesHousing(p);
  const tiers = (p.roomPrices ?? []).filter(isSellableTier);
  const list: Check[] = [
    { key: "name",     label: "اسم الباقة",                     ok: !!p.name.trim(),              tab: "info",     blocking: true },
    { key: "cover",    label: "الصورة الأساسية",                 ok: !!p.coverImage,               tab: "info",     blocking: true },
    { key: "program",  label: "مرحلة برنامج واحدة على الأقل",     ok: liveStages(p).length > 0,     tab: "program",  blocking: true },
  ];
  if (housing) {
    list.push(
      { key: "hotel",  label: "ربط الفندق (الباقة تشمل سكناً)",   ok: !!p.hotelId,                 tab: "info",  blocking: true },
      { key: "rooms",  label: "خيار غرفة واحد على الأقل بسعر",    ok: tiers.length > 0,            tab: "rooms", blocking: true },
    );
  }
  if (p.transportOnlyEnabled) {
    list.push(
      { key: "transportOnlyPrice", label: "سعر مواصلات فقط أكبر من صفر", ok: (p.transportOnlyPrice ?? 0) > 0, tab: "rooms", blocking: true },
      { key: "transportOnlyTransport", label: "ربط مواصلة لخيار مواصلات فقط", ok: !!p.transportId, tab: "info", blocking: true },
    );
  }
  list.push(
    { key: "price",    label: "السعر يبدأ من أكبر من صفر",        ok: startingPrice(p) > 0,         tab: "rooms",    blocking: true },
    { key: "transport",label: "ربط المواصلة",                    ok: !!p.transportId,              tab: "info",     blocking: false },
    { key: "features", label: "مميزة واحدة على الأقل",           ok: (p.features ?? []).length > 0,tab: "features", blocking: false },
    { key: "policies", label: "سياسة واحدة على الأقل",           ok: (p.policies ?? []).length > 0 && p.policies.some(x => x.trim()), tab: "policies", blocking: false },
    { key: "gallery",  label: "صورة فرعية واحدة على الأقل",       ok: (p.gallery ?? []).length > 0, tab: "info",     blocking: false },
    { key: "audience", label: "الفئة المستهدفة",                 ok: !!(p.audience ?? "").trim(),  tab: "info",     blocking: false },
  );
  return list;
}

export interface Readiness {
  checks: Check[];
  /** ما نقص ويمنع النشر. */
  blockers: Check[];
  /** ما نقص ولا يمنع — يُعرض ليُكمَل. */
  warnings: Check[];
  /** 0..100 — نسبة الشروط المستوفاة من مجموعها. */
  percent: number;
  canActivate: boolean;
  housing: boolean;
  startsFrom: number;
}

export function readiness(p: Pkg): Readiness {
  const checks = packageChecks(p);
  const done = checks.filter(c => c.ok).length;
  const blockers = checks.filter(c => !c.ok && c.blocking);
  return {
    checks,
    blockers,
    warnings: checks.filter(c => !c.ok && !c.blocking),
    percent: checks.length ? Math.round((done / checks.length) * 100) : 0,
    canActivate: blockers.length === 0,
    housing: includesHousing(p),
    startsFrom: startingPrice(p),
  };
}

/** الحالات التي تُعرض للمستفيد — النشر بمعناه الفعلي. */
export const isPublished = (s: Pkg["status"]): boolean => s === "active";
