import { createServiceClient } from "@/lib/supabase/service";
import { telegramSend } from "@/lib/notify/telegram";
import type { ChannelAdapter, OutboundMessage, SendResult } from "./types";

/**
 * Adapter Telegram cho Hộp thư (ADR-0013 mục 6) — nhân viên trả lời khách.
 *
 * `parseWebhook` cố ý KHÔNG làm gì: đường vào của Telegram nằm trọn trong CSDL
 * (`ingest_telegram_event` → hàng đợi → `process_telegram_events`), sao y đường
 * Zalo. Dựng thêm một đường phân tích ở tầng ứng dụng là có hai nơi cùng quyết
 * định tin nào hợp lệ — sớm muộn hai nơi lệch nhau.
 *
 * Token bot đọc từ Vault theo mã kênh, KHÔNG nhận qua tham số — đúng giao kèo
 * của interface: người gọi không bao giờ cầm bí mật.
 */
export const telegramAdapter: ChannelAdapter = {
  type: "telegram",

  async parseWebhook() {
    return [];
  },

  async send(message: OutboundMessage): Promise<SendResult> {
    const text = message.text?.trim();
    if (!text) return { ok: false, error: "empty_text", retryable: false };

    const service = createServiceClient();
    if (!service) {
      console.error("[telegram-adapter] thiếu SUPABASE_SERVICE_ROLE_KEY — không đọc được Vault");
      return { ok: false, error: "api_error", retryable: true };
    }

    const { data, error } = await service.rpc("get_telegram_channel_secrets", {
      p_channel_id: message.channelId,
    });
    if (error) {
      console.error("[telegram-adapter] đọc Vault lỗi:", error.message);
      return { ok: false, error: "api_error", retryable: true };
    }
    const token = (data as { bot_token?: string }[] | null)?.[0]?.bot_token;
    if (!token) return { ok: false, error: "not_connected", retryable: false };

    // Dùng lại đúng hàm gửi đã có (cắt khúc 4096 ký tự, đổi markdown sang HTML,
    // và tự gửi lại bản chữ thô khi HTML hỏng) thay vì viết lại lần hai.
    const ok = await telegramSend(token, message.externalUserId, text);
    if (!ok) return { ok: false, error: "api_error", retryable: true };

    // Telegram trả về mã tin của bản tin vừa gửi, nhưng `telegramSend` chỉ báo
    // được/không. Tin GỬI ĐI không cần chống trùng (không ai gọi lại nó), nên
    // đặt mã theo thời điểm là đủ và không phải sửa hàm gửi đang chạy ổn.
    return { ok: true, externalMessageId: `tg-out-${Date.now()}` };
  },
};
