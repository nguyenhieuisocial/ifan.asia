import { createClient } from "@supabase/supabase-js";
import { waitUntil } from "@vercel/functions";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";
import { clientIpFrom, rateLimit } from "@/lib/rate-limit";
import { runAutopilotSweep } from "@/lib/ai/autopilot-run";

/**
 * Webhook nhận tin KHÁCH HÀNG từ bot Telegram của từng tiệm (ADR-0013, #116).
 *
 * KHÁC HẲN `/api/telegram/webhook` — cái kia là bot NỘI BỘ của đội ngũ iFan
 * (số liệu nền tảng, hỏi đáp qua cầu nối). Cái này là kênh chat khách hàng thứ
 * ba trong Hộp thư, mỗi tiệm một bot riêng. Trộn hai thứ vào một cửa là trộn
 * câu hỏi nội bộ với tin nhắn khách, chung một hộp — không được.
 *
 * TIỆM NÀO NHẬN TIN: tin Telegram KHÔNG mang dấu vết gì về bot nhận nó (khác
 * Zalo có `oa_id` trong thân tin), chỉ biết qua ĐỊA CHỈ Telegram gọi tới. Nên
 * mỗi tiệm đăng ký một địa chỉ riêng `?ch=<mã kênh>` — đúng cách bot nhắc việc
 * nhân viên đã dùng và đã chạy thật.
 *
 * HAI LỚP CHẶN, thiếu lớp nào cũng hỏng:
 *  1. `X-Telegram-Bot-Api-Secret-Token` khớp bí mật CỦA ĐÚNG KÊNH ĐÓ.
 *  2. Kênh phải tồn tại và đang bật (kiểm ngay trong hàm ghi nhận).
 *
 * Bí mật KHÔNG được trả ra ngoài: cổng này chỉ hỏi CSDL "có khớp không" và
 * nhận đúng/sai. Cho cổng công khai cầm token bot là mở rộng thiệt hại nếu
 * cổng có lỗ.
 */

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request): Promise<Response> {
  try {
    const key = process.env.BOT_INGEST_KEY;
    if (!key) return new Response("OK", { status: 200 });

    const { allowed } = await rateLimit(
      `tg-inbox:ip:${clientIpFrom(req.headers)}`,
      300,
      60,
    );
    if (!allowed) return new Response("too many requests", { status: 429 });

    const channel = new URL(req.url).searchParams.get("ch") ?? "";
    if (!UUID_RE.test(channel)) return new Response("bad request", { status: 400 });

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: ok, error: verifyError } = await supabase.rpc("telegram_verify_hook", {
      p_key: key,
      p_channel: channel,
      p_secret: req.headers.get("x-telegram-bot-api-secret-token"),
    });
    if (verifyError || ok !== true) {
      return new Response("unauthorized", { status: 401 });
    }

    let update: unknown = null;
    try {
      update = await req.json();
    } catch {
      // Thân tin lạ → vẫn ACK để Telegram khỏi gọi lại dồn đống.
      return new Response("OK", { status: 200 });
    }
    if (update === null || typeof update !== "object") {
      return new Response("OK", { status: 200 });
    }

    const msg = (update as { message?: { message_id?: unknown } }).message;
    const messageId = typeof msg?.message_id === "number" ? String(msg.message_id) : null;
    // Không có mã tin thì không chống trùng được ⇒ bỏ, chứ KHÔNG ghi vào rồi
    // để Telegram gọi lại sinh ra bản sao.
    if (!messageId) return new Response("OK", { status: 200 });

    const { error } = await supabase.rpc("ingest_telegram_event", {
      p_key: key,
      p_channel: channel,
      p_external_event_id: messageId,
      p_payload: update,
    });
    if (error) {
      console.error("[tg-inbox] ingest_telegram_event lỗi:", error.message);
      // Trả 500 để Telegram gọi lại — thà nhận trùng (đã chống trùng) còn hơn
      // mất trắng tin của khách.
      return new Response("error", { status: 500 });
    }

    // Đá nhịp xử ngay; cron mỗi phút là lưới an toàn nếu nhịp này trượt.
    waitUntil(
      (async () => {
        const { error: e } = await supabase.rpc("trigger_telegram_processing", { p_key: key });
        if (e) console.error("[tg-inbox] trigger_telegram_processing lỗi:", e.message);
        // AI trực việc — chạy SAU khi tin đã chắc chắn nằm trong conversations/
        // messages (trigger_telegram_processing xử đồng bộ trước khi trả về).
        await runAutopilotSweep();
      })(),
    );

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("[tg-inbox] lỗi không mong đợi:", err);
    return new Response("error", { status: 500 });
  }
}
