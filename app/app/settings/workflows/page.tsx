import { nowVN } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";
import {
  WorkflowsView,
  type RunRow,
  type WorkflowRow,
} from "./workflows-view";

export const dynamic = "force-dynamic";

const RECENT_RUNS = 20;
const STATS_DAYS = 7;

/**
 * Cài đặt → Quy trình tự động (Workflow Engine đợt 1, migration #15).
 * Chỉ owner/admin xem — staff thấy trạng thái không có quyền. Mở màn sẽ gọi
 * ensure_workflow_playbooks() để tenant tạo trước migration cũng có sẵn
 * 2 playbook, đúng mẫu ensure_deal_defaults() của màn Cơ hội.
 */
export default async function WorkflowsPage() {
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
  const canManage = member?.role === "owner" || member?.role === "admin";

  if (!canManage) {
    return <WorkflowsView canManage={false} workflows={[]} runs={[]} />;
  }

  await supabase.rpc("ensure_workflow_playbooks");

  // Trang force-dynamic: mốc thống kê tính lại mỗi request (giờ VN, lib/datetime)
  const since = new Date(nowVN().getTime() - STATS_DAYS * 86_400_000).toISOString();
  const [{ data: workflows }, { data: stats }, { data: recent }] = await Promise.all([
    supabase
      .from("workflows")
      .select("id, name, description, trigger_event, conditions, actions, is_active")
      .order("created_at"),
    // Đếm bằng COUNT trong CSDL (migration #34). Tải danh sách lượt chạy về rồi
    // đếm bằng .length thì PostgREST cắt ở 1000 dòng và con số đứng yên ở 1000
    // mà không báo gì — quy trình chạy nhiều nhất chính là quy trình bị sai.
    supabase.rpc("workflow_run_stats", { p_since: since }),
    supabase
      .from("workflow_runs")
      .select("id, status, last_error, created_at, workflows(name)")
      .order("created_at", { ascending: false })
      .limit(RECENT_RUNS),
  ]);

  const runStats = (stats ?? {}) as Record<
    string,
    { runs?: number; last_status?: string | null } | undefined
  >;

  const rows: WorkflowRow[] = (workflows ?? []).map((w) => ({
    id: w.id as string,
    name: w.name as string,
    description: (w.description as string | null) ?? null,
    triggerEvent: w.trigger_event as string,
    conditions: (w.conditions ?? {}) as Record<string, unknown>,
    actions: (w.actions ?? []) as Record<string, unknown>[],
    isActive: w.is_active as boolean,
    runs7d: runStats[w.id as string]?.runs ?? 0,
    lastStatus: runStats[w.id as string]?.last_status ?? null,
  }));

  const runRows: RunRow[] = (recent ?? []).map((r) => ({
    id: r.id as string,
    status: r.status as string,
    lastError: (r.last_error as string | null) ?? null,
    createdAt: r.created_at as string,
    workflowName:
      (r.workflows as { name?: string } | null)?.name ?? "",
  }));

  return <WorkflowsView canManage workflows={rows} runs={runRows} />;
}
