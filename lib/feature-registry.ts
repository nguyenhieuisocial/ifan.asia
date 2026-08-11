/**
 * DANH SÁCH NGUỒN duy nhất của lưới 6 trục trên landing (luật D1 — xây một lần).
 *
 * Tính năng xây xong: đổi status 1 dòng — CẤM sửa layout.
 *
 * - `status` PHẢI khớp docs/SU-THAT-SAN-PHAM.md (sổ sự thật): "ready" chỉ khi
 *   tính năng CHẠY THẬT hôm nay; "lắp sẵn chờ bên ngoài" / "một phần" / chưa làm
 *   đều là "soon" — huy hiệu không được nói dối.
 * - Nhãn hiển thị: i18n key `landing.features.<key>` (messages/vi.json + en.json).
 * - Huy hiệu vẽ bởi components/landing/status-badge.tsx (token status-closed /
 *   status-pending) — không chế màu thứ ba, không có trạng thái "beta" lấp lửng.
 */

export const TRUCS = ["ban", "cham", "viec", "tien", "baocao", "ai"] as const;

export type Truc = (typeof TRUCS)[number];

export type FeatureStatus = "ready" | "soon";

export interface LandingFeature {
  /** Khóa i18n: landing.features.<key> */
  key: string;
  truc: Truc;
  status: FeatureStatus;
}

export const FEATURE_REGISTRY: LandingFeature[] = [
  // Bán hàng
  { key: "inbox", truc: "ban", status: "ready" },
  { key: "liveChat", truc: "ban", status: "ready" },
  { key: "kanban", truc: "ban", status: "ready" },
  { key: "quotes", truc: "ban", status: "soon" },
  // Chăm khách
  { key: "todaySla", truc: "cham", status: "ready" },
  // Sổ sự thật xếp Zalo Bot ở "LẮP SẴN CHỜ BÊN NGOÀI" (máy xong, chờ founder
  // dán token) → soon, dù thẻ design vẽ nháp "Sẵn sàng". Token dán xong thì
  // đổi đúng 1 dòng này.
  { key: "zaloBot", truc: "cham", status: "soon" },
  { key: "followUp", truc: "cham", status: "ready" },
  { key: "zaloOa", truc: "cham", status: "soon" },
  // Việc trong tiệm
  { key: "tasks", truc: "viec", status: "ready" },
  { key: "approvals", truc: "viec", status: "ready" },
  { key: "forms", truc: "viec", status: "ready" },
  { key: "kpi", truc: "viec", status: "soon" },
  // Tiền
  { key: "invoices", truc: "tien", status: "ready" },
  { key: "payments", truc: "tien", status: "ready" },
  { key: "cashbook", truc: "tien", status: "soon" },
  { key: "inventory", truc: "tien", status: "soon" },
  // Báo cáo
  { key: "sources", truc: "baocao", status: "ready" },
  { key: "adsProfit", truc: "baocao", status: "ready" },
  { key: "lostReasons", truc: "baocao", status: "ready" },
  { key: "forecast", truc: "baocao", status: "soon" },
  // AI & tự động
  { key: "playbooks", truc: "ai", status: "ready" },
  { key: "aiAssist", truc: "ai", status: "soon" },
  { key: "aiInsights", truc: "ai", status: "soon" },
];
