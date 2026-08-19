/**
 * Kiểu dùng chung cho màn Ưu đãi & Tích điểm (V6 retention, migration #157-159).
 * Tách file riêng vì `actions.ts` có "use server" — file đó chỉ được export
 * async function, không export được kiểu hay hằng số (Next.js 16 Turbopack).
 */

export type VoucherRow = {
  id: string;
  code: string;
  kind: "percent" | "amount";
  percentOff: number | null;
  amountOffVnd: number | null;
  /** Ba trần bắt buộc — CSDL không cho tạo mã thiếu bất kỳ cái nào. */
  maxUses: number;
  maxDiscountVnd: number;
  expiresAt: string;
  minOrderVnd: number;
  perCustomerLimit: number | null;
  newCustomerOnly: boolean;
  status: "active" | "paused";
  /** Ghi chú nội bộ — chỉ người trong tiệm đọc, khách không thấy. */
  note: string | null;
  /** Đếm từ bảng lượt dùng, KHÔNG lưu bộ đếm rời (bộ đếm rời luôn lệch). */
  usedCount: number;
  totalDiscountVnd: number;
};

export type LoyaltyRules = {
  isActive: boolean;
  /** "Mua 10.000đ = 1 điểm" */
  vndPerPoint: number;
  /** "1.000 điểm đổi 100.000đ" */
  redeemPointsUnit: number;
  redeemValueVnd: number;
  referralPoints: number;
  expireMonths: number;
};

/** Tổng NỢ điểm của tiệm — con số chủ tiệm không bao giờ tự tính. */
export type LoyaltyDebt = {
  diemChuaTieu: number;
  soKhach: number;
  diemSapHetHan: number;
  noVnd: number;
};

export const VOUCHER_LIMIT = 200;
