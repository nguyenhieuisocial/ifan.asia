import { SUPABASE_URL } from "@/lib/config";

/**
 * Content-Security-Policy có nonce theo từng request (việc #204).
 *
 * VÌ SAO PHẢI CÓ: CSP là lớp chặn CUỐI khi một lỗ XSS đã lọt qua khâu thoát dấu.
 * Kho này nhận nội dung do người NGOÀI nhập ở rất nhiều cửa — form thu lead trên
 * mặt tiền tiệm `/t/[slug]`, hộp chat trực tuyến, tên khách, ghi chú, tên hàng
 * hoá. Không có CSP thì đúng MỘT chỗ thoát dấu hỏng là chạy được mã tuỳ ý.
 *
 * VÌ SAO KHÔNG ĐẶT Ở `next.config.ts`: Next dựng trang bằng script nội tuyến
 * (bootstrap hydration + payload RSC `self.__next_f.push`). Muốn chặn chặt mà
 * vẫn cho những script ĐÓ chạy thì phải cấp cho chúng một vé dùng-một-lần khác
 * nhau ở mỗi lượt tải — tức nonce. Header tĩnh trong `next.config.ts` không sinh
 * được vé đó, nên CSP phải dựng ở `proxy.ts`.
 *
 * ⛔ TUYỆT ĐỐI KHÔNG thêm `'unsafe-inline'` vào `script-src`. Làm vậy là mở cửa
 * cho đúng thứ CSP sinh ra để chặn — CSP còn nguyên trong header, mọi công cụ
 * quét vẫn báo "có CSP", nhưng nó không chặn gì cả. Thà không có CSP còn hơn có
 * một cái tạo cảm giác an toàn giả.
 *
 * ⚠️ ĐIỀU KIỆN ĐỂ CÁCH NÀY ĐÚNG: mọi trang HTML phải được dựng theo từng request
 * (dynamic). Trang dựng sẵn lúc build sẽ mang một nonce đóng băng, không khớp
 * nonce của header ⇒ trắng trang. Kho này thoả điều kiện đó: `i18n/request.ts`
 * đọc `cookies()` để lấy ngôn ngữ, mà nó chạy ở khung gốc, nên `next build` xếp
 * TẤT CẢ trang HTML vào nhóm `ƒ (Dynamic)` — đã soát trên bảng route ngày
 * 20/08/2026, chỉ còn `robots.txt` · `sitemap.xml` · `manifest.webmanifest` ·
 * `opengraph-image` · `apple-icon.png` là tĩnh, mà chúng không phải HTML nên
 * không chạy script. Nếu sau này có trang nào được dựng sẵn thì trang đó phải
 * gọi `await connection()`, nếu không sẽ gãy.
 */

/** Gốc của Supabase (`https://<dự-án>.supabase.co`) — suy từ biến môi trường,
 *  KHÔNG nhúng cứng, để đổi dự án Supabase không phải sửa CSP. */
const GOC_SUPABASE = new URL(SUPABASE_URL).origin;

/**
 * PostHog — đo hành vi người dùng. Chỉ mở khi có khoá; không có khoá thì không
 * nới CSP một chút nào.
 *
 * ⚠️ HAI tên miền, thiếu một là hỏng NGẦM: `us.i.posthog.com` nhận sự kiện gửi
 *   lên, còn `us-assets.i.posthog.com` phục vụ phần mã tải-thêm-khi-cần (ghi
 *   phiên, khảo sát). Thiếu cái thứ hai thì phần lõi vẫn chạy nên nhìn tưởng
 *   ổn — chỉ mất im lặng những tính năng nạp sau.
 *
 * ⚠️ KHÔNG cần khai vào `script-src`: thư viện được đóng gói vào bản dựng, không
 *   nạp bằng thẻ script từ xa. Nếu sau này đổi sang nạp từ xa thì `strict-dynamic`
 *   sẽ cho phép, nhưng lúc đó phải đọc lại chỗ này.
 */
const GOC_POSTHOG = process.env.NEXT_PUBLIC_POSTHOG_KEY
  ? " https://us.i.posthog.com https://us-assets.i.posthog.com"
  : "";

/** Cùng máy chủ nhưng qua WebSocket — Realtime của Supabase (Hộp thư, Thông báo)
 *  mở `wss://…/realtime/v1/websocket`. Thiếu dòng này là hộp thư ngừng tự cập nhật. */
const GOC_SUPABASE_WS = GOC_SUPABASE.replace(/^https:/, "wss:");

const LA_BAN_THAT = process.env.NODE_ENV === "production";

/** Sinh nonce cho một lượt tải trang: 16 byte ngẫu nhiên mã hoá base64.
 *
 *  Dùng `crypto.getRandomValues` + `btoa` (đều có sẵn ở Edge runtime nơi
 *  `proxy.ts` chạy) thay vì `Buffer`, để không phụ thuộc lớp đệm Node của Next. */
export function taoNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/** Dựng chuỗi CSP cho một lượt tải trang, gắn sẵn `nonce`. */
export function xayDungCsp(nonce: string): string {
  const directives = [
    // Mặc định: chỉ cho phép tài nguyên cùng tên miền. Mọi directive không khai
    // báo bên dưới đều rơi về đây, nên đây là đáy an toàn.
    `default-src 'self'`,

    // ─────────────────────────────────────────────────────────────────────
    // script-src — directive quan trọng nhất, cũng là lý do cả việc #204 tồn tại
    // ─────────────────────────────────────────────────────────────────────
    // `'nonce-…'`  : chỉ script mang đúng vé của lượt tải này mới chạy. Kẻ tấn
    //                công chèn được thẻ <script> vào HTML cũng không đoán được
    //                vé (16 byte ngẫu nhiên, đổi mỗi lượt).
    // `'strict-dynamic'` : script ĐÃ được tin (có nonce) được phép tự nạp thêm
    //                script con. Bắt buộc phải có, vì Next nạp các mảnh mã của
    //                trang bằng JS chứ không bằng thẻ <script> viết sẵn trong
    //                HTML — không có nó thì mọi trang trắng.
    //                ⚠️ Hệ quả: khi có 'strict-dynamic', trình duyệt BỎ QUA
    //                'self' và mọi tên miền liệt kê ở script-src. Nên thẻ
    //                <script src> nào nằm thẳng trong HTML cũng PHẢI mang nonce
    //                — xem `app/livechat-demo/page.tsx`.
    // ⛔ KHÔNG có 'unsafe-inline'. ⛔ KHÔNG có 'unsafe-eval' ở bản thật.
    //    Bản dev cần 'unsafe-eval' vì cơ chế nạp-nóng (HMR) của Next chạy mã qua
    //    eval; nó chỉ bật khi NODE_ENV khác "production" nên không ra tới khách.
    `script-src 'nonce-${nonce}' 'strict-dynamic'${LA_BAN_THAT ? "" : " 'unsafe-eval'"}`,

    // ─────────────────────────────────────────────────────────────────────
    // style-src — CHỖ DUY NHẤT PHẢI NỚI. Lý do đầy đủ ở ghi chú cuối file.
    // ─────────────────────────────────────────────────────────────────────
    // ⚠️ CỐ Ý KHÔNG gắn nonce vào đây: theo luật CSP, hễ một directive có nonce
    // thì 'unsafe-inline' bị BỎ QUA — thêm nonce vào là gãy đúng những chỗ dưới.
    `style-src 'self' 'unsafe-inline'`,

    // Ảnh: cùng tên miền, `data:` cho mã QR (sinh tại chỗ bằng canvas →
    // toDataURL, xem app/app/settings/qr) và `blob:` cho ảnh xem trước tạm.
    // Thêm gốc Supabase vì ảnh đính kèm và logo tiệm nằm ở kho lưu trữ riêng,
    // lấy về bằng URL ký có hạn (createSignedUrl).
    `img-src 'self' data: blob: ${GOC_SUPABASE}`,

    /**
     * ÂM THANH / VIDEO. Thiếu dòng này thì `media-src` rơi về `default-src
     * 'self'` — và thẻ <audio> của LỜI NHẮN THOẠI trong Chat nội bộ chết câm.
     *
     * ⚠️ ĐO ĐƯỢC 22/08 trên bản dựng thật, TRƯỚC khi có dòng này: tệp ghi âm
     *   lên kho đàng hoàng (75 KB, WebM/Opus, giải mã ra đúng 4,6 giây có
     *   tiếng), đường dẫn ký hợp lệ, kho trả về `Content-Type: audio/webm` và
     *   nhận cả yêu cầu theo đoạn. Nhưng trình duyệt vẫn từ chối:
     *   `Refused to load media from '…supabase.co/…'`, `networkState = 3`,
     *   `error.code = 4`, `play()` ném `NotSupportedError`.
     *
     * ⚠️ VÌ SAO KHÔNG AI THẤY: người dùng thấy một thanh phát nhạc BÌNH THƯỜNG,
     *   bấm nút phát thì không có gì xảy ra. Không có thông báo nào trên màn.
     *   Dấu vết duy nhất nằm trong bảng điều khiển của trình duyệt — chỗ không
     *   một chủ tiệm nào mở. Cùng họ với `camera=()`: một dòng header ở tầng
     *   khác hẳn giết một tính năng đã viết xong.
     *
     * ⚠️ `img-src` ở trên ĐÃ có gốc Supabase từ ngày thêm ảnh đính kèm, nhưng
     *   `media-src` thì không — vì lúc đó chưa có gì phát ra tiếng. Thêm một
     *   loại tệp mới phải soát lại CSP, đó là bài học ở đây.
     */
    `media-src 'self' ${GOC_SUPABASE}`,

    // Phông chữ do `next/font` tải sẵn về máy chủ lúc build, phục vụ từ
    // /_next/static/media — nên chỉ cần 'self'. Không gọi ra Google Fonts.
    `font-src 'self'`,

    // Nơi mã JS được phép GỌI RA: API của chính mình, Supabase (đăng nhập, đọc
    // ghi dữ liệu, kho tệp) và kênh Realtime qua WebSocket.
    `connect-src 'self' ${GOC_SUPABASE} ${GOC_SUPABASE_WS}${GOC_POSTHOG}${LA_BAN_THAT ? "" : " ws: http://localhost:*"}`,

    // Service worker (public/sw.js). PHẢI khai riêng: khi thiếu, worker-src rơi
    // về script-src — mà script-src có 'strict-dynamic' nên bản đăng ký sẽ bị
    // chặn, mất phần đọc-được-lúc-mất-mạng của PWA.
    `worker-src 'self'`,

    // App không nhúng iframe nào (đã soát toàn kho: không có thẻ <iframe>).
    `frame-src 'none'`,

    // Ai được nhúng TRANG NÀY vào iframe của họ. Giữ đúng mức đang chạy của
    // X-Frame-Options: SAMEORIGIN — chống lừa bấm trên màn /app.
    `frame-ancestors 'self'`,

    // Chặn <base href> — thủ thuật đổi gốc đường dẫn để bẻ mọi URL tương đối
    // sang máy chủ của kẻ tấn công.
    `base-uri 'none'`,

    // <form> chỉ được gửi về chính mình. Server Action đều cùng tên miền.
    `form-action 'self'`,

    // Không dùng <object>/<embed>/Flash — bịt hẳn.
    `object-src 'none'`,
  ];

  // Ép mọi request http:// lẻ sang https://. Chỉ bật ở bản thật; bật ở máy dev
  // sẽ ép luôn http://localhost sang https và làm gãy phiên làm việc.
  if (LA_BAN_THAT) directives.push("upgrade-insecure-requests");

  return directives.join("; ");
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * GHI CHÚ VỀ CHỖ ĐÃ NỚI: vì sao `style-src` có `'unsafe-inline'`
 * ─────────────────────────────────────────────────────────────────────────────
 * Đây là nới CÓ CHỦ ĐÍCH và ĐÃ ĐO, không phải đoán trước cho chắc. Ngày
 * 20/08/2026 đã chạy bản build thật với `style-src 'self' 'nonce-…'` (chặt nhất)
 * rồi mở bằng trình duyệt và đọc sự kiện `securitypolicyviolation`. Kết quả:
 * `script-src` KHÔNG vi phạm ở bất kỳ trang nào, chỉ kiểu dáng vi phạm, ở đúng
 * HAI nhóm — cả hai đều là kiểu dáng của chính sản phẩm:
 *
 *   1. `style-src-attr` — thuộc tính `style="…"` React dựng sẵn ở máy chủ.
 *      Đo trên trang chủ: 7 vi phạm, đúng bằng số thuộc tính có trong HTML —
 *      6 thẻ hiệu ứng cuộn mang biến `--rise-start`, và 1 thẻ <img> của
 *      `next/image` mang `color:transparent`.
 *      ⚠️ Nonce KHÔNG chữa được nhóm này: nonce chỉ gắn vào THẺ, không gắn vào
 *      THUỘC TÍNH. Đây là giới hạn của chuẩn CSP, không phải chuyện chưa làm tới.
 *      (Cùng trang còn 2 thuộc tính `style` KHÔNG vi phạm — `color-scheme` của
 *      next-themes và `next-route-announcer` — vì chúng do JS gán qua thuộc tính
 *      đối tượng, đường đó CSP không chặn. Chi tiết này để lần sau khỏi mất công
 *      đi sửa nhầm hai chỗ vô tội.)
 *
 *   2. `style-src-elem` — bảng kiểu mà thư viện tự chèn LÚC CHẠY. Đo được: thẻ
 *      <style> của `sonner` (hộp thông báo). Nó không có chỗ nào cho truyền
 *      nonce vào. HTML do máy chủ trả về KHÔNG chứa thẻ <style> nào — đã soát —
 *      nên đây hoàn toàn là thứ sinh ra ở trình duyệt.
 *
 * VÌ SAO CHẤP NHẬN ĐƯỢC: nới ở `style-src` KHÁC HẲN nới ở `script-src`. Kiểu
 * dáng nội tuyến không chạy được mã. Bị lợi dụng thì cùng lắm là bóp méo giao
 * diện, hoặc dò dữ liệu bằng cách trỏ ảnh nền ra ngoài — mà `img-src` phía trên
 * đã chốt sẵn danh sách nơi được tải ảnh, nên đường dò đó cũng đã bịt. Đúng thứ
 * CSP này sinh ra để chặn — chạy mã tuỳ ý — vẫn bị chặn nguyên vẹn, vì
 * `script-src` không hề có 'unsafe-inline'.
 *
 * ĐIỀU KIỆN ĐỂ SIẾT LẠI SAU NÀY (phải xong CẢ HAI mới bỏ được 'unsafe-inline'):
 *   · Nhóm 1: bỏ hết `style={{ … }}` dựng ở máy chủ — đổi 6 thẻ `--rise-start`
 *     sang lớp Tailwind hoặc biến đặt trong tệp .css. Còn `color:transparent`
 *     là của `next/image`, phải chờ Next bỏ nó.
 *   · Nhóm 2: chờ `sonner` cho truyền nonce xuống thẻ <style> nó chèn, hoặc đổi
 *     sang cách hiện thông báo không cần chèn bảng kiểu lúc chạy.
 *   Xong nhóm 1 trước thì đã siết được một nửa: tách thành
 *   `style-src-elem 'self' 'unsafe-inline'` + `style-src-attr 'none'`.
 */
