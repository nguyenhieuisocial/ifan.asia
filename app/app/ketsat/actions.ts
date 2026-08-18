"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { tinhExpectedCash, layActualCashCaTruoc } from "./queries";

/**
 * Két sắt & Công nợ NCC (ADR-0022 V5).
 * QUYỀN: RLS shift_closings + supplier_payments chỉ mở cho owner/admin/manager.
 * Tầng này không siết thêm — RLS đủ, cùng nguyên tắc cashbook/actions.ts.
 */

type ActionResult = { error: string | null };

function loiGhi(message: string): string {
  if (/row-level security/i.test(message)) return "forbidden";
  return "save_failed";
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  // Tính expected_cash từ sổ quỹ
  const expectedCash = await tinhExpectedCash(supabase, parsed.data.openingCash);

  const { data: row, error } = await supabase
    .from("shift_closings")
    .insert({
      closed_by: user.id,
      shift_date: parsed.data.shiftDate,
      opening_cash: parsed.data.openingCash,
      actual_cash: parsed.data.actualCash,
      expected_cash: Math.round(expectedCash),
      note: parsed.data.note,
    })
    .select("id")
    .single();

  if (error) return { error: loiGhi(error.message) };
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const { error } = await supabase.from("supplier_payments").insert({
    supplier_id: parsed.data.supplierId,
    purchase_id: parsed.data.purchaseId,
    amount_vnd: parsed.data.amountVnd,
    payment_method: parsed.data.paymentMethod,
    note: parsed.data.note,
    recorded_by: user.id,
  });

  if (error) return { error: loiGhi(error.message) };
  revalidatePath("/app/ketsat");
  return { error: null };
}

/** Lấy tiền đầu ca gợi ý (actual_cash của ca trước) — dùng cho form chốt ca. */
export async function layOpeningCashGoiY(): Promise<number> {
  const supabase = await createClient();
  const result = await layActualCashCaTruoc(supabase);
  return result ?? 0;
}
