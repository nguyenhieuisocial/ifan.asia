import type { SupabaseClient } from "@supabase/supabase-js";
import { formatVN } from "@/lib/datetime";

/** Hình dữ liệu + mốc thời gian của báo cáo "Vì sao thua" (migration #56). */

export type LostPeriod = "month" | "3m" | "all";
export const LOST_PERIODS: LostPeriod[] = ["month", "3m", "all"];
export const DEFAULT_PERIOD: LostPeriod = "month";

export function isLostPeriod(value: string): value is LostPeriod {
  return (LOST_PERIODS as string[]).includes(value);
}

export type LostReasonRow = {
  /** NULL = deal thua không còn lý do (lý do đã bị xoá). */
  reason_id: string | null;
  reason_name: string | null;
  cnt: number;
  prev_cnt: number;
};

const DAY_MS = 86_400_000;

/** Mốc 00:00 giờ VN của ngày 1 tháng (hiện tại − `minusMonths`). VN cố định
 * UTC+7, không DST → ghép offset thẳng là chính xác (cùng cách vnRange bên
 * báo cáo nguồn). */
function monthStartVN(now: number, minusMonths: number): string {
  const [y, m] = formatVN(now, "yyyy-MM").split("-").map(Number);
  const total = y * 12 + (m - 1) - minusMonths;
  const yy = Math.floor(total / 12);
  const mm = (total % 12) + 1;
  return new Date(
    `${yy}-${String(mm).padStart(2, "0")}-01T00:00:00+07:00`,
  ).toISOString();
}

/**
 * Cửa sổ nửa mở [from, to) theo THÁNG DƯƠNG LỊCH giờ VN + kỳ liền trước cùng
 * độ dài để so xu hướng:
 *   month — tháng này ↔ tháng trước
 *   3m    — tháng này + 2 tháng trước ↔ 3 tháng liền trước nữa
 *   all   — từ đầu (from null), không có kỳ trước để so
 */
export function lostRange(
  period: LostPeriod,
  now: number = Date.now(),
): {
  from: string | null;
  to: string;
  prevFrom: string | null;
  prevTo: string | null;
} {
  // "đến hết hôm nay" — deal đánh thua lúc 23:30 vẫn nằm trong ngày (giờ VN)
  const todayStart = new Date(
    `${formatVN(now, "yyyy-MM-dd")}T00:00:00+07:00`,
  ).getTime();
  const to = new Date(todayStart + DAY_MS).toISOString();
  if (period === "all") return { from: null, to, prevFrom: null, prevTo: null };
  const months = period === "month" ? 1 : 3;
  const from = monthStartVN(now, months - 1);
  return { from, to, prevFrom: monthStartVN(now, 2 * months - 1), prevTo: from };
}

export async function fetchLostReasons(
  supabase: SupabaseClient,
  period: LostPeriod,
): Promise<LostReasonRow[]> {
  const r = lostRange(period);
  const { data, error } = await supabase.rpc("lost_reasons_report", {
    p_from: r.from,
    p_to: r.to,
    p_prev_from: r.prevFrom,
    p_prev_to: r.prevTo,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as LostReasonRow[];
}

/**
 * Khóa gợi ý hành động TĨNH cho lý do đứng đầu (học mẫu GoK "Why we lose").
 * Nhận i18n_key của lý do seed (lostReason.*) → khóa trong
 * reports.lostReasons.suggestion; lý do tự đặt / đã xoá → gợi ý chung.
 */
export function suggestionKey(seedKey: string | null | undefined): string {
  const m = seedKey?.match(/^lostReason\.(price|competitor|noNeed|unreachable|other)$/);
  return m ? m[1] : "custom";
}
