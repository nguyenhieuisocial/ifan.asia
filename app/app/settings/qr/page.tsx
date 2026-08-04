import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
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
  const { data: member } = await supabase
    .from("tenant_members")
    .select("role")
    .eq("user_id", user?.id ?? "")
    .maybeSingle();
  const canManage =
    member?.role === "owner" || member?.role === "admin" || member?.role === "manager";

  const [{ data: codes }, { data: sources }] = await Promise.all([
    supabase.rpc("qr_code_list"),
    supabase.from("lead_sources").select("id, name").order("name"),
  ]);

  // Gốc URL in lên mã QR: lấy từ request để bản deploy nào cũng ra đúng tên miền.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  return (
    <QrView
      canManage={canManage}
      baseUrl={host ? `${proto}://${host}` : ""}
      codes={(codes ?? []) as QrCodeRow[]}
      sources={(sources ?? []) as LeadSourceOption[]}
    />
  );
}
