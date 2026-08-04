"use client";

import { useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  CalendarClock,
  History,
  MoveRight,
  PhoneCall,
  SquareCheckBig,
  StickyNote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatVN } from "@/lib/datetime";
import { dayLabel, formatDateTime } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import type { ActivityRow, ActivityType } from "../../contacts/types";
import { addDealActivity, toggleDealActivityDone } from "../actions";
import type { StageHistoryRow } from "../types";

/** Loại ghi nhanh soạn được từ màn cơ hội (cuộc hẹn: đợt sau, như hồ sơ khách). */
type ComposerType = Extract<ActivityType, "note" | "call" | "task">;

const ACTIVITY_ICONS: Record<ActivityType, typeof StickyNote> = {
  note: StickyNote,
  call: PhoneCall,
  meeting: CalendarClock,
  task: SquareCheckBig,
};

const COMPOSER_TABS: { type: ComposerType; icon: typeof StickyNote }[] = [
  { type: "note", icon: StickyNote },
  { type: "call", icon: PhoneCall },
  { type: "task", icon: SquareCheckBig },
];

type Item =
  | { kind: "activity"; at: string; activity: ActivityRow }
  | { kind: "stage"; at: string; stage: StageHistoryRow };

/** Trộn hoạt động + lần đổi bước theo thời gian giảm dần (mẫu dòng thời gian hồ sơ khách). */
function merge(activities: ActivityRow[], history: StageHistoryRow[]): Item[] {
  return [
    ...activities.map((a) => ({ kind: "activity" as const, at: a.created_at, activity: a })),
    ...history.map((h) => ({ kind: "stage" as const, at: h.entered_at, stage: h })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));
}

/** Node 28px + kẻ dọc nối xuống item kế — giữ đúng nhịp của dòng thời gian hồ sơ khách. */
function Node({
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
        <span aria-hidden className="absolute top-8 bottom-0 left-3.5 w-px bg-border" />
      )}
      <div
        className={cn(
          "z-10 flex size-7 shrink-0 items-center justify-center rounded-full",
          highlight ? "bg-primary-tint" : "bg-muted",
        )}
      >
        <Icon
          className={cn("size-3.5", highlight ? "text-primary" : "text-muted-foreground")}
        />
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function ActivityItem({
  activity,
  isLast,
  now,
}: {
  activity: ActivityRow;
  isLast: boolean;
  now: number;
}) {
  const t = useTranslations("deals.timeline");
  const tActivity = useTranslations("contacts.activity");
  const locale = useLocale() as Locale;
  const [pending, startTransition] = useTransition();
  const done = activity.done_at !== null;
  const overdue =
    activity.type === "task" &&
    !done &&
    activity.due_at !== null &&
    new Date(activity.due_at).getTime() < now;

  const toggle = () =>
    startTransition(async () => {
      const res = await toggleDealActivityDone(activity.id, !done);
      if (res.error) toast.error(res.error);
    });

  return (
    <Node icon={ACTIVITY_ICONS[activity.type]} isLast={isLast}>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-sm font-medium">{tActivity(activity.type)}</span>
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
            aria-label={done ? t("markUndone") : t("markDone")}
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
                  overdue ? "font-medium text-destructive" : "text-muted-foreground",
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
    </Node>
  );
}

function StageItem({
  stage,
  stageNames,
  isLast,
}: {
  stage: StageHistoryRow;
  stageNames: Record<string, string>;
  isLast: boolean;
}) {
  const t = useTranslations("deals.timeline");
  const to = stageNames[stage.to_stage_id] ?? t("unknownStage");
  const from = stage.from_stage_id ? stageNames[stage.from_stage_id] : null;
  return (
    <Node icon={MoveRight} highlight isLast={isLast}>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-sm font-medium">
          {from ? t("movedStage", { from, to }) : t("startedStage", { to })}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatVN(stage.entered_at, "HH:mm")}
        </span>
      </p>
    </Node>
  );
}

type Props = {
  dealId: string;
  activities: ActivityRow[];
  history: StageHistoryRow[];
  stageNames: Record<string, string>;
  /** Mốc "bây giờ" tính ở server — client dựng lại y hệt, không lệch khi hydrate. */
  now: number;
};

export function DealTimeline({ dealId, activities, history, stageNames, now }: Props) {
  const t = useTranslations("deals.timeline");
  const tActivity = useTranslations("contacts.activity");
  const tCommon = useTranslations("common");
  const tTime = useTranslations("time");
  const locale = useLocale() as Locale;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [type, setType] = useState<ComposerType>("note");
  const [content, setContent] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [pending, startTransition] = useTransition();

  const items = merge(activities, history);
  const groups: { key: string; label: string; items: Item[] }[] = [];
  for (const item of items) {
    const key = formatVN(item.at, "yyyy-MM-dd");
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, label: dayLabel(item.at, locale, tTime), items: [item] });
  }

  const canSubmit =
    content.trim() !== "" && (type !== "task" || dueAt !== "") && !pending;

  const submit = () => {
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await addDealActivity(dealId, {
        type,
        content: content.trim(),
        // datetime-local trả giờ địa phương → chuyển ISO trước khi gửi
        dueAt: type === "task" && dueAt ? new Date(dueAt).toISOString() : undefined,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t("saved"));
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
            <textarea
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
              className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
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
          <p className="py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="space-y-5">
            {groups.map((g) => (
              <div key={g.key}>
                <p className="mb-3 text-xs font-medium text-muted-foreground">{g.label}</p>
                <div>
                  {g.items.map((item, i) => {
                    const isLast = i === g.items.length - 1;
                    return item.kind === "activity" ? (
                      <ActivityItem
                        key={`a-${item.activity.id}`}
                        activity={item.activity}
                        isLast={isLast}
                        now={now}
                      />
                    ) : (
                      <StageItem
                        key={`s-${item.stage.id}`}
                        stage={item.stage}
                        stageNames={stageNames}
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
