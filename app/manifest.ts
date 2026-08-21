import type { MetadataRoute } from "next";

/**
 * BẢN KHAI PWA — thứ biến iFan từ "một trang web có lối tắt" thành một app.
 *
 * Bốn nhóm khai báo, mỗi nhóm giải quyết một việc khác nhau:
 *
 * 1. NHẬN DẠNG (`id`, `scope`, `start_url`) — `id` là thứ trình duyệt dùng để
 *    biết "đây vẫn là app cũ" khi mọi thứ khác đổi. Không khai thì nó lấy
 *    `start_url` làm mã, và ngày nào đổi màn mở đầu là ngày người dùng có HAI
 *    biểu tượng iFan trên máy.
 *
 * 2. HÌNH THỨC (`display`, `display_override`, `orientation`, màu) —
 *    `display_override` xin chế độ đẹp hơn trước, và tự lùi về `standalone` ở
 *    trình duyệt chưa hỗ trợ.
 *
 * 3. LỐI TẮT (`shortcuts`) — giữ biểu tượng app trên điện thoại thì hiện ra
 *    một menu nhỏ. Bốn việc dưới đây là bốn việc mở nhiều nhất trong ngày; đi
 *    thẳng tới đó là bớt hai ba lần chạm mỗi lần.
 *
 * 4. NHẬN CHIA SẺ (`share_target`) — đây là thứ ít người khai mà đổi hẳn cách
 *    dùng: đang ở album ảnh, chọn ảnh trước-sau của khách, bấm Chia sẻ, và
 *    iFan hiện ra trong danh sách như Zalo hay Messenger. Không có nó thì phải
 *    mở iFan, tìm khách, rồi mới chọn ảnh — ba bước cho một việc.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // ⚠️ Mã nhận dạng CỐ ĐỊNH. Đổi nó (hoặc bỏ nó rồi đổi `start_url`) nghĩa là
    //   trình duyệt coi đây là một app KHÁC, và người đã cài sẽ có hai biểu
    //   tượng iFan.
    id: "/?app=ifan",
    name: "iFan — CRM & hộp thư cho tiệm",
    short_name: "iFan",
    description:
      "Gom tin nhắn khách về một chỗ, nhắc việc mỗi ngày, đo nguồn nào ra tiền.",
    start_url: "/app/today",
    // Mọi đường dẫn ngoài phạm vi này sẽ mở ra trình duyệt thường thay vì ở
    // trong app. Để "/" vì trang giới thiệu và trang đặt lịch của khách cũng
    // thuộc cùng một chỗ.
    scope: "/",
    display: "standalone",
    // Xin chế độ đẹp hơn trước, tự lùi dần: thanh tiêu đề gọn → toàn màn.
    display_override: ["window-controls-overlay", "standalone"],
    // Tiệm dùng điện thoại dọc. Khoá cứng `portrait` thì máy tính bảng nằm
    // ngang lại khó dùng, nên chỉ NGHIÊNG VỀ dọc chứ không ép.
    orientation: "portrait-primary",
    background_color: "#FAF5EF",
    theme_color: "#C94C18",
    lang: "vi",
    dir: "ltr",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      // Bản maskable: nét vẽ đã nằm trong vùng an toàn 80% giữa — Android cắt
      // tròn không mất chữ.
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],

    shortcuts: [
      {
        name: "Hôm nay",
        short_name: "Hôm nay",
        description: "Việc phải làm hôm nay",
        url: "/app/today",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Thêm lịch hẹn",
        short_name: "Thêm lịch",
        description: "Đặt một buổi hẹn mới",
        url: "/app/calendar?v=ngay",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Hộp thư",
        short_name: "Hộp thư",
        description: "Tin nhắn khách gửi tới",
        url: "/app/inbox",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Nhắn nội bộ",
        short_name: "Nhắn nội bộ",
        description: "Chỗ cả tiệm nói chuyện",
        url: "/app/chat",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],

    // ⚠️ `method: POST` + `enctype: multipart/form-data` là BẮT BUỘC khi nhận
    //   TỆP. Khai `GET` thì Android chỉ gửi được chữ và ảnh rơi mất im lặng.
    share_target: {
      // ⚠️ Trỏ vào /api/ chứ KHÔNG /app/share: cùng một thư mục không thể vừa
      //   nhận POST vừa vẽ màn hình. Đường này nhận tệp, tải lên, rồi chuyển
      //   hướng sang /app/share để người dùng chọn gửi vào kênh nào.
      action: "/api/share-target",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "tieuDe",
        text: "noiDung",
        url: "duongDan",
        files: [
          {
            name: "tep",
            // Ảnh là thứ chính; nhận thêm PDF vì phiếu và hoá đơn hay ở dạng đó.
            accept: ["image/*", "application/pdf"],
          },
        ],
      },
    },
  };
}
