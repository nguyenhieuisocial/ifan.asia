"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import {
  AUTOPILOT_DAILY_CAP_MAX,
  AUTOPILOT_DAILY_CAP_MIN,
  AUTOPILOT_TURNS_MAX,
  AUTOPILOT_TURNS_MIN,
  canEnableAutopilot,
  getAutopilotConfig,
  getAutopilotSourceStatus,
  type AutopilotConfig,
} from "@/lib/ai/autopilot";

/**
 * Cài đặt → AI trực việc (ADR-0014 mục 9 việc 3).
 *
 * QUYỀN: owner/admin/manager — khớp `ai_autopilot_manage` (migration #105).
 *
 * QĐ 1 kiểm LẠI ở ĐÂY trước khi ghi `enabled=true` — không tin riêng vào RLS
 * hay UI đã khoá nút: `ai_autopilot_decide()` cũng tự kiểm lại nguồn dữ liệu
 * mỗi lần quyết định (2 lớp, không phải 1 lớp thừa — RLS/UI chặn NGƯỜI bấm
 * nhầm, decide() chặn TIN NHẮN đi ra dù ai đó lách qua cả hai lớp trên).
 */

type ActionResult = { error: string | null };

const MANAGE_ROLES = ["owner", "admin", "manager"];

async function requireManage(): Promise<
  { supabase: Awaited<ReturnType<typeof createClient>> } | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const member = await getCurrentMembership(supabase, user.id);
  if (!member || !MANAGE_ROLES.includes(member.role)) return { error: "forbidden" };
  return { supabase };
}

function revalidateAiAutopilot() {
  revalidatePath("/app/settings/ai-autopilot");
}

const configSchema = z.object({
  enabled: z.boolean(),
  scope: z.enum(["outside_hours", "always"]),
  maxTurnsPerConversation: z.number().int().min(AUTOPILOT_TURNS_MIN).max(AUTOPILOT_TURNS_MAX),
  dailyCap: z.number().int().min(AUTOPILOT_DAILY_CAP_MIN).max(AUTOPILOT_DAILY_CAP_MAX),
});

export async function saveAutopilotConfig(
  input: z.infer<typeof configSchema>,
): Promise<ActionResult & { config?: AutopilotConfig }> {
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const auth = await requireManage();
  if ("error" in auth) return auth;
  const { supabase } = auth;

  // Khoá lại ở tầng action: kể cả client gửi enabled=true lên trong lúc chưa
  // đủ nguồn (đã tắt nút, nhưng đừng tin request thô), chặn TRƯỚC khi ghi.
  if (parsed.data.enabled) {
    const source = await getAutopilotSourceStatus(supabase);
    if (!canEnableAutopilot(source)) return { error: "no_source" };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!user || !tenant) return { error: "not_found" };

  const { error } = await supabase.from("ai_autopilot").upsert({
    tenant_id: tenant.id as string,
    enabled: parsed.data.enabled,
    scope: parsed.data.scope,
    max_turns_per_conversation: parsed.data.maxTurnsPerConversation,
    daily_cap: parsed.data.dailyCap,
  });
  if (error) {
    if (/row-level security/i.test(error.message)) return { error: "forbidden" };
    return { error: "save_failed" };
  }

  revalidateAiAutopilot();
  return { error: null, config: await getAutopilotConfig(supabase) };
}
