import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordLoginEvent } from "@/lib/auth/login-events";

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
    // Cửa này cũng lấy được phiên đăng nhập (nhận lời mời, xác nhận đăng ký,
    // link đặt lại mật khẩu) — ghi nhật ký đăng nhập (chỉ đạo founder 11/08).
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: member } = await supabase
        .from("tenant_members")
        .select("tenant_id")
        .limit(1)
        .maybeSingle();
      await recordLoginEvent(supabase, {
        userId: user.id,
        tenantId: (member?.tenant_id as string | undefined) ?? null,
        method: "confirm_link",
        headers: request.headers,
      });
    }
    url.pathname = safeNext;
    return NextResponse.redirect(url);
  }

  url.pathname = "/forgot-password";
  url.searchParams.set("error", "linkInvalid");
  return NextResponse.redirect(url);
}
