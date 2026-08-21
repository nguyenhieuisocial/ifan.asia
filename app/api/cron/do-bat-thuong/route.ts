import { createClient } from "@supabase/supabase-js";
import { clientIpFrom, rateLimit } from "@/lib/rate-limit";
import { bangNhauHangThoiGian } from "@/lib/security/so-sanh-bi-mat";
import { SUPABASE_URL } from "@/lib/config";

/**
 * Nhịp gọi hàm DÒ BẤT THƯỜNG (thẻ `man-bao-dong-bat-thuong`, migration #348).
 *
 * ⚠️ NHỊP GỌI MỖI GIỜ, NHƯNG HÀM CHỈ LÀM VIỆC LÚC 15:00 VÀ 18:00 GIỜ VIỆT NAM.
 *   Khung giờ do CƠ SỞ DỮ LIỆU quyết, không do lịch cron. Hai lý do:
 *     · Vercel chạy cron theo giờ quốc tế, còn "15 giờ chiều" của tiệm là giờ
 *       Việt Nam. Ghim vào lịch cron nghĩa là mỗi lần đổi múi giờ hay đổi nền
 *       tảng chạy là giờ báo lệch mà không ai thấy.
 *     · Luật "trần một tin mỗi tiệm mỗi ngày" cũng nằm trong hàm. Hai nơi cùng
 *       giữ một luật thì tới lúc lệch nhau không ai biết bên nào đúng.
 *
 * ⚠️ KHÔNG GỘP VÀO NHỊP CỦA `/api/cron/day-thong-bao`. Nhịp đó chạy mỗi phút và
 *   mang trách nhiệm khác; gộp lại nghĩa là một việc hỏng thì việc kia chết
 *   theo, và lúc đọc log không biết cái nào vừa gãy.
 *
 * Thiếu khoá ⇒ 204 im lặng, đứng yên chứ không lỗi — cùng khuôn với các cửa nền
 * đang chạy, để môi trường chưa cấu hình không rải log rác.
 */

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

async function handle(req: Request): Promise<Response> {
  try {
    const key = process.env.BOT_INGEST_KEY;
    if (!key) return new Response(null, { status: 204 });

    const { allowed } = await rateLimit(
      `do-bat-thuong:ip:${clientIpFrom(req.headers)}`,
      30,
      60,
    );
    if (!allowed) return new Response("too many requests", { status: 429 });

    const botKey = req.headers.get("x-bot-key") ?? "";
    const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const cronSecret = process.env.CRON_SECRET;
    const authorized =
      (botKey !== "" && bangNhauHangThoiGian(botKey, key)) ||
      (Boolean(cronSecret) &&
        bearer !== "" &&
        bangNhauHangThoiGian(bearer, cronSecret ?? ""));
    if (!authorized) return new Response("unauthorized", { status: 401 });

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      // Đã được kích mà không chạy được là chuyện phải kêu lên — khác hẳn
      // "chưa cấu hình".
      console.error("[do-bat-thuong] thiếu SUPABASE_SERVICE_ROLE_KEY — không chạy được");
      return new Response("server misconfigured", { status: 500 });
    }

    const service = createClient(SUPABASE_URL, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Không truyền giờ — để hàm tự lấy giờ Việt Nam của chính nó.
    const { data, error } = await service.rpc("do_bat_thuong");

    if (error) {
      console.error("[do-bat-thuong] do_bat_thuong lỗi:", error.message);
      return new Response("error", { status: 500 });
    }

    const ket = (data ?? {}) as { so_tin?: number; so_tiem?: number; bo_qua?: string };
    // Chỉ ghi log khi CÓ việc. Nhịp mỗi giờ mà lượt nào cũng log thì log thành
    // rác và không ai đọc nữa — 22/24 lượt mỗi ngày là "ngoài khung giờ".
    if ((ket.so_tin ?? 0) > 0) {
      console.log(`[do-bat-thuong] ${ket.so_tiem} tiệm bất thường, đã báo ${ket.so_tin} người`);
    }
    return Response.json({ ok: true, ...ket }, { status: 200 });
  } catch (err) {
    console.error("[do-bat-thuong] lỗi không mong đợi:", err);
    return new Response("error", { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
