import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";
import { clientIpFrom, rateLimit } from "@/lib/rate-limit";

/**
 * Cổng nhận biến động số dư từ SePay (migration #243).
 *
 * LUỒNG TIỀN: khách quét mã QR trên đơn → chuyển khoản vào tài khoản CỦA TIỆM
 * với nội dung `DH<8 ký tự đầu mã đơn>` → ngân hàng báo cho SePay → SePay POST
 * về đây → `sepay_ingest_transaction` bóc mã đơn và ghi `order_payments` (đúng
 * cửa mà thu ngân vẫn đi) → đơn hiện "đã thu".
 *
 * MỖI TIỆM MỘT KHOÁ, không có khoá chung cả nền tảng: mỗi tiệm nối tài khoản
 * ngân hàng RIÊNG của mình, nên địa chỉ webhook mang mã tiệm (`?t=`) và khoá
 * kiểm là khoá của đúng tiệm đó. Một khoá chung nghĩa là ai cầm được nó cũng
 * ghi tiền vào đơn của MỌI tiệm.
 *
 * ⛔ KHÔNG CÓ NHÁNH "CHƯA CẤU HÌNH THÌ CHO QUA". Thiếu khoá nền tảng ⇒ 500;
 * thiếu/sai khoá của tiệm ⇒ 401. Kho này đã dính đúng lỗ đó ở webhook Zalo
 * (việc #10/#31 trong docs/SU-THAT-SAN-PHAM.md): điều kiện bám vào MÔI TRƯỜNG
 * thay vì bám vào SỰ CÓ MẶT CỦA BÍ MẬT, nên bản preview công khai thành cửa
 * ghi dữ liệu giả vào CSDL thật. Ở đường TIỀN thì cùng lỗ ấy là ghi khống một
 * khoản thu — đơn hiện "đã trả" trong khi không đồng nào về tài khoản.
 *
 * KHOÁ KHÔNG BAO GIỜ ĐI QUA TẦNG NÀY: cổng chỉ chuyển tiếp chuỗi khách gửi
 * xuống CSDL và nhận lại đúng/sai. Cho một cửa công khai cầm bí mật của tiệm
 * là nhân rộng thiệt hại nếu cửa đó có lỗ (bài học #175).
 */

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** SePay coi là THÀNH CÔNG khi nhận `{"success": true}` kèm 200/201. */
function ok(status: string): Response {
  return Response.json({ success: true, status }, { status: 200 });
}

export async function POST(req: Request): Promise<Response> {
  try {
    // Chặn tần suất TRƯỚC mọi việc khác. Cổng này là địa chỉ công khai và khoá
    // của tiệm là chuỗi cố định ⇒ không chặn là mở cửa dò khoá. 120 lượt/phút
    // rộng gấp nhiều lần nhịp giao dịch thật của một tiệm.
    const { allowed } = await rateLimit(`sepay:ip:${clientIpFrom(req.headers)}`, 120, 60);
    if (!allowed) return new Response("too many requests", { status: 429 });

    const tenant = new URL(req.url).searchParams.get("t") ?? "";
    if (!UUID_RE.test(tenant)) return new Response("bad request", { status: 400 });

    // SePay gửi `Authorization: Apikey <khoá>` khi chọn cách xác thực API Key.
    const auth = req.headers.get("authorization") ?? "";
    const apiKey = /^apikey\s+/i.test(auth) ? auth.replace(/^apikey\s+/i, "").trim() : "";
    if (!apiKey) return new Response("unauthorized", { status: 401 });

    const ingestKey = process.env.SEPAY_INGEST_KEY;
    if (!ingestKey) {
      console.error(
        "[sepay] thiếu env SEPAY_INGEST_KEY — TỪ CHỐI (fail closed). " +
          "Lấy khoá trong CSDL: select value from private.app_config where key = 'sepay_ingest_key'",
      );
      return new Response("server misconfigured", { status: 500 });
    }

    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      // Thân tin không phải JSON ⇒ không có gì để khớp. Trả 400 chứ không ACK:
      // ACK ở đây là nuốt một giao dịch có thật mà không ai biết.
      console.error("[sepay] thân tin không phải JSON — trả 400");
      return new Response("bad request", { status: 400 });
    }
    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
      return new Response("bad request", { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.rpc("sepay_ingest_transaction", {
      p_key: ingestKey,
      p_tenant: tenant,
      p_api_key: apiKey,
      p_payload: payload,
    });

    if (error) {
      // Khoá sai (nền tảng hoặc của tiệm) ⇒ 401 và DỪNG. Không log chuỗi khoá.
      if (/invalid_key|unauthorized/.test(error.message)) {
        console.error(`[sepay] từ chối request cho tiệm ${tenant}: khoá không hợp lệ`);
        return new Response("unauthorized", { status: 401 });
      }
      // Lỗi khác ⇒ 500 để SePay gọi lại (tối đa 7 lần / 5 giờ). Chống trùng đã
      // có hai lớp nên gọi lại KHÔNG thể sinh ra khoản thu thứ hai.
      console.error("[sepay] sepay_ingest_transaction lỗi:", error.message);
      return new Response("error", { status: 500 });
    }

    const status = (data as { status?: string } | null)?.status ?? "unknown";
    if (status === "unknown") {
      // Hàm CSDL đổi hình dạng trả về mà đây quên theo — KHÔNG báo thành công
      // cho một lượt không biết đã làm gì.
      console.error("[sepay] hàm CSDL trả về không đọc được — coi như lỗi");
      return new Response("error", { status: 500 });
    }
    return ok(status);
  } catch (err) {
    console.error("[sepay] lỗi không mong đợi:", err);
    return new Response("error", { status: 500 });
  }
}
