import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";

/**
 * Đồng hồ canh im lặng — phía WEB (migration #178).
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CẦN CANH HAI CHIỀU
 * ═══════════════════════════════════════════════════════════════════
 * Ngày 19/08 có hai thứ hỏng suốt ~12 tiếng mà không gì báo, và người phát hiện
 * là founder. Bài học không phải "vá cái đã hỏng" mà là: **thứ gì im lặng khi
 * hỏng thì phải có một cái đồng hồ hỏi ngược "sao lâu rồi không nghe tiếng"**.
 *
 * Nhưng một đồng hồ duy nhất có điểm mù ngay tại chính nó: nếu bộ hẹn giờ trong
 * kho dữ liệu chết, cái đồng hồ nằm trong đó cũng chết theo và im lặng — đúng
 * cái nó sinh ra để chống. Nên hai bên canh lẫn nhau:
 *
 *   · Bộ hẹn giờ trong CSDL (mỗi 10 phút) canh: cả hai nhịp chạy trên Vercel.
 *   · Nhịp chạy trên Vercel (mỗi 5–15 phút) canh NGƯỢC LẠI: bộ hẹn giờ CSDL.
 *
 * Hai chân đế độc lập — Vercel chết thì CSDL kêu, CSDL chết thì Vercel kêu.
 * Chỉ khi CẢ HAI cùng chết mới lại im, và lúc đó thì web cũng sập nên founder
 * biết ngay bằng cách khác.
 */

/** Tên nhịp — PHẢI khớp đúng chữ đã khai ở `heartbeats` (migration #178). */
export type NhipKey = "web.bot_outbox" | "web.webhook_dispatch";

function db() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Khoá nhịp — CHỈ có ở biến môi trường của máy chủ, không có trong mã trình duyệt.
 *
 * ⚠️ Bản đầu (#178) KHÔNG đòi khoá này, nên hàm đóng dấu mở cho vai `anon` — mà
 * khoá anon nằm công khai trong mã chạy ở trình duyệt. Ai cũng gọi được và giữ
 * cho một nhịp đã chết trông như còn sống, tức là vô hiệu hoá đúng cái đồng hồ
 * này. Vá ở migration #182.
 */
function khoaNhip(): string | null {
  return process.env.BOT_INGEST_KEY ?? null;
}

/**
 * Đóng dấu "nhịp này còn sống".
 *
 * KHÔNG ném lỗi ra ngoài: một cái đồng hồ hỏng không được phép làm chết công
 * việc mà nó đang canh. Nhưng cũng KHÔNG nuốt im — trả về kết quả để cửa nhịp
 * đưa thẳng vào câu trả lời, soi được từ bên ngoài mà không cần vào bảng điều
 * khiển máy chủ. (Đúng cách đã tìm ra thủ phạm vụ băng-rôn chết câm hôm nay.)
 */
export async function dongDauNhip(
  key: NhipKey,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const khoa = khoaNhip();
    if (!khoa) return { ok: false, error: "thieu_BOT_INGEST_KEY" };
    const { data, error } = await db().rpc("heartbeat_touch", { p_key: khoa, p_nhip: key });
    if (error) return { ok: false, error: error.message };
    // false = tên nhịp KHÔNG có trong bảng khai báo ⇒ nhịp này không được canh.
    // Nói ra, vì "tưởng đang được canh" nguy hiểm hơn "biết là chưa canh".
    if (data !== true) return { ok: false, error: "nhip_chua_khai:" + key };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Canh ngược: bộ hẹn giờ trong kho dữ liệu có còn chạy không.
 *
 * Chỉ ĐỌC và báo — không tự ghi cảnh báo, vì đường ghi cảnh báo nằm trong CSDL
 * và nếu CSDL đang có vấn đề thì ghi cũng không tới nơi. Kết quả đi vào câu trả
 * lời của nhịp; nhịp trả về gì thì soi được từ ngoài.
 */
export async function soatNhipCsdl(): Promise<{
  ok: boolean;
  imPhut?: number;
  error?: string;
}> {
  try {
    const khoa = khoaNhip();
    if (!khoa) return { ok: false, error: "thieu_BOT_INGEST_KEY" };
    const { data, error } = await db().rpc("heartbeat_im_bao_lau", {
      p_key: khoa,
      p_nhip: "db.cron_scheduler",
    });
    if (error) return { ok: false, error: error.message };
    const phut = typeof data === "number" ? data : null;
    if (phut === null) return { ok: false, error: "chua_bao_gio_chay" };
    // 35 phút = ngưỡng đã khai ở migration #178 cho `db.cron_scheduler`.
    return { ok: phut <= 35, imPhut: phut };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
