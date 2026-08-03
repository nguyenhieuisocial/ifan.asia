"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/format";
import type { Locale, Translator } from "@/i18n/config";
import {
  conversationName,
  STATUS_DOT,
  type ConversationRow,
} from "./types";

type Tab = "all" | "unassigned" | "mine";

function previewText(c: ConversationRow, t: Translator): string {
  const last = c.messages[0];
  if (!last) return t("preview.empty");
  const content = last.content ?? "";
  if (last.sender_type === "system") return t("preview.note", { content });
  return last.direction === "out" ? t("preview.you", { content }) : content;
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
  const t = useTranslations("inbox");
  const tTime = useTranslations("time");
  const locale = useLocale() as Locale;
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
              {t("tabs.all", { count: conversations.length })}
            </TabsTrigger>
            <TabsTrigger value="unassigned" className="flex-1 text-[13px]">
              {t("tabs.unassigned", { count: unassigned.length })}
            </TabsTrigger>
            <TabsTrigger value="mine" className="flex-1 text-[13px]">
              {t("tabs.mine", { count: mine.length })}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {tab === "all"
                ? t("empty.all")
                : tab === "unassigned"
                  ? t("empty.unassigned")
                  : t("empty.mine")}
            </p>
            {tab === "all" ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/app/contacts">{t("empty.viewContacts")}</Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setTab("all")}>
                {t("empty.viewAll")}
              </Button>
            )}
          </div>
        ) : (
          filtered.map((c) => {
            const name = conversationName(c, t);
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
                        {formatRelative(c.last_message_at, locale, tTime)}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <p className="truncate text-[13px] text-muted-foreground">
                      {previewText(c, t)}
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
