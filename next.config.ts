import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  experimental: {
    // Nhập Excel gửi file qua server action dạng base64 (~+35% dung lượng):
    // trần 2MB file gốc cần hơn mức mặc định 1MB của Next.
    serverActions: { bodySizeLimit: "4mb" },
  },

  /**
   * Header bảo vệ trình duyệt. Trước đây KHÔNG có cái nào — màn /app nhúng
   * iframe được (lừa bấm), và không có nosniff.
   *
   * KHÔNG đặt CSP ở đây, và ĐỪNG thêm vào: Next dùng inline script cho hydration
   * nên CSP chặt cần nonce theo từng request, mà header tĩnh ở file này không
   * sinh được nonce. Đặt CSP nửa vời (unsafe-inline) chỉ tạo cảm giác an toàn giả.
   *
   * ✅ ĐÃ LÀM (việc #204): CSP thật nằm ở `proxy.ts`, dựng bằng
   * `lib/security/csp.ts` — mỗi lượt tải một nonce riêng, script-src KHÔNG có
   * unsafe-inline. Muốn sửa CSP thì sửa ở đó, không phải ở đây.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Chặn nhúng iframe từ tên miền khác (chống lừa bấm).
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          /**
           * ⚠️ `geolocation=(self)` CHỨ KHÔNG PHẢI `geolocation=()`.
           *
           * Bản cũ chặn vị trí với MỌI nguồn, kể cả chính iFan — và điều đó
           * giết luôn một tính năng đang có: **chấm công theo vị trí**
           * (`app/app/team/punch-panel.tsx`). Đo 22/08 bằng cổng
           * `soat-man-that`: mở màn Nhân sự & Chấm công là trình duyệt bắn lỗi
           * đỏ *"Geolocation access has been blocked because of a permissions
           * policy"*, và nút "Đặt vị trí tiệm" bị khoá vĩnh viễn vì nó chỉ mở
           * khi lấy được toạ độ. Chủ tiệm KHÔNG BAO GIỜ đặt được vị trí tiệm.
           *
           * Mã màn có xử lý lỗi tử tế (rơi về trạng thái "bị từ chối") nên
           * không ai thấy có gì vỡ — đúng kiểu hỏng im lặng: tính năng vẫn bày
           * ra, bấm vào thì không đi tới đâu.
           *
           * `(self)` chỉ cho phép CHÍNH trang iFan hỏi vị trí, và trình duyệt
           * vẫn hỏi ý người dùng trước. Nguồn thứ ba (iframe, quảng cáo) vẫn bị
           * chặn. Camera và micro giữ nguyên chặn hoàn toàn — chưa màn nào cần.
           */
          /**
           * ⚠️ CAMERA mở `(self)` từ 22/08 vì chấm công có chụp ảnh.
           *
           *   Dòng này TRƯỚC ĐÓ ghi `camera=()` — chặn hoàn toàn, kể cả chính
           *   iFan. Hệ quả: tính năng chụp ảnh chấm công ra bản 20/08 và **CHƯA
           *   TỪNG CHẠY ĐƯỢC LẦN NÀO**. Không ai biết, vì công tắc "bắt chụp
           *   ảnh" mặc định tắt ở mọi tiệm nên chưa ai chạm tới. Lộ ra 22/08
           *   khi thử bật: trình duyệt báo *"Permissions policy violation:
           *   camera is not allowed in this document"*.
           *
           *   Đây là loại lỗi tệ nhất trong họ này — tính năng ĐÃ CÓ ĐỦ: màn,
           *   nút, chỗ lưu, chốt quyền, cả chữ đóng dấu lên ảnh. Nhìn vào thấy
           *   xong. Thiếu đúng một dòng cấu hình ở tầng khác hẳn, và nó im lặng.
           *
           * ⚠️ MICRO cũng mở `(self)` từ 22/08 — CÙNG MỘT LỖI, phát hiện muộn hơn
           *   camera vài giờ. Màn Chat nội bộ có nút ghi âm
           *   (`app/app/chat/nut-ghi-am.tsx` gọi `getUserMedia({audio:true})`),
           *   nhưng `microphone=()` chặn hoàn toàn ⇒ nút đó **chưa từng chạy
           *   được lần nào**, và trình duyệt chỉ trả `NotAllowedError` chung
           *   chung nên trông y hệt "người dùng bấm Từ chối".
           *
           *   ⚠️ Câu "chưa màn nào cần micro" từng nằm đúng ở đây, và nó SAI từ
           *   ngày màn Chat có nút ghi âm. Tệ hơn: tôi còn viết câu đó vào cổng
           *   canh `quyen-camera-smoke.mjs` như một phép kiểm — tức cổng đang
           *   KHOÁ LỖI LẠI thay vì bắt nó. Một chú thích sai nguy hiểm hơn
           *   không có chú thích; một CỔNG sai còn nguy hơn nữa.
           */
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self)" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
      {
        // Mã nhúng hộp chat PHẢI cho website của chủ shop tải được.
        source: "/livechat.js",
        headers: [{ key: "Access-Control-Allow-Origin", value: "*" }],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
