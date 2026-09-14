/* نوع المسافر — الأيقونات وشبكة الاختيار.

   ثلاثة مربّعات متجاورة لا قائمة رأسية: الخيارات ثلاثة فقط ومتوازية
   المعنى، والقائمة الرأسية تُرتّبها ضمنياً (الأول أولى) وتدفع الثالث
   تحت طيّ الشاشة على الجوال. المتجاور يُقرأ دفعةً واحدة ويُقارَن.

   اللون يحمل المعنى قبل النص: أزرق للرجل ووردي للمرأة وذهبيّ الهوية
   للعائلة. هذه الثلاثة هي الاستثناء الوحيد للوحة الذهبية في tokens.ts —
   لأن الفرق بين «مسافر» و«مسافرة» كلمةٌ واحدة بحرفٍ زائد، وقارئٌ مستعجل
   على جوال يخطئها. اللون يفرزهما قبل أن تُقرأ الكلمة.

   والرسم يقول المعنى كذلك: الرجل بإحرامه مكشوف الكتف (الاضطباع)،
   والمرأة بحجابها وعباءتها، والعائلة أبٌ وأمٌّ وطفلٌ بينهما — لا ثلاث
   نسخ من رمزٍ محايد واحد يفرّقها اللون وحده. لأن من لا يميّز الأزرق
   من الورديّ (عمى الألوان الأحمر-الأخضر لا يمسّ هذين، لكنّ الشاشة تحت
   الشمس تمسّهما) يبقى أمامه شكلٌ مختلف ونصٌّ صريح. */
import { useId } from "react";
import { motion } from "motion/react";
import { Check } from "lucide-react";
import type { TravellerType } from "@/types";
import { C, T, R } from "./tokens";

/** لوحة كل نوع: `ink` لون الرسم، و`tint` خلفية القرص والبطاقة المختارة. */
export const TRAVELLER_PALETTE: Record<TravellerType, { ink: string; tint: string }> = {
  male_solo:   { ink: "#2E6DB4", tint: "#E9F1FA" },
  female_solo: { ink: "#C2557E", tint: "#FBECF2" },
  family:      { ink: "#B7893F", tint: "#F7EEDC" },
};

/** الترتيب مقصود: الفرديّان أولاً لأنهما الأكثر، والعائلة آخراً.
    ومفتاح النص هو القيمة البرمجية نفسها (`t("male_solo")`) فلا جدول
    ترجمةٍ ثانٍ بين القيمة واسمها. */
export const TRAVELLER_TYPES: readonly TravellerType[] = ["male_solo", "female_solo", "family"] as const;

/* ═══ الرسوم ═══
   كلها على مربّع 44×44 حتى تتساوى الأحجام البصرية في الشبكة. */

/** رجلٌ في إحرامه — الشريط المائل هو رداء الإحرام على الكتف الأيسر.
    القصّ (clipPath) يُبقي الشريط داخل الجسد بدل رسمه يدوياً بحوافّ
    تُزاح مع أي تعديل على شكل الجسد. */
function MaleIcon({ size, ink }: { size: number; ink: string }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none" aria-hidden="true">
      <defs>
        <clipPath id={id}>
          <path d="M22 19.6c-6.2 0-10.7 3.6-11.5 9L9.4 37a2.4 2.4 0 0 0 2.4 2.7h20.4a2.4 2.4 0 0 0 2.4-2.7l-1.1-8.4c-.8-5.4-5.3-9-11.5-9Z" />
        </clipPath>
      </defs>
      <circle cx="22" cy="11" r="6.4" fill={ink} />
      <path d="M22 19.6c-6.2 0-10.7 3.6-11.5 9L9.4 37a2.4 2.4 0 0 0 2.4 2.7h20.4a2.4 2.4 0 0 0 2.4-2.7l-1.1-8.4c-.8-5.4-5.3-9-11.5-9Z" fill={ink} />
      <g clipPath={`url(#${id})`}>
        {/* الرداء يمرّ على الكتف الأيسر ويخرج تحت الإبط الأيمن — اتجاه
            الاضطباع لا شريطٌ مائل كيفما اتفق. عرضه سُبع الجسد تقريباً:
            أعرض من ذلك يقطع الصورة نصفين في حجم ٣٨ بكسل بدل أن يُقرأ ثوباً. */}
        <path d="M36 19 L6 41.5 L10.2 47.1 L40.2 24.6 Z" fill="#FFFFFF" fillOpacity=".72" />
      </g>
    </svg>
  );
}

/** امرأةٌ بحجابها — الرأس والحجاب شكلٌ واحد ينسدل على الكتفين،
    والعباءة تتّسع نحو الأسفل. الفرق عن رسم الرجل في الصورة الظليّة
    نفسها لا في اللون وحده. */
function FemaleIcon({ size, ink }: { size: number; ink: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none" aria-hidden="true">
      <path d="M22 4.2c-5 0-8.8 3.9-8.8 8.9 0 3 1 5.3 2.7 6.7l-.7 2.4h13.6l-.7-2.4c1.7-1.4 2.7-3.7 2.7-6.7 0-5-3.8-8.9-8.8-8.9Z" fill={ink} />
      <path d="M22 20.6c-4.7 0-7.8 2.7-8.8 7.7l-1.9 8.9a2.4 2.4 0 0 0 2.3 2.9h16.8a2.4 2.4 0 0 0 2.3-2.9l-1.9-8.9c-1-5-4.1-7.7-8.8-7.7Z" fill={ink} />
    </svg>
  );
}

/** أبٌ وأمٌّ وطفلٌ بينهما. الطفل يتقدّم الوالدين فيتداخل معهما، فيُرسم
    حوله فراغٌ بلون البطاقة (`bg`) يفصله عنهما — بلا هذا الفراغ تلتحم
    الأشكال الثلاثة كتلةً واحدة في الحجم الصغير. ولهذا تأخذ الأيقونة
    لون خلفيّتها: الفراغ يجب أن يساوي ما تحته تماماً. */
function FamilyIcon({ size, ink, bg }: { size: number; ink: string; bg: string }) {
  const { ink: blue } = TRAVELLER_PALETTE.male_solo;
  const { ink: pink } = TRAVELLER_PALETTE.female_solo;
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none" aria-hidden="true">
      {/* الأب — يسار */}
      <circle cx="11.6" cy="12.4" r="5.1" fill={blue} />
      <path d="M11.6 19.3c-4.9 0-8.4 2.9-9.1 7.2l-1 6.6A2 2 0 0 0 3.5 35.4h16.2a2 2 0 0 0 2-2.3l-1-6.6c-.7-4.3-4.2-7.2-9.1-7.2Z" fill={blue} />
      {/* الأم — يمين */}
      <path d="M32.4 5.9c-4 0-7 3.1-7 7.1 0 2.4.8 4.2 2.2 5.3l-.6 1.9h10.8l-.6-1.9c1.4-1.1 2.2-2.9 2.2-5.3 0-4-3-7.1-7-7.1Z" fill={pink} />
      <path d="M32.4 20.2c-3.8 0-6.3 2.2-7.1 6.2l-1.5 7.1a2 2 0 0 0 1.9 2.4h13.4a2 2 0 0 0 1.9-2.4l-1.5-7.1c-.8-4-3.3-6.2-7.1-6.2Z" fill={pink} />
      {/* الطفل — بينهما وأمامهما، بفراغٍ يفصله */}
      <g stroke={bg} strokeWidth="2.6" strokeLinejoin="round">
        <circle cx="22" cy="26.6" r="4.1" />
        <path d="M22 32.1c-3.9 0-6.6 2.3-7.1 5.8l-.3 2.2a1.7 1.7 0 0 0 1.7 2h11.4a1.7 1.7 0 0 0 1.7-2l-.3-2.2c-.5-3.5-3.2-5.8-7.1-5.8Z" />
      </g>
      <circle cx="22" cy="26.6" r="4.1" fill={ink} />
      <path d="M22 32.1c-3.9 0-6.6 2.3-7.1 5.8l-.3 2.2a1.7 1.7 0 0 0 1.7 2h11.4a1.7 1.7 0 0 0 1.7-2l-.3-2.2c-.5-3.5-3.2-5.8-7.1-5.8Z" fill={ink} />
    </svg>
  );
}

/** رسم النوع وحده — للصفّ المختصر في شاشة الباقة وأي موضعٍ يعرض
    الاختيار بعد وقوعه. `bg` لون ما تحته، تحتاجه العائلة وحدها. */
export function TravellerIcon({ type, size = 44, bg = C.white }: { type: TravellerType; size?: number; bg?: string }) {
  const ink = TRAVELLER_PALETTE[type].ink;
  if (type === "male_solo") return <MaleIcon size={size} ink={ink} />;
  if (type === "female_solo") return <FemaleIcon size={size} ink={ink} />;
  return <FamilyIcon size={size} ink={ink} bg={bg} />;
}

/** شبكة الاختيار — ثلاثة مربّعات متجاورة.

    `aspect-ratio: 1` لا ارتفاعٌ ثابت: المربّع يتبع عرض الشاشة فيبقى
    مربّعاً على جوالٍ ضيّقٍ وعريض. والنص تحته يلتفّ سطرين عند الحاجة
    بلا أن يقصّ — لهذا الارتفاع الأدنى للنص سطران محجوزان سلفاً، وإلا
    قفزت البطاقات حين يطول اسمٌ ويقصر آخر. */
/** يفصل «رجال — فرد أو أكثر» إلى عنوانٍ ووصف. الشرطة الطويلة في نصّ
    الترجمة هي الفاصل، فيبقى للنوع نصٌّ واحدٌ في i18n يُقرأ كاملاً في
    صفوف المراجعة ويُعرض مقسوماً في البطاقة — لا مفتاحان يتفارقان حين
    يُعدَّل أحدهما وحده. */
function splitLabel(label: string): [string, string] {
  const i = label.indexOf("—");
  return i < 0 ? [label.trim(), ""] : [label.slice(0, i).trim(), label.slice(i + 1).trim()];
}

/** شبكة الاختيار — ثلاثة مربّعات متجاورة.

    الارتفاع يُترك للشبكة تُسوّيه (stretch) بدل ارتفاعٍ محجوز بالأسطر:
    «عائلة» بلا وصفٍ تحتها، وأخواتها بسطرين، والثلاثة تتساوى تلقائياً
    لأنها صفٌّ واحد. ونصُّ البطاقة يتوسّط ما تبقّى، فتبدو «عائلة»
    مقصودةً في مركزها لا ناقصةً سطراً. */
export function TravellerTypeGrid({ value, onPick, t }: {
  value: TravellerType | "";
  onPick: (v: TravellerType) => void;
  t: (k: string) => string;
}) {
  return (
    <div role="radiogroup" aria-label={t("whoTravels")}
      style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 9, alignItems: "stretch" }}>
      {TRAVELLER_TYPES.map(type => {
        const { ink, tint } = TRAVELLER_PALETTE[type];
        const selected = value === type;
        const [title, sub] = splitLabel(t(type));
        /* خلفية البطاقة تُمرَّر إلى الرسم: فراغ الطفل في أيقونة العائلة
           يساوي ما تحته، وهو يتبدّل بين المختار وغيره. */
        const bg = selected ? tint : C.white;
        return (
          <motion.button key={type} type="button" role="radio" aria-checked={selected}
            aria-label={t(type)}
            onClick={() => onPick(type)} whileTap={{ scale: 0.97 }}
            className="relative flex flex-col items-center"
            style={{
              padding: "14px 7px 12px", gap: 9, cursor: "pointer", fontFamily: "inherit",
              borderRadius: R.card, background: bg,
              /* الحدّ سميكٌ في الحالتين ويتبدّل لونه وحده: لو رقّ غير
                 المختار لانزاح المحتوى بكسر البكسل عند كل نقرة. */
              border: `2px solid ${selected ? ink : C.border}`,
              boxShadow: selected ? `0 4px 14px -6px ${ink}66` : "none",
              transition: "background .16s, border-color .16s, box-shadow .16s",
            }}>
            <span className="flex items-center justify-center"
              style={{
                width: 56, height: 56, borderRadius: R.pill, flexShrink: 0,
                background: selected ? C.white : tint,
                transition: "background .16s",
              }}>
              <TravellerIcon type={type} size={40} bg={selected ? C.white : tint} />
            </span>
            <span className="flex flex-col items-center justify-center flex-1" style={{ gap: 2 }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.25, color: selected ? ink : C.ink, textAlign: "center" }}>{title}</span>
              {sub && <span style={{ fontSize: 10.5, fontWeight: 500, lineHeight: 1.3, color: selected ? ink : C.ink2, opacity: selected ? .85 : 1, textAlign: "center" }}>{sub}</span>}
            </span>
            {selected && (
              <span className="absolute flex items-center justify-center"
                style={{ top: 6, insetInlineEnd: 6, width: 20, height: 20, borderRadius: R.pill, background: ink, color: C.white }}>
                <Check size={13} strokeWidth={3} />
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
