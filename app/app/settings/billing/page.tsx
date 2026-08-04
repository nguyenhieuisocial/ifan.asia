import { createClient } from "@/lib/supabase/server";
import type { BillingOverview, PlanRow } from "@/lib/billing/types";
import { BillingView } from "./billing-view";

export const dynamic = "force-dynamic";

/**
 * Cài đặt → Gói của tôi (migration #27).
 * Giá + hạn mức đọc thẳng từ bảng `plans` — không hard-code ở web để bảng giá
 * công khai và trong app không bao giờ lệch nhau.
 * Chỉ CHỦ tiệm đổi được gói; người khác vẫn xem được tình trạng.
 */
export default async function BillingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: overview }, { data: plans }, { data: member }] =
    await Promise.all([
      supabase.rpc("billing_overview"),
      supabase
        .from("plans")
        .select("code, name_vi, name_en, price_month, price_year, limits")
        .eq("is_public", true)
        .order("sort"),
      supabase
        .from("tenant_members")
        .select("role")
        .eq("user_id", user?.id ?? "")
        .maybeSingle(),
    ]);

  return (
    <BillingView
      overview={(overview as BillingOverview | null) ?? null}
      plans={(plans as PlanRow[] | null) ?? []}
      canManage={member?.role === "owner"}
    />
  );
}
