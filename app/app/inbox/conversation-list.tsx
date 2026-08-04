"use client";

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
  INBOX_FILTERS,
  STATUS_DOT,
  type ConversationRow,
  type InboxCounts,
  type InboxFilter,
} from "./types";

function previewText(c: ConversationRow, t: Translator): string {
  const last = c.messages[0];
  if (!last) return t("preview.empty");
  const content = last.content ?? "";
  if (last.sender_type === "system") return t("preview.note", { content });
  return last.direction === "out" ? t("preview.you", { content }) : content;
}

type Props = {
  conversations: ConversationRow[];
  counts: InboxCounts;
  filter: InboxFilter;
  onFilterChange: (filter: InboxFilter) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  className?: string;
};

export function ConversationList({
  conversations,
  counts,
  filter,
  onFilterChange,
  hasMore,
  loadingMore,
  onLoadMore,
  selectedId,
  onSelect,
  className,
}: Props) {
  const t = useTranslations("inbox");
  const tTime = useTranslations("time");
  const locale = useLocale() as Locale;

  return (
    <section
      className={cn(
        "w-full flex-col border-r md:w-[340px] md:shrink-0",
        className,
      )}
    >
      <div className="shrink-0 border-b p-2">
        {/* 5 bộ lọc không vừa một hàng ở khổ điện thoại → cho phép xuống dòng,
            thà 2 hàng còn hơn tràn ngang hoặc giấu mất bộ lọc. */}
        <Tabs value={filter} onValueChange={(v) => onFilterChange(v as InboxFilter)}>
          <TabsList className="w-full flex-wrap gap-1 group-data-[orientation=horizontal]/tabs:h-auto">
            {INBOX_FILTERS.map((key) => (
              <TabsTrigger
                key={key}
                value={key}
                className="h-7 flex-auto text-[13px]"
              >
                {t(`tabs.${key}`, { count: counts[key] })}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              {t(`empty.${filter}`)}
            </p>
            {filter === "open" || filter === "all" ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/app/contacts">{t("empty.viewContacts")}</Link>
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onFilterChange("open")}
              >
                {t("empty.viewOpen")}
              </Button>
            )}
          </div>
        ) : (
          <>
            {conversations.map((c) => {
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
                        title={t(`status.${c.status}`)}
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
            })}
            {hasMore && (
              <div className="p-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={loadingMore}
                  onClick={onLoadMore}
                >
                  {loadingMore ? t("loadingMore") : t("loadMore")}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
