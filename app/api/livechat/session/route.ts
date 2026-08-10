import {
  isEmbedKey,
  isVisitorToken,
  livechatClient,
  livechatFail,
  livechatOk,
  livechatPreflight,
  livechatSessionBlocked,
  mapRpcError,
  originOf,
  rpcOriginOf,
  sha256Hex,
} from "@/lib/channels/livechat";

/**
 * POST /api/livechat/session — widget khởi động.
 * Xác thực khóa nhúng + tên miền, trả lời chào và (nếu trình duyệt còn token
 * hợp lệ) lịch sử hội thoại cũ. KHÔNG tạo bản ghi nào ở đây: phiên khách chỉ
 * sinh khi khách thực sự gửi tin đầu tiên → trang có widget nhưng không ai chat
 * thì DB sạch, và không bot nào tạo được rác chỉ bằng cách tải trang.
 */

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

export function OPTIONS(req: Request): Response {
  return livechatPreflight(req);
}

export async function POST(req: Request): Promise<Response> {
  const origin = originOf(req);
  if (!origin) return livechatFail("forbidden");
  // Fail-closed: RPC livechat_session không tự đếm, nên đây là chốt DUY NHẤT.
  if (await livechatSessionBlocked(req.headers)) {
    return livechatFail("rate_limited");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return livechatFail("invalid_request");
  }
  const input = (body ?? {}) as { key?: unknown; token?: unknown };
  if (!isEmbedKey(input.key)) return livechatFail("forbidden");
  const tokenHash = isVisitorToken(input.token) ? sha256Hex(input.token) : null;

  const { data, error } = await livechatClient().rpc("livechat_session", {
    p_embed_key: input.key,
    // Trang thử do iFan host đi qua bằng origin ảo (migration #55) — origin
    // thật vẫn dùng cho header CORS ở livechatOk bên dưới.
    p_origin: rpcOriginOf(origin),
    p_token_hash: tokenHash,
  });
  if (error) {
    const mapped = mapRpcError(error.message);
    // Chỉ log phía server; phản hồi ra internet không kèm chi tiết nào
    if (mapped === "server_error") {
      console.error("[livechat/session] RPC lỗi:", error.message);
    }
    return livechatFail(mapped);
  }

  return livechatOk(data, origin);
}
