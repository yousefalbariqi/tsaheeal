#!/usr/bin/env node
/* ترحيل الصور من base64 داخل الأعمدة إلى دلو media.
 *
 *   الاستعمال:
 *     node scripts/migrate-media-to-storage.mjs --dry     # تقرير بلا كتابة
 *     node scripts/migrate-media-to-storage.mjs           # الترحيل الفعلي
 *
 *   يحتاج في .env:
 *     VITE_SUPABASE_URL
 *     SUPABASE_SERVICE_ROLE_KEY      ← مفتاح الخدمة، لا مفتاح anon
 *
 * لماذا سكربت لا SQL: النقل يستلزم فكّ base64 ورفع الملف عبر واجهة
 * التخزين، وهذا عمل عميل لا عمل قاعدة.
 *
 * القاعدة الحاكمة: يُرفع الملف أولاً، ثم يُكتب الرابط. لو انقطع بينهما
 * بقي ملفٌ يتيمٌ في الدلو — وهو أرخص من صفٍّ يشير إلى ملف لم يُرفع.
 * وإعادة تشغيل السكربت آمنة: ما صار رابطاً لا يُقرأ من جديد (الشرط
 * `like 'data:%'`).
 *
 * الترحيل صفٌّ صفّاً بالتحديث المباشر (لا عبر upsert_*): دوال upsert
 * تعيد كتابة الكيان كاملاً من jsonb، فترحيلُ صورةٍ عبرها يعني إعادة
 * كتابة الباقة كلّها — ومعها خطر إسقاط حقلٍ لم يُمرَّر.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

/* ── قراءة .env بلا اعتماد على حزمة ── */
function loadEnv(path = ".env") {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      const v = m[2].replace(/^["']|["']$/g, "");
      if (!process.env[m[1]]) process.env[m[1]] = v;
    }
  } catch { /* لا ملف .env — قد تكون المتغيّرات في البيئة */ }
}
loadEnv();

const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY = process.argv.includes("--dry");
const BUCKET = "media";

if (!URL || !KEY) {
  console.error("ينقص VITE_SUPABASE_URL أو SUPABASE_SERVICE_ROLE_KEY في .env");
  console.error("مفتاح الخدمة من: Supabase → Project Settings → API → service_role");
  process.exit(1);
}

const db = createClient(URL, KEY, { auth: { persistSession: false } });

/* الأعمدة التي تحمل صوراً — الجدول، المفتاح، العمود، مجلّد الدلو.
   المفتاح هو ما يُميّز الصفّ في update؛ الجداول الفرعية تستخدم id
   الترقيمي الخاصّ بها لا id الكيان الأب. */
const TARGETS = [
  { table: "packages",          key: "id", col: "cover_image", folder: "packages" },
  { table: "package_gallery",   key: "id", col: "value",       folder: "package-gallery" },
  { table: "package_reviews",   key: "id", col: "image",       folder: "package-reviews" },
  { table: "hotel_media",       key: "id", col: "url",         folder: "hotels" },
  { table: "hotel_room_photos", key: "id", col: "url",         folder: "hotel-rooms" },
  { table: "hotel_reviews",     key: "id", col: "image",       folder: "hotel-reviews" },
  { table: "transport_media",   key: "id", col: "url",         folder: "transport" },
  { table: "transport_reviews", key: "id", col: "image",       folder: "transport-reviews" },
];

const EXT_OF = {
  "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp",
  "image/gif": "gif", "image/avif": "avif", "image/heic": "heic", "image/heif": "heif",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
};

/** يفكّ data:URL إلى (نوع, بايتات). يعيد null لما ليس data:URL. */
function decodeDataUrl(s) {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(s ?? "");
  if (!m) return null;
  const mime = m[1] || "application/octet-stream";
  const body = m[3];
  const bytes = m[2]
    ? Buffer.from(body, "base64")
    : Buffer.from(decodeURIComponent(body), "utf8");
  return { mime, bytes };
}

const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const mb = (n) => (n / (1024 * 1024)).toFixed(2);

async function migrateTarget({ table, key, col, folder }) {
  const stat = { rows: 0, moved: 0, bytes: 0, failed: 0 };

  /* صفحاتٌ صغيرة: الصفّ يحمل base64 كاملاً، وجلب ألف صفّ معاً يفوق
     ذاكرة العملية وحدّ الاستجابة. */
  const PAGE = 20;
  for (;;) {
    const { data, error } = await db
      .from(table)
      .select(`${key},${col}`)
      .like(col, "data:%")
      .order(key, { ascending: true })
      .limit(PAGE);
    if (error) { console.error(`  ✖ ${table}: ${error.message}`); stat.failed++; break; }
    if (!data?.length) break;

    for (const row of data) {
      stat.rows++;
      const dec = decodeDataUrl(row[col]);
      if (!dec) { console.warn(`  ⚠ ${table}#${row[key]}: data:URL غير مفهوم — متروك`); stat.failed++; continue; }
      stat.bytes += dec.bytes.length;
      const ext = EXT_OF[dec.mime] ?? "bin";
      const path = `${folder}/${uid()}.${ext}`;

      if (DRY) {
        console.log(`  · ${table}#${row[key]} → ${path} (${mb(dec.bytes.length)}MB)`);
        stat.moved++;
        continue;
      }

      /* الرفع أولاً — ثم الرابط. العكس يترك صفّاً يشير إلى لا شيء. */
      const up = await db.storage.from(BUCKET).upload(path, dec.bytes, {
        contentType: dec.mime, cacheControl: "31536000", upsert: false,
      });
      if (up.error) { console.error(`  ✖ ${table}#${row[key]} رفع: ${up.error.message}`); stat.failed++; continue; }

      const { data: pub } = db.storage.from(BUCKET).getPublicUrl(path);
      const upd = await db.from(table).update({ [col]: pub.publicUrl }).eq(key, row[key]);
      if (upd.error) {
        console.error(`  ✖ ${table}#${row[key]} كتابة: ${upd.error.message}`);
        /* الملف صار يتيماً — يُحذف حتى لا يتراكم في الدلو بلا مرجع. */
        await db.storage.from(BUCKET).remove([path]);
        stat.failed++;
        continue;
      }
      stat.moved++;
    }

    /* في التجربة لا تُكتب الصفوف، فالاستعلام يعيدها نفسها إلى الأبد. */
    if (DRY) break;
  }
  return stat;
}

const label = DRY ? "تجربة (بلا كتابة)" : "ترحيل فعلي";
console.log(`\n── ترحيل الوسائط إلى دلو ${BUCKET} — ${label} ──\n`);

let totalMoved = 0, totalBytes = 0, totalFailed = 0;
for (const t of TARGETS) {
  process.stdout.write(`${t.table}.${t.col}\n`);
  const s = await migrateTarget(t);
  console.log(`  ← ${s.moved} منقول · ${mb(s.bytes)}MB · ${s.failed} فشل\n`);
  totalMoved += s.moved; totalBytes += s.bytes; totalFailed += s.failed;
}

console.log("──────────────────────────────────────");
console.log(`المجموع: ${totalMoved} صورة · ${mb(totalBytes)}MB · ${totalFailed} فشل`);
if (DRY) console.log("\nهذه تجربة. أعِد التشغيل بلا --dry للترحيل الفعلي.");
else if (totalFailed) console.log("\nبقيت صفوف لم تُنقل — أعِد التشغيل، السكربت لا يعيد نقل ما نُقل.");
else console.log("\nتمّ. تحقّق بـ: select * from media_base64_report();");
process.exit(totalFailed ? 1 : 0);
