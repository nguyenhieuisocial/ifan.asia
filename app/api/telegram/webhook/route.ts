import { createClient } from "@supabase/supabase-js";
import { waitUntil } from "@vercel/functions";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";
import { clientIpFrom, rateLimit } from "@/lib/rate-limit";
import { telegramReact, telegramSend } from "@/lib/notify/telegram";

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
    message_id?: unknown;
    message_thread_id?: unknown;
    chat?: { id?: unknown };
    from?: { id?: unknown; is_bot?: unknown; username?: unknown };
    // Tin gửi vào một chủ đề mang kèm tin dịch vụ "đã tạo chủ đề" — đây là chỗ
    // DUY NHẤT lấy được TÊN chủ đề từ Bot API (không có lệnh liệt kê chủ đề).
    reply_to_message?: { forum_topic_created?: { name?: unknown } };
  };
};

/** Một cửa Supabase cho mọi nhánh — tránh mỗi nhánh tự tạo một cái. */
function db() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

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
  "/lienket <mã> — nối Telegram này với tài khoản iFan (lấy mã ở Cài đặt → Tài khoản)",
  "/chude — chủ đề này hỏi được gì, và có những chủ đề nào",
  "/nhatky — ai đang dùng bot (chỉ chủ dự án)",
  "/phamvi <mô tả> — đặt phạm vi cho chủ đề đang mở (chỉ chủ dự án)",
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
  bridge_alive: boolean;
  bridge_seen_min: number | null;
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
  // Cầu nối sống hay chết — trước đây chỉ biết bằng cách hỏi một câu rồi chờ.
  // Nhịp tim đã ghi sẵn từ #91, chỉ là chưa ai đọc ra.
  lines.push(
    "",
    s.bridge_alive
      ? "🔌 Máy trạm: đang bật — hỏi tự do được."
      : s.bridge_seen_min === null
        ? "🔌 Máy trạm: chưa từng bật."
        : `🔌 Máy trạm: TẮT (lần cuối ${s.bridge_seen_min} phút trước) — câu hỏi sẽ chờ.`,
  );
  if (s.bot_asks_today > 0) {
    const vnd = Math.round((s.bot_cost_today ?? 0) * USD_TO_VND).toLocaleString("vi-VN");
    lines.push("", `🤖 Hỏi bot hôm nay: ${s.bot_asks_today} câu · ~${vnd}đ hạn mức`);
  }
  return lines.join("\n");
}

/** Hình dữ liệu RPC tg_log_digest (migration #95). */
type LogDigest = {
  hours: number;
  total: number;
  by_outcome: Record<string, number>;
  top_users: { who: string; linked: boolean; n: number }[];
  blocked_chats: number;
};

/** Nhãn tiếng Việt cho kết cục — mã máy không phải thứ founder phải học thuộc. */
const OUTCOME_LABELS: Record<string, string> = {
  queued: "câu hỏi",
  command: "lệnh",
  over_limit: "hết lượt",
  not_allowed: "bị chặn (chat lạ)",
  unknown_command: "lệnh lạ",
};

function formatDigest(d: LogDigest): string {
  const lines = [`📒 Nhật ký bot — ${d.hours} giờ qua`, "", `Tổng: ${d.total} tin`];

  const outcomes = Object.entries(d.by_outcome ?? {});
  if (outcomes.length > 0) {
    lines.push(
      ...outcomes.map(([k, n]) => `· ${OUTCOME_LABELS[k] ?? k}: ${n}`),
    );
  }

  if ((d.top_users ?? []).length > 0) {
    lines.push("", "Nhắn nhiều nhất:");
    lines.push(
      ...d.top_users.map(
        (u) => `· ${u.who}${u.linked ? " (đã nối tài khoản)" : ""} — ${u.n}`,
      ),
    );
  }

  // Chỉ kêu khi CÓ chuyện. Báo "0 chat lạ" mỗi lần làm loãng cảnh báo thật —
  // cùng nguyên tắc đã dùng cho /trangthai.
  if (d.blocked_chats > 0) {
    lines.push("", `⚠️ ${d.blocked_chats} chat lạ nhắn tới bot (đã chặn).`);
  }
  if (d.total === 0) lines.push("", "Không ai nhắn gì.");
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
    const messageId =
      typeof message?.message_id === "number" ? message.message_id : null;
    const username =
      typeof message?.from?.username === "string" ? message.from.username : null;

    if (!chatId || !text || message?.from?.is_bot === true) {
      return new Response("OK", { status: 200 });
    }

    const senderIdRaw = String(message?.from?.id ?? "");

    /**
     * Ghi nhật ký MỌI tin — founder 13/08: *"toàn bộ user chat telegram đều
     * cần lưu lại log hết."*
     *
     * Ghi ở ĐÂY, trước mọi lớp chặn, là có chủ đích: tin của chat lạ và tin
     * hết lượt chính là loại đáng soi nhất khi có chuyện, mà chúng nó không
     * bao giờ đi tới cầu nối. Ghi sau lớp chặn thì mất đúng thứ cần.
     *
     * Không await ở luồng chính: nhật ký hỏng KHÔNG được làm chết việc trả lời.
     */
    const log = async (outcome: string): Promise<void> => {
      const { error } = await db().rpc("tg_log_message", {
        p_key: key,
        p_chat: chatId,
        p_thread: threadId ?? null,
        p_user: senderIdRaw,
        p_username: username,
        p_message_id: messageId,
        p_text: text,
        p_outcome: outcome,
      });
      if (error) console.error("[tg-webhook] ghi nhật ký lỗi:", error.message);
    };

    // Chủ đề mới (ai đó vừa tạo trong nhóm) → tự ghi nhận tên. Không tự đặt
    // phạm vi: máy không đoán được chủ đề đó dùng để làm gì.
    const topicName = message?.reply_to_message?.forum_topic_created?.name;
    if (threadId && typeof topicName === "string") {
      waitUntil(
        (async () => {
          await db().rpc("tg_topic_seen", {
            p_key: key,
            p_chat: chatId,
            p_thread: threadId,
            p_name: topicName,
          });
        })(),
      );
    }

    // Lớp 2 — chỉ nhóm/người đã khai mới được hỏi. Danh sách rỗng = khoá hết,
    // KHÔNG mở toang: cấu hình thiếu phải fail-closed (bài học task #10).
    const allowList = (process.env.TELEGRAM_ALLOWED_CHATS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!allowList.includes(chatId)) {
      waitUntil(log("not_allowed"));
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

    /**
     * Quyền đọc từ LIÊN KẾT TÀI KHOẢN trước, danh sách gõ tay chỉ là đường lui.
     *
     * LỖI THẬT bắt được 13/08: máy chủ **không hề có** `TELEGRAM_OWNER_IDS` —
     * biến đó chỉ nằm trên máy founder. Hệ quả im lặng suốt cả ngày: webhook
     * coi chính founder là NGƯỜI THƯỜNG, tức anh ấy bị tính hạn mức 20
     * câu/ngày trên chính bot của mình, và sẽ bị chặn đúng lúc cần dùng nhất.
     *
     * Không đi khai thêm một biến môi trường nữa: danh sách người có quyền đã
     * nằm sẵn trong CSDL từ #96, đọc từ đó thì máy chủ và máy founder dùng
     * CÙNG MỘT NGUỒN.
     */
    let isOwner = ownerIds.includes(senderId);
    if (!isOwner && senderId) {
      const { data: who, error: whoError } = await db().rpc("tg_who_is", {
        p_key: key,
        p_tg_user: senderId,
      });
      if (whoError) {
        console.error("[tg-webhook] tg_who_is lỗi:", whoError.message);
      } else if ((who as { is_staff?: boolean } | null)?.is_staff === true) {
        isOwner = true;
      }
    }

    // `/moi` phải đi TỚI CẦU NỐI chứ không dừng ở đây: mạch hội thoại nằm trên
    // máy founder, server không xoá hộ được.
    const isResetCommand = command === "/moi" || command === "/reset";

    // Không phải lệnh → đẩy sang cầu nối Claude Code trên máy founder
    // (migration #91). Webhook LUÔN giữ bot, cầu nối chỉ là phần cộng thêm —
    // tắt cầu nối thì các lệnh /… vẫn chạy y như cũ.
    if (!command || isResetCommand) {
      waitUntil(
        (async () => {
          const supabase = db();
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
            await log("over_limit");
            await telegramSend(
              token,
              chatId,
              `Bạn đã hỏi ${res.used}/${res.cap} câu hôm nay — hết lượt rồi.\n\n` +
                "Lượt làm mới lúc nửa đêm. Cần số liệu ngay thì dùng /trangthai (không giới hạn).",
              threadId,
            );
            return;
          }

          await log("queued");

          if (res?.bridge_alive === true) {
            // KHÔNG gửi tin "đang hỏi…" nữa — founder 13/08: *"gây phiền và tốn
            // context"*. Mỗi câu hỏi đẻ thêm một tin rác trong nhóm, và câu đó
            // còn chui vào mạch hội thoại làm loãng ngữ cảnh.
            //
            // Thay bằng thả cảm xúc lên chính tin người hỏi: vẫn báo được "đã
            // nhận, đang làm" mà không thêm tin nào. Cầu nối còn bật thêm dấu
            // "đang gõ…" trong lúc chờ.
            if (messageId !== null) await telegramReact(token, chatId, messageId);
            return;
          }

          // Máy trạm tắt thì PHẢI nói thành lời: cảm xúc không diễn đạt được
          // "sẽ trả lời sau", và im lặng thì người hỏi chờ vô vọng.
          await telegramSend(
            token,
            chatId,
            "📥 Đã ghi nhận câu hỏi.\n\nMáy trạm chưa bật nên chưa trả lời tự do được ngay — " +
              "sẽ trả lời khi bật lại. Cần số liệu ngay thì dùng /trangthai.",
            threadId,
          );
        })(),
      );
      return new Response("OK", { status: 200 });
    }

    /**
     * `/lienket <mã>` — nối tài khoản Telegram với tài khoản iFan (migration
     * #96). Mã lấy trong iFan ở Cài đặt → Tài khoản.
     *
     * Đi CHIỀU NÀY (iFan phát mã → Telegram gõ mã) chứ không phải nhập mã số
     * Telegram vào ô cài đặt: bước gõ mã trong Telegram chứng minh người đó
     * thật sự cầm tài khoản Telegram kia. Gõ tay mã số thì ai cũng gõ được mã
     * số của người khác rồi tự nhận là chủ dự án.
     */
    if (command === "/lienket" || command === "/link") {
      waitUntil(log("command"));
      const code = text.trim().split(/\s+/)[1] ?? "";
      waitUntil(
        (async () => {
          if (!/^\d{6}$/.test(code)) {
            /**
             * Gõ `/lienket` trơn = HỎI TRẠNG THÁI, không phải xin hướng dẫn.
             *
             * Bản đầu luôn trả hướng dẫn, kể cả với người ĐÃ nối — founder gõ
             * xong tưởng chưa nối được gì ("chưa login đồng bộ được"). Bot phải
             * tự khai nó đang thấy mình là ai; không nói thì không ai kiểm được
             * ngoài việc mở thẳng cơ sở dữ liệu.
             */
            const { data: who } = await db().rpc("tg_who_is", {
              p_key: key,
              p_tg_user: senderIdRaw,
            });
            const info = who as { linked?: boolean; name?: string; is_staff?: boolean } | null;

            await telegramSend(
              token,
              chatId,
              info?.linked
                ? `✅ Đã nối với tài khoản iFan của ${info.name}.\n\n` +
                    (info.is_staff
                      ? "Quyền: chủ tiệm — hỏi gì cũng được, không giới hạn lượt."
                      : "Quyền: thành viên — hỏi thông tin công khai.") +
                    "\n\nMuốn đổi sang tài khoản khác: lấy mã mới trong iFan → Cài đặt → Tài khoản, rồi /lienket <mã>."
                : "Chưa nối tài khoản nào.\n\n" +
                    "1. Mở iFan → Cài đặt → Tài khoản → bấm \"Liên kết Telegram\"\n" +
                    "2. Nhắn lại đây: /lienket <mã 6 số>\n\n" +
                    "Mã sống 10 phút.",
              threadId,
            );
            return;
          }
          const { data, error } = await db().rpc("tg_link_confirm", {
            p_key: key,
            p_code: code,
            p_tg_user: senderIdRaw,
            p_tg_username: username,
          });
          if (error) {
            console.error("[tg-webhook] tg_link_confirm lỗi:", error.message);
            await telegramSend(token, chatId, "Nối không được lúc này, thử lại sau nhé.", threadId);
            return;
          }
          const res = data as { ok?: boolean; name?: string };
          await telegramSend(
            token,
            chatId,
            res?.ok
              ? `✅ Đã nối với tài khoản iFan của ${res.name}.`
              : "Mã không đúng hoặc đã hết hạn. Lấy mã mới trong iFan → Cài đặt → Tài khoản.",
            threadId,
          );
        })(),
      );
      return new Response("OK", { status: 200 });
    }

    /**
     * `/nhatky` — tóm tắt ai đang dùng bot (migration #95).
     *
     * CHỈ CHỦ DỰ ÁN. Nhật ký chứa dấu vết chat của người khác; ai hỏi cũng trả
     * là biến công cụ giám sát thành công cụ dòm ngó. Người thường hỏi thì trả
     * lời như một lệnh lạ — KHÔNG nói "lệnh này chỉ dành cho chủ dự án", vì
     * nói vậy là xác nhận có lệnh đó và mời người ta dò tiếp.
     */
    if (command === "/nhatky") {
      waitUntil(log("command"));
      if (!isOwner) {
        waitUntil(
          telegramSend(token, chatId, `Chưa có lệnh "${command}".\n\n${HELP_TEXT}`, threadId),
        );
        return new Response("OK", { status: 200 });
      }
      const hours = Number(text.trim().split(/\s+/)[1] ?? "24");
      waitUntil(
        (async () => {
          const { data, error } = await db().rpc("tg_log_digest", {
            p_key: key,
            p_hours: Number.isFinite(hours) ? hours : 24,
          });
          if (error) {
            console.error("[tg-webhook] tg_log_digest lỗi:", error.message);
            await telegramSend(token, chatId, "Không đọc được nhật ký lúc này.", threadId);
            return;
          }
          await telegramSend(token, chatId, formatDigest(data as LogDigest), threadId);
        })(),
      );
      return new Response("OK", { status: 200 });
    }

    /**
     * `/chude` — chủ đề này dùng để làm gì, và còn chủ đề nào khác.
     *
     * Bot ÂM THẦM chặn câu lạc chủ đề: người bị chỉ sang chỗ khác mà không biết
     * chủ đề này rốt cuộc dành cho gì. Luật vô hình thì người ta cứ vi phạm.
     * Ai cũng xem được — đây là nội quy phòng, không phải bí mật.
     */
    if (command === "/chude") {
      waitUntil(log("command"));
      waitUntil(
        (async () => {
          const { data, error } = await db().rpc("tg_topics_list", {
            p_key: key,
            p_chat: chatId,
          });
          if (error) {
            console.error("[tg-webhook] tg_topics_list lỗi:", error.message);
            await telegramSend(token, chatId, "Không đọc được danh sách chủ đề.", threadId);
            return;
          }
          const topics = (data ?? []) as { thread_id: number; name: string; scope: string | null }[];
          const here = topics.find((x) => x.thread_id === threadId);

          const lines: string[] = [];
          if (here) {
            lines.push(
              `📌 Đang ở chủ đề: ${here.name}`,
              here.scope
                ? `Dành cho: ${here.scope}`
                : "Chưa đặt phạm vi — hỏi gì cũng được.",
              "",
            );
          }
          lines.push("Các chủ đề trong nhóm:");
          lines.push(
            ...topics.map(
              (x) => `· ${x.name}${x.scope ? ` — ${x.scope}` : " (chưa đặt phạm vi)"}`,
            ),
          );
          if (isOwner) {
            lines.push("", "Đặt phạm vi cho chủ đề đang mở: /phamvi <mô tả>");
          }
          await telegramSend(token, chatId, lines.join("\n"), threadId);
        })(),
      );
      return new Response("OK", { status: 200 });
    }

    /**
     * `/phamvi <mô tả>` — chủ dự án đặt phạm vi cho chủ đề đang mở.
     *
     * Trước đó cột phạm vi KHÔNG AI GHI ĐƯỢC: chủ đề mới thì webhook tự học tên
     * nhưng để phạm vi trống, và chỉ sửa được bằng cách vào thẳng cơ sở dữ liệu.
     * Bảng có cột mà không có đường ghi là cột chết.
     */
    if (command === "/phamvi") {
      waitUntil(log("command"));
      if (!isOwner) {
        waitUntil(
          telegramSend(token, chatId, `Chưa có lệnh "${command}".\n\n${HELP_TEXT}`, threadId),
        );
        return new Response("OK", { status: 200 });
      }
      const scope = text.trim().replace(/^\S+\s*/, "");
      waitUntil(
        (async () => {
          if (!threadId) {
            await telegramSend(
              token,
              chatId,
              "Lệnh này chỉ dùng được BÊN TRONG một chủ đề của nhóm.",
              threadId,
            );
            return;
          }
          const { data, error } = await db().rpc("tg_topic_set_scope", {
            p_key: key,
            p_chat: chatId,
            p_thread: threadId,
            p_scope: scope,
          });
          if (error) {
            console.error("[tg-webhook] tg_topic_set_scope lỗi:", error.message);
            await telegramSend(token, chatId, "Chưa đặt được, thử lại sau.", threadId);
            return;
          }
          const res = data as { ok?: boolean; name?: string; reason?: string };
          await telegramSend(
            token,
            chatId,
            res?.ok
              ? scope === ""
                ? `Đã bỏ giới hạn cho chủ đề "${res.name}" — hỏi gì cũng được.`
                : `Đã đặt phạm vi cho chủ đề "${res.name}":\n${scope}`
              : "Chủ đề này bot chưa biết. Nhắn một câu bất kỳ trong đó rồi thử lại.",
            threadId,
          );
        })(),
      );
      return new Response("OK", { status: 200 });
    }

    if (command === "/help" || command === "/start") {
      waitUntil(log("command"));
      waitUntil(telegramSend(token, chatId, HELP_TEXT, threadId));
      return new Response("OK", { status: 200 });
    }

    if (command === "/trangthai") {
      waitUntil(log("command"));
      waitUntil(
        (async () => {
          const supabase = db();
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
    waitUntil(log("unknown_command"));
    waitUntil(
      telegramSend(token, chatId, `Chưa có lệnh "${command}".\n\n${HELP_TEXT}`, threadId),
    );
    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("[tg-webhook] lỗi không mong đợi:", err);
    return new Response("OK", { status: 200 });
  }
}
