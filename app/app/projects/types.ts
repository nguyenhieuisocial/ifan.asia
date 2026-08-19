import { formatVN } from "@/lib/datetime";

/**
 * Kiểu + phép tính cho màn Dự án (thẻ design `man-du-an.html`, migration #168).
 *
 * Không có bảng việc riêng: việc dự án là `activities` gắn `project_id` (điểm 1
 * của migration). Mọi phép đếm ở đây đọc đúng ba mốc thời gian có sẵn —
 * `started_at` / `done_at` / `due_at` — không suy ra từ cột trạng thái nào cả,
 * vì cột đó cố ý không tồn tại.
 */

export type ProjectStatus = "active" | "done" | "cancelled";
export const PROJECT_STATUSES: ProjectStatus[] = ["active", "done", "cancelled"];

export type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  started_on: string;
  /** DO TRIGGER TÍNH từ hạn việc trễ nhất — không phải ô gõ tay (migration #168 điểm 3). */
  due_on: string | null;
  due_on_baseline: string | null;
  budget_vnd: number;
  status: ProjectStatus;
};

export type ProjectTask = {
  id: string;
  subject: string | null;
  body: string | null;
  owner_id: string;
  due_at: string | null;
  done_at: string | null;
  started_at: string | null;
};

export type TaskBlockRow = {
  id: string;
  blocker_id: string;
  blocked_id: string;
};

export type ProjectCost = {
  id: string;
  amount_vnd: number;
  category: string;
  note: string | null;
  created_at: string;
};

/** Ba trạng thái việc SUY RA từ mốc thời gian (migration #168 mục 2 — không có cột status). */
export type TaskState = "todo" | "doing" | "done";

export function taskState(task: ProjectTask): TaskState {
  if (task.done_at) return "done";
  return task.started_at ? "doing" : "todo";
}

/** Tiêu đề việc: subject trước, không có thì lấy body (cùng vốn từ /app/tasks). */
export function taskTitle(task: ProjectTask): string | null {
  return task.subject ?? task.body;
}

export type ProjectProgress = {
  total: number;
  done: number;
  doing: number;
  todo: number;
  /** 0–100, làm tròn. Dự án chưa có việc nào ⇒ 0 (không phải 100). */
  percent: number;
};

export function projectProgress(tasks: ProjectTask[]): ProjectProgress {
  let done = 0;
  let doing = 0;
  for (const task of tasks) {
    const state = taskState(task);
    if (state === "done") done++;
    else if (state === "doing") doing++;
  }
  const total = tasks.length;
  return {
    total,
    done,
    doing,
    todo: total - done - doing,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

/** Khoá ngày theo giờ VN của một mốc thời gian (dùng để so ngày, không so giờ). */
export function dayKeyVN(at: string): string {
  return formatVN(at, "yyyy-MM-dd");
}

/**
 * Số ngày giữa hai khoá ngày "yyyy-MM-dd" (b − a). So bằng UTC của đúng ngày đó
 * nên không dính lệch múi giờ hay giờ mùa hè.
 */
export function daysBetween(fromKey: string, toKey: string): number {
  const parse = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
  };
  return Math.round((parse(toKey) - parse(fromKey)) / 86_400_000);
}

/** Việc chưa xong và đã quá hạn ⇒ trễ bao nhiêu ngày (0 nếu chưa trễ / không hạn). */
export function taskOverdueDays(task: ProjectTask, todayVN: string): number {
  if (task.done_at || !task.due_at) return 0;
  const diff = daysBetween(dayKeyVN(task.due_at), todayVN);
  return diff > 0 ? diff : 0;
}

/** Ngưỡng "việc kẹt": trễ quá 7 ngày mà CHƯA AI ĐỤNG VÀO (thẻ: đúng 2 loại cảnh báo). */
export const STUCK_TASK_DAYS = 7;
/** Ngưỡng cảnh báo tiền: tiêu quá 80% dự trù mà việc mới xong dưới 50%. */
export const BUDGET_ALERT_SPENT_PERCENT = 80;
export const BUDGET_ALERT_DONE_PERCENT = 50;

export type ProjectAlerts = {
  /** Tiêu 80% dự trù mà mới xong dưới 50% việc — kiểu này về đích là vượt ngân sách. */
  budgetAhead: boolean;
  /** Việc trễ quá 7 ngày mà started_at vẫn null. */
  stuckTasks: ProjectTask[];
};

export function projectAlerts(
  tasks: ProjectTask[],
  progress: ProjectProgress,
  spentVnd: number | null,
  budgetVnd: number,
  todayVN: string,
): ProjectAlerts {
  const spentPercent =
    spentVnd !== null && budgetVnd > 0 ? Math.round((spentVnd / budgetVnd) * 100) : null;
  return {
    budgetAhead:
      spentPercent !== null &&
      spentPercent >= BUDGET_ALERT_SPENT_PERCENT &&
      progress.percent < BUDGET_ALERT_DONE_PERCENT,
    stuckTasks: tasks.filter(
      (task) => task.started_at === null && taskOverdueDays(task, todayVN) > STUCK_TASK_DAYS,
    ),
  };
}

/**
 * Việc đang CHẶN việc khác và bản thân chưa xong — thứ duy nhất thẻ đòi hiện ra
 * khi mở dự án ("màn này không liệt kê 26 việc").
 */
export type Blocker = {
  task: ProjectTask;
  /** Những việc đang phải chờ nó. */
  blocked: ProjectTask[];
};

export function findBlockers(
  tasks: ProjectTask[],
  blocks: TaskBlockRow[],
): Blocker[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const grouped = new Map<string, ProjectTask[]>();
  for (const block of blocks) {
    const blocker = byId.get(block.blocker_id);
    const blocked = byId.get(block.blocked_id);
    if (!blocker || !blocked || blocker.done_at) continue; // việc chặn đã xong thì hết chặn
    const list = grouped.get(block.blocker_id) ?? [];
    list.push(blocked);
    grouped.set(block.blocker_id, list);
  }
  return [...grouped.entries()]
    .map(([id, blocked]) => ({ task: byId.get(id)!, blocked }))
    .sort((a, b) => b.blocked.length - a.blocked.length);
}

/** Việc nào đang bị chặn ⇒ id việc chặn nó (một tầng, nên nhiều nhất vẫn là danh sách ngắn). */
export function blockedBy(blocks: TaskBlockRow[], tasks: ProjectTask[]): Map<string, ProjectTask[]> {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const out = new Map<string, ProjectTask[]>();
  for (const block of blocks) {
    const blocker = byId.get(block.blocker_id);
    if (!blocker || blocker.done_at) continue;
    const list = out.get(block.blocked_id) ?? [];
    list.push(blocker);
    out.set(block.blocked_id, list);
  }
  return out;
}
