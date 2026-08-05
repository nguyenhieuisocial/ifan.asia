import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Cửa đổi mã trong thư lấy phiên đăng nhập tạm, rồi đưa sang màn đặt mật khẩu mới.
 *
 * NHẬN HAI KIỂU MÃ vì mẫu thư quyết định kiểu nào, mà mẫu thư lại phụ thuộc gói
 * Supabase:
 *  - `code`       — thư MẶC ĐỊNH của Supabase (đang dùng). Đổi được vì trình
 *                   duyệt còn giữ mẩu bí mật lúc bấm "gửi link", nên chỉ chạy
 *                   khi mở thư TRÊN CÙNG TRÌNH DUYỆT đã yêu cầu.
 *  - `token_hash` — thư TỰ SOẠN (`supabase/email-templates/recovery.html`), bật
 *                   được khi có SMTP riêng. Không cần mẩu bí mật nên mở thư ở
 *                   máy nào cũng được — đây mới là cái chủ tiệm cần, vì họ hay
 *                   bấm gửi trên máy tính rồi mở thư trên điện thoại.
 *
 * `next` là CỬA CHUYỂN HƯỚNG: chỉ nhận đường dẫn nội bộ. Nhận nguyên xi thì
 * `?next=https://trang-gia.com` biến thư của iFan thành mồi lừa đảo — cùng loại
 * lỗi đã vá ở trang quét mã QR.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  const code = params.get("code");
  const next = params.get("next") ?? "/reset-password";
  // Một dấu "/" mở đầu, không phải "//" (đó là địa chỉ ngoài rút gọn)
  const safeNext = /^\/(?!\/)[\w\-./]*$/.test(next) ? next : "/reset-password";

  const url = request.nextUrl.clone();
  url.search = "";

  const supabase = await createClient();
  let ok = false;
  if (tokenHash && type === "recovery") {
    const { error } = await supabase.auth.verifyOtp({
      type: "recovery",
      token_hash: tokenHash,
    });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  if (ok) {
    url.pathname = safeNext;
    return NextResponse.redirect(url);
  }

  url.pathname = "/forgot-password";
  url.searchParams.set("error", "linkInvalid");
  return NextResponse.redirect(url);
}
