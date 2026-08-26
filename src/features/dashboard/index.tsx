/* الرئيسية — كانت «قيد البناء» وهي أول ما يفتحه الموظف.

   قصدها سؤال واحد: ما الذي يحتاج عملاً الآن؟ لا لوحة أرقامٍ للزينة.
   لذلك ترتيبها: صفّ الأرقام، ثم «يحتاج إجراءً» (وكلّ بندٍ فيه ينقل إلى
   شاشته)، ثم رحلات الأسبوع، ثم آخر الطلبات.

   البند الأول في «يحتاج إجراءً» هو تجاوز وعد الردّ: الطلب الذي مضى على
   إرساله أكثر من الوعد. هذا ما يخسر عميلاً، وكان لا يظهر في أي شاشة —
   الموظف يعرفه إن فتح شاشة الطلبات وقرأ التواريخ صفّاً صفّاً.

   كل الأرقام مشتقّة من المخزن لحظةَ الرسم — لا حالة ثانية تتفارق معه. */
import { useMemo } from "react";
import { motion } from "motion/react";
import {
  AlertTriangle, ArrowLeft, BookOpen, CalendarClock, CreditCard,
  Sparkles, TrendingUp, Users,
} from "lucide-react";
import { B } from "@/lib/theme";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { useStore } from "@/store/useStore";
import { todayYMD } from "@/lib/utils";
import type { Booking, Trip } from "@/types";

const money = (n: number) => Math.round(n).toLocaleString("en-US");

/** يوم بإزاحة — لنافذة «الأسبوع القادم» بلا مكتبة تواريخ. */
function ymdPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** لحظة إرسال الطلب. submittedAt طابع كامل، وcreatedAt تاريخ بلا ساعة —
    فالثاني يُقرأ بداية يومه: تقديرٌ متحفّظ لا يزعم دقّةً لا نملكها. */
function sentAt(b: Booking): number | null {
  if (b.submittedAt) { const t = Date.parse(b.submittedAt); if (!Number.isNaN(t)) return t; }
  if (b.createdAt) { const t = Date.parse(b.createdAt.replace(" ", "T")); if (!Number.isNaN(t)) return t; }
  return null;
}

const hoursSince = (t: number) => (Date.now() - t) / 3_600_000;

/** بطاقة «يحتاج إجراءً» — الرقم والنقل إلى شاشته. */
function ActionRow({ icon: Icon, label, count, note, tone, onGo }: {
  icon: typeof BookOpen; label: string; count: number; note: string;
  tone: { bg: string; br: string; fg: string }; onGo: () => void;
}) {
  if (!count) return null;
  return (
    <button onClick={onGo}
      className="w-full flex items-center gap-3 px-4 py-3.5 text-start cursor-pointer rounded-xl"
      style={{ background: tone.bg, border: `1px solid ${tone.br}` }}>
      <Icon size={17} style={{ color: tone.fg, flexShrink: 0 }} />
      <span className="flex-1 min-w-0">
        <span className="block font-bold text-sm" style={{ color: tone.fg }}>
          {label} · <span style={{ fontFamily: "var(--font-app)" }}>{count}</span>
        </span>
        <span className="block text-xs mt-0.5" style={{ color: tone.fg, opacity: 0.8 }}>{note}</span>
      </span>
      <ArrowLeft size={15} style={{ color: tone.fg, flexShrink: 0, opacity: 0.7 }} />
    </button>
  );
}

const TONE = {
  red: { bg: "#FBE6E6", br: "#F3C9C9", fg: "#BE2626" },
  amber: { bg: "#FBF3D6", br: "#E8D9A8", fg: "#8A6A08" },
  violet: { bg: "#F1E9FA", br: "#D8BBFA", fg: "#7226BE" },
  blue: { bg: "#EAF1FE", br: "#C9DBFB", fg: "#1E52C7" },
};

export function DashboardPage({ onMenuOpen, onNav }: { onMenuOpen?: () => void; onNav: (v: string) => void }) {
  const bookings = useStore(s => s.bookings);
  const trips = useStore(s => s.trips);
  const packages = useStore(s => s.packages);
  const payments = useStore(s => s.payments);
  const customRequests = useStore(s => s.customRequests);
  const beneficiaries = useStore(s => s.beneficiaries);

  const today = todayYMD();
  const weekEnd = useMemo(() => ymdPlus(7), []);
  const monthPrefix = today.slice(0, 7);

  const pkgName = useMemo(() => {
    const m = new Map(packages.map(p => [p.id, p.name]));
    return (id?: string) => (id ? m.get(id) ?? "—" : "—");
  }, [packages]);
  const tripOf = useMemo(() => {
    const m = new Map(trips.map(t => [t.id, t]));
    return (id: string) => m.get(id);
  }, [trips]);

  const m = useMemo(() => {
    const pending = bookings.filter(b => b.status === "new" || b.status === "reviewing");
    /* الوعد ساعتا عمل؛ العتبة هنا بالساعة الجدارية عن قصد: هذه شاشة
       تشغيل تريد «تأخّر» لا حسابَ الوعد بدقّته. الحساب الدقيق في
       features/customer/sla.ts وهو ما يُعرض للمستفيد. */
    const late = pending.filter(b => { const t = sentAt(b); return t !== null && hoursSince(t) > 2; });
    const awaitingPay = bookings.filter(b => b.status === "awaiting_payment");
    const failedPay = payments.filter(p => p.payStatus === "failed");
    const newRequests = customRequests.filter(r => r.status === "new");

    const monthRevenue = bookings
      .filter(b => ["paid", "verified", "confirmed"].includes(b.status) && b.createdAt?.startsWith(monthPrefix))
      .reduce((a, b) => a + b.total, 0);

    const upcoming = trips
      .filter(t => t.status === "open" || t.status === "full")
      .filter(t => t.departureDate >= today && t.departureDate <= weekEnd)
      .sort((a, b) => a.departureDate.localeCompare(b.departureDate));

    const todayBookings = bookings.filter(b => b.createdAt?.startsWith(today));

    const recent = [...bookings]
      .sort((a, b) => (sentAt(b) ?? 0) - (sentAt(a) ?? 0))
      .slice(0, 8);

    return { pending, late, awaitingPay, failedPay, newRequests, monthRevenue, upcoming, todayBookings, recent };
  }, [bookings, trips, payments, customRequests, today, weekEnd, monthPrefix]);

  const seatBar = (t: Trip) => {
    const pct = t.seats > 0 ? Math.min(100, Math.round((t.bookedSeats / t.seats) * 100)) : 0;
    /* اللون على الامتلاء: الرحلة القريبة نصف فارغة تحتاج بيعاً، والممتلئة
       تحتاج انتباهاً لقائمة الانتظار. */
    const fg = pct >= 95 ? "#BE2626" : pct >= 60 ? "#1E7A44" : "#8A6A08";
    return { pct, fg };
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-screen" style={{ background: B.bg }}>
      <PageHeader title="الرئيسية" crumb="نظرة عامة" search="" onSearch={() => {}} onMenuOpen={onMenuOpen} />

      <main className="flex-1 px-4 md:px-8 pb-12 pt-5 flex flex-col gap-5">
        {/* ── الأرقام ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="إيراد هذا الشهر" value={`${money(m.monthRevenue)} ر.س`} sub="مدفوع ومؤكَّد" accent />
          <StatCard label="طلبات اليوم" value={m.todayBookings.length} sub="وصلت اليوم" />
          <StatCard label="قيد المراجعة" value={m.pending.length} sub="بانتظار قرار موظف" />
          <StatCard label="رحلات الأسبوع" value={m.upcoming.length} sub="تنطلق خلال ٧ أيام" />
        </div>

        {/* ── يحتاج إجراءً ── */}
        <section className="rounded-2xl p-5" style={{ background: "#fff", border: `1px solid ${B.border}` }}>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="font-extrabold text-base" style={{ color: B.black, margin: 0 }}>يحتاج إجراءً</h2>
            <span className="text-xs" style={{ color: B.muted }}>اضغط البند لتفتح شاشته</span>
          </div>
          <div className="flex flex-col gap-2.5">
            <ActionRow icon={AlertTriangle} tone={TONE.red}
              label="طلبات تجاوزت وعد الردّ" count={m.late.length}
              note="مضى على إرسالها أكثر من ساعتين ولم يُتّخذ قرار"
              onGo={() => onNav("bookings")} />
            <ActionRow icon={BookOpen} tone={TONE.amber}
              label="طلبات قيد المراجعة" count={m.pending.length - m.late.length}
              note="داخل الوعد — تُراجَع وتُقبل أو تُرفض"
              onGo={() => onNav("bookings")} />
            <ActionRow icon={CreditCard} tone={TONE.violet}
              label="بانتظار الدفع" count={m.awaitingPay.length}
              note="أُرسل رابط الدفع ولم يُسدَّد بعد"
              onGo={() => onNav("payments")} />
            <ActionRow icon={AlertTriangle} tone={TONE.red}
              label="عمليات دفع فاشلة" count={m.failedPay.length}
              note="تحتاج تواصلاً مع العميل أو إعادة إرسال الرابط"
              onGo={() => onNav("payments")} />
            <ActionRow icon={Sparkles} tone={TONE.blue}
              label="طلبات مخصّصة جديدة" count={m.newRequests.length}
              note="رحلات حسب الطلب بانتظار عرض سعر"
              onGo={() => onNav("customRequests")} />
            {/* لا شيء معلّق: يُقال صريحاً بدل قسمٍ فارغ يُقرأ عطلاً. */}
            {!m.late.length && m.pending.length === 0 && !m.awaitingPay.length
              && !m.failedPay.length && !m.newRequests.length && (
              <div className="flex items-center gap-2.5 px-4 py-4 rounded-xl"
                style={{ background: "#E3F3E8", border: "1px solid #C4E4CE", color: "#1E7A44" }}>
                <TrendingUp size={16} />
                <span className="text-sm font-bold">لا شيء معلّق — كل الطلبات متابَعة.</span>
              </div>
            )}
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* ── رحلات الأسبوع ── */}
          <section className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: `1px solid ${B.border}` }}>
            <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: `1px solid ${B.border}` }}>
              <CalendarClock size={16} style={{ color: B.gold }} />
              <h2 className="font-extrabold text-base flex-1" style={{ color: B.black, margin: 0 }}>رحلات الأسبوع</h2>
              <button onClick={() => onNav("trips")} className="text-xs font-bold cursor-pointer"
                style={{ background: "none", border: "none", color: B.text2 }}>كل الرحلات</button>
            </div>
            {m.upcoming.length === 0
              ? <div className="px-5 py-10 text-center text-sm" style={{ color: B.muted }}>لا رحلات تنطلق خلال سبعة أيام</div>
              : m.upcoming.map((t, i) => {
                  const { pct, fg } = seatBar(t);
                  return (
                    <div key={t.id} className="px-5 py-3.5" style={{ borderTop: i ? `1px solid ${B.border}` : "none" }}>
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <span className="font-bold text-sm truncate" style={{ color: B.black }}>{pkgName(t.packageId)}</span>
                        <span className="text-xs flex-shrink-0" style={{ color: B.muted, fontFamily: "var(--font-app)" }}>
                          {t.departureDate} · {t.departureTime}
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "#EEECEA" }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: fg }} />
                        </div>
                        <span className="text-xs font-bold flex-shrink-0" style={{ color: fg, fontFamily: "var(--font-app)" }}>
                          {t.bookedSeats}/{t.seats}
                        </span>
                      </div>
                    </div>
                  );
                })}
          </section>

          {/* ── آخر الطلبات ── */}
          <section className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: `1px solid ${B.border}` }}>
            <div className="flex items-center gap-2 px-5 py-4" style={{ borderBottom: `1px solid ${B.border}` }}>
              <BookOpen size={16} style={{ color: B.gold }} />
              <h2 className="font-extrabold text-base flex-1" style={{ color: B.black, margin: 0 }}>آخر الطلبات</h2>
              <button onClick={() => onNav("bookings")} className="text-xs font-bold cursor-pointer"
                style={{ background: "none", border: "none", color: B.text2 }}>كل الطلبات</button>
            </div>
            {m.recent.length === 0
              ? <div className="px-5 py-10 text-center text-sm" style={{ color: B.muted }}>لا طلبات بعد</div>
              : m.recent.map((b, i) => (
                  <div key={b.id} className="flex items-center gap-3 px-5 py-3"
                    style={{ borderTop: i ? `1px solid ${B.border}` : "none" }}>
                    <span className="flex-1 min-w-0">
                      <span className="block truncate font-bold text-sm" style={{ color: B.black }}>{b.clientName}</span>
                      <span className="block truncate text-xs" style={{ color: B.muted }}>
                        {pkgName(b.packageId ?? tripOf(b.tripId)?.packageId)} · {b.persons} معتمر
                      </span>
                    </span>
                    <span className="text-xs font-bold flex-shrink-0" style={{ color: B.gold, fontFamily: "var(--font-app)" }}>
                      {money(b.total)} ر.س
                    </span>
                    <StatusBadge status={b.status} />
                  </div>
                ))}
          </section>
        </div>

        {/* ── سطر ختامي: أرقام السجل ── */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {([
            ["إجمالي الطلبات", bookings.length, "منذ البداية", "bookings"],
            ["الباقات النشطة", packages.filter(p => p.status === "active").length, "معروضة للحجز", "packages"],
            ["المستفيدون", beneficiaries.length, "في السجل", "beneficiaries"],
            ["الرحلات المفتوحة", trips.filter(t => t.status === "open").length, "قابلة للحجز", "trips"],
          ] as const).map(([label, value, sub, view]) => (
            <button key={label} onClick={() => onNav(view)}
              className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-start cursor-pointer"
              style={{ background: "#fff", border: `1px solid ${B.border}` }}>
              <Users size={15} style={{ color: B.muted, flexShrink: 0 }} />
              <span className="flex-1 min-w-0">
                <span className="block text-xs" style={{ color: B.muted }}>{label}</span>
                <span className="block font-extrabold" style={{ color: B.black, fontFamily: "var(--font-app)" }}>
                  {value} <span className="text-xs font-normal" style={{ color: B.muted }}>{sub}</span>
                </span>
              </span>
            </button>
          ))}
        </motion.div>
      </main>
    </div>
  );
}
