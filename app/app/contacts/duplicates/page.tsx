import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DuplicatesShell } from "./duplicates-shell";
import { fetchDuplicatePairs } from "./queries";

export const dynamic = "force-dynamic";

/**
 * Màn "Trùng lặp" (spec CRM mục 4.9): danh sách cặp nghi trùng để soi 2 cột rồi
 * gộp. Ghi hàng loạt cho cả tiệm → chỉ quản lý trở lên; RPC cũng tự kiểm vai.
 */
export default async function DuplicatesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .maybeSingle();
  if (!tenant) redirect("/onboarding");

  const { data: member } = await supabase
    .from("tenant_members")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!["owner", "admin", "manager"].includes(member?.role ?? "")) {
    redirect("/app/contacts");
  }

  const [initialPairs, profilesRes] = await Promise.all([
    fetchDuplicatePairs(supabase, 0),
    supabase.from("profiles").select("user_id, display_name"),
  ]);

  return (
    <DuplicatesShell
      currentUserId={user.id}
      memberNames={Object.fromEntries(
        (profilesRes.data ?? []).map((p) => [p.user_id, p.display_name]),
      )}
      initialPairs={initialPairs}
    />
  );
}
