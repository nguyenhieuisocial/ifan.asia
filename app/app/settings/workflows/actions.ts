"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";

type ActionResult = { error: string | null };

/**
 * Bật/tắt một quy trình. Đợt 1 chỉ có thao tác này — tạo/sửa quy trình riêng
 * thuộc đợt 2. RLS `workflows_manage` (migration #15) là lưới cuối: chỉ
 * owner/admin của đúng tenant ghi được; action vẫn tự kiểm vai trò trước
 * (defense in depth, theo mẫu settings/replies/actions.ts).
 */
export async function setWorkflowActive(
  workflowId: string,
  isActive: boolean,
): Promise<ActionResult> {
  const parsed = z
    .object({ workflowId: z.uuid(), isActive: z.boolean() })
    .safeParse({ workflowId, isActive });
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const member = await getCurrentMembership(supabase, user.id);
  if (member?.role !== "owner" && member?.role !== "admin") {
    return { error: "forbidden" };
  }

  const { error } = await supabase
    .from("workflows")
    .update({ is_active: parsed.data.isActive })
    .eq("id", parsed.data.workflowId);
  if (error) return { error: "failed" };

  revalidatePath("/app/settings/workflows");
  return { error: null };
}
