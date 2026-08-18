"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-react";
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
import { deleteQuickReply, moveQuickReply, saveQuickReply } from "./actions";

export type QuickReplyRow = {
  id: string;
  title: string;
  content: string;
  sort_order: number;
  /** Số lượt được chèn vào composer Hộp thư trong 30 ngày (migration #58). */
  used30d: number;
};

const TOAST_KEYS: Record<string, string> = {
  title_taken: "titleTaken",
  forbidden: "forbidden",
  // Vòng lặp đổi thứ tự dừng ngay khi 1 lệnh giữa chừng hỏng (xem actions.ts)
  // nhưng vài dòng có thể đã đổi rồi — báo trung thực để tải lại trang.
  move_failed: "moveIncomplete",
};

type FormValues = { id: string | null; title: string; content: string };

/** Form thêm/sửa — nằm trong DialogContent nên tự reset state khi đóng. */
function ReplyForm({
  initial,
  onDone,
}: {
  initial: FormValues;
  onDone: () => void;
}) {
  const t = useTranslations("settings.replies");
  const tCommon = useTranslations("common");
  const [values, setValues] = useState<FormValues>(initial);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (pending) return;
    startTransition(async () => {
      const res = await saveQuickReply(values);
      if (res.error) {
        toast.error(t(`toasts.${TOAST_KEYS[res.error] ?? "failed"}`));
        return;
      }
      toast.success(t("toasts.saved"));
      onDone();
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-3"
    >
      <div className="space-y-1.5">
        <Label htmlFor="qr-title">{t("form.titleLabel")}</Label>
        <Input
          id="qr-title"
          value={values.title}
          onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
          placeholder={t("form.titlePlaceholder")}
          maxLength={80}
          required
          autoFocus
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="qr-content">{t("form.contentLabel")}</Label>
        {/* resize-none: hộp thoại không có trần chiều cao, kéo cao ra là nút Lưu
            trôi khỏi màn hình mà không cuộn tới được. */}
        <Textarea
          id="qr-content"
          value={values.content}
          onChange={(e) =>
            setValues((v) => ({ ...v, content: e.target.value }))
          }
          rows={5}
          maxLength={1000}
          required
          placeholder={t("form.contentPlaceholder")}
          className="resize-none"
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
          {tCommon("cancel")}
        </Button>
        <Button
          type="submit"
          disabled={pending || !values.title.trim() || !values.content.trim()}
        >
          {tCommon("save")}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function RepliesView({
  canManage,
  replies,
}: {
  canManage: boolean;
  replies: QuickReplyRow[];
}) {
  const t = useTranslations("settings.replies");
  const tCommon = useTranslations("common");
  // editing: null = dialog đóng; id=null trong FormValues = đang thêm mới
  const [editing, setEditing] = useState<FormValues | null>(null);
  const [deleting, setDeleting] = useState<QuickReplyRow | null>(null);
  const [pending, startTransition] = useTransition();

  const move = (id: string, direction: "up" | "down") => {
    if (pending) return;
    startTransition(async () => {
      const res = await moveQuickReply(id, direction);
      if (res.error) {
        toast.error(t(`toasts.${TOAST_KEYS[res.error] ?? "failed"}`));
      }
    });
  };

  const remove = () => {
    if (!deleting || pending) return;
    startTransition(async () => {
      const res = await deleteQuickReply(deleting.id);
      if (res.error) {
        toast.error(t(`toasts.${TOAST_KEYS[res.error] ?? "failed"}`));
        return;
      }
      toast.success(t("toasts.deleted"));
      setDeleting(null);
    });
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
        {/* 375px: nút "Thêm câu trả lời" (không co) ăn ~170px, phần chữ còn
            ~145px nên tiêu đề và dòng mô tả bị bóp thành cột hẹp xuống 3-4
            hàng. Xếp dọc trên điện thoại, ngang từ 640px trở lên. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold">{t("title")}</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {canManage ? t("description") : t("readOnlyHint")}
            </p>
          </div>
          {canManage && (
            <Button
              className="shrink-0"
              onClick={() => setEditing({ id: null, title: "", content: "" })}
            >
              <Plus className="size-4" />
              {t("add")}
            </Button>
          )}
        </div>

        {replies.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-[13px] text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          <ul className="space-y-2">
            {replies.map((reply, i) => (
              <li
                key={reply.id}
                className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-start"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium">{reply.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">
                    {reply.content}
                  </p>
                  {/* Vòng phản hồi: câu nào được dùng thật, câu nào nằm chết
                      (mẫu dòng fired7d của màn Cam kết) */}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {reply.used30d > 0
                      ? t("used30d", { count: reply.used30d })
                      : t("notUsed30d")}
                  </p>
                </div>
                {/* Trên điện thoại cụm nút xuống hàng riêng để đủ chỗ cho vùng chạm
                    44px; nút Xóa (không hoàn tác được) bị đẩy hẳn sang mép phải nên
                    không còn dính vào nút "chuyển xuống" bấm nhiều nhất. */}
                {canManage && (
                  <div className="flex shrink-0 items-center gap-1 sm:gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="size-11 sm:size-8"
                      disabled={pending || i === 0}
                      onClick={() => move(reply.id, "up")}
                      aria-label={t("moveUp")}
                      title={t("moveUp")}
                    >
                      <ChevronUp className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="size-11 sm:size-8"
                      disabled={pending || i === replies.length - 1}
                      onClick={() => move(reply.id, "down")}
                      aria-label={t("moveDown")}
                      title={t("moveDown")}
                    >
                      <ChevronDown className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="size-11 sm:size-8"
                      disabled={pending}
                      onClick={() =>
                        setEditing({
                          id: reply.id,
                          title: reply.title,
                          content: reply.content,
                        })
                      }
                      aria-label={t("edit")}
                      title={t("edit")}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="ml-auto size-11 sm:ml-2 sm:size-8"
                      disabled={pending}
                      onClick={() => setDeleting(reply)}
                      aria-label={t("delete.button")}
                      title={t("delete.button")}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <Dialog
          open={editing !== null}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editing?.id ? t("form.editTitle") : t("form.addTitle")}
              </DialogTitle>
            </DialogHeader>
            {editing && (
              <ReplyForm initial={editing} onDone={() => setEditing(null)} />
            )}
          </DialogContent>
        </Dialog>

        <Dialog
          open={deleting !== null}
          onOpenChange={(open) => {
            if (!open) setDeleting(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("delete.title")}</DialogTitle>
              <DialogDescription>
                {t("delete.body", { title: deleting?.title ?? "" })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setDeleting(null)}
                disabled={pending}
              >
                {tCommon("cancel")}
              </Button>
              <Button variant="destructive" onClick={remove} disabled={pending}>
                {t("delete.confirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
