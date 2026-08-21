import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/config";
import { clientIpFrom, rateLimit } from "@/lib/rate-limit";

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
    const { duongDan, loai } = JSON.parse(raw) as {
      duongDan?: unknown;
      loai?: unknown;
    };

    if (typeof duongDan !== "string") return new NextResponse(null, { status: 204 });
    if (!TRANG_CO_DINH.has(duongDan) && !TRANG_NGANH.test(duongDan)) {
      return new NextResponse(null, { status: 204 });
    }
    if (loai !== "xem" && loai !== "bam-dang-ky") {
      return new NextResponse(null, { status: 204 });
    }

    // ⚠️ ĐẾM HỎNG THÌ CHẶN, KHÔNG CHO QUA — và đây là bản SỬA LẠI một lập
    //   luận sai của chính file này.
    //   Bản đầu dùng `rateLimitBestEffort` với lý do: "cho qua thì chỉ dôi vài
    //   lượt đếm, chặn thì mất số liệu thật". Lý do đó chỉ đúng nếu con số này
    //   là số liệu để NGẮM. Nó không phải.
    //   `luot_cong_khai` là nguồn DUY NHẤT nuôi `admin_ket_qua_thu_nghiem`
    //   (#336) — hàm quyết định một thử nghiệm A/B thắng hay thua, với ba chốt
    //   ≥14 ngày · ≥300 lượt mỗi bên · z ≥ 1,96. Fail-open nghĩa là khi bộ đếm
    //   sập thì MỘT NGƯỜI có thể bơm số cho một bên tuỳ ý, và kết luận A/B lật.
    //   Cái mất khi chặn là vài lượt xem không được ghi; cái mất khi cho qua là
    //   một quyết định sai mà không ai biết là sai.
    const ip = clientIpFrom(req.headers);
    const { allowed } = await rateLimit(`luot:${ip}`, 120, 60);
    if (!allowed) return new NextResponse(null, { status: 204 });

    const khoa = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!khoa) return new NextResponse(null, { status: 204 });
    const db = createClient(SUPABASE_URL, khoa, { auth: { persistSession: false } });

    // ⚠️ NHÁNH THỬ NGHIỆM DO MÁY CHỦ TỰ TRA, KHÔNG NHẬN TỪ TRÌNH DUYỆT (#336).
    //   Nhận từ trình duyệt thì ai cũng ghi số liệu giả cho nhánh mình muốn, và
    //   số liệu bịa được thì kết luận A/B vô nghĩa. Ngày cũng tính ở cơ sở dữ
    //   liệu: máy chủ web và trình duyệt mỗi nơi một đồng hồ, lệch quanh nửa
    //   đêm là lượt xem ghi vào nhánh này còn cú bấm ghi vào nhánh kia.
    const { data: tn } = await db.rpc("thu_nghiem_hom_nay", { p_trang: duongDan });
    const nhanh = (tn as { bien_the?: string } | null)?.bien_the ?? "";

    await db.rpc("ghi_luot_cong_khai", {
      p_duong_dan: duongDan,
      p_loai: loai,
      p_bien_the: nhanh,
    });
  } catch {
    // Đường đếm không được làm hỏng gì của người dùng — nuốt mọi lỗi.
  }
  return new NextResponse(null, { status: 204 });
}
