import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership, isSampleTourViewer } from "@/lib/auth/membership";
import { currentMonthVN, isMonthKey } from "@/lib/kpi";
import { getGrossMarginByItem, monthKeyToRangeVN } from "@/lib/finance/gross-margin";
import { GrossMarginView } from "./gross-margin-view";

export const dynamic = "force-dynamic";

/** Báo cáo lãi gộp lộ giá vốn — cùng nhóm quyền với sổ quỹ/giá vốn (owner/admin/manager). */
const REPORT_ROLES = ["owner", "admin", "manager"];

/**
 * `/app/reports/gross-margin` — vế "biết lời lỗ" của V3 (ADR-0019 mục 8 việc
 * 7). Dùng lại đúng khoá tháng `?m=` của reports/kpi (lib/kpi.ts) — không
 * dựng thêm một kiểu điều hướng theo kỳ thứ hai (D1).
 */
export default async function GrossMarginReportPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string | string[] }>;
}) {
  const sp = await searchParams;
  const m = typeof sp.m === "string" ? sp.m : "";
  const monthKey = isMonthKey(m) ? m : currentMonthVN();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tenant } = await supabase.from("tenants").select("id, is_sample").maybeSingle();
  if (!tenant) redirect("/onboarding");

  const member = await getCurrentMembership(supabase, user.id);
  // Việc #163: khách "Xem demo nhanh" (viewer + is_sample) đọc được báo cáo
  // như đang tour cùng chủ tiệm — RLS order_line_costs_select_sample_viewer
  // (migration #141) mở đúng tổ hợp này, viewer thật ở tiệm thật không đổi gì.
  const canView = REPORT_ROLES.includes(member?.role ?? "") || isSampleTourViewer(member?.role, tenant.is_sample);
  if (!canView) return <GrossMarginView canView={false} monthKey={monthKey} rows={[]} summary={{ revenueVnd: 0, costVnd: 0, marginVnd: 0, missingCostItemCount: 0 }} />;

  const { fromIso, toIso } = monthKeyToRangeVN(monthKey);
  const { rows, summary } = await getGrossMarginByItem(supabase, fromIso, toIso);

  return <GrossMarginView canView={canView} monthKey={monthKey} rows={rows} summary={summary} />;
}
