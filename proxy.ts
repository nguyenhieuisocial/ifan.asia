import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";
import { taoNonce, xayDungCsp } from "@/lib/security/csp";

/**
 * Hai việc, một chỗ (Next 16: proxy.ts thay middleware.ts):
 *   1. Phát CSP kèm nonce cho MỌI trang HTML — xem `lib/security/csp.ts`.
 *   2. Làm mới phiên đăng nhập + chặn /app, /onboarding, /admin khi chưa đăng nhập.
 *
 * Hai việc này khác phạm vi: CSP cần phủ mọi trang, còn chốt đăng nhập chỉ được
 * chạy ở ba nhánh kín. Trước đây `matcher` gánh cả phần lọc đó; nay `matcher`
 * mở rộng cho CSP nên phần lọc phải chuyển vào thân hàm (biến `canGac`) —
 * KHÔNG được để mỗi trang công khai cũng gọi Supabase một lượt.
 */
export async function proxy(request: NextRequest) {
  // Lượt nạp-trước (prefetch) của router KHÔNG được cấp nonce: Next giữ lại
  // payload RSC đó trong bộ nhớ rồi dùng cho lần bấm sau, lúc ấy trang đã mang
  // nonce khác ⇒ vé cũ thành vé chết và script bị chặn. Bỏ qua CSP ở đây là an
  // toàn vì payload RSC không phải tài liệu HTML, không tự chạy script; tài liệu
  // thật vẫn nhận đủ CSP ở lượt tải thường.
  const laNapTruoc =
    request.headers.has("next-router-prefetch") ||
    request.headers.get("purpose") === "prefetch";

  const nonce = taoNonce();
  const csp = laNapTruoc ? null : xayDungCsp(nonce);

  // Đặt CSP vào header của REQUEST, không chỉ của response: Next đọc chính
  // header này để tự gắn nonce vào các script nội tuyến do nó sinh ra (bootstrap
  // hydration, payload RSC). Chỉ đặt ở response thì header có mà script của Next
  // không có vé ⇒ trắng trang. `x-nonce` để Server Component đọc lại qua
  // `headers()` khi cần tự gắn vé cho thẻ <script> của mình.
  const requestHeaders = new Headers(request.headers);
  if (csp) {
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("content-security-policy", csp);
  }

  const taoResponse = () =>
    NextResponse.next({ request: { headers: requestHeaders } });

  let response = taoResponse();

  const { pathname } = request.nextUrl;
  const canGac =
    pathname.startsWith("/app") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/admin");

  if (canGac) {
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          // `request.cookies.set` sửa header `cookie` của request gốc, còn
          // `requestHeaders` là BẢN SAO chụp từ trước — phải chép lại, nếu không
          // phiên vừa làm mới sẽ không tới được trang.
          requestHeaders.set("cookie", request.headers.get("cookie") ?? "");
          response = taoResponse();
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      const chuyenHuong = NextResponse.redirect(url);
      if (csp) chuyenHuong.headers.set("content-security-policy", csp);
      return chuyenHuong;
    }
  }

  if (csp) response.headers.set("content-security-policy", csp);
  return response;
}

// /admin có mặt ở đây để phiên đăng nhập được làm mới; QUYỀN vào khu super-admin
// do layout /admin quyết định (RPC is_platform_admin → 404 nếu không phải).
//
// Phạm vi MỞ RỘNG so với bản trước (chỉ 3 nhánh kín) vì CSP phải phủ mọi trang
// HTML — kể cả trang công khai, nơi có form thu lead và hộp chat nhận chữ do
// người ngoài nhập. Ba nhóm bị loại vì không phải tài liệu HTML nên CSP vô
// nghĩa, mà chạy proxy trên chúng chỉ tổ thêm độ trễ:
//   · `_next/static`, `_next/image` — mã và ảnh đã tối ưu;
//   · `api/` — trả JSON;
//   · mọi đường dẫn có đuôi tệp (`.js`, `.png`, `.webmanifest`…) — tệp tĩnh
//     trong public/, gồm cả `livechat.js` mà website tiệm khác tải về.
export const config = {
  matcher: ["/((?!_next/static|_next/image|api/|.*\\.[\\w]+$).*)"],
};
