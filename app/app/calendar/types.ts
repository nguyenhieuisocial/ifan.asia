/**
 * Trạng thái lịch hẹn — kiểu ĐẶT Ở ĐÂY chứ không ở `actions.ts`.
 * Trước 19/08 nó khai trong `actions.ts` (file `"use server"`) và file này phải
 * nhập ngược từ đó ⇒ VÒNG LẶP nhập file. Kiểu dùng chung thuộc về file kiểu,
 * không thuộc về file hành động chạy ở máy chủ.
 */
export type AppointmentStatus = "booked" | "arrived" | "done" | "cancelled" | "no_show";

export type StaffOption = { userId: string; displayName: string };

export type Appointment = {
  id: string;
  contactId: string;
  contactName: string;
  staffUserId: string;
  staffName: string;
  resourceId: string | null;
  resourceName: string | null;
  serviceId: string | null;
  serviceName: string | null;
  startAt: string; // timestamptz ISO
  endAt: string;
  status: AppointmentStatus;
  priceVnd: number;
  note: string | null;
  cancelReason: string | null;
};

/** Ngày đang xem: đã gộp sẵn giờ mở cửa (đè ngày nghỉ nếu có) + danh sách lịch trong ngày. */
export type CalendarDay = {
  dateKey: string; // "YYYY-MM-DD" theo múi giờ tiệm
  weekday: number; // 0=CN..6=T7
  closureReason: string | null; // ngày nghỉ cả ngày, nếu có
  openRanges: { startMin: number; endMin: number }[];
  appointments: Appointment[];
};

export type CalendarBundle = {
  timezone: string;
  hasBusinessHours: boolean; // false = tenant chưa khai giờ mở cửa (thẻ design phần 2)
  staff: StaffOption[];
  resources: { id: string; name: string; kind: string }[];
  services: { id: string; name: string; durationMinutes: number }[];
  /** Đúng 7 ngày, Thứ 2 → Chủ nhật của tuần đang xem. */
  days: CalendarDay[];
};

export const WEEKDAY_SHORT_VN = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

/**
 * Lý do huỷ (thẻ design "3 luật cứng" — bắt buộc chọn, không có ô nhập tự
 * do) + bản đồ mã lỗi CSDL/action → khoá `calendar.error.*`.
 *
 * Đặt ở ĐÂY chứ không phải `actions.ts`: file `"use server"` CHỈ được export
 * async function — hằng số/hàm đồng bộ export từ đó bị Next.js âm thầm loại
 * khỏi build (không phải lỗi biên dịch rõ ràng, mà lỗi runtime "export not
 * found" khi phía client import). Bắt được lỗi này khi tự mở trình duyệt
 * kiểm — `tsc`/`eslint` không thấy vì đây là ràng buộc riêng của Next.js
 * Server Actions, không phải TypeScript.
 */
export const CANCEL_REASONS = ["khách báo huỷ", "đổi lịch", "tiệm bận đột xuất", "khách không tới", "khác"] as const;

const ERROR_TO_TOAST_KEY: Record<string, string> = {
  not_authenticated: "notAuthenticated",
  forbidden: "forbidden",
  not_found: "notFound",
  invalid_input: "invalidInput",
  invalid_time_range: "invalidTimeRange",
  conflict_staff: "conflictStaff",
  conflict_resource: "conflictResource",
  conflict_time: "conflictTime",
};
export function toastKeyFor(error: string | null | undefined): string {
  return (error && ERROR_TO_TOAST_KEY[error]) || "saveFailed";
}
