"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CalendarClock, CheckCircle2, MoreHorizontal } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TileChart } from "@/components/illustrations/tile-chart";
import { cn } from "@/lib/utils";
import { formatVN } from "@/lib/datetime";
import { ownerLabel } from "../contacts/types";
import { moveTask, type TaskTarget } from "./actions";
import { TASK_COLUMNS, taskColumn, taskTitle, type MemberNames, type TaskColumn, type TaskRow } from "./types";

/** Cột nào nhận được thả — "overdue" cố ý KHÔNG có: không ai kéo việc vào để
 *  CỐ TÌNH biến nó thành trễ hạn, cột đó chỉ tính tự động từ due_at đã qua. */
const DROP_TARGETS: Partial<Record<TaskColumn, TaskTarget>> = {
  today: "today",
  upcoming: "upcoming",
  done: "done",
};

type Props = {
  currentUserId: string;
  memberNames: MemberNames;
  tasks: TaskRow[];
  /** Ngày hôm nay giờ VN "yyyy-MM-dd", tính ở server (page.tsx) — dùng để xếp cột. */
  todayVN: string;
};

export function TasksBoard({ currentUserId, memberNames, tasks: initialTasks, todayVN }: Props) {
  const t = useTranslations("tasksBoard");
  const tContacts = useTranslations("contacts");

  // Nguồn sự thật khi kéo-thả = state cục bộ (optimistic), cùng mẫu deals-board.tsx —
  // server revalidate xong thì đồng bộ lại NGAY TRONG RENDER (adjusting state on prop change).
  const [tasks, setTasks] = useState(initialTasks);
  const [syncedFrom, setSyncedFrom] = useState(initialTasks);
  if (syncedFrom !== initialTasks) {
    setSyncedFrom(initialTasks);
    setTasks(initialTasks);
  }

  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<TaskColumn | null>(null);
  const [pending, startTransition] = useTransition();

  const byColumn = (col: TaskColumn) => tasks.filter((task) => taskColumn(task, todayVN) === col);

  const runMove = (task: TaskRow, target: TaskTarget) => {
    const snapshot = tasks;
    // Cập nhật lạc quan: đủ để thẻ nhảy đúng cột ngay, server lỗi thì hoàn lại.
    setTasks((rows) =>
      rows.map((r) =>
        r.id === task.id
          ? target === "done"
            ? { ...r, done_at: new Date().toISOString() }
            : { ...r, done_at: null, due_at: new Date().toISOString() } // cột thật do server tính lại khi revalidate
          : r,
      ),
    );
    startTransition(async () => {
      const res = await moveTask(task.id, target);
      if (res.error) {
        setTasks(snapshot);
        toast.error(res.error);
      }
    });
  };

  const handleDrop = (col: TaskColumn, droppedId: string) => {
    setOverCol(null);
    const target = DROP_TARGETS[col];
    setDragId(null);
    if (!target) return;
    const task = tasks.find((r) => r.id === (droppedId || dragId));
    if (task) runMove(task, target);
  };

  const hasAnyTask = tasks.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-1 border-b p-3">
        <h1 className="text-sm font-semibold">{t("title")}</h1>
        <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
      </div>

      {!hasAnyTask ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-12 text-center">
          <TileChart className="size-16" />
          <h2 className="text-base font-semibold">{t("empty.title")}</h2>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            {t("empty.description")}
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-x-auto">
          <div className="flex h-full gap-3 p-3">
            {TASK_COLUMNS.map((col) => {
              const colTasks = byColumn(col);
              const target = DROP_TARGETS[col];
              return (
                <section
                  key={col}
                  onDragOver={
                    target
                      ? (e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          if (overCol !== col) setOverCol(col);
                        }
                      : undefined
                  }
                  onDragLeave={target ? () => setOverCol((cur) => (cur === col ? null : cur)) : undefined}
                  onDrop={
                    target
                      ? (e) => {
                          e.preventDefault();
                          handleDrop(col, e.dataTransfer.getData("text/plain"));
                        }
                      : undefined
                  }
                  className={cn(
                    "flex w-[280px] shrink-0 flex-col rounded-lg border bg-muted/30 transition-colors",
                    overCol === col && "border-primary bg-primary-tint",
                  )}
                >
                  <header className="shrink-0 space-y-0.5 border-b px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-[13px] font-semibold",
                          col === "overdue" && colTasks.length > 0 && "text-destructive",
                        )}
                      >
                        {t(`col.${col}`)}
                      </span>
                      <span className="shrink-0 rounded-full bg-background px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        {colTasks.length}
                      </span>
                    </div>
                    {col === "done" && (
                      <p className="text-[11px] text-muted-foreground">{t("col.doneWindow")}</p>
                    )}
                  </header>
                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                    {colTasks.length === 0 ? (
                      <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                        {t("col.empty")}
                      </p>
                    ) : (
                      colTasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          currentColumn={col}
                          currentUserId={currentUserId}
                          memberNames={memberNames}
                          dragging={dragId === task.id}
                          pending={pending}
                          onDragStart={(id) => setDragId(id)}
                          onDragEnd={() => {
                            setDragId(null);
                            setOverCol(null);
                          }}
                          onMove={(target) => runMove(task, target)}
                          t={t}
                          tContacts={tContacts}
                        />
                      ))
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const TARGET_LABEL_KEY: Record<TaskTarget, string> = {
  today: "col.today",
  upcoming: "col.upcoming",
  done: "col.done",
};

function TaskCard({
  task,
  currentColumn,
  currentUserId,
  memberNames,
  dragging,
  pending,
  onDragStart,
  onDragEnd,
  onMove,
  t,
  tContacts,
}: {
  task: TaskRow;
  currentColumn: TaskColumn;
  currentUserId: string;
  memberNames: MemberNames;
  dragging: boolean;
  pending: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onMove: (target: TaskTarget) => void;
  t: ReturnType<typeof useTranslations<"tasksBoard">>;
  tContacts: ReturnType<typeof useTranslations<"contacts">>;
}) {
  const title = taskTitle(task) ?? t("card.noTitle");
  const owner = ownerLabel(task.owner_id, currentUserId, tContacts, memberNames);
  const overdue = currentColumn === "overdue";
  const recordHref = task.contact_id
    ? `/app/contacts/${task.contact_id}`
    : task.deal_id
      ? `/app/deals/${task.deal_id}`
      : null;
  const recordLabel = task.contacts?.full_name ?? task.deals?.title ?? null;

  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(task.id);
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "cursor-grab space-y-2 rounded-lg border bg-card p-2.5 transition-colors active:cursor-grabbing",
        dragging && "opacity-50",
      )}
    >
      <div className="flex items-start gap-1.5">
        <p className="min-w-0 flex-1 text-[13px] leading-snug font-medium break-words whitespace-pre-wrap">
          {title}
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label={t("card.menuAria")}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{t("card.moveTo")}</DropdownMenuLabel>
            {(Object.keys(TARGET_LABEL_KEY) as TaskTarget[])
              .filter((target) => target !== currentColumn)
              .map((target) => (
                <DropdownMenuItem key={target} disabled={pending} onSelect={() => onMove(target)}>
                  {target === "done" && <CheckCircle2 className="size-4" />}
                  {t(TARGET_LABEL_KEY[target])}
                </DropdownMenuItem>
              ))}
            {recordHref && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href={recordHref}>{task.contact_id ? t("card.openContact") : t("card.openDeal")}</Link>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {recordHref && recordLabel && (
        <Link
          href={recordHref}
          prefetch={false}
          draggable={false}
          className="block truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          {recordLabel}
        </Link>
      )}

      <div className="flex items-center justify-between gap-2">
        {task.due_at ? (
          <span
            className={cn(
              "flex items-center gap-1 text-xs",
              overdue ? "font-medium text-destructive" : "text-muted-foreground",
            )}
          >
            <CalendarClock className="size-3" />
            {formatVN(task.due_at, "dd/MM HH:mm")}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">{t("card.noDueDate")}</span>
        )}
        <Avatar className="size-5" title={owner}>
          <AvatarFallback className="text-[10px]">{(owner[0] ?? "?").toUpperCase()}</AvatarFallback>
        </Avatar>
      </div>
    </article>
  );
}
