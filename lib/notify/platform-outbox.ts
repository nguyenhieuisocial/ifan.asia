import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";
import { zaloBotChannel } from "@/lib/notify/channel";
import { telegramSend } from "@/lib/notify/telegram";

/**
 * Worker gửi platform_outbox — chuông báo founder (ADR-0007). Y khuôn
 * lib/notify/outbox.ts (#54), bỏ tenant_id vì đây là hàng đợi MỘT người nhận.
 *
 * Hai chế độ (như mọi cửa bot khác): thiếu env BOT_INGEST_KEY hoặc chưa ghép
 * nối (RPC platform_claim_outbox tự lọc) → trả 0 ngay, không lỗi, không log.
 */

/** Row trả về từ RPC platform_claim_outbox (#79). */
type PlatformOutboxRow = {
  o_id: number;
  o_chat: string;
  o_kind: string;
  o_body: string;
  o_token: string | null;
};

export async function processPlatformOutbox(): Promise<{
  processed: number;
  sent: number;
  /** Kênh ĐÃ THẬT SỰ dùng — để kiểm được thay vì phải đoán. */
  via: "telegram" | "zalo" | "none";
  /** Chủ đề đã gửi vào. Rỗng = về chat riêng. Cùng lý do như `via`. */
  topics: string[];
}> {
  const key = process.env.BOT_INGEST_KEY;
  if (!key) return { processed: 0, sent: 0, via: "none", topics: [] };

  /**
   * Đường Telegram — nốt còn lại của #115.
   *
   * Bot Telegram KHÔNG nằm trong CSDL (token ở biến môi trường), nên CSDL
   * không tự biết còn kênh nào sẵn sàng. Phải nói cho nó biết, nếu không nó
   * đứng yên khi Zalo chưa ghép nối và **cảnh báo khách cần giúp nằm chờ mãi
   * mà không ai hay** (migration #98).
   *
   * Chỉ lấy MÃ SỐ ĐẦU trong danh sách chủ dự án: đây là chuông báo riêng của
   * founder, không phải bản tin phát cho cả nhóm.
   */
  const tgToken = process.env.TELEGRAM_BOT_TOKEN;

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Người nhận đọc từ LIÊN KẾT TÀI KHOẢN (#99), không phải biến môi trường.
  // Lý do: kiểm ngày 13/08 phát hiện máy chủ không hề có TELEGRAM_OWNER_IDS,
  // nên chuông chạy hết sang Zalo mà không ai biết. Đọc từ CSDL thì máy chủ và
  // máy founder dùng chung một nguồn, thêm người chỉ là nối tài khoản.
  let tgChat: string | null = null;
  if (tgToken) {
    const { data: target } = await supabase.rpc("tg_platform_target", { p_key: key });
    tgChat =
      (typeof target === "string" && target) ||
      // Đường lui: chưa ai nối tài khoản thì vẫn dùng danh sách gõ tay nếu có.
      (process.env.TELEGRAM_OWNER_IDS ?? "").split(",")[0]?.trim() ||
      null;
  }
  const tgReady = Boolean(tgToken && tgChat);

  const { data, error } = await supabase.rpc("platform_claim_outbox", {
    p_key: key,
    p_batch: 20,
    p_allow_unpaired: tgReady,
  });
  if (error) {
    console.error("[platform-outbox] platform_claim_outbox lỗi:", error.message);
    return { processed: 0, sent: 0, via: "none", topics: [] };
  }

  const rows = (data ?? []) as PlatformOutboxRow[];
  let sent = 0;
  let via: "telegram" | "zalo" | "none" = "none";
  const topics: string[] = [];
  for (const row of rows) {
    /**
     * TELEGRAM TRƯỚC, Zalo là đường lui.
     *
     * Đây là chuông báo "khách đang cần giúp" — gửi đúng chỗ người ta KHÔNG
     * nhìn thì bằng không gửi. Founder trực trên Telegram (13/08), nên gửi
     * sang Zalo trước là để cảnh báo nằm ở chỗ không ai mở.
     *
     * Không gửi CẢ HAI: cảnh báo trùng hai nơi là loại nhiễu khiến người ta
     * bắt đầu bỏ qua cảnh báo — hỏng đúng thứ mình đang muốn bảo vệ.
     *
     * Đổi lại được: bỏ TELEGRAM_BOT_TOKEN là tự động quay về Zalo, không phải
     * sửa mã.
     */
    /**
     * ĐỊNH TUYẾN VỀ ĐÚNG CHỦ ĐỀ (migration #101).
     *
     * Trước đó mọi chuông đổ vào chat riêng của founder — một dòng duy nhất,
     * trộn "khách cần giúp" với "việc chạy nền hỏng". Nhóm có 7 chủ đề chia
     * sẵn mà không tin tự động nào chảy vào.
     *
     * Không tìm được chủ đề (chưa khai, hoặc chủ đề bị xoá) → vẫn gửi về chat
     * riêng. Tin về nhầm chỗ còn hơn tin biến mất.
     */
    let toChat = tgChat;
    let toThread: number | undefined;
    if (tgReady) {
      const { data: target } = await supabase.rpc("tg_feed_target", {
        p_key: key,
        p_kind: row.o_kind,
      });
      const t = target as { found?: boolean; chat_id?: string; thread_id?: number; topic?: string } | null;
      if (t?.found && t.chat_id) {
        toChat = t.chat_id;
        toThread = t.thread_id;
        if (t.topic) topics.push(t.topic);
      }
    }

    /**
     * ⚡ ĐÃ GỠ bước "Haiku soạn lại tin trước khi gửi" (từng là ADR-0007 mục
     * 12e). Founder chốt 17/08: không cắm khoá AI vào máy chủ, tìm cách tự
     * động không tốn chi phí. Hai căn cứ ĐO ĐƯỢC khiến gỡ là đúng, không phải
     * chỉ để tiết kiệm:
     *
     *   1. Bước này CHƯA TỪNG CHẠY một lần nào. Soát biến môi trường
     *      production 17/08: không có `ANTHROPIC_API_KEY` — dù mục 12e tự khai
     *      "máy chủ đã có khoá (việc #117, đóng 14/08)". Bằng chứng thứ hai
     *      trên CSDL: 60/60 tin 7 ngày qua đều `sent_body` null (= gửi nguyên
     *      bản gốc). Một tính năng chết im lặng 3 ngày, không gì báo — vì
     *      "AI chưa cấu hình" là nhánh HỢP LỆ, không phải lỗi.
     *   2. Kể cả bật lên cũng KHÔNG chữa được ca hỏng 17/08. Thử thật trên
     *      chính tin 16:15: Haiku trả về "Tiếp tục ngay, không được dừng cho
     *      như vậy nữa" — chỉ thêm dấu vào lời chỉ đạo bị chép nhầm vào
     *      commit. Nó không thể suy ra "người dùng được gì" vì thông tin đó
     *      KHÔNG có trong đầu vào, và lời dặn (đúng) CẤM nó bịa thêm.
     *
     * Thay bằng hai lớp không tốn phí: hook `commit-msg` chặn lúc viết
     * (`scripts/soat-commit-founder.mjs`) và lưới đỡ trong `tg_release_mark`
     * loại câu sai khuôn lúc soạn tin (migration #129).
     */
    /**
     * ⚠️ `telegramSend` trả về ĐỐI TƯỢNG `{ ok, error }`, không phải true/false.
     *
     * Bản đầu viết `(await telegramSend(...)) ? ok : lỗi` — đối tượng thì LUÔN
     * đúng, nên gửi hỏng vẫn bị đóng dấu "đã gửi" và cảnh báo **mất trắng
     * trong im lặng**. Đúng loại lỗi đang đi săn cả ngày, và tôi tự tay viết ra.
     * Phải đọc `.ok`.
     */
    const result = tgReady
      ? await telegramSend(tgToken!, toChat!, row.o_body, toThread)
      : row.o_token && row.o_chat
        ? await zaloBotChannel(row.o_token).send(row.o_chat, row.o_body)
        : ({ ok: false, error: "no_channel" } as const);

    if (result.ok) { sent += 1; via = tgReady ? "telegram" : "zalo"; }

    // `p_sent_body` truyền null tường minh: sau khi gỡ bước soạn lại, bản gửi
    // LUÔN bằng bản gốc nên cột `sent_body` không còn ai ghi. Cột đó nay là cột
    // chết — đã ghi việc theo dõi để dọn, cố ý KHÔNG dọn ở đợt này vì phải
    // drop/tạo lại một hàm đang chạy production chỉ để bỏ một cột nullable vô
    // hại (không cân xứng). Giữ tham số thay vì bỏ để chữ ký lời gọi khớp
    // nguyên trạng hàm 5 tham số, không phải nhờ vào giá trị mặc định.
    const { error: completeError } = await supabase.rpc("platform_complete_outbox", {
      p_key: key,
      p_id: row.o_id,
      p_ok: result.ok,
      p_error: result.ok ? null : result.error,
      p_sent_body: null,
    });
    if (completeError) {
      console.error("[platform-outbox] platform_complete_outbox lỗi:", completeError.message);
    }
  }

  return { processed: rows.length, sent, via, topics };
}
