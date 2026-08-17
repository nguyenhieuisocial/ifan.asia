import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { getCashSummary, listCashEntries } from "@/lib/finance/cash-ledger";
import { monthRangeVN } from "@/lib/datetime";
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
 */
export default async function CashbookPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) redirect("/onboarding");

  const member = await getCurrentMembership(supabase, user.id);
  const canManage = MANAGE_ROLES.includes(member?.role ?? "");
  if (!canManage) return <CashbookView canManage={false} entries={[]} summary={{ inVnd: 0, outVnd: 0, netVnd: 0 }} memberNames={{}} />;

  const { fromIso, toIso } = monthRangeVN();
  const [entries, summary, profilesRes] = await Promise.all([
    listCashEntries(supabase),
    getCashSummary(supabase, fromIso, toIso),
    supabase.from("profiles").select("user_id, display_name"),
  ]);
  const memberNames = Object.fromEntries((profilesRes.data ?? []).map((p) => [p.user_id, p.display_name as string]));

  return <CashbookView canManage={canManage} entries={entries} summary={summary} memberNames={memberNames} />;
}
