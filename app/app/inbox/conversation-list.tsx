"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/format";
import type { Locale, Translator } from "@/i18n/config";
import {
  CHANNEL_LABELS,
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
  search: string;
  onSearchChange: (value: string) => void;
  hasMore: boolean;
  /** Tổng hội thoại KHỚP bộ lọc + từ khoá trong CSDL (không phải số đang hiện). */
  matchedTotal: number;
  /** Số dòng đang hiện trên màn. */
  shownCount: number;
  loadingMore: boolean;
  onLoadMore: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Tải danh sách HỎNG — khác hẳn "chưa có hội thoại nào" (việc #169). */
  loadFailed: boolean;
  className?: string;
};

export function ConversationList({
  conversations,
  counts,
  filter,
  onFilterChange,
  search,
  onSearchChange,
  hasMore,
  matchedTotal,
  shownCount,
  loadingMore,
  onLoadMore,
  selectedId,
  onSelect,
  loadFailed,
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
      <div className="shrink-0 space-y-2 border-b p-2">
        {/* Tìm khách ngay trong Hộp thư. Trước đó muốn tìm "chị Vân" phải cuộn
            cả danh sách, mà mỗi lần chỉ tải 50 hội thoại rồi phải bấm "Xem
            thêm" — tiệm chạy vài tháng là không tìm nổi ai. Tìm chạy TRONG CSDL
            (nối trong với hồ sơ khách), không phải lọc 50 dòng đã tải. */}
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            className="h-8 pl-8"
          />
        </div>
        {/* 5 bộ lọc không vừa một hàng ở khổ điện thoại → cho phép xuống dòng,
            thà 2 hàng còn hơn tràn ngang hoặc giấu mất bộ lọc. */}
        <Tabs value={filter} onValueChange={(v) => onFilterChange(v as InboxFilter)}>
          {/* flex-none chứ KHÔNG phải flex-auto: giãn đầy hàng thì hàng 2 thẻ
              mỗi thẻ rộng gấp đôi hàng 3 thẻ, nhìn như hỏng. Để thẻ vừa đúng
              chữ của nó, hàng nào cũng đều. */}
          <TabsList className="w-full flex-wrap justify-start gap-1 group-data-[orientation=horizontal]/tabs:h-auto">
            {INBOX_FILTERS.map((key) => (
              <TabsTrigger
                key={key}
                value={key}
                className={cn(
                  "h-7 flex-none text-[13px]",
                  // "Chưa trả lời" là con số DUY NHẤT trên thanh này mang nghĩa
                  // "phải làm ngay". Để nó trông y hệt "Tất cả (9)" thì mắt
                  // không bám vào đâu — tô màu thương hiệu khi còn khách đang chờ.
                  key === "unanswered" &&
                    counts.unanswered > 0 &&
                    "font-semibold text-primary",
                )}
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
            {/* Đang tìm mà rỗng thì nói RÕ là không khớp từ khoá, đừng dùng lại
                câu "chưa có hội thoại nào" — hai chuyện khác hẳn nhau.
                Việc #169: TẢI HỎNG cũng là chuyện thứ ba, nguy hiểm nhất trong
                ba — hộp thư trống vì lỗi mà lại nói "chưa có hội thoại nào" thì
                tiệm yên tâm đóng máy trong khi khách đang chờ. */}
            <p
              className={cn(
                "text-sm",
                loadFailed ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {loadFailed
                ? t("loadFailed")
                : search
                  ? t("searchEmpty")
                  : t(`empty.${filter}`)}
            </p>
            {/* Tải hỏng thì đừng mời đi xem chỗ khác — việc cần làm là thử lại */}
            {loadFailed ? null : filter === "open" || filter === "all" ? (
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
                      {/* Khách đến từ đâu — trước đây danh sách KHÔNG hiện gì
                          về kênh, hai khách ở hai kênh khác nhau trông y hệt.
                          Nhân viên phải mở từng hội thoại mới biết mình đang
                          nói chuyện qua Zalo hay qua web, mà cách xưng hô và
                          thứ trả lời được lại khác nhau. Dữ liệu đã có sẵn
                          trong truy vấn, chỉ là chưa ai hiện ra. */}
                      {c.channels && (
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {CHANNEL_LABELS[c.channels.type] ?? c.channels.type}
                        </span>
                      )}
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
              <div className="space-y-2 p-3">
                {/* Cắt danh sách thì PHẢI NÓI RA con số — thấy 50 mà im lặng về
                    30 cái còn lại là để người dùng tưởng đã xem hết. */}
                <p className="text-center text-xs text-muted-foreground">
                  {t("listTruncated", { shown: shownCount, total: matchedTotal })}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-[44px] w-full"
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
