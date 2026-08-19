"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Clock,
  Image as ImageIcon,
  Info,
  MessagesSquare,
  Paperclip,
  StickyNote,
  UserRoundCog,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { formatVN } from "@/lib/datetime";
import { dayLabel } from "@/lib/format";
import type { Locale, Translator } from "@/i18n/config";
import {
  addInternalNote,
  assignConversation,
  sendReply,
  setConversationStatus,
} from "./actions";
import { AiAssist } from "./ai-assist";
import { ContactPanelBody } from "./contact-panel";
import { HandoffBanner } from "./handoff-banner";
import { HandoffDialog } from "./handoff-dialog";
import { fetchQuickReplies, markQuickReplyUsed } from "./queries";
import {
  CHANNEL_LABELS,
  CONVERSATION_STATUSES,
  conversationName,
  memberLabel,
  STATUS_DOT,
  type ConversationRow,
  type ConversationStatus,
  type Member,
  type MemberNames,
  type MessageRow,
} from "./types";

const WINDOW_MS = 48 * 60 * 60 * 1000;

/** Ảnh đính kèm ghi chú nội bộ — kiểm sơ bộ phía client, server validate lại là chốt thật. */
const NOTE_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Reason lỗi từ sendReply (channel adapter) → key toast inbox.toasts.*. */
const SEND_TOAST_KEYS: Record<string, string> = {
  not_connected: "notConnected",
  window_closed: "windowClosed",
  token_expired: "tokenExpired",
  rate_limited: "rateLimited",
};

/** Chip đồng hồ cửa sổ 48h tính từ conversations.last_user_message_at. */
function WindowChip({ lastUserMessageAt }: { lastUserMessageAt: string | null }) {
  const t = useTranslations("inbox");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!lastUserMessageAt) return null;
  const remain = new Date(lastUserMessageAt).getTime() + WINDOW_MS - now;

  if (remain <= 0) {
    return (
      <Badge className="bg-bubble-note text-bubble-note-foreground">
        <Clock className="size-3" />
        {t("window.expired")}
      </Badge>
    );
  }
  const hours = Math.floor(remain / 3_600_000);
  const minutes = Math.floor((remain % 3_600_000) / 60_000);
  return (
    <Badge variant="secondary">
      <Clock className="size-3" />
      {hours > 0
        ? t("window.remainingHours", { hours, minutes })
        : t("window.remainingMinutes", { minutes })}
    </Badge>
  );
}

/** Khoảng cách tin gộp nhóm: cùng người ≤5 phút coi là cùng nhóm. */
const GROUP_GAP_MS = 5 * 60_000;

function senderKey(m: MessageRow): string {
  return m.sender_type === "system" ? "note" : m.direction;
}

type ThreadItem =
  | { kind: "day"; key: string; label: string }
  | {
      kind: "msg";
      m: MessageRow;
      /** 2px trong nhóm · 12px giữa nhóm · 16px đổi người. */
      gapClass: string;
      showAvatar: boolean;
      showTime: boolean;
    };

/** Dựng luồng chat: chèn pill ngày + tính nhóm bubble kiểu Zalo. */
function buildThread(
  messages: MessageRow[],
  locale: Locale,
  tTime: Translator,
): ThreadItem[] {
  const items: ThreadItem[] = [];
  messages.forEach((m, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const dayKey = formatVN(m.sent_at, "yyyy-MM-dd");
    const newDay = !prev || formatVN(prev.sent_at, "yyyy-MM-dd") !== dayKey;
    if (newDay) {
      items.push({
        kind: "day",
        key: `day-${dayKey}`,
        label: dayLabel(m.sent_at, locale, tTime),
      });
    }
    const sameAsPrev = !!prev && !newDay && senderKey(prev) === senderKey(m);
    const closePrev =
      sameAsPrev &&
      new Date(m.sent_at).getTime() - new Date(prev.sent_at).getTime() <=
        GROUP_GAP_MS;
    const sameAsNext =
      !!next &&
      formatVN(next.sent_at, "yyyy-MM-dd") === dayKey &&
      senderKey(next) === senderKey(m);
    const closeNext =
      sameAsNext &&
      new Date(next.sent_at).getTime() - new Date(m.sent_at).getTime() <=
        GROUP_GAP_MS;
    items.push({
      kind: "msg",
      m,
      gapClass:
        !prev || newDay
          ? ""
          : closePrev
            ? "mt-0.5"
            : sameAsPrev
              ? "mt-3"
              : "mt-4",
      showAvatar: senderKey(m) === "in" && !closePrev,
      showTime: !closeNext,
    });
  });
  return items;
}

function Bubble({
  m,
  contactInitial,
  gapClass,
  showAvatar,
  showTime,
}: {
  m: MessageRow;
  contactInitial: string;
  gapClass: string;
  showAvatar: boolean;
  showTime: boolean;
}) {
  const t = useTranslations("inbox");
  if (m.sender_type === "system") {
    // Ghi chú nội bộ — băng riêng căn giữa, nền amber, khách không thấy
    return (
      <div className={cn("flex justify-center", gapClass)}>
        <div className="max-w-[85%] rounded-xl bg-bubble-note px-3 py-2 text-center text-[13px] text-bubble-note-foreground">
          <span className="mb-0.5 flex items-center justify-center gap-1 text-xs font-medium">
            <StickyNote className="size-3" />
            {t("thread.internalNote")}
          </span>
          <span className="whitespace-pre-wrap">{m.content}</span>
          {m.attachment?.signedUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- URL ký riêng (bucket private), không hợp với next/image remote patterns
            <img
              src={m.attachment.signedUrl}
              className="mt-1.5 max-h-48 rounded-md border border-bubble-note-foreground/20 object-cover"
              alt=""
            />
          )}
          {showTime && (
            <span className="mt-1 block text-[11px] opacity-60">
              {formatVN(m.sent_at, "HH:mm")}
            </span>
          )}
        </div>
      </div>
    );
  }
  const mine = m.direction === "out";
  return (
    <div
      className={cn("flex", mine ? "justify-end" : "justify-start", gapClass)}
    >
      {!mine &&
        (showAvatar ? (
          <Avatar size="sm" className="mr-2 size-7 self-start">
            <AvatarFallback>{contactInitial}</AvatarFallback>
          </Avatar>
        ) : (
          <span className="mr-2 w-7 shrink-0" />
        ))}
      <div
        className={cn(
          "max-w-[min(65%,480px)] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm",
          mine
            ? "rounded-br-[4px] bg-bubble-out text-bubble-out-foreground"
            : "rounded-bl-[4px] bg-bubble-in text-bubble-in-foreground",
        )}
      >
        {m.content}
        {showTime && (
          <span className="mt-1 block text-right text-[11px] opacity-60">
            {formatVN(m.sent_at, "HH:mm")}
          </span>
        )}
      </div>
    </div>
  );
}

type Props = {
  conversation: ConversationRow | null;
  messages: MessageRow[];
  loading: boolean;
  /** Tải tin nhắn HỎNG — khác hẳn "chưa có tin nhắn nào" (việc #169). */
  loadFailed: boolean;
  members: Member[];
  memberNames: MemberNames;
  currentUserId: string;
  onBack: () => void;
  className?: string;
};

export function MessageThread({
  conversation,
  messages,
  loading,
  loadFailed,
  members,
  memberNames,
  currentUserId,
  onBack,
  className,
}: Props) {
  const t = useTranslations("inbox");
  const tTime = useTranslations("time");
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [text, setText] = useState("");
  // Ảnh đính kèm ghi chú nội bộ (thẻ design tep-dinh-kem.html) — chỉ dùng ở mode==="note"
  const [file, setFile] = useState<File | null>(null);
  const [pending, startTransition] = useTransition();
  // Bàn giao khách (migration #24) — hộp thoại nằm ở file riêng handoff-dialog.tsx
  const [handoffOpen, setHandoffOpen] = useState(false);

  // Câu trả lời nhanh (Tiệm mẫu, migration #12) — quản lý CRUD tại
  // Cài đặt → Câu trả lời nhanh; menu ⚡ refetch mỗi lần mở để thấy thay đổi mới.
  const supabase = useMemo(() => createClient(), []);
  const quickRepliesQuery = useQuery({
    queryKey: ["quick-replies"],
    queryFn: () => fetchQuickReplies(supabase),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, conversation?.id]);

  if (!conversation) {
    return (
      <section
        className={cn(
          "min-w-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center",
          className,
        )}
      >
        <MessagesSquare className="size-10 text-muted-foreground/50" />
        <p className="text-sm font-medium">{t("thread.selectTitle")}</p>
        <p className="max-w-xs text-[13px] text-muted-foreground">
          {t("thread.selectHint")}
        </p>
      </section>
    );
  }

  const pickAttachment = (picked: File | undefined) => {
    if (!picked) return;
    if (!ALLOWED_IMAGE_TYPES.has(picked.type)) {
      toast.error(t("toasts.attachmentInvalidType"));
      return;
    }
    if (picked.size > NOTE_ATTACHMENT_MAX_BYTES) {
      toast.error(t("toasts.attachmentTooLarge"));
      return;
    }
    setFile(picked);
  };

  const submit = () => {
    const value = text.trim();
    if (!value || pending) return;
    startTransition(async () => {
      if (mode === "note") {
        const res = await addInternalNote(conversation.id, value, file);
        setFile(null);
        if (res.error) {
          toast.error(t("toasts.noteFailed"));
          return;
        }
        if (res.attachmentFailed) {
          toast.warning(t("toasts.attachmentFailed"));
        }
        setText("");
        void queryClient.invalidateQueries({
          queryKey: ["messages", conversation.id],
        });
      } else {
        const res = await sendReply(conversation.id, value);
        if (res.error) {
          toast.error(
            t(`toasts.${SEND_TOAST_KEYS[res.error] ?? "sendFailed"}`),
          );
          return;
        }
        // Tin ĐÃ tới khách nhưng hội thoại không nhảy lên đầu danh sách được
        if (res.listNotBumped) toast.warning(t("toasts.listNotBumped"));
        setText("");
        void queryClient.invalidateQueries({
          queryKey: ["messages", conversation.id],
        });
        void queryClient.invalidateQueries({ queryKey: ["conversations"] });
        // Trả lời xong thì hội thoại rời khỏi bộ lọc "Chưa trả lời" → đếm lại
        void queryClient.invalidateQueries({ queryKey: ["inbox-counts"] });
      }
    });
  };

  const assign = (userId: string | null) => {
    startTransition(async () => {
      const res = await assignConversation(conversation.id, userId);
      if (res.error) {
        toast.error(
          t(res.error === "no_permission" ? "toasts.noPermission" : "toasts.assignFailed"),
        );
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["inbox-counts"] });
    });
  };

  const changeStatus = (status: ConversationStatus) => {
    startTransition(async () => {
      const res = await setConversationStatus(conversation.id, status);
      if (res.error) {
        toast.error(
          t(res.error === "no_permission" ? "toasts.noPermission" : "toasts.statusFailed"),
        );
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["inbox-counts"] });
    });
  };

  // Phép lịch sự UI: vai Chỉ xem bị RLS conversations_update chặn, đừng mời họ
  // bấm. Chốt thật vẫn là RLS + bước đếm dòng trong actions.ts — không tìm thấy
  // vai (danh sách member chưa tải xong) thì cứ mở, để RLS trả lời.
  const canWrite =
    members.find((m) => m.user_id === currentUserId)?.role !== "viewer";
  const noPermissionHint = canWrite ? undefined : t("toasts.noPermission");

  const name = conversationName(conversation, t);
  const channelLabel = conversation.channels
    ? (CHANNEL_LABELS[conversation.channels.type] ?? conversation.channels.type)
    : "";
  const assigneeLabel = conversation.assignee_user_id
    ? memberLabel(conversation.assignee_user_id, currentUserId, t, memberNames)
    : t("thread.unassigned");

  return (
    <section className={cn("min-w-0 flex-1 flex-col", className)}>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onBack}
          aria-label={t("thread.back")}
        >
          <ArrowLeft />
        </Button>
        <Avatar className="hidden sm:flex">
          <AvatarFallback>{(name[0] ?? "?").toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <p className="truncate text-sm font-semibold">{name}</p>
          {/* Trước để `hidden sm:inline-flex` — tức trên ĐIỆN THOẠI nhân viên
              không thấy mình đang trả lời khách qua kênh nào, mà điện thoại
              mới là chỗ họ trực nhiều nhất. Hiện luôn ở mọi cỡ màn. */}
          {channelLabel && (
            <Badge variant="secondary" className="shrink-0">
              {channelLabel}
            </Badge>
          )}
        </div>
        <div className="hidden xl:block">
          {/* Cửa sổ trả lời 48h là ràng buộc của Zalo/Meta. Live Chat chạy trên
              website của chính chủ shop nên không có cửa sổ — hiện chip ở đây
              sẽ báo sai. */}
          {/* Nhãn "còn X giờ để trả lời" là luật của Zalo OA. Live Chat và
              Telegram KHÔNG có cửa sổ 48 giờ — bot nhắn lại lúc nào cũng được.
              Hiện cho hai kênh đó là bịa ra một hạn chót không có thật, làm
              nhân viên cuống vô cớ. */}
          {conversation.channels?.type !== "livechat" &&
            conversation.channels?.type !== "telegram" && (
            <WindowChip lastUserMessageAt={conversation.last_user_message_at} />
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              disabled={!canWrite}
              title={noPermissionHint}
            >
              <UserRound className="size-4" />
              <span className="hidden sm:inline">{assigneeLabel}</span>
              <ChevronDown className="size-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {/* Bàn giao đứng đầu menu người phụ trách: chuyển khách là việc
                thường ngày (hết ca, đi vắng), và đây đúng chỗ người dùng tìm. */}
            <DropdownMenuItem onSelect={() => setHandoffOpen(true)}>
              <UserRoundCog className="size-4" />
              {t("handoff.menuItem")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t("thread.assignee")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => assign(null)}>
              {t("thread.unassign")}
              {conversation.assignee_user_id === null && (
                <Check className="ml-auto size-4" />
              )}
            </DropdownMenuItem>
            {members.map((m) => (
              <DropdownMenuItem
                key={m.user_id}
                onSelect={() => assign(m.user_id)}
              >
                {memberLabel(m.user_id, currentUserId, t, memberNames)}
                {conversation.assignee_user_id === m.user_id && (
                  <Check className="ml-auto size-4" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={!canWrite}
              title={noPermissionHint}
            >
              <span
                className={cn(
                  "size-2 rounded-full",
                  STATUS_DOT[conversation.status],
                )}
              />
              <span className="hidden sm:inline">
                {t(`status.${conversation.status}`)}
              </span>
              <ChevronDown className="size-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{t("thread.statusLabel")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {CONVERSATION_STATUSES.map((s) => (
              <DropdownMenuItem key={s} onSelect={() => changeStatus(s)}>
                <span className={cn("size-2 rounded-full", STATUS_DOT[s])} />
                {t(`status.${s}`)}
                {conversation.status === s && (
                  <Check className="ml-auto size-4" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {conversation.status !== "closed" && (
          <Button
            variant="outline"
            size="sm"
            disabled={pending || !canWrite}
            title={noPermissionHint}
            onClick={() => changeStatus("closed")}
          >
            {t("thread.close")}
          </Button>
        )}
        {/* <xl: panel hồ sơ khách bên phải bị ẩn — mở bằng dialog để không mất tính năng */}
        <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="xl:hidden"
              aria-label={t("contactPanel.open")}
              title={t("contactPanel.open")}
            >
              <Info />
            </Button>
          </DialogTrigger>
          <DialogContent
            aria-describedby={undefined}
            className="max-h-[85svh] overflow-y-auto"
          >
            <DialogHeader>
              <DialogTitle>{t("contactPanel.title")}</DialogTitle>
            </DialogHeader>
            <ContactPanelBody
              conversation={conversation}
              currentUserId={currentUserId}
              members={members}
              memberNames={memberNames}
            />
          </DialogContent>
        </Dialog>
      </header>

      <HandoffDialog
        open={handoffOpen}
        onOpenChange={setHandoffOpen}
        conversationId={conversation.id}
        currentAssigneeId={conversation.assignee_user_id}
        currentUserId={currentUserId}
        members={members}
        memberNames={memberNames}
      />

      {/* Tóm tắt bàn giao gần nhất — người nhận vào việc ngay, khỏi đọc lại từ đầu */}
      <HandoffBanner
        key={`handoff-${conversation.id}`}
        conversationId={conversation.id}
        currentUserId={currentUserId}
        memberNames={memberNames}
      />

      {/* <xl: header chật — chip cửa sổ 48h xuống băng riêng để mobile vẫn thấy */}
      {conversation.last_user_message_at && (
        <div className="flex shrink-0 justify-center border-b px-3 py-1.5 xl:hidden">
          <WindowChip lastUserMessageAt={conversation.last_user_message_at} />
        </div>
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Skeleton className="size-7 rounded-full" />
              <Skeleton className="h-12 w-52 rounded-xl" />
            </div>
            <Skeleton className="ml-auto h-12 w-44 rounded-xl" />
            <div className="flex gap-2">
              <Skeleton className="size-7 rounded-full" />
              <Skeleton className="h-8 w-36 rounded-xl" />
            </div>
            <Skeleton className="ml-auto h-8 w-56 rounded-xl" />
            <div className="flex gap-2">
              <Skeleton className="size-7 rounded-full" />
              <Skeleton className="h-12 w-48 rounded-xl" />
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center gap-3 pt-8 text-center">
            {/* Việc #169: khung chat trống vì TẢI HỎNG mà lại nói "chưa có tin
                nhắn nào" là tệ nhất trong sản phẩm này — người trực đọc xong yên
                tâm bỏ qua, trong khi khách đã nhắn và đang chờ. */}
            <p
              className={cn(
                "text-sm",
                loadFailed ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {loadFailed ? t("thread.loadFailed") : t("thread.empty")}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => composerRef.current?.focus()}
            >
              {t("thread.writeFirst")}
            </Button>
          </div>
        ) : (
          buildThread(messages, locale, tTime).map((item) =>
            item.kind === "day" ? (
              <div
                key={item.key}
                className="mt-4 mb-3 flex justify-center first:mt-0"
              >
                <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                  {item.label}
                </span>
              </div>
            ) : (
              <Bubble
                key={item.m.id}
                m={item.m}
                contactInitial={(name[0] ?? "?").toUpperCase()}
                gapClass={item.gapClass}
                showAvatar={item.showAvatar}
                showTime={item.showTime}
              />
            ),
          )
        )}
      </div>

      <AiAssist
        key={`ai-assist-${conversation.id}`}
        conversationId={conversation.id}
        disabled={loading || messages.length === 0}
        onInsert={(value) => {
          setMode("reply");
          setText(value);
          composerRef.current?.focus();
        }}
      />

      <div
        className={cn(
          "shrink-0 border-t p-3 transition-colors",
          mode === "note" && "bg-bubble-note/40",
        )}
      >
        <div className="mb-2 flex gap-1">
          <Button
            type="button"
            size="sm"
            variant={mode === "reply" ? "secondary" : "ghost"}
            onClick={() => setMode("reply")}
          >
            {t("thread.replyTab")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={cn(
              mode === "note" &&
                "bg-bubble-note text-bubble-note-foreground hover:bg-bubble-note hover:text-bubble-note-foreground",
            )}
            onClick={() => setMode("note")}
          >
            {t("thread.noteTab")}
          </Button>
          {mode === "note" && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="gap-1.5 text-muted-foreground"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="size-3.5" />
              {t("thread.attachImage")}
            </Button>
          )}
          <DropdownMenu
            onOpenChange={(open) => {
              // Kho câu có thể vừa được sửa ở Cài đặt — mở menu là lấy bản mới
              if (open) quickRepliesQuery.refetch();
            }}
          >
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="ml-auto"
                aria-label={t("thread.quickReplies")}
                title={t("thread.quickReplies")}
              >
                <Zap className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>{t("thread.quickReplies")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(quickRepliesQuery.data ?? []).length === 0 ? (
                <p className="px-2 py-1.5 text-[13px] text-muted-foreground">
                  {t("thread.quickRepliesEmpty")}
                </p>
              ) : (
                (quickRepliesQuery.data ?? []).map((qr) => (
                  <DropdownMenuItem
                    key={qr.id}
                    className="flex-col items-start gap-0.5"
                    onSelect={() => {
                      setMode("reply");
                      // Chèn vào composer: draft trống thì thay, có sẵn thì nối dòng
                      setText((prev) =>
                        prev.trim() ? `${prev}\n${qr.content}` : qr.content,
                      );
                      // Ghi lượt dùng cho màn Cài đặt (fire-and-forget, #58)
                      void markQuickReplyUsed(supabase, qr.id);
                      composerRef.current?.focus();
                    }}
                  >
                    <span className="text-[13px] font-medium">{qr.title}</span>
                    <span className="line-clamp-2 w-full text-xs text-muted-foreground">
                      {qr.content}
                    </span>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            pickAttachment(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {mode === "note" && file && (
          <div className="mb-2 flex">
            <span className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs font-medium">
              <ImageIcon className="size-3.5 text-muted-foreground" />
              {file.name}
              <button
                type="button"
                onClick={() => setFile(null)}
                aria-label={t("thread.removeAttachment")}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex items-end gap-2"
        >
          {/* resize-none: ô đã tự cao theo nội dung ([field-sizing:content]),
              để kéo tay nữa thì hai thứ đá nhau. dark:bg-bubble-note: giữ nền
              vàng của chế độ ghi chú, không thì nền ô nhập của giao diện tối
              (dark:bg-input/30 trong Textarea dùng chung) đè mất. */}
          <Textarea
            ref={composerRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            placeholder={
              mode === "note"
                ? t("thread.notePlaceholder")
                : t("thread.replyPlaceholder")
            }
            className={cn(
              "max-h-40 min-h-14 flex-1 resize-none [field-sizing:content]",
              mode === "note" &&
                "border-bubble-note-foreground/30 bg-bubble-note dark:bg-bubble-note",
            )}
          />
          <Button type="submit" disabled={pending || !text.trim()}>
            {mode === "note" ? t("thread.saveNote") : t("thread.send")}
          </Button>
        </form>
      </div>
    </section>
  );
}
