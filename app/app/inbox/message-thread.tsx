"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Clock,
  MessagesSquare,
  Send,
  StickyNote,
  UserRound,
} from "lucide-react";
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
import { cn } from "@/lib/utils";
import { formatVN } from "@/lib/datetime";
import {
  addInternalNote,
  assignConversation,
  sendReply,
  setConversationStatus,
} from "./actions";
import {
  CHANNEL_LABELS,
  conversationName,
  memberLabel,
  STATUS_DOT,
  STATUS_LABELS,
  type ConversationRow,
  type ConversationStatus,
  type Member,
  type MessageRow,
} from "./types";

const NOT_CONNECTED_MSG =
  "Chưa kết nối Zalo OA — tính năng gửi sẽ mở khi kết nối kênh";

const WINDOW_MS = 48 * 60 * 60 * 1000;

/** Chip đồng hồ cửa sổ 48h tính từ conversations.last_user_message_at. */
function WindowChip({ lastUserMessageAt }: { lastUserMessageAt: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (!lastUserMessageAt) return null;
  const remain = new Date(lastUserMessageAt).getTime() + WINDOW_MS - now;

  if (remain <= 0) {
    return (
      <Badge
        variant="outline"
        className="border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
      >
        <Clock className="size-3" />
        Hết cửa sổ 48h — dùng ZNS
      </Badge>
    );
  }
  const hours = Math.floor(remain / 3_600_000);
  const minutes = Math.floor((remain % 3_600_000) / 60_000);
  return (
    <Badge variant="secondary">
      <Clock className="size-3" />
      {hours > 0 ? `Còn ${hours} giờ ${minutes} phút` : `Còn ${minutes} phút`}
    </Badge>
  );
}

function Bubble({ m }: { m: MessageRow }) {
  if (m.sender_type === "system") {
    // Ghi chú nội bộ — căn giữa, nền vàng nhạt, khách không thấy
    return (
      <div className="flex justify-center">
        <div className="max-w-[85%] rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <span className="mb-0.5 flex items-center justify-center gap-1 font-medium">
            <StickyNote className="size-3" />
            Ghi chú nội bộ
          </span>
          <span className="whitespace-pre-wrap">{m.content}</span>
          <span className="mt-1 block text-[10px] opacity-70">
            {formatVN(m.sent_at, "HH:mm dd/MM")}
          </span>
        </div>
      </div>
    );
  }
  const mine = m.direction === "out";
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[75%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm",
          mine
            ? "rounded-br-sm bg-primary text-primary-foreground"
            : "rounded-bl-sm bg-muted",
        )}
      >
        {m.content}
        <span className="mt-1 block text-right text-[10px] opacity-60">
          {formatVN(m.sent_at, "HH:mm")}
        </span>
      </div>
    </div>
  );
}

type Props = {
  conversation: ConversationRow | null;
  messages: MessageRow[];
  loading: boolean;
  members: Member[];
  currentUserId: string;
  onBack: () => void;
  className?: string;
};

export function MessageThread({
  conversation,
  messages,
  loading,
  members,
  currentUserId,
  onBack,
  className,
}: Props) {
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, conversation?.id]);

  if (!conversation) {
    return (
      <section
        className={cn(
          "min-w-0 flex-1 flex-col items-center justify-center gap-2",
          className,
        )}
      >
        <MessagesSquare className="size-10 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          Chọn một hội thoại để xem tin nhắn
        </p>
      </section>
    );
  }

  const submit = () => {
    const value = text.trim();
    if (!value || pending) return;
    startTransition(async () => {
      if (mode === "note") {
        const res = await addInternalNote(conversation.id, value);
        if (res.error) {
          toast.error("Không lưu được ghi chú, thử lại");
          return;
        }
        setText("");
        void queryClient.invalidateQueries({
          queryKey: ["messages", conversation.id],
        });
      } else {
        const res = await sendReply(conversation.id, value);
        if (res.error === "not_connected") {
          toast.error(NOT_CONNECTED_MSG);
        } else if (res.error) {
          toast.error("Không gửi được tin, thử lại");
        }
      }
    });
  };

  const assign = (userId: string | null) => {
    startTransition(async () => {
      const res = await assignConversation(conversation.id, userId);
      if (res.error) {
        toast.error("Không gán được người phụ trách, thử lại");
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    });
  };

  const changeStatus = (status: ConversationStatus) => {
    startTransition(async () => {
      const res = await setConversationStatus(conversation.id, status);
      if (res.error) {
        toast.error("Không đổi được trạng thái, thử lại");
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    });
  };

  const channelLabel = conversation.channels
    ? (CHANNEL_LABELS[conversation.channels.type] ?? conversation.channels.type)
    : "";
  const assigneeLabel = conversation.assignee_user_id
    ? memberLabel(conversation.assignee_user_id, currentUserId)
    : "Chưa gán";

  return (
    <section className={cn("min-w-0 flex-1 flex-col", className)}>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onBack}
          aria-label="Quay lại danh sách"
        >
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {conversationName(conversation)}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {channelLabel}
            {conversation.channels?.display_name
              ? ` · ${conversation.channels.display_name}`
              : ""}
          </p>
        </div>
        <div className="hidden sm:block">
          <WindowChip lastUserMessageAt={conversation.last_user_message_at} />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              <UserRound className="size-4" />
              <span className="hidden lg:inline">{assigneeLabel}</span>
              <ChevronDown className="size-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Người phụ trách</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => assign(null)}>
              Bỏ gán
              {conversation.assignee_user_id === null && (
                <Check className="ml-auto size-4" />
              )}
            </DropdownMenuItem>
            {members.map((m) => (
              <DropdownMenuItem
                key={m.user_id}
                onSelect={() => assign(m.user_id)}
              >
                {memberLabel(m.user_id, currentUserId)}
                {conversation.assignee_user_id === m.user_id && (
                  <Check className="ml-auto size-4" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <span
                className={cn(
                  "size-2 rounded-full",
                  STATUS_DOT[conversation.status],
                )}
              />
              <span className="hidden lg:inline">
                {STATUS_LABELS[conversation.status]}
              </span>
              <ChevronDown className="size-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Trạng thái</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(Object.keys(STATUS_LABELS) as ConversationStatus[]).map((s) => (
              <DropdownMenuItem key={s} onSelect={() => changeStatus(s)}>
                <span className={cn("size-2 rounded-full", STATUS_DOT[s])} />
                {STATUS_LABELS[s]}
                {conversation.status === s && (
                  <Check className="ml-auto size-4" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-2/3" />
            <Skeleton className="ml-auto h-12 w-1/2" />
            <Skeleton className="h-12 w-3/5" />
          </div>
        ) : messages.length === 0 ? (
          <p className="pt-8 text-center text-sm text-muted-foreground">
            Chưa có tin nhắn trong hội thoại này
          </p>
        ) : (
          messages.map((m) => <Bubble key={m.id} m={m} />)
        )}
      </div>

      <div className="shrink-0 border-t p-3">
        <div className="mb-2 flex gap-1">
          <Button
            type="button"
            size="sm"
            variant={mode === "reply" ? "secondary" : "ghost"}
            onClick={() => setMode("reply")}
          >
            <Send className="size-3.5" />
            Trả lời
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "note" ? "secondary" : "ghost"}
            className={cn(
              mode === "note" &&
                "bg-amber-100 text-amber-900 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-200",
            )}
            onClick={() => setMode("note")}
          >
            <StickyNote className="size-3.5" />
            Ghi chú nội bộ
          </Button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex items-end gap-2"
        >
          <textarea
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
                ? "Ghi chú nội bộ — khách không thấy…"
                : "Nhập tin trả lời khách…"
            }
            className={cn(
              "flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
              mode === "note" &&
                "border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10",
            )}
          />
          <Button type="submit" disabled={pending || !text.trim()}>
            {mode === "note" ? "Lưu ghi chú" : "Gửi"}
          </Button>
        </form>
      </div>
    </section>
  );
}
