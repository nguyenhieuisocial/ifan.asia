import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { seedLabel } from "@/lib/seed-i18n";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import {
  DEFAULT_PERIOD,
  fetchLostReasons,
  isLostPeriod,
  type LostPeriod,
} from "./types";
import { LostReasonsView } from "./lost-reasons-view";

export const dynamic = "force-dynamic";

/** Báo cáo là số liệu CẢ TIỆM → chỉ quản lý trở lên (spec CRM §4.6, như reports/sources). */
const REPORT_ROLES = ["owner", "admin", "manager"];

/**
 * `/app/reports/lost-reasons` — "Vì sao thua": cộng dồn lý do thua theo kỳ
 * (tháng này / 3 tháng / tất cả), tỷ trọng từng lý do + xu hướng so kỳ liền
 * trước, lý do đứng đầu kèm 1 dòng gợi ý hành động (học mẫu GoK "Why we lose").
 * Số đếm DB-side qua RPC lost_reasons_report() (SECURITY INVOKER, migration #56).
 */
export default async function LostReasonsReportPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string | string[] }>;
}) {
  const sp = await searchParams; // Next 16: searchParams phải await
  const p = typeof sp.p === "string" ? sp.p : "";
  const initialPeriod: LostPeriod = isLostPeriod(p) ? p : DEFAULT_PERIOD;

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
  if (!canView) {
    return <LostReasonsView canView={false} initialPeriod={initialPeriod} />;
  }

  const [initialRows, tSeed, reasonsRes] = await Promise.all([
    fetchLostReasons(supabase, initialPeriod),
    getTranslations("seed"),
    supabase.from("lost_reasons").select("id, name, i18n_key"),
  ]);

  // Lý do CÀI SẴN dịch được (migration #36): gửi kèm bảng tra id → tên hiển thị
  // (đổi kỳ ở client vẫn đọc đúng một tên) + id → i18n_key (chọn dòng gợi ý
  // hành động cho lý do đứng đầu).
  const seedReasonNames: Record<string, string> = {};
  const seedReasonKeys: Record<string, string> = {};
  for (const r of reasonsRes.data ?? []) {
    const id = r.id as string;
    const key = r.i18n_key as string | null;
    seedReasonNames[id] = seedLabel(key, r.name as string, tSeed);
    if (key) seedReasonKeys[id] = key;
  }

  return (
    <LostReasonsView
      canView
      initialPeriod={initialPeriod}
      initialRows={initialRows}
      seedReasonNames={seedReasonNames}
      seedReasonKeys={seedReasonKeys}
    />
  );
}
