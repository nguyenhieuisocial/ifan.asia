import { createClient } from "@supabase/supabase-js";
import { waitUntil } from "@vercel/functions";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";
import { clientIpFrom, rateLimit } from "@/lib/rate-limit";
import { zaloBotChannel } from "@/lib/notify/channel";
import { processBotOutbox } from "@/lib/notify/outbox";
import { processPlatformOutbox } from "@/lib/notify/platform-outbox";

/**
 * Webhook nhận update từ Zalo Bot Platform (bot.zapps.me) — cửa ghép nối
 * "/link <mã 6 số>" của nhân viên (spec B26).
 *
 * Xác thực: header X-Bot-Api-Secret-Token do nền tảng gửi lại, phải khớp env
 * BOT_INGEST_KEY (giá trị này được đăng ký làm secret_token lúc setWebhook —
 * xem connectZaloBot trong settings/notifications/actions.ts). Mỗi bot trỏ về
 * URL kèm ?ch=<channel_id> để biết update thuộc bot của tiệm nào — riêng bot
 * "chuông nền tảng" (ADR-0007) trỏ về ?ch=platform, chuỗi cố định nằm ngoài
 * UUID_RE nên không đụng đường tiệm.
 *
 * Hai chế độ: thiếu BOT_INGEST_KEY → ACK 200 im lặng, không lỗi, không spam log.
 * Mẫu ACK-trước-xử-lý-sau như webhook Zalo OA: trả 200 rồi mới nhắn trả lời +
 * kích worker gửi outbox (lưới an toàn cho bản tin đang chờ).
 */

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Payload update từ nền tảng bot (kiểu Telegram: cập nhật đẩy thẳng
 * { update_id, message }, KHÔNG bọc trong { ok, result } — bọc result chỉ là
 * hình dạng RESPONSE của các API gọi ra (getMe/sendMessage...), khác webhook
 * PUSH vào. Bẫy tự bắt 12/08: code cũ chỉ đọc update.result?.message, nên từ
 * khi triển khai (#53) tới lúc BOT_INGEST_KEY thật sự sống (12/08) — tức là
 * CHƯA TỪNG có traffic thật đi qua nhánh này để lộ ra — mọi update thật đều
 * rơi vào chỗ trống, không match được gì, im lặng không báo lỗi. Đọc cả hai
 * hình dạng để không phụ thuộc đoán đúng tuyệt đối cấu trúc thật của Zalo.
 */
type BotUpdate = {
  message?: {
    text?: unknown;
    chat?: { id?: unknown };
    from?: { is_bot?: unknown };
  };
  result?: {
    message?: {
      text?: unknown;
      chat?: { id?: unknown };
      from?: { is_bot?: unknown };
    };
  };
};

export async function POST(req: Request): Promise<Response> {
  try {
    const key = process.env.BOT_INGEST_KEY;
    if (!key) return new Response("OK", { status: 200 }); // chưa cấu hình → đứng yên

    // Chặn flood trước khi làm gì tốn kém — bot cá nhân, 120/phút mỗi IP là rộng.
    const { allowed } = await rateLimit(
      `bot-webhook:ip:${clientIpFrom(req.headers)}`,
      120,
      60,
    );
    if (!allowed) return new Response("too many requests", { status: 429 });

    // secret_token đã đăng ký lúc setWebhook — sai là dừng, không đọc body.
    const secret = req.headers.get("x-bot-api-secret-token") ?? "";
    if (secret !== key) {
      return new Response("unauthorized", { status: 401 });
    }

    const channelId = new URL(req.url).searchParams.get("ch") ?? "";
    const isPlatform = channelId === "platform";
    if (!isPlatform && !UUID_RE.test(channelId)) return new Response("OK", { status: 200 });

    let update: BotUpdate = {};
    try {
      const parsed: unknown = await req.json();
      if (parsed !== null && typeof parsed === "object") {
        update = parsed as BotUpdate;
      }
    } catch {
      // body lạ → vẫn ACK, không cho retry dồn đống
    }

    const message = update.message ?? update.result?.message;
    const chatId =
      typeof message?.chat?.id === "string" || typeof message?.chat?.id === "number"
        ? String(message.chat.id)
        : null;
    const text = typeof message?.text === "string" ? message.text : null;

    if (chatId && text && message?.from?.is_bot !== true) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const linkMatch = text.trim().match(/^\/link\s+(\d{6})$/);

      if (isPlatform) {
        // Chuông nền tảng (ADR-0007) — MỘT người nhận, không có nhiều nhân
        // viên ghép nối; RPC platform_bot_pair tự đối chiếu mã đã cấp sẵn.
        if (linkMatch) {
          const { data, error } = await supabase.rpc("platform_bot_pair", {
            p_key: key,
            p_chat_id: chatId,
            p_code: linkMatch[1],
          });
          if (error) {
            console.error("[bot-webhook] platform_bot_pair lỗi:", error.message);
          } else {
            const res = data as { status?: string; bot_token?: string | null };
            if (res.bot_token) {
              const reply =
                res.status === "linked"
                  ? "Liên kết thành công! Từ giờ iFan sẽ báo bạn qua Zalo mỗi khi có " +
                    "yêu cầu \"Cần giúp?\" hoặc cảnh báo hệ thống."
                  : "Mã không đúng hoặc chưa có mã nào đang chờ liên kết.";
              waitUntil(zaloBotChannel(res.bot_token).send(chatId, reply));
            }
          }
        } else {
          const { data: token } = await supabase.rpc("platform_webhook_token", {
            p_key: key,
          });
          if (typeof token === "string" && token) {
            waitUntil(
              zaloBotChannel(token).send(
                chatId,
                "Đây là bot chuông nền tảng của iFan. Liên kết bằng cách nhắn: " +
                  "/link <mã 6 số> (mã do đội kỹ thuật cấp sẵn).",
              ),
            );
          }
        }
      } else if (linkMatch) {
        const { data, error } = await supabase.rpc("bot_link_via_code", {
          p_key: key,
          p_channel: channelId,
          p_chat_id: chatId,
          p_code: linkMatch[1],
        });
        if (error) {
          console.error("[bot-webhook] bot_link_via_code lỗi:", error.message);
        } else {
          const res = data as { status?: string; bot_token?: string | null };
          if (res.bot_token) {
            const reply =
              res.status === "linked"
                ? "Liên kết thành công! Từ giờ iFan sẽ nhắc việc cho bạn qua Zalo. " +
                  "Chỉnh loại thông báo và giờ nhận trong iFan → Cài đặt → Thông báo."
                : "Mã không đúng hoặc đã hết hạn (mã chỉ sống 10 phút). " +
                  "Vào iFan → Cài đặt → Thông báo bấm 'Tạo mã liên kết' rồi nhắn lại nhé.";
            const token = res.bot_token;
            waitUntil(zaloBotChannel(token).send(chatId, reply));
          }
        }
      } else {
        // Tin thường (kể cả /start) → chỉ đường lấy mã ghép nối.
        const { data: token } = await supabase.rpc("bot_webhook_token", {
          p_key: key,
          p_channel: channelId,
        });
        if (typeof token === "string" && token) {
          waitUntil(
            zaloBotChannel(token).send(
              chatId,
              "Đây là bot nhắc việc của iFan. Để nhận thông báo: vào iFan → " +
                "Cài đặt → Thông báo, bấm 'Tạo mã liên kết' rồi nhắn cho tôi: /link <mã 6 số>",
            ),
          );
        }
      }
    }

    // Lưới an toàn: mỗi lần bot có tương tác là một dịp đẩy bản tin đang chờ.
    waitUntil(isPlatform ? processPlatformOutbox() : processBotOutbox());

    return new Response("OK", { status: 200 });
  } catch (err) {
    // Không throw ra ngoài — nền tảng bot không cần retry vì lỗi nội bộ của ta
    console.error("[bot-webhook] lỗi không mong đợi:", err);
    return new Response("OK", { status: 200 });
  }
}
