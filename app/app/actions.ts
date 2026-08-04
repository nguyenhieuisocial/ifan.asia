"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { INDUSTRIES, type Industry } from "@/lib/industries";

/**
 * Card "Chọn ngành" trên Tổng quan (tenant cũ chưa có industry): gọi cùng
 * RPC seed với onboarding. Quyền owner/admin do chính hàm DB
 * seed_industry_template kiểm (security definer, migration #12).
 */
export async function applyIndustryTemplate(industry: Industry) {
  if (!INDUSTRIES.includes(industry)) return { error: "invalid" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("seed_industry_template", {
    p_industry: industry,
  });
  if (error) return { error: "failed" };
  revalidatePath("/app");
  return { error: null };
}
