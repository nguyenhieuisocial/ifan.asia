import {
  isEmbedKey,
  isVisitorToken,
  livechatClient,
  livechatFail,
  livechatIpThrottled,
  livechatOk,
  livechatPreflight,
  mapRpcError,
  originOf,
  rpcOriginOf,
  sha256Hex,
} from "@/lib/channels/livechat";

/**
 * POST /api/livechat/poll — widget hỏi tin mới (3 giây/lần khi đang mở).
 *
 * Dùng POST chứ không GET vì token phiên nằm trong body: token trong query
 * string sẽ lọt vào access log / Referer / lịch sử trình duyệt.
 *
 * Client KHÔNG gửi conversation_id — RPC tự suy ra hội thoại từ token phiên,
 * nên không có tham số nào để khách A trỏ sang hội thoại của khách B.
 */

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

export function OPTIONS(req: Request): Response {
  return livechatPreflight(req);
}

export async function POST(req: Request): Promise<Response> {
  const origin = originOf(req);
  if (!origin) return livechatFail("forbidden");
  if (await livechatIpThrottled(req.headers, "poll", 600)) {
    return livechatFail("rate_limited");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return livechatFail("invalid_request");
  }
  const input = (body ?? {}) as { key?: unknown; token?: unknown; after?: unknown };
  if (!isEmbedKey(input.key)) return livechatFail("forbidden");
  if (!isVisitorToken(input.token)) return livechatFail("forbidden");

  const after =
    typeof input.after === "string" && !Number.isNaN(Date.parse(input.after))
      ? input.after
      : null;

  const { data, error } = await livechatClient().rpc("livechat_poll", {
    p_embed_key: input.key,
    // Trang thử do iFan host đi qua bằng origin ảo (migration #55)
    p_origin: rpcOriginOf(origin),
    p_token_hash: sha256Hex(input.token),
    p_after: after,
  });
  if (error) {
    const mapped = mapRpcError(error.message);
    if (mapped === "server_error") {
      console.error("[livechat/poll] RPC lỗi:", error.message);
    }
    return livechatFail(mapped);
  }

  return livechatOk(data, origin);
}
