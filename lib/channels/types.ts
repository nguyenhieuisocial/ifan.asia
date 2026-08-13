/**
 * Channel Adapter — kỷ luật kiến trúc từ ngày 1 (Quy hoạch A2):
 * KHÔNG module nào gọi thẳng API Zalo/Meta/TikTok. Mọi kênh đi qua interface này.
 * Zalo OA là adapter đầu tiên (GĐ1); LINE/WhatsApp về sau chỉ cần thêm adapter mới.
 */

export type ChannelType =
  | "zalo_oa"
  | "facebook"
  | "instagram"
  | "tiktok_shop"
  | "livechat"
  | "gmail"
  | "telegram";

export type InboundMessage = {
  channelType: ChannelType;
  /** ID kết nối kênh của tenant (bảng channels) */
  channelId: string;
  /** ID tin nhắn phía nền tảng — dùng làm idempotency key */
  externalMessageId: string;
  /** ID người dùng phía nền tảng (Zalo user id...) */
  externalUserId: string;
  direction: "in" | "out";
  sentAt: string; // ISO
  text?: string;
  attachments?: { type: string; url?: string; payload?: unknown }[];
  raw: unknown;
};

export type OutboundMessage = {
  channelId: string;
  externalUserId: string;
  text?: string;
  attachments?: { type: string; url?: string; payload?: unknown }[];
};

export type SendResult =
  | { ok: true; externalMessageId: string }
  | { ok: false; error: string; retryable: boolean };

export interface ChannelAdapter {
  readonly type: ChannelType;
  /** Parse + verify webhook payload thành InboundMessage[] (chưa đụng DB). */
  parseWebhook(headers: Record<string, string>, body: unknown): Promise<InboundMessage[]>;
  /** Gửi tin ra kênh. Token lấy từ Vault theo channelId — không nhận token qua tham số. */
  send(message: OutboundMessage): Promise<SendResult>;
}
