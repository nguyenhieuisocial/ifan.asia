import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";
import { taoNonce, xayDungCsp } from "@/lib/security/csp";
import { NHA_SAU_DANG_NHAP } from "@/lib/auth/noi-quay-lai";

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
  /**
   * ⚠️ ĐƯỜNG DẪN ĐANG XEM, để Server Component đọc lại được qua `headers()`.
   *   Next KHÔNG trao đường dẫn cho layout — mà `app/admin/layout.tsx` có một
   *   lớp chặn thứ hai (vé hết hạn giữa cổng gác và lúc dựng trang), và trước
   *   22/08 lớp đó gọi thẳng `redirect("/login")` nên **đánh rơi địa chỉ đang
   *   xem**. Có tiêu đề này thì nó dựng được `?next=` y như cổng gác.
   *   ⚠️ Bên nhận vẫn phải lọc qua `noiQuayLai()` — đây là tiêu đề của REQUEST,
   *   không phải giá trị đáng tin tự thân.
   */
  requestHeaders.set("x-duong-dan", request.nextUrl.pathname + request.nextUrl.search);

  const taoResponse = () =>
    NextResponse.next({ request: { headers: requestHeaders } });

  let response = taoResponse();

  const { pathname } = request.nextUrl;
  const canGac =
    pathname.startsWith("/app") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/admin");

  // Hai CỬA VÀO. Người ĐÃ đăng nhập mà mở lại /login hay /signup thì thấy ô
  // nhập mật khẩu — và kết luận mình vừa bị đăng xuất, dù phiên còn nguyên.
  // Founder báo đúng chuyện này ngày 22/08, và nó khớp với mọi số liệu: máy chủ
  // không hề cắt phiên của ai (có phiên sống 11,6 giờ), nhưng người dùng vẫn
  // "phải đăng nhập lại hoài" — vì cái họ thấy là CÁI FORM, không phải phiên hết hạn.
  const cuaVao = pathname === "/login" || pathname === "/signup";

  if (canGac || cuaVao) {
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

    // Đã đăng nhập mà đứng ở cửa vào ⇒ đi thẳng vào trong.
    // Muốn vào bằng tài khoản khác thì đăng xuất trước (menu người dùng) —
    // giống mọi phần mềm cùng loại, và không có ngoại lệ nào ở đây để tránh
    // biến tham số URL thành cách lách cửa.
    if (user && cuaVao) {
      const url = request.nextUrl.clone();
      url.search = "";
      url.pathname = NHA_SAU_DANG_NHAP;
      const vaoTrong = NextResponse.redirect(url);
      if (csp) vaoTrong.headers.set("content-security-policy", csp);
      return vaoTrong;
    }

    // Chưa đăng nhập mà đứng ở cửa vào là chuyện BÌNH THƯỜNG — không chặn.
    if (!user && canGac) {
      const url = request.nextUrl.clone();
      // Nhớ chỗ người ta đang đứng để đăng nhập xong quay lại đúng việc dở,
      // thay vì luôn ném về màn Tổng quan. Trang /login chỉ CHUYỂN TIẾP chuỗi
      // này; nơi lọc nó là `noiQuayLai` trong app/auth/actions.ts.
      const cho = pathname + request.nextUrl.search;
      url.pathname = "/login";
      url.search = "";
      url.searchParams.set("next", cho);
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
