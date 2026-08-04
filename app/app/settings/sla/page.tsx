import { nowVN } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";
import { SlaView, type PolicyRow, type SlaEventRow } from "./sla-view";

export const dynamic = "force-dynamic";

const RECENT_EVENTS = 20;
const STATS_DAYS = 7;

/**
 * Cài đặt → Cam kết phản hồi (SLA engine đợt 1, migration #17).
 * Chỉ owner/admin xem — staff thấy trạng thái không có quyền. Mở màn sẽ gọi
 * ensure_sla_policies() để tenant tạo trước migration cũng có sẵn 2 chính sách,
 * đúng mẫu ensure_workflow_playbooks() của màn Quy trình.
 */
export default async function SlaPage() {
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
    return <SlaView canManage={false} policies={[]} events={[]} />;
  }

  await supabase.rpc("ensure_sla_policies");

  // Trang force-dynamic: mốc thống kê tính lại mỗi request (giờ VN, lib/datetime)
  const since = new Date(nowVN().getTime() - STATS_DAYS * 86_400_000).toISOString();
  const [{ data: policies }, { data: stats }, { data: recent }] = await Promise.all([
    supabase
      .from("sla_policies")
      .select(
        "id, name, target_type, warn_after_minutes, breach_after_minutes, escalate_to, is_active",
      )
      .order("created_at"),
    supabase
      .from("sla_events")
      .select("policy_id")
      .gte("created_at", since),
    supabase
      .from("sla_events")
      .select("id, level, target_type, elapsed_minutes, created_at, sla_policies(name)")
      .order("created_at", { ascending: false })
      .limit(RECENT_EVENTS),
  ]);

  const fired7d = new Map<string, number>();
  for (const e of stats ?? []) {
    const id = e.policy_id as string;
    fired7d.set(id, (fired7d.get(id) ?? 0) + 1);
  }

  const rows: PolicyRow[] = (policies ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    targetType: p.target_type as string,
    warnAfterMinutes: p.warn_after_minutes as number,
    breachAfterMinutes: p.breach_after_minutes as number,
    escalateTo: p.escalate_to as string,
    isActive: p.is_active as boolean,
    fired7d: fired7d.get(p.id as string) ?? 0,
  }));

  const eventRows: SlaEventRow[] = (recent ?? []).map((e) => ({
    id: e.id as string,
    level: e.level as string,
    targetType: e.target_type as string,
    elapsedMinutes: e.elapsed_minutes as number,
    createdAt: e.created_at as string,
    policyName: (e.sla_policies as { name?: string } | null)?.name ?? "",
  }));

  return <SlaView canManage policies={rows} events={eventRows} />;
}
