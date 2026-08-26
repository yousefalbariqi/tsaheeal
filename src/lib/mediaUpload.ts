/* رفع الوسائط إلى Supabase Storage.

   ما كان قبله: كل صورة تُقرأ بـFileReader إلى data:URL ويُخزَّن النصّ
   كاملاً في عمود نصّي (packages.cover_image، hotel_media.url، …). الكلفة
   ليست مساحةً فحسب:

   1) base64 يكبّر الملف ٣٣٪، ويعيش داخل الصفّ — فكلّ قراءة للباقة
      تجرّ صورها معها. صفحة الاستكشاف تجلب الباقات كلّها: عشرون باقة
      بغلاف واحد لكلٍّ = ميغابايتات في استعلامٍ واحد قبل أن يُرسم شيء.
   2) لا ذاكرة وسيطة (CDN) ولا ترويسة تخزين: نفس الصورة تُنزَّل من جديد
      في كل زيارة، ومع كل تغيّر في أي حقل آخر من الباقة.
   3) صورة واحدة من كاميرا جوال حديث تتجاوز حدود حجم الصفّ/الطلب،
      فالحفظ يفشل برسالة لا علاقة لها بالصور.

   بعده: الملف يُرفع إلى دلو media ويُخزَّن رابطه العام وحده (نصّ قصير).

   وضع التجربة (بلا مفاتيح Supabase) يبقى يعمل على data:URL: هدفه أن
   تُجرَّب الواجهة بلا خادم، ولا خادمَ يُرفع إليه أصلاً. */
import { toast } from "sonner";
import { supabase, isSupabaseEnabled } from "@/supabase/client";

export const MEDIA_BUCKET = "media";

/* حدود الحجم — تُرفض قبل الرفع لا بعده: رفع ٦٠ ميغا ثم رفض الخادم
   يستهلك بيانات الموظف على شبكة الجوال بلا فائدة. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;    // 8MB
export const MAX_VIDEO_BYTES = 64 * 1024 * 1024;   // 64MB

/** مجلّدات الدلو — واحد لكل نوع محتوى، فالحذف والمراجعة يبقيان ممكنين. */
export type MediaFolder =
  | "packages" | "package-gallery" | "package-reviews"
  | "hotels" | "hotel-rooms" | "hotel-reviews"
  | "transport" | "transport-reviews"
  | "support";

const EXT_OF: Record<string, string> = {
  "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp",
  "image/gif": "gif", "image/avif": "avif", "image/heic": "heic", "image/heif": "heif",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
};

const extOf = (file: File): string =>
  EXT_OF[file.type] ?? (file.name.split(".").pop() || "bin").toLowerCase().slice(0, 5);

const mb = (n: number) => Math.round(n / (1024 * 1024));

/** رسالة عربية لكل سبب رفض — الموظف يرى ما يفعله لا رمز خطأ. */
export class MediaError extends Error {}

function validate(file: File): void {
  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  if (!isImage && !isVideo) throw new MediaError("الملف ليس صورة ولا مقطعاً.");
  const cap = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size > cap) {
    throw new MediaError(`حجم الملف ${mb(file.size)} ميغابايت — الحدّ ${mb(cap)}.`);
  }
}

/** اسم فريد بلا اعتماد على اسم الملف: أسماء الجوالات متكرّرة
    (IMG_0001.jpg)، والاسم العربي أو ذو المسافات يفسد المسار. */
function uniqueName(file: File): string {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${rand}.${extOf(file)}`;
}

const asDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new MediaError("تعذّر قراءة الملف."));
    r.readAsDataURL(file);
  });

/** يرفع الملف ويعيد رابطه. في وضع التجربة يعيد data:URL كما كان. */
export async function uploadMedia(file: File, folder: MediaFolder): Promise<string> {
  validate(file);
  if (!isSupabaseEnabled || !supabase) return asDataUrl(file);

  const path = `${folder}/${uniqueName(file)}`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
    /* سنة كاملة: المسار فريد لكل ملف فلا يُستبدل محتواه أبداً، وأي
       تعديل يعني ملفاً جديداً بمسار جديد. */
    cacheControl: "31536000",
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) {
    const m = String(error.message ?? "");
    if (/bucket not found/i.test(m)) {
      throw new MediaError("دلو التخزين media غير موجود — نفّذ ترحيل 20260823_media_storage.sql.");
    }
    if (/exceeded|too large|payload/i.test(m)) throw new MediaError("الملف أكبر من حدّ الخادم.");
    if (/row-level security|not authorized|Unauthorized/i.test(m)) {
      throw new MediaError("لا تملك صلاحية رفع الملفات — راجع مدير النظام.");
    }
    throw new MediaError(m || "تعذّر رفع الملف.");
  }
  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new MediaError("تمّ الرفع ولم يُعَد رابط الملف.");
  return data.publicUrl;
}

/** هل الرابط صورة مضمّنة بـbase64؟ صفوف ما قبل الترحيل. */
export const isDataUrl = (url?: string): boolean => !!url && url.startsWith("data:");

/* مُعالِج جاهز لحقل <input type="file"> — يُظهر التقدّم والفشل.

   كانت كل نقاط الرفع الثمانية تكتب نفس السطر: FileReader بلا onerror
   وبلا حدّ حجم وبلا أي أثر مرئي. الفشل كان صامتاً تماماً: الموظف يختار
   صورة، لا يحدث شيء، فيختارها مرّة أخرى. */
export function onPickMedia(
  folder: MediaFolder,
  apply: (url: string) => void,
): (e: { target: HTMLInputElement }) => void {
  return (e) => {
    const input = e.target;
    const file = input.files?.[0];
    /* تصفير القيمة فوراً: اختيار نفس الملف مرّتين لا يُطلق change بدونه. */
    input.value = "";
    if (!file) return;
    void (async () => {
      const id = toast.loading("جارٍ رفع الملف…");
      try {
        const url = await uploadMedia(file, folder);
        apply(url);
        toast.success("تم رفع الملف", { id });
      } catch (err) {
        console.error("[media] فشل الرفع:", err);
        toast.error("تعذّر رفع الملف", {
          id,
          description: err instanceof MediaError ? err.message : String((err as Error)?.message ?? err),
          duration: 9000,
        });
      }
    })();
  };
}
