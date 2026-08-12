"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { MoreHorizontal, Plus, Tag as TagIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  createTag,
  deleteTag,
  mergeTagsAction,
  recolorTag,
  renameTag,
  undoMergeTagsAction,
} from "./actions";
import type { TagRow } from "./queries";

/** Bảng màu lấy đúng từ thẻ design man-quan-ly-nhan.html (4 màu mẫu trên thẻ) + 4 màu quen thuộc để đủ chọn. */
const PALETTE = [
  "#C94C18",
  "#0ea5e9",
  "#16a34a",
  "#d97706",
  "#dc2626",
  "#9333ea",
  "#db2777",
  "#64748b",
];

function ColorDot({ color }: { color: string | null }) {
  return (
    <span
      aria-hidden
      className="size-2.5 shrink-0 rounded-full"
      style={{ background: color ?? "#a8a29e" }}
    />
  );
}

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={c}
          aria-pressed={value === c}
          className={cn(
            "size-7 rounded-full border-2 transition-transform",
            value === c ? "scale-110 border-foreground" : "border-transparent",
          )}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

function CreateTagDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("settings.tags");
  const tCommon = useTranslations("common");
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (!name.trim() || pending) return;
    startTransition(async () => {
      const res = await createTag(name.trim(), color);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setName("");
      setColor(PALETTE[0]);
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("create.title")}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <Label htmlFor="tag-name">{t("create.nameLabel")}</Label>
            <Input
              id="tag-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("create.colorLabel")}</Label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={!name.trim() || pending}>
              {tCommon("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Thân form mang key={tag.id} — tự unmount/remount khi đổi nhãn nên state
 *  luôn khởi tạo đúng từ props, không cần effect đồng bộ lại (mẫu ContactForm). */
function RenameTagForm({
  tag,
  onDone,
}: {
  tag: TagRow;
  onDone: () => void;
}) {
  const tCommon = useTranslations("common");
  const [name, setName] = useState(tag.name);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (!name.trim() || pending) return;
    startTransition(async () => {
      const res = await renameTag(tag.id, name.trim());
      if (res.error) {
        toast.error(res.error);
        return;
      }
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
      <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {tCommon("cancel")}
        </Button>
        <Button type="submit" disabled={!name.trim() || pending}>
          {tCommon("save")}
        </Button>
      </DialogFooter>
    </form>
  );
}

function RenameTagDialog({
  tag,
  onOpenChange,
}: {
  tag: TagRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("settings.tags");
  return (
    <Dialog open={tag !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("menu.rename")}</DialogTitle>
        </DialogHeader>
        {tag && <RenameTagForm key={tag.id} tag={tag} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function RecolorTagForm({
  tag,
  onDone,
}: {
  tag: TagRow;
  onDone: () => void;
}) {
  const tCommon = useTranslations("common");
  const [color, setColor] = useState(tag.color ?? PALETTE[0]);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (pending) return;
    startTransition(async () => {
      const res = await recolorTag(tag.id, color);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      onDone();
    });
  };

  return (
    <>
      <ColorPicker value={color} onChange={setColor} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {tCommon("cancel")}
        </Button>
        <Button type="button" onClick={submit} disabled={pending}>
          {tCommon("save")}
        </Button>
      </DialogFooter>
    </>
  );
}

function RecolorTagDialog({
  tag,
  onOpenChange,
}: {
  tag: TagRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("settings.tags");
  return (
    <Dialog open={tag !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("menu.recolor")}</DialogTitle>
        </DialogHeader>
        {tag && <RecolorTagForm key={tag.id} tag={tag} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function DeleteTagDialog({
  tag,
  onOpenChange,
}: {
  tag: TagRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("settings.tags");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (!tag || pending) return;
    startTransition(async () => {
      const res = await deleteTag(tag.id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={tag !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {tag && tag.count > 0
              ? t("delete.title", { count: tag.count })
              : t("delete.titleEmpty")}
          </DialogTitle>
        </DialogHeader>
        {tag && tag.count > 0 && (
          <div className="rounded-lg border border-amber-600/40 bg-amber-50 p-3 text-[13px] leading-relaxed text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            {t("delete.body", { count: tag.count })}
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" variant="destructive" onClick={submit} disabled={pending}>
            {t("menu.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MergeTagForm({
  tag,
  targets,
  onDone,
}: {
  tag: TagRow;
  targets: TagRow[];
  onDone: () => void;
}) {
  const t = useTranslations("settings.tags");
  const tCommon = useTranslations("common");
  const supabase = useMemo(() => createClient(), []);
  const [targetId, setTargetId] = useState("");
  // Đếm khớp theo `key` — tránh hiện số CŨ của nhãn đích trước trong lúc đang
  // tải số của nhãn đích mới (đổi lựa chọn trong Select, không remount form).
  const [fetched, setFetched] = useState<{ key: string; count: number } | null>(null);
  const [pending, startTransition] = useTransition();

  const target = targets.find((x) => x.id === targetId) ?? null;
  const previewKey = target ? `${tag.id}:${target.id}` : null;
  const previewCount = fetched && fetched.key === previewKey ? fetched.count : null;

  // Số thật sau khi gộp = số khách KHÁC NHAU đang mang một trong hai nhãn —
  // không phải cộng thẳng hai số đếm (khách có cả hai nhãn không được đếm 2 lần).
  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    const key = `${tag.id}:${target.id}`;
    supabase
      .from("contact_tags")
      .select("contact_id")
      .in("tag_id", [tag.id, target.id])
      .then(({ data }) => {
        if (cancelled) return;
        setFetched({ key, count: new Set((data ?? []).map((r) => r.contact_id as string)).size });
      });
    return () => {
      cancelled = true;
    };
  }, [tag.id, target, supabase]);

  const submit = () => {
    if (!target || pending) return;
    startTransition(async () => {
      const res = await mergeTagsAction(tag.id, target.id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      onDone();
      const auditId = res.auditId;
      toast.success(t("merge.toast", { source: tag.name, target: target.name }), {
        duration: 10000,
        // "Nếu không làm được hoàn tác thì đừng vẽ nút này" (thẻ design) —
        // chỉ gắn action khi RPC thật sự trả về khoá hoàn tác.
        action: auditId
          ? {
              label: t("merge.undo"),
              onClick: () => {
                undoMergeTagsAction(auditId).then((undoRes) => {
                  if (undoRes.error) toast.error(undoRes.error);
                  else toast.success(t("merge.undone"));
                });
              },
            }
          : undefined,
      });
    });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>{t("merge.sourceLabel")}</Label>
        <div className="flex h-9 items-center gap-2 rounded-md border px-3 text-sm">
          <ColorDot color={tag.color} />
          <span className="min-w-0 flex-1 truncate">{tag.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {t("count", { count: tag.count })}
          </span>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="merge-target">{t("merge.targetLabel")}</Label>
        <Select id="merge-target" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
          <option value="">{t("merge.targetPlaceholder")}</option>
          {targets.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name} · {t("count", { count: x.count })}
            </option>
          ))}
        </Select>
      </div>
      {target && (
        <div className="rounded-lg border bg-muted/40 p-3 text-[13px] leading-relaxed">
          {previewCount === null
            ? t("merge.calculating")
            : t.rich("merge.preview", {
                count: previewCount,
                target: target.name,
                source: tag.name,
                b: (chunks) => <b>{chunks}</b>,
              })}
        </div>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {tCommon("cancel")}
        </Button>
        <Button type="button" onClick={submit} disabled={!target || pending}>
          {t("merge.confirm")}
        </Button>
      </DialogFooter>
    </div>
  );
}

function MergeTagDialog({
  tag,
  allTags,
  onOpenChange,
}: {
  tag: TagRow | null;
  allTags: TagRow[];
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("settings.tags");
  const targets = tag ? allTags.filter((x) => x.id !== tag.id) : [];
  return (
    <Dialog open={tag !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("merge.title")}</DialogTitle>
        </DialogHeader>
        {tag && (
          <MergeTagForm key={tag.id} tag={tag} targets={targets} onDone={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

type Props = { canManage: boolean; tags: TagRow[] };

/**
 * Cài đặt → Quản lý nhãn (V1b bước 5-6, mục 36.8-3). Thẻ design:
 * design-system/man-quan-ly-nhan.html — mỗi nhãn hiện SỐ KHÁCH đang mang,
 * gộp phải nói rõ chiều nào ăn chiều nào bằng số thật, cấm chữ "xoá" cho
 * nhãn nguồn trong lúc gộp (dùng "biến mất"), hoàn tác phải chạy THẬT.
 */
export function TagsView({ canManage, tags }: Props) {
  const t = useTranslations("settings.tags");
  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<TagRow | null>(null);
  const [colorTarget, setColorTarget] = useState<TagRow | null>(null);
  const [mergeTarget, setMergeTarget] = useState<TagRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TagRow | null>(null);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl space-y-4 p-6">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold">{t("title")}</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">{t("description")}</p>
          </div>
          {canManage && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              {t("newTag")}
            </Button>
          )}
        </div>

        {tags.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <TagIcon className="mx-auto size-5 text-muted-foreground" />
            <p className="mt-2 text-[13px] text-muted-foreground">{t("empty")}</p>
          </div>
        ) : (
          <div className="rounded-lg border">
            {tags.map((tag, i) => (
              <div
                key={tag.id}
                className={cn(
                  "flex items-center gap-2.5 px-4 py-3 text-sm",
                  i !== tags.length - 1 && "border-b",
                  tag.count === 0 && "text-muted-foreground",
                )}
              >
                <ColorDot color={tag.color} />
                <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {t("count", { count: tag.count })}
                </span>
                {canManage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0"
                        aria-label={t("menu.label", { name: tag.name })}
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setRenameTarget(tag)}>
                        {t("menu.rename")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setColorTarget(tag)}>
                        {t("menu.recolor")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={tags.length < 2}
                        onSelect={() => setMergeTarget(tag)}
                      >
                        {t("menu.merge")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => setDeleteTarget(tag)}>
                        {t("menu.delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <CreateTagDialog open={createOpen} onOpenChange={setCreateOpen} />
      <RenameTagDialog tag={renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)} />
      <RecolorTagDialog tag={colorTarget} onOpenChange={(o) => !o && setColorTarget(null)} />
      <MergeTagDialog
        tag={mergeTarget}
        allTags={tags}
        onOpenChange={(o) => !o && setMergeTarget(null)}
      />
      <DeleteTagDialog tag={deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)} />
    </div>
  );
}
