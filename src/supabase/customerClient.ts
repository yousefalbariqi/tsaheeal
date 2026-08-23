/* عميل Supabase الخاص بالمستفيد — منفصل عن عميل الموظف عن قصد.

   عميل واحد = مفتاح تخزين واحد = خانة جلسة واحدة. لو تشاركا العميل
   لَمَحَت جلسة المستفيد (دخول بالجوال على "/") جلسة الموظف على
   "/admin" والعكس، ولانطلق onAuthStateChange في مخزن الموظف مع كل
   تحديث رمز للمستفيد فيُعيد جلب اللوحة بلا داعٍ.

   عميل الموظف في client.ts يبقى بلا storageKey صريح: تغييره يُسقط
   جلسات كل الموظفين الحاليين. مفتاحه الافتراضي sb-<ref>-auth-token
   لا يتقاطع مع المفتاح هنا. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const CUSTOMER_STORAGE_KEY = "tasaheel-customer-auth";

export const customerSupabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          storageKey: CUSTOMER_STORAGE_KEY,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false, // لا روابط سحرية هنا — يمنع تنازع العميلين على الـURL
        },
      })
    : null;

export const isCustomerAuthEnabled = !!customerSupabase;
