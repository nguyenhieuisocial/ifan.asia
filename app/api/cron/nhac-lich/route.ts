import { createClient } from "@supabase/supabase-js";
import { clientIpFrom, rateLimit } from "@/lib/rate-limit";
import { bangNhauHangThoiGian } from "@/lib/security/so-sanh-bi-mat";
import { SUPABASE_URL } from "@/lib/config";

/**
 * Nhịp gọi hàm NHẮC LỊCH HẸN.
 *
 * ════════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ FILE NÀY — một tính năng dựng xong rồi bỏ quên suốt nhiều tuần
 * ════════════════════════════════════════════════════════════════════
 *
 * `process_appointment_reminders()` đã có đủ trong cơ sở dữ liệu từ lâu: nó
 * quét lịch hẹn sắp tới, soạn lời nhắc, gắn cả đường gửi qua bot. Nhưng quét
 * toàn kho ngày 21/08: **không một nơi nào gọi nó** — chỉ có đúng một dòng
 * trong bộ kiểm tự động.
 *
 * Nghĩa là: khách đặt lịch, tiệm tin rằng phần mềm sẽ nhắc, và **không ai
 * được nhắc**. Đây là lớp bệnh tệ nhất trong kho này — không phải "chưa làm"
 * mà là **"đã làm rồi bỏ quên"**: mọi thứ trông như đang chạy, migration có,
 * hàm có, bộ kiểm xanh, chỉ thiếu người bấm nút.
 *
 * Lý do gốc: `pg_net` bị khoá từ #36 nên cơ sở dữ liệu **không tự gọi HTTP
 * được**. Mọi việc nền đều cần một nhịp từ bên ngoài. Hai việc nền khác
 * (gửi bot, đẩy webhook) đã có nhịp; việc này thì chưa ai nối.
 *
 * ⚠️ **Đừng gộp vào nhịp của `/api/bot/outbox`.** Nhịp đó 15 phút một lần và
 * mang trách nhiệm khác; gộp lại nghĩa là một việc hỏng thì việc kia chết
 * theo, và lúc đọc log không biết cái nào vừa gãy.
 *
 * Thiếu khoá ⇒ **204 im lặng**, đứng yên chứ không lỗi — cùng khuôn với hai
 * cửa nền đang chạy, để môi trường chưa cấu hình không rải log rác.
 */

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

/** Mỗi lượt xử tối đa ngần này lịch hẹn. Chạy 5 phút/lần nên thừa sức. */
const MOI_LUOT = 100;

async function handle(req: Request): Promise<Response> {
  try {
    const key = process.env.BOT_INGEST_KEY;
    if (!key) return new Response(null, { status: 204 });

    const { allowed } = await rateLimit(
      `nhac-lich:ip:${clientIpFrom(req.headers)}`,
      30,
      60,
    );
    if (!allowed) return new Response("too many requests", { status: 429 });

    const botKey = req.headers.get("x-bot-key") ?? "";
    const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const cronSecret = process.env.CRON_SECRET;
    const authorized =
      (botKey !== "" && bangNhauHangThoiGian(botKey, key)) ||
      (Boolean(cronSecret) &&
        bearer !== "" &&
        bangNhauHangThoiGian(bearer, cronSecret ?? ""));
    if (!authorized) return new Response("unauthorized", { status: 401 });

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      // Không có khoá dịch vụ thì KHÔNG im lặng: đây là chỗ khác hẳn "chưa cấu
      // hình". Việc nền đã được kích mà không chạy được là chuyện phải kêu lên.
      console.error("[nhac-lich] thiếu SUPABASE_SERVICE_ROLE_KEY — không chạy được");
      return new Response("server misconfigured", { status: 500 });
    }

    const service = createClient(SUPABASE_URL, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await service.rpc("process_appointment_reminders", {
      p_batch: MOI_LUOT,
    });

    if (error) {
      console.error("[nhac-lich] process_appointment_reminders lỗi:", error.message);
      return new Response("error", { status: 500 });
    }

    const soNhac = typeof data === "number" ? data : 0;
    // Chỉ ghi log khi CÓ việc — nhịp 5 phút mà lượt nào cũng log thì log thành
    // rác và không ai đọc nữa.
    if (soNhac > 0) console.log(`[nhac-lich] đã nhắc ${soNhac} lịch hẹn`);
    return Response.json({ ok: true, soNhac }, { status: 200 });
  } catch (err) {
    console.error("[nhac-lich] lỗi không mong đợi:", err);
    return new Response("error", { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
