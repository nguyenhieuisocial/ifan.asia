import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { getTenantPack } from "@/lib/tenant-pack";
import { addDaysToDateKey, dateKeyInTimeZone } from "@/lib/booking/schedule";
import { StorefrontView, type StorefrontSettings } from "./storefront-view";

export const dynamic = "force-dynamic";

const DEFAULT_TZ = "Asia/Ho_Chi_Minh"; // khớp mặc định `tenants.timezone` (migration #80)

/**
 * Cài đặt → Kênh → Mặt tiền & nhận khách (ADR-0008, thẻ design man-cai-dat-mat-
 * tien.html, task #88). Bật/tắt cổng công khai cùng mức quyền với Zalo/Live Chat
 * (owner/admin) — giờ mở cửa/ngày nghỉ mở rộng cho manager (RLS business_hours/
 * business_closures cho phép cả 3, xem migration #80).
 */
export default async function StorefrontSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const member = await getCurrentMembership(supabase, user?.id ?? "");
  const canManage = member?.role === "owner" || member?.role === "admin" || member?.role === "manager";
  const canConfig = member?.role === "owner" || member?.role === "admin";

  let initial: StorefrontSettings = {
    slug: "",
    storefrontEnabled: false,
    leadFormEnabled: false,
    intro: "",
    address: "",
    zaloContactUrl: "",
    enabledFieldKeys: [],
    fieldCatalog: [],
    hours: [],
    closures: [],
  };

  if (canManage) {
    // Khoảng truy vấn CSDL rộng hơn 1 ngày (bù mọi lệch múi giờ, tối đa UTC±14)
    // rồi lọc lại CHÍNH XÁC theo múi giờ tiệm ở tầng ứng dụng bên dưới — đúng
    // khuôn `app/app/calendar/queries.ts`. Lọc thẳng bằng ngày UTC (như bản cũ)
    // là gốc bug #99: 7 tiếng đầu mỗi đêm giờ Việt Nam, ngày UTC còn đứng ở hôm
    // qua nên loại nhầm ngày nghỉ đã qua RỒI mới hiện lại — "còn hiệu lực" hiện
    // sai cho tới sáng.
    const nowIso = new Date().toISOString();
    const queryFromDateKey = addDaysToDateKey(nowIso.slice(0, 10), -1);

    const [{ data: tenant }, { data: sf }, { data: hours }, { data: closures }, pack] = await Promise.all([
      supabase.from("tenants").select("slug, timezone").maybeSingle(),
      supabase
        .from("tenant_storefront")
        .select("storefront_enabled, lead_form_enabled, intro, address, zalo_contact_url, lead_form_fields")
        .maybeSingle(),
      supabase
        .from("business_hours")
        .select("id, weekday, is_closed, open_time, close_time")
        .order("weekday")
        .order("open_time"),
      supabase
        .from("business_closures")
        .select("id, date_from, date_to, reason, is_full_day, open_time, close_time")
        // Chỉ hiện ngày nghỉ CÒN HIỆU LỰC/SẮP TỚI — đã qua thì dọn khỏi màn cho gọn.
        .gte("date_to", queryFromDateKey)
        .order("date_from"),
      getTenantPack(supabase),
    ]);

    const timezone = (tenant?.timezone as string | null) ?? DEFAULT_TZ;
    const todayKey = dateKeyInTimeZone(new Date().toISOString(), timezone);
    const visibleClosures = (closures ?? []).filter((c) => (c.date_to as string) >= todayKey);

    initial = {
      slug: tenant?.slug ?? "",
      storefrontEnabled: sf?.storefront_enabled ?? false,
      leadFormEnabled: sf?.lead_form_enabled ?? false,
      intro: sf?.intro ?? "",
      address: sf?.address ?? "",
      zaloContactUrl: sf?.zalo_contact_url ?? "",
      enabledFieldKeys: Array.isArray(sf?.lead_form_fields) ? sf.lead_form_fields : [],
      fieldCatalog: pack.lead_form_fields ?? [],
      hours: (hours ?? []).map((h) => ({
        id: h.id as string,
        weekday: h.weekday as number,
        isClosed: h.is_closed as boolean,
        openTime: h.open_time as string | null,
        closeTime: h.close_time as string | null,
      })),
      closures: visibleClosures.map((c) => ({
        id: c.id as string,
        dateFrom: c.date_from as string,
        dateTo: c.date_to as string,
        reason: c.reason as string,
        isFullDay: c.is_full_day as boolean,
        openTime: c.open_time as string | null,
        closeTime: c.close_time as string | null,
      })),
    };
  }

  return <StorefrontView canManage={canManage} canConfig={canConfig} initial={initial} />;
}
