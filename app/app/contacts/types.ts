/** Kiểu dữ liệu + helper dùng chung cho màn Khách hàng (server + client). */

import type { Translator } from "@/i18n/config";

export type Tier = "new" | "regular" | "vip" | "dormant";

/** Band nhiệt của lead score (spec CRM V1): Nóng ≥70 / Ấm 40–69 / Lạnh <40. */
export type ScoreBand = "hot" | "warm" | "cold";

export function scoreBand(score: number): ScoreBand {
  if (score >= 70) return "hot";
  if (score >= 40) return "warm";
  return "cold";
}

/** Pill màu theo band nhiệt — chỉ dùng token có sẵn trong globals.css. */
export const SCORE_BADGE: Record<ScoreBand, string> = {
  hot: "bg-destructive/10 text-destructive",
  warm: "bg-status-pending text-status-pending-foreground",
  cold: "bg-tier-cold text-tier-cold-foreground",
};

export type ActivityType = "note" | "call" | "meeting" | "task";

export type TagRow = { id: string; name: string; color: string | null };

export type ContactTagRow = { tags: TagRow | null };

/** Dòng trong bảng danh sách khách. */
export type ContactRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  tier: Tier;
  lead_score: number;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
  lead_sources: { name: string; i18n_key: string | null } | null;
  contact_tags: ContactTagRow[];
};

/** Hồ sơ khách đầy đủ cho trang chi tiết. */
export type ContactDetailRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  tier: Tier;
  lead_score: number;
  owner_id: string | null;
  source_id: string | null;
  company_id: string | null;
  /** VNĐ tích lũy từ deal thắng — máy phân hạng ghi (migration #19). */
  total_revenue: number;
  last_interaction_at: string | null;
  created_at: string;
  updated_at: string;
  lead_sources: { id: string; name: string; i18n_key: string | null } | null;
  companies: { id: string; name: string } | null;
  contact_tags: ContactTagRow[];
  /** Trường tự khai theo pack ngành (V1a — chỉ lưu + hiện trên hồ sơ). */
  custom: Record<string, string> | null;
};

export type ActivityRow = {
  id: string;
  type: ActivityType;
  subject: string | null;
  body: string | null;
  owner_id: string;
  due_at: string | null;
  done_at: string | null;
  created_at: string;
};

/** Hội thoại inbox gắn với khách — hiện trong dòng thời gian, link sang /app/inbox. */
export type ConversationLite = {
  id: string;
  status: string;
  last_message_at: string | null;
  created_at: string;
  channels: { type: string; display_name: string | null } | null;
};

/** `i18n_key` = khóa dịch tên nguồn CÀI SẴN (migration #36); null = tên chủ tiệm tự đặt. */
export type LeadSource = { id: string; name: string; i18n_key: string | null };

/** Pill màu theo hạng (token luật): Mới xanh dương nhạt / Quen xanh lá / VIP vàng gold / Nguội xám — nhãn dịch qua messages `contacts.tier.*`. */
export const TIER_BADGE: Record<Tier, string> = {
  new: "bg-tier-new text-tier-new-foreground",
  regular: "bg-tier-regular text-tier-regular-foreground",
  vip: "bg-tier-vip text-tier-vip-foreground",
  dormant: "bg-tier-cold text-tier-cold-foreground",
};

export const TIERS: readonly Tier[] = ["new", "regular", "vip", "dormant"];

/** Số ngày kể từ lần liên hệ gần nhất (chưa có thì tính từ ngày thêm khách vào). */
export function silentDays(
  lastInteractionAt: string | null,
  createdAt: string,
  now: number = Date.now(),
): number {
  const since = new Date(lastInteractionAt ?? createdAt).getTime();
  return Math.max(0, Math.floor((now - since) / 86_400_000));
}

/**
 * Một câu giải thích VÌ SAO khách đang ở hạng này — máy xếp hạng thì phải nói
 * được lý do, nhất là hạng Nguội. `t` = translator namespace "contacts.tierWhy".
 */
export function tierReason(
  tier: Tier,
  wonDeals: number,
  days: number,
  t: Translator,
): string {
  if (tier === "dormant") return t("dormant", { days });
  if (wonDeals === 0) return t("noPurchase");
  return t("purchased", { count: wonDeals });
}

/**
 * Chuẩn hóa chuỗi tìm kiếm khớp cột contacts.search_text
 * (DB sinh bằng immutable_unaccent + lower).
 * Lưu ý: NFD KHÔNG tách được chữ đ/Đ — phải thay thủ công.
 */
export function normalizeSearch(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .trim();
}

/** Chuẩn hóa SĐT: bỏ khoảng trắng / dấu chấm / gạch / ngoặc, +84 → 0. */
export function normalizePhone(raw: string): string {
  let p = raw.replace(/[\s.\-()]/g, "");
  if (p.startsWith("+84")) p = `0${p.slice(3)}`;
  return p;
}

// ---------------------------------------------------------- Nhập Excel
// Khai báo dùng chung client + server. Phần đọc/ghi file thật nằm ở excel.ts
// (chỉ chạy server: kéo theo thư viện Node).

/** Trần đợt 1 — nói rõ trong UI. File lớn hơn cần worker nền (GĐ2). */
export const IMPORT_MAX_ROWS = 2000;
export const IMPORT_MAX_FILE_BYTES = 2 * 1024 * 1024;

export const IMPORT_FIELDS = [
  "fullName",
  "phone",
  "email",
  "source",
  "tags",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

/** Cột nguồn cho từng trường; -1 = không dùng cột nào. */
export type ColumnMapping = Record<ImportField, number>;

export const EMPTY_MAPPING: ColumnMapping = {
  fullName: -1,
  phone: -1,
  email: -1,
  source: -1,
  tags: -1,
};

/** Lý do một dòng không nhập được — key dịch trong `contacts.importExport.reason.*`. */
export type RowIssue =
  | "nameRequired"
  | "phoneInvalid"
  | "emailInvalid"
  | "duplicateInFile"
  | "duplicateExisting";

export type RowProblem = { rowNumber: number; label: string; reason: RowIssue };

/** Map user_id → display_name từ public.profiles (RLS: chỉ thấy đồng nghiệp cùng tenant). */
export type MemberNames = Record<string, string>;

/**
 * Nhãn người phụ trách: "Tôi"/"Me" với chính mình, tên từ public.profiles
 * với người khác; thiếu profile (member đã rời) thì id rút gọn. `t` = namespace "contacts".
 */
export function ownerLabel(
  userId: string | null,
  currentUserId: string,
  t: Translator,
  names: MemberNames,
): string {
  if (!userId) return t("owner.unassigned");
  if (userId === currentUserId) return t("owner.me");
  return names[userId] || t("owner.member", { id: userId.slice(0, 8) });
}
