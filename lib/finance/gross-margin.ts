import type { SupabaseClient } from "@supabase/supabase-js";
import { quetDuDong } from "@/lib/quet-du-dong";

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
  /** Cột SINH của CSDL (#198) — đúng dấu cả ở dòng phiếu hoàn (qty âm, giảm giá dương). */
  line_total_vnd: number;
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
 * Quét ĐỦ dòng hàng của các đơn `completed` trong kỳ rồi cộng dồn ở server.
 *
 * ⚠️ CHÚ THÍCH CŨ Ở ĐÂY TỪNG NÓI SAI SỰ THẬT — giữ lại lời thú nhận này vì nó
 * đắt hơn bản vá. Đoạn mã này vốn khẳng định "quét ĐỦ, KHÔNG cắt" trong khi nó
 * gọi `.select()` trần, và cửa dữ liệu **cắt ở 1.000 dòng rồi trả về THÀNH
 * CÔNG**. Đo trên dữ liệu thật: Cafe Góc Phố tháng 5/2026 có 8.598 dòng bán,
 * chỉ 1.000 dòng được cộng → lãi gộp thật 282.209.000đ, màn hình hiện
 * ~33.040.000đ, **thiếu 88%**. Con số sai này còn chảy sang màn Bảng lương làm
 * căn cứ tính thưởng cho nhân viên.
 *
 * Lỗi sống lâu được **chính vì lời chú thích kia**: người đọc sau tin là đã
 * quét đủ nên không kiểm lại. Một chú thích sai nguy hiểm hơn không có chú
 * thích — nó tiêu diệt sự nghi ngờ.
 *
 * Nay quét thật, qua `quetDuDong` (có trần cứng, chạm trần thì NÉM LỖI chứ
 * không trả số cộng thiếu). `.order("id")` là bắt buộc: cắt trang mà không sắp
 * xếp thì bỏ rơi dòng nào là tuỳ lúc.
 */
export async function getGrossMarginByItem(
  supabase: SupabaseClient,
  fromIso: string,
  toIso: string,
): Promise<{ rows: GrossMarginRow[]; summary: GrossMarginSummary }> {
  const data = await quetDuDong<LineRow>(
    () =>
      supabase
        .from("order_lines")
        .select(
          "item_id, qty, line_total_vnd, items(name), order_line_costs(cost_vnd), orders!inner(status, created_at)",
        )
        .eq("orders.status", "completed")
        .gte("orders.created_at", fromIso)
        .lt("orders.created_at", toIso)
        .order("id") as never,
    "lãi gộp theo mặt hàng",
  );

  const byItem = new Map<string, { name: string; qty: number; revenue: number; cost: number; hasUnknownCost: boolean }>();
  for (const r of data) {
    const item = readOne(r.items);
    const costRow = readOne(r.order_line_costs);
    const revenue = Number(r.line_total_vnd);
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
