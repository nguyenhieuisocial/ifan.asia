"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { setWorkflowActive } from "./actions";

export type WorkflowRow = {
  id: string;
  name: string;
  description: string | null;
  triggerEvent: string;
  conditions: Record<string, unknown>;
  actions: Record<string, unknown>[];
  isActive: boolean;
  runs7d: number;
  lastStatus: string | null;
};

export type RunRow = {
  id: string;
  status: string;
  lastError: string | null;
  createdAt: string;
  workflowName: string;
};

/** event_type trong catalog → key i18n (dấu chấm là phân tách namespace của next-intl). */
const TRIGGER_KEYS: Record<string, string> = {
  "contact.created": "contactCreated",
  "contact.updated": "contactUpdated",
  "contact.tier_changed": "contactTierChanged",
  "contact.company_linked": "contactCompanyLinked",
  "deal.created": "dealCreated",
  "deal.stage_changed": "dealStageChanged",
  "deal.won": "dealWon",
  "deal.lost": "dealLost",
  "company.created": "companyCreated",
  "company.updated": "companyUpdated",
};

// 'waiting' + 'rejected' đến từ bước phê duyệt (migration #29)
const RUN_STATUS_KEYS = [
  "pending",
  "running",
  "waiting",
  "done",
  "failed",
  "dead",
  "rejected",
];

const STATUS_VARIANT: Record<string, "secondary" | "outline" | "destructive"> = {
  done: "secondary",
  pending: "outline",
  running: "outline",
  waiting: "outline",
  failed: "destructive",
  dead: "destructive",
  rejected: "destructive",
};

const TOAST_KEYS: Record<string, string> = { forbidden: "forbidden" };

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;

export function WorkflowsView({
  canManage,
  workflows,
  runs,
}: {
  canManage: boolean;
  workflows: WorkflowRow[];
  runs: RunRow[];
}) {
  const t = useTranslations("settings.workflows");
  const tShell = useTranslations("shell");
  const locale = useLocale() as Locale;
  const [open, setOpen] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const triggerLabel = (event: string) =>
    TRIGGER_KEYS[event]
      ? t(`triggers.${TRIGGER_KEYS[event]}`)
      : t("triggers.unknown", { event });

  const runStatusLabel = (status: string) =>
    RUN_STATUS_KEYS.includes(status)
      ? t(`runStatus.${status}`)
      : status;

  /** "2 hours" / "3 days" → câu tiếng Việt tự nhiên; không khớp thì đọc nguyên văn. */
  const dueLabel = (raw: string | null) => {
    if (!raw) return t("due.now");
    const m = /^(\d+)\s*(minute|hour|day)s?$/.exec(raw.trim());
    if (!m) return t("due.raw", { raw });
    const n = Number(m[1]);
    if (n === 0) return t("due.now");
    return t(`due.${m[2]}s`, { n });
  };

  const assigneeLabel = (spec: string | null) =>
    !spec || spec === "owner" ? t("assignee.owner") : t("assignee.specific");

  /** Một hành động JSON → một câu người thường đọc được (không hiện JSON thô). */
  const actionLabel = (action: Record<string, unknown>) => {
    const type = str(action.type);
    if (type === "create_task") {
      return t("actions.createTask", {
        subject: str(action.subject) ?? "",
        due: dueLabel(str(action.due_in)),
        assignee: assigneeLabel(str(action.assign_to)),
      });
    }
    if (type === "notify") {
      return t("actions.notify", {
        assignee: assigneeLabel(str(action.to)),
        title: str(action.title) ?? "",
      });
    }
    if (type === "set_tier") {
      const tier = str(action.tier);
      return t("actions.setTier", {
        tier: tier && ["new", "regular", "vip", "dormant"].includes(tier)
          ? t(`tiers.${tier}`)
          : (tier ?? ""),
      });
    }
    if (type === "assign_owner") {
      return t("actions.assignOwner", { assignee: assigneeLabel(str(action.to)) });
    }
    if (type === "approval") {
      const levels = Array.isArray(action.levels) ? action.levels.length : 1;
      return t("actions.approval", { levels });
    }
    return t("actions.unknown", { type: type ?? "?" });
  };

  /** Điều kiện JSON → câu tiếng Việt (đợt 1 chỉ có bằng-giá-trị và có/không). */
  const conditionLabels = (conditions: Record<string, unknown>) =>
    Object.entries(conditions).map(([field, value]) => {
      if (value && typeof value === "object" && "exists" in value) {
        const exists = (value as { exists?: unknown }).exists !== false;
        return t(exists ? "conditionRow.exists" : "conditionRow.notExists", { field });
      }
      return t("conditionRow.eq", { field, value: String(value) });
    });

  const toggle = (row: WorkflowRow) => {
    if (pending) return;
    startTransition(async () => {
      const res = await setWorkflowActive(row.id, !row.isActive);
      if (res.error) {
        toast.error(t(`toasts.${TOAST_KEYS[res.error] ?? "failed"}`));
        return;
      }
      toast.success(t(row.isActive ? "toasts.disabled" : "toasts.enabled"));
    });
  };

  if (!canManage) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl p-6">
          <div className="rounded-lg border border-dashed p-8 text-center">
            <Lock className="mx-auto size-5 text-muted-foreground" />
            <h1 className="mt-3 text-[15px] font-semibold">
              {t("noPermission.title")}
            </h1>
            <p className="mx-auto mt-1.5 max-w-md text-[13px] text-muted-foreground">
              {t("noPermission.description")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
        <div>
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {t("description")}
          </p>
        </div>

        {workflows.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-[13px] text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          <ul className="space-y-2">
            {workflows.map((w) => {
              const isOpen = open === w.id;
              const conditions = conditionLabels(w.conditions);
              return (
                <li key={w.id} className="rounded-lg border">
                  <div className="flex flex-wrap items-start gap-x-3 gap-y-2 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[13px] font-medium">{w.name}</p>
                        <Badge variant={w.isActive ? "secondary" : "outline"}>
                          {t(w.isActive ? "card.on" : "card.off")}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-[13px] text-muted-foreground">
                        {triggerLabel(w.triggerEvent)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {w.runs7d > 0
                          ? t("card.runs7d", { count: w.runs7d })
                          : t("card.noRuns")}
                        {w.lastStatus
                          ? ` · ${t("card.lastRun", { status: runStatusLabel(w.lastStatus) })}`
                          : ""}
                      </p>
                    </div>
                    <Button
                      variant={w.isActive ? "outline" : "default"}
                      size="sm"
                      className="shrink-0"
                      disabled={pending}
                      onClick={() => toggle(w)}
                    >
                      {t(w.isActive ? "toggle.off" : "toggle.on")}
                    </Button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : w.id)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-1 border-t px-3 py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {isOpen ? (
                      <ChevronDown className="size-3.5" />
                    ) : (
                      <ChevronRight className="size-3.5" />
                    )}
                    {t(isOpen ? "card.hide" : "card.detail")}
                  </button>

                  {isOpen && (
                    <div className="space-y-3 border-t px-3 py-3 text-[13px]">
                      {w.description && (
                        <p className="text-muted-foreground">{w.description}</p>
                      )}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">
                          {t("card.when")}
                        </p>
                        <p className="mt-0.5">{triggerLabel(w.triggerEvent)}</p>
                      </div>
                      {conditions.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground">
                            {t("card.conditions")}
                          </p>
                          <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
                            {conditions.map((c) => (
                              <li key={c}>{c}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">
                          {t("card.then")}
                        </p>
                        <ol className="mt-0.5 list-decimal space-y-0.5 pl-4">
                          {w.actions.map((a, i) => (
                            <li key={i}>{actionLabel(a)}</li>
                          ))}
                        </ol>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <p className="flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed px-3 py-2.5 text-[13px] text-muted-foreground">
          {t("editSoon")}
          <Badge variant="outline">{tShell("comingSoon")}</Badge>
        </p>

        <section className="space-y-2">
          <h2 className="text-[13px] font-semibold">{t("runs.title")}</h2>
          {runs.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-[13px] text-muted-foreground">
              {t("runs.empty")}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              {/* 375px trừ lề chỉ còn 327px, mà bảng ép 520px nên hai cột "Kết
                  quả" và "Lỗi" — đúng hai cột trả lời câu hỏi "quy trình chạy
                  được không" — nằm ngoài tầm nhìn cho tới khi cuộn hết sang
                  phải. Hạ xuống 380px để chúng vào khung ngay từ đầu. */}
              <table className="w-full min-w-[380px] text-[13px]">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">{t("runs.time")}</th>
                    <th className="px-3 py-2 font-medium">{t("runs.workflow")}</th>
                    <th className="px-3 py-2 font-medium">{t("runs.result")}</th>
                    <th className="px-3 py-2 font-medium">{t("runs.error")}</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                        {formatDateTime(r.createdAt, locale)}
                      </td>
                      <td className="px-3 py-2">{r.workflowName}</td>
                      <td className="px-3 py-2">
                        <Badge variant={STATUS_VARIANT[r.status] ?? "outline"}>
                          {runStatusLabel(r.status)}
                        </Badge>
                      </td>
                      <td
                        className={cn(
                          "max-w-[220px] truncate px-3 py-2 text-muted-foreground",
                          !r.lastError && "text-muted-foreground/50",
                        )}
                        title={r.lastError ?? undefined}
                      >
                        {r.lastError ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
