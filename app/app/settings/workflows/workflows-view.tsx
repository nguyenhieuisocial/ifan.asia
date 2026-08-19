"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { setWorkflowActive, xoaQuyTrinh } from "./actions";
import {
  TrinhDungQuyTrinh,
  docNguocQuyTrinh,
  type QuyTrinhDangSua,
} from "./workflow-builder";
import { useWorkflowLabels, type CotCoHoi, type NguoiTrongTiem } from "./workflow-labels";

export type WorkflowRow = {
  id: string;
  name: string;
  description: string | null;
  triggerEvent: string;
  conditions: Record<string, unknown>;
  actions: Record<string, unknown>[];
  isActive: boolean;
  isSystem: boolean;
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

const STATUS_VARIANT: Record<string, "secondary" | "outline" | "destructive"> = {
  done: "secondary",
  pending: "outline",
  running: "outline",
  waiting: "outline",
  failed: "destructive",
  dead: "destructive",
  rejected: "destructive",
};

const TOAST_KEYS: Record<string, string> = {
  forbidden: "forbidden",
  he_thong: "heThong",
  khong_thay: "khongThay",
};

type DangDung =
  | { che_do: "tao" }
  | { che_do: "sua"; quyTrinh: Parameters<typeof TrinhDungQuyTrinh>[0]["quyTrinh"] };

export function WorkflowsView({
  canManage,
  workflows,
  runs,
  members,
  stages,
}: {
  canManage: boolean;
  workflows: WorkflowRow[];
  runs: RunRow[];
  members: NguoiTrongTiem[];
  stages: CotCoHoi[];
}) {
  const t = useTranslations("settings.workflows");
  const locale = useLocale() as Locale;
  const nhan = useWorkflowLabels(members, stages);
  const [open, setOpen] = useState<string | null>(null);
  const [dangDung, setDangDung] = useState<DangDung | null>(null);
  const [dangXoa, setDangXoa] = useState<WorkflowRow | null>(null);
  const [pending, startTransition] = useTransition();

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

  /**
   * Chỉ mở form khi ĐỌC NGƯỢC được trọn vẹn quy trình. Mở với một phần nội dung
   * rồi bấm Lưu là ghi đè mất phần trình dựng không hiểu — mất im lặng.
   */
  const moSua = (row: WorkflowRow) => {
    const goc: QuyTrinhDangSua = {
      id: row.id,
      name: row.name,
      description: row.description,
      triggerEvent: row.triggerEvent,
      conditions: row.conditions,
      actions: row.actions,
    };
    const rows = docNguocQuyTrinh(goc);
    if (!rows) {
      toast.error(t("toasts.khongDocLaiDuoc"));
      return;
    }
    setDangDung({ che_do: "sua", quyTrinh: { ...goc, rows } });
  };

  const xoa = (row: WorkflowRow) => {
    if (pending) return;
    startTransition(async () => {
      const res = await xoaQuyTrinh(row.id);
      if (res.error) {
        toast.error(t(`toasts.${TOAST_KEYS[res.error] ?? "failed"}`));
        return;
      }
      toast.success(t("toasts.deleted"));
      setDangXoa(null);
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold">{t("title")}</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {t("description")}
            </p>
          </div>
          <Button
            size="sm"
            className="shrink-0"
            disabled={pending}
            onClick={() => setDangDung({ che_do: "tao" })}
          >
            <Plus className="size-4" />
            {t("builder.createTitle")}
          </Button>
        </div>

        {workflows.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-[13px] text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          <ul className="space-y-2">
            {workflows.map((w) => {
              const isOpen = open === w.id;
              const conditions = nhan.conditionLabels(w.triggerEvent, w.conditions);
              return (
                <li key={w.id} className="rounded-lg border">
                  <div className="flex flex-wrap items-start gap-x-3 gap-y-2 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[13px] font-medium">{w.name}</p>
                        {/* Dùng ĐÚNG mã màu trạng thái của hệ thống như màn
                            Kênh kết nối: "Đang bật" là xanh, tắt là trung tính.
                            Trước đó cả hai đều nền bè trung tính nên liếc qua
                            không biết quy trình nào đang chạy — mà đó là câu hỏi
                            duy nhất người ta mở màn này để trả lời. */}
                        <Badge
                          variant="outline"
                          className={
                            w.isActive
                              ? "border-transparent bg-status-closed text-status-closed-foreground"
                              : undefined
                          }
                        >
                          {t(w.isActive ? "card.on" : "card.off")}
                        </Badge>
                        {w.isSystem && (
                          <Badge variant="outline">{t("card.builtIn")}</Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-[13px] text-muted-foreground">
                        {nhan.triggerLabel(w.triggerEvent)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {w.runs7d > 0
                          ? t("card.runs7d", { count: w.runs7d })
                          : t("card.noRuns")}
                        {w.lastStatus
                          ? ` · ${t("card.lastRun", { status: nhan.runStatusLabel(w.lastStatus) })}`
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
                        <p className="mt-0.5">{nhan.triggerLabel(w.triggerEvent)}</p>
                      </div>
                      {conditions.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground">
                            {t("card.conditions")}
                          </p>
                          <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
                            {conditions.map((c, i) => (
                              <li key={i}>{c}</li>
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
                            <li key={i}>{nhan.actionLabel(a)}</li>
                          ))}
                        </ol>
                      </div>

                      {/* Playbook cài sẵn chỉ bật/tắt — nói LÝ DO tại chỗ thay vì
                          để một khoảng trống không giải thích gì. Server chặn
                          thật ở `suaQuyTrinh`/`xoaQuyTrinh`, không dựa vào đây. */}
                      {w.isSystem ? (
                        <p className="text-xs text-muted-foreground">
                          {t("card.builtInNote")}
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={pending}
                            onClick={() => moSua(w)}
                          >
                            <Pencil className="size-3.5" />
                            {t("card.edit")}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={pending}
                            onClick={() => setDangXoa(w)}
                          >
                            <Trash2 className="size-3.5" />
                            {t("card.delete")}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

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
                          {nhan.runStatusLabel(r.status)}
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

      {dangDung && (
        <TrinhDungQuyTrinh
          quyTrinh={dangDung.che_do === "sua" ? dangDung.quyTrinh : null}
          members={members}
          stages={stages}
          onClose={() => setDangDung(null)}
        />
      )}

      {dangXoa && (
        <Dialog open onOpenChange={(o) => !o && setDangXoa(null)}>
          <DialogContent aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{t("delete.title")}</DialogTitle>
            </DialogHeader>
            <p className="text-[13px] text-muted-foreground">
              {t("delete.body", { name: dangXoa.name })}
            </p>
            <DialogFooter>
              <Button variant="outline" disabled={pending} onClick={() => setDangXoa(null)}>
                {t("delete.cancel")}
              </Button>
              <Button variant="destructive" disabled={pending} onClick={() => xoa(dangXoa)}>
                {t("delete.confirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
