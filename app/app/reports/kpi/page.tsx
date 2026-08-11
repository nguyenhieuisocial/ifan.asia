import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { currentMonthVN, fetchKpiProgress, isMonthKey } from "@/lib/kpi";
import { KpiReportView } from "./kpi-view";

export const dynamic = "force-dynamic";

/** Báo cáo là số liệu CẢ TIỆM → chỉ quản lý trở lên (như reports/sources). */
const REPORT_ROLES = ["owner", "admin", "manager"];

/**
 * `/app/reports/kpi` — "Mục tiêu tháng" cả đội (hồ sơ KPI mục 9, phần 4):
 * mỗi người một hàng × 3 chỉ số, % đạt + nhãn nhịp; đổi mục tiêu giữa tháng
 * hiện ghi chú "đã đổi ngày N". Số đếm DB-side qua RPC kpi_progress()
 * (SECURITY INVOKER, migration #59) — cùng một đường code đếm với khối Hôm nay.
 */
export default async function KpiReportPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string | string[] }>;
}) {
  const sp = await searchParams; // Next 16: searchParams phải await
  const m = typeof sp.m === "string" ? sp.m : "";
  const initialMonth = isMonthKey(m) ? m : currentMonthVN();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .maybeSingle();
  if (!tenant) redirect("/onboarding");

  const member = await getCurrentMembership(supabase, user.id);
  const canView = REPORT_ROLES.includes(member?.role ?? "");
  if (!canView) return <KpiReportView canView={false} initialMonth={initialMonth} />;

  const [initialProgress, membersRes] = await Promise.all([
    fetchKpiProgress(supabase, initialMonth),
    supabase.from("tenant_members").select("user_id").eq("status", "active"),
  ]);

  // Tên hiển thị tra một lần cho mọi tháng client chuyển tới — người đã rời
  // tiệm nhưng còn mục tiêu tháng cũ sẽ rơi về "—" ở tầng view.
  const ids = (membersRes.data ?? []).map((r) => r.user_id as string);
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("user_id, display_name").in("user_id", ids)
    : { data: [] };
  const memberNames = Object.fromEntries(
    (profiles ?? []).map((p) => [p.user_id as string, p.display_name as string]),
  );

  return (
    <KpiReportView
      canView
      initialMonth={initialMonth}
      initialProgress={initialProgress}
      memberNames={memberNames}
    />
  );
}
