import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchContactsPage, fetchLeadSources } from "./queries";
import { fetchDuplicateCount } from "./duplicates/queries";
import { ContactsShell } from "./contacts-shell";

export const dynamic = "force-dynamic";

/** Server component: load nguồn khách + trang đầu (50 khách mới nhất theo ?q=). */
export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const sp = await searchParams; // Next 16: searchParams phải await
  const initialQ = typeof sp.q === "string" ? sp.q : "";

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

  // Nhập Excel và gộp trùng = ghi hàng loạt cho cả tiệm → chỉ quản lý trở lên
  // (server action + RPC đều kiểm lại, đây chỉ là lớp hiển thị)
  const { data: member } = await supabase
    .from("tenant_members")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  const canManage = ["owner", "admin", "manager"].includes(member?.role ?? "");

  const [leadSources, initialPage, profilesRes, duplicateCount] = await Promise.all([
    fetchLeadSources(supabase),
    fetchContactsPage(
      supabase,
      { q: initialQ, sourceId: null, mineOnly: false, userId: user.id, sort: "recent" },
      null,
    ),
    // Tên hiển thị người phụ trách — RLS profiles chỉ trả đồng nghiệp cùng tenant
    supabase.from("profiles").select("user_id, display_name"),
    // Badge "Trùng lặp": RPC tự trả 0 cho vai không được gộp, không cần rẽ nhánh ở đây
    canManage ? fetchDuplicateCount(supabase) : Promise.resolve(0),
  ]);

  return (
    <ContactsShell
      currentUserId={user.id}
      memberNames={Object.fromEntries(
        (profilesRes.data ?? []).map((p) => [p.user_id, p.display_name]),
      )}
      leadSources={leadSources}
      initialQ={initialQ}
      initialPage={initialPage}
      canImport={canManage}
      duplicateCount={duplicateCount}
    />
  );
}
