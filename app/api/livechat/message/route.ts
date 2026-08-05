import {
  LIVECHAT_MAX_TEXT,
  ipHashFor,
  isEmbedKey,
  isVisitorToken,
  livechatClient,
  livechatFail,
  livechatIpThrottled,
  livechatOk,
  livechatPreflight,
  mapRpcError,
  newVisitorToken,
  originOf,
  sha256Hex,
} from "@/lib/channels/livechat";

/**
 * POST /api/livechat/message — khách gửi tin từ website chủ shop.
 *
 * Token phiên sinh Ở ĐÂY (32 byte ngẫu nhiên) và chỉ bản băm đi xuống DB, nên
 * kể cả đọc được toàn bộ bảng cũng không chiếm được phiên của khách khác.
 * Khách chưa có phiên → RPC tự tạo phiên + hội thoại trong cùng transaction với
 * tin đầu tiên (chống lụt theo IP đã băm).
 */

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

export function OPTIONS(req: Request): Response {
  return livechatPreflight(req);
}

export async function POST(req: Request): Promise<Response> {
  const origin = originOf(req);
  if (!origin) return livechatFail("forbidden");
  if (await livechatIpThrottled(req.headers, "message", 60)) {
    return livechatFail("rate_limited");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return livechatFail("invalid_request");
  }
  const input = (body ?? {}) as {
    key?: unknown;
    token?: unknown;
    text?: unknown;
    url?: unknown;
  };
  if (!isEmbedKey(input.key)) return livechatFail("forbidden");
  if (typeof input.text !== "string") return livechatFail("invalid_request");

  const text = input.text.trim();
  if (!text) return livechatFail("invalid_request");
  // Chặn sớm ở biên: DB vẫn kiểm lại (nguồn sự thật), đây chỉ đỡ tải
  if (text.length > LIVECHAT_MAX_TEXT) return livechatFail("too_long");

  const known = isVisitorToken(input.token) ? input.token : null;
  const fresh = newVisitorToken();

  const { data, error } = await livechatClient().rpc("livechat_send", {
    p_embed_key: input.key,
    p_origin: origin,
    p_token_hash: known ? sha256Hex(known) : null,
    p_new_token_hash: sha256Hex(fresh),
    p_ip_hash: ipHashFor(req.headers, input.key),
    p_text: text,
    p_page_url: typeof input.url === "string" ? input.url.slice(0, 500) : null,
    p_user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300),
  });
  if (error) {
    const mapped = mapRpcError(error.message);
    if (mapped === "server_error") {
      console.error("[livechat/message] RPC lỗi:", error.message);
    }
    return livechatFail(mapped);
  }

  const result = data as { message_id: string; sent_at: string; created: boolean };
  return livechatOk(
    {
      messageId: result.message_id,
      sentAt: result.sent_at,
      // Chỉ lần đầu mới trả token — các lần sau trình duyệt đã có sẵn
      ...(result.created ? { token: fresh } : {}),
    },
    origin,
  );
}
