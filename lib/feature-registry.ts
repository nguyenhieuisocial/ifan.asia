/**
 * DANH SÁCH NGUỒN duy nhất của 20 mảng iFan trên mọi trang công khai (luật D1).
 * Nguồn: ADR-0011 mục 5.1 — đối chiếu `docs/SU-THAT-SAN-PHAM.md` mỗi khi sửa.
 *
 * - `status` PHẢI khớp sổ sự thật: "ready" chỉ khi CHẠY THẬT hôm nay; "building"
 *   chỉ đúng 1 mảng đang code trong đợt hiện tại (V2.5); còn lại "planned".
 *   Không có trạng thái thứ tư, không có "beta" lấp lửng.
 * - `wave` chỉ có ở mảng "planned" — dùng để nhóm trên /lo-trinh (V3–V5 · V6 · V7–V8).
 * - Nhãn hiển thị: i18n key `landing.modules.<key>.name` (+ `.note` nếu có).
 * - Huy hiệu vẽ bởi components/landing/status-badge.tsx.
 *
 * Đổi trạng thái một mảng: sửa ĐÚNG 1 dòng ở đây — cấm gõ tay số ở bất kỳ trang nào.
 */

export type FeatureStatus = "ready" | "building" | "planned";
export type PlannedWave = "v3v5" | "v6" | "v7v8";

export interface ModuleEntry {
  /** Khóa i18n: landing.modules.<key>.name (+ .note nếu có) */
  key: string;
  status: FeatureStatus;
  /** Chỉ đặt khi status === "planned" — nhóm hiển thị trên /lo-trinh. */
  wave?: PlannedWave;
}

export const MODULE_REGISTRY: ModuleEntry[] = [
  { key: "today", status: "ready" },
  { key: "inbox", status: "ready" },
  { key: "contacts", status: "ready" },
  { key: "deals", status: "ready" },
  { key: "tasks", status: "ready" },
  { key: "sla", status: "ready" },
  { key: "reports", status: "ready" },
  { key: "system", status: "ready" },
  { key: "industry", status: "ready" },
  { key: "storefront", status: "ready" },
  { key: "booking", status: "ready" },
  { key: "aiWork", status: "building" },
  { key: "orders", status: "planned", wave: "v3v5" },
  { key: "inventory", status: "planned", wave: "v3v5" },
  { key: "finance", status: "planned", wave: "v3v5" },
  { key: "retention", status: "planned", wave: "v6" },
  { key: "automation", status: "planned", wave: "v6" },
  { key: "integrations", status: "planned", wave: "v6" },
  { key: "team", status: "planned", wave: "v7v8" },
  { key: "internalChat", status: "planned", wave: "v7v8" },
];

export const READY_MODULES = MODULE_REGISTRY.filter((m) => m.status === "ready");
export const BUILDING_MODULES = MODULE_REGISTRY.filter((m) => m.status === "building");
export const PLANNED_MODULES = MODULE_REGISTRY.filter((m) => m.status === "planned");

/** Đếm nhanh cho hero/lộ trình — 11 · 1 · 8 (ADR-0011 mục 5.1). */
export const MODULE_COUNTS = {
  ready: READY_MODULES.length,
  building: BUILDING_MODULES.length,
  planned: PLANNED_MODULES.length,
  total: MODULE_REGISTRY.length,
} as const;

/**
 * Nhóm hiển thị cho /tinh-nang — theo DÒNG CHẢY CÔNG VIỆC của tiệm, không
 * theo tên màn hình (thẻ design trang-tinh-nang.html). Cố ý xen mảng
 * "planned" vào giữa mảng "ready" trong cùng nhóm thay vì dồn hết xuống
 * cuối trang — dồn cuối là một kiểu giấu.
 */
export const TINH_NANG_GROUPS: { id: string; keys: string[] }[] = [
  { id: "g1", keys: ["storefront", "inbox", "aiWork"] },
  { id: "g2", keys: ["contacts", "deals", "booking"] },
  { id: "g3", keys: ["today", "tasks", "sla", "team", "internalChat"] },
  { id: "g4", keys: ["orders", "inventory", "finance"] },
  { id: "g5", keys: ["reports", "retention", "automation"] },
  { id: "g6", keys: ["industry", "system", "integrations"] },
];
