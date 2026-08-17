import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Lãi gộp theo mặt hàng (ADR-0019 mục 8 việc 7) — doanh thu trừ giá vốn của
 * các đơn ĐÃ XONG trong kỳ. Giá vốn đọc từ `order_line_costs` (chốt lúc bán,
 * migration #127) — RLS chỉ owner/admin/manager đọc được, cùng hàng rào đã
 * dùng cho `item_costs` ở màn Hàng hoá.
 *
 * Dòng CHƯA từng nhập giá vốn có `order_line_costs.cost_vnd = null` — cộng
 * dồn KHÔNG được coi là 0 (sẽ phóng đại lãi gộp một cách âm thầm). Những
 * dòng đó bị loại khỏi phần giá vốn cộng dồn và mặt hàng liên quan được đánh
 * dấu `hasUnknownCost` — màn phải NÓI RÕ "lãi gộp chưa đủ" thay vì im lặng.
 */

export type GrossMarginRow = {
  itemId: string;
  itemName: string;
  qtySold: number;
  revenueVnd: number;
  /** Tổng giá vốn CÁC DÒNG ĐÃ CÓ giá vốn — không phải giá vốn thật của toàn bộ qtySold nếu hasUnknownCost. */
  costVnd: number;
  marginVnd: number;
  /** true = có ít nhất 1 dòng bán mặt hàng này CHƯA từng nhập giá vốn — marginVnd ở trên là CẬN TRÊN, không phải số chính xác. */
  hasUnknownCost: boolean;
};

export type GrossMarginSummary = {
  revenueVnd: number;
  costVnd: number;
  marginVnd: number;
  missingCostItemCount: number;
};

type LineRow = {
  item_id: string;
  qty: number;
  unit_price_vnd: number;
  discount_vnd: number;
  items: { name: string } | { name: string }[] | null;
  order_line_costs: { cost_vnd: number | null } | { cost_vnd: number | null }[] | null;
};

function readOne<T>(rel: T | T[] | null): T | null {
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

/** [fromIso, toIso) từ khoá tháng 'yyyy-MM-01' (lib/kpi.ts) — VN không có giờ mùa hè nên +07:00 cố định là đúng quanh năm. */
export function monthKeyToRangeVN(monthKey: string): { fromIso: string; toIso: string } {
  const [y, m] = monthKey.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1) - 7 * 3600 * 1000);
  const to = new Date(Date.UTC(y, m, 1) - 7 * 3600 * 1000);
  return { fromIso: from.toISOString(), toIso: to.toISOString() };
}

/**
 * Quét ĐỦ dòng hàng của các đơn `completed` trong kỳ rồi cộng dồn ở server —
 * KHÔNG cắt theo giới hạn hiển thị trước khi cộng (đúng nguyên tắc đã áp ở
 * getCashSummary, tránh lớp lỗi đếm-theo-mảng-đã-tải việc #21/#24).
 */
export async function getGrossMarginByItem(
  supabase: SupabaseClient,
  fromIso: string,
  toIso: string,
): Promise<{ rows: GrossMarginRow[]; summary: GrossMarginSummary }> {
  const { data, error } = await supabase
    .from("order_lines")
    .select(
      "item_id, qty, unit_price_vnd, discount_vnd, items(name), order_line_costs(cost_vnd), orders!inner(status, created_at)",
    )
    .eq("orders.status", "completed")
    .gte("orders.created_at", fromIso)
    .lt("orders.created_at", toIso);
  if (error) throw new Error(error.message);

  const byItem = new Map<string, { name: string; qty: number; revenue: number; cost: number; hasUnknownCost: boolean }>();
  for (const r of (data ?? []) as unknown as LineRow[]) {
    const item = readOne(r.items);
    const costRow = readOne(r.order_line_costs);
    const revenue = Number(r.qty) * Number(r.unit_price_vnd) - Number(r.discount_vnd);
    const entry = byItem.get(r.item_id) ?? { name: item?.name ?? "—", qty: 0, revenue: 0, cost: 0, hasUnknownCost: false };
    entry.qty += Number(r.qty);
    entry.revenue += revenue;
    if (costRow?.cost_vnd === null || costRow?.cost_vnd === undefined) {
      entry.hasUnknownCost = true;
    } else {
      entry.cost += Number(costRow.cost_vnd) * Number(r.qty);
    }
    byItem.set(r.item_id, entry);
  }

  const rows: GrossMarginRow[] = [...byItem.entries()]
    .map(([itemId, v]) => ({
      itemId,
      itemName: v.name,
      qtySold: v.qty,
      revenueVnd: v.revenue,
      costVnd: v.cost,
      marginVnd: v.revenue - v.cost,
      hasUnknownCost: v.hasUnknownCost,
    }))
    .sort((a, b) => b.marginVnd - a.marginVnd);

  const summary: GrossMarginSummary = {
    revenueVnd: rows.reduce((s, r) => s + r.revenueVnd, 0),
    costVnd: rows.reduce((s, r) => s + r.costVnd, 0),
    marginVnd: rows.reduce((s, r) => s + r.marginVnd, 0),
    missingCostItemCount: rows.filter((r) => r.hasUnknownCost).length,
  };
  return { rows, summary };
}
