import type { SupabaseClient } from "@supabase/supabase-js";

export type TagRow = { id: string; name: string; color: string | null; count: number };

/**
 * Nhãn còn sống (deleted_at is null — RLS không tự lọc, theo đúng quy ước
 * contacts) kèm số khách đang mang, dùng cho màn Quản lý nhãn.
 * Đếm bằng hai truy vấn nhỏ + gộp ở JS thay vì embed count qua PostgREST —
 * quy mô mỗi tiệm chỉ vài chục nhãn/vài trăm lượt gắn (design card: "43 nhãn,
 * 172 lượt gắn trên cả 6 tiệm"), không cần tối ưu bằng RPC.
 */
export async function fetchTagsWithCounts(supabase: SupabaseClient): Promise<TagRow[]> {
  const { data: tags } = await supabase
    .from("tags")
    .select("id, name, color")
    .is("deleted_at", null)
    .order("name");
  if (!tags || tags.length === 0) return [];

  const { data: links } = await supabase
    .from("contact_tags")
    .select("tag_id")
    .in(
      "tag_id",
      tags.map((t) => t.id),
    );

  const counts = new Map<string, number>();
  for (const l of links ?? []) {
    const id = l.tag_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return tags.map((t) => ({
    id: t.id as string,
    name: t.name as string,
    color: t.color as string | null,
    count: counts.get(t.id as string) ?? 0,
  }));
}
