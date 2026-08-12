"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * "Cần giúp?" (24l… à không, mục 31.60/36 việc 9) + phiên hỗ trợ chỉ-đọc
 * (ADR-0006). Đường ghi phía TIỆM — RLS bảng help_requests/support_sessions
 * (migration #69) đã đủ cho hai việc dưới đây, KHÔNG cần RPC riêng: chủ ý
 * theo ADR-0006 mục 3 — chỉ cửa GHI xuyên-tenant (mở phiên hỗ trợ) mới cần
 * SECURITY DEFINER, còn thao tác trong CHÍNH tiệm mình thì RLS thường đủ.
 */

const helpRequestSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  allowScreenView: z.boolean(),
});

export type SubmitHelpRequestResult = { error: string | null };

/** Gửi yêu cầu "Cần giúp?" — mặc định KHÔNG cho xem màn hình (checkbox tự nhập, không tick sẵn). */
export async function submitHelpRequest(
  input: z.infer<typeof helpRequestSchema>,
): Promise<SubmitHelpRequestResult> {
  const parsed = helpRequestSchema.safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "sessionExpired" };

  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) return { error: "tenantNotFound" };

  const { error } = await supabase.from("help_requests").insert({
    tenant_id: tenant.id,
    created_by: user.id,
    message: parsed.data.message,
    allow_screen_view: parsed.data.allowScreenView,
  });
  if (error) return { error: "sendFailed" };

  revalidatePath("/app", "layout");
  return { error: null };
}

/**
 * Chủ tiệm bấm "Dừng ngay" trên dải báo — cắt quyền xem NGAY LẬP TỨC, không
 * phải đi xin (ADR-0006 mục 6). `end_support_session` tự kiểm người gọi là
 * owner/admin của ĐÚNG tiệm đang bị xem mới cho đóng.
 */
export async function stopSupportSession(sessionId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("end_support_session", { p_session_id: sessionId });
  if (error) return { error: "stopFailed" };

  revalidatePath("/app", "layout");
  return { error: null };
}
