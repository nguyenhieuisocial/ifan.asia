"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { TilePlug } from "@/components/illustrations/tile-plug";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useInboxRealtime } from "@/lib/realtime/use-inbox-realtime";
import { fetchConversations, fetchInboxCounts, fetchMessages } from "./queries";
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

  useInboxRealtime(tenantId);

  const conversationsQuery = useQuery({
    queryKey: ["conversations", filter, limit, pinnedId],
    queryFn: () =>
      fetchConversations(supabase, {
        filter,
        currentUserId,
        limit,
        pinnedId,
      }),
    initialData:
      filter === initialFilter && limit === INBOX_PAGE_SIZE
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

  // Chọn hội thoại: đổi state + sync URL không re-render server (tốc độ là tính năng)
  const select = (id: string | null) => {
    setSelectedId(id);
    // Đã-đọc optimistic (chỉ UI client): xóa badge count ngay khi mở hội thoại
    if (id) {
      queryClient.setQueryData<ConversationRow[]>(
        ["conversations", filter, limit, pinnedId],
        (old) => old?.map((c) => (c.id === id ? { ...c, unread_count: 0 } : c)),
      );
    }
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
        hasMore={counts[filter] > limit}
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
