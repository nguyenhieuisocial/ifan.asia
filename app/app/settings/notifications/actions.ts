"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { rateLimit } from "@/lib/rate-limit";
import { SITE_URL } from "@/lib/config";
import { zaloBotGetMe, zaloBotSetWebhook } from "@/lib/notify/channel";
import { processBotOutbox } from "@/lib/notify/outbox";

type ActionResult = { error: string | null };

/**
 * Server actions màn Cài đặt → Thông báo (Zalo Bot — spec B26).
 * Token bot đi thẳng vào Vault qua RPC definer connect_zalo_bot (pattern y hệt
 * connect_zalo_channel) — KHÔNG lưu plaintext, KHÔNG log. Quyền owner/admin do
 * chính hàm DB kiểm, server action chỉ là lớp kiểm sớm + rate limit.
 */

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, userId: user.id };
}

/** Thao tác cài đặt bot là việc hiếm — 10 lượt/phút mỗi user cho cả cụm. */
async function botSettingsRateLimited(userId: string): Promise<boolean> {
  const { allowed } = await rateLimit(`bot-settings:user:${userId}`, 10, 60);
  return !allowed;
}

const connectSchema = z.object({
  token: z.string().trim().min(10).max(512),
});

export type ConnectBotResult = ActionResult & {
  /** Trạng thái đăng ký webhook — 'skipped' khi hạ tầng chưa đặt BOT_INGEST_KEY. */
  webhook?: "ok" | "failed" | "skipped";
};

export async function connectZaloBot(input: {
  token: string;
}): Promise<ConnectBotResult> {
  const parsed = connectSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const ctx = await requireUser();
  if (!ctx) return { error: "not_authenticated" };
  if (await botSettingsRateLimited(ctx.userId)) return { error: "rate_limited" };

  // Kiểm token SỐNG trước khi lưu (getMe) — token gõ nhầm phải chết ngay ở đây,
  // không phải im lặng nằm trong Vault rồi không gửi được gì.
  const me = await zaloBotGetMe(parsed.data.token);
  if (!me.ok) return { error: "token_invalid" };

  const { data: channelId, error } = await ctx.supabase.rpc("connect_zalo_bot", {
    p_token: parsed.data.token,
    p_bot_name: me.name,
  });
  if (error) {
    if (error.message.includes("forbidden")) return { error: "forbidden" };
    return { error: "connect_failed" };
  }

  // Đăng ký webhook để bot nhận "/link <mã>" — secret_token = BOT_INGEST_KEY
  // (route webhook so khớp header X-Bot-Api-Secret-Token). Thiếu env → bỏ qua,
  // token vẫn được lưu; ghép nối sẽ chạy khi hạ tầng bật.
  let webhook: "ok" | "failed" | "skipped" = "skipped";
  const ingestKey = process.env.BOT_INGEST_KEY;
  if (ingestKey && typeof channelId === "string") {
    const hook = await zaloBotSetWebhook(
      parsed.data.token,
      `${SITE_URL}/api/bot/webhook?ch=${channelId}`,
      ingestKey,
    );
    webhook = hook.ok ? "ok" : "failed";
  }

  revalidatePath("/app/settings/notifications");
  return { error: null, webhook };
}

export async function disconnectZaloBot(): Promise<ActionResult> {
  const ctx = await requireUser();
  if (!ctx) return { error: "not_authenticated" };
  if (await botSettingsRateLimited(ctx.userId)) return { error: "rate_limited" };

  const { error } = await ctx.supabase.rpc("disconnect_zalo_bot");
  if (error) {
    if (error.message.includes("forbidden")) return { error: "forbidden" };
    if (error.message.includes("not_connected")) return { error: "not_connected" };
    return { error: "disconnect_failed" };
  }

  revalidatePath("/app/settings/notifications");
  return { error: null };
}

/** Mã 6 số TTL 10 phút — nhân viên nhắn "/link <mã>" cho bot của tiệm. */
export async function createBotLinkCode(): Promise<
  ActionResult & { code?: string }
> {
  const ctx = await requireUser();
  if (!ctx) return { error: "not_authenticated" };
  if (await botSettingsRateLimited(ctx.userId)) return { error: "rate_limited" };

  const { data, error } = await ctx.supabase.rpc("bot_create_link_code");
  if (error) {
    if (error.message.includes("no_bot")) return { error: "no_bot" };
    return { error: "code_failed" };
  }
  return { error: null, code: String(data) };
}

/** Hủy ghép nối Zalo của CHÍNH MÌNH (RLS chỉ cho xóa dòng của mình). */
export async function unlinkZaloBot(): Promise<ActionResult> {
  const ctx = await requireUser();
  if (!ctx) return { error: "not_authenticated" };

  const { error } = await ctx.supabase
    .from("staff_channel_links")
    .delete()
    .eq("user_id", ctx.userId);
  if (error) return { error: "unlink_failed" };

  revalidatePath("/app/settings/notifications");
  return { error: null };
}

const prefsSchema = z.object({
  enabled: z.boolean(),
  digestHour: z.number().int().min(0).max(23),
  kinds: z.object({
    sla: z.boolean(),
    today: z.boolean(),
    unread: z.boolean(),
    // #348 — báo động bất thường. Nằm CHUNG một cột jsonb với ba khoá trên vì
    // đó là hình dạng bảng đã có, NHƯNG nó KHÔNG thuộc bản tin Zalo: nó vào
    // chuông trong app. Form phải gửi lại nó mỗi lần lưu, nếu không thì một
    // cú bấm Lưu ở khu bản tin sẽ XOÁ MẤT lựa chọn tắt báo động và người dùng
    // lặng lẽ bị bật lại.
    bat_thuong: z.boolean(),
  }),
});

export async function saveBotPrefs(input: {
  enabled: boolean;
  digestHour: number;
  kinds: { sla: boolean; today: boolean; unread: boolean; bat_thuong: boolean };
}): Promise<ActionResult> {
  const parsed = prefsSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const ctx = await requireUser();
  if (!ctx) return { error: "not_authenticated" };

  // Phòng thủ nhiều lớp: RLS `notification_prefs_*` đã khoá về đúng dòng của
  // chính người gọi, nên đây KHÔNG phải lỗ đọc/ghi chéo. Vẫn lọc bằng
  // getCurrentMembership để người đã bị gỡ khỏi tiệm không sửa được cài đặt bản
  // tin trong lúc thẻ đăng nhập cũ chưa hết hạn.
  const [member, { data: tenant }] = await Promise.all([
    getCurrentMembership(ctx.supabase, ctx.userId),
    ctx.supabase.from("tenants").select("id").maybeSingle(),
  ]);
  if (!member || !tenant) return { error: "forbidden" };

  // Shape jsonb khớp bản đọc phòng thủ của bot_digest_run (#54): enabled,
  // digest_hour, kinds.{sla,today,unread}.
  const { error } = await ctx.supabase.from("notification_prefs").upsert(
    {
      tenant_id: tenant.id as string,
      user_id: ctx.userId,
      pref: {
        enabled: parsed.data.enabled,
        digest_hour: parsed.data.digestHour,
        kinds: parsed.data.kinds,
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,user_id" },
  );
  if (error) return { error: "save_failed" };

  revalidatePath("/app/settings/notifications");
  return { error: null };
}

/** "Gửi thử cho tôi": xếp tin thử vào outbox rồi kích worker gửi ngay. */
export async function sendBotTest(): Promise<ActionResult> {
  const ctx = await requireUser();
  if (!ctx) return { error: "not_authenticated" };

  // Gửi thử tốn quota thật — chặt hơn cụm cài đặt: 5 lượt/phút.
  const { allowed } = await rateLimit(`bot-test:user:${ctx.userId}`, 5, 60);
  if (!allowed) return { error: "rate_limited" };

  // Hạ tầng gửi chưa bật thì nói thẳng, đừng xếp tin rồi im lặng không tới.
  if (!process.env.BOT_INGEST_KEY) return { error: "not_configured" };

  const { error } = await ctx.supabase.rpc("bot_enqueue_test");
  if (error) {
    if (error.message.includes("no_bot")) return { error: "no_bot" };
    if (error.message.includes("not_linked")) return { error: "not_linked" };
    if (error.message.includes("quota_exceeded")) return { error: "quota_exceeded" };
    return { error: "send_failed" };
  }

  const result = await processBotOutbox();
  if (result.sent === 0) return { error: "send_failed" };
  return { error: null };
}
