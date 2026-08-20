"use client";

import { useEffect, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { CalendarClock, Pencil, SquareCheckBig, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import type { MemberOption } from "../../deals/types";
import {
  TaskDeleteDialog,
  TaskEditDialog,
  type EditableTask,
} from "../../tasks/task-editor";
import { toggleActivityDone } from "../actions";
import type { ActivityRow } from "../types";

/**
 * Đọc hash "#activity-<uuid>" trên URL — link thông báo việc quá hạn (migration
 * #51) trỏ thẳng tới dòng việc trong khối "Việc đang chờ".
 */
function activityIdFromHash(): string | null {
  const m = /^#activity-([0-9a-f-]{36})$/i.exec(window.location.hash);
  return m ? m[1] : null;
}

function PendingRow({
  activity,
  overdue,
  highlighted,
  canWrite,
  onEdit,
  onDelete,
}: {
  activity: ActivityRow;
  overdue: boolean;
  highlighted: boolean;
  /** Khớp RLS activities_update — mọi vai TRỪ viewer. */
  canWrite: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("contacts.pending");
  const tTimeline = useTranslations("contacts.timeline");
  // Sửa/xoá việc dùng CHUNG vốn từ với bảng Công việc — cùng một thao tác trên
  // cùng một bảng dữ liệu thì không được nói hai kiểu ở hai màn.
  const tTasks = useTranslations("tasksBoard");
  const locale = useLocale() as Locale;
  const [pending, startTransition] = useTransition();

  const markDone = () => {
    startTransition(async () => {
      const res = await toggleActivityDone(activity.id, true);
      if (res.error) toast.error(res.error);
    });
  };

  return (
    <div
      // Đích cuộn tới của link thông báo "#activity-<id>" — highlight ring
      // primary rồi tự tắt sau ~2s (xem effect ở PendingTasks).
      id={`activity-${activity.id}`}
      className={cn(
        "flex items-start justify-between gap-3 rounded-md border p-2.5 transition-shadow",
        highlighted && "ring-2 ring-primary",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[13px] whitespace-pre-wrap">
          {activity.subject ?? activity.body}
        </p>
        {activity.due_at && (
          <p
            className={cn(
              "mt-0.5 flex items-center gap-1 text-xs",
              overdue ? "font-medium text-destructive" : "text-muted-foreground",
            )}
          >
            <CalendarClock className="size-3" />
            {tTimeline("dueAt", { date: formatDateTime(activity.due_at, locale) })}
            {overdue && ` — ${tTimeline("overdue")}`}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {/* Nhãn là vùng bấm thật của ô tích (ô tích chỉ 16px) — cho nhãn cao
            44px trên điện thoại, bằng hai nút sửa/xoá ngay bên cạnh, để không
            bấm nhầm sang nút xoá. */}
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground max-md:min-h-11 max-md:px-1">
          <Checkbox checked={false} onChange={markDone} disabled={pending || !canWrite} />
          {t("done")}
        </label>
        {/* Chỉ vai ghi được mới thấy — khớp RLS activities_update/_delete.
            size-11 = 44px: dòng việc này cũng đọc trên điện thoại, nút nhỏ hơn
            là chạm nhầm sang nút bên cạnh (cùng mức đã chốt ở mobile-more-sheet). */}
        {canWrite && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="size-11"
              aria-label={tTasks("card.edit")}
              title={tTasks("card.edit")}
              onClick={onEdit}
            >
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-11 text-destructive hover:text-destructive"
              aria-label={tTasks("card.delete")}
              title={tTasks("card.delete")}
              onClick={onDelete}
            >
              <Trash2 />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Khối "Việc đang chờ" ghim ĐẦU cột dòng thời gian: các việc (task) chưa xong,
 * sắp theo hạn gần nhất trước, quá hạn tô đỏ. Tích "Xong" tại chỗ — dùng lại
 * action `toggleActivityDone`, xong là dòng rơi khỏi danh sách sau refresh.
 * Không có việc chờ nào thì ẩn hẳn, không chiếm chỗ.
 */
export function PendingTasks({
  activities,
  canWrite,
  members,
  canAssignOthers,
}: {
  activities: ActivityRow[];
  /** Khớp RLS activities_update — mọi vai TRỪ viewer. */
  canWrite: boolean;
  /** Người CÒN trong tiệm — cho ô chọn người chịu trách nhiệm của cửa sổ Sửa. */
  members: MemberOption[];
  /** Vai quản lý trở lên mới gán được việc cho NGƯỜI KHÁC. */
  canAssignOthers: boolean;
}) {
  const t = useTranslations("contacts.pending");
  // Mốc "bây giờ" chốt lúc mount — đủ cho nhãn quá hạn, không cần đồng hồ chạy
  const [now] = useState(() => Date.now());
  const [highlightId, setHighlightId] = useState<string | null>(null);
  // Một hộp thoại dùng chung cho cả khối, không phải mỗi dòng một cái.
  const [editTarget, setEditTarget] = useState<EditableTask | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EditableTask | null>(null);

  // Nhảy đúng việc: thông báo quá hạn dẫn về "/app/contacts/<id>#activity-<id>"
  // → cuộn tới dòng việc + ring primary, tự tắt sau ~2s.
  useEffect(() => {
    let timer: number | undefined;
    const apply = () => {
      const id = activityIdFromHash();
      if (!id) return;
      const el = document.getElementById(`activity-${id}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightId(id);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setHighlightId(null), 2000);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => {
      window.removeEventListener("hashchange", apply);
      window.clearTimeout(timer);
    };
  }, []);

  const tasks = activities
    .filter((a) => a.type === "task" && a.done_at === null)
    .sort((a, b) => {
      // Hạn gần nhất lên đầu; việc chưa đặt hạn xuống cuối
      if (a.due_at === b.due_at) return 0;
      if (a.due_at === null) return 1;
      if (b.due_at === null) return -1;
      return a.due_at < b.due_at ? -1 : 1;
    });

  if (tasks.length === 0) return null;

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <SquareCheckBig className="size-4 text-muted-foreground" />
          {t("title")}
          <Badge variant="secondary">{tasks.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 px-4">
        {tasks.map((a) => (
          <PendingRow
            key={a.id}
            activity={a}
            overdue={a.due_at !== null && new Date(a.due_at).getTime() < now}
            highlighted={highlightId === a.id}
            canWrite={canWrite}
            onEdit={() => setEditTarget(editableFrom(a))}
            onDelete={() => setDeleteTarget(editableFrom(a))}
          />
        ))}
        <TaskEditDialog
          task={editTarget}
          members={members}
          canAssignOthers={canAssignOthers}
          onClose={() => setEditTarget(null)}
        />
        <TaskDeleteDialog task={deleteTarget} onClose={() => setDeleteTarget(null)} />
      </CardContent>
    </Card>
  );
}

/**
 * Dòng việc → dữ liệu cho hộp thoại sửa/xoá. Truyền NGUYÊN hai cột (tiêu đề và
 * ghi chú là hai thứ khác nhau) — trộn thành một chuỗi ở đây thì lúc lưu lại
 * cột không được hiện sẽ bị xoá trắng.
 */
function editableFrom(activity: ActivityRow): EditableTask {
  return {
    id: activity.id,
    subject: activity.subject,
    body: activity.body,
    dueAt: activity.due_at,
    ownerId: activity.owner_id,
  };
}
