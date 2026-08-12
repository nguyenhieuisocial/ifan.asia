import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Vai của user trong tiệm ĐANG MỞ — CHỈ tính thành viên còn `status='active'`.
 *
 * Vì sao cần hàm dùng chung: JWT hết hạn theo thời gian (mặc định ~1 giờ),
 * không theo việc bị gỡ khỏi tiệm — người vừa bị gỡ (`status='removed'`,
 * `app/app/settings/team/actions.ts` hàm `removeMember`) vẫn có token còn
 * hiệu lực trong lúc đó. `current_tenant_id()`/`app_role()` (RLS, migration
 * #3/#66) đọc từ CLAIM nên không tự biết chuyện này; 28+ chỗ ở tầng web tự
 * viết `.from("tenant_members").select("role").eq("user_id", ...)` mà quên
 * lọc `status='active'` cũng bị lỗ hổng y hệt (mục 69, phát hiện 11/08 lúc
 * làm ADR-0005). Dùng hàm này thay vì tự viết lại truy vấn.
 */
export async function getCurrentMembership(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ role: string } | null> {
  const { data } = await supabase
    .from("tenant_members")
    .select("role")
    .eq("user_id", userId)
    .eq("status", "active")
    // Lớp bịt thứ 2 của ADR-0006 (phiên hỗ trợ chỉ-đọc, task #81): hàng hỗ trợ
    // hết hạn (expires_at) vẫn có thể còn `status='active'` trong khoảng hở
    // giữa lúc hết hạn và lúc job quét dọn chạy — chặn ở TẦNG WEB ngay cả khi
    // JWT cũ còn hiệu lực, không đợi hook cấp claim mới.
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .maybeSingle();
  return data;
}
