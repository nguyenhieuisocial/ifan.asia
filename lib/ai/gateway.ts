import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * AI Gateway (chỉ chạy server — import từ Server Actions, KHÔNG import vào
 * client component ngoài `import type`).
 *
 * Hai chế độ:
 * - CHƯA CẤU HÌNH (thiếu ANTHROPIC_API_KEY): mọi hàm trả `not_configured`,
 *   UI hiện thông báo nhẹ — không crash.
 * - ĐÃ CẤU HÌNH: gọi Anthropic API thật, có quota theo tenant/tháng qua
 *   RPC `increment_usage` (metric 'ai_calls').
 */

const AI_MODEL = process.env.AI_MODEL ?? "claude-opus-5";
const AI_MONTHLY_CAP = Number(process.env.AI_MONTHLY_CAP ?? "200");
/** max_tokens chặn cả thinking + câu trả lời — giữ ≥2048 cho tác vụ ngắn. */
const MAX_TOKENS = 2048;

export type AiFailureReason =
  | "not_configured"
  | "quota_exceeded"
  | "refused"
  | "rate_limited"
  | "bad_key"
  | "api_error"
  | "unknown";

export type AiResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: AiFailureReason };

export type ExtractedContact = {
  full_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  need_summary: string | null;
  tags: string[];
};

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// Singleton lazy: chỉ khởi tạo khi đã có key (constructor đọc ANTHROPIC_API_KEY từ env)
let client: Anthropic | null = null;
function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

/**
 * Quota theo tenant/tháng: RPC increment_usage tự lấy tenant từ JWT
 * (current_tenant_id) và cộng dồn usage_counters — tăng-rồi-kiểm-tra.
 * Trả về reason lỗi, hoặc null nếu còn quota.
 */
async function consumeQuota(
  supabase: SupabaseClient,
): Promise<AiFailureReason | null> {
  const { data, error } = await supabase.rpc("increment_usage", {
    p_metric: "ai_calls",
  });
  if (error) {
    // DB raise 'quota_exceeded' khi usage_counters.limit_value bị vượt
    return error.message.includes("quota_exceeded")
      ? "quota_exceeded"
      : "api_error";
  }
  if (typeof data === "number" && data > AI_MONTHLY_CAP) {
    return "quota_exceeded";
  }
  return null;
}

/**
 * Gọi model 1 lượt (non-streaming, tác vụ ngắn). KHÔNG gửi thinking/
 * temperature (model mặc định tự xử lý; gửi thêm sẽ 400).
 * Trả về text ghép từ các block "text".
 */
async function createCompletion(params: {
  system: string;
  prompt: string;
  schema?: Record<string, unknown>;
}): Promise<AiResult<string>> {
  try {
    const response = await getClient().messages.create({
      model: AI_MODEL,
      max_tokens: MAX_TOKENS,
      system: params.system,
      output_config: params.schema
        ? {
            effort: "low",
            format: { type: "json_schema", schema: params.schema },
          }
        : { effort: "low" },
      messages: [{ role: "user", content: params.prompt }],
    });
    // Kiểm tra refusal TRƯỚC khi đọc content
    if (response.stop_reason === "refusal") {
      return { ok: false, reason: "refused" };
    }
    const text = response.content
      .filter(
        (block): block is Anthropic.Messages.TextBlock =>
          block.type === "text",
      )
      .map((block) => block.text)
      .join("");
    if (!text) return { ok: false, reason: "api_error" };
    return { ok: true, data: text };
  } catch (error) {
    // Bắt lớp lỗi typed, cụ thể trước — không string-match message
    if (error instanceof Anthropic.RateLimitError) {
      return { ok: false, reason: "rate_limited" };
    }
    if (error instanceof Anthropic.AuthenticationError) {
      return { ok: false, reason: "bad_key" };
    }
    if (error instanceof Anthropic.APIError) {
      return { ok: false, reason: "api_error" };
    }
    return { ok: false, reason: "unknown" };
  }
}

/** Guard chung: chưa cấu hình → not_configured; hết quota → quota_exceeded. */
async function guard(
  supabase: SupabaseClient,
): Promise<AiFailureReason | null> {
  if (!isAiConfigured()) return "not_configured";
  return consumeQuota(supabase);
}

function parseJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };

const EXTRACT_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["full_name", "phone", "email", "address", "need_summary", "tags"],
  properties: {
    full_name: nullableString,
    phone: nullableString,
    email: nullableString,
    address: nullableString,
    need_summary: nullableString,
    tags: { type: "array", items: { type: "string" } },
  },
};

const SUGGEST_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["suggestions"],
  properties: {
    suggestions: { type: "array", items: { type: "string" } },
  },
};

/** Trích xuất thông tin khách từ transcript hội thoại (structured output). */
export async function extractContactFromConversation(
  supabase: SupabaseClient,
  transcript: string,
): Promise<AiResult<ExtractedContact>> {
  const blocked = await guard(supabase);
  if (blocked) return { ok: false, reason: blocked };

  const result = await createCompletion({
    system: [
      "You are an assistant for a Vietnamese SME sales team using a CRM.",
      "Read the conversation transcript between a customer (Customer:) and the shop (Agent:) and extract the customer information a salesperson would want to save.",
      "Rules: never invent data — use null for any field not clearly present in the conversation.",
      "need_summary is a one-sentence summary of what the customer needs; tags are 0-5 short labels (e.g. product interest, urgency).",
      "Write need_summary and tags in the SAME language as the conversation.",
    ].join(" "),
    prompt: transcript,
    schema: EXTRACT_SCHEMA,
  });
  if (!result.ok) return result;

  const parsed = parseJson<ExtractedContact>(result.data);
  if (!parsed) return { ok: false, reason: "unknown" };
  return { ok: true, data: parsed };
}

/** Tóm tắt hội thoại thành 3-5 gạch đầu dòng, cùng ngôn ngữ với hội thoại. */
export async function summarizeConversation(
  supabase: SupabaseClient,
  transcript: string,
): Promise<AiResult<string>> {
  const blocked = await guard(supabase);
  if (blocked) return { ok: false, reason: blocked };

  return createCompletion({
    system: [
      "You are an assistant for a Vietnamese SME sales team using a CRM.",
      "Summarize the conversation transcript between a customer (Customer:) and the shop (Agent:) in 3-5 short bullet lines (each starting with \"- \").",
      "Cover: what the customer wants, what was agreed, and any pending follow-up.",
      "Respond ONLY with the bullet lines, in the SAME language as the conversation.",
    ].join(" "),
    prompt: transcript,
  });
}

/** Gợi ý 3 câu trả lời ngắn theo ý định tin nhắn cuối của khách. */
export async function suggestReplies(
  supabase: SupabaseClient,
  transcript: string,
): Promise<AiResult<string[]>> {
  const blocked = await guard(supabase);
  if (blocked) return { ok: false, reason: blocked };

  const result = await createCompletion({
    system: [
      "You are an assistant for a Vietnamese SME sales team replying to customers in chat.",
      "Given the conversation transcript between a customer (Customer:) and the shop (Agent:), draft exactly 3 short reply messages the shop could send next, matching the intent of the customer's last message.",
      "Write in the SAME language as the conversation. When the conversation is Vietnamese, use polite neutral business chat tone: the shop refers to itself as \"shop\"/\"mình\" and never uses stiff formal pronouns.",
      "Each suggestion must be a complete, ready-to-send message of 1-3 sentences. No numbering, no quotes around the messages.",
    ].join(" "),
    prompt: transcript,
    schema: SUGGEST_SCHEMA,
  });
  if (!result.ok) return result;

  const parsed = parseJson<{ suggestions: string[] }>(result.data);
  if (!parsed || !Array.isArray(parsed.suggestions)) {
    return { ok: false, reason: "unknown" };
  }
  return {
    ok: true,
    data: parsed.suggestions
      .filter((s): s is string => typeof s === "string" && s.trim() !== "")
      .slice(0, 3),
  };
}
