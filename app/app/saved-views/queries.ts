import type { SupabaseClient } from "@supabase/supabase-js";
import type { SavedView, SavedViewScreen } from "@/lib/saved-views";

/** RLS saved_views_select tự lọc: view mặc định của tiệm (user_id null) +
 *  view riêng của chính người gọi. Không cần lọc thêm ở đây. */
export async function fetchSavedViews(
  supabase: SupabaseClient,
  screen: SavedViewScreen,
): Promise<SavedView[]> {
  const { data, error } = await supabase
    .from("saved_views")
    .select("id, tenant_id, user_id, screen, name, query, vocab_version, position")
    .eq("screen", screen)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as SavedView[];
}
