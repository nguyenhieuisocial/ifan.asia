import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * AI trực việc (ADR-0014, docs/adr/0014-v25-ai-truc-viec.md) — kiểu + truy vấn
 * dùng chung cho màn Cài đặt (V2.5 việc 3) và đường tin đến (việc 4).
 *
 * Đọc trước khi sửa: chốt chặn THẬT nằm ở CSDL (`ai_autopilot_decide()`,
 * migration #105) — file này chỉ đọc để HIỂN THỊ, không phải nơi quyết định.
 */

export type AutopilotScope = "outside_hours" | "always";

export type AutopilotConfig = {
  enabled: boolean;
  scope: AutopilotScope;
  maxTurnsPerConversation: number;
  dailyCap: number;
};

/** Cấu hình mặc định khi tiệm CHƯA từng lưu — khớp default của cột trong migration #105. */
export const DEFAULT_AUTOPILOT_CONFIG: AutopilotConfig = {
  enabled: false,
  scope: "outside_hours",
  maxTurnsPerConversation: 3,
  dailyCap: 50,
};

export const AUTOPILOT_TURNS_MIN = 1;
export const AUTOPILOT_TURNS_MAX = 10;
export const AUTOPILOT_DAILY_CAP_MIN = 1;
export const AUTOPILOT_DAILY_CAP_MAX = 500;

/**
 * Tiệm có gì để AI trả lời chưa (ADR mục 1). `services` phải có ÍT NHẤT một
 * dịch vụ ĐANG BÁN — dịch vụ đã ngừng bán không phải thứ AI nên chào khách.
 * `business_hours` chỉ cần TỒN TẠI (kể cả toàn "đóng cửa") — tiệm đã chủ động
 * khai là có sự thật để nói, kể cả sự thật là "hôm nay không mở".
 */
export type AutopilotSourceStatus = {
  hasServices: boolean;
  hasBusinessHours: boolean;
};

export function canEnableAutopilot(source: AutopilotSourceStatus): boolean {
  return source.hasServices || source.hasBusinessHours;
}

export async function getAutopilotConfig(
  supabase: SupabaseClient,
): Promise<AutopilotConfig> {
  const { data } = await supabase
    .from("ai_autopilot")
    .select("enabled, scope, max_turns_per_conversation, daily_cap")
    .maybeSingle();
  if (!data) return DEFAULT_AUTOPILOT_CONFIG;
  return {
    enabled: data.enabled as boolean,
    scope: data.scope as AutopilotScope,
    maxTurnsPerConversation: data.max_turns_per_conversation as number,
    dailyCap: data.daily_cap as number,
  };
}

export async function getAutopilotSourceStatus(
  supabase: SupabaseClient,
): Promise<AutopilotSourceStatus> {
  // ADR-0019 mục 3 (migration #125): `services` di trú vào `items` — lọc
  // đúng kind='service' + status='active' (draft/discontinued không tính).
  const [services, hours] = await Promise.all([
    supabase.from("items").select("id").eq("kind", "service").eq("status", "active").limit(1),
    supabase.from("business_hours").select("id").limit(1),
  ]);
  return {
    hasServices: (services.data?.length ?? 0) > 0,
    hasBusinessHours: (hours.data?.length ?? 0) > 0,
  };
}

/** 8 kết cục — khớp CHECK `ai_reply_log.outcome` (migration #105). */
export type AutopilotOutcome =
  | "sent"
  | "skipped_off"
  | "skipped_no_source"
  | "skipped_daily_cap"
  | "skipped_turn_cap"
  | "skipped_within_hours"
  | "skipped_out_of_scope"
  | "error";

export type ReplyLogRow = {
  id: string;
  conversationId: string;
  /** Tên khách trong hội thoại — null khi hội thoại/khách đã bị xoá. */
  contactName: string | null;
  outcome: AutopilotOutcome;
  reason: string | null;
  createdAt: string;
};

/** Bản ghi thô PostgREST trả về khi join qua conversations → contacts. */
type ReplyLogJoinRow = {
  id: string;
  conversation_id: string;
  outcome: AutopilotOutcome;
  reason: string | null;
  created_at: string;
  conversations: { contacts: { full_name: string | null } | null } | null;
};

export async function listReplyLog(
  supabase: SupabaseClient,
  limit = 30,
): Promise<ReplyLogRow[]> {
  const { data } = await supabase
    .from("ai_reply_log")
    .select(
      "id, conversation_id, outcome, reason, created_at, conversations(contacts(full_name))",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as unknown as ReplyLogJoinRow[]).map((r) => ({
    id: r.id,
    conversationId: r.conversation_id,
    contactName: r.conversations?.contacts?.full_name ?? null,
    outcome: r.outcome,
    reason: r.reason,
    createdAt: r.created_at,
  }));
}
