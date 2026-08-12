import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { getTenantPack } from "@/lib/tenant-pack";
import { StorefrontView, type StorefrontSettings } from "./storefront-view";

export const dynamic = "force-dynamic";

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
    const [{ data: tenant }, { data: sf }, { data: hours }, { data: closures }, pack] = await Promise.all([
      supabase.from("tenants").select("slug").maybeSingle(),
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
        .gte("date_to", new Date().toISOString().slice(0, 10))
        .order("date_from"),
      getTenantPack(supabase),
    ]);

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
      closures: (closures ?? []).map((c) => ({
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
