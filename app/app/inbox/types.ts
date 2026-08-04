/** Kiểu dữ liệu + helper dùng chung cho màn Hộp thư (server + client). */

import type { Translator } from "@/i18n/config";

export type ConversationStatus = "open" | "pending" | "closed";

export type MessageRow = {
  id: string;
  conversation_id: string;
  direction: "in" | "out";
  sender_type: "user" | "agent" | "system" | "ai";
  sender_user_id: string | null;
  content: string | null;
  sent_at: string;
};

export type ContactTagRow = {
  tags: { id: string; name: string; color: string | null } | null;
};

export type ConversationRow = {
  id: string;
  contact_id: string | null;
  external_user_id: string | null;
  status: ConversationStatus;
  assignee_user_id: string | null;
  last_message_at: string | null;
  last_user_message_at: string | null;
  /** Cột sinh (migration #31): tin cuối cùng là của khách → chưa ai trả lời. */
  is_unanswered: boolean;
  unread_count: number;
  channels: { id: string; type: string; display_name: string | null } | null;
  contacts: {
    id: string;
    full_name: string;
    phone: string | null;
    email: string | null;
    contact_tags: ContactTagRow[];
  } | null;
  /** Tin cuối cùng (embed limit 1, order sent_at desc) — làm preview. */
  messages: {
    content: string | null;
    sender_type: string;
    direction: string;
  }[];
};

export type Member = { user_id: string; role: string };

/**
 * Bộ lọc Hộp thư — đọc/ghi qua tham số URL `?filter=`, nên link từ màn khác dẫn
 * thẳng vào đúng danh sách được (ví dụ Tổng quan → /app/inbox?filter=unanswered).
 *
 * "unanswered" và "open" DÙNG CHUNG ĐỊNH NGHĨA với ô cùng tên trên Tổng quan
 * (RPC dashboard_overview + inbox_counts, migration #31):
 *   unanswered — chưa xong VÀ tin cuối là của khách
 *   open       — chưa xong (Đang mở + Chờ; chỉ "Đã đóng" mới rơi ra)
 *   unassigned — chưa xong VÀ chưa ai nhận
 *   mine       — chưa xong VÀ mình phụ trách
 *   all        — TẤT CẢ, tính cả hội thoại đã đóng (con số duy nhất khác Tổng quan,
 *                và tab mang đúng tên "Tất cả")
 */
export const INBOX_FILTERS = [
  "unanswered",
  "open",
  "unassigned",
  "mine",
  "all",
] as const;
export type InboxFilter = (typeof INBOX_FILTERS)[number];

/** Mặc định mở Hộp thư = việc còn phải làm, không phải kho lưu trữ. */
export const DEFAULT_INBOX_FILTER: InboxFilter = "open";

export function parseInboxFilter(value: unknown): InboxFilter {
  return INBOX_FILTERS.includes(value as InboxFilter)
    ? (value as InboxFilter)
    : DEFAULT_INBOX_FILTER;
}

/** Số hội thoại mỗi bộ lọc — đếm bằng COUNT trong CSDL (RPC inbox_counts). */
export type InboxCounts = Record<InboxFilter, number>;

export const EMPTY_INBOX_COUNTS: InboxCounts = {
  unanswered: 0,
  open: 0,
  unassigned: 0,
  mine: 0,
  all: 0,
};

/** Số hội thoại tải mỗi lần bấm "Xem thêm". */
export const INBOX_PAGE_SIZE = 50;

/** Tên kênh là tên riêng (brand) — không dịch. */
export const CHANNEL_LABELS: Record<string, string> = {
  zalo_oa: "Zalo OA",
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok_shop: "TikTok Shop",
  livechat: "Live Chat",
  gmail: "Gmail",
};

/** Thứ tự trạng thái cho menu — nhãn dịch qua messages `inbox.status.*`. */
export const CONVERSATION_STATUSES: readonly ConversationStatus[] = [
  "open",
  "pending",
  "closed",
];

/** Chấm màu trạng thái theo luật: Mở = xanh dương h250 · Chờ = hổ phách h75 · Xong = xanh lá h150. */
export const STATUS_DOT: Record<ConversationStatus, string> = {
  open: "bg-status-open-foreground",
  pending: "bg-status-pending-foreground",
  closed: "bg-status-closed-foreground",
};

/** Tên hiển thị của hội thoại: contact.full_name, thiếu thì external_user_id rút gọn. `t` = namespace "inbox". */
export function conversationName(c: ConversationRow, t: Translator): string {
  if (c.contacts?.full_name) return c.contacts.full_name;
  const ext = c.external_user_id ?? "";
  return ext ? t("guest.name", { id: ext.slice(-6) }) : t("guest.unknown");
}

/** Map user_id → display_name từ public.profiles (RLS: chỉ thấy đồng nghiệp cùng tenant). */
export type MemberNames = Record<string, string>;

/**
 * Nhãn thành viên cho nút gán: "Tôi"/"Me" với chính mình, tên từ public.profiles
 * với người khác; thiếu profile (member đã rời) thì id rút gọn. `t` = namespace "inbox".
 */
export function memberLabel(
  userId: string,
  currentUserId: string,
  t: Translator,
  names: MemberNames,
): string {
  if (userId === currentUserId) return t("thread.me");
  return names[userId] || t("thread.member", { id: userId.slice(0, 8) });
}
