import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { DuplicatesShell } from "./duplicates-shell";
import { fetchDuplicateCount, fetchDuplicatePairs, fetchMergeHistory } from "./queries";

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

  const member = await getCurrentMembership(supabase, user.id);
  if (!["owner", "admin", "manager"].includes(member?.role ?? "")) {
    redirect("/app/contacts");
  }

  const [initialPairs, pairCount, profilesRes, history] = await Promise.all([
    fetchDuplicatePairs(supabase, 0),
    // Con số trên huy hiệu do CSDL đếm, KHÔNG phải số cặp đã bấm "Tải thêm"
    fetchDuplicateCount(supabase),
    supabase.from("profiles").select("user_id, display_name"),
    // Lịch sử gộp (việc #182): `merge_contacts` ghi từ 05/08 nhưng tới 19/08
    // KHÔNG màn nào đọc — gộp nhầm thì không có đường tra lại.
    // Hỏng thì để danh sách rỗng chứ KHÔNG làm sập cả màn: việc chính ở đây là
    // gộp cặp trùng, không phải xem lịch sử.
    fetchMergeHistory(supabase).catch(() => []),
  ]);

  return (
    <DuplicatesShell
      history={history}
      currentUserId={user.id}
      memberNames={Object.fromEntries(
        (profilesRes.data ?? []).map((p) => [p.user_id, p.display_name]),
      )}
      initialPairs={initialPairs}
      pairCount={pairCount}
    />
  );
}
