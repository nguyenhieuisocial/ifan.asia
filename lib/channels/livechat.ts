import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";
import { clientIpFrom, rateLimit } from "@/lib/rate-limit";
import type { ChannelAdapter, OutboundMessage, SendResult } from "./types";

/**
 * Live Chat — kênh website tự vận hành (spec 02 Omnichannel Inbox §4.5/§4.6).
 *
 * ĐÂY LÀ ĐIỂM CHẠM INTERNET KHÔNG XÁC THỰC. Toàn bộ nghiệp vụ + rate limit +
 * whitelist tên miền nằm trong RPC security definer (migration #23) — file này
 * chỉ là lớp vận chuyển: đọc Origin, băm token/IP, gọi RPC, chuẩn hóa lỗi.
 *
 * Ba quyết định bảo mật cố ý:
 * 1. Không dùng service_role key — route chạy bằng anon key, mọi đặc quyền nằm
 *    trong RPC definer (giống pipeline webhook Zalo).
 * 2. lib/rate-limit.ts FAIL-OPEN khi chưa cấu hình Upstash → nó chỉ là lớp
 *    ngoài. Chốt chặn thật là bộ đếm trong DB (không thể fail-open).
 * 3. Sai khóa nhúng và sai tên miền trả CÙNG một lỗi 'forbidden', không kèm
 *    thông tin tenant → không dò được khóa hợp lệ, không lộ tên shop.
 */

/** Giới hạn độ dài tin — PHẢI khớp hằng số trong migration #23. */
export const LIVECHAT_MAX_TEXT = 2000;

/** Mã lỗi trả ra internet — cố định, không kèm dữ liệu tenant. */
export type LivechatError =
  | "invalid_request"
  | "forbidden"
  | "rate_limited"
  | "too_long"
  | "server_error";

const ERROR_STATUS: Record<LivechatError, number> = {
  invalid_request: 400,
  forbidden: 403,
  rate_limited: 429,
  too_long: 413,
  server_error: 500,
};

/** Client anon không cookie — route handler công khai, không có phiên người dùng. */
export function livechatClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** sha256 hex — dùng cho token phiên và IP (DB không giữ giá trị gốc). */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Token phiên khách: 32 byte ngẫu nhiên, chỉ trình duyệt khách giữ bản gốc. */
export function newVisitorToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Băm IP có muối bằng chính khóa nhúng (32 hex ký tự entropy) — đủ chống dò
 * ngược bảng cầu vồng IPv4, và không cần thêm biến môi trường mới.
 */
export function ipHashFor(headers: Headers, embedKey: string): string {
  return sha256Hex(`${clientIpFrom(headers)}:${embedKey}`);
}

/** Origin của request — thiếu header Origin thì coi như không hợp lệ. */
export function originOf(req: Request): string | null {
  const origin = req.headers.get("origin");
  if (!origin || origin === "null" || origin.length > 255) return null;
  return origin.toLowerCase();
}

/**
 * Header CORS: chỉ echo lại ĐÚNG origin đã được whitelist, không bao giờ `*`,
 * không bật credentials (widget xác thực bằng token trong body, không cookie).
 */
function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

/** Trả lỗi gọn — KHÔNG header CORS (trình duyệt chặn luôn, khỏi rò nội dung). */
export function livechatFail(error: LivechatError): Response {
  return Response.json({ error }, { status: ERROR_STATUS[error] });
}

/** Trả dữ liệu kèm CORS cho đúng origin đã whitelist. */
export function livechatOk(body: unknown, origin: string): Response {
  return Response.json(body, { status: 200, headers: corsHeaders(origin) });
}

/**
 * Preflight: trả CORS "mở" cho method/header nhưng KHÔNG xác nhận khóa nào cả.
 * Việc chặn thật diễn ra ở POST (RPC kiểm khóa + tên miền), nên preflight
 * không lộ tenant nào đã đăng ký tên miền nào.
 */
export function livechatPreflight(req: Request): Response {
  const origin = originOf(req);
  if (!origin) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

/** Map lỗi RPC (message của Postgres) về mã công khai. */
export function mapRpcError(message: string): LivechatError {
  if (message.includes("message_too_long")) return "too_long";
  if (message.includes("rate_limited")) return "rate_limited";
  if (message.includes("forbidden")) return "forbidden";
  if (message.includes("invalid_request")) return "invalid_request";
  return "server_error";
}

/**
 * Lớp rate limit ngoài theo IP (Upstash). Fail-open khi chưa cấu hình — vì thế
 * DB vẫn giữ bộ đếm riêng; đây chỉ là lá chắn rẻ tiền phía trước.
 */
export async function livechatIpThrottled(
  headers: Headers,
  scope: string,
  limit: number,
): Promise<boolean> {
  const { allowed } = await rateLimit(
    `livechat:${scope}:${clientIpFrom(headers)}`,
    limit,
    60,
  );
  return !allowed;
}

/** Khóa nhúng hợp lệ về hình thức (32 hex) — chặn rác trước khi chạm DB. */
export function isEmbedKey(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{16,128}$/.test(value);
}

/** Token phiên hợp lệ về hình thức (64 hex) hoặc vắng mặt. */
export function isVisitorToken(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

/**
 * Adapter kênh — Live Chat không có API bên ngoài để gọi: tin của nhân viên
 * ghi thẳng vào bảng messages (sendReply làm), widget nhận qua livechat_poll.
 * Giữ đúng interface ChannelAdapter để Hộp thư không phải biết kênh nào là
 * kênh nào (kỷ luật A2 trong types.ts).
 */
export const livechatAdapter: ChannelAdapter = {
  type: "livechat",

  async parseWebhook() {
    return []; // không có webhook: khách gửi thẳng qua /api/livechat/message
  },

  async send(message: OutboundMessage): Promise<SendResult> {
    const text = message.text?.trim();
    if (!text) return { ok: false, error: "invalid_input", retryable: false };
    if (text.length > LIVECHAT_MAX_TEXT) {
      return { ok: false, error: "message_too_long", retryable: false };
    }
    // Giao hàng nằm ở bước ghi messages của sendReply — không có id bên ngoài.
    return { ok: true, externalMessageId: "" };
  },
};
