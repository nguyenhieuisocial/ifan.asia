"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Xin mã nối Telegram cho CHÍNH người đang đăng nhập.
 *
 * Không nhận tham số nào — mã do CSDL sinh dựa trên phiên đăng nhập
 * (`auth.uid()` bên trong `tg_link_code`). Nhận user_id từ trình duyệt là mời
 * người ta xin mã của người khác rồi chiếm tài khoản.
 */
export async function createLinkCode(): Promise<{ code: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("tg_link_code");
  if (error) {
    console.error("[account] tg_link_code lỗi:", error.message);
    return { code: null };
  }
  return { code: typeof data === "string" ? data : null };
}
