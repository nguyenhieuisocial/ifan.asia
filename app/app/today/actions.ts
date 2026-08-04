"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * Server action màn "Hôm nay". Quy ước như deals/actions.ts: error là chuỗi ĐÃ
 * DỊCH theo locale hiện tại, client toast thẳng.
 *
 * Bảo mật: RLS activities (migration #4) là lưới cuối — staff chỉ update được
 * việc mình phụ trách. Action vẫn tự verify phiên đăng nhập trước (defense in depth).
 */
type ActionResult = { error: string | null };

/** Đánh dấu một việc là đã xong (mốc done_at = bây giờ). Idempotent. */
export async function completeActivity(
  activityId: string,
): Promise<ActionResult> {
  const t = await getTranslations("today.errors");
  const parsed = z.uuid().safeParse(activityId);
  if (!parsed.success) return { error: t("notFound") };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("sessionExpired") };

  const { data, error } = await supabase
    .from("activities")
    .update({ done_at: new Date().toISOString() })
    .eq("id", parsed.data)
    .is("done_at", null)
    .select("id, contact_id")
    .maybeSingle();
  if (error) return { error: t("completeFailed") };
  // Không có dòng nào đổi = việc đã xong từ trước hoặc ngoài quyền → coi như xong,
  // màn hình vẫn bỏ dòng đó đi (người dùng không cần biết chi tiết kỹ thuật).
  if (!data) return { error: null };

  revalidatePath("/app/today");
  if (data.contact_id) revalidatePath(`/app/contacts/${data.contact_id}`);
  return { error: null };
}
