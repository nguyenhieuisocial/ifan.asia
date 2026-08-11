import { createClient } from "@/lib/supabase/server";
import { TrashView } from "./trash-view";

export const dynamic = "force-dynamic";

/**
 * Cài đặt → Thùng rác (bất biến 11, migration #60). Chỉ owner/admin gọi
 * trash_list được — staff/manager/viewer thấy trạng thái không có quyền,
 * đúng RPC (raise 'forbidden' cho vai khác).
 * Thẻ design: design-system/trash.html (2 nhóm biến thể).
 */
export default async function TrashPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: member } = await supabase
    .from("tenant_members")
    .select("role")
    .eq("user_id", user?.id ?? "")
    .maybeSingle();
  const canManage = member?.role === "owner" || member?.role === "admin";

  if (!canManage) {
    return <TrashView canManage={false} items={[]} />;
  }

  const { data } = await supabase.rpc("trash_list", { p_limit: 100 });

  return <TrashView canManage items={data ?? []} />;
}
