import type { SupabaseClient } from "@supabase/supabase-js";
import { formatVN } from "./datetime";

/**
 * KPI mục tiêu tháng (migration #59) — hình dữ liệu + mốc tháng dùng chung cho
 * 3 màn: đặt mục tiêu (Cài đặt → Nhân viên), khối "của tôi" (Hôm nay), bảng cả
 * đội (Báo cáo). Số thực đạt + nhịp đều do RPC kpi_progress() đếm DB-side từ
 * dữ liệu gốc — tầng web KHÔNG tự đếm lại (luật "một đường code đếm").
 */

export const KPI_METRICS = ["revenue_won", "new_contacts", "tasks_done"] as const;
export type KpiMetric = (typeof KPI_METRICS)[number];

export function isKpiMetric(value: string): value is KpiMetric {
  return (KPI_METRICS as readonly string[]).includes(value);
}

export type KpiTargetProgress = {
  /** null = mục tiêu CẢ TIỆM. */
  user_id: string | null;
  metric: KpiMetric;
  /** revenue_won: VNĐ · còn lại: số đếm. */
  target: number;
  /** Số thực đạt trong tháng — đếm từ deals/contacts/activities theo RLS người gọi. */
  actual: number;
  /** Nhịp = target × ngày-đã-qua ÷ số-ngày-tháng (chia nguyên, DB tính). */
  pace: number;
  created_at: string;
  updated_at: string;
};

export type KpiProgress = {
  /** Ngày 1 của tháng đang xem (yyyy-MM-dd). */
  month: string;
  days_in_month: number;
  days_elapsed: number;
  targets: KpiTargetProgress[];
};

/** Khóa tháng dạng 'yyyy-MM-01' của tháng hiện tại theo giờ VN. */
export function currentMonthVN(now: number = Date.now()): string {
  return `${formatVN(now, "yyyy-MM")}-01`;
}

/** Dời khóa tháng đi `delta` tháng (âm = lùi) — tính thuần chuỗi, không Date. */
export function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  const yy = Math.floor(total / 12);
  const mm = (total % 12) + 1;
  return `${yy}-${String(mm).padStart(2, "0")}-01`;
}

/** Nhãn tháng gọn `MM/yyyy` — đọc được cả vi lẫn en, không cần ICU. */
export function kpiMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-");
  return `${m}/${y}`;
}

/** Khóa tháng hợp lệ 'yyyy-MM-01' (tham số URL ?m= của màn báo cáo). */
export function isMonthKey(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])-01$/.test(value);
}

/**
 * Nhãn nhịp kiểu GoK: đạt mục tiêu > vượt nhịp (kịp/hơn mốc ngày trong tháng)
 * > hụt nhịp. Chiều tốt/xấu do màn KHAI BÁO qua nhãn này, không suy từ số.
 */
export type KpiPaceStatus = "reached" | "ahead" | "behind";
export function kpiPaceStatus(t: Pick<KpiTargetProgress, "target" | "actual" | "pace">): KpiPaceStatus {
  if (t.actual >= t.target) return "reached";
  return t.actual >= t.pace ? "ahead" : "behind";
}

/**
 * Màu nhãn/thanh theo trạng thái nhịp — MỘT nguồn cho cả khối Hôm nay lẫn bảng
 * Báo cáo (hai màn cùng nói một giọng về cùng một trạng thái). Chiều tốt/xấu
 * khai báo ở đây: đạt/vượt = xanh, hụt nhịp = vàng cảnh báo (chưa phải đỏ hỏng).
 */
export const KPI_PACE_TEXT_CLASS: Record<KpiPaceStatus, string> = {
  reached: "text-emerald-700 dark:text-emerald-300",
  ahead: "text-emerald-700 dark:text-emerald-300",
  behind: "text-amber-600 dark:text-amber-400",
};
export const KPI_PACE_BAR_CLASS: Record<KpiPaceStatus, string> = {
  reached: "bg-emerald-500",
  ahead: "bg-primary",
  behind: "bg-amber-500",
};

/** % đạt, làm tròn — quá 100 cứ hiện thật (trung thực), UI tự kẹp thanh. */
export function kpiPercent(t: Pick<KpiTargetProgress, "target" | "actual">): number {
  return Math.round((t.actual / Math.max(t.target, 1)) * 100);
}

/** 1 round-trip cho cả mục tiêu + số thực đạt + nhịp — RLS áp theo người gọi. */
export async function fetchKpiProgress(
  supabase: SupabaseClient,
  monthKey: string,
): Promise<KpiProgress> {
  const { data, error } = await supabase.rpc("kpi_progress", { p_month: monthKey });
  if (error) throw new Error(error.message);
  return data as KpiProgress;
}
