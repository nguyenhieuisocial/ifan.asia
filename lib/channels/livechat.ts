import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { SITE_URL, SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";
import { clientIpFrom, rateLimit, rateLimitBestEffort } from "@/lib/rate-limit";
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
 * 2. Chốt chặn thật là bộ đếm trong DB (không thể fail-open). Lớp Upstash phía
 *    ngoài chỉ là lá chắn rẻ tiền — xem livechatIpThrottled bên dưới.
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
 * Origin ảo đại diện trang thử /livechat-demo do iFan host (migration #55).
 * Trang thử chạy trên chính tên miền iFan — không nằm trong whitelist của tiệm
 * nào, nên tầng web đổi origin đó thành sentinel này trước khi gọi RPC. Giá trị
 * không có dạng https?:// nên không bao giờ trùng một origin thật đã khai.
 *
 * ⚠️ SENTINEL NÀY MỘT MÌNH KHÔNG MỞ ĐƯỢC GÌ (migration #209). Trước #209,
 * `private.livechat_resolve` nhận sentinel THAY CHO whitelist, chỉ cần kèm khóa
 * nhúng đúng — mà khóa nhúng là khóa CÔNG KHAI, nằm nguyên văn trong mã HTML
 * website của tiệm. Ai chép được khóa cũng mở `/livechat-demo?key=<khóa>` và
 * chat thẳng vào hộp thư tiệm từ bất kỳ mạng nào; hàng rào tên miền chỉ còn là
 * trang trí, và đó cũng là đường vào rẻ nhất để đốt hạn mức AI tháng của tiệm.
 * Nay nhánh sentinel CHỈ nhận KHÓA THỬ 30 phút do `livechat_demo_start()` phát
 * cho owner/admin đã đăng nhập (xem app/livechat-demo/moi/route.ts). Khóa nhúng
 * thật đi kèm sentinel này ⇒ 'forbidden'.
 */
export const LIVECHAT_DEMO_ORIGIN = "ifan:demo";

/**
 * Origin đưa xuống RPC: request từ chính tên miền iFan (widget trên trang thử
 * /livechat-demo) → origin ảo LIVECHAT_DEMO_ORIGIN, còn lại giữ nguyên để so
 * whitelist như cũ. Header CORS vẫn dùng origin THẬT (hàm livechatOk) — chỉ
 * phần so whitelist trong RPC mới nhìn thấy sentinel.
 *
 * Hàm này KHÔNG phải chốt chặn và chưa bao giờ là: header Origin do phía gọi
 * đặt, giả được. Chốt nằm ở RPC (xem chú thích của LIVECHAT_DEMO_ORIGIN) — đây
 * chỉ là phép đổi nhãn để RPC biết đang xét nhánh nào.
 */
export function rpcOriginOf(origin: string): string {
  return origin === new URL(SITE_URL).origin.toLowerCase()
    ? LIVECHAT_DEMO_ORIGIN
    : origin;
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
 * Lớp rate limit ngoài theo IP — CỐ Ý dùng bản best-effort (chỉ chạy khi có
 * Upstash, không có thì nghỉ). Hai lý do, cả hai đều phải đúng thì mới được
 * chọn fail-open ở một điểm chạm internet không xác thực:
 *  1. Chốt thật đã có và không thể bỏ qua: RPC livechat_send/livechat_poll
 *     (migration #23) tự đếm trong DB theo phiên khách + theo IP băm.
 *  2. Đây là đường nóng nhất của hệ: widget hỏi tin mới 3 giây/lần cho MỖI
 *     khách đang mở chat. Thêm một lượt ghi DB nữa cho mỗi nhịp poll là nhân
 *     đôi tải để đếm lại đúng thứ DB vừa đếm.
 */
export async function livechatIpThrottled(
  headers: Headers,
  scope: string,
  limit: number,
): Promise<boolean> {
  const { allowed } = await rateLimitBestEffort(
    `livechat:${scope}:${clientIpFrom(headers)}`,
    limit,
    60,
  );
  return !allowed;
}

/**
 * Chốt chặn THẬT theo IP cho /api/livechat/session — fail-closed.
 *
 * Vì sao session khác poll/message: hai cửa kia có bộ đếm KHÔNG THỂ bỏ qua nằm
 * trong RPC (livechat_send/livechat_poll, migration #23) nên lớp ngoài mới được
 * phép fail-open. RPC livechat_session KHÔNG có bộ đếm nào — nó chỉ tra kênh
 * theo khóa nhúng rồi tra phiên theo token. Chưa cấu hình Upstash (hạ tầng 0đ)
 * thì lớp best-effort nghỉ, tức cửa này trước đây KHÔNG có chốt nào cả: một con
 * bot bắn thẳng /api/livechat/session được bao nhiêu tùy sức nó.
 * Session chỉ gọi 1 lần mỗi lần mở widget nên thêm một lượt đếm trong DB không
 * phải là đường nóng — đúng điều kiện để dùng bản fail-closed.
 */
export async function livechatSessionBlocked(headers: Headers): Promise<boolean> {
  const { allowed } = await rateLimit(
    `livechat-session:ip:${clientIpFrom(headers)}`,
    120,
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
