"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { SITE_URL } from "@/lib/config";
import { telegramSetWebhook } from "@/lib/notify/telegram";

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

/**
 * Nối bot Telegram của tiệm (ADR-0013 việc 7).
 *
 * Chủ tiệm chỉ dán MỘT thứ: token bot lấy từ @BotFather. Mã bot là phần số
 * trước dấu hai chấm — tự tách ở đây thay vì bắt người ta hiểu cấu trúc token.
 *
 * TỰ ĐĂNG KÝ ĐỊA CHỈ NHẬN TIN, không bắt dán tay: Zalo phải dán vì cổng của họ
 * ở trang khác, còn Telegram thì đăng ký được bằng một lời gọi. Bắt chủ tiệm
 * tự dán URL kèm mã kênh là mời họ dán sai rồi ngồi chờ tin không bao giờ tới.
 */
const connectTelegramSchema = z.object({
  // Token có dạng "123456789:AAH..." — kiểm ngay ở đây để báo lỗi dễ hiểu,
  // thay vì để CSDL ném 'invalid_request' rồi hiện câu chung chung.
  botToken: z
    .string()
    .trim()
    .regex(/^\d{5,}:[A-Za-z0-9_-]{20,}$/),
  botName: z.string().trim().max(120).optional(),
});

export async function connectTelegramChannel(input: {
  botToken: string;
  botName?: string;
}): Promise<ActionResult> {
  const parsed = connectTelegramSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };
  if (await channelRateLimited(user.id)) return { error: "rate_limited" };

  const botToken = parsed.data.botToken;
  const botId = botToken.split(":")[0]!;

  const { data, error } = await supabase.rpc("connect_telegram_channel", {
    p_bot_id: botId,
    p_bot_token: botToken,
    p_bot_name: parsed.data.botName || null,
  });
  if (error) {
    if (error.message.includes("forbidden")) return { error: "forbidden" };
    // Chỉ số duy nhất toàn cục: bot này đã thuộc tiệm khác.
    if (error.message.includes("duplicate key")) {
      return { error: "bot_already_connected" };
    }
    return { error: "connect_failed" };
  }

  const res = data as { channel_id?: string; hook_secret?: string } | null;
  if (!res?.channel_id || !res.hook_secret) return { error: "connect_failed" };

  // Đăng ký địa chỉ nhận tin với Telegram. Hỏng bước này thì kênh coi như
  // CHƯA nối — để status='active' mà tin không bao giờ tới là nói dối chủ tiệm.
  const hookUrl = `${SITE_URL}/api/webhooks/telegram?ch=${res.channel_id}`;
  const hook = await telegramSetWebhook(botToken, hookUrl, res.hook_secret);
  if (!hook.ok) {
    await supabase.rpc("disconnect_telegram_channel", {
      p_channel_id: res.channel_id,
    });
    return { error: "webhook_failed" };
  }

  revalidatePath("/app/settings/channels");
  revalidatePath("/app/inbox");
  return { error: null };
}

/** Ngắt bot Telegram: gỡ địa chỉ nhận tin ở Telegram rồi tắt kênh. */
export async function disconnectTelegramChannel(
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

  const { error } = await supabase.rpc("disconnect_telegram_channel", {
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
