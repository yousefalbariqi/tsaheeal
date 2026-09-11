import { useEffect, useMemo, useState } from "react";
import { BellRing, CheckCheck } from "lucide-react";
import { useNavigate } from "react-router";
import { B } from "@/lib/theme";
import { isSupabaseEnabled, supabase } from "@/supabase/client";
import { useStore } from "@/store/useStore";

type NotificationRow = {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  created_at: string;
  read_at: string | null;
};

function relativeTime(value: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `منذ ${minutes} د`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} س`;
  return `منذ ${Math.floor(hours / 24)} ي`;
}

/** قائمة التنبيهات لا تخمّن رقماً محلياً: الجدول هو مصدر الحقيقة للمستخدم الحالي. */
export function NotificationsMenu() {
  const navigate = useNavigate();
  const userId = useStore(s => s.currentUser?.id);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const unread = useMemo(() => rows.filter(n => !n.read_at).length, [rows]);

  useEffect(() => {
    if (!isSupabaseEnabled || !supabase || !userId) { setRows([]); return; }
    let alive = true;
    void supabase.from("notifications").select("id,title,body,href,created_at,read_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(8)
      .then(({ data, error }) => {
        /* قبل تشغيل الترحيل لا نحول رأس كل صفحة إلى حالة خطأ. */
        if (!alive || error) return;
        setRows((data ?? []) as NotificationRow[]);
      });
    return () => { alive = false; };
  }, [userId]);

  const markRead = () => {
    const unreadIds = rows.filter(n => !n.read_at).map(n => n.id);
    if (!unreadIds.length) return;
    const readAt = new Date().toISOString();
    setRows(prev => prev.map(n => unreadIds.includes(n.id) ? { ...n, read_at: readAt } : n));
    if (isSupabaseEnabled && supabase) {
      void supabase.from("notifications").update({ read_at: readAt }).in("id", unreadIds);
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) markRead();
  };

  return (
    <div className="relative">
      <button onClick={toggle} aria-label={unread ? `التنبيهات، ${unread} غير مقروءة` : "التنبيهات"}
        title="التنبيهات" className="relative w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer"
        style={{ background: B.primaryDeep, border: "none" }}>
        <BellRing size={15} style={{ color: B.gold }} />
        {unread > 0 && <span aria-hidden="true" className="absolute -top-1 -left-1 min-w-4 h-4 px-1 rounded-full flex items-center justify-center font-bold"
          style={{ background: B.gold, color: B.black, fontSize: 9 }}>{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && <>
        <button aria-label="إغلاق قائمة التنبيهات" className="fixed inset-0 z-20 cursor-default" style={{ background: "transparent", border: "none" }} onClick={() => setOpen(false)} />
        <section role="dialog" aria-label="التنبيهات" className="absolute left-0 mt-2 z-30 w-80 max-w-[calc(100vw-2rem)] rounded-2xl overflow-hidden"
          style={{ background: "#fff", border: `1px solid ${B.border}`, boxShadow: "0 16px 36px rgba(18,34,31,.18)" }}>
          <header className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: `1px solid ${B.border}` }}>
            <BellRing size={15} style={{ color: B.gold }} />
            <strong className="text-sm flex-1" style={{ color: B.black }}>التنبيهات</strong>
            <span className="text-xs" style={{ color: B.muted }}>{rows.length ? "تم تعليمها كمقروءة" : "لا توجد تنبيهات"}</span>
          </header>
          {rows.length === 0
            ? <div className="px-4 py-8 text-center text-sm" style={{ color: B.muted }}>لا توجد تنبيهات جديدة</div>
            : <div className="max-h-96 overflow-y-auto">
              {rows.map(n => <button key={n.id} onClick={() => { setOpen(false); if (n.href) navigate(n.href); }}
                className="w-full text-right px-4 py-3.5 cursor-pointer" style={{ background: "#fff", border: "none", borderBottom: `1px solid ${B.border}` }}>
                <span className="block text-sm font-bold" style={{ color: B.black }}>{n.title}</span>
                {n.body && <span className="block mt-0.5 text-xs leading-5" style={{ color: B.text2 }}>{n.body}</span>}
                <span className="block mt-1 text-xs" style={{ color: B.muted }}>{relativeTime(n.created_at)}</span>
              </button>)}
            </div>}
          <footer className="px-4 py-2.5 flex items-center gap-1.5 text-xs" style={{ color: B.muted }}><CheckCheck size={14} /> تُحدّث من حسابك فقط</footer>
        </section>
      </>}
    </div>
  );
}
