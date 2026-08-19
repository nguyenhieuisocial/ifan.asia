import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProjectCost, ProjectRow, ProjectTask, TaskBlockRow } from "./types";

/**
 * Đọc dữ liệu cho màn Dự án. Mọi truy vấn đi qua RLS của người đang đăng nhập —
 * KHÔNG có đường vòng service-role ở đây, nên nhân viên chỉ thấy đúng phần
 * mình được thấy (xem ghi chú `TASK_SCOPE_NOTE` bên dưới).
 */

/** Trần danh sách dự án tải một lần — tiệm nhỏ hiếm khi có quá 100 dự án cùng lúc. */
export const PROJECT_LIMIT = 100;
/** Trần việc quét cho MÀN DANH SÁCH (đếm tiến độ nhiều dự án cùng lúc). */
export const PROJECT_TASK_SCAN_LIMIT = 1_000;
/** Trần việc của MỘT dự án ở màn chi tiết. */
export const PROJECT_TASK_LIMIT = 500;
/** Trần khoản chi hiện trong khối "Tiền đã tiêu". */
export const PROJECT_COST_LIMIT = 200;

const PROJECT_SELECT =
  "id, name, description, started_on, due_on, due_on_baseline, budget_vnd, status";
const TASK_SELECT = "id, subject, body, owner_id, due_at, done_at, started_at";

/**
 * ⚠️ VAI `staff` CHỈ THẤY VIỆC CỦA CHÍNH MÌNH (policy `activities_select`,
 * migration #65). Nghĩa là số "x/y việc xong" mà nhân viên đọc được là phần
 * của họ, không phải của cả dự án. Màn hình PHẢI nói ra điều đó
 * (`projects.detail.partialScopeNote`) chứ không im lặng cho người ta tưởng
 * dự án chỉ có bấy nhiêu việc.
 */
export function seesAllTasks(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin" || role === "manager" || role === "viewer";
}

/** Vai đọc/ghi được sổ quỹ (policy `cash_entries_rw`) — cũng là vai thấy khối tiền. */
export function seesMoney(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin" || role === "manager";
}

export async function fetchProjects(
  supabase: SupabaseClient,
): Promise<{ rows: ProjectRow[]; atLimit: boolean }> {
  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_SELECT)
    .order("status", { ascending: true })
    .order("due_on", { ascending: true, nullsFirst: false })
    .limit(PROJECT_LIMIT);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as ProjectRow[];
  return { rows, atLimit: rows.length >= PROJECT_LIMIT };
}

export async function fetchProject(
  supabase: SupabaseClient,
  id: string,
): Promise<ProjectRow | null> {
  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as ProjectRow) ?? null;
}

/** Việc của MỌI dự án (màn danh sách) — chỉ lấy đúng cột cần để đếm tiến độ. */
export async function fetchTasksOfAllProjects(
  supabase: SupabaseClient,
): Promise<{ rows: (ProjectTask & { project_id: string })[]; atLimit: boolean }> {
  const { data, error } = await supabase
    .from("activities")
    .select(`${TASK_SELECT}, project_id`)
    .eq("type", "task")
    .not("project_id", "is", null)
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(PROJECT_TASK_SCAN_LIMIT);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as (ProjectTask & { project_id: string })[];
  return { rows, atLimit: rows.length >= PROJECT_TASK_SCAN_LIMIT };
}

export async function fetchProjectTasks(
  supabase: SupabaseClient,
  projectId: string,
): Promise<{ rows: ProjectTask[]; atLimit: boolean }> {
  const { data, error } = await supabase
    .from("activities")
    .select(TASK_SELECT)
    .eq("type", "task")
    .eq("project_id", projectId)
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(PROJECT_TASK_LIMIT);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as ProjectTask[];
  return { rows, atLimit: rows.length >= PROJECT_TASK_LIMIT };
}

/**
 * Dòng "việc chặn việc" liên quan tới danh sách việc đưa vào. Hỏi hai chiều rồi
 * gộp — `.in()` hai lần rẻ hơn và chắc hơn `.or()` với chuỗi id nối tay.
 */
export async function fetchTaskBlocks(
  supabase: SupabaseClient,
  taskIds: string[],
): Promise<TaskBlockRow[]> {
  if (taskIds.length === 0) return [];
  const select = "id, blocker_id, blocked_id";
  const [asBlocker, asBlocked] = await Promise.all([
    supabase.from("task_blocks").select(select).in("blocker_id", taskIds),
    supabase.from("task_blocks").select(select).in("blocked_id", taskIds),
  ]);
  if (asBlocker.error) throw new Error(asBlocker.error.message);
  if (asBlocked.error) throw new Error(asBlocked.error.message);
  const merged = new Map<string, TaskBlockRow>();
  for (const row of [...(asBlocker.data ?? []), ...(asBlocked.data ?? [])]) {
    merged.set((row as TaskBlockRow).id, row as TaskBlockRow);
  }
  return [...merged.values()];
}

/**
 * Chi phí dự án = PHIẾU CHI THẬT trong sổ quỹ gắn nhãn dự án (migration #168
 * điểm 2 — cố ý không có bảng chi phí riêng). Chỉ chiều `out`: tiền thu về
 * (hoàn cọc chẳng hạn) không phải khoản đã tiêu.
 */
export async function fetchProjectCosts(
  supabase: SupabaseClient,
  projectId: string,
): Promise<{ rows: ProjectCost[]; atLimit: boolean }> {
  const { data, error } = await supabase
    .from("cash_entries")
    .select("id, amount_vnd, category, note, created_at")
    .eq("project_id", projectId)
    .eq("direction", "out")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(PROJECT_COST_LIMIT);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as ProjectCost[];
  return { rows, atLimit: rows.length >= PROJECT_COST_LIMIT };
}

/** Tổng đã tiêu của MỌI dự án (màn danh sách) — trả map projectId → số tiền. */
export async function fetchSpentByProject(
  supabase: SupabaseClient,
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("cash_entries")
    .select("project_id, amount_vnd")
    .not("project_id", "is", null)
    .eq("direction", "out")
    .is("deleted_at", null)
    .limit(5_000);
  if (error) throw new Error(error.message);
  const out: Record<string, number> = {};
  for (const row of (data ?? []) as { project_id: string; amount_vnd: number }[]) {
    out[row.project_id] = (out[row.project_id] ?? 0) + Number(row.amount_vnd);
  }
  return out;
}
