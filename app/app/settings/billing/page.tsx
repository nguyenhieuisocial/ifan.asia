import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import type { BillingOverview, PlanRow } from "@/lib/billing/types";
import { BillingView } from "./billing-view";

export const dynamic = "force-dynamic";

/**
 * Cài đặt → Gói của tôi (migration #27).
 * Giá + hạn mức đọc thẳng từ bảng `plans` — không hard-code ở web để bảng giá
 * công khai và trong app không bao giờ lệch nhau.
 * Chỉ CHỦ tiệm đổi được gói.
 *
 * AI ĐƯỢC XEM: từ migration #41 chỉ chủ tiệm và quản trị viên. Ai không đủ vai
 * thì `billing_overview()` trả lỗi `forbidden` — và màn hình phải NÓI RÕ vì sao,
 * không được để màn trắng hay màn lỗi. Cờ `restricted` đọc từ CHÍNH câu trả lời
 * của CSDL chứ không chép lại luật vai ở web: chỉ có một nơi định nghĩa luật.
 */
export default async function BillingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: overview, error }, { data: plans }, member] =
    await Promise.all([
      supabase.rpc("billing_overview"),
      supabase
        .from("plans")
        .select("code, name_vi, name_en, price_month, price_year, limits")
        .eq("is_public", true)
        .order("sort"),
      getCurrentMembership(supabase, user?.id ?? ""),
    ]);

  return (
    <BillingView
      overview={(overview as BillingOverview | null) ?? null}
      plans={(plans as PlanRow[] | null) ?? []}
      canManage={member?.role === "owner"}
      restricted={(error?.message ?? "").includes("forbidden")}
    />
  );
}
