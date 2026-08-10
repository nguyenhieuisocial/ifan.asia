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

  const messagesQuery = useQuery({
    queryKey: ["messages", selectedId],
    queryFn: () => fetchMessages(supabase, selectedId as string),
    enabled: selectedId !== null,
    initialData:
      selectedId !== null && selectedId === initialSelectedId
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

  // Chọn hội thoại: đổi state + sync URL không re-render server (tốc độ là tính năng)
  const select = (id: string | null) => {
    setSelectedId(id);
    window.history.replaceState(null, "", conversationHref(filter, id));
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
        conversation={selected}
        messages={selected ? (messagesQuery.data ?? []) : []}
        loading={selected !== null && messagesQuery.isPending}
        members={members}
        memberNames={memberNames}
        currentUserId={currentUserId}
        onBack={() => select(null)}
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
