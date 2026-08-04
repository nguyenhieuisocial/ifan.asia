import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";

/**
 * Rate limit tầng ứng dụng (ADR/blueprint: không dựa vào Cloudflare Free).
 *
 * LỊCH SỬ — vì sao file này được viết lại: bản đầu CHỈ biết đếm bằng Upstash
 * Redis và FAIL-OPEN khi chưa cấu hình env. Dự án chạy hạ tầng 0đ/tháng nên env
 * đó chưa bao giờ có ⇒ mọi chốt dựng trên hàm này (đăng nhập, đăng ký, webhook
 * Zalo, nút AI, kết nối kênh) thực tế BẰNG KHÔNG suốt thời gian qua.
 *
 * Nay có hai tầng đếm:
 *   1. Upstash Redis REST — khi có env (nhanh nhất, không tốn lượt gọi DB).
 *   2. Chưa có env → bộ đếm trong Postgres (RPC app_rate_limit, migration #25).
 *      Đây chính là mẫu Live Chat (#23) và mã QR (#24) đã dùng: DB luôn có mặt
 *      nên bộ đếm không thể "tự tắt" vì thiếu cấu hình.
 *
 * Hai cửa ra, chọn theo hậu quả của việc ĐẾM HỎNG — đọc kỹ trước khi dùng:
 *   · rateLimit()           — chốt THẬT, đếm hỏng thì CHẶN (fail-closed).
 *   · rateLimitBestEffort() — lớp phụ, đếm hỏng thì CHO QUA (fail-open) vì đã
 *                             có chốt thật ở nơi khác. Chỉ dùng khi chứng minh
 *                             được chốt thật đó tồn tại.
 */

type RateLimitResult = { allowed: boolean; remaining: number };

const URL_ENV = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN_ENV = process.env.UPSTASH_REDIS_REST_TOKEN;
const hasUpstash = Boolean(URL_ENV && TOKEN_ENV);

/** IP client từ headers (Vercel set x-forwarded-for; phần tử đầu là IP gốc). */
export function clientIpFrom(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}

/**
 * Khóa đếm chứa IP hoặc user id → KHÔNG được vào log. Chỉ lấy phần scope
 * trước dấu ':' đầu tiên ("signin", "ai", "zalo-webhook"…) để còn debug được.
 */
function scopeOf(key: string): string {
  return key.split(":")[0];
}

/** Client anon không cookie — RPC đếm là security definer, không cần phiên. */
let counterClient: SupabaseClient | null = null;
function dbClient(): SupabaseClient {
  counterClient ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return counterClient;
}

/** Sliding-window qua INCR + EXPIRE trên Upstash. Ném lỗi nếu không đếm được. */
async function countOnUpstash(key: string, windowSeconds: number): Promise<number> {
  const res = await fetch(`${URL_ENV}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN_ENV}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      ["INCR", `rl:${key}`],
      ["EXPIRE", `rl:${key}`, String(windowSeconds), "NX"],
    ]),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`upstash ${res.status}`);
  const [{ result: count }] = (await res.json()) as [{ result: number }];
  return count;
}

/** Cùng cửa sổ trượt nhưng đếm trong Postgres. Ném lỗi nếu không đếm được. */
async function countOnDb(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const { data, error } = await dbClient().rpc("app_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw new Error(error.message);
  const row = data as { allowed?: boolean; remaining?: number } | null;
  if (!row || typeof row.allowed !== "boolean") throw new Error("app_rate_limit trả dữ liệu lạ");
  return { allowed: row.allowed, remaining: Number(row.remaining) || 0 };
}

/**
 * Chốt chặn THẬT. key nên gồm scope + định danh (ip/user), ví dụ "signin:ip:...".
 *
 * ĐẾM HỎNG THÌ CHẶN. Lý do chọn fail-closed ở đây: cả hai tầng đếm đều nằm trên
 * hạ tầng mà chính nghiệp vụ phía sau cũng cần (Postgres) — Postgres chết thì
 * đăng nhập/AI/kết nối kênh cũng chết, nên chặn KHÔNG làm mất chức năng nào
 * đang chạy được. Ngược lại, cho qua khi không đếm được chính là kịch bản kẻ
 * tấn công muốn dựng ra (làm ngộp bộ đếm để mở toang cửa).
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  try {
    if (hasUpstash) {
      const count = await countOnUpstash(key, windowSeconds);
      return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
    }
    return await countOnDb(key, limit, windowSeconds);
  } catch (e) {
    console.error(`[rate-limit] không đếm được scope "${scopeOf(key)}" → CHẶN:`, e);
    return { allowed: false, remaining: 0 };
  }
}

// Cảnh báo MỘT LẦN mỗi instance khi lớp phụ chạy không — không spam log.
let warnedBestEffort = false;

/**
 * Lớp chặn PHỤ, cố ý fail-open. CHỈ dùng ở nơi đã có chốt thật không thể bỏ qua
 * (ví dụ bộ đếm trong RPC Live Chat #23), và nơi đó phải chịu tải cao đến mức
 * thêm một lượt ghi DB cho mỗi request là lãng phí thật sự.
 *
 * Chưa cấu hình Upstash → không làm gì cả. Đây KHÔNG phải lỗ hổng: nếu bạn định
 * dùng hàm này mà không chỉ ra được chốt thật nằm ở đâu, hãy dùng rateLimit().
 */
export async function rateLimitBestEffort(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  if (!hasUpstash) {
    if (!warnedBestEffort) {
      warnedBestEffort = true;
      console.warn("[rate-limit] lớp phụ nghỉ (chưa cấu hình Upstash) — chốt thật nằm trong DB");
    }
    return { allowed: true, remaining: limit };
  }
  try {
    const count = await countOnUpstash(key, windowSeconds);
    return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
  } catch (e) {
    console.error(`[rate-limit] lớp phụ lỗi scope "${scopeOf(key)}" — cho qua:`, e);
    return { allowed: true, remaining: limit };
  }
}
