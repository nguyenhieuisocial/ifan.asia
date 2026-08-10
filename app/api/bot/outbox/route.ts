import { timingSafeEqual } from "node:crypto";
import { clientIpFrom, rateLimit } from "@/lib/rate-limit";
import { processBotOutbox } from "@/lib/notify/outbox";

/**
 * Cửa kích worker gửi bot_outbox (spec B26). Bản tin do pg_cron 'zalo-bot-digest'
 * soạn sẵn trong DB; pg_net đã bị khóa (#36) nên DB không tự gọi HTTP được —
 * cần một nhịp bên ngoài gọi route này ~15 phút/lần. Nguồn kích hợp lệ:
 *   - Scheduler ngoài (Vercel Cron / cron-job.org...): header x-bot-key = BOT_INGEST_KEY,
 *     hoặc Authorization: Bearer <CRON_SECRET> (chuẩn Vercel Cron, nếu env có đặt).
 *   - Webhook bot + nút "Gửi thử" cũng tự kích worker (lưới an toàn phụ).
 *
 * Hai chế độ: thiếu BOT_INGEST_KEY → 204 im lặng (không lỗi, không spam log).
 */

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

async function handle(req: Request): Promise<Response> {
  try {
    const key = process.env.BOT_INGEST_KEY;
    if (!key) return new Response(null, { status: 204 }); // chưa cấu hình → đứng yên

    const { allowed } = await rateLimit(
      `bot-outbox:ip:${clientIpFrom(req.headers)}`,
      30,
      60,
    );
    if (!allowed) return new Response("too many requests", { status: 429 });

    const botKey = req.headers.get("x-bot-key") ?? "";
    const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const cronSecret = process.env.CRON_SECRET;
    const authorized =
      (botKey !== "" && safeEqual(botKey, key)) ||
      (Boolean(cronSecret) && bearer !== "" && safeEqual(bearer, cronSecret ?? ""));
    if (!authorized) return new Response("unauthorized", { status: 401 });

    const result = await processBotOutbox();
    return Response.json(result);
  } catch (err) {
    console.error("[bot-outbox] lỗi không mong đợi:", err);
    return new Response("error", { status: 500 });
  }
}

export function POST(req: Request): Promise<Response> {
  return handle(req);
}

/** Vercel Cron gọi GET — cùng cổng kiểm với POST. */
export function GET(req: Request): Promise<Response> {
  return handle(req);
}
