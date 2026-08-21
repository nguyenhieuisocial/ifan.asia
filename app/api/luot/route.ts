import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/config";
import { clientIpFrom, rateLimitBestEffort } from "@/lib/rate-limit";

/**
 * NHẬN LƯỢT XEM Ở TRANG CÔNG KHAI (#333, thẻ `man-quan-tri-phieu-khach-vao`).
 *
 * ⚠️ KHÔNG LƯU GÌ VỀ NGƯỜI GỌI. Không địa chỉ mạng, không dấu vết máy, không
 *   bánh quy. Trình duyệt chỉ được nói ĐÚNG HAI THỨ: đang ở trang nào, và vừa
 *   xem hay vừa bấm Đăng ký. Địa chỉ mạng có đọc — nhưng CHỈ để đếm trần, và
 *   nó không bao giờ đi xuống kho.
 *
 * ⚠️ LUÔN trả 204, kể cả khi bỏ qua. Đây là đường đếm, không phải đường làm
 *   việc: trả lỗi cho nó là mời trình duyệt thử lại và làm ồn nhật ký vì một
 *   việc không ai cần biết kết quả.
 *
 * ⚠️ ĐƯỜNG NÀY MỞ CHO NGƯỜI LẠ nên phải có trần. Một tay rảnh gọi vài nghìn
 *   lần là số liệu thành vô nghĩa, mà số liệu bịa được thì mọi quyết định dựa
 *   trên nó đều vô nghĩa theo.
 */

export const dynamic = "force-dynamic";

/** Danh sách trang ĐÓNG — khớp đúng chốt trong `ghi_luot_cong_khai` (#333). */
const TRANG_CO_DINH = new Set([
  "/", "/bang-gia", "/tinh-nang", "/lo-trinh", "/login",
  "/signup", "/forgot-password", "/privacy", "/terms",
]);
const TRANG_NGANH = /^\/nganh\/[a-z]{2,12}$/;

/**
 * MÁY DÒ TỰ ĐỘNG — loại ra, nếu không con số phồng lên và mọi so sánh sau đó
 * đều sai. Bộ đếm chạy bằng mã trong trình duyệt nên phần lớn máy quét đã tự
 * rơi ra; đây là lớp thứ hai cho những con có chạy mã.
 */
const LA_MAY_DO = /bot|crawler|spider|crawling|headless|preview|monitor|lighthouse|pingdom|gtmetrix/i;

export async function POST(req: Request) {
  try {
    const ua = req.headers.get("user-agent") ?? "";
    if (!ua || LA_MAY_DO.test(ua)) return new NextResponse(null, { status: 204 });

    const raw = await req.text();
    if (raw.length > 200) return new NextResponse(null, { status: 204 });
    const { duongDan, loai, bienThe } = JSON.parse(raw) as {
      duongDan?: unknown;
      loai?: unknown;
      bienThe?: unknown;
    };

    if (typeof duongDan !== "string") return new NextResponse(null, { status: 204 });
    if (!TRANG_CO_DINH.has(duongDan) && !TRANG_NGANH.test(duongDan)) {
      return new NextResponse(null, { status: 204 });
    }
    if (loai !== "xem" && loai !== "bam-dang-ky") {
      return new NextResponse(null, { status: 204 });
    }

    // `rateLimitBestEffort`: đếm hỏng thì CHO QUA. Ở đây hậu quả của việc cho
    // qua chỉ là vài lượt đếm dôi, còn hậu quả của việc chặn là mất số liệu
    // thật — nên nghiêng về phía cho qua. (Khác hẳn cửa đăng nhập, nơi phải
    // fail-closed.)
    const ip = clientIpFrom(req.headers);
    const { allowed } = await rateLimitBestEffort(`luot:${ip}`, 120, 60);
    if (!allowed) return new NextResponse(null, { status: 204 });

    const khoa = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!khoa) return new NextResponse(null, { status: 204 });
    const db = createClient(SUPABASE_URL, khoa, { auth: { persistSession: false } });
    await db.rpc("ghi_luot_cong_khai", {
      p_duong_dan: duongDan,
      p_loai: loai,
      p_bien_the: typeof bienThe === "string" ? bienThe.slice(0, 20) : "",
    });
  } catch {
    // Đường đếm không được làm hỏng gì của người dùng — nuốt mọi lỗi.
  }
  return new NextResponse(null, { status: 204 });
}
