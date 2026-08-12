"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  isSavedViewActive,
  isSavedViewStale,
  SAVED_VIEW_VISIBLE_CAP,
  type SavedView,
  type SavedViewScreen,
} from "@/lib/saved-views";
import { createSavedView, deleteSavedView } from "@/app/app/saved-views/actions";
import { fetchSavedViews } from "@/app/app/saved-views/queries";

type Props = {
  screen: SavedViewScreen;
  /** Không có gì để lưu (URL đang ở trạng thái mặc định) thì không mời lưu —
   *  đúng thẻ design: "không có gì để lưu thì đừng mời". */
  hasActiveFilter: boolean;
  /** Tóm tắt bằng tiếng Việt dễ hiểu, VD "hạng VIP · chưa quay lại 30 ngày"
   *  — mỗi màn tự biết cách đọc tên nguồn/thẻ/bước của mình nên tự build. */
  describeCurrentFilter: () => string;
};

/** Chip bộ lọc lưu sẵn (24p) — ghim ngay dưới ô tìm, trên danh sách (thẻ
 *  design man-bo-loc-luu-san.html). Bấm chip = áp query của nó lên URL
 *  hiện tại (giữ tham số khác, chỉ đổi đúng khoá chip khai); bấm LẠI chính
 *  chip đang bật = bỏ các khoá đó, không có nút xoá lọc riêng. */
export function SavedViewChips({ screen, hasActiveFilter, describeCurrentFilter }: Props) {
  const t = useTranslations("savedViews");
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const [staleOpenId, setStaleOpenId] = useState<string | null>(null);

  const queryKey = ["saved-views", screen];
  const { data: views = [] } = useQuery({
    queryKey,
    queryFn: () => fetchSavedViews(supabase, screen),
  });

  const visible = views.slice(0, SAVED_VIEW_VISIBLE_CAP - (views.length > SAVED_VIEW_VISIBLE_CAP ? 1 : 0));
  const overflow = views.slice(visible.length);

  const applyView = (view: SavedView) => {
    const stale = isSavedViewStale(view);
    if (stale) {
      setStaleOpenId((cur) => (cur === view.id ? null : view.id));
      return;
    }
    setStaleOpenId(null);
    const active = isSavedViewActive(view, searchParams);
    const next = new URLSearchParams(searchParams);
    const chipParams = new URLSearchParams(view.query);
    if (active) {
      // Bấm lại chính chip đang bật = bỏ lọc (thẻ design) — chỉ xoá khoá chip
      // này khai, giữ nguyên tham số khác (tìm chữ, sắp xếp...).
      for (const key of chipParams.keys()) next.delete(key);
    } else {
      for (const [key, value] of chipParams) next.set(key, value);
    }
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const removeView = (id: string) =>
    startTransition(async () => {
      const res = await deleteSavedView(id);
      if (res.error) {
        toast.error(t("errors.deleteFailed"));
        return;
      }
      setStaleOpenId(null);
      queryClient.invalidateQueries({ queryKey });
    });

  const saveCurrent = () =>
    startTransition(async () => {
      const qs = searchParams.toString();
      const res = await createSavedView({ screen, name, query: qs });
      if (res.error === "duplicateName") {
        toast.error(t("errors.duplicateName"));
        return;
      }
      if (res.error) {
        toast.error(t("errors.saveFailed"));
        return;
      }
      toast.success(t("saved"));
      setSaveOpen(false);
      setName("");
      queryClient.invalidateQueries({ queryKey });
    });

  const staleView = views.find((v) => v.id === staleOpenId) ?? null;

  if (views.length === 0 && !hasActiveFilter) return null;

  return (
    <div className="space-y-2">
      {views.length > 0 && (
        <div className="relative">
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {visible.map((view) => {
              const stale = isSavedViewStale(view);
              const active = !stale && isSavedViewActive(view, searchParams);
              return (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => applyView(view)}
                  aria-pressed={active}
                  className={cn(
                    "h-7 shrink-0 rounded-full border px-2.5 text-xs whitespace-nowrap transition-colors",
                    stale
                      ? "border-dashed border-input text-muted-foreground"
                      : active
                        ? "border-primary bg-primary font-medium text-primary-foreground"
                        : "border-input bg-background text-foreground hover:bg-accent",
                  )}
                >
                  {view.name}
                </button>
              );
            })}
            {overflow.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="h-7 shrink-0 rounded-full border border-input bg-background px-2.5 text-xs text-muted-foreground hover:bg-accent"
                  >
                    …
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {overflow.map((view) => (
                    <DropdownMenuItem key={view.id} onSelect={() => applyView(view)}>
                      {view.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      )}

      {/* Chip hỏng theo QĐ-4 — KHÔNG chạy truy vấn, chỉ hiện cảnh báo + 2 lối ra. */}
      {staleView && (
        <div className="rounded-md border border-amber-600 bg-amber-50 p-2.5 text-xs dark:bg-amber-950/30">
          <p className="font-semibold text-amber-900 dark:text-amber-200">
            {t("stale.title")}
          </p>
          <p className="mt-1 leading-relaxed text-amber-800 dark:text-amber-300">
            {t("stale.description")}
          </p>
          <div className="mt-2 flex gap-1.5">
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => removeView(staleView.id)}
            >
              {t("stale.delete")}
            </Button>
          </div>
        </div>
      )}

      {/* "+ Lưu bộ lọc này" — chỉ mời khi đang lọc khác mặc định. */}
      {hasActiveFilter && (
        <div className="rounded-md border border-dashed border-primary bg-primary-tint p-2.5">
          <p className="text-xs font-medium text-primary">
            {t("currentFilter", { summary: describeCurrentFilter() })}
          </p>
          <Button
            size="sm"
            className="mt-2 h-7 w-full text-xs"
            onClick={() => setSaveOpen(true)}
          >
            <Plus className="size-3.5" />
            {t("saveButton")}
          </Button>
        </div>
      )}

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("saveDialog.title")}</DialogTitle>
          </DialogHeader>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("saveDialog.namePlaceholder")}
            maxLength={40}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              {t("saveDialog.cancel")}
            </Button>
            <Button disabled={!name.trim() || pending} onClick={saveCurrent}>
              {t("saveDialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
