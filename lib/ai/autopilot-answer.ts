import type { SupabaseClient } from "@supabase/supabase-js";
import { createCompletion, isAiConfigured, type AiFailureReason, type AiResult } from "./gateway";
import type { AutopilotFacts } from "./autopilot-facts";

/**
 * AI trực việc — hỏi AI, ĐÚNG phạm vi ADR-0014 mục 4.
 *
 * Khác 3 hàm copilot trong gateway.ts (luôn trả bản nháp cho người soát): hàm
 * này tự GỬI THẲNG cho khách, nên system prompt phải CẤM tuyệt đối — không
 * phải "khuyên nên tránh" — mọi thứ ngoài 4 loại sự thật đã khai. Model được
 * yêu cầu trả `in_scope=false` thay vì cố trả lời khi không chắc; đây là chỗ
 * "thà im còn hơn bịa" phải thắng "cố giúp cho có".
 */

const AUTOPILOT_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["in_scope", "answer"],
  properties: {
    in_scope: { type: "boolean" },
    answer: { anyOf: [{ type: "string" }, { type: "null" }] },
  },
};

export type AutopilotAnswer =
  | { inScope: true; answer: string }
  | { inScope: false };

/**
 * Trần lượt/tháng DÙNG CHUNG với 3 hàm copilot khác (usage_counters, luật D1)
 * — nhưng gọi bằng `increment_usage_for` (service role, không có JWT tenant
 * trong ngữ cảnh máy quét). QUOTA-TRƯỚC-RỒI-MỚI-GỌI, đúng thứ tự guard() của
 * gateway.ts — không lãng phí một lượt gọi AI nếu tenant đã hết quota.
 */
export async function answerAutopilotQuestion(
  service: SupabaseClient,
  params: { tenantId: string; facts: AutopilotFacts; question: string },
): Promise<AiResult<AutopilotAnswer>> {
  if (!isAiConfigured()) return { ok: false, reason: "not_configured" };

  const { error: quotaError } = await service.rpc("increment_usage_for", {
    p_tenant: params.tenantId,
    p_metric: "ai_calls",
  });
  if (quotaError) {
    const reason: AiFailureReason = quotaError.message.includes("quota_exceeded")
      ? "quota_exceeded"
      : "api_error";
    return { ok: false, reason };
  }

  const result = await createCompletion({
    system: [
      "You are the automated front-desk assistant for a Vietnamese small business, replying directly to a customer in chat — there is NO human review before your reply is sent.",
      "You may ONLY use the facts given below (opening hours, services & prices, address, shop intro). NEVER invent, guess, or estimate anything not explicitly present in those facts.",
      "If the customer's question cannot be fully answered from the given facts — including: pricing not in the service list, booking/reserving a time slot, taking orders, promises about timing or results, discounts/promotions, accepting payment or deposits, or anything about a specific other customer — set in_scope=false and answer=null. Do NOT attempt a partial or hedged answer for these.",
      "When in_scope=true, write a short, complete, ready-to-send reply (1-3 sentences) in the SAME language as the customer's message. For Vietnamese, use polite neutral business chat tone: the shop refers to itself as \"shop\"/\"mình\" and never uses stiff formal pronouns.",
      "--- FACTS THE SHOP HAS PROVIDED ---",
      params.facts.text || "(chưa có sự thật nào được khai)",
    ].join("\n"),
    prompt: params.question,
    schema: AUTOPILOT_SCHEMA,
  });
  if (!result.ok) return result;

  let parsed: { in_scope: boolean; answer: string | null };
  try {
    parsed = JSON.parse(result.data);
  } catch {
    return { ok: false, reason: "unknown" };
  }

  if (!parsed.in_scope || !parsed.answer || !parsed.answer.trim()) {
    return { ok: true, data: { inScope: false } };
  }
  return { ok: true, data: { inScope: true, answer: parsed.answer.trim() } };
}
