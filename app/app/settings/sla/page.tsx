import { getTranslations } from "next-intl/server";
import { nowVN } from "@/lib/datetime";
import { seedLabel } from "@/lib/seed-i18n";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import {
  SlaView,
  type PolicyRow,
  type SlaEventRow,
  type SlaMember,
} from "./sla-view";

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
  const member = await getCurrentMembership(supabase, user?.id ?? "");
  const canManage = member?.role === "owner" || member?.role === "admin";

  if (!canManage) {
    return <SlaView canManage={false} policies={[]} events={[]} />;
  }

  await supabase.rpc("ensure_sla_policies");

  // Trang force-dynamic: mốc thống kê tính lại mỗi request (giờ VN, lib/datetime)
  const since = new Date(nowVN().getTime() - STATS_DAYS * 86_400_000).toISOString();
  const [
    { data: policies },
    { data: stats },
    { data: recent },
    { data: memberRows },
    { data: profiles },
  ] = await Promise.all([
    supabase
      .from("sla_policies")
      .select(
        "id, name, i18n_key, target_type, warn_after_minutes, breach_after_minutes, escalate_to, is_active",
      )
      .order("created_at"),
    // Số lần đã cảnh báo mỗi cam kết: COUNT chạy trong CSDL (migration #31).
    // Tải hết sla_events 7 ngày về rồi đếm sẽ SAI ÂM THẦM ở tiệm đông khách —
    // tầng đọc cắt ở 1000 dòng và không báo lỗi gì.
    supabase.rpc("sla_fired_counts", { p_since: since }),
    supabase
      .from("sla_events")
      .select(
        "id, level, target_type, elapsed_minutes, created_at, sla_policies(name, i18n_key)",
      )
      .order("created_at", { ascending: false })
      .limit(RECENT_EVENTS),
    // Người có thể nhận cảnh báo vi phạm — RLS chỉ trả thành viên cùng tenant
    supabase.from("tenant_members").select("user_id").eq("status", "active"),
    supabase.from("profiles").select("user_id, display_name"),
  ]);

  const fired7d = (stats ?? {}) as Record<string, number>;

  // Tên cam kết CÀI SẴN dịch được (migration #36). Cam kết chủ tiệm đã tự đặt
  // tên thì không có `i18n_key` → in đúng tên họ đặt, cả hai ngôn ngữ.
  const tSeed = await getTranslations("seed");

  const rows: PolicyRow[] = (policies ?? []).map((p) => ({
    id: p.id as string,
    name: seedLabel(p.i18n_key as string | null, p.name as string, tSeed),
    targetType: p.target_type as string,
    warnAfterMinutes: p.warn_after_minutes as number,
    breachAfterMinutes: p.breach_after_minutes as number,
    escalateTo: p.escalate_to as string,
    isActive: p.is_active as boolean,
    fired7d: fired7d[p.id as string] ?? 0,
  }));

  const eventRows: SlaEventRow[] = (recent ?? []).map((e) => ({
    id: e.id as string,
    level: e.level as string,
    targetType: e.target_type as string,
    elapsedMinutes: e.elapsed_minutes as number,
    createdAt: e.created_at as string,
    policyName: seedLabel(
      (e.sla_policies as { i18n_key?: string | null } | null)?.i18n_key ?? null,
      (e.sla_policies as { name?: string } | null)?.name ?? "",
      tSeed,
    ),
  }));

  const displayNames = new Map(
    (profiles ?? []).map((p) => [p.user_id as string, p.display_name as string]),
  );
  const tOwner = await getTranslations("contacts.owner");
  const memberOptions: SlaMember[] = (memberRows ?? []).map((m) => {
    const userId = m.user_id as string;
    return {
      userId,
      // Chưa đặt tên hiển thị → nhãn "NV {id}" dùng chung với màn Khách hàng
      name: displayNames.get(userId) ?? tOwner("member", { id: userId.slice(0, 8) }),
    };
  });

  return (
    <SlaView canManage policies={rows} events={eventRows} members={memberOptions} />
  );
}
