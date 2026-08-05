"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { BellOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { NotificationTypeIcon } from "@/components/notifications/type-icon";
import { createClient } from "@/lib/supabase/client";
import { useNotificationsLive } from "@/lib/realtime/use-notifications-realtime";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/config";
import { markAllNotificationsRead, markNotificationRead } from "./actions";
import {
  fetchBellData,
  fetchNotificationsPage,
  type NotificationsPage,
} from "./queries";
import {
  NOTIFICATION_TYPES,
  notificationText,
  relativeAgo,
  safeInternalLink,
  typeKey,
  type NotificationRow,
} from "./types";

const READ_STATES = ["all", "unread"] as const;
type ReadState = (typeof READ_STATES)[number];

/** Giá trị cho ô lọc loại: "" = tất cả, còn lại khớp cột `type`. */
const TYPE_FILTERS = ["", ...NOTIFICATION_TYPES] as const;

export function NotificationsView({
  initialType,
  initialState,
  initialPage,
  now: serverNow,
}: {
  initialType: string;
  initialState: ReadState;
  initialPage: NotificationsPage;
  /** Mốc "bây giờ" do server truyền xuống — lần render đầu phải trùng server. */
  now: string;
}) {
  const t = useTranslations("notifications");
  const tCommon = useTranslations("common");
  const locale = useLocale() as Locale;
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
  const live = useNotificationsLive();

  const [type, setType] = useQueryState(
    "type",
    parseAsString.withDefault(initialType),
  );
  const [state, setState] = useQueryState(
    "state",
    parseAsStringLiteral(READ_STATES).withDefault(initialState),
  );

  // Mốc thời gian khởi đầu lấy từ server để HTML server và lần render đầu ở
  // trình duyệt giống hệt nhau (không cảnh báo hydration). Sau đó mỗi phút nhảy
  // sang giờ máy để nhãn "x phút trước" tự già đi.
  const [now, setNow] = useState(() => new Date(serverNow).getTime());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const filter = { type, unreadOnly: state === "unread" };
  const isInitialFilter =
    type === initialType && state === initialState;

  const list = useInfiniteQuery({
    queryKey: ["notifications", "list", type, state],
    queryFn: ({ pageParam }) =>
      fetchNotificationsPage(supabase, filter, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    initialData: isInitialFilter
      ? { pages: [initialPage], pageParams: [null] }
      : undefined,
  });

  // Cùng khóa với chuông → dùng lại đúng một lượt hỏi, không gọi thêm.
  const bell = useQuery({
    queryKey: ["notifications", "bell"],
    queryFn: () => fetchBellData(supabase),
    staleTime: 0,
  });
  const unread = bell.data?.unread ?? 0;

  const rows = list.data?.pages.flatMap((p) => p.rows) ?? [];
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["notifications"] });

  const handleRead = async (id: string) => {
    const { error } = await markNotificationRead(id);
    if (error) {
      toast.error(error);
      return;
    }
    void refresh();
  };

  const handleMarkAll = async () => {
    const { error } = await markAllNotificationsRead();
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(t("markAllDone"));
    void refresh();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-2 border-b p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-sm font-semibold">{t("title")}</h1>
          <p className="text-xs text-muted-foreground">
            {unread > 0 ? t("unreadCount", { count: unread }) : t("allRead")}
          </p>
          {unread > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => void handleMarkAll()}
            >
              {t("markAllRead")}
            </Button>
          )}
        </div>

        {/* Hai nhóm lọc TÁCH RIÊNG: ở 375px chúng xuống dòng nguyên cụm, không
            để "Tất cả loại" đứng cạnh "Tất cả" gây hiểu nhầm. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {TYPE_FILTERS.map((value) => (
              <Button
                key={value || "all"}
                size="xs"
                variant={type === value ? "secondary" : "ghost"}
                aria-pressed={type === value}
                onClick={() => void setType(value)}
              >
                {value ? t(`types.${value}`) : t("filters.allTypes")}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {READ_STATES.map((value) => (
              <Button
                key={value}
                size="xs"
                variant={state === value ? "secondary" : "ghost"}
                aria-pressed={state === value}
                onClick={() => void setState(value)}
              >
                {t(`filters.${value}`)}
              </Button>
            ))}
          </div>
        </div>

        {/* Chuông trong app shell mới là nơi giữ kênh đẩy — ở đây chỉ ĐỌC trạng
            thái để nhãn nói đúng cái đang chạy, không mở thêm kênh thứ hai. */}
        <p className="text-[11px] text-muted-foreground">
          {t(live ? "refreshNoteLive" : "refreshNote")}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {list.isPending ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-2/3" />
          </div>
        ) : list.isError ? (
          <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
            <p className="text-sm text-muted-foreground">{t("loadError")}</p>
            <Button variant="outline" onClick={() => void list.refetch()}>
              {tCommon("loadMore")}
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
            <div className="rounded-full bg-muted p-6">
              <BellOff className="size-10 text-muted-foreground" aria-hidden />
            </div>
            {type !== "" || state === "unread" ? (
              <p className="text-sm text-muted-foreground">
                {t("empty.filtered")}
              </p>
            ) : (
              <>
                <h2 className="text-base font-semibold">{t("empty.title")}</h2>
                <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                  {t("empty.description")}
                </p>
              </>
            )}
          </div>
        ) : (
          <>
            <ul>
              {rows.map((row) => (
                <NotificationListRow
                  key={row.id}
                  row={row}
                  now={now}
                  locale={locale}
                  onRead={handleRead}
                />
              ))}
            </ul>
            {list.hasNextPage && (
              <div className="flex justify-center p-4">
                <Button
                  variant="outline"
                  disabled={list.isFetchingNextPage}
                  onClick={() => void list.fetchNextPage()}
                >
                  {list.isFetchingNextPage
                    ? tCommon("loading")
                    : tCommon("loadMore")}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function NotificationListRow({
  row,
  now,
  locale,
  onRead,
}: {
  row: NotificationRow;
  now: number;
  locale: Locale;
  onRead: (id: string) => Promise<void>;
}) {
  const t = useTranslations("notifications");
  const tTime = useTranslations("notifications.time");
  const tMsg = useTranslations("notifications.messages");
  const tSeed = useTranslations("seed");
  const router = useRouter();
  const href = safeInternalLink(row.link);
  const unread = row.read_at === null;
  const title = notificationText(row, tMsg, tSeed, "title");
  const body = notificationText(row, tMsg, tSeed, "body");

  const open = () => {
    if (!href) return;
    void onRead(row.id);
    router.push(href);
  };

  return (
    <li
      // Bấm đâu trong dòng cũng mở được việc cần xử lý (quy ước sẵn ở bảng Công
      // ty): trên điện thoại không có hover nên vùng bấm càng rộng càng dễ.
      onClick={href ? open : undefined}
      className={cn(
        "flex items-start gap-3 border-b p-3",
        unread && "bg-foreground/[0.03]",
        href && "cursor-pointer transition-colors hover:bg-muted/50",
      )}
    >
      <NotificationTypeIcon type={row.type} />
      <div className="min-w-0 flex-1 space-y-1">
        {/* Link THẬT bên trong: bàn phím và screen reader vào được, người dùng
            thấy đích đến trên thanh trạng thái — onClick trên dòng chỉ là tiện chuột. */}
        {href ? (
          <Link
            href={href}
            onClick={(e) => {
              e.stopPropagation();
              void onRead(row.id);
            }}
            className={cn(
              "block text-sm hover:underline",
              unread ? "font-semibold" : "font-medium",
            )}
          >
            {title}
          </Link>
        ) : (
          <p className={cn("text-sm", unread ? "font-semibold" : "font-medium")}>
            {title}
          </p>
        )}

        {body && (
          <p className="text-xs leading-relaxed text-muted-foreground">{body}</p>
        )}

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[11px] text-muted-foreground">
            {t(`types.${typeKey(row.type)}`)} ·{" "}
            {relativeAgo(row.created_at, locale, tTime, now)}
          </span>
          {unread && (
            <Button
              size="xs"
              variant="ghost"
              className="text-[11px]"
              onClick={(e) => {
                e.stopPropagation();
                void onRead(row.id);
              }}
            >
              {t("markRead")}
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
