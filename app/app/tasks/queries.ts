import type { SupabaseClient } from "@supabase/supabase-js";
import type { TaskRow } from "./types";

const TASK_SELECT = `id, subject, body, owner_id, due_at, done_at, contact_id, deal_id,
  contacts(id, full_name), deals(id, title)`;

/** Trần việc CHƯA XONG tải 1 lần — tiệm 2-100 người hiếm khi vượt trần này cùng lúc. */
export const PENDING_TASK_LIMIT = 300;
/** Việc ĐÃ XONG chỉ lấy trong cửa sổ gần đây — cột "Đã xong" không phình vô hạn theo năm tháng. */
export const DONE_WINDOW_DAYS = 14;

/**
 * Toàn bộ việc (type='task') của bảng kéo-thả — RLS tự khoanh tenant + vai
 * (staff chỉ thấy việc mình phụ trách, cùng policy activities_select). Chưa
 * xong tải hết trong trần; đã xong chỉ lấy DONE_WINDOW_DAYS ngày qua.
 */
export async function fetchTasks(supabase: SupabaseClient): Promise<TaskRow[]> {
  const doneSince = new Date(Date.now() - DONE_WINDOW_DAYS * 86_400_000).toISOString();
  const [pendingRes, doneRes] = await Promise.all([
    supabase
      .from("activities")
      .select(TASK_SELECT)
      .eq("type", "task")
      .is("done_at", null)
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(PENDING_TASK_LIMIT),
    supabase
      .from("activities")
      .select(TASK_SELECT)
      .eq("type", "task")
      .not("done_at", "is", null)
      .gte("done_at", doneSince)
      .order("done_at", { ascending: false })
      .limit(PENDING_TASK_LIMIT),
  ]);
  if (pendingRes.error) throw new Error(pendingRes.error.message);
  if (doneRes.error) throw new Error(doneRes.error.message);
  return [
    ...(pendingRes.data ?? []),
    ...(doneRes.data ?? []),
  ] as unknown as TaskRow[];
}
