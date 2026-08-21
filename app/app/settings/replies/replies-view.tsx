"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
              <li key={reply.id} className="rounded-lg border p-3">
                {/* Nút nằm CÙNG HÀNG với tiêu đề — chuẩn mật độ 21/08. Bản
                    trước cho bốn nút biểu tượng xuống một hàng riêng dưới mỗi
                    câu, ăn thêm 44px cho MỖI mục; với một tiệm có hai chục câu
                    mẫu thì đó là gần nửa màn chỉ toàn nút.

                    Còn hai nút: Sửa (việc hay làm nhất) và dấu ba chấm chứa
                    chuyển lên · chuyển xuống · xoá. Sắp thứ tự là việc làm một
                    lần rồi thôi, không đáng chiếm chỗ thường trực. Vùng bấm
                    vẫn 44px trên điện thoại. */}
                <div className="flex items-start gap-2">
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
                  {canManage && (
                    <div className="flex shrink-0 items-center gap-1">
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
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="size-11 sm:size-8"
                            disabled={pending}
                            aria-label={t("more")}
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            disabled={i === 0}
                            onSelect={() => move(reply.id, "up")}
                          >
                            {t("moveUp")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={i === replies.length - 1}
                            onSelect={() => move(reply.id, "down")}
                          >
                            {t("moveDown")}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => setDeleting(reply)}
                          >
                            {t("delete.button")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </div>
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
