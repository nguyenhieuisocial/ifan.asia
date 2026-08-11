/**
 * Industry Pack Engine (migration #60/#61, Quy hoạch hợp nhất mục 11/15/16) —
 * pack là DỮ LIỆU (bảng industry_packs), KHÔNG hardcode nhánh code theo ngành.
 * Danh sách 8 key dưới đây chỉ để validate input phía client/Zod trước khi
 * gọi RPC — nguồn sự thật thật sự là bảng `industry_packs` (RPC
 * apply_industry_pack tự kiểm `exists` trước khi áp, không tin danh sách này).
 *
 * Ánh xạ với 4 giá trị cũ (migration #12, đã data-migrate trong #60):
 *   spa_clinic → spa · retail_online → shop · education/other giữ nguyên.
 *
 * Label/mô tả dịch ở messages/*.json namespace "common.industries".
 */
export const INDUSTRIES = [
  "spa", // V-A Spa/Salon/Nail — mũi nhọn, làm sâu
  "shop", // V-B Shop online — mũi nhọn, làm sâu
  "kham", // V-C Phòng khám/Nha — mũi nhọn, làm sâu
  "pet", // V-D Pet — mũi nhọn, đủ-dùng
  "fnb", // V-E F&B nhỏ — mũi nhọn, đủ-dùng
  "retail", // V-F Retail cửa hàng — mũi nhọn, đủ-dùng
  "education", // legacy (trước #60 là spa_clinic/education/retail_online/other) — giữ nguyên nội dung cũ
  "other", // pack trung tính, mặc định
] as const;

export type Industry = (typeof INDUSTRIES)[number];

/** 6 ngành mũi nhọn theo Quy hoạch mục 11 — dùng khi cần tách khỏi 2 pack legacy. */
export const SPOTLIGHT_INDUSTRIES = [
  "spa",
  "shop",
  "kham",
  "pet",
  "fnb",
  "retail",
] as const satisfies readonly Industry[];
