import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
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

/** Định dạng tiền VNĐ từ bigint đồng (number an toàn tới 2^53). */
export function formatVND(amount: number | bigint): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Number(amount));
}
