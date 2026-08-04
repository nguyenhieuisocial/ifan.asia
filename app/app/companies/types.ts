/** Kiểu dữ liệu + helper dùng chung cho màn Công ty (server + client). */

import type { DealStatus, StageKind } from "../deals/types";

/**
 * Hộp thư miễn phí: email đuôi này là email CÁ NHÂN, không suy ra được công ty.
 * Danh sách cố tình ngắn — chỉ những đuôi phổ biến với người dùng Việt + quốc tế.
 * Bổ sung khi gặp thực tế, KHÔNG cố phủ hết internet.
 */
export const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "live.com",
  "proton.me",
  "yandex.com",
  "zoho.com",
  "aol.com",
  "gmx.com",
  "mail.ru",
  "qq.com",
  "163.com",
]);

/** Đuôi email đã chuẩn hóa (thường, bỏ khoảng trắng); null nếu email không hợp lệ. */
export function emailDomain(email: string | null | undefined): string | null {
  const at = (email ?? "").trim().toLowerCase().lastIndexOf("@");
  if (at < 1) return null;
  const domain = (email as string).trim().toLowerCase().slice(at + 1);
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) ? domain : null;
}

/**
 * Đuôi email CÔNG VIỆC — cơ sở duy nhất để tự động nối khách vào công ty.
 * Trả null với hộp thư miễn phí (an@gmail.com KHÔNG suy ra công ty "gmail.com").
 */
export function workEmailDomain(email: string | null | undefined): string | null {
  const domain = emailDomain(email);
  return domain && !FREE_EMAIL_DOMAINS.has(domain) ? domain : null;
}

/** MST như người dùng gõ → chỉ chữ số (bỏ gạch nối dạng 0101243150-001, khoảng trắng…). */
export function normalizeTaxCode(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** MST Việt Nam hợp lệ: 10 số (đơn vị chính) hoặc 13 số (10 + 3 số chi nhánh). */
export function isValidTaxCode(digits: string): boolean {
  return digits.length === 10 || digits.length === 13;
}

/** Hiển thị MST 13 số theo thói quen VN: 0101243150-001. */
export function formatTaxCode(digits: string | null): string | null {
  if (!digits) return null;
  return digits.length === 13 ? `${digits.slice(0, 10)}-${digits.slice(10)}` : digits;
}

/** Số liệu công ty từ view public.company_stats (migration #14). */
export type CompanyStats = {
  company_id: string;
  contact_count: number;
  open_deal_count: number;
  won_value_vnd: number;
};

/** Dòng trong bảng danh sách Công ty (đã ghép số liệu). */
export type CompanyRow = {
  id: string;
  name: string;
  email_domain: string | null;
  tax_code: string | null;
  created_at: string;
  updated_at: string;
  stats: CompanyStats;
};

export type CompanyDetailRow = {
  id: string;
  name: string;
  email_domain: string | null;
  tax_code: string | null;
  phone: string | null;
  address: string | null;
  created_at: string;
  updated_at: string;
};

/** Khách thuộc công ty — list trong hồ sơ công ty. */
export type CompanyContactRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  lead_score: number;
};

/** Cơ hội của công ty (quy chiếu qua khách thuộc công ty). */
export type CompanyDealRow = {
  id: string;
  title: string;
  value_vnd: number;
  status: DealStatus;
  pipeline_stages: { name: string; kind: StageKind } | null;
};

/** Ô gợi ý công ty trong form khách. */
export type CompanyOption = {
  id: string;
  name: string;
  email_domain: string | null;
};
