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

/** Một mục kho tri thức mà AI đã DỰA VÀO cho lượt trả lời này. */
export type ReplyLogKbRef = {
  id: string;
  /** Câu hỏi của mục — `null` khi mục đã bị xoá khỏi kho sau lúc AI dùng nó. */
  question: string | null;
};

export type ReplyLogRow = {
  id: string;
  conversationId: string;
  /**
   * Tên khách trong hội thoại.
   *
   * `null` KHÔNG có nghĩa "đã bị xoá" (chú thích cũ ghi vậy là SAI — đo 21/08
   * trên CSDL thật: 2/50 hội thoại có `contact_id` null, 0 hội thoại trỏ tới
   * contact đã xoá mềm). Nghĩa THƯỜNG GẶP là khách nhắn qua kênh chưa gắn được
   * hồ sơ — Live Chat khách vãng lai, Telegram chưa khai tên. Hội thoại vẫn
   * sống, vẫn mở được; chỉ là chưa có tên để hiện.
   */
  contactName: string | null;
  outcome: AutopilotOutcome;
  reason: string | null;
  createdAt: string;
  /**
   * Model tự khai khi kho tri thức nói khác 4 nguồn có cấu trúc (giờ mở cửa,
   * giá…). Ô có cấu trúc LUÔN thắng ở câu trả lời đã gửi cho khách — cột này
   * chỉ để tiệm THẤY mà sửa dữ liệu gốc (migration #116 dòng 22).
   */
  dataConflict: string | null;
  /** Mục kho tri thức AI đã dựa vào — phân biệt "AI kém" với "một mục KB viết sai" (migration #113 dòng 121). */
  kbRefs: ReplyLogKbRef[];
};

/** Bản ghi thô PostgREST trả về khi join qua conversations → contacts. */
type ReplyLogJoinRow = {
  id: string;
  conversation_id: string;
  outcome: AutopilotOutcome;
  reason: string | null;
  created_at: string;
  data_conflict: string | null;
  kb_ids: string[] | null;
  conversations: { contacts: { full_name: string | null } | null } | null;
};

/** Trang mặc định của nhật ký. Bằng ĐÚNG trần ngày mặc định (`dailyCap` = 50)
 *  — 30 dòng như trước là một ngày chạy đủ trần đã đẩy 20 lượt khỏi tầm nhìn
 *  ngay trong ngày, mà màn không hề nói là đã cắt. */
export const REPLY_LOG_PAGE_SIZE = 50;

/** Trần cứng một lần tải — chặn `?log=999999` kéo sập trang. Chạm trần mà vẫn
 *  còn dòng thì màn PHẢI nói ra (nút "Xem thêm" ẩn đi, thay bằng câu giải thích),
 *  chứ không để một cái nút bấm mãi không ra thêm gì. */
export const REPLY_LOG_LIMIT_MAX = 500;

export type ReplyLogPage = {
  rows: ReplyLogRow[];
  /** TỔNG số dòng nhật ký của tiệm — để màn nói thẳng "đang xem X trong Y". */
  total: number;
};

export async function listReplyLog(
  supabase: SupabaseClient,
  limit = REPLY_LOG_PAGE_SIZE,
): Promise<ReplyLogPage> {
  const { data, count } = await supabase
    .from("ai_reply_log")
    .select(
      "id, conversation_id, outcome, reason, created_at, data_conflict, kb_ids, conversations(contacts(full_name))",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  const raw = (data ?? []) as unknown as ReplyLogJoinRow[];

  // Tên mục KB lấy MỘT lượt cho cả trang (không phải mỗi dòng một câu hỏi).
  // Không có tên thì `kb_ids` chỉ là dãy uuid — chủ tiệm không tra được mục nào
  // sai, tức cột vẫn nằm trong ngăn không ai mở được, chỉ là ngăn đẹp hơn.
  const ids = [...new Set(raw.flatMap((r) => r.kb_ids ?? []))];
  const titles = new Map<string, string>();
  if (ids.length > 0) {
    const { data: entries } = await supabase
      .from("kb_entries")
      .select("id, question")
      .in("id", ids);
    for (const e of (entries ?? []) as { id: string; question: string }[]) {
      titles.set(e.id, e.question);
    }
  }

  return {
    rows: raw.map((r) => ({
      id: r.id,
      conversationId: r.conversation_id,
      contactName: r.conversations?.contacts?.full_name ?? null,
      outcome: r.outcome,
      reason: r.reason,
      createdAt: r.created_at,
      dataConflict: r.data_conflict,
      // Mục đã xoá vẫn giữ lại dòng (question = null): "AI đã dựa vào một mục
      // nay không còn" là thông tin THẬT, giấu đi thì lượt trả lời đó trông như
      // AI tự bịa.
      kbRefs: (r.kb_ids ?? []).map((id) => ({ id, question: titles.get(id) ?? null })),
    })),
    total: count ?? raw.length,
  };
}
