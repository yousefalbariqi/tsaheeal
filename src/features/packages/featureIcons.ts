/* بنوك أيقونات الباقة — بنكان لا واحد، لأنهما شيئان مختلفان:

   أيقونة مرحلة البرنامج رمزٌ تعبيري (emoji) يُخزَّن نصّاً في العمود
   ويُرسم كما هو في صفحة المستفيد (Listing › s.icon). فلا يجوز تحويله
   إلى مفتاح لوسيد: ذلك يكسر كل مرحلةٍ مكتوبة اليوم. البنك يتّسع أفقياً
   — رموزٌ أكثر مصنّفة — ولا يتغيّر نوعه.

   وأيقونة الميزة مفتاحٌ يُترجَم إلى رسمة لوسيد في اللوحة. صفحة المستفيد
   لا تعتمد عليه أصلاً (تختار الرسمة من نصّ الميزة)، فتقليص البنك هنا لا
   يمسّ ما يراه العميل. عشرة خيارات وخيار «بلا أيقونة» — والقديم يُترجَم
   بخريطة الأسماء البديلة بدل أن يظهر فارغاً. */
import type { LucideIcon } from "lucide-react";
import {
  Armchair, BookOpen, Building2, Bus, MapPin, Plane, ShieldCheck,
  UtensilsCrossed, Users, Wifi,
} from "lucide-react";

/* ═══════════ مراحل البرنامج ═══════════════════════════════════════ */

export interface StageIcon { icon: string; label: string }
export interface StageIconGroup { group: string; items: readonly StageIcon[] }

/** مصنّف بالمعنى لا بالشكل: الموظف يبحث عن «الرجوع» لا عن «سهم لليسار».
    التوسعة مستقبلاً سطرٌ في المجموعة المناسبة، بلا مساس بالشفرة. */
export const PROGRAM_STAGE_CATALOG: readonly StageIconGroup[] = [
  { group: "التنقّل", items: [
    { icon:"🚌", label:"حافلة" },        { icon:"🚐", label:"نقل داخلي" },
    { icon:"✈️", label:"طيران" },        { icon:"🛫", label:"الإقلاع" },
    { icon:"🛬", label:"الوصول" },       { icon:"🚕", label:"سيارة" },
    { icon:"🚉", label:"محطة" },         { icon:"🛣️", label:"الطريق" },
    { icon:"🔙", label:"الرجوع" },       { icon:"🧭", label:"الاتجاه" },
  ]},
  { group: "المشاعر والزيارات", items: [
    { icon:"🕋", label:"مكة والحرم" },   { icon:"🕌", label:"المسجد النبوي" },
    { icon:"🤲", label:"الدعاء" },       { icon:"📿", label:"الذكر" },
    { icon:"🏛️", label:"معلم تاريخي" },  { icon:"🗺️", label:"جولة" },
    { icon:"⛰️", label:"جبل" },          { icon:"🕯️", label:"قيام الليل" },
  ]},
  { group: "السكن والأمتعة", items: [
    { icon:"🏨", label:"فندق" },         { icon:"🛏️", label:"راحة" },
    { icon:"🔑", label:"تسجيل الدخول" }, { icon:"🚪", label:"المغادرة" },
    { icon:"🧳", label:"الأمتعة" },      { icon:"🎒", label:"حقيبة" },
  ]},
  { group: "الضيافة", items: [
    { icon:"🍽️", label:"وجبة" },         { icon:"🍱", label:"وجبة خفيفة" },
    { icon:"☕", label:"قهوة" },         { icon:"🥤", label:"مشروبات" },
    { icon:"💧", label:"ماء" },          { icon:"🍯", label:"ضيافة" },
  ]},
  { group: "التنظيم والوقت", items: [
    { icon:"👥", label:"التجمّع" },      { icon:"🧑‍🏫", label:"المرشد" },
    { icon:"📋", label:"تعليمات" },      { icon:"⏰", label:"موعد" },
    { icon:"🌙", label:"ليلاً" },        { icon:"☀️", label:"صباحاً" },
    { icon:"📸", label:"تصوير" },        { icon:"ℹ️", label:"معلومة" },
    { icon:"✅", label:"إنهاء" },        { icon:"⭐", label:"مميّز" },
  ]},
];

export const DEFAULT_STAGE_ICON = "🕋";

const STAGE_BY_ICON = new Map(
  PROGRAM_STAGE_CATALOG.flatMap(g => g.items).map(item => [item.icon, item.label]),
);

/** الرمز المكتوب في بيانات قديمة وليس في البنك يُعرض كما هو بلا اسم:
    الأولى أن تبقى مرحلته برمزها من أن يُستبدل بشيء لم يختره أحد. */
export const stageIconLabel = (icon?: string): string => STAGE_BY_ICON.get(icon ?? "") ?? "";

/* ═══════════ مميزات الباقة ════════════════════════════════════════ */

export interface PkgFeatureIcon { id: string; label: string; Icon: LucideIcon | null }

/** عشرة رموزٍ تكفي ما تَعِد به باقة عمرة، وخيار «بلا أيقونة» لمن لا
    يجد ما يطابق — أهون من رسم أيقونة لكل ميزة. */
export const PKG_FEATURE_CATALOG: readonly PkgFeatureIcon[] = [
  { id:"none",       label:"بدون أيقونة",   Icon:null },
  { id:"guide",      label:"مرشد ديني",     Icon:BookOpen },
  { id:"meal",       label:"ضيافة / وجبة",  Icon:UtensilsCrossed },
  { id:"supervisor", label:"مشرف",          Icon:Users },
  { id:"transport",  label:"مواصلات",       Icon:Bus },
  { id:"flight",     label:"طيران",         Icon:Plane },
  { id:"hotel",      label:"سكن / فندق",    Icon:Building2 },
  { id:"seat",       label:"مقاعد مريحة",   Icon:Armchair },
  { id:"wifi",       label:"واي فاي",       Icon:Wifi },
  { id:"vip",        label:"خدمة VIP",      Icon:ShieldCheck },
  { id:"location",   label:"موقع مميز",     Icon:MapPin },
];

export const DEFAULT_PKG_FEATURE_ICON = "none";

/** البنك القديم كان أربعة عشر مفتاحاً. ما سقط منه يُترجَم إلى أقرب
    باقٍ، وما لا مقابل له يصير «بلا أيقونة» — لا مفتاحٌ يُرسم فراغاً. */
const PKG_FEATURE_ALIASES: Record<string, string> = {
  check: "none", coffee: "meal", view: "location", ticket: "none",
};

const PKG_FEATURE_BY_ID = new Map(PKG_FEATURE_CATALOG.map(item => [item.id, item]));

const resolve = (id?: string): PkgFeatureIcon =>
  PKG_FEATURE_BY_ID.get(id ?? "")
  ?? PKG_FEATURE_BY_ID.get(PKG_FEATURE_ALIASES[id ?? ""] ?? "")
  ?? PKG_FEATURE_BY_ID.get("none")!;

/** الرسمة، أو null لميزةٍ بلا أيقونة — النصّ وحده يظهر حينئذ. */
export const pkgFeatureIcon = (id?: string): LucideIcon | null => resolve(id).Icon;

/** المفتاح بعد ترجمة الاسم البديل — كي يُبرز المنتقي الخيار الصحيح. */
export const pkgFeatureKey = (id?: string): string => resolve(id).id;
