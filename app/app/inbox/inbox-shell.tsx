"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { TilePlug } from "@/components/illustrations/tile-plug";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useInboxRealtime } from "@/lib/realtime/use-inbox-realtime";
import { fetchConversations, fetchMessages } from "./queries";
import type { ConversationRow, Member, MemberNames, MessageRow } from "./types";
import { ConversationList } from "./conversation-list";
import { MessageThread } from "./message-thread";
import { ContactPanel } from "./contact-panel";

type Props = {
  tenantId: string;
  currentUserId: string;
  hasChannels: boolean;
  members: Member[];
  memberNames: MemberNames;
  initialConversations: ConversationRow[];
  initialSelectedId: string | null;
  initialMessages: MessageRow[] | null;
};

export function InboxShell({
  tenantId,
  currentUserId,
  hasChannels,
  members,
  memberNames,
  initialConversations,
  initialSelectedId,
  initialMessages,
}: Props) {
  const t = useTranslations("inbox");
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);

  useInboxRealtime(tenantId);

  const conversationsQuery = useQuery({
    queryKey: ["conversations"],
    queryFn: () => fetchConversations(supabase),
    initialData: initialConversations,
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
      queryClient.setQueryData<ConversationRow[]>(["conversations"], (old) =>
        old?.map((c) => (c.id === id ? { ...c, unread_count: 0 } : c)),
      );
    }
    window.history.replaceState(null, "", id ? `/app/inbox?c=${id}` : "/app/inbox");
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
  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex min-h-0 flex-1">
      <ConversationList
        className={selected ? "hidden md:flex" : "flex"}
        conversations={conversations}
        selectedId={selectedId}
        currentUserId={currentUserId}
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
