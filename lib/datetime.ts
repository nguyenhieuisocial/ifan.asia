import { TZDate } from "@date-fns/tz";
import { addMonths, format, startOfMonth } from "date-fns";
import { vi } from "date-fns/locale";

export const VN_TZ = "Asia/Ho_Chi_Minh";

/** Thời điểm hiện tại theo giờ Việt Nam. */
export function nowVN(): TZDate {
  return TZDate.tz(VN_TZ);
}

/** Định dạng thời điểm theo giờ VN, mặc định dd/MM/yyyy HH:mm. */
export function formatVN(d: Date | string | number, fmt = "dd/MM/yyyy HH:mm"): string {
  return format(new TZDate(new Date(d), VN_TZ), fmt, { locale: vi });
}

/** Khoảng [đầu tháng, đầu tháng sau) theo giờ VN, dạng ISO — dùng lọc CSDL theo tháng (vd Sổ quỹ). */
export function monthRangeVN(d: Date | string | number = nowVN()): { fromIso: string; toIso: string } {
  const start = startOfMonth(new TZDate(new Date(d), VN_TZ));
  const end = addMonths(start, 1);
  return { fromIso: start.toISOString(), toIso: end.toISOString() };
}
