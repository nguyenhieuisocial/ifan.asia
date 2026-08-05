import { Bell, ClipboardCheck, TimerOff, UserRoundPlus, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";
import { typeKey, type NotificationTypeKey } from "@/app/app/notifications/types";

/**
 * Huy hiệu loại thông báo — dùng chung chuông và màn danh sách.
 * Icon chỉ TRANG TRÍ (aria-hidden): mọi dòng đều có nhãn loại bằng chữ đi kèm,
 * người dùng không phải đoán ý nghĩa hình vẽ.
 */
const ICONS: Record<NotificationTypeKey, typeof Bell> = {
  sla: TimerOff,
  handoff: UserRoundPlus,
  approval: ClipboardCheck,
  workflow: Workflow,
  other: Bell,
};

/** Trễ hẹn là việc GẤP → tô màu cảnh báo; còn lại giữ trung tính cho đỡ nhiễu. */
const TONES: Record<NotificationTypeKey, string> = {
  sla: "bg-destructive/10 text-destructive",
  handoff: "bg-primary/10 text-primary",
  // Phiếu chờ duyệt cũng là việc CHỜ NGƯỜI NÀY làm (như bàn giao khách) → cùng
  // sắc nhấn, phân biệt với thông báo tự động chỉ để biết.
  approval: "bg-primary/10 text-primary",
  workflow: "bg-muted text-muted-foreground",
  other: "bg-muted text-muted-foreground",
};

export function NotificationTypeIcon({
  type,
  className,
}: {
  type: string;
  className?: string;
}) {
  const key = typeKey(type);
  const Icon = ICONS[key];
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md",
        TONES[key],
        className,
      )}
    >
      <Icon className="size-4" aria-hidden />
    </span>
  );
}
