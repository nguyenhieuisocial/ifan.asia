import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { getTenantPack } from "@/lib/tenant-pack";
import { listResources, listServices } from "@/lib/booking/services";
import { ServicesView, type ServicesSettings } from "./services-view";

export const dynamic = "force-dynamic";

/**
 * Cài đặt → Dịch vụ & Tài nguyên (ADR-0009 mục 7 việc 3, thẻ design
 * man-cai-dat-dich-vu.html, đợt V2 "Lịch hẹn").
 *
 * Quyền owner/admin/manager (ADR-0009 mục 7b, đính chính 13/08 — hồ sơ gốc
 * ghi "owner/admin" tự mâu thuẫn với RLS đã mở cho manager, xem ADR để rõ 3
 * căn cứ). Đây là lớp LỊCH SỰ UI, lưới thật vẫn là RLS `services_manage`/
 * `resources_manage` + kiểm vai trong actions.ts (bất biến 1).
 *
 * Giờ mở cửa & ngày nghỉ KHÔNG nằm ở màn này — đã có ở Cài đặt → Kênh → Mặt
 * tiền từ V1.5 (migration #80). V2 chỉ ĐỌC hai bảng đó (ADR-0009 mục 9).
 */
export default async function ServicesSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const member = await getCurrentMembership(supabase, user?.id ?? "");
  const canManage = member?.role === "owner" || member?.role === "admin" || member?.role === "manager";

  let initial: ServicesSettings = {
    services: [],
    resources: [],
    industryKey: null,
    packServiceCount: 0,
  };

  if (canManage) {
    const [services, resources, { data: tenant }, pack] = await Promise.all([
      listServices(supabase),
      listResources(supabase),
      supabase.from("tenants").select("industry").maybeSingle(),
      getTenantPack(supabase),
    ]);

    initial = {
      services,
      resources,
      industryKey: (tenant?.industry as string | null) ?? null,
      // Chỉ cần BIẾT CÓ hay không để quyết hiện nút "nạp mẫu" — nội dung mẫu do
      // server đọc lại lúc bấm (actions.ts), không tin danh sách gửi xuống client.
      packServiceCount: pack.services?.length ?? 0,
    };
  }

  return <ServicesView canManage={canManage} initial={initial} />;
}
