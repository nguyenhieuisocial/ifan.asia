"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type SaveTiersResult = { error: string | null; recomputed?: number };

/**
 * Ngưỡng phân hạng — khớp check constraint bảng `tier_rules` (migration #19).
 * Trần 100 tỷ / 999 lần / 10 năm: chặn số vô nghĩa gõ nhầm, không phải giới hạn nghiệp vụ.
 */
const rulesSchema = z
  .object({
    vipMinRevenue: z.number().int().min(0).max(100_000_000_000),
    vipMinWonDeals: z.number().int().min(1).max(999),
    regularMinWonDeals: z.number().int().min(1).max(999),
    dormantAfterDays: z.number().int().min(7).max(3650),
  })
  .refine((v) => v.vipMinWonDeals >= v.regularMinWonDeals, {
    path: ["vipMinWonDeals"],
  });

export type TierRulesInput = z.infer<typeof rulesSchema>;

/**
 * Lưu ngưỡng + xếp lại hạng toàn bộ khách của tiệm trong CÙNG một transaction
 * (RPC `apply_tier_rules`, migration #19) — đổi ngưỡng mà danh sách khách chưa đổi
 * hạng thì chủ tiệm không hiểu chuyện gì vừa xảy ra.
 * RPC tự kiểm vai owner/admin và RLS `tier_rules_manage` là lưới cuối; action vẫn
 * kiểm trước (defense in depth, theo mẫu settings/sla/actions.ts).
 */
export async function saveTierRules(
  input: TierRulesInput,
): Promise<SaveTiersResult> {
  const parsed = rulesSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not_authenticated" };

  const { data: member } = await supabase
    .from("tenant_members")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (member?.role !== "owner" && member?.role !== "admin") {
    return { error: "forbidden" };
  }

  const { data, error } = await supabase.rpc("apply_tier_rules", {
    p_vip_min_revenue: parsed.data.vipMinRevenue,
    p_vip_min_won_deals: parsed.data.vipMinWonDeals,
    p_regular_min_won_deals: parsed.data.regularMinWonDeals,
    p_dormant_after_days: parsed.data.dormantAfterDays,
  });
  if (error) return { error: "failed" };

  revalidatePath("/app/settings/tiers");
  revalidatePath("/app/contacts");
  return { error: null, recomputed: Number(data ?? 0) };
}
