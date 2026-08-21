import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchConversations, fetchInboxCounts, fetchMessages } from "./queries";
import {
  INBOX_PAGE_SIZE,
  parseInboxFilter,
  type Member,
  type MemberNames,
} from "./types";
import { InboxShell } from "./inbox-shell";

export const dynamic = "force-dynamic";

/**
 * Server component: load trang đầu của bộ lọc đang chọn (?filter=) + messages của
 * hội thoại mở qua ?c=.
 *
 * Hội thoại ở ?c= luôn được tìm ĐÍCH DANH theo id nếu nó không nằm trong trang
 * đang tải — bấm cảnh báo từ Tổng quan không bao giờ ra màn trắng nữa, kể cả khi
 * tiệm có hàng nghìn hội thoại.
 */
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string | string[]; filter?: string | string[] }>;
}) {
  const sp = await searchParams; // Next 16: searchParams phải await
  const requestedId = typeof sp.c === "string" ? sp.c : null;
  const filter = parseInboxFilter(
    typeof sp.filter === "string" ? sp.filter : undefined,
  );

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

  const [channelsRes, livechatRes, conversationsPage, counts, membersRes, profilesRes] =
    await Promise.all([
      supabase.from("channels").select("id", { count: "exact", head: true }),
      // Banner "còn bước dán mã": kênh Live Chat đang bật nhưng CHƯA có tin nào
      // từ website thật. Bằng chứng là channels.last_event_at — chỉ livechat_send
      // ghi khi tin đến từ website đã khai; tin nhắn thử từ trang /livechat-demo
      // của iFan KHÔNG tính (migration #55), nên banner không tự tắt oan.
      supabase
        .from("channels")
        .select("last_event_at")
        .eq("type", "livechat")
        .eq("status", "active")
        .maybeSingle(),
      fetchConversations(supabase, {
        filter,
        currentUserId: user.id,
        limit: INBOX_PAGE_SIZE,
        pinnedId: requestedId,
      }),
      fetchInboxCounts(supabase),
      supabase
        .from("tenant_members")
        .select("user_id, role")
        .eq("status", "active")
        .order("created_at", { ascending: true }),
      // Tên hiển thị thành viên — RLS profiles chỉ trả đồng nghiệp cùng tenant
      supabase.from("profiles").select("user_id, display_name"),
    ]);
  const memberNames: MemberNames = Object.fromEntries(
    (profilesRes.data ?? []).map((p) => [p.user_id, p.display_name]),
  );

  const conversations = conversationsPage.rows;

  const selectedId =
    requestedId && conversations.some((c) => c.id === requestedId)
      ? requestedId
      : null;
  const initialMessages = selectedId
    ? await fetchMessages(supabase, selectedId)
    : null;

  return (
    <InboxShell
      currentUserId={user.id}
      hasChannels={(channelsRes.count ?? 0) > 0}
      livechatAwaitingSnippet={
        livechatRes.data !== null && livechatRes.data.last_event_at === null
      }
      members={(membersRes.data ?? []) as Member[]}
      memberNames={memberNames}
      initialFilter={filter}
      initialConversations={conversations}
      initialConversationsTotal={conversationsPage.total}
      initialCounts={counts}
      initialSelectedId={selectedId}
      initialMessages={initialMessages}
    />
  );
}
