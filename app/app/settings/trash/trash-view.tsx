"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Lock, RotateCcw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatVN, nowVN } from "@/lib/datetime";
import { restoreFromTrash } from "../../actions";

export type TrashItem = {
  entity_type: "contact" | "deal" | "company";
  entity_id: string;
  title: string;
  deleted_at: string;
};

type Props = {
  canManage: boolean;
  items: TrashItem[];
  /** trash_list() giới hạn số dòng trả về — hiện rõ số này khi chạm trần, không âm thầm cắt (mục 22 câu 3). */
  listLimit?: number;
};

const BADGE_CLASS: Record<TrashItem["entity_type"], string> = {
  contact: "bg-[#f0edeb] text-[#595451]",
  deal: "bg-[#fef3c7] text-[#633f00]",
  company: "bg-[#e0f1ff] text-[#124a7b]",
};

const TRASH_RETENTION_DAYS = 30;

function daysLeft(deletedAt: string): number {
  const purgeAt = new Date(deletedAt).getTime() + TRASH_RETENTION_DAYS * 86_400_000;
  return Math.max(0, Math.ceil((purgeAt - nowVN().getTime()) / 86_400_000));
}

/**
 * Cài đặt → Thùng rác. Danh sách khách/cơ hội/công ty đã xoá mềm (bất biến
 * 11), khôi phục qua RPC trash_restore. KHÔNG có nút "xoá vĩnh viễn ngay" —
 * job đêm trash_purge_expired tự dọn sau 30 ngày, không lộ cho người dùng
 * bấm nhầm (đúng thẻ design design-system/trash.html).
 */
export function TrashView({ canManage, items, listLimit }: Props) {
  const t = useTranslations("settings.trash");
  const [pending, startTransition] = useTransition();

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

  const restore = (item: TrashItem) => {
    startTransition(async () => {
      const res = await restoreFromTrash(item.entity_type, item.entity_id);
      if (res.error) {
        toast.error(t("toasts.failed"));
        return;
      }
      toast.success(t("toasts.restored", { title: item.title }));
    });
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
        <div>
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {t("description")}
          </p>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <Trash2 className="size-8 text-muted-foreground/50" aria-hidden />
            <p className="mt-3 text-[15px] font-semibold">{t("empty.title")}</p>
            <p className="mt-1.5 max-w-sm text-[13px] text-muted-foreground">
              {t("empty.description")}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((item) => {
              const left = daysLeft(item.deleted_at);
              const urgent = left <= 3;
              return (
                <div
                  key={`${item.entity_type}-${item.entity_id}`}
                  className="flex items-start justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-[13px] font-semibold">
                      <Badge className={BADGE_CLASS[item.entity_type]}>
                        {t(`entityTypes.${item.entity_type}`)}
                      </Badge>
                      <span className="truncate">{item.title}</span>
                    </p>
                    <p
                      className={
                        urgent
                          ? "mt-0.5 text-xs font-medium text-red-600"
                          : "mt-0.5 text-xs text-muted-foreground"
                      }
                    >
                      {t("deletedAt", { date: formatVN(item.deleted_at) })} ·{" "}
                      {t("daysLeft", { count: left })}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => restore(item)}
                  >
                    <RotateCcw className="size-3.5" aria-hidden />
                    {t("restore")}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
        {listLimit && items.length >= listLimit && (
          <p className="text-xs text-muted-foreground">{t("limitNote", { n: listLimit })}</p>
        )}
      </div>
    </div>
  );
}
