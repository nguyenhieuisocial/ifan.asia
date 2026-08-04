import type { SupabaseClient } from "@supabase/supabase-js";
import { formatVN } from "@/lib/datetime";
import {
  DEFAULT_RANGE,
  RANGE_PRESETS,
  isRangePreset,
  vnRange,
  type RangePreset,
} from "./reports/sources/types";

/**
 * Mốc thời gian + hình dữ liệu của màn Tổng quan (RPC dashboard_sales, migration #21).
 *
 * DÙNG LẠI NGUYÊN `vnRange` của báo cáo "Nguồn nào ra tiền" — cùng bộ lọc thì
 * CÙNG cửa sổ thời gian tuyệt đối, nên hai màn không thể ra hai con số khác nhau.
 */
export {
  DEFAULT_RANGE,
  RANGE_PRESETS,
  isRangePreset,
  vnRange,
  type RangePreset,
};

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Một mốc "bây giờ" DUY NHẤT cho cả lần render: mọi cửa sổ thời gian (kỳ này,
 * kỳ trước, trục ngày, giờ cập nhật) tính từ cùng một thời điểm — nếu mỗi chỗ tự
 * gọi Date.now() thì một lần tải đúng lúc nửa đêm giờ VN sẽ ra hai ngày khác nhau.
 */
export function renderInstant(): number {
  return Date.now();
}

/**
 * Kỳ TRƯỚC để so sánh, cũng theo giờ VN.
 *   7/30/90 ngày → đúng bằng ấy ngày liền TRƯỚC kỳ này.
 *   Tháng này    → CÙNG KỲ tháng trước (mồng 1 đến cùng ngày trong tháng), không
 *                  đem 5 ngày đầu tháng so với cả tháng trước — so vậy là bịa.
 */
export function vnPrevRange(
  preset: RangePreset,
  now: number = Date.now(),
): { from: string; to: string } {
  const cur = vnRange(preset, now);
  if (preset !== "month") {
    const from = new Date(cur.from).getTime();
    return {
      from: new Date(from - Number(preset) * DAY_MS).toISOString(),
      to: cur.from,
    };
  }
  const [y, m, d] = formatVN(now, "yyyy-MM-dd").split("-").map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const lastDay = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  const endDay = Math.min(d, lastDay);
  const start = new Date(`${py}-${pad(pm)}-01T00:00:00+07:00`);
  const end = new Date(`${py}-${pad(pm)}-${pad(endDay)}T00:00:00+07:00`);
  return {
    from: start.toISOString(),
    to: new Date(end.getTime() + DAY_MS).toISOString(),
  };
}

/** Danh sách ngày (giờ VN) của kỳ đang xem — trục ngang biểu đồ doanh thu. */
export function vnDaysOf(preset: RangePreset, now: number = Date.now()): string[] {
  const { from, to } = vnRange(preset, now);
  const end = new Date(to).getTime();
  const days: string[] = [];
  // VN cố định UTC+7 (không có giờ mùa hè) → cộng đúng 24h vẫn đứng ở 00:00 VN
  for (let t = new Date(from).getTime(); t < end; t += DAY_MS) {
    days.push(formatVN(t, "yyyy-MM-dd"));
  }
  return days;
}

export type Delta = { current: number; previous: number };

export type StaffRow = {
  user_id: string;
  display_name: string | null;
  deals_won: number;
  revenue: number;
  deals_created: number;
  deals_open: number;
  open_value: number;
  new_contacts: number;
};

export type DashboardSales = {
  role: string | null;
  revenue: Delta;
  deals_won: Delta;
  deals_lost: Delta;
  deals_created: Delta;
  new_contacts: Delta;
  open_deals: { count: number; value: number };
  daily: { day: string; revenue: number; deals: number }[];
  staff: StaffRow[];
};

export async function fetchDashboardSales(
  supabase: SupabaseClient,
  range: RangePreset,
  now: number = Date.now(),
): Promise<DashboardSales> {
  const cur = vnRange(range, now);
  const prev = vnPrevRange(range, now);
  const { data, error } = await supabase.rpc("dashboard_sales", {
    p_from: cur.from,
    p_to: cur.to,
    p_prev_from: prev.from,
    p_prev_to: prev.to,
  });
  if (error) throw new Error(error.message);
  return data as DashboardSales;
}

export type Trend =
  | { kind: "up" | "down"; percent: number }
  | { kind: "flat" }
  | { kind: "fresh" } // kỳ trước chưa có gì, kỳ này có
  | { kind: "none" }; // cả hai kỳ đều chưa có gì

/** Biến 2 con số thành câu "tăng/giảm bao nhiêu %" — không có % vô nghĩa. */
export function trendOf({ current, previous }: Delta): Trend {
  const cur = Number(current);
  const prev = Number(previous);
  if (prev === 0) return cur === 0 ? { kind: "none" } : { kind: "fresh" };
  if (cur === prev) return { kind: "flat" };
  const percent = Math.round((Math.abs(cur - prev) / prev) * 100);
  if (percent === 0) return { kind: "flat" };
  return { kind: cur > prev ? "up" : "down", percent };
}

/**
 * Số ngày CÓ doanh thu trong kỳ. Dưới 2 ngày thì không vẽ biểu đồ — một cột đơn
 * độc không nói lên xu hướng gì, mà biểu đồ rỗng thì càng không.
 */
export function revenueDayCount(
  days: string[],
  daily: DashboardSales["daily"],
): number {
  const byDay = new Map(daily.map((d) => [d.day, Number(d.revenue)]));
  return days.filter((d) => (byDay.get(d) ?? 0) > 0).length;
}

/** Tỉ lệ chốt = deal thắng / (thắng + thua) đã đóng trong kỳ. Chưa đóng deal nào → null. */
export function winRate(won: number, lost: number): number | null {
  const closed = Number(won) + Number(lost);
  return closed === 0 ? null : Math.round((Number(won) / closed) * 100);
}
