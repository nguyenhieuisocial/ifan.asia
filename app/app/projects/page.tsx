import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { formatVN, nowVN } from "@/lib/datetime";
import {
  PROJECT_LIMIT,
  PROJECT_TASK_SCAN_LIMIT,
  fetchProjects,
  fetchSpentByProject,
  fetchTasksOfAllProjects,
  seesAllTasks,
  seesMoney,
} from "./queries";
import { projectProgress, type ProjectTask } from "./types";
import { ProjectsView, type ProjectSummary } from "./projects-view";

export const dynamic = "force-dynamic";

/**
 * `/app/projects` — danh sách dự án (thẻ `man-du-an.html`, migration #168).
 *
 * Việc dự án dùng lại bảng `activities` (điểm 1 của migration) nên tiến độ ở
 * đây đếm từ đúng những việc đang nằm trong danh sách việc hằng ngày của nhân
 * viên — không có bảng thứ hai để lệch.
 */
export default async function ProjectsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) redirect("/onboarding");

  const member = await getCurrentMembership(supabase, user.id);
  const role = member?.role ?? "";
  // Cùng danh sách vai với RLS `projects_manage` (migration #168 mục 7).
  const canManage = role === "owner" || role === "admin" || role === "manager";
  const canSeeMoney = seesMoney(role);

  const [{ rows: projects, atLimit: projectsAtLimit }, tasksRes, spentByProject] =
    await Promise.all([
      fetchProjects(supabase),
      fetchTasksOfAllProjects(supabase),
      // `cash_entries` chỉ owner/admin/manager đọc được — vai khác hỏi là chắc
      // chắn lỗi, nên không hỏi (D2: không dựng lớp kiểm thứ hai, chỉ không gọi).
      canSeeMoney
        ? fetchSpentByProject(supabase)
        : Promise.resolve({} as Record<string, number>),
    ]);

  const tasksByProject = new Map<string, ProjectTask[]>();
  for (const row of tasksRes.rows) {
    const list = tasksByProject.get(row.project_id) ?? [];
    list.push(row);
    tasksByProject.set(row.project_id, list);
  }

  const summaries: ProjectSummary[] = projects.map((project) => ({
    project,
    progress: projectProgress(tasksByProject.get(project.id) ?? []),
    spentVnd: canSeeMoney ? (spentByProject[project.id] ?? 0) : null,
  }));

  return (
    <ProjectsView
      summaries={summaries}
      canManage={canManage}
      todayVN={formatVN(nowVN(), "yyyy-MM-dd")}
      projectsAtLimit={projectsAtLimit}
      projectLimit={PROJECT_LIMIT}
      tasksAtLimit={tasksRes.atLimit}
      taskScanLimit={PROJECT_TASK_SCAN_LIMIT}
      partialTaskScope={!seesAllTasks(role)}
    />
  );
}
