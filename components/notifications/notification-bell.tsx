"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { useNotificationsRealtime } from "@/lib/realtime/use-notifications-realtime";
import type { Locale } from "@/i18n/config";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/app/app/notifications/actions";
import { fetchBellData } from "@/app/app/notifications/queries";
import {
  notificationText,
  relativeAgo,
  safeInternalLink,
  typeKey,
  type NotificationRow,
} from "@/app/app/notifications/types";
import { NotificationTypeIcon } from "./type-icon";

/**
 * Chuông thông báo trên thanh trên cùng.
 *
 * CÁCH CẬP NHẬT: ĐẨY TỨC THỜI, có nhịp hỏi lại làm lưới an toàn.
 *  - Migration #35 đặt thông báo trên topic riêng từng người
 *    'user:{user_id}:notifications'. Không gian topic này nằm NGOÀI 'tenant:...'
 *    nên policy `inbox_broadcast_select` (migration #6 — cho mọi thành viên
 *    tenant nghe mọi topic 'tenant:*') không với tới; đồng nghiệp KHÔNG nghe
 *    được thông báo của nhau. Hộp thư giữ nguyên topic chung như cũ.
 *  - Tín hiệu đẩy về là RỖNG: chuông nhận rồi hỏi lại DB qua RLS của chính mình.
 *  - Kết nối được → hỏi lại thưa hẳn (5 phút) chỉ để bù lúc rớt mạng.
 *    Kết nối HỎNG → tự quay về nhịp 30 giây VÀ nhãn đổi lại đúng sự thật.
 * Nhãn hiển thị luôn nói đúng cái đang chạy — không gắn "tức thời" khi không phải.
 */
const POLL_MS = 30_000;

/** Đang đẩy tức thời thì hỏi lại chỉ để bù sự kiện lỡ mất — thưa là đủ. */
const SAFETY_POLL_MS = 300_000;

/** Trên 99 thì con số cụ thể không còn giúp gì — bóp gọn để không vỡ huy hiệu. */
const BADGE_MAX = 99;

export function NotificationBell() {
  const t = useTranslations("notifications");
  const locale = useLocale() as Locale;
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  // Chuông không có dữ liệu lúc render trên server (chỉ hiện cái nút), nên lấy
  // giờ máy ở đây an toàn — không lệch HTML giữa server và trình duyệt.
  const [now, setNow] = useState(() => Date.now());

  const live = useNotificationsRealtime();

  const bell = useQuery({
    queryKey: ["notifications", "bell"],
    queryFn: () => fetchBellData(supabase),
    refetchInterval: live ? SAFETY_POLL_MS : POLL_MS,
    // staleTime 0 (ghi đè mặc định 30s của app): quay lại tab là hỏi lại ngay,
    // không đợi hết chu kỳ.
    staleTime: 0,
  });

  // Nhãn "x phút trước" tự già đi theo thời gian dù chưa có dữ liệu mới.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const unread = bell.data?.unread ?? 0;
  const rows = bell.data?.rows ?? [];

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
    void refresh();
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="relative"
          /* Chuông là icon trần có chủ ý (quy ước quen thuộc) — bù lại luôn có
             nhãn trợ năng đọc kèm SỐ chưa đọc cho người dùng screen reader. */
          aria-label={
            unread > 0 ? t("bell.labelUnread", { count: unread }) : t("bell.label")
          }
        >
          <Bell className="size-4" aria-hidden />
          {unread > 0 && (
            <span
              aria-hidden
              className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-white"
            >
              {unread > BADGE_MAX ? `${BADGE_MAX}+` : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-[min(22rem,calc(100vw-1.5rem))] p-0"
      >
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{t("title")}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {t(live ? "refreshNoteLive" : "refreshNote")}
            </p>
          </div>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="xs"
              className="shrink-0"
              onClick={() => void handleMarkAll()}
            >
              {t("markAllRead")}
            </Button>
          )}
        </div>

        <div className="max-h-[min(24rem,55svh)] overflow-y-auto">
          {bell.isPending ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {t("loading")}
            </p>
          ) : bell.isError ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {t("loadError")}
            </p>
          ) : rows.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {t("empty.bell")}
            </p>
          ) : (
            rows.map((row) => (
              <BellRow
                key={row.id}
                row={row}
                now={now}
                locale={locale}
                onRead={handleRead}
              />
            ))
          )}
        </div>

        <div className="border-t p-1">
          <DropdownMenuItem asChild>
            <Link
              href="/app/notifications"
              className="justify-center text-sm font-medium"
            >
              {t("viewAll")}
            </Link>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BellRow({
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
  const href = safeInternalLink(row.link);
  const unread = row.read_at === null;
  const title = notificationText(row, tMsg, tSeed, "title");
  const detail = notificationText(row, tMsg, tSeed, "body");

  const body = (
    <>
      <NotificationTypeIcon type={row.type} />
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="flex items-center gap-1.5">
          <span
            className={`min-w-0 flex-1 truncate text-[13px] ${
              unread ? "font-semibold" : "font-medium text-muted-foreground"
            }`}
          >
            {title}
          </span>
          {unread && (
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full bg-destructive"
            />
          )}
        </span>
        {detail && (
          <span className="line-clamp-2 text-xs leading-snug text-muted-foreground">
            {detail}
          </span>
        )}
        <span className="block text-[11px] text-muted-foreground">
          {t(`types.${typeKey(row.type)}`)} ·{" "}
          {relativeAgo(row.created_at, locale, tTime, now)}
        </span>
      </span>
    </>
  );

  const className = "items-start gap-2.5 px-3 py-2.5 whitespace-normal";

  if (href) {
    return (
      <DropdownMenuItem asChild onSelect={() => void onRead(row.id)}>
        <Link href={href} className={className}>
          {body}
        </Link>
      </DropdownMenuItem>
    );
  }
  return (
    <DropdownMenuItem className={className} onSelect={() => void onRead(row.id)}>
      {body}
    </DropdownMenuItem>
  );
}
