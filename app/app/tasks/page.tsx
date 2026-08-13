import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatVN, nowVN } from "@/lib/datetime";
import { fetchTasks } from "./queries";
import { TasksBoard } from "./tasks-board";

export const dynamic = "force-dynamic";

/**
 * `/app/tasks` — bảng kéo-thả cho việc (ADR-0012 mục 4 M13, mục 9 việc 5).
 * Dữ liệu đã đủ (activities type='task', cùng bảng với "Việc đang chờ" trên
 * hồ sơ khách/cơ hội) — trang này chỉ thêm CÁCH NHÌN kanban, không tạo cột
 * CSDL mới (D2). Cột xếp theo HẠN (quá hạn/hôm nay/sắp tới/đã xong) vì
 * activities không có cột "trạng thái" tự đặt, chỉ có due_at/done_at sẵn có —
 * dùng đúng dữ liệu đang có thay vì bịa thêm khái niệm.
 */
export default async function TasksPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) redirect("/onboarding");

  const [tasks, profilesRes] = await Promise.all([
    fetchTasks(supabase),
    // RLS profiles chỉ trả đồng nghiệp cùng tenant (cùng vốn từ deals/page.tsx)
    supabase.from("profiles").select("user_id, display_name"),
  ]);
  const memberNames = Object.fromEntries(
    (profilesRes.data ?? []).map((p) => [p.user_id, p.display_name]),
  );

  return (
    <TasksBoard
      currentUserId={user.id}
      memberNames={memberNames}
      tasks={tasks}
      todayVN={formatVN(nowVN(), "yyyy-MM-dd")}
    />
  );
}
