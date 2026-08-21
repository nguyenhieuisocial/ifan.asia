"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { SITE_URL } from "@/lib/config";

/**
 * HAI HÀNH ĐỘNG HỖ TRỢ của chủ SaaS trên một tài khoản người dùng.
 *
 * ⚠️ KIỂM `is_platform_admin()` Ở ĐÂY, không tin vào việc màn `/admin` đã chặn.
 *   Lệnh máy chủ gọi được thẳng bằng một lời POST — chốt ở màn hình là chốt ở
 *   phía người gọi, tức là không phải chốt.
 *
 * ⚠️ CẢ HAI ĐỀU GỬI THƯ THẬT tới hộp thư của một người thật. Vì vậy có giới hạn
 *   tần suất riêng: một tay bấm liên tục là biến iFan thành công cụ dội thư vào
 *   hộp thư khách hàng, và địa chỉ gửi của cả hệ thống sẽ bị đánh dấu là rác.
 *
 * ⚠️ KHÔNG có hàm xoá tài khoản, cố ý. Xoá kéo theo dữ liệu ở MỌI tiệm người đó
 *   từng làm và không hoàn tác được. Gỡ khỏi một tiệm thì làm ở màn Nhân sự của
 *   tiệm đó.
 */

const emailSchema = z.email().max(200);

async function chotChuSaas(): Promise<{ error: string } | { ok: true; userId: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "notAuthenticated" };
  const { data: laAdmin } = await supabase.rpc("is_platform_admin");
  if (!laAdmin) return { error: "forbidden" };
  return { ok: true, userId: user.id };
}

/** Gửi lại thư xác minh cho người chưa bấm vào liên kết trong thư đầu tiên. */
export async function guiLaiThuXacMinh(email: string): Promise<{ error: string | null }> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return { error: "invalidInput" };
  const chot = await chotChuSaas();
  if ("error" in chot) return { error: chot.error };

  // 20 lá thư mỗi giờ cho toàn bộ thao tác này — đủ cho một ngày hỗ trợ bận
  // rộn, và đủ chặn một tay bấm liên tục.
  const { allowed } = await rateLimit(`admin-mail:${chot.userId}`, 20, 3600);
  if (!allowed) return { error: "tooMany" };

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data,
    options: { emailRedirectTo: `${SITE_URL}/auth/confirm` },
  });
  if (error) return { error: "sendFailed" };
  return { error: null };
}

/** Gửi thư đặt lại mật khẩu — người dùng tự đặt lại, chủ SaaS không đặt hộ. */
export async function guiThuDatLaiMatKhau(email: string): Promise<{ error: string | null }> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return { error: "invalidInput" };
  const chot = await chotChuSaas();
  if ("error" in chot) return { error: chot.error };

  const { allowed } = await rateLimit(`admin-mail:${chot.userId}`, 20, 3600);
  if (!allowed) return { error: "tooMany" };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${SITE_URL}/reset-password`,
  });
  if (error) return { error: "sendFailed" };
  return { error: null };
}
