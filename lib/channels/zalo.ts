import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "../supabase/service";
import type {
  ChannelAdapter,
  InboundMessage,
  OutboundMessage,
  SendResult,
} from "./types";

/**
 * Zalo OA adapter — hiện thực ChannelAdapter đầu tiên (đợt 1). KHÔNG module
 * nào gọi thẳng API Zalo ngoài file này (kỷ luật A2 trong types.ts).
 *
 * Hai chế độ (mirror AI gateway):
 * - ZALO_DRY_RUN=1: log request thay vì gọi Zalo thật — chạy QA end-to-end
 *   khi OA chưa được duyệt, không cần đổi code lúc go-live.
 * - Thật: gọi Open API v3; token đọc từ Vault qua RPC get_zalo_channel_secrets
 *   (service role); token hết hạn (-216) → refresh OAuth v4 rồi retry đúng 1 lần.
 *
 * Endpoint theo nghiên cứu "Khả thi API Zalo - TikTok - Facebook" (Open API v3
 * bắt buộc từ 20/06/2023) + tài liệu chính thức developers.zalo.me:
 * - Gửi tin Tư vấn:  POST https://openapi.zalo.me/v3.0/oa/message/cs
 *   header access_token; body {recipient:{user_id},message:{text}};
 *   response {error, message, data:{message_id,...}} — error === 0 là thành công.
 * - Refresh token:   POST https://oauth.zaloapp.com/v4/oa/access_token
 *   header secret_key = app secret; form app_id, refresh_token,
 *   grant_type=refresh_token. Access token sống ~25 giờ; refresh token ~3 tháng
 *   và DÙNG MỘT LẦN — cặp mới phải ghi đè Vault ngay (update_zalo_channel_tokens).
 */

const ZALO_CS_MESSAGE_URL = "https://openapi.zalo.me/v3.0/oa/message/cs";
const ZALO_OAUTH_TOKEN_URL = "https://oauth.zaloapp.com/v4/oa/access_token";

/**
 * Lý do lỗi typed — dùng làm giá trị SendResult.error để server action / UI
 * map thẳng sang toast key (inbox.toasts.*).
 */
export type ZaloSendFailureReason =
  | "not_connected"
  | "token_expired"
  | "rate_limited"
  | "api_error"
  | "window_closed";

/** -216: access token sai/hết hạn (developers.zalo.me — Mã lỗi OA API). */
const TOKEN_EXPIRED_CODE = -216;
/**
 * Mã coi là "ngoài diện được nhắn" → window_closed (spec: khóa composer + banner
 * 48h). -213: người dùng chưa quan tâm/tương tác OA (đã xác minh qua tài liệu
 * chính thức). Mã riêng cho "ngoài cửa sổ 48h/quota tin Tư vấn" chưa xác minh
 * được từ nghiên cứu (sổ "Cần xác minh" #3/#7 của spec) — nhận diện bổ sung
 * qua message pattern bên dưới; xác minh lại ngay lần gửi thật đầu tiên.
 */
const WINDOW_CLOSED_CODES = new Set([-213]);
const WINDOW_CLOSED_MESSAGE = /48h|48 gi|window|tương tác|interact|quota/i;

type ZaloApiResponse = {
  error?: number;
  message?: string;
  data?: { message_id?: string };
};

type ZaloOauthResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: string | number;
  error?: number;
};

type CsCallOutcome =
  | { kind: "ok"; messageId: string }
  | { kind: "token_expired" }
  | { kind: "failed"; reason: Exclude<ZaloSendFailureReason, "token_expired"> };

function fail(reason: ZaloSendFailureReason): SendResult {
  return { ok: false, error: reason, retryable: reason === "rate_limited" };
}

/** Gọi endpoint gửi tin Tư vấn 1 lần với access token cho trước. */
async function callCsEndpoint(
  accessToken: string,
  userId: string,
  text: string,
): Promise<CsCallOutcome> {
  let res: Response;
  try {
    res = await fetch(ZALO_CS_MESSAGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        access_token: accessToken,
      },
      body: JSON.stringify({
        recipient: { user_id: userId },
        message: { text },
      }),
    });
  } catch (error) {
    console.error("[zalo-adapter] không gọi được API gửi tin:", error);
    return { kind: "failed", reason: "api_error" };
  }
  if (res.status === 429) return { kind: "failed", reason: "rate_limited" };

  let body: ZaloApiResponse;
  try {
    body = (await res.json()) as ZaloApiResponse;
  } catch {
    console.error("[zalo-adapter] response gửi tin không phải JSON, HTTP", res.status);
    return { kind: "failed", reason: "api_error" };
  }

  if (body.error === 0) {
    return { kind: "ok", messageId: body.data?.message_id ?? "" };
  }
  if (body.error === TOKEN_EXPIRED_CODE) return { kind: "token_expired" };
  if (
    typeof body.error === "number" &&
    (WINDOW_CLOSED_CODES.has(body.error) ||
      WINDOW_CLOSED_MESSAGE.test(body.message ?? ""))
  ) {
    return { kind: "failed", reason: "window_closed" };
  }
  console.error("[zalo-adapter] Zalo trả lỗi", body.error, body.message);
  return { kind: "failed", reason: "api_error" };
}

/** Đọc cặp token từ Vault (RPC chỉ service_role gọi được). */
async function fetchSecrets(
  service: SupabaseClient,
  channelId: string,
): Promise<{ accessToken: string; refreshToken: string } | null> {
  const { data, error } = await service.rpc("get_zalo_channel_secrets", {
    p_channel_id: channelId,
  });
  if (error) {
    console.error("[zalo-adapter] không đọc được secret từ Vault:", error.message);
    return null;
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { access_token: string | null; refresh_token: string | null }
    | undefined;
  if (!row?.access_token || !row.refresh_token) return null;
  return { accessToken: row.access_token, refreshToken: row.refresh_token };
}

/**
 * Đổi refresh token lấy cặp token mới + ghi đè Vault. Trả access token mới,
 * hoặc null khi refresh thất bại (channel được đánh dấu token_expired).
 */
async function refreshTokens(
  service: SupabaseClient,
  channelId: string,
  refreshToken: string,
): Promise<string | null> {
  const appId = process.env.ZALO_APP_ID;
  const appSecret = process.env.ZALO_APP_SECRET;
  if (!appId || !appSecret) {
    console.error("[zalo-adapter] thiếu ZALO_APP_ID/ZALO_APP_SECRET — không refresh được token");
    await markTokenExpired(service, channelId);
    return null;
  }

  let body: ZaloOauthResponse;
  try {
    const res = await fetch(ZALO_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        secret_key: appSecret,
      },
      body: new URLSearchParams({
        app_id: appId,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }).toString(),
    });
    body = (await res.json()) as ZaloOauthResponse;
  } catch (error) {
    console.error("[zalo-adapter] refresh token thất bại (network):", error);
    return null; // lỗi mạng tạm thời — KHÔNG đánh dấu token_expired
  }

  if (!body.access_token || !body.refresh_token) {
    console.error("[zalo-adapter] refresh token bị từ chối, error =", body.error);
    await markTokenExpired(service, channelId);
    return null;
  }

  const { error } = await service.rpc("update_zalo_channel_tokens", {
    p_channel_id: channelId,
    p_access_token: body.access_token,
    p_refresh_token: body.refresh_token,
  });
  if (error) {
    // Token mới không lưu được → refresh token cũ đã bị đốt (dùng 1 lần).
    // Vẫn dùng access token mới cho lượt gửi này; lần sau sẽ phải kết nối lại.
    console.error("[zalo-adapter] không lưu được token mới vào Vault:", error.message);
  }
  return body.access_token;
}

async function markTokenExpired(service: SupabaseClient, channelId: string) {
  // service role bỏ qua RLS — cập nhật trạng thái để Settings hiện "Lỗi token"
  const { error } = await service
    .from("channels")
    .update({ status: "token_expired" })
    .eq("id", channelId);
  if (error) {
    console.error("[zalo-adapter] không cập nhật được status token_expired:", error.message);
  }
}

type ZaloWebhookPayload = {
  oa_id?: string;
  event_name?: string;
  timestamp?: string | number;
  sender?: { id?: string };
  message?: { msg_id?: string; text?: string };
};

export const zaloAdapter: ChannelAdapter = {
  type: "zalo_oa",

  /**
   * Chuẩn hóa payload webhook user_send_text → InboundMessage (pure, chưa đụng
   * DB). Đợt 1 đường nhận tin thật đi qua /api/webhooks/zalo → RPC
   * ingest_zalo_event → process_zalo_events (ACK<2s); channelId resolve theo
   * oa_id ở tầng DB nên ở bước parse để trống.
   */
  async parseWebhook(_headers, body): Promise<InboundMessage[]> {
    if (body === null || typeof body !== "object" || Array.isArray(body)) return [];
    const payload = body as ZaloWebhookPayload;
    const senderId = payload.sender?.id;
    const msgId = payload.message?.msg_id;
    if (payload.event_name !== "user_send_text" || !senderId || !msgId) return [];
    const ts = Number(payload.timestamp);
    const sentAt = Number.isFinite(ts) && ts > 0 ? new Date(ts) : new Date();
    return [
      {
        channelType: "zalo_oa",
        channelId: "", // resolve theo oa_id trong DB (process_zalo_events)
        externalMessageId: msgId,
        externalUserId: senderId,
        direction: "in",
        sentAt: sentAt.toISOString(),
        text: payload.message?.text,
        raw: body,
      },
    ];
  },

  /** Gửi tin Tư vấn. error của SendResult là ZaloSendFailureReason. */
  async send(message: OutboundMessage): Promise<SendResult> {
    const text = message.text?.trim();
    if (!text) return fail("api_error"); // đợt 1 chỉ hỗ trợ tin văn bản

    const service = createServiceClient();
    if (!service) {
      console.error("[zalo-adapter] thiếu SUPABASE_SERVICE_ROLE_KEY — không đọc được Vault");
      return fail("api_error");
    }

    const secrets = await fetchSecrets(service, message.channelId);
    if (!secrets) return fail("not_connected");

    // Dry-run: chứng minh trọn đường sendReply → Vault → request mà không gọi
    // Zalo thật (OA chưa duyệt). Log request sẽ-gửi, token KHÔNG log.
    if (process.env.ZALO_DRY_RUN === "1") {
      console.info("[zalo-adapter] DRY RUN — request sẽ gửi:", {
        url: ZALO_CS_MESSAGE_URL,
        header: { access_token: "<vault>" },
        body: { recipient: { user_id: message.externalUserId }, message: { text } },
      });
      return { ok: true, externalMessageId: `dry-run-${Date.now()}` };
    }

    const first = await callCsEndpoint(secrets.accessToken, message.externalUserId, text);
    if (first.kind === "ok") {
      return { ok: true, externalMessageId: first.messageId };
    }
    if (first.kind === "failed") return fail(first.reason);

    // -216 → refresh rồi retry đúng 1 lần
    const newAccess = await refreshTokens(service, message.channelId, secrets.refreshToken);
    if (!newAccess) return fail("token_expired");

    const retry = await callCsEndpoint(newAccess, message.externalUserId, text);
    if (retry.kind === "ok") {
      return { ok: true, externalMessageId: retry.messageId };
    }
    if (retry.kind === "token_expired") {
      await markTokenExpired(service, message.channelId);
      return fail("token_expired");
    }
    return fail(retry.reason);
  },
};
