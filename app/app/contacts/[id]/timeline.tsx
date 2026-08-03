"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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
import { dayLabelVN } from "@/lib/format";
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

/** API cho nút "Thêm việc" ở header hồ sơ: chuyển composer sang tab việc + focus. */
export type TimelineApi = { openTask: () => void };

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

/** Nhóm item theo ngày VN, giữ thứ tự giảm dần — nhãn "Hôm nay"/"Hôm qua"/dd/MM/yyyy. */
function groupByDay(items: TimelineItem[]) {
  const groups: { key: string; label: string; items: TimelineItem[] }[] = [];
  for (const item of items) {
    const key = formatVN(item.at, "yyyy-MM-dd");
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(item);
    } else {
      groups.push({ key, label: dayLabelVN(item.at), items: [item] });
    }
  }
  return groups;
}

/** Node timeline 28px + kẻ dọc nối xuống item kế (trừ item cuối nhóm). */
function TimelineNode({
  icon: Icon,
  highlight,
  isLast,
  children,
}: {
  icon: typeof StickyNote;
  highlight?: boolean;
  isLast: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex gap-3 pb-4 last:pb-0">
      {!isLast && (
        <span
          aria-hidden
          className="absolute top-8 bottom-0 left-3.5 w-px bg-border"
        />
      )}
      <div
        className={cn(
          "z-10 flex size-7 shrink-0 items-center justify-center rounded-full",
          highlight ? "bg-primary-tint" : "bg-muted",
        )}
      >
        <Icon
          className={cn(
            "size-3.5",
            highlight ? "text-primary" : "text-muted-foreground",
          )}
        />
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function ActivityItem({
  activity,
  isLast,
}: {
  activity: ActivityRow;
  isLast: boolean;
}) {
  const [pending, startTransition] = useTransition();
  // Mốc "bây giờ" chốt lúc mount — đủ cho nhãn quá hạn, không cần đồng hồ chạy
  const [now] = useState(() => Date.now());
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
    <TimelineNode icon={ACTIVITY_ICONS[activity.type]} isLast={isLast}>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-sm font-medium">
          {ACTIVITY_LABELS[activity.type]}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatVN(activity.created_at, "HH:mm")}
        </span>
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
                "text-[13px] whitespace-pre-wrap",
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
        <p className="mt-1 text-[13px] whitespace-pre-wrap">
          {activity.body ?? activity.subject}
        </p>
      )}
    </TimelineNode>
  );
}

function ConversationItem({
  conversation,
  isLast,
}: {
  conversation: ConversationLite;
  isLast: boolean;
}) {
  const channelLabel = conversation.channels
    ? (CHANNEL_LABELS[conversation.channels.type] ?? conversation.channels.type)
    : "Hội thoại";
  return (
    <TimelineNode icon={MessagesSquare} highlight isLast={isLast}>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-sm font-medium">Hội thoại {channelLabel}</span>
        {conversation.last_message_at && (
          <span className="text-xs text-muted-foreground">
            {formatVN(conversation.last_message_at, "HH:mm")}
          </span>
        )}
      </p>
      <p className="mt-1 text-[13px] text-muted-foreground">
        {conversation.channels?.display_name ?? channelLabel}
        {conversation.status === "closed" && " · đã đóng"}
      </p>
      <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs">
        <Link href={`/app/inbox?c=${conversation.id}`}>
          Mở hội thoại
          <ExternalLink className="size-3" />
        </Link>
      </Button>
    </TimelineNode>
  );
}

type Props = {
  contactId: string;
  activities: ActivityRow[];
  conversations: ConversationLite[];
  apiRef?: React.MutableRefObject<TimelineApi | null>;
};

export function Timeline({ contactId, activities, conversations, apiRef }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [type, setType] = useState<ComposerType>("note");
  const [content, setContent] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      openTask: () => {
        setType("task");
        textareaRef.current?.focus();
      },
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef]);

  const groups = groupByDay(mergeTimeline(activities, conversations));
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
    <Card className="gap-3 self-start py-4">
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
              ref={textareaRef}
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

        {groups.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Chưa có hoạt động nào. Ghi chú đầu tiên sau cuộc gọi hay buổi hẹn để
            cả đội nắm được lịch sử khách.
          </p>
        ) : (
          <div className="space-y-5">
            {groups.map((g) => (
              <div key={g.key}>
                <p className="mb-3 text-xs font-medium text-muted-foreground">
                  {g.label}
                </p>
                <div>
                  {g.items.map((item, i) => {
                    const isLast = i === g.items.length - 1;
                    return item.kind === "activity" ? (
                      <ActivityItem
                        key={`a-${item.activity.id}`}
                        activity={item.activity}
                        isLast={isLast}
                      />
                    ) : (
                      <ConversationItem
                        key={`c-${item.conversation.id}`}
                        conversation={item.conversation}
                        isLast={isLast}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
