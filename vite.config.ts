import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

/* حارس البناء — العلمان التجريبيان أوصلا حجوزات العملاء إلى لا مكان،
   والراية الوحيدة على ذلك كانت ملفاً محلياً يقرأه من يعرف بوجوده. هنا
   يصير البناء نفسه هو الراية: `vite build` يفشل بدل أن ينشر واجهةً
   تُظهر للعميل «تم استلام طلبك» ولا تحفظ شيئاً.

   loadEnv يقرأ .env و.env.production و.env.local بأسبقية Vite نفسها،
   فما يفحصه هنا هو ما سيُحزَم فعلاً لا ما في ملف واحد. */
const DEV_ONLY_FLAGS = ['VITE_CUSTOMER_AUTH_MODE', 'VITE_SKIP_SEAT_CHECK'] as const

function assertNoDevFlags(mode: string) {
  if (mode !== 'production') return
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const bad = DEV_ONLY_FLAGS.filter(k => {
    const v = (env[k] ?? '').trim().toLowerCase()
    return v === 'dev' || v === '1' || v === 'true'
  })
  if (bad.length) {
    throw new Error(
      `\n\n⛔ بناء مرفوض — راية تجريبية مفعّلة في الإنتاج: ${bad.join('، ')}\n` +
      `   احذفها من .env ومن متغيرات البيئة في Vercel، ثم أعد البناء.\n` +
      `   السبب: هذه الرايات توقف كتابة الحجوزات إلى القاعدة وتُظهر مقاعد وهمية.\n`
    )
  }
}

/* راية «بلا تحقّق» لا تُمنَع بل تُعلَن.

   الرايتان أعلاه تُفشِلان البناء لأنهما تكذبان على المستخدم: تُريه
   «تم استلام طلبك» ولا تحفظان شيئاً. أمّا VITE_CUSTOMER_SKIP_OTP فلا
   تكذب — الحجز يصل القاعدة كاملاً — لكنها تُلغي التحقّق من ملكية الرقم،
   وهذا قرارٌ يُتَّخذ عمداً لتجربة داخلية ويُنشَر به فعلاً. فإفشال البناء
   عليه يمنع ما طُلب، والسكوت عنه يجعله يُنسى في أول نشرٍ حقيقي.
   الوسط: يُطبع بارزاً في كل بناء إنتاج. */
function warnSkipOtp(mode: string) {
  if (mode !== 'production') return
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  if ((env.VITE_CUSTOMER_SKIP_OTP ?? '').trim() !== '1') return
  console.warn(
    `\n⚠️  ═══════════════════════════════════════════════════════════\n` +
    `   بناء إنتاج ووضع «الدخول بلا تحقّق» مفعَّل (VITE_CUSTOMER_SKIP_OTP=1).\n` +
    `   من يعرف رقم جوال يدخل على حساب صاحبه ويرى حجوزاته ويحجز باسمه.\n` +
    `   مقصود للتجربة الداخلية. قبل الإطلاق العام: احذف المتغيّر من\n` +
    `   .env ومن متغيّرات البيئة في Vercel، ثم أعد البناء.\n` +
    `   ═══════════════════════════════════════════════════════════\n`,
  )
}

export default defineConfig(({ mode }) => {
  assertNoDevFlags(mode)
  warnSkipOtp(mode)

  return {
    plugins: [
      figmaAssetResolver(),
      // The React and Tailwind plugins are both required for Make, even if
      // Tailwind is not being actively used – do not remove them
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        // Alias @ to the src directory
        '@': path.resolve(__dirname, './src'),
      },
    },

    // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
    assetsInclude: ['**/*.svg', '**/*.csv'],
  }
})
