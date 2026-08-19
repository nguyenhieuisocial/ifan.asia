import { timingSafeEqual } from "node:crypto";

/**
 * So hai chuỗi bí mật theo kiểu HẰNG-THỜI-GIAN.
 *
 * VÌ SAO KHÔNG DÙNG `!==`: toán tử so chuỗi của JS dừng ngay tại ký tự đầu tiên
 * khác nhau. Thời gian chạy vì thế TỶ LỆ với số ký tự đầu đoán đúng — kẻ gọi thử
 * nhiều lần và đo thời gian trả lời có thể dò ra bí mật từng ký tự một, không cần
 * biết gì thêm. Với một cửa webhook công khai trên internet, số lần thử là không
 * giới hạn (chỉ vướng rate limit theo IP, mà IP thì xoay được).
 *
 * `timingSafeEqual` yêu cầu hai buffer BẰNG ĐỘ DÀI, nên phải chặn độ dài trước.
 * Phép so độ dài đó VẪN lộ độ dài bí mật — chấp nhận được: độ dài không phải
 * phần khó đoán, nội dung mới là.
 *
 * VÌ SAO CÓ FILE NÀY: cùng một khóa `BOT_INGEST_KEY` canh BỐN cửa, mà trước đây
 * hai cửa (`/api/bot/outbox`, `/api/webhooks/dispatch`) so hằng-thời-gian còn
 * hai cửa (`/api/bot/webhook`, `/api/telegram/webhook`) dùng `!==`. Mỗi cửa tự
 * chép một bản `safeEqual`/`bangNhau` riêng chính là cách sự khác biệt đó sống
 * sót mà không ai thấy. Một hàm, một chỗ sửa.
 *
 * TÌNH TRẠNG (việc #199): CẢ BỐN cửa nay đều gọi hàm này. Hai bản chép cuối
 * (`safeEqual` ở `/api/bot/outbox`, `bangNhau` ở `/api/webhooks/dispatch`) đã
 * được gom về đây. NÓI RÕ ĐỂ KHÔNG THỔI PHỒNG: hai bản đó vốn đã so
 * hằng-thời-gian ĐÚNG — giống hệt hàm này từng dòng — nên đây là gom cho nhất
 * quán, KHÔNG phải vá một lỗ. Giá trị nằm ở chỗ từ nay chỉ còn MỘT chỗ để sửa
 * và MỘT chỗ để soát, thay vì bốn bản chép có thể lệch nhau lần sau.
 *
 * CÒN MỘT BẢN CHÉP NỮA, CỐ Ý KHÔNG GOM: `/api/webhooks/zalo` so chữ ký HMAC
 * (`X-ZEvent-Signature`) bằng `timingSafeEqual` viết thẳng trong route. Nó cũng
 * đã đúng, nhưng là phép so CHỮ KÝ TỰ TÍNH (hai vế luôn cùng độ dài hex) chứ
 * không phải so BÍ MẬT DÙNG CHUNG như bốn cửa trên — khác bài toán, gom vào đây
 * là làm mờ mục đích của hàm này. Ghi lại để lần sau ai đếm "còn chỗ nào chưa
 * gom" thì biết đây là quyết định, không phải bỏ sót.
 */
export function bangNhauHangThoiGian(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
