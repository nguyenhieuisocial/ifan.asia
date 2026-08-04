"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { PLAN_CODES, type PlanQuote } from "@/lib/billing/types";

const changeSchema = z.object({
  planCode: z.enum(PLAN_CODES),
  cycle: z.enum(["month", "year"]),
});

export type QuoteResult =
  | { error: null; quote: PlanQuote }
  | { error: string; quote?: undefined };

export type ChangePlanResult =
  | { error: null; invoice: string; amountDue: number; applied: boolean }
  | { error: string; invoice?: undefined };

/** Ánh xạ lỗi RPC sang khoá dịch — không ném chuỗi Postgres ra giao diện. */
function mapError(message: string): string {
  if (message.includes("forbidden")) return "forbidden";
  if (message.includes("no_change")) return "noChange";
  if (message.includes("suspended_needs_payment")) return "suspendedNeedsPayment";
  if (message.includes("no_subscription")) return "noSubscription";
  return "failed";
}

/**
 * Báo giá đổi gói (pro-rata) — CHỈ tính, không đổi gì.
 * Toán tiền nằm trong DB (`quote_plan_change`) để không có 2 nơi 2 công thức.
 */
export async function getPlanQuote(input: {
  planCode: string;
  cycle: string;
}): Promise<QuoteResult> {
  const parsed = changeSchema.safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("quote_plan_change", {
    p_plan_code: parsed.data.planCode,
    p_cycle: parsed.data.cycle,
  });
  if (error) return { error: mapError(error.message) };
  return { error: null, quote: data as PlanQuote };
}

/**
 * Đổi gói. RPC `change_plan` tự kiểm vai CHỦ tiệm server-side (không tin client);
 * action kiểm trước một lớp để báo lỗi thân thiện (mẫu settings/tiers/actions.ts).
 *
 * Phải trả = 0 → áp dụng ngay. Phải trả > 0 → tạo hoá đơn CHỜ THANH TOÁN;
 * gói chưa đổi cho tới khi khoản tiền được ghi nhận (chưa nối cổng — xem README
 * của migration #27).
 */
export async function changePlan(input: {
  planCode: string;
  cycle: string;
}): Promise<ChangePlanResult> {
  const parsed = changeSchema.safeParse(input);
  if (!parsed.success) return { error: "invalidInput" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "notAuthenticated" };

  const { data: member } = await supabase
    .from("tenant_members")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (member?.role !== "owner") return { error: "forbidden" };

  const { data, error } = await supabase.rpc("change_plan", {
    p_plan_code: parsed.data.planCode,
    p_cycle: parsed.data.cycle,
  });
  if (error) return { error: mapError(error.message) };

  const res = data as { invoice: string; amount_due: number; applied: boolean };
  revalidatePath("/app/settings/billing");
  return {
    error: null,
    invoice: res.invoice,
    amountDue: Number(res.amount_due),
    applied: res.applied,
  };
}
