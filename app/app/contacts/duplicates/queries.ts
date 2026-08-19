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

/** Một lần gộp đã làm — đọc từ `merge_logs` (migration #18). */
export type MergeLogRow = {
  id: string;
  createdAt: string;
  keptId: string;
  keptName: string;
  mergedName: string;
  mergedBy: string | null;
};

/**
 * Lịch sử gộp khách của tiệm.
 *
 * ═══════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ HÀM NÀY (việc #182)
 * ═══════════════════════════════════════════════════════════════════
 * `merge_contacts` ghi đầy đủ vào `merge_logs` từ 05/08 — kèm ảnh chụp hồ sơ
 * TRƯỚC khi gộp và danh sách trường lấy của ai. Nhưng đo 19/08: **0 chỗ nào
 * trong app đọc bảng đó**. Nghĩa là gộp nhầm hai khách thì **không có đường
 * nào tra lại đã gộp gì với gì** — dữ liệu có sẵn mà người dùng không với tới.
 *
 * Lấy tên từ ẢNH CHỤP trong `snapshot`, KHÔNG join sang `contacts`: hồ sơ bị
 * gộp đã biến mất khỏi bảng đó, join sẽ ra rỗng đúng chỗ cần nhất.
 */
export async function fetchMergeHistory(
  supabase: SupabaseClient,
  limit = 20,
): Promise<MergeLogRow[]> {
  const { data, error } = await supabase
    .from("merge_logs")
    .select("id, created_at, kept_id, merged_by, snapshot")
    .eq("entity", "contact")
    .order("created_at", { ascending: false })
    .limit(limit);
  // Không nuốt lỗi thành mảng rỗng: "chưa gộp lần nào" và "không đọc được" nhìn
  // giống hệt nhau trên màn, mà ý nghĩa thì ngược nhau.
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => {
    const snap = (r.snapshot ?? {}) as {
      winner_before?: { full_name?: string | null };
      loser_before?: { full_name?: string | null };
    };
    return {
      id: r.id as string,
      createdAt: r.created_at as string,
      keptId: r.kept_id as string,
      keptName: snap.winner_before?.full_name ?? "—",
      mergedName: snap.loser_before?.full_name ?? "—",
      mergedBy: (r.merged_by as string | null) ?? null,
    };
  });
}
