import { nowVN } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";
import { RepliesView, type QuickReplyRow } from "./replies-view";

export const dynamic = "force-dynamic";

/** Khung đếm lượt dùng: "dùng n lần trong 30 ngày" — vòng phản hồi kho câu mẫu. */
const USAGE_DAYS = 30;

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

  // Trang force-dynamic: mốc 30 ngày tính lại mỗi request (giờ VN, lib/datetime)
  const since = new Date(nowVN().getTime() - USAGE_DAYS * 86_400_000).toISOString();
  const [{ data }, { data: counts }] = await Promise.all([
    supabase
      .from("quick_replies")
      .select("id, title, content, sort_order")
      .order("sort_order")
      .order("title"),
    // Số lượt mỗi câu được chèn vào composer Hộp thư: COUNT trong CSDL
    // (migration #58, đúng mẫu sla_fired_counts — không tải về đếm)
    supabase.rpc("quick_reply_used_counts", { p_since: since }),
  ]);
  const used30d = (counts ?? {}) as Record<string, number>;

  const rows: QuickReplyRow[] = ((data ?? []) as Omit<QuickReplyRow, "used30d">[]).map(
    (r) => ({ ...r, used30d: used30d[r.id] ?? 0 }),
  );

  return <RepliesView canManage={canManage} replies={rows} />;
}
