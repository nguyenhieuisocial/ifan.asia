import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Đơn hàng — kiểu + truy vấn dùng CHUNG cho màn Đơn hàng (ADR-0019 mục 5+8
 * việc 4, thẻ design man-don-hang.html, migration #127).
 *
 * Máy trạng thái ĐÚNG 4 giá trị cộng `return` ở `kind` — KHÔNG có `fulfilling`
 * (giao hàng cắt khỏi V3, xem ADR-0019 mục 5+8). Card design vẽ trước ADR nên
 * có vài chi tiết KHÔNG khớp (6 trạng thái, "Chờ giao", "Đổi hàng" đụng kho) —
 * ADR chốt sau nên ADR thắng, màn này build đúng theo ADR/migration #127.
 *
 * `totalVnd`/`paidVnd` LUÔN tính từ `order_lines`/`order_payments` (SUM),
 * KHÔNG có cột lưu sẵn nào (ADR mục 5: "tổng đơn KHÔNG lưu cột" — tránh đúng
 * lớp lỗi số-liệu-đá-nhau đã dính 3 lần ở dự án này).
 */

export const ORDER_STATUSES = ["draft", "confirmed", "completed", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_KINDS = ["order", "return"] as const;
export type OrderKind = (typeof ORDER_KINDS)[number];

export const CANCEL_REASON_MAX = 200;
export const ORDER_LINE_PRICE_MAX = 1_000_000_000;

export type PaymentMethod = "cash" | "bank_transfer" | "vietqr";

export type OrderPayment = {
  id: string;
  method: PaymentMethod;
  amountVnd: number;
  receivedAt: string;
};

export type OrderLine = {
  id: string;
  itemId: string;
  itemName: string;
  itemKind: "service" | "product";
  variantId: string | null;
  variantLabel: string | null;
  qty: number;
  unitPriceVnd: number;
  discountVnd: number;
  /** qty × đơn giá − giảm giá — ÂM ở phiếu hoàn (qty âm). Không đọc cột nào, tính tại đây khớp trigger order_payments_guard. */
  lineTotalVnd: number;
  appointmentId: string | null;
};

export type OrderListRow = {
  id: string;
  kind: OrderKind;
  status: OrderStatus;
  contactId: string;
  contactName: string;
  contactPhone: string | null;
  parentOrderId: string | null;
  lineCount: number;
  totalVnd: number;
  paidVnd: number;
  createdBy: string | null;
  createdAt: string;
};

export type OrderDetail = OrderListRow & {
  cancelReason: string | null;
  cancelledBy: string | null;
  sourceConversationId: string | null;
  sourceAppointmentId: string | null;
  lines: OrderLine[];
  payments: OrderPayment[];
};

type ContactRel = { full_name: string; phone: string | null } | { full_name: string; phone: string | null }[] | null;
function readContact(rel: ContactRel): { name: string; phone: string | null } {
  const one = Array.isArray(rel) ? rel[0] : rel;
  return { name: one?.full_name ?? "—", phone: one?.phone ?? null };
}

type LineAggRow = { qty: number; unit_price_vnd: number; discount_vnd: number };
function sumLines(lines: LineAggRow[]): number {
  return lines.reduce((s, l) => s + l.qty * l.unit_price_vnd - l.discount_vnd, 0);
}
type PaymentAggRow = { amount_vnd: number };
function sumPayments(payments: PaymentAggRow[]): number {
  return payments.reduce((s, p) => s + p.amount_vnd, 0);
}

const ORDER_LIST_SELECT = `
  id, kind, status, contact_id, parent_order_id, created_by, created_at,
  contacts(full_name, phone),
  order_lines(qty, unit_price_vnd, discount_vnd),
  order_payments(amount_vnd)
`;

type OrderListRawRow = {
  id: string;
  kind: string;
  status: string;
  contact_id: string;
  parent_order_id: string | null;
  created_by: string | null;
  created_at: string;
  contacts: ContactRel;
  order_lines: LineAggRow[];
  order_payments: PaymentAggRow[];
};

function mapListRow(r: OrderListRawRow): OrderListRow {
  const contact = readContact(r.contacts);
  return {
    id: r.id,
    kind: r.kind as OrderKind,
    status: r.status as OrderStatus,
    contactId: r.contact_id,
    contactName: contact.name,
    contactPhone: contact.phone,
    parentOrderId: r.parent_order_id,
    lineCount: r.order_lines.length,
    totalVnd: sumLines(r.order_lines),
    paidVnd: sumPayments(r.order_payments),
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

const LIST_LIMIT = 100;

/** Danh sách đơn — lọc theo trạng thái ở CSDL (không tải hết rồi lọc tay). `status: "all"` = mọi trạng thái. */
export async function listOrders(
  supabase: SupabaseClient,
  status: OrderStatus | "all",
): Promise<OrderListRow[]> {
  let query = supabase
    .from("orders")
    .select(ORDER_LIST_SELECT)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (status !== "all") query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as OrderListRawRow[]).map(mapListRow);
}

export type OrderCounts = Record<OrderStatus, number> & { all: number };

/**
 * Đếm theo trạng thái bằng COUNT riêng ở CSDL — KHÔNG đếm độ dài mảng đã tải
 * (đúng lớp lỗi "đếm sai kiểu tải-về-đếm" dự án đã vá ở việc #21/#24, không
 * lặp lại ở màn mới).
 */
export async function fetchOrderCounts(supabase: SupabaseClient): Promise<OrderCounts> {
  const base = () => supabase.from("orders").select("id", { count: "exact", head: true }).is("deleted_at", null);
  const [all, draft, confirmed, completed, cancelled] = await Promise.all([
    base(),
    base().eq("status", "draft"),
    base().eq("status", "confirmed"),
    base().eq("status", "completed"),
    base().eq("status", "cancelled"),
  ]);
  return {
    all: all.count ?? 0,
    draft: draft.count ?? 0,
    confirmed: confirmed.count ?? 0,
    completed: completed.count ?? 0,
    cancelled: cancelled.count ?? 0,
  };
}

type OrderLineRawRow = {
  id: string;
  item_id: string;
  variant_id: string | null;
  qty: number;
  unit_price_vnd: number;
  discount_vnd: number;
  appointment_id: string | null;
  items: { name: string; kind: string } | { name: string; kind: string }[] | null;
  item_variants: { attributes: { label?: string } | null } | { attributes: { label?: string } | null }[] | null;
};

function readOne<T>(rel: T | T[] | null): T | null {
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

function mapLine(r: OrderLineRawRow): OrderLine {
  const item = readOne(r.items);
  const variant = readOne(r.item_variants);
  return {
    id: r.id,
    itemId: r.item_id,
    itemName: item?.name ?? "—",
    itemKind: (item?.kind as "service" | "product") ?? "service",
    variantId: r.variant_id,
    variantLabel: variant?.attributes?.label ?? null,
    qty: Number(r.qty),
    unitPriceVnd: Number(r.unit_price_vnd),
    discountVnd: Number(r.discount_vnd),
    lineTotalVnd: Number(r.qty) * Number(r.unit_price_vnd) - Number(r.discount_vnd),
    appointmentId: r.appointment_id,
  };
}

/** Chi tiết một đơn — null nếu không tồn tại HOẶC RLS không cho thấy (hai trường hợp gộp làm một, đúng khuôn contacts). */
export async function getOrderDetail(supabase: SupabaseClient, orderId: string): Promise<OrderDetail | null> {
  const [orderRes, linesRes, paymentsRes] = await Promise.all([
    supabase
      .from("orders")
      .select(
        `id, kind, status, contact_id, parent_order_id, created_by, created_at,
         cancel_reason, cancelled_by, source_conversation_id, source_appointment_id,
         contacts(full_name, phone)`,
      )
      .eq("id", orderId)
      .maybeSingle(),
    supabase
      .from("order_lines")
      .select("id, item_id, variant_id, qty, unit_price_vnd, discount_vnd, appointment_id, items(name, kind), item_variants(attributes)")
      .eq("order_id", orderId)
      // `sort_order` mặc định 0 cho MỌI dòng (addOrderLine không set riêng) —
      // sort theo created_at làm tie-break để thứ tự hiện đúng thứ tự đã thêm.
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("order_payments")
      .select("id, method, amount_vnd, received_at")
      .eq("order_id", orderId)
      .order("received_at"),
  ]);
  if (orderRes.error) throw new Error(orderRes.error.message);
  if (!orderRes.data) return null;
  if (linesRes.error) throw new Error(linesRes.error.message);
  if (paymentsRes.error) throw new Error(paymentsRes.error.message);

  const o = orderRes.data as unknown as {
    id: string;
    kind: string;
    status: string;
    contact_id: string;
    parent_order_id: string | null;
    created_by: string | null;
    created_at: string;
    cancel_reason: string | null;
    cancelled_by: string | null;
    source_conversation_id: string | null;
    source_appointment_id: string | null;
    contacts: ContactRel;
  };
  const contact = readContact(o.contacts);
  const lines = ((linesRes.data ?? []) as unknown as OrderLineRawRow[]).map(mapLine);
  const payments = ((paymentsRes.data ?? []) as unknown as { id: string; method: string; amount_vnd: number; received_at: string }[]).map(
    (p) => ({ id: p.id, method: p.method as PaymentMethod, amountVnd: Number(p.amount_vnd), receivedAt: p.received_at }),
  );

  return {
    id: o.id,
    kind: o.kind as OrderKind,
    status: o.status as OrderStatus,
    contactId: o.contact_id,
    contactName: contact.name,
    contactPhone: contact.phone,
    parentOrderId: o.parent_order_id,
    lineCount: lines.length,
    totalVnd: lines.reduce((s, l) => s + l.lineTotalVnd, 0),
    paidVnd: payments.reduce((s, p) => s + p.amountVnd, 0),
    createdBy: o.created_by,
    createdAt: o.created_at,
    cancelReason: o.cancel_reason,
    cancelledBy: o.cancelled_by,
    sourceConversationId: o.source_conversation_id,
    sourceAppointmentId: o.source_appointment_id,
    lines,
    payments,
  };
}
