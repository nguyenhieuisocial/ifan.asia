"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertTriangle,
  ChevronRight,
  Flame,
  MoreHorizontal,
  Plus,
  ThumbsDown,
  Trophy,
} from "lucide-react";
import { TileChart } from "@/components/illustrations/tile-chart";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatDate, formatMoney } from "@/lib/format";
import type { Locale } from "@/i18n/config";
import { createClient } from "@/lib/supabase/client";
import { ownerLabel, type MemberNames } from "../contacts/types";
import { loseDeal, moveDealStage, winDeal } from "./actions";
import { fetchStageDeals } from "./queries";
import { DealFormDialog, tomorrowVN, type DealFormValues } from "./deal-form-dialog";
import { LoseDealDialog, WinDealDialog } from "./close-deal-dialogs";
import {
  daysInStage,
  forecastValue,
  needsNextAction,
  STAGE_KIND_BADGE,
  sumValue,
  type BoardData,
  type DealRow,
  type MemberOption,
  type PipelineStage,
} from "./types";

/** Điểm lead từ mức này coi là khách "nóng" (spec CRM V1). */
const HOT_SCORE = 70;

type Props = {
  currentUserId: string;
  memberNames: MemberNames;
  members: MemberOption[];
  canAssignOthers: boolean;
  board: BoardData;
};

export function DealsBoard({
  currentUserId,
  memberNames,
  members,
  canAssignOthers,
  board,
}: Props) {
  const t = useTranslations("deals");
  const tCommon = useTranslations("common");
  const tContacts = useTranslations("contacts");
  const locale = useLocale() as Locale;
  const supabase = useMemo(() => createClient(), []);

  // Nguồn sự thật khi kéo-thả = state cục bộ (optimistic); server revalidate xong
  // props đổi thì đồng bộ lại NGAY TRONG RENDER (mẫu "adjusting state on prop
  // change" của React — không dùng effect để tránh render thừa).
  const [deals, setDeals] = useState<DealRow[]>(board.deals);
  const [syncedFrom, setSyncedFrom] = useState(board.deals);
  if (syncedFrom !== board.deals) {
    setSyncedFrom(board.deals);
    // Giữ lại các thẻ người dùng đã bấm "Tải thêm": server chỉ trả trang đầu,
    // vứt chúng đi thì cột tự co lại sau mỗi lần kéo-thả.
    setDeals((prev) => {
      const fresh = new Set(board.deals.map((d) => d.id));
      return [...board.deals, ...prev.filter((d) => !fresh.has(d.id))];
    });
  }

  const [loadingStage, setLoadingStage] = useState<string | null>(null);
  const [onlyNeedsAction, setOnlyNeedsAction] = useState(false);
  const [dragDealId, setDragDealId] = useState<string | null>(null);
  const [overStageId, setOverStageId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<DealRow | null>(null);
  const [winTarget, setWinTarget] = useState<{ deal: DealRow; stageId: string } | null>(null);
  const [loseTarget, setLoseTarget] = useState<{ deal: DealRow; stageId: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const openStages = useMemo(
    () => board.stages.filter((s) => s.kind === "open"),
    [board.stages],
  );
  const wonStage = board.stages.find((s) => s.kind === "won") ?? null;
  const lostStage = board.stages.find((s) => s.kind === "lost") ?? null;

  // MỌI con số của bảng lấy từ CSDL (RPC deal_board_stats) chứ không đếm trên
  // tập thẻ đã tải: bảng chỉ tải BOARD_DEAL_LIMIT thẻ nên đếm tại chỗ sẽ đứng
  // yên ở trần đó mà không có dấu hiệu gì. Chỉ khi RPC không trả được mới lùi về
  // đếm trên tập đã tải — thà số nhỏ hơn thật còn hơn trang trắng.
  const stats = board.stats;
  const visibleDeals = onlyNeedsAction ? deals.filter((d) => needsNextAction(d)) : deals;
  const needsActionCount =
    stats?.needs_action ?? deals.filter((d) => needsNextAction(d)).length;
  // Hiện CẢ HAI số: tổng thật của các thẻ đang mở VÀ con số dự báo. Chỉ đưa mỗi
  // dự báo thì chủ tiệm cộng nhẩm các cột rồi kết luận phần mềm cộng sai — dự báo
  // luôn NHỎ HƠN tổng vì đã nhân tỉ lệ thắng của từng bước.
  const openTotal = stats?.open_total ?? sumValue(deals.filter((d) => d.status === "open"));
  const forecast = stats?.forecast ?? forecastValue(deals, board.stages);

  /** Nạp trang thẻ kế tiếp của một cột. Con số của cột đã đúng sẵn, đây chỉ là
   *  bày thêm thẻ cho khớp con số đó. */
  const loadMoreStage = (stageId: string, offset: number) => {
    if (loadingStage) return;
    setLoadingStage(stageId);
    fetchStageDeals(supabase, board.pipeline.id, stageId, offset)
      .then((rows) =>
        setDeals((prev) => {
          const seen = new Set(prev.map((d) => d.id));
          return [...prev, ...rows.filter((d) => !seen.has(d.id))];
        }),
      )
      // Nạp hụt thì cột giữ nguyên VÀ nút "Tải thêm" vẫn còn đó để bấm lại — con
      // số của cột vẫn là số thật nên không có gì bị giấu.
      .catch(() => {})
      .finally(() => setLoadingStage(null));
  };

  const patchDeal = (dealId: string, patch: Partial<DealRow>) =>
    setDeals((rows) => rows.map((d) => (d.id === dealId ? { ...d, ...patch } : d)));

  /** Kéo sang cột MỞ: đổi ngay trên UI, server lỗi thì hoàn lại. */
  const runMove = (deal: DealRow, stage: PipelineStage) => {
    const snapshot = deals;
    patchDeal(deal.id, {
      stage_id: stage.id,
      status: "open",
      lost_reason_id: null,
      stage_entered_at: new Date().toISOString(),
    });
    startTransition(async () => {
      const res = await moveDealStage(deal.id, stage.id);
      if (res.error) {
        setDeals(snapshot);
        toast.error(res.error);
      }
    });
  };

  const runWin = (deal: DealRow, stageId: string, valueVnd: number) => {
    const snapshot = deals;
    setWinTarget(null);
    patchDeal(deal.id, {
      stage_id: stageId,
      status: "won",
      value_vnd: valueVnd,
      stage_entered_at: new Date().toISOString(),
    });
    startTransition(async () => {
      const res = await winDeal(deal.id, stageId, valueVnd);
      if (res.error) {
        setDeals(snapshot);
        toast.error(res.error);
        return;
      }
      toast.success(t("toasts.won"));
    });
  };

  const runLose = (deal: DealRow, stageId: string, reasonId: string, note: string) => {
    const snapshot = deals;
    setLoseTarget(null);
    patchDeal(deal.id, {
      stage_id: stageId,
      status: "lost",
      lost_reason_id: reasonId,
      stage_entered_at: new Date().toISOString(),
    });
    startTransition(async () => {
      const res = await loseDeal(deal.id, stageId, reasonId, note || undefined);
      if (res.error) {
        setDeals(snapshot);
        toast.error(res.error);
        return;
      }
      toast.success(t("toasts.lost"));
    });
  };

  /** Điểm vào chung cho cả kéo-thả lẫn menu "Chuyển sang" (mobile/bàn phím). */
  const moveTo = (deal: DealRow, stage: PipelineStage) => {
    if (deal.stage_id === stage.id && deal.status !== "open") return;
    if (stage.kind === "won") {
      setWinTarget({ deal, stageId: stage.id });
      return;
    }
    if (stage.kind === "lost") {
      setLoseTarget({ deal, stageId: stage.id });
      return;
    }
    if (deal.stage_id === stage.id) return;
    runMove(deal, stage);
  };

  /** id thẻ lấy từ dataTransfer (chuẩn HTML5) — state chỉ là dự phòng. */
  const handleDrop = (stage: PipelineStage, droppedId: string) => {
    setOverStageId(null);
    const deal = deals.find((d) => d.id === (droppedId || dragDealId));
    setDragDealId(null);
    if (deal) moveTo(deal, stage);
  };

  const emptyValues = (): DealFormValues => ({
    title: "",
    contactId: "",
    value: "",
    expectedCloseDate: "",
    stageId: openStages[0]?.id ?? "",
    ownerId: currentUserId,
    nextActionDate: tomorrowVN(),
    nextActionNote: "",
  });

  const editValues = (deal: DealRow): DealFormValues => ({
    title: deal.title,
    contactId: deal.contact_id,
    value: String(deal.value_vnd),
    expectedCloseDate: deal.expected_close_date ?? "",
    stageId:
      deal.status === "open" ? deal.stage_id : (openStages[0]?.id ?? deal.stage_id),
    ownerId: deal.owner_id,
    nextActionDate: deal.next_action_at
      ? deal.next_action_at.slice(0, 10)
      : tomorrowVN(),
    nextActionNote: deal.next_action_note ?? "",
  });

  // Hàm render (không phải component lồng) — thẻ giữ nguyên định danh giữa các
  // lần render nên thao tác kéo không bị hủy giữa chừng.
  const renderCard = (deal: DealRow) => {
    const warn = needsNextAction(deal);
    const contactName = deal.contacts?.full_name ?? tContacts("owner.unassigned");
    const owner = ownerLabel(deal.owner_id, currentUserId, tContacts, memberNames);
    const age = daysInStage(deal);

    return (
      <article
        key={deal.id}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", deal.id);
          e.dataTransfer.effectAllowed = "move";
          setDragDealId(deal.id);
        }}
        onDragEnd={() => {
          setDragDealId(null);
          setOverStageId(null);
        }}
        className={cn(
          "cursor-grab space-y-2 rounded-lg border bg-card p-2.5 transition-colors active:cursor-grabbing",
          dragDealId === deal.id && "opacity-50",
        )}
      >
        <div className="flex items-start gap-1.5">
          {/* draggable={false}: thẻ vẫn là thứ được kéo, link không cướp thao tác kéo */}
          <Link
            href={`/app/deals/${deal.id}`}
            prefetch={false}
            draggable={false}
            className="min-w-0 flex-1 text-[13px] leading-snug font-medium break-words hover:underline"
          >
            {deal.title}
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t("card.menuAria", { deal: deal.title })}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/app/deals/${deal.id}`}>{t("card.openDeal")}</Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setEditing(deal)}>
                {t("card.edit")}
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/app/contacts/${deal.contact_id}`}>
                  {t("card.openContact")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{t("card.moveTo")}</DropdownMenuLabel>
              {openStages
                .filter((s) => s.id !== deal.stage_id || deal.status !== "open")
                .map((s) => (
                  <DropdownMenuItem key={s.id} onSelect={() => moveTo(deal, s)}>
                    {s.name}
                  </DropdownMenuItem>
                ))}
              <DropdownMenuSeparator />
              {wonStage && (
                <DropdownMenuItem onSelect={() => moveTo(deal, wonStage)}>
                  <Trophy className="size-4" />
                  {t("card.markWon")}
                </DropdownMenuItem>
              )}
              {lostStage && (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => moveTo(deal, lostStage)}
                >
                  <ThumbsDown className="size-4" />
                  {t("card.markLost")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link
            href={`/app/contacts/${deal.contact_id}`}
            prefetch={false}
            className="min-w-0 truncate hover:text-foreground hover:underline"
          >
            {contactName}
          </Link>
          {(deal.contacts?.lead_score ?? 0) >= HOT_SCORE && (
            <Badge
              className="shrink-0 gap-0.5 bg-destructive/10 px-1.5 text-destructive"
              title={t("card.hotTooltip")}
            >
              <Flame className="size-3" />
              {deal.contacts?.lead_score}
            </Badge>
          )}
        </p>

        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold">
            {formatMoney(deal.value_vnd, locale)}
          </span>
          <Avatar className="size-5" title={owner}>
            <AvatarFallback className="text-[10px]">
              {(owner[0] ?? "?").toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {warn ? (
            <Badge className="gap-1 bg-destructive/10 text-destructive">
              <AlertTriangle className="size-3" />
              {deal.next_action_at ? t("card.overdue") : t("card.noNextAction")}
            </Badge>
          ) : deal.next_action_at ? (
            <span className="text-xs text-muted-foreground">
              {t("card.nextAction", { date: formatDate(deal.next_action_at, locale) })}
            </span>
          ) : null}
          {deal.status === "open" && age > 0 && (
            <span className="text-xs text-muted-foreground">
              {t("card.age", { days: age })}
            </span>
          )}
        </div>
      </article>
    );
  };

  const hasDeals = deals.length > 0;

  // Ở 1440px bảng còn ~550px nằm ngoài khung mà không có dấu hiệu nào: hai cột
  // cuối (Quay lại, Thua) coi như không tồn tại với người mới. Bám mép nào còn
  // cuộn được thì phủ một dải mờ + mũi tên ở đúng mép đó.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const syncEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const left = el.scrollLeft > 4;
    const right = el.scrollLeft < max - 4;
    setEdges((cur) => (cur.left === left && cur.right === right ? cur : { left, right }));
  }, []);

  // Bước cuộn đo từ khoảng cách giữa hai cột thật, không ghim 280px: đổi bề
  // ngang cột hay khoảng cách trong bản thiết kế thì nút vẫn nhảy đúng một cột.
  const scrollOneStage = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const cols = el.firstElementChild?.children;
    const first = cols?.[0] as HTMLElement | undefined;
    const second = cols?.[1] as HTMLElement | undefined;
    const step =
      first && second
        ? second.offsetLeft - first.offsetLeft
        : (first?.offsetWidth ?? el.clientWidth);
    el.scrollBy({ left: step, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    syncEdges();
    // Đổi bề ngang cửa sổ, mở/đóng thanh bên, hay đổi số cột đều phải tính lại
    const ro = new ResizeObserver(syncEdges);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    return () => ro.disconnect();
  }, [syncEdges, hasDeals, onlyNeedsAction, board.stages.length, deals.length]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b p-3">
        <h1 className="mr-1 text-sm font-semibold">{t("title")}</h1>
        <p className="text-xs text-muted-foreground">
          {t("openTotal", { value: formatMoney(openTotal, locale) })}
          {" · "}
          {t("forecast", { value: formatMoney(Math.round(forecast), locale) })}
        </p>
        {/* Nhóm 2 nút để ở mobile chúng xuống dòng CÙNG NHAU, không tách rời */}
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant={onlyNeedsAction ? "default" : "outline"}
            size="sm"
            aria-pressed={onlyNeedsAction}
            onClick={() => setOnlyNeedsAction((v) => !v)}
          >
            <AlertTriangle className="size-4" />
            <span className="hidden sm:inline">{t("filterNeedsAction")}</span>
            <Badge variant="secondary">{needsActionCount}</Badge>
          </Button>
          <Button
            size="sm"
            onClick={() => setCreateOpen(true)}
            disabled={openStages.length === 0}
          >
            <Plus className="size-4" />
            {t("addNew")}
          </Button>
        </div>
      </div>

      {!hasDeals && !onlyNeedsAction ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-12 text-center">
          <TileChart className="size-16" />
          <h2 className="text-base font-semibold">{t("empty.title")}</h2>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            {t("empty.description")}
          </p>
          <Button onClick={() => setCreateOpen(true)} disabled={openStages.length === 0}>
            <Plus className="size-4" />
            {t("empty.cta")}
          </Button>
        </div>
      ) : (
        <div className="relative min-h-0 flex-1">
          <div
            ref={scrollRef}
            onScroll={syncEdges}
            className="h-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden"
          >
          <div className="flex h-full gap-3 p-3">
            {board.stages.map((stage) => {
              const stageDeals = visibleDeals.filter((d) => d.stage_id === stage.id);
              const allStageDeals = deals.filter((d) => d.stage_id === stage.id);
              // Con số của cột = CSDL đếm; số thẻ đang bày có thể ít hơn vì bảng
              // có trần tải. Chênh nhau ⇒ bày nút "Tải thêm", không im lặng.
              const stageStat = stats?.stages[stage.id];
              const stageCount = stageStat?.n ?? allStageDeals.length;
              const stageTotal = stageStat?.total ?? sumValue(allStageDeals);
              const hasMore = allStageDeals.length < stageCount;
              return (
                <section
                  key={stage.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (overStageId !== stage.id) setOverStageId(stage.id);
                  }}
                  onDragLeave={() =>
                    setOverStageId((cur) => (cur === stage.id ? null : cur))
                  }
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDrop(stage, e.dataTransfer.getData("text/plain"));
                  }}
                  className={cn(
                    "flex w-[280px] shrink-0 snap-start flex-col rounded-lg border bg-muted/30 transition-colors",
                    overStageId === stage.id && "border-primary bg-primary-tint",
                  )}
                >
                  <header className="shrink-0 space-y-1 border-b px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                        {stage.name}
                      </span>
                      <Badge className={cn("font-semibold", STAGE_KIND_BADGE[stage.kind])}>
                        {stageCount}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatMoney(stageTotal, locale)}
                    </p>
                    {/* Cột Thắng/Thua cộng dồn TỪ TRƯỚC TỚI NAY, không theo bộ lọc
                        thời gian của Tổng quan — phải tự khai, nếu không chủ tiệm
                        so "Doanh thu 7 ngày" với cột này rồi tưởng phần mềm sai. */}
                    {stage.kind !== "open" && (
                      <p className="text-[11px] text-muted-foreground/80">
                        {t("column.allTime")}
                      </p>
                    )}
                  </header>
                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                    {stageDeals.length === 0 ? (
                      <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                        {onlyNeedsAction ? t("column.emptyFiltered") : t("column.empty")}
                      </p>
                    ) : (
                      stageDeals.map((deal) => renderCard(deal))
                    )}
                    {hasMore && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        disabled={loadingStage !== null}
                        onClick={() => loadMoreStage(stage.id, allStageDeals.length)}
                      >
                        {loadingStage === stage.id
                          ? tCommon("loading")
                          : tCommon("loadMore")}
                      </Button>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
          </div>
          {/* Dải mờ báo còn cột bên phải. Ở 375px cột kế chỉ hở ~70px nên dải
              phải hẹp lại, không thì nó phủ trắng đúng phần hé ra đó. */}
          {edges.right && (
            <>
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-linear-to-l from-background via-background/85 to-transparent sm:w-20"
              />
              {/* Trông như nút thì phải bấm được: cuộn sang đúng cột kế tiếp */}
              <button
                type="button"
                aria-label={t("scrollNextAria")}
                onClick={scrollOneStage}
                className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border bg-background shadow-md"
              >
                <ChevronRight className="size-5 text-foreground" />
              </button>
            </>
          )}
          {edges.left && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-linear-to-r from-background to-transparent"
            />
          )}
        </div>
      )}

      {createOpen && (
        <DealFormDialog
          mode="create"
          open={createOpen}
          onOpenChange={setCreateOpen}
          initialValues={emptyValues()}
          openStages={openStages}
          members={members}
          canAssignOthers={canAssignOthers}
        />
      )}
      {editing && (
        <DealFormDialog
          mode="edit"
          open
          onOpenChange={(o) => !o && setEditing(null)}
          dealId={editing.id}
          initialValues={editValues(editing)}
          openStages={openStages}
          members={members}
          canAssignOthers={canAssignOthers}
          stageLocked={editing.status !== "open"}
        />
      )}
      {winTarget && (
        <WinDealDialog
          open
          dealTitle={winTarget.deal.title}
          initialValue={winTarget.deal.value_vnd}
          pending={pending}
          onCancel={() => setWinTarget(null)}
          onConfirm={(value) => runWin(winTarget.deal, winTarget.stageId, value)}
        />
      )}
      {loseTarget && (
        <LoseDealDialog
          open
          dealTitle={loseTarget.deal.title}
          lostReasons={board.lostReasons}
          pending={pending}
          onCancel={() => setLoseTarget(null)}
          onConfirm={(reasonId, note) =>
            runLose(loseTarget.deal, loseTarget.stageId, reasonId, note)
          }
        />
      )}
    </div>
  );
}
