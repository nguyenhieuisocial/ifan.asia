/**
 * Kiểu dữ liệu + quy ước của Trung tâm thông báo.
 *
 * Bảng `notifications` (migration #2) là bảng DÙNG CHUNG cho mọi module:
 * `type` là text tự do, ai ghi thì đặt tên đó. Đợt này có đúng 4 nguồn ghi thật:
 *   - 'sla'      → process_sla_timers()      (migration #17, sửa link ở #20)
 *   - 'handoff'  → handoff_conversation()    (migration #24)
 *   - 'workflow' → execute_workflow_run()    (migration #15, hành động `notify`)
 *   - 'approval' → wf_request_approval() + wf_decide_approval() (migration #29)
 * Nguồn mới trong tương lai rơi vào nhóm "other" — vẫn hiện đủ, chỉ là nhãn chung.
 */

import type { Locale, Translator } from "@/i18n/config";
import { formatDateTime } from "@/lib/format";
import { seedLabel } from "@/lib/seed-i18n";

/** Nhóm loại CÓ BỘ LỌC riêng trên màn danh sách (đúng 4 nguồn đang ghi thật). */
export const NOTIFICATION_TYPES = ["sla", "handoff", "approval", "workflow"] as const;

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
  /** Khóa dịch (migration #32). Rỗng → dùng thẳng `title`/`body` đã lưu. */
  title_key: string | null;
  body_key: string | null;
  params: Record<string, unknown> | null;
};

/**
 * Khóa dịch mà bản web NÀY biết render (phải khớp `notifications.messages.*`
 * trong messages/*.json). Thêm nguồn ghi mới thì thêm khóa vào đây.
 */
const KNOWN_MESSAGE_KEYS = new Set([
  "sla.warning.title",
  "sla.warning.body",
  "sla.breached.title",
  "sla.breached.body",
  "sla.window.title",
  "sla.window.body",
  "handoff.title",
  "handoff.body",
  "handoff.bodyWaited",
  "approval.pending.title",
  "approval.approved.title",
  "approval.rejected.title",
  "approval.rejected.body",
  "billing.planChanged.title",
  "billing.planChanged.body",
  "billing.paymentSucceeded.title",
  "billing.paymentSucceeded.body",
  "billing.trialEnding.title",
  "billing.trialEnding.body",
  "billing.trialEnded.title",
  "billing.trialEnded.body",
  "billing.pastDue.title",
  "billing.pastDue.body",
  "billing.suspended.title",
  "billing.suspended.body",
  // Đổi người chịu trách nhiệm của một VIỆC (migration #219, việc #202) — hai
  // loại: người MỚI nhận việc, và người CŨ vừa mất việc khỏi danh sách của mình.
  "task.ownerAssigned.title",
  "task.ownerAssigned.body",
  "task.ownerRemoved.title",
  "task.ownerRemoved.body",
]);

/**
 * Chữ hiển thị của một thông báo.
 *
 * Thông báo do hệ thống sinh được ghi kèm KHÓA + tham số nên dịch được sang
 * ngôn ngữ người đang xem. Thông báo cũ, và những nguồn ghi chưa chuyển đổi,
 * không có khóa → hiện đúng chuỗi đã lưu (tiếng Việt) như trước, không mất chữ.
 *
 * Tham số nào là NGƯỜI DÙNG TỰ ĐẶT (tên khách, tiêu đề cơ hội, tên cam kết)
 * thì chèn nguyên văn — không bao giờ dịch.
 *
 * `t` = translator namespace "notifications.messages".
 * `tSeed` = translator namespace "seed" — dùng cho TÊN CAM KẾT cài sẵn. Cam kết
 * mà chủ tiệm đã tự đặt tên thì không có khóa → in đúng tên họ đặt.
 */
export function notificationText(
  row: NotificationRow,
  t: Translator,
  tSeed: Translator,
  key: "title" | "body",
): string | null {
  const messageKey = key === "title" ? row.title_key : row.body_key;
  const stored = key === "title" ? row.title : row.body;
  // Khóa lạ (bản web cũ hơn nguồn ghi) → dùng chuỗi đã lưu, KHÔNG để next-intl
  // ném lỗi làm sập cả danh sách thông báo.
  if (!messageKey || !KNOWN_MESSAGE_KEYS.has(messageKey)) return stored;

  const p = row.params ?? {};
  const str = (name: string) =>
    typeof p[name] === "string" ? (p[name] as string).trim() : "";
  const num = (name: string) => (typeof p[name] === "number" ? p[name] : 0);
  const customer = str("customer");
  const subject = str("subject");
  // Truyền THỪA tham số là an toàn (ICU bỏ qua cái không dùng); truyền THIẾU mới
  // ném lỗi. Nên gom hết vào một chỗ thay vì rẽ nhánh theo từng khóa.
  return t(messageKey, {
    // Hội thoại chưa định danh: nói "khách chưa lưu tên", KHÔNG in mã nội bộ
    target:
      subject && customer
        ? `${subject} — ${customer}`
        : subject || customer || t("unknownCustomer"),
    policy: seedLabel(str("policy_key"), str("policy"), tSeed),
    duration: formatDuration(num("minutes"), t),
    // Tên khách / tên người bàn giao / lý do / tên phiếu là chữ NGƯỜI DÙNG tự
    // nhập → chèn nguyên văn. Rỗng thì thay bằng nhãn dự phòng đúng ngôn ngữ.
    customer: customer || t("unknownCustomer"),
    actor: str("actor") || t("unknownActor"),
    reason: str("reason"),
    subject,
    note: str("note"),
    // Mã gói và số hoá đơn là ĐỊNH DANH, không dịch.
    plan: str("plan"),
    invoice: str("invoice"),
    days: num("days"),
    // Hạn việc: trigger đã dựng sẵn chuỗi theo GIỜ VIỆT NAM (migration #219) —
    // ở đây chèn nguyên văn, không dựng lại từ mốc thời gian. Dựng lại ở tầng
    // web là mở đường thứ hai để cùng một cái hạn hiện ra hai kiểu.
    due: str("due"),
    // Tên người chịu trách nhiệm mới — chữ người dùng tự đặt, chèn nguyên văn.
    owner: str("owner"),
  });
}

/** "90 phút" → "1 giờ" → "3 ngày". Đơn vị dịch được; số thì giữ nguyên. */
function formatDuration(minutes: number, t: Translator): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return t("duration.minutes", { count: m });
  if (m < 1440) return t("duration.hours", { count: Math.floor(m / 60) });
  return t("duration.days", { count: Math.floor(m / 1440) });
}

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
