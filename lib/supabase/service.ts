import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { SUPABASE_URL } from "../config";

/**
 * Supabase client chạy bằng SERVICE ROLE — CHỈ dùng phía server (channel
 * adapter, webhook, worker). TUYỆT ĐỐI không import vào client component:
 * service key bỏ qua RLS.
 *
 * Trả null khi env SUPABASE_SERVICE_ROLE_KEY chưa cấu hình (two-mode như
 * AI gateway — caller tự xử lý thay vì crash).
 *
 * Import tương đối (không alias "@/") để module chạy được cả dưới Node thuần
 * (proof/unit script) lẫn Next bundler.
 */
export function createServiceClient(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createSupabaseClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
