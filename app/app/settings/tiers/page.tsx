import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
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
  const member = await getCurrentMembership(supabase, user?.id ?? "");
  const canManage = member?.role === "owner" || member?.role === "admin";

  if (!canManage) {
    return <TiersView canManage={false} rules={FALLBACK} counts={{}} />;
  }

  const [{ data: rules }, { data: tierCounts }] = await Promise.all([
    supabase
      .from("tier_rules")
      .select(
        "vip_min_revenue, vip_min_won_deals, regular_min_won_deals, dormant_after_days",
      )
      .maybeSingle(),
    // Số khách mỗi hạng: cho chủ tiệm thấy ngưỡng hiện tại đang chia tiệm ra sao.
    // COUNT chạy trong CSDL (migration #31) — tải cả bảng về đếm sẽ SAI ÂM THẦM
    // từ khách thứ 1001 trở đi vì tầng đọc cắt ở 1000 dòng.
    supabase.rpc("contact_tier_counts"),
  ]);

  const counts = (tierCounts ?? {}) as Record<string, number>;

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
