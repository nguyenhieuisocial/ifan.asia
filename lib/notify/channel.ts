/**
 * Lớp "kênh thông báo ra ngoài" — MỎNG có chủ đích (spec B26): một interface +
 * một adapter Zalo Bot. Mai cắm ZNS/OA thì thêm adapter mới cùng interface,
 * KHÔNG thêm registry/factory khi mới có một kênh.
 *
 * Chỉ chạy server (route handler / server action) — token bot đi qua đây,
 * TUYỆT ĐỐI không import vào client component và không log token.
 *
 * Zalo Bot Platform (bot.zapps.me) — API kiểu Telegram, đã xác minh từ docs:
 *   POST https://bot-api.zaloplatforms.com/bot{token}/{method}
 *   sendMessage { chat_id, text (1-2000 ký tự) } → { ok, result }
 *   getMe → { ok, result: { id, account_name } }
 *   setWebhook { url, secret_token } → nền tảng gửi update kèm header
 *   X-Bot-Api-Secret-Token = secret_token (route webhook so khớp).
 */

const BOT_API_BASE = "https://bot-api.zaloplatforms.com";
/** Trần độ dài text của sendMessage theo docs (1-2000 ký tự). */
const MAX_TEXT_LENGTH = 2000;
/** Bot API treo thì thà bỏ lượt gửi (outbox sẽ thử lại) còn hơn giữ function sống mãi. */
const TIMEOUT_MS = 10_000;

export type SendResult = { ok: true } | { ok: false; error: string };

/** Kênh gửi thông báo tới đích ngoài hệ thống (chat id đã ghép nối sẵn ở DB). */
export interface NotifyChannel {
  send(chatId: string, text: string): Promise<SendResult>;
}

/**
 * Gọi một method của Bot API. Trả body JSON đã parse hoặc lỗi gọn (mã HTTP /
 * mô tả ngắn) — KHÔNG kèm token, KHÔNG kèm response thô vào message lỗi.
 */
async function callBotApi(
  token: string,
  method: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  try {
    const res = await fetch(`${BOT_API_BASE}/bot${token}/${method}`, {
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
      return { ok: false, error: `${method}_http_${res.status}` };
    }
    return { ok: true, result: parsed.result };
  } catch {
    return { ok: false, error: `${method}_unreachable` };
  }
}

/** Adapter Zalo Bot — đợt 1 của interface NotifyChannel. */
export function zaloBotChannel(token: string): NotifyChannel {
  return {
    async send(chatId: string, text: string): Promise<SendResult> {
      const res = await callBotApi(token, "sendMessage", {
        chat_id: chatId,
        text: text.slice(0, MAX_TEXT_LENGTH),
      });
      return res.ok ? { ok: true } : { ok: false, error: res.error ?? "send_failed" };
    },
  };
}

/** Kiểm token sống + lấy tên bot (account_name) — gọi khi chủ tiệm dán token. */
export async function zaloBotGetMe(
  token: string,
): Promise<{ ok: true; name: string | null } | { ok: false }> {
  const res = await callBotApi(token, "getMe", {});
  if (!res.ok) return { ok: false };
  const result =
    res.result !== null && typeof res.result === "object"
      ? (res.result as { account_name?: unknown })
      : null;
  return {
    ok: true,
    name:
      typeof result?.account_name === "string" && result.account_name !== ""
        ? result.account_name
        : null,
  };
}

/** Đăng ký webhook nhận update (/link) — secret_token quay lại trong header. */
export async function zaloBotSetWebhook(
  token: string,
  url: string,
  secretToken: string,
): Promise<{ ok: boolean }> {
  const res = await callBotApi(token, "setWebhook", {
    url,
    secret_token: secretToken,
  });
  return { ok: res.ok };
}
