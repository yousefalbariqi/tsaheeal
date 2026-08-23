/* عدّاد وعد الردّ — حلقة تنازلية لساعتَي عمل.

   الغرض شعوري لا إخباري: الطلب بعد إرساله يصير صمتاً، والصمت يُقرأ إهمالاً.
   الحلقة تجعل الانتظار مرئياً وله حدّ منظور، فيُقرأ متابعةً لا نسياناً.

   والعدّاد يقف خارج الدوام ولا ينفد: عدّاد نفد ليلاً يقول «تأخّروا عليك»
   وهو كذب — المكتب مغلق. الوقوف مع سطر «يستأنف 6:00 ص» يقول الحقيقة. */
import { useEffect, useState } from "react";
import { Clock, MoonStar, CheckCheck } from "lucide-react";
import { C, T, R, FONT, LTR } from "./tokens";
import { useReducedMotion } from "./kit";
import { slaState, formatCountdown, riyadhClock, OPEN_HOUR, CLOSE_HOUR } from "../sla";

const SIZE = 176;
const STROKE = 12;
const RADIUS = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;

/** «6:00 ص» — بأرقام لاتينية داخل عنصر LTR كبقيّة الأرقام في التطبيق. */
const clockLabel = (utc: number, t: (k: string) => string) => {
  const { h, m } = riyadhClock(utc);
  const am = h < 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${t(am ? "amShort" : "pmShort")}`;
};

export function SlaCountdown({ submittedAt, t }: {
  /** لحظة إرسال الطلب (UTC ms). */
  submittedAt: number;
  t: (k: string) => string;
}) {
  const reduced = useReducedMotion();
  const [now, setNow] = useState(() => Date.now());
  const s = slaState(submittedAt, now);

  /* الوقوف يعيد الحساب كل ثانية بلا داعٍ، لكن التوقّف يجب أن ينتهي عند
     الفتح بلا تدخّل — فنبقي النبض ثانيةً واحدة ما دام الوعد قائماً. */
  useEffect(() => {
    if (s.expired) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [s.expired]);

  const tone = s.expired ? C.ink3 : s.paused ? C.gold : C.green;
  const offset = CIRC * s.progress;

  return (
    <div className="flex flex-col items-center" style={{ gap: 14 }}>
      {/* الوعد نصّاً أولاً — الحلقة تؤكّده ولا تحلّ محلّه */}
      <div className="flex items-center" style={{ gap: 8, ...T.h3, color: C.ink, textAlign: "center" }}>
        <Clock size={18} style={{ color: C.green, flexShrink: 0 }} />
        {t("contactWithin")}
      </div>

      <div style={{ position: "relative", width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} aria-hidden
          style={{ transform: "rotate(-90deg)", display: "block" }}>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke={C.line} strokeWidth={STROKE} />
          <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none"
            stroke={tone} strokeWidth={STROKE} strokeLinecap="round"
            strokeDasharray={CIRC} strokeDashoffset={offset}
            style={reduced ? undefined : { transition: "stroke-dashoffset 1s linear, stroke .4s ease" }} />
        </svg>

        {/* الرقم في القلب — تُقرأ الحلقة والرقم في نظرة واحدة */}
        <div className="flex flex-col items-center justify-center"
          style={{ position: "absolute", inset: 0, gap: 2 }}>
          <span style={{
            ...LTR, fontFamily: FONT.mono, fontSize: 30, fontWeight: 600,
            color: s.expired ? C.ink2 : C.ink, lineHeight: 1.1,
          }}>
            {formatCountdown(s.remainingMs)}
          </span>
          <span style={{ ...T.small, fontWeight: 400, color: C.ink2 }}>
            {s.expired ? t("slaSoon") : t("slaLeft")}
          </span>
        </div>
      </div>

      {/* حالة الوقوف: سبب صريح وموعد استئناف — لا حلقة جامدة بلا تفسير */}
      {s.paused && s.resumesAt != null && (
        <div className="flex items-center" style={{
          gap: 8, paddingInline: 12, paddingBlock: 8, borderRadius: R.pill,
          background: C.goldTint, border: `1px solid ${C.gold}33`,
        }}>
          <MoonStar size={15} style={{ color: C.gold, flexShrink: 0 }} />
          <span style={{ ...T.small, fontWeight: 400, color: C.ink }}>
            {t("slaPaused")} · {t("slaResumes").replace("{time}", clockLabel(s.resumesAt, t))}
          </span>
        </div>
      )}

      {s.expired && (
        <div className="flex items-center" style={{ gap: 8 }}>
          <CheckCheck size={15} style={{ color: C.green, flexShrink: 0 }} />
          <span style={{ ...T.small, fontWeight: 400, color: C.ink2 }}>{t("slaExpiredNote")}</span>
        </div>
      )}

      <span style={{ ...T.small, fontWeight: 400, color: C.ink3, textAlign: "center" }}>
        {t("workHours")
          .replace("{from}", String(OPEN_HOUR))
          .replace("{to}", String(CLOSE_HOUR - 12))}
      </span>
    </div>
  );
}
