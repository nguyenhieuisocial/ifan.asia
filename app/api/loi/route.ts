import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { clientIpFrom, rateLimit } from "@/lib/rate-limit";
import { ghiLoi } from "@/lib/ghi-loi";

/**
 * NHẬN BÁO LỖI TỪ TRÌNH DUYỆT.
 *
 * ═══════════════════════════════════════════════════════════════════
 * CỬA NÀY CÔNG KHAI — VÀ PHẢI CÔNG KHAI
 * ═══════════════════════════════════════════════════════════════════
 * Màn đăng nhập hỏng cũng là lỗi cần biết, mà lúc đó chưa có phiên nào. Bắt
 * đăng nhập ở đây là tự bịt mắt đúng lúc cần nhìn nhất.
 *
 * Đổi lại, phải chặn bằng ba lớp, vì cửa công khai nhận dữ liệu người lạ gửi:
 *   1. GIỚI HẠN TẦN SUẤT theo địa chỉ mạng — chống một máy bắn liên tục.
 *   2. TRẦN CỠ GÓI TIN — chống nhồi vài megabyte mỗi lượt.
 *   3. CẮT NGẮN mọi trường ở tầng ghi, và GOM theo dấu vân tay nên một loại
 *      lỗi chỉ chiếm ĐÚNG MỘT dòng dù bắn bao nhiêu lượt.
 *
 * ⚠️ LUÔN trả 204, kể cả khi từ chối. Trả lỗi cho một lời báo lỗi là mời trình
 *   duyệt thử lại, và tạo ra vòng lặp lỗi-báo-lỗi. Đây cũng là lý do không trả
 *   thông tin gì về việc đã ghi hay chưa.
 */

export const dynamic = "force-dynamic";

/** Trần cỡ gói tin: đủ cho một vết gọi hàm dài, không đủ để nhồi. */
const TRAN_BYTE = 8 * 1024;

export async function POST(req: Request) {
  try {
    const ip = clientIpFrom(req.headers);
    // 30 lượt mỗi phút cho một địa chỉ. Một người dùng thật gặp lỗi vài lần
    // một phút là cùng; hơn thế là vòng lặp, mà vòng lặp thì một lượt đầu tiên
    // đã đủ để biết.
    const { allowed } = await rateLimit(`loi:${ip}`, 30, 60);
    if (!allowed) return new NextResponse(null, { status: 204 });

    const raw = await req.text();
    if (raw.length > TRAN_BYTE) return new NextResponse(null, { status: 204 });

    let than: { loi?: unknown; vet?: unknown; duongDan?: unknown };
    try {
      than = JSON.parse(raw);
    } catch {
      return new NextResponse(null, { status: 204 });
    }
    if (typeof than.loi !== "string" || !than.loi.trim()) {
      return new NextResponse(null, { status: 204 });
    }

    // Ai đang gặp lỗi — CÓ THÌ TỐT, không có vẫn ghi. Không để việc thiếu phiên
    // chặn mất lời báo lỗi.
    let userId: string | null = null;
    try {
      const supabase = await createClient();
      const { data } = await supabase.auth.getUser();
      userId = data.user?.id ?? null;
    } catch {
      /* chưa đăng nhập, hoặc phiên hỏng — vẫn ghi */
    }

    await ghiLoi({
      noi: "client",
      loi: than.loi,
      vet: typeof than.vet === "string" ? than.vet : undefined,
      duongDan: typeof than.duongDan === "string" ? than.duongDan : undefined,
      trinhDuyet: req.headers.get("user-agent") ?? undefined,
      userId,
    });
  } catch {
    // Xem ghi chú đầu file: đường xử lý lỗi không được tự ném lỗi.
  }
  return new NextResponse(null, { status: 204 });
}
