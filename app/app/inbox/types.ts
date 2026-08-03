/** Kiểu dữ liệu + helper dùng chung cho màn Hộp thư (server + client). */

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

export const CHANNEL_LABELS: Record<string, string> = {
  zalo_oa: "Zalo OA",
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok_shop: "TikTok Shop",
  livechat: "Live Chat",
  gmail: "Gmail",
};

export const STATUS_LABELS: Record<ConversationStatus, string> = {
  open: "Đang mở",
  pending: "Chờ xử lý",
  closed: "Đã đóng",
};

export const STATUS_DOT: Record<ConversationStatus, string> = {
  open: "bg-emerald-500",
  pending: "bg-amber-500",
  closed: "bg-zinc-400",
};

/** Tên hiển thị của hội thoại: contact.full_name, thiếu thì external_user_id rút gọn. */
export function conversationName(c: ConversationRow): string {
  if (c.contacts?.full_name) return c.contacts.full_name;
  const ext = c.external_user_id ?? "";
  return ext ? `Khách ${ext.slice(-6)}` : "Khách chưa định danh";
}

/**
 * Nhãn thành viên cho nút gán: "Tôi" với chính mình, id rút gọn với người khác.
 * TODO đợt 2: bảng public.profiles (email/tên) — auth.users không đọc được từ client.
 */
export function memberLabel(userId: string, currentUserId: string): string {
  return userId === currentUserId ? "Tôi" : `NV ${userId.slice(0, 8)}`;
}
