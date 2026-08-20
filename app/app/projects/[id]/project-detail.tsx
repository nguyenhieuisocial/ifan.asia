"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Ban, Pencil, Plus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatDate, formatMoney } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import type { MemberOption } from "../../deals/types";
import { ownerLabel } from "../../contacts/types";
import { TaskEditDialog, type EditableTask } from "../../tasks/task-editor";
import {
  boViecChan,
  capNhatDuAn,
  doiTrangThaiViec,
  khaiViecChan,
  themViecDuAn,
} from "../actions";
import { DueLabel, ProgressBar } from "../projects-view";
import {
  BUDGET_ALERT_DONE_PERCENT,
  BUDGET_ALERT_SPENT_PERCENT,
  STUCK_TASK_DAYS,
  blockedBy,
  dayKeyVN,
  daysBetween,
  findBlockers,
  projectAlerts,
  projectProgress,
  taskOverdueDays,
  taskState,
  taskTitle,
  type ProjectCost,
  type ProjectRow,
  type ProjectStatus,
  type ProjectTask,
  type TaskBlockRow,
} from "../types";

type Props = {
  project: ProjectRow;
  tasks: ProjectTask[];
  tasksAtLimit: boolean;
  taskLimit: number;
  blocks: TaskBlockRow[];
  costs: ProjectCost[];
  costsAtLimit: boolean;
  costLimit: number;
  canSeeMoney: boolean;
  canManage: boolean;
  canWriteTasks: boolean;
  canAssignOthers: boolean;
  members: MemberOption[];
  currentUserId: string;
  memberNames: Record<string, string>;
  partialTaskScope: boolean;
  todayVN: string;
};

export function ProjectDetail(props: Props) {
  const {
    project,
    tasks,
    tasksAtLimit,
    taskLimit,
    blocks,
    costs,
    costsAtLimit,
    costLimit,
    canSeeMoney,
    canManage,
    canWriteTasks,
    partialTaskScope,
    todayVN,
  } = props;

  const t = useTranslations("projects");
  const locale = useLocale() as Locale;
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  // MỘT cửa sổ Sửa việc cho CẢ MÀN — dòng việc hiện ở hai khối (khối "đang chặn
  // việc khác" và danh sách việc), cả hai mở chung cửa sổ này. Và đây là ĐÚNG
  // cửa sổ của bảng Công việc, không phải bản thứ hai: việc dự án và việc hằng
  // ngày nằm chung một bảng dữ liệu, hai cửa sổ cho cùng một thao tác là để hai
  // màn nói khác nhau về cùng một chuyện.
  const [taskEditTarget, setTaskEditTarget] = useState<EditableTask | null>(null);

  const progress = useMemo(() => projectProgress(tasks), [tasks]);
  const blockers = useMemo(() => findBlockers(tasks, blocks), [tasks, blocks]);
  const waitingFor = useMemo(() => blockedBy(blocks, tasks), [blocks, tasks]);
  const spentVnd = canSeeMoney ? costs.reduce((sum, c) => sum + Number(c.amount_vnd), 0) : null;
  const alerts = useMemo(
    () => projectAlerts(tasks, progress, spentVnd, project.budget_vnd, todayVN),
    [tasks, progress, spentVnd, project.budget_vnd, todayVN],
  );

  // Ngày xong đã bị đẩy bao nhiêu ngày SO VỚI MỐC gần nhất. Mốc chỉ nhảy khi đã
  // báo (migration #168 mục 5) nên con số này là "độ trôi chưa được báo" —
  // KHÔNG phải "chậm so với kế hoạch gốc" (kho không lưu kế hoạch gốc).
  const driftDays =
    project.due_on && project.due_on_baseline
      ? daysBetween(project.due_on_baseline, project.due_on)
      : 0;

  // "Đáng nhìn ngay" = việc đang chặn · việc đang chờ · việc đang làm · việc trễ.
  // Phần còn lại nằm sau nút "Xem tất cả" — thẻ: màn này KHÔNG đổ 26 việc ra.
  const blockerIds = new Set(blockers.map((b) => b.task.id));
  const spotlight = tasks.filter(
    (task) =>
      blockerIds.has(task.id) ||
      waitingFor.has(task.id) ||
      taskState(task) === "doing" ||
      taskOverdueDays(task, todayVN) > 0,
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl space-y-4 p-4 sm:p-6">
          <Link
            href="/app/projects"
            className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            {t("detail.back")}
          </Link>

          {/* ---------- Đầu màn: tên + ngày xong tự tính ---------- */}
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-[17px] leading-snug font-semibold break-words">
                  {project.name}
                </h1>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {t(`statuses.${project.status}`)} ·{" "}
                  {t("detail.startedOn", { date: formatDate(project.started_on, locale) })} ·{" "}
                  <DueLabel dueOn={project.due_on} todayVN={todayVN} locale={locale} t={t} />
                </p>
              </div>
              {canManage && (
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setEditOpen(true)}
                >
                  <Pencil className="size-4" />
                  {t("detail.edit")}
                </Button>
              )}
            </div>

            {project.description && (
              <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
                {project.description}
              </p>
            )}

            {driftDays > 0 && (
              <p className="rounded-md bg-amber-100 px-2 py-1 text-[12px] font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                {t("detail.drift", { n: driftDays })}
              </p>
            )}

            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] text-muted-foreground">
                {t("list.progress", {
                  done: progress.done,
                  total: progress.total,
                  doing: progress.doing,
                })}
              </span>
              <span className="text-[17px] font-semibold">{progress.percent}%</span>
            </div>
            <ProgressBar percent={progress.percent} />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {t("detail.dueComputedNote")}
            </p>
          </div>

          {partialTaskScope && (
            <p className="rounded-md border border-dashed p-2.5 text-[12px] leading-relaxed text-muted-foreground">
              {t("partialScopeNote")}
            </p>
          )}

          {/* ---------- Cảnh báo: ĐÚNG HAI LOẠI (thẻ: báo ít thì còn được đọc) ---------- */}
          {(alerts.budgetAhead || alerts.stuckTasks.length > 0) && (
            <div className="space-y-2">
              {alerts.budgetAhead && (
                <AlertBox
                  text={t("detail.alertBudget", {
                    spent: BUDGET_ALERT_SPENT_PERCENT,
                    done: BUDGET_ALERT_DONE_PERCENT,
                  })}
                />
              )}
              {alerts.stuckTasks.length > 0 && (
                <AlertBox
                  text={t("detail.alertStuck", {
                    n: alerts.stuckTasks.length,
                    days: STUCK_TASK_DAYS,
                    title: taskTitle(alerts.stuckTasks[0]) ?? t("detail.noTitle"),
                  })}
                />
              )}
            </div>
          )}

          {/* ---------- Việc đang chặn — thứ duy nhất thẻ đòi hiện ---------- */}
          <section className="space-y-2">
            <h2 className="text-[14px] font-semibold">{t("detail.blockersTitle")}</h2>
            {blockers.length === 0 ? (
              <p className="rounded-md border border-dashed p-3 text-[12px] text-muted-foreground">
                {t("detail.blockersEmpty")}
              </p>
            ) : (
              <div className="space-y-2">
                {blockers.map((blocker) => (
                  <div
                    key={blocker.task.id}
                    className="space-y-1.5 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40"
                  >
                    <TaskLine
                      task={blocker.task}
                      todayVN={todayVN}
                      memberNames={props.memberNames}
                      currentUserId={props.currentUserId}
                    />
                    <p className="text-[12px] font-medium text-amber-900 dark:text-amber-200">
                      {t("detail.blocksCount", { n: blocker.blocked.length })}
                    </p>
                    <ul className="ml-4 list-disc space-y-0.5 text-[12px] text-muted-foreground">
                      {blocker.blocked.map((blocked) => (
                        <li key={blocked.id}>{taskTitle(blocked) ?? t("detail.noTitle")}</li>
                      ))}
                    </ul>
                    <TaskActions
                      task={blocker.task}
                      canWriteTasks={canWriteTasks}
                      waitingFor={waitingFor.get(blocker.task.id) ?? []}
                      onEdit={() => setTaskEditTarget(editableFrom(blocker.task))}
                    />
                    {canManage && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {blocks
                          .filter((b) => b.blocker_id === blocker.task.id)
                          .map((b) => (
                            <UnblockButton key={b.id} projectId={project.id} blockId={b.id} />
                          ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ---------- Việc đang làm / đang trễ / đang chờ ---------- */}
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[14px] font-semibold">
                {showAllTasks ? t("detail.allTasksTitle") : t("detail.spotlightTitle")}
              </h2>
              {tasks.length > 0 && (
                <button
                  type="button"
                  className="text-[12px] font-medium text-primary hover:underline"
                  onClick={() => setShowAllTasks((v) => !v)}
                >
                  {showAllTasks
                    ? t("detail.showSpotlight")
                    : t("detail.showAll", { n: tasks.length })}
                </button>
              )}
            </div>

            <TaskList
              tasks={showAllTasks ? tasks : spotlight}
              emptyText={tasks.length === 0 ? t("detail.tasksEmpty") : t("detail.spotlightEmpty")}
              todayVN={todayVN}
              waitingFor={waitingFor}
              canWriteTasks={canWriteTasks}
              memberNames={props.memberNames}
              currentUserId={props.currentUserId}
              onEditTask={(task) => setTaskEditTarget(editableFrom(task))}
            />

            {tasksAtLimit && (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {t("detail.taskLimitNote", { n: taskLimit })}
              </p>
            )}
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {t("detail.tasksLiveWithDailyNote")}
            </p>
          </section>

          {canWriteTasks && (
            <AddTaskForm
              projectId={project.id}
              members={props.members}
              canAssignOthers={props.canAssignOthers}
              currentUserId={props.currentUserId}
            />
          )}

          {canManage && tasks.length >= 2 && (
            <DeclareBlockForm projectId={project.id} tasks={tasks} />
          )}

          {/* ---------- Tiền: lấy thẳng từ sổ quỹ, không có bảng tính thứ hai ---------- */}
          {canSeeMoney && spentVnd !== null && (
            <section className="space-y-2">
              <h2 className="flex items-center gap-1.5 text-[14px] font-semibold">
                <Wallet className="size-4" />
                {t("detail.moneyTitle")}
              </h2>
              {costs.length === 0 ? (
                <p className="rounded-md border border-dashed p-3 text-[12px] text-muted-foreground">
                  {t("detail.moneyEmpty")}
                </p>
              ) : (
                <div className="divide-y rounded-md border">
                  {costs.map((cost) => (
                    <div key={cost.id} className="flex items-center justify-between gap-3 p-2.5">
                      <div className="min-w-0">
                        <div className="truncate text-[13px]">
                          {cost.note ?? t(`detail.costCategory.${cost.category}`)}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {formatDate(cost.created_at, locale)}
                        </div>
                      </div>
                      <div className="shrink-0 text-[13px] font-medium">
                        {formatMoney(cost.amount_vnd, locale)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-1 rounded-md border p-3 text-[13px]">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{t("detail.moneySpent")}</span>
                  <span className="font-semibold">{formatMoney(spentVnd, locale)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{t("detail.moneyBudget")}</span>
                  <span className="font-medium">
                    {project.budget_vnd > 0
                      ? formatMoney(project.budget_vnd, locale)
                      : t("detail.moneyNoBudget")}
                  </span>
                </div>
                {project.budget_vnd > 0 && (
                  <p className="pt-1 text-[12px] leading-relaxed text-muted-foreground">
                    {t("detail.moneyCompare", {
                      spentPercent: Math.round((spentVnd / project.budget_vnd) * 100),
                      donePercent: progress.percent,
                    })}
                  </p>
                )}
              </div>
              {costsAtLimit && (
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {t("detail.costLimitNote", { n: costLimit })}
                </p>
              )}
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {t("detail.moneySourceNote")}
              </p>
            </section>
          )}

          {!canSeeMoney && (
            <p className="rounded-md border border-dashed p-2.5 text-[12px] leading-relaxed text-muted-foreground">
              {t("detail.moneyHiddenNote")}
            </p>
          )}

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {t("detail.scopeNote")}
          </p>
        </div>
      </div>

      {canManage && (
        <EditProjectDialog project={project} open={editOpen} onOpenChange={setEditOpen} />
      )}

      {/* Cửa sổ Sửa việc dùng chung của cả màn. Không bọc trong `canWriteTasks`:
          chỉ có nút Sửa mới bị vai Chỉ xem giấu đi, còn cửa sổ thì không mở
          được nếu không ai bấm — bọc thêm một lớp điều kiện ở đây là dựng bản
          luật thứ hai cho cùng một chuyện. */}
      <TaskEditDialog
        task={taskEditTarget}
        members={props.members}
        canAssignOthers={props.canAssignOthers}
        onClose={() => setTaskEditTarget(null)}
      />
    </div>
  );
}

function AlertBox({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" />
      <p className="text-[12px] leading-relaxed text-amber-900 dark:text-amber-200">{text}</p>
    </div>
  );
}

function TaskLine({
  task,
  todayVN,
  memberNames,
  currentUserId,
}: {
  task: ProjectTask;
  todayVN: string;
  memberNames: Record<string, string>;
  currentUserId: string;
}) {
  const t = useTranslations("projects");
  const tContacts = useTranslations("contacts");
  const locale = useLocale() as Locale;
  const late = taskOverdueDays(task, todayVN);
  const state = taskState(task);

  return (
    <div className="space-y-0.5">
      <p
        className={cn(
          "text-[13px] leading-snug font-medium break-words",
          state === "done" && "text-muted-foreground line-through",
        )}
      >
        {taskTitle(task) ?? t("detail.noTitle")}
      </p>
      <p className="text-[11px] text-muted-foreground">
        {task.due_at
          ? t("detail.taskDue", { date: formatDate(dayKeyVN(task.due_at), locale) })
          : t("list.noDueDate")}
        {late > 0 && (
          <span className="ml-1 font-medium text-destructive">
            {t("detail.taskLate", { n: late })}
          </span>
        )}
        {" · "}
        {ownerLabel(task.owner_id, currentUserId, tContacts, memberNames)}
        {" · "}
        {t(`detail.state.${state}`)}
      </p>
    </div>
  );
}

/**
 * Nút đổi trạng thái. Việc đang bị chặn thì nút "Bắt đầu" hiện MỜ kèm lý do —
 * chứ không giấu đi: giấu nút thì người ta chỉ thấy việc mình không làm được
 * mà không biết vì sao. Chốt chặn thật vẫn ở trigger `activities_chan_bat_dau`.
 */
/**
 * Nút thao tác trên dòng việc.
 *
 * `max-md:min-h-11` = 44px trên điện thoại: hàng này là LỐI DUY NHẤT tới thao
 * tác trên dòng việc, mà mặc định `py-0.5` chỉ cao ~20px — dưới ngưỡng chạm đã
 * chốt ở `mobile-more-sheet.tsx`. Đặt cho MỌI nút trong hàng chứ không riêng
 * nút Sửa mới: một hàng nửa cao nửa thấp vừa xấu vừa biến nút thấp thành bẫy
 * chạm nhầm.
 */
const TASK_ACTION_BTN =
  "rounded border px-2 py-0.5 text-[11px] hover:bg-background/60 disabled:opacity-60 max-md:min-h-11 max-md:px-3";

function TaskActions({
  task,
  canWriteTasks,
  waitingFor,
  onEdit,
}: {
  task: ProjectTask;
  canWriteTasks: boolean;
  waitingFor: ProjectTask[];
  /** Mở cửa sổ Sửa việc — cùng cửa sổ với bảng Công việc, không phải bản thứ hai. */
  onEdit: () => void;
}) {
  const t = useTranslations("projects");
  // Chữ "Sửa việc" chép từ đúng namespace của cửa sổ nó mở ra — cùng thao tác
  // thì phải cùng một chữ ở mọi màn.
  const tTasks = useTranslations("tasksBoard");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (!canWriteTasks) return null;

  const state = taskState(task);
  // Một việc có thể bị NHIỀU việc chặn (luật một tầng chỉ cấm chuỗi lồng, không
  // cấm nhiều việc cùng chặn một việc) — nên có hai câu, không nhét số 0 vào một câu.
  const blockedReason =
    waitingFor.length === 0
      ? null
      : waitingFor.length === 1
        ? t("detail.waitingFor", { title: taskTitle(waitingFor[0]) ?? t("detail.noTitle") })
        : t("detail.waitingForMore", {
            title: taskTitle(waitingFor[0]) ?? t("detail.noTitle"),
            n: waitingFor.length - 1,
          });

  const run = (next: "todo" | "doing" | "done") =>
    startTransition(async () => {
      const res = await doiTrangThaiViec({ taskId: task.id, state: next });
      if (res.error) {
        toast.error(t(`errors.${res.error}`));
        return;
      }
      router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {state === "todo" &&
        (blockedReason ? (
          <span className="rounded border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground">
            {blockedReason}
          </span>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => run("doing")}
            className={TASK_ACTION_BTN}
          >
            {t("detail.actionStart")}
          </button>
        ))}
      {state !== "done" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run("done")}
          className={TASK_ACTION_BTN}
        >
          {t("detail.actionDone")}
        </button>
      )}
      {/* Nút Sửa đứng CẠNH nút trạng thái, không thay nó — và mở ĐÚNG cửa sổ
          Sửa việc đã có. Trước đợt này, tên người chịu trách nhiệm ở màn Dự án
          chỉ để đọc: giao nhầm người thì lối duy nhất là xoá việc rồi tạo lại,
          mà xoá là mất hẳn ghi chú, mốc bắt đầu và mối nối với dự án.
          Dùng nút bút chì chứ không nhét vào menu ba chấm: dòng việc ở đây chỉ
          có HAI thao tác (đổi trạng thái, sửa) — gói hai thứ vào một menu là
          bắt bấm hai lần cho một việc. `canWriteTasks` đã chặn vai Chỉ xem ở
          đầu hàm, nên vai đó không thấy nút này. */}
      <button
        type="button"
        onClick={onEdit}
        className={cn(TASK_ACTION_BTN, "inline-flex items-center gap-1")}
      >
        <Pencil className="size-3" />
        {tTasks("card.edit")}
      </button>
      {state === "done" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run("doing")}
          className={TASK_ACTION_BTN}
        >
          {t("detail.actionReopen")}
        </button>
      )}
    </div>
  );
}

function UnblockButton({ projectId, blockId }: { projectId: string; blockId: string }) {
  const t = useTranslations("projects");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await boViecChan({ projectId, blockId });
          if (res.error) {
            toast.error(t(`errors.${res.error}`));
            return;
          }
          toast.success(t("toasts.unblocked"));
          router.refresh();
        })
      }
      className="flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] hover:bg-background/60 disabled:opacity-60"
    >
      <Ban className="size-3" />
      {t("detail.actionUnblock")}
    </button>
  );
}

function TaskList({
  tasks,
  emptyText,
  todayVN,
  waitingFor,
  canWriteTasks,
  memberNames,
  currentUserId,
  onEditTask,
}: {
  tasks: ProjectTask[];
  emptyText: string;
  todayVN: string;
  waitingFor: Map<string, ProjectTask[]>;
  canWriteTasks: boolean;
  memberNames: Record<string, string>;
  currentUserId: string;
  /** Mở cửa sổ Sửa việc dùng chung của cả màn. */
  onEditTask: (task: ProjectTask) => void;
}) {
  if (tasks.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-3 text-[12px] text-muted-foreground">
        {emptyText}
      </p>
    );
  }
  return (
    <div className="divide-y rounded-md border">
      {tasks.map((task) => (
        <div key={task.id} className="space-y-1.5 p-2.5">
          <TaskLine
            task={task}
            todayVN={todayVN}
            memberNames={memberNames}
            currentUserId={currentUserId}
          />
          <TaskActions
            task={task}
            canWriteTasks={canWriteTasks}
            waitingFor={waitingFor.get(task.id) ?? []}
            onEdit={() => onEditTask(task)}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * Dòng việc dự án → dữ liệu cho cửa sổ Sửa. Truyền NGUYÊN hai cột tiêu đề/ghi
 * chú (chúng là hai thứ khác nhau) — trộn thành một chuỗi ở đây thì lúc lưu
 * lại cột không được hiện sẽ bị xoá trắng.
 */
function editableFrom(task: ProjectTask): EditableTask {
  return {
    id: task.id,
    subject: task.subject,
    body: task.body,
    dueAt: task.due_at,
    ownerId: task.owner_id,
  };
}

function AddTaskForm({
  projectId,
  members,
  canAssignOthers,
  currentUserId,
}: {
  projectId: string;
  members: MemberOption[];
  canAssignOthers: boolean;
  currentUserId: string;
}) {
  const t = useTranslations("projects");
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [ownerId, setOwnerId] = useState(currentUserId);
  const [dueOn, setDueOn] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = () => {
    const trimmed = subject.trim();
    if (!trimmed) {
      toast.error(t("errors.subjectRequired"));
      return;
    }
    startTransition(async () => {
      const res = await themViecDuAn({
        projectId,
        subject: trimmed,
        ownerId: canAssignOthers ? ownerId : currentUserId,
        dueOn: dueOn || null,
      });
      if (res.error) {
        toast.error(t(`errors.${res.error}`));
        return;
      }
      toast.success(t("toasts.taskAdded"));
      setSubject("");
      setDueOn("");
      router.refresh();
    });
  };

  return (
    <section className="space-y-2 rounded-md border p-3">
      <h2 className="text-[14px] font-semibold">{t("detail.addTaskTitle")}</h2>
      <div className="space-y-2">
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={t("detail.addTaskPlaceholder")}
          maxLength={200}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex-1 space-y-1">
            <Label className="text-[12px]">{t("detail.addTaskOwner")}</Label>
            <Select
              value={canAssignOthers ? ownerId : currentUserId}
              disabled={!canAssignOthers}
              onChange={(e) => setOwnerId(e.target.value)}
            >
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex-1 space-y-1">
            <Label className="text-[12px]">{t("detail.addTaskDue")}</Label>
            <Input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
          </div>
        </div>
        {!canAssignOthers && (
          <p className="text-[11px] text-muted-foreground">{t("detail.addTaskOwnerLocked")}</p>
        )}
        <Button size="sm" onClick={submit} disabled={pending}>
          <Plus className="size-4" />
          {pending ? t("form.saving") : t("detail.addTaskSubmit")}
        </Button>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {t("detail.addTaskOneOwnerNote")}
        </p>
      </div>
    </section>
  );
}

/** Khai "việc A phải xong trước việc B". Một tầng — luật ở CSDL, không ở đây. */
function DeclareBlockForm({ projectId, tasks }: { projectId: string; tasks: ProjectTask[] }) {
  const t = useTranslations("projects");
  const router = useRouter();
  const [blockerId, setBlockerId] = useState(tasks[0]?.id ?? "");
  const [blockedId, setBlockedId] = useState(tasks[1]?.id ?? "");
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      const res = await khaiViecChan({ projectId, blockerId, blockedId });
      if (res.error) {
        toast.error(t(`errors.${res.error}`));
        return;
      }
      toast.success(t("toasts.blockAdded"));
      router.refresh();
    });

  return (
    <section className="space-y-2 rounded-md border p-3">
      <h2 className="text-[14px] font-semibold">{t("detail.blockFormTitle")}</h2>
      <div className="space-y-2">
        <div className="space-y-1">
          <Label className="text-[12px]">{t("detail.blockFormBlocker")}</Label>
          <Select value={blockerId} onChange={(e) => setBlockerId(e.target.value)}>
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {taskTitle(task) ?? t("detail.noTitle")}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[12px]">{t("detail.blockFormBlocked")}</Label>
          <Select value={blockedId} onChange={(e) => setBlockedId(e.target.value)}>
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {taskTitle(task) ?? t("detail.noTitle")}
              </option>
            ))}
          </Select>
        </div>
        <Button size="sm" variant="outline" onClick={submit} disabled={pending}>
          {pending ? t("form.saving") : t("detail.blockFormSubmit")}
        </Button>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {t("detail.blockFormOneLevelNote")}
        </p>
      </div>
    </section>
  );
}

function EditProjectDialog({
  project,
  open,
  onOpenChange,
}: {
  project: ProjectRow;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const t = useTranslations("projects");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("detail.editTitle")}</DialogTitle>
          <DialogDescription>{t("form.dueHint")}</DialogDescription>
        </DialogHeader>
        {/* Radix Dialog UNMOUNT nội dung khi đóng (không `forceMount`) — nên state
            phải nằm trong component con BÊN TRONG `DialogContent`: mỗi lần mở là
            một lần mount mới, ô nào cũng hiện lại đúng giá trị đang lưu, không
            cần effect (khuôn `DealFormDialog` / `AppointmentDialog`).

            Để state ở component NGOÀI thì nó không bao giờ unmount — hộp này được
            cha gắn sẵn từ lúc tải trang (`{canManage && <EditProjectDialog …/>}`),
            chỉ ẩn/hiện. Hậu quả: bấm Sửa → gõ ngày bắt đầu khác → bấm Huỷ → mở
            lại VẪN thấy ngày vừa gõ (màn hình phía sau thì hiện ngày thật, hai
            chỗ nói hai đằng), rồi chỉ cần sửa mỗi cái tên và bấm Lưu là ngày bắt
            đầu bị ghi đè lặng lẽ — vì `capNhatDuAn` gửi TẤT CẢ các ô, không chỉ
            ô vừa đổi. */}
        <EditProjectForm project={project} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function EditProjectForm({ project, onDone }: { project: ProjectRow; onDone: () => void }) {
  const t = useTranslations("projects");
  const router = useRouter();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [budget, setBudget] = useState(String(project.budget_vnd));
  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const [startedOn, setStartedOn] = useState(project.started_on);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t("errors.nameRequired"));
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startedOn)) {
      toast.error(t("errors.startedOnInvalid"));
      return;
    }
    const budgetNumber = Number(budget.replace(/[^\d]/g, "") || "0");
    startTransition(async () => {
      const res = await capNhatDuAn({
        id: project.id,
        name: trimmed,
        description: description.trim() || null,
        budgetVnd: Math.round(budgetNumber),
        status,
        startedOn,
      });
      if (res.error) {
        toast.error(t(`errors.${res.error}`));
        return;
      }
      toast.success(t("toasts.saved"));
      onDone();
      router.refresh();
    });
  };

  return (
    <>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="edit-project-name">{t("form.name")}</Label>
          <Input
            id="edit-project-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={160}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-project-desc">{t("form.note")}</Label>
          <Textarea
            id="edit-project-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            rows={3}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-project-started">{t("form.startedOn")}</Label>
          <Input
            id="edit-project-started"
            type="date"
            value={startedOn}
            onChange={(e) => setStartedOn(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-project-budget">{t("form.budget")}</Label>
          <Input
            id="edit-project-budget"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            inputMode="numeric"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-project-status">{t("form.status")}</Label>
          <Select
            id="edit-project-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as ProjectStatus)}
          >
            <option value="active">{t("statuses.active")}</option>
            <option value="done">{t("statuses.done")}</option>
            <option value="cancelled">{t("statuses.cancelled")}</option>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onDone} disabled={pending}>
          {t("form.cancel")}
        </Button>
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? t("form.saving") : t("form.save")}
        </Button>
      </DialogFooter>
    </>
  );
}
