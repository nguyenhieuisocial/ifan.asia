import { formatVN } from "@/lib/datetime";
import type { MemberNames } from "../contacts/types";

export type { MemberNames };

/**
 * Việc (activities.type = 'task') cho bảng /app/tasks. Cùng bảng CSDL với
 * "Việc đang chờ" trên hồ sơ khách/cơ hội (../contacts/pending-tasks.tsx) —
 * ADR-0012 mục 5/9 việc 5: dữ liệu đã đủ, đây chỉ là CÁCH NHÌN thứ hai (kanban)
 * bên cạnh danh sách đã có, không thêm cột CSDL nào (luật D2).
 */
export type TaskRow = {
  id: string;
  subject: string | null;
  body: string | null;
  owner_id: string;
  due_at: string | null;
  done_at: string | null;
  contact_id: string | null;
  deal_id: string | null;
  contacts: { id: string; full_name: string } | null;
  deals: { id: string; title: string } | null;
  // V8 Dự án (migration #168): việc dự án nằm CHUNG bảng này, không có bảng việc
  // thứ hai. Cần tên dự án ở đây để lọc theo dự án nói được "đang xem dự án nào".
  project_id: string | null;
  projects: { id: string; name: string } | null;
};

export type TaskColumn = "overdue" | "today" | "upcoming" | "done";
export const TASK_COLUMNS: TaskColumn[] = ["overdue", "today", "upcoming", "done"];

/** Tiêu đề thẻ: subject trước, không có thì lấy body (cùng vốn từ pending-tasks.tsx). */
export function taskTitle(task: TaskRow): string | null {
  return task.subject ?? task.body;
}

/**
 * Cột theo HẠN (không theo trạng thái tự đặt — activities không có cột status,
 * chỉ due_at/done_at). `todayVN` = ngày hôm nay giờ VN dạng "yyyy-MM-dd", tính
 * ở server (page.tsx) rồi truyền xuống — so sánh chuỗi ngày, không so mốc giờ,
 * để "hôm nay" đúng theo lịch VN bất kể máy khách ở múi giờ nào.
 */
export function taskColumn(task: TaskRow, todayVN: string): TaskColumn {
  if (task.done_at) return "done";
  if (!task.due_at) return "upcoming";
  const dueDateVN = formatVN(task.due_at, "yyyy-MM-dd");
  if (dueDateVN < todayVN) return "overdue";
  if (dueDateVN === todayVN) return "today";
  return "upcoming";
}
