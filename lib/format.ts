import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { enUS } from "date-fns/locale";
import type { Locale, Translator } from "@/i18n/config";
import { formatVN, VN_TZ } from "./datetime";

// Hậu tố tiền VN (U+0111) — ký hiệu tiền tệ, không phải chuỗi cần dịch
const DONG_SUFFIX = "đ"; // U+0111 — currency suffix, not translatable copy

/**
 * Tiền: dữ liệu luôn là VNĐ.
 * vi → `1.234.567đ` (chấm ngăn nghìn, "đ" dính sau số) · en → `₫1,234,567`.
 */
export function formatMoney(amount: number | bigint, locale: Locale): string {
  if (locale === "vi") {
    return `${new Intl.NumberFormat("vi-VN", {
      maximumFractionDigits: 0,
    }).format(Number(amount))}${DONG_SUFFIX}`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(Number(amount));
}

/** Định dạng theo giờ VN với nhãn tiếng Anh (EEE/MMM) cho locale en. */
function formatEN(d: Date | string | number, fmt: string): string {
  return format(new TZDate(new Date(d), VN_TZ), fmt, { locale: enUS });
}

/**
 * Ngày, GỌN NHẤT MÀ VẪN KHÔNG NHẦM ĐƯỢC.
 *
 * Cùng năm với hôm nay  → vi `21/8`      · en `Aug 21`
 * Năm khác              → vi `21/8/25`   · en `Aug 21, 2025`
 *
 * Trước 21/08 luôn in `21/08/2026`: bốn ký tự thừa trên MỌI dòng của MỌI bảng
 * trong ứng dụng. Ở một bảng 30 dòng trên điện thoại, đó là phần chiều ngang
 * lẽ ra dành cho tên khách.
 *
 * ⚠️ Chỉ bỏ năm khi ngày đó CÙNG NĂM với hôm nay — không bao giờ bỏ vô điều
 *   kiện. "21/8" của năm ngoái mà in ra như của năm nay là làm người đọc hiểu
 *   sai, và đó là thứ tệ hơn hẳn việc dài thêm ba ký tự.
 *
 * ⚠️ Năm "hôm nay" lấy theo GIỜ VIỆT NAM, không phải giờ máy chủ. Máy chủ chạy
 *   UTC, nên từ 0h đến 7h ngày 1/1 nó vẫn đang ở năm cũ — đúng họ lỗi đã cắn
 *   mặt tiền ngày 12/08.
 *
 * ⚠️ KHÔNG dùng cho hợp đồng, hoá đơn hay tệp xuất ra: ở đó ngày phải đầy đủ
 *   và không phụ thuộc vào "hôm nay là năm nào". Hiện `formatDate` chỉ được
 *   gọi trong các màn của ứng dụng — đã soát.
 */
export function formatDate(d: Date | string | number, locale: Locale): string {
  const cungNam = formatVN(d, "yyyy") === formatVN(Date.now(), "yyyy");
  if (locale === "vi") return formatVN(d, cungNam ? "d/M" : "d/M/yy");
  return formatEN(d, cungNam ? "MMM d" : "MMM d, yyyy");
}

/** Ngày + giờ — cùng luật gọn như `formatDate`, thêm `HH:mm`. */
export function formatDateTime(
  d: Date | string | number,
  locale: Locale,
): string {
  const cungNam = formatVN(d, "yyyy") === formatVN(Date.now(), "yyyy");
  if (locale === "vi") return formatVN(d, cungNam ? "d/M HH:mm" : "d/M/yy HH:mm");
  return formatEN(d, cungNam ? "MMM d, HH:mm" : "MMM d, yyyy HH:mm");
}

/** Chỉ giờ:phút (HH:mm cả 2 ngôn ngữ) — dải phiên hỗ trợ (mục 36.8-5) nói "tự kết thúc lúc 21:30", không cần ngày vì hạn cứng ≤60 phút. */
export function formatTime(d: Date | string | number, locale: Locale): string {
  return locale === "vi" ? formatVN(d, "HH:mm") : formatEN(d, "HH:mm");
}

const DAY_MS = 86_400_000;

/** Khóa ngày theo giờ VN để so "cùng ngày/hôm qua" chính xác qua múi giờ. */
function vnDayKey(d: Date | string | number): string {
  return formatVN(d, "yyyy-MM-dd");
}

/**
 * Thời gian tương đối cho danh sách hội thoại (quy ước Zalo).
 * `t` là translator namespace "time" — nhãn dịch nằm trong messages.
 * vi: "Vài giây" → "x phút" → "x giờ" → "Hôm qua" → "Thứ 4" → "dd/MM".
 * en: "Just now" → "xm" → "xh" → "Yesterday" → "Wed" → "MMM d".
 */
export function formatRelative(
  date: Date | string | number,
  locale: Locale,
  t: Translator,
  now: Date | number = Date.now(),
): string {
  const nowMs = new Date(now).getTime();
  const diff = nowMs - new Date(date).getTime();
  if (diff < 60_000) return t("justNow");
  if (diff < 3_600_000) return t("minutes", { minutes: Math.floor(diff / 60_000) });
  const dayKey = vnDayKey(date);
  if (dayKey === vnDayKey(nowMs)) {
    return t("hours", { hours: Math.floor(diff / 3_600_000) });
  }
  if (dayKey === vnDayKey(nowMs - DAY_MS)) return t("yesterday");
  if (diff < 7 * DAY_MS) {
    if (locale === "en") return formatEN(date, "EEE");
    // Token "i" (date-fns) = thứ ISO: 1=Thứ 2 … 6=Thứ 7, 7=CN
    const iso = Number(formatVN(date, "i"));
    return iso === 7 ? t("sunday") : t("weekday", { day: iso + 1 });
  }
  return locale === "vi" ? formatVN(date, "dd/MM") : formatEN(date, "MMM d");
}

/**
 * Nhãn pill ngày giữa luồng chat / nhóm timeline.
 * vi: "Hôm nay" / "Hôm qua" / dd/MM/yyyy · en: "Today" / "Yesterday" / MMM d, yyyy.
 */
export function dayLabel(
  date: Date | string | number,
  locale: Locale,
  t: Translator,
  now: Date | number = Date.now(),
): string {
  const nowMs = new Date(now).getTime();
  const dayKey = vnDayKey(date);
  if (dayKey === vnDayKey(nowMs)) return t("today");
  if (dayKey === vnDayKey(nowMs - DAY_MS)) return t("yesterday");
  return locale === "vi" ? formatVN(date, "dd/MM/yyyy") : formatEN(date, "MMM d, yyyy");
}
