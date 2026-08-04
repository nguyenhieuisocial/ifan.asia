import type { SupabaseClient } from "@supabase/supabase-js";
import type { DuplicatePair } from "./types";

/**
 * Fetcher dùng chung màn "Trùng lặp": server component load trang đầu, client
 * (TanStack Query) tải thêm — cùng một RPC nên shape dữ liệu luôn khớp.
 * RPC là security definer + tự kiểm vai owner/admin/manager (migration #18).
 */

export const PAIRS_PAGE_SIZE = 20;

/** Trần cứng của máy dò trong DB — chạm trần thì badge hiện "500+". */
export const DUPLICATE_CAP = 500;

export async function fetchDuplicatePairs(
  supabase: SupabaseClient,
  offset: number,
): Promise<DuplicatePair[]> {
  const { data, error } = await supabase.rpc("contact_duplicate_pairs", {
    p_limit: PAIRS_PAGE_SIZE,
    p_offset: offset,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as DuplicatePair[];
}

export async function fetchDuplicateCount(
  supabase: SupabaseClient,
): Promise<number> {
  const { data, error } = await supabase.rpc("contact_duplicate_count");
  if (error) throw new Error(error.message);
  return (data as number | null) ?? 0;
}
