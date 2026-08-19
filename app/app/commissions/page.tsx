import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { currentMonthVN, isMonthKey } from "@/lib/kpi";
import CommissionsView from "./commissions-view";
import { layDuLieuHoaHong, type CommissionData } from "./queries";

export const dynamic = "force-dynamic";

/**
 * Ai VÀO được màn Hoa hồng — bảng "Ai xem được gì" của thẻ man-hoa-hong.html.
 *
 * ĐỌC: MỌI vai trong tiệm. Nhân viên vào để xem PHẦN CỦA MÌNH — quyết định 4 của
 * thẻ ("cho họ tự tra là hết chuyện"). Họ không thấy của người khác, và điều đó
 * do RLS `commission_select` (#167) lo, không do màn này lọc.
 * XEM CẢ ĐỘI: quản lý trở lên — khớp `commission_select` nhánh vai.
 * ĐẶT TỈ LỆ: chủ tiệm — khớp `commission_rates_manage` (#180). Danh sách ở đây
 * PHẢI khớp policy đó; đổi một bên mà quên bên kia là màn hình nói một đằng,
 * CSDL một nẻo.
 */
const TEAM_ROLES = ["owner", "admin", "manager"];
const RATE_ROLES = ["owner", "admin"];

export async function generateMetadata() {
  const t = await getTranslations("commissions");
  return { title: t("title") };
}

export default async function CommissionsPage({
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

  // ⚠️ KHÔNG tự viết `.from("tenant_members").select("role").maybeSingle()` —
  // truy vấn đó không lọc user_id (cổng scripts/soat-doc-vai.mjs).
  const member = await getCurrentMembership(supabase, user.id);
  if (!member) redirect("/app");
  const role = member.role ?? "";
  const canSeeTeam = TEAM_ROLES.includes(role);
  const canSetRates = RATE_ROLES.includes(role);

  let loadFailed = false;
  let data: CommissionData = {
    rates: [],
    chuaAiChonTiLe: false,
    entries: [],
    totals: [],
    warnings: { pendingOrders: 0, ordersWithoutCommission: 0, scanTruncated: false },
    truncated: false,
  };
  // "Tạm tính" hay "đã chốt": mốc thật là KỲ LƯƠNG đã chốt hay chưa — đó là lúc
  // tiền thật sự đứng yên (#167 khoá phiếu lương sau khi chốt). CỐ Ý không dựng
  // một khoá chốt-hoa-hồng riêng; xem điểm (4) đầu migration #180.
  // `payroll_periods` chỉ owner/admin đọc được ⇒ vai khác luôn thấy "tạm tính",
  // và với họ điều đó ĐÚNG: phần của họ chỉ chắc chắn khi phiếu lương phát ra.
  let payrollClosed = false;

  try {
    data = await layDuLieuHoaHong(supabase, monthKey, { canSeeTeam });
    if (RATE_ROLES.includes(role)) {
      const { data: ky } = await supabase
        .from("payroll_periods")
        .select("status")
        .eq("period", monthKey)
        .maybeSingle();
      payrollClosed = ky?.status === "closed";
    }
  } catch {
    // Danh sách rỗng nghĩa là "tháng này chưa có khoản nào". Để lỗi mạng đội lốt
    // câu đó là đẩy chủ tiệm đi tìm lỗi ở chỗ không có lỗi.
    loadFailed = true;
  }

  return (
    <CommissionsView
      monthKey={monthKey}
      canSeeTeam={canSeeTeam}
      canSetRates={canSetRates}
      payrollClosed={payrollClosed}
      rates={data.rates}
      chuaAiChonTiLe={data.chuaAiChonTiLe}
      totals={data.totals}
      warnings={data.warnings}
      truncated={data.truncated}
      loadFailed={loadFailed}
    />
  );
}
