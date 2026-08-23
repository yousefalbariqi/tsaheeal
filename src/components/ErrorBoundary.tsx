/* حاجز الأخطاء — آخر خطّ قبل الشاشة البيضاء.

   بلا هذا المكوّن، أي استثناء في أي مكوّن يُفرّغ الشجرة كلها: يمسح React
   الجذر ويبقى <div id="root"> فارغاً بلا رسالة ولا زر. المستخدم يرى صفحة
   بيضاء دائمة ولا يعرف أن عليه إعادة التحميل، والخطأ يبقى في الطرفية التي
   لا يفتحها أحد.

   نصّ الرسالة عربيّ ثابت لا مترجَم: قد يقع الخطأ قبل جهوز طبقة الترجمة. */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { B } from "@/lib/theme";

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
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div dir="rtl" style={{
        minHeight: "100vh", display: "grid", placeItems: "center",
        padding: 24, background: B.bg, fontFamily: "var(--font-app)",
      }}>
        <div style={{
          maxWidth: 460, width: "100%", background: B.surface,
          border: `1px solid ${B.border}`, borderRadius: 16, padding: "32px 28px",
          textAlign: "center", boxShadow: "0 10px 40px -20px rgba(27,23,18,.25)",
        }}>
          <div style={{ height: 3, background: `linear-gradient(90deg,${B.gold},${B.gold2},${B.gold})`,
            borderRadius: 2, width: 56, margin: "0 auto 22px" }}/>
          <h1 style={{ fontSize: 21, fontWeight: 600, color: B.black, margin: "0 0 10px" }}>
            حدث خطأ غير متوقّع
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.7, color: B.text2, margin: "0 0 24px" }}>
            لم تُفقد بياناتك المحفوظة. أعد تحميل الصفحة، وإن تكرّر الخطأ تواصل
            معنا وأخبرنا بما كنت تفعله.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              width: "100%", padding: "13px 20px", borderRadius: 12, border: "none",
              background: B.primary, color: "#fff", fontSize: 15, fontWeight: 600,
              fontFamily: "inherit", cursor: "pointer",
            }}>
            إعادة تحميل الصفحة
          </button>
          <details style={{ marginTop: 18, textAlign: "start" }}>
            <summary style={{ fontSize: 12.5, color: B.muted, cursor: "pointer" }}>
              التفاصيل التقنية
            </summary>
            <pre style={{
              marginTop: 10, fontSize: 11.5, lineHeight: 1.6, color: B.text2,
              background: B.bg, border: `1px solid ${B.border}`, borderRadius: 8,
              padding: 12, overflowX: "auto", direction: "ltr", whiteSpace: "pre-wrap",
            }}>{error.message || String(error)}</pre>
          </details>
        </div>
      </div>
    );
  }
}
