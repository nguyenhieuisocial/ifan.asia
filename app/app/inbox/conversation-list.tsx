"use client";

import { useState } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatRelativeVN } from "@/lib/format";
import {
  conversationName,
  STATUS_DOT,
  type ConversationRow,
} from "./types";

type Tab = "all" | "unassigned" | "mine";

function previewText(c: ConversationRow): string {
  const last = c.messages[0];
  if (!last) return "Chưa có tin nhắn";
  const content = last.content ?? "";
  if (last.sender_type === "system") return `Ghi chú: ${content}`;
  return last.direction === "out" ? `Bạn: ${content}` : content;
}

type Props = {
  conversations: ConversationRow[];
  selectedId: string | null;
  currentUserId: string;
  onSelect: (id: string) => void;
  className?: string;
};

export function ConversationList({
  conversations,
  selectedId,
  currentUserId,
  onSelect,
  className,
}: Props) {
  const [tab, setTab] = useState<Tab>("all");

  const unassigned = conversations.filter((c) => c.assignee_user_id === null);
  const mine = conversations.filter(
    (c) => c.assignee_user_id === currentUserId,
  );
  const filtered =
    tab === "all" ? conversations : tab === "unassigned" ? unassigned : mine;

  return (
    <section
      className={cn(
        "w-full flex-col border-r md:w-[340px] md:shrink-0",
        className,
      )}
    >
      <div className="shrink-0 border-b p-2">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList className="w-full">
            <TabsTrigger value="all" className="flex-1 text-[13px]">
              Tất cả ({conversations.length})
            </TabsTrigger>
            <TabsTrigger value="unassigned" className="flex-1 text-[13px]">
              Chưa gán ({unassigned.length})
            </TabsTrigger>
            <TabsTrigger value="mine" className="flex-1 text-[13px]">
              Của tôi ({mine.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {tab === "all"
                ? "Khi khách nhắn tin qua kênh đã kết nối, hội thoại sẽ hiện ở đây."
                : tab === "unassigned"
                  ? "Không có hội thoại nào chưa gán — mọi khách đều đã có người phụ trách."
                  : "Chưa có hội thoại nào gán cho bạn."}
            </p>
            {tab === "all" ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/app/contacts">Xem khách hàng</Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setTab("all")}>
                Xem tất cả
              </Button>
            )}
          </div>
        ) : (
          filtered.map((c) => {
            const name = conversationName(c);
            const unread = c.unread_count > 0;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c.id)}
                className={cn(
                  "flex w-full items-start gap-3 border-b px-3 py-3 text-left transition-colors hover:bg-muted/50",
                  selectedId === c.id && "bg-muted",
                )}
              >
                <Avatar size="lg">
                  <AvatarFallback>
                    {(name[0] ?? "?").toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      title={c.status}
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        STATUS_DOT[c.status],
                      )}
                    />
                    <span
                      className={cn(
                        "truncate text-sm",
                        unread ? "font-semibold" : "font-medium",
                      )}
                    >
                      {name}
                    </span>
                    {c.last_message_at && (
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                        {formatRelativeVN(c.last_message_at)}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <p className="truncate text-[13px] text-muted-foreground">
                      {previewText(c)}
                    </p>
                    {unread && (
                      <Badge className="ml-auto h-5 min-w-5 shrink-0 rounded-full px-1.5 text-xs font-semibold">
                        {c.unread_count}
                      </Badge>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
