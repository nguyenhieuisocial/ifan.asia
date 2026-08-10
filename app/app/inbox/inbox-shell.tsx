"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { TilePlug } from "@/components/illustrations/tile-plug";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useInboxRealtime } from "@/lib/realtime/use-inbox-realtime";
import {
  fetchConversations,
  fetchInboxCounts,
  fetchMessages,
  markConversationRead,
} from "./queries";
import {
  INBOX_PAGE_SIZE,
  type ConversationRow,
  type InboxCounts,
  type InboxFilter,
  type Member,
  type MemberNames,
  type MessageRow,
} from "./types";
import { ConversationList } from "./conversation-list";
import { MessageThread } from "./message-thread";
import { ContactPanel } from "./contact-panel";

type Props = {
  tenantId: string;
  currentUserId: string;
  hasChannels: boolean;
  members: Member[];
  memberNames: MemberNames;
  initialFilter: InboxFilter;
  initialConversations: ConversationRow[];
  initialCounts: InboxCounts;
  initialSelectedId: string | null;
  initialMessages: MessageRow[] | null;
};

export function InboxShell({
  tenantId,
  currentUserId,
  hasChannels,
  members,
  memberNames,
  initialFilter,
  initialConversations,
  initialCounts,
  initialSelectedId,
  initialMessages,
}: Props) {
  const t = useTranslations("inbox");
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [filter, setFilter] = useState<InboxFilter>(initialFilter);
  const [limit, setLimit] = useState(INBOX_PAGE_SIZE);
  // Hội thoại mở qua link ?c= có thể nằm ngoài bộ lọc / ngoài trang đang tải —
  // giữ nó lại qua mọi lần refetch để cửa sổ chat không tự biến mất.
  const [pinnedId] = useState<string | null>(initialSelectedId);
  // Ô tìm khách. Hoãn 300ms để mỗi phím gõ không thành một lượt hỏi CSDL.
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  useInboxRealtime(tenantId);

  const conversationsQuery = useQuery({
    queryKey: ["conversations", filter, limit, pinnedId, debouncedSearch],
    queryFn: () =>
      fetchConversations(supabase, {
        filter,
        currentUserId,
        limit,
        // Đang tìm thì KHÔNG ghim hội thoại mở sẵn nữa: ghim lại thì nó vẫn nằm
        // đầu danh sách dù không khớp từ khoá, người dùng tưởng đó là kết quả.
        pinnedId: debouncedSearch ? null : pinnedId,
        search: debouncedSearch,
      }),
    initialData:
      filter === initialFilter && limit === INBOX_PAGE_SIZE && !debouncedSearch
        ? initialConversations
        : undefined,
  });

  // Số trên tab đếm bằng COUNT trong CSDL — KHÔNG đếm độ dài danh sách đã tải,
  // vì danh sách chỉ là một trang.
  const countsQuery = useQuery({
    queryKey: ["inbox-counts"],
    queryFn: () => fetchInboxCounts(supabase),
    initialData: initialCounts,
  });

  /**
   * Hội thoại ĐANG HIỆN trong khung chat — khác với hội thoại người dùng đã
   * BẤM CHỌN.
   *
   * Mở Hộp thư trên máy tính mà chưa bấm gì thì 2/3 màn hình là khoảng trắng,
   * và hai chỗ trống lại nhắc cùng một câu. Hội thoại đầu danh sách đã tải sẵn
   * dữ liệu rồi — hiện luôn nó.
   *
   * Tách hai khái niệm ra là để CSS lo phần điện thoại, không cần đo bề rộng
   * bằng JavaScript (đo bằng JS thì lúc dựng trang chưa biết, sinh lệch nội
   * dung): khung chat vốn đã `hidden md:flex` khi chưa bấm chọn, nên trên điện
   * thoại nó vẫn ẩn và người dùng thấy đúng danh sách vừa vào.
   */
  const displayedId = selectedId ?? conversationsQuery.data?.[0]?.id ?? null;

  const messagesQuery = useQuery({
    queryKey: ["messages", displayedId],
    queryFn: () => fetchMessages(supabase, displayedId as string),
    enabled: displayedId !== null,
    initialData:
      displayedId !== null && displayedId === initialSelectedId
        ? (initialMessages ?? undefined)
        : undefined,
  });

  // Số chưa đọc của hội thoại ĐANG mở — đặt ngoài effect để tin mới về đúng hội
  // thoại đang xem cũng được đánh dấu đã đọc, không đọng lại thành badge mới.
  const selectedUnread =
    conversationsQuery.data?.find((c) => c.id === selectedId)?.unread_count ?? 0;

  // Mở hội thoại = đã đọc, và phải GHI XUỐNG CSDL (migration #43). Trước đây chỉ
  // xóa badge trong cache nên tải lại trang là con số cam cũ hiện lại y nguyên —
  // chủ tiệm không bao giờ dọn sạch được hộp thư. Đặt ở effect chứ không ở
  // select() để hội thoại mở bằng đường dẫn ?c= cũng được đánh dấu.
  useEffect(() => {
    if (!selectedId || selectedUnread === 0) return;
    // Danh sách có nhiều cache theo bộ lọc/số dòng — xóa badge ở MỌI cache khớp
    // tiền tố, giống cách use-inbox-realtime cập nhật tin mới.
    queryClient.setQueriesData<ConversationRow[]>(
      { queryKey: ["conversations"] },
      (old) => old?.map((c) => (c.id === selectedId ? { ...c, unread_count: 0 } : c)),
    );
    void markConversationRead(supabase, selectedId);
  }, [selectedId, selectedUnread, queryClient, supabase]);

  // Vuốt-cạnh/nút back trên điện thoại phải quay về DANH SÁCH chứ không thoát
  // app: lúc mở hội thoại từ danh sách (select bên dưới) ta THÊM một mục lịch
  // sử; back → popstate → đọc ?c= trên URL vừa quay về để đóng/mở đúng khung
  // chat (đi tới lại cũng đúng). Handler chỉ setState, không đụng history —
  // không thể tạo vòng lặp.
  useEffect(() => {
    const onPop = () => {
      setSelectedId(new URLSearchParams(window.location.search).get("c"));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Chọn hội thoại: đổi state + sync URL không re-render server (tốc độ là tính năng)
  const select = (id: string | null) => {
    setSelectedId(id);
    // Dưới md (đúng ngưỡng CSS đang ẩn/hiện hai khung) khung chat chiếm TRỌN
    // màn hình → push kèm cờ inboxThread để back quay về danh sách. Desktop giữ
    // nguyên replaceState: khung chat nằm CẠNH danh sách (displayed pattern),
    // back phải rời trang như mọi khi. Chỉ push lúc chuyển danh-sách→chat
    // (selectedId đang null) để bấm lần lượt nhiều hội thoại không chất chồng
    // lịch sử.
    if (
      id !== null &&
      selectedId === null &&
      !window.matchMedia("(min-width: 768px)").matches
    ) {
      window.history.pushState({ inboxThread: true }, "", conversationHref(filter, id));
      return;
    }
    // Giữ nguyên history.state (thay vì null) để không xoá cờ inboxThread lẫn
    // state nội bộ của Next trên mục lịch sử hiện tại.
    window.history.replaceState(window.history.state, "", conversationHref(filter, id));
  };

  const changeFilter = (next: InboxFilter) => {
    setFilter(next);
    setLimit(INBOX_PAGE_SIZE);
    window.history.replaceState(null, "", conversationHref(next, selectedId));
  };

  if (!hasChannels) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <TilePlug className="size-20" />
        <h2 className="text-lg font-semibold">{t("notConnected.title")}</h2>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          {t("notConnected.description")}
        </p>
        <Button asChild>
          <Link href="/app/settings/channels">{t("notConnected.cta")}</Link>
        </Button>
      </div>
    );
  }

  const conversations = conversationsQuery.data ?? [];
  const counts = countsQuery.data ?? initialCounts;
  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  // Hiện trong khung chat: cái đã bấm chọn, không thì hội thoại đầu danh sách.
  const displayed = selected ?? conversations[0] ?? null;


  return (
    <div className="flex min-h-0 flex-1">
      <ConversationList
        className={selected ? "hidden md:flex" : "flex"}
        conversations={conversations}
        counts={counts}
        filter={filter}
        onFilterChange={changeFilter}
        search={search}
        onSearchChange={setSearch}
        // Đang tìm thì con số trên tab (đếm cả tiệm) không còn ứng với danh
        // sách đang hiện — tắt nút "Xem thêm" để khỏi hứa một trang không có.
        hasMore={!debouncedSearch && counts[filter] > limit}
        loadingMore={conversationsQuery.isFetching}
        onLoadMore={() => setLimit((n) => n + INBOX_PAGE_SIZE)}
        selectedId={selectedId}
        onSelect={select}
      />
      <MessageThread
        className={selected ? "flex" : "hidden md:flex"}
        conversation={displayed}
        messages={displayed ? (messagesQuery.data ?? []) : []}
        loading={displayed !== null && messagesQuery.isPending}
        members={members}
        memberNames={memberNames}
        currentUserId={currentUserId}
        onBack={() => {
          // Nút ← trong khung chat: nếu lúc mở đã push lịch sử (mobile) thì lùi
          // đúng một nhịp cho khớp vuốt-cạnh — popstate ở trên sẽ đóng khung
          // chat. Mở thẳng qua ?c= thì không có mục nào để lùi → đóng bằng state.
          if (window.history.state?.inboxThread) window.history.back();
          else select(null);
        }}
      />
      <ContactPanel className="hidden xl:flex" conversation={selected} />
    </div>
  );
}

/** URL luôn mang theo bộ lọc để refresh / chia sẻ link ra đúng danh sách. */
function conversationHref(filter: InboxFilter, id: string | null): string {
  const params = new URLSearchParams();
  params.set("filter", filter);
  if (id) params.set("c", id);
  return `/app/inbox?${params.toString()}`;
}
