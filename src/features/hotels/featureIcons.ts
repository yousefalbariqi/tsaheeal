import type { LucideIcon } from "lucide-react";
import {
  Accessibility, AirVent, Armchair, Baby, BatteryCharging, BellRing, Bluetooth,
  BusFront, Cable, Camera, CarFront, CircleParking, Clock3, Coffee, CreditCard,
  CupSoda, DoorOpen, Droplets, Fan, Fuel, Gauge, Headphones, HeartPulse, Heater,
  Languages, Lightbulb, Luggage, Microwave, Monitor, MoonStar, Navigation,
  PackageCheck, PlugZap, Radio, Sandwich, ShieldCheck, Snowflake, Sparkles, Sun,
  Thermometer, Ticket, Toilet, Tv, Usb, Utensils, Volume2, Waves, Wifi, Wine, Zap,
} from "lucide-react";

/** مكتبة مرئية لمرافق الفندق. المعرض يرسم الرموز وحدها؛ والنص يكتبه الموظف
    لكل مرفق ليصف ما يقدمه الفندق فعلاً، لا اسماً مفروضاً من النظام. */
export const HOTEL_FEATURE_CATALOG: ReadonlyArray<{ id: string; label: string; Icon: LucideIcon }> = [
  { id:"wifi", label:"إنترنت لاسلكي", Icon:Wifi }, { id:"breakfast", label:"إفطار", Icon:Coffee },
  { id:"restaurant", label:"مطعم", Icon:Utensils }, { id:"pool", label:"مسبح", Icon:Waves },
  { id:"parking", label:"مواقف", Icon:CircleParking }, { id:"gym", label:"صالة رياضية", Icon:Armchair },
  { id:"ac", label:"تكييف", Icon:Snowflake }, { id:"spa", label:"سبا", Icon:Sparkles },
  { id:"room_service", label:"خدمة الغرف", Icon:BellRing }, { id:"accessibility", label:"سهولة الوصول", Icon:Accessibility },
  { id:"elevator", label:"مصعد", Icon:Navigation }, { id:"shuttle", label:"نقل للحرم", Icon:BusFront },
  { id:"airport_transfer", label:"نقل من المطار", Icon:CarFront }, { id:"luggage", label:"حفظ الأمتعة", Icon:Luggage },
  { id:"laundry", label:"غسيل الملابس", Icon:Waves }, { id:"safe", label:"خزنة", Icon:ShieldCheck },
  { id:"camera", label:"كاميرات مراقبة", Icon:Camera }, { id:"reception", label:"استقبال 24 ساعة", Icon:Clock3 },
  { id:"key", label:"دخول إلكتروني", Icon:Ticket }, { id:"payment", label:"دفع بالبطاقة", Icon:CreditCard },
  { id:"coffee_corner", label:"ركن قهوة", Icon:CupSoda }, { id:"water", label:"مياه", Icon:Droplets },
  { id:"air", label:"تهوية", Icon:AirVent }, { id:"fan", label:"مروحة", Icon:Fan },
  { id:"heater", label:"تدفئة", Icon:Heater }, { id:"tv", label:"تلفاز", Icon:Tv },
  { id:"screen", label:"شاشة", Icon:Monitor }, { id:"sound", label:"نظام صوت", Icon:Volume2 },
  { id:"radio", label:"راديو", Icon:Radio }, { id:"charging", label:"شحن الأجهزة", Icon:BatteryCharging },
  { id:"usb", label:"منفذ USB", Icon:Usb }, { id:"cable", label:"كابل شحن", Icon:Cable },
  { id:"bluetooth", label:"بلوتوث", Icon:Bluetooth }, { id:"headphones", label:"سماعات", Icon:Headphones },
  { id:"microwave", label:"ميكروويف", Icon:Microwave }, { id:"minibar", label:"ميني بار", Icon:Wine },
  { id:"family", label:"مناسب للعائلات", Icon:Baby }, { id:"first_aid", label:"إسعافات أولية", Icon:HeartPulse },
  { id:"fire_safety", label:"سلامة", Icon:Fuel }, { id:"lighting", label:"إضاءة", Icon:Lightbulb },
  { id:"night", label:"إضاءة ليلية", Icon:MoonStar }, { id:"sun", label:"إطلالة مشمسة", Icon:Sun },
  { id:"temperature", label:"تحكم بالحرارة", Icon:Thermometer }, { id:"toilet", label:"دورة مياه", Icon:Toilet },
  { id:"door", label:"مدخل سهل", Icon:DoorOpen }, { id:"concierge", label:"خدمة الضيافة", Icon:BellRing },
  { id:"language", label:"خدمة متعددة اللغات", Icon:Languages }, { id:"package", label:"استلام الأمتعة", Icon:PackageCheck },
  { id:"snack", label:"وجبات خفيفة", Icon:Sandwich }, { id:"power", label:"طاقة احتياطية", Icon:Zap },
];

const BY_ID = new Map(HOTEL_FEATURE_CATALOG.map(item => [item.id, item]));
export const hotelFeatureIcon = (id?: string): LucideIcon => BY_ID.get(id ?? "")?.Icon ?? Sparkles;
