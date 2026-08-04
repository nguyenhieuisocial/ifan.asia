"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

type SaveResult = {
  error: string | null;
  data?: {
    embedKey: string;
    enabled: boolean;
    greeting: string;
    origins: string[];
  };
};

/**
 * Lưu cấu hình Live Chat. Toàn bộ kiểm tra thật (role owner/admin, dạng tên
 * miền, sinh khóa nhúng) nằm trong RPC livechat_setup — client không bypass
 * được. Ở đây chỉ chặn rác sớm và dịch lỗi ra thông điệp cho chủ shop.
 */
const saveSchema = z.object({
  enabled: z.boolean(),
  greeting: z.string().trim().max(300),
  // Ô nhập là 1 tên miền/1 dòng — tối đa 10 dòng theo giới hạn của RPC
  origins: z.array(z.string().trim().max(260)).max(10),
});

const ERROR_KEYS: Record<string, string> = {
  forbidden: "forbidden",
  invalid_origin: "invalidOrigin",
  too_many_origins: "tooManyOrigins",
  no_tenant_context: "failed",
};

export async function saveLivechatSettings(input: {
  enabled: boolean;
  greeting: string;
  origins: string[];
}): Promise<SaveResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "failed" };

  // Cấu hình kênh là thao tác hiếm — cùng ngưỡng với kết nối/ngắt kênh Zalo
  const { allowed } = await rateLimit(`livechat-setup:user:${user.id}`, 10, 60);
  if (!allowed) return { error: "tryLater" };

  const { data, error } = await supabase.rpc("livechat_setup", {
    p_enabled: parsed.data.enabled,
    p_greeting: parsed.data.greeting,
    p_origins: parsed.data.origins.filter((o) => o.length > 0),
  });
  if (error) {
    const key = Object.keys(ERROR_KEYS).find((k) => error.message.includes(k));
    return { error: key ? ERROR_KEYS[key] : "failed" };
  }

  const row = data as {
    embed_key: string;
    enabled: boolean;
    greeting: string | null;
    allowed_origins: string[] | null;
  };

  revalidatePath("/app/settings/channels");
  revalidatePath("/app/settings/channels/livechat");
  revalidatePath("/app/inbox"); // empty-state "chưa kết nối kênh" phụ thuộc channels
  return {
    error: null,
    data: {
      embedKey: row.embed_key,
      enabled: row.enabled,
      greeting: row.greeting ?? "",
      origins: row.allowed_origins ?? [],
    },
  };
}
