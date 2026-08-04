import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NotificationsView } from "./notifications-view";
import { fetchNotificationsPage } from "./queries";
import { NOTIFICATION_TYPES } from "./types";

export const dynamic = "force-dynamic";

/**
 * `/app/notifications` — Trung tâm thông báo (spec Nền tảng §4.2 mục 14:
 * "chuông + danh sách").
 *
 * Trang chỉ load trang đầu rồi giao cho client: bộ lọc và "tải thêm" chạy bằng
 * TanStack Query như màn Công ty/Khách hàng. Không cần lọc theo người dùng ở
 * đây — policy `notifications_select` (migration #2) đã khoanh sẵn tenant +
 * chính chủ, nên mọi câu truy vấn dù viết thế nào cũng chỉ ra thông báo CỦA TÔI.
 */
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; state?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const type = (NOTIFICATION_TYPES as readonly string[]).includes(
    params.type ?? "",
  )
    ? (params.type as string)
    : "";
  const state = params.state === "unread" ? "unread" : "all";

  const initialPage = await fetchNotificationsPage(
    supabase,
    { type, unreadOnly: state === "unread" },
    null,
  );

  return (
    <NotificationsView
      initialType={type}
      initialState={state}
      initialPage={initialPage}
      now={new Date().toISOString()}
    />
  );
}
