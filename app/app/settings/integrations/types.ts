/**
 * Kiểu dùng chung cho màn Cài đặt → Tích hợp (V6 integrations, migration #160-161).
 * Tách file riêng vì `actions.ts` có "use server" — file đó chỉ được export
 * async function, không export được kiểu hay hằng số (Next.js 16 Turbopack).
 *
 * KHÔNG import gì từ `lib/integrations/api-key.ts` ở đây: file đó nạp
 * `node:crypto` ngay đầu file, mà `integrations-view.tsx` (client) import file
 * này — kéo theo là hỏng gói trình duyệt. Hằng số bên đó (QUYEN_HOP_LE,
 * NGAY_COI_LA_BO_QUEN) đi vào màn hình qua `page.tsx`/`queries.ts` (đều chạy ở
 * máy chủ), không nhân bản sang đây thành nguồn sự thật thứ hai.
 */

export type ApiKeyRow = {
  id: string;
  name: string;
  /** 'ifan_sk_7Kd9' — bản gốc KHÔNG bao giờ được lưu (quyết định 1 thẻ design). */
  keyPrefix: string;
  keySuffix: string;
  scopes: string[];
  lastUsedAt: string | null;
  callCount: number;
  createdAt: string;
  /**
   * Chưa dùng lần nào HOẶC im quá `NGAY_COI_LA_BO_QUEN` ngày. Tính ở máy chủ
   * (queries.ts) để chỉ có MỘT chỗ biết ngưỡng — màn hình chỉ việc vẽ nhãn.
   */
  boQuen: boolean;
};

export type WebhookRow = {
  id: string;
  name: string;
  url: string;
  eventTypes: string[];
  status: "active" | "paused";
  /** 0 = khoẻ. >0 = đang hỏng, kèm `lastError` để nói RÕ hỏng vì gì. */
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
};

/**
 * Loại sự kiện cho đường báo đăng ký — 8 loại phổ biến nhất trong
 * `docs/EVENT_CATALOG.md`, và TẤT CẢ đều đang thật sự được phát bởi trigger
 * (`orders_emit_events`, `order_payments_emit_event`, `appointments_emit_events`,
 * `contacts_emit_events`, `deals_emit_events`).
 *
 * Cố ý KHÔNG mời người dùng đăng ký loại chưa có ai phát: đường báo im lặng mãi
 * mà người dùng tưởng mình đã nối xong là đúng thứ tệ nhất mà luật 3 của thẻ
 * design muốn tránh.
 */
export const LOAI_SU_KIEN = [
  "order.created",
  "order.completed",
  "order.cancelled",
  "payment.received",
  "contact.created",
  "appointment.booked",
  "appointment.done",
  "appointment.cancelled",
] as const;

export type LoaiSuKien = (typeof LOAI_SU_KIEN)[number];

/** Trần danh sách — chạm trần thì màn hình PHẢI nói ra, không cắt ngầm. */
export const KHOA_LIMIT = 50;
export const DUONG_BAO_LIMIT = 50;
