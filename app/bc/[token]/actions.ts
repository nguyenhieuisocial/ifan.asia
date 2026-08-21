"use server";

import { z } from "zod";
import { openShare, type ShareOpenResult } from "./open";

/**
 * Mở khoá một bản chụp báo cáo có mật khẩu (migration #295).
 *
 * Mật khẩu đi bằng POST của server action, KHÔNG bao giờ nằm trên địa chỉ trang
 * — địa chỉ nằm lại trong lịch sử trình duyệt, trong log máy chủ, và trong
 * header giới thiệu nếu trang có bất kỳ liên kết ra ngoài nào.
 *
 * Không có chốt vai ở đây, và đó là đúng: người gọi là NGƯỜI NGOÀI, chưa đăng
 * nhập. Toàn bộ chốt (hạn · thu hồi · mật khẩu · bộ đếm chống dò) nằm trong hàm
 * CSDL — tầng này chỉ chuyển tiếp.
 */

const schema = z.object({
  // Mã đúng luôn là 48 ký tự hex. Chặn khuôn ngay cổng vào để chuỗi tuỳ ý không
  // đi tiếp — CSDL cũng kiểm lại lần nữa, đây chỉ là lớp trên.
  token: z.string().trim().regex(/^[0-9a-f]{48}$/),
  // `.trim()` khớp ĐÚNG hai đầu kia (ô đặt mật khẩu và hàm CSDL đều btrim).
  // Dán mật khẩu từ tin nhắn thường dính một dấu cách ở cuối — cắt nó đi là
  // cứu đúng ca hỏng hay gặp nhất, không phải nới lỏng bảo mật.
  password: z.string().trim().min(1).max(72),
});

export async function unlockShare(input: {
  token: string;
  password: string;
}): Promise<ShareOpenResult> {
  const parsed = schema.safeParse(input);
  // Đầu vào hỏng trả về ĐÚNG câu của mã sai — không nói cho người ngoài biết họ
  // hỏng ở khâu nào.
  if (!parsed.success) return { ok: false, reason: "not_found" };

  return openShare(parsed.data.token, parsed.data.password);
}
