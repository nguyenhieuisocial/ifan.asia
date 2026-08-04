import { createClient } from "@/lib/supabase/server";
import { RepliesView, type QuickReplyRow } from "./replies-view";

export const dynamic = "force-dynamic";

/**
 * Cài đặt → Câu trả lời nhanh (đợt 2 Tiệm mẫu, migration #12).
 * Owner/admin/manager thêm/sửa/xóa/sắp xếp; staff xem chỉ-đọc (RLS cho mọi
 * member đọc — composer Hộp thư dùng chung kho này qua nút ⚡).
 */
export default async function RepliesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // layout /app đã redirect khi chưa đăng nhập — user luôn có ở đây
  const { data: member } = await supabase
    .from("tenant_members")
    .select("role")
    .eq("user_id", user?.id ?? "")
    .maybeSingle();
  const canManage =
    member?.role === "owner" ||
    member?.role === "admin" ||
    member?.role === "manager";

  const { data } = await supabase
    .from("quick_replies")
    .select("id, title, content, sort_order")
    .order("sort_order")
    .order("title");

  return (
    <RepliesView
      canManage={canManage}
      replies={(data ?? []) as QuickReplyRow[]}
    />
  );
}
