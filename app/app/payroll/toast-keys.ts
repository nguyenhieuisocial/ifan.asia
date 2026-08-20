/**
 * Mã lỗi (server action) → khoá chuỗi `payroll.toasts.*`.
 * Mã lạ rơi về `saveFailed` — nút bấm im lặng là lỗi tệ hơn chữ hiện sai.
 */
const TOAST_KEYS = new Set([
  "saved",
  "notAuthenticated",
  "forbidden",
  "notFound",
  "invalidInput",
  "payrollLocked",
  "timesheetNotClosed",
  "lineNeedsSource",
  "noEmployees",
  "noPayslips",
  "periodNotFound",
  "unlockReasonRequired",
  "cashEntryFailed",
  "cashEntryUnlinked",
  "cashEntryOrphan",
  "saveFailed",
]);

const ERROR_TO_TOAST_KEY: Record<string, string> = {
  not_authenticated: "notAuthenticated",
  forbidden: "forbidden",
  not_found: "notFound",
  invalid_input: "invalidInput",
  payroll_locked: "payrollLocked",
  timesheet_not_closed: "timesheetNotClosed",
  line_needs_source: "lineNeedsSource",
  no_employees: "noEmployees",
  no_payslips: "noPayslips",
  period_not_found: "periodNotFound",
  unlock_reason_required: "unlockReasonRequired",
  cash_entry_failed: "cashEntryFailed",
  cash_entry_unlinked: "cashEntryUnlinked",
  cash_entry_orphan: "cashEntryOrphan",
};

export function toastKeyFor(error: string | null | undefined): string {
  const key = error ? (ERROR_TO_TOAST_KEY[error] ?? "") : "";
  return TOAST_KEYS.has(key) ? key : "saveFailed";
}
