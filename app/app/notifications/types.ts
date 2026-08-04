/**
 * Kiểu dữ liệu + quy ước của Trung tâm thông báo.
 *
 * Bảng `notifications` (migration #2) là bảng DÙNG CHUNG cho mọi module:
 * `type` là text tự do, ai ghi thì đặt tên đó. Đợt này có đúng 3 nguồn ghi thật:
 *   - 'sla'      → process_sla_timers()      (migration #17, sửa link ở #20)
 *   - 'handoff'  → handoff_conversation()    (migration #24)
 *   - 'workflow' → execute_workflow_run()    (migration #15, hành động `notify`)
 * Nguồn mới trong tương lai rơi vào nhóm "other" — vẫn hiện đủ, chỉ là nhãn chung.
 */

import type { Locale, Translator } from "@/i18n/config";
import { formatDateTime } from "@/lib/format";

/** Nhóm loại CÓ BỘ LỌC riêng trên màn danh sách (đúng 3 nguồn đang ghi thật). */
export const NOTIFICATION_TYPES = ["sla", "handoff", "workflow"] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Khóa nhãn i18n: 3 loại đã biết + "other" cho nguồn chưa từng thấy. */
export type NotificationTypeKey = NotificationType | "other";

export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export function typeKey(type: string): NotificationTypeKey {
  return (NOTIFICATION_TYPES as readonly string[]).includes(type)
    ? (type as NotificationType)
    : "other";
}

/**
 * Chỉ đi theo link NỘI BỘ.
 *
 * `link` của thông báo workflow do người dùng tự soạn trong cài đặt Quy trình
 * (`wf_render` chèn biến vào chuỗi tự do) — nghĩa là một người trong tiệm có thể
 * đặt `https://...` rồi thông báo trở thành bàn đạp lừa đồng nghiệp bấm ra ngoài.
 * Vì vậy chỉ nhận đường dẫn bắt đầu bằng "/" và KHÔNG phải "//" (dạng
 * protocol-relative `//evil.com` vẫn ra ngoài). Link không hợp lệ → dòng thông
 * báo vẫn hiện đủ nội dung, chỉ là không bấm đi đâu được.
 */
export function safeInternalLink(link: string | null): string | null {
  if (!link) return null;
  const trimmed = link.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  return trimmed;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/**
 * "5 phút trước" — cách nói của người Việt khi liếc danh sách thông báo.
 *
 * Khác `formatRelative` của Hộp thư (kiểu Zalo: "5 phút", "Hôm qua", "Thứ 4"):
 * ở đây thông báo là VIỆC ĐANG CHỜ nên độ TƯƠI mới là thứ cần đọc — có hậu tố
 * "trước" cho rõ. Quá 24 giờ thì con số tương đối hết ý nghĩa vận hành → in
 * ngày giờ thật.
 *
 * `now` LUÔN truyền vào (không gọi Date.now() trong render) để HTML server và
 * lần render đầu ở trình duyệt giống hệt nhau — tránh cảnh báo hydration.
 */
export function relativeAgo(
  date: string,
  locale: Locale,
  t: Translator,
  now: number,
): string {
  const diff = now - new Date(date).getTime();
  if (diff < MINUTE_MS) return t("justNow");
  if (diff < HOUR_MS) {
    return t("minutesAgo", { minutes: Math.floor(diff / MINUTE_MS) });
  }
  if (diff < DAY_MS) return t("hoursAgo", { hours: Math.floor(diff / HOUR_MS) });
  return formatDateTime(date, locale);
}
