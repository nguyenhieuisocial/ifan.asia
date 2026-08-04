"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * Đánh dấu đã đọc.
 *
 * KHÔNG câu nào ở đây lọc theo `user_id`: policy `notifications_mark_read`
 * (migration #2) đã ràng cả USING lẫn WITH CHECK về `tenant_id =
 * current_tenant_id() AND user_id = auth.uid()`. Nghĩa là "đánh dấu tất cả"
 * chạy dưới danh nghĩa người đang đăng nhập thì Postgres tự bỏ qua mọi dòng của
 * đồng nghiệp — không có đường nào chạm nhầm, kể cả khi tầng web viết sai.
 *
 * Quy ước lỗi giống các màn khác: `error` là chuỗi ĐÃ DỊCH, client toast thẳng.
 */
type ActionResult = { error: string | null };

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function markNotificationRead(
  notificationId: string,
): Promise<ActionResult> {
  const t = await getTranslations("notifications.errors");
  const parsed = z.uuid().safeParse(notificationId);
  if (!parsed.success) return { error: t("invalidNotification") };

  const { supabase, user } = await requireUser();
  if (!user) return { error: t("sessionExpired") };

  // `is('read_at', null)`: bấm lại dòng đã đọc thì không dời mốc thời gian đọc.
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", parsed.data)
    .is("read_at", null);
  if (error) return { error: t("markFailed") };
  return { error: null };
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const t = await getTranslations("notifications.errors");
  const { supabase, user } = await requireUser();
  if (!user) return { error: t("sessionExpired") };

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  if (error) return { error: t("markFailed") };
  return { error: null };
}
