import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { seedLabel } from "@/lib/seed-i18n";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { QrView, type LeadSourceOption, type QrCodeRow } from "./qr-view";

export const dynamic = "force-dynamic";

/**
 * Cài đặt → Mã QR (migration #24).
 * Mỗi mã gắn vào một NGUỒN KHÁCH có sẵn (`lead_sources`) nên số liệu tự chảy
 * vào báo cáo "nguồn → doanh thu" — không có hệ đo đếm thứ hai.
 */
export default async function QrPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // layout /app đã redirect khi chưa đăng nhập — user luôn có ở đây
  const member = await getCurrentMembership(supabase, user?.id ?? "");
  const canManage =
    member?.role === "owner" || member?.role === "admin" || member?.role === "manager";

  const [{ data: codes }, { data: sources }] = await Promise.all([
    supabase.rpc("qr_code_list"),
    supabase.from("lead_sources").select("id, name, i18n_key").order("name"),
  ]);

  // Nguồn CÀI SẴN dịch được (migration #36); nguồn chủ tiệm tự thêm ("Tại tiệm",
  // "Tờ rơi phường 5") không có khóa → giữ nguyên tên họ đặt.
  const tSeed = await getTranslations("seed");
  const sourceOptions: LeadSourceOption[] = (sources ?? []).map((s) => ({
    id: s.id as string,
    name: seedLabel(s.i18n_key as string | null, s.name as string, tSeed),
  }));
  // Thẻ nguồn trên từng mã QR phải đọc GIỐNG HỆT ô chọn nguồn ngay bên cạnh —
  // tra lại theo id thay vì đổi hợp đồng trả về của RPC qr_code_list.
  const sourceNameById = new Map(sourceOptions.map((s) => [s.id, s.name]));
  const codeRows: QrCodeRow[] = ((codes ?? []) as QrCodeRow[]).map((c) => ({
    ...c,
    source_name: sourceNameById.get(c.source_id) ?? c.source_name,
  }));

  // Gốc URL in lên mã QR: lấy từ request để bản deploy nào cũng ra đúng tên miền.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  return (
    <QrView
      canManage={canManage}
      baseUrl={host ? `${proto}://${host}` : ""}
      codes={codeRows}
      sources={sourceOptions}
    />
  );
}
