/** Kiểu dữ liệu + helper dùng chung cho màn Khách hàng (server + client). */

import type { Translator } from "@/i18n/config";

export type Tier = "new" | "regular" | "vip" | "dormant";

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

/**
 * Nhãn người phụ trách: "Tôi"/"Me" với chính mình, id rút gọn với người khác. `t` = namespace "contacts".
 * TODO đợt 2: bảng public.profiles (email/tên) — auth.users không đọc được từ client.
 */
export function ownerLabel(
  userId: string | null,
  currentUserId: string,
  t: Translator,
): string {
  if (!userId) return t("owner.unassigned");
  return userId === currentUserId
    ? t("owner.me")
    : t("owner.member", { id: userId.slice(0, 8) });
}
