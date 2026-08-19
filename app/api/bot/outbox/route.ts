import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { clientIpFrom, rateLimit } from "@/lib/rate-limit";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";
import { processBotOutbox } from "@/lib/notify/outbox";
import { processPlatformOutbox } from "@/lib/notify/platform-outbox";
import { dongDauNhip, soatNhipCsdl } from "@/lib/notify/heartbeat";
import { describeModules } from "@/lib/notify/feature-map";
import { runAutopilotSweep } from "@/lib/ai/autopilot-run";

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
    /**
     * ⚠️ HỎNG IM LẶNG — bắt được 19/08, im suốt ~12 tiếng.
     *
     * Bản cũ viết `if (!sha) return;` rồi nuốt lỗi RPC vào `console.error`.
     * Cả hai đường thoát đều KHÔNG để lại dấu gì ở nơi soi được từ ngoài: nhịp
     * vẫn trả 200, hàng đợi vẫn "0 tin", mọi thứ trông y như một ngày không có
     * bản mới nào. Thực tế web ĐÃ lên hơn chục bản mà băng-rôn "Bản mới đã lên"
     * tắt tiếng — và cách duy nhất để biết là founder tự thấy Telegram im.
     *
     * Ba thứ sửa ở đây:
     *  1. CÓ ĐƯỜNG DỰ PHÒNG. Mã commit là thứ Vercel cấp kèm nguồn Git; mất nó
     *     (triển khai không qua Git, đổi cách nối kho…) là cả băng-rôn chết câm.
     *     Mã lần triển khai thì lượt nào cũng có và lượt nào cũng khác — đủ để
     *     trả lời đúng câu hỏi "có phải bản mới không".
     *  2. NÓI RA MÌNH ĐÃ LÀM GÌ. Kết quả đi thẳng vào câu trả lời của nhịp, nên
     *     soi được từ bên ngoài mà không cần vào bảng điều khiển máy chủ.
     *  3. Không ném lỗi ra ngoài — hàng đợi tin nhân viên không được chết theo.
     */
    const detect = (async () => {
      const gitSha = process.env.VERCEL_GIT_COMMIT_SHA;
      const sha = gitSha || process.env.VERCEL_DEPLOYMENT_ID;
      const nguon = gitSha ? "git" : process.env.VERCEL_DEPLOYMENT_ID ? "deployment" : "none";
      if (!sha) return { nguon, marked: false, error: "khong co ma ban nao de so sanh" };
      // Dòng mô tả bản (title của commit) — băng-rôn "Bản mới đã lên" kể được
      // "đổi gì" thay vì dán mã bản trơ (founder phản ánh 13/08). Vercel cấp sẵn.
      const msg = process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null;
      try {
        const features = await describeModules();
        const { data, error } = await createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
        }).rpc("tg_release_mark", { p_key: key, p_sha: sha, p_features: features, p_msg: msg });
        if (error) {
          console.error("[bot-outbox] tg_release_mark lỗi:", error.message);
          return { nguon, marked: false, error: error.message };
        }
        return { nguon, marked: true, ket_qua: data };
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        console.error("[bot-outbox] dò bản mới lỗi:", m);
        return { nguon, marked: false, error: m };
      }
    })();

    /**
     * AI trực việc — lưới an toàn (ADR-0014 mục 9 việc 4). Đường chính là
     * `waitUntil()` ngay sau webhook Live Chat/Telegram (gần tức thời); nhịp
     * này chỉ vớt phần bị trượt — đúng khuôn "đá nhịp ngay + cron dọn".
     */
    /**
     * Đồng hồ canh im lặng (migration #178). Đóng dấu "nhịp này còn sống", và
     * canh NGƯỢC LẠI bộ hẹn giờ trong kho dữ liệu — nơi đặt cái đồng hồ chính.
     * Hai bên canh nhau: bên nào chết thì bên kia còn kêu được.
     * Cả hai đều KHÔNG ném lỗi ra ngoài — đồng hồ hỏng không được làm chết việc
     * mà nó đang canh; kết quả đi vào câu trả lời để soi được từ ngoài.
     */
    const nhip = Promise.all([dongDauNhip("web.bot_outbox"), soatNhipCsdl()]);

    const [staff, platform, autopilot] = await Promise.allSettled([
      detect.then(async (v) => ({ ...(await processBotOutbox()), version: v })),
      processPlatformOutbox(),
      runAutopilotSweep(),
    ]);
    if (platform.status === "rejected") {
      console.error("[bot-outbox] platform outbox lỗi:", platform.reason);
    }
    if (staff.status === "rejected") {
      console.error("[bot-outbox] staff outbox lỗi:", staff.reason);
    }
    if (autopilot.status === "rejected") {
      console.error("[bot-outbox] AI trực việc lỗi:", autopilot.reason);
    }
    const [dau, csdl] = await nhip;
    if (!dau.ok) console.error("[bot-outbox] đóng dấu nhịp lỗi:", dau.error);
    if (!csdl.ok) console.error("[bot-outbox] bộ hẹn giờ CSDL có vẻ đã im:", csdl);
    return Response.json({
      heartbeat: { tudong: dau, csdl },
      ...(staff.status === "fulfilled" ? staff.value : { processed: 0, sent: 0 }),
      platform:
        platform.status === "fulfilled" ? platform.value : { processed: 0, sent: 0 },
      autopilot:
        autopilot.status === "fulfilled"
          ? autopilot.value
          : { scanned: 0, sent: 0, skipped: 0, errors: 0 },
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
