/* عميل Supabase — بيانات الـseed لا تظهر إلا في التطوير المحلي، فلا يمكن
   لنشر إنتاج ناقص الإعدادات أن يعرض أسماء وأرقاماً تجريبية على أنها حقيقية. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

export const isSupabaseEnabled = !!supabase;
export const isSeedDataEnabled = !isSupabaseEnabled && import.meta.env.DEV && import.meta.env.VITE_USE_SEED_DATA !== "0";
