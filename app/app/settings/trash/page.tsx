import { createClient } from "@/lib/supabase/server";
import { getCurrentMembership } from "@/lib/auth/membership";
import { TrashView } from "./trash-view";

export const dynamic = "force-dynamic";

const LIST_LIMIT = 100;

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
  const member = await getCurrentMembership(supabase, user?.id ?? "");
  const canManage = member?.role === "owner" || member?.role === "admin";

  if (!canManage) {
    return <TrashView canManage={false} items={[]} />;
  }

  const { data } = await supabase.rpc("trash_list", { p_limit: LIST_LIMIT });

  return <TrashView canManage items={data ?? []} listLimit={LIST_LIMIT} />;
}
