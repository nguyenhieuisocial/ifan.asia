import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { formatVN, nowVN } from "@/lib/datetime";
import { buildMemberOptions } from "../deals/types";
import { fetchDealPermissions } from "../deals/queries";
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
export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const supabase = await createClient();
  // Thông báo "dự án lùi ngày" (trigger migration #168) trỏ tới
  // `/app/tasks?project=<id>`. Không đọc tham số này thì cảnh báo dẫn vào ngõ
  // cụt — chủ tiệm bấm vào ra TOÀN BỘ việc của tiệm rồi phải tự đi tìm.
  const { project: duAnId } = await searchParams;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) redirect("/onboarding");

  const [tasks, profilesRes, duAnRes, member, permissions] = await Promise.all([
    fetchTasks(supabase, duAnId),
    // RLS profiles chỉ trả đồng nghiệp cùng tenant (cùng vốn từ deals/page.tsx)
    supabase.from("profiles").select("user_id, display_name"),
    // Tên dự án để băng-rôn nói được "đang xem việc của dự án NÀO" thay vì chỉ
    // dán mã. RLS lo phần tiệm; dự án không tồn tại thì băng-rôn không hiện.
    duAnId
      ? supabase.from("projects").select("id, name").eq("id", duAnId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    // Vai để quyết có hiện Sửa/Xoá trên thẻ việc hay không — khớp ĐÚNG điều
    // kiện RLS `activities_update`/`activities_delete`: mọi vai TRỪ Chỉ xem.
    // Chốt chặn thật vẫn ở RLS; đây chỉ là lớp không dẫn người ta vào ngõ cụt.
    getCurrentMembership(supabase, user.id),
    // Danh sách người CÒN trong tiệm + "có được gán cho người khác không" — ô
    // người chịu trách nhiệm của cửa sổ Sửa cần cả hai. Màn Dự án đã nhận sẵn
    // hai thứ này từ lâu; bảng Công việc thì chưa, nên trước đợt này cửa sổ Sửa
    // mở từ đây không có cách nào bày ra ô đó.
    fetchDealPermissions(supabase, user.id),
  ]);
  const memberNames = Object.fromEntries(
    (profilesRes.data ?? []).map((p) => [p.user_id, p.display_name]),
  );
  const tOwner = await getTranslations("contacts.owner");

  return (
    <TasksBoard
      projectFilter={duAnRes.data ? { id: duAnRes.data.id, name: duAnRes.data.name } : null}
      currentUserId={user.id}
      memberNames={memberNames}
      tasks={tasks}
      todayVN={formatVN(nowVN(), "yyyy-MM-dd")}
      canWrite={member?.role !== "viewer"}
      members={buildMemberOptions(permissions.memberIds, memberNames, user.id, tOwner)}
      canAssignOthers={permissions.canAssignOthers}
    />
  );
}
