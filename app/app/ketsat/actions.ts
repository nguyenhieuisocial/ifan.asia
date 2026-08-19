"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { tinhExpectedCash, layActualCashCaTruoc } from "./queries";

/**
 * Két sắt & Công nợ NCC (ADR-0022 V5).
 * QUYỀN: RLS shift_closings + supplier_payments chỉ mở cho owner/admin/manager.
 *
 * ⚠️ Câu cũ ở chỗ này viết "RLS đủ, tầng này không siết thêm" — SAI, và cái sai
 * đó làm chết cả hai nút ghi của mảng suốt từ ngày đầu (0 dòng chốt ca · 0 dòng
 * trả tiền NCC trên toàn CSDL, đo 20/08). RLS chỉ CHẶN ghi sang tiệm khác; nó
 * KHÔNG tự điền tiệm đúng. Hai bảng này khai `tenant_id not null` không default
 * và KHÔNG có trigger điền hộ, nên mọi INSERT ở đây PHẢI tự truyền `tenant_id`
 * (qua `boiCanh()` bên dưới).
 *
 * ⚠️ Vì sao bẫy im lặng: thiếu `tenant_id` KHÔNG BAO GIỜ báo là 23502 "null
 * value in column". Đo đóng vai trên CSDL 20/08, hai bảng ra hai mã khác nhau
 * mà không mã nào nói đúng chuyện:
 *   · `shift_closings` → **42501 "row-level security"** (Postgres xét `with
 *     check` TRƯỚC ràng buộc not-null) ⇒ người dùng đọc "Không có quyền".
 *   · `supplier_payments` → **23514** từ trigger `supplier_payments_tenant_guard`
 *     (trigger BEFORE chạy trước cả RLS, thấy `new.tenant_id` NULL nên kêu
 *     *"nhà cung cấp thuộc tiệm khác"*) ⇒ người dùng đi soát nhà cung cấp.
 * Cả hai đều đẩy người sửa đi sai hướng. Cùng bẫy đã dính ở
 * `app/app/team/actions.ts` · `app/app/payroll/actions.ts` ·
 * `app/app/contracts/actions.ts` — Két sắt là mảng thứ tư.
 *
 * Cổng `scripts/soat-insert-thieu-tenant.mjs` canh cả lớp này, để lần sau máy
 * bắt được chứ không phải chờ người đọc lại chú thích trong từng file.
 */

type ActionResult = { error: string | null };

/**
 * Lỗi CSDL → khoá `ketsat.errors.*`.
 *
 * Tách "không đủ quyền" khỏi "dữ liệu không hợp lệ" — bản cũ gộp mọi thứ
 * không-phải-RLS vào `save_failed`, và chính chỗ gộp đó đã GIẤU lỗi thiếu
 * `tenant_id` ở trên: hai loại lỗi dẫn người sửa đi hai hướng khác hẳn nhau.
 *   · 42501 — vai không đủ quyền (policy chặn).
 *   · 23502/23503/23514 — dữ liệu sai (thiếu cột bắt buộc, khoá ngoại treo,
 *     ràng buộc check — kể cả trigger `*_tenant_guard` chặn khoá ngoại chéo tiệm).
 */
function loiGhi(err: { code?: string; message: string }): string {
  if (err.code === "42501" || /row-level security/i.test(err.message)) return "forbidden";
  if (err.code === "23502" || err.code === "23503" || err.code === "23514") return "invalid_input";
  if (/violates (not-null|check|foreign key) constraint/i.test(err.message)) return "invalid_input";
  return "save_failed";
}

/**
 * Người đăng nhập + tiệm đang mở — cùng khuôn `app/app/contracts/actions.ts`.
 * RLS `tenants_select` chỉ trả đúng một dòng cho người đăng nhập.
 */
type BoiCanh =
  | { ok: false; error: string }
  | {
      ok: true;
      supabase: Awaited<ReturnType<typeof createClient>>;
      user: { id: string };
      tenantId: string;
    };

async function boiCanh(): Promise<BoiCanh> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_authenticated" };
  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) return { ok: false, error: "no_tenant" };
  return { ok: true, supabase, user, tenantId: tenant.id as string };
}

// ==================== CHỐT SỔ CA ====================

const chotCaSchema = z.object({
  shiftDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  openingCash: z.number().int().min(0),
  actualCash: z.number().int().min(0),
  note: z.string().trim().max(500).nullable(),
});

export async function chotSoCa(
  input: z.infer<typeof chotCaSchema>,
): Promise<ActionResult & { id?: string }> {
  const parsed = chotCaSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const ctx = await boiCanh();
  if (!ctx.ok) return { error: ctx.error };

  // Tính expected_cash từ sổ quỹ
  const expectedCash = await tinhExpectedCash(ctx.supabase, parsed.data.openingCash);

  const { data: row, error } = await ctx.supabase
    .from("shift_closings")
    .insert({
      tenant_id: ctx.tenantId,
      closed_by: ctx.user.id,
      shift_date: parsed.data.shiftDate,
      opening_cash: parsed.data.openingCash,
      actual_cash: parsed.data.actualCash,
      expected_cash: Math.round(expectedCash),
      note: parsed.data.note,
    })
    .select("id")
    .single();

  if (error) return { error: loiGhi(error) };
  revalidatePath("/app/ketsat");
  return { error: null, id: row.id as string };
}

// ==================== GHI THANH TOÁN NCC ====================

const ghiTraTienSchema = z.object({
  supplierId: z.uuid(),
  purchaseId: z.uuid().nullable(),
  amountVnd: z.number().int().positive().max(10_000_000_000),
  paymentMethod: z.enum(["cash", "transfer"]),
  note: z.string().trim().max(500).nullable(),
});

export async function ghiThanhToanNCC(
  input: z.infer<typeof ghiTraTienSchema>,
): Promise<ActionResult> {
  const parsed = ghiTraTienSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const ctx = await boiCanh();
  if (!ctx.ok) return { error: ctx.error };

  const { error } = await ctx.supabase.from("supplier_payments").insert({
    tenant_id: ctx.tenantId,
    supplier_id: parsed.data.supplierId,
    purchase_id: parsed.data.purchaseId,
    amount_vnd: parsed.data.amountVnd,
    payment_method: parsed.data.paymentMethod,
    note: parsed.data.note,
    recorded_by: ctx.user.id,
  });

  if (error) return { error: loiGhi(error) };
  revalidatePath("/app/ketsat");
  return { error: null };
}

/** Lấy tiền đầu ca gợi ý (actual_cash của ca trước) — dùng cho form chốt ca. */
export async function layOpeningCashGoiY(): Promise<number> {
  const supabase = await createClient();
  const result = await layActualCashCaTruoc(supabase);
  return result ?? 0;
}
