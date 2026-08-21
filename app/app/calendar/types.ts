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
  /** Thuộc liệu trình nào — null nếu là buổi lẻ. */
  seriesId: string | null;
  /** Buổi thứ mấy trong liệu trình, đếm từ 1. */
  seriesIndex: number | null;
  /** Tổng số buổi của liệu trình — để màn nói được "buổi 3/8". */
  seriesTotal: number | null;
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
  services: { id: string; name: string; durationMinutes: number; priceVnd: number }[];
  /** Các ngày trong dải đang xem — độ dài tuỳ chế độ (1 · 7 · tới 42 ô lưới tháng). */
  days: CalendarDay[];
};



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

/**
 * Chế độ xem của màn Lịch. Đi qua đường dẫn (`?v=`) chứ không giữ trong trạng
 * thái trình duyệt: lễ tân mở lại tab phải thấy đúng chế độ hôm qua đang dùng,
 * và gửi đường dẫn cho đồng nghiệp thì họ thấy đúng thứ mình thấy.
 */
export const CHE_DO_XEM = ["ngay", "tho", "tuan", "thang", "nam", "ds"] as const;
export type CheDoXem = (typeof CHE_DO_XEM)[number];

/**
 * Màu theo NGƯỜI LÀM.
 *
 * Không phải trang trí: nhìn một cái là biết hôm nay ai gánh nhiều ca, ai rảnh.
 * Chọn màu theo THỨ TỰ trong danh sách thợ chứ không băm từ mã — băm từ mã cho
 * ra màu ngẫu nhiên và hai thợ hay đứng cạnh nhau dễ trúng hai màu na ná.
 *
 * ⚠️ Mỗi màu khai đủ cho CẢ nền sáng lẫn nền tối. Bản đầu chỉ khai nền sáng và
 *   ở chế độ tối chữ đen trên nền đậm gần như không đọc được.
 */
export const MAU_THO = [
  { vien: "border-sky-400",     nen: "bg-sky-50 dark:bg-sky-950/50",         chu: "text-sky-900 dark:text-sky-100",         cham: "bg-sky-400" },
  { vien: "border-emerald-400", nen: "bg-emerald-50 dark:bg-emerald-950/50", chu: "text-emerald-900 dark:text-emerald-100", cham: "bg-emerald-400" },
  { vien: "border-violet-400",  nen: "bg-violet-50 dark:bg-violet-950/50",   chu: "text-violet-900 dark:text-violet-100",   cham: "bg-violet-400" },
  { vien: "border-amber-400",   nen: "bg-amber-50 dark:bg-amber-950/50",     chu: "text-amber-900 dark:text-amber-100",     cham: "bg-amber-400" },
  { vien: "border-rose-400",    nen: "bg-rose-50 dark:bg-rose-950/50",       chu: "text-rose-900 dark:text-rose-100",       cham: "bg-rose-400" },
  { vien: "border-teal-400",    nen: "bg-teal-50 dark:bg-teal-950/50",       chu: "text-teal-900 dark:text-teal-100",       cham: "bg-teal-400" },
  { vien: "border-indigo-400",  nen: "bg-indigo-50 dark:bg-indigo-950/50",   chu: "text-indigo-900 dark:text-indigo-100",   cham: "bg-indigo-400" },
  { vien: "border-lime-400",    nen: "bg-lime-50 dark:bg-lime-950/50",       chu: "text-lime-900 dark:text-lime-100",       cham: "bg-lime-400" },
] as const;

/** Ca huỷ / khách không tới: xám, gạch ngang — KHÔNG lấy màu của thợ. */
export const MAU_DA_HUY = {
  vien: "border-muted-foreground/40",
  nen: "bg-muted/60",
  chu: "text-muted-foreground",
  cham: "bg-muted-foreground/50",
} as const;

export function mauCuaTho(staffEmployeeId: string | null, thuTuTho: Map<string, number>) {
  if (!staffEmployeeId) return MAU_THO[MAU_THO.length - 1];
  return MAU_THO[(thuTuTho.get(staffEmployeeId) ?? 0) % MAU_THO.length];
}
