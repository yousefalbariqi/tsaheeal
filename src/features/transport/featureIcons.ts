import type { LucideIcon } from "lucide-react";
import {
  Accessibility, Armchair, Baby, BellRing, BusFront, CarFront, Clock3, Coffee,
  CupSoda, Droplets, HeartPulse, Languages, Lightbulb, Luggage, Navigation,
  PlugZap, Sandwich, ShieldCheck, Snowflake, Sparkles, Sun, Toilet, Tv, Usb,
  Utensils, Volume2, Wifi,
} from "lucide-react";

/** تجهيزات الحافلة — رموزٌ يعرفها الراكب من شكلها وحده.

    القائمة السابقة حملت واحداً وخمسين رمزاً، فيها «مقياسٌ» يعني مراقبة
    السرعة و«موجاتٌ» تعني مبرّد مياه و«وقودٌ» يعني وقوداً كافياً. الموظف
    كان يرى شبكةً من الخطوط المتشابهة فيختار على التخمين، والمعتمر يرى
    نتيجة التخمين. فالباقي هنا ما يُقرأ في لمحة: مكيّفٌ ثلجةٌ، ومياهٌ
    قطرةٌ، ودورةُ مياهٍ مقعدها. وما يحتاج شرحاً لا يصلح رمزاً.

    والنص يكتبه الموظف لكل تجهيزة كما في الفنادق؛ الرمز يفتح السطر
    واللفظ يبقى ملكه. */
export const TRANSPORT_FEATURE_CATALOG: ReadonlyArray<{ id: string; label: string; Icon: LucideIcon }> = [
  { id:"ac",         label:"تكييف",                Icon:Snowflake },
  { id:"wifi",       label:"واي فاي",              Icon:Wifi },
  { id:"screen",     label:"شاشات ترفيه",          Icon:Tv },
  { id:"audio",      label:"نظام صوتي",            Icon:Volume2 },
  { id:"charge",     label:"منافذ شحن",            Icon:PlugZap },
  { id:"usb",        label:"منفذ USB",             Icon:Usb },
  { id:"seat",       label:"مقاعد مريحة",          Icon:Armchair },
  { id:"wc",         label:"دورة مياه",            Icon:Toilet },
  { id:"luggage",    label:"مساحة أمتعة",          Icon:Luggage },
  { id:"meal",       label:"وجبات",                Icon:Utensils },
  { id:"snack",      label:"وجبة خفيفة",           Icon:Sandwich },
  { id:"coffee",     label:"قهوة وشاي",            Icon:Coffee },
  { id:"drink",      label:"مشروبات",              Icon:CupSoda },
  { id:"water",      label:"مياه",                 Icon:Droplets },
  { id:"lighting",   label:"إضاءة قراءة",          Icon:Lightbulb },
  { id:"sunshade",   label:"ستائر شمسية",          Icon:Sun },
  { id:"safety",     label:"أحزمة وسلامة",         Icon:ShieldCheck },
  { id:"first_aid",  label:"إسعافات أولية",        Icon:HeartPulse },
  { id:"accessible", label:"ملائمة لذوي الإعاقة",  Icon:Accessibility },
  { id:"baby",       label:"ملائمة للعائلات",      Icon:Baby },
  { id:"driver",     label:"سائق محترف",           Icon:CarFront },
  { id:"bus",        label:"حافلة حديثة",          Icon:BusFront },
  { id:"clock",      label:"التزام بالمواعيد",     Icon:Clock3 },
  { id:"navigation", label:"تتبع الرحلة",          Icon:Navigation },
  { id:"language",   label:"خدمة بلغات",           Icon:Languages },
  { id:"bell",       label:"طلب مساعدة",           Icon:BellRing },
  { id:"other",      label:"خدمة إضافية",          Icon:Sparkles },
];

/* المركبات المحفوظة تحمل رموزاً من القائمة القديمة. لو تُركت بلا ترجمة
   لعادت كلها «نجمةً» عند أول فتح، فيبدو أن البيانات ضاعت وهي موجودة.
   فكل رمزٍ مُزال يُشار إلى أقرب معنىً باقٍ، والموظف يغيّره إن شاء. */
const LEGACY_ALIASES: Readonly<Record<string, string>> = {
  battery:"charge", cable:"charge", contactless:"charge", power:"charge",
  bluetooth:"audio", headphones:"audio", radio:"audio", monitor:"screen",
  microwave:"meal", cooler:"water", waves:"water", wine:"drink",
  heater:"ac", airflow:"ac", fan:"ac", thermometer:"ac",
  night:"lighting", sun:"sunshade",
  map:"navigation", gauge:"driver", fuel:"driver", camera:"safety",
  parking:"bus", door:"accessible", package:"luggage",
  card:"other", ticket:"other",
};

const BY_ID = new Map(TRANSPORT_FEATURE_CATALOG.map(item => [item.id, item]));
const resolve = (id?: string) => BY_ID.get(LEGACY_ALIASES[id ?? ""] ?? id ?? "");

export const transportFeatureIcon = (id?: string): LucideIcon => resolve(id)?.Icon ?? Sparkles;
export const transportFeatureLabel = (id?: string): string => resolve(id)?.label ?? "خدمة الحافلة";
