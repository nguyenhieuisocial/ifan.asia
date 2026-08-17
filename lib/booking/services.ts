import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Dịch vụ & tài nguyên — kiểu dùng CHUNG cho cả đợt V2 (ADR-0009 mục 4/7).
 *
 * Đặt ở đây chứ không nằm trong màn Cài đặt vì `duration_minutes` là **thuộc
 * tính của LỊCH, không phải của bán hàng** (ADR mục 4): màn Lịch (việc 4) và
 * đặt-lịch-từ-chat (việc 5) đọc đúng con số này để tính `end_at` và để hai
 * ràng buộc EXCLUDE ở CSDL bắt được trùng giờ. Hai màn đó nhập hàm này, KHÔNG
 * tự khai lại kiểu riêng — khai lại là mở đường cho hai chỗ hiểu khác nhau về
 * cùng một cột.
 *
 * V3 (ADR-0019 mục 3, migration #125) đã DI TRÚ `services` → `items`: bảng
 * giờ chứa CẢ dịch vụ (kind='service') LẪN hàng hoá (kind='product'). Hàm
 * `listServices` dưới đây lọc đúng `kind='service'` — booking KHÔNG được thấy
 * hàng hoá. Kiểu `Service` giữ NGUYÊN hình dạng cũ (kể cả `isActive: boolean`)
 * để không rung lắc các màn V2 đang chạy thật; `isActive` suy ra từ
 * `status === 'active'` — `status` thật (draft/active/discontinued) là
 * chuyện của màn Hàng hoá (V3 việc 3), booking chỉ cần biết "đặt được hay
 * không".
 */

/** Khớp ĐÚNG check constraint `resources.kind` (migration #83). Thêm loại mới = sửa cả hai nơi. */
export const RESOURCE_KINDS = ["bed", "room", "chair", "table", "machine"] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export type Service = {
  id: string;
  name: string;
  /** PHÚT. Con số màn Lịch dùng để tính giờ kết thúc — không phải thông tin trang trí. */
  durationMinutes: number;
  priceVnd: number;
  /** false = ngừng bán. `services` KHÔNG có xoá mềm (ADR mục 4) — lịch cũ vẫn phải đọc được tên dịch vụ. */
  isActive: boolean;
  sortOrder: number;
};

export type Resource = {
  id: string;
  name: string;
  kind: ResourceKind;
  isActive: boolean;
};

/** Giới hạn ô nhập — khớp check constraint của migration #83, không nới rộng hơn CSDL. */
export const SERVICE_NAME_MAX = 120; // char_length(btrim(name)) between 1 and 120
export const SERVICE_DURATION_MIN = 1; // duration_minutes > 0
/** 24 giờ: dài hơn một ngày thì không ca nào xếp được (ca vắt qua nửa đêm bị `appointment_hours_warning` trả 'crosses_midnight'). */
export const SERVICE_DURATION_MAX = 1440;
export const SERVICE_PRICE_MAX = 1_000_000_000;
export const RESOURCE_NAME_MAX = 120;

/**
 * Thứ tự đọc dùng chung: `sort_order` do chủ tiệm xếp, rồi tới tên — màn Cài
 * đặt và màn Lịch phải thấy CÙNG một thứ tự, nếu không chủ tiệm sửa ở đây rồi
 * đi tìm mãi không ra ở kia.
 */
export async function listServices(supabase: SupabaseClient): Promise<Service[]> {
  const { data } = await supabase
    .from("items")
    .select("id, name, duration_minutes, price_vnd, status, sort_order")
    .eq("kind", "service")
    .order("sort_order")
    .order("name");
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    durationMinutes: r.duration_minutes as number,
    priceVnd: Number(r.price_vnd ?? 0),
    isActive: r.status === "active",
    sortOrder: r.sort_order as number,
  }));
}

export async function listResources(supabase: SupabaseClient): Promise<Resource[]> {
  const { data } = await supabase
    .from("resources")
    .select("id, name, kind, is_active")
    .order("name");
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    kind: r.kind as ResourceKind,
    isActive: r.is_active as boolean,
  }));
}
