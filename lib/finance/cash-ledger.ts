import type { SupabaseClient } from "@supabase/supabase-js";
import { quetDuDong } from "@/lib/quet-du-dong";

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
  /** Ảnh chứng từ — chỉ phiếu CHI mới có (#351). */
  chungTu: { duong_dan: string; ten: string; co: number }[];
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
  chung_tu: { duong_dan: string; ten: string; co: number }[] | null;
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
    chungTu: Array.isArray(r.chung_tu) ? r.chung_tu : [],
  };
}

const ENTRY_SELECT = "id, direction, amount_vnd, fund, category, note, order_id, order_payment_id, recorded_by, created_at, chung_tu";
const LIST_LIMIT = 200;

/**
 * Danh sách để HIỂN THỊ, giới hạn 200 dòng gần nhất — KHÔNG dùng mảng này để
 * tính tổng (xem getCashSummary, quét đủ không cắt).
 *
 * PHẢI nhận CÙNG [fromIso, toIso) với getCashSummary ở nơi gọi (việc #162,
 * bắt được lúc vẽ thẻ design đợt 43): trước đây hàm này không lọc theo kỳ —
 * 3 số Thu/Chi/Còn lại tính theo tháng, còn danh sách là "200 dòng gần nhất"
 * bất kể tháng nào. Cuối tháng sẽ thấy dòng tháng trước nằm ngay dưới số của
 * tháng này — đúng lớp lỗi "số liệu đá nhau" đã dọn ở việc #18.
 */
export async function listCashEntries(supabase: SupabaseClient, fromIso: string, toIso: string): Promise<CashEntry[]> {
  const { data, error } = await supabase
    .from("cash_entries")
    .select(ENTRY_SELECT)
    .is("deleted_at", null)
    .gte("created_at", fromIso)
    .lt("created_at", toIso)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (error) throw new Error(error.message);
  return ((data ?? []) as CashEntryRow[]).map(mapEntry);
}

export type CashSummary = { inVnd: number; outVnd: number; netVnd: number };

/**
 * Tổng Thu/Chi/Còn lại trong [fromIso, toIso) — quét ĐỦ khoảng thời gian.
 *
 * ⚠️ Chú thích cũ ở đây khẳng định "quét ĐỦ, không cắt" nhưng mã chỉ gọi
 * `.select()` trần, mà cửa dữ liệu **cắt ở 1.000 dòng rồi báo THÀNH CÔNG**.
 * Đo thật: Cafe Góc Phố tháng 5/2026 có 2.110 phiếu quỹ, chỉ 1.000 được cộng —
 * **mất 53%**. Nặng hơn nữa là mã không hề sắp xếp trước khi bị cắt, nên **bỏ
 * rơi phiếu nào là tuỳ lúc**: cùng một màn, bấm tải lại có thể ra số khác.
 *
 * Nay `.order("id")` để phép cắt trang ổn định, và `quetDuDong` xin đủ mọi lô.
 */
export async function getCashSummary(supabase: SupabaseClient, fromIso: string, toIso: string): Promise<CashSummary> {
  const data = await quetDuDong<{ direction: string; amount_vnd: number }>(
    () =>
      supabase
        .from("cash_entries")
        .select("direction, amount_vnd")
        .is("deleted_at", null)
        .gte("created_at", fromIso)
        .lt("created_at", toIso)
        .order("id") as never,
    "tổng thu chi sổ quỹ",
  );
  let inVnd = 0;
  let outVnd = 0;
  for (const r of data) {
    if (r.direction === "in") inVnd += Number(r.amount_vnd);
    else outVnd += Number(r.amount_vnd);
  }
  return { inVnd, outVnd, netVnd: inVnd - outVnd };
}
