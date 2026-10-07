/* حاجز الأخطاء — آخر خطّ قبل الشاشة البيضاء.

   بلا هذا المكوّن، أي استثناء في أي مكوّن يُفرّغ الشجرة كلها: يمسح React
   الجذر ويبقى <div id="root"> فارغاً بلا رسالة ولا زر. المستخدم يرى صفحة
   بيضاء دائمة ولا يعرف أن عليه إعادة التحميل، والخطأ يبقى في الطرفية التي
   لا يفتحها أحد.

   نصّ الرسالة عربيّ ثابت لا مترجَم: قد يقع الخطأ قبل جهوز طبقة الترجمة. */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { RotateCw, TriangleAlert } from "lucide-react";
import { B, ELEV, TONE } from "@/lib/theme";
import { hideBootSplash } from "@/lib/bootSplash";

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    /* السجل يبقى في الطرفية للتشخيص، والمستخدم يرى نصّاً مفهوماً.
       لا خدمة تتبّع بعد — حين توجد، هذا موضع الإبلاغ. */
    console.error("[ErrorBoundary]", error, info.componentStack);
    /* الشاشة التي أخفقت لن تستدعي hideBootSplash، فتبقى شاشة البدء فوق
       رسالة الخطأ حتى تنتهي شبكة أمان الـ15 ثانية. يظهر هذا مع تقسيم
       الحزمة خاصةً: تعذّر جلب شفرة المسار يرفع الاستثناء هنا. */
    hideBootSplash();
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    /* الرسالة التقنية (اسم ملف، سطر، نصّ إنجليزي) لا تعني العميل شيئاً
       وتُقلقه؛ تبقى مطويّةً تحت «تفاصيل للدعم الفني» ليقرأها من يُرسَل
       إليه لقطة الشاشة. */
    return (
      <div dir="rtl" lang="ar" style={{
        minHeight: "100vh", display: "grid", placeItems: "center",
        padding: "24px 20px", background: B.bg,
        fontFamily: "'DG Shamael', var(--font-app)",
      }}>
        <div role="alert" style={{
          maxWidth: 440, width: "100%", background: B.surface,
          border: `1px solid ${B.border}`, borderRadius: 20, padding: "36px 24px 24px",
          textAlign: "center", boxShadow: ELEV[2],
        }}>
          <div aria-hidden style={{
            width: 64, height: 64, margin: "0 auto 20px", borderRadius: "50%",
            display: "grid", placeItems: "center",
            background: TONE.warn.bg, color: TONE.warn.fg, boxShadow: `0 0 0 8px ${B.cream}`,
          }}>
            <TriangleAlert size={28} />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 600, lineHeight: 1.3, color: B.black, margin: "0 0 10px" }}>
            حدث خطأ غير متوقّع
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.75, color: B.text2, margin: "0 0 24px" }}>
            لم تُفقد بياناتك المحفوظة. أعد تحميل الصفحة، وإن تكرّر الخطأ تواصل
            معنا وأخبرنا بما كنت تفعله.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              width: "100%", height: 50, padding: "0 20px", borderRadius: 999, border: "none",
              background: B.gold, color: B.black, fontSize: 16, fontWeight: 600,
              fontFamily: "inherit", cursor: "pointer",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}>
            <RotateCw size={17} />
            إعادة تحميل الصفحة
          </button>
          <details style={{ marginTop: 14, textAlign: "start" }}>
            <summary style={{
              fontSize: 13, color: B.muted, cursor: "pointer", textAlign: "center",
              minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center",
              listStyle: "none",
            }}>
              <span style={{ textDecoration: "underline", textUnderlineOffset: 4 }}>تفاصيل للدعم الفني</span>
            </summary>
            <pre style={{
              margin: "6px 0 0", fontSize: 12, lineHeight: 1.6, color: B.text2,
              background: B.fill, border: `1px solid ${B.border}`, borderRadius: 10,
              padding: 12, overflowX: "auto", direction: "ltr", textAlign: "left", whiteSpace: "pre-wrap",
              wordBreak: "break-word", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}>{error.message || String(error)}</pre>
          </details>
        </div>
      </div>
    );
  }
}
