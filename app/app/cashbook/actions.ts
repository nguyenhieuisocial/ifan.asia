"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { CASH_AMOUNT_MAX, CASH_CATEGORIES, CASH_NOTE_MAX } from "@/lib/finance/cash-ledger";

/**
 * Sổ quỹ (ADR-0019 mục 8 việc 6). Ghi TAY — khoản tự sinh từ thu tiền đơn
 * hàng đi qua trigger `order_payments_emit_cash_entry` (migration #127),
 * KHÔNG qua action này (D1: một đường ghi cho mỗi nguồn).
 *
 * QUYỀN: không siết thêm ở đây — RLS `cash_entries_rw` (owner/admin/manager)
 * đã đúng luật, cùng nguyên tắc app/app/calendar/actions.ts.
 */

type ActionResult = { error: string | null };

const schema = z.object({
  direction: z.enum(["in", "out"]),
  amountVnd: z.number().int().positive().max(CASH_AMOUNT_MAX),
  fund: z.enum(["cash", "bank"]),
  category: z.enum(CASH_CATEGORIES),
  note: z.string().trim().max(CASH_NOTE_MAX).nullable(),
});

export async function recordCashEntry(input: z.infer<typeof schema>): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const { data: tenant } = await supabase.from("tenants").select("id").maybeSingle();
  if (!tenant) return { error: "not_found" };

  const { error } = await supabase.from("cash_entries").insert({
    tenant_id: tenant.id,
    direction: parsed.data.direction,
    amount_vnd: parsed.data.amountVnd,
    fund: parsed.data.fund,
    category: parsed.data.category,
    note: parsed.data.note,
    recorded_by: user.id,
  });
  if (error) {
    if (/row-level security/i.test(error.message)) return { error: "forbidden" };
    return { error: "save_failed" };
  }

  revalidatePath("/app/cashbook");
  return { error: null };
}
