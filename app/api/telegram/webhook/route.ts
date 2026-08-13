import { createClient } from "@supabase/supabase-js";
import { waitUntil } from "@vercel/functions";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";
import { clientIpFrom, rateLimit } from "@/lib/rate-limit";
import { telegramSend } from "@/lib/notify/telegram";

/**
 * Webhook bot Telegram NỘI BỘ đội ngũ iFan (@iFanVN_bot) — task #115.
 *
 * PHẠM VI CÓ CHỦ ĐÍCH: bot trả lời bằng SỐ LIỆU THẬT của nền tảng, không phải
 * bằng AI. Founder muốn "trả lời ngay, chính xác" — với câu hỏi dạng số liệu
 * thì tra thẳng CSDL vừa nhanh vừa đúng tuyệt đối, và KHÔNG cần khoá AI (đang
 * thiếu, task #111). Khi có khoá thì thêm nhánh hỏi-đáp tự do sau, không phải
 * đập bỏ cái này.
 *
 * BA LỚP CHẶN (thiếu bất kỳ lớp nào là rò số liệu kinh doanh ra người lạ):
 *  1. Header X-Telegram-Bot-Api-Secret-Token phải khớp BOT_INGEST_KEY — đăng ký
 *     lúc setWebhook, chứng minh update thật sự do Telegram đẩy tới.
 *  2. chat_id phải nằm trong TELEGRAM_ALLOWED_CHATS. Bot công khai trên
 *     Telegram, BẤT KỲ AI cũng nhắn được — thiếu lớp này là ai hỏi cũng trả.
 *  3. RPC platform_status chỉ trả SỐ ĐẾM, không trả dòng dữ liệu khách nào.
 *
 * Thiếu cấu hình (BOT_INGEST_KEY / TELEGRAM_BOT_TOKEN) → ACK 200 im lặng,
 * không lỗi, không spam log — cùng nếp với webhook Zalo Bot.
 */

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

type TelegramUpdate = {
  message?: {
    text?: unknown;
    message_thread_id?: unknown;
    chat?: { id?: unknown };
    from?: { is_bot?: unknown; username?: unknown };
  };
};

const HELP_TEXT = [
  "Bot nội bộ iFan — trả lời bằng số liệu thật từ hệ thống.",
  "",
  "/trangthai — số tiệm đang dùng, tiệm mới, tổng khách, yêu cầu cần giúp",
  "/help — bảng lệnh này",
  "",
  "Trong nhóm: nhắn kèm @iFanVN_bot hoặc gõ thẳng lệnh.",
].join("\n");

/** Hình dữ liệu RPC platform_status (migration #90). */
type PlatformStatus = {
  tenants_active: number;
  tenants_24h: number;
  tenants_7d: number;
  contacts_total: number;
  help_open: number;
  sessions_live: number;
  at: string;
};

function formatStatus(s: PlatformStatus): string {
  const lines = [
    `📊 Trạng thái iFan — ${s.at}`,
    "",
    `Tiệm đang dùng: ${s.tenants_active}`,
    `Tiệm mới 24 giờ qua: ${s.tenants_24h} · 7 ngày qua: ${s.tenants_7d}`,
    `Tổng khách hàng toàn nền tảng: ${s.contacts_total}`,
  ];
  // Chỉ nhắc khi CÓ việc phải xử — báo "0 yêu cầu" mỗi lần làm loãng cảnh báo
  // thật, đúng bài học đã ghi ở màn Cam kết phản hồi.
  if (s.help_open > 0) lines.push(`⚠️ Yêu cầu "Cần giúp?" đang chờ: ${s.help_open}`);
  if (s.sessions_live > 0) lines.push(`👀 Phiên hỗ trợ đang mở: ${s.sessions_live}`);
  if (s.help_open === 0 && s.sessions_live === 0) lines.push("Không có yêu cầu nào đang chờ.");
  return lines.join("\n");
}

/**
 * Tách lệnh khỏi tin nhắn. Telegram trong nhóm gửi lệnh kèm tên bot
 * ("/trangthai@iFanVN_bot") — không cắt đuôi này thì lệnh trong nhóm không bao
 * giờ khớp, mà chỉ nhắn riêng mới chạy (lỗi im lặng khó thấy).
 */
function parseCommand(text: string): string | null {
  const first = text.trim().split(/\s+/)[0] ?? "";
  if (!first.startsWith("/")) return null;
  return first.split("@")[0]!.toLowerCase();
}

export async function POST(req: Request): Promise<Response> {
  try {
    const key = process.env.BOT_INGEST_KEY;
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!key || !token) return new Response("OK", { status: 200 });

    const { allowed } = await rateLimit(
      `tg-webhook:ip:${clientIpFrom(req.headers)}`,
      120,
      60,
    );
    if (!allowed) return new Response("too many requests", { status: 429 });

    // Lớp 1 — chứng minh Telegram gửi, không phải người lạ gọi thẳng URL.
    if (req.headers.get("x-telegram-bot-api-secret-token") !== key) {
      return new Response("unauthorized", { status: 401 });
    }

    let update: TelegramUpdate = {};
    try {
      const parsed: unknown = await req.json();
      if (parsed !== null && typeof parsed === "object") {
        update = parsed as TelegramUpdate;
      }
    } catch {
      // body lạ → vẫn ACK để Telegram khỏi thử lại dồn đống
    }

    const message = update.message;
    const chatId =
      typeof message?.chat?.id === "string" || typeof message?.chat?.id === "number"
        ? String(message.chat.id)
        : null;
    const text = typeof message?.text === "string" ? message.text : null;
    const threadId =
      typeof message?.message_thread_id === "number"
        ? message.message_thread_id
        : undefined;

    if (!chatId || !text || message?.from?.is_bot === true) {
      return new Response("OK", { status: 200 });
    }

    // Lớp 2 — chỉ nhóm/người đã khai mới được hỏi. Danh sách rỗng = khoá hết,
    // KHÔNG mở toang: cấu hình thiếu phải fail-closed (bài học task #10).
    const allowList = (process.env.TELEGRAM_ALLOWED_CHATS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!allowList.includes(chatId)) {
      return new Response("OK", { status: 200 }); // im lặng, không lộ bot có gì
    }

    const command = parseCommand(text);
    if (!command) return new Response("OK", { status: 200 });

    if (command === "/help" || command === "/start") {
      waitUntil(telegramSend(token, chatId, HELP_TEXT, threadId));
      return new Response("OK", { status: 200 });
    }

    if (command === "/trangthai") {
      waitUntil(
        (async () => {
          const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data, error } = await supabase.rpc("platform_status", {
            p_key: key,
          });
          if (error) {
            console.error("[tg-webhook] platform_status lỗi:", error.message);
            await telegramSend(
              token,
              chatId,
              "Không lấy được số liệu lúc này. Thử lại sau ít phút.",
              threadId,
            );
            return;
          }
          await telegramSend(
            token,
            chatId,
            formatStatus(data as PlatformStatus),
            threadId,
          );
        })(),
      );
      return new Response("OK", { status: 200 });
    }

    // Lệnh lạ → chỉ đường, không im lặng (im lặng làm người dùng tưởng bot chết).
    waitUntil(
      telegramSend(token, chatId, `Chưa có lệnh "${command}".\n\n${HELP_TEXT}`, threadId),
    );
    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("[tg-webhook] lỗi không mong đợi:", err);
    return new Response("OK", { status: 200 });
  }
}
