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
