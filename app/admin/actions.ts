"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Ghi nhận (đóng) một cảnh báo hệ thống trên bảng điều hành.
 *
 * Defense in depth: layout /admin đã chặn 404, nhưng server action gọi được
 * trực tiếp qua POST nên kiểm lại `is_platform_admin()` ở đây; RLS trên
 * `system_alerts` (policy system_alerts_ack, migration #44) vẫn là lưới cuối.
 *
 * Chỉ đóng cảnh báo ĐANG MỞ (`acknowledged_at is null`) — job hỏng tiếp sau khi
 * đóng sẽ mở cảnh báo mới nhờ unique partial index, không ghi đè lịch sử cũ.
 */
export async function acknowledgeSystemAlert(alertId: number): Promise<void> {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (isAdmin !== true) return;

  await supabase
    .from("system_alerts")
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("id", alertId)
    .is("acknowledged_at", null);

  revalidatePath("/admin");
}
