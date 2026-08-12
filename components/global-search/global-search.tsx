"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Handshake, Inbox, Plus, Search, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  fetchGlobalSearch,
  type GlobalSearchEntityType,
  type GlobalSearchRow,
} from "./queries";

/**
 * Tìm kiếm toàn cục (mục 24l) — khách + hội thoại + cơ hội, gõ không dấu vẫn
 * ra, tối đa 5 dòng/loại (RPC `global_search` đã tự sắp + cắt). MỘT dialog
 * dùng chung cho mọi lối vào (nút desktop, icon mobile, ô trong "Hôm nay") —
 * mỗi nơi tự mount một bản, không chia state vì không cần mở đồng thời.
 */

const GROUP_ORDER: GlobalSearchEntityType[] = ["contact", "conversation", "deal"];

const GROUP_ICON: Record<GlobalSearchEntityType, typeof Users> = {
  contact: Users,
  conversation: Inbox,
  deal: Handshake,
};

function rowHref(row: GlobalSearchRow): string {
  switch (row.entity_type) {
    case "contact":
      return `/app/contacts/${row.entity_id}`;
    case "conversation":
      return `/app/inbox?c=${row.entity_id}`;
    case "deal":
      return `/app/deals/${row.entity_id}`;
  }
}

/** "Xem tất cả" — hội thoại chưa có bộ lọc ?q= trên URL nên dẫn thẳng vào hộp thư, không kèm query. */
function viewAllHref(type: GlobalSearchEntityType, query: string): string {
  switch (type) {
    case "contact":
      return `/app/contacts?q=${encodeURIComponent(query)}`;
    case "conversation":
      return "/app/inbox";
    case "deal":
      return `/app/deals?q=${encodeURIComponent(query)}`;
  }
}

function GlobalSearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("search");
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  // Dialog đóng thì xóa sạch — mở lại lần sau không còn thấy câu tìm cũ. Tính
  // trong lúc render (mẫu React "Adjusting state when a prop changes"), không
  // dùng effect để khỏi cascading render.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) {
      setQ("");
      setDebouncedQ("");
    }
  }

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(id);
  }, [q]);

  const trimmed = debouncedQ.trim();
  const resultsQuery = useQuery({
    queryKey: ["global-search", trimmed],
    queryFn: () => fetchGlobalSearch(supabase, trimmed),
    enabled: trimmed !== "",
  });
  const rows = resultsQuery.data ?? [];

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("placeholder")}
            className="pl-8"
          />
        </div>
        <div className="max-h-[55vh] space-y-4 overflow-y-auto">
          {trimmed === "" ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("hint")}
            </p>
          ) : resultsQuery.isPending ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("loading")}
            </p>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                {t("empty", { query: trimmed })}
              </p>
              <Button size="sm" onClick={() => go(`/app/contacts?new=${encodeURIComponent(trimmed)}`)}>
                <Plus className="size-4" />
                {t("emptyCta", { query: trimmed })}
              </Button>
            </div>
          ) : (
            GROUP_ORDER.map((type) => {
              const groupRows = rows.filter((r) => r.entity_type === type);
              if (groupRows.length === 0) return null;
              const Icon = GROUP_ICON[type];
              return (
                <div key={type} className="space-y-1">
                  <p className="flex items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground">
                    <Icon className="size-3.5" />
                    {t(`groups.${type}`)}
                  </p>
                  <ul className="space-y-0.5">
                    {groupRows.map((r) => (
                      <li key={r.entity_id}>
                        <button
                          type="button"
                          onClick={() => go(rowHref(r))}
                          className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60"
                        >
                          <span className="min-w-0 truncate font-medium">{r.title}</span>
                          {r.subtitle && (
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {r.subtitle}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {/* Cắt ở 5 dòng/loại (RPC đã LIMIT 5) — không biết chính xác còn
                      bao nhiêu nữa nên dẫn thẳng vào màn danh sách, không đoán số. */}
                  {groupRows.length === 5 && (
                    <Link
                      href={viewAllHref(type, trimmed)}
                      onClick={() => onOpenChange(false)}
                      className="block px-2 py-1 text-xs font-medium text-primary hover:underline"
                    >
                      {t("viewAll")}
                    </Link>
                  )}
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Nút mở tìm kiếm ở thanh trên cùng (mục 36.8-4) — desktop nút rộng có gợi ý
 *  phím tắt, mobile chỉ một icon nhỏ (không nhồi thêm ô vào thanh đã chật). */
export function GlobalSearchHeaderTrigger() {
  const t = useTranslations("search");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="hidden w-56 justify-start gap-2 text-muted-foreground sm:flex"
      >
        <Search className="size-4" />
        <span className="flex-1 truncate text-left">{t("placeholder")}</span>
        <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium">
          Ctrl K
        </kbd>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label={t("title")}
        className="sm:hidden"
      >
        <Search className="size-4" />
      </Button>
      <GlobalSearchDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

/** Ô tìm đầy đủ trong nội dung màn "Hôm nay" (mục 36.8-4) — chỉ hiện trên
 *  điện thoại, nơi thanh trên cùng không đủ chỗ cho một ô tìm thật sự. */
export function GlobalSearchInlineBox() {
  const t = useTranslations("search");
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-lg border bg-card px-3 py-2.5 text-left text-sm text-muted-foreground shadow-xs sm:hidden"
      >
        <Search className="size-4 shrink-0" />
        <span className="truncate">{t("placeholder")}</span>
      </button>
      <GlobalSearchDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
