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
  lead_sources: { name: string } | null;
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
  created_at: string;
  updated_at: string;
  lead_sources: { id: string; name: string } | null;
  companies: { id: string; name: string } | null;
  contact_tags: ContactTagRow[];
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

export type LeadSource = { id: string; name: string };

/** Pill màu theo hạng (token luật): Mới xanh dương nhạt / Quen xanh lá / VIP vàng gold / Nguội xám — nhãn dịch qua messages `contacts.tier.*`. */
export const TIER_BADGE: Record<Tier, string> = {
  new: "bg-tier-new text-tier-new-foreground",
  regular: "bg-tier-regular text-tier-regular-foreground",
  vip: "bg-tier-vip text-tier-vip-foreground",
  dormant: "bg-tier-cold text-tier-cold-foreground",
};

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
