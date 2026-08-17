import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Sổ quỹ (ADR-0019 mục 8 việc 6, migration #127 `cash_entries`). Hợp đồng
 * 24h "24 giờ": SỔ, không phải kế toán — không định khoản kép, không báo
 * cáo thuế. RLS `cash_entries_rw` chỉ owner/admin/manager (cùng nhóm được
 * tin với giá vốn — ADR-0009 mục 7b), staff/viewer không có policy nào.
 */

export const CASH_DIRECTIONS = ["in", "out"] as const;
export type CashDirection = (typeof CASH_DIRECTIONS)[number];

export const CASH_FUNDS = ["cash", "bank"] as const;
export type CashFund = (typeof CASH_FUNDS)[number];

/** Đóng — đúng danh sách CHECK constraint ở migration #127, không tự thêm (bất biến 14). */
export const CASH_CATEGORIES = [
  "sale",
  "refund",
  "supplier_payment",
  "salary",
  "commission",
  "rent",
  "utility",
  "marketing",
  "other_in",
  "other_out",
] as const;
export type CashCategory = (typeof CASH_CATEGORIES)[number];

/** 2 khoản thật sự là "thu" (đối chiếu ý nghĩa cột `direction`) — phần còn lại là "chi". Chỉ để LỌC ô chọn loại khoản khi ghi tay, không phải luật CSDL. */
export const CASH_CATEGORIES_IN: CashCategory[] = ["sale", "other_in"];
export const CASH_CATEGORIES_OUT: CashCategory[] = [
  "refund",
  "supplier_payment",
  "salary",
  "commission",
  "rent",
  "utility",
  "marketing",
  "other_out",
];

export const CASH_NOTE_MAX = 500;
export const CASH_AMOUNT_MAX = 1_000_000_000;

export type CashEntry = {
  id: string;
  direction: CashDirection;
  amountVnd: number;
  fund: CashFund;
  category: CashCategory;
  note: string | null;
  orderId: string | null;
  orderPaymentId: string | null;
  recordedBy: string | null;
  createdAt: string;
};

type CashEntryRow = {
  id: string;
  direction: string;
  amount_vnd: number;
  fund: string;
  category: string;
  note: string | null;
  order_id: string | null;
  order_payment_id: string | null;
  recorded_by: string | null;
  created_at: string;
};

function mapEntry(r: CashEntryRow): CashEntry {
  return {
    id: r.id,
    direction: r.direction as CashDirection,
    amountVnd: Number(r.amount_vnd),
    fund: r.fund as CashFund,
    category: r.category as CashCategory,
    note: r.note,
    orderId: r.order_id,
    orderPaymentId: r.order_payment_id,
    recordedBy: r.recorded_by,
    createdAt: r.created_at,
  };
}

const ENTRY_SELECT = "id, direction, amount_vnd, fund, category, note, order_id, order_payment_id, recorded_by, created_at";
const LIST_LIMIT = 200;

/** Danh sách gần nhất để HIỂN THỊ — KHÔNG dùng mảng này để tính tổng (xem getCashSummary). */
export async function listCashEntries(supabase: SupabaseClient): Promise<CashEntry[]> {
  const { data, error } = await supabase
    .from("cash_entries")
    .select(ENTRY_SELECT)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (error) throw new Error(error.message);
  return ((data ?? []) as CashEntryRow[]).map(mapEntry);
}

export type CashSummary = { inVnd: number; outVnd: number; netVnd: number };

/**
 * Tổng Thu/Chi/Còn lại trong [fromIso, toIso) — quét ĐỦ khoảng thời gian,
 * không cắt theo giới hạn hiển thị (đúng lớp lỗi "đếm sai kiểu tải-về-đếm"
 * đã vá ở việc #21/#24 — KHÔNG lặp lại ở màn mới).
 */
export async function getCashSummary(supabase: SupabaseClient, fromIso: string, toIso: string): Promise<CashSummary> {
  const { data, error } = await supabase
    .from("cash_entries")
    .select("direction, amount_vnd")
    .is("deleted_at", null)
    .gte("created_at", fromIso)
    .lt("created_at", toIso);
  if (error) throw new Error(error.message);
  let inVnd = 0;
  let outVnd = 0;
  for (const r of (data ?? []) as { direction: string; amount_vnd: number }[]) {
    if (r.direction === "in") inVnd += Number(r.amount_vnd);
    else outVnd += Number(r.amount_vnd);
  }
  return { inVnd, outVnd, netVnd: inVnd - outVnd };
}
