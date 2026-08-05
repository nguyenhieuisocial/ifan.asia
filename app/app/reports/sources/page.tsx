import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { seedLabel } from "@/lib/seed-i18n";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_RANGE,
  fetchSourceReport,
  isRangePreset,
  type RangePreset,
} from "./types";
import { SourcesView } from "./sources-view";

export const dynamic = "force-dynamic";

/** Báo cáo doanh thu là số liệu CẢ TIỆM → chỉ quản lý trở lên (spec CRM §4.6). */
const REPORT_ROLES = ["owner", "admin", "manager"];

/**
 * `/app/reports/sources` — "Nguồn nào ra tiền": bảng nguồn × {khách mới, deal
 * thắng, doanh thu, tỉ lệ chốt} theo 3 mô hình quy kết first / last / linear.
 * Số lấy 1 lần qua RPC source_revenue_report() (SECURITY INVOKER, migration #16).
 */
export default async function SourcesReportPage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string | string[] }>;
}) {
  const sp = await searchParams; // Next 16: searchParams phải await
  const r = typeof sp.r === "string" ? sp.r : "";
  const initialRange: RangePreset = isRangePreset(r) ? r : DEFAULT_RANGE;

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

  const { data: member } = await supabase
    .from("tenant_members")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  const canView = REPORT_ROLES.includes(member?.role ?? "");
  if (!canView) return <SourcesView canView={false} initialRange={initialRange} />;

  const [initialRows, tSeed, sourcesRes] = await Promise.all([
    fetchSourceReport(supabase, initialRange),
    getTranslations("seed"),
    supabase.from("lead_sources").select("id, name, i18n_key"),
  ]);

  // Tên nguồn CÀI SẴN dịch được (migration #36). RPC trả tên đã lưu, nên gửi
  // kèm bảng tra id → tên hiển thị: đổi khoảng thời gian (client refetch) vẫn
  // đọc đúng một tên. Nguồn chủ tiệm tự thêm không có khóa → giữ nguyên.
  const seedSourceNames = Object.fromEntries(
    (sourcesRes.data ?? []).map((s) => [
      s.id as string,
      seedLabel(s.i18n_key as string | null, s.name as string, tSeed),
    ]),
  );

  return (
    <SourcesView
      canView
      initialRange={initialRange}
      initialRows={initialRows}
      seedSourceNames={seedSourceNames}
    />
  );
}
