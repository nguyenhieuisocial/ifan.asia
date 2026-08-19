"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { SAVED_VIEW_VOCAB_VERSION, type SavedViewScreen } from "@/lib/saved-views";

type Member = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  tenantId: string;
};

/**
 * Cùng khuôn requireMember() ở deals/actions.ts và contacts/import-export-actions.ts
 * — mỗi thư mục route giữ bản riêng, không tách hàm dùng chung (nếp sẵn có).
 *
 * ⚠️ Tư cách thành viên đọc qua `getCurrentMembership`, KHÔNG tự viết truy vấn:
 * bản tự viết quên `status='active'` và `expires_at` nên người vừa bị gỡ khỏi
 * tiệm vẫn tạo/sửa/xoá bộ lọc lưu sẵn trong lúc thẻ đăng nhập cũ còn sống (~1
 * giờ). Đo 20/08: CSDL không chặn ghi `saved_views` cho người đã bị gỡ ⇒ chốt
 * này là chốt duy nhất.
 */
async function requireMember(): Promise<Member | { errorKey: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errorKey: "sessionExpired" };

  const [member, { data: tenant }] = await Promise.all([
    getCurrentMembership(supabase, user.id),
    supabase.from("tenants").select("id").maybeSingle(),
  ]);
  if (!member || !tenant) return { errorKey: "tenantNotFound" };

  return { supabase, userId: user.id, tenantId: tenant.id as string };
}

export type SavedViewActionResult = { error?: string; id?: string };

/** Lưu bộ lọc HIỆN TẠI thành chip riêng của người bấm (QĐ-1: chỉ lưu chuỗi
 *  điều kiện, không lưu danh sách id). Chip mặc định của tiệm (user_id NULL)
 *  chỉ tới từ pack seed (apply_industry_pack) — màn này không tạo view mặc định. */
export async function createSavedView(input: {
  screen: SavedViewScreen;
  name: string;
  query: string;
}): Promise<SavedViewActionResult> {
  const m = await requireMember();
  if ("errorKey" in m) return { error: m.errorKey };

  const name = input.name.trim().slice(0, 40);
  if (!name) return { error: "nameRequired" };
  if (!input.query) return { error: "emptyFilter" };

  const { data, error } = await m.supabase
    .from("saved_views")
    .insert({
      tenant_id: m.tenantId,
      user_id: m.userId,
      screen: input.screen,
      name,
      query: input.query,
      vocab_version: SAVED_VIEW_VOCAB_VERSION,
    })
    .select("id")
    .single();

  if (error) {
    // Trùng (tenant_id, user_id, screen, name) — unique index saved_views_unique_name
    if (error.code === "23505") return { error: "duplicateName" };
    return { error: "unknown" };
  }
  return { id: data.id as string };
}

/** Xoá MỀM (bất biến 11) — hàng vẫn còn trong bảng, chỉ ẩn khỏi danh sách
 *  (unique index + RLS select đều lọc deleted_at is null). */
export async function deleteSavedView(id: string): Promise<SavedViewActionResult> {
  const m = await requireMember();
  if ("errorKey" in m) return { error: m.errorKey };

  // RLS saved_views_update chỉ cho xoá chip của CHÍNH mình, hoặc chip chung
  // (user_id IS NULL) nếu là chủ tiệm/quản trị. Bị lọc thì .update() trả
  // error=null + 0 dòng — im hệt lúc xoá được, chip lặng lẽ ở lại. Đếm dòng.
  const { data: deleted, error } = await m.supabase
    .from("saved_views")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return { error: "unknown" };
  if (!deleted) return { error: "noPermission" };
  return {};
}
