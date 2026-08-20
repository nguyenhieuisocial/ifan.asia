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
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { MemberOption } from "../deals/types";
import { createTask, deleteTask, updateTask } from "./actions";

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
  /**
   * Người đang chịu trách nhiệm (`activities.owner_id`, NOT NULL — việc luôn có
   * đúng một người chịu, không có mục trống). Cần ở đây để cửa sổ biết giá trị
   * BAN ĐẦU: dải cảnh báo chỉ hiện khi ô chọn khác giá trị lúc mở, và lệnh lưu
   * chỉ gửi ô người khi nó thật sự đổi.
   */
  ownerId: string;
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
  members,
  canAssignOthers,
  onClose,
}: {
  /** null = đóng. Khác null = đang sửa đúng việc này. */
  task: EditableTask | null;
  /**
   * Người CÒN trong tiệm (`status='active'`, lọc ở `fetchDealPermissions`).
   * Người đã bị gỡ vẫn nằm trong dữ liệu cũ — bày tên họ ra là mời chọn một
   * người mà đường lưu sẽ từ chối (`resolveOwner` trong `actions.ts`).
   */
  members: MemberOption[];
  /** Vai quản lý trở lên mới gán được cho NGƯỜI KHÁC — khớp RLS `activities_update`. */
  canAssignOthers: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("tasksBoard");
  // Ô người chịu trách nhiệm dùng LẠI NGUYÊN chữ của khối "Thêm việc" ở màn Dự
  // án, không viết câu mới: giao việc và giao LẠI việc là cùng một chuyện, hai
  // câu khác nhau cho cùng một chuyện là mầm hiểu lệch.
  const tDuAn = useTranslations("projects.detail");
  // Nhãn "Tôi"/"NV {id}" cho người phụ trách — cùng vốn từ với mọi màn khác.
  const tOwner = useTranslations("contacts.owner");
  const [pending, startTransition] = useTransition();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [due, setDue] = useState("");
  const [ownerId, setOwnerId] = useState("");

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
    setOwnerId(task.ownerId);
  }

  // Được trống MỘT ô (nhiều việc chỉ có tiêu đề, hoặc chỉ có ghi chú), không
  // được trống cả hai — server cũng chặn đúng luật này (`emptyTask`).
  const canSave = subject.trim() !== "" || body.trim() !== "";

  // Người đang giữ việc có thể KHÔNG còn trong tiệm (đã bị gỡ, dòng cũ vẫn còn)
  // — vẫn phải có mặt trong ô chọn, nếu không `select` tự nhảy sang người đầu
  // danh sách và bấm Lưu là đổi người mà không ai định đổi. Cho họ đứng đó để
  // NHÌN THẤY, còn chọn ai thay thì tuỳ quản lý.
  const ownerName = (id: string) =>
    members.find((m) => m.userId === id)?.name ?? tOwner("member", { id: id.slice(0, 8) });
  const ownerOptions =
    task && !members.some((m) => m.userId === task.ownerId)
      ? [{ userId: task.ownerId, name: ownerName(task.ownerId) }, ...members]
      : members;
  const ownerChanged = !!task && ownerId !== task.ownerId;

  const save = () => {
    if (!task || pending || !canSave) return;
    startTransition(async () => {
      // CHỈ gửi ô đã đổi. Gửi cả bốn ô là gửi một ẢNH CHỤP lúc mở cửa sổ, và
      // ảnh đó đè lên thứ người khác vừa lưu — đo được trên CSDL thật: người
      // lưu sau đẩy ngược cả ghi chú lẫn người chịu trách nhiệm về bản cũ.
      const res = await updateTask(task.id, {
        ...(subject !== (task.subject ?? "") ? { subject } : {}),
        ...(body !== (task.body ?? "") ? { body } : {}),
        // datetime-local trả giờ địa phương → chuyển ISO trước khi gửi
        ...(due !== toLocalInput(task.dueAt)
          ? { dueAt: due ? new Date(due).toISOString() : null }
          : {}),
        ...(ownerChanged ? { ownerId } : {}),
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
          {/* Hai ô ngắn xếp một hàng ở máy tính, XUỐNG DÒNG dưới 640px — chen
              cùng hàng trên điện thoại thì cả hai đều hẹp đến mức khó chạm.
              Ô người đứng CẠNH ô Hạn chứ không lên đầu: phần lớn người mở cửa
              sổ này là để sửa chữ, đẩy ô người lên trên là bắt mọi người đi
              qua một ô họ không định chạm. */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="flex-1 space-y-1">
              <span className="text-xs text-muted-foreground">{tDuAn("addTaskOwner")}</span>
              <Select
                value={ownerId}
                disabled={!canAssignOthers || pending}
                onChange={(e) => setOwnerId(e.target.value)}
              >
                {ownerOptions.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex-1 space-y-1">
              <span className="text-xs text-muted-foreground">{t("editDialog.dueLabel")}</span>
              {/* min-h-11: ô ngày giờ là chỗ bấm — dưới 44px là chạm trượt trên
                  điện thoại (cùng mức với thanh "Thêm" ở mobile-more-sheet.tsx). */}
              <input
                type="datetime-local"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                className="min-h-11 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
              />
            </label>
          </div>
          {/* Vai không gán được cho người khác thì ô KHOÁ chứ không GIẤU: giấu
              hẳn thì nhân viên tưởng phần mềm quên mất khái niệm này; khoá kèm
              một câu thì họ biết phải hỏi ai. Câu chép nguyên từ khối Thêm việc
              ở màn Dự án. */}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {canAssignOthers ? tDuAn("addTaskOneOwnerNote") : tDuAn("addTaskOwnerLocked")}
          </p>
          {/* Dải cảnh báo CHỈ hiện khi thật sự đổi người — cảnh báo lúc nào cũng
              có thì thành khung trang trí, không ai đọc. Nói thẳng ai mất, ai
              nhận, vì người cũ mất quyền nhìn thấy việc ngay lập tức. */}
          {ownerChanged && task && (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              {t("editDialog.ownerChangeWarning", {
                from: ownerName(task.ownerId),
                to: ownerName(ownerId),
              })}
            </p>
          )}
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

/**
 * Hộp thoại TẠO việc mới — mở từ nút "Tạo việc" trên bảng Công việc (#228).
 * Tách RIÊNG khỏi TaskEditDialog (vốn dựa vào `task.id` khắp nơi): tạo và sửa
 * là hai chuyện, nhồi cờ create/edit vào một dialog là mầm lỗi. Dùng LẠI đúng
 * các ô của TaskEditDialog (tiêu đề · nội dung · người · hạn) để hai màn nói
 * cùng một câu chữ.
 *
 * Việc tạo ở đây ĐỘC LẬP: không bắt gắn khách/cơ hội (migration #228 nới ràng
 * buộc cho type='task'). Nếu đang lọc theo dự án thì gắn thẳng vào dự án đó.
 */
export function TaskCreateDialog({
  open,
  members,
  canAssignOthers,
  currentUserId,
  defaultProjectId,
  onClose,
}: {
  open: boolean;
  members: MemberOption[];
  /** Vai quản lý trở lên mới gán được cho NGƯỜI KHÁC — khớp RLS `activities_insert`. */
  canAssignOthers: boolean;
  /** Mặc định giao cho chính người đang tạo. */
  currentUserId: string;
  /** Đang lọc theo dự án nào thì việc mới gắn vào dự án đó. */
  defaultProjectId?: string | null;
  onClose: () => void;
}) {
  const t = useTranslations("tasksBoard");
  const tDuAn = useTranslations("projects.detail");
  const tOwner = useTranslations("contacts.owner");
  const [pending, startTransition] = useTransition();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [due, setDue] = useState("");
  const [ownerId, setOwnerId] = useState(currentUserId);

  // Mở lại thì xoá sạch phần gõ dở của lần trước (cùng mẫu "quên khi đóng" của
  // TaskEditDialog).
  const [wasOpen, setWasOpen] = useState(false);
  if (open && !wasOpen) {
    setWasOpen(true);
    setSubject("");
    setBody("");
    setDue("");
    setOwnerId(currentUserId);
  }
  if (!open && wasOpen) setWasOpen(false);

  // Người tạo phải có mặt trong ô chọn (họ là member active) — nếu vì lý do nào
  // đó không có, vẫn cho họ đứng đó để select không nhảy sang người khác.
  const ownerName = (id: string) =>
    members.find((m) => m.userId === id)?.name ?? tOwner("member", { id: id.slice(0, 8) });
  const ownerOptions = members.some((m) => m.userId === currentUserId)
    ? members
    : [{ userId: currentUserId, name: ownerName(currentUserId) }, ...members];

  const canSave = subject.trim() !== "";

  const submit = () => {
    if (pending || !canSave) return;
    startTransition(async () => {
      const res = await createTask({
        subject,
        ...(body.trim() ? { body } : {}),
        dueAt: due ? new Date(due).toISOString() : null,
        ownerId,
        ...(defaultProjectId ? { projectId: defaultProjectId } : {}),
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t("createDialog.created"));
      onClose();
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("createDialog.title")}</DialogTitle>
          <DialogDescription>{t("createDialog.description")}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">{t("editDialog.subjectLabel")}</span>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              placeholder={t("editDialog.subjectPlaceholder")}
              autoFocus
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
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="flex-1 space-y-1">
              <span className="text-xs text-muted-foreground">{tDuAn("addTaskOwner")}</span>
              <Select
                value={ownerId}
                disabled={!canAssignOthers || pending}
                onChange={(e) => setOwnerId(e.target.value)}
              >
                {ownerOptions.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex-1 space-y-1">
              <span className="text-xs text-muted-foreground">{t("editDialog.dueLabel")}</span>
              <input
                type="datetime-local"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                className="min-h-11 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
              />
            </label>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {canAssignOthers ? tDuAn("addTaskOneOwnerNote") : tDuAn("addTaskOwnerLocked")}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              {t("editDialog.cancel")}
            </Button>
            <Button type="submit" disabled={pending || !canSave}>
              {t("createDialog.submit")}
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
