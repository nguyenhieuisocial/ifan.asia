import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Dịch vụ & tài nguyên — kiểu dùng CHUNG cho cả đợt V2 (ADR-0009 mục 4/7).
 *
 * Đặt ở đây chứ không nằm trong màn Cài đặt vì `duration_minutes` là **thuộc
 * tính của LỊCH, không phải của bán hàng** (ADR mục 4): màn Lịch (việc 4) và
 * đặt-lịch-từ-chat (việc 5) đọc đúng con số này để tính `end_at` và để hai
 * ràng buộc EXCLUDE ở CSDL bắt được trùng giờ. Hai màn đó nhập bảng này, KHÔNG
 * tự khai lại kiểu riêng — khai lại là mở đường cho hai chỗ hiểu khác nhau về
 * cùng một cột.
 *
 * V3 khi dựng catalog hàng hoá phải MỞ RỘNG `services`, cấm dựng bảng thứ hai
 * cùng nghĩa (ADR mục 4 "Hệ quả") — nên kiểu ở đây cũng chỉ nới ra, không fork.
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
    .from("services")
    .select("id, name, duration_minutes, price_vnd, is_active, sort_order")
    .order("sort_order")
    .order("name");
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    durationMinutes: r.duration_minutes as number,
    priceVnd: Number(r.price_vnd ?? 0),
    isActive: r.is_active as boolean,
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
