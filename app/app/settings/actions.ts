"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

type ActionResult = { error: string | null };

/** Kết nối/ngắt kênh là thao tác hiếm — 10 lượt/phút mỗi user chung cho cả hai chiều. */
async function channelRateLimited(userId: string): Promise<boolean> {
  const { allowed } = await rateLimit(`settings-channel:user:${userId}`, 10, 60);
  return !allowed;
}

/**
 * Kết nối Zalo OA (đợt 1: nhập token thủ công — OAuth flow đợt 2 khi app Zalo
 * được duyệt). Token đi thẳng vào Vault qua RPC security definer
 * connect_zalo_channel — KHÔNG lưu plaintext, KHÔNG log; hàm DB tự kiểm role
 * owner/admin nên không thể bypass từ client.
 */
const connectSchema = z.object({
  oaId: z.string().trim().regex(/^\d{1,64}$/), // oa_id Zalo là chuỗi số
  oaName: z.string().trim().max(120),
  accessToken: z.string().trim().min(10).max(4096),
  refreshToken: z.string().trim().min(10).max(4096),
});

export async function connectZaloChannel(input: {
  oaId: string;
  oaName: string;
  accessToken: string;
  refreshToken: string;
}): Promise<ActionResult> {
  const parsed = connectSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };
  if (await channelRateLimited(user.id)) return { error: "rate_limited" };

  const { error } = await supabase.rpc("connect_zalo_channel", {
    p_oa_id: parsed.data.oaId,
    p_access_token: parsed.data.accessToken,
    p_refresh_token: parsed.data.refreshToken,
    p_oa_name: parsed.data.oaName || null,
  });
  if (error) {
    if (error.message.includes("oa_already_connected")) {
      return { error: "oa_already_connected" };
    }
    if (error.message.includes("forbidden")) return { error: "forbidden" };
    return { error: "connect_failed" };
  }

  revalidatePath("/app/settings/channels");
  revalidatePath("/app/inbox"); // empty-state "chưa kết nối kênh" phụ thuộc channels
  return { error: null };
}

/** Ngắt kết nối: xóa secret khỏi Vault + status='disconnected' (RPC definer, owner/admin). */
export async function disconnectZaloChannel(
  channelId: string,
): Promise<ActionResult> {
  const parsed = z.uuid().safeParse(channelId);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };
  if (await channelRateLimited(user.id)) return { error: "rate_limited" };

  const { error } = await supabase.rpc("disconnect_zalo_channel", {
    p_channel_id: parsed.data,
  });
  if (error) {
    if (error.message.includes("forbidden")) return { error: "forbidden" };
    return { error: "disconnect_failed" };
  }

  revalidatePath("/app/settings/channels");
  revalidatePath("/app/inbox");
  return { error: null };
}
