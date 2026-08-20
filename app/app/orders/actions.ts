"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { CANCEL_REASON_MAX, MANUAL_PAYMENT_METHODS, ORDER_LINE_PRICE_MAX } from "@/lib/catalog/orders";

/**
 * Màn Đơn hàng (ADR-0019 mục 5+8 việc 4, migration #127).
 *
 * QUYỀN: không siết thêm ở đây — RLS `orders_insert`/`_update`/`order_lines_write`
 * (migration #127) đã đúng luật: owner/admin/manager thao tác mọi đơn của
 * tiệm, `staff` chỉ thao tác đơn MÌNH TẠO, `viewer` bị chặn ghi cả hai chiều.
 * Cùng nguyên tắc đã áp ở `app/app/calendar/actions.ts` — hai nơi enforce
 * cùng một luật là hai nơi có thể LỆCH khi một bên sửa mà bên kia quên (D2).
 */

type ActionResult = { error: string | null };

/**
 * Kết quả XIN GIẢM GIÁ của một dòng hàng — trả nguyên vẹn lên màn, không nuốt.
 *
 * `cho_duyet` KHÔNG phải lỗi và cũng KHÔNG phải "xong xuôi": dòng hàng đã vào
 * nhưng khoản giảm CHƯA được trừ. Màn nào nhận giá trị này mà vẫn báo "đã tạo
 * đơn" như bình thường là nói dối người bán — đúng lớp lỗi im lặng mà việc #166
 * đã tốn công dập.
 */
type DiscountOutcome = {
  ketQua: "da_ap" | "cho_duyet" | "don_da_chot" | "giam_qua_gia_dong";
  giamPct: number | null;
  tranCuaBan: number | null;
};
const DISCOUNT_OUTCOMES = ["da_ap", "cho_duyet", "don_da_chot", "giam_qua_gia_dong"] as const;

function mapDbError(err: { message: string }): string {
  // Trigger `order_lines_discount_cap_guard` (migration #183). Đường ghi của
  // màn này đã đi qua `discount_request` nên người dùng thường KHÔNG chạm tới;
  // nếu chạm, đó là dấu hiệu còn một đường ghi thẳng chưa nối — và người dùng
  // phải đọc được câu có nghĩa thay vì "Lưu thất bại".
  if (/discount_cap_exceeded/.test(err.message)) return "discount_cap_exceeded";
  if (/order_locked/.test(err.message)) return "order_locked";
  // Hai lỗi RAISE của `voucher_apply`/`loyalty_redeem_for_order` (migration
  // #159/#194) — chúng chỉ ném khi vai không đủ quyền hoặc đơn không tồn tại;
  // mọi nhánh NGHIỆP VỤ khác đi bằng `{ok:false, ly_do}` chứ không ném.
  if (/forbidden/.test(err.message)) return "forbidden";
  if (/order_not_found/.test(err.message)) return "not_found";
  if (/payment_exceeds_order_total/.test(err.message)) return "payment_exceeds_total";
  if (/row-level security/i.test(err.message)) return "forbidden";
  if (/violates check constraint|violates foreign key|qty ÂM|qty DƯƠNG/i.test(err.message)) return "invalid_input";
  return "save_failed";
}

async function requireAuth(): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; userId: string; tenantId: string }
  | { ok: false; error: "not_authenticated" | "not_found" }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };
  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) return { ok: false, error: "not_found" };
  return { ok: true, supabase, userId: user.id, tenantId: tenant.id as string };
}

function revalidateOrders(orderId?: string) {
  revalidatePath("/app/orders");
  if (orderId) revalidatePath(`/app/orders/${orderId}`);
}

// ---------- Tạo đơn ----------

const createOrderSchema = z.object({
  contactId: z.uuid(),
  sourceConversationId: z.uuid().nullable(),
  sourceAppointmentId: z.uuid().nullable(),
});

export async function createOrder(
  input: z.infer<typeof createOrderSchema>,
): Promise<ActionResult & { orderId?: string }> {
  const parsed = createOrderSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error };

  const { data, error } = await auth.supabase
    .from("orders")
    .insert({
      tenant_id: auth.tenantId,
      contact_id: parsed.data.contactId,
      source_conversation_id: parsed.data.sourceConversationId,
      source_appointment_id: parsed.data.sourceAppointmentId,
      created_by: auth.userId,
    })
    .select("id")
    .single();
  if (error) return { error: mapDbError(error) };
  revalidateOrders();
  return { error: null, orderId: data.id as string };
}

// ---------- Dòng hàng (chỉ khi đơn còn Nháp — order_lines_lock_guard tự chặn nếu không) ----------

const addLineSchema = z.object({
  orderId: z.uuid(),
  itemId: z.uuid(),
  variantId: z.uuid().nullable(),
  qty: z.number().positive().max(100_000),
  unitPriceVnd: z.number().int().min(0).max(ORDER_LINE_PRICE_MAX),
  discountVnd: z.number().int().min(0).max(ORDER_LINE_PRICE_MAX),
  appointmentId: z.uuid().nullable(),
  // #224 — ai LÀM dòng này (đơn khách vãng lai không qua lịch hẹn). Null = để
  // trống, hoa hồng khi đó quy về người của lịch hẹn (nếu có) hoặc người tạo đơn.
  performedByEmployeeId: z.uuid().nullable(),
});

/**
 * Thêm dòng hàng. GIẢM GIÁ KHÔNG ghi thẳng nữa — đi qua `discount_request`
 * (migration #165), vì trần theo vai là luật của tiệm chứ không phải ô nhập tự do.
 *
 * Hai nhịp, cố ý: hàm `discount_request` tính tỷ lệ giảm trên `qty × đơn giá`
 * của CHÍNH dòng đó, nên dòng phải tồn tại trước. Vậy nên chèn dòng với
 * `discount_vnd = 0` rồi mới xin giảm.
 *
 * Nhịp hai hỏng thì dòng ĐÃ vào mà tiền CHƯA giảm — trả `discount_failed` chứ
 * không báo "đã thêm" trơn tru.
 */
export async function addOrderLine(
  input: z.infer<typeof addLineSchema>,
): Promise<ActionResult & { discount?: DiscountOutcome }> {
  const parsed = addLineSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error };

  // #190 — chép mức VAT của tiệm vào dòng LÚC TẠO (Model A). Tắt/chưa cấu hình
  // → 0 (không thuế). Chép cứng để đổi mức sau không sửa ngược đơn cũ.
  const { data: tax } = await auth.supabase.from("tax_settings").select("enabled, rate").maybeSingle();
  const taxRate = tax?.enabled ? Number(tax.rate) : 0;

  // #224 — người làm dòng này. Cột `performed_by_employee_id` chỉ có FK tới
  // employees(id), KHÔNG có ràng buộc cùng-tiệm ở CSDL (FK bỏ qua RLS), nên
  // phải XÁC MINH ở đây: id gửi lên phải nằm trong `bookable_staff()` của tiệm
  // đang mở (SECURITY DEFINER, migration #230 — chỉ trả người CÒN LÀM của tiệm
  // này). Cùng khuôn `resolveStaff` ở app/app/calendar/actions.ts. Không thuộc
  // tiệm ⇒ chặn hẳn, không âm thầm gán bừa.
  let performedBy: string | null = null;
  if (parsed.data.performedByEmployeeId) {
    const { data: staff, error: staffErr } = await auth.supabase.rpc("bookable_staff");
    if (staffErr) return { error: "save_failed" };
    const hop = (staff as { id: string }[] | null)?.some(
      (e) => e.id === parsed.data.performedByEmployeeId,
    );
    if (!hop) return { error: "invalid_input" };
    performedBy = parsed.data.performedByEmployeeId;
  }

  const { data: line, error } = await auth.supabase
    .from("order_lines")
    .insert({
      tenant_id: auth.tenantId,
      order_id: parsed.data.orderId,
      item_id: parsed.data.itemId,
      variant_id: parsed.data.variantId,
      qty: parsed.data.qty,
      unit_price_vnd: parsed.data.unitPriceVnd,
      discount_vnd: 0,
      tax_rate: taxRate,
      appointment_id: parsed.data.appointmentId,
      performed_by_employee_id: performedBy,
    })
    .select("id")
    .single();
  if (error) return { error: mapDbError(error) };

  if (parsed.data.discountVnd <= 0) {
    revalidateOrders(parsed.data.orderId);
    return { error: null };
  }

  const { data, error: giamErr } = await auth.supabase.rpc("discount_request", {
    p_order_line_id: line.id as string,
    p_discount_vnd: parsed.data.discountVnd,
    p_reason: null,
  });
  revalidateOrders(parsed.data.orderId);
  if (giamErr) return { error: "discount_failed" };

  const kq = (data ?? {}) as { ket_qua?: string; giam_pct?: number; tran_cua_ban?: number };
  // Giá trị lạ (hàm đổi mà đây quên theo) ⇒ KHÔNG đoán bừa là "đã áp".
  if (!DISCOUNT_OUTCOMES.includes(kq.ket_qua as (typeof DISCOUNT_OUTCOMES)[number])) {
    return { error: "discount_failed" };
  }
  return {
    error: null,
    discount: {
      ketQua: kq.ket_qua as DiscountOutcome["ketQua"],
      giamPct: kq.giam_pct ?? null,
      tranCuaBan: kq.tran_cua_ban ?? null,
    },
  };
}

export async function removeOrderLine(lineId: string, orderId: string): Promise<ActionResult> {
  const parsedId = z.uuid().safeParse(lineId);
  if (!parsedId.success) return { error: "invalid_input" };
  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error };

  const { data, error } = await auth.supabase
    .from("order_lines")
    .delete()
    .eq("id", parsedId.data)
    .select("id");
  if (error) return { error: mapDbError(error) };
  // DELETE bị `order_lines_write` lọc hết (nhân viên xoá dòng trong đơn nháp của
  // người khác) ⇒ 0 dòng, KHÔNG ném lỗi — cùng cái bẫy im lặng mà `transition()`
  // bên dưới đã phải tự đếm dòng để tránh. Không đếm thì màn báo "Đã xoá dòng"
  // trong khi dòng hàng còn nguyên.
  if (!data || data.length === 0) return { error: "forbidden" };
  revalidateOrders(orderId);
  return { error: null };
}

// ---------- Máy trạng thái: draft → confirmed → completed, hoặc huỷ ----------
// ĐÚNG 4 giá trị đóng (bất biến 14, ADR-0019 mục 5) — không tự thêm ở đây.

async function transition(
  orderId: string,
  patch: Record<string, unknown>,
  fromStatuses: string[],
): Promise<ActionResult> {
  const parsedId = z.uuid().safeParse(orderId);
  if (!parsedId.success) return { error: "invalid_input" };
  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error };

  const { data, error } = await auth.supabase
    .from("orders")
    .update(patch)
    .eq("id", parsedId.data)
    .in("status", fromStatuses)
    .select("id");
  if (error) return { error: mapDbError(error) };
  // Không khớp .in(status,...) (đơn đã đổi trạng thái ở nơi khác) → update trả
  // 0 dòng, KHÔNG phải lỗi CSDL — phải tự kiểm để không báo "đã lưu" sai sự thật.
  if (!data || data.length === 0) return { error: "stale_state" };
  revalidateOrders(parsedId.data);
  return { error: null };
}

/** Nháp → Đã xác nhận. Bắt phải có ít nhất 1 dòng hàng — xác nhận đơn rỗng không có nghĩa. */
export async function confirmOrder(orderId: string): Promise<ActionResult> {
  const parsedId = z.uuid().safeParse(orderId);
  if (!parsedId.success) return { error: "invalid_input" };
  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error };

  const { count } = await auth.supabase
    .from("order_lines")
    .select("id", { count: "exact", head: true })
    .eq("order_id", parsedId.data);
  if (!count) return { error: "no_lines" };

  return transition(orderId, { status: "confirmed" }, ["draft"]);
}

/**
 * Đã xác nhận → Xong. Từ đây CSDL khoá dòng hàng (order_lines_lock_guard).
 *
 * Đây cũng là lúc CỘNG ĐIỂM cho khách (V6 retention). Ba lưu ý cố tình:
 *   - Cộng điểm là việc PHỤ: hỏng thì đơn vẫn phải xong, nhưng lỗi vào log chứ
 *     không nuốt im lặng (mục #169).
 *   - Cộng SAU khi đã chuyển trạng thái, không phải trước — nếu chuyển trạng
 *     thái hỏng thì không được phát sinh điểm cho một đơn chưa xong.
 *   - Hàm `loyalty_earn_for_order` tự chặn tích hai lần bằng chỉ mục unique, nên
 *     bấm Xong nhiều lần (hoặc hai người cùng bấm) cũng chỉ tích đúng một lần.
 */
export async function completeOrder(orderId: string): Promise<ActionResult> {
  const ketQua = await transition(orderId, { status: "completed" }, ["confirmed"]);
  if (ketQua.error) return ketQua;

  const supabase = await createClient();
  const { error } = await supabase.rpc("loyalty_earn_for_order", { p_order_id: orderId });
  if (error) console.error("[loyalty] không cộng được điểm cho đơn:", error.message);

  return ketQua;
}

const cancelSchema = z.object({
  orderId: z.uuid(),
  reason: z.string().trim().min(1).max(CANCEL_REASON_MAX),
});

/** Huỷ — chỉ từ Nháp/Đã xác nhận, bắt buộc lý do (cùng luật "3 chốt cứng" đã áp cho lịch hẹn). */
export async function cancelOrder(input: z.infer<typeof cancelSchema>): Promise<ActionResult> {
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error };

  return transition(
    parsed.data.orderId,
    { status: "cancelled", cancel_reason: parsed.data.reason, cancelled_by: auth.userId },
    ["draft", "confirmed"],
  );
}

// ---------- Hoàn hàng: ĐƠN MỚI kind=return, đơn gốc không đổi (ADR-0019 mục 5) ----------

const returnLineSchema = z.object({
  orderLineId: z.uuid(),
  qty: z.number().positive(),
});
const createReturnSchema = z.object({
  orderId: z.uuid(),
  lines: z.array(returnLineSchema).min(1),
});

/**
 * Tạo phiếu hoàn từ một đơn ĐÃ XONG. Giới hạn hoàn ĐƠN GIẢN: không vượt số
 * lượng của chính dòng gốc — KHÔNG cộng dồn các phiếu hoàn trước đó của cùng
 * dòng (giới hạn biết trước, ghi rõ ở đây, không âm thầm cho hoàn vô hạn lần
 * một dòng — nợ thi công đầy đủ hơn nếu cần, không phải lỗi ẩn).
 *
 * Không có transaction nhiều bảng qua supabase-js REST: nếu một dòng insert
 * lỗi giữa chừng, phiếu hoàn tạo dở vẫn ở trạng thái Nháp (không ảnh hưởng sổ
 * sách — chỉ commit số khi Hoàn tất) — người dùng thấy ngay và tự huỷ/làm lại.
 */
export async function createReturn(
  input: z.infer<typeof createReturnSchema>,
): Promise<ActionResult & { returnOrderId?: string }> {
  const parsed = createReturnSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error };

  const { data: order, error: orderErr } = await auth.supabase
    .from("orders")
    .select("id, status, contact_id")
    .eq("id", parsed.data.orderId)
    .maybeSingle();
  if (orderErr) return { error: mapDbError(orderErr) };
  if (!order) return { error: "not_found" };
  if (order.status !== "completed") return { error: "not_completed" };

  const { data: origLines, error: linesErr } = await auth.supabase
    .from("order_lines")
    .select("id, item_id, variant_id, qty, unit_price_vnd, discount_vnd, appointment_id")
    .eq("order_id", parsed.data.orderId);
  if (linesErr) return { error: mapDbError(linesErr) };
  const origById = new Map((origLines ?? []).map((l) => [l.id as string, l]));

  for (const rl of parsed.data.lines) {
    const orig = origById.get(rl.orderLineId);
    if (!orig || rl.qty > Number(orig.qty)) return { error: "return_exceeds_line" };
  }

  const { data: newOrder, error: newOrderErr } = await auth.supabase
    .from("orders")
    .insert({
      tenant_id: auth.tenantId,
      kind: "return",
      parent_order_id: parsed.data.orderId,
      contact_id: order.contact_id,
      created_by: auth.userId,
    })
    .select("id")
    .single();
  if (newOrderErr) return { error: mapDbError(newOrderErr) };
  const returnOrderId = newOrder.id as string;

  for (const rl of parsed.data.lines) {
    const orig = origById.get(rl.orderLineId)!;
    const ratio = rl.qty / Number(orig.qty);
    const { error: lineErr } = await auth.supabase.from("order_lines").insert({
      tenant_id: auth.tenantId,
      order_id: returnOrderId,
      item_id: orig.item_id,
      variant_id: orig.variant_id,
      qty: -rl.qty,
      unit_price_vnd: orig.unit_price_vnd,
      // Chép theo tỷ lệ từ dòng gốc — khoản này ĐÃ qua trần/duyệt một lần rồi,
      // nên KHÔNG đi lại `discount_request`. Trigger `order_lines_discount_cap_guard`
      // (#183) miễn cho `orders.kind = 'return'` đúng vì đường này.
      discount_vnd: Math.floor(Number(orig.discount_vnd) * ratio),
      appointment_id: orig.appointment_id,
    });
    if (lineErr) return { error: mapDbError(lineErr) };
  }

  revalidateOrders(returnOrderId);
  return { error: null, returnOrderId };
}

// ---------- Thu tiền (ADR-0019 mục 6+9, migration #127) ----------
// `provider`/`provider_ref` giữ mặc định CSDL ('manual'/uuid ngẫu nhiên) —
// thu ngân XÁC NHẬN BẰNG TAY, không tự dò tiền về (chưa nối cổng ngân hàng
// thật). Trigger order_payments_guard tự chặn thu vượt tổng đơn;
// order_payments_emit_cash_entry tự sinh đúng-một-phiếu-quỹ.

const recordPaymentSchema = z.object({
  orderId: z.uuid(),
  // CỐ Ý thiếu 'points': trả bằng điểm phải đi qua `loyalty_redeem_for_order`
  // để việc trừ điểm và việc ghi khoản trả nằm trong CÙNG một giao dịch
  // (migration #194). Ghi thẳng ở đây là trừ tiền đơn mà không trừ điểm ai cả.
  method: z.enum(MANUAL_PAYMENT_METHODS),
  amountVnd: z.number().int().positive().max(ORDER_LINE_PRICE_MAX),
});

export async function recordPayment(input: z.infer<typeof recordPaymentSchema>): Promise<ActionResult> {
  const parsed = recordPaymentSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error };

  const { error } = await auth.supabase.from("order_payments").insert({
    tenant_id: auth.tenantId,
    order_id: parsed.data.orderId,
    method: parsed.data.method,
    amount_vnd: parsed.data.amountVnd,
    received_by: auth.userId,
  });
  if (error) return { error: mapDbError(error) };
  revalidateOrders(parsed.data.orderId);
  return { error: null };
}

// ---------- Giữ khách: áp mã giảm giá & trả đơn bằng điểm (migration #159 + #194) ----------

/**
 * Hai hàm CSDL này trả `{ok, ly_do, …}` cho MỌI nhánh nghiệp vụ thay vì ném lỗi
 * — cố ý, để người bán đọc được LÝ DO thay vì một câu lỗi kỹ thuật. Hai action
 * dưới đây bê NGUYÊN mã lý do (và con số đi kèm) lên màn: gộp mười lý do thành
 * một câu "mã không dùng được" là phá đúng thứ mà CSDL đã cất công dựng.
 *
 * `giamVnd` với đường điểm KHÔNG phải giảm giá — nó là số tiền đơn được TRẢ
 * bằng điểm (`order_payments.method = 'points'`, không vào sổ quỹ). Chữ trên màn
 * phải nói đúng bản chất đó.
 */
type KetQuaUuDai = {
  ok: boolean;
  /** null khi thành công. Mã lý do NGUYÊN VẸN từ CSDL — màn hình tự dịch. */
  lyDo: string | null;
  giamVnd: number;
  /** Con số đi kèm lý do/kết quả — hiện thẳng trong câu giải thích cho người bán. */
  so: Record<string, number>;
};

/**
 * Các khoá số hai hàm CSDL gửi kèm. Lưu ý `da_dung` ở đây là SỐ LƯỢT đã dùng
 * (đi cùng lý do `het_luot`) — trùng tên với mã lý do `da_dung` nghĩa "mã đang
 * tạm dừng", nhưng nằm ở khoá khác nên không lẫn.
 */
const SO_DI_KEM = [
  "can_tu",
  "da_dung",
  "toi_da",
  "toi_da_moi_khach",
  "boi_so",
  "con",
  "con_thieu",
  "diem_da_dung",
  "con_lai_diem",
] as const;

function docKetQua(data: unknown): KetQuaUuDai | null {
  if (!data || typeof data !== "object") return null;
  const j = data as Record<string, unknown>;
  if (typeof j.ok !== "boolean") return null;
  const so: Record<string, number> = {};
  for (const k of SO_DI_KEM) {
    if (j[k] === undefined || j[k] === null) continue;
    const v = Number(j[k]);
    if (Number.isFinite(v)) so[k] = v;
  }
  return {
    ok: j.ok,
    lyDo: j.ok ? null : String(j.ly_do ?? ""),
    giamVnd: Number(j.giam_vnd ?? 0),
    so,
  };
}

const applyVoucherSchema = z.object({
  orderId: z.uuid(),
  // 32 ký tự = trần của ô tạo mã (app/app/loyalty/actions.ts) — cùng một con số.
  code: z.string().trim().min(1).max(32),
});

/**
 * Áp mã giảm giá vào đơn. Hàm CSDL tự khoá dòng voucher, tự kiểm lại từ đầu
 * (không tin kết quả xem thử của màn hình), tự PHÂN BỔ tiền giảm về từng dòng
 * hàng và tự ghi lượt dùng — tầng web không tính lại đồng nào.
 */
export async function applyVoucher(
  input: z.infer<typeof applyVoucherSchema>,
): Promise<ActionResult & { ket?: KetQuaUuDai }> {
  const parsed = applyVoucherSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error };

  const { data, error } = await auth.supabase.rpc("voucher_apply", {
    p_order_id: parsed.data.orderId,
    p_code: parsed.data.code,
  });
  if (error) return { error: mapDbError(error) };

  const ket = docKetQua(data);
  // Khuôn trả về đổi mà đây quên theo ⇒ KHÔNG đoán bừa là "đã áp".
  if (!ket) return { error: "save_failed" };
  if (ket.ok) revalidateOrders(parsed.data.orderId);
  return { error: null, ket };
}

const redeemPointsSchema = z.object({
  orderId: z.uuid(),
  points: z.number().int().positive().max(100_000_000),
});

/**
 * Khách trả một phần đơn bằng điểm. Một cửa duy nhất: hàm CSDL trừ điểm VÀ ghi
 * khoản trả trong cùng giao dịch (migration #194) — nếu tách hai lời gọi ở đây,
 * đứt mạng giữa chừng là khách MẤT điểm mà đơn KHÔNG được trừ tiền.
 */
export async function redeemPointsForOrder(
  input: z.infer<typeof redeemPointsSchema>,
): Promise<ActionResult & { ket?: KetQuaUuDai }> {
  const parsed = redeemPointsSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error };

  const { data, error } = await auth.supabase.rpc("loyalty_redeem_for_order", {
    p_order_id: parsed.data.orderId,
    p_points: parsed.data.points,
  });
  if (error) return { error: mapDbError(error) };

  const ket = docKetQua(data);
  if (!ket) return { error: "save_failed" };
  if (ket.ok) revalidateOrders(parsed.data.orderId);
  return { error: null, ket };
}
