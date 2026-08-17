"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { CANCEL_REASON_MAX, ORDER_LINE_PRICE_MAX } from "@/lib/catalog/orders";

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

function mapDbError(err: { message: string }): string {
  if (/order_locked/.test(err.message)) return "order_locked";
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
});

export async function addOrderLine(input: z.infer<typeof addLineSchema>): Promise<ActionResult> {
  const parsed = addLineSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error };

  const { error } = await auth.supabase.from("order_lines").insert({
    tenant_id: auth.tenantId,
    order_id: parsed.data.orderId,
    item_id: parsed.data.itemId,
    variant_id: parsed.data.variantId,
    qty: parsed.data.qty,
    unit_price_vnd: parsed.data.unitPriceVnd,
    discount_vnd: parsed.data.discountVnd,
    appointment_id: parsed.data.appointmentId,
  });
  if (error) return { error: mapDbError(error) };
  revalidateOrders(parsed.data.orderId);
  return { error: null };
}

export async function removeOrderLine(lineId: string, orderId: string): Promise<ActionResult> {
  const parsedId = z.uuid().safeParse(lineId);
  if (!parsedId.success) return { error: "invalid_input" };
  const auth = await requireAuth();
  if (!auth.ok) return { error: auth.error };

  const { error } = await auth.supabase.from("order_lines").delete().eq("id", parsedId.data);
  if (error) return { error: mapDbError(error) };
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

/** Đã xác nhận → Xong. Từ đây CSDL khoá dòng hàng (order_lines_lock_guard). */
export async function completeOrder(orderId: string): Promise<ActionResult> {
  return transition(orderId, { status: "completed" }, ["confirmed"]);
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
  method: z.enum(["cash", "bank_transfer", "vietqr"]),
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
