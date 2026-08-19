/**
 * Mã lỗi (server action) → khoá chuỗi hiển thị (`hr.toasts.*`).
 *
 * Cùng khuôn app/app/items/items-view.tsx: mã lạ KHÔNG rơi vào im lặng mà rơi
 * về `saveFailed` — nút bấm không phản hồi là lỗi tệ hơn lỗi hiện sai chữ.
 */
const TOAST_KEYS = new Set([
  "saved",
  "notAuthenticated",
  "forbidden",
  "notFound",
  "invalidInput",
  "timesheetLocked",
  "periodClosed",
  "reasonRequired",
  "unlockReasonRequired",
  "shiftDuplicate",
  "timesheetDuplicate",
  "employeeDuplicate",
  "noEmployeeProfile",
  "employeeEnded",
  "endBeforeStart",
  "geoDenied",
  "saveFailed",
]);

const ERROR_TO_TOAST_KEY: Record<string, string> = {
  not_authenticated: "notAuthenticated",
  forbidden: "forbidden",
  not_found: "notFound",
  invalid_input: "invalidInput",
  timesheet_locked: "timesheetLocked",
  period_closed: "periodClosed",
  reason_required: "reasonRequired",
  unlock_reason_required: "unlockReasonRequired",
  shift_duplicate: "shiftDuplicate",
  timesheet_duplicate: "timesheetDuplicate",
  employee_duplicate: "employeeDuplicate",
  no_employee_profile: "noEmployeeProfile",
  employee_ended: "employeeEnded",
  end_before_start: "endBeforeStart",
  geo_denied: "geoDenied",
};

export function toastKeyFor(error: string | null | undefined): string {
  const key = error ? (ERROR_TO_TOAST_KEY[error] ?? "") : "";
  return TOAST_KEYS.has(key) ? key : "saveFailed";
}
