/* دفتر المسافرين — المعتمرون الذين سافروا مع صاحب الحساب.

   يُبذَر مرة من booking_pilgrims في حجوزاته السابقة ثم يعيش مستقلاً:
   تعديل بيانات شخص هنا لا يمسّ سجلّ حجز ماضٍ، والحجز وثيقة لما حدث.
   انظر supabase/migrations/20260809_customer_travellers.sql.

   في الوضع التجريبي (بلا جلسة JWT) يعمل الدفتر على المخزن المحلي —
   نفس قاعدة data.ts: ما يستلزم هوية موثّقة لا يُنادى بلا جلسة. */
import type { DocType } from "@/data/docTypes";
import { supabase, isSupabaseEnabled } from "@/supabase/client";
import { customerSupabase } from "@/supabase/customerClient";
const cust = () => customerSupabase ?? supabase!;
const remote = () => isSupabaseEnabled && !!supabase;

export interface Traveller {
  id: string;
  name: string;
  docType?: DocType;
  idNumber: string;
  nationality: string;
  gender: "male" | "female";
  ageGroup: "adult" | "child";
  birthDate: string;
  phone: string;
}

const fromRow = (r: Record<string, unknown>): Traveller => ({
  id: String(r.id),
  name: (r.name ?? "") as string,
  docType: (r.doc_type || undefined) as DocType | undefined,
  idNumber: (r.id_number ?? "") as string,
  nationality: (r.nationality ?? "") as string,
  gender: ((r.gender as string) === "female" ? "female" : "male"),
  ageGroup: ((r.age_group as string) === "child" ? "child" : "adult"),
  birthDate: (r.birth_date ?? "") as string,
  phone: (r.phone ?? "") as string,
});

const toRow = (t: Traveller) => ({
  name: t.name.trim(), doc_type: t.docType ?? null, id_number: t.idNumber.trim(),
  nationality: t.nationality, gender: t.gender, age_group: t.ageGroup,
  birth_date: t.birthDate, phone: t.phone.replace(/\s/g, ""),
});

/* ── مخزن الوضع التجريبي ────────────────────────────────────────── */
const KEY = "tasaheel_travellers";
const readLocal = (): Traveller[] => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Traveller[]; }
  catch { return []; }
};
const writeLocal = (rows: Traveller[]) => {
  try { localStorage.setItem(KEY, JSON.stringify(rows)); } catch { /* تخزين محظور */ }
};

export async function fetchTravellers(): Promise<Traveller[]> {
  if (remote()) {
    const { data, error } = await cust().rpc("my_travellers");
    if (error) { console.error("[travellers] تعذّر الجلب:", error); return []; }
    return ((data as Record<string, unknown>[]) ?? []).map(fromRow);
  }
  return readLocal();
}

/** يعيد الصف بعد الحفظ — المعرّف يأتي من القاعدة عند الإضافة. */
export async function saveTraveller(t: Traveller): Promise<Traveller> {
  if (remote()) {
    const { data: sess } = await cust().auth.getSession();
    const uid = sess.session?.user.id;
    if (!uid) throw new Error("auth_required");
    const row = toRow(t);
    const q = t.id
      ? cust().from("customer_travellers").update(row).eq("id", t.id).select("*").single()
      : cust().from("customer_travellers").insert({ ...row, customer_id: uid }).select("*").single();
    const { data, error } = await q;
    if (error) throw error;
    return fromRow(data as Record<string, unknown>);
  }
  const rows = readLocal();
  const saved: Traveller = { ...t, id: t.id || `LT-${Date.now()}` };
  const i = rows.findIndex(r => r.id === saved.id);
  if (i >= 0) rows[i] = saved; else rows.push(saved);
  writeLocal(rows);
  return saved;
}

export async function deleteTraveller(id: string): Promise<void> {
  if (remote()) {
    const { error } = await cust().from("customer_travellers").delete().eq("id", id);
    if (error) throw error;
    return;
  }
  writeLocal(readLocal().filter(r => r.id !== id));
}

export const emptyTraveller = (): Traveller => ({
  id: "", name: "", docType: undefined, idNumber: "", nationality: "",
  gender: "male", ageGroup: "adult", birthDate: "", phone: "",
});
