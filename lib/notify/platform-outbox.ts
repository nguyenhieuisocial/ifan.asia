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
}> {
  const key = process.env.BOT_INGEST_KEY;
  if (!key) return { processed: 0, sent: 0, via: "none" };

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
    return { processed: 0, sent: 0, via: "none" };
  }

  const rows = (data ?? []) as PlatformOutboxRow[];
  let sent = 0;
  let via: "telegram" | "zalo" | "none" = "none";
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
      const t = target as { found?: boolean; chat_id?: string; thread_id?: number } | null;
      if (t?.found && t.chat_id) {
        toChat = t.chat_id;
        toThread = t.thread_id;
      }
    }

    const result = tgReady
      ? (await telegramSend(tgToken!, toChat!, row.o_body, toThread))
        ? ({ ok: true } as const)
        : ({ ok: false, error: "telegram_send_failed" } as const)
      : row.o_token && row.o_chat
        ? await zaloBotChannel(row.o_token).send(row.o_chat, row.o_body)
        : ({ ok: false, error: "no_channel" } as const);

    if (result.ok) { sent += 1; via = tgReady ? "telegram" : "zalo"; }

    const { error: completeError } = await supabase.rpc("platform_complete_outbox", {
      p_key: key,
      p_id: row.o_id,
      p_ok: result.ok,
      p_error: result.ok ? null : result.error,
    });
    if (completeError) {
      console.error("[platform-outbox] platform_complete_outbox lỗi:", completeError.message);
    }
  }

  return { processed: rows.length, sent, via };
}
