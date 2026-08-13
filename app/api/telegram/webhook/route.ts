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
    from?: { id?: unknown; is_bot?: unknown; username?: unknown };
  };
};

/**
 * Trần câu hỏi/ngày cho người KHÔNG phải chủ dự án. Mỗi câu tiêu vài nghìn tới
 * hơn chục nghìn đồng hạn mức Claude của founder — không có trần thì một người
 * nhắn liên tục là đốt sạch hạn mức tuần, và founder chỉ biết khi Claude Code
 * báo hết hạn mức giữa lúc đang cần làm việc.
 */
const GUEST_DAILY_CAP = 20;

const HELP_TEXT = [
  "Bot nội bộ iFan.",
  "",
  "Hỏi thẳng bằng câu thường — bot đọc được mã nguồn dự án và nhớ mạch chuyện,",
  "nên hỏi tiếp kiểu \"vậy cái đó sửa sao?\" là hiểu.",
  "",
  "/trangthai — số liệu thật: tiệm, khách, yêu cầu chờ (không giới hạn lượt)",
  "/moi — quên mạch chuyện cũ, bắt đầu lại từ đầu",
  "/help — bảng lệnh này",
  "",
  `Mỗi người hỏi tối đa ${GUEST_DAILY_CAP} câu/ngày (chủ dự án không giới hạn).`,
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
  bot_asks_today: number;
  bot_cost_today: number;
  at: string;
};

/** Quy đổi thô sang tiền Việt cho dễ hình dung — không phải tỉ giá kế toán. */
const USD_TO_VND = 25_000;

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
  // Mức dùng bot hôm nay — để founder thấy hạn mức Claude đang tiêu tới đâu,
  // thay vì chỉ phát hiện khi Claude Code báo hết hạn mức giữa lúc cần làm.
  if (s.bot_asks_today > 0) {
    const vnd = Math.round((s.bot_cost_today ?? 0) * USD_TO_VND).toLocaleString("vi-VN");
    lines.push("", `🤖 Hỏi bot hôm nay: ${s.bot_asks_today} câu · ~${vnd}đ hạn mức`);
  }
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

    /**
     * Chủ dự án được quyền sửa đổi VÀ không bị giới hạn số câu hỏi/ngày.
     * Nhận diện bằng MÃ SỐ, không phải @tên (tên đổi được).
     */
    const ownerIds = (process.env.TELEGRAM_OWNER_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const senderId = String(message?.from?.id ?? "");
    const isOwner = ownerIds.includes(senderId);

    // `/moi` phải đi TỚI CẦU NỐI chứ không dừng ở đây: mạch hội thoại nằm trên
    // máy founder, server không xoá hộ được.
    const isResetCommand = command === "/moi" || command === "/reset";

    // Không phải lệnh → đẩy sang cầu nối Claude Code trên máy founder
    // (migration #91). Webhook LUÔN giữ bot, cầu nối chỉ là phần cộng thêm —
    // tắt cầu nối thì các lệnh /… vẫn chạy y như cũ.
    if (!command || isResetCommand) {
      waitUntil(
        (async () => {
          const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data, error } = await supabase.rpc("tg_bridge_enqueue", {
            p_key: key,
            p_chat: chatId,
            p_thread: threadId ?? null,
            // MÃ SỐ tài khoản, KHÔNG phải @tên: tên hiển thị ai cũng tự đổi
            // được nên dùng nó để phân quyền là mời người khác giả mạo chủ
            // dự án. Mã số Telegram cấp, không đổi được.
            p_user: senderId,
            p_text: text,
            // Mỗi câu hỏi tiêu vài nghìn tới hơn chục nghìn đồng hạn mức Claude
            // của founder. Bot nằm trong nhóm nhiều người ⇒ phải có trần, nếu
            // không một người nhắn liên tục là đốt sạch hạn mức tuần. Chủ dự án
            // không bị chặn (anh ấy trả tiền và cần dùng cho việc thật).
            p_daily_cap: isOwner ? null : GUEST_DAILY_CAP,
          });
          if (error) {
            console.error("[tg-webhook] tg_bridge_enqueue lỗi:", error.message);
            return;
          }
          const res = data as {
            bridge_alive?: boolean;
            over_limit?: boolean;
            used?: number;
            cap?: number;
          };

          if (res?.over_limit) {
            await telegramSend(
              token,
              chatId,
              `Bạn đã hỏi ${res.used}/${res.cap} câu hôm nay — hết lượt rồi.\n\n` +
                "Lượt làm mới lúc nửa đêm. Cần số liệu ngay thì dùng /trangthai (không giới hạn).",
              threadId,
            );
            return;
          }

          // Nói ĐÚNG sự thật về việc có ai đang trực hay không, thay vì để
          // người hỏi chờ vô vọng khi máy founder đang tắt.
          await telegramSend(
            token,
            chatId,
            res?.bridge_alive === true
              ? "⏳ Đang hỏi Claude Code, chờ chút…"
              : "📥 Đã ghi nhận câu hỏi.\n\nMáy trạm chưa bật nên chưa trả lời tự do được ngay — " +
                  "sẽ trả lời khi bật lại. Cần số liệu ngay thì dùng /trangthai.",
            threadId,
          );
        })(),
      );
      return new Response("OK", { status: 200 });
    }

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
