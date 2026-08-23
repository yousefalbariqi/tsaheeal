/* مسوّدة الحجز — تنجو من تحديث الصفحة وإعادة التوجيه.

   قبل هذا كان تحديث الصفحة في خطوة «بيانات المعتمرين» يمحو كل شيء:
   أربعة معتمرين بأسمائهم وأرقام هوياتهم وتواريخ ميلادهم أُدخلت يدوياً
   على جوال. وإعادة الإدخال ليست الكلفة الوحيدة — أكثرهم لا يعيد.

   sessionStorage لا localStorage عن قصد: هذه بيانات هوية أشخاص
   (أسماء، أرقام هوية، تواريخ ميلاد). نطاق التبويب يعني أنها تُمحى مع
   إغلاقه، فلا تبقى على جهاز مشترك بعد انصراف صاحبها. والغرض حماية
   من التحديث والرجوع لا حفظ طويل الأجل.

   الشكل مُرقَّم (v): تغيير حقول Pax لاحقاً يُبطل المسوّدات القديمة بدل
   أن يُقرأ صفٌّ ناقص فتُرسل حقول فارغة إلى القاعدة. */
import type { DocType } from "@/data/docTypes";
import type { RoomSplit } from "./roomSplit";

export interface Pax {
  name: string; phone: string; docType: DocType | ""; idNumber: string;
  nationality: string; birthDate: string;
  gender: "male" | "female"; ageGroup: "adult" | "child"; seat: number | null;
}

export const emptyPax = (): Pax => ({
  name: "", phone: "", docType: "", idNumber: "", nationality: "",
  birthDate: "", gender: "male", ageGroup: "adult", seat: null,
});

const KEY = "tasaheel_booking_draft";
const VERSION = 1;
/* عمر المسوّدة — تبويب متروك مفتوحاً أياماً لا يعيد أسعاراً ورحلات
   قديمة إلى شاشة المراجعة. الرحلة قد امتلأت أو انطلقت أصلاً. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface BookingDraft {
  v: number;
  packageId: string;
  tripId: string | null;
  persons: number;
  split: RoomSplit | null;
  pax: Pax[];
  agreed: boolean;
  activePax: number;
  savedAt: number;
}

export type DraftInput = Omit<BookingDraft, "v" | "savedAt">;

/** يقرأ المسوّدة ويتحقّق من شكلها. أي شذوذ ⇒ null، والمسوّدة تُمحى. */
export function readDraft(): BookingDraft | null {
  let raw: string | null = null;
  try { raw = sessionStorage.getItem(KEY); } catch { return null; }  // تخزين محظور
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<BookingDraft>;
    const ok =
      d && d.v === VERSION &&
      typeof d.packageId === "string" && d.packageId.length > 0 &&
      Array.isArray(d.pax) && d.pax.length > 0 &&
      typeof d.persons === "number" && d.persons > 0 &&
      typeof d.savedAt === "number" &&
      Date.now() - d.savedAt < MAX_AGE_MS;
    if (!ok) { clearDraft(); return null; }
    return {
      v: VERSION,
      packageId: d.packageId as string,
      tripId: typeof d.tripId === "string" ? d.tripId : null,
      persons: d.persons as number,
      split: (d.split ?? null) as RoomSplit | null,
      /* كل معتمر يُدمج فوق سجل فارغ: حقلٌ أُضيف بعد كتابة المسوّدة
         يأتي بقيمته الافتراضية بدل undefined يصل إلى القاعدة. */
      pax: (d.pax as Pax[]).map(p => ({ ...emptyPax(), ...p })),
      agreed: d.agreed === true,
      activePax: typeof d.activePax === "number" ? d.activePax : 0,
      savedAt: d.savedAt as number,
    };
  } catch { clearDraft(); return null; }
}

export function writeDraft(d: DraftInput): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...d, v: VERSION, savedAt: Date.now() }));
  } catch { /* ممتلئ أو محظور — المسوّدة تحسين لا شرط */ }
}

export function clearDraft(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* محظور */ }
}

/** هل تحمل المسوّدة شيئاً كتبه المستفيد فعلاً؟ مسوّدة بحقول فارغة
    لا تُحفظ ولا تُستعاد: استعادتها تعني تثبيت المستفيد على خطوة
    داخلية بلا سبب بعد أن أراد البدء من جديد. */
export function draftHasInput(pax: Pax[], tripId: string | null, split: RoomSplit | null): boolean {
  if (tripId || split) return true;
  return pax.some(p =>
    p.name.trim() || p.idNumber.trim() || p.nationality || p.birthDate || p.seat != null);
}
