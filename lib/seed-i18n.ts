import type { Translator } from "@/i18n/config";

/**
 * Tên CÀI SẴN trong CSDL của từng tiệm (bước bán hàng, lý do thua, nguồn khách,
 * tên cam kết SLA) — dịch được, mà không giẫm lên tên chủ tiệm tự đặt.
 *
 * Cách hoạt động (migration #36): mỗi hàng seed có thêm cột `i18n_key` NẰM CẠNH
 * cột `name`.
 *   · Có `i18n_key` → hàng còn nguyên tên cài sẵn → dịch theo ngôn ngữ đang xem.
 *   · Không có      → tên do chủ tiệm đặt (hoặc hàng cũ chưa gắn khóa) → in
 *                     nguyên văn `name`, y như trước.
 * Chủ tiệm đổi tên thì trigger trong DB tự xoá `i18n_key` ⇒ TÊN CỦA HỌ THẮNG
 * vĩnh viễn. Không có đường ghi nào lách được.
 */

/**
 * Khóa mà bản web NÀY biết render (phải khớp namespace `seed` trong
 * messages/*.json). DB mới hơn web (khóa lạ) → rơi về `name` đã lưu thay vì để
 * next-intl ném lỗi làm sập cả màn hình.
 */
const KNOWN_SEED_KEYS = new Set([
  "stage.new",
  "stage.consulting",
  "stage.scheduled",
  "stage.won",
  "stage.returning",
  "stage.lost",
  "lostReason.price",
  "lostReason.competitor",
  "lostReason.noNeed",
  "lostReason.unreachable",
  "lostReason.other",
  "source.zalo",
  "source.facebook",
  "source.referral",
  "source.form",
  "source.other",
  "sla.conversationFirstReply",
  "sla.dealNextActionOverdue",
  "sla.activityDueOverdue",
]);

/** `tSeed` = translator namespace "seed". */
export function seedLabel(
  i18nKey: string | null | undefined,
  name: string | null | undefined,
  tSeed: Translator,
): string {
  const fallback = name ?? "";
  if (!i18nKey || !KNOWN_SEED_KEYS.has(i18nKey)) return fallback;
  return tSeed(i18nKey);
}
