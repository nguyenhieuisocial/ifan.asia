import { formatVN } from "./datetime";

/** Định dạng tiền VNĐ kiểu VN: `1.234.567đ` — chấm ngăn nghìn, "đ" thường dính sau số. */
export function formatVND(amount: number | bigint): string {
  return `${new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: 0,
  }).format(Number(amount))}đ`;
}

const DAY_MS = 86_400_000;

/** Khóa ngày theo giờ VN để so "cùng ngày/hôm qua" chính xác qua múi giờ. */
function vnDayKey(d: Date | string | number): string {
  return formatVN(d, "yyyy-MM-dd");
}

/**
 * Thời gian tương đối cho danh sách hội thoại (quy ước Zalo):
 * "Vài giây" → "x phút" → "x giờ" → "Hôm qua" → "Thứ 4" → "dd/MM".
 */
export function formatRelativeVN(
  date: Date | string | number,
  now: Date | number = Date.now(),
): string {
  const nowMs = new Date(now).getTime();
  const diff = nowMs - new Date(date).getTime();
  if (diff < 60_000) return "Vài giây";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} phút`;
  const dayKey = vnDayKey(date);
  if (dayKey === vnDayKey(nowMs)) return `${Math.floor(diff / 3_600_000)} giờ`;
  if (dayKey === vnDayKey(nowMs - DAY_MS)) return "Hôm qua";
  if (diff < 7 * DAY_MS) {
    // Token "i" (date-fns) = thứ ISO: 1=Thứ 2 … 6=Thứ 7, 7=CN
    const iso = Number(formatVN(date, "i"));
    return iso === 7 ? "CN" : `Thứ ${iso + 1}`;
  }
  return formatVN(date, "dd/MM");
}

/** Nhãn pill ngày giữa luồng chat: "Hôm nay" / "Hôm qua" / "dd/MM/yyyy". */
export function dayLabelVN(
  date: Date | string | number,
  now: Date | number = Date.now(),
): string {
  const nowMs = new Date(now).getTime();
  const dayKey = vnDayKey(date);
  if (dayKey === vnDayKey(nowMs)) return "Hôm nay";
  if (dayKey === vnDayKey(nowMs - DAY_MS)) return "Hôm qua";
  return formatVN(date, "dd/MM/yyyy");
}
