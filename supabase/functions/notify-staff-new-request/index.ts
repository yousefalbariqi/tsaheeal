import { createClient } from "npm:@supabase/supabase-js@2";

type Notification = {
  id: string;
  entity_table: "bookings" | "custom_requests";
  entity_id: string;
  status: "queued" | "sending" | "sent" | "failed";
};

const required = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing Edge Function secret: ${name}`);
  return value;
};

const escapeHtml = (value: unknown) => String(value ?? "—")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const line = (label: string, value: unknown) =>
  `<tr><td style="padding:7px 0;color:#7a6752;font-size:13px">${escapeHtml(label)}</td><td style="padding:7px 0;color:#322316;font-size:14px;font-weight:700;text-align:left" dir="ltr">${escapeHtml(value)}</td></tr>`;

const adminLink = (baseUrl: string, entity: string, id: string) => {
  const url = new URL(baseUrl);
  url.searchParams.set("notification", "email");
  url.searchParams.set("entity", entity);
  url.searchParams.set("id", id);
  return url.toString();
};

const page = (title: string, intro: string, rows: string, href: string) => `<!doctype html>
<html lang="ar" dir="rtl"><body style="margin:0;background:#f7f2ea;font-family:Arial,sans-serif;color:#322316">
  <main style="max-width:560px;margin:24px auto;padding:28px;background:#fff;border:1px solid #eadfce;border-radius:16px">
    <h1 style="margin:0 0 8px;font-size:22px;color:#164f49">${escapeHtml(title)}</h1>
    <p style="margin:0 0 18px;color:#715f4b;line-height:1.7">${escapeHtml(intro)}</p>
    <table style="width:100%;border-collapse:collapse" dir="rtl">${rows}</table>
    <a href="${escapeHtml(href)}" style="display:inline-block;margin-top:20px;padding:11px 16px;background:#a56e20;color:#fff;text-decoration:none;border-radius:9px;font-weight:bold">فتح الطلب في الإدارة</a>
    <p style="margin:20px 0 0;color:#998b7b;font-size:11px">رسالة آلية من نظام تساهيل — لا تشارك بيانات العميل خارج فريق العمل.</p>
  </main>
</body></html>`;

Deno.serve(async (request) => {
  let notification: Notification | undefined;
  try {
    const payload = await request.json();
    notification = payload?.record as Notification | undefined;
    if (!notification?.id || !notification.entity_table || notification.status !== "queued") {
      return Response.json({ ignored: true });
    }

    const supabase = createClient(
      required("SUPABASE_URL"),
      required("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );
    const { data: claimed, error: claimError } = await supabase.rpc(
      "claim_staff_email_notification",
      { p_id: notification.id },
    );
    if (claimError) throw claimError;
    if (!claimed) return Response.json({ ignored: true, reason: "already claimed" });

    const { data: record, error: recordError } = await supabase
      .from(notification.entity_table)
      .select("*")
      .eq("id", notification.entity_id)
      .single();
    if (recordError) throw recordError;

    const isBooking = notification.entity_table === "bookings";
    const title = isBooking ? "حجز جديد" : "طلب مخصص جديد";
    const rows = isBooking
      ? [
          line("رقم الحجز", record.id),
          line("اسم العميل", record.client_name),
          line("رقم الجوال", record.client_phone),
          line("عدد الأشخاص", record.persons),
          line("المبلغ", record.total ? `${record.total} ر.س` : "—"),
          line("حالة الحجز", record.status),
        ].join("")
      : [
          line("رقم الطلب", record.id),
          line("اسم العميل", record.name),
          line("رقم الجوال", record.phone),
          line("عدد الأشخاص", record.persons),
          line("الوجهة", record.destination),
          line("مدينة العميل", record.city),
          line("تاريخ الذهاب", record.depart_date),
          line("تاريخ العودة", record.return_date),
        ].join("");

    const recipients = required("STAFF_NOTIFICATION_RECIPIENTS")
      .split(",")
      .map(email => email.trim())
      .filter(Boolean);
    if (!recipients.length) throw new Error("STAFF_NOTIFICATION_RECIPIENTS has no valid recipients");

    /* Resend يقبل عنواناً واحداً أو مصفوفة عناوين؛ ملف البيئة أسهل كقائمة
       مفصولة بفواصل، لذلك نحوّلها هنا بدلاً من تمريرها كنص واحد. */
    const replyTo = (Deno.env.get("NOTIFICATION_REPLY_TO") ?? "")
      .split(",")
      .map(email => email.trim())
      .filter(Boolean);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${required("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: required("NOTIFICATION_FROM"),
        to: recipients,
        ...(replyTo.length ? { reply_to: replyTo } : {}),
        subject: `[${record.id}] ${title} — تساهيل`,
        html: page(
          title,
          isBooking ? "وصل حجز جديد ويحتاج إلى متابعة الفريق." : "وصل طلب رحلة مخصصة جديد ويحتاج إلى متابعة الفريق.",
          rows,
          adminLink(required("ADMIN_APP_URL"), notification.entity_table, record.id),
        ),
      }),
    });
    const resend = await response.json();
    if (!response.ok) throw new Error(resend?.message ?? "Resend rejected the email");

    const { error: sentError } = await supabase
      .from("staff_email_notifications")
      .update({
        status: "sent",
        provider_message_id: resend.id ?? null,
        last_error: null,
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", notification.id);
    if (sentError) throw sentError;
    return Response.json({ sent: true, id: notification.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected email notification failure";
    if (notification?.id) {
      try {
        const supabase = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
        await supabase.from("staff_email_notifications").update({
          status: "failed",
          last_error: message.slice(0, 1000),
          retry_after: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", notification.id);
      } catch {
        // لا نكشف الأسرار أو الرسالة الداخلية في الاستجابة.
      }
    }
    console.error("notify-staff-new-request failed", message);
    return Response.json({ error: "notification delivery failed" }, { status: 500 });
  }
});
