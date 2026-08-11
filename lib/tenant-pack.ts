import type { SupabaseClient } from "@supabase/supabase-js";

export type TenantPackTerminology = {
  contact?: string;
  deal?: string;
  deal_won?: string;
};

export type TenantPackCustomField = { key: string; label: string; type: string };

export type TenantPack = {
  terminology?: TenantPackTerminology;
  modules?: string[];
  custom_fields?: TenantPackCustomField[];
};

/**
 * Cửa DUY NHẤT đọc pack đang áp cho tenant hiện tại (Quy hoạch mục 35.4.3 —
 * "getTenantModules() là cửa DUY NHẤT", không màn nào tự `if (industry ===
 * 'spa')`). Bọc RPC tenant_pack_view() (migration #60): coalesce(nội dung
 * pack, mảnh tiệm tự sửa) — D1 một nguồn sự thật. Tenant chưa chọn ngành thì
 * trả object rỗng, gọi nơi dùng tự fallback về chuỗi mặc định.
 */
export async function getTenantPack(
  supabase: SupabaseClient,
): Promise<TenantPack> {
  const { data } = await supabase.rpc("tenant_pack_view");
  return (data ?? {}) as TenantPack;
}

/**
 * Module forward-declared theo ma trận 34.5 (mục 11 trở đi — booking, orders,
 * inventory...). V1a CHƯA có màn nào gate theo đây vì các module đó chưa có
 * UI thật (V2+); hàm này tồn tại để V2 trở đi có sẵn MỘT cửa để gọi, không ai
 * phải tự dựng cửa riêng.
 */
export function getTenantModules(pack: TenantPack): string[] {
  return pack.modules ?? [];
}

/**
 * Viết hoa chữ cái đầu — 8 gói ngành lưu terminology TOÀN CHỮ THƯỜNG trong
 * CSDL (VD: "khách", "đơn hàng tiềm năng") vì cùng một từ được chèn cả GIỮA
 * câu (VD chuỗi xem-trước "Gọi khách là {contact}") lẫn ĐẦU nhãn/tiêu đề độc
 * lập (nav, H1 trang Khách hàng/Cơ hội). Chỉ gọi hàm này ở vị trí ĐẦU DÒNG —
 * founder phát hiện 11/08: nav mobile + heading trang hiện chữ thường sai
 * chính tả tiếng Việt do thiếu bước này.
 */
export function capitalizeFirst(s: string): string {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
