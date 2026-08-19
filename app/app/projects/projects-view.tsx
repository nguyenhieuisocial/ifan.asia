"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { FolderKanban, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate, formatMoney } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { taoDuAn } from "./actions";
import { daysBetween, type ProjectProgress, type ProjectRow, type ProjectStatus } from "./types";

export type ProjectSummary = {
  project: ProjectRow;
  progress: ProjectProgress;
  /** null = vai này không đọc được sổ quỹ, KHÁC hẳn "chưa tiêu đồng nào". */
  spentVnd: number | null;
};

const STATUS_BADGE: Record<ProjectStatus, string> = {
  active: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  done: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  cancelled: "bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300",
};

export function ProjectsView({
  summaries,
  canManage,
  todayVN,
  projectsAtLimit,
  projectLimit,
  tasksAtLimit,
  taskScanLimit,
  partialTaskScope,
}: {
  summaries: ProjectSummary[];
  canManage: boolean;
  todayVN: string;
  projectsAtLimit: boolean;
  projectLimit: number;
  tasksAtLimit: boolean;
  taskScanLimit: number;
  partialTaskScope: boolean;
}) {
  const t = useTranslations("projects");
  const locale = useLocale() as Locale;
  const [formOpen, setFormOpen] = useState(false);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl space-y-4 p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold">{t("title")}</h1>
              <p className="mt-1 text-[13px] text-muted-foreground">{t("subtitle")}</p>
            </div>
            {canManage && (
              <Button size="sm" className="shrink-0" onClick={() => setFormOpen(true)}>
                <Plus className="size-4" />
                {t("addNew")}
              </Button>
            )}
          </div>

          {partialTaskScope && (
            <p className="rounded-md border border-dashed p-2.5 text-[12px] leading-relaxed text-muted-foreground">
              {t("partialScopeNote")}
            </p>
          )}

          {summaries.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-md border border-dashed p-8 text-center">
              <FolderKanban className="size-8 text-muted-foreground/50" />
              <p className="text-[14px] font-medium">{t("empty.title")}</p>
              <p className="max-w-xs text-[12px] text-muted-foreground">{t("empty.description")}</p>
            </div>
          ) : (
            <div className="divide-y rounded-md border">
              {summaries.map(({ project, progress, spentVnd }) => (
                <Link
                  key={project.id}
                  href={`/app/projects/${project.id}`}
                  className="block p-3 hover:bg-muted/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[14px] font-medium">{project.name}</span>
                        <span
                          className={cn(
                            "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                            STATUS_BADGE[project.status],
                          )}
                        >
                          {t(`statuses.${project.status}`)}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        <DueLabel dueOn={project.due_on} todayVN={todayVN} locale={locale} t={t} />
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-[11px] text-muted-foreground">
                      {spentVnd !== null && (
                        <div className="text-[13px] font-medium text-foreground">
                          {project.budget_vnd > 0
                            ? t("list.spentOfBudget", {
                                spent: formatMoney(spentVnd, locale),
                                budget: formatMoney(project.budget_vnd, locale),
                              })
                            : t("list.spentOnly", { spent: formatMoney(spentVnd, locale) })}
                        </div>
                      )}
                      <div className="mt-0.5">
                        {t("list.progress", {
                          done: progress.done,
                          total: progress.total,
                          doing: progress.doing,
                        })}
                      </div>
                    </div>
                  </div>
                  <ProgressBar percent={progress.percent} />
                </Link>
              ))}
            </div>
          )}

          {projectsAtLimit && (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {t("limitNote", { n: projectLimit })}
            </p>
          )}
          {tasksAtLimit && (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {t("taskScanLimitNote", { n: taskScanLimit })}
            </p>
          )}
        </div>
      </div>

      {canManage && <ProjectFormDialog open={formOpen} onOpenChange={setFormOpen} />}
    </div>
  );
}

export function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary transition-[width]"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}

/**
 * Nhãn ngày xong. `due_on` là KẾT LUẬN CỦA MÁY (hạn việc trễ nhất) — dự án chưa
 * có việc nào có hạn thì nói thẳng "chưa có ngày xong", KHÔNG hiện ngày hôm nay
 * cho đỡ trống: hai chuyện đó khác hẳn nhau.
 */
export function DueLabel({
  dueOn,
  todayVN,
  locale,
  t,
}: {
  dueOn: string | null;
  todayVN: string;
  locale: Locale;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  if (!dueOn) return <>{t("list.noDueDate")}</>;
  const left = daysBetween(todayVN, dueOn);
  return (
    <>
      {t("list.dueOn", { date: formatDate(dueOn, locale) })}
      {" · "}
      {left >= 0 ? (
        t("list.daysLeft", { n: left })
      ) : (
        <span className="font-medium text-destructive">{t("list.daysOver", { n: -left })}</span>
      )}
    </>
  );
}

function ProjectFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const t = useTranslations("projects");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("form.title")}</DialogTitle>
          <DialogDescription>{t("form.description")}</DialogDescription>
        </DialogHeader>
        {/* State nằm trong component con BÊN TRONG `DialogContent` — Radix unmount
            chỗ này khi đóng, nên mỗi lần mở là một tờ giấy trắng, không cần dọn
            tay (khuôn `DealFormDialog` / `AppointmentDialog`). Trước đây state ở
            component ngoài nên bấm Huỷ xong mở lại vẫn còn nguyên chữ đã gõ —
            người dùng tưởng đã bỏ, hoá ra vẫn nằm đó chờ bấm Lưu. */}
        <ProjectForm onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ProjectForm({ onDone }: { onDone: () => void }) {
  const t = useTranslations("projects");
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t("errors.nameRequired"));
      return;
    }
    const budgetNumber = Number(budget.replace(/[^\d]/g, "") || "0");
    if (!Number.isFinite(budgetNumber) || budgetNumber < 0) {
      toast.error(t("errors.budgetInvalid"));
      return;
    }
    startTransition(async () => {
      const res = await taoDuAn({
        name: trimmed,
        description: description.trim() || null,
        budgetVnd: Math.round(budgetNumber),
        // +7 tiếng TRƯỚC khi cắt chuỗi (khuôn của `app/app/team/punch-panel.tsx`):
        // `toISOString()` trả giờ UTC nên dự án mở lúc 1 giờ sáng bị ghi lùi
        // một ngày — mà `types.ts` lấy chính ngày này để tính trễ hạn.
        startedOn: new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10),
      });
      if (res.error) {
        toast.error(t(`errors.${res.error}`));
        return;
      }
      toast.success(t("toasts.created"));
      onDone();
      if (res.projectId) router.push(`/app/projects/${res.projectId}`);
      else router.refresh();
    });
  };

  return (
    <>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="project-name">{t("form.name")}</Label>
          <Input
            id="project-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={160}
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="project-desc">{t("form.note")}</Label>
          <Textarea
            id="project-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            rows={3}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="project-budget">{t("form.budget")}</Label>
          <Input
            id="project-budget"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            inputMode="numeric"
            placeholder="0"
          />
          <p className="text-[11px] text-muted-foreground">{t("form.budgetHint")}</p>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">{t("form.dueHint")}</p>
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
