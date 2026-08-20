"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { INDUSTRIES, type Industry } from "@/lib/industries";

/**
 * Card "Chọn ngành" trên Tổng quan (tenant cũ chưa có industry) + màn Cài đặt
 * "Ngành & giao diện" (đổi pack): gọi cùng RPC với onboarding. Quyền
 * owner/admin do chính hàm DB apply_industry_pack kiểm (security definer,
 * migration #60) — validate theo bảng industry_packs thật, không theo mảng
 * INDUSTRIES phía client (D1: một nguồn sự thật).
 */
export async function applyIndustryTemplate(industry: Industry) {
  if (!INDUSTRIES.includes(industry)) return { error: "invalid" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("apply_industry_pack", {
    p_pack_key: industry,
  });
  if (error) return { error: "failed" };
  revalidatePath("/app");
  revalidatePath("/app/settings");
  return { error: null };
}

/**
 * ĐỦ NĂM loại mà `trash_restore` (migration #127/#198) thật sự khôi phục được.
 *
 * Bản đầu khai ba, nên đơn hàng và lịch hẹn đã xoá rơi vào ngõ cụt: RPC làm
 * được nhưng tầng web chặn trước với mã "invalid" — bấm Khôi phục là ăn lỗi.
 * Cộng với việc màn Thùng rác chỉ dịch ba loại (dòng đơn hàng hiện ra dưới dạng
 * mã thô) và câu mô tả chỉ kể "khách, cơ hội, công ty", chủ tiệm đọc xong tin
 * là đơn KHÔNG lấy lại được rồi gõ tay lại một đơn mới — đẻ chứng từ tiền trùng.
 */
const TRASH_ENTITY_TYPES = ["contact", "deal", "company", "order", "appointment"] as const;
type TrashEntityType = (typeof TRASH_ENTITY_TYPES)[number];

/**
 * Cài đặt → Thùng rác: khôi phục 1 mục (bất biến 11, migration #60). RPC
 * trash_restore tự kiểm owner/admin + tenant — đây chỉ chặn sớm giá trị rác.
 */
export async function restoreFromTrash(entityType: TrashEntityType, entityId: string) {
  if (!TRASH_ENTITY_TYPES.includes(entityType)) return { error: "invalid" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("trash_restore", {
    p_entity_type: entityType,
    p_entity_id: entityId,
  });
  if (error) return { error: "failed" };
  revalidatePath("/app/settings/trash");
  return { error: null };
}
