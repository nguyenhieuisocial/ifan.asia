import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, SITE_URL } from "@/lib/config";
import { zaloBotChannel } from "@/lib/notify/channel";

/**
 * Worker gửi bot_outbox — chạy trong route handler / server action (chỉ server).
 *
 * Hai chế độ (như AI gateway):
 * - CHƯA CẤU HÌNH (thiếu env BOT_INGEST_KEY): trả 0 ngay, không lỗi, không log —
 *   tin nằm yên trong outbox (digest cũ quá 2 ngày được cron dọn).
 * - ĐÃ CẤU HÌNH: nhận lô tin qua RPC bot_claim_outbox (khóa so với
 *   private.app_config 'bot_ingest_key' — pattern ZALO_INGEST_KEY #5, không cần
 *   service key), gửi qua adapter Zalo Bot, báo kết quả từng tin để DB cộng
 *   quota / xếp lại thử.
 */

/** Row trả về từ RPC bot_claim_outbox (#54). */
type OutboxRow = {
  o_id: number;
  o_chat: string;
  o_kind: string;
  o_body: string;
  o_token: string | null;
};

export function isBotWorkerConfigured(): boolean {
  return Boolean(process.env.BOT_INGEST_KEY);
}

export async function processBotOutbox(): Promise<{
  processed: number;
  sent: number;
}> {
  const key = process.env.BOT_INGEST_KEY;
  if (!key) return { processed: 0, sent: 0 };

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc("bot_claim_outbox", {
    p_key: key,
    p_batch: 20,
  });
  if (error) {
    console.error("[bot-outbox] bot_claim_outbox lỗi:", error.message);
    return { processed: 0, sent: 0 };
  }

  const rows = (data ?? []) as OutboxRow[];
  let sent = 0;
  for (const row of rows) {
    // claim đã lọc kênh có token — nhánh này chỉ là phòng thủ (token vừa bị gỡ)
    if (!row.o_token) {
      await supabase.rpc("bot_complete_outbox", {
        p_key: key,
        p_id: row.o_id,
        p_ok: false,
        p_error: "no_token",
      });
      continue;
    }

    // Bản tin digest nối thêm link mở app (SITE_URL chỉ server biết — DB soạn
    // phần nội dung, không nhúng cứng tên miền vào hàm SQL).
    const text =
      row.o_kind === "digest"
        ? `${row.o_body}\nMở iFan: ${SITE_URL}/app/today`
        : row.o_body;

    const result = await zaloBotChannel(row.o_token).send(row.o_chat, text);
    if (result.ok) sent += 1;

    const { error: completeError } = await supabase.rpc("bot_complete_outbox", {
      p_key: key,
      p_id: row.o_id,
      p_ok: result.ok,
      p_error: result.ok ? null : result.error,
    });
    if (completeError) {
      // Tin đã gửi mà không ghi nhận được → vé 'sending' sẽ được claim lại sau
      // 10 phút; log để lần tra cứu sau thấy dấu vết.
      console.error("[bot-outbox] bot_complete_outbox lỗi:", completeError.message);
    }
  }

  return { processed: rows.length, sent };
}
