/**
 * Chat nội bộ (thẻ design `man-chat-noi-bo.html`, migration #169).
 *
 * File này CỐ Ý tách khỏi `actions.ts`: file có directive `"use server"` chỉ
 * được export async function (cổng kiểm `scripts/soat-use-server-exports.mjs`),
 * nên hằng số và kiểu phải ở đây.
 */

/**
 * Tập ĐÓNG, đúng bốn thứ thẻ liệt kê. Trùng khít `check` của cột
 * `internal_threads.entity_type` — thêm giá trị ở một bên mà quên bên kia thì
 * người dùng gõ xong mới ăn lỗi CSDL.
 */
export type ChatEntityType = "order" | "appointment" | "contact" | "stock_doc";

/** Cửa sổ sửa tin: 15 phút, y hệt trigger `internal_messages_sua_15_phut`. */
export const EDIT_WINDOW_MS = 15 * 60 * 1000;

/** Trần tin tải một lần — lấy MỚI NHẤT trước, cũ hơn thì báo bằng dòng chạm trần. */
export const MESSAGE_LIMIT = 200;

export const MAX_BODY_LENGTH = 4000;

export type ChatMessage = {
  id: string;
  senderUserId: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
};

export type ChatMember = {
  userId: string;
  displayName: string;
};

export type ChatLoad = {
  error: string | null;
  messages: ChatMessage[];
  members: ChatMember[];
  currentUserId: string | null;
  /** Vai `viewer` đọc được nhưng không nhắn được (policy insert loại viewer). */
  canWrite: boolean;
  /** Chạm trần MESSAGE_LIMIT ⇒ còn tin cũ hơn không nằm trong danh sách này. */
  atLimit: boolean;
};

/**
 * Ai bị gọi tên trong một tin — suy ra TỪ CHÍNH CHỮ đã gõ (`@Tên`), không phải
 * từ một danh sách chọn riêng. Một nguồn duy nhất nên không bao giờ có cảnh
 * "màn hình hiện @Hương mà người nhận thông báo lại là Tuấn".
 *
 * So khớp tên DÀI TRƯỚC: "Mai Anh" phải thắng "Mai" khi cả hai cùng là thành viên.
 */
export function detectMentions(body: string, members: ChatMember[]): string[] {
  const lower = body.toLowerCase();
  const sorted = [...members].sort((a, b) => b.displayName.length - a.displayName.length);
  const hit = new Set<string>();
  const taken: [number, number][] = [];
  for (const member of sorted) {
    const needle = `@${member.displayName.toLowerCase()}`;
    let from = 0;
    for (;;) {
      const at = lower.indexOf(needle, from);
      if (at === -1) break;
      const overlaps = taken.some(([start, end]) => at < end && at + needle.length > start);
      if (!overlaps) {
        taken.push([at, at + needle.length]);
        hit.add(member.userId);
        break;
      }
      from = at + 1;
    }
  }
  return [...hit];
}
