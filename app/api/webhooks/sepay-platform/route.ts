import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";
import { clientIpFrom, rateLimit } from "@/lib/rate-limit";

/**
 * Cổng nhận biến động số dư tài khoản NỀN TẢNG (migration #286).
 *
 * LUỒNG TIỀN: chủ tiệm bấm nâng gói → phần mềm tạo một hoá đơn chờ thanh toán
 * mang số dạng `IF-2026-000123` → họ chuyển khoản vào tài khoản CỦA IFAN với
 * số hoá đơn trong nội dung → ngân hàng báo SePay → SePay POST về đây →
 * `platform_sepay_ingest` bóc số hoá đơn và gọi `record_subscription_payment`
 * (đúng cửa đã dựng từ #27) → gói đổi thật và tiệm nhận thông báo.
 *
 * ⚠️ KHÁC HẲN cổng `/api/webhooks/sepay` — đừng gộp hai cái làm một:
 *
 *                    khách trả TIỆM              tiệm trả IFAN (cổng này)
 *   tiền vào          tài khoản của tiệm          tài khoản của iFan
 *   khoá kiểm         khoá RIÊNG từng tiệm        MỘT khoá của nền tảng
 *   đối chiếu bằng    mã đơn hàng                 số hoá đơn
 *   ai đọc được sổ    tiệm đó                     chỉ quản trị nền tảng
 *
 * Gộp chung nghĩa là tiệm nhìn thấy giao dịch của nền tảng, và một lỗ ở cổng
 * của tiệm ghi khống được vào doanh thu của iFan.
 *
 * ⛔ KHÔNG CÓ NHÁNH "CHƯA CẤU HÌNH THÌ CHO QUA". Thiếu khoá ⇒ 500; sai khoá ⇒
 * 401. Kho này đã dính đúng lỗ đó ở cổng Zalo (việc #10/#31): điều kiện bám
 * vào MÔI TRƯỜNG thay vì bám vào SỰ CÓ MẶT CỦA BÍ MẬT. Ở đường tiền thì cùng
 * lỗ ấy là ai đó tự nâng gói cho tiệm mình mà không trả đồng nào.
 *
 * Cổng này KHÔNG mang mã tiệm trên địa chỉ: tiền vào một tài khoản duy nhất,
 * và tiệm nào trả thì đọc ra từ số hoá đơn chứ không tin vào tham số ngoài.
 */

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

/** SePay coi là THÀNH CÔNG khi nhận `{"success": true}` kèm 200/201. */
function ok(status: string): Response {
  return Response.json({ success: true, status }, { status: 200 });
}

export async function POST(req: Request): Promise<Response> {
  try {
    // Chặn tần suất TRƯỚC mọi việc khác — địa chỉ công khai, khoá là chuỗi cố
    // định, không chặn là mở cửa dò khoá. Nhịp thật của cổng này thấp hơn hẳn
    // cổng của tiệm (mỗi tiệm trả tiền một lần mỗi kỳ), nên 60 lượt/phút đã
    // rộng gấp nhiều lần.
    const { allowed } = await rateLimit(`sepay-plat:ip:${clientIpFrom(req.headers)}`, 60, 60);
    if (!allowed) return new Response("too many requests", { status: 429 });

    const ingestKey = process.env.SEPAY_PLATFORM_INGEST_KEY;
    if (!ingestKey) {
      console.error(
        "[sepay-platform] thiếu env SEPAY_PLATFORM_INGEST_KEY — TỪ CHỐI (fail closed). " +
          "Lấy khoá trong CSDL: select value from private.app_config " +
          "where key = 'sepay_platform_ingest_key'",
      );
      return new Response("server misconfigured", { status: 500 });
    }

    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      // Thân tin không phải JSON ⇒ không có gì để khớp. Trả 400 chứ không ACK:
      // ACK ở đây là nuốt một khoản tiền có thật mà không ai biết.
      console.error("[sepay-platform] thân tin không phải JSON — trả 400");
      return new Response("bad request", { status: 400 });
    }
    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
      return new Response("bad request", { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.rpc("platform_sepay_ingest", {
      p_key: ingestKey,
      p_payload: payload,
    });

    if (error) {
      if (/invalid_key/.test(error.message)) {
        // Không bao giờ log chuỗi khoá — kể cả một phần của nó.
        console.error("[sepay-platform] từ chối: khoá không hợp lệ");
        return new Response("unauthorized", { status: 401 });
      }
      // Lỗi khác ⇒ 500 để SePay gọi lại. Chống trùng nằm ở tầng CSDL (khoá duy
      // nhất theo mã giao dịch, cộng với chính hàm ghi nhận đã idempotent theo
      // hoá đơn) nên gọi lại KHÔNG thể nâng gói hai lần.
      console.error("[sepay-platform] platform_sepay_ingest lỗi:", error.message);
      return new Response("error", { status: 500 });
    }

    const status = (data as { status?: string } | null)?.status ?? "unknown";
    if (status === "unknown") {
      // Hàm CSDL đổi hình dạng trả về mà đây quên theo — KHÔNG báo thành công
      // cho một lượt không biết đã làm gì.
      console.error("[sepay-platform] hàm CSDL trả về không đọc được — coi như lỗi");
      return new Response("error", { status: 500 });
    }
    return ok(status);
  } catch (err) {
    console.error("[sepay-platform] lỗi không mong đợi:", err);
    return new Response("error", { status: 500 });
  }
}
