import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Ghi sự kiện nghiệp vụ vào outbox `public.domain_events` qua RPC `emit_event`
 * (security definer, migration #2 — tự lấy tenant_id + actor từ JWT, có dedupe_key).
 *
 * GIỚI HẠN ĐÃ BIẾT: server action gọi RPC ở lượt riêng nên KHÔNG cùng transaction
 * với thao tác nghiệp vụ (spec §7 mong muốn cùng transaction). Chấp nhận best-effort
 * ở đợt 1: lỗi phát sự kiện KHÔNG được hủy thao tác đã ghi thành công. Muốn bảo đảm
 * tuyệt đối thì chuyển sang trigger DB — ghi vào backlog GĐ2 cùng Workflow Engine.
 */
export type DomainEventInput = {
  /** Theo docs/EVENT_CATALOG.md, vd 'deal.stage_changed' */
  type: string;
  aggregateType: "contact" | "company" | "deal";
  aggregateId: string;
  payload?: Record<string, unknown>;
  /** Chỉ dùng khi cần chống phát trùng (retry, webhook) — v1 CRM không cần */
  dedupeKey?: string;
};

export async function emitEvent(
  supabase: SupabaseClient,
  input: DomainEventInput,
): Promise<void> {
  const { error } = await supabase.rpc("emit_event", {
    p_event_type: input.type,
    p_aggregate_type: input.aggregateType,
    p_aggregate_id: input.aggregateId,
    p_payload: input.payload ?? {},
    p_source_module: "crm",
    p_dedupe_key: input.dedupeKey ?? null,
  });
  if (error) {
    // Không ném lỗi: mất 1 event không được phép làm hỏng nghiệp vụ đã ghi
    console.error(`[emit_event] ${input.type} thất bại: ${error.message}`);
  }
}
