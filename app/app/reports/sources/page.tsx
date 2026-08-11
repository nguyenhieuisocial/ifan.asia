import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { seedLabel } from "@/lib/seed-i18n";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import {
  DEFAULT_RANGE,
  fetchSourceCosts,
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

  const member = await getCurrentMembership(supabase, user.id);
  const canView = REPORT_ROLES.includes(member?.role ?? "");
  if (!canView) return <SourcesView canView={false} initialRange={initialRange} />;

  const [initialRows, initialCosts, tSeed, sourcesRes, qrRes] = await Promise.all([
    fetchSourceReport(supabase, initialRange),
    // Chi phí theo tháng đã nhập (migration #52) → cột Chi phí + Lời/Lỗ
    fetchSourceCosts(supabase, initialRange),
    getTranslations("seed"),
    supabase.from("lead_sources").select("id, name, i18n_key"),
    // Nguồn nào đang gắn mã QR → dòng nguồn trong bảng có link ngược về màn Mã QR
    supabase.from("qr_codes").select("source_id"),
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
      initialCosts={initialCosts}
      seedSourceNames={seedSourceNames}
      qrSourceIds={(qrRes.data ?? []).map((r) => r.source_id as string)}
    />
  );
}
