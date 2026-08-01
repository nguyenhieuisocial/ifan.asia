/**
 * Rate limit tầng ứng dụng (ADR/blueprint: không dựa vào Cloudflare Free).
 * Dùng Upstash Redis REST khi có env; CHƯA có env → fail-open kèm log cảnh báo
 * (không chặn nhầm người dùng khi hạ tầng chưa cấu hình).
 */

type RateLimitResult = { allowed: boolean; remaining: number };

const URL_ENV = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN_ENV = process.env.UPSTASH_REDIS_REST_TOKEN;

/** Sliding-window đơn giản qua INCR + EXPIRE. key nên gồm scope + định danh (ip/tenant). */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  if (!URL_ENV || !TOKEN_ENV) {
    console.warn(`[rate-limit] fail-open (chưa cấu hình Upstash): ${key}`);
    return { allowed: true, remaining: limit };
  }
  try {
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
    return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
  } catch (e) {
    console.error("[rate-limit] lỗi, fail-open:", e);
    return { allowed: true, remaining: limit };
  }
}
