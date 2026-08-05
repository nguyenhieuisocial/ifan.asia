import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ApprovalsView } from "./approvals-view";
import {
  fetchAssignedTickets,
  fetchDisplayNames,
  fetchMyRequests,
  fetchPendingApprovalCount,
} from "./queries";

export const dynamic = "force-dynamic";

/**
 * "Duyệt & yêu cầu" — màn hình người quản lý mở nhiều nhất (spec §4.5, rút gọn
 * cho đợt 1): Chờ tôi duyệt / Tôi đã xử lý / Yêu cầu của tôi.
 *
 * Ba tab tải RIÊNG từng danh sách (lọc trong CSDL) và huy hiệu lấy con số từ
 * `approval_pending_count()`. Trước đây cả ba tab chia nhau đúng 50 dòng chung,
 * nên huy hiệu "Chờ tôi duyệt" chặn ở 50 mà không nói gì.
 */
export default async function ApprovalsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const me = user?.id ?? "";

  const displayNames = await fetchDisplayNames(supabase);
  const tOwner = await getTranslations("contacts.owner");
  const nameOf = (id: string | null | undefined) =>
    id ? (displayNames.get(id) ?? tOwner("member", { id: id.slice(0, 8) })) : null;

  const [pendingCount, pending, handled, myRequests] = await Promise.all([
    fetchPendingApprovalCount(supabase),
    fetchAssignedTickets(supabase, me, "pending", 0, nameOf),
    fetchAssignedTickets(supabase, me, "handled", 0, nameOf),
    fetchMyRequests(supabase, me, 0, nameOf),
  ]);

  return (
    <ApprovalsView
      pendingCount={pendingCount}
      pending={pending}
      handled={handled}
      myRequests={myRequests}
    />
  );
}
