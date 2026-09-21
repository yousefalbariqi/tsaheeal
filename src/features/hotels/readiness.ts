/* اكتمال بيانات الفندق — سؤالٌ واحد: «هل هذا الصفّ مكتمل التعريف؟»

   كان هذا الملف يجيب سؤالاً أكبر: «هل يصلح الفندق للنشر؟» — وكان يقيس
   الغرف وأسعارها وصورها، ويمنع التفعيل بنواقصها. ثم انتقل كل ما هو
   تشغيليٌّ وتسعيري إلى الباقة: الغرف وأسعارها وسعتها تُدار في
   features/packages، والفندق بقي بطاقة تعريف — اسمٌ وحيٌّ وموقعٌ وصورٌ
   وآراء.

   فما بقي هنا تنبيهٌ لا حارس: قائمةُ ما ينقص تُعرض على البطاقة ليُكمَل،
   ولا تمنع تفعيلاً ولا حفظاً. الفندق الناقص لا يضرّ العميل — الباقة هي
   ما يُباع، وحراسها في features/packages/readiness.ts. */
import type { Hotel, HotelStatus } from "@/types";
import { cleanHotelName } from "@/lib/hotelName";

/* ═══ الصور ════════════════════════════════════════════════════════ */

/** غلاف الفندق: أوّل صورةٍ موسومة غلافاً، وإلّا أوّل صورة. */
export function hotelCover(h: Pick<Hotel, "media">): string | undefined {
  const media = (h.media ?? []).filter(m => m.kind === "image" && !!m.url);
  return (media.find(m => m.primary) ?? media[0])?.url;
}

/** رابط موقعٍ يبدو موقعاً فعلاً. لا نتحقّق من صحّة الإحداثيات — لكن
    «قريب من الحرم» في حقل الرابط ليست رابطاً. */
export const isMapUrl = (raw?: string): boolean =>
  /^https?:\/\/[^\s]+$/i.test((raw ?? "").trim());

/* ═══ ما ينقص ══════════════════════════════════════════════════════ */

export interface Check {
  key: string;
  /** ما ينقص، بصيغة ما يفعله الموظف لا بصيغة الخطأ. */
  label: string;
  ok: boolean;
}

export function hotelChecks(h: Hotel): Check[] {
  return [
    { key: "name",     label: "الاسم",          ok: !!cleanHotelName(h.name) },
    { key: "cover",    label: "صورة",           ok: !!hotelCover(h) },
    { key: "district", label: "الحي",           ok: !!(h.district ?? "").trim() },
    { key: "map",      label: "رابط الخرائط",   ok: isMapUrl(h.mapUrl) },
    { key: "features", label: "مرفق واحد",      ok: (h.features ?? []).length > 0 },
  ];
}

export interface Readiness {
  checks: Check[];
  /** ما نقص — يُعرض ليُكمَل، ولا يمنع شيئاً. */
  missing: Check[];
  cover?: string;
}

export function hotelReadiness(h: Hotel): Readiness {
  const checks = hotelChecks(h);
  return { checks, missing: checks.filter(c => !c.ok), cover: hotelCover(h) };
}

/* ═══ الحالة ═══════════════════════════════════════════════════════ */

/** الحالة التي يراها العميل — المتوقف محجوب حتى يُفعَّل.
    قرارٌ تشغيليٌّ بضغطةٍ من البطاقة (كما في المواصلات)، لا حقلٌ في
    النموذج ولا شرطٌ تُقاس به البيانات. */
export const isPublished = (s: HotelStatus): boolean => s === "active";

/** فنادق تصلح للربط بباقةٍ منشورة — يقرؤها نموذج الباقة، كي لا تُربط
    باقةٌ نشطة بفندقٍ متوقّف فيراه العميل سكناً محجوباً. */
export const linkableHotels = (hotels: Hotel[]): Hotel[] => hotels.filter(h => isPublished(h.status));
