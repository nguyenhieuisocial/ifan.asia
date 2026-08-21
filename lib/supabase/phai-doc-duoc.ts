import type { PostgrestSingleResponse } from "@supabase/supabase-js";

/**
 * ĐỌC HỎNG THÌ PHẢI KÊU LÊN, KHÔNG ĐƯỢC TRẢ VỀ DANH SÁCH RỖNG.
 *
 * ════════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ FILE NÀY
 * ════════════════════════════════════════════════════════════════════
 *
 * Khuôn `const { data } = await supabase...` bỏ qua `error`, nên một lần đọc
 * hỏng biến thành `data = null`, rồi `?? []` biến tiếp thành danh sách rỗng —
 * và màn hình nói **"chưa có gì"**. Đo 21/08: **43 chỗ** trong kho đang viết
 * đúng khuôn đó.
 *
 * Hai ca đã sửa tay cùng ngày cho thấy hại thật:
 *   · màn **Mã QR** nói "Chưa có mã QR nào" với tiệm đang dán 12 mã ngoài cửa
 *     ⇒ chủ tiệm đi tạo lại mã mới, dán chồng, số liệu nguồn khách vỡ đôi
 *   · màn **nhật ký tải dữ liệu** nói "chưa ai tải gì" ⇒ đúng câu người ta
 *     muốn nghe nhất khi đi soát xem có ai mang dữ liệu khách ra ngoài
 *
 * **Phần mềm nói sai sự thật tệ hơn phần mềm báo lỗi**: người dùng tin vào nó
 * rồi đi làm một việc hỏng.
 *
 * ────────────────────────────────────────────────────────────────────
 * DÙNG Ở ĐÂU
 * ────────────────────────────────────────────────────────────────────
 *
 *   const donHang = phaiDocDuoc(await supabase.from("orders").select("*"), "đơn hàng");
 *
 * Ném lỗi ⇒ Next.js bắt bằng `app/error.tsx` và hiện màn báo hỏng tử tế, thay
 * vì một màn trống nói dối.
 *
 * ⛔ **Chỉ dùng cho truy vấn CHÍNH của màn** — thứ mà "rỗng" bị hiểu nhầm
 * thành "không có gì". Truy vấn phụ (danh sách nguồn để đổ vào ô chọn, tên
 * người để tra cứu) thì đừng: hỏng một cái phụ mà cho cả màn thành trang lỗi
 * là đổi một phiền toái nhỏ lấy một phiền toái lớn.
 */
export function phaiDocDuoc<T>(res: PostgrestSingleResponse<T>, ten: string): T {
  if (res.error) {
    // Ném nguyên thông điệp gốc để nhật ký máy chủ còn dò được; người dùng chỉ
    // thấy màn báo hỏng chung, không thấy chuỗi này.
    throw new Error(`Không đọc được ${ten}: ${res.error.message}`);
  }
  return res.data;
}
