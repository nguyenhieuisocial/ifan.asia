import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/config";
import { zaloBotChannel } from "@/lib/notify/channel";

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
}> {
  const key = process.env.BOT_INGEST_KEY;
  if (!key) return { processed: 0, sent: 0 };

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc("platform_claim_outbox", {
    p_key: key,
    p_batch: 20,
  });
  if (error) {
    console.error("[platform-outbox] platform_claim_outbox lỗi:", error.message);
    return { processed: 0, sent: 0 };
  }

  const rows = (data ?? []) as PlatformOutboxRow[];
  let sent = 0;
  for (const row of rows) {
    // claim đã lọc chưa ghép nối/chưa có token — nhánh này chỉ là phòng thủ.
    if (!row.o_token) {
      await supabase.rpc("platform_complete_outbox", {
        p_key: key,
        p_id: row.o_id,
        p_ok: false,
        p_error: "no_token",
      });
      continue;
    }

    const result = await zaloBotChannel(row.o_token).send(row.o_chat, row.o_body);
    if (result.ok) sent += 1;

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

  return { processed: rows.length, sent };
}
