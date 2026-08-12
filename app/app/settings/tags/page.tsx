import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { fetchTagsWithCounts } from "./queries";
import { TagsView } from "./tags-view";

export const dynamic = "force-dynamic";

/**
 * Cài đặt → Quản lý nhãn (V1b bước 5-6, mục 36.8-3). Mọi member XEM được
 * (tags_select), chỉ owner/admin/manager sửa/gộp/xoá (đúng RLS tags_manage).
 * Thẻ design: design-system/man-quan-ly-nhan.html.
 */
export default async function TagsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const member = await getCurrentMembership(supabase, user?.id ?? "");
  const canManage = ["owner", "admin", "manager"].includes(member?.role ?? "");

  const tags = await fetchTagsWithCounts(supabase);

  return <TagsView canManage={canManage} tags={tags} />;
}
