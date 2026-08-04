"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

type HandoffResult = { error: string | null; waitedMinutes?: number | null };

const handoffSchema = z.object({
  conversationId: z.uuid(),
  toUserId: z.uuid(),
  reason: z.string().trim().min(1).max(500),
});

/** Mã lỗi RPC `handoff_conversation` → key chuỗi dịch `inbox.handoff.errors.*`. */
const DB_ERRORS = [
  "receiver_not_member",
  "conversation_not_found",
  "already_assigned",
  "reason_required",
  "not_authenticated",
  "forbidden",
] as const;

/**
 * Bàn giao hội thoại cho đồng nghiệp.
 *
 * Mọi kiểm tra + 3 thao tác ghi (đổi người phụ trách · ghi sổ bàn giao · báo cho
 * người nhận) nằm trong RPC `handoff_conversation` (migration #24) để luôn cùng
 * một transaction — không có cảnh "đổi người rồi mà người nhận không hay".
 */
export async function handoffConversation(input: {
  conversationId: string;
  toUserId: string;
  reason: string;
}): Promise<HandoffResult> {
  const parsed = handoffSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("handoff_conversation", {
    p_conversation: parsed.data.conversationId,
    p_to_user: parsed.data.toUserId,
    p_reason: parsed.data.reason,
  });

  if (error) {
    const known = DB_ERRORS.find((code) => error.message.includes(code));
    return { error: known ?? "handoff_failed" };
  }

  revalidatePath("/app/inbox");
  const waited = (data as { waited_minutes?: number | null } | null)?.waited_minutes;
  return { error: null, waitedMinutes: waited ?? null };
}
