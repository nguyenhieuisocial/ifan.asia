/**
 * DANH SÁCH NGUỒN duy nhất của toàn bộ mảng iFan trên mọi trang công khai (luật D1).
 * Nguồn: ADR-0012 mục 4 (bảng 9 nhóm · 25 mảng) + mục 2 (đối chiếu từng dòng) —
 * đối chiếu `docs/SU-THAT-SAN-PHAM.md` mỗi khi sửa.
 *
 * Cấu trúc 3 TẦNG (ADR-0012 mục 3): Nhóm (9, người mua đọc) → Mảng (đây,
 * người thi công đọc) → Tính năng (mô tả trong `landing.modules.<key>.desc`,
 * người soi kỹ đọc). KHÔNG in số tổng tính năng ở đâu (ADR-0012 mục 8).
 *
 * - `status` PHẢI khớp sổ sự thật: "ready" chỉ khi CHẠY THẬT hôm nay; "building"
 *   chỉ đúng mảng đang code trong đợt hiện tại (đợt V2.5 đã đóng 13/08 — hiện
 *   không mảng nào "building", đợt kế tiếp mở thì gắn lại); còn lại "planned".
 *   Không có trạng thái thứ tư, không có "beta" lấp lửng.
 * - `wave` chỉ có ở mảng "planned" — dùng để nhóm trên /lo-trinh (V3–V5 · V6 · V7–V8).
 * - `groupId` gắn mảng vào đúng 1 trong 9 nhóm GROUP_REGISTRY — KHÔNG có mảng mồ côi.
 * - ADR-0012 giữ nguyên mọi mảng cũ, chỉ thêm 8 mảng mới (chỗ chưa có bảng CSDL
 *   nào phủ) và tách "approvals" ra khỏi "tasks" (cả hai đã chạy thật từ trước,
 *   chỉ chưa có tên riêng) — không đảo đợt nào, không xoá mảng nào.
 * - Nhãn hiển thị: i18n key `landing.modules.<key>.name` (+ `.desc`, `.note` nếu có).
 * - Huy hiệu vẽ bởi components/landing/status-badge.tsx.
 *
 * Đổi trạng thái một mảng: sửa ĐÚNG 1 dòng ở đây — cấm gõ tay số ở bất kỳ trang nào.
 */

export type FeatureStatus = "ready" | "building" | "planned";
export type PlannedWave = "v3v5" | "v6" | "v7v8";

export interface GroupEntry {
  /** Khóa i18n: tinhNang.groups.<id>.title (+ .subtitle nếu có) */
  id: string;
}

export interface ModuleEntry {
  /** Khóa i18n: landing.modules.<key>.name (+ .desc, .note nếu có) */
  key: string;
  status: FeatureStatus;
  /** Chỉ đặt khi status === "planned" — nhóm hiển thị trên /lo-trinh. */
  wave?: PlannedWave;
  /** 1 trong 9 id của GROUP_REGISTRY — nhóm hiển thị trên /tinh-nang. */
  groupId: string;
}

/** Thứ tự hiển thị trên /tinh-nang — đúng thứ tự bảng ADR-0012 mục 4. */
export const GROUP_REGISTRY: GroupEntry[] = [
  { id: "g1" }, // Bán hàng & Khách hàng
  { id: "g2" }, // Marketing & Tự động hoá
  { id: "g3" }, // Hộp thư & Chăm khách
  { id: "g4" }, // Công việc & Phối hợp
  { id: "g5" }, // Quy trình & Phê duyệt
  { id: "g6" }, // Nhân sự & Chấm công
  { id: "g7" }, // Báo cáo & Phân tích
  { id: "g8" }, // Vận hành tiệm — ⭐ CNV Work (đối thủ chính) KHÔNG có nhóm này
  { id: "g9" }, // Nền tảng & Kết nối
];

export const MODULE_REGISTRY: ModuleEntry[] = [
  // g1 — Bán hàng & Khách hàng
  { key: "contacts", status: "ready", groupId: "g1" },
  { key: "deals", status: "ready", groupId: "g1" },
  // V3 đóng 17/08: /app/orders (danh sách · chi tiết · máy trạng thái · hoàn
  // hàng) + thu tiền 3 cách (VietQR · tiền mặt · chuyển khoản) + sổ quỹ tự sinh
  // phiếu. Báo giá và hoá đơn điện tử CHƯA có ⇒ khai trong `.note`, không im.
  { key: "orders", status: "ready", groupId: "g1" },
  { key: "contractsBilling", status: "planned", wave: "v3v5", groupId: "g1" },
  // g2 — Marketing & Tự động hoá
  { key: "storefront", status: "ready", groupId: "g2" },
  { key: "retention", status: "planned", wave: "v6", groupId: "g2" },
  { key: "automation", status: "planned", wave: "v6", groupId: "g2" },
  { key: "events", status: "planned", wave: "v7v8", groupId: "g2" },
  // g3 — Hộp thư & Chăm khách
  { key: "inbox", status: "ready", groupId: "g3" },
  { key: "aiWork", status: "ready", groupId: "g3" },
  { key: "sla", status: "ready", groupId: "g3" },
  { key: "csatQc", status: "planned", wave: "v6", groupId: "g3" },
  // g4 — Công việc & Phối hợp
  { key: "today", status: "ready", groupId: "g4" },
  { key: "tasks", status: "ready", groupId: "g4" },
  { key: "projects", status: "planned", wave: "v7v8", groupId: "g4" },
  { key: "internalChat", status: "planned", wave: "v7v8", groupId: "g4" },
  // g5 — Quy trình & Phê duyệt (tách khỏi "tasks" — đã chạy thật từ trước)
  { key: "approvals", status: "ready", groupId: "g5" },
  // g6 — Nhân sự & Chấm công
  { key: "team", status: "planned", wave: "v7v8", groupId: "g6" },
  { key: "recruitment", status: "planned", wave: "v7v8", groupId: "g6" },
  { key: "payroll", status: "planned", wave: "v7v8", groupId: "g6" },
  // g7 — Báo cáo & Phân tích
  { key: "reports", status: "ready", groupId: "g7" },
  { key: "dataExport", status: "planned", wave: "v6", groupId: "g7" },
  // g8 — Vận hành tiệm
  { key: "booking", status: "ready", groupId: "g8" },
  // ⚠️ Hai mảng dưới GỘP việc của hai đợt khác nhau, nên phần lõi đã chạy thật
  // mà huy hiệu vẫn phải là "planned" — và đó là lựa chọn CÓ CHỦ ĐÍCH:
  //
  //   inventory ("Hàng hoá & Kho") — danh mục hàng hoá + biến thể đã dùng được
  //     từ 17/08 (/app/items), nhưng TOÀN BỘ phần mô tả hứa (tồn kho, xuất nhập,
  //     nhà cung cấp, hàng tiêu hao) thuộc V4 và chưa có dòng code nào.
  //   finance ("Két sắt & Công nợ") — sổ thu chi (/app/cashbook) và lãi gộp
  //     (/app/reports) đã chạy thật, nhưng "két sắt" (chốt sổ, bàn giao ca, khoá
  //     sổ kỳ) là V5 và "công nợ" chưa có gì.
  //
  // Gắn "ready" ở đây là để huy hiệu HỨA thứ chưa có — trái bất biến 9 (huy hiệu
  // trạng thái TRUNG THỰC). Phần đã dùng được khai bằng `.note`, hiện ngay cạnh
  // mô tả trên /tinh-nang, nên người đọc vẫn biết chính xác cái gì đang có.
  // Việc theo dõi: xét TÁCH hai mảng này ở ADR-0012 — một mảng gộp hai đợt thì
  // không có trạng thái nào diễn tả đúng nó.
  { key: "inventory", status: "planned", wave: "v3v5", groupId: "g8" },
  { key: "finance", status: "planned", wave: "v3v5", groupId: "g8" },
  // g9 — Nền tảng & Kết nối
  { key: "system", status: "ready", groupId: "g9" },
  { key: "industry", status: "ready", groupId: "g9" },
  { key: "integrations", status: "planned", wave: "v6", groupId: "g9" },
];

export const READY_MODULES = MODULE_REGISTRY.filter((m) => m.status === "ready");
export const BUILDING_MODULES = MODULE_REGISTRY.filter((m) => m.status === "building");
export const PLANNED_MODULES = MODULE_REGISTRY.filter((m) => m.status === "planned");

/** Đếm nhanh cho /tinh-nang, /lo-trinh — không in trên trang chủ (ADR-0012 mục 8). */
export const MODULE_COUNTS = {
  ready: READY_MODULES.length,
  building: BUILDING_MODULES.length,
  planned: PLANNED_MODULES.length,
  total: MODULE_REGISTRY.length,
} as const;

/**
 * Nhóm nào "đã có phần lõi chạy thật" = có ít nhất 1 mảng "ready" bên trong.
 * Dùng cho nhãn hero trang chủ "{ready}/{total} nhóm..." (ADR-0012 mục 8) —
 * tính động từ MODULE_REGISTRY, cấm gõ tay số ở component.
 */
export const GROUP_COUNTS = {
  readyCore: GROUP_REGISTRY.filter((g) =>
    MODULE_REGISTRY.some((m) => m.groupId === g.id && m.status === "ready"),
  ).length,
  total: GROUP_REGISTRY.length,
} as const;
