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

/**
 * MÃ ĐƠN mà con người đọc và ngân hàng thấy: `DH` + 8 ký tự đầu của mã đơn.
 *
 * ⚠️ ĐÂY KHÔNG PHẢI MÃ MỚI. Chuỗi này đã được in vào nội dung VietQR từ lâu,
 *   và webhook SePay (migration #243) bóc đúng nó ra để khớp tiền về:
 *   `substring(upper(content) from '\mDH([0-9A-F]{8})\M')`. Trước đây nó nằm
 *   rải rác trong màn — bảng CSDL không có cột mã, nên mỗi chỗ tự dựng lại.
 *   Gom về một hàm vì hậu quả của việc lệch nhau là **tiền về không khớp
 *   được đơn nào**: khách chuyển khoản ghi một mã, chủ tiệm mở đơn thấy mã
 *   khác, và không ai biết bên nào sai.
 *
 * ⚠️ ĐỔI HÀM NÀY LÀ ĐỔI CẢ ĐƯỜNG TIỀN. Muốn đặt số chứng từ chạy tuần tự
 *   (DH00123) thì phải thêm cột + bộ đếm theo tiệm + sửa cả biểu thức trong
 *   #243, không phải sửa mỗi chỗ này.
 */
export function maDon(orderId: string): string {
  return `DH${orderId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

/**
 * Cách trả tiền — ĐÚNG 4 giá trị, khớp `order_payments_method_check`.
 *
 * `points` (migration #194) KHÔNG phải một ô thu tiền bấm tay: nó chỉ do
 * `loyalty_redeem_for_order` ghi ra, cùng giao dịch với việc trừ điểm của khách,
 * và KHÔNG sinh phiếu sổ quỹ (không đồng nào vào két). Vì vậy `MANUAL_PAYMENT_METHODS`
 * ở dưới cố tình THIẾU nó — ô thu tiền mà ghi thẳng `points` là trừ tiền đơn mà
 * không trừ điểm ai cả.
 */
export type PaymentMethod = "cash" | "bank_transfer" | "vietqr" | "points";

export const MANUAL_PAYMENT_METHODS = ["cash", "bank_transfer", "vietqr"] as const;
export type ManualPaymentMethod = (typeof MANUAL_PAYMENT_METHODS)[number];

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
  /**
   * Khoản giảm ĐANG CHỜ DUYỆT của dòng này (migration #165) — null nếu không có.
   *
   * Số này CHƯA được trừ vào `discountVnd`/`lineTotalVnd`: nó là khoản nhân
   * viên xin vượt trần vai mình. Bày ra để màn đơn nói rõ "dòng nào đã áp, dòng
   * nào còn chờ" thay vì trông y hệt dòng không giảm gì.
   */
  pendingDiscountVnd: number | null;
  pendingDiscountPct: number | null;
  /**
   * #214/#224 — người THỰC HIỆN dòng này + hoa hồng họ nhận cho dòng đó.
   * `performerEmployeeId` ưu tiên cột ghi thẳng, lùi về người mà hoa hồng đã
   * quy (commission_entries.employee_id — chắc chắn khớp bảng lương).
   * `commissionVnd` là hoa hồng RÒNG của dòng (đã trừ phần đảo nếu có); null =
   * chưa sinh hoa hồng (đơn chưa hoàn tất / tiệm không đặt tỉ lệ).
   * Nhân viên chỉ thấy hoa hồng CỦA MÌNH (RLS commission_entries), quản lý thấy cả.
   */
  performerEmployeeId: string | null;
  performerName: string | null;
  commissionVnd: number | null;
  /**
   * #190 — VAT (Model A: giá đã gồm VAT). `taxRate` = % chép lúc tạo dòng.
   * `taxVnd` = phần VAT BÓC NGƯỢC = round(lineTotal * rate/(100+rate)); ÂM ở
   * phiếu hoàn (lineTotal âm). 0 khi tiệm tắt VAT. KHÔNG cộng thêm vào tổng —
   * chỉ để hiện "trong đó VAT".
   */
  taxRate: number;
  taxVnd: number;
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

// `line_total_vnd` là CỘT SINH của CSDL (migration #198) — KHÔNG tự nhân lại ở
// đây. Dòng phiếu hoàn có `qty` âm mà `discount_vnd` dương, nên
// `qty * unit_price_vnd - discount_vnd` ra số lớn hơn giá trị thật đúng hai lần
// khoản giảm; chủ tiệm đọc sai số tiền đã hoàn cho khách.
type LineAggRow = { line_total_vnd: number };
function sumLines(lines: LineAggRow[]): number {
  return lines.reduce((s, l) => s + Number(l.line_total_vnd), 0);
}
type PaymentAggRow = { amount_vnd: number };
function sumPayments(payments: PaymentAggRow[]): number {
  return payments.reduce((s, p) => s + p.amount_vnd, 0);
}

const ORDER_LIST_SELECT = `
  id, kind, status, contact_id, parent_order_id, created_by, created_at,
  contacts(full_name, phone),
  order_lines(line_total_vnd),
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
/**
 * Khoảng ngày lọc đơn — dạng `2026-08-22`, tính theo GIỜ VIỆT NAM.
 *
 * ⚠️ MỘT NGÀY VIỆT NAM = 00:00 tới 24:00 GIỜ VIỆT NAM, không phải giờ quốc tế.
 *   So thẳng `created_at >= '2026-08-22'` là so với 0h giờ quốc tế = 7h sáng
 *   giờ Việt Nam, nên mất sạch đơn từ 0h tới 7h và ăn nhầm 7 tiếng của hôm sau.
 */
export interface KhoangNgay {
  tu: string;
  den: string;
}

export async function listOrders(
  supabase: SupabaseClient,
  status: OrderStatus | "all",
  khoang?: KhoangNgay | null,
): Promise<OrderListRow[]> {
  let query = supabase
    .from("orders")
    .select(ORDER_LIST_SELECT)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (status !== "all") query = query.eq("status", status);
  if (khoang) {
    // `den` cộng thêm một ngày rồi dùng `<` — bao trọn ngày cuối, không phải
    // cắt ở đúng 0h của nó.
    const denHomSau = new Date(`${khoang.den}T00:00:00+07:00`);
    denHomSau.setUTCDate(denHomSau.getUTCDate() + 1);
    query = query
      .gte("created_at", new Date(`${khoang.tu}T00:00:00+07:00`).toISOString())
      .lt("created_at", denHomSau.toISOString());
  }

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
  line_total_vnd: number;
  appointment_id: string | null;
  performed_by_employee_id: string | null;
  tax_rate: number | string | null;
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
    // Cột SINH của CSDL (#198) — đúng dấu cả ở dòng phiếu hoàn.
    lineTotalVnd: Number(r.line_total_vnd),
    appointmentId: r.appointment_id,
    // Điền ở `getOrderDetail` (cần một truy vấn riêng sang bảng phiếu duyệt).
    pendingDiscountVnd: null,
    pendingDiscountPct: null,
    // performerEmployeeId khởi từ cột ghi thẳng; performerName + commissionVnd
    // điền ở `getOrderDetail` (cần commission_entries + bảng tên nhân viên).
    performerEmployeeId: r.performed_by_employee_id,
    performerName: null,
    commissionVnd: null,
    // #190 — VAT bóc ngược (Model A). taxRate 0 → taxVnd 0.
    taxRate: Number(r.tax_rate ?? 0),
    taxVnd:
      Number(r.tax_rate ?? 0) > 0
        ? Math.round((Number(r.line_total_vnd) * Number(r.tax_rate)) / (100 + Number(r.tax_rate)))
        : 0,
  };
}

/** Chi tiết một đơn — null nếu không tồn tại HOẶC RLS không cho thấy (hai trường hợp gộp làm một, đúng khuôn contacts). */
/** Một mốc trong lịch sử đơn (từ domain_events — đã ghi sẵn cả vòng đời). */
export type OrderHistoryItem = {
  type: string; // "created" | "confirmed" | "completed" | "cancelled" | …
  actorName: string | null;
  at: string;
  cancelReason: string | null;
};

/**
 * #224 — lịch sử một đơn: ai tạo/xác nhận/hoàn tất/huỷ (+ lý do), lúc nào.
 * Đọc từ `domain_events` (đã emit sẵn cả vòng đời đơn; RLS tenant_id =
 * current_tenant_id nên mọi thành viên tiệm đọc được đơn của tiệm mình). Tách
 * khỏi getOrderDetail theo khuôn page.tsx (extras riêng-đơn fetch riêng). Đọc
 * hỏng thì trả rỗng + log — đây là khối bổ sung, không được làm hỏng cả màn.
 */
export async function getOrderHistory(supabase: SupabaseClient, orderId: string): Promise<OrderHistoryItem[]> {
  const { data: events, error } = await supabase
    .from("domain_events")
    .select("event_type, actor_user_id, created_at, payload")
    .eq("aggregate_type", "order")
    .eq("aggregate_id", orderId)
    .order("created_at");
  if (error) {
    console.error("[order-history] không đọc được lịch sử đơn:", error.message);
    return [];
  }
  const rows = (events ?? []) as {
    event_type: string;
    actor_user_id: string | null;
    created_at: string;
    payload: Record<string, unknown> | null;
  }[];
  const actorOf = (e: (typeof rows)[number]): string | null =>
    e.actor_user_id ?? (e.payload?.cancelled_by as string) ?? (e.payload?.created_by as string) ?? null;

  const ids = [...new Set(rows.map(actorOf).filter((x): x is string => !!x))];
  const nameMap = new Map<string, string>();
  if (ids.length) {
    // Tên chỉ là NHÃN — hỏng thì thiếu tên chứ không bỏ cả mốc lịch sử.
    const { data: profs } = await supabase.from("profiles").select("user_id, display_name").in("user_id", ids);
    for (const p of (profs ?? []) as { user_id: string; display_name: string | null }[]) {
      if (p.display_name) nameMap.set(p.user_id, p.display_name);
    }
  }
  return rows.map((e) => {
    const actor = actorOf(e);
    return {
      type: e.event_type.replace(/^order\./, ""),
      actorName: actor ? (nameMap.get(actor) ?? null) : null,
      at: e.created_at,
      cancelReason: (e.payload?.cancel_reason as string) ?? null,
    };
  });
}

export async function getOrderDetail(supabase: SupabaseClient, orderId: string): Promise<OrderDetail | null> {
  const [orderRes, linesRes, paymentsRes, discountsRes, commissionRes, staffRes] = await Promise.all([
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
      .select(
        "id, item_id, variant_id, qty, unit_price_vnd, discount_vnd, line_total_vnd, appointment_id, performed_by_employee_id, tax_rate, items(name, kind), item_variants(attributes)",
      )
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
    // Khoản giảm CÒN CHỜ DUYỆT của đơn này (migration #165). Không gộp vào câu
    // trên bằng embed: `order_lines` không có FK trỏ sang `discount_approvals`.
    supabase
      .from("discount_approvals")
      .select("order_line_id, discount_vnd, discount_pct")
      .eq("order_id", orderId)
      .eq("status", "pending"),
    // #214/#224 — hoa hồng đã sinh cho mỗi dòng của đơn này. RLS
    // commission_select: quản lý+ đọc CẢ tiệm, nhân viên chỉ đọc phần của mình
    // → dòng người khác trả về rỗng cho nhân viên, đúng phạm vi.
    supabase.from("commission_entries").select("order_line_id, employee_id, amount_vnd").eq("order_id", orderId),
    // Tên người thực hiện (employees_ten: owner/admin/manager; nhân viên nhận
    // mảng rỗng — họ chỉ thấy hoa hồng của mình, tên là chính họ, không cần map).
    supabase.rpc("employees_ten"),
  ]);
  if (orderRes.error) throw new Error(orderRes.error.message);
  if (!orderRes.data) return null;
  if (linesRes.error) throw new Error(linesRes.error.message);
  if (paymentsRes.error) throw new Error(paymentsRes.error.message);
  if (discountsRes.error) throw new Error(discountsRes.error.message);

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
  const choDuyet = new Map(
    (
      (discountsRes.data ?? []) as unknown as {
        order_line_id: string;
        discount_vnd: number;
        discount_pct: number;
      }[]
    ).map((d) => [d.order_line_id, { vnd: Number(d.discount_vnd), pct: Number(d.discount_pct) }]),
  );
  // Hoa hồng + người hưởng theo dòng. KHÔNG ném khi lỗi: đây là NHÃN bổ sung —
  // hỏng thì đơn vẫn phải đọc được (thà thiếu nhãn còn hơn cả màn thành trang
  // lỗi), nhưng lỗi phải vào log chứ không nuốt câm (#169).
  if (commissionRes.error) console.error("[order-detail] không đọc được hoa hồng:", commissionRes.error.message);
  if (staffRes.error) console.error("[order-detail] không đọc được tên nhân viên:", staffRes.error.message);
  const hoaHongTheoDong = new Map<string, { employeeId: string; vnd: number }>();
  for (const c of (commissionRes.data ?? []) as { order_line_id: string | null; employee_id: string; amount_vnd: number }[]) {
    if (!c.order_line_id) continue;
    const cur = hoaHongTheoDong.get(c.order_line_id);
    if (cur) cur.vnd += Number(c.amount_vnd); // gộp is_reversal → hoa hồng RÒNG
    else hoaHongTheoDong.set(c.order_line_id, { employeeId: c.employee_id, vnd: Number(c.amount_vnd) });
  }
  const tenNhanVien = new Map<string, string>(
    ((staffRes.data ?? []) as { id: string; full_name: string }[]).map((e) => [e.id, e.full_name]),
  );
  const lines = ((linesRes.data ?? []) as unknown as OrderLineRawRow[]).map(mapLine).map((l) => {
    const hh = hoaHongTheoDong.get(l.id) ?? null;
    // Người thực hiện: ưu tiên người mà hoa hồng đã quy (chắc chắn khớp bảng
    // lương), lùi về cột ghi thẳng trên dòng (đơn chưa hoàn tất chưa có hoa hồng).
    const performerEmployeeId = hh?.employeeId ?? l.performerEmployeeId;
    return {
      ...l,
      pendingDiscountVnd: choDuyet.get(l.id)?.vnd ?? null,
      pendingDiscountPct: choDuyet.get(l.id)?.pct ?? null,
      performerEmployeeId,
      performerName: performerEmployeeId ? (tenNhanVien.get(performerEmployeeId) ?? null) : null,
      commissionVnd: hh ? hh.vnd : null,
    };
  });
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
