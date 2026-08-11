import { randomBytes } from "node:crypto";

/**
 * Tài khoản nhân viên không cần email (31.29, migration #62). Email đăng
 * nhập THẬT trong auth.users là email TỔNG HỢP suy từ SĐT + mã tiệm — miền
 * `staff.ifan.local` không định tuyến được, không ai gửi thư tới đó.
 *
 * MỘT nguồn sự thật: tạo tài khoản (team/actions.ts) và đăng nhập
 * (auth/actions.ts) đều gọi qua đúng hàm này — lệch một ký tự chuẩn hoá là
 * nhân viên tạo xong không đăng nhập được.
 */

/** Chỉ giữ chữ số — chấp khoảng trắng/gạch ngang người dùng gõ thêm. */
export function normalizeStaffPhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function staffSyntheticEmail(phone: string, tenantSlug: string): string {
  return `p${normalizeStaffPhone(phone)}.${tenantSlug.trim().toLowerCase()}@staff.ifan.local`;
}

/** 12 ký tự ngẫu nhiên (~72 bit) — đủ mạnh cho mật khẩu tạm, ép đổi ngay lần đầu vào. */
export function generateTempPassword(): string {
  return randomBytes(9).toString("base64url");
}
