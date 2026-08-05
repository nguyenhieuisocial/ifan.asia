"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatVN } from "@/lib/datetime";
import { dayLabel, formatDateTime } from "@/lib/format";
import type { Locale, Translator } from "@/i18n/config";
import { CHANNEL_LABELS } from "@/app/app/inbox/types";
import { addActivity, toggleActivityDone } from "../actions";
import type {
  ActivityRow,
  ActivityType,
  ConversationLite,
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

/** Nhãn tab dịch qua messages `contacts.activity.*`. */
const COMPOSER_TABS: { type: ComposerType; icon: typeof StickyNote }[] = [
  { type: "note", icon: StickyNote },
  { type: "call", icon: PhoneCall },
  { type: "task", icon: SquareCheckBig },
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

/** Nhóm item theo ngày VN, giữ thứ tự giảm dần — nhãn "Hôm nay"/"Hôm qua"/dd/MM/yyyy. `tTime` = namespace "time". */
function groupByDay(items: TimelineItem[], locale: Locale, tTime: Translator) {
  const groups: { key: string; label: string; items: TimelineItem[] }[] = [];
  for (const item of items) {
    const key = formatVN(item.at, "yyyy-MM-dd");
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(item);
    } else {
      groups.push({ key, label: dayLabel(item.at, locale, tTime), items: [item] });
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
  const t = useTranslations("contacts.timeline");
  const tActivity = useTranslations("contacts.activity");
  const locale = useLocale() as Locale;
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
          {tActivity(activity.type)}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatVN(activity.created_at, "HH:mm")}
        </span>
      </p>
      {activity.type === "task" ? (
        <div className="mt-1 flex items-start gap-2">
          <Checkbox
            checked={done}
            onChange={toggle}
            disabled={pending}
            aria-label={done ? t("markUndone") : t("markDone")}
            className="mt-0.5"
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
                {t("dueAt", { date: formatDateTime(activity.due_at, locale) })}
                {overdue && ` — ${t("overdue")}`}
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
  const t = useTranslations("contacts.timeline");
  const channelLabel = conversation.channels
    ? (CHANNEL_LABELS[conversation.channels.type] ?? conversation.channels.type)
    : t("conversationFallback");
  return (
    <TimelineNode icon={MessagesSquare} highlight isLast={isLast}>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-sm font-medium">
          {t("conversationTitle", { channel: channelLabel })}
        </span>
        {conversation.last_message_at && (
          <span className="text-xs text-muted-foreground">
            {formatVN(conversation.last_message_at, "HH:mm")}
          </span>
        )}
      </p>
      <p className="mt-1 text-[13px] text-muted-foreground">
        {conversation.channels?.display_name ?? channelLabel}
        {conversation.status === "closed" && ` · ${t("closed")}`}
      </p>
      <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs">
        <Link href={`/app/inbox?c=${conversation.id}`}>
          {t("openConversation")}
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
  const t = useTranslations("contacts.timeline");
  const tActivity = useTranslations("contacts.activity");
  const tToasts = useTranslations("contacts.toasts");
  const tCommon = useTranslations("common");
  const tTime = useTranslations("time");
  const locale = useLocale() as Locale;
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

  const groups = groupByDay(mergeTimeline(activities, conversations), locale, tTime);
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
      toast.success(tToasts("activityLogged"));
      setContent("");
      setDueAt("");
    });
  };

  return (
    <Card className="gap-3 self-start py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <History className="size-4 text-muted-foreground" />
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-4">
        <div className="rounded-lg border p-3">
          <div className="mb-2 flex flex-wrap gap-1">
            {COMPOSER_TABS.map(({ type: tabType, icon: Icon }) => (
              <Button
                key={tabType}
                type="button"
                size="sm"
                variant={type === tabType ? "secondary" : "ghost"}
                onClick={() => setType(tabType)}
              >
                <Icon className="size-3.5" />
                {tActivity(tabType)}
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
            <Textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={2}
              placeholder={
                type === "note"
                  ? t("notePlaceholder")
                  : type === "call"
                    ? t("callPlaceholder")
                    : t("taskPlaceholder")
              }
              className="resize-none"
            />
            <div className="flex flex-wrap items-center gap-2">
              {type === "task" && (
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {t("dueLabel")}
                  <input
                    type="datetime-local"
                    value={dueAt}
                    onChange={(e) => setDueAt(e.target.value)}
                    className="h-8 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                  />
                </label>
              )}
              <Button type="submit" size="sm" className="ml-auto" disabled={!canSubmit}>
                {tCommon("save")}
              </Button>
            </div>
          </form>
        </div>

        {groups.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("empty")}
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
