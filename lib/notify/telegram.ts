/**
 * Adapter Telegram Bot — kênh thứ hai của interface NotifyChannel
 * (lib/notify/channel.ts, khuôn spec B26: một interface, mỗi nền tảng một
 * adapter mỏng, KHÔNG dựng registry/factory khi mới có hai kênh).
 *
 * Telegram Bot API và Zalo Bot Platform gần như trùng hình dạng (Zalo làm theo
 * Telegram) — nhưng CỐ Ý tách file riêng thay vì gộp: hai nền tảng có trần độ
 * dài khác nhau (2.000 vs 4.096), base URL khác, và Telegram có khái niệm
 * "chủ đề" (message_thread_id) mà Zalo không có. Gộp lại là phải cắm cờ điều
 * kiện vào từng dòng.
 *
 * Chỉ chạy server — token đi qua đây, KHÔNG import vào client component,
 * KHÔNG log token.
 */

const TELEGRAM_API_BASE = "https://api.telegram.org";
/** Trần sendMessage của Telegram (4.096 ký tự) — cắt cứng, không để API trả 400. */
const MAX_TEXT_LENGTH = 4096;
/** API treo thì thà bỏ lượt gửi còn hơn giữ serverless function sống mãi. */
const TIMEOUT_MS = 10_000;

export type TelegramSendResult = { ok: true } | { ok: false; error: string };

async function callTelegramApi(
  token: string,
  method: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  try {
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body: unknown = await res.json().catch(() => null);
    const parsed =
      body !== null && typeof body === "object"
        ? (body as { ok?: boolean; result?: unknown })
        : null;
    if (!res.ok || parsed?.ok !== true) {
      // KHÔNG kèm response thô vào message lỗi — có thể chứa mảnh token.
      return { ok: false, error: `${method}_http_${res.status}` };
    }
    return { ok: true, result: parsed.result };
  } catch {
    return { ok: false, error: `${method}_unreachable` };
  }
}

/**
 * Gửi tin. `threadId` là id chủ đề trong nhóm dạng diễn đàn — có thì trả lời
 * ĐÚNG chủ đề người ta hỏi, thiếu thì tin rơi xuống chủ đề General và người
 * hỏi không thấy.
 */
export async function telegramSend(
  token: string,
  chatId: string,
  text: string,
  threadId?: number,
): Promise<TelegramSendResult> {
  const res = await callTelegramApi(token, "sendMessage", {
    chat_id: chatId,
    text: text.slice(0, MAX_TEXT_LENGTH),
    ...(threadId != null ? { message_thread_id: threadId } : {}),
  });
  return res.ok ? { ok: true } : { ok: false, error: res.error ?? "send_failed" };
}

/**
 * Đăng ký webhook + secret_token. Telegram gửi lại secret trong header
 * X-Telegram-Bot-Api-Secret-Token mỗi update — route so khớp trước khi đọc body.
 */
export async function telegramSetWebhook(
  token: string,
  url: string,
  secretToken: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await callTelegramApi(token, "setWebhook", {
    url,
    secret_token: secretToken,
    // Chỉ nhận tin nhắn — không cần callback_query/inline/edited để đỡ nhiễu.
    allowed_updates: ["message"],
    // Bỏ hàng đợi cũ khi đổi webhook: tin tồn đọng từ lần cấu hình trước
    // không còn nghĩa gì, để lại chỉ tổ trả lời muộn hàng loạt.
    drop_pending_updates: true,
  });
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}
