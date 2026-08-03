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

/** Ngày ngắn: vi `dd/MM/yyyy` · en `MMM d, yyyy`. */
export function formatDate(d: Date | string | number, locale: Locale): string {
  return locale === "vi" ? formatVN(d, "dd/MM/yyyy") : formatEN(d, "MMM d, yyyy");
}

/** Ngày + giờ: vi `dd/MM/yyyy HH:mm` · en `MMM d, yyyy HH:mm`. */
export function formatDateTime(
  d: Date | string | number,
  locale: Locale,
): string {
  return locale === "vi"
    ? formatVN(d, "dd/MM/yyyy HH:mm")
    : formatEN(d, "MMM d, yyyy HH:mm");
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
