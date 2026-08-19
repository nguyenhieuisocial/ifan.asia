import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { QUYEN_HOP_LE } from "@/lib/integrations/api-key";
import { IntegrationsView } from "./integrations-view";
import { layDuongBao, layKhoaApi } from "./queries";
import type { ApiKeyRow, WebhookRow } from "./types";

export const dynamic = "force-dynamic";

/**
 * Cài đặt → Tích hợp (thẻ design `man-webhook-api.html`, migration #160-161).
 *
 * CẢ MÀN chỉ owner/admin — khớp đúng RLS `api_keys_manage` /
 * `webhook_endpoints_manage`. Khác các màn Cài đặt khác (nơi nhân viên còn xem
 * được bản chỉ-đọc): ở đây "xem" đã là lộ đường vào dữ liệu tiệm, nên không có
 * bản chỉ-đọc nào cả.
 */
const MANAGE_ROLES = ["owner", "admin"];

export async function generateMetadata() {
  const t = await getTranslations("integrations");
  return { title: t("title") };
}

export default async function IntegrationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // layout /app đã redirect khi chưa đăng nhập — user luôn có ở đây
  const member = await getCurrentMembership(supabase, user?.id ?? "");
  const canManage = MANAGE_ROLES.includes(member?.role ?? "");

  if (!canManage) {
    return (
      <IntegrationsView
        canManage={false}
        apiKeys={[]}
        webhooks={[]}
        quyenCoThe={[]}
        loadFailed={false}
      />
    );
  }

  let loadFailed = false;
  let apiKeys: ApiKeyRow[] = [];
  let webhooks: WebhookRow[] = [];

  try {
    [apiKeys, webhooks] = await Promise.all([layKhoaApi(supabase), layDuongBao(supabase)]);
  } catch {
    // Tải hỏng thì NÓI RA, không hiện danh sách rỗng như thể tiệm chưa nối gì —
    // ở màn này hiểu nhầm đó còn dẫn tới việc tạo trùng một khoá nữa.
    loadFailed = true;
  }

  return (
    <IntegrationsView
      canManage
      apiKeys={apiKeys}
      webhooks={webhooks}
      // Danh sách quyền đi từ máy chủ xuống: `lib/integrations/api-key.ts` nạp
      // `node:crypto` nên màn hình (client) không import thẳng được, mà chép
      // lại ba chuỗi này sang file khác là tạo nguồn sự thật thứ hai.
      quyenCoThe={[...QUYEN_HOP_LE]}
      loadFailed={loadFailed}
    />
  );
}
