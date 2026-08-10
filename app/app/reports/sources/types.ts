import type { SupabaseClient } from "@supabase/supabase-js";
import { formatVN } from "@/lib/datetime";

/** Hình dữ liệu + mốc thời gian của báo cáo "Nguồn nào ra tiền" (migration #16). */

export type AttributionModel = "first" | "last" | "linear";
export const ATTRIBUTION_MODELS: AttributionModel[] = ["first", "last", "linear"];

export type RangePreset = "7" | "30" | "90" | "month";
export const RANGE_PRESETS: RangePreset[] = ["7", "30", "90", "month"];
export const DEFAULT_RANGE: RangePreset = "30";

export function isRangePreset(value: string): value is RangePreset {
  return (RANGE_PRESETS as string[]).includes(value);
}

export type SourceReportRow = {
  source_id: string | null;
  source_name: string | null;
  new_contacts: number;
  deals_first: number;
  revenue_first: number;
  deals_last: number;
  revenue_last: number;
  deals_linear: number;
  revenue_linear: number;
};

const DAY_MS = 86_400_000;

/**
 * Ranh giới ngày theo GIỜ VN (spec CRM §8 tiêu chí 13: deal thắng 23:30 ngày 15
 * phải nằm trong ngày 15). VN cố định UTC+7, không có DST → ghép offset thẳng
 * là chính xác tuyệt đối, không phụ thuộc giờ máy chủ (cùng cách endOfDayVN
 * trong deals/actions.ts).
 * Cửa sổ trả về là nửa mở [from, to): "7/30/90 ngày" TÍNH CẢ hôm nay.
 */
export function vnRange(
  preset: RangePreset,
  now: number = Date.now(),
): { from: string; to: string } {
  const todayStart = new Date(`${formatVN(now, "yyyy-MM-dd")}T00:00:00+07:00`).getTime();
  const to = new Date(todayStart + DAY_MS).toISOString();
  if (preset === "month") {
    return {
      from: new Date(`${formatVN(now, "yyyy-MM")}-01T00:00:00+07:00`).toISOString(),
      to,
    };
  }
  return {
    from: new Date(todayStart - (Number(preset) - 1) * DAY_MS).toISOString(),
    to,
  };
}

export async function fetchSourceReport(
  supabase: SupabaseClient,
  range: RangePreset,
): Promise<SourceReportRow[]> {
  const { from, to } = vnRange(range);
  const { data, error } = await supabase.rpc("source_revenue_report", {
    p_from: from,
    p_to: to,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as SourceReportRow[];
}

export type SourceCostRow = {
  source_id: string;
  month: string; // "yyyy-MM-01" — ngày 1 của tháng
  amount: number;
};

/**
 * Chi phí đã nhập của các THÁNG giao với khoảng đang xem (migration #52).
 * Chi phí lưu theo tháng nên khoảng 7/30/90 ngày chạm tháng nào là cộng nguyên
 * tháng đó — footnote trên màn nói rõ, không giấu.
 */
export async function fetchSourceCosts(
  supabase: SupabaseClient,
  range: RangePreset,
): Promise<SourceCostRow[]> {
  const now = Date.now();
  const { from } = vnRange(range, now);
  const { data, error } = await supabase
    .from("source_costs")
    .select("source_id, month, amount")
    .gte("month", `${formatVN(from, "yyyy-MM")}-01`)
    // mọi preset đều kết thúc hôm nay → tháng cuối = tháng hiện tại
    .lte("month", `${formatVN(now, "yyyy-MM")}-01`);
  if (error) throw new Error(error.message);
  return (data ?? []) as SourceCostRow[];
}

/** Tháng hiện tại theo giờ VN — tháng mà ô "Chi phí" nhập/sửa. */
export function currentMonthVN(now: number = Date.now()): {
  key: string; // "yyyy-MM-01" gửi xuống RPC
  label: string; // "MM/yyyy" hiện cho người dùng
} {
  return { key: `${formatVN(now, "yyyy-MM")}-01`, label: formatVN(now, "MM/yyyy") };
}

/** Số liệu của MỘT dòng theo mô hình đang chọn. */
export function pickModel(
  row: SourceReportRow,
  model: AttributionModel,
): { deals: number; revenue: number } {
  if (model === "first") {
    return { deals: Number(row.deals_first), revenue: Number(row.revenue_first) };
  }
  if (model === "last") {
    return { deals: Number(row.deals_last), revenue: Number(row.revenue_last) };
  }
  return { deals: Number(row.deals_linear), revenue: Number(row.revenue_linear) };
}
