import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership, isSampleTourViewer } from "@/lib/auth/membership";
import { getCashSummary, listCashEntries } from "@/lib/finance/cash-ledger";
import { currentMonthVN, isMonthKey } from "@/lib/kpi";
import { monthKeyToRangeVN } from "@/lib/finance/gross-margin";
import { CashbookView } from "./cashbook-view";

export const dynamic = "force-dynamic";

const MANAGE_ROLES = ["owner", "admin", "manager"];

/**
 * Sổ quỹ (ADR-0019 mục 8 việc 6, thẻ design man-thu-chi.html — bản 06/08,
 * trước ADR-0019 nên khối "đối chiếu doanh thu"/liên kết Báo cáo nguồn khách
 * của thẻ KHÔNG áp dụng V3: doanh thu giờ đọc từ `orders`, không phải
 * `deals` thắng. Ba con số Thu/Chi/Còn lại + ghi sổ giữ nguyên tinh thần
 * thẻ). RLS `cash_entries_rw` chỉ owner/admin/manager — vai khác gặp
 * "không có quyền", KHÔNG màn trắng.
 *
 * `canManage` (SỬA) tách khỏi `canView` (XEM) từ việc #163: khách "Xem demo
 * nhanh" (`viewer` + `is_sample`) có `canView=true`/`canManage=false` — đọc
 * đủ 3 số + danh sách (RLS `cash_entries_select_sample_viewer`, migration
 * #141) nhưng không ghi sổ được.
 *
 * Điều hướng theo tháng (việc #162): dùng đúng khoá `?m=` của reports/kpi
 * (lib/kpi.ts) — không dựng thêm kiểu điều hướng theo kỳ thứ hai (D1). Danh
 * sách và 3 số tổng PHẢI cùng một [fromIso, toIso) — trước đây danh sách là
 * "200 dòng gần nhất" bất kể tháng trong khi 3 số tính theo tháng, ra đúng
 * lớp lỗi "số liệu đá nhau" (việc #18).
 */
export default async function CashbookPage({ searchParams }: { searchParams: Promise<{ m?: string | string[] }> }) {
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
  const canManage = MANAGE_ROLES.includes(member?.role ?? "");
  const canView = canManage || isSampleTourViewer(member?.role, tenant.is_sample);
  if (!canView) {
    return <CashbookView canManage={false} canView={false} monthKey={monthKey} entries={[]} summary={{ inVnd: 0, outVnd: 0, netVnd: 0 }} memberNames={{}} />;
  }

  const { fromIso, toIso } = monthKeyToRangeVN(monthKey);
  const [entries, summary, profilesRes] = await Promise.all([
    listCashEntries(supabase, fromIso, toIso),
    getCashSummary(supabase, fromIso, toIso),
    supabase.from("profiles").select("user_id, display_name"),
  ]);
  const memberNames = Object.fromEntries((profilesRes.data ?? []).map((p) => [p.user_id, p.display_name as string]));

  return <CashbookView canManage={canManage} canView={canView} monthKey={monthKey} entries={entries} summary={summary} memberNames={memberNames} />;
}
