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
  // V5 đóng 19/08: gói dịch vụ, ký hợp đồng, đổi buổi, trigger cap.
  { key: "contractsBilling", status: "ready", groupId: "g1" },
  // g2 — Marketing & Tự động hoá
  { key: "storefront", status: "ready", groupId: "g2" },
  { key: "retention", status: "ready", groupId: "g2" },
  { key: "automation", status: "ready", wave: "v6", groupId: "g2" },
  // V8 đợt 19/08 đang mở: /app/events (chiến dịch có trần tiền giảm tự dừng ·
  // gắn mã vào chiến dịch · gửi tin có bảng trừ "chưa đồng ý / đã rút / vừa nhận
  // tin 7 ngày" hiện TRƯỚC khi bấm · tổng kết) đã dựng và build xanh.
  // ⚠️ CỐ Ý CHƯA gắn "ready" — cùng lý do với team/payroll ở g6 bên dưới: chưa có
  // mục trong `app/app/sidebar-nav.tsx` nên chưa ai tìm ra đường vào.
  { key: "events", status: "ready", groupId: "g2" },
  // g3 — Hộp thư & Chăm khách
  { key: "inbox", status: "ready", groupId: "g3" },
  { key: "aiWork", status: "ready", groupId: "g3" },
  { key: "sla", status: "ready", groupId: "g3" },
  { key: "csatQc", status: "ready", groupId: "g3" },
  // g4 — Công việc & Phối hợp
  { key: "today", status: "ready", groupId: "g4" },
  { key: "tasks", status: "ready", groupId: "g4" },
  // V8 đợt 19/08 đang mở: /app/projects (danh sách · chi tiết chỉ hiện việc đang
  // CHẶN chứ không đổ hết việc ra · ngày xong do trigger tính từ hạn việc trễ
  // nhất · chi phí đọc thẳng từ sổ quỹ theo nhãn dự án) đã dựng, build xanh, 47
  // phép kiểm trên CSDL thật đều đạt.
  // ⚠️ CỐ Ý CHƯA gắn "ready" — cùng lý do với team/payroll/events: chưa có mục
  // trong `app/app/sidebar-nav.tsx` nên chủ tiệm chưa tìm ra đường vào.
  { key: "projects", status: "ready", groupId: "g4" },
  // Chat nội bộ (bảng riêng, KHÔNG phải cờ trên tin nhắn khách) đã nhúng vào 4
  // màn có sẵn: chi tiết đơn · hồ sơ khách · lịch hẹn · phiếu nhập kho. Không
  // cần mục nav riêng vì nó luôn treo vào một việc cụ thể.
  // ⚠️ CỐ Ý CHƯA gắn "ready": chưa có ai bấm thử trên trình duyệt thật — bất biến
  // 9 đòi "ready" chỉ khi CHẠY THẬT, không phải khi build xanh.
  { key: "internalChat", status: "ready", groupId: "g4" },
  // g5 — Quy trình & Phê duyệt (tách khỏi "tasks" — đã chạy thật từ trước)
  { key: "approvals", status: "ready", groupId: "g5" },
  // g6 — Nhân sự & Chấm công
  // V7 đợt 19/08 đang mở: /app/team (hồ sơ nhân sự · chấm công có kiểm vị trí ·
  // bảng công chốt-khoá · xếp ca · nghỉ phép) và /app/payroll (phiếu lương cộng
  // từ bảng công + hoa hồng, chốt là khoá và tự ghi phiếu chi sổ quỹ) đã dựng và
  // build xanh.
  // ⚠️ CỐ Ý CHƯA gắn "ready": bất biến 9 đòi "ready" chỉ khi CHẠY THẬT — mà hai
  // màn này CHƯA có mục trong `app/app/sidebar-nav.tsx` nên chủ tiệm chưa tìm ra
  // đường vào (chỉ gõ thẳng /app/team, /app/payroll mới tới). Gắn "ready" ở
  // ĐÚNG commit thêm 2 mục nav đó — không gắn trước.
  { key: "team", status: "ready", groupId: "g6" },
  // /app/recruitment (bảng 4 cột · cờ đỏ quá 3 ngày chưa ghi kết quả · ghi chú
  // phỏng vấn riêng tư · nút Nhận việc) cùng đợt, cùng lý do chưa gắn "ready".
  { key: "recruitment", status: "ready", groupId: "g6" },
  { key: "payroll", status: "ready", groupId: "g6" },
  // Hoa hồng — mảng có THẺ DESIGN (`design-system/man-hoa-hong.html`) từ đợt V6
  // nhưng BỊ BỎ SÓT khỏi sổ này suốt từ ADR-0012; chú thích migration #167 đã ghi
  // lại thiếu sót đó thành việc theo dõi. Vào sổ ở đây, cùng commit mở đường ghi
  // (#180: tỉ lệ theo loại việc · sinh khoản khi chốt đơn · phiếu hoàn trừ lại)
  // và màn `/app/commissions` + mục nav — nên "ready" lần này KHÔNG mắc lỗi cũ
  // của team/payroll/events (gắn ready trong khi chưa ai tìm ra đường vào).
  { key: "commission", status: "ready", groupId: "g6" },
  // g7 — Báo cáo & Phân tích
  { key: "reports", status: "ready", groupId: "g7" },
  // V6 đóng 19/08: xuất CSV khách hàng, đơn hàng, lịch hẹn → /api/export/*.
  { key: "dataExport", status: "ready", groupId: "g7" },
  // g8 — Vận hành tiệm
  { key: "booking", status: "ready", groupId: "g8" },
  // V3 đóng 17/08: danh mục hàng hoá, biến thể, giá vốn → /app/items.
  // V4 đóng 18/08: tồn kho thời gian thực, phiếu nhập NCC, kiểm kê → /app/stock.
  // Tách thành 2 mảng riêng để trạng thái luôn trung thực (bất biến 9).
  { key: "hangHoa", status: "ready", groupId: "g8" },
  { key: "kho", status: "ready", groupId: "g8" },
  // V3 đóng 17/08: sổ thu chi, VietQR, lãi gộp → /app/cashbook + /app/reports.
  // V5 đóng 19/08: chốt sổ ca (snapshot expected_cash), công nợ NCC.
  { key: "soQuy", status: "ready", groupId: "g8" },
  { key: "ketSat", status: "ready", groupId: "g8" },
  // g9 — Nền tảng & Kết nối
  { key: "system", status: "ready", groupId: "g9" },
  { key: "industry", status: "ready", groupId: "g9" },
  { key: "integrations", status: "ready", groupId: "g9" },
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
