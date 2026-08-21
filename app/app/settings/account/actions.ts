"use server";

import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

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

/**
 * ĐĂNG XUẤT KHỎI MỌI THIẾT BỊ KHÁC.
 *
 * ⚠️ `scope: "others"` — KHÔNG đăng xuất chính máy đang bấm. Đá luôn máy hiện
 *   tại thì người dùng bấm xong bị văng ra màn đăng nhập và tưởng mình vừa làm
 *   hỏng cái gì đó.
 *
 * ⚠️ KHÔNG trả về "đã đăng xuất N máy". Supabase không cho biết con số đó, và
 *   bịa một con số là nói dối người dùng về chính việc bảo vệ tài khoản họ vừa
 *   làm. Chỉ nói "xong".
 *
 * Vì sao cần: trước bản này việc đó CHỈ xảy ra kèm đổi mật khẩu. Người để quên
 * tài khoản trên máy quầy hoặc máy người khác không có cách nào tự đóng phiên
 * kia — mà đổi mật khẩu chỉ để đăng xuất một máy là một việc nặng và phiền.
 */
export async function dangXuatMoiThietBiKhac(): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "notAuthenticated" };

  // Giới hạn tần suất: đây là thao tác bảo vệ tài khoản, không phải nút bấm
  // liên tục. Năm lượt một phút là quá đủ cho người thật.
  const { allowed } = await rateLimit(`dangxuatkhac:${user.id}`, 5, 60);
  if (!allowed) return { error: "tooMany" };

  const { error } = await supabase.auth.signOut({ scope: "others" });
  if (error) return { error: "saveFailed" };
  return { error: null };
}
