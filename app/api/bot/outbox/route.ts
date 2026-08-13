import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { clientIpFrom, rateLimit } from "@/lib/rate-limit";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";
import { processBotOutbox } from "@/lib/notify/outbox";
import { processPlatformOutbox } from "@/lib/notify/platform-outbox";
import { describeModules } from "@/lib/notify/feature-map";

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

    /**
     * Dọn CẢ HAI hàng đợi.
     *
     * LỖI THẬT bắt được 13/08: nhịp cron chỉ dọn hàng đợi nhân viên
     * (`bot_outbox`). Chuông báo founder (`platform_outbox` — "Cần giúp?") chỉ
     * được đẩy ĐÚNG MỘT LẦN ngay lúc khách bấm nút. Lần đó hỏng — máy chủ trục
     * trặc, kênh gửi lỗi, ghép nối chưa xong — là dòng đó **nằm lại vĩnh viễn**:
     * cơ chế thử lại có sẵn trong hàm lấy việc nhưng KHÔNG AI ĐẠP nhịp.
     *
     * Đúng loại bẫy đã ghi ở #85, lặp lại ở một hàng đợi khác. Hai hàng đợi thì
     * phải hai lần dọn — dễ quên đúng một dòng, và quên thì im lặng.
     *
     * Chạy song song: hai hàng đợi độc lập, một cái chậm không nên giữ cái kia.
     * `allSettled` để một cái hỏng vẫn không nuốt kết quả cái còn lại.
     */
    /**
     * Máy chủ tự khai bản vừa triển khai + bảng trạng thái các mảng.
     *
     * Đặt ở ĐÂY thay vì dựng thêm một cửa riêng: nhịp này đã chạy 15 phút một
     * lần, và nơi duy nhất biết mã bản đang chạy chính là tiến trình đang chạy
     * nó. Không cần cấu hình gì thêm ở Vercel — thứ phải bấm tay thì sớm muộn
     * cũng quên bấm.
     *
     * So sánh và ghi nằm trong MỘT bước ở CSDL (tg_release_mark) để hai lượt
     * chạy song song không báo hai lần.
     */
    const detect = (async () => {
      const sha = process.env.VERCEL_GIT_COMMIT_SHA;
      if (!sha) return;
      const features = await describeModules();
      const { error } = await createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      }).rpc("tg_release_mark", { p_key: key, p_sha: sha, p_features: features });
      if (error) console.error("[bot-outbox] tg_release_mark lỗi:", error.message);
    })();

    const [staff, platform] = await Promise.allSettled([
      detect.then(() => processBotOutbox()),
      processPlatformOutbox(),
    ]);
    if (platform.status === "rejected") {
      console.error("[bot-outbox] platform outbox lỗi:", platform.reason);
    }
    if (staff.status === "rejected") {
      console.error("[bot-outbox] staff outbox lỗi:", staff.reason);
    }
    return Response.json({
      ...(staff.status === "fulfilled" ? staff.value : { processed: 0, sent: 0 }),
      platform:
        platform.status === "fulfilled" ? platform.value : { processed: 0, sent: 0 },
    });
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
