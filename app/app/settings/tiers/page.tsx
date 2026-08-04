import { createClient } from "@/lib/supabase/server";
import { TiersView, type TierRulesRow } from "./tiers-view";

export const dynamic = "force-dynamic";

/** Mặc định của migration #19 — tenant chưa có dòng cấu hình vẫn hiện đúng số đang áp dụng. */
const FALLBACK: TierRulesRow = {
  vipMinRevenue: 20_000_000,
  vipMinWonDeals: 5,
  regularMinWonDeals: 2,
  dormantAfterDays: 90,
};

/**
 * Cài đặt → Phân hạng khách (migration #19).
 * Chỉ owner/admin sửa được ngưỡng; nhân viên thấy trạng thái không có quyền.
 */
export default async function TiersPage() {
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
    return <TiersView canManage={false} rules={FALLBACK} counts={{}} />;
  }

  const [{ data: rules }, { data: contacts }] = await Promise.all([
    supabase
      .from("tier_rules")
      .select(
        "vip_min_revenue, vip_min_won_deals, regular_min_won_deals, dormant_after_days",
      )
      .maybeSingle(),
    // Số khách mỗi hạng: cho chủ tiệm thấy ngưỡng hiện tại đang chia tiệm ra sao
    supabase.from("contacts").select("tier").is("deleted_at", null),
  ]);

  const counts: Record<string, number> = {};
  for (const c of contacts ?? []) {
    const tier = c.tier as string;
    counts[tier] = (counts[tier] ?? 0) + 1;
  }

  return (
    <TiersView
      canManage
      rules={
        rules
          ? {
              vipMinRevenue: Number(rules.vip_min_revenue),
              vipMinWonDeals: Number(rules.vip_min_won_deals),
              regularMinWonDeals: Number(rules.regular_min_won_deals),
              dormantAfterDays: Number(rules.dormant_after_days),
            }
          : FALLBACK
      }
      counts={counts}
    />
  );
}
