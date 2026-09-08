/* روابط الخرائط — تحقّقٌ ومعاينة قبل الحفظ.

   العلّة: الحقل كان نصّاً حرّاً بلا فحص. فيُلصق فيه ما يُلصق — عنوانٌ
   مكتوب، أو رابطٌ ناقص، أو رابط بحثٍ لا موقع — ويُحفظ. ولا يكتشفه أحد
   حتى يفتحه معتمرٌ صباح الانطلاق فيصل إلى لا مكان. خطأٌ رخيص التصحيح
   قبل الحفظ، وباهظ الثمن بعده.

   والفحص متساهل بقصد: أي رابط https على نطاق خرائط معروف يمرّ. تشديدُه
   على صيغةٍ بعينها يرفض روابط صحيحة — وجوجل تولّد صيغاً كثيرة (maps.app
   المختصر، وgoo.gl القديم، وplace وdir وq=lat,lng) — ورفضُ الصحيح
   يدفع الموظف إلى تجاوز الحقل لا إلى تصحيحه. */

const MAP_HOSTS = [
  "google.com", "www.google.com", "maps.google.com",
  "goo.gl", "maps.app.goo.gl", "g.page",
  "openstreetmap.org", "www.openstreetmap.org",
  "apple.com", "maps.apple.com",
];

/** شكلٌ واحد لا اتّحاد: `reason` فارغةٌ عند القبول وعند الحقل الفارغ
    معاً، فلا يحتاج المستدعي تضييق نوعٍ ليقرأها. */
export interface MapUrlVerdict {
  ok: boolean;
  /** سبب الرفض بالعربية — فارغة إن قُبل الرابط أو كان الحقل فارغاً. */
  reason: string;
  /** الرابط بعد التطبيع، أو "" إن رُفض. */
  url: string;
  /** هل تُستخرج منه إحداثيات تكفي لمعاينة مضمَّنة؟ */
  embeddable: boolean;
}

const reject = (reason: string): MapUrlVerdict => ({ ok: false, reason, url: "", embeddable: false });

/** يفحص الرابط ويعيد سببَ الرفض بالعربية — لا رايةً صامتة. */
export function checkMapUrl(raw: string): MapUrlVerdict {
  const value = (raw || "").trim();
  if (!value) return reject("");                           // فارغ ليس خطأً
  let u: URL;
  try { u = new URL(value); }
  catch { return reject("رابط غير مكتمل — انسخه من زر «مشاركة» في خرائط جوجل."); }
  if (u.protocol !== "https:") return reject("الرابط يجب أن يبدأ بـ https.");
  const host = u.hostname.toLowerCase();
  const known = MAP_HOSTS.some(h => host === h || host.endsWith("." + h));
  if (!known) return reject("ليس رابط خرائط معروفاً — استخدم خرائط جوجل أو آبل.");
  return { ok: true, reason: "", url: u.toString(), embeddable: extractPoint(u) !== null };
}

/** إحداثيات الرابط إن حملها صراحةً. الروابط المختصرة لا تحملها قبل
    فتحها، ولا يُفتح رابطٌ خارجي لاستخراجها: الخصوصية أولاً. */
function extractPoint(u: URL): { lat: number; lng: number } | null {
  /* الصيغة @lat,lng,zoom في المسار — أشيع ما تولّده جوجل. */
  const at = u.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (at) return { lat: Number(at[1]), lng: Number(at[2]) };
  /* ‎?q=lat,lng أو ‎?query=lat,lng */
  const q = u.searchParams.get("q") || u.searchParams.get("query") || u.searchParams.get("ll");
  const m = q?.match(/^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/);
  if (m) return { lat: Number(m[1]), lng: Number(m[2]) };
  return null;
}

/** رابط معاينة مضمَّنة — أو null إن كان الموقع غير مستخرَج.

    يستعمل صيغة `output=embed` التي لا تحتاج مفتاح API. حين تتعذّر
    المعاينة لا يُعرض إطارٌ فارغ: يُعرض زرّ «افتح في خرائط جوجل» — رؤية
    الموقع في تبويبٍ جديد تفي بالغرض، وإطارٌ يفشل بصمت أسوأ من لا إطار. */
export function mapEmbedUrl(raw: string): string | null {
  const v = checkMapUrl(raw);
  if (!v.ok) return null;
  const p = extractPoint(new URL(v.url));
  if (!p) return null;
  return `https://www.google.com/maps?q=${p.lat},${p.lng}&z=15&output=embed`;
}
