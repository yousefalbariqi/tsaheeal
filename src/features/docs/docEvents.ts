/* أحداث المستندات — الإرسال والطباعة والتنزيل والمسح.

   العلّة: زرّ «إرسال واتساب» كان يفتح نافذة ولا يترك أثراً. فلا أحد
   يعرف هل أُرسلت الفاتورة، ولا متى، ولا مَن أرسلها، ولا هل وصلت. وضغطُه
   مرّتين يرسل رسالتين — والعميل يتلقّى فاتورته مكرّرة.

   ومنعُ التكرار لا يكون في حالة المكوّن: تبويبان مفتوحان على نفس
   الفاتورة يتجاوزانه. السجلّ في القاعدة هو المرجع، والواجهة تقرؤه.

   `outcome` نتيجةٌ يسجّلها الموظف يدوياً (وصلت · لم يردّ · رقم خاطئ)
   وفق قرار ٢٠٢٦-٠٩-٠٦: لا واجهة برمجية لواتساب، فلا سبيل لمعرفة
   المصير آلياً — والادّعاء بمعرفته أسوأ من الاعتراف بجهله. */
import { supabase, isSupabaseEnabled } from "@/supabase/client";
import type { DocEvent, DocEventType, DocEventKind as Kind } from "@/types";

export type DocType = DocEventType;
export type DocEventKind = Kind;

/** نتائج الإرسال التي يختارها الموظف. */
export const SEND_OUTCOMES = ["وصلت", "لم يردّ", "رقم خاطئ"] as const;
/** نتائج التواصل في الطلب المخصّص — يسجّلها الموظف بعد المكالمة أو الرسالة. */
export const CONTACT_OUTCOMES = ["تم التواصل", "لم يردّ", "طلب مهلة", "رقم خاطئ"] as const;

const rowToEvent = (r: any): DocEvent => ({
  id: r.id, docType: r.doc_type, docId: r.doc_id, event: r.event,
  actorName: r.actor_name ?? undefined, outcome: r.outcome ?? undefined,
  note: r.note ?? undefined, createdAt: r.created_at,
});

/** يسجّل حدثاً. يعيد معرّفه، أو null في وضع التجربة أو عند الفشل.

    الفشل لا يُرمى: تسجيل الحدث أثرٌ جانبيّ للإجراء لا الإجراء نفسه —
    ورسالةُ خطأٍ حمراء بعد إرسال ناجح تُربك أكثر ممّا تُفيد. يُسجَّل في
    الطرفية ويُترك للمراجعة. */
export async function logDocEvent(
  docType: DocType, docId: string, event: DocEventKind,
  opts: { outcome?: string; note?: string } = {},
): Promise<number | null> {
  if (!isSupabaseEnabled || !supabase) return null;
  const { data, error } = await supabase.rpc("log_document_event", {
    p_doc_type: docType, p_doc_id: docId, p_event: event,
    p_outcome: opts.outcome ?? null, p_note: opts.note ?? null,
  });
  if (error) { console.error("[docEvents] تعذّر تسجيل الحدث:", error); return null; }
  return (data as number) ?? null;
}

/** أحداث مستندٍ، الأحدث أولاً. */
export async function fetchDocEvents(docType: DocType, docId: string): Promise<DocEvent[]> {
  if (!isSupabaseEnabled || !supabase) return [];
  const { data, error } = await supabase
    .from("document_events")
    .select("*")
    .eq("doc_type", docType).eq("doc_id", docId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) { console.error("[docEvents] تعذّر جلب السجلّ:", error); return []; }
  return (data ?? []).map(rowToEvent);
}

/** يحدّث نتيجة إرسالٍ سجّله الموظف. */
export async function setEventOutcome(id: number, outcome: string): Promise<void> {
  if (!isSupabaseEnabled || !supabase) return;
  const { error } = await supabase.from("document_events").update({ outcome }).eq("id", id);
  if (error) console.error("[docEvents] تعذّر حفظ النتيجة:", error);
}

/** إلغاء فاتورة بسبب إلزامي. يعيد رسالة خطأ عربية أو null عند النجاح. */
export async function cancelInvoice(id: string, reason: string): Promise<string | null> {
  if (!isSupabaseEnabled || !supabase) return "غير متاح في وضع التجربة.";
  const { error } = await supabase.rpc("cancel_invoice", { p_id: id, p_reason: reason });
  if (!error) return null;
  const m = String(error.message ?? "");
  if (/forbidden/i.test(m)) return "الإلغاء لمدير النظام وحده.";
  if (/reason_required/i.test(m)) return "سبب الإلغاء إلزامي.";
  if (/not_found_or_not_issued/i.test(m)) return "الفاتورة غير قائمة أو أُلغيت من قبل.";
  return m;
}

/** استرجاع مبلغ. يعيد رسالة خطأ عربية أو null عند النجاح. */
export async function refundInvoice(
  id: string, amount: number, ref: string, reason: string,
): Promise<string | null> {
  if (!isSupabaseEnabled || !supabase) return "غير متاح في وضع التجربة.";
  const { error } = await supabase.rpc("refund_invoice", {
    p_id: id, p_amount: amount, p_ref: ref, p_reason: reason,
  });
  if (!error) return null;
  const m = String(error.message ?? "");
  if (/forbidden/i.test(m)) return "الاسترجاع لمدير النظام وحده.";
  if (/bad_amount/i.test(m)) return "مبلغ الاسترجاع غير صحيح — لا يتجاوز إجمالي الفاتورة.";
  if (/not_found/i.test(m)) return "الفاتورة غير موجودة.";
  return m;
}

export interface ScanResult { ok: boolean; phase: string; message: string; scanNo: number }

/** مسح تذكرة — يسجّل المسح ويعيد طورها ورسالةً للموظف على الباب. */
export async function scanTicket(ticketNo: string): Promise<ScanResult> {
  if (!isSupabaseEnabled || !supabase) {
    return { ok: false, phase: "unknown", message: "غير متاح في وضع التجربة.", scanNo: 0 };
  }
  const { data, error } = await supabase.rpc("ticket_scan", { p_ticket_no: ticketNo });
  if (error) {
    console.error("[docEvents] تعذّر مسح التذكرة:", error);
    return { ok: false, phase: "unknown", message: "تعذّر التحقق — أعد المحاولة.", scanNo: 0 };
  }
  const r = Array.isArray(data) ? data[0] : data;
  return {
    ok: !!r?.ok, phase: r?.phase ?? "unknown",
    message: r?.message ?? "", scanNo: r?.scan_no ?? 0,
  };
}
