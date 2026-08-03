"use client";

import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatVN } from "@/lib/datetime";
import {
  conversationName,
  STATUS_DOT,
  type ConversationRow,
} from "./types";

type Tab = "all" | "unassigned" | "mine";

function shortTime(iso: string): string {
  const sameDay =
    formatVN(iso, "dd/MM/yyyy") === formatVN(Date.now(), "dd/MM/yyyy");
  return formatVN(iso, sameDay ? "HH:mm" : "dd/MM");
}

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

  const filtered = conversations.filter((c) =>
    tab === "all"
      ? true
      : tab === "unassigned"
        ? c.assignee_user_id === null
        : c.assignee_user_id === currentUserId,
  );

  return (
    <section
      className={cn(
        "w-full flex-col border-r md:w-80 md:shrink-0",
        className,
      )}
    >
      <div className="shrink-0 border-b p-2">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList className="w-full">
            <TabsTrigger value="all" className="flex-1">
              Tất cả
            </TabsTrigger>
            <TabsTrigger value="unassigned" className="flex-1">
              Chưa gán
            </TabsTrigger>
            <TabsTrigger value="mine" className="flex-1">
              Của tôi
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Chưa có hội thoại nào
          </p>
        ) : (
          filtered.map((c) => {
            const name = conversationName(c);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c.id)}
                className={cn(
                  "flex w-full items-start gap-3 border-b px-3 py-3 text-left transition-colors hover:bg-accent",
                  selectedId === c.id && "bg-accent",
                )}
              >
                <Avatar>
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
                    <span className="truncate text-sm font-medium">{name}</span>
                    {c.last_message_at && (
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                        {shortTime(c.last_message_at)}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <p className="truncate text-xs text-muted-foreground">
                      {previewText(c)}
                    </p>
                    {c.unread_count > 0 && (
                      <Badge className="ml-auto h-5 min-w-5 shrink-0 rounded-full px-1.5 text-[10px]">
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
