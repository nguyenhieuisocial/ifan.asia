"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { deleteTask, updateTask } from "./actions";

/**
 * Hai hộp thoại dùng chung cho MỌI chỗ hiện danh sách việc — bảng Công việc
 * (`tasks-board.tsx`) và khối "Việc đang chờ" trên hồ sơ khách
 * (`../contacts/[id]/pending-tasks.tsx`). Cùng một việc, cùng một câu chữ:
 * viết hai bản là để hai màn nói khác nhau về cùng một thao tác.
 *
 * Vốn từ lấy chung namespace `tasksBoard` — cũng chính là namespace mà hai
 * server action `updateTask`/`deleteTask` lấy lời báo lỗi.
 */
export type EditableTask = {
  id: string;
  /**
   * Nhận NGUYÊN hai cột, KHÔNG nhận một chuỗi đã trộn sẵn kiểu "chữ đang hiện
   * trên thẻ". Trộn trước rồi lưu lại là cách làm mất cột còn lại: mở từ bảng
   * Công việc thì mất ghi chú, mở từ hồ sơ khách thì mất tiêu đề.
   */
  subject: string | null;
  body: string | null;
  /** ISO, hoặc null nếu việc chưa đặt hạn. */
  dueAt: string | null;
};

/** Chữ để gọi tên việc trong câu hỏi trước khi xoá — cùng phép đọc với taskTitle(). */
export function taskLabel(task: EditableTask): string {
  return task.subject ?? task.body ?? "";
}

/**
 * ISO → giá trị cho `<input type="datetime-local">` theo giờ MÁY KHÁCH.
 * Cùng quy ước với ô đặt hạn lúc TẠO việc (contacts/[id]/timeline.tsx đọc ô
 * này bằng `new Date(value)` = giờ máy khách) — hai chiều phải cùng múi giờ,
 * nếu không mở ra sửa là hạn tự nhảy.
 */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TaskEditDialog({
  task,
  onClose,
}: {
  /** null = đóng. Khác null = đang sửa đúng việc này. */
  task: EditableTask | null;
  onClose: () => void;
}) {
  const t = useTranslations("tasksBoard");
  const [pending, startTransition] = useTransition();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [due, setDue] = useState("");

  // Nạp ô nhập theo việc đang mở (adjusting state on prop change, cùng mẫu
  // tasks-board.tsx). Đóng lại thì quên việc cũ, để mở lại chính việc đó vẫn
  // lấy dữ liệu mới chứ không giữ phần gõ dở đã bỏ.
  const [loadedId, setLoadedId] = useState<string | null>(null);
  if (!task && loadedId !== null) setLoadedId(null);
  if (task && task.id !== loadedId) {
    setLoadedId(task.id);
    setSubject(task.subject ?? "");
    setBody(task.body ?? "");
    setDue(toLocalInput(task.dueAt));
  }

  // Được trống MỘT ô (nhiều việc chỉ có tiêu đề, hoặc chỉ có ghi chú), không
  // được trống cả hai — server cũng chặn đúng luật này (`emptyTask`).
  const canSave = subject.trim() !== "" || body.trim() !== "";

  const save = () => {
    if (!task || pending || !canSave) return;
    startTransition(async () => {
      const res = await updateTask(task.id, {
        subject,
        body,
        // datetime-local trả giờ địa phương → chuyển ISO trước khi gửi
        dueAt: due ? new Date(due).toISOString() : null,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t("editDialog.saved"));
      onClose();
    });
  };

  return (
    <Dialog open={!!task} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("editDialog.title")}</DialogTitle>
          <DialogDescription>{t("editDialog.description")}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          {/* HAI ô cho HAI cột. Gộp một ô là cách làm mất cột không được hiện. */}
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">{t("editDialog.subjectLabel")}</span>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              placeholder={t("editDialog.subjectPlaceholder")}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">{t("editDialog.contentLabel")}</span>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              maxLength={4000}
              placeholder={t("editDialog.contentPlaceholder")}
              className="resize-none"
            />
          </label>
          <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {t("editDialog.dueLabel")}
            {/* min-h-11: ô ngày giờ là chỗ bấm — dưới 44px là chạm trượt trên
                điện thoại (cùng mức với thanh "Thêm" ở mobile-more-sheet.tsx). */}
            <input
              type="datetime-local"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="min-h-11 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
            />
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              {t("editDialog.cancel")}
            </Button>
            <Button type="submit" disabled={pending || !canSave}>
              {t("editDialog.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TaskDeleteDialog({
  task,
  onClose,
}: {
  /** null = đóng. Khác null = đang hỏi lại trước khi xoá đúng việc này. */
  task: EditableTask | null;
  onClose: () => void;
}) {
  const t = useTranslations("tasksBoard");
  const [pending, startTransition] = useTransition();

  const confirmDelete = () => {
    if (!task || pending) return;
    startTransition(async () => {
      const res = await deleteTask(task.id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t("deleteDialog.deleted"));
      onClose();
    });
  };

  return (
    <Dialog open={!!task} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("deleteDialog.title")}</DialogTitle>
          <DialogDescription>
            {task && t("deleteDialog.description", { title: taskLabel(task) })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t("deleteDialog.cancel")}
          </Button>
          <Button variant="destructive" onClick={confirmDelete} disabled={pending}>
            {t("deleteDialog.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
