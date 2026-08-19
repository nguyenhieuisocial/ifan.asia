import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { LoyaltyView } from "./loyalty-view";
import { layLuatTichDiem, layTongNoDiem, layVouchers } from "./queries";
import type { LoyaltyDebt, LoyaltyRules, VoucherRow } from "./types";

export const dynamic = "force-dynamic";

/**
 * Ai VÀO được màn này. Nhân viên phải tra được mã giảm giá và nói được luật tích
 * điểm cho khách đang đứng trước mặt — nên họ XEM được. Vai Chỉ xem không bán
 * hàng nên không cần, và RLS cũng chỉ mở phần đọc chứ không mở phần ghi.
 */
const VIEW_ROLES = ["owner", "admin", "manager", "staff"];
/** Mã giảm giá là chỗ mất tiền ⇒ chỉ quản lý trở lên tạo/dừng (khớp RLS vouchers_manage). */
const VOUCHER_ROLES = ["owner", "admin", "manager"];
/** Đổi tỉ lệ tích điểm là đổi món NỢ của cả tiệm ⇒ chỉ chủ/quản trị (khớp RLS loyalty_config_manage). */
const RULES_ROLES = ["owner", "admin"];

export async function generateMetadata() {
  const t = await getTranslations("loyalty");
  return { title: t("title") };
}

export default async function LoyaltyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const member = await getCurrentMembership(supabase, user.id);
  const role = member?.role ?? "";
  if (!VIEW_ROLES.includes(role)) redirect("/app");

  let loadFailed = false;
  let vouchers: VoucherRow[] = [];
  let rules: LoyaltyRules = {
    isActive: false,
    vndPerPoint: 10000,
    redeemPointsUnit: 1000,
    redeemValueVnd: 100000,
    referralPoints: 200,
    expireMonths: 12,
  };
  let debt: LoyaltyDebt | null = null;

  try {
    [vouchers, rules, debt] = await Promise.all([
      layVouchers(supabase),
      layLuatTichDiem(supabase),
      layTongNoDiem(supabase),
    ]);
  } catch {
    // Tải hỏng thì NÓI RA, không hiện danh sách rỗng như thể tiệm chưa có mã nào
    // — người dùng sẽ tưởng mất dữ liệu và đi tạo lại.
    loadFailed = true;
  }

  return (
    <LoyaltyView
      vouchers={vouchers}
      rules={rules}
      debt={debt}
      canManageVouchers={VOUCHER_ROLES.includes(role)}
      canManageRules={RULES_ROLES.includes(role)}
      loadFailed={loadFailed}
    />
  );
}
