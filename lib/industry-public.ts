import type { SupabaseClient } from "@supabase/supabase-js";
import type { TenantPackService, TenantPackTerminology } from "@/lib/tenant-pack";

/**
 * Đọc pack ngành cho trang CÔNG KHAI /nganh/[slug] — KHÁC `getTenantPack`
 * (lib/tenant-pack.ts): hàm đó đọc pack ĐANG ÁP cho tenant đăng nhập (có gộp
 * mảnh tự sửa qua tenant_pack_view). Ở đây chưa có tenant nào — đọc thẳng
 * content GỐC của pack qua RPC industry_pack_view (migration #86, security
 * definer, grant execute cho anon).
 */
export type IndustryPackPublic = {
  terminology?: TenantPackTerminology;
  pipeline_stages?: string[];
  services?: TenantPackService[];
  sample_data?: { tags?: string[] };
};

export async function getIndustryPackPublic(
  supabase: SupabaseClient,
  key: string,
): Promise<IndustryPackPublic | null> {
  const { data, error } = await supabase.rpc("industry_pack_view", { p_key: key });
  if (error || !data) return null;
  return data as IndustryPackPublic;
}
