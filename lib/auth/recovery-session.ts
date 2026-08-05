import type { createClient } from "@/lib/supabase/server";

/**
 * Phiên hiện tại có phải do bấm link đặt lại mật khẩu tạo ra không?
 *
 * VÌ SAO CẦN: màn đặt mật khẩu mới KHÔNG hỏi mật khẩu cũ — đúng, vì người dùng
 * đang ở đó chính vì họ quên. Nhưng nếu chỉ kiểm "đã đăng nhập chưa" thì ai
 * mượn được máy đang mở iFan cũng vào thẳng màn đó đổi mật khẩu mà không cần
 * biết gì. Tiệm dùng chung một máy ở quầy là chuyện thường, nên đây là đường
 * chiếm tài khoản có thật.
 *
 * Cách phân biệt: Supabase ghi cách xác thực vào chính token đã ký —
 * đăng nhập bằng mật khẩu là `password`, đổi mã trong thư ra phiên là `otp`.
 * Token do Supabase ký nên không tự thêm dấu vào được.
 */
export async function isRecoverySession(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<boolean> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return false;
  try {
    const payload = JSON.parse(
      Buffer.from(session.access_token.split(".")[1], "base64url").toString(),
    ) as { amr?: { method?: string }[] };
    return (payload.amr ?? []).some(
      (m) => m?.method === "otp" || m?.method === "recovery",
    );
  } catch {
    return false;
  }
}
