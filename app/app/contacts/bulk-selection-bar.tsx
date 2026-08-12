"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { bulkAddTag, bulkAssignOwner, bulkCreateTask } from "./bulk-actions";
import type { ContactRow, MemberNames } from "./types";

/** Trần cứng của bulk_operations (check total <= 500, migration #69) — chỉ để hiện
 *  cảnh báo NGAY LÚC CHỌN, phía server (bulk-actions.ts) mới là chốt thật. */
export const MAX_BULK = 500;

export type BulkResult = { done: number; failed: number; failures: { id: string; reason: string }[] };

function newOperationId() {
  return crypto.randomUUID();
}

function AssignOwnerDialog({
  open,
  onOpenChange,
  targetIds,
  memberNames,
  onResult,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetIds: string[];
  memberNames: MemberNames;
  onResult: (r: BulkResult) => void;
}) {
  const t = useTranslations("contacts.bulk");
  const tCommon = useTranslations("common");
  const [ownerId, setOwnerId] = useState("");
  const [pending, startTransition] = useTransition();
  const members = Object.entries(memberNames);

  const submit = () => {
    if (!ownerId || pending) return;
    startTransition(async () => {
      const res = await bulkAssignOwner(targetIds, ownerId, newOperationId());
      if (res.error) {
        toast.error(res.error);
        return;
      }
      onOpenChange(false);
      setOwnerId("");
      onResult(res);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("assignOwner.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="bulk-owner">{t("assignOwner.label")}</Label>
          <Select id="bulk-owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">{t("assignOwner.placeholder")}</option>
            {members.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={submit} disabled={!ownerId || pending}>
            {t("assignOwner.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddTagDialog({
  open,
  onOpenChange,
  targetIds,
  onResult,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetIds: string[];
  onResult: (r: BulkResult) => void;
}) {
  const t = useTranslations("contacts.bulk");
  const tCommon = useTranslations("common");
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (!name.trim() || pending) return;
    startTransition(async () => {
      const res = await bulkAddTag(targetIds, name.trim(), newOperationId());
      if (res.error) {
        toast.error(res.error);
        return;
      }
      onOpenChange(false);
      setName("");
      onResult(res);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("addTag.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="bulk-tag">{t("addTag.label")}</Label>
          <Input
            id="bulk-tag"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("addTag.placeholder")}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={submit} disabled={!name.trim() || pending}>
            {t("addTag.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateTaskDialog({
  open,
  onOpenChange,
  targetIds,
  onResult,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetIds: string[];
  onResult: (r: BulkResult) => void;
}) {
  const t = useTranslations("contacts.bulk");
  const tCommon = useTranslations("common");
  const [content, setContent] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [pending, startTransition] = useTransition();
  const canSubmit = content.trim() !== "" && dueAt !== "" && !pending;

  const submit = () => {
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await bulkCreateTask(
        targetIds,
        { content: content.trim(), dueAt: new Date(dueAt).toISOString() },
        newOperationId(),
      );
      if (res.error) {
        toast.error(res.error);
        return;
      }
      onOpenChange(false);
      setContent("");
      setDueAt("");
      onResult(res);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("createTask.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="bulk-task-content">{t("createTask.contentLabel")}</Label>
            <Textarea
              id="bulk-task-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={2}
              placeholder={t("createTask.contentPlaceholder")}
              className="resize-none"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-task-due">{t("createTask.dueLabel")}</Label>
            <input
              id="bulk-task-due"
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={submit} disabled={!canSubmit}>
            {t("createTask.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Hộp kết quả "Xong N · Lỗi M" (thẻ design man-chon-nhieu.html) — cấm nuốt
 * lỗi. Render ở NGOÀI BulkSelectionBar (component riêng, state ở ContactsShell):
 * bar tự gỡ khỏi cây khi thoát chế độ chọn, gỡ theo cả state kết quả bên
 * trong nó thì hộp kết quả biến mất ngay khi vừa hiện — đã bắt bằng tay lúc
 * kiểm live, không phải suy đoán.
 */
export function BulkResultDialog({
  result,
  rows,
  onOpenChange,
}: {
  result: BulkResult | null;
  rows: ContactRow[];
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("contacts.bulk");
  const tCommon = useTranslations("common");
  const [showFailures, setShowFailures] = useState(false);
  const nameOf = (id: string) => rows.find((r) => r.id === id)?.full_name ?? id;

  return (
    <Dialog
      open={result !== null}
      onOpenChange={(o) => {
        if (!o) setShowFailures(false);
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("result.title")}</DialogTitle>
        </DialogHeader>
        {result && (
          <div
            className={
              result.failed > 0
                ? "rounded-lg border border-amber-600/40 bg-amber-50 p-3 dark:bg-amber-950/30"
                : "rounded-lg border border-green-600/40 bg-green-50 p-3 dark:bg-green-950/30"
            }
          >
            <p className="text-[13px] font-semibold">
              {t("result.summary", { done: result.done, failed: result.failed })}
            </p>
            {result.failed > 0 && (
              <>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {t("result.failedHint", { count: result.failed })}
                </p>
                <button
                  type="button"
                  onClick={() => setShowFailures((v) => !v)}
                  className="mt-1.5 text-xs text-primary underline underline-offset-2"
                >
                  {showFailures
                    ? t("result.hideFailures")
                    : t("result.showFailures", { count: result.failed })}
                </button>
                {showFailures && (
                  <ul className="mt-2 space-y-1 border-t pt-2 text-xs">
                    {result.failures.map((f) => (
                      <li key={f.id} className="flex justify-between gap-2">
                        <span className="min-w-0 truncate">{nameOf(f.id)}</span>
                        <span className="shrink-0 text-muted-foreground">{f.reason}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            {tCommon("close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Props = {
  selectedIds: Set<string>;
  canAssignOwner: boolean;
  memberNames: MemberNames;
  /**
   * Gọi sau khi MỘT thao tác hàng loạt chạy xong (kể cả có lỗi một phần).
   * Cha (ContactsShell) chịu trách nhiệm: thoát chế độ chọn + mở
   * BulkResultDialog — KHÔNG tự đóng ở đây, vì thoát chế độ chọn unmount
   * chính component này, làm hộp kết quả biến mất theo (đã bắt lỗi này lúc
   * kiểm live, xem BulkResultDialog).
   */
  onResult: (r: BulkResult) => void;
};

/**
 * Thanh hành động hàng loạt (V1b bước 5-6, mục 36.8-2). Thẻ design:
 * design-system/man-chon-nhieu.html — 3 nút Giao cho…/Gắn nhãn/Tạo việc,
 * dính đáy TRÊN thanh điều hướng (không đè). QĐ-3: mỗi nút gọi lại đúng hàm
 * đơn lẻ (bulk-actions.ts), không đi tắt SQL. Xoá không nằm trong 3 nút này
 * nên không cần hỏi lại — đúng luật "chỉ hành động xoá mới hỏi lại".
 */
export function BulkSelectionBar({ selectedIds, canAssignOwner, memberNames, onResult }: Props) {
  const t = useTranslations("contacts.bulk");
  const [dialog, setDialog] = useState<"owner" | "tag" | "task" | null>(null);

  const targetIds = Array.from(selectedIds).slice(0, MAX_BULK);

  return (
    <>
      <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-t bg-background p-2.5">
        {canAssignOwner && (
          <Button size="sm" className="shrink-0" onClick={() => setDialog("owner")}>
            {t("assignOwner.action")}
          </Button>
        )}
        <Button size="sm" variant="outline" className="shrink-0" onClick={() => setDialog("tag")}>
          {t("addTag.action")}
        </Button>
        <Button size="sm" variant="outline" className="shrink-0" onClick={() => setDialog("task")}>
          {t("createTask.action")}
        </Button>
      </div>

      <AssignOwnerDialog
        open={dialog === "owner"}
        onOpenChange={(o) => !o && setDialog(null)}
        targetIds={targetIds}
        memberNames={memberNames}
        onResult={onResult}
      />
      <AddTagDialog
        open={dialog === "tag"}
        onOpenChange={(o) => !o && setDialog(null)}
        targetIds={targetIds}
        onResult={onResult}
      />
      <CreateTaskDialog
        open={dialog === "task"}
        onOpenChange={(o) => !o && setDialog(null)}
        targetIds={targetIds}
        onResult={onResult}
      />
    </>
  );
}
