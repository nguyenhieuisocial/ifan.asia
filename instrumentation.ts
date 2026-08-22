import * as Sentry from "@sentry/nextjs";
import type { Instrumentation } from "next";

/**
 * NẠP SENTRY. Next gọi hàm này MỘT LẦN lúc máy chủ khởi động, trước mọi request.
 *
 * ⚠️ PHẢI tách hai nhánh bằng `NEXT_RUNTIME`. Cùng một tệp được dựng cho cả
 *   Node lẫn Edge; nạp bản Node ở nhánh Edge là hỏng bản dựng, với lời lỗi
 *   không nhắc gì tới Sentry nên rất khó lần ra. Đã dính đúng bẫy này với
 *   `lib/ghi-loi` hôm 21/08 — xem ghi chú `onRequestError` bên dưới.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./sentry.server.config");
  if (process.env.NEXT_RUNTIME === "edge") await import("./sentry.edge.config");
}

/**
 * HỨNG MỌI LỖI XẢY RA Ở MÁY CHỦ.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CẦN CHỖ NÀY, TRONG KHI ĐÃ CÓ `app/error.tsx`
 * ═══════════════════════════════════════════════════════════════════
 * `app/error.tsx` chạy ở TRÌNH DUYỆT. Một lỗi ném ra trong Server Component,
 * Server Action, hay Route Handler thì trình duyệt chỉ nhận được một mã rối
 * (`digest`) — KHÔNG có lời lỗi, KHÔNG có vết gọi hàm. Nghĩa là đúng những lỗi
 * nặng nhất (hỏng lúc dựng trang, hỏng lúc ghi cơ sở dữ liệu) lại là những lỗi
 * ghi lại được ít thông tin nhất.
 *
 * `onRequestError` là chỗ DUY NHẤT của Next nhìn thấy lỗi đó nguyên vẹn.
 *
 * ⚠️ HÀM NÀY KHÔNG ĐƯỢC NÉM LỖI. Nó chạy trên đường xử lý một lỗi đã xảy ra;
 *   ném thêm ở đây là nuốt mất lỗi gốc và biến một lỗi có thể đọc thành một
 *   màn trắng không lý do.
 *
 * ⚠️ NẠP `lib/ghi-loi` BẰNG `await import` BÊN TRONG HÀM, không nạp ở đầu tệp.
 *   Tệp này chạy ở cả môi trường Node lẫn Edge; nạp sẵn một mô-đun chỉ chạy
 *   được ở Node sẽ làm hỏng bản dựng Edge — mà lỗi đó không liên quan gì tới
 *   việc ghi lỗi, nên sẽ rất khó lần ra.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context,
) => {
  // ⚠️ CHẶN NHÁNH EDGE. Next dựng tệp này cho CẢ hai môi trường, mà mô-đun ghi
  //   lỗi dùng thư viện chỉ có ở Node — nạp nó ở nhánh Edge làm HỎNG BẢN DỰNG,
  //   với một lời lỗi không nhắc gì tới việc ghi lỗi nên rất khó lần ra. Đã
  //   dính đúng chuyện này lúc dựng bản ngày 21/08.
  // Sentry chạy được ở CẢ Node lẫn Edge, nên gửi trước cửa chặn bên dưới —
  // nếu không, mọi lỗi xảy ra ở biên sẽ không bao giờ tới Sentry.
  try {
    Sentry.captureRequestError(err, request, context);
  } catch {
    /* cố ý im lặng — xem ghi chú đầu tệp */
  }

  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { ghiLoi } = await import("@/lib/ghi-loi");
    const e = err as { message?: string; stack?: string };
    await ghiLoi({
      noi: "server",
      loi: String(e?.message ?? err ?? "lỗi máy chủ không rõ"),
      vet: e?.stack,
      duongDan: request?.path,
      // KHÔNG lấy `user-agent` từ đây: lỗi máy chủ cần biết ĐƯỜNG DẪN và VẾT
      // GỌI HÀM, còn trình duyệt nào gặp thì hiếm khi là manh mối.
    });
  } catch {
    /* cố ý im lặng — xem ghi chú đầu tệp */
  }
};
