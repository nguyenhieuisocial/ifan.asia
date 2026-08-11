"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { INDUSTRIES, type Industry } from "@/lib/industries";

/**
 * Card "Chọn ngành" trên Tổng quan (tenant cũ chưa có industry) + màn Cài đặt
 * "Ngành & giao diện" (đổi pack): gọi cùng RPC với onboarding. Quyền
 * owner/admin do chính hàm DB apply_industry_pack kiểm (security definer,
 * migration #60) — validate theo bảng industry_packs thật, không theo mảng
 * INDUSTRIES phía client (D1: một nguồn sự thật).
 */
export async function applyIndustryTemplate(industry: Industry) {
  if (!INDUSTRIES.includes(industry)) return { error: "invalid" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("apply_industry_pack", {
    p_pack_key: industry,
  });
  if (error) return { error: "failed" };
  revalidatePath("/app");
  revalidatePath("/app/settings");
  return { error: null };
}
