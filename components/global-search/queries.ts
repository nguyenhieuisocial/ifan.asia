import type { SupabaseClient } from "@supabase/supabase-js";

export type GlobalSearchEntityType = "contact" | "conversation" | "deal";

export type GlobalSearchRow = {
  entity_type: GlobalSearchEntityType;
  entity_id: string;
  title: string;
  subtitle: string;
  rank_tier: number;
};

/**
 * Gọi RPC `global_search` (migration #75/#76, mục 24l) — SECURITY INVOKER nên
 * RLS của contacts/conversations/deals tự áp theo người gọi, hàm không tự
 * thêm điều kiện quyền. Tối đa 5 dòng mỗi loại, đã sắp theo thứ tự khớp SĐT
 * → khớp đầu tên/tiêu đề → tương tự → mới tương tác (mục 36.10C).
 */
export async function fetchGlobalSearch(
  supabase: SupabaseClient,
  query: string,
): Promise<GlobalSearchRow[]> {
  const trimmed = query.trim();
  if (trimmed === "") return [];
  const { data, error } = await supabase.rpc("global_search", { p_query: trimmed });
  if (error) throw new Error(error.message);
  return (data ?? []) as GlobalSearchRow[];
}
