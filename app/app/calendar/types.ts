/**
 * Trạng thái lịch hẹn — kiểu ĐẶT Ở ĐÂY chứ không ở `actions.ts`.
 * Trước 19/08 nó khai trong `actions.ts` (file `"use server"`) và file này phải
 * nhập ngược từ đó ⇒ VÒNG LẶP nhập file. Kiểu dùng chung thuộc về file kiểu,
 * không thuộc về file hành động chạy ở máy chủ.
 */
export type AppointmentStatus = "booked" | "arrived" | "done" | "cancelled" | "no_show";

/**
 * Trạng thái còn SỬA ĐƯỢC — đúng hai trạng thái mà hai ràng buộc EXCLUDE
 * (migration #83) coi là "còn giữ chỗ", nên mọi phép sửa đều đi qua chống
 * trùng, không có đường lách. `done`/`cancelled`/`no_show` là LỊCH SỬ: ca xong
 * đã có đơn hàng trỏ vào và phiếu đánh giá đã phát (#178), ca huỷ đã ghi lý do
 * — sửa ngược vào đó là viết lại báo cáo.
 *
 * Khai MỘT nơi: máy chủ lọc theo nó ngay trong câu lệnh UPDATE, màn Lịch dùng
 * chính nó để quyết có vẽ nút Sửa hay không — hai nơi cùng đọc một hằng số thì
 * không lệch nhau được (D2).
 *
 * Cũng chính là tập "ca CÒN SỐNG" mà `cancelAppointment` /
 * `rescheduleAppointment` đòi: còn giữ chỗ thì mới còn huỷ hay đổi giờ được.
 * KHÔNG đặt thêm một hằng số `LIVE_STATUSES` cùng giá trị — hai cái tên cho
 * một luật là hai chỗ để lệch nhau, đúng cái bẫy D2 nói.
 */
export const EDITABLE_STATUSES: AppointmentStatus[] = ["booked", "arrived"];

/**
 * Từ trạng thái nào thì đánh dấu được KHÁCH TỚI / KHÁCH KHÔNG TỚI.
 *
 * Chỉ `booked`: hai nút này trả lời đúng một câu — "đến giờ hẹn rồi, khách có
 * mặt không?". Ca `arrived` là đã trả lời rồi; `done`/`cancelled`/`no_show` là
 * lịch sử. Nhận thêm bất kỳ trạng thái nào ở đây là mở đường LÙI một ca đã xong
 * hoặc đã huỷ về lại "đang làm".
 */
export const ARRIVABLE_STATUSES: AppointmentStatus[] = ["booked"];

/**
 * Từ trạng thái nào thì đánh dấu XONG.
 *
 * Chỉ `arrived`: "xong" là cái kết của một buổi khách ĐÃ tới. Đây là phép chuyển
 * chặt nhất vì nút Xong còn PHÁT PHIẾU ĐÁNH GIÁ gửi khách (#178) — cho phép đi
 * từ `cancelled`/`no_show` là hỏi "hài lòng chứ" một người chưa từng tới tiệm.
 */
export const COMPLETABLE_STATUSES: AppointmentStatus[] = ["arrived"];

// #214: danh tính CHUẨN là employeeId (thợ có thể KHÔNG có tài khoản → userId null).
export type StaffOption = { employeeId: string; userId: string | null; displayName: string };

export type Appointment = {
  id: string;
  contactId: string;
  contactName: string;
  staffEmployeeId: string | null; // #214 danh tính chuẩn
  staffUserId: string | null; // null với thợ không tài khoản; vẫn dùng cho phép "staff sửa ca của mình"
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
  not_editable: "notEditable",
  requires_booked: "requiresBooked",
  requires_arrived: "requiresArrived",
  requires_active: "requiresActive",
};
export function toastKeyFor(error: string | null | undefined): string {
  return (error && ERROR_TO_TOAST_KEY[error]) || "saveFailed";
}
