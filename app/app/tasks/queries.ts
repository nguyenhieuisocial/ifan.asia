import type { SupabaseClient } from "@supabase/supabase-js";
import type { TaskRow } from "./types";

const TASK_SELECT = `id, subject, body, owner_id, due_at, done_at, contact_id, deal_id,
  project_id, contacts(id, full_name), deals(id, title), projects(id, name)`;

/** Trần việc CHƯA XONG tải 1 lần — tiệm 2-100 người hiếm khi vượt trần này cùng lúc. */
export const PENDING_TASK_LIMIT = 300;
/** Việc ĐÃ XONG chỉ lấy trong cửa sổ gần đây — cột "Đã xong" không phình vô hạn theo năm tháng. */
export const DONE_WINDOW_DAYS = 14;

/**
 * Toàn bộ việc (type='task') của bảng kéo-thả — RLS tự khoanh tenant + vai
 * (staff chỉ thấy việc mình phụ trách, cùng policy activities_select). Chưa
 * xong tải hết trong trần; đã xong chỉ lấy DONE_WINDOW_DAYS ngày qua.
 */
export async function fetchTasks(
  supabase: SupabaseClient,
  /**
   * Lọc theo MỘT dự án. Thông báo "dự án lùi ngày" (trigger ở migration #168)
   * trỏ tới `/app/tasks?project=<id>`; trước 19/08 màn này chưa biết đọc tham
   * số đó nên bấm vào ra TOÀN BỘ việc của tiệm — chủ tiệm nhận báo động rồi
   * vẫn phải tự đi tìm. Đúng loại "cảnh báo dẫn vào ngõ cụt" đã dập ở việc #20.
   */
  projectId?: string,
): Promise<TaskRow[]> {
  const doneSince = new Date(Date.now() - DONE_WINDOW_DAYS * 86_400_000).toISOString();

  let chuaXong = supabase
    .from("activities")
    .select(TASK_SELECT)
    .eq("type", "task")
    .is("done_at", null);
  if (projectId) chuaXong = chuaXong.eq("project_id", projectId);

  let daXong = supabase
    .from("activities")
    .select(TASK_SELECT)
    .eq("type", "task")
    .not("done_at", "is", null)
    .gte("done_at", doneSince);
  if (projectId) daXong = daXong.eq("project_id", projectId);

  const [pendingRes, doneRes] = await Promise.all([
    chuaXong.order("due_at", { ascending: true, nullsFirst: false }).limit(PENDING_TASK_LIMIT),
    daXong.order("done_at", { ascending: false }).limit(PENDING_TASK_LIMIT),
  ]);
  if (pendingRes.error) throw new Error(pendingRes.error.message);
  if (doneRes.error) throw new Error(doneRes.error.message);
  return [
    ...(pendingRes.data ?? []),
    ...(doneRes.data ?? []),
  ] as unknown as TaskRow[];
}
