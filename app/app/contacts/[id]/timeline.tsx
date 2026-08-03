"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  CalendarClock,
  ExternalLink,
  History,
  MessagesSquare,
  PhoneCall,
  SquareCheckBig,
  StickyNote,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatVN } from "@/lib/datetime";
import { CHANNEL_LABELS } from "@/app/app/inbox/types";
import { addActivity, toggleActivityDone } from "../actions";
import {
  ACTIVITY_LABELS,
  type ActivityRow,
  type ActivityType,
  type ConversationLite,
} from "../types";

/** Loại hoạt động soạn nhanh được từ composer (meeting đợt sau). */
type ComposerType = Extract<ActivityType, "note" | "call" | "task">;

const ACTIVITY_ICONS: Record<ActivityType, typeof StickyNote> = {
  note: StickyNote,
  call: PhoneCall,
  meeting: Users,
  task: SquareCheckBig,
};

const COMPOSER_TABS: { type: ComposerType; label: string; icon: typeof StickyNote }[] = [
  { type: "note", label: "Ghi chú", icon: StickyNote },
  { type: "call", label: "Cuộc gọi", icon: PhoneCall },
  { type: "task", label: "Việc cần làm", icon: SquareCheckBig },
];

type TimelineItem =
  | { kind: "activity"; at: string; activity: ActivityRow }
  | { kind: "conversation"; at: string; conversation: ConversationLite };

/** Trộn activities + hội thoại inbox theo thời gian giảm dần. */
function mergeTimeline(
  activities: ActivityRow[],
  conversations: ConversationLite[],
): TimelineItem[] {
  const items: TimelineItem[] = [
    ...activities.map((a) => ({
      kind: "activity" as const,
      at: a.created_at,
      activity: a,
    })),
    ...conversations.map((c) => ({
      kind: "conversation" as const,
      at: c.last_message_at ?? c.created_at,
      conversation: c,
    })),
  ];
  return items.sort((a, b) => (a.at < b.at ? 1 : -1));
}

function ActivityItem({ activity }: { activity: ActivityRow }) {
  const [pending, startTransition] = useTransition();
  // Mốc "bây giờ" chốt lúc mount — đủ cho nhãn quá hạn, không cần đồng hồ chạy
  const [now] = useState(() => Date.now());
  const Icon = ACTIVITY_ICONS[activity.type];
  const done = activity.done_at !== null;
  const overdue =
    activity.type === "task" &&
    !done &&
    activity.due_at !== null &&
    new Date(activity.due_at).getTime() < now;

  const toggle = () => {
    startTransition(async () => {
      const res = await toggleActivityDone(activity.id, !done);
      if (res.error) toast.error(res.error);
    });
  };

  return (
    <div className="flex gap-3">
      <div className="mt-0.5 rounded-full bg-muted p-2">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {ACTIVITY_LABELS[activity.type]}
          </span>
          {formatVN(activity.created_at)}
        </p>
        {activity.type === "task" ? (
          <div className="mt-1 flex items-start gap-2">
            <input
              type="checkbox"
              checked={done}
              onChange={toggle}
              disabled={pending}
              aria-label={done ? "Đánh dấu chưa xong" : "Đánh dấu đã xong"}
              className="mt-0.5 size-4 accent-primary"
            />
            <div className="min-w-0">
              <p
                className={cn(
                  "text-sm whitespace-pre-wrap",
                  done && "text-muted-foreground line-through",
                )}
              >
                {activity.body ?? activity.subject}
              </p>
              {activity.due_at && (
                <p
                  className={cn(
                    "mt-0.5 flex items-center gap-1 text-xs",
                    overdue
                      ? "font-medium text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  <CalendarClock className="size-3" />
                  Hạn: {formatVN(activity.due_at)}
                  {overdue && " — quá hạn"}
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-1 text-sm whitespace-pre-wrap">
            {activity.body ?? activity.subject}
          </p>
        )}
      </div>
    </div>
  );
}

function ConversationItem({ conversation }: { conversation: ConversationLite }) {
  const channelLabel = conversation.channels
    ? (CHANNEL_LABELS[conversation.channels.type] ?? conversation.channels.type)
    : "Hội thoại";
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 rounded-full bg-primary/10 p-2">
        <MessagesSquare className="size-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            Hội thoại {channelLabel}
          </span>
          {conversation.last_message_at &&
            formatVN(conversation.last_message_at)}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {conversation.channels?.display_name ?? channelLabel}
          {conversation.status === "closed" && " · đã đóng"}
        </p>
        <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs">
          <Link href={`/app/inbox?c=${conversation.id}`}>
            Mở hội thoại
            <ExternalLink className="size-3" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

type Props = {
  contactId: string;
  activities: ActivityRow[];
  conversations: ConversationLite[];
};

export function Timeline({ contactId, activities, conversations }: Props) {
  const [type, setType] = useState<ComposerType>("note");
  const [content, setContent] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [pending, startTransition] = useTransition();

  const items = mergeTimeline(activities, conversations);
  const canSubmit =
    content.trim() !== "" && (type !== "task" || dueAt !== "") && !pending;

  const submit = () => {
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await addActivity(contactId, {
        type,
        content: content.trim(),
        // datetime-local trả giờ địa phương → chuyển ISO trước khi gửi
        dueAt: type === "task" && dueAt ? new Date(dueAt).toISOString() : undefined,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Đã ghi vào dòng thời gian");
      setContent("");
      setDueAt("");
    });
  };

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <History className="size-4 text-muted-foreground" />
          Dòng thời gian
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-4">
        <div className="rounded-lg border p-3">
          <div className="mb-2 flex flex-wrap gap-1">
            {COMPOSER_TABS.map(({ type: t, label, icon: Icon }) => (
              <Button
                key={t}
                type="button"
                size="sm"
                variant={type === t ? "secondary" : "ghost"}
                onClick={() => setType(t)}
              >
                <Icon className="size-3.5" />
                {label}
              </Button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="space-y-2"
          >
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={2}
              placeholder={
                type === "note"
                  ? "VD: khách thích liệu trình A, ngại giá…"
                  : type === "call"
                    ? "VD: gọi 5 phút, khách hẹn quyết định cuối tuần…"
                    : "VD: gọi lại chốt lịch hẹn…"
              }
              className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
            />
            <div className="flex flex-wrap items-center gap-2">
              {type === "task" && (
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  Hạn:
                  <input
                    type="datetime-local"
                    value={dueAt}
                    onChange={(e) => setDueAt(e.target.value)}
                    className="h-8 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                  />
                </label>
              )}
              <Button type="submit" size="sm" className="ml-auto" disabled={!canSubmit}>
                Lưu
              </Button>
            </div>
          </form>
        </div>

        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Chưa có hoạt động nào. Ghi chú đầu tiên sau cuộc gọi hay buổi hẹn để
            cả đội nắm được lịch sử khách.
          </p>
        ) : (
          <div className="space-y-4">
            {items.map((item) =>
              item.kind === "activity" ? (
                <ActivityItem key={`a-${item.activity.id}`} activity={item.activity} />
              ) : (
                <ConversationItem
                  key={`c-${item.conversation.id}`}
                  conversation={item.conversation}
                />
              ),
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
